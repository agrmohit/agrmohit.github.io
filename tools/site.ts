// The parts of hand-written files that the manifest owns: the projects list on the home page and the project
// entries in sitemap.xml. Each sits between a pair of marker comments; everything outside them is left alone.

import { BuildError } from "./errors.ts";
import { escapeHtml } from "./html.ts";
import { type Entry, LICENSES } from "./manifest.ts";

/** `text` with the lines between its `<!-- name:start` and `<!-- name:end` lines replaced by `inner`. */
export function replaceRegion(text: string, name: string, inner: string): string {
  const start = `<!-- ${name}:start`;
  const end = `<!-- ${name}:end`;
  const a = text.indexOf(start);
  const b = text.indexOf(end);
  if (a < 0 || b < 0 || b < a || text.includes(start, a + 1) || text.includes(end, b + 1))
    throw new BuildError(`expected one "${start} ... -->" and one "${end} ... -->" marker, in that order`);
  const afterStart = text.indexOf("\n", a) + 1;
  const endLine = text.lastIndexOf("\n", b) + 1;
  return text.slice(0, afterStart) + inner + text.slice(endLine);
}

/** `lines` with each non-empty line indented by `n` spaces. */
const indent = (lines: string, n: number): string =>
  lines
    .split("\n")
    .map((line) => (line === "" ? line : " ".repeat(n) + line))
    .join("\n");

/** One project in the home page's list, in the markup the hand-written entries used. */
export function listItem(entry: Entry): string {
  const id = `project-${entry.slug}`;
  const title = escapeHtml(entry.title ?? "");
  const repoUrl = entry.kind === "local" ? undefined : `https://github.com/${entry.repo}`;
  // the title opens the project's page when it has one; data-url names the repo whose stars the page shows
  const name =
    entry.kind === "list"
      ? title
      : `<a href="${entry.path}" data-umami-event="${id}-page" data-umami-event-source="project-list">${title}</a>`;
  const meta: string[] = [];
  if (entry.license !== undefined)
    meta.push(
      `<small title="${escapeHtml(LICENSES[entry.license])}">${escapeHtml(entry.license.toLowerCase())}</small>`,
    );
  if (repoUrl !== undefined)
    meta.push(`<small
  ><a
    aria-label="${title} repo on GitHub"
    href="${repoUrl}?ref=agrmohit.com"
    data-umami-event="${id}"
    data-umami-event-source="project-list"
    >repo</a
  ></small
>`);
  return indent(
    `<li class="project${repoUrl === undefined ? "" : " github-project"}">
  <header>
    <h3 id="${id}"${repoUrl === undefined ? "" : ` data-url="${repoUrl}"`}>
      ${name}<a
        aria-label="link to this section: ${title}"
        href="#${id}"
        class="anchor-link"
        data-umami-event="anchor-link"
        data-umami-event-targetid="${id}"
        >&hairsp;🔗</a
      >
    </h3>
    <p>
      ${entry.blurb ?? ""}
    </p>
${indent(meta.join("\n"), 4)}
  </header>
</li>`,
    8,
  );
}

/** index.html with its projects list rebuilt from the manifest, in manifest order. */
export function withProjectList(indexHtml: string, entries: readonly Entry[]): string {
  const items = entries.filter((entry) => entry.list).map(listItem);
  return replaceRegion(indexHtml, "projects", `${items.join("\n\n")}\n`);
}

/** sitemap.xml with its project pages rebuilt from the manifest. */
export function withSitemap(sitemap: string, entries: readonly Entry[]): string {
  const pages = entries.filter((entry) => entry.kind !== "list").filter((entry) => entry.sitemap);
  const urls = pages.map((page) => `  <url>\n    <loc>https://agrmohit.com${page.path}</loc>\n  </url>\n`);
  return replaceRegion(sitemap, "projects", urls.join(""));
}
