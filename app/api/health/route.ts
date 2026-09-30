import { appleConfigured } from "@/lib/apple";
import { client } from "@/lib/chain";
import { googleClassStatus, googleConfigured } from "@/lib/google";
import { ok } from "@/lib/http";
import { relayerAccount } from "@/lib/relayer";

export const dynamic = "force-dynamic";

export async function GET() {
  const relayer = relayerAccount();
  const [block, balance, google] = await Promise.all([
    client.getBlockNumber().then(String, () => null),
    relayer ? client.getBalance({ address: relayer.address }).then((b) => String(Number(b) / 1e18), () => null) : null,
    googleConfigured() ? googleClassStatus().catch((e) => ({ error: String(e).slice(0, 160) })) : null,
  ]);
  return ok({
    ok: !!block,
    block,
    apple: appleConfigured(),
    google,
    relayer: relayer ? { address: relayer.address, ethBalance: balance, funded: Number(balance) > 0 } : null,
    blobStore: !!process.env.BLOB_READ_WRITE_TOKEN,
  });
}
