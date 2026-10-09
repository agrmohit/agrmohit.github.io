# Contact card and banners

Three images, built from this folder's pages by headless Chrome:

| Image | Size | Used for | Page |
| --- | --- | --- | --- |
| `assets/img/contact-card.png` | 1560 × 819 | link previews of agrmohit.com (`og:image`) | `index.html` |
| `assets/img/banner.png` | 1500 × 500 | profile banner on Bluesky, Mastodon and X | `banner.html` |
| `assets/img/banner-linkedin.png` | 1584 × 396 | profile banner on LinkedIn | `banner-linkedin.html` |

The sky behind the text is the real earthrise engine, held still on 13 September 2029 at 09:00 UTC. At that
moment the Earth, seen from lunar orbit, sits just below the Pleiades.

## Rebuild them

You need macOS (the name uses Futura and Avenir Next, which ship with it), Google Chrome and
[uv](https://docs.astral.sh/uv/). From the repository root:

```sh
sh tools/contact-card/build.sh
```

The script overwrites all three images. On the same machine it produces the same files every time.

## Change them

- **Text** (name, role, handle, email): edit the three pages. The name's "j" is wrapped in `<span class="j">`,
  because Futura's own "j" looks like an "i".
- **Colours and fonts**, shared by all three: edit `style.css`. Each page sets its own sizes and positions.
- **Sky** (date, Earth size, horizon): edit `sky.js`.

To check a change before rebuilding, serve the repository (for example `python3 -m http.server`) and open a
page in a window of its size, such as `/tools/contact-card/banner.html` at 1500 × 500.

## Where banners get cropped

Every platform crops banners differently and covers a corner with the avatar. `platforms.html` shows each
built banner the way each platform draws it, with the avatar outlined. Open it after rebuilding.

For the 3:1 banner, keep text and the Earth within x 100–1400 and y 65–435, and out of the lower left
(x < 370 below y 230). Bluesky's numbers come from its app's source (`src/screens/Profile/Header/Shell.tsx`),
Mastodon's from its web client's (`app/javascript/mastodon/components/account_header`). LinkedIn's are
measured from screenshots of its site and Android app. X's are an estimate, not yet checked.

For the LinkedIn banner, keep text right of x 525 below y 185: the phone app's photo is much larger than
the desktop one.

## After changing the card

Share the site as `https://agrmohit.com/?v=2` (raising the number each time) so WhatsApp fetches a fresh
preview, and refresh LinkedIn's cache with its [Post Inspector](https://www.linkedin.com/post-inspector/).
Other sites update within about a week.
