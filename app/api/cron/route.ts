import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/http";
import { refreshSerial } from "@/lib/refresh";
import { trackedSerials } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Walks every installed pass and pushes the ones whose numbers moved (see PassView.hash for what counts as moved).
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return fail(401, "unauthorized");
  const serials = await trackedSerials();
  const results = [];
  for (let i = 0; i < serials.length; i += 6) {
    results.push(...(await Promise.all(serials.slice(i, i + 6).map((s) => refreshSerial(s).catch((e) => ({ serial: s, error: String(e).slice(0, 120) }))))));
  }
  return ok({ tracked: serials.length, changed: results.filter((r) => "changed" in r && r.changed).length, results });
}
