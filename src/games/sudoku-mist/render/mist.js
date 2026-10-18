/**
 * 雾隐九宫 — 雾层（Canvas，夹在棋盘底色与格子之间；格子的网格线 / 选框 / 笔记都浮在雾上）
 * ===========================================================================
 * 雾的浓度只由「这一格是否可见」决定——雾中的题面数字与雾中的空格画出来一模一样（设计 §9.3）。
 *
 * 画法：每格 3×3 个子像素的低分辨率浓度场（27×27，ImageData）→ 平滑放大到整个棋盘，
 * 边缘自然柔化约 1/3 格；再叠两层缓慢漂移的噪声纹理（source-atop，只落在雾上）当作雾丝。
 * 揭雾：目标浓度归零，按与落子格的距离错开 60ms 依次淡出（约 0.55s）。
 * prefers-reduced-motion：不漂移，揭雾改为直接淡出、无涟漪。
 */
import { chebyshev } from '../model/grid.js';
import { mulberry32 } from '../../../platform/daily.js';

const SUB = 3;
const FIELD = 9 * SUB;
const FADE_S = 0.55;
const STAGGER_S = 0.06;
const RIPPLE_S = 0.6;
const NOISE = 96;

/** 可平铺的值噪声（固定种子：每次打开雾丝的形状都一样，与题目无关） */
function noiseTile(rgb, alpha) {
    const c = document.createElement('canvas');
    c.width = c.height = NOISE;
    const g = c.getContext('2d');
    const rng = mulberry32(0x5eed);
    const L = 8;
    const lattice = Array.from({ length: L * L }, () => rng());
    const at = (x, y) => lattice[((y + L) % L) * L + ((x + L) % L)];
    const smooth = t => t * t * (3 - 2 * t);
    const img = g.createImageData(NOISE, NOISE);
    for (let y = 0; y < NOISE; y++) {
        for (let x = 0; x < NOISE; x++) {
            const fx = x / NOISE * L, fy = y / NOISE * L;
            const x0 = Math.floor(fx), y0 = Math.floor(fy);
            const sx = smooth(fx - x0), sy = smooth(fy - y0);
            const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
            const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
            const v = top + (bottom - top) * sy;
            const k = (y * NOISE + x) * 4;
            img.data[k] = rgb[0]; img.data[k + 1] = rgb[1]; img.data[k + 2] = rgb[2];
            img.data[k + 3] = Math.round(Math.max(0, v - 0.35) / 0.65 * 255 * alpha);
        }
    }
    g.putImageData(img, 0, 0);
    return c;
}

const parseRgb = s => String(s).split(',').map(v => Math.max(0, Math.min(255, Number(v.trim()) || 0)));

export function createMist(canvas, { palette, reducedMotion = () => false }) {
    const ctx = canvas.getContext('2d');
    const field = document.createElement('canvas');
    field.width = field.height = FIELD;
    const fctx = field.getContext('2d');
    const fieldImg = fctx.createImageData(FIELD, FIELD);
    const cur = new Float32Array(81).fill(1);
    const target = new Float32Array(81).fill(1);
    const delay = new Float32Array(81);
    let ripples = [];
    let wisps = null;
    let time = 0;
    let cssW = 0, cssH = 0, dpr = 1;

    function rebuildWisps() {
        const alpha = Number(palette.wispAlpha) || 0;
        wisps = alpha > 0 ? noiseTile(parseRgb(palette.wispRgb), alpha) : null;
    }
    rebuildWisps();

    function resize() {
        const rect = canvas.getBoundingClientRect();
        cssW = Math.max(1, rect.width);
        cssH = Math.max(1, rect.height);
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }

    /** 整盘同步可见性；instant = 不播淡出（开局 / 回放重置） */
    function sync(isVisible, { instant = false } = {}) {
        for (let i = 0; i < 81; i++) {
            target[i] = isVisible(i) ? 0 : 1;
            if (instant) { cur[i] = target[i]; delay[i] = 0; }
        }
        if (instant) ripples = [];
    }

    /** 揭开 cells：从 origin 起按距离错开淡出 */
    function reveal(cells, origin) {
        const stagger = reducedMotion() ? 0 : STAGGER_S;
        for (const j of cells) {
            target[j] = 0;
            delay[j] = origin >= 0 ? chebyshev(origin, j) * stagger : 0;
        }
    }

    function ripple(cell, kind = 'ink') {
        if (reducedMotion()) return;
        ripples.push({ cell, kind, age: 0 });
    }

    function step(dt) {
        time += dt;
        let moving = false;
        for (let i = 0; i < 81; i++) {
            if (cur[i] === target[i]) continue;
            if (delay[i] > 0) { delay[i] = Math.max(0, delay[i] - dt); moving = true; continue; }
            const k = dt / FADE_S;
            cur[i] = cur[i] > target[i] ? Math.max(target[i], cur[i] - k) : Math.min(target[i], cur[i] + k);
            moving = true;
        }
        ripples = ripples.filter(r => (r.age += dt) < RIPPLE_S);
        return moving || ripples.length > 0;
    }

    const animating = () => ripples.length > 0 || cur.some((v, i) => v !== target[i]);

    function draw() {
        if (!cssW) resize();
        const [r, g, b] = parseRgb(palette.fogRgb);
        const maxA = Number(palette.fogAlpha) || 0.9;
        const d = fieldImg.data;
        for (let y = 0; y < FIELD; y++) {
            for (let x = 0; x < FIELD; x++) {
                const k = (y * FIELD + x) * 4;
                const a = cur[((y / SUB) | 0) * 9 + ((x / SUB) | 0)];
                d[k] = r; d[k + 1] = g; d[k + 2] = b;
                d[k + 3] = Math.round(a * a * (3 - 2 * a) * maxA * 255);
            }
        }
        fctx.putImageData(fieldImg, 0, 0);

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, cssW, cssH);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(field, 0, 0, cssW, cssH);

        if (wisps) {
            const still = reducedMotion();
            ctx.globalCompositeOperation = 'source-atop';
            for (const [scale, vx, vy, alpha] of [[cssW / 2.2, 9, 3, 0.9], [cssW / 1.3, -5, 2, 0.6]]) {
                const s = scale / NOISE;
                const ox = still ? 0 : (time * vx) % scale, oy = still ? 0 : (time * vy) % scale;
                ctx.save();
                ctx.translate(ox, oy);
                ctx.scale(s, s);
                ctx.globalAlpha = alpha;
                ctx.fillStyle = ctx.createPattern(wisps, 'repeat');
                ctx.fillRect(-ox / s - NOISE, -oy / s - NOISE, cssW / s + 2 * NOISE, cssH / s + 2 * NOISE);
                ctx.restore();
                ctx.globalCompositeOperation = 'source-atop';
            }
            ctx.globalCompositeOperation = 'source-over';
        }

        const cell = cssW / 9;
        for (const rp of ripples) {
            const t = rp.age / RIPPLE_S;
            const cx = (rp.cell % 9 + 0.5) * cell, cy = (((rp.cell / 9) | 0) + 0.5) * cell;
            ctx.globalAlpha = (1 - t) * 0.85;
            ctx.strokeStyle = rp.kind === 'wrong' ? palette.wrong : palette.ripple;
            ctx.lineWidth = Math.max(1.5, cell * 0.08 * (1 - t));
            ctx.beginPath();
            ctx.arc(cx, cy, cell * (0.25 + t * 0.9), 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    return {
        resize,
        sync,
        reveal,
        ripple,
        step,
        draw,
        animating,
        rebuildWisps,
        /** 测试钩子：当前雾浓度（0 = 散尽） */
        density: i => cur[i],
    };
}
