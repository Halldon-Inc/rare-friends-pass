import type { NextRequest } from "next/server";
import { authorizePass, fail, ok } from "@/lib/http";
import { refreshSerial } from "@/lib/refresh";
import { claimCalls, relayClaim } from "@/lib/relayer";
import { lastClaim, markClaim } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COOLDOWN_S = 120;

// The pass's Claim link lands here. Only a valid pass token for the Friend's CURRENT owner can ask, at most once per
// COOLDOWN_S per Friend, and only when there is something to claim. If the relayer cannot pay gas, the page gets the
// exact calls back so the holder can send them from any wallet (claimBatch is permissionless, destination is fixed).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const serial = typeof body?.serial === "string" ? body.serial : "";
  const auth = await authorizePass(serial, typeof body?.t === "string" ? body.t : null);
  if ("error" in auth) return fail(auth.status, auth.error);
  const calls = claimCalls(auth.friend);
  if (!calls.length) return ok({ status: "nothing" });
  const since = Math.floor(Date.now() / 1000) - (await lastClaim(serial).catch(() => 0));
  if (since < COOLDOWN_S) return fail(429, `a claim for this Friend was sent ${since}s ago; try again in ${COOLDOWN_S - since}s`);
  let result;
  try {
    result = await relayClaim(auth.friend);
  } catch (e) {
    result = { status: "unavailable" as const, reason: String((e as Error)?.message ?? e).split("\n")[0].slice(0, 160) };
  }
  if (result.status === "sent") {
    await markClaim(serial).catch(() => {});
    const refreshed = await refreshSerial(serial, { force: true }).catch(() => null);
    return ok({ ...result, refreshed });
  }
  return ok({ ...result, calls });
}
