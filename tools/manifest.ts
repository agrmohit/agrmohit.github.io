// Reads and checks projects.jsonc: every project on the site, in the order the home page lists them.
//
// An entry is one of three kinds, told apart by its fields (projects.schema.json says the same for editors):
//   readme  repo + tag or commit: a page built from the repo's README at that ref
//   list    repo + "page": false: a list item linking to the repo, no page
//   local   path: a page this repo already holds (earthrise); only its card and sitemap entry are built
// A readme entry may give "readme", a local file, instead of a ref while the README is being written;
// build.ts builds such an entry only with --out, never into the site.

import { BuildError } from "./errors.ts";

/** SPDX id -> the list's tooltip; the label is the id in lower case. */
export const LICENSES = {
  MIT: "MIT License",
  "Apache-2.0": "Apache License 2.0",
  "GPL-3.0-only": "GNU General Public License v3.0",
  "BSD-2-Clause": "BSD 2-Clause License",
  "MPL-2.0": "Mozilla Public License 2.0",
} as const;
export type License = keyof typeof LICENSES;

/** Where a README comes from: a tag, a full commit SHA, or a local file (path relative to tools/). */
export type Ref = { kind: "tag"; name: string } | { kind: "commit"; sha: string } | { kind: "local"; file: string };

/** A card's own text, undefined for the fallback: see cardName and cardSubtitle in build.ts. `subtitle` may hold "\n". */
export interface Card {
  title: string | undefined;
  subtitle: string | undefined;
}

/** What every kind has. `title` and `blurb` are set whenever `list` is. `blurb` is HTML. */
interface Listing {
  slug: string;
  title: string | undefined;
  blurb: string | undefined;
  license: License | undefined;
  list: boolean;
}

export interface ReadmeEntry extends Listing {
  kind: "readme";
  /** "owner/name". */
  repo: string;
  ref: Ref;
  /** The page's URL path: "/projects/<slug>/". */
  path: string;
  card: Card | false;
  sitemap: boolean;
  /** Headings of README sections to leave out. */
  drop: string[];
}

export interface ListEntry extends Listing {
  kind: "list";
  repo: string;
}

export interface LocalEntry extends Listing {
  kind: "local";
  path: string;
  /** A local page has only the manifest to name its card, so a card always has a title. */
  card: (Card & { title: string }) | false;
  sitemap: boolean;
}

export type Entry = ReadmeEntry | ListEntry | LocalEntry;

/** The checked entries of the manifest at `file`. */
export async function readManifest(file: string): Promise<Entry[]> {
  const text = await Bun.file(file).text();
  let parsed: unknown;
  try {
    parsed = Bun.JSONC.parse(text);
  } catch (err) {
    throw new BuildError(`projects.jsonc: not valid JSONC: ${err instanceof Error ? err.message : String(err)}`);
  }
  return checkManifest(parsed);
}

type Fields = Record<string, unknown>;
const isObject = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function fail(where: string, message: string): never {
  throw new BuildError(`projects.jsonc: ${where}: ${message}`);
}

const ENTRY_KEYS = [
  "slug",
  "repo",
  "tag",
  "commit",
  "readme",
  "page",
  "path",
  "title",
  "blurb",
  "license",
  "card",
  "drop",
  "sitemap",
  "list",
];

/** The entries of a parsed manifest, each with its kind and defaults filled in. */
export function checkManifest(manifest: unknown): Entry[] {
  if (!isObject(manifest) || !Array.isArray(manifest["projects"])) fail("top level", 'expected { "projects": [...] }');
  for (const key of Object.keys(manifest))
    if (key !== "projects" && key !== "$schema") fail("top level", `unknown key "${key}"`);
  const projects: unknown[] = manifest["projects"]; // Array.isArray gives any[]; read each item as unknown

  const slugs = new Set<string>();
  return projects.map((raw, i) => {
    const entry = checkEntry(raw, i);
    if (slugs.has(entry.slug)) fail(`projects[${i}]`, `slug "${entry.slug}" is used twice`);
    slugs.add(entry.slug);
    return entry;
  });
}

function checkEntry(raw: unknown, i: number): Entry {
  if (!isObject(raw)) fail(`projects[${i}]`, "expected an object");
  const named = typeof raw["repo"] === "string" ? raw["repo"] : typeof raw["path"] === "string" ? raw["path"] : "";
  const where = named === "" ? `projects[${i}]` : `projects[${i}] (${named})`;
  for (const key of Object.keys(raw)) if (!ENTRY_KEYS.includes(key)) fail(where, `unknown key "${key}"`);

  const text = (key: string): string | undefined => {
    const value = raw[key];
    if (value !== undefined && typeof value !== "string") fail(where, `"${key}" must be a string`);
    return value;
  };
  const flag = (key: string): boolean | undefined => {
    const value = raw[key];
    if (value !== undefined && typeof value !== "boolean") fail(where, `"${key}" must be a boolean`);
    return value;
  };

  const repo = text("repo");
  const tag = text("tag");
  const commit = text("commit");
  const readme = text("readme");
  const pagePath = text("path");
  const page = flag("page");
  const title = text("title");
  const blurb = text("blurb");
  const card = readCard(raw["card"], where);
  const drop = readDrop(raw["drop"], where);

  const given = ["tag", "commit", "readme"].filter((key) => raw[key] !== undefined);
  if (given.length > 1) fail(where, `give one of tag, commit or readme, not ${given.join(" and ")}`);
  if (commit !== undefined && !/^[0-9a-f]{40}$/.test(commit)) fail(where, "commit must be a full 40-character SHA");
  // the tag goes as it is into API paths, links and an HTML comment, so it keeps to characters safe in all three
  if (tag !== undefined && (!/^[\w.+-]+$/.test(tag) || tag.includes("..")))
    fail(where, "tag may hold only letters, digits and . _ + - (no ..)");
  if (repo !== undefined && !/^[\w.-]+\/[\w.-]+$/.test(repo)) fail(where, 'repo must look like "owner/name"');

  const list = flag("list") ?? true;
  if (list && (title === undefined || title === "")) fail(where, "a listed entry needs a title");
  if (list && (blurb === undefined || blurb === "")) fail(where, "a listed entry needs a blurb");
  const license = readLicense(text("license"), where);
  const sitemap = flag("sitemap");
  const slugOf = (fallback: string): string => {
    const slug = text("slug") ?? fallback;
    if (!/^[a-z0-9-]+$/.test(slug)) fail(where, `slug "${slug}" must be lower-case letters, digits and hyphens`);
    return slug;
  };

  if (pagePath !== undefined) {
    if (repo !== undefined || given.length > 0 || page !== undefined)
      fail(where, "a local page (path) takes no repo, ref or page");
    if (!/^\/projects\/[a-z0-9-]+\/$/.test(pagePath)) fail(where, 'path must look like "/projects/<slug>/"');
    if (drop !== undefined) fail(where, '"drop" applies only to a README page');
    // the build writes a local page's card by its path, so a second name for it could let two entries share files
    if (raw["slug"] !== undefined) fail(where, "a local page takes its slug from its path; leave slug out");
    return {
      kind: "local",
      slug: slugOf(pagePath.split("/")[2] ?? ""),
      title,
      blurb,
      license,
      list,
      path: pagePath,
      card: localCard(card, title, where),
      sitemap: sitemap ?? true,
    };
  }

  if (repo === undefined) fail(where, page === false ? "a list-only entry needs a repo" : "a README page needs a repo");
  const slug = slugOf(repo.split("/")[1] ?? "");

  if (page === false) {
    if (given.length > 0) fail(where, "a list-only entry takes no tag, commit or readme");
    if (card !== undefined || sitemap !== undefined)
      fail(where, "a list-only entry has no page, so no card or sitemap entry");
    if (drop !== undefined) fail(where, '"drop" applies only to a README page');
    return { kind: "list", slug, title, blurb, license, list, repo };
  }

  if (page === true) fail(where, '"page": true is the default; leave it out');
  let ref: Ref;
  if (tag !== undefined) ref = { kind: "tag", name: tag };
  else if (commit !== undefined) ref = { kind: "commit", sha: commit };
  else if (readme !== undefined) ref = { kind: "local", file: readme };
  else fail(where, "a README page needs a tag or a commit (or a local readme, for --out)");
  return {
    kind: "readme",
    slug,
    title,
    blurb,
    license,
    list,
    repo,
    ref,
    path: `/projects/${slug}/`,
    card: card === false ? false : { title: card?.title, subtitle: card?.subtitle },
    sitemap: sitemap ?? true,
    drop: drop ?? [],
  };
}

/** A local page's card: it has only the manifest to name it, so card.title, else the entry's title. */
function localCard(card: Card | false | undefined, title: string | undefined, where: string): LocalEntry["card"] {
  if (card === false) return false;
  const cardTitle = card?.title ?? title;
  if (cardTitle === undefined) fail(where, "a local page's card needs card.title or title");
  return { title: cardTitle, subtitle: card?.subtitle };
}

/** `card` as given: false for none, its own text, or undefined for the default card. */
function readCard(card: unknown, where: string): Card | false | undefined {
  if (card === undefined || card === false) return card;
  if (card === true) fail(where, '"card": true is the default; leave it out');
  if (!isObject(card)) fail(where, '"card" must be a boolean or object');
  const own: Card = { title: undefined, subtitle: undefined };
  for (const [key, value] of Object.entries(card)) {
    if (key !== "title" && key !== "subtitle") fail(where, `unknown key "card.${key}"`);
    if (typeof value !== "string") fail(where, `"card.${key}" must be a string`);
    own[key] = value;
  }
  return own;
}

/** `drop` as given: distinct non-blank headings, or undefined. */
function readDrop(drop: unknown, where: string): string[] | undefined {
  if (drop === undefined) return undefined;
  const headings: unknown[] = Array.isArray(drop) ? drop : [];
  const valid = headings.filter((heading): heading is string => typeof heading === "string" && heading.trim() !== "");
  if (!Array.isArray(drop) || valid.length !== headings.length)
    fail(where, '"drop" must be a list of headings, e.g. ["Star History"]');
  const twice = valid.find((heading, i) => valid.indexOf(heading) !== i);
  if (twice !== undefined) fail(where, `"drop" names "${twice}" twice`);
  return valid;
}

function readLicense(license: string | undefined, where: string): License | undefined {
  if (license === undefined) return undefined;
  const known = Object.keys(LICENSES).find((id): id is License => id === license);
  if (known === undefined) fail(where, `unknown license "${license}"; known: ${Object.keys(LICENSES).join(", ")}`);
  return known;
}
