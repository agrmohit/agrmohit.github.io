import { describe, expect, it } from "bun:test";
import { prefetchOn, prefetchTarget, SPECULATION_RULES } from "../../assets/js/prefetch-rules.js";

const HOME = "https://agrmohit.com/";

describe("prefetchOn", () => {
  interface Row {
    name: string;
    asked: string | null;
    kept: string | null;
    want: boolean;
  }
  const rows: readonly Row[] = [
    { name: "nothing asked, nothing kept", asked: null, kept: null, want: true },
    { name: "?prefetch=0", asked: "0", kept: null, want: false },
    { name: "?prefetch=1", asked: "1", kept: null, want: true },
    // the tab keeps the last ask
    { name: "kept off from an earlier ?prefetch=0", asked: null, kept: "0", want: false },
    { name: "kept on from an earlier ?prefetch=1", asked: null, kept: "1", want: true },
    { name: "?prefetch=1 over a kept 0", asked: "1", kept: "0", want: true },
    { name: "?prefetch=0 over a kept 1", asked: "0", kept: "1", want: false },
    // only "0" switches it off
    { name: "?prefetch= (empty)", asked: "", kept: null, want: true },
    { name: "?prefetch=false", asked: "false", kept: null, want: true },
    { name: "?prefetch=00", asked: "00", kept: null, want: true },
  ];

  it.each(rows)("$name", ({ asked, kept, want }) => {
    expect(prefetchOn(asked, kept)).toBe(want);
  });
});

describe("prefetchTarget", () => {
  interface Row {
    name: string;
    href: string;
    page: string;
    want: string | null;
  }
  const rows: readonly Row[] = [
    { name: "a project page", href: "/projects/beszelscope/", page: HOME, want: `${HOME}projects/beszelscope/` },
    { name: "the earthrise lab", href: "/projects/earthrise/", page: HOME, want: `${HOME}projects/earthrise/` },
    { name: "a relative href", href: "projects/userscripts/", page: HOME, want: `${HOME}projects/userscripts/` },
    {
      name: "an absolute URL on this site",
      href: `${HOME}projects/omnivore-epub/`,
      page: HOME,
      want: `${HOME}projects/omnivore-epub/`,
    },
    // one fetch serves every fragment of a page
    {
      name: "a fragment is dropped",
      href: "/projects/beszelscope/#install",
      page: HOME,
      want: `${HOME}projects/beszelscope/`,
    },
    {
      name: "a query is kept",
      href: "/projects/earthrise/?fov=20",
      page: HOME,
      want: `${HOME}projects/earthrise/?fov=20`,
    },
    { name: "the home page", href: "/", page: `${HOME}projects/beszelscope/`, want: null },
    { name: "an anchor on this page", href: "#projects", page: HOME, want: null },
    { name: "a file under assets", href: "/assets/pdf/Resume%20-%20Mohit%20Raj.pdf", page: HOME, want: null },
    { name: "a path that only starts like it", href: "/projectsx/", page: HOME, want: null },
    { name: "another site", href: "https://github.com/agrmohit/beszelscope", page: HOME, want: null },
    { name: "another site's /projects/", href: "https://example.com/projects/a/", page: HOME, want: null },
    { name: "a mail link", href: "mailto:hi@agrmohit.com", page: HOME, want: null },
    // a preview on another host still prefetches its own pages
    {
      name: "a local preview",
      href: "/projects/beszelscope/",
      page: "http://localhost:8765/",
      want: "http://localhost:8765/projects/beszelscope/",
    },
  ];

  it.each(rows)("$name", ({ href, page, want }) => {
    expect(prefetchTarget(href, page)).toBe(want);
  });
});

describe("SPECULATION_RULES", () => {
  // the browser drops rules it cannot parse, silently
  it("prefetches every project page on an eager signal", () => {
    expect(SPECULATION_RULES).toBe(
      JSON.stringify({ prefetch: [{ where: { href_matches: "/projects/*" }, eagerness: "eager" }] }),
    );
  });
});
