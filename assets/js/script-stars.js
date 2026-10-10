// Show each project's GitHub stars next to its title, if it has any.
// The counts come from workers/github-stars, which caches them for 6 hours, so visitors never reach GitHub.
async function GitHubStars() {
  let stars;
  if (window.location.hostname === "127.0.0.1") {
    stars = new Proxy({}, { get: () => getMockStars() }); // mock data for local development
  } else {
    try {
      const response = await fetch("/api/stars");
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      stars = await response.json();
    } catch (error) {
      console.error("Error fetching GitHub stars:", error);
      return;
    }
  }

  for (const h3 of document.querySelectorAll(".github-project h3")) {
    const repo = new URL(h3.getAttribute("data-url")).pathname.split("/")[2];
    const count = stars[repo];
    if (count) {
      h3.innerHTML = h3.innerHTML
        .trim()
        .replace("<a", ` <span title="${count} GitHub stars">(${count}<span class="emoji-rotate">⭐</span>)</span><a`);
    }
  }
}

function getMockStars() {
  const choices = [0, 0, 4, 13, 24, 46, 50, 83, 90, 150];
  return choices[Math.floor(Math.random() * choices.length)];
}

GitHubStars();
