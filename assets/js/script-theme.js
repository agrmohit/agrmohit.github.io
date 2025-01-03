// import "./css-global-variables.min.js";
// Commented since it is currently imported in html globally
const cssVar = new CSSGlobalVariables();

// Theme 'undefined' is 'auto'
const themeList = ["auto", "light", "dark", "midnight"];

function getCurrentTheme() {
  const themeName = localStorage.getItem("theme");
  if (themeName == undefined) {
    return "auto";
  }
  return themeName;
}

function createThemeToggleElement() {
  const navElement = document.querySelector("nav");
  const themeToggleElement = document.createElement("span");

  const currentTheme = getCurrentTheme();
  const nextTheme = themeList[(themeList.indexOf(currentTheme) + 1) % themeList.length];

  themeToggleElement.innerHTML = `<a href="#" id="theme-toggle" title="Current theme: ${currentTheme}">${nextTheme}\u202ftheme</a>`;

  themeToggleElement.addEventListener("click", handleThemeToggle);
  navElement.appendChild(themeToggleElement);
}

function handleThemeToggle() {
  const currentTheme = getCurrentTheme();
  const nextTheme = themeList[(themeList.indexOf(currentTheme) + 1) % themeList.length];
  applyTheme(nextTheme);
  umami.track("toggle-theme", { "old-theme": currentTheme, "new-theme": nextTheme });
}

function applyTheme(nextTheme) {
  switch (nextTheme) {
    case "auto":
      // Reset all css variables to default value from css file
      document.documentElement.style.removeProperty("--background-primary");
      document.documentElement.style.removeProperty("--text-primary");
      document.documentElement.style.removeProperty("--text-secondary");
      document.documentElement.style.removeProperty("--text-strong");
      document.documentElement.style.removeProperty("--text-accent");
      document.documentElement.style.removeProperty("--text-quote");
      document.documentElement.style.removeProperty("--line-height");
      break;

    case "light":
      cssVar["--background-primary"] = "#f9fffa";
      cssVar["--text-primary"] = "#000000";
      cssVar["--text-secondary"] = "#6c6f85";
      cssVar["--text-strong"] = "#353745";
      cssVar["--text-accent"] = "#049d67";
      cssVar["--text-quote"] = "#dd7878";
      cssVar["--line-height"] = "1.25rem";
      break;

    case "midnight":
      cssVar["--background-primary"] = "#0a0a0a";
      cssVar["--text-primary"] = "#e5e5e5";
      cssVar["--text-secondary"] = "#9b9b9b";
      cssVar["--text-strong"] = "#ffffff";
      cssVar["--text-accent"] = "#60a5fa";
      cssVar["--text-quote"] = "#aec1d5";
      cssVar["--line-height"] = "1.25rem";
      break;

    case "dark":
      cssVar["--background-primary"] = "#1a1a1a";
      cssVar["--text-primary"] = "#e0e4ef";
      cssVar["--text-secondary"] = "#ffffff";
      cssVar["--text-strong"] = "#efbcb2";
      cssVar["--text-accent"] = "#99d1db";
      cssVar["--text-quote"] = "#99d1db";
      cssVar["--line-height"] = "1.25rem";
      break;

    default:
      console.error(`Unrecognised theme name ${nextTheme}`);
      return;
  }

  localStorage.setItem("theme", nextTheme);
  const themeToggleElement = document.querySelector("#theme-toggle");
  themeToggleElement.title = `Current theme: ${nextTheme}`;
  const nextThemeOnClick = themeList[(themeList.indexOf(nextTheme) + 1) % themeList.length];
  themeToggleElement.innerText = `${nextThemeOnClick.charAt(0).toUpperCase() + nextThemeOnClick.slice(1)}\u202ftheme`;
}

function main() {
  createThemeToggleElement();
  // To apply the theme set on first load
  applyTheme(getCurrentTheme());
}

main();
