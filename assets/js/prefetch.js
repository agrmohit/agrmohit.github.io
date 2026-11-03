// Fetches a project page before the click: speculation rules in Chromium, else fetch() on a 65 ms hover or a press,
// which warms the HTTP cache. ?prefetch=0 switches both off for the tab.

import { tabStorage } from "../earthrise/handoff.js";
import { prefetchOn, prefetchTarget, SPECULATION_RULES } from "./prefetch-rules.js";

const KEY = "prefetch";
// instant.page's figure: by 65 ms of hover, half of links are clicked
const HOVER_MS = 65;

const storage = tabStorage(window);
const asked = new URLSearchParams(location.search).get("prefetch");
if (asked !== null) storage?.setItem(KEY, asked);

// Save-Data, as Chromium's speculation honours it. navigator.connection is Chromium-only, so untyped
const connection = "connection" in navigator ? navigator.connection : null;
const savingData = typeof connection === "object" && connection !== null && "saveData" in connection;
const wanted = prefetchOn(asked, storage?.getItem(KEY) ?? null) && !(savingData && connection.saveData === true);

if (wanted && HTMLScriptElement.supports?.("speculationrules")) {
  // allowed by the CSP's 'inline-speculation-rules'
  const rules = document.createElement("script");
  rules.type = "speculationrules";
  rules.textContent = SPECULATION_RULES;
  document.head.append(rules);
} else if (wanted) {
  /** @type {Set<string>} */
  const fetched = new Set();
  /** @param {string} url */
  const warm = (url) => {
    if (fetched.has(url)) return;
    fetched.add(url);
    // a failed prefetch is harmless; forget it so a later hover retries
    fetch(url, { priority: "low" }).catch(() => fetched.delete(url));
  };
  /** @param {EventTarget | null} target */
  const targetOf = (target) => {
    const link = target instanceof Element ? target.closest("a[href]") : null;
    return link ? prefetchTarget(link.getAttribute("href") ?? "", location.href) : null;
  };

  let timer = 0;
  document.addEventListener("pointerover", (event) => {
    const url = targetOf(event.target);
    clearTimeout(timer);
    if (url) timer = setTimeout(() => warm(url), HOVER_MS);
  });
  document.addEventListener("pointerout", () => clearTimeout(timer));
  // a press, mouse or touch, starts the fetch before transition.js's sink delays the navigation
  document.addEventListener("pointerdown", (event) => {
    const url = targetOf(event.target);
    if (url) warm(url);
  });
}
