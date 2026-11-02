#!/usr/bin/env bun
// Tells IndexNow engines (Bing, Naver and others; not Google) that every URL in sitemap.xml may have changed.
// pages.yml runs it with --send after each deploy. Without --send it prints the request and sends nothing.
// Protocol: https://www.indexnow.org/documentation

import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { BuildError } from "./errors.ts";

const ROOT = path.resolve(import.meta.dir, "..");
const HOST = "agrmohit.com";
/** Engines fetch `/<KEY>.txt`, served from the repo root, to check that we own the host. */
export const KEY = "01a19dc3-cb5f-77a9-81fd-1ad5b8b27aab";
export const KEY_URL = `https://${HOST}/${KEY}.txt`;
/** The shared endpoint; it passes each submission on to every engine that takes part. */
export const ENDPOINT = "https://api.indexnow.org/indexnow";
/** Milliseconds to wait before the second and the third attempt. */
const RETRY_DELAYS_MS: readonly number[] = [10_000, 30_000];
const TIMEOUT_MS = 30_000;

const USAGE = `Tell IndexNow engines that every URL in sitemap.xml may have changed.

Usage:
  bun tools/indexnow.ts             print the request; sends nothing
  bun tools/indexnow.ts --send      check that ${KEY_URL} serves the key, then submit
  bun tools/indexnow.ts -h          show this help

Exit 0 on success, 2 on any error.`;

/** `fetch`, as the tests replace it. */
export type Fetch = (url: string, init: RequestInit) => Promise<Response>;
/** Waits `ms` milliseconds. The tests record the waits instead. */
export type Sleep = (ms: number) => Promise<void>;

/** The URLs in a sitemap's `<loc>` elements, in order. Each must be on https://agrmohit.com/. */
export function sitemapUrls(xml: string): string[] {
  const urls = [...xml.matchAll(/<loc>\s*([^<]*?)\s*<\/loc>/g)].map((match) => unescapeXml(match[1] ?? ""));
  if (urls.length === 0) throw new BuildError("sitemap.xml lists no URLs");
  // IndexNow answers 422 to a whole submission that names another host
  const foreign = urls.find((url) => !url.startsWith(`https://${HOST}/`));
  if (foreign !== undefined) throw new BuildError(`sitemap.xml: ${foreign} is not on https://${HOST}/`);
  return urls;
}

const XML_ENTITIES: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

const unescapeXml = (text: string): string =>
  text.replace(/&(amp|lt|gt|quot|apos);/g, (entity, name: string) => XML_ENTITIES[name] ?? entity);

/** The JSON body of a submission. The key file sits at the root, so no keyLocation is needed. */
const submission = (urls: readonly string[]): { host: string; key: string; urlList: readonly string[] } => ({
  host: HOST,
  key: KEY,
  urlList: urls,
});

/**
 * Calls `attempt`, retrying after each of RETRY_DELAYS_MS while it throws or `retryable` accepts its status.
 * A deploy has just finished when this runs, so GitHub Pages, Cloudflare or IndexNow may briefly fail.
 */
async function withRetry(
  label: string,
  attempt: () => Promise<Response>,
  retryable: (status: number) => boolean,
  sleep: Sleep,
): Promise<Response> {
  for (const delay of RETRY_DELAYS_MS) {
    try {
      const response = await attempt();
      if (!retryable(response.status)) return response;
      console.log(`${label}: HTTP ${String(response.status)}; retrying in ${String(delay / 1000)} s`);
    } catch (err) {
      console.log(`${label}: ${messageOf(err)}; retrying in ${String(delay / 1000)} s`);
    }
    await sleep(delay);
  }
  // the last attempt: its response is returned whatever the status, and an error ends the run
  try {
    return await attempt();
  } catch (err) {
    throw new BuildError(`${label}: ${messageOf(err)}`);
  }
}

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const isServerTrouble = (status: number): boolean => status === 429 || status >= 500;

/** Fails unless KEY_URL serves exactly KEY. A 404 is retried too: the file may not be live yet. */
export async function checkKeyFile(fetch: Fetch, sleep: Sleep): Promise<void> {
  const response = await withRetry(
    "key file",
    () => fetch(KEY_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) }),
    (status) => status === 404 || isServerTrouble(status),
    sleep,
  );
  if (!response.ok) throw new BuildError(`key file ${KEY_URL}: HTTP ${String(response.status)}`);
  if ((await response.text()) !== KEY) throw new BuildError(`key file ${KEY_URL} does not hold exactly the key`);
}

/** Submits `urls` and returns IndexNow's status: 200 accepted, 202 accepted with the key check pending. */
export async function ping(urls: readonly string[], fetch: Fetch, sleep: Sleep): Promise<200 | 202> {
  const response = await withRetry(
    "IndexNow",
    () =>
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(submission(urls)),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }),
    isServerTrouble,
    sleep,
  );
  if (response.status === 200 || response.status === 202) return response.status;
  const detail = (await response.text()).trim();
  throw new BuildError(`IndexNow: HTTP ${String(response.status)}${detail === "" ? "" : `: ${detail}`}`);
}

/** Runs the command line; tests pass a fake `fetch` and `sleep`. */
export async function main(argv: readonly string[], fetch: Fetch, sleep: Sleep): Promise<void> {
  let values: { send?: boolean; help?: boolean };
  try {
    values = parseArgs({
      args: [...argv],
      options: { send: { type: "boolean" }, help: { type: "boolean", short: "h" } },
      strict: true,
    }).values;
  } catch (err) {
    throw new BuildError(`${messageOf(err)}\n\n${USAGE}`);
  }
  if (values.help === true) {
    console.log(USAGE);
    return;
  }
  const urls = sitemapUrls(await readFile(path.join(ROOT, "sitemap.xml"), "utf8"));
  if (values.send !== true) {
    console.log(`POST ${ENDPOINT}\n${JSON.stringify(submission(urls), null, 2)}\n\ndry run: --send submits it`);
    return;
  }
  await checkKeyFile(fetch, sleep);
  const status = await ping(urls, fetch, sleep);
  console.log(`IndexNow accepted ${String(urls.length)} URLs (HTTP ${String(status)})`);
}

// --- the entry point -------------------------------------------------------------

// only when run, so the tests can import the functions above
if (import.meta.main) {
  try {
    await main(Bun.argv.slice(2), fetch, Bun.sleep);
  } catch (err) {
    console.error(err instanceof BuildError ? `error: ${err.message}` : err);
    process.exit(2);
  }
}
