// Types for scene.js, for the build's TypeScript. The site loads scene.js untyped.

/** The part of CanvasRenderingContext2D the scene draws with (see paint() in scene.js). */
export interface SceneContext {
  fillStyle: string;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  fill(): void;
}

/** The part of HTMLCanvasElement the scene reads and writes. */
export interface SceneCanvas {
  clientWidth: number;
  clientHeight: number;
  width?: number;
  height?: number;
  style: { opacity?: string | number };
  animate(keyframes: object, duration: number): unknown;
  getContext(kind: "2d"): SceneContext;
}

/** Settings; scene.js DEFAULTS documents each one. */
export interface SceneParams {
  date?: number | null;
  useDate?: boolean;
  playing?: boolean;
  progress?: number;
  limitingMag?: number;
  amax?: number;
  earthTint?: number;
  fov?: number;
  horizon?: number;
}

export interface Scene {
  /** Calls `listener` after each frame; returns the unsubscribe. */
  onProgress(listener: (progress: number) => void): () => void;
  destroy(): void;
}

export function earthrise(canvas: SceneCanvas, params?: SceneParams): Scene;
