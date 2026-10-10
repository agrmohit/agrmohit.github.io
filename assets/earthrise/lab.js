// /earthrise/: every parameter of the background earthrise as a control, with the physics it implies.
import { DEFAULTS, earthrise } from "./scene.js";

const $ = (s) => document.querySelector(s);
const RAD = Math.PI / 180;

// --- settings live in the URL's hash, so a view can be shared ---------------
const fromHash = () => {
  const q = new URLSearchParams(location.hash.slice(1));
  const p = {};
  for (const [k, v] of q) {
    if (!(k in DEFAULTS)) continue;
    const d = DEFAULTS[k];
    if (typeof d === "boolean") p[k] = v === "1";
    else if (k === "date") p[k] = v && Number.isFinite(+v) ? +v : null;
    else if (v !== "" && Number.isFinite(+v)) p[k] = +v;
  }
  return p;
};
const toHash = (p) => {
  const q = new URLSearchParams();
  for (const k in DEFAULTS) {
    if (k === "progress" || k === "playing" || p[k] === DEFAULTS[k]) continue;
    q.set(k, typeof p[k] === "boolean" ? (p[k] ? "1" : "0") : (p[k] ?? ""));
  }
  history.replaceState(null, "", q.size ? `#${q}` : location.pathname);
};

// this page shows the whole catalogue; the home page stops at 6.5 to skip the faint file
const initial = { limitingMag: 8, ...fromHash() };
const scene = earthrise($("#earthrise"), initial);

// --- controls ---------------------------------------------------------------
// key, label, min, max, step, unit, and optionally a log scale or a formatter
const GROUPS = [
  {
    title: "date and phase",
    note: "The Earth seen from the Moon shows the opposite phase to the Moon's. From the date: Meeus's lunar series, within about 0.02° of a full ephemeris in position and 15 km in distance (tested 1960 to 2040).",
    controls: [
      { key: "useDate", label: "from date", type: "checkbox" },
      { key: "elongation", label: "moon elongation", min: 0, max: 360, step: 0.5, unit: "°" },
      { key: "earthDistance", label: "earth distance", min: 356000, max: 407000, step: 100, unit: " km" },
      { key: "limbAngle", label: "bright limb angle", min: -180, max: 180, step: 1, unit: "°" },
    ],
  },
  {
    title: "orbit and camera",
    note: "A circular orbit, assumed to lie near the ecliptic; the horizon's dip, the period and the speeds follow from the altitude. The sky turns about the orbit's axis, so the stars and the Earth rise together. Real orbits are inclined (Apollo 8's by 12° to the lunar equator), which rolls the sky by up to the inclination; the sign depends on where the node lies. Field of view spans the screen's longer side. Real sunlight puts the ground in day or night by the Sun's true elevation; off, the Sun keeps its real direction but stays low.",
    controls: [
      { key: "altitude", label: "altitude", min: 10, max: 3000, step: 5, unit: " km", log: true },
      { key: "retrograde", label: "retrograde", type: "checkbox" },
      { key: "skyRoll", label: "sky roll", min: -30, max: 30, step: 0.5, unit: "°" },
      { key: "realLight", label: "real sunlight", type: "checkbox" },
      { key: "fov", label: "field of view", min: 1, max: 60, step: 0.1, unit: "°", log: true },
      { key: "timeScale", label: "time scale", min: 0.01, max: 50, step: 0.01, unit: "×", log: true },
    ],
  },
  {
    title: "sky",
    note: "The real sky round the Earth: HYG v4.1 (Hipparcos, Yale, Gliese) to magnitude 8, J2000, carried to the date by precession; no planets. Past 6.5 the faint catalogue (195 kB) loads; the home page loads only the stars near the ecliptic (45 kB). A real sunlit exposure would show no stars at all.",
    controls: [{ key: "limitingMag", label: "faintest star", min: 0, max: 8, step: 0.1, unit: " mag" }],
  },
  {
    title: "look (not physics)",
    controls: [
      { key: "craterStretch", label: "crater stretch", min: 1, max: 10, step: 0.1, unit: "×" },
      { key: "craterDensity", label: "crater density", min: 0, max: 2, step: 0.05, unit: "×" },
      {
        key: "horizon",
        label: "horizon height",
        min: 0.3,
        max: 0.9,
        step: 0.01,
        fmt: (v) => `${Math.round(v * 100)}%`,
      },
      { key: "earthTint", label: "earth colour", min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
      { key: "amax", label: "brightness cap", min: 0.05, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) },
      { key: "cell", label: "dot pitch", min: 0, max: 16, step: 1, fmt: (v) => (v ? `${v} px` : "auto") },
      { key: "fps", label: "frame rate", min: 1, max: 30, step: 1, unit: " fps" },
    ],
  },
];

const panel = $("#controls");
const inputs = {};
const fmtValue = (c, v) => (c.fmt ? c.fmt(v) : `${+v.toFixed(c.step < 1 ? 2 : 0)}${c.unit ?? ""}`);
// log controls slide over the logarithm of the value
const toSlider = (c, v) => (c.log ? Math.log10(v) : v);
const fromSlider = (c, s) => {
  if (!c.log) return +s;
  const v = 10 ** +s;
  return +(Math.round(v / c.step) * c.step).toFixed(4) || c.min;
};

for (const g of GROUPS) {
  const fs = document.createElement("fieldset");
  fs.innerHTML = `<legend>${g.title}</legend>`;
  for (const c of g.controls) {
    const row = document.createElement("label");
    row.className = "row";
    if (c.type === "checkbox") {
      row.innerHTML = `<span>${c.label}</span><input type="checkbox" />`;
      const el = row.querySelector("input");
      el.addEventListener("change", () => {
        const next = { [c.key]: el.checked };
        // leaving the date behind, start the manual values where the date had them
        if (c.key === "useDate" && !el.checked) {
          const x = scene.physics();
          Object.assign(next, { elongation: +x.elongation.toFixed(1), earthDistance: Math.round(x.earthDistance) });
        }
        set(next);
      });
      inputs[c.key] = { c, el, show: (v) => (el.checked = v) };
    } else {
      row.innerHTML = `<span>${c.label}</span><input type="range" /><output></output>`;
      const el = row.querySelector("input"),
        out = row.querySelector("output");
      el.min = toSlider(c, c.min);
      el.max = toSlider(c, c.max);
      el.step = c.log ? "any" : c.step;
      el.addEventListener("input", () => set({ [c.key]: fromSlider(c, el.value) }));
      inputs[c.key] = {
        c,
        el,
        show: (v) => {
          el.value = toSlider(c, v);
          out.value = fmtValue(c, v);
        },
      };
    }
    fs.append(row);
  }
  if (g.note) {
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = g.note;
    fs.append(note);
  }
  if (g.title === "date and phase") fs.insertBefore($("#date-row"), fs.children[1]);
  if (g.title === "orbit and camera") fs.append($("#presets"));
  panel.append(fs);
}

// --- the date, in UTC --------------------------------------------------------
const dateInput = $("#date");
const pad = (n) => String(n).padStart(2, "0");
const toLocalInput = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
dateInput.addEventListener("change", () => {
  const ms = Date.parse(`${dateInput.value}:00Z`);
  if (!Number.isNaN(ms)) set({ date: ms, useDate: true });
});
for (const b of document.querySelectorAll("[data-shift]")) {
  b.addEventListener("click", () => {
    const base = scene.params().date ?? Date.now();
    set({ date: base + +b.dataset.shift * 3600000, useDate: true });
  });
}
$("#now").addEventListener("click", () => set({ date: null, useDate: true }));

// --- presets -------------------------------------------------------------------
const PRESETS = {
  // Hasselblad 500 EL, 250 mm lens, 70 mm film with a 56 mm square frame: 2 atan(28 / 250) = 12.8 degrees a side.
  // Its orbit was inclined about 12 degrees; the roll that gives depends on the node, not established here, so 0.
  apollo8: { altitude: 110, fov: 12.8, timeScale: 1, date: Date.UTC(1968, 11, 24, 16, 39), useDate: true },
  site: { ...DEFAULTS },
};
for (const b of document.querySelectorAll("[data-preset]")) {
  b.addEventListener("click", () => set({ ...PRESETS[b.dataset.preset], progress: 0.35 }));
}

// --- play, and the place in the pass -----------------------------------------------
const progress = $("#progress"),
  play = $("#play");
progress.addEventListener("input", () => set({ progress: +progress.value, playing: false }));
play.addEventListener("click", () => set({ playing: !scene.params().playing }));
scene.onProgress((f) => {
  progress.value = f;
});

$("#hide").addEventListener("click", () => {
  const hidden = document.body.classList.toggle("bare");
  $("#hide").textContent = hidden ? "[show controls]" : "[hide controls]";
});
$("#copy").addEventListener("click", async () => {
  const p = scene.params(),
    out = {};
  for (const k in DEFAULTS) if (k !== "progress" && k !== "playing" && p[k] !== DEFAULTS[k]) out[k] = p[k];
  const text = `earthrise(canvas, ${JSON.stringify(out, null, 2)});`;
  try {
    await navigator.clipboard.writeText(text);
    $("#copy").textContent = "[copied]";
  } catch {
    prompt("Settings", text);
  }
  setTimeout(() => ($("#copy").textContent = "[copy settings]"), 1500);
});

// --- what the parameters imply ------------------------------------------------------
const luminance = (c) => {
  const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
const ratio = (a, b) => {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
// the site's text colours, and the brightest a dot can make the background under them
const BG = [26, 26, 26],
  INK = [196, 202, 214];
const TEXT = { body: [224, 228, 239], link: [153, 209, 219], strong: [239, 188, 178] };

const phaseName = (e) => {
  const names = [
    "new",
    "waxing crescent",
    "first quarter",
    "waxing gibbous",
    "full",
    "waning gibbous",
    "last quarter",
    "waning crescent",
  ];
  // the named instants get a window of a few degrees (about half a day); the stretches between are the rest
  const k = Math.round(e / 90) % 4;
  if (Math.abs(((e - k * 90 + 540) % 360) - 180) < 7) return names[k * 2];
  return names[Math.floor(e / 90) * 2 + 1];
};
// the Sun's elevation over the camera's nadir: its frame is the local one tipped by the horizon's dip
const sunElevation = (x) =>
  Math.asin(Math.max(-1, Math.min(1, x.sun[1] * Math.cos(x.dip) + x.sun[2] * Math.sin(x.dip)))) / RAD;
const readout = () => {
  const p = scene.params(),
    x = scene.physics();
  const brightest = BG.map((v, i) => v + (INK[i] - v) * p.amax);
  const worst = Math.min(...Object.values(TEXT).map((c) => ratio(c, brightest)));
  const rows = [
    ["moon", `${phaseName(x.elongation)}, ${(x.moonLit * 100).toFixed(1)}% lit`],
    ["moon elongation", `${x.elongation.toFixed(1)}°`],
    ["earth from moon", `${(x.earthLit * 100).toFixed(1)}% lit, phase angle ${x.phaseAngle.toFixed(1)}°`],
    ["earth distance", `${Math.round(x.earthDistance).toLocaleString("en")} km`],
    [
      "earth among stars",
      `ecliptic ${x.earthLon.toFixed(2)}°, ${x.earthLat >= 0 ? "+" : ""}${x.earthLat.toFixed(2)}° (date)`,
    ],
    ["bright limb", `${Math.abs(x.limbAngle).toFixed(1)}° ${x.limbAngle < 0 ? "clockwise" : "anticlockwise"} from the right`],
    [
      "sun at camera",
      `${Math.abs(sunElevation(x)).toFixed(1)}° ${sunElevation(x) > 0 ? "above the horizon (day below)" : "below the horizon (night below)"}${p.realLight ? "" : ", not drawn: real sunlight is off"}`,
    ],
    ["earth size", `${(x.earthDiameter / RAD).toFixed(3)}° (${((x.earthDiameter / RAD) * 60).toFixed(1)}′)`],
    ["orbital period", `${(x.period / 60).toFixed(1)} min`],
    ["orbital speed", `${x.orbitalSpeed.toFixed(3)} km/s`],
    ["ground track speed", `${x.groundSpeed.toFixed(3)} km/s`],
    ["horizon dip", `${(x.dip / RAD).toFixed(2)}°`],
    ["horizon distance", `${Math.round(x.horizonDistance)} km`],
    ["sky turns", `${(x.rate / RAD).toFixed(4)}°/s, an Earth width in ${(x.earthDiameter / x.rate).toFixed(0)} s`],
    ["one pass", `${x.passDuration.toFixed(0)} s of orbit, ${x.passLength.toFixed(0)} s on screen`],
    ["worst text contrast", `${worst.toFixed(2)}:1 ${worst >= 4.5 ? "(passes AA)" : "(fails AA, 4.5)"}`],
  ];
  $("#readout").innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
};

// --- one place to change things --------------------------------------------------------
function set(next) {
  scene.update(next);
  sync();
}
function sync() {
  const p = scene.params();
  const x = scene.physics();
  for (const k in inputs) inputs[k].show(p[k]);
  // from the date, show what the date gives; switching to manual then starts from there
  for (const k of ["elongation", "earthDistance", "limbAngle"]) {
    inputs[k].el.disabled = p.useDate;
    if (p.useDate) inputs[k].show(x[k]);
  }
  dateInput.value = toLocalInput(p.date ?? Date.now());
  $("#date-mode").textContent = p.useDate ? (p.date == null ? "now" : "chosen") : "unused";
  play.textContent = p.playing ? "[pause]" : "[play]";
  readout();
  toHash(p);
}
sync();
