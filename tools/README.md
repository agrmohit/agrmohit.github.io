# Site build

`build.ts` makes every generated file on the site from what is committed here. Run it again and you get the same bytes, on macOS or on Linux, and `make check` proves it. `generated.txt` lists every file it makes whole; it also rewrites the marked regions of the hand-written `index.html` and `sitemap.xml`.

| Output | Made by | From |
| --- | --- | --- |
| `projects/<slug>/index.html` and its images | `readme.ts`, `page.ts` + `page.html` | the repo's README at the tag or commit in `projects.jsonc` |
| `projects/<slug>/card.png`, link previews | `images.ts` | the title and subtitle, over the earthrise sky |
| `assets/img/contact-card.png`, `banner.png`, `banner-linkedin.png` | `images.ts` | the layouts in `CONTACT` |
| `assets/img/icon-*.png`, `apple-touch-icon.png`, `shortcut-earthrise-96.png` | `images.ts` | `assets/img/favicon.svg` and `icons/*.svg` |
| the projects list in `index.html`, project URLs in `sitemap.xml` | `site.ts` | `projects.jsonc`, between `projects:start` and `projects:end` |

The install-dialog screenshots are the exception: `share-images/build.sh screenshots` takes them by hand.

## Use

The `Makefile` at the repo root wraps all of it; `make` lists the targets, and CI runs the same ones.

```sh
make install     # once: the pinned dependencies
make serve       # preview the site at http://localhost:8765/ (mocked star counts)
make build       # regenerate every generated file in the repo, then commit what changed
make check       # change nothing; fail if a generated file differs
make test        # the tests, offline
make typecheck   # TypeScript 7, strict
make lint        # Biome; `make fmt` fixes what it can
make dev         # build into a temporary folder, local "readme" entries allowed
```

The targets that run the build call `bunx bun@<version>` with the version `package.json` pins. `bun tools/build.ts --check` itself exits 0 when everything matches, 1 on a difference and 2 on an error; `make` turns both failures into 2. The build needs [gh](https://cli.github.com), logged in: READMEs come from GitHub, never from a checkout.

## Read this first: the call stack

```text
make build / make check -> build.ts main()
  parseCli, requirePinnedBun
  readManifest(projects.jsonc)                manifest.ts   -> Entry[]
  siteFiles(entries, allowLocal)              build.ts      -> Map<repo path, bytes>
    for a readme entry: addReadmePage
      openSource(entry)                       github.ts     gh api at the pinned ref
      renderReadme(markdown)                  readme.ts     the passes, in pipeline order
      projectPage(...)                        page.ts       fills page.html
    for an entry with a card: addCard
      postCard(...)                           images.ts     satori -> sky.ts -> png.ts -> quantise.ts
    icons(), contactCard() x3                 images.ts
    withProjectList, withSitemap              site.ts       the marked regions
    generated.txt                             build.ts      the sorted list of all of the above but index.html and sitemap.xml
  build:   compare -> write every file -> delete stale ones
  --check: compare -> print each difference -> exit 1
  --out:   write every file into the folder
```

Each step is a plain function with its inputs as arguments. `errors.ts` has the one error class: a `BuildError` prints its message without a stack and exits 2.

## Adding a project

Add an entry to `projects.jsonc` where it should appear on the home page. `projects.schema.json` describes the fields for your editor; `manifest.ts` checks the same rules. Then run `make build` and commit everything that changed, `generated.txt` included.

- **A README page:** `repo` and a `tag` or a `commit`, never both. A ref that doesn't exist fails the build. Bump the ref to publish a newer README; its images are copied in at that ref, and the build deletes the ones it no longer uses.
- **Leaving out sections:** `"drop": ["Build and run"]` names headings to leave out. A name the README doesn't have fails the build. A section left empty once images hosted elsewhere are removed, such as a star-history chart, goes on its own.
- **Listed without a page:** `"page": false`.
- **A page made by hand in this repo, like earthrise:** `path`; the build makes only its card and sitemap entry.
- **Before a release:** give `"readme": "../path/to/README.md"` instead of a ref and run `make dev`. It writes to a temporary folder; a plain build refuses such an entry.

## Changing a card

The layouts are in `images.ts`: `POST` and `layoutPost` for link previews, `CONTACT` for the contact card and banners. The sky's framing is `FRAMES` in `sky.ts`. Run `make build`, look at the PNGs, run `make test` (the golden card fails on purpose; see below), and commit the new PNGs.

## Tests

`make test` runs offline. Each test file is a set of tables: one row per case, one property per test.

`test/golden.test.ts` builds `test/fixture/README.md`, a README with every feature, and compares each byte with `test/fixture/expected/`. CI runs it on Linux amd64, Linux arm64 and macOS, which is what proves the bytes are the same everywhere. After a deliberate change, rewrite the expected files and look at them before committing:

```sh
cd tools && GOLDEN=write bunx bun@<version> test golden
```

## A check failed in CI

1. Read the log. Each line is `changed`, `missing` or `stale` and a path. A line starting `error:` is a failure to build, and it names the entry.
2. Run `make check` locally. If it fails the same way, an input or a tool changed without a rebuild: run `make build` and commit.
3. If it passes locally but fails in CI, the output depends on the machine. `make test` on each OS (CI's test job) names the stage: the golden card is the PNG path (sky, png, quantise), the golden page is the README path.
4. A README page changed although its ref did not: the upstream tag moved. Pin a `commit` instead.
5. `stale` means `generated.txt` lists a file the build no longer makes. `make build` deletes it.
6. On a gh error, check `GH_TOKEN`, then the rate limit, then that the ref exists.
7. "this is bun X": run through `bunx bun@<pinned>`. Bump bun only with a rebuild of every PNG.

## Why it is built this way

- **resvg as WebAssembly:** its native builds differ in the last bit of their floating-point maths between operating systems.
- **The build writes the card PNGs with node:zlib (`png.ts`):** other encoders link each OS's own zlib.
- **bun is pinned and checked:** its zlib is what compresses the PNGs.
- **Its own median cut (`quantise.ts`):** whole-number maths only, so the palette is the same everywhere; it replaced Pillow, Python and uv.
- **The patched font is committed:** satori can't turn on Jost's stylistic set, so `fonts/patch-jost.py` bakes the single-storey a into `Jost-500-Medium-a.ttf`. The build only reads the result; the script and the original font are kept to show the patch is reproducible.
- **The sky is the site's real `scene.js`:** the cards stay in step with the earthrise page.
- **gh, not plain HTTP:** a tag is looked up as a tag, so a branch of the same name can't stand in for it.
- **`generated.txt`:** stale files are found by name, not by scanning folders.
- **Code-unit sorting (`sort.ts`):** `localeCompare` orders differently on machines with different locales.

Tried and dropped, each because its bytes differed between operating systems: native `@resvg/resvg-js`, `@napi-rs/canvas`, Pillow writing PNGs, `Bun.deflateSync` (raw deflate, not the zlib stream PNG needs), and browser screenshots.

## Strict TypeScript

`tsconfig.json` sets only what goes beyond TypeScript 7's strict defaults. `any` is never allowed. Biome (`biome.json`) bans an explicit `any` and the type assertions that would narrow one. Its plugin `biome/no-any-sources.grit` bans `JSON.parse` and `.json()`, which return `any`, outside `readJson` in `github.ts`. Data from outside (JSON, the manifest) is typed `unknown` and narrowed by checks.
