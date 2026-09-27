/**
 * Silkfall layered night-garden renderer.
 *
 * Pipeline: painted far/mid layers -> gameplay -> painted foreground -> lit deltas.
 * Local lighting uses a half-resolution mask and a cached glow stamp.
 */
import { loadSilkDewArt, SILK_DEW_MANIFEST } from './silk-dew-art.js';

const W = SILK_DEW_MANIFEST.coordinateSystem.width;
const H = SILK_DEW_MANIFEST.coordinateSystem.height;
const LIGHT_SCALE = 0.5;

function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
}

function makeGlowStamp(size = 160) {
    const c = makeCanvas(size, size);
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(205,255,245,0.9)');
    grad.addColorStop(0.22, 'rgba(118,226,221,0.55)');
    grad.addColorStop(0.58, 'rgba(90,186,160,0.2)');
    grad.addColorStop(1, 'rgba(90,186,160,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
}

function drawFull(g, img) {
    if (img) g.drawImage(img, 0, 0, W, H);
}

export function createSilkDewScene({ reducedMotion = false, onReady } = {}) {
    let reduced = !!reducedMotion;
    let drift = 0;
    const light = makeCanvas(W * LIGHT_SCALE, H * LIGHT_SCALE);
    const lit = makeCanvas(W * LIGHT_SCALE, H * LIGHT_SCALE);
    const stamp = makeGlowStamp();
    const art = loadSilkDewArt({
        onReady: () => { if (typeof onReady === 'function') onReady(); },
        onFallback: () => { if (typeof onReady === 'function') onReady(); },
    });

    function tick(dt) {
        if (!reduced) drift = (drift + Math.min(dt, 0.05)) % 1000;
    }

    function drawFallback(ctx) {
        if (!art.fallback) return false;
        drawFull(ctx, art.fallback);
        return true;
    }

    function drawBackground(ctx) {
        if (art.status !== 'ready') return drawFallback(ctx);
        drawFull(ctx, art.layers.sky);
        drawFull(ctx, art.layers['moon-mountains']);
        drawFull(ctx, art.layers['garden-back']);
        if (!reduced) {
            ctx.save();
            ctx.translate(Math.sin(drift * 0.16) * 0.45, Math.cos(drift * 0.11) * 0.32);
            drawFull(ctx, art.layers['garden-mid']);
            ctx.restore();
        } else {
            drawFull(ctx, art.layers['garden-mid']);
        }
        return true;
    }

    function drawForeground(ctx) {
        if (art.status !== 'ready') return false;
        if (!reduced) {
            ctx.save();
            ctx.translate(Math.sin(drift * 0.21) * 0.7, Math.cos(drift * 0.14) * 0.28);
            drawFull(ctx, art.layers.foreground);
            ctx.restore();
        } else {
            drawFull(ctx, art.layers.foreground);
        }
        return true;
    }

    function drawLocalLight(ctx, sources = []) {
        if (art.status !== 'ready' || !sources.length) return false;
        const lg = light.getContext('2d');
        const cg = lit.getContext('2d');
        lg.setTransform(1, 0, 0, 1, 0, 0);
        lg.clearRect(0, 0, light.width, light.height);
        lg.globalCompositeOperation = 'lighter';
        for (const src of sources) {
            if (!src || !Number.isFinite(src.x) || !Number.isFinite(src.y)) continue;
            const radius = (src.radius || 80) * LIGHT_SCALE;
            const diameter = radius * 2;
            lg.globalAlpha = Math.max(0, Math.min(1, src.alpha ?? 1));
            lg.drawImage(stamp, src.x * LIGHT_SCALE - radius, src.y * LIGHT_SCALE - radius, diameter, diameter);
        }
        lg.globalAlpha = 1;
        lg.globalCompositeOperation = 'source-over';

        cg.setTransform(1, 0, 0, 1, 0, 0);
        cg.clearRect(0, 0, lit.width, lit.height);
        cg.drawImage(art.layers['garden-mid-lit'], 0, 0, lit.width, lit.height);
        cg.drawImage(art.layers['foreground-lit'], 0, 0, lit.width, lit.height);
        cg.globalCompositeOperation = 'destination-in';
        cg.drawImage(light, 0, 0);
        cg.globalCompositeOperation = 'source-over';

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.82;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(lit, 0, 0, W, H);
        ctx.restore();
        return true;
    }

    function drawVessel(ctx, vessel) {
        const img = art.props['jade-vessel'];
        if (art.status !== 'ready' || !img || !vessel) return false;
        const meta = SILK_DEW_MANIFEST.props['jade-vessel'];
        const unitsPerLogical = meta.mouthUnits / Math.max(1, vessel.w);
        const dw = meta.viewBox[2] / unitsPerLogical;
        const dh = meta.viewBox[3] / unitsPerLogical;
        const dx = vessel.x - meta.mouthAnchor[0] / unitsPerLogical;
        const dy = vessel.y - meta.mouthAnchor[1] / unitsPerLogical;
        ctx.drawImage(img, dx, dy, dw, dh);
        return true;
    }

    return {
        artState: art,
        tick,
        drawBackground,
        drawForeground,
        drawLocalLight,
        drawVessel,
        drawFallback,
        setReducedMotion(value) { reduced = !!value; },
        get debug() { return { status: art.status, lightWidth: light.width, lightHeight: light.height, reduced }; },
    };
}
