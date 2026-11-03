// The home page: a quiet earthrise behind it, with the default settings. Tune them at /projects/earthrise/.
// The query string can set them as the lab's hash does, so screenshots can show a fixed moment.
// A page that hands its sky to the next one passes its date and place in the pass (transition.js)
import { earthrise, fromURL } from "./scene.js";
import { homeTransitions, skyFromLastPage } from "./transition.js";

const canvas = document.getElementById("earthrise");
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("earthrise: no <canvas id=earthrise> on the page");
const handoff = skyFromLastPage();
const scene = earthrise(canvas, {
  ...fromURL(location.search),
  ...handoff,
});
homeTransitions(scene, handoff !== null);
