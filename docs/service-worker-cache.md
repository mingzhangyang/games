# Service Worker cache lifecycle (v3)

## Decision (2026-10-18)

Use **content-addressed build generations**, **deferred activation**, and **one previous
cache generation**. Avoid an incremental per-asset prune with a hand-maintained
manifest: it cannot reliably discover lazy chunks/assets referenced by a still-open
old page, and deleting these can break that page when it goes offline. The same
problem applies to deleting every old cache on activate when skipWaiting() is
used. Keeping all historic generations also fails the storage budget.

- Vite closeBundle stamps dist/sw.js with the SHA-256 digest (16 hex chars)
  of emitted files (excluding sw.js). The digest covers unhashed public
  assets too. Identical output has an identical ID; no timestamps or git SHA.
- Install pre-caches /, /index.html, and the JS/CSS dependencies referenced
  by the built homepage, plus the homepage SVG sprite. The install fails without
  replacing the active worker if any critical resource is unavailable.
- **No skipWaiting() on updates**: the old worker and its hashed assets remain
  available while any client controlled by it is open. Once these clients close,
  the browser activates the prepared worker.
- On activation retain **current + one previous** games-cache-v3-*/legacy
  games-cache-v2 cache, deleting older Games caches only. Never delete caches
  not owned by Games. The legacy games-cache-v2 is retained for at most one
  activation as an offline fallback, then removed in the next generation.
- Navigation uses network-first, falling back to the current cache, then the
  previous cache, then the homepage. Success responses for HTML navigations
  are stored using their pathname to avoid growth from query strings.
- Static JS/CSS/images/fonts/JSON are served from the **current** cache first;
  the current generation's cached content is never silently rewritten. When the current cache misses, network is
  tried first and the previous generation is used **only on network failure**,
  avoiding stale cross-release assets while online. Query-bearing asset and
  ranged requests bypass caching; non-GET and cross-origin requests bypass SW.
- SW only manipulates its own Cache Storage. It never writes or deletes
  localStorage, IndexedDB, GameStorage keys, pending leaderboard scores,
  user settings or cookies. Remote score/analytics workers remain un-intercepted.

## Bounds and limits

The cache bound is **two deployment generations**, not a byte-quota. Within a
build, only static asset paths listed in that exact build's output manifest
can enter its cache, and successful navigation cache keys are normalized to
pathnames. A very long-lived tab may still delay activation and pruning.
Only successfully fetched resources are stored. The old v2 cache may initially be large and remains available as a
fallback for one transition; the next activation removes it. A continuously
open old tab can defer activation/cleanup indefinitely by design, rather than
silently losing code/assets underneath a running game. Browser quota eviction
remains browser-controlled; Cache Storage is not a backup for game saves.

The homepage gets a first-install offline shell. A game is available offline
once its HTML, JS and necessary assets have been requested through an active
worker while online. After one update it can still use previous-generation
entries; if never revisited online, it can become unavailable after *further*
updates. This is an intentional fixed-retention trade-off, not an offline
promise for every never-visited game. A custom offline-pinned asset manifest
would be a separate feature.

## Verification

- node tests/verify-service-worker-stamp.mjs tests stamp determinism,
  unhashed-file invalidation, dependency collection and broken references.
- npm run build && node tests/verify-service-worker.mjs runs a **real Service
  Worker** in Chromium (no bypass), using successive distinct deploys on the
  same origin. It inspects Cache Storage after each update: legacy v2 growth,
  first install, home and game offline navigation, old tab waiting, two-generation
  pruning after three releases, failed precache/install, rollback and local
  save/settings/pending-score preservation. CI discovers it in the browser shard.
- The browser test uses an HTTP fixture generated from the **same SW source and
  stamp renderer** as production; it also loads the built homepage and SW from
  dist/ and checks an offline refresh.

### Staging manual QA (not covered by Chromium automation)

On both games.orangely.xyz and game.orangely.xyz, test iOS Safari and Android
Chrome with persistent profiles. Open an existing game, leave it running, deploy
an update and check the waiting worker; return to play (online/offline) and
close all old tabs before validating activation and Cache Storage cleanup.
Navigate to a recently visited game offline, restart the browser in airplane
mode, then reconnect to confirm fresh content. Repeat a deploy and rollback,
including low-storage conditions. Verify representative saved levels/high
scores, pending score retry entries, language/theme/sound preferences and
standalone installed PWA behavior. Watch Web Inspector/DevTools storage quota
and eviction warnings. Do not clear site data as part of this procedure.
