// The earthrise sky as SVG: the site's own scene, run once under a canvas stand-in that records its dots.
//
// Running the real engine, not a port, keeps the share images in step with the site. The scene draws
// only filled circles (paint() in scene.js), so each arc becomes a <circle> and each fill style a group.
// Every star catalogue loads before the scene starts, so the first frame never waits on a file.

import { earthrise, type SceneCanvas, type SceneContext } from "../assets/earthrise/scene.js";
import { type CatalogueName, catalogue, loadStars } from "../assets/earthrise/stars.js";
import { BuildError } from "./errors.ts";

// 13 September 2029, 09:00 UTC: seen from lunar orbit, the Earth sits just below the Pleiades, top right.
// Brighter and more colourful than the site, whose dots stay dim so its text reads.
export const MOMENT = {
  date: Date.UTC(2029, 8, 13, 9),
  useDate: true,
  playing: false,
  progress: 0.55,
  limitingMag: 8, // the full catalogue, so the Pleiades show
  amax: 0.5,
  earthTint: 0.7,
} as const;

/** How a layout frames the moment. The scene centres the Earth on its canvas: x = left + canvas / 2. */
export interface Frame {
  /** The image's size in px before scaling. */
  width: number;
  height: number;
  /** The scene's canvas width in px; wider than the frame to move the Earth right. */
  canvas: number;
  /** Where the canvas's left edge falls in the frame, in px. */
  left: number;
  /** Degrees across the canvas's longer side. */
  fov: number;
  /** The horizon's height as a fraction of the frame's height. */
  horizon: number;
}

export type Layout = "card" | "banner" | "linkedin";

export const FRAMES: Record<Layout, Frame> = {
  card: { width: 1200, height: 630, canvas: 1840, left: 0, fov: 14, horizon: 0.74 }, // Earth at x = 920
  banner: { width: 1500, height: 500, canvas: 3000, left: -350, fov: 18, horizon: 0.82 }, // x = 1150
  linkedin: { width: 1584, height: 396, canvas: 3200, left: -350, fov: 22, horizon: 0.88 }, // x = 1250; keeps the ground clear of the text
};

const CATALOGUES: readonly CatalogueName[] = ["ecliptic", "bright", "faint"];
const noop = (): void => {};
let ready: Promise<void> | undefined;

/** Sets up the browser globals scene.js reads and loads every catalogue, once. */
function prepare(): Promise<void> {
  ready ??= (async () => {
    // with reduced motion and a hidden page the scene draws one frame and stops
    Object.assign(globalThis, {
      matchMedia: () => ({ matches: true, addEventListener: noop, removeEventListener: noop }),
      ResizeObserver: class {
        observe(): void {}
        disconnect(): void {}
      },
      document: { hidden: true, addEventListener: noop, removeEventListener: noop },
      requestAnimationFrame: (draw: (time: number) => void) => setTimeout(() => draw(0), 0),
      cancelAnimationFrame: noop,
      devicePixelRatio: 1,
    });
    await Promise.all(CATALOGUES.map(loadStars));
    for (const name of CATALOGUES)
      if (catalogue[name] === null) throw new BuildError(`earthrise: star catalogue ${name} failed to load`);
  })();
  return ready;
}

/** One fill style's dots: x, y and radius, three numbers a dot, in the canvas's px. */
interface DotGroup {
  fillStyle: string;
  dots: number[];
}

/** A coordinate as SVG text: 3 decimals at most, so float noise never reaches the bytes. */
const num = (n: number): string => String(+n.toFixed(3));

/** The dots of one frame as SVG elements in the frame's own pixels, without an <svg> wrapper. */
export async function skyDots(frame: Frame): Promise<string> {
  const out: string[] = [];
  for (const { fillStyle, dots } of await recordDots(frame)) {
    const rgba = /^rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)$/.exec(fillStyle);
    if (rgba === null) throw new BuildError(`earthrise: unexpected fill style ${fillStyle}`);
    const [, r, g, b, alpha] = rgba;
    const circles: string[] = [];
    for (let i = 0; i + 2 < dots.length; i += 3) {
      const x = (dots[i] ?? 0) + frame.left;
      const y = dots[i + 1] ?? 0;
      const radius = dots[i + 2] ?? 0;
      if (x + radius < 0 || x - radius > frame.width) continue; // outside the frame
      circles.push(`<circle cx="${num(x)}" cy="${num(y)}" r="${num(radius)}"/>`);
    }
    if (circles.length > 0) out.push(`<g fill="rgb(${r},${g},${b})" fill-opacity="${alpha}">${circles.join("")}</g>`);
  }
  return out.join("\n");
}

/** Runs the scene for one frame and returns what it painted, one group per beginPath. */
async function recordDots(frame: Frame): Promise<DotGroup[]> {
  await prepare();
  const groups: DotGroup[] = [];
  const ctx: SceneContext = {
    fillStyle: "",
    setTransform: noop,
    clearRect: noop,
    moveTo: noop,
    fill: noop,
    beginPath: () => {
      groups.push({ fillStyle: ctx.fillStyle, dots: [] });
    },
    arc: (x, y, radius) => {
      groups.at(-1)?.dots.push(x, y, radius);
    },
  };
  const canvas: SceneCanvas = {
    clientWidth: frame.canvas,
    clientHeight: frame.height,
    style: {},
    animate: noop,
    getContext: () => ctx,
  };
  const scene = earthrise(canvas, { ...MOMENT, fov: frame.fov, horizon: frame.horizon });
  await new Promise<void>((resolve) => scene.onProgress(() => resolve()));
  scene.destroy();
  return groups;
}
