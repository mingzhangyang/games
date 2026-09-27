# Shadow Loom silhouette source

Every piece uses the shared `viewBox="0 0 480 854"`, the game's logical stage coordinate system. A family can therefore be composited by drawing its piece files without translating their local viewBoxes.

The supplied reference image contains five bottom paper-cut motifs: rabbit, flying bird, flowering tree, moonlit pagoda, and koi. Those five families are traced from the raster reference with smooth cubic Bézier contours. Decorative cutouts are real subpaths in the same `fill-rule="evenodd"` path; there is no checkerboard, white matte, `<rect>`, or baked background.

- `rabbit`, `bird`, and `tree` are wired into the current playable levels through `js/shadow-loom-silhouettes.js`; the SVG path and the judge contour data share the same coordinates and anchors.
- `pagoda` and `koi` are complete traced reference families with target compositions, ready for a matching level mapping.
- `whale`, `deer`, and `crane` remain the existing procedural fallback families because the supplied source image has no matching original art for them; they are not mislabeled as traced.
- `manifest.json` is the source of truth for the shared coordinate contract, anchors, provenance, and family file names.

SVG 的 `d` 路径保留原画中的全部镂空；运行时配套的低分辨率 judge contour 只保留结构性孔洞，避免 4px 判定网格把花纹细孔误当成拖拽边界。
