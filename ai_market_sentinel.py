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
    max_candle_age_seconds: bigint
    virtual_spent_total: bigint
    is_active: bool
    trade_count: bigint

    processed_candles: TreeMap[str, bool]
    processed_snapshots: TreeMap[str, bool]
    trade_history: TreeMap[str, TradeRecord]

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
        self.max_candle_age_seconds = 60  # Tightened to 60 seconds for strict freshness check
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

    def _parse_scaled_decimal(self, value: str) -> bigint:
        if len(value) == 0:
            raise Exception("Empty numeric value")
            
        if len(value) > MAX_DECIMAL_LENGTH:
            raise Exception("Numeric value too long")

        negative = False
        text = value
        
        if text.startswith("-"):
            negative = True
            text = text[1:]

        parts = text.split(".")
        
        if len(parts) > 2:
            raise Exception("Invalid decimal format")

        whole = parts[0]
        if len(whole) == 0:
            whole = "0"
            
        fractional = ""
        if len(parts) == 2:
            fractional = parts[1]

        if len(fractional) > 6:
            fractional = fractional[:6]
            
        while len(fractional) < 6:
            fractional += "0"

        whole_value = 0
        for character in whole:
            if character < "0" or character > "9":
                raise Exception("Invalid numeric value")
            whole_value = whole_value * 10 + int(character)

        fractional_value = 0
        for character in fractional:
            if character < "0" or character > "9":
                raise Exception("Invalid numeric value")
            fractional_value = fractional_value * 10 + int(character)

        result = whole_value * 1000000 + fractional_value
        
        if negative:
            result = -result
            
        return result

    def _valid_hash(self, value: str) -> bool:
        if len(value) != MAX_HASH_LENGTH:
            return False
            
        for character in value:
            if not ((character >= "0" and character <= "9") or (character >= "a" and character <= "f")):
                return False
                
        return True

    @gl.public.write
    def evaluate_market(self, market_data_json: str, expected_sha256: str) -> str:
        caller = gl.message.sender_address

        if not self.is_active:
            raise Exception("Sentinel is halted")
            
        if self.virtual_spent_total >= self.max_total_spend:
            raise Exception("Virtual evaluation budget reached")
            
        if len(market_data_json) == 0:
            raise Exception("Market data payload required")
            
        if not self._valid_hash(expected_sha256):
            raise Exception("Invalid SHA-256 hash")

        try:
            market_data = json.loads(market_data_json)
        except Exception:
            raise Exception("Invalid JSON format")

        if not isinstance(market_data, dict):
            raise Exception("Snapshot must be JSON object")

        required_fields = [
            "pair", 
            "timeframe", 
            "candle_timestamp", 
            "previous_close", 
            "open", 
            "high", 
            "low", 
            "close", 
            "volume"
        ]
        
        for field in required_fields:
            if field not in market_data:
                raise Exception("Missing field: " + field)

        pair = market_data["pair"]
        if not isinstance(pair, str):
            raise Exception("Invalid pair")
            
        if not self._is_supported_pair(pair):
            raise Exception("Unsupported trading pair")
            
        if market_data["timeframe"] != "4h":
            raise Exception("Only 4h supported")

        canonical = json.dumps(market_data, sort_keys=True, separators=(",", ":"))
        calculated_hash = hashlib.sha256(canonical.encode()).hexdigest()
        
        if calculated_hash != expected_sha256:
            raise Exception("Snapshot hash mismatch")

        if expected_sha256 in self.processed_snapshots:
            if self.processed_snapshots[expected_sha256]:
                raise Exception("Snapshot already processed")

        candle_timestamp = str(market_data["candle_timestamp"])
        
        if candle_timestamp in self.processed_candles:
            if self.processed_candles[candle_timestamp]:
                raise Exception("Candle already processed")

        previous_close = self._parse_scaled_decimal(market_data["previous_close"])
        open_price = self._parse_scaled_decimal(market_data["open"])
        high_price = self._parse_scaled_decimal(market_data["high"])
        low_price = self._parse_scaled_decimal(market_data["low"])
        close_price = self._parse_scaled_decimal(market_data["close"])
        volume = self._parse_scaled_decimal(market_data["volume"])

        if high_price < low_price:
            raise Exception("Invalid high/low")
        if open_price < low_price:
            raise Exception("Open below low")
        if open_price > high_price:
            raise Exception("Open above high")
        if close_price < low_price:
            raise Exception("Close below low")
        if close_price > high_price:
            raise Exception("Close above high")
        if volume < 0:
            raise Exception("Negative volume")

        resistance = self._resistance_for_pair(pair)
        
        if close_price <= resistance:
            raise Exception("Resistance condition not satisfied")

        prompt = f"""
You are a market-data classification engine.
Analyze ONLY the supplied completed 4-hour OHLCV candle.

Pair: {pair}
Previous close: {market_data["previous_close"]}
Open: {market_data["open"]}
High: {market_data["high"]}
Low: {market_data["low"]}
Close: {market_data["close"]}
Volume: {market_data["volume"]}

Classify into exactly ONE:
BULLISH_BREAKOUT
FAKE_OUT
CONSOLIDATION

Do not predict future prices.
Do not provide investment advice.

Return JSON:
{{
    "pattern": "BULLISH_BREAKOUT",
    "reason": "short factual explanation"
}}
"""
        max_age = int(self.max_candle_age_seconds)

        def leader_fn():
            import urllib.request
            import time
            import json

            # 1. Freshness check
            current_time = int(time.time())
            candle_ts = int(market_data["candle_timestamp"])
            age = current_time - candle_ts
            
            if age > max_age:
                return {"error": f"Stale Data: Candle timestamp is {age} seconds old. Maximum allowed is {max_age}."}

            # 2. Source authentication via authoritative exchange API
            symbol = pair.replace("/", "")
            url = f"https://api.binance.com/api/v3/ticker/price?symbol={symbol}"
            
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=10) as response:
                    data = json.loads(response.read().decode())
                    actual_price = float(data['price'])
            except Exception as e:
                return {"error": "Failed to fetch authoritative market data."}

            # 3. Data Fabrication validation (0.5% max allowed deviation)
            proposed_price = float(market_data["close"])
            deviation = abs(proposed_price - actual_price) / actual_price
            
            if deviation > 0.005: 
                return {"error": f"Data Fabrication Detected: Proposed price {proposed_price} deviates from authoritative price {actual_price} by {deviation * 100}%."}

            return gl.nondet.exec_prompt(prompt, response_format="json")

        def validator_fn(leader_result):
            import urllib.request
            import time
            import json
            
            if not isinstance(leader_result, gl.vm.Return):
                return False
                
            leader_data = leader_result.calldata
            
            if not isinstance(leader_data, dict):
                return False
                
            # If leader found fabrication or stale data, safely accept the revert error
            if "error" in leader_data:
                return True
                
            # Validator independently enforces freshness and authenticity before AI consensus
            current_time = int(time.time())
            candle_ts = int(market_data["candle_timestamp"])
            if (current_time - candle_ts) > max_age:
                return False

            symbol = pair.replace("/", "")
            url = f"https://api.binance.com/api/v3/ticker/price?symbol={symbol}"
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=10) as response:
                    data = json.loads(response.read().decode())
                    actual_price = float(data['price'])
                    proposed_price = float(market_data["close"])
                    deviation = abs(proposed_price - actual_price) / actual_price
                    if deviation > 0.005:
                        return False
            except Exception:
                return False

            if leader_data.get("pattern") not in ("BULLISH_BREAKOUT", "FAKE_OUT", "CONSOLIDATION"):
                return False
                
            if not isinstance(leader_data.get("reason"), str):
                return False
            
            validator_result = gl.nondet.exec_prompt(prompt, response_format="json")
            
            if not isinstance(validator_result, dict):
                return False
                
            if validator_result.get("pattern") != leader_data.get("pattern"):
                return False
                
            return True

        ai_result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        if not isinstance(ai_result, dict):
            raise Exception("Invalid AI result")
            
        if "error" in ai_result:
            raise Exception(ai_result["error"])
            
        pattern = ai_result.get("pattern")
        reason = ai_result.get("reason")
        
        if pattern not in ("BULLISH_BREAKOUT", "FAKE_OUT", "CONSOLIDATION"):
            raise Exception("Invalid AI pattern")
            
        if not isinstance(reason, str):
            raise Exception("Invalid AI reason")
            
        if len(reason) > MAX_REASON_LENGTH:
            reason = reason[:MAX_REASON_LENGTH]

        action = "HELD"
        
        if pattern == "BULLISH_BREAKOUT":
            if self.virtual_spent_total + self.max_order_size > self.max_total_spend:
                raise Exception("Virtual spend limit exceeded")
                
            self.virtual_spent_total += self.max_order_size
            action = "SIGNAL_EMITTED"


        self.processed_snapshots[expected_sha256] = True
        self.processed_candles[candle_timestamp] = True

        record = TradeRecord(
            candle_timestamp=candle_timestamp,
            market_data_hash=expected_sha256,
            asset_pair=pair,
            ai_pattern=pattern,
            action=action,
            reason=reason,
            caller=caller
        )

        self.trade_history[candle_timestamp] = record
        self.trade_count += 1

        gl.emit("MARKET_EVALUATED", {
            "pair": pair,
            "pattern": pattern,
            "action": action,
            "caller": str(caller),
            "candle_timestamp": candle_timestamp
        })

        return json.dumps({
            "version": "6.2",
            "pair": pair,
            "pattern": pattern,
            "action": action,
            "caller": str(caller),
            "candle_timestamp": candle_timestamp,
            "reason": reason
        })

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
            "version": "6.2",
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
            "version": "6.2",
            "active": self.is_active,
            "supported_pairs": self.supported_pairs,
            "timeframe": "4h",
            "virtual_spent_total": str(self.virtual_spent_total),
            "remaining_budget": str(remaining),
            "total_evaluations": str(self.trade_count)
        })
