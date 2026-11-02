import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { BuildError } from "../errors.ts";
import { checkKeyFile, ENDPOINT, type Fetch, KEY, KEY_URL, main, ping, type Sleep, sitemapUrls } from "../indexnow.ts";
import { asyncFailure, failure } from "./failure.ts";

const ROOT = path.resolve(import.meta.dir, "../..");
const A = "https://agrmohit.com/";
const B = "https://agrmohit.com/projects/earthrise/";

/** One scripted answer: a response, or an error `fetch` throws, such as a timeout. */
type Answer = { status: number; body?: string } | Error;

interface Call {
  url: string;
  init: RequestInit;
}

/** A fetch that gives `answers` in turn and records each call, and a sleep that only records its waits. */
function fakes(answers: readonly Answer[]): { fetch: Fetch; sleep: Sleep; calls: Call[]; waits: number[] } {
  const calls: Call[] = [];
  const waits: number[] = [];
  const fetch: Fetch = (url, init) => {
    calls.push({ url, init });
    const answer = answers[calls.length - 1];
    if (answer === undefined) throw new Error(`unscripted request ${String(calls.length)} to ${url}`);
    if (answer instanceof Error) return Promise.reject(answer);
    return Promise.resolve(new Response(answer.body ?? "", { status: answer.status }));
  };
  const sleep: Sleep = (ms) => {
    waits.push(ms);
    return Promise.resolve();
  };
  return { fetch, sleep, calls, waits };
}

const timeout = new DOMException("The operation timed out.", "TimeoutError");
const refused = new TypeError("Unable to connect");

describe("sitemapUrls", () => {
  interface Row {
    name: string;
    xml: string;
    want: string[];
  }

  const rows: readonly Row[] = [
    { name: "one URL", xml: `<url><loc>${A}</loc></url>`, want: [A] },
    { name: "several URLs, in order", xml: `<loc>${B}</loc><loc>${A}</loc>`, want: [B, A] },
    { name: "spaces around a URL go", xml: `<loc>\n  ${A}\n</loc>`, want: [A] },
    { name: "XML entities are unescaped", xml: `<loc>${A}?a=1&amp;b=2</loc>`, want: [`${A}?a=1&b=2`] },
    {
      name: "percent escapes stay",
      xml: `<loc>${A}Resume%20-%20Mohit%20Raj.pdf</loc>`,
      want: [`${A}Resume%20-%20Mohit%20Raj.pdf`],
    },
    {
      name: "comments and other tags are ignored",
      xml: `<!-- x --><url><lastmod>2026</lastmod><loc>${A}</loc></url>`,
      want: [A],
    },
    { name: "a repeated URL is kept", xml: `<loc>${A}</loc><loc>${A}</loc>`, want: [A, A] },
  ];

  it.each(rows)("$name", ({ xml, want }) => {
    expect(sitemapUrls(xml)).toEqual(want);
  });

  it("reads the committed sitemap.xml", async () => {
    const urls = sitemapUrls(await readFile(path.join(ROOT, "sitemap.xml"), "utf8"));
    expect(urls).toContain(A);
  });
});

describe("sitemapUrls refuses", () => {
  interface Row {
    name: string;
    xml: string;
    want: string;
  }

  const rows: readonly Row[] = [
    { name: "an empty file", xml: "", want: "sitemap.xml lists no URLs" },
    { name: "a sitemap without loc", xml: "<urlset></urlset>", want: "sitemap.xml lists no URLs" },
    { name: "plain http", xml: "<loc>http://agrmohit.com/</loc>", want: "http://agrmohit.com/ is not on" },
    {
      name: "a subdomain",
      xml: "<loc>https://stage.agrmohit.com/</loc>",
      want: "https://stage.agrmohit.com/ is not on",
    },
    {
      name: "a look-alike host",
      xml: "<loc>https://agrmohit.com.evil/</loc>",
      want: "https://agrmohit.com.evil/ is not on",
    },
    {
      name: "one bad URL among good ones",
      xml: `<loc>${A}</loc><loc>https://x.org/</loc>`,
      want: "https://x.org/ is not on",
    },
  ];

  it.each(rows)("$name", ({ xml, want }) => {
    expect(failure(() => sitemapUrls(xml))).toContain(want);
  });
});

describe("ping sends", () => {
  interface Row {
    name: string;
    urls: string[];
  }

  const rows: readonly Row[] = [
    { name: "one URL", urls: [A] },
    { name: "several URLs, in order", urls: [B, A] },
    { name: "a URL with percent escapes", urls: [`${A}Resume%20-%20Mohit%20Raj.pdf`] },
  ];

  it.each(rows)("$name", async ({ urls }) => {
    const { fetch, sleep, calls } = fakes([{ status: 200 }]);
    await ping(urls, fetch, sleep);
    const [call] = calls;
    expect({ url: call?.url, method: call?.init.method, body: call?.init.body }).toEqual({
      url: ENDPOINT,
      method: "POST",
      body: JSON.stringify({ host: "agrmohit.com", key: KEY, urlList: urls }),
    });
  });
});

/** What ping or checkKeyFile came to: the status, "ok", or the BuildError's message. */
async function outcome(run: () => Promise<unknown>): Promise<string> {
  try {
    const result = await run();
    return result === undefined ? "ok" : String(result);
  } catch (err) {
    if (err instanceof BuildError) return `error: ${err.message}`;
    throw err;
  }
}

interface RetryRow {
  name: string;
  answers: Answer[];
  /** The result, or "error: " and the start of the message. */
  want: string;
  /** The waits between attempts, in milliseconds. */
  waits: number[];
}

describe("ping", () => {
  const rows: readonly RetryRow[] = [
    { name: "200 accepted", answers: [{ status: 200 }], want: "200", waits: [] },
    { name: "202 accepted, key check pending", answers: [{ status: 202 }], want: "202", waits: [] },
    { name: "429, then 200", answers: [{ status: 429 }, { status: 200 }], want: "200", waits: [10_000] },
    {
      name: "500 and 503, then 202",
      answers: [{ status: 500 }, { status: 503 }, { status: 202 }],
      want: "202",
      waits: [10_000, 30_000],
    },
    { name: "a refused connection, then 200", answers: [refused, { status: 200 }], want: "200", waits: [10_000] },
    { name: "a timeout, then 200", answers: [timeout, { status: 200 }], want: "200", waits: [10_000] },
    {
      name: "429 three times",
      answers: [{ status: 429 }, { status: 429 }, { status: 429, body: "Too Many Requests" }],
      want: "error: IndexNow: HTTP 429: Too Many Requests",
      waits: [10_000, 30_000],
    },
    {
      name: "a timeout three times",
      answers: [timeout, timeout, timeout],
      want: "error: IndexNow: The operation timed out.",
      waits: [10_000, 30_000],
    },
    { name: "400 bad request: no retry", answers: [{ status: 400 }], want: "error: IndexNow: HTTP 400", waits: [] },
    {
      name: "403 key not valid: no retry",
      answers: [{ status: 403, body: "key not found\n" }],
      want: "error: IndexNow: HTTP 403: key not found",
      waits: [],
    },
    { name: "422 wrong host: no retry", answers: [{ status: 422 }], want: "error: IndexNow: HTTP 422", waits: [] },
    { name: "404: no retry", answers: [{ status: 404 }], want: "error: IndexNow: HTTP 404", waits: [] },
  ];

  it.each(rows)("$name: result", async ({ answers, want }) => {
    const f = fakes(answers);
    expect(await outcome(() => ping([A], f.fetch, f.sleep))).toStartWith(want);
  });

  it.each(rows)("$name: waits", async ({ answers, waits }) => {
    const f = fakes(answers);
    await ping([A], f.fetch, f.sleep).catch(() => undefined);
    expect(f.waits).toEqual(waits);
  });
});

describe("checkKeyFile", () => {
  const rows: readonly RetryRow[] = [
    { name: "serves the key", answers: [{ status: 200, body: KEY }], want: "ok", waits: [] },
    { name: "404, then the key", answers: [{ status: 404 }, { status: 200, body: KEY }], want: "ok", waits: [10_000] },
    {
      name: "502 and a timeout, then the key",
      answers: [{ status: 502 }, timeout, { status: 200, body: KEY }],
      want: "ok",
      waits: [10_000, 30_000],
    },
    {
      name: "404 three times",
      answers: [{ status: 404 }, { status: 404 }, { status: 404 }],
      want: `error: key file ${KEY_URL}: HTTP 404`,
      waits: [10_000, 30_000],
    },
    {
      name: "a refused connection three times",
      answers: [refused, refused, refused],
      want: "error: key file: Unable to connect",
      waits: [10_000, 30_000],
    },
    {
      name: "another body: no retry",
      answers: [{ status: 200, body: "<html>" }],
      want: `error: key file ${KEY_URL} does not hold exactly the key`,
      waits: [],
    },
    {
      name: "the key plus a newline",
      answers: [{ status: 200, body: `${KEY}\n` }],
      want: `error: key file ${KEY_URL} does not hold exactly the key`,
      waits: [],
    },
    {
      name: "an empty body",
      answers: [{ status: 200, body: "" }],
      want: `error: key file ${KEY_URL} does not hold exactly the key`,
      waits: [],
    },
    { name: "403: no retry", answers: [{ status: 403 }], want: `error: key file ${KEY_URL}: HTTP 403`, waits: [] },
  ];

  it.each(rows)("$name: result", async ({ answers, want }) => {
    const f = fakes(answers);
    expect(await outcome(() => checkKeyFile(f.fetch, f.sleep))).toStartWith(want);
  });

  it.each(rows)("$name: waits", async ({ answers, waits }) => {
    const f = fakes(answers);
    await checkKeyFile(f.fetch, f.sleep).catch(() => undefined);
    expect(f.waits).toEqual(waits);
  });
});

describe("main", () => {
  interface Row {
    name: string;
    argv: string[];
    /** The URL of each request, in order. */
    want: string[];
  }

  const rows: readonly Row[] = [
    { name: "a dry run sends nothing", argv: [], want: [] },
    { name: "help sends nothing", argv: ["-h"], want: [] },
    { name: "--help sends nothing", argv: ["--help"], want: [] },
    { name: "--send checks the key file, then submits", argv: ["--send"], want: [KEY_URL, ENDPOINT] },
    { name: "help wins over --send", argv: ["--send", "-h"], want: [] },
  ];

  it.each(rows)("$name", async ({ argv, want }) => {
    const f = fakes([{ status: 200, body: KEY }, { status: 200 }]);
    await main(argv, f.fetch, f.sleep);
    expect(f.calls.map((call) => call.url)).toEqual(want);
  });

  it("refuses an unknown option, sending nothing", async () => {
    const f = fakes([]);
    expect(await asyncFailure(() => main(["--bogus"], f.fetch, f.sleep))).toContain("Unknown option '--bogus'");
  });

  it("does not submit when the key file is wrong", async () => {
    const f = fakes([{ status: 200, body: "other" }]);
    await main(["--send"], f.fetch, f.sleep).catch(() => undefined);
    expect(f.calls.map((call) => call.url)).toEqual([KEY_URL]);
  });
});

describe("the key", () => {
  it("has the protocol's form: 8 to 128 of a-z, A-Z, 0-9 and -", () => {
    expect(KEY).toMatch(/^[a-zA-Z0-9-]{8,128}$/);
  });

  it("is served by <key>.txt at the repo root, exactly", async () => {
    expect(await readFile(path.join(ROOT, `${KEY}.txt`), "utf8")).toBe(KEY);
  });

  it("is in the files pages.yml publishes", async () => {
    const workflow = await readFile(path.join(ROOT, ".github/workflows/pages.yml"), "utf8");
    // the copy command spans two lines; only it names the file
    expect(workflow).toContain(` ${KEY}.txt `);
  });
});
