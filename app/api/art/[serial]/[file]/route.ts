import type { NextRequest } from "next/server";
import { bannerPng, portraitPng } from "@/lib/art";
import { parseSerial } from "@/lib/chain";

export const dynamic = "force-dynamic";

// Public pass art (Google fetches images by URL). The portrait is the Friend's on-chain tokenURI image: public data.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ serial: string; file: string }> }) {
  const { serial, file } = await params;
  const ref = parseSerial(serial);
  if (!ref) return new Response("not found", { status: 404 });
  let png: Buffer;
  if (file === "hero.png") png = await bannerPng(ref, 1032 * 2, 336 * 2);
  else if (file === "logo.png") png = await portraitPng(ref, 660);
  else if (file === "portrait.png") png = await portraitPng(ref, 512);
  else if (file === "strip.png") png = await bannerPng(ref, 1125, 432);
  else return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600, s-maxage=86400" } });
}
