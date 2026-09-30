import type { NextRequest } from "next/server";
import { passTypeId } from "@/lib/apple";
import { lastSeen, serialsForDevice } from "@/lib/store";

export const dynamic = "force-dynamic";

// Which of this device's passes changed since `passesUpdatedSince` (our tag is the unix second of the last push).
export async function GET(req: NextRequest, { params }: { params: Promise<{ device: string; passType: string }> }) {
  const { device, passType } = await params;
  if (passType !== passTypeId()) return new Response(null, { status: 404 });
  const since = Number(req.nextUrl.searchParams.get("passesUpdatedSince") ?? 0) || 0;
  const serials = await serialsForDevice(device);
  if (!serials.length) return new Response(null, { status: 204 });
  const seen = await Promise.all(serials.map(async (s) => ({ s, at: (await lastSeen(s))?.at ?? 0 })));
  const changed = seen.filter((x) => x.at > since || since === 0);
  if (!changed.length) return new Response(null, { status: 204 });
  const tag = Math.max(...seen.map((x) => x.at), Math.floor(Date.now() / 1000));
  return Response.json({ serialNumbers: changed.map((x) => x.s), lastUpdated: String(tag) });
}
