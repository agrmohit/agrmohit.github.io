// An earthrise seen from lunar orbit, the way Apollo 8 saw it, drawn in halftone dots.
//
// The camera rides a circular orbit looking ahead at the limb. Everything moves
// on the orbit's clock: the ground flows toward the camera, and the Earth and
// the stars rise together over the horizon (over minutes the Earth hardly moves
// against the stars). Stars do not twinkle, there being no air. The Earth shows
// the phase opposite to the Moon's, computed for the chosen date, at its true
// angular size for the Earth-Moon distance on that date.
//
// Physical inputs are in real units; a few artistic ones are marked as such.
// earthrise(canvas, params) starts it; the returned object updates and reads it.
// The physics lives in astronomy.js, the stars in stars.js, the Earth's surface in earth-texture.js.

import { RAD, R_MOON, EARTH_TURN_FROM_MOON, derive, unit } from "./astronomy.js";
import { catalogue, loadStars } from "./stars.js";
import { sampleEarth } from "./earth-texture.js";

export const DEFAULTS = {
  // --- physics ---
  date: null, // ms since the epoch, or null for now
  useDate: true, // take the phase and the Earth's distance from the date
  elongation: 90, // deg, the Moon's elongation from the Sun when not using the date
  earthDistance: 384400, // km, centre to centre, when not using the date
  limbAngle: 90, // deg, the bright limb's position angle (from the right, toward up) when not using the date; an orbit near the ecliptic keeps it near ±90
  altitude: 110, // km, the orbit's height (Apollo 8: ~110)
  retrograde: true, // the orbit's direction; Apollo's were retrograde
  realLight: false, // light the ground by the Sun's real elevation (often night); off keeps it low, from the real direction
  skyRoll: 0, // deg; 0 for an orbit in the ecliptic. An orbit inclined to it rolls the sky by up to its inclination, the sign set by where the node lies
  timeScale: 0.3, // 1 is real time
  fov: 10, // deg across the canvas's longer side (Apollo 8: 250 mm lens on a 56 mm square frame, 12.8 on a side)
  limitingMag: 8, // faintest star shown, up to 8; in a wide view, past 6.5 the faint catalogue (195 kB) loads
  // --- artistic ---
  horizon: 0.62, // where the horizon sits, as a fraction of the screen's height
  craterStretch: 4, // 1 is true; above that, craters are stretched along the track to read at all
  craterDensity: 1,
  earthTint: 0.58, // 0 is grey, 1 is full colour
  amax: 0.32, // the brightest any dot may be; 0.32 keeps the site's text at 4.5:1 or better
  cell: 0, // dot pitch in px; 0 picks 9 on wide screens and 7 on narrow
  fps: 10,
  playing: true,
  progress: 0.35, // where in the pass to start, 0 to 1
};

// Settings from a URL's query string or hash, such as "date=1883984400000&earthTint=0.7": "1" or "0" for
// a boolean, ms since the epoch (or nothing, for now) for the date, a number for the rest. Others are ignored
export function fromURL(query) {
  const p = {};
  for (const [k, v] of new URLSearchParams(query)) {
    if (!(k in DEFAULTS)) continue;
    const d = DEFAULTS[k];
    if (typeof d === "boolean") p[k] = v === "1";
    else if (k === "date") p[k] = v && Number.isFinite(+v) ? +v : null;
    else if (v !== "" && Number.isFinite(+v)) p[k] = +v;
  }
  return p;
}

// --- drawing constants -------------------------------------------------------
const INK = [196, 202, 214];
const FADE = 3; // s, the crossfade between passes

// --- noise -----------------------------------------------------------------
const hash = (x, y) => {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => {
  const k = clamp((v - a) / (b - a));
  return k * k * (3 - 2 * k);
};

// Value noise for the ground, reading its lattice from a table of hashes built
// per layout over the area a whole pass can reach: the same values as hashing
// each time, without the hashing.
const latticeNoise = (x, y, L) => {
  const xi = Math.floor(x),
    yi = Math.floor(y);
  const fx = x - xi,
    fy = y - yi;
  const u = fx * fx * (3 - 2 * fx),
    v = fy * fy * (3 - 2 * fy);
  const nw = L.nw,
    A = L.A,
    o = (yi - L.y0) * nw + (xi - L.x0);
  const a = A[o],
    b = A[o + 1],
    c = A[o + nw],
    d = A[o + nw + 1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
const latticeFbm = (x, y, octaves) => {
  let s = 0,
    n = 0,
    amp = 0.5,
    f = 1;
  for (let i = 0; i < octaves.length; i++) {
    s += amp * latticeNoise(x * f, y * f, octaves[i]);
    n += amp;
    amp *= 0.5;
    f *= 2;
  }
  return s / n;
};
// the hash lattice for fbm(u / scale + offset, s / scale) over u0..u1, s0..s1, one table an octave
const lattice = (scale, octaves, offset, u0, u1, s0, s1) => {
  const out = [];
  for (let o = 0, f = 1; o < octaves; o++, f *= 2) {
    const x0 = Math.floor((u0 / scale + offset) * f) - 1,
      x1 = Math.floor((u1 / scale + offset) * f) + 2;
    const y0 = Math.floor((s0 / scale) * f) - 1,
      y1 = Math.floor((s1 / scale) * f) + 2;
    const nw = x1 - x0 + 1,
      nh = y1 - y0 + 1,
      A = new Float64Array(nw * nh);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) A[y * nw + x] = hash(x + x0, y + y0);
    out.push({ x0, y0, nw, A });
  }
  return out;
};

// Ordered dither so faint areas break into sparse dots rather than a grey wash.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

export function earthrise(canvas, params = {}) {
  const ctx = canvas.getContext("2d");
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const p = { ...DEFAULTS, ...params };
  let tanDip, phys, sun, az, colors, W, H, cell, cols, rows, dpr, scale, horizonY, stars, loop, e0;
  let raf = 0,
    timer = 0,
    last = 0,
    t = 0,
    first = true,
    started = false,
    shownFade = "";
  const listeners = new Set();

  // --- the lunar surface, in km: along the track (s, from the nadir) and across it (u) ---
  // Craters: every crater a pass can reach, placed by the same hashes as ever, is
  // listed once per layout, and each one's reach (1.25 r) is binned into a grid of
  // small buckets, so a ground cell only tests the few craters that can touch it.
  // Both sizes share the grid: shade is a min and rim a max over all of them.
  let craterList, craterGrid;
  const craterSet = (out, cellKm, salt, r0, r1, p0, u0, u1, s0, s1) => {
    const pr = clamp(p0 * p.craterDensity);
    for (let j = Math.floor(s0 / cellKm) - 1; j <= Math.floor(s1 / cellKm) + 1; j++)
      for (let i = Math.floor(u0 / cellKm) - 1; i <= Math.floor(u1 / cellKm) + 1; i++) {
        if (hash(i + salt, j - salt) > pr) continue;
        const e = hash(j + salt, i - salt * 7),
          r = cellKm * (r0 + (r1 - r0) * e * e);
        out.push((i + hash(i, j + salt * 3)) * cellKm, (j + hash(i + salt * 5, j)) * cellKm, r, 1.25 * r);
      }
  };
  const buildCraters = (u0, u1, s0, s1) => {
    const C = [];
    craterSet(C, 40, 11, 0.15, 0.42, 0.8, u0, u1, s0, s1);
    craterSet(C, 14, 23, 0.15, 0.4, 0.7, u0, u1, s0, s1);
    const h = 3.5, // km a bucket
      bx0 = Math.floor(u0 / h) - 1,
      by0 = Math.floor(s0 / h) - 1;
    const bw = Math.floor(u1 / h) + 2 - bx0,
      bh = Math.floor(s1 / h) + 2 - by0;
    const start = new Int32Array(bw * bh + 1);
    const each = (fn) => {
      for (let c = 0; c < C.length; c += 4) {
        const R = C[c + 3];
        const xa = Math.max(0, Math.floor((C[c] - R) / h) - bx0),
          xb = Math.min(bw - 1, Math.floor((C[c] + R) / h) - bx0);
        const ya = Math.max(0, Math.floor((C[c + 1] - R) / h) - by0),
          yb = Math.min(bh - 1, Math.floor((C[c + 1] + R) / h) - by0);
        for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) fn(y * bw + x, c);
      }
    };
    // count, prefix-sum, fill: each bucket's craters sit together in one flat array
    each((q) => start[q + 1]++);
    for (let q = 0; q < bw * bh; q++) start[q + 1] += start[q];
    const fill = start.slice(0, bw * bh),
      items = new Int32Array(start[bw * bh]);
    each((q, c) => (items[fill[q]++] = c));
    craterList = Float64Array.from(C);
    craterGrid = { h, bx0, by0, bw, start, items };
  };
  let albedoLarge, albedoSmall, G; // noise lattices, and the ground cells as flat arrays

  // --- drawing -----------------------------------------------------------------
  // Every dot sits at the centre of a grid cell, and each frame records what each
  // cell should hold as one small key: colour and brightness level (0 is empty).
  // Only cells whose key changed are cleared and redrawn, which at the default
  // speed is a percent or two of them. The rest of the canvas is left alone.
  // Changed dots are gathered by key and each key drawn as one path with one fill.
  // LEVELS steps in alpha are under 0.006 apart at the default cap, too fine to see.
  const LEVELS = 32;
  const colorIds = new Map(); // rgb array -> small integer, reset with each layout
  const colorList = [];
  const buckets = []; // key -> flat [x, y, x, y, ...], reused between frames
  const styles = []; // key -> fillStyle string
  const radii = []; // level -> radius in px
  let cur, next, full; // keys drawn, keys wanted; full: redraw everything
  const colorId = (rgb) => {
    let id = colorIds.get(rgb);
    if (id === undefined) {
      colorIds.set(rgb, (id = colorIds.size));
      colorList[id] = rgb;
    }
    return id;
  };
  const levelOf = (b) => Math.round((b < 1 ? b : 1) * (LEVELS - 1));
  // a dot of brightness b at a cell centre; below a quarter a cell holds the smallest dot or none
  const dot = (x, y, b, rgb) => {
    if (b <= 0) return;
    const c = Math.floor(x / cell),
      r = Math.floor(y / cell);
    if (c < 0 || c >= cols || r < 0 || r >= rows) return;
    if (b < 0.25 && b * 4 < BAYER[(r & 3) * 4 + (c & 3)]) return;
    // two stars can snap into one cell: keep the brighter
    const i = r * cols + c,
      level = levelOf(b);
    if (next[i] && (next[i] - 1) % LEVELS >= level) return;
    next[i] = colorId(rgb) * LEVELS + level + 1;
  };
  const styleOf = (key) => {
    if (!styles[key]) {
      const rgb = colorList[(key / LEVELS) | 0],
        a = p.amax * (0.45 + 0.55 * ((key % LEVELS) / (LEVELS - 1)));
      styles[key] = `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]} / ${a.toFixed(4)})`;
    }
    return styles[key];
  };
  const paint = () => {
    const n = cur.length;
    let changed = 0;
    for (let i = 0; i < n; i++) if (next[i] !== cur[i]) changed++;
    if (!changed && !full) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // past a quarter of the cells, one clear and a full redraw is cheaper than clearing each
    const all = full || changed > n / 4;
    if (all) ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < n; i++) {
      const k = next[i];
      if (!all && k === cur[i]) continue;
      const c = i % cols,
        r = (i / cols) | 0;
      if (!all) ctx.clearRect(c * cell, r * cell, cell, cell);
      if (k) (buckets[k - 1] ??= []).push((c + 0.5) * cell, (r + 0.5) * cell);
    }
    for (let key = 0; key < buckets.length; key++) {
      const pts = buckets[key];
      if (!pts || !pts.length) continue;
      const rad = radii[key % LEVELS];
      ctx.fillStyle = styleOf(key);
      ctx.beginPath();
      for (let i = 0; i < pts.length; i += 2) {
        ctx.moveTo(pts[i] + rad, pts[i + 1]);
        ctx.arc(pts[i], pts[i + 1], rad, 0, Math.PI * 2);
      }
      ctx.fill();
      pts.length = 0;
    }
    [cur, next] = [next, cur];
    full = false;
  };

  // The horizon is a small circle round the nadir, of angular radius 90deg - dip;
  // off the centre line by angle th it sags by th^2/2 * tan(dip).
  const horizon = (x) => {
    const th = (x - W / 2) / scale;
    return horizonY + ((th * th) / 2) * tanDip * scale;
  };

  const layout = () => {
    phys = derive(p);
    tanDip = Math.tan(phys.dip);
    sun = phys.sun; // toward the Sun, in the camera's frame (x right, y up, z toward the viewer)
    // The Sun over the ground. The camera looks at the horizon, dip below level,
    // so its frame is the local one tipped by the dip: split the Sun into
    // across the track, along it (forward), and toward the zenith.
    const cd = Math.cos(phys.dip),
      sd = Math.sin(phys.dip);
    const sunZen = sun[1] * cd + sun[2] * sd,
      sunFwd = sun[1] * sd - sun[2] * cd;
    const real = p.realLight;
    const azl = Math.hypot(sun[0], sunFwd) || 1;
    // the shadows always fall away from the real Sun; only its elevation is ours to fix
    az = Math.hypot(sun[0], sunFwd) > 1e-3 ? [sun[0] / azl, sunFwd / azl] : [1, 0];
    const wash = (c) => c.map((v, i) => Math.round(INK[i] + (v - INK[i]) * p.earthTint));
    colors = {
      sea: wash([80, 140, 230]),
      land: wash([150, 175, 120]),
      // stars by temperature: blue-white, white, yellow, orange
      stars: [[170, 190, 255], INK, [255, 236, 200], [255, 205, 160]].map((c) =>
        c.map((v, i) => Math.round(INK[i] + (v - INK[i]) * 0.5)),
      ),
    };

    dpr = Math.min(devicePixelRatio || 1, 2);
    W = canvas.clientWidth || innerWidth;
    H = canvas.clientHeight || innerHeight;
    canvas.width = Math.round(W * dpr); // also clears it
    canvas.height = Math.round(H * dpr);
    cell = p.cell || (W < 600 ? 7 : 9);
    colorIds.clear();
    colorList.length = 0;
    buckets.length = 0;
    styles.length = 0;
    for (let l = 0; l < LEVELS; l++) radii[l] = cell * 0.44 * Math.sqrt(Math.max(l / (LEVELS - 1), 0.25));
    cols = Math.ceil(W / cell);
    rows = Math.ceil(H / cell);
    cur = new Uint16Array(cols * rows);
    next = new Uint16Array(cols * rows);
    full = true;
    scale = Math.max(W, H) / (p.fov * RAD); // px per radian: fov spans the longer side
    horizonY = H * p.horizon;

    // one pass: the Earth from just hidden to well up the sky
    e0 = -phys.earthDiameter * 0.55;
    loop = Math.max(FADE * 3, ((horizonY / scale) * 0.55 - e0) / (phys.rate * p.timeScale)); // s on screen

    // where each ground cell looks: a ray down onto the sphere
    const rc = R_MOON + p.altitude;
    const gi = [],
      gu = [],
      gs = [],
      gk = [],
      gl = [],
      gsh = [],
      glimb = [],
      gb = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c + 0.5) * cell,
          y = (r + 0.5) * cell;
        const hy = horizon(x);
        if (y < hy) continue;
        const beta = phys.dip + (y - hy) / scale;
        const cb = Math.cos(beta),
          sb = Math.sin(beta);
        const disc = R_MOON * R_MOON - rc * rc * cb * cb;
        if (disc < 0) continue; // looking past the limb (only when the horizon is placed oddly)
        const d = rc * sb - Math.sqrt(disc);
        const gamma = Math.atan2(d * cb, rc - d * sb);
        const th = (x - W / 2) / scale;
        // a little darker toward the bottom of the screen, to keep the reading area quiet
        const k = 1 - 0.3 * smooth(0.1, 1, (y - hy) / (H - hy));
        // the Sun's elevation where this ray lands, gamma of arc ahead: day, a low
        // Sun with long shadows, or night with only a little earthshine
        const sinEl = real ? sunZen * Math.cos(gamma) + sunFwd * Math.sin(gamma) : 0.2;
        gi.push(r * cols + c);
        gs.push(R_MOON * gamma);
        gu.push(d * th); // across the track the ray lands d * th to the side (R sin(gamma) / cos(beta) = d)
        gk.push(k);
        gl.push(smooth(-0.005, 0.02, sinEl) * (0.6 + 0.4 * smooth(0, 0.5, sinEl)));
        gsh.push(1 - smooth(0.2, 0.9, sinEl));
        glimb.push(y - hy < cell * 1.5 ? 1 : 0); // the limb catches the light
        gb.push(BAYER[(r & 3) * 4 + (c & 3)]);
      }
    }
    const n = gi.length;
    G = {
      n,
      i: Int32Array.from(gi),
      u: Float64Array.from(gu),
      s: Float64Array.from(gs),
      k: Float64Array.from(gk),
      light: Float64Array.from(gl),
      shadows: Float64Array.from(gsh),
      limb: Uint8Array.from(glimb),
      bayer: Float64Array.from(gb),
    };
    // the ground a whole pass can reach, for the crater index and the noise lattices
    let u0 = 0,
      u1 = 0,
      s0 = 0,
      s1 = 0;
    for (let i = 0; i < n; i++) {
      const u = G.u[i],
        s = G.s[i];
      if (i === 0 || u < u0) u0 = u;
      if (i === 0 || u > u1) u1 = u;
      if (i === 0 || s < s0) s0 = s;
      if (i === 0 || s > s1) s1 = s;
    }
    s1 += phys.groundSpeed * p.timeScale * loop; // the farthest the ground travels in a pass
    buildCraters(u0, u1, s0 / p.craterStretch, s1 / p.craterStretch);
    albedoLarge = lattice(70, 3, 20, u0, u1, s0, s1);
    albedoSmall = lattice(4, 2, 0, u0, u1, s0, s1);

    layoutStars();
  };

  // the real sky round the Earth, projected onto the screen (gnomonic) about
  // the Earth's direction; kept as offsets from the Earth, since they rise together
  // Which star files this view needs. A narrow view never strays far from the
  // ecliptic, so it makes do with the band within 12 degrees of it (45 kB, not 249);
  // wider or rolled views take the whole sky.
  const starFiles = () => {
    const roll = p.skyRoll * RAD;
    // the farthest from the Earth's latitude a visible star can sit: half the width
    // across, plus up to the full height once the sky is rolled
    const across = ((W / 2) * Math.abs(Math.cos(roll)) + H * Math.abs(Math.sin(roll))) / scale / RAD;
    const reach = Math.abs(phys.earthLat) + 0.5 + across; // 0.5: the camera's parallax, with room to spare
    if (reach <= 12) return ["ecliptic"];
    return p.limitingMag <= 6.5 ? ["bright"] : ["bright", "faint"];
  };
  const layoutStars = () => {
    const tint = (ci) => colors.stars[ci < 0 ? 0 : ci < 0.5 ? 1 : ci < 1.1 ? 2 : 3];
    const { e, right, up } = phys.axes;
    const er = (phys.earthDiameter / 2) * scale;
    stars = [];
    for (const name of starFiles()) {
      if (!catalogue[name]) {
        // when it arrives, only the stars need placing again
        loadStars(name).then(() => {
          if (!catalogue[name] || !phys) return;
          layoutStars();
          if (started && !raf && !timer) draw();
        });
        continue;
      }
      const { n, xyz, mag, ci } = catalogue[name];
      for (let i = 0; i < n; i++) {
        if (mag[i] > p.limitingMag) break; // brightest first
        const sx = xyz[i * 3],
          sy = xyz[i * 3 + 1],
          sz = xyz[i * 3 + 2];
        const z = sx * e[0] + sy * e[1] + sz * e[2];
        if (z < 0.2) continue;
        const dx = ((sx * right[0] + sy * right[1] + sz * right[2]) / z) * scale,
          dy = -((sx * up[0] + sy * up[1] + sz * up[2]) / z) * scale;
        if (Math.abs(dx) > W / 2 + cell || Math.abs(dy) > 2 * H) continue;
        if (Math.hypot(dx, dy) < er + cell) continue; // always behind the Earth's disc
        // magnitudes are already a perceptual scale: brightness linear in them,
        // from the faintest shown to Sirius at -1.5
        const b = 0.25 + 0.75 * clamp((p.limitingMag - mag[i]) / (p.limitingMag + 1.5));
        stars.push({ dx, dy, b, tint: tint(ci[i]) });
      }
    }
  };

  const draw = () => {
    next.fill(0);
    // the crossfade between passes is the canvas's opacity: composited, and it leaves every dot's key alone
    const fade = (smooth(0, FADE, t) * smooth(loop, loop - FADE, t)).toFixed(2);
    if (started && fade !== shownFade) canvas.style.opacity = shownFade = fade;

    const rise = phys.rate * p.timeScale * t; // rad the sky has turned this pass
    const ex = W / 2,
      er = (phys.earthDiameter / 2) * scale,
      ey = horizonY - (e0 + rise) * scale;

    // stars, rising with the Earth, hidden by the Moon's limb
    for (const st of stars) {
      const x = ex + st.dx,
        y = ey + st.dy;
      if (y < 0 || y >= horizon(x) - cell * 0.5) continue;
      // snap to the dot grid so stars keep the halftone's rhythm
      dot((Math.floor(x / cell) + 0.5) * cell, (Math.floor(y / cell) + 0.5) * cell, st.b, st.tint);
    }

    // the Earth, turning at its real rate as seen from the Moon
    // the surface turns east, from pa toward pb, so a fixed spot's longitude grows
    const spin = -((t * p.timeScale + (p.date ?? 0) / 1000) / EARTH_TURN_FROM_MOON);
    // the Earth's axis on screen, and two directions round its equator to measure longitude from
    const pole = phys.earthPole;
    const pa = unit([pole[1], -pole[0], 0]); // pole x line of sight: never degenerate, the pole stays within ~30 degrees of the sky plane
    const pb = [
      pole[1] * pa[2] - pole[2] * pa[1],
      pole[2] * pa[0] - pole[0] * pa[2],
      pole[0] * pa[1] - pole[1] * pa[0],
    ];
    const c0 = Math.floor((ex - er) / cell) - 2,
      c1 = Math.ceil((ex + er) / cell) + 2;
    const r0 = Math.max(0, Math.floor((ey - er) / cell) - 2),
      r1 = Math.ceil((ey + er) / cell) + 2;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const x = (c + 0.5) * cell,
          y = (r + 0.5) * cell;
        if (y >= horizon(x) - cell * 0.5) continue; // still behind the Moon
        const nx = (x - ex) / er,
          ny = -(y - ey) / er,
          d2 = nx * nx + ny * ny;
        if (d2 > 1) {
          // a thin rim of air on the sunward limb
          const d = Math.sqrt(d2);
          if (d < 1 + (1.2 * cell) / er && (nx * sun[0] + ny * sun[1]) / d > 0.2 && sun[2] < 0.95)
            dot(x, y, 0.3, colors.sea);
          continue;
        }
        const nz = Math.sqrt(1 - d2);
        const lam = nx * sun[0] + ny * sun[1] + nz * sun[2];
        // the globe's own coordinates, about its real axis
        const lat = Math.asin(Math.max(-1, Math.min(1, nx * pole[0] + ny * pole[1] + nz * pole[2])));
        const lon =
          Math.atan2(nx * pb[0] + ny * pb[1] + nz * pb[2], nx * pa[0] + ny * pa[1] + nz * pa[2]) / (Math.PI * 2);
        const surface = sampleEarth(lon + spin, 0.5 - lat / Math.PI);
        let b = surface === 2 ? 0.72 : surface === 1 ? 0.55 : 0.45;
        b *= 0.8 + 0.2 * nz; // limb darkening
        if (lam < 0) b = 0.08 * clamp(1 + lam * 3); // the night side: only a faint ghost of the disc
        dot(x, y, b, surface === 2 ? INK : surface === 1 ? colors.land : colors.sea);
      }
    }

    // the ground, flowing toward us at the orbit's ground speed
    const travel = phys.groundSpeed * p.timeScale * t;
    // earthshine on the night side, made a good deal brighter than it is, or the ground would vanish
    const shine = 0.14 * phys.earthLit;
    const ink = colorId(INK) * LEVELS + 1;
    const { n, i: GI, u: GU, s: GS, k: GK, light: GL, shadows: GH, limb: LIMB, bayer: BAY } = G;
    const { h, bx0, by0, bw, start, items } = craterGrid;
    const CR = craterList,
      a0 = az[0],
      a1 = az[1],
      stretch = p.craterStretch;
    for (let i = 0; i < n; i++) {
      const u = GU[i],
        s = GS[i] + travel;
      // maria and highlands, then the craters
      const albedo =
        0.3 + 0.3 * latticeFbm(u / 70 + 20, s / 70, albedoLarge) + 0.12 * (latticeFbm(u / 4, s / 4, albedoSmall) - 0.5);
      const sv = s / stretch,
        k = GH[i]; // how strongly a low Sun throws the craters into shadow
      let shade = 1,
        rim = 0;
      const bq = (Math.floor(sv / h) - by0) * bw + (Math.floor(u / h) - bx0);
      for (let q = start[bq], qe = start[bq + 1]; q < qe; q++) {
        const c = items[q],
          r = CR[c + 2],
          reach = CR[c + 3],
          ux = u - CR[c],
          sy = sv - CR[c + 1];
        if (ux >= reach || ux <= -reach || sy >= reach || sy <= -reach) continue;
        const dx = ux / r,
          ds = sy / r,
          q2 = dx * dx + ds * ds;
        if (q2 >= 1.5625) continue; // beyond 1.25 r
        const toward = dx * a0 + ds * a1; // along the Sun's azimuth
        if (q2 < 0.8464) {
          // inside 0.92 r: the inner wall facing the Sun (on the side away from it) is lit; the near wall shades the floor
          const v = 1 - k * (0.96 - 1.3 * smooth(-0.3, -0.8, toward));
          if (v < shade) shade = v;
          if (toward < -0.5) {
            const w = k * 0.95 * smooth(-0.5, -0.88, toward);
            if (w > rim) rim = w;
          }
        } else if (toward > 0) {
          const w = k * 0.8 * smooth(1.25, 1.0, Math.sqrt(q2)); // the outer rim's sunward slope
          if (w > rim) rim = w;
        }
      }
      let lit = albedo * shade;
      if (rim > lit) lit = rim;
      const light = GL[i];
      let b = lit * light + albedo * shine;
      if (LIMB[i] && b < 0.5 * light + shine) b = 0.5 * light + shine;
      b *= GK[i];
      if (b <= 0 || (b < 0.25 && b * 4 < BAY[i])) continue;
      next[GI[i]] = ink + levelOf(b);
    }

    paint();
    for (const f of listeners) f(t / loop);
  };

  // Frames: sleep until the next is nearly due, then take one animation frame for it.
  // A pending requestAnimationFrame wakes the page on every display refresh, so
  // waiting for one only when a frame is due cuts 60-120 wakeups a second to about 20.
  // The timer wakes a display refresh early, so the frame lands on time rather than one refresh late.
  const schedule = () => {
    const wait = Math.max(0, last + 1000 / p.fps - performance.now() - 17);
    timer = setTimeout(() => {
      timer = 0;
      raf = requestAnimationFrame(tick);
    }, wait);
  };
  const tick = (now) => {
    // still a little early: take the next refresh instead
    if (now - last < 1000 / p.fps - 4) return void (raf = requestAnimationFrame(tick));
    raf = 0;
    t += Math.min(now - last, 250) / 1000;
    if (t >= loop) t = 0;
    last = now;
    draw();
    schedule();
  };
  const run = () => {
    const go = started && p.playing && !document.hidden && !still.matches;
    if (go && !raf && !timer) {
      last = performance.now();
      schedule();
    } else if (!go) {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      timer = raf = 0;
    }
  };

  // Measuring the canvas makes the browser lay out the page, so the first measure waits until something
  // needs it: just after the page's first paint, or a caller asking for the physics sooner.
  let laidOut = false;
  const rebuild = () => {
    // keep the same point in the pass when its length changes
    const phase = first ? p.progress : loop ? t / loop : 0;
    first = false;
    laidOut = true;
    layout();
    t = phase * loop;
    if (started) draw();
  };
  let pending = 0;
  const onResize = () => {
    clearTimeout(pending);
    pending = setTimeout(rebuild, 150);
  };
  // Watch the canvas itself, which can change size without the window doing so. The observer
  // always reports once on starting, after the page's layout: that report only notes the size.
  let seen;
  const ro = new ResizeObserver(() => {
    const size = `${canvas.clientWidth}x${canvas.clientHeight}`;
    if (seen && size !== seen) onResize();
    seen = size;
  });
  ro.observe(canvas);
  // a move to a screen of another density changes devicePixelRatio but not the canvas's size
  let dprQuery;
  const watchDpr = () => {
    dprQuery?.removeEventListener("change", onDpr);
    dprQuery = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
    dprQuery.addEventListener("change", onDpr);
  };
  const onDpr = () => {
    watchDpr();
    onResize();
  };
  watchDpr();
  still.addEventListener("change", run);
  document.addEventListener("visibilitychange", run);

  // Start after the page's first paint, once the stars have come (or 300 ms have
  // passed), and fade the canvas in: one layout and one draw instead of one per
  // arrival, nothing in the way of the page's own first paint, and no stars popping in.
  canvas.style.opacity = "0";
  const begin = () => {
    if (started) return;
    started = true;
    draw();
    // an animation rather than a transition, which would need a frame at opacity 0 first
    if (!still.matches) canvas.animate({ opacity: [0, shownFade] }, 800);
    run();
  };
  let waiting = true;
  const start = () => {
    if (!waiting) return;
    waiting = false;
    if (!laidOut) rebuild(); // the size picks the star files
    Promise.race([loadStars(starFiles()[0]), new Promise((r) => setTimeout(r, 300))]).then(begin);
  };
  requestAnimationFrame(() => setTimeout(start));
  // a page in a background tab, or in a headless browser, can go without frames for a while
  setTimeout(start, 1000);

  return {
    params: () => ({ ...p }),
    physics: () => {
      if (!laidOut) rebuild();
      return { ...phys, passDuration: loop * p.timeScale, passLength: loop };
    },
    // change any parameters; the scene is rebuilt, keeping its place in the pass
    update(next) {
      Object.assign(p, next);
      if ("progress" in next) first = true;
      rebuild();
      run();
    },
    onProgress(f) {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    destroy() {
      clearTimeout(timer);
      clearTimeout(pending);
      cancelAnimationFrame(raf);
      ro.disconnect();
      dprQuery?.removeEventListener("change", onDpr);
      still.removeEventListener("change", run);
      document.removeEventListener("visibilitychange", run);
    },
  };
}
