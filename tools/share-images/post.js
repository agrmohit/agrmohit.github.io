// Fills post.html from its query string and fits the text to the sky left of the Earth.
const query = new URLSearchParams(location.search);
const title = query.get("title") ?? "Title";
const sub = query.get("sub") ?? "";
const url = query.get("url") ?? "agrmohit.com";

const text = document.querySelector(".text");
const name = text.querySelector(".name");
const role = text.querySelector(".role");
const link = text.querySelector(".url");

// Futura's j reads as an i, so every j comes from Avenir Next, as in the card
for (const part of title.split(/(j)/)) {
  if (part === "j") {
    const j = document.createElement("span");
    j.className = "j";
    j.textContent = "j";
    name.append(j);
  } else name.append(part);
}
role.textContent = sub;
role.hidden = !sub;
// a break opportunity after every / and -, used only if the URL has to wrap
for (const part of url.split(/(?<=[/-])/)) link.append(part, document.createElement("wbr"));

const SKY = 470; // the horizon's at 0.74 of 630; keep the text above it
const MIN_TOP = 56;

await document.fonts.ready;

for (let size = 26; size > 20 && link.scrollWidth > text.clientWidth; size--) link.style.fontSize = `${size - 1}px`;
if (link.scrollWidth > text.clientWidth) link.classList.add("wrap");

for (let size = 104; size >= 48; size -= 4) {
  name.style.fontSize = `${size}px`;
  const lines = Math.round(name.offsetHeight / parseFloat(getComputedStyle(name).lineHeight));
  if (lines <= 3 && text.offsetHeight <= SKY - MIN_TOP) break;
}

text.style.top = `${Math.max(MIN_TOP, (SKY - text.offsetHeight) / 2)}px`;
