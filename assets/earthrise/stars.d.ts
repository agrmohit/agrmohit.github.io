// Types for stars.js, for the build's TypeScript.

export type CatalogueName = "ecliptic" | "bright" | "faint";
export interface Stars {
  n: number;
  xyz: Float32Array;
  mag: Float32Array;
  ci: Float32Array;
}
export const catalogue: Record<CatalogueName, Stars | null>;
/** Loads one catalogue into `catalogue`; logs and leaves it null on failure. */
export function loadStars(name: CatalogueName): Promise<void>;
