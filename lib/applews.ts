import type { NextRequest } from "next/server";
import { passTypeId } from "./apple";
import { authorizePass } from "./http";

/** Apple web service auth: `Authorization: ApplePass <token>`, the pass token, checked against the current owner. */
export async function appleAuth(req: NextRequest, passType: string, serial: string) {
  if (passType !== passTypeId()) return { status: 404 as const };
  const m = /^ApplePass\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!m) return { status: 401 as const };
  const auth = await authorizePass(serial, m[1]);
  if ("error" in auth) return { status: auth.status === 503 ? (503 as const) : (401 as const) };
  return { status: 200 as const, token: m[1], friend: auth.friend };
}
