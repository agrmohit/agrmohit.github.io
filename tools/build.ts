#!/usr/bin/env bun
// Builds every generated file on the site from committed inputs. Run with -h for usage.
//
// siteFiles() makes the whole set in memory, as {repo path: bytes}. A build writes it, --check compares it
// with the repo, and --out writes it elsewhere. tools/generated.txt lists what the last build made, so a file
// listed there that this run no longer makes is stale: a build deletes it and --check reports it.

import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { BuildError } from "./errors.ts";
import { openSource } from "./github.ts";
import { plainText } from "./html.ts";
import { contactCard, icons, postCard } from "./images.ts";
import { type Entry, type LocalEntry, type ReadmeEntry, readManifest } from "./manifest.ts";
import pkg from "./package.json" with { type: "json" };
import { projectPage } from "./page.ts";
import { renderReadme } from "./readme.ts";
import { withProjectList, withSitemap } from "./site.ts";
import { byCodeUnit } from "./sort.ts";

const ROOT = path.resolve(import.meta.dir, "..");
const MANIFEST = path.join(ROOT, "tools/projects.jsonc");
/** The repo path of the list of generated files; it lists itself too. */
const GENERATED = "tools/generated.txt";

const USAGE = `Build the site's generated files: project pages, cards, banners, icons, the projects list and sitemap.

Usage:
  bun tools/build.ts                build everything from tools/projects.jsonc into the repo
  bun tools/build.ts --check        build in memory and compare with the repo; changes nothing
                                    exit 0 if identical, 1 if anything differs, 2 on an error
  bun tools/build.ts --out DIR      build into DIR instead of the repo; entries with a local "readme"
                                    are allowed only here
  bun tools/build.ts -h             show this help

Needs bun at the version in tools/package.json (bunx bun@<version> tools/build.ts runs it without
installing it) and gh, logged in.`;

/** The files of one build, as {repo path: bytes}. */
export type Files = Map<string, Uint8Array>;
type Command = { mode: "help" } | { mode: "build" } | { mode: "check" } | { mode: "out"; dir: string };

/** The exit code: 0 done or identical, 1 when --check finds a difference. */
async function main(argv: readonly string[]): Promise<0 | 1> {
  const command = parseCli(argv);
  if (command.mode === "help") {
    console.log(USAGE);
    return 0;
  }
  requirePinnedBun();
  const entries = await readManifest(MANIFEST);
  const files = await siteFiles(entries, command.mode === "out");
  if (command.mode === "check") return check(files);
  if (command.mode === "build") return build(files);
  await writeFiles(files, command.dir);
  console.log(`wrote ${files.size} files to ${command.dir}`);
  return 0;
}

function parseCli(argv: readonly string[]): Command {
  let values: { check?: boolean; out?: string; help?: boolean };
  try {
    values = parseArgs({
      args: [...argv],
      options: { check: { type: "boolean" }, out: { type: "string" }, help: { type: "boolean", short: "h" } },
      strict: true,
    }).values;
  } catch (err) {
    throw usage(err instanceof Error ? err.message : String(err));
  }
  if (values.help === true) return { mode: "help" };
  if (values.check === true && values.out !== undefined) throw usage("--check takes no other options");
  if (values.check === true) return { mode: "check" };
  if (values.out === undefined) return { mode: "build" };
  const dir = path.resolve(values.out);
  // a folder inside the repo would mix a local-README page in with the published files
  const fromRoot = path.relative(ROOT, dir);
  if (!fromRoot.startsWith("..") && !path.isAbsolute(fromRoot))
    throw usage("--out must be outside the repo; a plain build writes there");
  return { mode: "out", dir };
}

const usage = (message: string): BuildError => new BuildError(`${message}\n\n${USAGE}`);

/** Refuses any bun but the pinned one: its zlib writes the card PNGs, so another bun can write other bytes. */
function requirePinnedBun(): void {
  const pinned = pkg.packageManager.replace(/^bun@/, "");
  if (Bun.version !== pinned)
    throw new BuildError(
      `this is bun ${Bun.version}; the site is built with bun ${pinned}: run bunx bun@${pinned} tools/build.ts`,
    );
}

// --- making the files ------------------------------------------------------------

/** Every generated file. `allowLocal` lets entries with a local "readme" build; never into the repo. */
async function siteFiles(entries: readonly Entry[], allowLocal: boolean): Promise<Files> {
  const files: Files = new Map();
  /** Each README page's sitemap lastmod, by its path. */
  const lastmods = new Map<string, string>();
  for (const entry of entries) {
    if (entry.kind === "readme") {
      const page = await addReadmePage(files, entry, allowLocal);
      if (page.authored !== undefined) lastmods.set(entry.path, page.authored);
      if (entry.card !== false) await addCard(files, entry, page.name);
    }
    if (entry.kind === "local" && entry.card !== false) await addCard(files, entry, entry.card.title);
  }
  for (const [repoPath, png] of Object.entries(await icons())) files.set(repoPath, png);
  files.set("assets/img/contact-card.png", await contactCard("card"));
  files.set("assets/img/banner.png", await contactCard("banner"));
  files.set("assets/img/banner-linkedin.png", await contactCard("linkedin"));
  files.set("index.html", utf8(withProjectList(await readText("index.html"), entries)));
  files.set("sitemap.xml", utf8(withSitemap(await readText("sitemap.xml"), entries, lastmods)));
  files.set(GENERATED, utf8(generatedList([...files.keys()])));
  return files;
}

/** The text of generated.txt: every file the build makes whole, itself included, one per line, sorted. */
export function generatedList(repoPaths: readonly string[]): string {
  // index.html and sitemap.xml are hand-written around their regions, so they are never stale and never deleted
  const whole = repoPaths.filter((repoPath) => repoPath !== "index.html" && repoPath !== "sitemap.xml");
  return `${[...new Set([...whole, GENERATED])].sort(byCodeUnit).join("\n")}\n`;
}

/** Adds the entry's page and the images it loads; returns the name its card shows and its source's author date. */
export async function addReadmePage(
  files: Files,
  entry: ReadmeEntry,
  allowLocal: boolean,
): Promise<{ name: string; authored: string | undefined }> {
  const source = await openSource(entry, allowLocal);
  // renderReadme reads images to size them and the page copies some: one fetch each, as gh is a process a call
  const fetched = new Map<string, Promise<Uint8Array>>();
  const file = (repoPath: string): Promise<Uint8Array> => {
    let bytes = fetched.get(repoPath);
    if (bytes === undefined) {
      bytes = source.file(repoPath);
      fetched.set(repoPath, bytes);
    }
    return bytes;
  };
  const readme = await renderReadme(source.markdown, {
    repo: entry.repo,
    ref: source.linkRef,
    readmeDir: source.readmeDir,
    drop: entry.drop,
    file,
  });
  const folder = `projects/${entry.slug}`;
  for (const image of readme.images) files.set(`${folder}/${image}`, await file(image));
  for (const [image, bytes] of readme.webps) files.set(`${folder}/${image}`, bytes);

  const card = entry.card === false ? undefined : entry.card;
  const name = card?.title ?? readme.title ?? entry.title ?? entry.slug;
  const description = entry.blurb === undefined ? (card?.subtitle ?? name) : plainText(entry.blurb);
  const page = projectPage({
    slug: entry.slug,
    title: name,
    description,
    repo: entry.repo,
    ref: source.label,
    body: readme.html,
    card: card === undefined ? undefined : { subtitle: cardSubtitle(entry) },
  });
  files.set(`${folder}/index.html`, utf8(page));
  return { name, authored: source.authored };
}

/** Adds the entry's link-preview card, which shows `name` over the page's URL. */
export async function addCard(files: Files, entry: ReadmeEntry | LocalEntry, name: string): Promise<void> {
  const url = `agrmohit.com${entry.path.replace(/\/$/, "")}`;
  files.set(`${entry.path.slice(1)}card.png`, await postCard({ title: name, subtitle: cardSubtitle(entry), url }));
}

/** The words a card shows under its name: the card's own subtitle, else the blurb as plain text. */
export function cardSubtitle(entry: ReadmeEntry | LocalEntry): string {
  const own = entry.card === false ? undefined : entry.card.subtitle;
  return own ?? (entry.blurb === undefined ? "" : plainText(entry.blurb));
}

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const readText = (repoPath: string): Promise<string> => readFile(path.join(ROOT, repoPath), "utf8");

// --- using them ------------------------------------------------------------------

/** How a generated file differs from the repo. "stale": listed in generated.txt, no longer made, still there. */
export interface Change {
  kind: "changed" | "missing" | "stale";
  path: string;
}

const describeChange = (change: Change): string => `${change.kind.padEnd(9)}${change.path}`;

/** How `files` differ from the tree at `root`, sorted by path. */
export async function compare(files: Files, root: string): Promise<Change[]> {
  const changes: Change[] = [];
  for (const [repoPath, bytes] of files) {
    const onDisk = path.join(root, repoPath);
    if (!existsSync(onDisk)) changes.push({ kind: "missing", path: repoPath });
    else if (Buffer.compare(await readFile(onDisk), bytes) !== 0) changes.push({ kind: "changed", path: repoPath });
  }
  for (const repoPath of await committedList(root))
    if (!files.has(repoPath) && existsSync(path.join(root, repoPath))) changes.push({ kind: "stale", path: repoPath });
  return changes.sort((a, b) => byCodeUnit(a.path, b.path));
}

/** The paths the last build made, from generated.txt. A path that leaves the repo fails: build deletes stale ones. */
async function committedList(root: string): Promise<string[]> {
  const file = path.join(root, GENERATED);
  if (!existsSync(file)) return [];
  const lines = (await readFile(file, "utf8")).split("\n").filter((line) => line !== "");
  for (const line of lines)
    if (path.isAbsolute(line) || line.split("/").includes(".."))
      throw new BuildError(`${GENERATED}: "${line}" is outside the repo`);
  return lines;
}

async function check(files: Files): Promise<0 | 1> {
  const changes = await compare(files, ROOT);
  if (changes.length === 0) {
    console.log(`${files.size} generated files match the repo`);
    return 0;
  }
  console.log(changes.map(describeChange).join("\n"));
  console.log(`\n${changes.length} of the generated files differ from the repo; run make build and commit the result`);
  return 1;
}

async function build(files: Files): Promise<0> {
  const changes = await compare(files, ROOT);
  await writeFiles(files, ROOT);
  for (const change of changes) if (change.kind === "stale") await rm(path.join(ROOT, change.path));
  console.log(changes.length > 0 ? changes.map(describeChange).join("\n") : "nothing changed");
  return 0;
}

/** Writes `files` under `base`, making folders as needed. */
export async function writeFiles(files: Files, base: string): Promise<void> {
  for (const repoPath of [...files.keys()].sort(byCodeUnit)) {
    const file = path.join(base, repoPath);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, files.get(repoPath) ?? new Uint8Array());
  }
}

// --- the entry point -------------------------------------------------------------

// only when run, so the tests can import the functions above
if (import.meta.main) {
  let code: number;
  try {
    code = await main(Bun.argv.slice(2));
  } catch (err) {
    // the build's own errors explain themselves; anything else gets its stack
    console.error(err instanceof BuildError ? `error: ${err.message}` : err);
    code = 2;
  }
  // pele, satori and the scene leave timers behind; the work is done
  process.exit(code);
}
