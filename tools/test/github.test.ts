import { afterAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { BuildError } from "../errors.ts";
import { type GhApi, localSource, openSource } from "../github.ts";
import type { ReadmeEntry } from "../manifest.ts";
import { asyncFailure } from "./failure.ts";

const SHA = "1".repeat(40);
const OTHER = "2".repeat(40);

/** A gh that answers each request path from `answers` and fails on any other, as gh does on a 404. */
function fakeGh(answers: Record<string, string>): GhApi {
  return (args) => {
    const request = args.at(-1) ?? "";
    const answer = answers[request];
    if (answer === undefined) throw new BuildError(`gh api ${request}: HTTP 404`);
    return new TextEncoder().encode(answer);
  };
}

const entry = (ref: ReadmeEntry["ref"]): ReadmeEntry => ({
  kind: "readme",
  slug: "app",
  title: "app",
  blurb: "an app",
  license: undefined,
  list: true,
  repo: "o/app",
  ref,
  path: "/projects/app/",
  card: false,
  sitemap: true,
  drop: [],
});

const AT_SHA = {
  [`repos/o/app/readme?ref=${SHA}`]: JSON.stringify({ path: "README.md" }),
  [`repos/o/app/contents/README.md?ref=${SHA}`]: "# App",
  [`repos/o/app/contents/docs/my%20shot.png?ref=${SHA}`]: "png",
};

describe("openSource from GitHub", () => {
  interface Row {
    name: string;
    ref: ReadmeEntry["ref"];
    answers: Record<string, string>;
    want: { markdown: string; readmeDir: string; linkRef: string; label: string };
  }

  const rows: readonly Row[] = [
    {
      name: "a tag, looked up as a tag",
      ref: { kind: "tag", name: "v1.0.0" },
      answers: { ...AT_SHA, "repos/o/app/commits/refs/tags/v1.0.0": JSON.stringify({ sha: SHA }) },
      want: { markdown: "# App", readmeDir: "", linkRef: "v1.0.0", label: "v1.0.0" },
    },
    {
      name: "a tag with a plus, as it is",
      ref: { kind: "tag", name: "v1.0+b" },
      answers: { ...AT_SHA, "repos/o/app/commits/refs/tags/v1.0+b": JSON.stringify({ sha: SHA }) },
      want: { markdown: "# App", readmeDir: "", linkRef: "v1.0+b", label: "v1.0+b" },
    },
    {
      name: "a commit that is itself",
      ref: { kind: "commit", sha: SHA },
      answers: { ...AT_SHA, [`repos/o/app/commits/${SHA}`]: JSON.stringify({ sha: SHA }) },
      want: { markdown: "# App", readmeDir: "", linkRef: SHA, label: SHA },
    },
    {
      name: "a README in a folder",
      ref: { kind: "commit", sha: SHA },
      answers: {
        [`repos/o/app/commits/${SHA}`]: JSON.stringify({ sha: SHA }),
        [`repos/o/app/readme?ref=${SHA}`]: JSON.stringify({ path: "docs/README.md" }),
        [`repos/o/app/contents/docs/README.md?ref=${SHA}`]: "# Docs",
      },
      want: { markdown: "# Docs", readmeDir: "docs", linkRef: SHA, label: SHA },
    },
  ];

  it.each(rows)("$name", async ({ ref, answers, want }) => {
    const { markdown, readmeDir, linkRef, label } = await openSource(entry(ref), false, fakeGh(answers));
    expect({ markdown, readmeDir, linkRef, label }).toEqual(want);
  });

  it("reads a file beside the README at the same commit, its path encoded", async () => {
    const answers = { ...AT_SHA, [`repos/o/app/commits/${SHA}`]: JSON.stringify({ sha: SHA }) };
    const source = await openSource(entry({ kind: "commit", sha: SHA }), false, fakeGh(answers));
    expect(new TextDecoder().decode(await source.file("docs/my shot.png"))).toBe("png");
  });

  interface Refusal {
    name: string;
    ref: ReadmeEntry["ref"];
    answers: Record<string, string>;
    message: string;
  }

  const refusals: readonly Refusal[] = [
    // a branch named v1.0.0 answers repos/o/app/commits/v1.0.0, which the lookup never asks for
    {
      name: "a missing tag, even with a branch of its name",
      ref: { kind: "tag", name: "v1.0.0" },
      answers: { ...AT_SHA, "repos/o/app/commits/v1.0.0": JSON.stringify({ sha: SHA }) },
      message: "refs/tags/v1.0.0: HTTP 404",
    },
    {
      name: "a commit that resolves to another",
      ref: { kind: "commit", sha: SHA },
      answers: { ...AT_SHA, [`repos/o/app/commits/${SHA}`]: JSON.stringify({ sha: OTHER }) },
      message: `commit ${SHA} resolved to ${OTHER}`,
    },
    {
      name: "a missing commit",
      ref: { kind: "commit", sha: SHA },
      answers: AT_SHA,
      message: `commits/${SHA}: HTTP 404`,
    },
    {
      name: "a repo with no README",
      ref: { kind: "commit", sha: SHA },
      answers: { [`repos/o/app/commits/${SHA}`]: JSON.stringify({ sha: SHA }) },
      message: "readme?ref=",
    },
    {
      name: "an answer without a sha",
      ref: { kind: "tag", name: "v1" },
      answers: { "repos/o/app/commits/refs/tags/v1": JSON.stringify({ message: "?" }) },
      message: 'expected "sha"',
    },
    {
      name: "a local readme when building into the repo",
      ref: { kind: "local", file: "../app/README.md" },
      answers: {},
      message: "built from a local readme (../app/README.md)",
    },
  ];

  it.each(refusals)("refuses $name", async ({ ref, answers, message }) => {
    expect(await asyncFailure(() => openSource(entry(ref), false, fakeGh(answers)))).toContain(message);
  });
});

const base = await realpath(await mkdtemp(path.join(tmpdir(), "source-test-")));
afterAll(() => rm(base, { recursive: true, force: true }));

describe("localSource", () => {
  /** A folder under `base` holding `files`, made a git repo when `git` is set. */
  async function tree(name: string, files: Record<string, string>, git: boolean): Promise<string> {
    const root = path.join(base, name);
    for (const [repoPath, text] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(root, repoPath)), { recursive: true });
      await writeFile(path.join(root, repoPath), text);
    }
    if (git) spawnSync("git", ["init", "-q", root]);
    return root;
  }

  interface Row {
    name: string;
    files: Record<string, string>;
    git: boolean;
    readme: string;
    /** A path from the repo's root, to read through the source. */
    other: string;
    want: { markdown: string; readmeDir: string; other: string };
  }

  const rows: readonly Row[] = [
    {
      name: "a README at the repo root",
      files: { "README.md": "# A", "docs/a.png": "png" },
      git: true,
      readme: "README.md",
      other: "docs/a.png",
      want: { markdown: "# A", readmeDir: "", other: "png" },
    },
    {
      name: "a doc in a folder of the repo",
      files: { "docs/plan.md": "# P", "img/x.png": "x" },
      git: true,
      readme: "docs/plan.md",
      other: "img/x.png",
      want: { markdown: "# P", readmeDir: "docs", other: "x" },
    },
    {
      name: "a deeper doc",
      files: { "a/b/c.md": "# C", "a/i.png": "i" },
      git: true,
      readme: "a/b/c.md",
      other: "a/i.png",
      want: { markdown: "# C", readmeDir: "a/b", other: "i" },
    },
    {
      name: "outside a git repo, its folder is the root",
      files: { "notes/n.md": "# N", "notes/p.png": "p" },
      git: false,
      readme: "notes/n.md",
      other: "p.png",
      want: { markdown: "# N", readmeDir: "", other: "p" },
    },
  ];

  it.each(rows)("$name", async ({ name, files, git, readme, other, want }) => {
    const root = await tree(name.replace(/\W+/g, "-"), files, git);
    const source = await localSource(path.join(root, readme));
    const otherText = new TextDecoder().decode(await source.file(other));
    expect({ markdown: source.markdown, readmeDir: source.readmeDir, other: otherText }).toEqual(want);
  });

  it("is labelled as local and links to HEAD", async () => {
    const root = await tree("labels", { "README.md": "# L" }, true);
    const { linkRef, label } = await localSource(path.join(root, "README.md"));
    expect({ linkRef, label }).toEqual({ linkRef: "HEAD", label: "a local README" });
  });
});
