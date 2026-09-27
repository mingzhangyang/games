# Shadow Loom silhouette source

Every piece uses the shared `viewBox="0 0 480 854"`, the game's logical stage coordinate system. A family can therefore be composited by drawing its piece files without translating their local viewBoxes.

The supplied reference image contains five bottom paper-cut motifs: rabbit, flying bird, flowering tree, moonlit pagoda, and koi. Those five families are traced from the raster reference with smooth cubic Bézier contours. Decorative cutouts are real subpaths in the same `fill-rule="evenodd"` path; there is no checkerboard, white matte, `<rect>`, or baked background.

- All eight playable families (`rabbit`, `bird`, `whale`, `deer`, `pagoda`, `tree`, `koi`, and `crane`) are wired through `js/shadow-loom-silhouettes.js`; the SVG path and judge contour data share the same coordinates and anchors.
- Playable paper pieces are natural, non-containing partitions of their target: rabbit is split into ears, head, body, and grass; whale into body, fin, and tail; deer into body, neck, and antlers; pagoda into moon, pavilion, and mountain; koi into head, body (with the dorsal fin), fins, and tail; crane into body, neck, wings, and legs. Shared boundaries may touch, but one piece does not carry another piece's silhouette.
- `pagoda` and `koi` targets were scaled up (×1.3 / ×1.45 about their centre) to match the other levels' size in the paper window; their pieces were drawn as coarse region hints and cut from the target with the re-cut tool below.
- `whale`, `deer`, and `crane` use the generated original paper-cut references in `references/` and their production SVGs are cubic Bézier traces of those references, not procedural fallback geometry.
- `manifest.json` is the source of truth for the shared coordinate contract, anchors, provenance, and family file names.

Pieces must be a smooth partition of `target.svg`. If a family's pieces were split on a coarse raster (stair-stepped edges or cut lines), re-cut them with `node scripts/shadow-loom-recut-pieces.mjs <family>` (`--dry` to preview, `--overlap=<px>` to tighten a long seam — koi uses 0.35). It keeps the old pieces only as a partition hint: blurred label fields give smooth cut lines, each piece is target ∩ its region traced at sub-pixel precision, and each piece reaches 0.5px under the later pieces so the shared seam does not anti-alias into a light hairline. The rabbit, pagoda, and koi pieces were cut this way; to re-partition a family, overwrite its piece SVGs with rough region polygons first — they only need to say which piece owns which area.

Run `npm run build:shadow-loom-silhouettes` after editing an SVG, and
`npm run check:shadow-loom-silhouettes` to prove the generated runtime cache is synchronized.
The generator also unions overlapping same-piece outer contours before writing the runtime cache, so evenodd Path2D rendering and judge polygons do not disagree.

SVG 的 `d` 路径保留原画中的全部镂空；运行时配套的低分辨率 judge contour 只保留结构性孔洞，避免 4px 判定网格把花纹细孔误当成拖拽边界。
