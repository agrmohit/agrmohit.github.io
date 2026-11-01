// satori's types import ReactNode for its element argument; the build passes its own typed Element
// (images.ts), so no React types are installed.
// biome-ignore lint/correctness/noUnresolvedImports: this declares the module; there is nothing to resolve
declare module "react" {
  export type ReactNode = unknown;
}
