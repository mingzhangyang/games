/* Service Worker — Mini Games Collection
 * Navigation: network first, offline fallback from the CURRENT cache only.
 * Static assets: immutable cache-first within the current build.
 * Old generations are deleted on activation; no retained previous version.
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
const HTML_ROUTES = new Set(/* __GAMES_HTML_ROUTES__ */ []);
const ASSET_RE = /\.(css|js|mjs|png|svg|jpg|jpeg|webp|ico|json|woff2?)$/i;

function isOwnedCache(name) {
    return name === LEGACY_CACHE || name.startsWith(CACHE_PREFIX);
}

// Cloudflare redirects /game.html to /game by default. Both URLs must share
// one cache key, and only routes emitted by this build may enter the cache.
function documentKey(pathname) {
    if (pathname === '/' || pathname === '/index' || pathname === '/index.html') return '/';
    const plain = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
    const html = plain.endsWith('.html') ? plain : `${plain}.html`;
    return HTML_ROUTES.has(html) ? html : null;
}

// An old worker can continue controlling a tab while a new release is online.
// Never replace its offline document with newer HTML pointing at missing chunks.
async function isMatchingBuildDocument(response, key) {
    try {
        if (!response.ok || response.type !== 'basic'
            || !response.headers.get('content-type')?.toLowerCase().includes('text/html')) return false;
        if (documentKey(new URL(response.url).pathname) !== key) return false;
        return (await response.clone().text())
            .includes(`<meta name="games-build" content="${BUILD}">`);
    } catch {
        return false;
    }
}

async function cacheMatchingDocument(cache, key, response) {
    if (!await isMatchingBuildDocument(response, key)) return;
    try {
        await cache.put(key, response);
    } catch {
        // Cache writes are best effort and never block the online navigation.
    }
}

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const existed = (await caches.keys()).includes(CACHE);
        try {
            // Fetch once and validate the exact responses we will cache.
            // addAll() accepts 200 HTML from a different deploy; a separate
            // validation fetch followed by addAll() would still race a deploy.
            const fetched = await Promise.all(PRECACHE.map(async path => {
                const response = await fetch(new Request(path, { cache: 'no-store' }));
                if (!response.ok || response.type !== 'basic') {
                    throw new Error(`Precache request failed: ${path}`);
                }
                const key = documentKey(path);
                if (key) {
                    if (!await isMatchingBuildDocument(response, key)) {
                        throw new Error(`Precache HTML build mismatch: ${path}`);
                    }
                } else if (response.headers.get('content-type')?.toLowerCase().includes('text/html')) {
                    throw new Error(`Precache dependency returned HTML: ${path}`);
                }
                return { path, response };
            }));
            const cache = await caches.open(CACHE);
            if (existed) {
                // A retry must not overwrite a pre-existing generation. Reuse
                // it only if the complete, correctly marked shell is present.
                for (const { path } of fetched) {
                    const saved = await cache.match(path);
                    if (!saved || (documentKey(path)
                        && !await isMatchingBuildDocument(saved, documentKey(path)))) {
                        throw new Error(`Existing precache entry missing or mismatched: ${path}`);
                    }
                }
                return;
            }
            // Never expose a partial new generation after a failed install.
            for (const { path, response } of fetched) {
                await cache.put(path, response);
            }
        } catch (error) {
            // Installation errors are otherwise easy to miss because the
            // registering page deliberately treats registration as optional.
            console.error('[games/sw] Precache install failed:', error);
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
        // Once all clients of the previous SW have closed, remove EVERY older
        // Games cache including the original unbounded games-cache-v2.
        // Do not touch caches owned by other apps on this origin.
        await Promise.all(names.filter(name => name !== CACHE)
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
        // Extensionless Cloudflare routes and .html URLs share one build-owned
        // pathname key. Query parameters never create new cache entries.
        const key = documentKey(url.pathname);
        event.respondWith((async () => {
            const cache = await caches.open(CACHE);
            try {
                const response = await fetch(request);
                if (key) {
                    event.waitUntil(cacheMatchingDocument(cache, key, response.clone()));
                }
                return response;
            } catch {
                if (key) {
                    const exact = await cache.match(key);
                    if (exact) return exact;
                }
                return await cache.match('/') || Response.error();
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
            return Response.error();
        }
    })());
});
