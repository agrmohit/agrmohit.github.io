// README images through Bun.Image: their pixel size, and a smaller WebP copy for the page.
// Its PNG, JPEG and WebP codecs give the same bytes on every OS. Its resize does too only on the "bun"
// backend (macOS defaults to vImage), so the backend is pinned. See https://bun.com/docs/runtime/image

import { BuildError } from "./errors.ts";

Bun.Image.backend = "bun";

// sharp at 2x on a phone; below 90 the soft gradients behind the screenshots' text start to block
const WEBP_QUALITY = 90;

/**
 * The image's format and size in pixels, or undefined if `bytes` is in no format Bun reads (an SVG, a video).
 * Reads only the header. `name` only labels the error a damaged image throws.
 */
export async function rasterOf(bytes: Uint8Array, name: string): Promise<Bun.Image.Metadata | undefined> {
  try {
    return await new Bun.Image(bytes).metadata();
  } catch (err) {
    if (errorCode(err) === "ERR_IMAGE_UNKNOWN_FORMAT") return undefined;
    throw new BuildError(`${name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** `bytes` as a WebP `width` px wide, its height following the image's shape. */
export async function toWebp(bytes: Uint8Array, width: number, name: string): Promise<Uint8Array> {
  try {
    return await new Bun.Image(bytes).resize(width).webp({ quality: WEBP_QUALITY }).bytes();
  } catch (err) {
    throw new BuildError(`${name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

const errorCode = (err: unknown): unknown =>
  typeof err === "object" && err !== null ? Reflect.get(err, "code") : undefined;
