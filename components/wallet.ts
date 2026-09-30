"use client";

import { createPublicClient, createWalletClient, custom, defineChain, encodeFunctionData, parseAbi, type Address, type Hex } from "viem";

// Browser wallet helpers: an injected EIP-1193 wallet (MetaMask, Rabby, Coinbase, a wallet's in-app browser).
// Used for the one sign-in signature, the wallet-sent claim fallback, and withdraw.

export const CHAIN_ID = 4663;
const chain = defineChain({
  id: CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://explorer.mainnet.chain.robinhood.com" } },
});
export const EXPLORER = "https://explorer.mainnet.chain.robinhood.com";

type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
const eth = () => (typeof window !== "undefined" ? (window as unknown as { ethereum?: Eip1193 }).ethereum : undefined);
export const hasWallet = () => !!eth();

export async function connect(): Promise<Address> {
  const p = eth();
  if (!p) throw new Error("No browser wallet found. Open this page in your wallet app's browser.");
  const accounts = (await p.request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts?.[0]) throw new Error("The wallet shared no account.");
  return accounts[0] as Address;
}

export async function ensureChain() {
  const p = eth()!;
  const hex = `0x${CHAIN_ID.toString(16)}`;
  try {
    await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
  } catch (e) {
    if ((e as { code?: number })?.code !== 4902) throw e;
    await p.request({
      method: "wallet_addEthereumChain",
      params: [{ chainId: hex, chainName: "Robinhood Chain", nativeCurrency: chain.nativeCurrency, rpcUrls: chain.rpcUrls.default.http, blockExplorerUrls: [EXPLORER] }],
    });
  }
}

export async function sign(address: Address, message: string): Promise<Hex> {
  const w = createWalletClient({ account: address, transport: custom(eth()!) });
  return w.signMessage({ account: address, message });
}

export async function send(address: Address, tx: { to: Address; data?: Hex; value?: bigint }): Promise<Hex> {
  await ensureChain();
  const w = createWalletClient({ account: address, chain, transport: custom(eth()!) });
  return w.sendTransaction({ account: address, chain, to: tx.to, data: tx.data, value: tx.value ?? 0n });
}

export async function waitFor(hash: Hex) {
  const c = createPublicClient({ chain, transport: custom(eth()!) });
  return c.waitForTransactionReceipt({ hash, timeout: 120_000 });
}

const ERC20 = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);
const FRIEND_WALLET = parseAbi(["function execute(address to, uint256 value, bytes data, uint8 operation) payable returns (bytes result)"]);
export const TOKENS = { RF: "0x0779369854d3EcdEA927206718FFD7730C67B71f", WETH: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" } as const;

/** The Friend wallet's owner-only `execute`: move the full balance of one asset to the owner. Same call rarefriends.com builds. */
export function withdrawCall(friendWallet: Address, owner: Address, asset: "RF" | "WETH" | "ETH", amount: bigint) {
  const data =
    asset === "ETH"
      ? encodeFunctionData({ abi: FRIEND_WALLET, functionName: "execute", args: [owner, amount, "0x", 0] })
      : encodeFunctionData({ abi: FRIEND_WALLET, functionName: "execute", args: [TOKENS[asset], 0n, encodeFunctionData({ abi: ERC20, functionName: "transfer", args: [owner, amount] }), 0] });
  return { to: friendWallet, data };
}

/** Links that reopen this exact page inside a wallet app's browser (phones have no injected wallet in Safari/Chrome). */
export function walletAppLinks(href: string) {
  const u = new URL(href);
  return [
    { name: "MetaMask", href: `https://metamask.app.link/dapp/${u.host}${u.pathname}${u.search}` },
    { name: "Coinbase Wallet", href: `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(href)}` },
  ];
}
