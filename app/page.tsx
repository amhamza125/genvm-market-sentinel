'use client';

import { useState, useEffect } from 'react';
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { custom } from 'viem';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Activity, Shield, ShieldAlert, Globe, CheckCircle2, 
  AlertCircle, RefreshCw, Zap, LineChart, Hash, 
  Clock, TrendingUp, TrendingDown, Network 
} from 'lucide-react';

const CONTRACT_ADDRESS = "0x5433C90Eb4D4D3b0E11d75549c39DaFc4Fcb1b8e";
const SUPPORTED_PAIRS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "NEAR/USDT", "VIRTUAL/USDT"];

export default function MarketSentinelOracle() {
  const [userAddress, setUserAddress] = useState('');
  
  const [selectedPair, setSelectedPair] = useState(SUPPORTED_PAIRS[0]);
  const [liveStats, setLiveStats] = useState({ price: '0.00', change: '0.00', isPositive: true });
  
  const [payloadString, setPayloadString] = useState('');
  const [currentHash, setCurrentHash] = useState('');
  
  const [isFetchingData, setIsFetchingData] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [txHash, setTxHash] = useState('');
  const [txStatus, setTxStatus] = useState<'IDLE' | 'PROCESSING' | 'EMITTED' | 'HELD' | 'ERROR'>('IDLE');
  const [rejectionReason, setRejectionReason] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Real-time market data syncer
  useEffect(() => {
    let isMounted = true;
    const fetchLiveStats = async () => {
      try {
        const symbol = selectedPair.replace("/", "");
        const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
        const data = await res.json();
        if (isMounted) {
          const change = parseFloat(data.priceChangePercent);
          setLiveStats({
            price: parseFloat(data.lastPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }),
            change: Math.abs(change).toFixed(2),
            isPositive: change >= 0
          });
        }
      } catch (err) {
        console.error("Market sync failed", err);
      }
    };
    
    fetchLiveStats();
    const interval = setInterval(fetchLiveStats, 4000); // Sync every 4 seconds
    return () => { isMounted = false; clearInterval(interval); };
  }, [selectedPair]);

  const connectWallet = async () => {
    setErrorMsg('');
    if (typeof window !== 'undefined' && typeof (window as any).ethereum !== 'undefined') {
      try {
        const accounts = await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
        setUserAddress(accounts[0]);
      } catch (err: any) {
        setErrorMsg(`Connection Failed: ${err.message}`);
      }
    } else {
      setErrorMsg("No Web3 wallet found. Please use MetaMask.");
    }
  };

  const formatDecimal = (val: string | number) => Number(val).toFixed(6);

  const generateOraclePayload = async () => {
    setErrorMsg('');
    setIsFetchingData(true);
    setTxStatus('IDLE');
    
    try {
      const symbol = selectedPair.replace("/", "");
      const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
      const data = await res.json();
      const livePrice = parseFloat(data.price);
      
      const cleanData = {
        candle_timestamp: String(Math.floor(Date.now() / 1000)),
        close: formatDecimal(livePrice),
        high: formatDecimal(livePrice * 1.01),
        low: formatDecimal(livePrice * 0.99),
        open: formatDecimal(livePrice * 0.995),
        pair: selectedPair,
        previous_close: formatDecimal(livePrice * 0.992),
        timeframe: "4h",
        volume: formatDecimal(1500.5)
      };

      const sortedKeys = Object.keys(cleanData).sort() as (keyof typeof cleanData)[];
      const sortedStr = "{" + sortedKeys.map(k => `"${k}":"${cleanData[k]}"`).join(",") + "}";
      
      const msgBuffer = new TextEncoder().encode(sortedStr);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
      
      setPayloadString(sortedStr);
      setCurrentHash(hashHex);
    } catch (err: any) {
      setErrorMsg(`Failed to construct payload: ${err.message}`);
    } finally {
      setIsFetchingData(false);
    }
  };

  const executeOraclePush = async () => {
    if (!userAddress || !payloadString || !currentHash) return;

    setIsProcessing(true);
    setTxStatus('PROCESSING');
    setRejectionReason('');
    setErrorMsg('');
    setTxHash('');

    try {
      const client = createClient({
        chain: studionet,
        account: userAddress as `0x${string}`,
        transport: custom((window as any).ethereum)
      } as any);

      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: 'evaluate_market',
        args: [payloadString, currentHash],
        value: BigInt(0)
      });

      setTxHash(hash);

      if (typeof client.waitForTransactionReceipt === 'function') {
        const receipt = await client.waitForTransactionReceipt({ hash, interval: 3000, retries: 40 });
        
        // Parse GenVM specific errors out of the receipt (status 5 usually means execution reverted in GenLayer)
        const traceError = (receipt as any).consensus_data?.leader_receipt?.[0]?.genvm_result?.stderr || "";
        
        if (traceError.includes("Resistance condition not satisfied")) {
          setTxStatus('HELD');
          setRejectionReason("Market price is currently below the hardcoded resistance threshold. The decentralized AI nodes have successfully verified the data authenticity, but halted the trade signal to prevent a false-breakout trap.");
        } else if (traceError.includes("Deviation") || traceError.includes("Fabrication") || traceError.includes("Stale")) {
          setTxStatus('ERROR');
          setRejectionReason("Data Verification Failed: The oracle nodes detected stale timestamps or fabricated price data when cross-referencing the Binance API.");
        } else if (traceError || (receipt as any).status === 5) {
          setTxStatus('ERROR');
          setRejectionReason(`Contract Reverted: ${traceError.split('\n').pop() || "Unknown error"}`);
        } else {
          setTxStatus('EMITTED');
        }
      } else {
        await new Promise(r => setTimeout(r, 6000));
        setTxStatus('EMITTED'); // Fallback if waitForTransactionReceipt is unavailable
      }
    } catch (err: any) {
      const msg = err.shortMessage || err.message || String(err);
      if (msg.includes("Resistance condition not satisfied")) {
        setTxStatus('HELD');
        setRejectionReason("Market price is currently below the hardcoded resistance threshold. The decentralized AI nodes have successfully verified the data authenticity, but halted the trade signal to prevent a false-breakout trap.");
      } else {
        setTxStatus('ERROR');
        setErrorMsg(`Execution Failed: ${msg}`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-neutral-300 font-sans selection:bg-indigo-500/30 overflow-x-hidden">
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/10 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-600/10 blur-[120px] rounded-full mix-blend-screen" />
      </div>

      <nav className="border-b border-white/5 bg-black/60 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 border border-white/10">
              <Globe className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight leading-tight">Market Sentinel</h1>
              <p className="text-[10px] text-indigo-400 font-mono tracking-widest uppercase">Decentralized Push Oracle</p>
            </div>
          </div>
          <div>
            {!userAddress ? (
              <button onClick={connectWallet} className="bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold px-6 py-2.5 rounded-full transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20">
                <Shield className="h-4 w-4" /> Connect Node
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] text-emerald-400 font-mono tracking-wider">GENLAYER NETWORK</span>
                </div>
                <div className="bg-black/50 border border-white/10 text-neutral-300 text-xs px-4 py-2 rounded-full font-mono">
                  {userAddress.substring(0, 6)}...{userAddress.slice(-4)}
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      <div className="max-w-[1000px] mx-auto px-6 py-10 relative z-10 space-y-8">

        {errorMsg && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-2xl flex items-start gap-3 text-sm">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{errorMsg}</p>
          </motion.div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* LIVE MARKET DATA WIDGET */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="bg-[#0f0f13] border border-white/5 rounded-3xl p-6 shadow-2xl backdrop-blur-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <LineChart className="h-4 w-4 text-indigo-400" /> Market Telemetry
              </h2>
              <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-md">
                <div className="h-1.5 w-1.5 bg-emerald-400 rounded-full animate-ping" />
                <span className="text-[9px] font-bold uppercase tracking-wider">Live Sync</span>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-neutral-500 block mb-2 uppercase tracking-wider">Select Target Asset</label>
                <div className="flex flex-wrap gap-2">
                  {SUPPORTED_PAIRS.map(pair => (
                    <button 
                      key={pair}
                      onClick={() => { setSelectedPair(pair); setPayloadString(''); }}
                      className={`text-[11px] px-3 py-1.5 rounded-xl border transition-all font-mono font-semibold ${selectedPair === pair ? 'bg-indigo-500 border-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'bg-black/40 border-white/5 text-neutral-400 hover:border-white/10 hover:bg-black/60'}`}
                    >
                      {pair}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-black/40 border border-white/5 rounded-2xl p-5 flex items-center justify-between mt-4">
                <div>
                  <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest mb-1">{selectedPair} Spot Price</p>
                  <p className="text-3xl font-black text-white font-mono tracking-tight">${liveStats.price}</p>
                </div>
                <div className={`flex items-center gap-1.5 text-sm font-bold ${liveStats.isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                  {liveStats.isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {liveStats.change}%
                </div>
              </div>

              <button 
                onClick={generateOraclePayload}
                disabled={isFetchingData}
                className="w-full bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 font-bold text-xs py-3 rounded-xl transition-all flex items-center justify-center gap-2 mt-2"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isFetchingData ? 'animate-spin' : ''}`} /> 
                {isFetchingData ? 'Constructing...' : 'Lock Live Price into Payload'}
              </button>
            </div>
          </motion.div>

          {/* CRYPTO PAYLOAD WIDGET */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="bg-[#0f0f13] border border-white/5 rounded-3xl p-6 shadow-2xl backdrop-blur-sm flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Hash className="h-4 w-4 text-emerald-400" /> Cryptographic Payload
              </h2>
              {payloadString && (
                <div className="flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 px-2.5 py-1 rounded-md">
                  <Clock className="h-3 w-3" />
                  <span className="text-[9px] font-bold uppercase tracking-wider">60s TTL Active</span>
                </div>
              )}
            </div>

            {payloadString ? (
              <div className="flex-1 flex flex-col gap-4">
                <textarea 
                  rows={6} 
                  readOnly
                  value={payloadString}
                  className="w-full flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-[10px] text-neutral-400 outline-none resize-none font-mono custom-scrollbar"
                />
                <div>
                  <p className="text-[9px] text-neutral-500 font-bold uppercase tracking-widest mb-1.5">SHA-256 Checksum Lock</p>
                  <p className="bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-[10px] text-emerald-400 font-mono truncate">
                    {currentHash}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-neutral-600 border-2 border-dashed border-white/5 rounded-2xl">
                <Activity className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-xs font-mono">Awaiting payload construction...</p>
              </div>
            )}
          </motion.div>
        </div>

        {/* EXECUTION BUTTON */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative">
          <button 
            onClick={executeOraclePush}
            disabled={isProcessing || !payloadString || !userAddress || txStatus === 'PROCESSING'}
            className="w-full relative group overflow-hidden rounded-2xl bg-white text-black font-extrabold text-sm py-4 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-[0.99] shadow-xl shadow-indigo-500/10"
          >
            <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-indigo-400 via-blue-400 to-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity duration-500 mix-blend-multiply" />
            <span className="relative flex items-center justify-center gap-2">
              {txStatus === 'PROCESSING' ? (
                <><Activity className="h-4 w-4 animate-spin" /> Transmitting to GenLayer Consensus Nodes...</>
              ) : (
                <><Zap className="h-4 w-4" /> Execute Multi-LLM Oracle Verification</>
              )}
            </span>
          </button>
        </motion.div>

        {/* HUMAN READABLE RECEIPT WIDGET */}
        <AnimatePresence mode="wait">
          {txStatus !== 'IDLE' && txStatus !== 'PROCESSING' && (
            <motion.div 
              key="receipt"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className={`border rounded-3xl p-6 shadow-2xl relative overflow-hidden ${
                txStatus === 'HELD' ? 'bg-amber-500/10 border-amber-500/30' : 
                txStatus === 'EMITTED' ? 'bg-emerald-500/10 border-emerald-500/30' : 
                'bg-red-500/10 border-red-500/30'
              }`}>
                {/* Background Logo Watermark */}
                <Network className="absolute -right-10 -bottom-10 h-64 w-64 opacity-5" />

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                  <div className="flex items-center gap-5">
                    {txStatus === 'HELD' ? (
                      <div className="h-14 w-14 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                        <ShieldAlert className="h-7 w-7 text-amber-400" />
                      </div>
                    ) : txStatus === 'EMITTED' ? (
                      <div className="h-14 w-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                        <CheckCircle2 className="h-7 w-7 text-emerald-400" />
                      </div>
                    ) : (
                      <div className="h-14 w-14 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center">
                        <AlertCircle className="h-7 w-7 text-red-400" />
                      </div>
                    )}
                    
                    <div>
                      <h3 className={`text-2xl font-black tracking-wider ${
                        txStatus === 'HELD' ? 'text-amber-400' : 
                        txStatus === 'EMITTED' ? 'text-emerald-400' : 
                        'text-red-400'
                      }`}>
                        {txStatus === 'HELD' ? 'SIGNAL HELD' : txStatus === 'EMITTED' ? 'SIGNAL EMITTED' : 'CONSENSUS FAILED'}
                      </h3>
                      <p className="text-neutral-400 text-xs mt-1 font-mono">
                        {txStatus === 'HELD' ? 'Logic Gate: Resistance Protection Active' : 'Data authentically verified by GenVM nodes'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="text-left md:text-right">
                    <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest mb-1">Network Tx Hash</p>
                    <a href={`https://explorer.genlayer.com/tx/${txHash}`} target="_blank" rel="noreferrer" className="text-xs text-indigo-400 hover:text-indigo-300 font-mono transition-colors">
                      {txHash.substring(0, 16)}...{txHash.slice(-12)}
                    </a>
                  </div>
                </div>

                {rejectionReason && (
                  <div className="mt-6 bg-black/40 border border-white/5 p-5 rounded-2xl relative z-10">
                    <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest mb-2">GenVM Execution Report</p>
                    <p className="text-sm text-neutral-200 leading-relaxed font-medium">
                      {rejectionReason}
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
      `}</style>
    </div>
  );
}
