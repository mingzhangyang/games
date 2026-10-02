// 源码 smoke 直接由浏览器加载 ES module，不依赖 Vite 的 JSON import 转译。
// 这份轻量契约副本只承担运行时坐标与资源索引；完整字段仍由 assets/needle-awn/manifest.json
// 的 verifier 校验，修改资源时必须同步更新两处。
const manifest = Object.freeze({
    version: 1,
    coordinateSystem: Object.freeze({ width: 480, height: 640, rasterScale: 2 }),
    layers: Object.freeze([
        Object.freeze({ id: 'sky-ink', file: 'layers/sky-ink.webp', z: 10, alphaRequired: false }),
        Object.freeze({ id: 'mountains', file: 'layers/mountains.webp', z: 20, alphaRequired: true }),
        Object.freeze({ id: 'mist', file: 'layers/mist.webp', z: 30, alphaRequired: true }),
        Object.freeze({ id: 'arena-floor', file: 'layers/arena-floor.webp', z: 40, alphaRequired: true }),
        Object.freeze({ id: 'foreground', file: 'layers/foreground.webp', z: 90, alphaRequired: true }),
    ]),
    bosses: Object.freeze({
        needle_sovereign: Object.freeze({ file: 'bosses/needle-sovereign.webp', localRectLogicalPx: [-48, -48, 96, 96], pivotLocalLogicalPx: [0, 0] }),
        awn_emperor: Object.freeze({ file: 'bosses/awn-emperor.webp', localRectLogicalPx: [-48, -48, 96, 96], pivotLocalLogicalPx: [0, 0] }),
        grandmaster: Object.freeze({ file: 'bosses/grandmaster.webp', localRectLogicalPx: [-48, -48, 96, 96], pivotLocalLogicalPx: [0, 0] }),
    }),
    support: Object.freeze({
        reference: 'reference/concept-arena.webp',
        fallback: 'layers/fallback.webp',
    }),
    dynamicZ: Object.freeze({ bullets: 50, enemies: 60, boss: 70, players: 80, particles: 100, foreground: 110, debugHitbox: 120 }),
    runtimeBudgetBytes: Object.freeze({ ideal: 2097152, hard: 2936012 }),
});

export { manifest as NEEDLE_AWN_MANIFEST };

export const ART_UI = Object.freeze({
    stanceNeedle: new URL('../../../../assets/needle-awn/ui/stance-needle.svg', import.meta.url).href,
    stanceAwn: new URL('../../../../assets/needle-awn/ui/stance-awn.svg', import.meta.url).href,
    lotusMark: new URL('../../../../assets/needle-awn/ui/lotus-mark.svg', import.meta.url).href,
});

const ART_UI_ATTRIBUTE_KEYS = Object.freeze({
    'stance-needle': 'stanceNeedle',
    'stance-awn': 'stanceAwn',
    'lotus-mark': 'lotusMark',
});

export const ART_URLS = Object.freeze({
    // 保持显式 new URL：Vite 只能可靠地把静态资源路径复制进 dist，不能推断模板字符串路径。
    layers: Object.freeze({
        'sky-ink': new URL('../../../../assets/needle-awn/layers/sky-ink.webp', import.meta.url).href,
        mountains: new URL('../../../../assets/needle-awn/layers/mountains.webp', import.meta.url).href,
        mist: new URL('../../../../assets/needle-awn/layers/mist.webp', import.meta.url).href,
        'arena-floor': new URL('../../../../assets/needle-awn/layers/arena-floor.webp', import.meta.url).href,
        foreground: new URL('../../../../assets/needle-awn/layers/foreground.webp', import.meta.url).href,
    }),
    bosses: Object.freeze({
        needle_sovereign: new URL('../../../../assets/needle-awn/bosses/needle-sovereign.webp', import.meta.url).href,
        awn_emperor: new URL('../../../../assets/needle-awn/bosses/awn-emperor.webp', import.meta.url).href,
        grandmaster: new URL('../../../../assets/needle-awn/bosses/grandmaster.webp', import.meta.url).href,
    }),
    fallback: new URL('../../../../assets/needle-awn/layers/fallback.webp', import.meta.url).href,
    reference: new URL('../../../../assets/needle-awn/reference/concept-arena.webp', import.meta.url).href,
    ui: ART_UI,
});

const CRITICAL_URLS = Object.freeze([
    ...Object.values(ART_URLS.layers),
    ...Object.values(ART_URLS.bosses),
    ...Object.values(ART_UI),
]);
const ART_LOAD_TIMEOUT_MS = 8000;
const ART_FALLBACK_TIMEOUT_MS = 2500;

function loadImage(src) {
    return new Promise((resolve, reject) => {
        if (typeof Image === 'undefined') {
            reject(new Error('Image API unavailable'));
            return;
        }
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Needle Awn art failed to load: ${src}`));
        image.src = src;
    });
}

function withTimeout(promise, timeoutMs) {
    let timeoutId;
    const timeout = new Promise((resolve, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error(`Needle Awn art timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

function callSafely(callback, ...args) {
    try {
        callback?.(...args);
    } catch {
        // A visual asset must never take down the game loop.
    }
}

function setImageSource(node, src) {
    if (!node || !src) return;
    node.setAttribute('src', src);
}

function setArtUiSources() {
    document.querySelectorAll('[data-art-ui]').forEach((node) => {
        const key = ART_UI_ATTRIBUTE_KEYS[node.getAttribute('data-art-ui')];
        setImageSource(node, ART_UI[key]);
    });
}

function makeImageMap(images, urls) {
    return Object.fromEntries(Object.entries(urls).map(([id, src]) => [id, images.get(src)]));
}

export function loadNeedleAwnArt({
    stage = document.getElementById('na-stage'),
    onReady = () => {},
    onFallback = () => {},
} = {}) {
    if (stage) stage.dataset.artState = 'loading';
    setArtUiSources();

    const fallbackPromise = withTimeout(loadImage(ART_URLS.fallback), ART_FALLBACK_TIMEOUT_MS).catch(() => null);
    const sources = [...CRITICAL_URLS];
    return withTimeout(Promise.all(sources.map(src => loadImage(src))), ART_LOAD_TIMEOUT_MS)
        .then((loaded) => {
            const images = new Map(sources.map((src, index) => [src, loaded[index]]));
            return fallbackPromise.then(fallback => {
                const art = {
                    layers: makeImageMap(images, ART_URLS.layers),
                    bosses: makeImageMap(images, ART_URLS.bosses),
                    ui: ART_UI,
                    fallback,
                    manifest,
                };
                if (stage) stage.dataset.artState = 'ready';
                callSafely(onReady, art);
                return { state: 'ready', art };
            });
        })
        .catch((error) => fallbackPromise.then((fallback) => {
            if (stage) stage.dataset.artState = 'fallback';
            const art = {
                layers: {},
                bosses: {},
                ui: ART_UI,
                fallback,
                manifest,
            };
            callSafely(onFallback, error, art);
            return { state: 'fallback', art, error };
        }));
}
