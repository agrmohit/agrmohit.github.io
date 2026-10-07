// The star catalogue: HYG v4.1 to magnitude 8 in J2000 ecliptic coordinates, decoded into
// flat typed arrays. See data/STARS-LICENSE.md for the source, licence and format.

// --- the star catalogue ---------------------------------------------------------
// HYG v4.1 (CC BY-SA 4.0) to magnitude 8, J2000 ecliptic, 6 bytes a star; see
// data/STARS-LICENSE.md. Three files, each loaded only when a view needs it: the band
// within 12 degrees of the ecliptic (10 kB), the whole sky to 6.5 (54 kB), and 6.5 to 8 (195 kB).
export const catalogue = { ecliptic: null, bright: null, faint: null };
const loading = {};
export function loadStars(name) {
  loading[name] ??= fetch(new URL(`./data/stars-${name}.bin`, import.meta.url))
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
    .then((buf) => {
      // flat typed arrays: a unit vector, magnitude and colour index per star
      const v = new DataView(buf),
        n = buf.byteLength / 6;
      const xyz = new Float32Array(n * 3),
        mag = new Float32Array(n),
        ci = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const o = i * 6;
        const lon = (v.getUint16(o, true) / 65536) * 2 * Math.PI,
          lat = (v.getInt16(o + 2, true) / 32767) * (Math.PI / 2);
        xyz[i * 3] = Math.cos(lat) * Math.cos(lon);
        xyz[i * 3 + 1] = Math.cos(lat) * Math.sin(lon);
        xyz[i * 3 + 2] = Math.sin(lat);
        mag[i] = v.getUint8(o + 4) / 25 - 2;
        ci[i] = v.getInt8(o + 5) / 60;
      }
      catalogue[name] = { n, xyz, mag, ci };
    })
    .catch((err) => console.warn("earthrise: no star catalogue", err));
  return loading[name];
}
