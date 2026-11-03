// The project pages' sky: the home page's stars without the Earth or the Moon, which would make the text hard to read.
// The query string can set the scene as on the home page (see fromURL in scene.js). A page arrived at from the
// home page continues its sky
import { earthrise, fromURL } from "./scene.js";
import { projectTransitions, skyFromLastPage } from "./transition.js";

const canvas = document.getElementById("earthrise");
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("earthrise: no <canvas id=earthrise> on the page");
const handoff = skyFromLastPage();
const scene = earthrise(canvas, {
  ...fromURL(location.search),
  ...handoff,
  earth: false,
});
projectTransitions(scene, handoff !== null);
