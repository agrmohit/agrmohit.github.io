// The project pages' sky: the home page's stars without the Earth or the Moon, which would make the text hard to read.
// The query string can set the scene as on the home page (see fromURL in scene.js)
import { earthrise, fromURL } from "./scene.js";

earthrise(document.getElementById("earthrise"), { ...fromURL(location.search), earth: false });
