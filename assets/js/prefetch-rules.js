// prefetch.js's DOM-free rules, tested in tools/test/prefetch-rules.test.ts.

/** Speculation rules, parsed by the browser. "eager": a 10 ms hover on desktop, in view on a phone. */
export const SPECULATION_RULES = JSON.stringify({
  prefetch: [{ where: { href_matches: "/projects/*" }, eagerness: "eager" }],
});

/**
 * Whether to prefetch. Only "0" switches it off; the tab keeps the last ask.
 * @param {string | null} asked the query string's `prefetch`, or null when absent
 * @param {string | null} kept what the tab stored from an earlier ask, or null
 * @returns {boolean}
 */
export function prefetchOn(asked, kept) {
  return (asked ?? kept) !== "0";
}

/**
 * The URL to fetch for a link, without its fragment, or null if it is not a project page on this site.
 * @param {string} href the link's href, as written
 * @param {string} page the current page's URL, which a relative href resolves against
 * @returns {string | null}
 */
export function prefetchTarget(href, page) {
  const url = new URL(href, page);
  if (url.origin !== new URL(page).origin || !url.pathname.startsWith("/projects/")) return null;
  url.hash = "";
  return url.href;
}
