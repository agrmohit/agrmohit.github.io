#!/usr/bin/env python3
"""Build the home-screen and app icons in assets/img/ from favicon.svg and this folder's SVGs. Run with -h for usage."""

import argparse
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FAVICON = ROOT / "assets/img/favicon.svg"
MONOCHROME = Path(__file__).with_name("monochrome.svg")
EARTHRISE = Path(__file__).with_name("earthrise.svg")
OUT = ROOT / "assets/img"

# the maskable icon's safe zone is the central circle, 80% of the width: this keeps the prompt and the Earth inside it
SAFE = 'transform="translate(16 15) scale(0.8) translate(-16 -15)"'


def full_bleed(svg):
    """favicon.svg without its rounded tile, for platforms that round the corners themselves."""
    return cut(svg, '<g clip-path="url(#tile)">', "<g>")


def maskable(svg):
    """The full-bleed icon with the prompt, the Earth and the stars shrunk into the safe zone; sky and Mars stay full bleed."""
    svg = full_bleed(svg)
    prompt, mars, stars, end = (
        svg.index(mark) for mark in ("    <!-- the prompt", "    <!-- Mars", "    <!-- stars", "  </g>\n</svg>")
    )
    inside = svg[prompt:mars] + svg[stars:end]
    return svg[:prompt] + svg[mars:stars] + f"    <g {SAFE}>\n{inside}    </g>\n" + svg[end:]


def cut(svg, old, new):
    assert svg.count(old) == 1, f"favicon.svg changed: expected one {old!r}"
    return svg.replace(old, new)


def render(svg, size, out):
    with tempfile.NamedTemporaryFile("w", suffix=".svg") as src:
        src.write(svg)
        src.flush()
        subprocess.run(["rsvg-convert", "-w", str(size), "-h", str(size), "-o", str(out), src.name], check=True)
    print(out.relative_to(ROOT), f"{out.stat().st_size / 1000:.1f} kB")


def main():
    argparse.ArgumentParser(
        description=__doc__.splitlines()[0],
        epilog="Needs rsvg-convert (brew install librsvg). The output is byte for byte the same with the same version.",
    ).parse_args()
    favicon = FAVICON.read_text()
    render(full_bleed(favicon), 180, OUT / "apple-touch-icon.png")  # iOS rounds the corners and fills transparency black
    render(favicon, 192, OUT / "icon-192.png")
    render(favicon, 512, OUT / "icon-512.png")
    render(maskable(favicon), 512, OUT / "icon-maskable-512.png")
    render(MONOCHROME.read_text(), 512, OUT / "icon-monochrome-512.png")
    render(EARTHRISE.read_text(), 96, OUT / "shortcut-earthrise-96.png")  # for the Earthrise shortcut


if __name__ == "__main__":
    main()
