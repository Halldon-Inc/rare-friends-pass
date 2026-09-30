import { appleConfigured, pushApple } from "./apple";
import { parseSerial } from "./chain";
import { googleConfigured, upsertGoogle } from "./google";
import { hasGoogle, lastSeen, markSeen, pushTokensFor } from "./store";
import { loadView, type PassView } from "./view";

// Bring every installed copy of one pass up to date: PATCH the Google object and push the Apple devices, which then
// fetch the fresh .pkpass. `force` skips the "did anything worth a push change" check (after a claim or withdraw).

export async function refreshSerial(serial: string, opts: { force?: boolean; view?: PassView } = {}) {
  const ref = parseSerial(serial);
  if (!ref) return { serial, skipped: "bad serial" };
  const v = opts.view ?? (await loadView(ref));
  const seen = await lastSeen(serial);
  if (!opts.force && seen?.hash === v.hash) return { serial, changed: false };
  const [tokens, google] = await Promise.all([pushTokensFor(serial), hasGoogle(serial)]);
  await markSeen(serial, v.hash);
  const [apple, g] = await Promise.all([
    appleConfigured() ? pushApple(tokens) : Promise.resolve({ ok: 0, failed: [] }),
    google && googleConfigured() ? upsertGoogle(v).then(() => "patched", (e) => `failed: ${String(e).slice(0, 120)}`) : Promise.resolve("none"),
  ]);
  return { serial, changed: true, apple: { pushed: apple.ok, failed: apple.failed.length }, google: g };
}
