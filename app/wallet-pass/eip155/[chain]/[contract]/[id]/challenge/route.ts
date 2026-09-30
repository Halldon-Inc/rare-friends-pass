import type { NextRequest } from "next/server";
import { addressOf, fail, ok, siteOf } from "@/lib/http";
import { refFromPath } from "@/lib/manifest";
import { buildChallenge } from "@/lib/secure";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ chain: string; contract: string; id: string }> }) {
  const p = await params;
  const ref = refFromPath(p.chain, p.contract, p.id);
  if (!ref) return fail(404, "not a Rare Friend on Robinhood Chain");
  const address = addressOf(req.nextUrl.searchParams.get("address"));
  if (!address) return fail(400, "address is required");
  const { domain, uri } = siteOf(req);
  return ok({ message: buildChallenge({ domain, uri, address, refs: [ref] }) });
}
