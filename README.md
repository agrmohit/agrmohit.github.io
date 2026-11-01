# agrmohit.com

![Contact Card](assets/img/contact-card.png)

The source of <https://agrmohit.com>, deployed to GitHub Pages by `.github/workflows/pages.yml`.
Only the paths listed in that workflow go online; `tools/` and the READMEs stay here.

- `Makefile`: `make` lists the targets; `make serve` previews the site, `make build` regenerates, `make check` verifies
- `tools/`: `build.ts` builds every generated file (project pages from READMEs, link previews, banners, icons, the
  projects list and sitemap) the same way on every machine; see `tools/README.md`
- `tools/share-images/`: the manifest's install screenshots, taken by hand, and the banner-crop preview
- `tools/stars/`: builds the earthrise star catalogues from HYG
- `workers/github-stars/`: the Cloudflare Worker behind `/api/stars`, the project star counts
- `assets/webfonts/`: how the trimmed font is made
