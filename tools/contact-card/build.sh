#!/bin/sh
# Rebuild assets/img/contact-card.png and the banners from this folder's pages.
# Needs macOS (for the Futura and Avenir Next fonts), Google Chrome, python3 and uv.
set -eu

cd "$(dirname "$0")/../.."
PORT=${PORT:-8765}
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
TMP=$(mktemp -d)

# serve the repo, since the pages import the earthrise modules
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
trap 'kill "$SERVER"' EXIT
sleep 1

# page, width, height, scale, output
# the card: 1200 x 630 at 1.3x gives 1560 x 819, the size the og:image tags declare
# the banners: 1500 x 500 for Bluesky, Mastodon and X; LinkedIn's 1584 x 396
while read -r page width height scale out; do
  # the time budget lets the star catalogues load before the shot
  "$CHROME" --headless --hide-scrollbars --window-size="$width,$height" --force-device-scale-factor="$scale" \
    --virtual-time-budget=10000 --screenshot="$TMP/shot.png" "http://127.0.0.1:$PORT/tools/contact-card/$page" 2>/dev/null

  # 256 colours: about a third of the size and indistinguishable
  uv run -q --no-project --with pillow python - "$TMP/shot.png" "$out" "$width" "$height" "$scale" <<'EOF'
import sys
from PIL import Image
src, out, width, height, scale = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), float(sys.argv[5])
image = Image.open(src).convert("RGB")
assert image.size == (round(width * scale), round(height * scale)), image.size
image.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(out, optimize=True)
print(out, image.size)
EOF
done <<'LIST'
index.html 1200 630 1.3 assets/img/contact-card.png
banner.html 1500 500 1 assets/img/banner.png
banner-linkedin.html 1584 396 1 assets/img/banner-linkedin.png
LIST
