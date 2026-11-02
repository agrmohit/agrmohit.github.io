// README images through Bun.Image: their pixel size, and smaller WebP and JPEG XL copies for the page.
// Its PNG, JPEG and WebP codecs give the same bytes on every OS. Its resize does too only on the "bun"
// backend (macOS defaults to vImage), so the backend is pinned. See https://bun.com/docs/runtime/image
// JPEG XL is libjxl as WebAssembly (@jsquash/jxl): one binary everywhere, as with resvg.

import encodeJxl from "@jsquash/jxl/encode.js";
import { BuildError } from "./errors.ts";
import { decodeRgbaPng } from "./png.ts";

Bun.Image.backend = "bun";

// below 90 the soft gradients behind the screenshots' text start to block
const WEBP_QUALITY = 90;
// about the WebPs' bytes at their quality: 86 made momentum-menu's six 323 KB against the WebPs' 336 KB
const JXL_QUALITY = 86;

/**
 * The image's format and size in pixels, or undefined if `bytes` is in no format Bun reads (an SVG, a video).
 * Reads only the header. `name` only labels the error a damaged image throws.
 */
export async function rasterOf(bytes: Uint8Array, name: string): Promise<Bun.Image.Metadata | undefined> {
  try {
    return await new Bun.Image(bytes).metadata();
  } catch (err) {
    if (errorCode(err) === "ERR_IMAGE_UNKNOWN_FORMAT") return undefined;
    throw buildError(err, name);
  }
}

/** `bytes` as a WebP of the same pixel size. */
export async function toWebp(bytes: Uint8Array, name: string): Promise<Uint8Array> {
  try {
    return await new Bun.Image(bytes).webp({ quality: WEBP_QUALITY }).bytes();
  } catch (err) {
    throw buildError(err, name);
  }
}

/**
 * `bytes` as a progressive JPEG XL of the same pixel size: Chrome and Firefox draw a coarse image first.
 * Bun.Image decodes it and hands over the pixels as an uncompressed PNG, as it has no raw output.
 */
export async function toJxl(bytes: Uint8Array, name: string): Promise<Uint8Array> {
  try {
    const png = await new Bun.Image(bytes).png({ compressionLevel: 0 }).bytes();
    const { data, ...size } = decodeRgbaPng(png, name);
    const pixels = { ...size, data: new Uint8ClampedArray(data.buffer), colorSpace: "srgb" } satisfies ImageData;
    return new Uint8Array(await encodeJxl(pixels, { quality: JXL_QUALITY, effort: 7, progressive: true }));
  } catch (err) {
    throw buildError(err, name);
  }
}

const buildError = (err: unknown, name: string): BuildError =>
  err instanceof BuildError ? err : new BuildError(`${name}: ${err instanceof Error ? err.message : String(err)}`);

const errorCode = (err: unknown): unknown =>
  typeof err === "object" && err !== null ? Reflect.get(err, "code") : undefined;
