import sharp from "sharp";
import { dataUriBytes, friendArtwork, type FriendRef } from "./chain";

// Pass images from the Friend's own on-chain portrait. The art is black-and-white pixel work (Genesis is an 8x8 face,
// Generations a 512px scene of the Friend at home), so it is scaled with nearest-neighbour and never smoothed.

const artCache = new Map<string, { at: number; png: Buffer }>();

/** The portrait as a square PNG of `size` px. Falls back to a plain placeholder square when the chain has no art. */
export async function portraitPng(ref: FriendRef, size: number): Promise<Buffer> {
  const key = `${ref.collection}:${ref.id}`;
  let base = artCache.get(key);
  if (!base || Date.now() - base.at > 3_600_000) {
    const uri = await friendArtwork(ref);
    let png: Buffer;
    if (uri) {
      const bytes = dataUriBytes(uri);
      png = await sharp(bytes, { density: 144 }).resize(1024, 1024, { kernel: "nearest", fit: "contain", background: "#000" }).png().toBuffer();
    } else {
      png = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: "#111" } }).png().toBuffer();
    }
    base = { at: Date.now(), png };
    artCache.set(key, base);
  }
  return sharp(base.png).resize(size, size, { kernel: size >= 512 ? "nearest" : "lanczos3" }).png().toBuffer();
}

/**
 * A wide banner: black ground, the portrait as a full-height square on the right, and a 1px white rule down its edge.
 * Apple lays the pass's primary field over the left side of the strip; Google shows it as the hero.
 */
export async function bannerPng(ref: FriendRef, width: number, height: number): Promise<Buffer> {
  if (ref.collection === "Generations") {
    // A Generations portrait is a whole world floating in black: trim the empty ground and let the world fill the
    // right side of the banner, so it reads at wallet size.
    const scene = await sharp(await portraitPng(ref, 1024)).trim({ background: "#000", threshold: 8 }).png().toBuffer();
    const pad = Math.round(height * 0.07);
    const fitted = await sharp(scene)
      .resize(Math.round(width * 0.62), height - pad * 2, { fit: "inside", kernel: "nearest" })
      .png()
      .toBuffer({ resolveWithObject: true });
    return sharp({ create: { width, height, channels: 4, background: "#000" } })
      .composite([{ input: fitted.data, left: width - fitted.info.width - pad, top: Math.round((height - fitted.info.height) / 2) }])
      .png()
      .toBuffer();
  }
  const art = await portraitPng(ref, height);
  const rule = Math.max(1, Math.round(height / 144));
  return sharp({ create: { width, height, channels: 4, background: "#000" } })
    .composite([
      { input: await sharp({ create: { width: rule, height, channels: 4, background: "#fff" } }).png().toBuffer(), left: width - height - rule, top: 0 },
      { input: art, left: width - height, top: 0 },
    ])
    .png()
    .toBuffer();
}
