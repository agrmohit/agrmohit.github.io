#!/bin/sh
# Build the site's share images from this folder's pages. Run with -h for usage.
set -eu

usage() {
  cat <<'EOF'
Build the site's share images from tools/share-images/.

Usage:
  build.sh                               rebuild the contact card, both banners and /projects/earthrise/card.png
  build.sh page TITLE SUBTITLE URL OUT   build a link-preview image for any page, 1560 x 819
  build.sh screenshots                   photograph the live site for the web app manifest's install dialog
  build.sh -h | --help | help            show this help

For page: pass "" as SUBTITLE for none; a line break inside the quotes starts a new line.
OUT is relative to where you run the script, for example:
  build.sh page "Hello, world" "" "agrmohit.com/blog/hello-world" blog/hello-world/card.png

Needs macOS (for the Futura and Avenir Next fonts), Google Chrome, python3 and uv.
More in tools/share-images/README.md.
EOF
}

case ${1:-} in
  -h | --help | help) usage; exit ;;
  "") ;;
  screenshots) ;;
  page) [ $# -eq 5 ] || { echo "page takes 4 arguments: TITLE SUBTITLE URL OUT (run with -h for help)" >&2; exit 2; } ;;
  *) usage >&2; exit 2 ;;
esac

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
PORT=${PORT:-8765}
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
TMP=$(mktemp -d)

# serve the repo, since the pages import the earthrise modules
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT" >/dev/null 2>&1 &
SERVER=$!
trap 'kill "$SERVER"' EXIT
# wait until it answers: a page shot before then has no sky
until curl -so /dev/null "http://127.0.0.1:$PORT/"; do sleep 0.1; done

PAGES=http://127.0.0.1:$PORT/tools/share-images

# shoot URL WIDTH HEIGHT SCALE OUT [KEEP]: photograph a page at WIDTH x HEIGHT, SCALE times over,
# keeping only the left KEEP pixels (in the page's own units) if given
shoot() {
  # the time budget lets the star catalogues load before the shot. It doesn't wait for a frame from another
  # site, which runs in a process of its own, so frames stay in the page's process. Headless Chrome can stop
  # drawing frames, freezing a fade-in part way: reduced motion skips the fade
  "$CHROME" --headless --hide-scrollbars --window-size="$2,$3" --force-device-scale-factor="$4" \
    --disable-site-isolation-trials --disable-features=site-per-process,IsolateOrigins,LocalNetworkAccessChecks \
    --force-prefers-reduced-motion \
    --virtual-time-budget=10000 --screenshot="$TMP/shot.png" "$1" 2>/dev/null
  mkdir -p "$(dirname "$5")"

  # PNG in 256 colours: about a third of the size and indistinguishable; WebP for screenshots of the site
  uv run -q --no-project --with pillow python - "$TMP/shot.png" "$5" "$2" "$3" "$4" "${6:-$2}" <<'EOF'
import sys
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
width, height, scale, keep = int(sys.argv[3]), int(sys.argv[4]), float(sys.argv[5]), int(sys.argv[6])
image = Image.open(src).convert("RGB")
assert image.size == (round(width * scale), round(height * scale)), image.size
image = image.crop((0, 0, round(keep * scale), image.height))
if out.endswith(".webp"):
    image.save(out, quality=80, method=6)
else:
    image.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(out, optimize=True)
print(out, image.size)
EOF
}

# phone URL OUT: a page at a phone's 412 x 915, twice over. Chrome's windows are at least 500 wide,
# so the page goes in a 412-wide frame and the shot is cropped to it
phone() {
  frame=$(python3 -c 'import sys, urllib.parse as u; print("data:text/html," + u.quote(f"<body style=margin:0><iframe src=\"{sys.argv[1]}\" style=\"border:0;width:412px;height:915px\">"))' "$1")
  shoot "$frame" 500 915 2 "$2" 412
}

# page TITLE SUBTITLE URL OUT: post.html filled in, at the card's 1560 x 819 (1200 x 630 at 1.3x)
page() {
  query=$(python3 -c 'import sys, urllib.parse as u; print(u.urlencode({"title": sys.argv[1], "sub": sys.argv[2], "url": sys.argv[3]}))' "$1" "$2" "$3")
  case $4 in /*) out=$4 ;; *) out=$CALLER/$4 ;; esac
  shoot "$PAGES/post.html?$query" 1200 630 1.3 "$out"
}

CALLER=$(pwd)
cd "$ROOT"

if [ "${1:-}" = page ]; then
  page "$2" "$3" "$4" "$5"
  exit
fi

# screenshots: the live site (or SITE, say http://127.0.0.1:8765 to try a change first), as the install dialog
# shows it; wide for desktop, narrow for phones. The sky is held at the share images' moment, its Earth in
# full colour; only the home page's star counts change between runs
if [ "${1:-}" = screenshots ]; then
  site=${SITE:-https://agrmohit.com}
  moment="date=1883984400000&playing=0&progress=0.55&earthTint=1" # 13 September 2029, 09:00 UTC
  shoot "$site/?$moment" 1280 720 1 assets/img/screenshots/home-wide.webp
  shoot "$site/projects/earthrise/#$moment" 1280 720 1 assets/img/screenshots/earthrise-wide.webp
  phone "$site/?$moment" assets/img/screenshots/home-narrow.webp
  phone "$site/projects/earthrise/#$moment" assets/img/screenshots/earthrise-narrow.webp
  exit
fi

# the card: 1200 x 630 at 1.3x gives 1560 x 819, the size the og:image tags declare
shoot "$PAGES/contact.html" 1200 630 1.3 assets/img/contact-card.png
# the banners: 1500 x 500 for Bluesky, Mastodon and X; LinkedIn's 1584 x 396
shoot "$PAGES/contact.html?layout=banner" 1500 500 1 assets/img/banner.png
shoot "$PAGES/contact.html?layout=linkedin" 1584 396 1 assets/img/banner-linkedin.png
page "Earthrise" "the real sky,
from lunar orbit" "agrmohit.com/projects/earthrise" projects/earthrise/card.png
