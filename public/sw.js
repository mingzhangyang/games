/* Service Worker — Mini Games Collection
 * Navigation: network first, offline fallback to the current/previous cache.
 * Static assets: immutable cache-first within the current build.
 * The previous build is an offline-only fallback (never serve its assets when online).
 * Other origins, non-GET requests and ranged responses are untouched.
 *
 * Build stamp and precache list are injected by tools/build/service-worker-cache.mjs.
 */

const BUILD = '__GAMES_BUILD_ID__';
const CACHE_PREFIX = 'games-cache-v3-';
const CACHE = `${CACHE_PREFIX}${BUILD}`;
const LEGACY_CACHE = 'games-cache-v2';
const PRECACHE = /* __GAMES_PRECACHE__ */ ['/'];
const BUILD_ASSETS = new Set(/* __GAMES_ASSETS__ */ []);
const ASSET_RE = /\.(css|js|mjs|png|svg|jpg|jpeg|webp|ico|json|woff2?)$/i;

function isOwnedCache(name) {
    return name === LEGACY_CACHE || name.startsWith(CACHE_PREFIX);
}

async function matchPrevious(request) {
    // CacheStorage key iteration is insertion-ordered. Search newest first, never
    // consult unrelated caches from another app sharing this origin.
    const names = (await caches.keys()).filter(name => isOwnedCache(name) && name !== CACHE);
    for (const name of names.reverse()) {
        const response = await (await caches.open(name)).match(request, { ignoreSearch: true });
        if (response) return response;
    }
    return undefined;
}

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const existed = (await caches.keys()).includes(CACHE);
        try {
            const cache = await caches.open(CACHE);
            // An incomplete precache must NOT replace a working offline version.
            await cache.addAll(PRECACHE);
        } catch (error) {
            if (!existed) await caches.delete(CACHE);
            throw error;
        }
    })());
    // Intentionally no skipWaiting(): old tabs keep their old controller and
    // hashed asset set until they close, including during an offline update.
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const names = (await caches.keys()).filter(isOwnedCache);
        // Exactly two generations: current + most recently created predecessor.
        // Keeping one predecessor preserves offline visits across one deployment.
        const older = names.filter(name => name !== CACHE);
        const previous = older[older.length - 1];
        await Promise.all(names.filter(name => name !== CACHE && name !== previous)
            .map(name => caches.delete(name)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET' || request.headers.has('range')) return;
    let url;
    try { url = new URL(request.url); } catch { return; }
    if (url.origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
        const path = url.pathname;
        // Normalise navigation queries: URLs like /?cat=x must not add unlimited
        // cache entries. Never cache arbitrary API/redirect navigations.
        const key = path === '/' || path.endsWith('.html') ? path : null;
        event.respondWith((async () => {
            const cache = await caches.open(CACHE);
            try {
                const response = await fetch(request);
                if (key && response.ok && response.type === 'basic') {
                    event.waitUntil(cache.put(key, response.clone()).catch(() => {}));
                }
                return response;
            } catch {
                if (key) {
                    const exact = await cache.match(key) || await matchPrevious(key);
                    if (exact) return exact;
                }
                return await cache.match('/') || await matchPrevious('/') || Response.error();
            }
        })());
        return;
    }

    // Query-dependent assets may not be equivalent. Do not cache them under
    // ever-changing query-string keys or silently collapse distinct responses.
    if (!ASSET_RE.test(url.pathname) || url.search || !BUILD_ASSETS.has(url.pathname)) return;
    event.respondWith((async () => {
        const cache = await caches.open(CACHE);
        const current = await cache.match(request);
        // Do not overwrite old-build CSS/JS while the next SW is waiting.
        if (current) return current;
        try {
            const fresh = await fetch(request);
            if (fresh.ok && fresh.type === 'basic') {
                event.waitUntil(cache.put(request, fresh.clone()).catch(() => {}));
            }
            return fresh;
        } catch {
            return await matchPrevious(request) || Response.error();
        }
    })());
});
