# Carrot Pull production art

This is the production art pack for `拔萝卜 / Carrot Pull`.

The approved visual source is `reference/concept-garden.webp`. Runtime raster layers are rendered at 2× (`1120×1440`) for the logical `560×720` SVG scene. Transparent layers are real RGBA WebP files; the renderer keeps the gameplay coordinate contract and animates the production sprites through the same attachment points as the dynamic fallback.

Layer order is defined by `manifest.json` and is intentionally explicit:

`sky → clouds → hills-farm → garden-mid → soil-back → carrot → mole → girl → leaf stems → girl fists → soil-front → foreground → effects`

Runtime note (2026-09-27): `sky.webp` is already the complete painting. `clouds`, `hills-farm`, `garden-mid` and `soil-back` were exported crowded into the top third of the canvas, out of register with the same content in `sky.webp`, so the game neither draws nor preloads them (they left a ghosted fence and dirt band across the sky). Re-export those layers in register before wiring them back in.

The former `girl-hands.webp` overlay was removed: `girl-happy.webp` / `girl-oops.webp` already paint both arms with clasped fists, so stacking a second (larger) pair of arms made the girl's arms look doubled and oversized. The runtime now draws five tapered leaf stems from the carrot crown (`carrot.crown`) into her own fists (`girl.fists`), then redraws only the fists (the same girl sprite clipped to `overlayClipLocalLogicalPx`) on top so she visibly grips them.

`reference/concept-garden.webp` is a design reference only and is not loaded by the game. `layers/loading-preview.webp` is used only while critical runtime assets are being preloaded.
