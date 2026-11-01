import { describe, expect, it } from "bun:test";
import { checkManifest, type Entry } from "../manifest.ts";
import { failure } from "./failure.ts";

const PAGE = { repo: "o/app", tag: "v1.0.0", title: "app", blurb: "an app" };
const SHA = "a".repeat(40);

/** The one entry of a manifest holding only `entry`. */
function one(entry: Record<string, unknown>): Entry {
  const [checked] = checkManifest({ projects: [entry] });
  if (checked === undefined) throw new Error("no entry");
  return checked;
}

/** `entry` without the keys set to undefined, as a manifest would leave them out. */
const without = (entry: Record<string, unknown>, ...keys: string[]): Record<string, unknown> =>
  Object.fromEntries(Object.entries(entry).filter(([key]) => !keys.includes(key)));

describe("valid entries", () => {
  interface Row {
    name: string;
    entry: Record<string, unknown>;
    /** The fields the checked entry must have; others are not looked at. */
    want: Record<string, unknown>;
  }

  const rows: readonly Row[] = [
    {
      name: "a README page at a tag",
      entry: PAGE,
      want: {
        kind: "readme",
        slug: "app",
        ref: { kind: "tag", name: "v1.0.0" },
        path: "/projects/app/",
        card: { title: undefined, subtitle: undefined },
        sitemap: true,
        list: true,
        drop: [],
      },
    },
    {
      name: "a README page at a commit",
      entry: { ...without(PAGE, "tag"), commit: SHA },
      want: { kind: "readme", ref: { kind: "commit", sha: SHA } },
    },
    {
      name: "a README page from a local readme",
      entry: { ...without(PAGE, "tag"), readme: "../app/README.md" },
      want: { kind: "readme", ref: { kind: "local", file: "../app/README.md" } },
    },
    {
      name: "its own slug",
      entry: { ...PAGE, slug: "the-app" },
      want: { slug: "the-app", path: "/projects/the-app/" },
    },
    {
      name: "a tag with dots, a plus and an underscore",
      entry: { ...PAGE, tag: "v2026.10_1+b" },
      want: { ref: { kind: "tag", name: "v2026.10_1+b" } },
    },
    {
      name: "sections to drop",
      entry: { ...PAGE, drop: ["Star History", "Build"] },
      want: { drop: ["Star History", "Build"] },
    },
    { name: "the card turned off", entry: { ...PAGE, card: false }, want: { card: false } },
    {
      name: "the card's text given",
      entry: { ...PAGE, card: { title: "App", subtitle: "a\nb" } },
      want: { card: { title: "App", subtitle: "a\nb" } },
    },
    {
      name: "kept out of the list and the sitemap",
      entry: { repo: "o/app", tag: "v1", list: false, sitemap: false },
      want: { list: false, sitemap: false, title: undefined },
    },
    {
      name: "list-only",
      entry: { repo: "o/lib", page: false, title: "lib", blurb: "a lib", license: "MIT" },
      want: { kind: "list", slug: "lib", license: "MIT" },
    },
    {
      name: "a local page",
      entry: { path: "/projects/sky/", list: false, card: { title: "Sky" } },
      want: { kind: "local", slug: "sky", path: "/projects/sky/", sitemap: true },
    },
    {
      name: "a local page without a card",
      entry: { path: "/projects/sky/", list: false, card: false },
      want: { kind: "local", card: false },
    },
    {
      name: "a local page's card named by its title",
      entry: { path: "/projects/sky/", title: "Sky", blurb: "b", card: { subtitle: "s" } },
      want: { card: { title: "Sky", subtitle: "s" } },
    },
    {
      name: "a local page's card title wins over its title",
      entry: { path: "/projects/sky/", title: "sky", blurb: "b", card: { title: "Sky" } },
      want: { card: { title: "Sky", subtitle: undefined } },
    },
    {
      name: "a local page with the default card, named by its title",
      entry: { path: "/projects/sky/", title: "Sky", blurb: "b" },
      want: { card: { title: "Sky", subtitle: undefined } },
    },
  ];

  it.each(rows)("$name", ({ entry, want }) => {
    expect(one(entry)).toMatchObject(want);
  });

  it("keeps the manifest's order and accepts $schema", () => {
    const entries = checkManifest({
      $schema: "./x.json",
      projects: [
        { ...PAGE, repo: "o/b" },
        { ...PAGE, repo: "o/a" },
      ],
    });
    expect(entries.map((entry) => entry.slug)).toEqual(["b", "a"]);
  });
});

describe("refused entries", () => {
  interface Row {
    name: string;
    entry: Record<string, unknown>;
    message: string;
  }

  const listOnly = { repo: "o/lib", page: false, title: "l", blurb: "b" };
  const rows: readonly Row[] = [
    { name: "both a tag and a commit", entry: { ...PAGE, commit: SHA }, message: "not tag and commit" },
    { name: "a tag and a local readme", entry: { ...PAGE, readme: "x.md" }, message: "not tag and readme" },
    { name: "no ref", entry: without(PAGE, "tag"), message: "needs a tag or a commit" },
    { name: "a short commit", entry: { ...without(PAGE, "tag"), commit: "abc123" }, message: "full 40-character SHA" },
    {
      name: "a commit one character short",
      entry: { ...without(PAGE, "tag"), commit: "a".repeat(39) },
      message: "full 40-character SHA",
    },
    {
      name: "a commit in capitals",
      entry: { ...without(PAGE, "tag"), commit: "A".repeat(40) },
      message: "full 40-character SHA",
    },
    { name: "a bad repo", entry: { ...PAGE, repo: "app" }, message: "owner/name" },
    { name: "an unknown key", entry: { ...PAGE, colour: "red" }, message: 'unknown key "colour"' },
    { name: "an unknown card key", entry: { ...PAGE, card: { colour: "red" } }, message: 'unknown key "card.colour"' },
    {
      name: "a card text that is not a string",
      entry: { ...PAGE, card: { title: 1 } },
      message: '"card.title" must be a string',
    },
    { name: "a card that is neither", entry: { ...PAGE, card: "big" }, message: '"card" must be a boolean or object' },
    { name: "a flag of the wrong type", entry: { ...PAGE, list: "yes" }, message: '"list" must be a boolean' },
    { name: "a text of the wrong type", entry: { ...PAGE, title: 7 }, message: '"title" must be a string' },
    { name: "card: true", entry: { ...PAGE, card: true }, message: '"card": true is the default' },
    { name: "page: true", entry: { ...PAGE, page: true }, message: '"page": true is the default' },
    { name: "listed without a title", entry: without(PAGE, "title"), message: "needs a title" },
    { name: "listed without a blurb", entry: without(PAGE, "blurb"), message: "needs a blurb" },
    { name: "an unknown licence", entry: { ...PAGE, license: "WTFPL" }, message: 'unknown license "WTFPL"' },
    { name: "a list-only entry with a ref", entry: { ...listOnly, tag: "v1" }, message: "takes no tag" },
    { name: "a list-only entry with a card", entry: { ...listOnly, card: false }, message: "no card or sitemap" },
    {
      name: "a list-only entry without a repo",
      entry: without(listOnly, "repo"),
      message: "list-only entry needs a repo",
    },
    {
      name: "a local page with a repo",
      entry: { path: "/projects/sky/", repo: "o/sky", list: false, card: { title: "S" } },
      message: "takes no repo",
    },
    {
      name: "a local page's path",
      entry: { path: "/sky/", list: false, card: { title: "S" } },
      message: "/projects/<slug>/",
    },
    {
      name: "a local page with its own slug, which could share another entry's files",
      entry: { path: "/projects/sky/", slug: "other", title: "S", blurb: "b" },
      message: "takes its slug from its path",
    },
    {
      name: "a local page's card without a title",
      entry: { path: "/projects/sky/", list: false },
      message: "needs card.title or title",
    },
    { name: "a bad slug", entry: { ...PAGE, slug: "The App" }, message: "lower-case" },
    { name: "a tag that could close a comment", entry: { ...PAGE, tag: "v1-->x" }, message: "tag may hold only" },
    { name: "a tag with a space", entry: { ...PAGE, tag: "v 1" }, message: "tag may hold only" },
    {
      name: "a tag with a slash, which URLs would read as a path",
      entry: { ...PAGE, tag: "release/1" },
      message: "tag may hold only",
    },
    { name: "a tag with .., which a path would climb", entry: { ...PAGE, tag: "v1..2" }, message: "tag may hold only" },
    { name: "drop not a list", entry: { ...PAGE, drop: "Build" }, message: '"drop" must be a list of headings' },
    { name: "drop with an empty name", entry: { ...PAGE, drop: [""] }, message: '"drop" must be a list of headings' },
    { name: "drop with a number", entry: { ...PAGE, drop: [1] }, message: '"drop" must be a list of headings' },
    { name: "drop naming a heading twice", entry: { ...PAGE, drop: ["A", "A"] }, message: '"A" twice' },
    { name: "drop on a list-only entry", entry: { ...listOnly, drop: ["A"] }, message: "only to a README page" },
    {
      name: "drop on a local page",
      entry: { path: "/projects/sky/", title: "S", blurb: "b", drop: ["A"] },
      message: "only to a README page",
    },
  ];

  it.each(rows)("refuses $name", ({ entry, message }) => {
    expect(failure(() => one(entry))).toContain(message);
  });

  it("refuses a slug used twice", () => {
    expect(failure(() => checkManifest({ projects: [PAGE, { ...PAGE, repo: "x/app" }] }))).toContain(
      'slug "app" is used twice',
    );
  });

  interface TopRow {
    name: string;
    manifest: unknown;
    message: string;
  }

  const topRows: readonly TopRow[] = [
    { name: "no projects array", manifest: {}, message: 'expected { "projects": [...] }' },
    { name: "projects not an array", manifest: { projects: {} }, message: 'expected { "projects": [...] }' },
    { name: "an unknown top-level key", manifest: { projects: [], extra: 1 }, message: 'unknown key "extra"' },
    { name: "null", manifest: null, message: 'expected { "projects": [...] }' },
    { name: "an entry that is not an object", manifest: { projects: ["app"] }, message: "expected an object" },
  ];

  it.each(topRows)("refuses at the top level: $name", ({ manifest, message }) => {
    expect(failure(() => checkManifest(manifest))).toContain(message);
  });
});
