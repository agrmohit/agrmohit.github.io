// HTML text helpers shared by the project page and the index/sitemap regions.

import type { Root } from "hast";
import { raw } from "hast-util-raw";
import { toText } from "hast-util-to-text";
import { BuildError } from "./errors.ts";

/** `text` safe inside an element or a double-quoted attribute. */
export const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * `template` with each `{{name}}` replaced by its value escaped, and each `{{{name}}}` by its value as is.
 * Throws on a slot with no value and on a value with no slot, so a template and its caller can't drift apart.
 */
export function fillSlots(template: string, values: Readonly<Record<string, string>>): string {
  const unused = new Set(Object.keys(values));
  const filled = template.replace(
    /\{\{\{(\w+)\}\}\}|\{\{(\w+)\}\}/g,
    (slot, raw: string | undefined, text: string | undefined) => {
      const name = raw ?? text ?? "";
      const value = values[name];
      if (value === undefined) throw new BuildError(`template slot ${slot} has no value`);
      unused.delete(name);
      return raw !== undefined ? value : escapeHtml(value);
    },
  );
  if (unused.size > 0) throw new BuildError(`no template slot for ${[...unused].join(", ")}`);
  return filled;
}

/**
 * Text of an HTML snippet (a blurb): tags dropped, entities decoded, runs of whitespace folded.
 * Parsed as a browser would (parse5, through hast-util-raw): a regex can't strip tags safely, since an
 * unfinished tag like "a <script" matches no pattern and would pass through.
 */
export function plainText(html: string): string {
  const tree: Root = { type: "root", children: [{ type: "raw", value: html }] };
  return toText(raw(tree)).trim();
}
