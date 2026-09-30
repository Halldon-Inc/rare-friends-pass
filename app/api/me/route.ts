import type { NextRequest } from "next/server";
import { activatedFriends } from "@/lib/chain";
import { fail, ok } from "@/lib/http";
import { readSession } from "@/lib/secure";
import { loadView } from "@/lib/view";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// The signed-in wallet's passes: one per activated Friend, with capability links to add it to Apple or Google Wallet.
export async function GET(req: NextRequest) {
  const address = readSession(req.nextUrl.searchParams.get("s"));
  if (!address) return fail(401, "session expired, sign in again");
  const found = await activatedFriends(address).catch(() => null);
  if (!found) return fail(503, "could not read this wallet's Friends, try again");
  const views = await Promise.all(found.slice(0, 24).map((f) => loadView(f.ref).catch(() => null)));
  const passes = views
    .filter((v): v is NonNullable<typeof v> => !!v && v.owner === address)
    .map((v) => {
      const t = new URL(v.links.page).searchParams.get("t");
      return {
        serial: v.serial,
        title: v.title,
        status: v.status,
        claim: v.claim,
        pending: v.pending,
        bag: v.bag,
        pricesKnown: v.pricesKnown,
        apple: `/api/pass/${v.serial}/apple?t=${t}`,
        google: `/api/pass/${v.serial}/google?t=${t}`,
        page: `/f/${v.serial}?t=${t}`,
      };
    });
  return ok({ address, passes, more: Math.max(0, found.length - 24) });
}
