import type { NextRequest } from "next/server";
import { parseSerial } from "@/lib/chain";
import { fail, ok } from "@/lib/http";
import { loadView } from "@/lib/view";

export const dynamic = "force-dynamic";

// Public live numbers for one Friend (everything here is readable on chain). Capability links are never returned.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ serial: string }> }) {
  const ref = parseSerial((await params).serial);
  if (!ref) return fail(404, "unknown Friend");
  try {
    const v = await loadView(ref);
    const { links: _links, hash: _hash, ...pub } = v; // eslint-disable-line @typescript-eslint/no-unused-vars
    return ok({ ...pub, ref: { collection: ref.collection, id: String(ref.id) } });
  } catch {
    return fail(503, "Robinhood Chain did not answer, try again");
  }
}
