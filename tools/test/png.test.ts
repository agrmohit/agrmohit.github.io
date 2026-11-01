import { describe, expect, it } from "bun:test";
import { inflateSync } from "node:zlib";
import { palettePng } from "../png.ts";
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
