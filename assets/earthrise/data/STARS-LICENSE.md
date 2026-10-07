# Star data

`stars-bright.bin` and `stars-faint.bin` are derived from the
[HYG Database](https://github.com/astronexus/HYG-Database) v4.1 by David Nash (astronexus),
licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). These derived
files are shared under the same license.

Changes: stars to visual magnitude 8.0, the Sun removed, positions converted from J2000
equatorial to J2000 ecliptic coordinates and quantised. Each star is 6 bytes, little-endian:
ecliptic longitude (uint16, 360/65536 degrees), ecliptic latitude (int16, 90/32767 degrees),
magnitude (uint8, value / 25 - 2) and B-V colour index (int8, value / 60). Brightest first;
`stars-bright.bin` holds magnitude 6.5 and brighter.

`stars-ecliptic.bin` holds the stars of `stars-bright.bin` within 12 degrees of the
ecliptic, in the same format and order, for the home page, whose narrow field never
strays further from it.
