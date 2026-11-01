// HTML text helpers shared by the project page and the index/sitemap regions.

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

// the named entities a blurb may use; any other is refused rather than shown as "&name;"
const ENTITIES = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", "\u00a0"],
  ["hairsp", "\u200a"],
  ["thinsp", "\u2009"],
  ["ensp", "\u2002"],
  ["emsp", "\u2003"],
  ["ndash", "\u2013"],
  ["mdash", "\u2014"],
  ["hellip", "\u2026"],
]);

/** Text of an HTML snippet (a blurb): tags dropped, entities decoded, runs of ordinary whitespace folded. */
export function plainText(html: string): string {
  return html
    .replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, "") // a tag, even with a > inside a quoted attribute
    .replace(/[ \t\r\n]+/g, " ")
    .trim()
    .replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (entity, name: string) => {
      if (name.startsWith("#")) {
        const code = /^#x/i.test(name) ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        if (code > 0x10ffff) throw new BuildError(`${entity} is not a character`);
        return String.fromCodePoint(code);
      }
      const char = ENTITIES.get(name);
      if (char === undefined) throw new BuildError(`can't decode ${entity}; use the character itself`);
      return char;
    });
}
