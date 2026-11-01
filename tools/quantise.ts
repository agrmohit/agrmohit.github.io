// Median cut in whole numbers, so the same pixels give the same palette on every machine.

import { BuildError } from "./errors.ts";

/** One distinct colour, packed as 0xRRGGBB, and how many pixels have it. */
interface Colour {
  rgb: number;
  count: number;
}

/** Colours that become one palette entry. */
interface Box {
  colours: Colour[];
  pixels: number;
}

type Channel = 0 | 1 | 2; // red, green, blue
const CHANNELS: readonly Channel[] = [0, 1, 2];
// a channel's range counts as much as the eye sees it: the luminance weights (77 + 150 + 29 = 256) Pillow uses
const WEIGHT: Record<Channel, number> = { 0: 77, 1: 150, 2: 29 };

const channel = (rgb: number, c: Channel): number => (rgb >> (16 - 8 * c)) & 0xff;

/**
 * Reduces opaque RGBA pixels to at most `maxColours` colours: a palette (3 bytes a colour) and one index a pixel.
 *
 * Start with every colour in one box. Split the box holding the most pixels at its pixel median along its
 * widest channel, until there are `maxColours` boxes or each box is one colour. A box's palette entry is its
 * rounded mean. Each colour then takes the nearest entry. Every tie goes to the lower colour or index.
 */
export function quantise(
  rgba: Uint8Array,
  width: number,
  height: number,
  maxColours = 256,
): { palette: Uint8Array; indices: Uint8Array } {
  if (rgba.length !== width * height * 4)
    throw new BuildError(`quantise: ${rgba.length} bytes for ${width} x ${height}`);
  const words = new DataView(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  const rgbs = new Uint32Array(width * height);
  for (let i = 0; i < rgbs.length; i++) {
    const word = words.getUint32(i * 4); // 0xRRGGBBAA
    if ((word & 0xff) !== 0xff) throw new BuildError(`quantise: pixel ${i} is not opaque`);
    rgbs[i] = word >>> 8;
  }

  const palette = medianCut(histogram(rgbs), maxColours).map(meanColour);
  const indexOf = new Map<number, number>();
  const indices = rgbs.map((rgb) => {
    const known = indexOf.get(rgb);
    if (known !== undefined) return known;
    const index = nearest(rgb, palette);
    indexOf.set(rgb, index);
    return index;
  });
  return {
    palette: new Uint8Array(palette.flatMap((rgb) => CHANNELS.map((c) => channel(rgb, c)))),
    indices: new Uint8Array(indices),
  };
}

/** Every distinct colour with its pixel count, in rising 0xRRGGBB order. */
function histogram(rgbs: Uint32Array): Colour[] {
  const counts = new Map<number, number>();
  for (const rgb of rgbs) counts.set(rgb, (counts.get(rgb) ?? 0) + 1);
  return [...counts].map(([rgb, count]) => ({ rgb, count })).sort((a, b) => a.rgb - b.rgb);
}

function medianCut(colours: Colour[], maxColours: number): Box[] {
  const boxes: Box[] = [{ colours, pixels: colours.reduce((sum, colour) => sum + colour.count, 0) }];
  while (boxes.length < maxColours) {
    // the fullest box that can still split; the first of them on a tie
    let fullest: Box | undefined;
    for (const box of boxes) if (box.colours.length > 1 && box.pixels > (fullest?.pixels ?? 0)) fullest = box;
    if (!fullest) break; // every box is one colour: the image has fewer than maxColours
    boxes.splice(boxes.indexOf(fullest), 1, ...split(fullest));
  }
  return boxes;
}

/** Splits `box` where its pixels, sorted along the widest channel, pass half; each half keeps a colour. */
function split(box: Box): [Box, Box] {
  const c = widestChannel(box.colours);
  const sorted = box.colours.toSorted((a, b) => channel(a.rgb, c) - channel(b.rgb, c) || a.rgb - b.rgb);
  let cut = 0;
  let left = 0;
  for (const colour of sorted) {
    if (cut === sorted.length - 1 || (cut > 0 && left * 2 >= box.pixels)) break;
    left += colour.count;
    cut++;
  }
  return [
    { colours: sorted.slice(0, cut), pixels: left },
    { colours: sorted.slice(cut), pixels: box.pixels - left },
  ];
}

/** The channel with the largest weighted range: red, then green, on a tie. */
function widestChannel(colours: Colour[]): Channel {
  let widest: Channel = 0;
  let widestRange = -1;
  for (const c of CHANNELS) {
    let low = 255;
    let high = 0;
    for (const { rgb } of colours) {
      low = Math.min(low, channel(rgb, c));
      high = Math.max(high, channel(rgb, c));
    }
    const range = (high - low) * WEIGHT[c];
    if (range > widestRange) [widest, widestRange] = [c, range];
  }
  return widest;
}

/** The box's mean colour as 0xRRGGBB, each channel rounded half up in integer maths. */
function meanColour(box: Box): number {
  let rgb = 0;
  for (const c of CHANNELS) {
    let sum = 0;
    for (const colour of box.colours) sum += channel(colour.rgb, c) * colour.count;
    // round(sum / pixels) = floor((2 sum + pixels) / (2 pixels)); subtracting the remainder keeps it exact
    const numerator = 2 * sum + box.pixels;
    rgb = (rgb << 8) | ((numerator - (numerator % (2 * box.pixels))) / (2 * box.pixels));
  }
  return rgb;
}

/** The index of the palette colour closest to `rgb` (squared distance), the lowest on a tie. */
function nearest(rgb: number, palette: number[]): number {
  let best = 0;
  let bestDistance = distance(rgb, palette[0] ?? 0);
  for (const [i, entry] of palette.entries()) {
    const d = distance(rgb, entry);
    if (d < bestDistance) [best, bestDistance] = [i, d];
  }
  return best;
}

function distance(a: number, b: number): number {
  let sum = 0;
  for (const c of CHANNELS) sum += (channel(a, c) - channel(b, c)) ** 2;
  return sum;
}
