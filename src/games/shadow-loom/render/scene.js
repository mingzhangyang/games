/**
 * 影织 Shadow Loom — 舞台美术分层（设计方案 §15 / §19）
 * =======================================================
 * 美术分层位图见 assets/shadow-loom/layers/（manifest.json 是坐标约定）：
 * 全部整幅层都是 1080×1920，与 480×854 逻辑场同为 9:16，逻辑坐标 × 2.25 = 位图像素。
 *
 * 绘制顺序（由后到前，玩法需要的动态层插在位图层之间）：
 *   stage-background   房间、书架、散景（不透明）
 *   纸幕               纸张纹理平铺 + 灯光透射（动态）+ 目标淡影 / 影子 / 金线（由游戏画）
 *   paper-frame        雕花木框与藤蔓，盖住纸幕的毛边（以框脚为锚放大 FRAME_SCALE 倍，见下）
 *   desk-back          灯后面的桌面与桌上物件
 *   剪纸纸片            （由游戏画：丝线、纸片本体）
 *   foreground         书、卡片、盆花、花瓣
 *   灯                 lamp-base / lamp-glass / lamp-shade + 火光（动态）
 *   光尘
 *
 * 灯的两处有意偏离 manifest（为了玩法）：
 *   1. 缩放：原尺寸的灯罩顶到 y=845，会盖住纸幕下部约 37% 的高度，而「灯行」章节里灯还要
 *      左右拖动 —— 这里按 LAMP_SCALE 缩小，并保证灯罩顶端始终在纸幕下沿以下。
 *   2. 层级：manifest 里 foreground（z=50）在灯（z=30–40）之前；灯被拖到两侧时会钻到书堆 /
 *      盆花后面变得抓不到，所以灯画在 foreground 之上。
 */

const TAU = Math.PI * 2;
/** 位图像素 / 逻辑像素 */
export const ART_SCALE = 2.25;
/**
 * 木框层放大倍数与锚点（框脚底边中点，位图像素）。原尺寸的纸幕窗口只有 298×353（逻辑），
 * 手机上可玩区域太小；木框是独立透明层，外沿宽 892/1080，放大 1.2 倍正好铺满画宽，
 * 框脚仍立在桌面上，窗口变为 356×424（见 rules 的 SCREEN）。
 */
export const FRAME_SCALE = 1.2;
const FRAME_ANCHOR = { x: 540, y: 1257 };

const FILES = {
    // Keep every production asset path literal so Vite emits and rewrites it.
    background: new URL('../../../../assets/shadow-loom/layers/stage-background.webp', import.meta.url).href,
    frame: new URL('../../../../assets/shadow-loom/layers/paper-frame.webp', import.meta.url).href,
    desk: new URL('../../../../assets/shadow-loom/layers/desk-back.webp', import.meta.url).href,
    foreground: new URL('../../../../assets/shadow-loom/layers/foreground.webp', import.meta.url).href,
    lampBase: new URL('../../../../assets/shadow-loom/layers/lamp-base.webp', import.meta.url).href,
    lampGlass: new URL('../../../../assets/shadow-loom/layers/lamp-glass.webp', import.meta.url).href,
    lampShade: new URL('../../../../assets/shadow-loom/layers/lamp-shade.webp', import.meta.url).href,
    paper: new URL('../../../../assets/shadow-loom/layers/paper-fiber-tile.webp', import.meta.url).href,
};

/**
 * 灯三件在整幅位图里的并集包围盒与火焰点（manifest：lamp-shade.visibleBounds 320,845 420×710；
 * lamp-base 到 y=1910；flameSlot 415,1220 250×155 的中心）。
 */
const LAMP_ART = { x: 320, y: 845, w: 420, h: 1065, fx: 540, fy: 1297.5 };
/** 灯相对原图的缩放：灯罩顶端离纸幕下沿 ≥ ~19px、灯座不出画面底边（见 rules 的 LAMP_BOX） */
export const LAMP_SCALE = 0.66;

function loadImage(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

export function createScene({ W, H, SCREEN }) {
    const S = SCREEN;
    const img = {};
    const layers = { background: null, frame: null, desk: null, foreground: null, paper: null };
    let scale = 0;
    let ready = false;
    let onReady = null;

    Promise.all(Object.entries(FILES).map(([k, src]) => loadImage(src).then((im) => { img[k] = im; })))
        .then(() => {
            ready = true;
            scale = 0;   // 下一帧按设备像素重建缓存
            if (onReady) onReady();
        });

    function makeLayer(draw) {
        const c = document.createElement('canvas');
        c.width = Math.round(W * scale);
        c.height = Math.round(H * scale);
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.setTransform(scale, 0, 0, scale, 0, 0);
        draw(g);
        return c;
    }

    const full = key => g => { if (img[key]) g.drawImage(img[key], 0, 0, W, H); };

    function drawPaperLayer(g) {
        g.fillStyle = '#efe2c6';
        g.fillRect(S.x, S.y, S.w, S.h);
        if (!img.paper) return;
        const pat = g.createPattern(img.paper, 'repeat');
        // 纹理按美术像素密度铺：1 个纹理像素 = 1 个 1080 宽位图像素
        pat.setTransform(new window.DOMMatrix().scale(1 / ART_SCALE));
        g.fillStyle = pat;
        g.fillRect(S.x, S.y, S.w, S.h);
    }

    function ensure(renderScale) {
        if (scale === renderScale && layers.background) return;
        scale = renderScale;
        layers.background = makeLayer(g => {
            g.fillStyle = '#0a0d1c';
            g.fillRect(0, 0, W, H);
            full('background')(g);
        });
        layers.frame = makeLayer((g) => {
            if (!img.frame) return;
            const ax = FRAME_ANCHOR.x / ART_SCALE;
            const ay = FRAME_ANCHOR.y / ART_SCALE;
            g.translate(ax, ay);
            g.scale(FRAME_SCALE, FRAME_SCALE);
            g.translate(-ax, -ay);
            g.drawImage(img.frame, 0, 0, W, H);
        });
        layers.desk = makeLayer(full('desk'));
        layers.foreground = makeLayer(full('foreground'));
        layers.paper = makeLayer(drawPaperLayer);
    }

    function blit(ctx, layer, rs) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(layer, 0, 0);
        ctx.restore();
        ctx.setTransform(rs, 0, 0, rs, 0, 0);
    }

    function clipPaper(ctx) {
        ctx.beginPath();
        ctx.rect(S.x, S.y, S.w, S.h);
        ctx.clip();
    }

    /** 灯位图在舞台上的矩形（按火焰点对齐） */
    function lampRect(lamp) {
        const k = LAMP_SCALE / ART_SCALE;
        return {
            x: lamp.x + (LAMP_ART.x - LAMP_ART.fx) * k,
            y: lamp.y + (LAMP_ART.y - LAMP_ART.fy) * k,
            w: LAMP_ART.w * k,
            h: LAMP_ART.h * k,
        };
    }

    return {
        get ready() { return ready; },
        set onReady(fn) { onReady = fn; },
        ensure,
        clipPaper,
        lampRect,
        background(ctx, rs) { blit(ctx, layers.background, rs); },
        frame(ctx, rs) { blit(ctx, layers.frame, rs); },
        desk(ctx, rs) { blit(ctx, layers.desk, rs); },
        foreground(ctx, rs) { blit(ctx, layers.foreground, rs); },

        /** 纸幕 + 灯光透射：中心过曝、边缘橙褐，亮区跟着灯走 */
        paper(ctx, rs, lightX, lightY, boost, flicker) {
            blit(ctx, layers.paper, rs);
            ctx.save();
            clipPaper(ctx);
            ctx.globalCompositeOperation = 'multiply';
            const falloff = ctx.createRadialGradient(lightX, lightY, 30, lightX, lightY, 330);
            falloff.addColorStop(0, 'rgb(255,255,255)');
            falloff.addColorStop(0.45, 'rgb(252,222,178)');
            falloff.addColorStop(0.8, 'rgb(222,146,76)');
            falloff.addColorStop(1, 'rgb(160,84,34)');
            ctx.fillStyle = falloff;
            ctx.fillRect(S.x, S.y, S.w, S.h);
            ctx.globalCompositeOperation = 'lighter';
            const hot = ctx.createRadialGradient(lightX, lightY, 0, lightX, lightY, 160);
            hot.addColorStop(0, `rgba(255,232,190,${(0.34 + boost) * flicker})`);
            hot.addColorStop(0.5, `rgba(255,196,120,${0.12 + boost * 0.5})`);
            hot.addColorStop(1, 'rgba(255,190,110,0)');
            ctx.fillStyle = hot;
            ctx.fillRect(S.x, S.y, S.w, S.h);
            ctx.restore();
        },

        /** 灯：桌面暖光 → 三件位图 → 灯罩透光闪烁 → 大光晕（不画光锥：灯与纸幕之间隔着木框下横梁，光锥会压在横梁上） */
        lamp(ctx, lamp, flicker, opts) {
            const { movable, selected, clock } = opts;
            const r = lampRect(lamp);
            const fx = lamp.x;
            const fy = lamp.y;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            // 桌面上的暖光
            const pool = ctx.createRadialGradient(fx, r.y + r.h * 0.55, 4, fx, r.y + r.h * 0.55, 150);
            pool.addColorStop(0, `rgba(255,170,90,${0.22 * flicker})`);
            pool.addColorStop(1, 'rgba(255,150,70,0)');
            ctx.fillStyle = pool;
            ctx.fillRect(fx - 160, r.y, 320, r.h);
            ctx.restore();

            if (movable) {
                ctx.save();
                ctx.strokeStyle = selected ? 'rgba(255,215,154,0.85)' : `rgba(255,215,154,${0.3 + 0.16 * Math.sin(clock * 2.4)})`;
                ctx.setLineDash([3, 5]);
                ctx.lineWidth = 1.3;
                ctx.beginPath();
                ctx.ellipse(fx, fy, r.w * 0.62, r.w * 0.62, 0, 0, TAU);
                ctx.stroke();
                ctx.restore();
            }

            ['lampBase', 'lampGlass', 'lampShade'].forEach((key) => {
                const im = img[key];
                if (!im) return;
                // 整幅位图里只取灯的并集包围盒，按火焰点放到舞台上
                ctx.drawImage(im, LAMP_ART.x, LAMP_ART.y, LAMP_ART.w, LAMP_ART.h, r.x, r.y, r.w, r.h);
            });

            // 灯罩透光：火焰在罩内，闪烁体现在罩面亮度上
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const inner = ctx.createRadialGradient(fx, fy, 2, fx, fy, r.w * 0.55);
            inner.addColorStop(0, `rgba(255,236,190,${0.55 * flicker})`);
            inner.addColorStop(0.45, `rgba(255,190,110,${0.22 * flicker})`);
            inner.addColorStop(1, 'rgba(255,170,90,0)');
            ctx.fillStyle = inner;
            ctx.fillRect(fx - r.w * 0.6, fy - r.w * 0.6, r.w * 1.2, r.w * 1.2);
            const bloom = ctx.createRadialGradient(fx, fy, 6, fx, fy, 170);
            bloom.addColorStop(0, `rgba(255,210,150,${0.30 * flicker})`);
            bloom.addColorStop(0.3, `rgba(255,160,80,${0.12 * flicker})`);
            bloom.addColorStop(1, 'rgba(255,130,50,0)');
            ctx.fillStyle = bloom;
            ctx.fillRect(fx - 180, fy - 180, 360, 360);
            ctx.restore();
        },

        /** 萤火光尘：多在纸幕外漂，不打扰谜题 */
        motes(ctx, motes, clock, dim) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            motes.forEach((m) => {
                const t = clock * m.v + m.p;
                const x = m.x + Math.sin(t * 1.3) * 22;
                const y = m.y + Math.cos(t * 0.9) * 16;
                const tw = 0.5 + 0.5 * Math.sin(t * 3.1 + m.p * 7);
                const a = (0.25 + 0.55 * tw) * (1 - dim * 0.4) * m.a;
                const rr = m.r * (0.8 + 0.4 * tw);
                const g = ctx.createRadialGradient(x, y, 0, x, y, rr * 4);
                g.addColorStop(0, `rgba(255,226,160,${a})`);
                g.addColorStop(0.25, `rgba(255,190,100,${a * 0.45})`);
                g.addColorStop(1, 'rgba(255,170,80,0)');
                ctx.fillStyle = g;
                ctx.fillRect(x - rr * 4, y - rr * 4, rr * 8, rr * 8);
            });
            ctx.restore();
        },
    };
}

/**
 * 剪纸镂空（纯装饰，只画在纸片本体上；影子与判定只认外轮廓）。
 * 按子形状的主轴自动生成：细长的（叶、翼、身）沿主轴开成对的叶脉孔，
 * 圆的（头、团花片）开一圈花瓣孔 + 花心。孔一律验证落在轮廓内并留出纸边。
 * 输入输出都是本地坐标（影子尺度）。
 */
export function fretwork(polys, pointInPoly) {
    const holes = [];
    const inside = (poly, pts, margin) => pts.every(([x, y]) => pointInPoly(x, y, poly)
        && pointInPoly(x + margin, y, poly) && pointInPoly(x - margin, y, poly)
        && pointInPoly(x, y + margin, poly) && pointInPoly(x, y - margin, poly));
    const leafHole = (cx, cy, ang, len, w) => {
        const pts = [];
        for (let i = 0; i <= 8; i++) {
            const t = i / 8;
            pts.push([t * len, -Math.sin(Math.PI * t) * w / 2]);
        }
        for (let i = 7; i >= 1; i--) {
            const t = i / 8;
            pts.push([t * len, Math.sin(Math.PI * t) * w / 2]);
        }
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        return pts.map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
    };
    polys.forEach((poly) => {
        let cx = 0;
        let cy = 0;
        poly.forEach(([x, y]) => { cx += x; cy += y; });
        cx /= poly.length;
        cy /= poly.length;
        let sxx = 0;
        let syy = 0;
        let sxy = 0;
        poly.forEach(([x, y]) => {
            sxx += (x - cx) ** 2;
            syy += (y - cy) ** 2;
            sxy += (x - cx) * (y - cy);
        });
        const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
        const ux = Math.cos(ang);
        const uy = Math.sin(ang);
        let a0 = Infinity; let a1 = -Infinity; let b0 = Infinity; let b1 = -Infinity;
        poly.forEach(([x, y]) => {
            const a = (x - cx) * ux + (y - cy) * uy;
            const b = -(x - cx) * uy + (y - cy) * ux;
            a0 = Math.min(a0, a); a1 = Math.max(a1, a);
            b0 = Math.min(b0, b); b1 = Math.max(b1, b);
        });
        const len = a1 - a0;
        const wid = b1 - b0;
        if (wid < 12 || len * wid < 500) return;
        const margin = 2;
        if (len / wid > 1.7) {
            // 叶脉：中线两侧成对的斜孔，朝向尖端
            const n = Math.max(2, Math.min(6, Math.floor(len / 22)));
            const hl = Math.min(wid * 0.34, 18);
            const hw = Math.max(2.5, hl * 0.32);
            for (let i = 0; i < n; i++) {
                const t = (i + 0.8) / (n + 0.6);
                const along = a0 + len * t;
                const px = cx + ux * along;
                const py = cy + uy * along;
                [-1, 1].forEach((side) => {
                    const dir = ang + side * 0.62;
                    const ox = px - uy * side * 1.8;
                    const oy = py + ux * side * 1.8;
                    const h = leafHole(ox, oy, dir, hl * (1 - Math.abs(t - 0.5) * 0.6), hw);
                    if (inside(poly, h, margin)) holes.push(h);
                });
            }
        } else {
            // 团花：一圈花瓣孔 + 花心
            const R = Math.min(len, wid) / 2;
            const petals = R > 20 ? 8 : 6;
            const r0 = R * 0.2;
            const pl = R * 0.42;
            const pw = Math.max(2.5, R * 0.17);
            for (let k = 0; k < petals; k++) {
                const a = ang + (k / petals) * TAU;
                const h = leafHole(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, a, pl, pw);
                if (inside(poly, h, margin)) holes.push(h);
            }
            const dot = [];
            const rd = Math.max(1.6, R * 0.08);
            for (let k = 0; k < 10; k++) dot.push([cx + Math.cos((k / 10) * TAU) * rd, cy + Math.sin((k / 10) * TAU) * rd]);
            if (inside(poly, dot, margin)) holes.push(dot);
        }
    });
    return holes;
}
