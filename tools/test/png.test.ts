import { describe, expect, it } from "bun:test";
import { deflateSync, inflateSync } from "node:zlib";
import { decodeRgbaPng, palettePng } from "../png.ts";
import { failure } from "./failure.ts";

interface Chunk {
  type: string;
  data: Uint8Array;
}

/** The chunks of a PNG after its signature; fails on a CRC that does not match. */
function chunks(png: Uint8Array): Chunk[] {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const out: Chunk[] = [];
  for (let at = 8; at < png.length; ) {
    const length = view.getUint32(at);
    const typed = png.subarray(at + 4, at + 8 + length);
    if (view.getUint32(at + 8 + length) !== Bun.hash.crc32(typed) >>> 0) throw new Error(`bad CRC at ${at}`);
    out.push({ type: Buffer.from(typed.subarray(0, 4)).toString("ascii"), data: typed.subarray(4) });
    at += 12 + length;
  }
  return out;
}

/** What a palette PNG holds, read back with an independent inflate. */
function decode(png: Uint8Array) {
  const parts = chunks(png);
  const [ihdr, plte, idat] = parts;
  if (ihdr === undefined || plte === undefined || idat === undefined) throw new Error("missing chunks");
  const header = new DataView(ihdr.data.buffer, ihdr.data.byteOffset, ihdr.data.byteLength);
  const width = header.getUint32(0);
  const height = header.getUint32(4);
  const rows = inflateSync(idat.data);
  const filters: number[] = [];
  const indices: number[] = [];
  for (let y = 0; y < height; y++) {
    filters.push(rows[y * (width + 1)] ?? -1);
    indices.push(...rows.subarray(y * (width + 1) + 1, (y + 1) * (width + 1)));
  }
  return {
    signature: [...png.subarray(0, 8)],
    types: parts.map((part) => part.type),
    width,
    height,
    format: [...ihdr.data.subarray(8)],
    palette: [...plte.data],
    filters,
    indices,
  };
}

interface Image {
  name: string;
  width: number;
  height: number;
  palette: number[];
  indices: number[];
}

const images: readonly Image[] = [
  { name: "one pixel", width: 1, height: 1, palette: [255, 0, 0], indices: [0] },
  { name: "two colours in a row", width: 3, height: 1, palette: [0, 0, 0, 255, 255, 255], indices: [0, 1, 0] },
  { name: "several rows", width: 2, height: 3, palette: [1, 2, 3, 4, 5, 6, 7, 8, 9], indices: [0, 1, 2, 2, 1, 0] },
  {
    name: "a full palette",
    width: 16,
    height: 16,
    palette: [...Array(768).keys()].map((i) => i % 256),
    indices: [...Array(256).keys()],
  },
  { name: "one column", width: 1, height: 4, palette: [9, 9, 9, 1, 1, 1], indices: [0, 1, 1, 0] },
];

describe("palettePng", () => {
  it.each(images)("$name decodes back to its pixels", ({ width, height, palette, indices }) => {
    const png = palettePng(width, height, new Uint8Array(palette), new Uint8Array(indices));
    expect(decode(png)).toEqual({
      signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      types: ["IHDR", "PLTE", "IDAT", "IEND"],
      width,
      height,
      format: [8, 3, 0, 0, 0],
      palette,
      filters: Array<number>(height).fill(0),
      indices,
    });
  });

  // node:zlib or a bun upgrade changing its output changes every card; this row says so first
  it("writes the same bytes as when the cards were last built", () => {
    const png = palettePng(4, 2, new Uint8Array([9, 9, 9, 1, 1, 1]), new Uint8Array([0, 1, 0, 1, 1, 0, 1, 0]));
    expect(new Bun.CryptoHasher("sha256").update(png).digest("hex")).toBe(
      "f0b9e5ba635ed0a86a5f469ee2215678ff658fa4dc9b35bceafc6244119bdc81",
    );
  });

  interface Refusal {
    name: string;
    width: number;
    height: number;
    palette: number[];
    indices: number[];
    message: string;
  }

  const refusals: readonly Refusal[] = [
    {
      name: "too few indices",
      width: 2,
      height: 2,
      palette: [0, 0, 0],
      indices: [0, 0, 0],
      message: "3 indices for 2 x 2",
    },
    {
      name: "too many indices",
      width: 1,
      height: 1,
      palette: [0, 0, 0],
      indices: [0, 0],
      message: "2 indices for 1 x 1",
    },
    { name: "zero width", width: 0, height: 1, palette: [0, 0, 0], indices: [], message: "at least 1 x 1" },
    { name: "an empty palette", width: 1, height: 1, palette: [], indices: [0], message: "not 0 bytes" },
    { name: "a palette of part colours", width: 1, height: 1, palette: [0, 0], indices: [0], message: "not 2 bytes" },
    {
      name: "more than 256 colours",
      width: 1,
      height: 1,
      palette: Array<number>(771).fill(0),
      indices: [0],
      message: "not 771 bytes",
    },
  ];

  it.each(refusals)("refuses $name", ({ width, height, palette, indices, message }) => {
    expect(failure(() => palettePng(width, height, new Uint8Array(palette), new Uint8Array(indices)))).toContain(
      message,
    );
  });
});

/** A PNG chunk: length, type, data, CRC. */
function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(typed, 4);
  view.setUint32(8 + data.length, Bun.hash.crc32(typed) >>> 0);
  return out;
}

/** `rgba` as a PNG, every row with filter `filter`; the PNG spec's own filters, written out for the test. */
function filteredPng(width: number, height: number, rgba: Uint8Array, filter: number, colour = 6): Uint8Array {
  const stride = width * 4;
  const at = (x: number, y: number) => (x < 0 || y < 0 ? 0 : (rgba[y * stride + x] ?? 0));
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = filter;
    for (let i = 0; i < stride; i++) {
      const [left, up, upLeft] = [at(i - 4, y), at(i, y - 1), at(i - 4, y - 1)];
      const paeth = () => {
        const p = left + up - upLeft;
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
        return pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      };
      const predicted = [0, left, up, (left + up) >> 1, paeth()][filter] ?? 0;
      raw[y * (stride + 1) + 1 + i] = (at(i, y) - predicted) & 0xff;
    }
  }
  const header = new Uint8Array(13);
  new DataView(header.buffer).setUint32(0, width);
  new DataView(header.buffer).setUint32(4, height);
  header.set([8, colour, 0, 0, 0], 8);
  return Buffer.concat([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", new Uint8Array(0)),
  ]);
}

// pixels where every neighbour differs, so each filter's prediction matters
const pixels = (width: number, height: number) =>
  new Uint8Array(width * height * 4).map((_, i) => (i * 37 + (i >> 3) * 11) & 0xff);

describe("decodeRgbaPng", () => {
  interface Row {
    name: string;
    width: number;
    height: number;
    filter: number;
  }

  const rows: readonly Row[] = [
    { name: "filter none", width: 5, height: 3, filter: 0 },
    { name: "filter sub", width: 5, height: 3, filter: 1 },
    { name: "filter up", width: 5, height: 3, filter: 2 },
    { name: "filter average", width: 5, height: 3, filter: 3 },
    { name: "filter paeth", width: 5, height: 3, filter: 4 },
    { name: "one pixel", width: 1, height: 1, filter: 4 },
    { name: "one row", width: 7, height: 1, filter: 3 },
    { name: "one column", width: 1, height: 6, filter: 2 },
  ];

  it.each(rows)("$name decodes to its pixels", ({ width, height, filter }) => {
    const rgba = pixels(width, height);
    expect(decodeRgbaPng(filteredPng(width, height, rgba, filter), "t.png")).toEqual({ width, height, data: rgba });
  });

  it("reads what Bun.Image writes", async () => {
    const rgba = pixels(40, 20);
    const png = await new Bun.Image(filteredPng(40, 20, rgba, 0)).png().bytes();
    expect(decodeRgbaPng(png, "t.png").data).toEqual(rgba);
  });

  interface RefusalRow {
    name: string;
    png: () => Uint8Array;
    message: string;
  }

  const refusals: readonly RefusalRow[] = [
    { name: "a file that is not a PNG", png: () => new TextEncoder().encode("not a png"), message: "not a PNG" },
    {
      name: "a palette PNG",
      png: () => palettePng(2, 2, new Uint8Array(3), new Uint8Array(4)),
      message: "not 8-bit RGBA",
    },
    { name: "an RGB PNG", png: () => filteredPng(2, 2, pixels(2, 2), 0, 2), message: "not 8-bit RGBA" },
    {
      name: "a filter type past 4",
      png: () => filteredPng(2, 2, pixels(2, 2), 5),
      message: "filter type 5",
    },
    { name: "a PNG cut short", png: () => filteredPng(4, 4, pixels(4, 4), 0).subarray(0, 40), message: "t.png" },
    {
      name: "a header that claims more rows than the data holds",
      png: () => {
        const png = filteredPng(4, 4, pixels(4, 4), 0);
        png[23] = 5; // the low byte of IHDR's height; the decoder does not check CRCs
        return png;
      },
      message: "bytes of pixel data for 4 x 5",
    },
  ];

  it.each(refusals)("refuses $name", ({ png, message }) => {
    expect(failure(() => decodeRgbaPng(png(), "t.png"))).toContain(message);
  });
});
