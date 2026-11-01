import { describe, expect, it } from "bun:test";
import type { Entry, ListEntry, LocalEntry, ReadmeEntry } from "../manifest.ts";
import { listItem, replaceRegion, withProjectList, withSitemap } from "../site.ts";
import { failure } from "./failure.ts";

const DOC = "head\n  <!-- p:start, note -->\n  old\n  <!-- p:end -->\ntail\n";

describe("replaceRegion", () => {
  interface Row {
    name: string;
    text: string;
    inner: string;
    want: string;
  }

  const rows: readonly Row[] = [
    {
      name: "replaces the lines between the markers",
      text: DOC,
      inner: "  new\n",
      want: "head\n  <!-- p:start, note -->\n  new\n  <!-- p:end -->\ntail\n",
    },
    {
      name: "empties the region",
      text: DOC,
      inner: "",
      want: "head\n  <!-- p:start, note -->\n  <!-- p:end -->\ntail\n",
    },
    {
      name: "fills an empty region",
      text: "a\n<!-- p:start -->\n<!-- p:end -->\nb",
      inner: "x\n",
      want: "a\n<!-- p:start -->\nx\n<!-- p:end -->\nb",
    },
  ];

  it.each(rows)("$name", ({ text, inner, want }) => {
    expect(replaceRegion(text, "p", inner)).toBe(want);
  });

  it.each(rows)("$name, the same on a second run", ({ text, inner }) => {
    const once = replaceRegion(text, "p", inner);
    expect(replaceRegion(once, "p", inner)).toBe(once);
  });

  interface Refusal {
    name: string;
    text: string;
  }

  const refusals: readonly Refusal[] = [
    { name: "no markers", text: "head\ntail\n" },
    { name: "only a start", text: "<!-- p:start -->\n" },
    { name: "the end before the start", text: "<!-- p:end -->\n<!-- p:start -->\n" },
    { name: "two starts", text: "<!-- p:start -->\n<!-- p:start -->\n<!-- p:end -->\n" },
    { name: "two ends", text: "<!-- p:start -->\n<!-- p:end -->\n<!-- p:end -->\n" },
  ];

  it.each(refusals)("refuses $name", ({ text }) => {
    expect(failure(() => replaceRegion(text, "p", "x\n"))).toContain('expected one "<!-- p:start ... -->"');
  });
});

const README: ReadmeEntry = {
  kind: "readme",
  slug: "app",
  repo: "o/app",
  ref: { kind: "tag", name: "v1" },
  path: "/projects/app/",
  title: "app",
  blurb: 'an <span class="explanation" title="t">app</span>',
  license: "MIT",
  list: true,
  sitemap: true,
  card: { title: undefined, subtitle: undefined },
  drop: [],
};
const LIST_ONLY: ListEntry = {
  kind: "list",
  slug: "lib",
  repo: "o/lib",
  title: "lib",
  blurb: "a lib",
  license: undefined,
  list: true,
};
const LOCAL: LocalEntry = {
  kind: "local",
  slug: "sky",
  path: "/projects/sky/",
  title: "sky",
  blurb: "the sky",
  license: undefined,
  list: true,
  sitemap: true,
  card: { title: "Sky", subtitle: "a\nb" },
};

describe("listItem", () => {
  interface Row {
    name: string;
    entry: Entry;
    wanted: string[];
    unwanted: string[];
  }

  const rows: readonly Row[] = [
    {
      name: "a page entry links its title to the page",
      entry: README,
      wanted: [
        '<a href="/projects/app/"',
        'data-url="https://github.com/o/app"',
        'class="project github-project"',
        '<small title="MIT License">mit</small>',
        'href="https://github.com/o/app?ref=agrmohit.com"',
        'title="t">app</span>',
      ],
      unwanted: [],
    },
    {
      name: "a list-only entry has no page link",
      entry: LIST_ONLY,
      wanted: ['id="project-lib"', 'data-url="https://github.com/o/lib"'],
      unwanted: ["/projects/"],
    },
    {
      name: "a local entry has no repo, so no stars",
      entry: LOCAL,
      wanted: ['<li class="project">', '<a href="/projects/sky/"'],
      unwanted: ["github", "data-url", "repo</a"],
    },
    {
      name: "no licence, no licence tag",
      entry: { ...README, license: undefined },
      wanted: ["repo</a"],
      unwanted: ["<small title"],
    },
    { name: "the title is escaped", entry: { ...README, title: "a<b" }, wanted: ["a&lt;b"], unwanted: ["a<b"] },
  ];

  it.each(rows)("$name", ({ entry, wanted, unwanted }) => {
    const html = listItem(entry);
    expect({ held: wanted.filter((s) => html.includes(s)), stray: unwanted.filter((s) => html.includes(s)) }).toEqual({
      held: wanted,
      stray: [],
    });
  });
});

describe("the owned regions", () => {
  const INDEX = "<ul>\n<!-- projects:start -->\n<!-- projects:end -->\n</ul>\n";
  const SITEMAP = "<urlset>\n  <!-- projects:start -->\n  <!-- projects:end -->\n</urlset>";

  interface Row {
    name: string;
    entries: Entry[];
    want: string[];
  }

  const listRows: readonly Row[] = [
    {
      name: "in manifest order",
      entries: [README, LIST_ONLY, LOCAL],
      want: ["project-app", "project-lib", "project-sky"],
    },
    { name: "unlisted entries left out", entries: [README, { ...LIST_ONLY, list: false }], want: ["project-app"] },
    { name: "none", entries: [], want: [] },
  ];

  it.each(listRows)("list: $name", ({ entries, want }) => {
    const ids = [...withProjectList(INDEX, entries).matchAll(/<h3 id="([\w-]+)"/g)].map((match) => match[1]);
    expect(ids).toEqual(want);
  });

  const sitemapRows: readonly Row[] = [
    {
      name: "pages with the sitemap on",
      entries: [README, LIST_ONLY, LOCAL],
      want: ["https://agrmohit.com/projects/app/", "https://agrmohit.com/projects/sky/"],
    },
    { name: "the sitemap turned off", entries: [{ ...README, sitemap: false }], want: [] },
    { name: "none", entries: [], want: [] },
  ];

  it.each(sitemapRows)("sitemap: $name", ({ entries, want }) => {
    const locs = [...withSitemap(SITEMAP, entries).matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    expect(locs).toEqual(want);
  });
});
