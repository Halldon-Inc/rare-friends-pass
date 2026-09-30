import type { NextRequest } from "next/server";
import type { Hex } from "viem";
import { client, readFriend, serialOf } from "@/lib/chain";
import { fail, ok, siteOf } from "@/lib/http";
import { refFromPath } from "@/lib/manifest";
import { assetId, checkChallenge, passToken } from "@/lib/secure";

export const dynamic = "force-dynamic";

// ERC-8426 (Wallet Pass Extension) manifest for a Rare Friend, in the GATED configuration: the Rare Friends contracts
// predate the standard and expose no passURI, so this resolver serves the manifest at the URI a passURI would return
// (<site>/wallet-pass/eip155/4663/<contract>/<tokenId>). Unauthenticated: 401 proof_required, never an acquisition URL.
// Authenticated (ERC-4361 challenge signed by the current owner): the manifest, uncacheable.
export async function GET(req: NextRequest, { params }: { params: Promise<{ chain: string; contract: string; id: string }> }) {
  const p = await params;
  const ref = refFromPath(p.chain, p.contract, p.id);
  if (!ref) return fail(404, "not a Rare Friend on Robinhood Chain");
  const { domain, uri } = siteOf(req);
  const here = `${uri}/wallet-pass/eip155/${p.chain}/${p.contract}/${p.id}`;
  const proof = req.headers.get("x-wallet-pass-proof");
  const signature = req.headers.get("x-wallet-pass-signature");
  if (!proof || !signature) return fail(401, "proof_required", { challenge: `${here}/challenge?address=<owner>` });
  let message = "";
  try {
    message = Buffer.from(proof, "base64url").toString("utf8");
  } catch {
    return fail(400, "malformed proof");
  }
  const checked = checkChallenge(message, domain);
  if (!checked.ok) return fail(401, checked.error);
  if (!message.includes(assetId(ref))) return fail(401, "proof does not name this token");
  const valid = await client.verifyMessage({ address: checked.address, message, signature: signature as Hex }).catch(() => false);
  if (!valid) return fail(401, "bad signature");
  const friend = await readFriend(ref).catch(() => null);
  if (!friend) return fail(503, "chain unavailable");
  if (friend.owner !== checked.address) return fail(403, "not the owner");
  const serial = serialOf(ref);
  const t = passToken(serial, friend.owner);
  return ok({
    formats: { apple: `${uri}/api/pass/${serial}/apple?t=${t}`, google: `${uri}/api/pass/${serial}/google?t=${t}` },
    updatedAt: Math.floor(Date.now() / 1000),
  });
}
