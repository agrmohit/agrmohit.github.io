// A "$ copy" button on each long code block of a project page; copy-rules.js decides which blocks and what text.
//
// Each block is wrapped in a .code-frame that doesn't scroll, and the button sits in its top-right corner, so it
// stays in place while a long line scrolls sideways. The button shows on hover and keyboard focus (CSS), and on
// touch, which has no hover, after a tap inside the block. Umami counts clicks through its data attributes.

import { copiedText, isLong } from "./copy-rules.js";

const RESET_MS = 2000;
const slug = window.location.pathname.split("/")[2] ?? "";

for (const pre of document.querySelectorAll(".readme pre")) {
  const text = pre.textContent ?? "";
  if (isLong(text)) addButton(pre, copiedText(text));
}

// a tap outside a block hides its button again
document.addEventListener("pointerdown", (event) => {
  for (const frame of document.querySelectorAll(".code-frame.shown"))
    if (!(event.target instanceof Node && frame.contains(event.target))) frame.classList.remove("shown");
});

/**
 * Wraps `pre` in a frame with a button that copies `text`.
 * @param {Element} pre the code block
 * @param {string} text what the button copies
 */
function addButton(pre, text) {
  const frame = document.createElement("div");
  frame.className = "code-frame";
  pre.replaceWith(frame);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "copy-code";
  button.textContent = "copy";
  button.setAttribute("aria-label", "copy this code");
  button.dataset["umamiEvent"] = "copy-code";
  button.dataset["umamiEventSource"] = `project-page-${slug}`;

  // read out by screen readers, which don't see the label's colour change
  const status = document.createElement("span");
  status.className = "sr-only";
  status.setAttribute("aria-live", "polite");

  frame.append(pre, button, status);

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let reset;
  button.addEventListener("click", async () => {
    let copied = true;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      copied = false; // the browser refused, e.g. a page not served over https
    }
    button.textContent = copied ? "copied" : "can't copy";
    button.classList.toggle("copied", copied);
    button.classList.toggle("failed", !copied);
    status.textContent = copied ? "copied" : "could not copy";
    clearTimeout(reset);
    reset = setTimeout(() => {
      button.textContent = "copy";
      button.classList.remove("copied", "failed");
      status.textContent = "";
    }, RESET_MS);
  });

  frame.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse") frame.classList.add("shown");
  });
}
