# {
#   "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6"
# }

from genlayer import *
from dataclasses import dataclass
import json
import hashlib

MAX_HASH_LENGTH = 64
MAX_DECIMAL_LENGTH = 20
MAX_PAIR_LENGTH = 32
MAX_REASON_LENGTH = 150

FOUR_HOURS = 14400
MAX_ORDER_SIZE = 1
MAX_TOTAL_SPEND = 10

@allow_storage
@dataclass
class TradeRecord:
    candle_timestamp: str
    market_data_hash: str
    asset_pair: str
    ai_pattern: str
    action: str
    reason: str
    caller: Address

class AIMarketSentinel(gl.Contract):
    owner: Address
    supported_pairs: str
    timeframe_seconds: bigint
    max_order_size: bigint
    max_total_spend: bigint
    virtual_spent_total: bigint
    is_active: bool
    trade_count: bigint

    processed_candles: TreeMap[str, bool]
    processed_snapshots: TreeMap[str, bool]
    trade_history: TreeMap[str, TradeRecord]
    verified_snapshots: TreeMap[str, str]

    def __init__(self):
        self.owner = gl.message.sender_address
        
        self.supported_pairs = (
            "BTC/USDT,"
            "ETH/USDT,"
            "SOL/USDT,"
            "NEAR/USDT,"
            "VIRTUAL/USDT"
        )
        
        self.timeframe_seconds = FOUR_HOURS
        self.max_order_size = MAX_ORDER_SIZE
        self.max_total_spend = MAX_TOTAL_SPEND
        self.virtual_spent_total = 0
        self.is_active = True
        self.trade_count = 0

    def _is_supported_pair(self, pair: str) -> bool:
        if pair == "BTC/USDT":
            return True
        if pair == "ETH/USDT":
            return True
        if pair == "SOL/USDT":
            return True
        if pair == "NEAR/USDT":
            return True
        if pair == "VIRTUAL/USDT":
            return True
        return False

    def _resistance_for_pair(self, pair: str) -> bigint:
        if pair == "BTC/USDT":
            return 100000000000
        if pair == "ETH/USDT":
            return 5000000000
        if pair == "SOL/USDT":
            return 250000000
        if pair == "NEAR/USDT":
            return 5000000
        if pair == "VIRTUAL/USDT":
            return 2000000
        raise Exception("Unsupported trading pair")

    def _decimal_text(self, value: str) -> str:
        if not isinstance(value, str):
            raise Exception("Exchange decimal must be a string")

        if len(value) == 0 or len(value) > 64:
            raise Exception("Invalid decimal length")

        parts = value.split(".")

        if len(parts) > 2:
            raise Exception("Invalid decimal format")

        whole = parts[0]
        fractional = parts[1] if len(parts) == 2 else ""

        if not whole:
            raise Exception("Missing integer part")

        if len(parts) == 2 and not fractional:
            raise Exception("Missing fractional part")

        for character in whole + fractional:
            if character < "0" or character > "9":
                raise Exception("Invalid decimal character")

        fractional = fractional.rstrip("0")

        if len(fractional) > 18:
            raise Exception("Unsupported decimal precision")

        whole = whole.lstrip("0") or "0"

        if fractional:
            return whole + "." + fractional

        return whole

    def _decimal_units(self, value: str) -> int:
        text = self._decimal_text(value)
        parts = text.split(".")
        fractional = parts[1] if len(parts) == 2 else ""

        return (
            int(parts[0]) * 10**18
            + int(fractional.ljust(18, "0"))
        )

    def _normalize_candle(self, row, expected_open_ms: int) -> dict:
        if not isinstance(row, list) or len(row) != 12:
            raise Exception("Invalid exchange candle")

        if type(row[0]) is not int or type(row[6]) is not int:
            raise Exception("Invalid exchange timestamps")

        expected_close_ms = expected_open_ms + FOUR_HOURS * 1000 - 1

        if row[0] != expected_open_ms:
            raise Exception("Unexpected candle open time")

        if row[6] != expected_close_ms:
            raise Exception("Unexpected candle close time")

        candle = {
            "open_time_ms": row[0],
            "close_time_ms": row[6],
            "open": self._decimal_text(row[1]),
            "high": self._decimal_text(row[2]),
            "low": self._decimal_text(row[3]),
            "close": self._decimal_text(row[4]),
            "volume": self._decimal_text(row[5]),
        }

        open_price = self._decimal_units(candle["open"])
        high_price = self._decimal_units(candle["high"])
        low_price = self._decimal_units(candle["low"])
        close_price = self._decimal_units(candle["close"])
        volume = self._decimal_units(candle["volume"])

        if min(open_price, high_price, low_price, close_price) <= 0:
            raise Exception("Non-positive candle price")

        if not (
            low_price <= open_price <= high_price
            and low_price <= close_price <= high_price
        ):
            raise Exception("Invalid candle price bounds")

        if volume < 0:
            raise Exception("Negative volume")

        return candle

    @gl.public.write
    def evaluate_market(self, pair: str) -> str:
        import time

        caller = gl.message.sender_address

        if not self.is_active:
            raise Exception("Sentinel is halted")

        if not isinstance(pair, str) or not self._is_supported_pair(pair):
            raise Exception("Unsupported trading pair")

        transaction_time = int(time.time())
        settlement_delay_seconds = 120

        target_open_seconds = (
            (
                transaction_time - settlement_delay_seconds
            ) // FOUR_HOURS
        ) * FOUR_HOURS - FOUR_HOURS

        if target_open_seconds < FOUR_HOURS:
            raise Exception("Invalid transaction timestamp")

        target_open_ms = target_open_seconds * 1000
        previous_open_ms = target_open_ms - FOUR_HOURS * 1000
        target_close_ms = target_open_ms + FOUR_HOURS * 1000 - 1

        candle_key = pair + "|4h|" + str(target_open_ms)

        if candle_key in self.processed_candles:
            if self.processed_candles[candle_key]:
                raise Exception("Candle already processed")

        symbol = pair.replace("/", "")

        # Official Binance Public Data API - Bypasses Geo-Blocking
        source_url = (
            "https://data-api.binance.vision/api/v3/klines"
            + "?symbol=" + symbol
            + "&interval=4h"
            + "&timeZone=0"
            + "&startTime=" + str(previous_open_ms)
            + "&endTime=" + str(target_close_ms)
            + "&limit=2"
        )

        def fetch_verified_snapshot():
            response = gl.nondet.web.get(source_url)
            
            body_content = getattr(response, 'body', response)
            if isinstance(body_content, bytes):
                res_str = body_content.decode('utf-8', errors='ignore')
            else:
                res_str = str(body_content)

            try:
                rows = json.loads(res_str)
            except Exception:
                raise Exception("API Blocked (Geo-Restriction). Raw response: " + res_str[:150])

            if isinstance(rows, dict) and "msg" in rows:
                raise Exception("Exchange Error: " + rows["msg"])

            if not isinstance(rows, list) or len(rows) != 2:
                raise Exception("Expected two completed candles. Note: Binance Spot may not support this altcoin yet.")

            previous = self._normalize_candle(rows[0], previous_open_ms)
            current = self._normalize_candle(rows[1], target_open_ms)

            if current["close_time_ms"] >= transaction_time * 1000:
                raise Exception("Candle is not completed")

            snapshot = {
                "source": "BINANCE_VISION_KLINES",
                "pair": pair,
                "symbol": symbol,
                "timeframe": "4h",
                "time_zone": "UTC",
                "previous_candle": previous,
                "candle": current,
            }

            return json.dumps(
                snapshot,
                sort_keys=True,
                separators=(",", ":"),
            )

        canonical_snapshot = gl.eq_principle.strict_eq(
            fetch_verified_snapshot
        )

        if not isinstance(canonical_snapshot, str):
            raise Exception("Invalid verified snapshot")

        snapshot = json.loads(canonical_snapshot)
        current = snapshot["candle"]
        previous = snapshot["previous_candle"]

        snapshot_hash = hashlib.sha256(
            canonical_snapshot.encode("utf-8")
        ).hexdigest()

        if snapshot_hash in self.processed_snapshots:
            if self.processed_snapshots[snapshot_hash]:
                raise Exception("Snapshot already processed")

        resistance_units = (
            int(self._resistance_for_pair(pair)) * 10**12
        )

        prompt = (
            "You classify completed market candles.\n"
            "Use ONLY the verified exchange snapshot below.\n"
            "Do not predict prices or provide investment advice.\n"
            "These labels describe candle behavior, not future outcomes.\n\n"
            "Return exactly one JSON field: pattern.\n"
            "Allowed values:\n"
            "- BULLISH_BREAKOUT: previous close was at or below "
            "resistance, current close is above resistance, "
            "and current close is above current open.\n"
            "- FAKE_OUT: current high exceeded resistance "
            "but current close is at or below resistance.\n"
            "- CONSOLIDATION: neither condition above applies.\n"
            "Do not infer above-average volume: no volume baseline "
            "is supplied.\n\n"
            "Resistance integer units, scale 10^18: "
            + str(resistance_units)
            + "\nVerified snapshot:\n"
            + canonical_snapshot
            + '\nReturn JSON: {"pattern": "CONSOLIDATION"}'
        )

        allowed_patterns = (
            "BULLISH_BREAKOUT",
            "FAKE_OUT",
            "CONSOLIDATION",
        )

        def classify():
            result = gl.nondet.exec_prompt(
                prompt,
                response_format="json",
            )

            if not isinstance(result, dict):
                raise Exception("Invalid AI classification")

            if result.get("pattern") not in allowed_patterns:
                raise Exception("Invalid AI pattern")

            return {"pattern": result["pattern"]}

        def validate_classification(leader_result):
            if not isinstance(leader_result, gl.vm.Return):
                return False

            leader_data = leader_result.calldata

            if not isinstance(leader_data, dict):
                return False

            if leader_data.get("pattern") not in allowed_patterns:
                return False

            validator_data = classify()

            return (
                validator_data["pattern"]
                == leader_data["pattern"]
            )

        ai_result = gl.vm.run_nondet_unsafe(
            classify,
            validate_classification,
        )

        if not isinstance(ai_result, dict):
            raise Exception("Invalid consensus classification")

        pattern = ai_result.get("pattern")

        if pattern not in allowed_patterns:
            raise Exception("Invalid consensus pattern")

        previous_close = self._decimal_units(previous["close"])
        open_price = self._decimal_units(current["open"])
        high_price = self._decimal_units(current["high"])
        close_price = self._decimal_units(current["close"])

        if (
            previous_close <= resistance_units
            and close_price > resistance_units
            and close_price > open_price
        ):
            expected_pattern = "BULLISH_BREAKOUT"
        elif (
            high_price > resistance_units
            and close_price <= resistance_units
        ):
            expected_pattern = "FAKE_OUT"
        else:
            expected_pattern = "CONSOLIDATION"

        if pattern != expected_pattern:
            raise Exception("AI classification violates candle rubric")

        action = "HELD"

        if pattern == "BULLISH_BREAKOUT":
            if (
                self.virtual_spent_total + self.max_order_size
                <= self.max_total_spend
            ):
                self.virtual_spent_total += self.max_order_size
                action = "SIGNAL_EMITTED"
            else:
                action = "SIGNAL_SUPPRESSED_BUDGET"

        reason = (
            "Verified completed Binance Vision 4h candle classified as "
            + pattern
            + "."
        )

        self.processed_snapshots[snapshot_hash] = True
        self.processed_candles[candle_key] = True
        self.verified_snapshots[candle_key] = canonical_snapshot

        self.trade_history[candle_key] = TradeRecord(
            candle_timestamp=str(target_open_seconds),
            market_data_hash=snapshot_hash,
            asset_pair=pair,
            ai_pattern=pattern,
            action=action,
            reason=reason,
            caller=caller,
        )

        self.trade_count += 1

        result = {
            "version": "7.2",
            "pair": pair,
            "pattern": pattern,
            "action": action,
            "caller": str(caller),
            "candle_key": candle_key,
            "candle_open_time_ms": target_open_ms,
            "candle_close_time_ms": target_close_ms,
            "market_data_hash": snapshot_hash,
            "source": "BINANCE_VISION_KLINES",
            "reason": reason,
        }

        return json.dumps(
            result,
            sort_keys=True,
            separators=(",", ":"),
        )

    @gl.public.view
    def get_verified_snapshot(
        self,
        pair: str,
        candle_open_time_ms: str,
    ) -> str:
        key = pair + "|4h|" + candle_open_time_ms

        if key not in self.verified_snapshots:
            raise Exception("Verified snapshot not found")

        return self.verified_snapshots[key]

    @gl.public.write
    def halt(self):
        if gl.message.sender_address != self.owner:
            raise Exception("Only owner")
        self.is_active = False

    @gl.public.write
    def resume(self):
        if gl.message.sender_address != self.owner:
            raise Exception("Only owner")
        self.is_active = True

    @gl.public.view
    def get_supported_pairs(self) -> str:
        return self.supported_pairs

    @gl.public.view
    def is_pair_supported(self, pair: str) -> bool:
        return self._is_supported_pair(pair)

    @gl.public.view
    def get_configuration(self) -> str:
        return json.dumps({
            "version": "7.2",
            "timeframe": "4h",
            "supported_pairs": self.supported_pairs,
            "max_order_size": str(self.max_order_size),
            "max_total_spend": str(self.max_total_spend),
            "active": self.is_active
        })

    @gl.public.view
    def get_sentinel_state(self) -> str:
        remaining = self.max_total_spend - self.virtual_spent_total
        return json.dumps({
            "version": "7.2",
            "active": self.is_active,
            "supported_pairs": self.supported_pairs,
            "timeframe": "4h",
            "virtual_spent_total": str(self.virtual_spent_total),
            "remaining_budget": str(remaining),
            "total_evaluations": str(self.trade_count)
        })
