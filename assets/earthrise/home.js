// The home page: a quiet earthrise behind it, with the default settings. Tune them at /projects/earthrise/.
// The query string can set them as the lab's hash does, so screenshots can show a fixed moment
import { earthrise, fromURL } from "./scene.js";

earthrise(document.getElementById("earthrise"), fromURL(location.search));
