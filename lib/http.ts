import { NextResponse, type NextRequest } from "next/server";
import { getAddress, isAddress, type Address } from "viem";
import { parseSerial, readFriend, type FriendRef, type FriendState } from "./chain";
import { passTokenValid } from "./secure";

export const fail = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
export const ok = (body: unknown, init: ResponseInit = {}) =>
  NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers as Record<string, string>) } });

/** The site's own host, as the browser saw it: the SIWE `domain` and `uri` come from here. */
export function siteOf(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return { domain: host, uri: `${proto}://${host}` };
}

export function addressOf(v: unknown): Address | null {
  return typeof v === "string" && isAddress(v) ? getAddress(v) : null;
}

/**
 * A pass capability, checked against a FRESH ownerOf read: the token is bound to (serial, owner), so it fails closed
 * the moment the Friend changes hands.
 */
export async function authorizePass(serial: string, token: string | null | undefined): Promise<{ ref: FriendRef; friend: FriendState } | { error: string; status: number }> {
  const ref = parseSerial(serial);
  if (!ref) return { error: "unknown pass", status: 404 };
  let friend: FriendState;
  try {
    friend = await readFriend(ref);
  } catch {
    return { error: "Robinhood Chain did not answer, try again", status: 503 };
  }
  if (!passTokenValid(serial, friend.owner, token)) return { error: "this pass link is not valid for the Friend's current owner", status: 401 };
  return { ref, friend };
}
