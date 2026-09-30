import { createHmac, timingSafeEqual } from "node:crypto";
import { getAddress, type Address } from "viem";
import { createSiweMessage, parseSiweMessage } from "viem/siwe";
import { CHAIN_ID, CONTRACTS, type FriendRef } from "./chain";

// Every capability here is an HMAC under PASS_SECRET, so the server keeps no session table:
//   - the PASS token binds (serial, owner). It is the Apple authenticationToken and rides the pass's action links.
//     When the Friend changes hands the owner no longer matches, so every link the old owner holds dies at once
//     (ERC-8426's rotation rule, enforced by a fresh ownerOf read rather than a stored secret).
//   - the SESSION token binds (address, expiry): it lets a phone open the pass list after the wallet signed elsewhere.
//   - the challenge NONCE binds (address, issuedAt), so a signed challenge can be checked without storing it.

function secret() {
  const s = process.env.PASS_SECRET;
  if (!s || s.length < 32) throw new Error("PASS_SECRET is not configured");
  return s;
}
const mac = (label: string, data: string) => createHmac("sha256", secret()).update(`${label}|${data}`).digest("base64url");
function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function passToken(serial: string, owner: Address) {
  return mac("pass", `${serial}|${getAddress(owner)}`).slice(0, 32);
}
export function passTokenValid(serial: string, owner: Address, token: string | null | undefined) {
  return !!token && same(passToken(serial, owner), token);
}

const SESSION_TTL_S = 30 * 60;
export function sessionToken(address: Address, now = Date.now()) {
  const exp = Math.floor(now / 1000) + SESSION_TTL_S;
  const body = `${getAddress(address)}.${exp}`;
  return `${body}.${mac("session", body).slice(0, 32)}`;
}
export function readSession(token: string | null | undefined, now = Date.now()): Address | null {
  const m = /^(0x[0-9a-fA-F]{40})\.(\d{10})\.([A-Za-z0-9_-]{32})$/.exec(token ?? "");
  if (!m) return null;
  if (Number(m[2]) < now / 1000) return null;
  if (!same(mac("session", `${m[1]}.${m[2]}`).slice(0, 32), m[3])) return null;
  return getAddress(m[1]);
}

// ===== ERC-4361 challenge, in the shape ERC-8426's gated configuration uses =====
// One signature covers every activated Friend the wallet holds: each is a CAIP-19 resource, and the action is
// `urn:wallet-pass:action:acquire`. It is the ONLY signature a holder ever makes here.

const CHALLENGE_TTL_MS = 10 * 60_000;
export const assetId = (ref: FriendRef) => `eip155:${CHAIN_ID}/erc721:${getAddress(CONTRACTS[ref.collection])}/${ref.id}`;

export function buildChallenge(opts: { domain: string; uri: string; address: Address; refs: FriendRef[]; now?: number }) {
  const issuedAt = new Date(opts.now ?? Date.now());
  const nonce = mac("nonce", `${getAddress(opts.address)}|${issuedAt.toISOString()}`).replace(/[^A-Za-z0-9]/g, "").slice(0, 24);
  const n = opts.refs.length;
  return createSiweMessage({
    domain: opts.domain,
    address: getAddress(opts.address),
    statement: `Authorize the acquire action for ${n} Rare Friends wallet pass${n === 1 ? "" : "es"} on ${opts.domain}. This signature costs nothing and moves nothing.`,
    uri: opts.uri,
    version: "1",
    chainId: CHAIN_ID,
    nonce,
    issuedAt,
    expirationTime: new Date(issuedAt.getTime() + CHALLENGE_TTL_MS),
    resources: [...opts.refs.map(assetId), "urn:wallet-pass:action:acquire"],
  });
}

/** Checks everything the server itself put in the message. The signature is checked by the caller (it may need the chain for a smart account). */
export function checkChallenge(message: string, domain: string, now = Date.now()) {
  const p = parseSiweMessage(message);
  if (!p.address || !p.nonce || !p.issuedAt || !p.expirationTime) return { ok: false as const, error: "malformed challenge" };
  if (p.domain !== domain) return { ok: false as const, error: "challenge was issued for another site" };
  if (p.chainId !== CHAIN_ID) return { ok: false as const, error: "wrong chain in challenge" };
  if (p.expirationTime.getTime() < now) return { ok: false as const, error: "challenge expired, sign again" };
  const expect = mac("nonce", `${getAddress(p.address)}|${p.issuedAt.toISOString()}`).replace(/[^A-Za-z0-9]/g, "").slice(0, 24);
  if (!same(expect, p.nonce)) return { ok: false as const, error: "challenge was not issued here" };
  if (!p.resources?.includes("urn:wallet-pass:action:acquire")) return { ok: false as const, error: "challenge names no action" };
  return { ok: true as const, address: getAddress(p.address) };
}
