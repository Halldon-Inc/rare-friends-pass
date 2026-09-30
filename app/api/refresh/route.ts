import type { NextRequest } from "next/server";
import { authorizePass, fail, ok } from "@/lib/http";
import { refreshSerial } from "@/lib/refresh";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// After a withdraw (or a wallet-sent claim) confirms, the page asks for an immediate pass update.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const serial = typeof body?.serial === "string" ? body.serial : "";
  const auth = await authorizePass(serial, typeof body?.t === "string" ? body.t : null);
  if ("error" in auth) return fail(auth.status, auth.error);
  return ok(await refreshSerial(serial, { force: true }));
}
