'use client';

import { useState } from 'react';
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { custom } from 'viem';

const CONTRACT_ADDRESS = "0xBDbA84E5FA6c60C9Ac048eB6aab1739bc63c1d57";

const SUPPORTED_PAIRS = [
  "BTC/USDT",
  "ETH/USDT",
  "SOL/USDT",
  "NEAR/USDT",
  "VIRTUAL/USDT"
];

export default function MarketSentinelV4() {
  const [userAddress, setUserAddress] = useState('');
  const [selectedPair, setSelectedPair] = useState("BTC/USDT");
  
  const [snapshotData, setSnapshotData] = useState<any>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [expectedHash, setExpectedHash] = useState('');
  
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  
  const [txHash, setTxHash] = useState('');
  const [txStatus, setTxStatus] = useState('');
  const [evalResult, setEvalResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const connectWallet = async () => {
    setErrorMsg('');
    if (typeof window !== 'undefined' && typeof (window as any).ethereum !== 'undefined') {
      try {
        const accounts = await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
        setUserAddress(accounts[0]);
      } catch (err: any) {
        setErrorMsg(`Wallet connection failed: ${err.message}`);
      }
    } else {
      setErrorMsg("No Web3 wallet found. Please open this page inside MetaMask browser.");
    }
  };

  const getClient = async () => {
    if (!userAddress) throw new Error("Wallet not connected.");
    
    const client = createClient({
      chain: studionet,
      account: userAddress as `0x${string}`,
      transport: custom((window as any).ethereum)
    } as any);

    if (typeof client.connect === 'function') {
      await client.connect("studionet");
    }
    return client;
  };

  const fetchSnapshotWebhook = async () => {
    setErrorMsg('');
    setIsLoadingSnapshot(true);
    setSnapshotData(null);
    setWebhookUrl('');
    setExpectedHash('');

    try {
      // Dynamically construct the absolute webhook URL for GenLayer validators to call
      const absoluteWebhookUrl = `${window.location.origin}/api/snapshot?pair=${encodeURIComponent(selectedPair)}&timeframe=4h`;
      
      const res = await fetch(absoluteWebhookUrl);
      if (!res.ok) throw new Error(`Webhook fetch failed: ${res.statusText}`);
      
      const data = await res.json();
      setSnapshotData(data);
      
      // The frontend uses the absolute API route URL as the webhook parameter for the smart contract
      setWebhookUrl(absoluteWebhookUrl);
      
      // Handle the hash dynamically depending on how your API route named the variable
      setExpectedHash(data.hash || data.expected_sha256 || '');
      
    } catch (err: any) {
      setErrorMsg(`Webhook API Error: ${err.message}`);
    } finally {
      setIsLoadingSnapshot(false);
    }
  };

  const evaluateMarket = async () => {
    setErrorMsg('');
    setTxHash('');
    setTxStatus('Initializing...');
    setEvalResult(null);

    if (!webhookUrl || !expectedHash) {
      setErrorMsg("Please fetch the snapshot webhook data first.");
      return;
    }

    try {
      setIsEvaluating(true);
      setTxStatus('Connecting to GenLayer Client...');
      const client = await getClient();

      setTxStatus('Awaiting Wallet Signature...');
      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'evaluate_market',
        args: [webhookUrl, expectedHash],
        value: BigInt(0)
      });

      setTxHash(hash);
      setTxStatus('Transaction submitted. Awaiting consensus finalization...');

      if (typeof client.waitForTransactionReceipt === 'function') {
        const receipt = await client.waitForTransactionReceipt({ hash });
        setEvalResult(receipt);
        setTxStatus('Finalized successfully!');
      } else {
        await new Promise(r => setTimeout(r, 6000));
        setTxStatus('Transaction broadcasted.');
      }

    } catch (err: any) {
      setErrorMsg(`Execution Error: ${err.message || err}`);
      setTxStatus('Failed');
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-4 md:p-8 font-sans">
      <div className="max-w-3xl mx-auto space-y-6">
        
        <header className="border-b border-neutral-800 pb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-emerald-400">Market Sentinel V4</h1>
            <p className="text-xs text-neutral-400 mt-1">Contract: {CONTRACT_ADDRESS}</p>
          </div>
          <div>
            {!userAddress ? (
              <button onClick={connectWallet} className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
                Connect Wallet
              </button>
            ) : (
              <div className="bg-neutral-900 border border-emerald-800/60 text-emerald-300 text-xs px-3 py-2 rounded-lg">
                Connected: <span className="font-mono">{userAddress.substring(0, 6)}...{userAddress.slice(-4)}</span>
              </div>
            )}
          </div>
        </header>

        {errorMsg && (
          <div className="bg-red-950/60 border border-red-800 text-red-300 p-3 rounded-lg text-xs font-mono">
            <strong>Error:</strong> {errorMsg}
          </div>
        )}

        <section className="bg-neutral-900 border border-neutral-800 p-5 rounded-xl space-y-4">
          <h2 className="text-sm font-bold text-neutral-200">1. Select Trading Pair</h2>
          <div className="flex flex-wrap gap-2">
            {SUPPORTED_PAIRS.map((pair) => (
              <button
                key={pair}
                onClick={() => setSelectedPair(pair)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  selectedPair === pair ? 'bg-emerald-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                }`}
              >
                {pair}
              </button>
            ))}
          </div>

          <button
            onClick={fetchSnapshotWebhook}
            disabled={isLoadingSnapshot}
            className="w-full bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 py-2.5 rounded-lg text-xs font-bold transition disabled:opacity-50"
          >
            {isLoadingSnapshot ? 'Calling Snapshot Webhook...' : `Fetch Webhook Data for ${selectedPair}`}
          </button>
        </section>

        {snapshotData && (
          <section className="bg-neutral-900 border border-neutral-800 p-5 rounded-xl space-y-3">
            <h2 className="text-sm font-bold text-blue-400">2. Webhook Payload Info</h2>
            <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 text-xs font-mono space-y-1 overflow-x-auto text-neutral-300">
              <p><span className="text-neutral-500">Target Webhook:</span> <a href={webhookUrl} target="_blank" rel="noreferrer" className="text-blue-400 underline">{webhookUrl}</a></p>
              <p><span className="text-neutral-500">SHA-256 Hash:</span> <span className="text-emerald-400">{expectedHash}</span></p>
            </div>

            <button
              onClick={evaluateMarket}
              disabled={isEvaluating || !userAddress}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg text-sm font-bold transition disabled:opacity-50"
            >
              {isEvaluating ? 'Evaluating via GenLayer Validators...' : 'Evaluate Market On-Chain'}
            </button>
          </section>
        )}

        {(txHash || txStatus) && (
          <section className="bg-neutral-900 border border-neutral-800 p-5 rounded-xl space-y-3 text-xs font-mono">
            <h2 className="text-sm font-bold text-neutral-200 font-sans">3. Consensus Status</h2>
            <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 space-y-2 text-neutral-300">
              <p><span className="text-neutral-500">Status:</span> <span className="text-amber-400">{txStatus}</span></p>
              {txHash && <p><span className="text-neutral-500">Tx Hash:</span> <span className="text-neutral-200 break-all">{txHash}</span></p>}
              {evalResult && (
                <div className="mt-3 pt-3 border-t border-neutral-800 space-y-1">
                  <p className="text-emerald-400 font-bold">Consensus Result Received:</p>
                  <pre className="text-[10px] text-neutral-400 overflow-x-auto bg-neutral-900 p-2 rounded">
                    {JSON.stringify(evalResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
