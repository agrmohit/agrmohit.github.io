// The share images (link-preview cards, the contact card, banners) and the home-screen icons.
//
// satori lays the card text out and draws it as paths; resvg (png.ts) turns the SVG into pixels. Both are
// pure code with fonts passed in as files, so an image comes out byte-identical on every machine, which a
// browser screenshot does not.

import satori, { type Font, type SatoriNode } from "satori";
import { BuildError } from "./errors.ts";
import { svgToPalettePng, svgToPng } from "./png.ts";
import { FRAMES, type Frame, type Layout, skyDots } from "./sky.ts";

const readBytes = (path: string): Promise<ArrayBuffer> => Bun.file(new URL(path, import.meta.url)).arrayBuffer();
const readText = (path: string): Promise<string> => Bun.file(new URL(path, import.meta.url)).text();

let fonts: Promise<Font[]> | undefined;

/** The two card fonts, read once on first use. */
function loadFonts(): Promise<Font[]> {
  fonts ??= Promise.all([
    // made by fonts/patch-jost.py (never run by the build): satori can't turn on ss01, Jost's single-storey a
    readBytes("fonts/Jost-500-Medium-a.ttf"),
    readBytes("../assets/webfonts/JetBrainsMono-Regular.ttf"),
  ]).then(([jost, mono]) => [
    { name: "Jost", data: jost, weight: 500, style: "normal" },
    { name: "JetBrains Mono", data: mono, weight: 400, style: "normal" },
  ]);
  return fonts;
}

const BG = "#1a1a1a";
const TEXT = "#e0e4ef";
const ACCENT = "#99d1db";
const DIM = "#8b8f99";
const HANDLE = "#e49a87";
const HALO = `0 0 2px ${BG}, 0 0 4px ${BG}, 0 0 8px ${BG}`;

// --- satori elements -------------------------------------------------------------

/** CSS in satori's camelCase: `{ fontSize: 34, color: "#fff" }`. */
type Style = Record<string, string | number>;
type Child = Element | string;
/** A box whose laid-out size layoutPost reads back. */
type Measured = "block" | "name" | "url";
/** What satori takes in place of a React element; `key` marks a measured box. */
interface Element {
  type: "div" | "span";
  key?: Measured;
  props: { style: Style; children: Child | Child[] };
}
type Size = { width: number; height: number };

/** A flex box: satori lays out only flex. */
const el = (type: Element["type"], style: Style, children: Child | Child[] = []): Element => ({
  type,
  props: { style: { display: "flex", ...style }, children },
});
const measured = (key: Measured, element: Element): Element => ({ ...element, key });

// --- link previews ---------------------------------------------------------------

// The sky left of the Earth holds the text: a 660px column from x = 72, centred above the horizon
const POST = { left: 72, width: 660, sky: 470, minTop: 56 }; // the horizon is at 0.74 of 630

export interface PostCardText {
  title: string;
  /** May hold "\n" line breaks; "" for none. */
  subtitle: string;
  /** Without the scheme, as shown: "agrmohit.com/projects/earthrise". */
  url: string;
}

/** Font sizes in px, and the block's top edge in px from the top of the card. */
interface PostSizes {
  nameSize: number;
  urlSize: number;
  urlWraps: boolean;
  top: number;
}

function postText({ title, subtitle, url }: PostCardText, { nameSize, urlSize, urlWraps, top }: PostSizes): Element {
  const name = el(
    "div",
    { fontFamily: "Jost", fontSize: nameSize, lineHeight: 1.1, letterSpacing: 1, color: "#fff", textWrap: "balance" },
    title,
  );
  const parts = [measured("name", name)];
  if (subtitle !== "")
    parts.push(
      el(
        "div",
        { marginTop: 22, fontSize: 34, lineHeight: 1.3, color: ACCENT, whiteSpace: "pre-line", textWrap: "balance" },
        subtitle,
      ),
    );
  // too long even when small: let it wrap after a / or - (a zero-width space)
  const shown = urlWraps ? url.replace(/([/-])/g, "$1​") : url;
  const urlStyle = {
    marginTop: 30,
    fontSize: urlSize,
    lineHeight: 1.3,
    color: DIM,
    whiteSpace: urlWraps ? "normal" : "nowrap",
    alignSelf: "flex-start",
  };
  parts.push(measured("url", el("div", urlStyle, shown)));
  const blockStyle = {
    position: "absolute",
    left: POST.left,
    top,
    width: POST.width,
    flexDirection: "column",
    fontFamily: "JetBrains Mono",
    color: TEXT,
    textShadow: HALO,
  };
  return measured("block", el("div", blockStyle, parts));
}

/** The sizes satori lays the measured boxes out at, read through its onNodeDetected hook. */
async function measure(tree: Element, frame: Frame): Promise<Record<Measured, Size>> {
  const sizes = new Map<SatoriNode["key"], Size>();
  await satori(tree, {
    width: frame.width,
    height: frame.height,
    fonts: await loadFonts(),
    onNodeDetected: (node) => {
      sizes.set(node.key, { width: node.width, height: node.height });
    },
  });
  const block = sizes.get("block");
  const name = sizes.get("name");
  const url = sizes.get("url");
  if (block === undefined || name === undefined || url === undefined)
    throw new BuildError("cards: a measured box is missing from the layout");
  return { block, name, url };
}

/** Fits a preview's text: the URL shrinks (then wraps) to fit the column; the title shrinks until it fits above the horizon. */
async function layoutPost(text: PostCardText): Promise<Element> {
  const size = (sizes: Omit<PostSizes, "top">) => measure(postText(text, { ...sizes, top: 0 }), FRAMES.card);
  let urlSize = 26;
  while (urlSize > 21 && (await size({ nameSize: 104, urlSize, urlWraps: false })).url.width > POST.width) urlSize--;
  const urlWraps = (await size({ nameSize: 104, urlSize, urlWraps: false })).url.width > POST.width;

  let nameSize = 104;
  for (;;) {
    const { block, name } = await size({ nameSize, urlSize, urlWraps });
    const lines = Math.round(name.height / (nameSize * 1.1));
    if ((lines <= 3 && block.height <= POST.sky - POST.minTop) || nameSize === 48) {
      const top = Math.max(POST.minTop, Math.round((POST.sky - block.height) / 2));
      return postText(text, { nameSize, urlSize, urlWraps, top });
    }
    nameSize -= 4;
  }
}

// --- the contact card and banners ------------------------------------------------

/** Positions and sizes in px; they keep clear of each platform's crop and avatar (tools/share-images/platforms.html). */
interface ContactLayout {
  left: number;
  top: number;
  size: number;
  lineHeight: number;
  name: number;
  stroke: number;
  role: number;
  roleGap: number;
  promptGap: number;
  contactGap: number;
}

const CONTACT: Record<Layout, ContactLayout> = {
  card: {
    left: 72,
    top: 73,
    size: 30,
    lineHeight: 1.3,
    name: 116,
    stroke: 2,
    role: 50,
    roleGap: 22,
    promptGap: 44,
    contactGap: 10,
  },
  banner: {
    left: 470,
    top: 85,
    size: 28,
    lineHeight: 1.2,
    name: 96,
    stroke: 1.5,
    role: 40,
    roleGap: 18,
    promptGap: 28,
    contactGap: 6,
  },
  linkedin: {
    left: 580,
    top: 34,
    size: 24,
    lineHeight: 1.2,
    name: 84,
    stroke: 1.5,
    role: 36,
    roleGap: 16,
    promptGap: 26,
    contactGap: 6,
  },
};

function contactText(layout: Layout): Element {
  const c = CONTACT[layout];
  const blockStyle = {
    position: "absolute",
    left: c.left,
    top: c.top,
    flexDirection: "column",
    fontFamily: "JetBrains Mono",
    fontSize: c.size,
    lineHeight: c.lineHeight,
    color: TEXT,
    textShadow: HALO,
  };
  const nameStyle = {
    fontFamily: "Jost",
    fontSize: c.name,
    lineHeight: 1.37, // the room Avenir Next's taller j gave the name on the first cards
    letterSpacing: 1,
    color: "#fff",
    WebkitTextStroke: `${c.stroke}px #fff`,
  };
  return el("div", blockStyle, [
    el("div", nameStyle, "Mohit Raj"),
    el("div", { marginTop: c.roleGap, fontSize: c.role, color: ACCENT }, "backend developer"),
    el("div", { marginTop: c.promptGap, color: DIM, whiteSpace: "pre" }, [
      "$ ",
      el("span", { color: ACCENT }, "contact"),
    ]),
    el("div", { marginTop: c.contactGap, whiteSpace: "pre" }, [
      el("span", { color: HANDLE }, "@agrmohit"),
      el("span", { color: DIM }, " · "),
      "hi@agrmohit.com",
    ]),
  ]);
}

// --- drawing ---------------------------------------------------------------------

/** `text` over the sky of `layout`, as a palette PNG `scale` times the frame's size. */
async function draw(layout: Layout, text: Element, scale: number): Promise<Uint8Array> {
  const frame = FRAMES[layout];
  const { width, height } = frame;
  const words = await satori(el("div", { width, height }, [text]), { width, height, fonts: await loadFonts() });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="${BG}"/>
${await skyDots(frame)}
${words}
</svg>
`;
  return svgToPalettePng(svg, Math.round(width * scale));
}

/** A link preview, 1560 x 819 (1200 x 630 at 1.3x, the size og:image tags declare). */
export async function postCard(text: PostCardText): Promise<Uint8Array> {
  return draw("card", await layoutPost(text), 1.3);
}

/** The contact card (1560 x 819) or a banner: "banner" 1500 x 500 for Bluesky, Mastodon and X, "linkedin" 1584 x 396. */
export function contactCard(layout: Layout): Promise<Uint8Array> {
  return draw(layout, contactText(layout), layout === "card" ? 1.3 : 1);
}

// --- icons -----------------------------------------------------------------------

// the maskable icon's safe zone is the central circle, 80% of the width: this keeps the prompt and the Earth inside it
const SAFE = 'transform="translate(16 15) scale(0.8) translate(-16 -15)"';

/** `svg` with its one `old` replaced; fails if favicon.svg no longer has exactly one. */
function replaceOnce(svg: string, old: string, replacement: string): string {
  if (svg.split(old).length !== 2)
    throw new BuildError(`icons: favicon.svg changed: expected one ${JSON.stringify(old)}`);
  return svg.replace(old, replacement);
}

/** Where `mark` starts in `svg`; fails if favicon.svg no longer has it. */
function offsetOf(svg: string, mark: string): number {
  const at = svg.indexOf(mark);
  if (at < 0) throw new BuildError(`icons: favicon.svg changed: no ${JSON.stringify(mark)}`);
  return at;
}

/** favicon.svg without its rounded tile, for platforms that round the corners themselves. */
const fullBleed = (svg: string): string => replaceOnce(svg, '<g clip-path="url(#tile)">', "<g>");

/** The full-bleed icon with the prompt, the Earth and the stars shrunk into the safe zone; sky and Mars stay full bleed. */
function maskable(favicon: string): string {
  const svg = fullBleed(favicon);
  const prompt = offsetOf(svg, "    <!-- the prompt");
  const mars = offsetOf(svg, "    <!-- Mars");
  const stars = offsetOf(svg, "    <!-- stars");
  const end = offsetOf(svg, "  </g>\n</svg>");
  const inside = svg.slice(prompt, mars) + svg.slice(stars, end);
  return `${svg.slice(0, prompt)}${svg.slice(mars, stars)}    <g ${SAFE}>\n${inside}    </g>\n${svg.slice(end)}`;
}

/** Every icon, as {repo path: PNG bytes}. */
export async function icons(): Promise<Record<string, Uint8Array>> {
  const favicon = await readText("../assets/img/favicon.svg");
  return {
    // iOS rounds the corners itself and fills transparency black
    "assets/img/apple-touch-icon.png": await svgToPng(fullBleed(favicon), 180),
    "assets/img/icon-192.png": await svgToPng(favicon, 192),
    "assets/img/icon-512.png": await svgToPng(favicon, 512),
    "assets/img/icon-maskable-512.png": await svgToPng(maskable(favicon), 512),
    "assets/img/icon-monochrome-512.png": await svgToPng(await readText("icons/monochrome.svg"), 512),
    "assets/img/shortcut-earthrise-96.png": await svgToPng(await readText("icons/earthrise.svg"), 96),
  };
}
