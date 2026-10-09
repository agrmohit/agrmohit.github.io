// The sky behind every share image: the real earthrise engine, held still.
import { earthrise } from "/assets/earthrise/scene.js";

const scenes = {
  card: { fov: 14, horizon: 0.74 },
  banner: { fov: 18, horizon: 0.82 },
  linkedin: { fov: 22, horizon: 0.88 }, // a lower horizon keeps the ground clear of the text
  post: { fov: 11, horizon: 0.76 },
};

const canvas = document.querySelector("canvas");
earthrise(canvas, {
  // 13 September 2029, 09:00 UTC: seen from lunar orbit, the Earth sits just below the Pleiades,
  // which land in the top-right corner
  date: Date.UTC(2029, 8, 13, 9),
  useDate: true,
  playing: false,
  progress: 0.55,
  limitingMag: 8, // the full catalogue, so the Pleiades show
  // brighter and more colourful than on the site, whose dots stay dim so its text reads; images seen
  // small need the pop, and their text has its own halo
  amax: 0.5,
  earthTint: 0.7,
  ...scenes[canvas.dataset.scene],
});
