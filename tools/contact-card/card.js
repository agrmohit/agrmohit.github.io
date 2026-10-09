// The sky behind the contact card: the real earthrise engine, held still.
import { earthrise } from "/assets/earthrise/scene.js";

earthrise(document.querySelector("canvas"), {
  // 13 September 2029, 09:00 UTC: seen from lunar orbit, the Earth sits just below the Pleiades,
  // which land in the top-right corner
  date: Date.UTC(2029, 8, 13, 9),
  useDate: true,
  playing: false,
  progress: 0.55, // partway through the rise
  fov: 14,
  horizon: 0.74, // low enough to keep the text in the sky
  limitingMag: 8, // the full catalogue, so the Pleiades show
});
