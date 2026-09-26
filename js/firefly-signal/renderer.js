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
    // 概念图：孤僻虫是紫色的冷光，一眼能和暖金色的群体区分开
    solitary: { core: [238, 214, 255], glow: [176, 118, 255] },
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

        // 远山三层：后层高而冷、带一点月光提亮的山脊，前层低而暗（概念图：层叠的蓝色山峦）
        const ridge = (base, amp, col, k, sharp) => {
            b.fillStyle = col;
            b.beginPath();
            b.moveTo(0, lakeTop + 4);
            for (let x = 0; x <= W + 6; x += 6) {
                const u = x / W;
                const peaks = sharp * (1 - Math.abs(Math.sin(u * Math.PI * (2.2 + k) + k)) ** 0.6);
                const y = base - amp * (0.45 * Math.sin(u * 5.2 * k + 1.3 * k) + 0.25 * Math.sin(u * 13 + k * 2) + 0.1 * Math.sin(u * 37 + k) + peaks);
                b.lineTo(x, y);
            }
            b.lineTo(W, lakeTop + 4);
            b.closePath();
            b.fill();
        };
        ridge(H * 0.24, H * 0.07, '#18264f', 1, 0.9);
        ridge(H * 0.28, H * 0.055, '#111d40', 1.6, 0.6);
        ridge(H * 0.315, H * 0.035, '#0b1531', 2.3, 0.3);
        // 远岸树线：针叶林的尖顶剪影
        b.fillStyle = '#07101f';
        b.beginPath();
        b.moveTo(0, lakeTop + 2);
        for (let x = 0; x <= W; x += 4) {
            const tall = rng() < 0.3 ? 6 + rng() * 10 : 2 + rng() * 4;
            b.lineTo(x, lakeTop - 2);
            b.lineTo(x + 2, lakeTop - 2 - tall);
        }
        b.lineTo(W, lakeTop + 2);
        b.fill();

        // 湖
        const lake = b.createLinearGradient(0, lakeTop, 0, lakeBottom);
        lake.addColorStop(0, '#16305c');
        lake.addColorStop(1, '#0a1c34');
        b.fillStyle = lake;
        b.fillRect(0, lakeTop, W, lakeBottom - lakeTop + 4);
        // 远岸灯火 + 它们在水里的倒影（概念图里湖对岸的一串暖光）
        const villages = [[0.34, 0.14], [0.62, 0.1], [0.83, 0.06]];
        for (const [cx0, spread] of villages) {
            const n = Math.round(6 + spread * 60);
            for (let i = 0; i < n; i++) {
                const x = W * (cx0 + (rng() - 0.5) * spread), y = lakeTop - 1.5 - rng() * 4;
                const a = 0.45 + rng() * 0.5;
                b.fillStyle = `rgba(255,206,130,${a})`;
                b.fillRect(x, y, 1.6, 1.6);
                const len = 6 + rng() * 16;
                const g = b.createLinearGradient(0, lakeTop + 2, 0, lakeTop + 2 + len);
                g.addColorStop(0, `rgba(255,200,120,${a * 0.45})`);
                g.addColorStop(1, 'rgba(255,200,120,0)');
                b.fillStyle = g;
                b.fillRect(x - 0.2, lakeTop + 2, 1.4, len);
            }
        }
        // 月影
        for (let i = 0; i < 12; i++) {
            const y = lakeTop + 4 + i * (lakeBottom - lakeTop - 8) / 12;
            const w = mr * (1.6 - i * 0.08) * (0.6 + rng() * 0.6);
            b.fillStyle = `rgba(210,222,255,${0.28 - i * 0.018})`;
            b.fillRect(mx - w / 2 + (rng() - 0.5) * 6, y, w, 1.4);
        }
        // 湖面细纹：底层冷色，照亮层暖色（被岸边虫光照到时浮现）
        for (let i = 0; i < 80; i++) {
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

        // 近岸：远草地到近草地的暗绿渐变（比夜色更有生气的绿）
        const meadow = b.createLinearGradient(0, lakeBottom - 6, 0, H);
        meadow.addColorStop(0, '#12301f');
        meadow.addColorStop(0.4, '#0d2616');
        meadow.addColorStop(1, '#06120a');
        b.fillStyle = meadow;
        b.beginPath();
        b.moveTo(0, lakeBottom);
        for (let x = 0; x <= W; x += 10) b.lineTo(x, lakeBottom - 3 - Math.sin(x * 0.03) * 3 - rng() * 2);
        b.lineTo(W, H);
        b.lineTo(0, H);
        b.fill();

        // 岸边的树：左侧一棵大树的剪影伸进夜空，右侧湖岸一丛矮树
        const tree = (tx, baseY, height, spread) => {
            b.fillStyle = '#050b12';
            b.beginPath();
            b.moveTo(tx - spread * 0.05, baseY);
            b.quadraticCurveTo(tx - spread * 0.02, baseY - height * 0.5, tx + spread * 0.06, baseY - height * 0.75);
            b.lineTo(tx + spread * 0.1, baseY - height * 0.72);
            b.quadraticCurveTo(tx + spread * 0.05, baseY - height * 0.4, tx + spread * 0.08, baseY);
            b.fill();
            for (let i = 0; i < 26; i++) {
                const a = rng() * TAU;
                const r = spread * (0.12 + rng() * 0.2);
                const cx = tx + Math.cos(a) * spread * 0.4 * rng();
                const cy = baseY - height * (0.62 + rng() * 0.36);
                b.beginPath();
                b.arc(cx, cy, r, 0, TAU);
                b.fill();
            }
        };
        tree(W * 0.06, lakeBottom + H * 0.02, H * 0.42, W * 0.36);
        tree(W * 0.96, lakeBottom, H * 0.16, W * 0.22);

        // 近处的石头（压在草里，草叶之后再画一层盖住它们的底部）
        const rocks = [[0.86, 0.9, 0.16], [0.18, 0.97, 0.12], [0.5, 1.0, 0.1]];
        for (const [rx, ry, rs] of rocks) {
            const cx = W * rx, cy = H * ry, rw = W * rs;
            const rg = b.createLinearGradient(0, cy - rw * 0.5, 0, cy + rw * 0.3);
            rg.addColorStop(0, '#26302f');
            rg.addColorStop(1, '#0b100f');
            b.fillStyle = rg;
            b.beginPath();
            b.ellipse(cx, cy, rw * 0.55, rw * 0.36, 0, 0, TAU);
            b.fill();
            l.strokeStyle = 'rgba(255,214,150,0.6)';
            l.lineWidth = 1.4;
            l.beginPath();
            l.ellipse(cx, cy, rw * 0.55, rw * 0.36, 0, Math.PI * 1.08, Math.PI * 1.9);
            l.stroke();
        }

        // 草叶：由远及近画（近的盖远的），同一根草在 lit 层画一条暖色亮边；近处的草又高又宽
        const blades = [];
        const n = Math.round(W * 1.5);
        for (let i = 0; i < n; i++) {
            const t = rng() ** 0.65;
            blades.push({ x: rng() * W, y: lakeBottom + 2 + t * (H - lakeBottom + 6), lean: (rng() - 0.5) * 0.9, r: rng() });
        }
        blades.sort((a, c) => a.y - c.y);
        const dews = [];
        for (const bl of blades) {
            const depth = 0.3 + 0.7 * (bl.y - lakeBottom) / (H - lakeBottom);
            const h = (8 + bl.r * 34) * depth * (depth > 0.85 && bl.r > 0.6 ? 2 : 1);
            const tipX = bl.x + bl.lean * h, tipY = bl.y - h;
            const cx = bl.x + bl.lean * h * 0.2, cy = bl.y - h * 0.6;
            const g = Math.round(46 + bl.r * 46), rr = Math.round(14 + bl.r * 16);
            b.strokeStyle = `rgb(${rr},${g},${Math.round(g * 0.55)})`;
            b.lineWidth = (0.8 + bl.r * 1.6) * depth + 0.3;
            b.beginPath();
            b.moveTo(bl.x, bl.y);
            b.quadraticCurveTo(cx, cy, tipX, tipY);
            b.stroke();
            l.strokeStyle = `rgba(236,220,128,${0.35 + depth * 0.45})`;
            l.lineWidth = Math.max(0.6, b.lineWidth * 0.55);
            l.beginPath();
            l.moveTo(bl.x + 0.6, bl.y);
            l.quadraticCurveTo(cx + 0.6, cy, tipX + 0.4, tipY);
            l.stroke();
            if (bl.r > 0.92 && depth > 0.35) dews.push({ x: tipX, y: tipY + 1, r: 0.8 + depth * 1.4 });
        }

        // 野花：白色与紫色混开；夜里偏冷，被照亮时变暖（紫花照亮后是淡紫白）
        const flowers = Math.round(12 + W / 30);
        for (let i = 0; i < flowers; i++) {
            const y = meadowTop + 16 + rng() * (H - meadowTop - 24);
            const depth = 0.35 + 0.65 * (y - lakeBottom) / (H - lakeBottom);
            const x = 8 + rng() * (W - 16);
            const purple = rng() < 0.55;
            const stem = (18 + rng() * 30) * depth;
            const pr = (2.4 + rng() * 2.6) * depth + 0.6;
            const fx = x + (rng() - 0.5) * 6, fy = y - stem;
            b.strokeStyle = '#1a4128';
            b.lineWidth = 1 * depth + 0.3;
            b.beginPath();
            b.moveTo(x, y);
            b.quadraticCurveTo(x - 2, y - stem * 0.5, fx, fy);
            b.stroke();
            const petals = purple ? 6 : 5;
            for (let k = 0; k < petals; k++) {
                const a = k / petals * TAU + rng() * 0.3;
                const px = fx + Math.cos(a) * pr, py = fy + Math.sin(a) * pr * 0.8;
                b.fillStyle = purple ? 'rgba(128,96,204,0.78)' : 'rgba(186,196,222,0.62)';
                b.beginPath();
                b.ellipse(px, py, pr * 0.78, pr * 0.48, a, 0, TAU);
                b.fill();
                l.fillStyle = purple ? 'rgba(196,150,255,0.95)' : 'rgba(255,240,206,0.95)';
                l.beginPath();
                l.ellipse(px, py, pr * 0.78, pr * 0.48, a, 0, TAU);
                l.fill();
            }
            b.fillStyle = 'rgba(200,180,110,0.65)';
            l.fillStyle = 'rgba(255,208,96,1)';
            for (const g2 of [b, l]) {
                g2.beginPath();
                g2.arc(fx, fy, pr * 0.42, 0, TAU);
                g2.fill();
            }
        }

        // 露珠：底层是一点冷光，照亮层是亮白高光
        for (const d of dews) {
            b.fillStyle = 'rgba(190,210,255,0.34)';
            b.beginPath();
            b.arc(d.x, d.y, d.r, 0, TAU);
            b.fill();
            l.fillStyle = 'rgba(255,250,230,1)';
            l.beginPath();
            l.arc(d.x, d.y, d.r * 1.1, 0, TAU);
            l.fill();
        }

        // 远景装饰萤火虫：林间、远岸与湖面上空，只做氛围，永不参与模拟
        far.length = 0;
        for (let i = 0; i < 28; i++) {
            far.push({ x: rng() * W, y: H * (0.2 + rng() * 0.3), p: rng() * 7, per: 2.2 + rng() * 2.8, dx: rng() * TAU, s: 10 + rng() * 12 });
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
    /** 纵深：远（世界 y 小）的更小，近的更大 */
    const flyDepth = f => 0.55 + 0.6 * (f.y / WORLD.h);

    function drawFly(f, b, time) {
        const p = worldToScreen(f.x, f.y);
        const depth = flyDepth(f);
        // 萤火虫是画面焦点（概念图）：近处约 13–16px 的身长，远处只有一半
        const len = Math.max(5.5, 22 * map.s * f.size * depth);
        const tint = TINT[f.type] || TINT.normal;
        const sprite = sprites[f.type] || sprites.normal;

        // 光晕（Solitary 更大更柔）
        const soft = f.type === 'solitary' ? 1.35 : 1;
        const gs = len * (2.6 + 9 * b) * soft;
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
            ctx.ellipse(side * len * 0.5, -len * 0.2, len * 0.62, len * 0.25, 0, 0, TAU);
            ctx.fill();
            ctx.strokeStyle = `rgba(230,240,255,${0.18 + 0.3 * b})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
            ctx.restore();
        }
        // 腹部（发光器）
        const dim = [118, 112, 62];
        const ar = Math.round(dim[0] + (cr - dim[0]) * b), ag = Math.round(dim[1] + (cg - dim[1]) * b), ab = Math.round(dim[2] + (cb - dim[2]) * b);
        ctx.fillStyle = `rgb(${ar},${ag},${ab})`;
        ctx.beginPath();
        ctx.ellipse(0, len * 0.3, len * 0.26, len * 0.38, 0, 0, TAU);
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
            const a = ph < 0.16 ? Math.sin(ph / 0.16 * Math.PI) : 0;
            const x = reduced ? d.x : d.x + Math.sin(time * 0.2 + d.dx) * 6;
            ctx.globalAlpha = 0.14 + 0.75 * a;
            ctx.drawImage(sprites.normal, x - d.s / 2, d.y - d.s / 2, d.s, d.s);
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

        /* ── 湖面倒影：离湖近（远处）的虫闪光时，在水面拉出一道暖色竖影；全场同步时整片湖都是倒影 ── */
        ctx.globalCompositeOperation = 'lighter';
        for (const f of sim.flies) {
            const b = brights[f.id];
            const near = 1 - f.y / WORLD.h;              // 越靠湖岸越明显
            const a = (b - 0.12) * (0.25 + 0.75 * near) * 0.55 + climax * 0.25;
            if (a <= 0.02) continue;
            const p = worldToScreen(f.x, f.y);
            const ry = lakeTop + (lakeBottom - lakeTop) * (0.25 + 0.55 * (((f.id * 0.618) % 1)));
            const w = 5 + 7 * b, h = (lakeBottom - lakeTop) * (0.35 + 0.3 * b);
            ctx.globalAlpha = Math.min(0.9, a);
            ctx.drawImage(sprites[f.type] || sprites.normal, p.x - w / 2, ry - h / 2, w, h);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';

        /* ── 萤火虫（远的先画） ── */
        const order = sim.flies.slice().sort((a, c) => a.y - c.y);
        for (const f of order) drawFly(f, brights[f.id], time);

        /* ── 干预扩散圆：被点的虫周围两圈快速的小涟漪（概念图）+ 一圈走到真实影响半径的细线 ── */
        for (const pl of frame.pulses || []) {
            const p = worldToScreen(pl.x, pl.y);
            const R = pl.r * map.s;
            for (let k = 0; k < 3; k++) {
                const outer = k === 2;
                const t = Math.min(1, Math.max(0, (pl.age - k * 0.1) / (outer ? 0.9 : 0.55)));
                if (t <= 0 || t >= 1) continue;
                const ease = reduced ? 1 : 1 - (1 - t) ** 3;
                const rr = outer ? R * ease : R * (0.16 + 0.14 * k) * (0.4 + 0.6 * ease);
                const a = (1 - t) * (outer ? 0.5 : 0.75);
                ctx.strokeStyle = `rgba(255,232,176,${a.toFixed(3)})`;
                ctx.lineWidth = outer ? 1.2 : 1.6;
                ctx.beginPath();
                ctx.arc(p.x, p.y, Math.max(1, rr), 0, TAU);
                ctx.stroke();
                if (outer) {
                    ctx.fillStyle = `rgba(255,226,160,${(a * 0.08).toFixed(3)})`;
                    ctx.fill();
                }
            }
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

