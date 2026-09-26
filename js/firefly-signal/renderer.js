/**
 * 萤火信号 — 渲染层（只读模拟状态，从不写回）
 * ==========================================
 * 纵向构图（占舞台高度的比例）：
 *   0–25%   天空：夜空、月亮、远山、HUD（DOM）、远景萤火虫（纯装饰，不参与模拟）
 *   25–58%  湖岸：湖面、远草地、两群之间的连接区域
 *   58–100% 近草地：主要可玩区，花、露珠、大部分萤火虫
 * 模拟世界（600 × 700，simulation.js 的 WORLD）等比缩放进 27%–97% 的纵向区间，
 * 所以扩散圆画出来就是正圆，和真实影响范围一致；命中测试走同一个映射（worldToScreen）。
 *
 * 分层：
 *   bg    —— 静态场景（天空 / 山 / 湖 / 草 / 花 / 露珠），resize 或换关时离屏重绘一次
 *   lit   —— 与 bg 同几何的「被照亮」版本（草叶亮边、暖色花瓣、露珠高光、湖面暖纹），离屏一次
 *   light —— 每帧：低分辨率光照缓冲，每只虫按亮度叠一张预制光斑（'lighter'）
 *   每帧合成：bg → lit ∩ light（destination-in）以 'lighter' 叠上 → 空气辉光 → 虫体 → 扩散圆
 * 环境照明是视觉核心而不是收尾润色：群体同时闪光时，照亮的是整片草地。
 */
import { WORLD, DT } from './simulation.js';
import { mulberry32 } from '../daily.js';

const TAU = Math.PI * 2;
const DPR_CAP = 2;
const LIGHT_SCALE = 0.25;    // 光照缓冲分辨率（相对 CSS 像素）

function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
}

/** 预制径向光斑：中心暖白 → 外圈透明。所有虫共用，逐帧 drawImage 而不是逐帧 createRadialGradient */
function makeSprite(size, stops) {
    const c = makeCanvas(size, size);
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [at, col] of stops) grad.addColorStop(at, col);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
}

const TINT = {
    normal: { core: [255, 236, 170], glow: [255, 196, 92] },
    fast: { core: [236, 255, 178], glow: [214, 240, 110] },
    solitary: { core: [255, 226, 186], glow: [255, 184, 120] },
};

/** 由相位与「距上次闪光」求亮度：常态微光 → 临近闪光腹部渐强 → 闪光瞬间满亮后快速衰减 */
export function brightness(f, tick) {
    const since = (tick - f.lastFlash) * DT;
    const flash = since >= 0 && since < 1.6 ? Math.exp(-since / 0.2) : 0;
    const pre = f.phase > 0.78 ? ((f.phase - 0.78) / 0.22) ** 2 * 0.28 : 0;
    return Math.min(1, 0.07 + pre + flash);
}

export function createRenderer(canvas, opts = {}) {
    const ctx = canvas.getContext('2d');
    let reduced = !!opts.reducedMotion;
    let W = 0, H = 0, dpr = 1;
    let map = { s: 1, ox: 0, oy: 0 };
    let sceneSeed = 1;
    let bg = null, lit = null, light = null, comp = null;
    let lakeTop = 0, lakeBottom = 0, meadowTop = 0;
    const sprites = {};
    const far = [];          // 远景装饰萤火虫
    const stars = [];        // 会闪的少量星星（其余烘进 bg）

    for (const [k, t] of Object.entries(TINT)) {
        const [r, g, b] = t.glow;
        const [cr, cg, cb] = t.core;
        sprites[k] = makeSprite(128, [
            [0, `rgba(${cr},${cg},${cb},1)`],
            [0.12, `rgba(${r},${g},${b},0.75)`],
            [0.4, `rgba(${r},${g},${b},0.18)`],
            [1, `rgba(${r},${g},${b},0)`],
        ]);
    }
    // 照明缓冲用的光斑：纯亮度（暖白），边缘非常柔
    const lightSprite = makeSprite(128, [
        [0, 'rgba(255,238,200,1)'],
        [0.35, 'rgba(255,226,170,0.55)'],
        [1, 'rgba(255,214,150,0)'],
    ]);

    /* ── 坐标映射：世界 ↔ 屏幕（CSS 像素） ── */
    function layoutMap() {
        const top = H * 0.27;
        const bottom = H * 0.97;
        const s = Math.min((W * 0.94) / WORLD.w, (bottom - top) / WORLD.h);
        // 竖屏手机上宽度先顶满，世界比可用纵向区间矮：居中放，远处的群落到湖岸，而不是全挤在底部
        map = { s, ox: (W - WORLD.w * s) / 2, oy: top + (bottom - top - WORLD.h * s) / 2 };
    }
    const worldToScreen = (x, y) => ({ x: map.ox + x * map.s, y: map.oy + y * map.s });

    /* ── 静态层 ── */
    function buildScene() {
        const rng = mulberry32(sceneSeed);
        const pw = Math.round(W * dpr), ph = Math.round(H * dpr);
        bg = makeCanvas(pw, ph);
        lit = makeCanvas(pw, ph);
        const b = bg.getContext('2d');
        const l = lit.getContext('2d');
        b.scale(dpr, dpr);
        l.scale(dpr, dpr);

        lakeTop = H * 0.35;
        lakeBottom = H * 0.47;
        meadowTop = H * 0.5;

        // 天空
        const sky = b.createLinearGradient(0, 0, 0, lakeTop);
        sky.addColorStop(0, '#060b1f');
        sky.addColorStop(0.6, '#0c1636');
        sky.addColorStop(1, '#16244a');
        b.fillStyle = sky;
        b.fillRect(0, 0, W, lakeTop + 2);
        for (let i = 0; i < 90; i++) {
            const x = rng() * W, y = rng() * H * 0.3, r = rng() * 0.9 + 0.3;
            b.fillStyle = `rgba(220,228,255,${0.15 + rng() * 0.5})`;
            b.beginPath();
            b.arc(x, y, r, 0, TAU);
            b.fill();
        }
        stars.length = 0;
        for (let i = 0; i < 14; i++) stars.push({ x: rng() * W, y: rng() * H * 0.26, p: rng() * TAU, w: 0.6 + rng() * 1.4 });

        // 月亮 + 光晕
        // 月亮放在远山之上、HUD 与教学提示行之下，不与文字重叠
        const mx = W * 0.82, my = H * 0.185, mr = Math.max(9, Math.min(W, H) * 0.03);
        const halo = b.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 7);
        halo.addColorStop(0, 'rgba(200,214,255,0.28)');
        halo.addColorStop(1, 'rgba(200,214,255,0)');
        b.fillStyle = halo;
        b.fillRect(mx - mr * 7, my - mr * 7, mr * 14, mr * 14);
        b.fillStyle = '#eef1ff';
        b.beginPath();
        b.arc(mx, my, mr, 0, TAU);
        b.fill();
        b.fillStyle = 'rgba(180,190,220,0.35)';
        b.beginPath();
        b.arc(mx - mr * 0.3, my - mr * 0.15, mr * 0.28, 0, TAU);
        b.arc(mx + mr * 0.35, my + mr * 0.3, mr * 0.18, 0, TAU);
        b.fill();

        // 远山两层
        const ridge = (base, amp, col, k) => {
            b.fillStyle = col;
            b.beginPath();
            b.moveTo(0, lakeTop + 4);
            for (let x = 0; x <= W + 8; x += 8) {
                const y = base - amp * (0.55 * Math.sin(x * 0.011 * k + 1.3 * k) + 0.3 * Math.sin(x * 0.027 + k * 2) + 0.15 * Math.sin(x * 0.061 + k));
                b.lineTo(x, y);
            }
            b.lineTo(W, lakeTop + 4);
            b.closePath();
            b.fill();
        };
        ridge(H * 0.27, H * 0.06, '#101d3f', 1);
        ridge(H * 0.31, H * 0.045, '#0b1631', 1.7);
        // 远岸树线
        b.fillStyle = '#081226';
        b.beginPath();
        b.moveTo(0, lakeTop + 2);
        for (let x = 0; x <= W; x += 5) b.lineTo(x, lakeTop - 3 - Math.abs(Math.sin(x * 0.09) * 5) - rng() * 5);
        b.lineTo(W, lakeTop + 2);
        b.fill();

        // 湖
        const lake = b.createLinearGradient(0, lakeTop, 0, lakeBottom);
        lake.addColorStop(0, '#132a52');
        lake.addColorStop(1, '#091a30');
        b.fillStyle = lake;
        b.fillRect(0, lakeTop, W, lakeBottom - lakeTop + 4);
        // 月影
        for (let i = 0; i < 12; i++) {
            const y = lakeTop + 4 + i * (lakeBottom - lakeTop - 8) / 12;
            const w = mr * (1.6 - i * 0.08) * (0.6 + rng() * 0.6);
            b.fillStyle = `rgba(210,222,255,${0.28 - i * 0.018})`;
            b.fillRect(mx - w / 2 + (rng() - 0.5) * 6, y, w, 1.4);
        }
        // 湖面细纹：底层冷色，照亮层暖色（被岸边虫光照到时浮现）
        for (let i = 0; i < 70; i++) {
            const x = rng() * W, y = lakeTop + 6 + rng() * (lakeBottom - lakeTop - 10), w = 6 + rng() * 22;
            b.strokeStyle = 'rgba(150,180,240,0.12)';
            b.lineWidth = 1;
            b.beginPath();
            b.moveTo(x, y);
            b.lineTo(x + w, y);
            b.stroke();
            l.strokeStyle = 'rgba(255,214,140,0.85)';
            l.lineWidth = 1.2;
            l.beginPath();
            l.moveTo(x, y);
            l.lineTo(x + w, y);
            l.stroke();
        }

        // 近岸：远草地到近草地的暗绿渐变
        const meadow = b.createLinearGradient(0, lakeBottom - 6, 0, H);
        meadow.addColorStop(0, '#0d2219');
        meadow.addColorStop(0.35, '#0a1b13');
        meadow.addColorStop(1, '#050d09');
        b.fillStyle = meadow;
        b.beginPath();
        b.moveTo(0, lakeBottom);
        for (let x = 0; x <= W; x += 10) b.lineTo(x, lakeBottom - 3 - Math.sin(x * 0.03) * 3 - rng() * 2);
        b.lineTo(W, H);
        b.lineTo(0, H);
        b.fill();

        // 草叶：由远及近画（近的盖远的），同一根草在 lit 层画一条暖色亮边
        const blades = [];
        const n = Math.round(W * 1.15);
        for (let i = 0; i < n; i++) {
            const t = rng() ** 0.7;
            blades.push({ x: rng() * W, y: lakeBottom + 2 + t * (H - lakeBottom), lean: (rng() - 0.5) * 0.9, r: rng() });
        }
        blades.sort((a, c) => a.y - c.y);
        const dews = [];
        for (const bl of blades) {
            const depth = 0.3 + 0.7 * (bl.y - lakeBottom) / (H - lakeBottom);
            const h = (8 + bl.r * 30) * depth;
            const tipX = bl.x + bl.lean * h, tipY = bl.y - h;
            const cx = bl.x + bl.lean * h * 0.2, cy = bl.y - h * 0.6;
            const g = Math.round(26 + bl.r * 22), rr = Math.round(10 + bl.r * 10);
            b.strokeStyle = `rgb(${rr},${g + 10},${Math.round(g * 0.75)})`;
            b.lineWidth = (0.7 + bl.r * 1.3) * depth + 0.3;
            b.beginPath();
            b.moveTo(bl.x, bl.y);
            b.quadraticCurveTo(cx, cy, tipX, tipY);
            b.stroke();
            l.strokeStyle = `rgba(236,214,128,${0.35 + depth * 0.45})`;
            l.lineWidth = Math.max(0.6, b.lineWidth * 0.55);
            l.beginPath();
            l.moveTo(bl.x + 0.6, bl.y);
            l.quadraticCurveTo(cx + 0.6, cy, tipX + 0.4, tipY);
            l.stroke();
            if (bl.r > 0.93 && depth > 0.35) dews.push({ x: tipX, y: tipY + 1, r: 0.8 + depth * 1.2 });
        }

        // 花：夜里是灰蓝的，被照亮时是暖白的
        const flowers = Math.round(8 + W / 45);
        for (let i = 0; i < flowers; i++) {
            const y = meadowTop + 20 + rng() * (H - meadowTop - 30);
            const depth = 0.35 + 0.65 * (y - lakeBottom) / (H - lakeBottom);
            const x = 10 + rng() * (W - 20);
            const stem = (18 + rng() * 26) * depth;
            const pr = (2.2 + rng() * 2) * depth + 0.6;
            const fx = x + (rng() - 0.5) * 6, fy = y - stem;
            b.strokeStyle = '#123224';
            b.lineWidth = 1 * depth + 0.3;
            b.beginPath();
            b.moveTo(x, y);
            b.quadraticCurveTo(x - 2, y - stem * 0.5, fx, fy);
            b.stroke();
            for (let k = 0; k < 5; k++) {
                const a = k / 5 * TAU + rng() * 0.3;
                const px = fx + Math.cos(a) * pr, py = fy + Math.sin(a) * pr * 0.8;
                b.fillStyle = 'rgba(150,164,196,0.55)';
                b.beginPath();
                b.ellipse(px, py, pr * 0.75, pr * 0.5, a, 0, TAU);
                b.fill();
                l.fillStyle = 'rgba(255,240,206,0.95)';
                l.beginPath();
                l.ellipse(px, py, pr * 0.75, pr * 0.5, a, 0, TAU);
                l.fill();
            }
            b.fillStyle = 'rgba(190,176,110,0.6)';
            l.fillStyle = 'rgba(255,208,96,1)';
            for (const g2 of [b, l]) {
                g2.beginPath();
                g2.arc(fx, fy, pr * 0.45, 0, TAU);
                g2.fill();
            }
        }

        // 露珠：底层是一点冷光，照亮层是亮白高光
        for (const d of dews) {
            b.fillStyle = 'rgba(190,210,255,0.3)';
            b.beginPath();
            b.arc(d.x, d.y, d.r, 0, TAU);
            b.fill();
            l.fillStyle = 'rgba(255,250,230,1)';
            l.beginPath();
            l.arc(d.x, d.y, d.r * 1.1, 0, TAU);
            l.fill();
        }

        // 远景装饰萤火虫：远岸与山脚，只做氛围，永不参与模拟
        far.length = 0;
        for (let i = 0; i < 16; i++) {
            far.push({ x: rng() * W, y: H * (0.24 + rng() * 0.2), p: rng() * 7, per: 2.2 + rng() * 2.8, dx: rng() * TAU });
        }

        light = makeCanvas(W * LIGHT_SCALE, H * LIGHT_SCALE);
        comp = makeCanvas(pw, ph);
    }

    function resize(cssW, cssH, rawDpr = 1) {
        const nextDpr = Math.min(DPR_CAP, Math.max(1, rawDpr || 1));
        if (cssW === W && cssH === H && nextDpr === dpr && bg) return false;
        W = cssW;
        H = cssH;
        dpr = nextDpr;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        layoutMap();
        buildScene();
        return true;
    }

    function setScene(seed) {
        if (seed === sceneSeed && bg) return;
        sceneSeed = seed >>> 0 || 1;
        if (W && H) buildScene();
    }

    /* ── 每帧 ── */
    function drawFly(f, b, time) {
        const p = worldToScreen(f.x, f.y);
        const depth = 0.72 + 0.28 * (f.y / WORLD.h);
        const len = Math.max(4.2, 10 * map.s * f.size * depth);
        const tint = TINT[f.type] || TINT.normal;
        const sprite = sprites[f.type] || sprites.normal;

        // 光晕（Solitary 更大更柔）
        const soft = f.type === 'solitary' ? 1.35 : 1;
        const gs = len * (2.2 + 8.5 * b) * soft;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, (0.12 + 0.88 * b) / soft);
        ctx.drawImage(sprite, p.x - gs / 2, p.y + len * 0.25 - gs / 2, gs, gs);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;

        const heading = 0.35 * Math.sin(f.wx * time + f.px);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(heading);

        // 翅膀：半透明，闪光时被自身的光短暂照亮成暖色
        const flap = reduced ? 0.55 : 0.5 + 0.32 * Math.sin(time * 26 * f.wingRate + f.px * 3);
        const wa = 0.16 + 0.5 * b;
        const [cr, cg, cb] = tint.core;
        const wr = Math.round(190 + (cr - 190) * b), wg = Math.round(210 + (cg - 210) * b), wb = Math.round(255 + (cb - 255) * b);
        ctx.fillStyle = `rgba(${wr},${wg},${wb},${wa})`;
        for (const side of [-1, 1]) {
            ctx.save();
            ctx.rotate(side * flap);
            ctx.beginPath();
            ctx.ellipse(side * len * 0.42, -len * 0.18, len * 0.5, len * 0.2, 0, 0, TAU);
            ctx.fill();
            ctx.restore();
        }
        // 腹部（发光器）
        const dim = [118, 112, 62];
        const ar = Math.round(dim[0] + (cr - dim[0]) * b), ag = Math.round(dim[1] + (cg - dim[1]) * b), ab = Math.round(dim[2] + (cb - dim[2]) * b);
        ctx.fillStyle = `rgb(${ar},${ag},${ab})`;
        ctx.beginPath();
        ctx.ellipse(0, len * 0.28, len * 0.22, len * 0.32, 0, 0, TAU);
        ctx.fill();
        // 深色头胸
        ctx.fillStyle = '#1d1712';
        ctx.beginPath();
        ctx.ellipse(0, -len * 0.14, len * 0.2, len * 0.26, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#b8503a';
        ctx.beginPath();
        ctx.arc(0, -len * 0.36, len * 0.11, 0, TAU);
        ctx.fill();
        ctx.restore();
    }

    /**
     * @param sim     模拟（只读）
     * @param frame   { time 秒, pulses: [{x,y,r,age}] 世界坐标, climax 0..1 全场照明, lightBoost 光照半径倍率 }
     */
    function draw(sim, frame) {
        if (!bg) return;
        const time = frame.time || 0;
        const climax = frame.climax || 0;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.drawImage(bg, 0, 0);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // 会闪的星 + 远景萤火虫（减少动态：星星不闪，远景虫只保留亮度变化、不漂移）
        for (const s of stars) {
            const a = reduced ? 0.45 : 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(time * s.w + s.p));
            ctx.fillStyle = `rgba(230,236,255,${a})`;
            ctx.fillRect(s.x, s.y, 1.4, 1.4);
        }
        ctx.globalCompositeOperation = 'lighter';
        for (const d of far) {
            const ph = ((time + d.p) % d.per) / d.per;
            const a = ph < 0.12 ? Math.sin(ph / 0.12 * Math.PI) : 0;
            const x = reduced ? d.x : d.x + Math.sin(time * 0.2 + d.dx) * 6;
            ctx.globalAlpha = 0.08 + 0.6 * a;
            ctx.drawImage(sprites.normal, x - 5, d.y - 5, 10, 10);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';

        // 湖面的微光（背景运动；减少动态时关闭）
        if (!reduced) {
            for (let i = 0; i < 5; i++) {
                const x = (W * (0.15 + i * 0.19) + Math.sin(time * 0.35 + i * 1.7) * 18) % W;
                const y = lakeTop + (lakeBottom - lakeTop) * (0.25 + 0.14 * i);
                ctx.fillStyle = `rgba(190,210,255,${0.08 + 0.06 * Math.sin(time * 1.3 + i)})`;
                ctx.fillRect(x, y, 14 + 6 * Math.sin(time + i), 1);
            }
        }

        /* ── 环境照明 ── */
        const lg = light.getContext('2d');
        lg.setTransform(1, 0, 0, 1, 0, 0);
        lg.globalCompositeOperation = 'source-over';
        lg.clearRect(0, 0, light.width, light.height);
        lg.setTransform(LIGHT_SCALE, 0, 0, LIGHT_SCALE, 0, 0);
        lg.globalCompositeOperation = 'lighter';
        let total = 0;
        const boost = frame.lightBoost || 1;
        const brights = new Float32Array(sim.flies.length);
        for (const f of sim.flies) {
            const b = brightness(f, sim.tick);
            brights[f.id] = b;
            const e = b - 0.1;
            if (e <= 0.02) continue;
            total += e;
            const p = worldToScreen(f.x, f.y);
            const r = (70 + 110 * e) * Math.max(0.7, map.s) * boost;
            lg.globalAlpha = Math.min(1, e * 1.15);
            lg.drawImage(lightSprite, p.x - r, p.y - r, r * 2, r * 2);
        }
        // 空气里的暖色辉光（很淡）：只取虫光本身，不含下面的全场照明，否则整屏会变成一层灰雾
        if (total > 0.01) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalCompositeOperation = 'lighter';
            // 成功序列放大了光斑半径，缓冲会饱和成一片：按半径倍率压低，保持「空气微亮」而不是起雾
            ctx.globalAlpha = 0.2 / (boost * boost);
            ctx.drawImage(light, 0, 0, canvas.width, canvas.height);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        if (climax > 0) {
            // 全体同步闪光：从湖面往近处渐强地照亮整片场景（只作用于「被照亮层」的遮罩，
            // 所以亮起来的是草叶边、花、露珠、水纹，而不是一块平涂的光）
            lg.globalAlpha = 1;
            const grad = lg.createLinearGradient(0, lakeTop - 30, 0, H);
            grad.addColorStop(0, 'rgba(255,230,180,0)');
            grad.addColorStop(0.2, `rgba(255,230,180,${(climax * 0.5).toFixed(3)})`);
            grad.addColorStop(1, `rgba(255,230,180,${(climax * 0.8).toFixed(3)})`);
            lg.fillStyle = grad;
            lg.fillRect(0, lakeTop - 30, W, H - lakeTop + 30);
            total += climax * 10;
        }
        lg.globalAlpha = 1;

        if (total > 0.01) {
            const cg = comp.getContext('2d');
            cg.setTransform(1, 0, 0, 1, 0, 0);
            cg.globalCompositeOperation = 'source-over';
            cg.clearRect(0, 0, comp.width, comp.height);
            cg.drawImage(lit, 0, 0);
            cg.globalCompositeOperation = 'destination-in';
            cg.drawImage(light, 0, 0, comp.width, comp.height);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalCompositeOperation = 'lighter';
            ctx.drawImage(comp, 0, 0);
            ctx.globalCompositeOperation = 'source-over';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        /* ── 萤火虫（远的先画） ── */
        const order = sim.flies.slice().sort((a, c) => a.y - c.y);
        for (const f of order) drawFly(f, brights[f.id], time);

        /* ── 干预扩散圆：非常克制，一圈细线 + 极淡的面 ── */
        for (const pl of frame.pulses || []) {
            const p = worldToScreen(pl.x, pl.y);
            const R = pl.r * map.s;
            const t = Math.min(1, pl.age / 0.9);
            const ease = reduced ? 1 : 1 - (1 - t) ** 3;
            const a = (1 - t) * 0.5;
            if (a <= 0) continue;
            ctx.strokeStyle = `rgba(255,232,176,${a})`;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(1, R * ease), 0, TAU);
            ctx.stroke();
            ctx.fillStyle = `rgba(255,226,160,${a * 0.08})`;
            ctx.fill();
        }
    }

    /** 背景层按列平均成 1px 宽的竖条（dataURL）：舞台比视口窄时，页面用它把夜色横向延展到两侧 */
    function edgeStrip() {
        if (!bg) return '';
        // 整宽平均 + 纵向降采样（再由 background-size 拉回）：只留下天空→湖→草地的色带，没有草叶条纹
        const c = makeCanvas(1, Math.max(8, Math.round(H / 6)));
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(bg, 0, 0, bg.width, bg.height, 0, 0, 1, c.height);
        try { return c.toDataURL('image/png'); } catch (e) { return ''; }
    }

    return {
        resize,
        edgeStrip,
        setScene,
        draw,
        worldToScreen,
        setReducedMotion(v) { reduced = !!v; },
        get scale() { return map.s; },
        get size() { return { w: W, h: H, dpr }; },
        /** 某只虫的屏幕位置（CSS 像素，相对画布左上） */
        screenOf(f) { return worldToScreen(f.x, f.y); },
    };
}

