# Carrot Pull production art

This is the production art pack for `拔萝卜 / Carrot Pull`.

The approved visual source is `reference/concept-garden.webp`. Runtime raster layers are rendered at 2× (`1120×1440`) for the logical `560×720` SVG scene. Transparent layers are real RGBA WebP files; the renderer keeps the gameplay coordinate contract and animates the production sprites through the same attachment points as the dynamic fallback.

Layer order is defined by `manifest.json` and is intentionally explicit:

`sky → clouds → hills-farm → garden-mid → soil-back → carrot → mole → stems/characters → soil-front → foreground → effects`

`reference/concept-garden.webp` is a design reference only and is not loaded by the game. `layers/loading-preview.webp` is used only while critical runtime assets are being preloaded.
