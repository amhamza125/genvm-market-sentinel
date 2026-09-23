import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

const SYMBOLS: Record<string, string> = {
  "BTC/USDT": "BTCUSDT",
  "ETH/USDT": "ETHUSDT",
  "SOL/USDT": "SOLUSDT",
  "NEAR/USDT": "NEARUSDT",
  "VIRTUAL/USDT": "VIRTUALUSDT",
};

function canonicalize(data: Record<string, string>) {
  return JSON.stringify({
    candle_timestamp: data.candle_timestamp,
    close: data.close,
    high: data.high,
    low: data.low,
    open: data.open,
    pair: data.pair,
    previous_close: data.previous_close,
    timeframe: data.timeframe,
    volume: data.volume,
  });
}

export async function GET(request: NextRequest) {
  try {
    const pair = request.nextUrl.searchParams.get("pair");

    if (!pair || !SYMBOLS[pair]) {
      return NextResponse.json(
        {
          error: "Unsupported trading pair",
          supported_pairs: Object.keys(SYMBOLS),
        },
        { status: 400 },
      );
    }

    const symbol = SYMBOLS[pair];

    const url =
      `https://api.binance.com/api/v3/klines` +
      `?symbol=${encodeURIComponent(symbol)}` +
      `&interval=4h&limit=3`;

    const response = await fetch(url, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Market data provider returned ${response.status}`);
    }

    const candles = await response.json();

    if (!Array.isArray(candles) || candles.length < 2) {
      throw new Error("Insufficient candle data");
    }

    const now = Date.now();

    // Select the newest COMPLETED 4H candle.
    const completed = candles
      .filter((c: unknown[]) => Number(c[6]) <= now)
      .at(-1);

    if (!completed) {
      throw new Error("No completed 4H candle available");
    }

    const index = candles.indexOf(completed);

    const previous =
      index > 0
        ? candles[index - 1]
        : candles[0];

    const snapshot = {
      pair,
      timeframe: "4h",
      candle_timestamp: String(
        Math.floor(Number(completed[0]) / 1000),
      ),
      previous_close: String(previous[4]),
      open: String(completed[1]),
      high: String(completed[2]),
      low: String(completed[3]),
      close: String(completed[4]),
      volume: String(completed[5]),
    };

    const canonical = canonicalize(snapshot);

    const hash = createHash("sha256")
      .update(canonical, "utf8")
      .digest("hex");

    return NextResponse.json(
      {
        ...snapshot,
        canonical,
        sha256: hash,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Market snapshot failed",
      },
      { status: 500 },
    );
  }
}
