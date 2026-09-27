/**
 * Silkfall production art loader.
 *
 * The physics world stays authoritative. These assets only provide the layered
 * night-garden shell and a vessel illustration aligned to logical geometry.
 */
export const SILK_DEW_MANIFEST = {
    version: 2,
    format: 'svg',
    coordinateSystem: { width: 480, height: 640 },
    layers: [
        { id: 'sky', file: 'layers/sky.svg', z: 0 },
        { id: 'moon-mountains', file: 'layers/moon-mountains.svg', z: 10 },
        { id: 'garden-back', file: 'layers/garden-back.svg', z: 20 },
        { id: 'garden-mid', file: 'layers/garden-mid.svg', z: 30 },
        { id: 'garden-mid-lit', file: 'layers/garden-mid-lit.svg', z: 31 },
        { id: 'foreground', file: 'layers/foreground.svg', z: 90 },
        { id: 'foreground-lit', file: 'layers/foreground-lit.svg', z: 91 },
    ],
    props: {
        'jade-vessel': {
            file: 'props/jade-vessel.svg',
            viewBox: [0, 0, 128, 100],
            mouthAnchor: [64, 23],
            mouthUnits: 92,
            logicalMouthWidth: 91,
            logicalBodyHeight: 76,
        },
    },
    support: {
        reference: 'reference/concept-night-garden.svg',
        fallback: 'layers/fallback.svg',
    },
    runtimeBudgetBytes: { ideal: 350000, hard: 524288 },
};

const ART_LOAD_TIMEOUT_MS = 8000;

// Keep every production URL statically analyzable so Vite rewrites/copies the
// asset correctly when import.meta.url moves into dist/assets/js.
export const ART_URLS = Object.freeze({
    sky: new URL('../assets/silk-dew/layers/sky.svg', import.meta.url).href,
    'moon-mountains': new URL('../assets/silk-dew/layers/moon-mountains.svg', import.meta.url).href,
    'garden-back': new URL('../assets/silk-dew/layers/garden-back.svg', import.meta.url).href,
    'garden-mid': new URL('../assets/silk-dew/layers/garden-mid.svg', import.meta.url).href,
    'garden-mid-lit': new URL('../assets/silk-dew/layers/garden-mid-lit.svg', import.meta.url).href,
    foreground: new URL('../assets/silk-dew/layers/foreground.svg', import.meta.url).href,
    'foreground-lit': new URL('../assets/silk-dew/layers/foreground-lit.svg', import.meta.url).href,
    'jade-vessel': new URL('../assets/silk-dew/props/jade-vessel.svg', import.meta.url).href,
    fallback: new URL('../assets/silk-dew/layers/fallback.svg', import.meta.url).href,
});

function loadImage(url, timeoutMs = ART_LOAD_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        let settled = false;
        const finish = (fn, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            img.onload = null;
            img.onerror = null;
            fn(value);
        };
        const timer = setTimeout(() => {
            finish(reject, new Error(`Silkfall art timed out after ${timeoutMs}ms: ${url}`));
            // Stop a request that may still be pending after the state has fallen back.
            img.src = '';
        }, timeoutMs);
        img.decoding = 'async';
        img.onload = () => finish(resolve, img);
        img.onerror = () => finish(reject, new Error(`Silkfall art failed to load: ${url}`));
        img.src = url;
    });
}

export function loadSilkDewArt({ onReady, onFallback } = {}) {
    const artState = { status: 'loading', layers: {}, props: {}, fallback: null, error: null, ready: null };
    loadImage(ART_URLS.fallback).then(img => { artState.fallback = img; }).catch(() => {});
    const entries = SILK_DEW_MANIFEST.layers.map(layer => [layer.id, ART_URLS[layer.id]]);
    artState.ready = Promise.all([
        ...entries.map(([id, url]) => loadImage(url).then(img => { artState.layers[id] = img; })),
        loadImage(ART_URLS['jade-vessel']).then(img => { artState.props['jade-vessel'] = img; }),
    ]).then(() => {
        artState.status = 'ready';
        if (typeof onReady === 'function') onReady(artState);
        return artState;
    }).catch(error => {
        artState.status = 'fallback';
        artState.error = error;
        if (typeof onFallback === 'function') onFallback(error, artState);
        return artState;
    });
    return artState;
}
