import { createWalletClient, encodeFunctionData, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AM_ABI, client, CONTRACTS, robinhood, RPC_URL, type FriendState } from "./chain";

// The pass's Claim button. `ActivationManager.claimBatch(asset, collections, ids)` is permissionless: the rewards can
// only go to each Friend's own wallet, so a relayer can send it for the holder and nobody signs anything. Verified by
// simulating it from an unrelated address on 2026-09-30. The relayer holds gas money and nothing else; it can never
// move a Friend's funds anywhere but into that Friend's own wallet.

export function relayerAccount() {
  const pk = process.env.RELAYER_PRIVATE_KEY as Hex | undefined;
  return pk && /^0x[0-9a-fA-F]{64}$/.test(pk) ? privateKeyToAccount(pk) : null;
}

export type ClaimCall = { asset: "RF" | "WETH"; to: `0x${string}`; data: Hex };

/** The claim calls a Friend needs right now (one per asset with something to claim). Also what the wallet fallback sends. */
export function claimCalls(f: FriendState): ClaimCall[] {
  const calls: ClaimCall[] = [];
  for (const asset of ["RF", "WETH"] as const) {
    const wei = asset === "RF" ? f.claimRfWei : f.claimWethWei;
    if (wei === 0n) continue;
    calls.push({
      asset,
      to: CONTRACTS.ActivationManager,
      data: encodeFunctionData({ abi: AM_ABI, functionName: "claimBatch", args: [CONTRACTS[asset], [CONTRACTS[f.ref.collection]], [f.ref.id]] }),
    });
  }
  return calls;
}

export type RelayResult =
  | { status: "sent"; txs: { asset: string; hash: Hex }[] }
  | { status: "nothing" }
  | { status: "unfunded"; relayer: string; needWei: string; haveWei: string }
  | { status: "unavailable"; reason: string };

export async function relayClaim(f: FriendState): Promise<RelayResult> {
  const calls = claimCalls(f);
  if (!calls.length) return { status: "nothing" };
  const account = relayerAccount();
  if (!account) return { status: "unavailable", reason: "no relayer configured" };
  // Simulate first (from the relayer) so a revert never costs gas, then price the gas against the relayer's balance.
  let need = 0n;
  const gasPrice = await client.getGasPrice();
  const gas: bigint[] = [];
  for (const c of calls) {
    const g = await client.estimateGas({ account: account.address, to: c.to, data: c.data });
    gas.push((g * 13n) / 10n);
    need += ((g * 13n) / 10n) * gasPrice * 2n;
  }
  const have = await client.getBalance({ address: account.address });
  if (have < need) return { status: "unfunded", relayer: account.address, needWei: String(need), haveWei: String(have) };
  const wallet = createWalletClient({ account, chain: robinhood, transport: http(process.env.ROBINHOOD_RPC_URL?.trim() || RPC_URL) });
  const txs: { asset: string; hash: Hex }[] = [];
  for (const [i, c] of calls.entries()) {
    const hash = await wallet.sendTransaction({ to: c.to, data: c.data, gas: gas[i] });
    txs.push({ asset: c.asset, hash });
  }
  await Promise.all(txs.map((t) => client.waitForTransactionReceipt({ hash: t.hash, timeout: 30_000 }).catch(() => null)));
  return { status: "sent", txs };
}
