// The star count of every agrmohit repository with stars, as {"repo-name": stars}.
// An hourly cron asks GitHub and stores the counts in KV; visitors are only ever served the stored copy,
// so GitHub sees 24 requests a day however many people visit.
const OWNER = "agrmohit";
const KEY = "stars";
const SERVE_TTL = 10 * 60; // how long a data centre and a browser reuse the counts before reading KV again

export default {
  async scheduled(controller, env) {
    // if GitHub fails, the previous counts stay in KV and keep being served
    await env.STARS.put(KEY, JSON.stringify(await fetchStars(env.GITHUB_TOKEN)));
  },

  async fetch(request, env, ctx) {
    if (request.method !== "GET") return new Response(null, { status: 405, headers: { Allow: "GET" } });

    const key = new Request(new URL("/api/stars", request.url));
    const cached = await caches.default.match(key);
    if (cached) return cached;

    let stars = await env.STARS.get(KEY);
    if (stars === null) {
      // only before the first cron run after deploying: fill KV once rather than serve nothing
      try {
        stars = JSON.stringify(await fetchStars(env.GITHUB_TOKEN));
      } catch (error) {
        console.error(error);
        return new Response("GitHub is unavailable", { status: 502, headers: { "Cache-Control": "no-store" } });
      }
      ctx.waitUntil(env.STARS.put(KEY, stars));
    }

    const response = new Response(stars, {
      headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${SERVE_TTL}` },
    });
    ctx.waitUntil(caches.default.put(key, response.clone()));
    return response;
  },
};

async function fetchStars(token) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "agrmohit.com" };
  // optional, but Workers share their outgoing addresses, and GitHub allows only 60 anonymous requests an hour each
  if (token) headers.Authorization = `Bearer ${token}`;

  const stars = {};
  for (let page = 1; ; page++) {
    const response = await fetch(`https://api.github.com/users/${OWNER}/repos?per_page=100&page=${page}`, { headers });
    if (!response.ok) throw new Error(`GitHub: ${response.status} ${response.statusText}`);
    const repos = await response.json();
    for (const repo of repos) if (repo.stargazers_count > 0) stars[repo.name] = repo.stargazers_count;
    if (repos.length < 100) return stars;
  }
}
