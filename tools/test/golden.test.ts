// One README with every feature, built offline, compared byte for byte with test/fixture/expected/.
// CI runs it on Linux amd64, Linux arm64 and macOS, so it proves the bytes match across machines.
// After a deliberate change: GOLDEN=write bun test golden, then look at test/fixture/expected/ before committing.
// The fixture is a local README, so its paths run from this repo's git root (tools/test/fixture/...): run it in a
// git checkout, as CI does.

import { describe, expect, it } from "bun:test";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { addCard, addReadmePage, type Files } from "../build.ts";
import type { LocalEntry, ReadmeEntry } from "../manifest.ts";
import { byCodeUnit } from "../sort.ts";

const EXPECTED = path.join(import.meta.dir, "fixture/expected");

const FIXTURE: ReadmeEntry = {
  kind: "readme",
  slug: "fixture",
  title: "fixture",
  blurb: 'a <span class="explanation" title="test data">fixture</span> &amp; more',
  license: "MIT",
  list: true,
  repo: "o/fixture",
  ref: { kind: "local", file: "test/fixture/README.md" }, // relative to tools/
  path: "/projects/fixture/",
  card: { title: undefined, subtitle: undefined },
  sitemap: true,
  drop: ["Dropped"],
};

// a title too long for the largest size, so the card's fitting loop has to shrink it, and a long URL that wraps
const LONG_TITLE: LocalEntry = {
  kind: "local",
  slug: "a-very-long-project-name-that-has-to-wrap-somewhere",
  title: undefined,
  blurb: undefined,
  license: undefined,
  list: false,
  path: "/projects/a-very-long-project-name-that-has-to-wrap-somewhere/",
  card: { title: "A project whose name runs on for far too many words", subtitle: "the card shrinks it to fit" },
  sitemap: false,
};

const made: Files = new Map();
const { name } = await addReadmePage(made, FIXTURE, true);
await addCard(made, FIXTURE, name);
await addCard(made, LONG_TITLE, LONG_TITLE.card === false ? "" : LONG_TITLE.card.title);

if (Bun.env["GOLDEN"] === "write")
  for (const [repoPath, bytes] of made) {
    await mkdir(path.dirname(path.join(EXPECTED, repoPath)), { recursive: true });
    await writeFile(path.join(EXPECTED, repoPath), bytes);
  }

/** Every file under `dir`, as paths relative to it. */
async function listFiles(dir: string): Promise<string[]> {
  const found = await readdir(dir, { recursive: true, withFileTypes: true });
  return found
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
    .sort(byCodeUnit);
}

describe("the fixture page", () => {
  it("makes exactly the expected files", async () => {
    expect([...made.keys()].sort(byCodeUnit)).toEqual(await listFiles(EXPECTED));
  });

  it.each([...made.keys()].sort(byCodeUnit))("%s is byte-identical", async (repoPath) => {
    const want = await readFile(path.join(EXPECTED, repoPath));
    expect(Buffer.compare(Buffer.from(made.get(repoPath) ?? new Uint8Array()), want)).toBe(0);
  });
});
