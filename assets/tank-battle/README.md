# Tank Battle production art

This pack is a small, authored SVG atlas for the 800x600 Tank Battle world.

- terrain/ removes the black grid as the primary visual and supplies a matte grass-and-earth battlefield.
- tiles/ keeps brick, steel, and boundary walls readable at the 20px collision tile size.
- tanks/ contains transparent north-facing silhouettes; runtime rotation follows the existing four-direction integer.
- powerups/ replaces emoji with shape-coded icons.
- ui/ keeps the minimap, weapon display, and landscape prompt in one visual language.

The art loader uses literal new URL(..., import.meta.url) references so Vite and the raw static server resolve the same files. Every asset has a procedural/program fallback; gameplay remains available if the pack fails to load.
