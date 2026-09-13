/* Service Worker — Mini Games Collection
 * 策略：页面导航网络优先（保证更新及时，离线回退缓存）；
 * 静态资源（css/js/图片/字体/题库 json）缓存优先 + 后台刷新。
 * 非 GET、跨域请求（各游戏 Worker 的榜单/统计）一律不拦截。
 */

const CACHE = 'games-cache-v1';
const ASSET_RE = /\.(css|js|mjs|png|svg|jpg|jpeg|webp|ico|json|woff2?)$/i;

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    let url;
    try {
        url = new URL(req.url);
    } catch (e) {
        return;
    }
    if (url.origin !== self.location.origin) return;

    // 页面导航：网络优先，离线回退到缓存（再退到首页）
    if (req.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const fresh = await fetch(req);
                const cache = await caches.open(CACHE);
                cache.put(req, fresh.clone());
                return fresh;
            } catch (e) {
                const cached = await caches.match(req);
                if (cached) return cached;
                const home = await caches.match('/');
                return home || Response.error();
            }
        })());
        return;
    }

    // 静态资源：缓存优先 + 后台更新
    if (ASSET_RE.test(url.pathname)) {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE);
            const cached = await cache.match(req);
            const network = fetch(req).then((res) => {
                if (res && res.ok) cache.put(req, res.clone());
                return res;
            }).catch(() => null);
            if (cached) {
                event.waitUntil(network);
                return cached;
            }
            const fresh = await network;
            return fresh || Response.error();
        })());
    }
});
