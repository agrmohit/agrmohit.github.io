// The handoff that carries the sky from one page to the next (transition.js), kept in the tab's sessionStorage.
// The home and project pages leave one as they are hidden, by a link or the back and forward buttons alike,
// and the next of them takes it up. It touches no DOM, so tools/test/handoff.test.ts tests it under bun.

// stored as "<at> <date> <progress>": ms since the epoch when written, the sky's date, and 0 to 1 through the pass.
// arrive.js reads the same key, only to see that something waits
const KEY = "earthrise:handoff";
const FRESH_MS = 5000; // a handoff older than this belongs to some other visit

/**
 * The tab's sessionStorage, or null where the browser blocks site data: then reading
 * `sessionStorage` throws a SecurityError, and the pages load with no transition.
 * @param {{ readonly sessionStorage: Storage }} win the window, or a stand-in in tests
 * @returns {Storage | null}
 */
export function tabStorage(win) {
  try {
    return win.sessionStorage;
  } catch (error) {
    if (error instanceof DOMException && error.name === "SecurityError") return null;
    throw error;
  }
}

/**
 * @typedef {{ date: number, progress: number }} Moment where the sky is: ms since the epoch, and 0 to 1 through the pass
 */

/**
 * Leaves the sky's moment for whichever page comes next.
 * @param {Storage | null} storage from tabStorage
 * @param {Moment} moment
 * @param {number} now ms since the epoch
 */
export function writeHandoff(storage, moment, now) {
  storage?.setItem(KEY, [now, moment.date, moment.progress].join(" "));
}

/**
 * The moment the last page left, or null if there is none or it is stale. Reading it uses it up.
 * @param {Storage | null} storage from tabStorage
 * @param {number} now ms since the epoch
 * @returns {Moment | null}
 */
export function takeHandoff(storage, now) {
  const raw = storage?.getItem(KEY) ?? null;
  if (raw === null) return null;
  storage?.removeItem(KEY);
  const fields = raw.split(" ");
  // Number("") is 0, so an empty field would read as the epoch
  if (fields.length !== 3 || fields.includes("")) return null;
  const [at, date, progress] = fields.map(Number);
  // the undefined checks are for noUncheckedIndexedAccess: three fields always give three numbers
  if (at === undefined || date === undefined || progress === undefined) return null;
  if (!Number.isFinite(at) || !Number.isFinite(date) || !(progress >= 0 && progress <= 1)) return null;
  if (now - at > FRESH_MS || now < at) return null;
  return { date, progress };
}
