// The star count of every agrmohit repository with stars, as {"repo-name": stars}. GitHub is asked at most
// once per 6 hours per Cloudflare data centre, so visitors never reach it and its rate limit never bites.
const OWNER = "agrmohit";
const TTL = 6 * 60 * 60;

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "GET") return new Response(null, { status: 405, headers: { Allow: "GET" } });

    // one cache entry whatever the query string, so nobody can make it fetch from GitHub again
    const key = new Request(new URL("/api/stars", request.url));
    const cached = await caches.default.match(key);
    if (cached) return cached;

    let stars;
    try {
      stars = await fetchStars(env.GITHUB_TOKEN);
    } catch (error) {
      console.error(error);
      return new Response("GitHub is unavailable", { status: 502, headers: { "Cache-Control": "no-store" } });
    }

    const response = Response.json(stars, { headers: { "Cache-Control": `public, max-age=${TTL}` } });
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
