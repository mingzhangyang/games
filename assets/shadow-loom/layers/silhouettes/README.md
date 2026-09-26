# Shadow Loom silhouette pieces

Each SVG is one independently movable paper piece. The files contain only paths on a
transparent SVG canvas; there is no painted background and no baked colour. Apply a
runtime colour through `currentColor`, then use the same projected geometry for the
visible shadow and the level mask.

The initial asset set covers five target families from the visual direction:

- `rabbit/` — three pieces for the first fixed-lamp teaching level;
- `bird/` — three pieces for the first depth/parallax level;
- `tree/` — three pieces for rotation and branch alignment;
- `pagoda/` — mountain, pavilion and moon pieces;
- `koi/` — body, fins and tail pieces.

`manifest.json` is the authoritative list of pieces and the rendering contract.
