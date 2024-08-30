// Get GitHub stars and add it next to project title if stars > 0
async function GitHubStars() {
  const projectArticles = document.querySelectorAll(".github-project");
  const fetchPromises = []; // Array to store all fetch promises

  for (const projectArticle of projectArticles) {
    const h3 = projectArticle.querySelector("h3");
    const githubURL = h3.getAttribute("data-url");

    // Create a promise for each fetch operation
    if (window.location.hostname === "127.0.0.1") {
      // Mock data for local development
      fetchPromises.push(Promise.resolve(getMockStars())); // Use Promise.resolve to wrap mock data
    } else {
      fetchPromises.push(getGithubStars(githubURL)); // Add the fetch promise to the array
    }
  }

  try {
    // Wait for all fetch operations to complete in parallel
    const starsArray = await Promise.all(fetchPromises);

    // Update the DOM with fetched stars
    projectArticles.forEach((projectArticle, index) => {
      const h3 = projectArticle.querySelector("h3");
      const stars = starsArray[index];

      if (stars) {
        h3.innerHTML = h3.innerHTML
          .trim()
          .replace(
            "<a",
            ` <span title="${stars} GitHub stars">(${stars}<span class="emoji-rotate">⭐</span>)</span><a`
          );
      }
    });
  } catch (error) {
    console.error("Error fetching GitHub stars:", error);
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

    try {
      const response = await fetch(apiURL);
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
