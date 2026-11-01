// Where a README page's files come from: the repo on GitHub at its pinned ref, read through the gh CLI, or
// a local README while it is being written. Projects are never assumed to be checked out next to the site.

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { BuildError } from "./errors.ts";
import type { ReadmeEntry } from "./manifest.ts";

/** Runs `gh api <args>` and returns its stdout. Tests pass a fake that answers from a table. */
export type GhApi = (args: readonly string[]) => Uint8Array;

/** The real gh. Every request goes to api.github.com, so CI needs GH_TOKEN even for public repos. */
export const ghApi: GhApi = (args) => {
  const run = spawnSync("gh", ["api", ...args], { maxBuffer: 256 << 20 });
  if (run.error !== undefined) throw new BuildError(`gh: ${run.error.message}`);
  if (run.status !== 0) {
    const stderr = run.stderr.toString().trim();
    throw new BuildError(`gh api ${args.join(" ")}: ${stderr === "" ? `exit ${String(run.status)}` : stderr}`);
  }
  return run.stdout;
};

/** A README and the files beside it, at one ref. */
export interface Source {
  markdown: string;
  /** The README's folder in the repo; "" for the root. */
  readmeDir: string;
  /** What relative links point at on GitHub: the ref's name, or "HEAD" for a local README. */
  linkRef: string;
  /** How the page names its source: the tag or commit, or "a local README". */
  label: string;
  /** A file by its path from the repo root. */
  file(repoPath: string): Promise<Uint8Array>;
}

/**
 * The README of `entry` at its ref. A tag must exist as a tag and a commit as that exact commit;
 * anything not found, for any reason, throws. A local README is allowed only when `allowLocal` is.
 */
export async function openSource(entry: ReadmeEntry, allowLocal: boolean, gh: GhApi = ghApi): Promise<Source> {
  const { ref } = entry;
  switch (ref.kind) {
    case "local":
      if (!allowLocal)
        throw new BuildError(
          `${entry.repo}: built from a local readme (${ref.file}); give it a tag or commit to publish, or build with --out DIR`,
        );
      return await localSource(path.resolve(import.meta.dir, ref.file));
    case "tag": {
      // a branch of the same name must not stand in for a missing tag, so a tag is looked up as a tag
      // manifest.ts keeps a tag to URL-safe characters, so it goes into every URL as it is
      const sha = shaOf(gh([`repos/${entry.repo}/commits/refs/tags/${ref.name}`]));
      return githubSource(entry.repo, sha, ref.name, gh);
    }
    case "commit": {
      const sha = shaOf(gh([`repos/${entry.repo}/commits/${ref.sha}`]));
      if (sha !== ref.sha) throw new BuildError(`${entry.repo}: commit ${ref.sha} resolved to ${sha}`);
      return githubSource(entry.repo, sha, ref.sha, gh);
    }
  }
}

function githubSource(repo: string, sha: string, refName: string, gh: GhApi): Source {
  const readmePath = stringField(readJson(gh([`repos/${repo}/readme?ref=${sha}`])), "path");
  const raw = (repoPath: string): Uint8Array =>
    gh([
      "-H",
      "Accept: application/vnd.github.raw",
      `repos/${repo}/contents/${repoPath.split("/").map(encodeURIComponent).join("/")}?ref=${sha}`,
    ]);
  return {
    markdown: new TextDecoder().decode(raw(readmePath)),
    readmeDir: folderOf(readmePath),
    linkRef: refName,
    label: refName,
    file: (repoPath) => Promise.resolve(raw(repoPath)),
  };
}

/**
 * A README on disk, for writing a page before its release; never published. Its paths are relative to its
 * folder within its git repo, as on GitHub, so a doc in docs/ links and loads images as it will there.
 */
export async function localSource(readmeFile: string): Promise<Source> {
  const file = path.resolve(readmeFile);
  const run = spawnSync("git", ["-C", path.dirname(file), "rev-parse", "--show-toplevel"]);
  // outside a git repo, the README's own folder stands in for the repo's root
  const root = run.status === 0 ? run.stdout.toString().trim() : path.dirname(file);
  const readmePath = path.relative(root, file).split(path.sep).join("/");
  return {
    markdown: await readFile(file, "utf8"),
    readmeDir: folderOf(readmePath),
    linkRef: "HEAD",
    label: "a local README",
    file: (repoPath) => readFile(path.join(root, repoPath)),
  };
}

/** The folder of a repo path; "" for the root. */
const folderOf = (repoPath: string): string =>
  path.posix.dirname(repoPath) === "." ? "" : path.posix.dirname(repoPath);

/** gh's JSON output, as `unknown` for the caller to narrow; the plugin in biome/ bans JSON.parse elsewhere. */
function readJson(bytes: Uint8Array): unknown {
  // biome-ignore lint/plugin: the one typed JSON entry point; its result is unknown, not any
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  return parsed;
}

function stringField(value: unknown, key: string): string {
  const field: unknown = typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
  if (typeof field !== "string") throw new BuildError(`gh: expected "${key}" in its answer`);
  return field;
}

const shaOf = (bytes: Uint8Array): string => stringField(readJson(bytes), "sha");
