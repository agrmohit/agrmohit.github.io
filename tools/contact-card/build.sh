#!/bin/sh
# Rebuild assets/img/contact-card.png from this folder's page.
# Needs macOS (for the Futura and Avenir Next fonts), Google Chrome, python3 and uv.
set -eu

cd "$(dirname "$0")/../.."
PORT=${PORT:-8765}
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
SHOT=$(mktemp -d)/card.png

# serve the repo, since the page imports the earthrise modules
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
trap 'kill "$SERVER"' EXIT
sleep 1

# 1200 x 630 at 1.3x gives 1560 x 819, the size the og:image tags declare;
# the time budget lets the star catalogues load before the shot
"$CHROME" --headless --hide-scrollbars --window-size=1200,630 --force-device-scale-factor=1.3 \
  --virtual-time-budget=10000 --screenshot="$SHOT" "http://127.0.0.1:$PORT/tools/contact-card/" 2>/dev/null

# 256 colours: about a third of the size and indistinguishable
uv run -q --no-project --with pillow python - "$SHOT" assets/img/contact-card.png <<'EOF'
import sys
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
image = Image.open(src).convert("RGB")
assert image.size == (1560, 819), image.size
image.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(out, optimize=True)
print(out, image.size)
EOF
