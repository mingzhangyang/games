# Magnetic Garden artwork

Two original decorative illustrations made for Magnetic Garden with the built-in OpenAI image generation tool. The repository retains WebP artwork at quality 88 with no resizing or color alteration; generation-source hashes are recorded in the manifest. All images are opaque RGB.

| Asset | Dimensions | Bytes | Use |
| --- | --- | ---: | --- |
| `greenhouse-hero.webp` | 1536 × 1024 (3:2) | 317,734 | Menu greenhouse scene; safe at 16:9 with `object-position: center 65%` |
| `greenhouse-workbench.webp` | 1024 × 1536 (2:3) | 148,776 | Low-contrast play-area perimeter; the central cream surface remains quiet |

Combined runtime artwork: **466,510 bytes**. PNG generation masters are local authoring intermediates; the game only requests the WebP artwork.

The hero also has two center-cropped distribution derivatives: `public/assets/home-covers/magnetic-garden.webp` (640 × 360, 81,812 bytes) and `public/assets/seo/og-magnetic-garden.jpg` (1200 × 630, 212,898 bytes). Both crops keep the coral and blue magnets visible.

The artwork is decorative: puzzle cells, seed pieces, magnet poles, previews, controls, and all rule-relevant information remain SVG/DOM. Retain the menu's vector fallback while the raster hero loads or if it fails. The workbench is intended as a subtle texture beneath the board; theme-specific overlays can reduce its contrast.

Exact generation prompts, source hashes, and derivative details are recorded in `manifest.json`. No external stock assets were used.
