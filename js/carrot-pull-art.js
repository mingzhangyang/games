export const ART_UI = Object.freeze({
    carrotMark: new URL('../assets/carrot-pull/ui/carrot-mark.svg', import.meta.url).href,
});

export const ART_URLS = Object.freeze({
    preview: new URL('../assets/carrot-pull/layers/loading-preview.webp', import.meta.url).href,
    layers: Object.freeze({
        sky: new URL('../assets/carrot-pull/layers/sky.webp', import.meta.url).href,
        clouds: new URL('../assets/carrot-pull/layers/clouds.webp', import.meta.url).href,
        'hills-farm': new URL('../assets/carrot-pull/layers/hills-farm.webp', import.meta.url).href,
        'garden-mid': new URL('../assets/carrot-pull/layers/garden-mid.webp', import.meta.url).href,
        'soil-back': new URL('../assets/carrot-pull/layers/soil-back.webp', import.meta.url).href,
        'soil-front': new URL('../assets/carrot-pull/layers/soil-front.webp', import.meta.url).href,
        foreground: new URL('../assets/carrot-pull/layers/foreground.webp', import.meta.url).href,
    }),
    sprites: Object.freeze({
        carrot: new URL('../assets/carrot-pull/sprites/carrot.webp', import.meta.url).href,
        'girl-happy': new URL('../assets/carrot-pull/sprites/girl-happy.webp', import.meta.url).href,
        'girl-oops': new URL('../assets/carrot-pull/sprites/girl-oops.webp', import.meta.url).href,
        'girl-hands': new URL('../assets/carrot-pull/sprites/girl-hands.webp', import.meta.url).href,
        'mole-happy': new URL('../assets/carrot-pull/sprites/mole-happy.webp', import.meta.url).href,
        'mole-oops': new URL('../assets/carrot-pull/sprites/mole-oops.webp', import.meta.url).href,
    }),
});

const CRITICAL_URLS = Object.freeze([
    ...Object.values(ART_URLS.layers),
    ...Object.values(ART_URLS.sprites),
]);
const ART_LOAD_TIMEOUT_MS = 8000;

function loadImage(src) {
    return new Promise((resolve, reject) => {
        if (typeof Image === 'undefined') {
            reject(new Error('Image API unavailable'));
            return;
        }
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => resolve(src);
        image.onerror = () => reject(new Error(`Carrot Pull art failed to load: ${src}`));
        image.src = src;
    });
}

function withTimeout(promise, timeoutMs) {
    let timeoutId;
    const timeout = new Promise((resolve, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error(`Carrot Pull art timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

function setSvgImageSource(node, src) {
    if (!node || !src) return;
    node.setAttribute('href', src);
    node.setAttribute('xlink:href', src);
}

function setImageSource(node, src) {
    if (!node || !src) return;
    if (node.namespaceURI === 'http://www.w3.org/2000/svg') {
        setSvgImageSource(node, src);
    } else {
        node.setAttribute('src', src);
    }
}

function showProduction(svg) {
    svg?.querySelector('[data-art-production]')?.setAttribute('visibility', 'visible');
    svg?.querySelector('#cp-fallback-scene')?.setAttribute('visibility', 'hidden');
}

function showFallback(svg) {
    svg?.querySelector('[data-art-production]')?.setAttribute('visibility', 'hidden');
    svg?.querySelector('#cp-fallback-scene')?.setAttribute('visibility', 'visible');
}

function callSafely(callback, ...args) {
    try {
        callback?.(...args);
    } catch {
        // Art loading must never take the game down. The fallback remains interactive.
    }
}

export function loadCarrotPullArt({
    stage = document.getElementById('cp-stage'),
    svg = document.getElementById('cp-scene'),
    onReady = () => {},
    onFallback = () => {},
} = {}) {
    if (stage) stage.dataset.artState = 'loading';
    const preview = svg?.querySelector('[data-art-preview]');
    setSvgImageSource(preview, ART_URLS.preview);
    document.querySelectorAll('[data-art-ui]').forEach((node) => {
        const name = node.getAttribute('data-art-ui');
        setImageSource(node, ART_UI[name]);
    });

    return withTimeout(Promise.all(CRITICAL_URLS.map(loadImage)), ART_LOAD_TIMEOUT_MS)
        .then(() => {
            svg?.querySelectorAll('[data-art-layer]').forEach((node) => {
                setSvgImageSource(node, ART_URLS.layers[node.getAttribute('data-art-layer')]);
            });
            svg?.querySelectorAll('[data-art-sprite]').forEach((node) => {
                setSvgImageSource(node, ART_URLS.sprites[node.getAttribute('data-art-sprite')]);
            });
            if (stage) stage.dataset.artState = 'ready';
            showProduction(svg);
            callSafely(onReady);
            return true;
        })
        .catch((error) => {
            if (stage) stage.dataset.artState = 'fallback';
            showFallback(svg);
            callSafely(onFallback, error);
            return false;
        });
}
