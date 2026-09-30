import { createHash } from "node:crypto";
import { type Address } from "viem";
import { pendingFor, readFriend, readSnapshot, SITE, type FriendRef, type FriendState, type Snapshot } from "./chain";
import { passToken } from "./secure";

export function baseUrl() {
  const env = process.env.PUBLIC_BASE_URL?.trim() || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return (env || "http://localhost:3000").replace(/\/$/, "");
}

const group = (v: number, d: number) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
/** RF reads whole below a million and compact above; the wallet has room for about nine characters. */
export const fmtRf = (v: number) => (v >= 1e6 ? `${group(v / 1e6, 2)}M` : v >= 100 ? group(v, 0) : v > 0 ? group(v, 2) : "0");
export const fmtEth = (v: number) => (v >= 1 ? group(v, 3) : v >= 0.0001 ? group(v, 5) : v > 0 ? "<0.0001" : "0");
export const fmtUsd = (v: number) => `$${group(v, v >= 100 ? 0 : 2)}`;

export type PassView = {
  serial: string;
  title: string;
  ref: FriendRef;
  owner: Address;
  status: string;
  activated: boolean;
  tier: number;
  claim: { rf: number; weth: number; usd: number; rfText: string; wethText: string };
  pending: { rf: number; weth: number; usd: number; rfText: string; wethText: string };
  bag: { rf: number; weth: number; eth: number; usd: number; rfText: string; wethText: string; ethText: string; empty: boolean; wei: { rf: string; weth: string; eth: string } };
  wallet: Address | null;
  pricesKnown: boolean;
  block: string;
  links: { page: string; claim: string; withdraw: string; rarefriends: string };
  /** Changes only when something worth a lock-screen update changed. */
  hash: string;
};

/** log-bucket: moves once a value grows or shrinks by about 2%, so steady reward drip does not push every minute. */
const bucket = (v: number) => (v > 0 ? Math.floor(Math.log(v) / Math.log(1.02)) : -1);

export function viewOf(f: FriendState, s: Snapshot | null): PassView {
  const token = passToken(f.serial, f.owner);
  const base = baseUrl();
  const page = `${base}/f/${f.serial}?t=${token}`;
  const pend = pendingFor(f, s);
  const rfUsd = s?.rfUsd ?? 0;
  const ethUsd = s?.ethUsd ?? 0;
  const bagUsd = f.bag.rf * rfUsd + (f.bag.weth + f.bag.eth) * ethUsd;
  const status = f.activated ? (f.ref.collection === "Genesis" ? "Earning" : `Earning · tier ${f.tier}`) : f.hardwired ? "Not activated" : "Temporary";
  const hash = createHash("sha256")
    .update([f.owner, status, bucket(f.claimRf), bucket(f.claimWeth), f.bag.rfWei, f.bag.wethWei, f.bag.ethWei].join("|"))
    .digest("hex")
    .slice(0, 16);
  return {
    serial: f.serial,
    title: f.title,
    ref: f.ref,
    owner: f.owner,
    status,
    activated: f.activated,
    tier: f.tier,
    claim: { rf: f.claimRf, weth: f.claimWeth, usd: f.claimRf * rfUsd + f.claimWeth * ethUsd, rfText: fmtRf(f.claimRf), wethText: fmtEth(f.claimWeth) },
    pending: { ...pend, rfText: fmtRf(pend.rf), wethText: fmtEth(pend.weth) },
    bag: {
      rf: f.bag.rf,
      weth: f.bag.weth,
      eth: f.bag.eth,
      usd: bagUsd,
      rfText: fmtRf(f.bag.rf),
      wethText: fmtEth(f.bag.weth),
      ethText: fmtEth(f.bag.eth),
      empty: f.bag.rfWei === 0n && f.bag.wethWei === 0n && f.bag.ethWei === 0n,
      wei: { rf: String(f.bag.rfWei), weth: String(f.bag.wethWei), eth: String(f.bag.ethWei) },
    },
    wallet: f.wallet,
    pricesKnown: rfUsd > 0 && ethUsd > 0,
    block: String(f.block),
    links: { page, claim: `${page}&do=claim`, withdraw: `${page}&do=withdraw`, rarefriends: `${SITE}/portfolio` },
    hash,
  };
}

export async function loadView(ref: FriendRef): Promise<PassView> {
  const [f, s] = await Promise.all([readFriend(ref), readSnapshot()]);
  return viewOf(f, s);
}
