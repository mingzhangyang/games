# Service Worker cache lifecycle (v3)

## Decision (2026-10-18)

Use **content-addressed build generations**, **deferred activation**, and
**current-generation-only caching**. No old generation remains after activation.
Avoid an incremental per-asset prune with a hand-maintained manifest: it cannot
reliably discover lazy chunks/assets referenced by a still-open old page, and
deleting these can break that page when it goes offline. Deleting caches on
`install` is equally unsafe. Without `skipWaiting()`, an old worker keeps
controlling its open tabs until they close, allowing `activate` to remove all
superseded Games caches safely.

- Vite closeBundle stamps dist/sw.js with the SHA-256 digest (16 hex chars)
  of emitted files (excluding sw.js). The digest covers unhashed public
  assets too. Identical output has an identical ID; no timestamps or git SHA.
  Every emitted HTML document gets a matching `games-build` meta marker;
  the marker is ignored when hashing so re-stamping is deterministic.
  The generated SW also embeds the exact set of emitted HTML routes.
- Install pre-caches /, /index.html, and the JS/CSS dependencies referenced
  by the built homepage, plus the homepage SVG sprite. Native `cache.addAll`
  fetches/stores each resource once, then the install verifies those **exact
  cached responses** before the worker can activate: both homepage URLs must
  have this worker's `games-build` ID and assets must not be HTML fallbacks.
  There is no duplicate validation fetch that could race a deployment.
  Installation always checks precache completeness even if the named cache
  exists: an interrupted attempt can leave it empty or partially populated.
  Only missing or invalid entries are repaired via `addAll`; previously valid
  HTML/assets remain unchanged. Then **all** cached responses are revalidated
  before activation. A new failed staging cache is removed, while a previously
  existing same-ID cache is retained for safe retry without disturbing any
  active version. The next online install can self-heal an incomplete cache.
- **No skipWaiting() on updates**: the old worker and its hashed assets remain
  available while any client controlled by it is open. Once these clients close,
  the browser activates the prepared worker.
- On activation keep **only the current cache**, deleting all other Games
  generations, including the original `games-cache-v2` immediately. Never
  delete caches not owned by Games. No previous-build offline fallback.
- Navigation uses network-first, falling back to the current cache, then its
  cached homepage. Both `/game.html` and Cloudflare's extensionless `/game`
  redirect use the same canonical cache key from the built route list, ignoring
  query strings. The active worker may cache HTML only when its embedded
  `games-build` marker matches its own build ID, preventing a waiting update
  from replacing an old offline document with incompatible new chunks.
- Static JS/CSS/images/fonts/JSON are served from the **current** cache first;
  that generation's cached content is never silently rewritten. On a miss,
  network is attempted; failure does **not** search any old cache. Query-bearing
  assets and ranged requests bypass caching, as do non-GET and cross-origin
  requests.
- SW only manipulates its own Cache Storage. It never writes or deletes
  localStorage, IndexedDB, GameStorage keys, pending leaderboard scores,
  user settings or cookies. Remote score/analytics workers remain un-intercepted.

## Bounds and limits

The cache bound is **one active build generation after activation**, not a
byte-quota. Within a build, only asset paths listed in that build's output
manifest can enter the cache; successful navigation keys use normalized
pathnames. Only successfully fetched resources are stored.

A new generation can be staged while an old worker still controls open tabs,
so there may be **two or more temporary caches during a prolonged update**.
The active old cache is kept until the old worker can safely relinquish those
clients; cleanup occurs on the new worker's activation and removes **every
other Games cache**. A tab left open indefinitely can intentionally defer
cleanup. Browser quota eviction remains browser-controlled; Cache Storage is
not a backup for game saves.

The homepage gets a first-install offline shell. A game is available offline
once its HTML, JS and necessary assets have been requested through the current
worker while online. **After every deployment activation, previously visited
games must be visited online again to become available offline under the new
build.** An old game page with no matching current cached HTML falls back to
the current homepage, not an old version of the game. This deliberately trades
older-game offline continuity for complete removal of obsolete caches. Never-
visited games are not promised offline support. A custom per-game offline
pinning mechanism would be a separate feature.

## Verification

- node tests/verify-service-worker-stamp.mjs tests stamp determinism,
  unhashed-file invalidation, dependency collection and broken references.
- node tests/verify-service-worker.mjs runs **real Chromium Service Worker**
  fixture lifecycle tests without requiring `dist/`. When built output exists,
  it additionally validates the generated worker and offline homepage. If only
  one of `dist/sw.js` or `dist/index.html` is present, verification fails
  rather than silently skipping an incomplete build. CI runs the source-only
  test **before** build, then runs built-output checks in the browser shards
  after `npm run build`. The fixture tests use successive distinct deploys on the
  same origin. It inspects Cache Storage after each update: legacy v2 growth,
  first install, redirected extensionless routes, home and game offline navigation,
  old tab waiting with an online-then-offline reload, immediate deletion of old
  caches after each release, an empty cache left by interrupted installation,
  incomplete same-ID cache recovery (preserving valid entries), an all-200
  mismatched-build HTML install followed by a successful retry, an unavailable
  dependency install, rollback and local save/settings/pending-score
  preservation. CI discovers it in the browser shard.
- The browser test uses an HTTP fixture generated from the **same SW source and
  stamp renderer** as production; it also loads the built homepage and SW from
  dist/ and checks an offline refresh.

### Staging manual QA (not covered by Chromium automation)

On both games.orangely.xyz and game.orangely.xyz, test iOS Safari and Android
Chrome with persistent profiles. Open an existing game, leave it running, deploy
an update and check the waiting worker; return to play (online/offline) and
close all old tabs before validating activation and Cache Storage cleanup.
Revisit a game online after each deployment, then open it offline and restart
the browser in airplane mode; confirm pre-update game pages are not served from
old caches. Reconnect to confirm fresh content. Repeat a deploy and rollback,
including low-storage conditions. Verify representative saved levels/high
scores, pending score retry entries, language/theme/sound preferences and
standalone installed PWA behavior. Watch Web Inspector/DevTools storage quota
and eviction warnings. Do not clear site data as part of this procedure.
