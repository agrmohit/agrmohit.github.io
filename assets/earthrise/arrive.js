// Runs in <head>, before the first paint: if the last page left its sky behind (handoff.js), hide the text so
// it can fade in rather than flash. Whether the handoff is valid is transition.js's call: it shows the text again
// as soon as it loads if not. Classic, not a module, since a module would run after the first paint.
(() => {
  let raw = null;
  try {
    raw = sessionStorage?.getItem("earthrise:handoff") ?? null; // the key handoff.js writes
  } catch (error) {
    // a browser that blocks site data throws on reading sessionStorage: no handoff, a plain load
    if (!(error instanceof DOMException && error.name === "SecurityError")) throw error;
  }
  if (raw === null || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const reload = performance
    .getEntriesByType("navigation")
    .some((entry) => entry instanceof PerformanceNavigationTiming && entry.type === "reload");
  if (reload) return;
  document.documentElement.classList.add("arriving");
  // only if transition.js never loads: it shows the text itself once the sky's first frame is drawn, or 1 s on
  setTimeout(() => document.documentElement.classList.remove("arriving"), 2000);
})();
