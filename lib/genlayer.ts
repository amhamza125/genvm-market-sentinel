import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

export const CONTRACT_ADDRESS =
  "0xBDbA84E5FA6c60C9Ac048eB6aab1739bc63c1d57";

export const PAIRS = [
  "BTC/USDT",
  "ETH/USDT",
  "SOL/USDT",
  "NEAR/USDT",
  "VIRTUAL/USDT",
] as const;

export type Pair = (typeof PAIRS)[number];

export function createReadClient() {
  return createClient({
    chain: studionet,
  });
}

export function createWalletClient(
  address: `0x${string}`,
  provider: EIP1193Provider,
) {
  return createClient({
    chain: studionet,
    account: address,
    provider,
  });
}

export interface EIP1193Provider {
  request(args: {
    method: string;
    params?: unknown[];
  }): Promise<unknown>;
}
