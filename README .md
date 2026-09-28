# GenLayer AI Market Sentinel: Decentralized Push Oracle

A production-grade, decentralized market classification oracle deployed on **GenLayer**. AI Market Sentinel continuously ingests 4-hour OHLCV candle telemetry, validates payload integrity through cryptographic hashing and strict freshness windows, authenticates market data via on-chain consensus queries to authoritative exchange endpoints, and executes multi-LLM consensus to classify breakouts.

---

## 📌 Deployment & Verification Telemetry

| Parameter | Details |
| --- | --- |
| **Contract Address** | `0x5433C90Eb4D4D3b0E11d75549c39DaFc4Fcb1b8e` |
| **Network** | GenLayer StudioNet |
| **Explorer** | [View On-Chain Contract](https://explorer-studio.genlayer.com/address/0x5433C90Eb4D4D3b0E11d75549c39DaFc4Fcb1b8e?utm_source=gemini) |
| **Studio IDE** | [Import Contract into GenLayer Studio](https://studio.genlayer.com/?import-contract=0x5433C90Eb4D4D3b0E11d75549c39DaFc4Fcb1b8e&utm_source=gemini) |
| **Live Interface** | [Production Oracle Dashboard](https://genvm-market-sentinel-qvcdckqit-ameer-hamza-s-projects2.vercel.app/?utm_source=gemini) |

---

## 🏗 High-Level Protocol Pipeline

```
  [ Next.js Client / Relayer ]
               │
               ▼
 1. Fetch Real-Time Binance Ticker & Candle Data
 2. Canonical JSON Serialization + SHA-256 Digest
 3. Submit Transaction: evaluate_market(payload, hash)
               │
               ▼
  [ GenLayer Intelligent Contract (`AIMarketSentinel`) ]
               │
               ├─► [GATE 1: Deterministic Check]
               │     ├── Single-Use Snapshot Hash Verification (TreeMap)
               │     ├── Single-Use Candle Timestamp Verification (TreeMap)
               │     ├── Strict High/Low/Open/Close Range Validity
               │     └── Pair Resistance Threshold Barrier (e.g. BTC > $100k)
               │
               └─► [GATE 2: GenVM Consensus Layer (`gl.vm.run_nondet_unsafe`)]
                     ├── Leader & Validators Query Binance API Independently
                     ├── Freshness Enforcement: Block Timestamp - Candle Timestamp ≤ 60s
                     ├── Data Deviation Check: |Price_Payload - Price_Binance| / Price_Binance ≤ 0.5%
                     └── Multi-LLM Quorum Inference:
                           └── Pattern: BULLISH_BREAKOUT | FAKE_OUT | CONSOLIDATION
                                       │
                                       ▼
  [ State Commit & Signal Emission (`MARKET_EVALUATED`) ]

```

---

## 🛡️ Core Architectural Components

### 1. Authenticated Push Oracle & Freshness Protection

Traditional push oracles present severe **"Garbage In, Garbage Out"** vulnerabilities where untrusted callers submit fabricated market conditions alongside matching hashes. To provide end-to-end data integrity:

* **Canonical Key-Sorted Hashing:** The payload is serialized deterministically without whitespace (`separators=(',', ':')`) with alphabetically sorted keys, generating a reproducible SHA-256 fingerprint verified on-chain.
* **Strict 60-Second TTL:** The contract compares `candle_timestamp` against node runtime execution time (`time.time()`). Any payload exceeding 60 seconds is immediately rejected, neutralizing historical replay exploits.
* **Consensus-Layer Source Authentication:** In the nondeterministic consensus block (`leader_fn` and `validator_fn`), validator nodes independently query authoritative exchange tickers (`api.binance.com`). If the submitted `close` price deviates from the live market price by more than **0.5%**, execution reverts with an explicit data fabrication error.

### 2. Deterministic Pre-Execution Logic Gates

Before committing compute resources to AI inference, the contract enforces zero-cost deterministic validation gates:

* **Asset Whitelist:** Restricted strictly to `BTC/USDT`, `ETH/USDT`, `SOL/USDT`, `NEAR/USDT`, and `VIRTUAL/USDT`.
* **OHLC Structural Bounds:** Enforces that `high >= low`, `open` and `close` sit bounded inside `[low, high]`, and `volume >= 0`.
* **Breakout Resistance Barriers:** Signals require genuine market breakouts. Closing prices must strictly breach defined resistance targets before triggering the AI pipeline:
* **BTC/USDT:** $100,000
* **ETH/USDT:** $5,000
* **SOL/USDT:** $250
* **NEAR/USDT:** $5.00
* **VIRTUAL/USDT:** $2.00


* **Replay & Double-Spend Guards:** Employs storage-backed `TreeMap[str, bool]` lookups to permanently record processed snapshot hashes and candle timestamps.

### 3. Multi-LLM Consensus Engine

Once all deterministic gates and API verification passes, GenLayer validator nodes process the market structure:

* **Decentralized Multi-Model Ingestion:** Independent validator nodes evaluate the validated candle metrics against prior market ranges.
* **Strict Classification Space:** Output must strictly resolve to a structured JSON classification:
* `BULLISH_BREAKOUT`
* `FAKE_OUT`
* `CONSOLIDATION`


* **Consensus Validation:** The validator nodes must achieve majority agreement on the classified pattern and validate reasoning format.
* **Execution & Virtual Accounting:** If a `BULLISH_BREAKOUT` is confirmed, the contract fires the `MARKET_EVALUATED` event, writes an immutable `TradeRecord` entry, and increments virtual execution expenditure against safety budget caps.

---

## 📁 Repository Structure

```
├── ai_market_sentinel.py     # GenLayer Intelligent Contract (GenVM Python)
├── app/
│   ├── layout.tsx            # Next.js App Router Root Layout
│   └── page.tsx              # Oracle Dashboard (Real-time telemetry & Tx receipt parser)
├── public/                   # Static application assets
├── package.json              # Project configuration and client dependencies
├── tsconfig.json             # TypeScript compiler settings
└── README.md                 # Project architecture documentation

```

---

## 🚀 Local Development & Testing

### Prerequisites

* Node.js v18+
* Web3 Wallet (MetaMask or compatible) configured for **GenLayer StudioNet**

### 1. Installation

```bash
git clone https://github.com/amhamza125/genvm-market-sentinel.git
cd genvm-market-sentinel
npm install

```

### 2. Run Dashboard

```bash
npm run dev

```

Open [http://localhost:3000](http://localhost:3000?utm_source=gemini) to launch the Oracle dashboard.

---

