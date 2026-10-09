#!/bin/sh
# Build the site's share images from this folder's pages. Run with -h for usage.
set -eu

usage() {
  cat <<'EOF'
Build the site's share images from tools/share-images/.

Usage:
  build.sh                               rebuild the contact card, both banners and /projects/earthrise/card.png
  build.sh page TITLE SUBTITLE URL OUT   build a link-preview image for any page, 1560 x 819
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
sleep 1

# shoot PAGE WIDTH HEIGHT SCALE OUT: photograph a page of this folder at WIDTH x HEIGHT, SCALE times over
shoot() {
  # the time budget lets the star catalogues load before the shot
  "$CHROME" --headless --hide-scrollbars --window-size="$2,$3" --force-device-scale-factor="$4" \
    --virtual-time-budget=10000 --screenshot="$TMP/shot.png" "http://127.0.0.1:$PORT/tools/share-images/$1" 2>/dev/null
  mkdir -p "$(dirname "$5")"

  # 256 colours: about a third of the size and indistinguishable
  uv run -q --no-project --with pillow python - "$TMP/shot.png" "$5" "$2" "$3" "$4" <<'EOF'
import sys
from PIL import Image
src, out, width, height, scale = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), float(sys.argv[5])
image = Image.open(src).convert("RGB")
assert image.size == (round(width * scale), round(height * scale)), image.size
image.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(out, optimize=True)
print(out, image.size)
EOF
}

# page TITLE SUBTITLE URL OUT: post.html filled in, at the card's 1560 x 819 (1200 x 630 at 1.3x)
page() {
  query=$(python3 -c 'import sys, urllib.parse as u; print(u.urlencode({"title": sys.argv[1], "sub": sys.argv[2], "url": sys.argv[3]}))' "$1" "$2" "$3")
  case $4 in /*) out=$4 ;; *) out=$CALLER/$4 ;; esac
  shoot "post.html?$query" 1200 630 1.3 "$out"
}

CALLER=$(pwd)
cd "$ROOT"

if [ "${1:-}" = page ]; then
  page "$2" "$3" "$4" "$5"
  exit
fi

# the card: 1200 x 630 at 1.3x gives 1560 x 819, the size the og:image tags declare
shoot contact.html 1200 630 1.3 assets/img/contact-card.png
# the banners: 1500 x 500 for Bluesky, Mastodon and X; LinkedIn's 1584 x 396
shoot contact.html?layout=banner 1500 500 1 assets/img/banner.png
shoot contact.html?layout=linkedin 1584 396 1 assets/img/banner-linkedin.png
page "Earthrise" "the real sky,
from lunar orbit" "agrmohit.com/projects/earthrise" projects/earthrise/card.png
