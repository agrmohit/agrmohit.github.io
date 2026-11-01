# /// script
# requires-python = "==3.15.*"
# dependencies = ["fonttools==4.66.1"]
# ///
"""Writes Jost-500-Medium.ttf with its single-storey a as the default to stdout. Run with -h for usage.

The cards' renderer, satori, can't turn OpenType features on, so Jost's stylistic set 1 (a for a.alt, accents
included: Futura's round a) is baked into the character map instead. The source font comes from
github.com/indestructible-type/Jost at 814c58001f052904102a631b9cff92b4e522fb15. The build reads the
committed Jost-500-Medium-a.ttf and never runs this; it shows the patch is reproducible:
uv run --script tools/fonts/patch-jost.py | cmp - tools/fonts/Jost-500-Medium-a.ttf
"""

import argparse
import io
import sys
from pathlib import Path

from fontTools.ttLib import TTFont

SOURCE = Path(__file__).with_name("Jost-500-Medium.ttf")


def single_storey_a(font):
    """Points every character that ss01 would swap straight at its alternate glyph."""
    gsub = font["GSUB"].table
    swap = {}
    for record in gsub.FeatureList.FeatureRecord:
        if record.FeatureTag != "ss01":
            continue
        for index in record.Feature.LookupListIndex:
            for subtable in gsub.LookupList.Lookup[index].SubTable:
                swap.update(getattr(subtable, "ExtSubTable", subtable).mapping)
    if swap.get("a") != "a.alt":
        raise SystemExit(f"{SOURCE.name} changed: expected ss01 to swap a for a.alt, got {swap.get('a')!r}")
    for table in font["cmap"].tables:
        for code, glyph in list(table.cmap.items()):
            if glyph in swap:
                table.cmap[code] = swap[glyph]


def main():
    argparse.ArgumentParser(description=__doc__.splitlines()[0]).parse_args()
    # no timestamp: saving would otherwise stamp the time into the font's head table
    font = TTFont(SOURCE, recalcTimestamp=False)
    single_storey_a(font)
    out = io.BytesIO()
    font.save(out)
    sys.stdout.buffer.write(out.getvalue())


if __name__ == "__main__":
    main()
