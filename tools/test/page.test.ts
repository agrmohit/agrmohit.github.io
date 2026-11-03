import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { type ProjectPage, projectPage } from "../page.ts";

const PAGE: ProjectPage = {
  slug: "app",
  title: "app",
  description: "an app",
  repo: "o/app",
  ref: "v1.0.0",
  body: "<p>body</p>\n",
  card: { subtitle: "a menu bar app" },
};

describe("projectPage", () => {
  interface Row {
    name: string;
    page: Partial<ProjectPage>;
    /** Strings the HTML must hold. */
    wanted: string[];
    /** Strings it must not. */
    unwanted: string[];
  }

  const rows: readonly Row[] = [
    {
      name: "the card's alt text is the words on it",
      page: { title: "app", card: { subtitle: "a menu\nbar app" } },
      wanted: ['og:image:alt" content="app: a menu bar app"'],
      unwanted: ['og:image:alt" content="app: an app"'],
    },
    {
      name: "a card without a subtitle has its name as alt text",
      page: { title: "app", card: { subtitle: "" } },
      wanted: ['og:image:alt" content="app"'],
      unwanted: [],
    },
    {
      name: "a page with a card announces it",
      page: {},
      wanted: [
        'content="https://agrmohit.com/projects/app/card.png"',
        'name="twitter:card" content="summary_large_image"',
      ],
      unwanted: [],
    },
    {
      name: "a page without a card does not",
      page: { card: undefined },
      wanted: [],
      unwanted: ["card.png", "twitter:card"],
    },
    {
      name: "a tag is shown and linked as is",
      page: { ref: "v2.1.2" },
      wanted: ["at v2.1.2;", "/tree/v2.1.2?ref=agrmohit.com"],
      unwanted: [],
    },
    {
      name: "a commit is shown shortened, linked in full",
      page: { ref: "1c60b701edcd7a30fbc51619a3b3f6315a9f84a6" },
      wanted: [">1c60b701edcd<", "/tree/1c60b701edcd7a30fbc51619a3b3f6315a9f84a6?"],
      unwanted: [">1c60b701edcd7a30fbc51619a3b3f6315a9f84a6<"],
    },
    {
      name: "text slots are escaped",
      page: { title: 'a "b" <c>', description: "x & y" },
      wanted: ["<title>a &quot;b&quot; &lt;c&gt; · Mohit Raj</title>", 'content="x &amp; y"'],
      unwanted: ["<c>"],
    },
    {
      name: "the body goes in as is",
      page: { body: "<p><b>raw</b></p>\n" },
      wanted: ["<p><b>raw</b></p>"],
      unwanted: [],
    },
  ];

  it.each(rows)("$name", ({ page, wanted, unwanted }) => {
    const html = projectPage({ ...PAGE, ...page });
    expect({ held: wanted.filter((s) => html.includes(s)), stray: unwanted.filter((s) => html.includes(s)) }).toEqual({
      held: wanted,
      stray: [],
    });
  });

  // the CSP allows the inline script by its hash: an edit to one without the other blocks the script
  // index.html's header gives its nav the space above; the same markup gets the same space
  it("puts the nav in a <header>, as the home page does", async () => {
    const home = await Bun.file(new URL("../../index.html", import.meta.url)).text();
    expect(home).toMatch(/<header>\s*<nav>/);
    expect(projectPage(PAGE)).toMatch(
      /<body class="project-page">\s*<canvas id="earthrise"[^>]*><\/canvas>\s*<header>\s*<nav>[\s\S]*?<\/nav>\s*<\/header>/,
    );
  });

  // every module a page's entry script imports, directly or not, so they load beside it, not after it
  const preloadRows: readonly { name: string; page: "home" | "project"; entry: string }[] = [
    { name: "a project page, copy.js", page: "project", entry: "/assets/js/copy.js" },
    { name: "a project page, the sky", page: "project", entry: "/assets/earthrise/project.js" },
    { name: "the home page, the sky", page: "home", entry: "/assets/earthrise/home.js" },
    { name: "the home page, prefetch.js", page: "home", entry: "/assets/js/prefetch.js" },
  ];

  it.each(preloadRows)("preloads every module $name imports", async ({ page, entry }) => {
    const html =
      page === "home" ? await Bun.file(new URL("../../index.html", import.meta.url)).text() : projectPage(PAGE);
    const imports = await importsOf(entry);
    expect(imports.length).toBeGreaterThan(0); // else the check below passes on nothing
    for (const module of imports) expect(html).toContain(`<link rel="modulepreload" href="${module}" />`);
  });

  // a prefetch brings only the HTML, and a project page's text waits for its sky
  it("lets the home page cache the project pages' whole sky", async () => {
    const home = await Bun.file(new URL("../../index.html", import.meta.url)).text();
    const sky = ["/assets/earthrise/project.js", ...(await importsOf("/assets/earthrise/project.js"))];
    for (const module of sky) expect(home).toContain(`<link rel="modulepreload" href="${module}" />`);
  });

  // Chromium ignores the keyword once script-src holds any hash, so prefetch would silently stop
  it("lets the home page insert speculation rules", async () => {
    const home = await Bun.file(new URL("../../index.html", import.meta.url)).text();
    const scriptSrc = home.match(/script-src [^;]*/)?.[0] ?? "";
    expect(scriptSrc).toContain("'inline-speculation-rules'");
    expect(scriptSrc).not.toContain("'sha256-");
  });

  it("allows its inline script by the script's own hash", () => {
    const html = projectPage(PAGE);
    // the page's one inline script; the others load by src
    const start = html.indexOf("<script>") + "<script>".length;
    const script = html.slice(start, html.indexOf("</script>", start));
    const hash = createHash("sha256").update(script).digest("base64");
    expect(html).toContain(`script-src 'self' 'sha256-${hash}'`);
  });
});

/** The site paths of every module `entry` imports, directly or not, from its relative imports. */
async function importsOf(entry: string, seen = new Set<string>()): Promise<string[]> {
  const source = await Bun.file(new URL(`../..${entry}`, import.meta.url)).text();
  // [\s\S]*? as well: the formatter wraps a long import over several lines
  for (const match of source.matchAll(/^import [\s\S]*? from "(\.\/[^"]+)";$/gm)) {
    const module = new URL(match[1] ?? "", `https://agrmohit.com${entry}`).pathname;
    if (seen.has(module)) continue;
    seen.add(module);
    await importsOf(module, seen);
  }
  return [...seen];
}
