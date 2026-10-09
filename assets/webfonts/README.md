# Fonts

`JetBrainsMono-Regular-subset.woff2` is `JetBrainsMono-Regular.woff2` (JetBrains Mono 2.304,
[OFL](https://scripts.sil.org/OFL)) trimmed to Latin letters and common symbols, without ligatures: 15 kB instead
of 92 kB. Keep the original; the subset is made from it.

## Rebuild

From the repository root, with [uv](https://docs.astral.sh/uv/):

```sh
uv run --no-project --python 3.12 --with fonttools==4.66.1 --with brotli==1.2.0 \
  pyftsubset assets/webfonts/JetBrainsMono-Regular.woff2 \
  --unicodes='U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2190-2195,U+2212,U+2248,U+2260,U+2264-2265,U+FFFD' \
  --layout-features='' \
  --flavor=woff2 \
  --output-file=assets/webfonts/JetBrainsMono-Regular-subset.woff2
```

The pinned versions make it byte-identical: 14,916 bytes, SHA-256
`aa700465b335619e9bd5adee2e5db44618bb218446893066ae79a930d27b148e`.

## Add a character

Missing characters still show, in a fallback font. To add one (emoji never need it):

1. Add its code point to `--unicodes`, e.g. `U+2713` for ✓.
2. Rebuild under a new name, e.g. `JetBrainsMono-Regular-subset-2.woff2`, so browsers don't serve the cached copy.
3. Point `index.html`, `404.html` and `projects/earthrise/index.html` at it, in both the preload link and
   `@font-face`.
4. Update the command and hash here.
