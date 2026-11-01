// A project page: tools/page.html around a rendered README.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fillSlots } from "./html.ts";

const SITE = "https://agrmohit.com";
const PAGE = readFileSync(new URL("./page.html", import.meta.url), "utf8");

// the CSP allows this inline script by its hash, computed here so the two can't drift apart
const OPT_OUT_SCRIPT = `if (window.location.hostname !== "agrmohit.com") localStorage.setItem("umami.disabled", "1");`;
const OPT_OUT_HASH = createHash("sha256").update(OPT_OUT_SCRIPT).digest("base64");

// the link-preview image, for a page with a card; its first line break joins it to the line before
const CARD_META = `
    <meta property="og:image" content="{{url}}card.png" />
    <meta property="og:image:alt" content="{{cardAlt}}" />
    <meta property="og:image:width" content="1560" />
    <meta property="og:image:height" content="819" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="{{url}}card.png" />`;

export interface ProjectPage {
  slug: string; // the page sits at /projects/<slug>/
  title: string; // plain text, for <title> and previews
  description: string; // plain text, for previews
  repo: string; // "owner/name"
  ref: string; // the tag or commit the page was built from
  body: string; // the README as HTML, from renderReadme
  /** The card at /projects/<slug>/card.png and the subtitle it shows ("" for none), or undefined for no card. */
  card: { subtitle: string } | undefined;
}

/** The card's alt text: the words on it, its name and its subtitle, on one line. */
function cardAlt(title: string, subtitle: string): string {
  return subtitle === "" ? title : `${title}: ${subtitle.replace(/\s+/g, " ")}`;
}

/** The page's HTML. */
export function projectPage(page: ProjectPage): string {
  const url = `${SITE}/projects/${page.slug}/`;
  const shared = { url, title: page.title, description: page.description };
  return fillSlots(PAGE, {
    ...shared,
    slug: page.slug,
    repo: page.repo,
    ref: page.ref,
    refPath: encodeURI(page.ref), // a tag or SHA is URL-safe already; a local README's label is not
    refLabel: /^[0-9a-f]{40}$/.test(page.ref) ? page.ref.slice(0, 12) : page.ref,
    optOutHash: OPT_OUT_HASH,
    optOutScript: OPT_OUT_SCRIPT,
    cardMeta:
      page.card === undefined ? "" : fillSlots(CARD_META, { url, cardAlt: cardAlt(page.title, page.card.subtitle) }),
    body: page.body,
  });
}
