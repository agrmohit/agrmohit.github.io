import { describe, expect, it } from "bun:test";
import { type ReadmeOptions, renderReadme, repoPath } from "../readme.ts";
import { asyncFailure, failure } from "./failure.ts";

const AT: ReadmeOptions = { repo: "o/app", ref: "v1.0.0", readmeDir: "", drop: [] };
const BLOB = "https://github.com/o/app/blob/v1.0.0/";
const render = (markdown: string, options: Partial<ReadmeOptions> = {}) =>
  renderReadme(markdown, { ...AT, ...options });

describe("rendered markup", () => {
  interface Row {
    name: string;
    markdown: string;
    /** Strings the HTML must hold. */
    wanted: string[];
    /** Strings it must not. */
    unwanted: string[];
  }

  const rows: readonly Row[] = [
    {
      name: "an external image goes with its link",
      markdown: "[![CI](https://x.io/b.svg)](https://x.io) text",
      wanted: ["<p>text</p>"],
      unwanted: ["x.io/b.svg", '<a href="https://x.io"'],
    },
    {
      name: "a paragraph of badges goes entirely",
      markdown: "[![a](https://a.io/a.svg)](https://a.io) [![b](https://b.io/b.svg)](#x)\n\nnext",
      wanted: ["<p>next</p>"],
      unwanted: ["<p> </p>", "<p></p>", "a.io", 'href="#x"'],
    },
    {
      name: "a protocol-relative image goes",
      markdown: "![x](//cdn.io/x.png) kept",
      wanted: ["kept"],
      unwanted: ["cdn.io"],
    },
    {
      name: "a data image stays",
      markdown: "![x](data:image/png;base64,AAAA)",
      wanted: ['src="data:image/png;base64,AAAA"'],
      unwanted: [],
    },
    {
      name: "a relative image keeps its path",
      markdown: "![x](./docs/a.png)",
      wanted: ['src="docs/a.png"'],
      unwanted: [],
    },
    {
      name: "a raw HTML image in a table",
      markdown: '<table><tr><td><img src="docs/b.png" width="10"></td></tr></table>',
      wanted: ['src="docs/b.png"', 'width="10"'],
      unwanted: [],
    },
    {
      name: "a raw HTML external image goes",
      markdown: '<p><img src="https://x.io/a.png"> words</p>',
      wanted: ["words"],
      unwanted: ["x.io"],
    },
    {
      name: "a relative link points at the file at the ref",
      markdown: "[l](docs/guide.md#intro)",
      wanted: [`href="${BLOB}docs/guide.md#intro"`],
      unwanted: [],
    },
    { name: "a root-relative link", markdown: "[l](/LICENSE)", wanted: [`href="${BLOB}LICENSE"`], unwanted: [] },
    { name: "an anchor link is untouched", markdown: "[l](#usage)", wanted: ['href="#usage"'], unwanted: [] },
    {
      name: "an absolute link is untouched",
      markdown: "[l](https://example.com/a)",
      wanted: ['href="https://example.com/a"'],
      unwanted: [],
    },
    {
      name: "a mailto link is untouched",
      markdown: "[l](mailto:a@b.c)",
      wanted: ['href="mailto:a@b.c"'],
      unwanted: [],
    },
    {
      name: "heading ids are GitHub's",
      markdown: "## Build `and` run!\n\nx\n\n## Build and run\n\ny",
      wanted: ['id="build-and-run"', 'id="build-and-run-1"'],
      unwanted: [],
    },
    {
      name: "a note alert",
      markdown: "> [!NOTE]\n> hi",
      wanted: ["markdown-alert markdown-alert-note", "markdown-alert-title"],
      unwanted: [],
    },
    { name: "a caution alert", markdown: "> [!CAUTION]\n> hi", wanted: ["markdown-alert-caution"], unwanted: [] },
    {
      name: "a plain quote stays a quote",
      markdown: "> just a quote",
      wanted: ["<blockquote>"],
      unwanted: ["markdown-alert"],
    },
    {
      name: "a footnote",
      markdown: "a[^1]\n\n[^1]: note",
      wanted: ["data-footnotes", 'id="user-content-fn-1"'],
      unwanted: [],
    },
    {
      name: "a task list is read-only",
      markdown: "- [x] done\n- [ ] todo",
      wanted: ["contains-task-list", "checked", "disabled"],
      unwanted: [],
    },
    { name: "strikethrough", markdown: "~~gone~~", wanted: ["<del>gone</del>"], unwanted: [] },
    {
      name: "a bare URL is linked",
      markdown: "see https://example.com now",
      wanted: ['<a href="https://example.com">'],
      unwanted: [],
    },
    {
      name: "Go is highlighted",
      markdown: "```go\nfunc main() {}\n```",
      wanted: ['<span class="pl-k">func</span>'],
      unwanted: [],
    },
    {
      name: "Clojure is highlighted",
      markdown: "```clojure\n(defn f [x] x)\n```",
      wanted: ['<span class="pl-k">defn</span>'],
      unwanted: [],
    },
    {
      name: "TOML is highlighted",
      markdown: '```toml\n[tool]\nname = "x"\n```',
      wanted: ['class="pl-s"'],
      unwanted: [],
    },
    {
      name: "a Dockerfile is highlighted",
      markdown: "```dockerfile\nFROM alpine\n```",
      wanted: ['<span class="pl-k">FROM</span>'],
      unwanted: [],
    },
    { name: "code keeps its blank lines", markdown: "```text\na\n\n\n\nb\n```", wanted: ["a\n\n\n\nb"], unwanted: [] },
    {
      name: "raw details stay",
      markdown: "<details><summary>s</summary>\n\nbody\n\n</details>",
      wanted: ["<details>", "<summary>s</summary>"],
      unwanted: [],
    },
    {
      name: "a dark-mode source stays, made relative",
      markdown:
        '<picture><source media="(prefers-color-scheme: dark)" srcset="./docs/dark.png"><img src="docs/light.png"></picture>',
      wanted: ['srcset="docs/dark.png"', 'src="docs/light.png"'],
      unwanted: ["./docs"],
    },
    {
      name: "an external source goes",
      markdown: '<picture><source srcset="https://x.io/d.png"><img src="docs/l.png"></picture>',
      wanted: ['src="docs/l.png"'],
      unwanted: ["x.io", "<source"],
    },
    {
      name: "srcset descriptors stay",
      markdown: '<img src="a.png" srcset="./a.png 1x, b@2x.png 2x">',
      wanted: ['srcset="a.png 1x, b@2x.png 2x"'],
      unwanted: [],
    },
    {
      name: "a srcset loses only its external candidate",
      markdown: '<img src="a.png" srcset="a.png 1x, https://x.io/b.png 2x">',
      wanted: ['src="a.png"', 'srcset="a.png 1x"'],
      unwanted: ["x.io"],
    },
    {
      name: "a srcset of only external candidates goes",
      markdown: '<img src="a.png" srcset="https://x.io/b.png 2x">',
      wanted: ['src="a.png"'],
      unwanted: ["x.io", "srcset"],
    },
    {
      name: "a named anchor target stays",
      markdown: '<a name="setup"></a>\n\n## Setup',
      wanted: ['name="setup"'],
      unwanted: [],
    },
    { name: "an id anchor target stays", markdown: '<p><a id="top"></a>words</p>', wanted: ['id="top"'], unwanted: [] },
    {
      name: "a link around an emptied picture goes",
      markdown:
        '<a href="https://x.io"><picture><source srcset="https://x.io/d.svg"><img src="https://x.io/l.svg"></picture></a>\n\nafter',
      wanted: ["after"],
      unwanted: ["x.io", "<picture", "<a "],
    },
    {
      name: "a picture with a local image stays",
      markdown: '<picture><source srcset="https://x.io/d.svg"><img src="l.png"></picture>',
      wanted: ["<picture>", 'src="l.png"'],
      unwanted: ["x.io"],
    },
    {
      name: "a comment keeps its text",
      markdown: "<!-- keep me -->\n\ntext",
      wanted: ["<!-- keep me -->"],
      unwanted: [],
    },
    {
      name: "no blank-line runs around a table",
      markdown: "a\n\n| x | y |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |\n\nb",
      wanted: [],
      unwanted: ["\n\n\n"],
    },
    {
      name: "mermaid becomes inline SVG with no script",
      markdown: "```mermaid\nsequenceDiagram\n  A->>B: hi\n```",
      wanted: ['<figure class="mermaid"><svg'],
      unwanted: ["<script", "language-mermaid"],
    },
    {
      name: "a file name with a space stays escaped, so a srcset still parses",
      markdown: '<img src="my%20pic.png" srcset="my%20pic.png 2x">',
      wanted: ['src="my%20pic.png"', 'srcset="my%20pic.png 2x"'],
      unwanted: ["my pic"],
    },
    {
      name: "a link to a file with a space stays escaped",
      markdown: "[l](docs/my%20guide.md)",
      wanted: [`href="${BLOB}docs/my%20guide.md"`],
      unwanted: [],
    },
  ];

  it.each(rows)("$name", async ({ markdown, wanted, unwanted }) => {
    const { html } = await render(markdown);
    expect({ held: wanted.filter((s) => html.includes(s)), stray: unwanted.filter((s) => html.includes(s)) }).toEqual({
      held: wanted,
      stray: [],
    });
  });
});

describe("wide wrappers", () => {
  interface Row {
    name: string;
    markdown: string;
    /** The tags wrapped in .wide, in order. */
    wrapped: string[];
  }

  const rows: readonly Row[] = [
    { name: "a pipe table", markdown: "| a |\n| - |\n| 1 |", wrapped: ["table"] },
    { name: "a raw table", markdown: "<table><tr><td>x</td></tr></table>", wrapped: ["table"] },
    { name: "a code block", markdown: "```\nx\n```", wrapped: ["pre"] },
    { name: "an image alone", markdown: "![a](a.png)", wrapped: ["p"] },
    { name: "a linked image alone", markdown: "[![a](a.png)](b.png)", wrapped: ["p"] },
    { name: "two images", markdown: "![a](a.png) ![b](b.png)", wrapped: ["p"] },
    { name: "an image with text is text", markdown: "![a](a.png) words", wrapped: [] },
    { name: "a plain paragraph", markdown: "words", wrapped: [] },
    { name: "a list", markdown: "- a\n- b", wrapped: [] },
    { name: "a mermaid figure", markdown: "```mermaid\nflowchart LR\n  A --> B\n```", wrapped: ["figure"] },
    { name: "code nested in a list stays put", markdown: "- item\n\n  ```\n  x\n  ```", wrapped: [] },
  ];

  it.each(rows)("$name", async ({ markdown, wrapped }) => {
    const { html } = await render(markdown);
    expect([...html.matchAll(/<div class="wide"><(\w+)/g)].map((match) => match[1])).toEqual(wrapped);
  });
});

describe("what the page needs", () => {
  interface ImagesRow {
    name: string;
    markdown: string;
    readmeDir: string;
    images: string[];
  }

  const imageRows: readonly ImagesRow[] = [
    {
      name: "sorted and unique",
      markdown: "![b](docs/b.png) ![a](docs/a.png) ![a](./docs/a.png)",
      readmeDir: "",
      images: ["docs/a.png", "docs/b.png"],
    },
    {
      name: "relative to a README in a folder",
      markdown: "![a](img/a.png) ![r](/root.png)",
      readmeDir: "pkg",
      images: ["pkg/img/a.png", "root.png"],
    },
    {
      name: "sources, srcsets and videos too",
      markdown:
        '<picture><source srcset="d.png"><img src="l.png" srcset="l.png 1x, l2.png 2x"></picture><video src="v.mp4" poster="p.png"></video>',
      readmeDir: "",
      images: ["d.png", "l.png", "l2.png", "p.png", "v.mp4"],
    },
    // code-unit order: capitals first, so the order is the same on every machine
    { name: "sorted by code unit", markdown: "![b](b.png) ![B](C.png)", readmeDir: "", images: ["C.png", "b.png"] },
    { name: "none", markdown: "words", readmeDir: "", images: [] },
  ];

  it.each(imageRows)("images: $name", async ({ markdown, readmeDir, images }) => {
    expect((await render(markdown, { readmeDir })).images).toEqual(images);
  });

  interface TitleRow {
    name: string;
    markdown: string;
    title: string | undefined;
  }

  const titleRows: readonly TitleRow[] = [
    { name: "the first h1", markdown: "# One\n\n# Two", title: "One" },
    { name: "the text of a styled h1", markdown: "# The `app`", title: "The app" },
    { name: "a raw h1", markdown: '<h1 align="center">Raw</h1>', title: "Raw" },
    { name: "none", markdown: "## Only h2", title: undefined },
  ];

  it.each(titleRows)("title: $name", async ({ markdown, title }) => {
    expect((await render(markdown)).title).toBe(title);
  });

  interface WidthRow {
    name: string;
    diagram: string;
  }

  const wideSequence = Array.from({ length: 12 }, (_, i) => `  P${i}->>P${i + 1}: a fairly long message ${i}`).join(
    "\n",
  );
  const widthRows: readonly WidthRow[] = [
    { name: "a small flowchart", diagram: "flowchart LR\n  A --> B" },
    { name: "a wide sequence", diagram: `sequenceDiagram\n${wideSequence}` },
  ];

  // under 60% the labels are too small to read, so a wider diagram scrolls instead
  it.each(widthRows)("a diagram shrinks to 60% of its width at most: $name", async ({ diagram }) => {
    const { html } = await render(`\`\`\`mermaid\n${diagram}\n\`\`\``);
    const root = /<svg\b[^>]*>/.exec(html)?.[0] ?? "";
    const width = Number(/viewBox="[\d.]+ [\d.]+ ([\d.]+)/.exec(root)?.[1]);
    // the root <svg> only: inner elements keep their own sizes
    expect([...html.matchAll(/min-width:(\d+)px;/g)].map((match) => [match[1], root.includes(match[0])])).toEqual([
      [String(Math.round(width * 0.6)), true],
    ]);
  });

  it("renders the same twice", async () => {
    const markdown = "# A\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\n```go\nx := 1\n```";
    expect((await render(markdown)).html).toBe((await render(markdown)).html);
  });
});

describe("sections", () => {
  const headings = (html: string): string[] =>
    [...html.matchAll(/<h(\d) id="([\w-]+)"/g)].map((match) => `h${match[1]} ${match[2]}`);

  interface Row {
    name: string;
    markdown: string;
    drop: string[];
    /** The headings left, as "h<level> <id>". */
    left: string[];
  }

  const rows: readonly Row[] = [
    {
      name: "a section left empty by a dropped image goes",
      markdown: "# T\n\nintro\n\n## Star History\n\n![s](https://x.io/s.svg)\n\n## Licence\n\nMIT",
      drop: [],
      left: ["h1 t", "h2 licence"],
    },
    {
      name: "an empty last section goes",
      markdown: "# T\n\n## Usage\n\nrun it\n\n## Star History\n\n![s](https://x.io/s.svg)",
      drop: [],
      left: ["h1 t", "h2 usage"],
    },
    {
      name: "a section holding only empty subsections goes",
      markdown: "# T\n\n## Extras\n\n### Badges\n\n![b](https://x.io/b.svg)\n\n## Usage\n\nx",
      drop: [],
      left: ["h1 t", "h2 usage"],
    },
    {
      name: "a section holding only an emptied linked picture goes",
      markdown:
        '# T\n\n## Star History\n\n<a href="https://s.io"><picture><source srcset="https://s.io/d.svg"><img src="https://s.io/l.svg"></picture></a>\n\n## Z\n\nz',
      drop: [],
      left: ["h1 t", "h2 z"],
    },
    {
      name: "a section holding only a comment goes",
      markdown: "# T\n\n## Notes\n\n<!-- todo -->\n\n## Z\n\nz",
      drop: [],
      left: ["h1 t", "h2 z"],
    },
    {
      name: "a section whose subsection has content stays",
      markdown: "# T\n\n## Extras\n\n### Notes\n\ntext",
      drop: [],
      left: ["h1 t", "h2 extras", "h3 notes"],
    },
    { name: "the title stays even with nothing under it", markdown: "# T", drop: [], left: ["h1 t"] },
    {
      name: "a named section goes with its subsections",
      markdown: "# T\n\n## Build\n\nmake\n\n### Flags\n\n-v\n\n## Licence\n\nMIT",
      drop: ["Build"],
      left: ["h1 t", "h2 licence"],
    },
    {
      name: "a named subsection goes alone",
      markdown: "# T\n\n## Build\n\nmake\n\n### Flags\n\n-v\n\n## Licence\n\nMIT",
      drop: ["Flags"],
      left: ["h1 t", "h2 build", "h2 licence"],
    },
    {
      name: "several named sections",
      markdown: "# T\n\n## A\n\na\n\n## B\n\nb\n\n## C\n\nc",
      drop: ["A", "C"],
      left: ["h1 t", "h2 b"],
    },
    {
      name: "a named section matches the heading's text",
      markdown: "# T\n\n## Build `and` run\n\nx\n\n## Z\n\nz",
      drop: ["Build and run"],
      left: ["h1 t", "h2 z"],
    },
    { name: "nothing named, nothing empty", markdown: "# T\n\n## A\n\na", drop: [], left: ["h1 t", "h2 a"] },
  ];

  it.each(rows)("$name", async ({ markdown, drop, left }) => {
    expect(headings((await render(markdown, { drop })).html)).toEqual(left);
  });

  it("content under a dropped section goes with it", async () => {
    const { html, images } = await render("# T\n\n## Build\n\n![shot](docs/build.png)\n\nsecret\n\n## Z\n\nz", {
      drop: ["Build"],
    });
    expect({ secretShown: html.includes("secret"), images }).toEqual({ secretShown: false, images: [] });
  });
});

describe("refusals", () => {
  interface Row {
    name: string;
    markdown: string;
    drop: string[];
    message: string;
  }

  const rows: readonly Row[] = [
    { name: "an image named like the page", markdown: "![a](index.html)", drop: [], message: "index.html" },
    { name: "an image named like the card", markdown: "![a](./card.png)", drop: [], message: "card.png" },
    {
      name: "images whose names differ only in case",
      markdown: "![a](A.png) ![b](a.png)",
      drop: [],
      message: "differ only in case",
    },
    { name: "broken mermaid", markdown: "```mermaid\nflowchart TD A[x] B\n```", drop: [], message: "mermaid block 1" },
    {
      name: "dropping a name no heading has",
      markdown: "# T\n\n## A\n\na",
      drop: ["Nope"],
      message: 'no section "Nope"',
    },
    { name: "dropping the title", markdown: "# T\n\n## A\n\na", drop: ["T"], message: "the page's title" },
    { name: "an image above the repo", markdown: "![a](../a.png)", drop: [], message: "outside the repo" },
    { name: "an image that names the README's folder", markdown: "![a](./)", drop: [], message: "names a folder" },
    { name: "an image that names a folder", markdown: "![a](docs/)", drop: [], message: "names a folder" },
  ];

  it.each(rows)("refuses $name", async ({ markdown, drop, message }) => {
    expect(await asyncFailure(() => render(markdown, { drop }))).toContain(message);
  });
});

describe("repoPath", () => {
  interface Row {
    name: string;
    url: string;
    readmeDir: string;
    want: string;
  }

  const rows: readonly Row[] = [
    { name: "plain", url: "docs/a.png", readmeDir: "", want: "docs/a.png" },
    { name: "dot slash", url: "./a.png", readmeDir: "", want: "a.png" },
    { name: "query and hash dropped", url: "a.png?raw=1#x", readmeDir: "", want: "a.png" },
    { name: "encoded", url: "my%20shot.png", readmeDir: "", want: "my shot.png" },
    { name: "from a folder", url: "a.png", readmeDir: "pkg", want: "pkg/a.png" },
    { name: "up out of a folder", url: "../a.png", readmeDir: "pkg", want: "a.png" },
    { name: "root-relative", url: "/a.png", readmeDir: "pkg", want: "a.png" },
  ];

  it.each(rows)("$name", ({ url, readmeDir, want }) => {
    expect(repoPath(url, readmeDir)).toBe(want);
  });

  interface Refusal {
    name: string;
    url: string;
    readmeDir: string;
    message: string;
  }

  const refusals: readonly Refusal[] = [
    { name: "above the root", url: "../a.png", readmeDir: "", message: "outside the repo" },
    { name: "far above", url: "pkg/../../a.png", readmeDir: "", message: "outside the repo" },
    { name: "a malformed escape", url: "a%zz.png", readmeDir: "", message: "can't decode" },
  ];

  it.each(refusals)("refuses $name", ({ url, readmeDir, message }) => {
    expect(failure(() => repoPath(url, readmeDir))).toContain(message);
  });
});
