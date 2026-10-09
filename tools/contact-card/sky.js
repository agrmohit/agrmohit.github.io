// The sky behind the contact card and the banner: the real earthrise engine, held still.
import { earthrise } from "/assets/earthrise/scene.js";

// how each image frames the same moment
const scenes = {
  card: { fov: 14, horizon: 0.74 },
  banner: { fov: 18, horizon: 0.82 },
  linkedin: { fov: 22, horizon: 0.88 }, // a lower horizon keeps the ground clear of the text
};

const canvas = document.querySelector("canvas");
earthrise(canvas, {
  // 13 September 2029, 09:00 UTC: seen from lunar orbit, the Earth sits just below the Pleiades,
  // which land in the top-right corner
  date: Date.UTC(2029, 8, 13, 9),
  useDate: true,
  playing: false,
  progress: 0.55, // partway through the rise
  limitingMag: 8, // the full catalogue, so the Pleiades show
  ...scenes[canvas.dataset.scene],
});
