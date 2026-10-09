# Contact card

The image link previews show for agrmohit.com (`og:image`): `assets/img/contact-card.png`, 1560 × 819.

It's this folder's page, `index.html`, photographed by headless Chrome. The sky behind the text is the real
earthrise engine, held still on 13 September 2029 at 09:00 UTC. At that moment the Earth, seen from lunar orbit,
sits just below the Pleiades.

## Rebuild it

You need macOS (the name uses Futura and Avenir Next, which ship with it), Google Chrome and
[uv](https://docs.astral.sh/uv/). From the repository root:

```sh
sh tools/contact-card/build.sh
```

The script overwrites `assets/img/contact-card.png`. On the same machine it produces the same file every time.

## Change it

- **Text** (name, role, handle, email): edit `index.html`. The name's "j" is wrapped in `<span class="j">`,
  because Futura's own "j" looks like an "i".
- **Sky** (date, Earth size, horizon): edit `card.js`.

To check a change before rebuilding, serve the repository (for example `python3 -m http.server`) and open
`/tools/contact-card/` in a 1200 × 630 window.

After deploying a new card, refresh LinkedIn's cache with its
[Post Inspector](https://www.linkedin.com/post-inspector/); other sites update within about a week.
