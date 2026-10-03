```markdown
# 🌐 GenLayer AI Market Sentinel

> An autonomous, decentralized AI push oracle built on GenLayer that securely evaluates cryptocurrency market structures and issues verified trading signals via multi-node consensus—completely eliminating single-point-of-failure off-chain data feeds.

---

## 🚀 Live Demo & Links

*   **🌐 Live Web App:** [Market Sentinel Dashboard](https://genvm-market-sentinel-n4e09470t-ameer-hamza-s-projects2.vercel.app/)
*   **⚡ GenLayer Studio Contract:** [Import into Studio](https://studio.genlayer.com/?import-contract=0x7A6b7eBa93c4337CC149A158BBEfF54d101cd193)
*   **🎥 Video Demo:** [Watch YouTube Short](https://youtube.com/shorts/4KUwtDvds9M?feature=share)
*   **📦 Repository:** [GitHub Repository](https://github.com/amhamza125/genvm-market-sentinel)

---

## 💡 Overview

Traditional oracles rely on centralized APIs or single trusted actors, introducing severe trust assumptions and vulnerabilities to data manipulation. **Market Sentinel** re-architects oracle design by leveraging GenLayer's **Intelligent Contracts** and **Equivalence Principle (`gl.eq_principle.strict_eq`)**.

Instead of accepting caller-supplied market data, the contract autonomously pulls completed 4-hour historical candlestick data from globally distributed public exchange endpoints inside decentralized consensus. Validator nodes independently verify and agree on the data byte-for-byte before non-deterministic multi-LLM engines evaluate the market structure against strict mathematical rubrics.

---

## 📐 Architecture & Security Model

```text
Caller submits allowlisted pair (e.g. BTC/USDT)
                    │
                    ▼
Contract deterministically derives 4h window from transaction block time
                    │
                    ▼
Leader & Validators independently fetch historical OHLCV data from Binance Vision API
                    │
                    ▼
GenLayer strict_eq consensus enforces exact byte-for-byte equivalence
                    │
                    ▼
Non-deterministic LLMs classify data into [BULLISH_BREAKOUT, FAKE_OUT, CONSOLIDATION]
                    │
                    ▼
Deterministic 18-decimal rubric validation & virtual budget gating

```

### Key Architectural Fixes:

1. **Contract-Pull Model:** Eliminates caller-supplied OHLCV or timestamps. The target 4-hour candle is deterministically calculated from block time (`time.time()`).
2. **Decentralized Consensus Verification:** Leader and validator nodes independently query the exchange endpoint. Divergent payloads fail consensus immediately.
3. **18-Decimal Fixed-Precision Normalization:** Replaces vulnerable floating-point arithmetic with precise integer scaling to ensure secure, deterministic comparisons.
4. **Strict Rubric Guardrails:** AI classifications are verified against hard programmatic price-action bounds, preventing LLM hallucinations or policy bypasses.

---

## 🛠️ Tech Stack

* **Smart Contract:** Python (GenLayer SDK `py-genlayer`, GenVM Runtime, TreeMap state management).
* **Consensus & AI:** GenLayer Equivalence Principle (`gl.eq_principle.strict_eq`), Non-deterministic prompt execution (`gl.nondet.exec_prompt`).
* **Frontend:** Next.js (App Router), React, Tailwind CSS, Viem, `genlayer-js`.
* **Data Source:** Official Binance Vision Public Data API (`data-api.binance.vision`).

---

## 📋 Smart Contract Interface

### Write Methods

* `evaluate_market(pair: str) -> str`: Pulls verified historical 4-hour candles, runs multi-LLM consensus, checks resistance rules, updates virtual budget, and emits events.
* `halt()` / `resume()`: Emergency circuit breakers restricted to contract owner.

### View Methods

* `get_configuration() -> str`: Returns active configuration, version, and budget parameters.
* `get_sentinel_state() -> str`: Returns remaining virtual spend budget and total evaluation counts.
* `get_verified_snapshot(pair: str, candle_open_time_ms: str) -> str`: Retrieves the raw cryptographically verified snapshot stored on-chain.

---

## 💻 Local Development & Setup

### 1. Clone the Repository

```bash
git clone [https://github.com/amhamza125/genvm-market-sentinel.git](https://github.com/amhamza125/genvm-market-sentinel.git)
cd genvm-market-sentinel

```

### 2. Install Frontend Dependencies

```bash
npm install

```

### 3. Run the Development Server

```bash
npm run dev

```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

---

## 🧪 How to Test in GenLayer Studio

1. Open the [GenLayer Studio Import Link](https://studio.genlayer.com/?import-contract=0x7A6b7eBa93c4337CC149A158BBEfF54d101cd193).
2. Connect your Web3 wallet (e.g., MetaMask) configured for GenLayer Studionet.
3. Select an allowed asset pair (e.g., `BTC/USDT`).
4. Invoke `evaluate_market` to trigger node consensus, AI pattern classification, and state persistence.

---

## 🛡️ License

Distributed under the MIT License. See `LICENSE` for more information.

```

```
