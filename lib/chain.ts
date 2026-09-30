import { createPublicClient, defineChain, fallback, getAddress, http, parseAbi, type Address } from "viem";

// Robinhood Chain reads for one Friend. Addresses and the reward reads are the ones rarefriends.com's own bundle makes
// (verified on chain for Rare Friends Cards, which runs the same reads for every wallet it renders).

export const CHAIN_ID = 4663;
export const RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
const PUBLIC_RPCS = ["https://rpc-robinhood.globalstake.io", "https://robinhood-rpc.publicnode.com"];
export const SITE = "https://rarefriends.com";
const SNAPSHOT_API = `${SITE}/api/protocol/snapshot`;
const OWNED_API = `${SITE}/api/protocol/owned-nfts`;
const ARTWORK_API = `${SITE}/api/protocol/nft-image`;
const UA = "rare-friends-pass/1.0 (+https://rare-friends-pass.vercel.app)";

export const CONTRACTS = {
  ActivationManager: "0xD4A35e11318E3679168d409184B788bcF9F283Ac",
  RF: "0x0779369854d3EcdEA927206718FFD7730C67B71f",
  WETH: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
  Genesis: "0x116EaA62241751E0c98dA43d458600c6C17cD361",
  Generations: "0x14C49e6118F46525dE9ab41a51cBAA3c6EBF181D",
  Multicall3: "0xca11bde05977b3631167028862be2a173976ca11",
} as const satisfies Record<string, Address>;

export type Collection = "Genesis" | "Generations";

export const robinhood = defineChain({
  id: CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://explorer.mainnet.chain.robinhood.com" } },
  contracts: { multicall3: { address: CONTRACTS.Multicall3 } },
});

const envRpc = () => process.env.ROBINHOOD_RPC_URL?.trim();
export const client = createPublicClient({
  chain: robinhood,
  transport: fallback(
    [envRpc(), RPC_URL, ...PUBLIC_RPCS].filter((u): u is string => !!u).map((u) => http(u, { timeout: 5_000, retryCount: 0 })),
    { retryCount: 1 }
  ),
});

export const AM_ABI = parseAbi([
  "function positions(address collection, uint256 tokenId) view returns (uint8 tier, uint256 weight)",
  "function earned(address asset, address collection, uint256 tokenId) view returns (uint256)",
  "function claimBatch(address asset, address[] collections, uint256[] ids)",
]);
export const NFT_ABI = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenBoundAccount(uint256 tokenId) view returns (address)",
  "function generation(uint256 tokenId) view returns (uint8)",
  "function tokenURI(uint256 tokenId) view returns (string)",
]);
export const ERC20_ABI = parseAbi(["function balanceOf(address) view returns (uint256)", "function transfer(address to, uint256 amount) returns (bool)"]);
export const FRIEND_WALLET_ABI = parseAbi([
  "function owner() view returns (address)",
  "function execute(address to, uint256 value, bytes data, uint8 operation) payable returns (bytes result)",
]);
const MULTICALL_ABI = parseAbi(["function getEthBalance(address addr) view returns (uint256)"]);

export const units = (wei: bigint) => Number(wei) / 1e18;

// ===== serials =====
// A pass serial names one Friend: "genesis-292" or "gen-3703". Genesis and Generations ids overlap, so the prefix is required.

export type FriendRef = { collection: Collection; id: bigint };
export function serialOf(ref: FriendRef) {
  return `${ref.collection === "Genesis" ? "genesis" : "gen"}-${ref.id}`;
}
export function parseSerial(serial: string): FriendRef | null {
  const m = /^(genesis|gen)-([1-9][0-9]{0,9})$/.exec(serial);
  if (!m) return null;
  return { collection: m[1] === "genesis" ? "Genesis" : "Generations", id: BigInt(m[2]) };
}
export function friendTitle(ref: FriendRef, generation = 0) {
  return ref.collection === "Genesis" ? `Genesis #${ref.id}` : `${generation > 0 ? `Gen-${generation} ` : ""}Generations #${ref.id}`;
}

// ===== one Friend =====

export type FriendState = {
  ref: FriendRef;
  serial: string;
  title: string;
  owner: Address;
  generation: number;
  tier: number;
  weight: number;
  hardwired: boolean;
  activated: boolean;
  /** Rewards earned and not yet claimed into the Friend's own wallet. */
  claimRf: number;
  claimWeth: number;
  claimRfWei: bigint;
  claimWethWei: bigint;
  /** The Friend's own ERC-6551 wallet (its "backpack") and what it holds. */
  wallet: Address | null;
  bag: { rf: number; weth: number; eth: number; rfWei: bigint; wethWei: bigint; ethWei: bigint };
  block: bigint;
};

export async function readFriend(ref: FriendRef): Promise<FriendState> {
  const addr = CONTRACTS[ref.collection];
  const block = await client.getBlockNumber({ cacheTime: 0 });
  const calls = [
    { address: addr, abi: NFT_ABI, functionName: "ownerOf", args: [ref.id] },
    { address: CONTRACTS.ActivationManager, abi: AM_ABI, functionName: "positions", args: [addr, ref.id] },
    { address: CONTRACTS.ActivationManager, abi: AM_ABI, functionName: "earned", args: [CONTRACTS.RF, addr, ref.id] },
    { address: CONTRACTS.ActivationManager, abi: AM_ABI, functionName: "earned", args: [CONTRACTS.WETH, addr, ref.id] },
    { address: addr, abi: NFT_ABI, functionName: "tokenBoundAccount", args: [ref.id] },
    ...(ref.collection === "Generations" ? [{ address: addr, abi: NFT_ABI, functionName: "generation", args: [ref.id] }] : []),
  ] as const;
  const r = await client.multicall({ contracts: calls as never, blockNumber: block, allowFailure: true });
  const ok = <T,>(i: number, what: string): T => {
    const x = r[i] as { status: string; result?: unknown };
    if (x?.status !== "success") throw new Error(`chain read failed: ${what} ${serialOf(ref)}`);
    return x.result as T;
  };
  const soft = <T,>(i: number, fb: T): T => ((r[i] as { status: string })?.status === "success" ? ((r[i] as { result: T }).result) : fb);
  const owner = getAddress(ok<Address>(0, "ownerOf"));
  const [tier, weight] = ok<readonly [number, bigint]>(1, "positions");
  const generation = ref.collection === "Generations" ? Number(soft<number>(5, 0)) : 0;
  // rarefriends.com's rule: a Genesis is always hardwired, a Generations Friend once its generation is set; a Friend is
  // activated only while hardwired with reward weight above zero. `earned` reverts on a temporary Friend.
  const hardwired = ref.collection === "Genesis" || generation > 0;
  const activated = hardwired && weight > 0n;
  const claimRfWei = soft<bigint>(2, 0n);
  const claimWethWei = soft<bigint>(3, 0n);
  const tba = soft<Address | null>(4, null);
  const wallet = tba && hardwired ? getAddress(tba) : null;
  let bag = { rf: 0, weth: 0, eth: 0, rfWei: 0n, wethWei: 0n, ethWei: 0n };
  if (wallet) {
    const b = await client.multicall({
      blockNumber: block,
      allowFailure: true,
      contracts: [
        { address: CONTRACTS.RF, abi: ERC20_ABI, functionName: "balanceOf", args: [wallet] },
        { address: CONTRACTS.WETH, abi: ERC20_ABI, functionName: "balanceOf", args: [wallet] },
        { address: CONTRACTS.Multicall3, abi: MULTICALL_ABI, functionName: "getEthBalance", args: [wallet] },
      ],
    });
    const v = (i: number) => (b[i].status === "success" ? (b[i].result as bigint) : 0n);
    bag = { rfWei: v(0), wethWei: v(1), ethWei: v(2), rf: units(v(0)), weth: units(v(1)), eth: units(v(2)) };
  }
  return {
    ref,
    serial: serialOf(ref),
    title: friendTitle(ref, generation),
    owner,
    generation,
    tier: activated ? Number(tier) : 0,
    weight: activated ? units(weight) : 0,
    hardwired,
    activated,
    claimRf: units(claimRfWei),
    claimWeth: units(claimWethWei),
    claimRfWei,
    claimWethWei,
    wallet,
    bag,
    block,
  };
}

// ===== protocol snapshot: prices, total weight, the live reward streams =====

type Stream = { asset: "RF" | "WETH"; end: number; budget: number; pending: number; remaining: number };
export type Snapshot = { ethUsd: number; rfUsd: number; totalWeight: number; streams: Stream[] };
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

let snapCache: { at: number; snap: Snapshot } | null = null;
export async function readSnapshot(): Promise<Snapshot | null> {
  if (snapCache && Date.now() - snapCache.at < 60_000) return snapCache.snap;
  try {
    const res = await fetch(SNAPSHOT_API, { headers: { "User-Agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(6_000), cache: "no-store" });
    if (!res.ok) return snapCache?.snap ?? null;
    const j = (await res.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const { ethUsd, rfUsd } = j?.prices ?? {};
    const { genesisWeight, generationsWeight } = j?.metrics ?? {};
    // Prices can be empty (seen 2026-09-30): the token amounts still stand, USD figures are then hidden.
    if (![genesisWeight, generationsWeight].every(finite) || !Array.isArray(j.streams)) return snapCache?.snap ?? null;
    const streams: Stream[] = j.streams
      .filter((s: any) => (s?.asset === "RF" || s?.asset === "WETH") && [s.end, s.budget, s.pending, s.remaining].every(finite)) // eslint-disable-line @typescript-eslint/no-explicit-any
      .map((s: any) => ({ asset: s.asset, end: s.end, budget: s.budget, pending: s.pending, remaining: s.remaining })); // eslint-disable-line @typescript-eslint/no-explicit-any
    const snap = { ethUsd: finite(ethUsd) ? ethUsd : 0, rfUsd: finite(rfUsd) ? rfUsd : 0, totalWeight: genesisWeight + generationsWeight, streams };
    snapCache = { at: Date.now(), snap };
    return snap;
  } catch {
    return snapCache?.snap ?? null;
  }
}

/** rarefriends.com's "Pending" (getRewardOutlook): (remaining + pending) of each stream × this Friend's share of weight. */
export function pendingFor(f: FriendState, s: Snapshot | null) {
  if (!s || !(s.totalWeight > 0) || !f.activated) return { rf: 0, weth: 0, usd: 0 };
  const share = Math.min(1, f.weight / s.totalWeight);
  const sum = (asset: "RF" | "WETH") => s.streams.filter((x) => x.asset === asset).reduce((a, x) => a + (Math.max(0, x.remaining) + x.pending) * share, 0);
  const rf = sum("RF");
  const weth = sum("WETH");
  return { rf, weth, usd: rf * s.rfUsd + weth * s.ethUsd };
}

// ===== a wallet's Friends =====

export async function readOwned(address: Address): Promise<FriendRef[]> {
  const res = await fetch(`${OWNED_API}?address=${address}`, { headers: { "User-Agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(8_000), cache: "no-store" });
  if (!res.ok) throw new Error(`owned-nfts answered ${res.status}`);
  const j = (await res.json()) as { nfts?: { collection?: string; id?: string }[] };
  if (!Array.isArray(j?.nfts)) throw new Error("owned-nfts: unexpected shape");
  return j.nfts
    .filter((n) => (n.collection === "Genesis" || n.collection === "Generations") && typeof n.id === "string" && /^[1-9][0-9]{0,9}$/.test(n.id))
    .map((n) => ({ collection: n.collection as Collection, id: BigInt(n.id!) }));
}

/** Activated Friends a wallet holds, read in one multicall (positions + generation). */
export async function activatedFriends(address: Address): Promise<{ ref: FriendRef; generation: number }[]> {
  const owned = (await readOwned(address)).slice(0, 300);
  if (!owned.length) return [];
  const calls = owned.flatMap((o) => [
    { address: CONTRACTS.ActivationManager, abi: AM_ABI, functionName: "positions", args: [CONTRACTS[o.collection], o.id] },
    o.collection === "Generations"
      ? { address: CONTRACTS[o.collection], abi: NFT_ABI, functionName: "generation", args: [o.id] }
      : { address: CONTRACTS.Multicall3, abi: MULTICALL_ABI, functionName: "getEthBalance", args: [CONTRACTS.Multicall3] },
  ]);
  const r = await client.multicall({ contracts: calls as never, allowFailure: true });
  const out: { ref: FriendRef; generation: number }[] = [];
  owned.forEach((o, i) => {
    const pos = r[i * 2] as { status: string; result?: readonly [number, bigint] };
    const gen = r[i * 2 + 1] as { status: string; result?: number };
    const generation = o.collection === "Generations" && gen.status === "success" ? Number(gen.result) : 0;
    const hardwired = o.collection === "Genesis" || generation > 0;
    if (pos.status === "success" && hardwired && pos.result![1] > 0n) out.push({ ref: o, generation });
  });
  return out;
}

// ===== artwork =====

const IMG_MAX = 256 * 1024;
function decodeTokenUri(uri: unknown): string | undefined {
  if (typeof uri !== "string") return undefined;
  const m = /^data:application\/json(;base64)?,(.*)$/s.exec(uri);
  if (!m) return undefined;
  try {
    const text = m[1] ? Buffer.from(m[2], "base64").toString("utf8") : decodeURIComponent(m[2]);
    const image = (JSON.parse(text) as { image?: unknown })?.image;
    return typeof image === "string" && image.length <= IMG_MAX && /^data:image\/(svg\+xml|png)[;,]/i.test(image) ? image : undefined;
  } catch {
    return undefined;
  }
}

/** The Friend's own on-chain portrait (a data: SVG or PNG), else rarefriends.com's nft-image route. */
export async function friendArtwork(ref: FriendRef): Promise<string | undefined> {
  try {
    const uri = await client.readContract({ address: CONTRACTS[ref.collection], abi: NFT_ABI, functionName: "tokenURI", args: [ref.id] });
    const image = decodeTokenUri(uri);
    if (image) return image;
  } catch {
    // fall through
  }
  try {
    const res = await fetch(`${ARTWORK_API}?id=${ref.id}&collection=${ref.collection}&format=json`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6_000) });
    const j = (await res.json()) as { image?: unknown };
    return typeof j.image === "string" && /^data:image\/(svg\+xml|png)[;,]/i.test(j.image) ? j.image : undefined;
  } catch {
    return undefined;
  }
}

export function dataUriBytes(uri: string): Buffer {
  const comma = uri.indexOf(",");
  const meta = uri.slice(0, comma);
  const body = uri.slice(comma + 1);
  return /;base64$/i.test(meta) ? Buffer.from(body, "base64") : Buffer.from(decodeURIComponent(body), "utf8");
}
