// Page transitions between the home page and the project pages, over one sky.
// Home -> project: the clock stops, the Earth and the ground sink while the text fades, and the next page takes up
// the sky through sessionStorage (handoff.js). Project -> home: the text fades, and home rises from below as its
// text fades in. Back and forward: see onLeave.
// arrive.js hides the text before the first paint, so it fades in rather than flashes.

import { tabStorage, takeHandoff, writeHandoff } from "./handoff.js";

/** @typedef {import("./scene.js").Scene} Scene */
/** @typedef {import("./handoff.js").Moment} Moment */

const storage = tabStorage(window);

// A debugging aid: ?slowmo=10 on any page plays every transition ten times slower, to see each frame; the tab
// keeps it until ?slowmo=1. Only the transitions slow down: the sky's own clock is held while they run.
const SLOWMO_KEY = "earthrise:slowmo";
function slowmo() {
  const asked = new URLSearchParams(location.search).get("slowmo");
  if (asked !== null) storage?.setItem(SLOWMO_KEY, asked);
  const factor = Number(storage?.getItem(SLOWMO_KEY) ?? asked ?? 1);
  return factor >= 1 && factor <= 100 ? factor : 1;
}
const SLOW = slowmo();

// the home page's sink and rise
const SINK_MS = 450 * SLOW;
// the Earth sinks this many times as far as the ground, so it falls ahead of it, like something farther off
// moving faster across the view: a parallax. It is gone behind the Moon's limb before the ground has left
const EARTH_PARALLAX = 1.6;
// the home page's text fade, which runs alongside the sink
const HOME_TEXT_MS = 300 * SLOW;
// an exit waits on animation frames, which a hidden tab does not get; past this it navigates anyway
const EXIT_CAP_MS = 1000 * SLOW;
// a project page has no Earth to move, so its text fade is the whole transition
const TEXT_MS = 150 * SLOW;
// a page still here this long after navigating never left (Stop pressed, a download, a 204): it comes back.
// Long enough that a slow network starting the next page does not trip it first
const STALL_MS = 10_000 * SLOW;

const still = matchMedia("(prefers-reduced-motion: reduce)");
const root = document.documentElement;

/** Whether this document was loaded by a reload, which is not an arrival. */
const reloaded = () =>
  performance
    .getEntriesByType("navigation")
    .some((entry) => entry instanceof PerformanceNavigationTiming && entry.type === "reload");

// Each transition runs under a generation. A newer one, or the page being hidden, bumps it, and the older one
// stops where it is: so a sink frozen by the back button cannot finish and navigate when the page comes back.
let generation = 0;
const begin = () => {
  const mine = ++generation;
  return () => mine === generation;
};

/** @param {number} ms */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Eases `apply` from `from` to `to` over ms on animation frames: ease-in as the value grows (the Earth and the
 * ground sinking), ease-out as it shrinks (rising).
 * @param {number} from
 * @param {number} to
 * @param {number} ms
 * @param {() => boolean} alive false once a newer transition has begun
 * @param {(value: number) => void} apply
 * @returns {Promise<void>}
 */
function animate(from, to, ms, alive, apply) {
  /** @param {number} k 0 to 1 */
  const easeIn = (k) => k * k * k;
  /** @param {number} k 0 to 1 */
  const easeOut = (k) => 1 - (1 - k) ** 3;
  const ease = to > from ? easeIn : easeOut;
  return new Promise((resolve) => {
    const t0 = performance.now();
    /** @param {number} now */
    const step = (now) => {
      if (!alive()) return resolve();
      // an animation frame's time can be a little before t0
      const k = Math.max(0, Math.min(1, (now - t0) / ms));
      apply(from + (to - from) * ease(k));
      if (k < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

/**
 * Hides or shows the page's text over ms (the CSS in style.css does the fade).
 * @param {boolean} hidden
 * @param {number} ms
 */
function setTextHidden(hidden, ms) {
  root.style.setProperty("--text-fade", `${ms}ms`);
  root.classList.toggle("text-hidden", hidden);
  if (!hidden) root.classList.remove("arriving");
  return wait(ms);
}

/**
 * The sky the last page left, as scene settings, or null. A reload is not an arrival.
 * @returns {{ date: number, progress: number, fadeIn: false } | null}
 */
export function skyFromLastPage() {
  const moment = takeHandoff(storage, Date.now());
  return moment && !reloaded() ? { ...moment, fadeIn: false } : null;
}

// On a back or forward restore, Chrome runs the old page's pagehide and this page's pageshow at once, in two
// processes, so the handoff may not have landed yet. Look a few times over 200 ms before going without.
/** @returns {Promise<Moment | null>} */
async function restoredMoment() {
  for (let tries = 1; ; tries++) {
    const moment = takeHandoff(storage, Date.now());
    if (moment || tries === 5) return moment;
    await wait(50);
  }
}

/**
 * Resolves on the scene's first frame, or after a second if the sky never draws: the text must still show.
 * @param {Scene} scene
 */
function firstFrame(scene) {
  /** @type {Promise<void>} */
  const drawn = new Promise((resolve) => {
    const off = scene.onProgress(() => {
      off();
      resolve();
    });
  });
  return Promise.race([drawn, wait(1000)]);
}

/**
 * Sends the event Umami's own click handler would: the name, and data from data-umami-event-<key> attributes.
 * @param {HTMLAnchorElement} link
 */
function track(link) {
  const name = link.dataset["umamiEvent"];
  if (!name) return;
  /** @type {Record<string, string>} */
  const data = {};
  for (const { name: attribute, value } of link.attributes) {
    const key = /^data-umami-event-(.+)$/.exec(attribute)?.[1];
    if (key) data[key] = value;
  }
  /** @type {Window & { umami?: { track(name: string, data: Record<string, string>): unknown } }} */
  const page = window;
  void page.umami?.track(name, data);
}

/**
 * Plays `exit` instead of the navigation, for a plain left click on a link `wanted` accepts.
 * The listener is on window in the capture phase, so it runs before Umami's: that one cancels the click on a
 * tracked link and navigates as soon as its request returns, mid-exit. This one stops the click, so `exit`
 * sends the click's Umami event itself (track), once it knows the click starts an exit.
 * @param {(link: HTMLAnchorElement) => boolean} wanted
 * @param {(link: HTMLAnchorElement) => Promise<void>} exit
 */
function onLinkClick(wanted, exit) {
  addEventListener(
    "click",
    (event) => {
      const plain = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
      if (still.matches || !plain || !(event.target instanceof Element)) return;
      const link = event.target.closest("a");
      if (!link || link.target || link.hasAttribute("download") || link.origin !== location.origin) return;
      if (!wanted(link)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void exit(link);
    },
    { capture: true },
  );
}

/**
 * Navigates to href. If the page is still here STALL_MS later, the navigation never happened, so `recover`
 * brings the page back; pagehide (a real departure) bumps the generation and cancels that.
 * @param {string} href
 * @param {() => boolean} alive
 * @param {() => unknown} recover
 */
function leave(href, alive, recover) {
  location.href = href;
  setTimeout(() => {
    if (alive()) recover();
  }, STALL_MS);
}

/*
 * Back and forward
 *
 * The browser cannot be made to wait before a back or forward navigation, so the page being left cannot play
 * its exit. Instead each page puts itself in its exit state as it is hidden: home sinks the Earth and the
 * ground, and every page hides its text. A page restored from the bfcache comes back in that state and plays
 * its entrance, taking up the sky the other page left. A page the browser discarded loads afresh and arrives
 * through arrive.js and skyFromLastPage, as after a click.
 */

/**
 * @param {Scene} scene
 * @param {() => void} exitState puts the page in its exit state at once
 */
function onLeave(scene, exitState) {
  addEventListener("pagehide", () => {
    generation++; // a transition still running must not finish if the page comes back
    if (!still.matches) {
      void setTextHidden(true, 0);
      exitState();
    }
    // last: a storage that throws on writing (full) loses only the handoff, not the exit state
    writeHandoff(storage, scene.moment(), Date.now());
  });
}

/**
 * @param {Scene} scene
 * @param {() => Promise<void>} enter plays the entrance from the exit state
 * @param {() => void} settle shows the page at once, for reduced motion
 */
function onRestore(scene, enter, settle) {
  addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    void (async () => {
      const moment = await restoredMoment();
      if (moment) scene.update(moment);
      if (still.matches) return settle();
      // pagehide hid the text as the page went away, maybe never styled; style it now, so the fade starts hidden
      void getComputedStyle(document.body).opacity;
      await enter();
    })();
  });
}

/**
 * The home page: the Earth and the ground rise when it is arrived at, and sink on the way to a project.
 * @param {Scene} scene
 * @param {boolean} arriving whether the last page left its sky to this one
 */
export function homeTransitions(scene, arriving) {
  let sunk = 0; // 0 in place, 1 the ground a full window below
  let leaving = false;
  /** @param {number} to */
  const setSunk = (to) => {
    sunk = to;
    scene.sink({ earth: to * EARTH_PARALLAX * innerHeight, ground: to * innerHeight });
  };
  /**
   * Sinks (to 1) or raises (to 0) the Earth and the ground while the text fades out or in.
   * @param {0 | 1} to
   * @param {() => boolean} alive
   */
  const move = (to, alive) => {
    void setTextHidden(to === 1, HOME_TEXT_MS);
    return animate(sunk, to, SINK_MS, alive, setSunk);
  };

  const enter = async () => {
    const alive = begin();
    scene.hold();
    await move(0, alive);
    if (alive()) scene.release();
  };
  const settle = () => {
    setSunk(0);
    scene.release();
    void setTextHidden(false, 0);
  };

  if (arriving && !still.matches) {
    scene.hold();
    setSunk(1);
    void firstFrame(scene).then(enter);
  } else void setTextHidden(false, 0); // arrive.js may have hidden it for a handoff that turned out stale

  onLeave(scene, () => {
    scene.hold();
    setSunk(1);
  });
  onRestore(
    scene,
    () => {
      leaving = false;
      return enter();
    },
    () => {
      leaving = false;
      settle();
    },
  );

  // the earthrise lab draws the whole scene itself, so it gets a plain navigation
  const isProject = (/** @type {HTMLAnchorElement} */ link) =>
    link.pathname.startsWith("/projects/") && link.pathname !== "/projects/earthrise/";
  onLinkClick(isProject, async (link) => {
    if (leaving) return; // a second click while leaving: swallowed, and not counted twice
    leaving = true;
    track(link);
    const alive = begin();
    scene.hold();
    try {
      await Promise.race([move(1, alive), wait(EXIT_CAP_MS)]);
    } finally {
      if (alive())
        leave(link.href, alive, () => {
          leaving = false;
          return enter();
        });
    }
  });
}

/**
 * A project page: the text fades in when it is arrived at, and out on the way home.
 * @param {Scene} scene
 * @param {boolean} arriving whether the last page left its sky to this one
 */
export function projectTransitions(scene, arriving) {
  let leaving = false;
  if (arriving && !still.matches) void firstFrame(scene).then(() => setTextHidden(false, TEXT_MS));
  else void setTextHidden(false, 0); // arrive.js may have hidden it for a handoff that turned out stale

  onLeave(scene, () => {});
  onRestore(
    scene,
    () => {
      leaving = false;
      return setTextHidden(false, TEXT_MS);
    },
    () => {
      leaving = false;
      void setTextHidden(false, 0);
    },
  );

  onLinkClick(
    (link) => link.pathname === "/",
    async (link) => {
      if (leaving) return; // a second click while leaving: swallowed, and not counted twice
      leaving = true;
      track(link);
      const alive = begin();
      try {
        await setTextHidden(true, TEXT_MS);
      } finally {
        if (alive())
          leave(link.href, alive, () => {
            leaving = false;
            return setTextHidden(false, TEXT_MS);
          });
      }
    },
  );
}
