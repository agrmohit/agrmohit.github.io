// The rules for the copy button on code blocks; copy.js puts them on the page.
// They touch no DOM, so tools/test/copy-rules.test.ts tests them under bun.

/**
 * Whether a code block gets a copy button: 2 or more lines, or one line over 40 characters.
 * @param {string} text the block's text as shown
 * @returns {boolean}
 */
export function isLong(text) {
  const lines = copiedText(text).split("\n");
  return lines.length > 1 || (lines[0] ?? "").length > 40;
}

/**
 * What the button copies: the block's text as shown, without the newline that ends it.
 * @param {string} text the block's text as shown
 * @returns {string}
 */
export function copiedText(text) {
  return text.endsWith("\n") ? text.slice(0, -1) : text;
}
