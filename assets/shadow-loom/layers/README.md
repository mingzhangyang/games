# Shadow Loom layered art

These are production layers for the portrait game stage, not a concept-sheet export.
Every full-canvas layer is normalized to **1080 × 1920 px** so the renderer can draw
each file at `(0, 0)` without guessing offsets. The `paperWindow` and object bounds in
`manifest.json` are the shared coordinate contract for the game implementation.

## Files

| File | Role | Alpha |
| --- | --- | --- |
| `stage-background.webp` | dark room, side shelves and restrained bokeh | no |
| `paper-frame.webp` | carved walnut frame, vines and flowers; the window is empty | yes |
| `desk-back.webp` | desk surface and rear props behind the lamp | yes |
| `foreground.webp` | books, cards, plant and petals in front of the lamp | yes |
| `lamp-base.webp` | bronze base and stem | yes |
| `lamp-glass.webp` | clear glass chimney | yes |
| `lamp-shade.webp` | amber paper shade; the flame is intentionally absent | yes |
| `paper-fiber-tile.webp` | opaque 1254 × 1254 tileable handmade-paper texture | no |

## Compositing order

Draw the layers in ascending `z` order from `manifest.json`. Paint the paper texture
inside `paperWindow` in the frame before drawing projected shadows. The lamp flame is a
runtime effect and should be inserted through `flameSlot`; do not bake it into the
shade asset.

Transparent WebP layers were exported with an actual RGBA channel. There is no
checkerboard pattern baked into any layer.

The `silhouettes/` subdirectory is part of this same asset drop. It contains one
uncoloured, transparent SVG per movable paper piece, with its family and level mapping
in `silhouettes/manifest.json`.
