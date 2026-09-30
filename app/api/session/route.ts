import type { NextRequest } from "next/server";
import type { Hex } from "viem";
import { client } from "@/lib/chain";
import { fail, ok, siteOf } from "@/lib/http";
import { checkChallenge, sessionToken } from "@/lib/secure";

export const dynamic = "force-dynamic";

// Step 2: the signed challenge becomes a 30-minute session that lists the wallet's passes (on this device, or on a
// phone through the QR code). viem's verifyMessage covers plain EOAs and smart accounts (ERC-1271 / ERC-6492).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message : "";
  const signature = typeof body?.signature === "string" && /^0x[0-9a-fA-F]+$/.test(body.signature) ? (body.signature as Hex) : null;
  if (!message || !signature) return fail(400, "message and signature are required");
  const checked = checkChallenge(message, siteOf(req).domain);
  if (!checked.ok) return fail(401, checked.error);
  let valid = false;
  try {
    valid = await client.verifyMessage({ address: checked.address, message, signature });
  } catch {
    valid = false;
  }
  if (!valid) return fail(401, "signature does not match the wallet");
  return ok({ address: checked.address, session: sessionToken(checked.address) });
}
