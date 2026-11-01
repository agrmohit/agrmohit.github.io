#!/bin/sh
# Photograph the site for the web app manifest's install dialog. Run with -h for usage.
set -eu

usage() {
  cat <<'EOF'
Photograph the site for the web app manifest's install dialog: assets/img/screenshots/.

Usage:
  build.sh screenshots                   photograph the live site (or SITE, e.g. http://localhost:8765)
  build.sh -h | --help | help            show this help

The cards and banners are built by tools/build.ts instead. These four photographs are not: a browser
draws text differently on each OS, and the live star counts change, so they are taken by hand.

Needs macOS, Google Chrome, python3 and uv. More in tools/share-images/README.md.
EOF
}

case ${1:-} in
  -h | --help | help) usage; exit ;;
  screenshots) ;;
  *) usage >&2; exit 2 ;;
esac

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
PORT=${PORT:-8765}
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
TMP=$(mktemp -d)

# serve the repo, for SITE=http://localhost:8765 (which shows mocked star counts)
python3 -m http.server "$PORT" --bind localhost --directory "$ROOT" >/dev/null 2>&1 &
SERVER=$!
trap 'kill "$SERVER"' EXIT
until curl -so /dev/null "http://localhost:$PORT/"; do sleep 0.1; done

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

  uv run -q --no-project --with pillow python - "$TMP/shot.png" "$5" "$2" "$3" "$4" "${6:-$2}" <<'EOF'
import sys
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
width, height, scale, keep = int(sys.argv[3]), int(sys.argv[4]), float(sys.argv[5]), int(sys.argv[6])
image = Image.open(src).convert("RGB")
assert image.size == (round(width * scale), round(height * scale)), image.size
image = image.crop((0, 0, round(keep * scale), image.height))
image.save(out, quality=80, method=6)
print(out, image.size)
EOF
}

# phone URL OUT: a page at a phone's 412 x 915, twice over. Chrome's windows are at least 500 wide,
# so the page goes in a 412-wide frame and the shot is cropped to it
phone() {
  frame=$(python3 -c 'import sys, urllib.parse as u; print("data:text/html," + u.quote(f"<body style=margin:0><iframe src=\"{sys.argv[1]}\" style=\"border:0;width:412px;height:915px\">"))' "$1")
  shoot "$frame" 500 915 2 "$2" 412
}

cd "$ROOT"

# as the install dialog shows the site: wide for desktop, narrow for phones. The sky is held at the share
# images' moment, its Earth in full colour
site=${SITE:-https://agrmohit.com}
moment="date=1883984400000&playing=0&progress=0.55&earthTint=1" # 13 September 2029, 09:00 UTC
shoot "$site/?$moment" 1280 720 1 assets/img/screenshots/home-wide.webp
shoot "$site/projects/earthrise/#$moment" 1280 720 1 assets/img/screenshots/earthrise-wide.webp
phone "$site/?$moment" assets/img/screenshots/home-narrow.webp
phone "$site/projects/earthrise/#$moment" assets/img/screenshots/earthrise-narrow.webp
