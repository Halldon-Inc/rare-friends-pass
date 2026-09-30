import type { NextRequest } from "next/server";
import { appleConfigured, buildPkpass } from "@/lib/apple";
import { readSnapshot } from "@/lib/chain";
import { authorizePass, fail } from "@/lib/http";
import { lastSeen, markSeen } from "@/lib/store";
import { viewOf } from "@/lib/view";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest, { params }: { params: Promise<{ serial: string }> }) {
  const { serial } = await params;
  if (!appleConfigured()) return fail(503, "Apple Wallet is not configured on this deployment");
  const t = req.nextUrl.searchParams.get("t");
  const auth = await authorizePass(serial, t);
  if ("error" in auth) return fail(auth.status, auth.error);
  const v = viewOf(auth.friend, await readSnapshot());
  const pkpass = await buildPkpass(v, t!);
  if (!(await lastSeen(serial).catch(() => null))) await markSeen(serial, v.hash).catch(() => {});
  return new Response(new Uint8Array(pkpass), {
    headers: {
      "Content-Type": "application/vnd.apple.pkpass",
      "Content-Disposition": `attachment; filename="rare-friends-${serial}.pkpass"`,
      "Cache-Control": "no-store",
    },
  });
}
