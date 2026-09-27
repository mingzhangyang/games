# Silkfall production art

Layered moonlit oriental-garden artwork for `silk-dew.html`. The runtime keeps the physics canvas at 480×640; these SVG plates are resolution-independent and are cached as decoded images before compositing.

The central play corridor stays deliberately quiet. `garden-mid-lit.svg` and `foreground-lit.svg` are additive light deltas revealed only through the low-resolution local light mask. Gameplay geometry remains authoritative in `js/silk-dew-levels.js`; the jade vessel artwork is aligned to, but never replaces, the logical capture area.
