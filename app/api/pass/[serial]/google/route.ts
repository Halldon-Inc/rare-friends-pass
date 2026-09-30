import { NextResponse, type NextRequest } from "next/server";
import { readSnapshot } from "@/lib/chain";
import { googleConfigured, googleSaveUrl } from "@/lib/google";
import { authorizePass, fail } from "@/lib/http";
import { lastSeen, markGoogle, markSeen } from "@/lib/store";
import { viewOf } from "@/lib/view";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest, { params }: { params: Promise<{ serial: string }> }) {
  const { serial } = await params;
  if (!googleConfigured()) return fail(503, "Google Wallet is not configured on this deployment");
  const auth = await authorizePass(serial, req.nextUrl.searchParams.get("t"));
  if ("error" in auth) return fail(auth.status, auth.error);
  const v = viewOf(auth.friend, await readSnapshot());
  let url: string;
  try {
    url = await googleSaveUrl(v);
  } catch (e) {
    return fail(502, `Google Wallet refused the pass: ${String(e).slice(0, 200)}`);
  }
  await markGoogle(serial).catch(() => {});
  if (!(await lastSeen(serial).catch(() => null))) await markSeen(serial, v.hash).catch(() => {});
  if (req.nextUrl.searchParams.get("format") === "json") return NextResponse.json({ url }, { headers: { "Cache-Control": "no-store" } });
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
}
