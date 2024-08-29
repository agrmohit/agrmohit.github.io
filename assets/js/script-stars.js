// Get GitHub stars and add it next to project title if stars > 0
async function GitHubStars() {
  const projectArticles = document.querySelectorAll(".github-project");

  for (const projectArticle of projectArticles) {
    const h3 = projectArticle.querySelector("h3");
    const githubURL = h3.getAttribute("data-url");
    let stars = null;

    if (window.location.hostname === "127.0.0.1") {
      // Mock data for local development
      stars = getMockStars();
    } else {
      stars = await getGithubStars(githubURL);
    }

    if (stars) {
      h3.innerHTML = h3.innerHTML.trim().replace("<a", ` ${stars}⭐<a`);
    }
  }

  function getMockStars() {
    const choices = [0, 0, 4, 13, 24, 46, 50, 83, 90, 150];
    return choices[Math.floor(Math.random() * choices.length)];
  }

  async function getGithubStars(repoURL) {
    const url = new URL(repoURL);
    const pathname = url.pathname;
    const [owner, repo] = pathname.slice(1).split("/");
    const apiURL = `https://api.github.com/repos/${owner}/${repo}`;
    const response = await fetch(apiURL);

    try {
      if (!response.ok) {
        const errorData = await response.json();
        console.error(`Error fetching data from GitHub API: ${response.status} ${response.statusText}`);
        console.error("Error details:", errorData);
        return;
      }

      const data = await response.json();
      return data.stargazers_count;
    } catch (error) {
      console.error("Error fetching GitHub stars:", error);
    }
  }
}

GitHubStars();
