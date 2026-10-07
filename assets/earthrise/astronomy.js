// The astronomy behind the earthrise: constants, a lunar ephemeris, and
// everything physical that follows from the scene's parameters. Pure: no DOM.

export const RAD = Math.PI / 180;
const OBLIQUITY = 23.4392911 * RAD; // J2000 mean obliquity of the ecliptic
export const R_MOON = 1737.4; // km, mean radius
const GM_MOON = 4902.8; // km^3/s^2
const R_EARTH = 6371; // km, mean radius
const SIDEREAL_DAY = 86164.1; // s
const SIDEREAL_MONTH = 2360591.5; // s, the Moon's turn round the Earth against the stars
// The Earth turns once a sidereal day against the stars, but the Moon moves on
// round it meanwhile, the same way, so from the Moon one turn takes about 24 h 50 min.
export const EARTH_TURN_FROM_MOON = 1 / (1 / SIDEREAL_DAY - 1 / SIDEREAL_MONTH);

// --- ephemeris -------------------------------------------------------------
// The Sun's ecliptic longitude to low precision, and the Moon's longitude,
// latitude and distance from Meeus's series (Astronomical Algorithms, ch. 47):
// all 60 terms of table 47.A and the 30 largest of 47.B. Good to about 0.01
// degree and 10 km. Longitudes are referred to the mean equinox of date; the
// epoch is taken in UTC rather than TT, a minute's difference that is lost here.
const J2000 = Date.UTC(2000, 0, 1, 12);
// D, M, M', F, then longitude (1e-6 deg) and distance (1e-3 km)
const MOON_LR = [
  [0, 0, 1, 0, 6288774, -20905355],
  [2, 0, -1, 0, 1274027, -3699111],
  [2, 0, 0, 0, 658314, -2955968],
  [0, 0, 2, 0, 213618, -569925],
  [0, 1, 0, 0, -185116, 48888],
  [0, 0, 0, 2, -114332, -3149],
  [2, 0, -2, 0, 58793, 246158],
  [2, -1, -1, 0, 57066, -152138],
  [2, 0, 1, 0, 53322, -170733],
  [2, -1, 0, 0, 45758, -204586],
  [0, 1, -1, 0, -40923, -129620],
  [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755],
  [2, 0, 0, -2, 15327, 10321],
  [0, 0, 1, 2, -12528, 0],
  [0, 0, 1, -2, 10980, 79661],
  [4, 0, -1, 0, 10675, -34782],
  [0, 0, 3, 0, 10034, -23210],
  [4, 0, -2, 0, 8548, -21636],
  [2, 1, -1, 0, -7888, 24208],
  [2, 1, 0, 0, -6766, 30824],
  [1, 0, -1, 0, -5163, -8379],
  [1, 1, 0, 0, 4987, -16675],
  [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445],
  [4, 0, 0, 0, 3861, -11650],
  [2, 0, -3, 0, 3665, 14403],
  [0, 1, -2, 0, -2689, -7003],
  [2, 0, -1, 2, -2602, 0],
  [2, -1, -2, 0, 2390, 10056],
  [1, 0, 1, 0, -2348, 6322],
  [2, -2, 0, 0, 2236, -9884],
  [0, 1, 2, 0, -2120, 5751],
  [0, 2, 0, 0, -2069, 0],
  [2, -2, -1, 0, 2048, -4950],
  [2, 0, 1, -2, -1773, 4130],
  [2, 0, 0, 2, -1595, 0],
  [4, -1, -1, 0, 1215, -3958],
  [0, 0, 2, 2, -1110, 0],
  [3, 0, -1, 0, -892, 3258],
  [2, 1, 1, 0, -810, 2616],
  [4, -1, -2, 0, 759, -1897],
  [0, 2, -1, 0, -713, -2117],
  [2, 2, -1, 0, -700, 2354],
  [2, 1, -2, 0, 691, 0],
  [2, -1, 0, -2, 596, 0],
  [4, 0, 1, 0, 549, -1423],
  [0, 0, 4, 0, 537, -1117],
  [4, -1, 0, 0, 520, -1571],
  [1, 0, -2, 0, -487, -1739],
  [2, 1, 0, -2, -399, 0],
  [0, 0, 2, -2, -381, -4421],
  [1, 1, 1, 0, 351, 0],
  [3, 0, -2, 0, -340, 0],
  [4, 0, -3, 0, 330, 0],
  [2, -1, 2, 0, 327, 0],
  [0, 2, 1, 0, -323, 1165],
  [1, 1, -1, 0, 299, 0],
  [2, 0, 3, 0, 294, 0],
  [2, 0, -1, -2, 0, 8752],
];
// D, M, M', F, then latitude (1e-6 deg)
const MOON_B = [
  [0, 0, 0, 1, 5128122],
  [0, 0, 1, 1, 280602],
  [0, 0, 1, -1, 277693],
  [2, 0, 0, -1, 173237],
  [2, 0, -1, 1, 55413],
  [2, 0, -1, -1, 46271],
  [2, 0, 0, 1, 32573],
  [0, 0, 2, 1, 17198],
  [2, 0, 1, -1, 9266],
  [0, 0, 2, -1, 8822],
  [2, -1, 0, -1, 8216],
  [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200],
  [2, 1, 0, -1, -3359],
  [2, -1, -1, 1, 2463],
  [2, -1, 0, 1, 2211],
  [2, -1, -1, -1, 2065],
  [0, 1, -1, -1, -1870],
  [4, 0, -1, -1, 1828],
  [0, 1, 0, 1, -1794],
  [0, 0, 0, 3, -1749],
  [0, 1, -1, 1, -1565],
  [1, 0, 0, 1, -1491],
  [0, 1, 1, 1, -1475],
  [0, 1, 1, -1, -1410],
  [0, 1, 0, -1, -1344],
  [1, 0, 0, -1, -1335],
  [0, 0, 3, 1, 1107],
  [4, 0, 0, -1, 1021],
  [4, 0, -1, 1, 833],
];
export function ephemeris(ms) {
  const sin = (deg) => Math.sin(deg * RAD),
    cos = (deg) => Math.cos(deg * RAD);
  const d = (ms - J2000) / 86400000; // days from J2000
  const T = d / 36525; // centuries
  const M0 = 357.528 + 0.9856003 * d; // the Sun's mean anomaly, for its longitude
  const sun = 280.46 + 0.9856474 * d + 1.915 * sin(M0) + 0.02 * sin(2 * M0);
  // the Moon's mean longitude and the fundamental arguments (Meeus 47.1-47.5)
  const L = 218.3164477 + 481267.88123421 * T - 0.0015786 * T * T + T ** 3 / 538841 - T ** 4 / 65194000;
  const D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T * T + T ** 3 / 545868 - T ** 4 / 113065000;
  const M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T * T + T ** 3 / 24490000;
  const Mm = 134.9633964 + 477198.8675055 * T + 0.0087414 * T * T + T ** 3 / 69699 - T ** 4 / 14712000;
  const F = 93.272095 + 483202.0175233 * T - 0.0036539 * T * T - T ** 3 / 3526000 + T ** 4 / 863310000;
  const A1 = 119.75 + 131.849 * T,
    A2 = 53.09 + 479264.29 * T,
    A3 = 313.45 + 481266.484 * T;
  const E = 1 - 0.002516 * T - 0.0000074 * T * T; // the Earth's shrinking eccentricity, for terms in M
  const ecc = (m) => (m === 0 ? 1 : Math.abs(m) === 1 ? E : E * E);
  let sl = 0,
    sr = 0,
    sb = 0;
  for (const [a, b, c, f, l, r] of MOON_LR) {
    const arg = a * D + b * M + c * Mm + f * F,
      k = ecc(b);
    sl += l * k * sin(arg);
    sr += r * k * cos(arg);
  }
  for (const [a, b, c, f, l] of MOON_B) sb += l * ecc(b) * sin(a * D + b * M + c * Mm + f * F);
  sl += 3958 * sin(A1) + 1962 * sin(L - F) + 318 * sin(A2);
  sb += -2235 * sin(L) + 382 * sin(A3) + 175 * sin(A1 - F) + 175 * sin(A1 + F) + 127 * sin(L - Mm) - 115 * sin(L + Mm);
  const wrap = (a) => ((a % 360) + 360) % 360;
  const moonLon = wrap(L + sl / 1e6);
  return {
    sunLon: wrap(sun),
    moonLon,
    moonLat: sb / 1e6,
    distance: 385000.56 + sr / 1000,
    elongation: wrap(moonLon - sun),
  };
}

// unit vectors on the ecliptic sphere
const vec = (lon, lat) => [
  Math.cos(lat * RAD) * Math.cos(lon * RAD),
  Math.cos(lat * RAD) * Math.sin(lon * RAD),
  Math.sin(lat * RAD),
];
const dotv = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const unit = (a) => {
  const l = Math.hypot(...a);
  return a.map((c) => c / l);
};

// Everything physical that follows from the parameters, for display as well as drawing.
export function derive(p) {
  const ms = p.date ?? Date.now();
  const eph = ephemeris(ms);
  const rc = R_MOON + p.altitude;
  const period = 2 * Math.PI * Math.sqrt(rc ** 3 / GM_MOON);

  const dip = Math.acos(R_MOON / rc);
  const earthDistance = p.useDate ? eph.distance : p.earthDistance;

  // The camera's frame on the sky. From the Moon's centre the Earth lies
  // opposite the Moon's geocentric place. The orbit is assumed to lie near the
  // ecliptic (real ones are inclined to it: Apollo 8's by about 12 degrees, which
  // skyRoll stands in for), so the sky turns about the ecliptic pole: on screen,
  // ecliptic longitude runs up and down and latitude across. Stars are J2000,
  // so the Earth's place is carried back by the precession.
  const prec = 1.3969713 * ((ms - J2000) / 86400000 / 36525); // deg, general precession in longitude
  const earthLon = (eph.moonLon + 180) % 360,
    earthLat = -eph.moonLat;
  const sgn = p.retrograde ? 1 : -1; // retrograde: north to the right, longitude increasing upward
  const cr = Math.cos(p.skyRoll * RAD),
    sr = Math.sin(p.skyRoll * RAD);
  const frame = (e) => {
    const east = unit([-e[1], e[0], 0]); // toward increasing longitude
    const north = unit([-e[0] * e[2], -e[1] * e[2], 1 - e[2] * e[2]]); // toward the ecliptic's north pole
    return {
      right: [0, 1, 2].map((i) => sgn * (north[i] * cr - east[i] * sr)),
      up: [0, 1, 2].map((i) => sgn * (east[i] * cr + north[i] * sr)),
    };
  };
  // The camera is not at the Moon's centre: with the Earth on its horizon it sits
  // rc out along its zenith, which is the screen's up tipped back by the dip.
  // That parallax moves the Earth about a quarter of a degree against the stars.
  const e0 = vec(earthLon - prec, earthLat);
  const up0 = frame(e0).up;
  const zen = [0, 1, 2].map((i) => Math.cos(dip) * up0[i] - Math.sin(dip) * e0[i]);
  const e = unit([0, 1, 2].map((i) => earthDistance * e0[i] - rc * zen[i]));
  const { right, up } = frame(e);
  // the Earth's spin axis, the celestial pole (J2000), in the camera's frame
  const pole = [0, Math.sin(OBLIQUITY), Math.cos(OBLIQUITY)];
  const earthPole = [dotv(pole, right), dotv(pole, up), -dotv(pole, e)];

  let sun, elongation, moonLit;
  if (p.useDate) {
    // toward the Sun in the camera's frame (x right, y up, z toward the viewer)
    const s = vec(eph.sunLon - prec, 0);
    sun = [dotv(s, right), dotv(s, up), -dotv(s, e)];
    elongation = eph.elongation;
    moonLit = (1 + dotv(s, e)) / 2; // the Moon's phase angle is the supplement of the Earth's
  } else {
    // a chosen phase, the bright limb turned by the limb angle
    const P = Math.min(p.elongation, 360 - p.elongation) * RAD,
      pa = (p.elongation < 180 ? p.limbAngle : 180 - p.limbAngle) * RAD;
    sun = [Math.sin(P) * Math.cos(pa), Math.sin(P) * Math.sin(pa), Math.cos(P)];
    elongation = p.elongation;
    moonLit = (1 - Math.cos(P)) / 2;
  }
  const phaseAngle = Math.acos(Math.max(-1, Math.min(1, sun[2]))) / RAD; // the Earth's, seen from the Moon
  return {
    elongation,
    earthDistance,
    earthLon,
    earthLat,
    period, // s
    orbitalSpeed: (2 * Math.PI * rc) / period, // km/s
    groundSpeed: (2 * Math.PI * R_MOON) / period, // km/s, of the point beneath
    rate: (2 * Math.PI) / period, // rad/s, how fast the sky turns past the limb
    dip, // rad, the horizon below level
    horizonDistance: Math.sqrt(rc * rc - R_MOON * R_MOON), // km, line of sight
    earthDiameter: 2 * Math.asin(R_EARTH / earthDistance), // rad
    phaseAngle, // deg
    limbAngle: Math.atan2(sun[1], sun[0]) / RAD, // deg, the bright limb's position angle on screen
    earthLit: (1 + Math.cos(phaseAngle * RAD)) / 2, // the Earth's illuminated fraction
    moonLit,
    waxing: elongation < 180,
    sun,
    axes: { e, right, up },
    earthPole,
  };
}
