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

const ART_ROOT = new URL('../assets/silk-dew/', import.meta.url);
export const ART_URLS = Object.fromEntries([
    ...SILK_DEW_MANIFEST.layers.map(layer => [layer.id, new URL(layer.file, ART_ROOT).href]),
    ['jade-vessel', new URL(SILK_DEW_MANIFEST.props['jade-vessel'].file, ART_ROOT).href],
    ['fallback', new URL(SILK_DEW_MANIFEST.support.fallback, ART_ROOT).href],
]);

function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Silkfall art failed to load: ${url}`));
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
