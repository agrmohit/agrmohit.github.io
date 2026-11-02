// A README in GitHub Flavored Markdown to the HTML body of a project page.
// The README is ours, so its raw HTML is kept. The page lives on this site, not GitHub, so the passes
// below drop media hosted elsewhere (the CSP allows only our own), point relative links at GitHub,
// draw mermaid as inline SVG, highlight code into .pl-* classes, and wrap wide blocks in .wide.

import assert from "node:assert/strict";
import path from "node:path";
import { all as allGrammars } from "@wooorm/starry-night";
import type { Element, ElementContent, Root, RootContent } from "hast";
import { toText } from "hast-util-to-text";
import { type RenderResult, render as renderMermaid } from "pele";
import { rehypeGithubAlerts } from "rehype-github-alerts";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import rehypeStarryNight from "rehype-starry-night";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { EXIT, SKIP, visit } from "unist-util-visit";
import { BuildError } from "./errors.ts";
import { rasterOf, toWebp } from "./raster.ts";
import { byCodeUnit } from "./sort.ts";

export interface ReadmeOptions {
  repo: string; // "owner/name"
  ref: string; // the tag or commit relative links point at
  readmeDir: string; // the README's folder in the repo; "" for the root
  drop: readonly string[]; // headings of top-level sections to leave out
  file(repoPath: string): Promise<Uint8Array>; // a file by its path from the repo root
}

export interface RenderedReadme {
  html: string;
  images: string[]; // repo paths of local media, sorted; the page copies each to the same path
  webps: Map<string, Uint8Array>; // WebP copies of PNG and JPEG images, by the repo path the page loads
  title: string | undefined; // the first h1's text
}

/** The README as page HTML, with the media files it loads and its title. */
export async function renderReadme(markdown: string, options: ReadmeOptions): Promise<RenderedReadme> {
  const webps = new Map<string, Uint8Array>();
  const converted = new Set<Element>(); // the <img>s now showing one of `webps`
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(onTree((tree) => dropNamed(tree, options.drop))) // first, so a dropped section's images are not copied
    .use(rehypeSlug) // after dropNamed: a dropped heading would shift the -1 suffixes of the ones after it
    .use(rehypeGithubAlerts, {}) // {} is its defaults; its types insist on an argument
    .use(onTree((tree) => localiseMedia(tree, options.readmeDir)))
    // after localiseMedia: it reads repo paths
    .use(() => async (tree: Root): Promise<undefined> => {
      await shrinkImages(tree, options.file, webps, converted);
    })
    .use(onTree((tree) => linkToGitHub(tree, options)))
    .use(onTree(pruneEmpty)) // after localiseMedia: a badge's link is empty only once its image went
    .use(onTree(dropEmpty)) // after pruneEmpty: a section of badges is empty only once they went
    .use(onTree(drawMermaid)) // before highlighting, which would split the diagram's source into spans
    .use(() => highlighter())
    .use(onTree(wrapWide)) // last: it looks for figure.mermaid and works on the final top level
    .use(rehypeStringify, { allowDangerousHtml: true });

  const tree = await processor.run(processor.parse(markdown));
  const images = [...mediaFiles(tree, converted)].sort(byCodeUnit);
  checkCollisions([...images, ...webps.keys()]);
  return { html: `${processor.stringify(tree).trim()}\n`, images, webps, title: firstH1Text(tree) };
}

let highlight: ReturnType<typeof rehypeStarryNight> | undefined;

/** The code highlighter, made once: loading the 710 grammars takes ~100 ms. */
function highlighter(): ReturnType<typeof rehypeStarryNight> {
  // all of them, as "common" lacks Clojure, TOML and Dockerfile
  highlight ??= rehypeStarryNight({ grammars: allGrammars });
  return highlight;
}

/**
 * A unified plugin that runs `pass` on the HTML tree, so each pass is a plain function of its inputs.
 * It discards what `pass` returns: unified would take any returned value as the new tree.
 */
function onTree(pass: (tree: Root) => unknown) {
  return () =>
    (tree: Root): undefined => {
      pass(tree);
    };
}

// --- tree helpers --------------------------------------------------------------------------------

type Node = RootContent | ElementContent;

function isElement(node: Node | undefined): node is Element;
function isElement<Tag extends string>(node: Node | undefined, tagName: Tag): node is Element & { tagName: Tag };
function isElement(node: Node | undefined, tagName?: string): boolean {
  return node?.type === "element" && (tagName === undefined || node.tagName === tagName);
}

const isBlank = (node: Node | undefined): boolean =>
  node?.type === "comment" || (node?.type === "text" && node.value.trim() === "");

const hasClass = (element: Element, name: string): boolean => element.properties.className?.includes(name) ?? false;

/** 1-6 for a heading, 0 for anything else. */
const headingLevel = (node: Node | undefined): number =>
  isElement(node) && /^h[1-6]$/.test(node.tagName) ? Number(node.tagName[1]) : 0;

/** Removes, at any depth, each element `remove` returns true for; it sees a parent before its children. */
function removeElements(parent: Root | Element, remove: (element: Element) => boolean): void {
  for (let i = parent.children.length - 1; i >= 0; i--) {
    const child = parent.children[i];
    if (!isElement(child)) continue;
    if (remove(child)) parent.children.splice(i, 1);
    else removeElements(child, remove);
  }
}

// --- sections: a heading and what follows it, up to the next heading of the same or a higher level ---

/** Whether `node` is a heading that ends a section opened by a heading of `level`: same level or higher. */
const closesSection = (node: Node | undefined, level: number): boolean =>
  headingLevel(node) > 0 && headingLevel(node) <= level;

function sectionEnd(nodes: readonly RootContent[], at: number): number {
  let end = at + 1;
  while (end < nodes.length && !closesSection(nodes[end], headingLevel(nodes[at]))) end++;
  return end;
}

/** Drops the named top-level sections. A name no heading has fails, so a renamed heading can't slip through. */
function dropNamed(tree: Root, names: readonly string[]): void {
  const nodes = tree.children;
  const title = nodes.find((node) => headingLevel(node) === 1);
  for (const name of names) {
    const at = nodes.findIndex((node) => headingLevel(node) > 0 && toText(node).trim() === name);
    if (at < 0) {
      const headings = nodes
        .filter((node) => headingLevel(node) > 0)
        .map((node) => JSON.stringify(toText(node).trim()));
      throw new BuildError(`no section "${name}" to drop; the headings are ${headings.join(", ")}`);
    }
    if (nodes[at] === title) throw new BuildError(`"${name}" is the page's title, which stays`);
    nodes.splice(at, sectionEnd(nodes, at) - at);
  }
}

/** Drops h2-h6 sections left with nothing in them, such as one that held only a badge. */
function dropEmpty(tree: Root): void {
  const nodes = tree.children;
  // innermost first: once an empty subsection goes, its parent may be empty too
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (headingLevel(nodes[i]) < 2) continue; // the h1 is the page's title
    let next = i + 1;
    while (next < nodes.length && isBlank(nodes[next])) next++;
    if (next === nodes.length || closesSection(nodes[next], headingLevel(nodes[i]))) nodes.splice(i, next - i);
  }
}

// --- media and links -----------------------------------------------------------------------------

const hasScheme = (url: string): boolean => /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//");

/** `url` with its %-escapes decoded; a malformed one, like "%zz", fails the build. */
function decodeUrl(url: string): string {
  try {
    return decodeURI(url);
  } catch {
    throw new BuildError(`${url}: can't decode its %-escapes`);
  }
}

/** A link or src relative to the README, as a path from the repo root; throws if it leaves the repo. */
export function repoPath(url: string, readmeDir: string): string {
  const bare = decodeUrl(url.split(/[?#]/, 1)[0] ?? "");
  const clean = path.posix.normalize(bare.startsWith("/") ? bare.slice(1) : path.posix.join(readmeDir, bare));
  if (clean === ".." || clean.startsWith("../") || path.posix.isAbsolute(clean))
    throw new BuildError(`${url} points outside the repo`);
  return clean === "." ? "" : clean;
}

// the attributes that load a file, by element; <picture>'s <source> carries GitHub's dark-mode variant
const MEDIA_ATTRIBUTES = new Map<string, readonly string[]>([
  ["img", ["src", "srcSet"]],
  ["source", ["src", "srcSet"]],
  ["video", ["src", "poster"]],
  ["audio", ["src"]],
  ["track", ["src"]],
]);

// "a.png 1x, b.png 2x": a URL and an optional descriptor per candidate
const srcsetCandidates = (srcset: string): string[][] =>
  srcset.split(",").map((candidate) => candidate.trim().split(/\s+/));

/**
 * Makes each media file's URL a repo path. Removes an element whose file is hosted elsewhere, an <img> with
 * no src, and a <source> left with no srcset.
 */
function localiseMedia(tree: Root, readmeDir: string): void {
  // the URL to keep, or null if it is hosted elsewhere
  const local = (url: string): string | null => {
    if (url.startsWith("data:")) return url;
    if (url === "" || hasScheme(url)) return null;
    const file = repoPath(url, readmeDir);
    if (file === "" || file.endsWith("/")) throw new BuildError(`${url} names a folder, not a file to show`);
    // the file keeps its own name; the attribute needs it %-escaped, or a space would end a srcset URL
    return encodeURI(file);
  };

  removeElements(tree, (element) => {
    const attributes = MEDIA_ATTRIBUTES.get(element.tagName);
    if (attributes === undefined) return false;
    if (element.tagName === "img" && !element.properties.src) return true;
    for (const attribute of attributes) {
      const value = element.properties[attribute];
      if (typeof value !== "string" || value === "") continue;
      if (attribute !== "srcSet") {
        const file = local(value);
        if (file === null) return true;
        element.properties[attribute] = file;
        continue;
      }
      // candidates hosted elsewhere go
      const candidates = srcsetCandidates(value).flatMap(([url = "", ...descriptor]) => {
        const file = local(url);
        return file === null ? [] : [[file, ...descriptor].join(" ")];
      });
      if (candidates.length > 0) element.properties.srcSet = candidates.join(", ");
      else if (element.tagName === "source")
        return true; // a <source> is nothing without one
      else delete element.properties.srcSet;
    }
    return false;
  });
}

/**
 * Sizes each local <img> from its file, and swaps a PNG or JPEG for a WebP twice its shown width.
 * A size the README set wins; a missing one follows the file's shape, so the page holds the space while the
 * file loads. 2x is sharp on a phone. A file is never enlarged; a width that is not pixels ("50%") keeps its
 * own. An <img> with a srcset keeps its files, as the browser would pick from the srcset anyway.
 */
async function shrinkImages(
  tree: Root,
  file: ReadmeOptions["file"],
  webps: Map<string, Uint8Array>,
  converted: Set<Element>,
): Promise<void> {
  const images: Element[] = [];
  visit(tree, "element", (element) => {
    if (element.tagName === "img") images.push(element);
  });

  // per source file: its bytes, the widest it is wanted at, and the <img>s that show it
  const wanted = new Map<string, { bytes: Uint8Array; width: number; images: Element[] }>();
  for (const image of images) {
    const { src, srcSet, width, height } = image.properties;
    if (typeof src !== "string" || src.startsWith("data:")) continue;
    const name = decodeURI(src); // localiseMedia %-escaped it
    const bytes = await file(name);
    const raster = await rasterOf(bytes, name);
    if (raster === undefined) continue;

    // a width or height that is not a number of pixels ("50%") stays as written, with no partner
    if (width === undefined && height === undefined) {
      image.properties.width = raster.width;
      image.properties.height = raster.height;
    } else if (height === undefined && typeof width === "number")
      image.properties.height = Math.round((width * raster.height) / raster.width);
    else if (width === undefined && typeof height === "number")
      image.properties.width = Math.round((height * raster.width) / raster.height);

    if (srcSet !== undefined || (raster.format !== "png" && raster.format !== "jpeg")) continue;
    const shown = image.properties.width;
    const target = typeof shown === "number" ? Math.min(2 * shown, raster.width) : raster.width;
    const entry = wanted.get(name);
    if (entry === undefined) wanted.set(name, { bytes, width: target, images: [image] });
    else {
      entry.width = Math.max(entry.width, target);
      entry.images.push(image);
    }
  }

  const sources = new Map<string, string>(); // WebP path to the file it came from
  for (const [name, { bytes, width, images: showing }] of wanted) {
    const webp = `${name.replace(/\.[^./]+$/, "")}.webp`;
    const other = sources.get(webp);
    if (other !== undefined) throw new BuildError(`images ${other} and ${name} would both be ${webp}`);
    sources.set(webp, name);
    webps.set(webp, await toWebp(bytes, width, name));
    for (const image of showing) {
      image.properties.src = encodeURI(webp);
      converted.add(image);
    }
  }
}

/** The repo paths of the local files the page loads as they are: all but the WebPs of `converted`. */
function mediaFiles(tree: Root, converted: ReadonlySet<Element>): Set<string> {
  const files = new Set<string>();
  visit(tree, "element", (element) => {
    const attributes = MEDIA_ATTRIBUTES.get(element.tagName);
    if (attributes === undefined || converted.has(element)) return;
    for (const attribute of attributes) {
      const value = element.properties[attribute];
      if (typeof value !== "string" || value === "") continue;
      const urls = attribute === "srcSet" ? srcsetCandidates(value).map(([url = ""]) => url) : [value];
      for (const url of urls) if (!url.startsWith("data:")) files.add(decodeURI(url)); // %-escaped by localiseMedia
    }
  });
  return files;
}

/** Points each relative link at the file on GitHub at the page's ref. */
function linkToGitHub(tree: Root, { repo, ref, readmeDir }: ReadmeOptions): void {
  visit(tree, "element", (element) => {
    if (element.tagName !== "a") return;
    const href = element.properties.href;
    if (typeof href !== "string" || href === "" || href.startsWith("#") || hasScheme(href)) return;
    const hash = href.includes("#") ? href.slice(href.indexOf("#")) : "";
    element.properties.href = `https://github.com/${repo}/blob/${ref}/${encodeURI(repoPath(href, readmeDir))}${hash}`;
  });
}

// a link, paragraph or picture with no element and no visible text in it
function isEmptyBox(node: Node | undefined): boolean {
  if (!isElement(node) || !["a", "p", "picture"].includes(node.tagName)) return false;
  // an empty link that is a target (<a name="setup"></a>) stays, or links to it break
  if (node.tagName === "a" && (node.properties.id || node.properties.name)) return false;
  return !node.children.some(
    (child) => child.type === "element" || (child.type === "text" && child.value.trim() !== ""),
  );
}

/** Removes empty links, paragraphs and pictures, innermost first; true if any of `parent`'s own children went. */
function pruneEmpty(parent: Root | Element): boolean {
  let emptiedBelow = false;
  // pruneEmpty first: `emptiedBelow || pruneEmpty(child)` would stop recursing after the first true
  for (const child of parent.children) if (isElement(child)) emptiedBelow = pruneEmpty(child) || emptiedBelow;
  const before = parent.children.length;
  for (let i = before - 1; i >= 0; i--) if (isEmptyBox(parent.children[i])) parent.children.splice(i, 1);
  const removedHere = parent.children.length < before;
  // what a dropped badge stood beside: the space before "text" in "<badge> text"
  if (removedHere || emptiedBelow) {
    const first = parent.children[0];
    const last = parent.children.at(-1);
    if (first?.type === "text") first.value = first.value.trimStart();
    if (last?.type === "text") last.value = last.value.trimEnd();
  }
  if (parent.type !== "element" || parent.tagName !== "pre") {
    for (let i = parent.children.length - 1; i >= 0; i--) {
      const child = parent.children[i];
      if (child?.type === "text" && child.value === "") parent.children.splice(i, 1);
    }
  }
  return removedHere;
}

// --- diagrams and layout -------------------------------------------------------------------------

/** The text as written; `toText` would fold the line breaks mermaid needs. */
const sourceText = (node: Node): string =>
  node.type === "text" ? node.value : isElement(node) ? node.children.map(sourceText).join("") : "";

/** Replaces each mermaid code block with <figure class="mermaid"> holding pele's SVG. */
function drawMermaid(tree: Root): void {
  let block = 0;
  visit(tree, "element", (pre, index, parent) => {
    const code = pre.children[0];
    if (pre.tagName !== "pre" || !isElement(code, "code") || !hasClass(code, "language-mermaid")) return;
    assert(parent !== undefined && index !== undefined, "a <pre> always has a parent");
    block++;
    const rendered = renderDiagram(sourceText(code), block);
    // pele lets a diagram shrink to fit; under 60% its labels are too small, so a wider one scrolls instead
    const svg = withMinWidth(rendered.svg, Math.round(rendered.width * 0.6));
    parent.children[index] = {
      type: "element",
      tagName: "figure",
      properties: { className: ["mermaid"] },
      children: [{ type: "raw", value: svg }],
    };
    return SKIP;
  });
}

function renderDiagram(source: string, block: number): RenderResult {
  try {
    return renderMermaid(source, { images: false });
  } catch (err) {
    throw new BuildError(`mermaid block ${block}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** `svg` with min-width:<px>px; first in its root element's style. */
function withMinWidth(svg: string, px: number): string {
  const root = svg.match(/^<svg\b[^>]*>/)?.[0];
  if (root === undefined) throw new BuildError("pele's output doesn't start with <svg>");
  const style = `min-width:${px}px;`;
  const sized = root.includes(' style="')
    ? root.replace(' style="', ` style="${style}`)
    : root.replace(/>$/, ` style="${style}">`);
  return sized + svg.slice(root.length);
}

// an image, or a link around nothing but images
const isPicture = (node: Node): boolean =>
  isElement(node, "img") ||
  (isElement(node, "a") &&
    node.children.some((c) => isElement(c, "img")) &&
    node.children.every((c) => isBlank(c) || isElement(c, "img")));

/** Tables, code, diagrams and image-only paragraphs, which the CSS lets grow past the text column. */
const isWide = (node: RootContent): node is Element =>
  isElement(node, "table") ||
  isElement(node, "pre") ||
  (isElement(node, "figure") && hasClass(node, "mermaid")) ||
  (isElement(node, "p") && node.children.some(isPicture) && node.children.every((c) => isBlank(c) || isPicture(c)));

/** Wraps each wide top-level block in <div class="wide">. */
function wrapWide(tree: Root): void {
  tree.children = tree.children.map((node): RootContent => {
    if (isWide(node)) return { type: "element", tagName: "div", properties: { className: ["wide"] }, children: [node] };
    // one line break between top-level blocks: rehype-raw leaves a table's row breaks there
    if (node.type === "text" && node.value.trim() === "") return { ...node, value: "\n" };
    return node;
  });
}

// --- what the page needs around the HTML -----------------------------------------------------------

function firstH1Text(tree: Root): string | undefined {
  let title: string | undefined;
  visit(tree, "element", (element) => {
    if (element.tagName !== "h1") return;
    title = toText(element).trim();
    return EXIT;
  });
  return title;
}

// the page's own files, which an image of the same name would overwrite
const RESERVED = ["index.html", "card.png"];

/** Throws if two images would land on one file: a page file, or names differing only in case (one file on macOS). */
function checkCollisions(images: readonly string[]): void {
  const seen = new Map<string, string>();
  for (const file of images) {
    if (RESERVED.includes(file)) throw new BuildError(`image ${file} would overwrite the page's own ${file}`);
    const other = seen.get(file.toLowerCase());
    if (other === file) throw new BuildError(`two images would both be ${file}`);
    if (other !== undefined) throw new BuildError(`images ${other} and ${file} differ only in case`);
    seen.set(file.toLowerCase(), file);
  }
}
