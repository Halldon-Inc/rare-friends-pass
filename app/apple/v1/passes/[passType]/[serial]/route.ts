import type { NextRequest } from "next/server";
import { buildPkpass } from "@/lib/apple";
import { appleAuth } from "@/lib/applews";
import { readSnapshot } from "@/lib/chain";
import { viewOf } from "@/lib/view";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// The device fetching the latest version of a pass (after a push, or a pull-to-refresh on the pass).
export async function GET(req: NextRequest, { params }: { params: Promise<{ passType: string; serial: string }> }) {
  const { passType, serial } = await params;
  const auth = await appleAuth(req, passType, serial);
  if (auth.status !== 200) return new Response(null, { status: auth.status });
  const v = viewOf(auth.friend, await readSnapshot());
  const pkpass = await buildPkpass(v, auth.token);
  return new Response(new Uint8Array(pkpass), {
    headers: { "Content-Type": "application/vnd.apple.pkpass", "Last-Modified": new Date().toUTCString(), "Cache-Control": "no-store" },
  });
}
