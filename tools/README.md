# Site build <!-- omit from toc -->

`tools/` builds every generated file on the site from what is committed here: project pages, link-preview cards, banners, icons, the home page's projects list and the sitemap. The same inputs give the same bytes on macOS and Linux, and CI checks that on every push.

**Needs:** bun at the version `package.json` pins (the `make` targets run it through `bunx`, so nothing to install), and [gh](https://cli.github.com), logged in: READMEs come from GitHub, never from a local checkout.

## Table of Contents <!-- omit from toc -->

- [Commands](#commands)
- [Common tasks](#common-tasks)
  - [Add or update a project](#add-or-update-a-project)
  - [Try a README before releasing it](#try-a-readme-before-releasing-it)
  - [Change a card or banner](#change-a-card-or-banner)
  - [Update the golden files](#update-the-golden-files)
- [When a check fails](#when-a-check-fails)
- [What the build makes](#what-the-build-makes)
- [How the build works](#how-the-build-works)
- [Why it is built this way](#why-it-is-built-this-way)
- [Code rules](#code-rules)
- [After a deploy](#after-a-deploy)

## Commands

Run these from the repo root. `make` on its own lists them, and CI runs the same targets.

| Command | What it does |
| --- | --- |
| `make install` | Installs the pinned dependencies into `tools/node_modules`, once. |
| `make serve` | Serves the site at <http://localhost:8765/>; on localhost the star counts are mocked. `PORT=` changes the port. |
| `make build` | Regenerates every generated file in the repo. Commit what changed. |
| `make check` | Builds in memory and compares with the repo. Changes nothing; fails on any difference. |
| `make test` | Runs the tests, offline. |
| `make typecheck` | Type-checks the build and the site's own scripts with TypeScript 7, strict. |
| `make lint` | Lints and format-checks with Biome. `make fmt` fixes what it can. |
| `make dev` | Builds into a temporary folder (or `OUT=`), with local `"readme"` entries allowed. |
| `make indexnow` | Prints the IndexNow request. `INDEXNOW_FLAGS=--send` submits it. |
| `make screenshots` | Re-photographs the live site for the install dialog. By hand; needs Chrome and uv. |

## Common tasks

### Add or update a project

1. Edit its entry in `projects.jsonc`. Its place in the file is its place on the home page. Your editor checks the fields against `projects.schema.json`, and `manifest.ts` checks the same rules.
2. Run `make build`.
3. Commit everything that changed, `generated.txt` included.

The kinds of entry:

- **A README page:** `repo` plus a `tag` or a `commit`, never both. A ref that doesn't exist fails the build. Bump the ref to publish a newer README; its images are copied in at that ref, and ones it no longer uses are deleted.
- **Sections left out:** `"drop": ["Build and run"]` names headings to skip. A heading the README doesn't have fails the build. A section that ends up empty once off-site images are removed (a star-history chart, say) is dropped on its own.
- **Listed, no page:** `"page": false`.
- **A hand-made page in this repo**, like earthrise: `path`. The build makes only its card and sitemap entry.

### Try a README before releasing it

Give `"readme": "../path/to/README.md"` instead of a ref, then run `make dev`. It writes into a temporary folder; a plain `make build` refuses such an entry.

### Change a card or banner

1. Edit the layout in `images.ts`: `POST` and `layoutPost` for link previews, `CONTACT` for the contact card and banners. The sky's framing is `FRAMES` in `sky.ts`.
2. Run `make build` and look at the PNGs.
3. Run `make test`. The golden card fails on purpose: update the golden files (below).
4. Commit the new PNGs.

### Update the golden files

`test/golden.test.ts` builds `test/fixture/README.md`, a README using every feature, and compares each byte with `test/fixture/expected/`. After a deliberate change, rewrite the expected files, then look at them before committing:

```sh
cd tools && GOLDEN=write bunx bun@<version> test golden
```

## When a check fails

1. **Read the log.** Each line is `changed`, `missing` or `stale`, then a path. A line starting `error:` is a failed build and names the entry.
2. **Run `make check` locally.** If it fails the same way, an input or a tool changed without a rebuild: run `make build` and commit.
3. **Passes locally, fails in CI:** the output depends on the machine. `make test` on each OS (CI's test job) names the stage: the golden card is the PNG path (sky, png, quantise), the golden page is the README path.
4. **A README page changed but its ref didn't:** the upstream tag moved. Pin a `commit` instead.
5. **`stale`:** `generated.txt` lists a file the build no longer makes. `make build` deletes it.
6. **A gh error:** check `GH_TOKEN`, then the rate limit, then that the ref exists.
7. **"this is bun X":** run through `bunx bun@<pinned>`. Bump bun only together with a rebuild of every PNG.

`bun tools/build.ts --check` exits 0 when everything matches, 1 on a difference and 2 on an error; `make` reports either failure as exit 2.

## What the build makes

`generated.txt` lists every file the build makes whole. It also rewrites the marked regions of the hand-written `index.html` and `sitemap.xml`.

| Output | Made by | From |
| --- | --- | --- |
| `projects/<slug>/index.html` and its images | `readme.ts`, `page.ts` + `page.html` | the repo's README at the tag or commit in `projects.jsonc` |
| `projects/<slug>/card.png`, link previews | `images.ts` | the title and subtitle, over the earthrise sky |
| `assets/img/contact-card.png`, `banner.png`, `banner-linkedin.png` | `images.ts` | the layouts in `CONTACT` |
| `assets/img/icon-*.png`, `apple-touch-icon.png`, `shortcut-earthrise-96.png` | `images.ts` | `assets/img/favicon.svg` and `icons/*.svg` |
| the projects list in `index.html`, project URLs in `sitemap.xml` | `site.ts` | `projects.jsonc`, between `projects:start` and `projects:end`; a README page's `lastmod` is its pinned commit's author date |

Made by hand instead:

- **Install-dialog screenshots:** `make screenshots`; see `share-images/README.md`.
- **Star catalogues** (`assets/earthrise/data/stars-*.bin`): `stars/build.py`, from the HYG star database.

## How the build works

```text
make build / make check -> build.ts main()
  parseCli, requirePinnedBun
  readManifest(projects.jsonc)                manifest.ts   -> Entry[]
  siteFiles(entries, allowLocal)              build.ts      -> Map<repo path, bytes>
    for a readme entry: addReadmePage
      openSource(entry)                       github.ts     gh api at the pinned ref
      renderReadme(markdown)                  readme.ts     the passes, in pipeline order
        shrinkImages                          raster.ts     sizes each <img>; PNG and JPEG become WebP + JPEG XL
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

Each step is a plain function that takes its inputs as arguments. `errors.ts` holds the one error class: a `BuildError` prints its message without a stack and exits 2.

## Why it is built this way

Every choice below keeps the bytes the same on every operating system.

- **resvg as WebAssembly:** its native builds differ in the last bit of their floating-point maths between operating systems.
- **Card PNGs through node:zlib (`png.ts`):** other encoders link each OS's own zlib.
- **bun pinned and checked:** its zlib compresses the PNGs.
- **README images through `Bun.Image`'s "bun" backend (`raster.ts`):** its codecs are the same on every OS, and so is its resize. macOS's default backend, vImage, resizes differently.
- **JPEG XL through `@jsquash/jxl`:** libjxl as WebAssembly, one binary everywhere; `Bun.Image` has no JPEG XL. It is there for fun: Chrome and Firefox draw it progressively, and browsers without it take the WebP.
- **Own median cut (`quantise.ts`):** whole-number maths only, so the palette is the same everywhere. It replaced Pillow, Python and uv.
- **Patched font, committed:** satori can't turn on Jost's stylistic set, so `fonts/patch-jost.py` bakes the single-storey a into `Jost-500-Medium-a.ttf`. The build reads only the result; the script and the original font show the patch is reproducible.
- **The site's own `scene.js` for the sky:** the cards stay in step with the earthrise page.
- **gh, not plain HTTP:** a tag is looked up as a tag, so a branch of the same name can't stand in for it.
- **`generated.txt`:** stale files are found by name, not by scanning folders.
- **Code-unit sorting (`sort.ts`):** `localeCompare` orders differently on machines with different locales.

Tried and dropped, each because its bytes differed between operating systems: native `@resvg/resvg-js`, `@napi-rs/canvas`, Pillow writing PNGs, `Bun.deflateSync` (raw deflate, not the zlib stream PNG needs), and browser screenshots.

## Code rules

`any` is never allowed. `tsconfig.json` sets only what goes beyond TypeScript 7's strict defaults.

`tsconfig.site.json` checks the site's own scripts, plain JavaScript typed by JSDoc, against the browser's DOM:

- **Copy button:** `assets/js/copy.js` and `copy-rules.js`.
- **Hover prefetch:** `assets/js/prefetch.js` and `prefetch-rules.js`.
- **Umami opt-out on the home page:** `assets/js/umami-opt-out.js`.
- **Page transitions:** `assets/earthrise/transition.js`, `handoff.js`, `arrive.js`, `home.js` and `project.js`. `scene.d.ts` types the scene they drive.

Their DOM-free rules are tested in `test/copy-rules.test.ts`, `test/prefetch-rules.test.ts` and `test/handoff.test.ts`. Every test file is a set of tables: one row per case, one property per test.

Biome (`biome.json` at the repo root) covers `tools/` and those site scripts. It bans an explicit `any` and the type assertions that would narrow one. Its plugin `biome/no-any-sources.grit` bans `JSON.parse` and `.json()`, which return `any`, outside `readJson` in `github.ts`. Data from outside (JSON, the manifest) is typed `unknown` and narrowed by checks.

## After a deploy

`pages.yml` runs `indexnow.ts --send` in its own job:

1. It checks that `/<key>.txt` serves the key.
2. It submits every URL in `sitemap.xml` to IndexNow (Bing, Naver and others; not Google).
3. It retries 429, 5xx and network errors twice, after 10 s and then 30 s. The key check also retries a 404.

If the submission still fails, that job fails and GitHub emails. The deploy job stays green.
