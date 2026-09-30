import type { NextRequest } from "next/server";
import { appleAuth } from "@/lib/applews";
import { registerDevice, unregisterDevice } from "@/lib/store";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ device: string; passType: string; serial: string }> };

export async function POST(req: NextRequest, { params }: P) {
  const { device, passType, serial } = await params;
  const auth = await appleAuth(req, passType, serial);
  if (auth.status !== 200) return new Response(null, { status: auth.status });
  const body = (await req.json().catch(() => null)) as { pushToken?: unknown } | null;
  if (typeof body?.pushToken !== "string" || !/^[0-9a-fA-F]{32,200}$/.test(body.pushToken)) return new Response(null, { status: 400 });
  const had = await registerDevice(serial, device, body.pushToken);
  return new Response(null, { status: had ? 200 : 201 });
}

export async function DELETE(req: NextRequest, { params }: P) {
  const { device, passType, serial } = await params;
  const auth = await appleAuth(req, passType, serial);
  // A sold Friend's old pass must still be able to unregister, so a stale token is accepted here.
  if (auth.status === 404) return new Response(null, { status: 404 });
  if (!/^ApplePass\s+\S+$/i.test(req.headers.get("authorization") ?? "")) return new Response(null, { status: 401 });
  await unregisterDevice(serial, device);
  return new Response(null, { status: 200 });
}
