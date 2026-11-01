import { afterEach, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { type Change, cardSubtitle, compare, type Files, generatedList, writeFiles } from "../build.ts";
import type { LocalEntry, ReadmeEntry } from "../manifest.ts";
import { asyncFailure } from "./failure.ts";

const LIST = "tools/generated.txt";
let root = "";
afterEach(() => rm(root, { recursive: true, force: true }));

/** A temporary tree holding `tree` ({repo path: text}). */
async function make(tree: Record<string, string>): Promise<string> {
  root = await mkdtemp(path.join(tmpdir(), "build-test-"));
  for (const [repoPath, text] of Object.entries(tree)) {
    await mkdir(path.dirname(path.join(root, repoPath)), { recursive: true });
    await writeFile(path.join(root, repoPath), text);
  }
  return root;
}

const files = (made: Record<string, string>): Files =>
  new Map(Object.entries(made).map(([repoPath, text]) => [repoPath, new TextEncoder().encode(text)]));

describe("compare", () => {
  interface Row {
    name: string;
    /** The repo on disk, generated.txt included. */
    tree: Record<string, string>;
    /** What this build made. */
    made: Record<string, string>;
    want: Change[];
  }

  const rows: readonly Row[] = [
    { name: "identical", tree: { "a.txt": "x", [LIST]: "a.txt\n" }, made: { "a.txt": "x" }, want: [] },
    { name: "changed", tree: { "a.txt": "x" }, made: { "a.txt": "y" }, want: [{ kind: "changed", path: "a.txt" }] },
    {
      name: "one byte longer",
      tree: { "a.txt": "x" },
      made: { "a.txt": "xx" },
      want: [{ kind: "changed", path: "a.txt" }],
    },
    { name: "missing", tree: {}, made: { "a.txt": "x" }, want: [{ kind: "missing", path: "a.txt" }] },
    {
      name: "listed last time, not made now: stale",
      tree: { "projects/app/old.png": "p", [LIST]: "projects/app/old.png\n" },
      made: {},
      want: [{ kind: "stale", path: "projects/app/old.png" }],
    },
    {
      name: "a removed project: every listed file stale",
      tree: {
        "projects/gone/card.png": "c",
        "projects/gone/index.html": "h",
        [LIST]: "projects/gone/card.png\nprojects/gone/index.html\n",
      },
      made: {},
      want: [
        { kind: "stale", path: "projects/gone/card.png" },
        { kind: "stale", path: "projects/gone/index.html" },
      ],
    },
    {
      name: "a file never listed is left alone",
      tree: { "projects/sky/index.html": "by hand", "projects/app/.DS_Store": "x", [LIST]: "" },
      made: {},
      want: [],
    },
    {
      name: "a listed file already gone is not stale",
      tree: { [LIST]: "projects/gone.png\n" },
      made: {},
      want: [],
    },
    { name: "no generated.txt yet: nothing is stale", tree: { "old.png": "p" }, made: {}, want: [] },
    {
      name: "sorted by path, by code unit",
      tree: { "b.txt": "1", "Z.png": "z", [LIST]: "Z.png\n" },
      made: { "c.txt": "c", "b.txt": "2" },
      want: [
        { kind: "stale", path: "Z.png" },
        { kind: "changed", path: "b.txt" },
        { kind: "missing", path: "c.txt" },
      ],
    },
  ];

  it.each(rows)("$name", async ({ tree, made, want }) => {
    expect(await compare(files(made), await make(tree))).toEqual(want);
  });

  interface Refusal {
    name: string;
    line: string;
  }

  // a build deletes stale files, so generated.txt must never name one outside the repo
  const refusals: readonly Refusal[] = [
    { name: "a path above the repo", line: "../outside.txt" },
    { name: "a path climbing out midway", line: "projects/../../outside.txt" },
    { name: "an absolute path", line: "/etc/hosts" },
  ];

  it.each(refusals)("refuses $name in generated.txt", async ({ line }) => {
    const tree = await make({ [LIST]: `${line}\n` });
    expect(await asyncFailure(() => compare(files({}), tree))).toContain("is outside the repo");
  });
});

describe("generatedList", () => {
  interface Row {
    name: string;
    paths: string[];
    want: string;
  }

  const rows: readonly Row[] = [
    { name: "sorted, with itself", paths: ["b.png", "a.png"], want: "a.png\nb.png\ntools/generated.txt\n" },
    {
      name: "the hand-written files with regions are never listed",
      paths: ["index.html", "sitemap.xml", "projects/app/index.html"],
      want: "projects/app/index.html\ntools/generated.txt\n",
    },
    { name: "capitals first, by code unit", paths: ["b.png", "C.png"], want: "C.png\nb.png\ntools/generated.txt\n" },
    { name: "itself only once", paths: ["tools/generated.txt", "a.png"], want: "a.png\ntools/generated.txt\n" },
    { name: "nothing made", paths: [], want: "tools/generated.txt\n" },
  ];

  it.each(rows)("$name", ({ paths, want }) => {
    expect(generatedList(paths)).toBe(want);
  });
});

describe("writeFiles", () => {
  it("makes folders and writes the bytes as given", async () => {
    const base = await make({});
    await writeFiles(
      new Map([
        ["deep/er/a.bin", new Uint8Array([0, 255])],
        ["b.txt", new TextEncoder().encode("hi")],
      ]),
      base,
    );
    const written = {
      bin: [...(await readFile(path.join(base, "deep/er/a.bin")))],
      text: await readFile(path.join(base, "b.txt"), "utf8"),
    };
    expect(written).toEqual({ bin: [0, 255], text: "hi" });
  });
});

describe("the command line", () => {
  interface Row {
    name: string;
    args: string[];
    exit: number;
    /** A line the output must hold. */
    says: string;
  }

  // each of these stops before the manifest is read, so none needs gh or the network; run from tools/test/
  const rows: readonly Row[] = [
    { name: "-h prints the usage", args: ["-h"], exit: 0, says: "Usage:" },
    { name: "--help prints the usage", args: ["--help"], exit: 0, says: "Usage:" },
    { name: "an unknown option is refused with the usage", args: ["--dev"], exit: 2, says: "Usage:" },
    {
      name: "--check takes no other option",
      args: ["--check", "--out", "x"],
      exit: 2,
      says: "--check takes no other options",
    },
    { name: "--out needs a folder", args: ["--out"], exit: 2, says: "argument missing" },
    { name: "--out must not be the repo", args: ["--out", "../.."], exit: 2, says: "--out must be outside the repo" },
    {
      name: "--out must not be inside the repo",
      args: ["--out", "../../projects"],
      exit: 2,
      says: "--out must be outside the repo",
    },
    {
      name: "an empty --out is the folder it runs in",
      args: ["--out", ""],
      exit: 2,
      says: "--out must be outside the repo",
    },
  ];

  it.each(rows)("$name", ({ args, exit, says }) => {
    const run = spawnSync(process.execPath, [path.join(import.meta.dir, "../build.ts"), ...args], {
      cwd: import.meta.dir,
    });
    const output = run.stdout.toString() + run.stderr.toString();
    expect({ exit: run.status, says: output.includes(says) }).toEqual({ exit, says: true });
  });
});

describe("cardSubtitle", () => {
  const README: ReadmeEntry = {
    kind: "readme",
    slug: "app",
    repo: "o/app",
    ref: { kind: "tag", name: "v1" },
    path: "/projects/app/",
    title: "app",
    blurb: 'an <span title="t">app</span>',
    license: undefined,
    list: true,
    sitemap: true,
    card: { title: undefined, subtitle: undefined },
    drop: [],
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

  interface Row {
    name: string;
    entry: ReadmeEntry | LocalEntry;
    want: string;
  }

  const rows: readonly Row[] = [
    { name: "the card's own subtitle wins", entry: LOCAL, want: "a\nb" },
    { name: "else the blurb, as text", entry: README, want: "an app" },
    { name: "else nothing", entry: { ...README, blurb: undefined }, want: "" },
    { name: "with the card off, the blurb", entry: { ...README, card: false }, want: "an app" },
  ];

  it.each(rows)("$name", ({ entry, want }) => {
    expect(cardSubtitle(entry)).toBe(want);
  });
});
