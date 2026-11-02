// SVG to PNG bytes that are the same on every machine.
//
// resvg runs as WebAssembly: its native builds differ in the last bit of their float maths between operating
// systems. Card PNGs are written here with node:zlib, which bun ships as one build everywhere; that is why
// tools/package.json pins bun.

import { deflateSync, inflateSync } from "node:zlib";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { BuildError } from "./errors.ts";
import { quantise } from "./quantise.ts";

/** The part of resvg's image we use; the package does not export its type. `pixels` is RGBA, row by row. */
interface Rendered {
  width: number;
  height: number;
  pixels: Uint8Array;
  asPng(): Uint8Array;
}

let wasm: Promise<void> | undefined;

/** `svg` drawn `width` px wide; loads resvg's WebAssembly once, on first use. */
async function render(svg: string, width: number): Promise<Rendered> {
  wasm ??= Bun.file(new URL(import.meta.resolve("@resvg/resvg-wasm/index_bg.wasm")))
    .arrayBuffer()
    .then(initWasm);
  await wasm;
  // no system fonts: text must arrive as paths, as satori draws it
  return new Resvg(svg, { fitTo: { mode: "width", value: width }, font: { loadSystemFonts: false } }).render();
}

/** `svg` drawn `width` px wide as a full-colour PNG, for icons: resvg's own encoder, pure Rust in the wasm. */
export async function svgToPng(svg: string, width: number): Promise<Uint8Array> {
  return (await render(svg, width)).asPng();
}

/** `svg` drawn `width` px wide as a 256-colour PNG, for the cards: about a third of the full-colour size. */
export async function svgToPalettePng(svg: string, width: number): Promise<Uint8Array> {
  const image = await render(svg, width);
  const { palette, indices } = quantise(image.pixels, image.width, image.height);
  return palettePng(image.width, image.height, palette, indices);
}

const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * The pixels of an 8-bit RGBA PNG with no interlacing, 4 bytes a pixel, row by row. That is what Bun.Image
 * writes, and this reads only those: any other PNG throws. `name` only labels the error.
 */
export function decodeRgbaPng(
  bytes: Uint8Array,
  name: string,
): { width: number; height: number; data: Uint8Array<ArrayBuffer> } {
  if (bytes.length < SIGNATURE.length || !SIGNATURE.every((byte, i) => bytes[i] === byte))
    throw new BuildError(`${name}: not a PNG`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  const idat: Uint8Array[] = [];
  for (let at = SIGNATURE.length; at + 8 <= bytes.length; ) {
    const length = view.getUint32(at);
    const type = new TextDecoder().decode(bytes.subarray(at + 4, at + 8));
    const data = bytes.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      const [depth, colour, , , interlace] = data.subarray(8, 13);
      if (depth !== 8 || colour !== 6 || interlace !== 0)
        throw new BuildError(`${name}: a PNG that is not 8-bit RGBA without interlacing`);
    } else if (type === "IDAT") idat.push(data);
    at += 12 + length;
  }

  const stride = width * 4;
  let raw: Uint8Array;
  try {
    raw = inflateSync(Buffer.concat(idat));
  } catch (err) {
    throw new BuildError(`${name}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (width === 0 || raw.length !== height * (stride + 1))
    throw new BuildError(`${name}: ${raw.length} bytes of pixel data for ${width} x ${height}`);

  // each row is a filter type, then each byte less a prediction from its decoded neighbours (PNG spec, 9.2)
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] ?? 0;
    const row = y * stride;
    for (let i = 0; i < stride; i++) {
      const left = i >= 4 ? (pixels[row + i - 4] ?? 0) : 0;
      const up = y > 0 ? (pixels[row - stride + i] ?? 0) : 0;
      const upLeft = i >= 4 && y > 0 ? (pixels[row - stride + i - 4] ?? 0) : 0;
      const byte = raw[y * (stride + 1) + 1 + i] ?? 0;
      pixels[row + i] = (byte + predict(filter, left, up, upLeft, name)) & 0xff;
    }
  }
  return { width, height, data: pixels };
}

/** The PNG filter's prediction of a byte from its left, upper and upper-left neighbours. */
function predict(filter: number, left: number, up: number, upLeft: number, name: string): number {
  switch (filter) {
    case 0:
      return 0;
    case 1:
      return left;
    case 2:
      return up;
    case 3:
      return (left + up) >> 1;
    case 4: {
      const p = left + up - upLeft;
      const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
      return pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
    }
    default:
      throw new BuildError(`${name}: PNG filter type ${filter}`);
  }
}

/** An 8-bit palette PNG. `palette`: 3 bytes a colour, at most 256 colours; `indices`: one byte a pixel, row by row. */
export function palettePng(width: number, height: number, palette: Uint8Array, indices: Uint8Array): Uint8Array {
  if (width < 1 || height < 1) throw new BuildError(`png: an image must be at least 1 x 1, not ${width} x ${height}`);
  if (palette.length === 0 || palette.length % 3 !== 0 || palette.length > 768)
    throw new BuildError(`png: a palette holds 1 to 256 colours of 3 bytes, not ${palette.length} bytes`);
  if (indices.length !== width * height)
    throw new BuildError(`png: ${indices.length} indices for ${width} x ${height}`);

  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 3, 0, 0, 0], 8); // 8 bits, palette, deflate, adaptive filtering, no interlace

  // each row starts with its filter type: 0, none, which suits palette images
  const rows = new Uint8Array(height * (width + 1));
  for (let y = 0; y < height; y++) rows.set(indices.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);

  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", header),
    chunk("PLTE", palette),
    chunk("IDAT", deflateSync(rows, { level: 9 })), // zlib-wrapped, as PNG requires; Bun.deflateSync is raw deflate
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/** A PNG chunk: data length, type, data, and the CRC-32 of type and data. */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(typed.length + 8);
  out.writeUInt32BE(data.length, 0);
  out.set(typed, 4);
  out.writeUInt32BE(Bun.hash.crc32(typed) >>> 0, typed.length + 4);
  return out;
}
