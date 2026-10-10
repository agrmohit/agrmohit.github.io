# agrmohit.com

![Contact Card](assets/img/contact-card.png)

The source of <https://agrmohit.com>, deployed to GitHub Pages by `.github/workflows/pages.yml`.
Only the paths listed in that workflow go online; `tools/` and the READMEs stay here.

- `tools/icons/`: builds the home-screen and app icons from the favicon
- `tools/share-images/`: builds the link-preview images and profile banners
- `tools/stars/`: builds the earthrise star catalogues from HYG
- `workers/github-stars/`: the Cloudflare Worker behind `/api/stars`, the project star counts
- `assets/webfonts/`: how the trimmed font is made
