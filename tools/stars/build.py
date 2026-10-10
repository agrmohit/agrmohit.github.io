#!/usr/bin/env python3
"""Build assets/earthrise/data/stars-*.bin from the HYG star database. Run with -h for usage."""

import argparse
import csv
import gzip
import hashlib
import io
import math
import struct
import sys
import urllib.request
from pathlib import Path

# HYG v4.1, pinned to the last commit that has it, since each new version would change the output
SOURCE = (
    "https://codeberg.org/astronexus/hyg/media/commit/1d394221e3c5015ffaa4871f24a7582056b5fcfd"
    "/data/hyg/CURRENT/hyg_v41.csv.gz"
)
SOURCE_SHA256 = "f0730aa031f077772fa977f13e5f72e2e1d38dc4597d5eeddddbcd527ae775ef"
OUT = Path(__file__).resolve().parents[2] / "assets/earthrise/data"

FAINTEST = 8.0  # the catalogue's limit
BRIGHT = 6.5  # about the naked-eye limit: brighter stars go in stars-bright.bin, which always loads
ECLIPTIC = 12  # degrees: stars-ecliptic.bin covers views that stay this close to the ecliptic
EPS = math.radians(23.4392911)  # J2000 mean obliquity of the ecliptic
DEFAULT_CI = 0.6  # B-V when HYG has none: a Sun-like white


def record(row):
    """One star as 6 bytes, or None if it's left out. The layout is in assets/earthrise/data/STARS-LICENSE.md."""
    if row["proper"] == "Sol" or not row["mag"]:
        return None
    mag = float(row["mag"])
    if mag > FAINTEST:
        return None
    # J2000 equatorial to J2000 ecliptic: a rotation about the x axis by the obliquity
    ra, dec = math.radians(float(row["ra"]) * 15), math.radians(float(row["dec"]))
    x, y, z = math.cos(dec) * math.cos(ra), math.cos(dec) * math.sin(ra), math.sin(dec)
    ye, ze = y * math.cos(EPS) + z * math.sin(EPS), -y * math.sin(EPS) + z * math.cos(EPS)
    lon = math.degrees(math.atan2(ye, x)) % 360
    lat = math.degrees(math.asin(max(-1, min(1, ze))))
    ci = float(row["ci"]) if row["ci"] else DEFAULT_CI
    packed = struct.pack(
        "<HhBb",
        round(lon / 360 * 65536) % 65536,  # 0.0055 degrees a step, well under a pixel at any field of view used
        round(lat / 90 * 32767),
        min(255, round((mag + 2) * 25)),  # 0.04 magnitude a step, from -2
        max(-127, min(127, round(ci * 60))),
    )
    return mag, packed


def near_ecliptic(packed):
    return abs(struct.unpack_from("<h", packed, 2)[0] / 32767 * 90) <= ECLIPTIC


def main():
    parser = argparse.ArgumentParser(
        description="Rebuild the earthrise star catalogues from HYG v4.1. The output is byte-identical every run."
    )
    parser.parse_args()

    print("downloading", SOURCE, file=sys.stderr)
    data = urllib.request.urlopen(SOURCE).read()
    if hashlib.sha256(data).hexdigest() != SOURCE_SHA256:
        sys.exit("the download doesn't match HYG v4.1's checksum")

    stars = [r for r in map(record, csv.DictReader(io.TextIOWrapper(gzip.GzipFile(fileobj=io.BytesIO(data))))) if r]
    stars.sort(key=lambda s: s[0])  # brightest first, so a reader can stop at any magnitude; ties keep HYG's order
    bright = [packed for mag, packed in stars if mag <= BRIGHT]
    faint = [packed for mag, packed in stars if mag > BRIGHT]
    files = {
        "stars-bright.bin": bright,
        "stars-faint.bin": faint,
        "stars-ecliptic.bin": [p for p in bright + faint if near_ecliptic(p)],
    }
    for name, records in files.items():
        (OUT / name).write_bytes(b"".join(records))
        print(f"{name}: {len(records)} stars, {len(records) * 6} bytes")


main()
