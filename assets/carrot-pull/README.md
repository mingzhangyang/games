# Carrot Pull production art

This is the production art pack for `拔萝卜 / Carrot Pull`.

The approved visual source is `reference/concept-garden.webp`. Runtime raster layers are rendered at 2× (`1120×1440`) for the logical `560×720` SVG scene. Transparent layers are real RGBA WebP files; the renderer keeps the gameplay coordinate contract and animates the production sprites through the same attachment points as the dynamic fallback.

Layer order is defined by the `z` values in `manifest.json` and is intentionally explicit. The production scene currently draws, bottom to top:

`sky → mole → leaf stems → carrot → girl → girl fists → soil-front → foreground → particles → tug lines`

`scripts/verify-carrot-pull-art.mjs` fails if that draw order stops following manifest `z` or if the scene draws anything without a `z`. The manifest also registers `clouds` (20), `hills-farm` (30), `garden-mid` (40) and `soil-back` (45) between the sky and the mole, but they are not drawn at the moment (see the runtime note below).

Runtime note (2026-09-27): `sky.webp` is already the complete painting. `clouds`, `hills-farm`, `garden-mid` and `soil-back` were exported crowded into the top third of the canvas, out of register with the same content in `sky.webp`, so the game neither draws nor preloads them (they left a ghosted fence and dirt band across the sky). Re-export those layers in register before wiring them back in.

The former `girl-hands.webp` overlay was removed: `girl-happy.webp` / `girl-oops.webp` already paint both arms with clasped fists, so stacking a second (larger) pair of arms made the girl's arms look doubled and oversized. The runtime now draws five tapered leaf stems from the carrot crown (`carrot.crown`) into her own fists (`girl.fists`) underneath the carrot, so they disappear into its leaves; the girl stands with her fists in those leaves, and her fists alone are redrawn on top (the same girl sprite clipped to `overlayClipLocalLogicalPx`) so she visibly grips them.

`reference/concept-garden.webp` is a design reference only and is not loaded by the game. `layers/loading-preview.webp` is used only while critical runtime assets are being preloaded.
