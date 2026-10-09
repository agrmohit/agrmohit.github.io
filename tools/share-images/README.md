# Share images

Headless Chrome photographs this folder's pages over a still of the real earthrise (13 September 2029, 09:00 UTC,
the Earth just below the Pleiades).

| Image | Size | For | Page |
| --- | --- | --- | --- |
| `assets/img/contact-card.png` | 1560 x 819 | link previews of the home page | `index.html` |
| `projects/earthrise/card.png` | 1560 x 819 | link previews of /projects/earthrise/ | `post.html` |
| `assets/img/banner.png` | 1500 x 500 | Bluesky, Mastodon and X banners | `banner.html` |
| `assets/img/banner-linkedin.png` | 1584 x 396 | LinkedIn banner | `banner-linkedin.html` |

Needs macOS (for Futura and Avenir Next), Google Chrome and [uv](https://docs.astral.sh/uv/). Output is
byte-identical between runs on the same machine.

## Use

```sh
tools/share-images/build.sh             # rebuild all four
tools/share-images/build.sh page "Hello, world" "" "agrmohit.com/blog/hello-world" blog/hello-world/card.png
```

`page` makes a preview for any page: title, subtitle (`""` for none) and URL. Long text shrinks and wraps to fit.
Put the image next to its page and point the page's `og:` and `twitter:` tags at it, as in
`projects/earthrise/index.html`. Run `build.sh -h` for details.

## Edit

- Text: `index.html` and the banner pages. Wrap a "j" in `<span class="j">`, since Futura's looks like an "i"
  (`post.html` does it for you).
- Colours and fonts: `style.css`. Sky: `sky.js`.
- Preview a page by serving the repo (`python3 -m http.server`) and opening it at its size.

## Banner crops

`platforms.html` shows each banner as each platform crops it, avatar outlined. Bluesky and Mastodon come from
their source code, LinkedIn from screenshots; X is a guess. Keep clear of:

- 3:1 banner: everything outside x 100-1400, y 65-435, and the lower left (x < 370, y > 230).
- LinkedIn: x < 525 below y 185 (the phone app's photo).

## After changing an image

Share the page with `?v=2` (then 3, ...) so cache refetches. Others catch up within a week.
