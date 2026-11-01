import { describe, expect, it } from "bun:test";
import { quantise } from "../quantise.ts";
import { failure } from "./failure.ts";

type Rgb = [number, number, number];

/** Opaque RGBA bytes for `pixels`, one row. */
const rgba = (pixels: readonly Rgb[]): Uint8Array => new Uint8Array(pixels.flatMap(([r, g, b]) => [r, g, b, 255]));

/** Each pixel's colour after quantising, read through its index into the palette. */
function shown(pixels: readonly Rgb[], maxColours?: number): Rgb[] {
  const { palette, indices } = quantise(rgba(pixels), pixels.length, 1, maxColours);
  return [...indices].map((i) => [palette[i * 3] ?? -1, palette[i * 3 + 1] ?? -1, palette[i * 3 + 2] ?? -1]);
}

const gradient = (n: number): Rgb[] => [...Array(n).keys()].map((i): Rgb => [i, 255 - i, (i * 7) % 256]);

interface Lossless {
  name: string;
  pixels: Rgb[];
}

// with no more colours than the palette holds, every pixel keeps its colour
const lossless: readonly Lossless[] = [
  { name: "one colour", pixels: [[10, 20, 30]] },
  {
    name: "black and white",
    pixels: [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [255, 255, 255],
    ],
  },
  {
    name: "a repeated colour",
    pixels: [
      [5, 5, 5],
      [9, 9, 9],
      [5, 5, 5],
      [9, 9, 9],
    ],
  },
  { name: "ten colours", pixels: gradient(10) },
  { name: "exactly 256 colours", pixels: gradient(256) },
];

interface Reduced {
  name: string;
  pixels: Rgb[];
  maxColours: number;
  want: Rgb[];
}

// worked by hand from the median cut in quantise.ts
const reduced: readonly Reduced[] = [
  {
    name: "splits where the pixels pass half",
    pixels: [
      [0, 0, 0],
      [10, 0, 0],
      [20, 0, 0],
      [20, 0, 0],
    ],
    maxColours: 2,
    want: [
      [5, 0, 0],
      [5, 0, 0],
      [20, 0, 0],
      [20, 0, 0],
    ],
  },
  {
    name: "rounds a mean of .5 up",
    pixels: [
      [0, 0, 0],
      [1, 0, 0],
    ],
    maxColours: 1,
    want: [
      [1, 0, 0],
      [1, 0, 0],
    ],
  },
  {
    // red's range 100 x 77 is less than green's 60 x 150
    name: "splits along the widest channel as the eye weighs it",
    pixels: [
      [0, 0, 0],
      [100, 0, 0],
      [0, 60, 0],
    ],
    maxColours: 2,
    want: [
      [50, 0, 0],
      [50, 0, 0],
      [0, 60, 0],
    ],
  },
  {
    name: "one colour for the whole image",
    pixels: [
      [0, 0, 0],
      [30, 60, 90],
    ],
    maxColours: 1,
    want: [
      [15, 30, 45],
      [15, 30, 45],
    ],
  },
];

describe("quantise", () => {
  it.each(lossless)("$name keeps every colour", ({ pixels }) => {
    expect(shown(pixels)).toEqual(pixels);
  });

  it.each(reduced)("$name", ({ pixels, maxColours, want }) => {
    expect(shown(pixels, maxColours)).toEqual(want);
  });

  it("never makes more palette entries than allowed", () => {
    const sizes = [1, 2, 16, 256].map(
      (maxColours) => quantise(rgba(gradient(300)), 300, 1, maxColours).palette.length / 3,
    );
    expect(sizes).toEqual([1, 2, 16, 256]);
  });

  interface Refusal {
    name: string;
    bytes: number[];
    width: number;
    message: string;
  }

  const refusals: readonly Refusal[] = [
    { name: "a transparent pixel", bytes: [0, 0, 0, 255, 9, 9, 9, 128], width: 2, message: "pixel 1 is not opaque" },
    { name: "bytes that don't fill the image", bytes: [0, 0, 0, 255], width: 2, message: "4 bytes for 2 x 1" },
    { name: "no pixels", bytes: [], width: 1, message: "0 bytes for 1 x 1" },
  ];

  it.each(refusals)("refuses $name", ({ bytes, width, message }) => {
    expect(failure(() => quantise(new Uint8Array(bytes), width, 1))).toContain(message);
  });
});
