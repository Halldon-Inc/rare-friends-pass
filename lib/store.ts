import { del, list, put } from "@vercel/blob";

// Tiny key store on Vercel Blob. Every fact lives in a blob PATHNAME (bodies are empty), so reads are `list` calls
// against the store's index and never go through the CDN cache that serves blob bodies:
//   reg/<serial>/<device>/<pushToken>   an Apple device registered for a pass
//   dev/<device>/<serial>               the reverse index Apple asks for
//   seen/<serial>/<hash>                the last pass state pushed, so the refresher only pushes on a change
//   g/<serial>                          a Google Wallet object exists for this pass
//   claim/<serial>/<unix>               last relayed claim (rate limit)
// Without BLOB_READ_WRITE_TOKEN (local dev) it falls back to process memory.

const mem = new Set<string>();
const live = () => !!process.env.BLOB_READ_WRITE_TOKEN;
const safe = (s: string) => s.replace(/[^A-Za-z0-9_.:-]/g, "");

async function add(path: string) {
  if (!live()) return void mem.add(path);
  await put(path, "", { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "text/plain" });
}
async function paths(prefix: string): Promise<string[]> {
  if (!live()) return [...mem].filter((p) => p.startsWith(prefix));
  const out: string[] = [];
  let cursor: string | undefined;
  do {
    const r = await list({ prefix, cursor, limit: 1000 });
    out.push(...r.blobs.map((b) => b.pathname));
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out;
}
async function remove(prefix: string) {
  if (!live()) {
    for (const p of [...mem]) if (p.startsWith(prefix)) mem.delete(p);
    return;
  }
  const r = await list({ prefix, limit: 1000 });
  if (r.blobs.length) await del(r.blobs.map((b) => b.url));
}

export async function registerDevice(serial: string, device: string, pushToken: string) {
  const [s, d, t] = [safe(serial), safe(device), safe(pushToken)];
  const had = (await paths(`reg/${s}/${d}/`)).length > 0;
  await remove(`reg/${s}/${d}/`);
  await Promise.all([add(`reg/${s}/${d}/${t}`), add(`dev/${d}/${s}`)]);
  return had;
}
export async function unregisterDevice(serial: string, device: string) {
  const [s, d] = [safe(serial), safe(device)];
  await Promise.all([remove(`reg/${s}/${d}/`), remove(`dev/${d}/${s}`)]);
}
export async function serialsForDevice(device: string) {
  const d = safe(device);
  return (await paths(`dev/${d}/`)).map((p) => p.slice(`dev/${d}/`.length));
}
export async function pushTokensFor(serial: string) {
  return (await paths(`reg/${safe(serial)}/`)).map((p) => p.split("/")[3]).filter(Boolean);
}
/** Every serial with at least one Apple device or a Google object: what the refresher walks. */
export async function trackedSerials() {
  const [reg, g] = await Promise.all([paths("reg/"), paths("g/")]);
  return [...new Set([...reg.map((p) => p.split("/")[1]), ...g.map((p) => p.split("/")[1])])].filter(Boolean);
}

export async function lastSeen(serial: string) {
  const p = await paths(`seen/${safe(serial)}/`);
  const [hash, at] = (p[0]?.split("/")[2] ?? "").split("@");
  return hash ? { hash, at: Number(at) || 0 } : null;
}
export async function markSeen(serial: string, hash: string, at = Math.floor(Date.now() / 1000)) {
  await remove(`seen/${safe(serial)}/`);
  await add(`seen/${safe(serial)}/${safe(hash)}@${at}`);
}

export async function markGoogle(serial: string) {
  await add(`g/${safe(serial)}`);
}
export async function hasGoogle(serial: string) {
  return (await paths(`g/${safe(serial)}`)).length > 0;
}

export async function lastClaim(serial: string) {
  const p = await paths(`claim/${safe(serial)}/`);
  return p.reduce((a, x) => Math.max(a, Number(x.split("/")[2]) || 0), 0);
}
export async function markClaim(serial: string, at = Math.floor(Date.now() / 1000)) {
  await remove(`claim/${safe(serial)}/`);
  await add(`claim/${safe(serial)}/${at}`);
}
