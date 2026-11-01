// Show each project's GitHub stars next to its title, if it has any.
// The counts come from workers/github-stars, which refreshes them hourly, so visitors never reach GitHub.
async function GitHubStars() {
  let stars;
  if (["localhost", "127.0.0.1"].includes(window.location.hostname)) {
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
      // after the title, which may itself be a link to the project's page, and before the section link
      const stars = document.createElement("span");
      stars.title = `${count} GitHub stars`;
      const star = document.createElement("span");
      star.className = "emoji-rotate";
      star.textContent = "⭐";
      stars.append(`(${count}`, star, ")");
      h3.querySelector(".anchor-link").before(" ", stars);
    }
  }
}

function getMockStars() {
  const choices = [0, 0, 4, 13, 24, 46, 50, 83, 90, 150];
  return choices[Math.floor(Math.random() * choices.length)];
}

GitHubStars();
