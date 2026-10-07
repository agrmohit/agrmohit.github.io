# Fonts

The site uses `JetBrainsMono-Regular-subset.woff2`, a trimmed copy of `JetBrainsMono-Regular.woff2` (JetBrains Mono
2.304, [OFL](https://scripts.sil.org/OFL)). It keeps only Latin letters and common punctuation and symbols, which cuts
the file from 92 kB to 15 kB. It also drops ligatures, which the site turns off anyway.

Keep the original: it's what the subset is made from.

## Rebuild the subset

You need [uv](https://docs.astral.sh/uv/). Run this from the repository root:

```sh
uv run --no-project --python 3.12 --with fonttools==4.66.1 --with brotli==1.2.0 \
  pyftsubset assets/webfonts/JetBrainsMono-Regular.woff2 \
  --unicodes='U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2190-2195,U+2212,U+2248,U+2260,U+2264-2265,U+FFFD' \
  --layout-features='' \
  --flavor=woff2 \
  --output-file=assets/webfonts/JetBrainsMono-Regular-subset.woff2

shasum -a 256 assets/webfonts/JetBrainsMono-Regular-subset.woff2
```

You should get this hash, and a file of 14,916 bytes:

```text
aa700465b335619e9bd5adee2e5db44618bb218446893066ae79a930d27b148e
```

The versions are pinned so the output is identical every time. A different version may produce a different hash
even if the font looks the same.

## Add a character

A character missing from the subset still shows, but in a fallback font. To add one:

1. Add its code point to `--unicodes` above, for example `U+2713` for ✓.
2. Rebuild under a new name, such as `JetBrainsMono-Regular-subset-2.woff2`, so browsers don't keep the cached old
   copy.
3. Point `index.html`, `earthrise/index.html` and `404.html` at the new file. Each page names it twice: once in the
   preload link and once in `@font-face`.
4. Update the command and the hash in this file.

You don't need to add emoji. They always come from the system emoji font.
