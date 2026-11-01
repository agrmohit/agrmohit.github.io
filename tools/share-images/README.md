# Share images

The cards and banners are built by `tools/build.ts`; see `tools/README.md`. This folder keeps two things that are
not generated.

## Install screenshots

`build.sh screenshots` photographs the live site for the install dialog that `manifest.webmanifest` gets:
`assets/img/screenshots/`, the home page and the earthrise lab at 1280 x 720 and at a phone's 412 x 915, under the
same sky as the cards. They are taken by hand, after a change that shows: a browser draws text differently on each
operating system, and the live star counts change, so they could not be rebuilt byte for byte. Set
`SITE=http://localhost:8765` to shoot a local server instead, mocked star counts and all.

Needs macOS, Google Chrome and [uv](https://docs.astral.sh/uv/).

## Banner crops

`platforms.html` shows each banner as each platform crops it, avatar outlined. Bluesky and Mastodon come from
their source code, LinkedIn from screenshots; X is a guess. Keep clear of:

- 3:1 banner: everything outside x 100-1400, y 65-435, and the lower left (x < 370, y > 230).
- LinkedIn: x < 525 below y 185 (the phone app's photo).

The text positions live in `CONTACT` in `tools/images.ts`.

## After changing an image

Share the page with `?v=2` (then 3, ...) so caches refetch. Others catch up within a week.
