/**
 * Production art registry for Neon Tower Defense.
 *
 * The paths are deliberately literal so Vite can discover and hash every
 * runtime asset.  The manifest is metadata only; gameplay never derives a
 * URL by concatenating a manifest string.
 */

export const TD_ART_URLS = Object.freeze({
    'environment.battlefield': new URL('../assets/tower-defense/production/environment/battlefield-base.svg?no-inline', import.meta.url).href,
    'environment.platform': new URL('../assets/tower-defense/production/environment/platform-variant.svg?no-inline', import.meta.url).href,
    'environment.reactor': new URL('../assets/tower-defense/production/environment/reactor-variant.svg?no-inline', import.meta.url).href,
    'environment.singularity': new URL('../assets/tower-defense/production/environment/singularity-variant.svg?no-inline', import.meta.url).href,
    'towers.atlas': new URL('../assets/tower-defense/production/towers/tower-atlas.svg?no-inline', import.meta.url).href,
    'enemies.atlas': new URL('../assets/tower-defense/production/enemies/enemy-atlas.svg?no-inline', import.meta.url).href,
    'fx.atlas': new URL('../assets/tower-defense/production/fx/fx-atlas.svg?no-inline', import.meta.url).href,
    'ui.startHero': new URL('../assets/tower-defense/production/ui/start-hero.svg?no-inline', import.meta.url).href
});

export const TD_ART_FRAMES = Object.freeze({
    towers: Object.freeze({ pulse: 0, cannon: 1, tesla: 2, frost: 3 }),
    enemies: Object.freeze({ normal: 0, fast: 1, tank: 2, swarm: 3, shield: 4, healer: 5, armor: 6, flyer: 7, splitter: 8, attacker: 9, boss: 10, overlord: 11 }),
    fx: Object.freeze({ pulse: 0, cannon: 1, frost: 2, explosion: 3, tesla: 4, damage: 5 })
});

const ATLAS_FRAME = 64;

function loadImage(src, timeout) {
    return new Promise(resolve => {
        const image = new Image();
        let settled = false;
        const finish = (ok) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(ok ? image : null);
        };
        const timer = setTimeout(() => finish(false), timeout);
        image.onload = () => finish(true);
        image.onerror = () => finish(false);
        image.decoding = 'async';
        image.src = src;
    });
}

export function createTowerDefenseArt({ timeout = 8000, urls = TD_ART_URLS } = {}) {
    const images = new Map();
    const failed = new Set();
    let status = 'idle';

    const ready = Promise.all(Object.entries(urls).map(async ([key, url]) => {
        const image = await loadImage(url, timeout);
        if (image) images.set(key, image);
        else failed.add(key);
    })).then(() => {
        status = failed.size ? (images.size ? 'partial' : 'fallback') : 'ready';
        return { status, images, failed };
    });

    status = 'loading';

    return {
        ready,
        get status() { return status; },
        get loadedCount() { return images.size; },
        get failedKeys() { return [...failed]; },
        has(key) { return images.has(key); },
        get(key) { return images.get(key) || null; },
        get keyStatus() {
            return Object.fromEntries(Object.keys(urls).map(key => {
                const image = images.get(key);
                return [key, image ? { complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight } : null];
            }));
        },
        drawAtlas(ctx, key, frame, x, y, size, alpha = 1) {
            const image = images.get(key);
            if (!image) return false;
            ctx.save();
            ctx.globalAlpha *= alpha;
            ctx.drawImage(image, frame * ATLAS_FRAME, 0, ATLAS_FRAME, ATLAS_FRAME, x - size / 2, y - size / 2, size, size);
            ctx.restore();
            return true;
        }
    };
}

export { ATLAS_FRAME };
