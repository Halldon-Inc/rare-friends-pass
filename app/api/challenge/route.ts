import type { NextRequest } from "next/server";
import { activatedFriends, friendTitle, serialOf } from "@/lib/chain";
import { addressOf, fail, ok, siteOf } from "@/lib/http";
import { buildChallenge } from "@/lib/secure";

export const dynamic = "force-dynamic";

// Step 1 of the only signature a holder makes: list the wallet's ACTIVATED Friends and hand back one ERC-4361
// message that names every one of them.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const address = addressOf(body?.address);
  if (!address) return fail(400, "a valid wallet address is required");
  let found;
  try {
    found = await activatedFriends(address);
  } catch {
    return fail(503, "could not read this wallet's Friends from rarefriends.com and Robinhood Chain, try again");
  }
  if (!found.length) return fail(404, "no activated Friends in this wallet", { address });
  const { domain, uri } = siteOf(req);
  const message = buildChallenge({ domain, uri, address, refs: found.map((f) => f.ref) });
  return ok({ address, message, friends: found.map((f) => ({ serial: serialOf(f.ref), title: friendTitle(f.ref, f.generation) })) });
}
