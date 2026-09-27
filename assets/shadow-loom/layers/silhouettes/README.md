# Shadow Loom silhouette source

Every piece uses the shared `viewBox="0 0 480 854"`, which is the game's logical
stage coordinate system. A family can therefore be composited by drawing its
piece files without translating their local viewBoxes.

- `rabbit`, `bird`, `whale`, `deer`, `tree`, and `crane` are the six
  playable levels.
- Each family also has a `target.svg` composition proof.
- Holes are real subpaths in the same `fill-rule="evenodd"` path; there are no
  checkerboard pixels, white matte, or baked background.
- `manifest.json` is the source of truth for file names, anchors, and the
  shared coordinate contract.
- The runtime imports the same authored path data through
  `js/shadow-loom-silhouettes.js`: SVG `Path2D` renders the paper and the
  paired polygon contours drive the target, shadow, and judge.
