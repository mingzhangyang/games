/**
 * 影织 Shadow Loom — 舞台美术分层（设计方案 §15 的分层清单）
 * =============================================================
 * 静态层离屏缓存（按设备像素重建一次），动态层每帧画：
 *
 *   back   房间暗场 + 散景光点 + 纸幕外溢暖光 + 雕花木框 + 藤蔓      （静态，缓存）
 *   paper  纸幕：纤维 / 不规则纸边 / 纸内植物暗纹                     （静态，缓存）
 *          + 灯光透射：中心过曝、边缘橙褐，跟着灯走                    （动态）
 *   rail   横杆与丝线挂点                                               （动态透明度）
 *   table  铜盘 + 灯下反光                                             （缓存 + 动态反光）
 *   lamp   铜灯玻璃罩 + 火苗 + 光晕                                    （动态）
 *   front  前景书本 / 卡片 / 角落植物剪影                              （静态，缓存）
 *   motes  光尘萤点                                                    （动态）
 *
 * 第二步（美术分层位图）：把位图登记进 ART（1080×1920，与 480×854 逻辑场同为 9:16），
 * 对应层就改为贴图、不再程序绘制。**只登记真实存在的文件**：缺文件会 404，
 * 校验器把控制台错误当失败。
 *   ART.back / ART.front  整幅透明位图（纸幕窗口处透明）
 *   ART.paper             纸幕区域的纸张纹理（覆盖 SCREEN 矩形）
 *   ART.lamp              灯的外形（玻璃与火苗仍由代码画，保证发光与闪烁）
 */

export const ART = {};

const TAU = Math.PI * 2;

/** 确定性随机（静态层每次重建结果一致） */
function rng(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

function loadImage(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

/** 一片叶子（尖头椭圆），原点在叶柄 */
function leaf(g, x, y, ang, len, w) {
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(len * 0.35, -w, len, 0);
    g.quadraticCurveTo(len * 0.35, w, 0, 0);
    g.fill();
    g.restore();
}

/** 一条挂满叶子的藤：沿二次曲线交替长叶 */
function vine(g, pts, opts) {
    const { color, rim, leafLen = 16, leafW = 6, every = 11, seed = 1, width = 1.6 } = opts;
    const rnd = rng(seed);
    const [a, c, b] = pts;
    const at = (t) => [
        (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0],
        (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1],
    ];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - a[0], c[1] - a[1]) * 0.3;
    g.strokeStyle = color;
    g.lineWidth = width;
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.quadraticCurveTo(c[0], c[1], b[0], b[1]);
    g.stroke();
    const n = Math.max(3, Math.floor(len / every));
    for (let i = 1; i <= n; i++) {
        const t = i / (n + 1);
        const [x, y] = at(t);
        const [x2, y2] = at(Math.min(1, t + 0.01));
        const dir = Math.atan2(y2 - y, x2 - x);
        const side = i % 2 ? 1 : -1;
        const l = leafLen * (0.7 + rnd() * 0.5) * (1 - t * 0.35);
        const ang = dir + side * (0.7 + rnd() * 0.5);
        g.fillStyle = color;
        leaf(g, x, y, ang, l, leafW * (0.8 + rnd() * 0.4));
        if (rim) {
            g.fillStyle = rim;
            leaf(g, x, y, ang, l * 0.92, leafW * 0.3);
        }
    }
}

/** 蕨类 / 大叶剪影（前景角落） */
function frond(g, x, y, ang, len, leaves, color, rim) {
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    g.strokeStyle = color;
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(len * 0.5, -len * 0.08, len, -len * 0.02);
    g.stroke();
    for (let i = 1; i <= leaves; i++) {
        const t = i / (leaves + 1);
        const px = len * t;
        const py = -len * 0.08 * Math.sin(Math.PI * t);
        const l = len * 0.28 * (1 - t * 0.6);
        g.fillStyle = color;
        leaf(g, px, py, -1.0, l, l * 0.32);
        leaf(g, px, py, 1.0, l, l * 0.32);
        if (rim) {
            g.fillStyle = rim;
            leaf(g, px, py, -1.0, l * 0.9, l * 0.08);
        }
    }
    g.restore();
}

export function createScene({ W, H, SCREEN, RAIL_Y, LAMP_BOX }) {
    const S = SCREEN;
    const FRAME = 14;              // 木框宽
    const TRAY = { x: 240, y: (LAMP_BOX.y0 + LAMP_BOX.y1) / 2 + 26, rx: 186, ry: 40 };
    const layers = { back: null, paper: null, table: null, front: null };
    const images = {};
    let scale = 0;
    let paperEdge = [];

    Object.entries(ART).forEach(([k, src]) => {
        loadImage(src).then((img) => {
            if (!img) return;
            images[k] = img;
            scale = 0;   // 位图到位后下一帧重建缓存
        });
    });

    function makeLayer(draw) {
        const c = document.createElement('canvas');
        c.width = Math.round(W * scale);
        c.height = Math.round(H * scale);
        const g = c.getContext('2d');
        g.setTransform(scale, 0, 0, scale, 0, 0);
        draw(g);
        return c;
    }

    /* ── back：房间 + 散景 + 暖光外溢 + 木框 + 藤蔓 ── */
    function drawBackLayer(g) {
        if (images.back) {
            g.drawImage(images.back, 0, 0, W, H);
            return;
        }
        const bg = g.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#070a17');
        bg.addColorStop(0.45, '#0d1227');
        bg.addColorStop(0.75, '#110f1a');
        bg.addColorStop(1, '#070608');
        g.fillStyle = bg;
        g.fillRect(0, 0, W, H);
        // 纸幕的暖光溢到墙上
        const spill = g.createRadialGradient(W / 2, S.y + S.h * 0.62, 60, W / 2, S.y + S.h * 0.62, 360);
        spill.addColorStop(0, 'rgba(255,170,80,0.22)');
        spill.addColorStop(0.5, 'rgba(200,110,50,0.08)');
        spill.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = spill;
        g.fillRect(0, 0, W, H);
        // 少量青绿环境层次
        const teal = g.createRadialGradient(20, 60, 4, 20, 60, 200);
        teal.addColorStop(0, 'rgba(90,160,150,0.12)');
        teal.addColorStop(1, 'rgba(90,160,150,0)');
        g.fillStyle = teal;
        g.fillRect(0, 0, W, H);
        // 散景光点
        const rnd = rng(11);
        g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 26; i++) {
            const x = rnd() * W;
            const y = 20 + rnd() * (H * 0.72);
            if (x > S.x - 10 && x < S.x + S.w + 10 && y > S.y - 10 && y < S.y + S.h + 10) continue;
            const r = 2 + rnd() * 9;
            const warm = rnd() < 0.8;
            const a = 0.10 + rnd() * 0.22;
            const b = g.createRadialGradient(x, y, 0, x, y, r);
            b.addColorStop(0, warm ? `rgba(255,196,120,${a})` : `rgba(120,200,190,${a * 0.8})`);
            b.addColorStop(0.6, warm ? `rgba(255,170,90,${a * 0.5})` : `rgba(90,170,160,${a * 0.4})`);
            b.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = b;
            g.beginPath();
            g.arc(x, y, r, 0, TAU);
            g.fill();
        }
        g.globalCompositeOperation = 'source-over';
        // 左上垂下的枝叶
        vine(g, [[-6, 20], [70, 30], [118, 96]], { color: '#0c0f0c', rim: 'rgba(255,170,90,0.10)', leafLen: 20, leafW: 7, every: 10, seed: 3, width: 2.2 });
        vine(g, [[-4, 70], [30, 110], [22, 190]], { color: '#0d100d', leafLen: 18, leafW: 7, every: 9, seed: 5 });
        vine(g, [[W + 4, 30], [W - 70, 40], [W - 96, 90]], { color: '#0c0f0c', rim: 'rgba(255,170,90,0.08)', leafLen: 17, leafW: 6, every: 11, seed: 7 });
        drawFrame(g);
    }

    function drawFrame(g) {
        const x0 = S.x - FRAME;
        const y0 = S.y - FRAME;
        const w = S.w + FRAME * 2;
        const h = S.h + FRAME * 2;
        // 立柱一直落到桌面
        const post = g.createLinearGradient(0, 0, 10, 0);
        post.addColorStop(0, '#2a1a10');
        post.addColorStop(1, '#4a3120');
        g.fillStyle = '#1e140d';
        g.fillRect(x0 + 6, y0 + h - 4, 10, TRAY.y - (y0 + h) + 6);
        g.fillRect(x0 + w - 16, y0 + h - 4, 10, TRAY.y - (y0 + h) + 6);
        // 框体（木纹斜面：外暗内亮）
        const wood = g.createLinearGradient(x0, y0, x0 + w, y0 + h);
        wood.addColorStop(0, '#3b2717');
        wood.addColorStop(0.5, '#52361f');
        wood.addColorStop(1, '#2c1c11');
        g.fillStyle = wood;
        g.beginPath();
        g.rect(x0, y0, w, h);
        g.rect(S.x, S.y, S.w, S.h);
        g.fill('evenodd');
        // 木纹
        const rnd = rng(23);
        g.save();
        g.beginPath();
        g.rect(x0, y0, w, h);
        g.rect(S.x, S.y, S.w, S.h);
        g.clip('evenodd');
        g.strokeStyle = 'rgba(20,12,6,0.45)';
        g.lineWidth = 0.7;
        for (let i = 0; i < 60; i++) {
            const y = y0 + rnd() * h;
            const x = x0 + rnd() * w;
            g.beginPath();
            g.moveTo(x - 30, y);
            g.bezierCurveTo(x - 10, y + (rnd() - 0.5) * 3, x + 10, y + (rnd() - 0.5) * 3, x + 30, y);
            g.stroke();
        }
        g.restore();
        // 斜面高光 / 内缘暗线
        g.strokeStyle = 'rgba(255,196,130,0.28)';
        g.lineWidth = 1;
        g.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
        g.strokeStyle = 'rgba(255,176,96,0.35)';
        g.strokeRect(S.x - 3.5, S.y - 3.5, S.w + 7, S.h + 7);
        g.strokeStyle = 'rgba(0,0,0,0.6)';
        g.lineWidth = 2;
        g.strokeRect(S.x - 1, S.y - 1, S.w + 2, S.h + 2);
        // 四角雕花：铜角片 + 卷草
        [[x0, y0, 1, 1], [x0 + w, y0, -1, 1], [x0, y0 + h, 1, -1], [x0 + w, y0 + h, -1, -1]].forEach(([cx, cy, sx, sy]) => {
            g.save();
            g.translate(cx, cy);
            g.scale(sx, sy);
            const br = g.createLinearGradient(0, 0, 26, 26);
            br.addColorStop(0, '#e0b070');
            br.addColorStop(1, '#7a4f26');
            g.fillStyle = br;
            g.beginPath();
            g.moveTo(0, 0);
            g.lineTo(26, 0);
            g.quadraticCurveTo(14, 4, 12, 12);
            g.quadraticCurveTo(4, 14, 0, 26);
            g.closePath();
            g.fill();
            g.strokeStyle = 'rgba(60,34,14,0.8)';
            g.lineWidth = 1;
            g.beginPath();
            g.arc(9, 9, 4, 0, TAU);
            g.stroke();
            g.fillStyle = '#f3cf92';
            g.beginPath();
            g.arc(9, 9, 1.6, 0, TAU);
            g.fill();
            g.restore();
        });
        // 顶部与侧边的卷草纹（框上的浅浮雕）
        g.strokeStyle = 'rgba(210,150,90,0.30)';
        g.lineWidth = 1;
        for (let x = x0 + 40; x < x0 + w - 40; x += 34) {
            g.beginPath();
            g.moveTo(x, y0 + FRAME / 2);
            g.bezierCurveTo(x + 6, y0 + 2, x + 12, y0 + FRAME - 2, x + 17, y0 + FRAME / 2);
            g.bezierCurveTo(x + 22, y0 + 2, x + 28, y0 + FRAME - 2, x + 34, y0 + FRAME / 2);
            g.stroke();
        }
        // 藤蔓缠框
        vine(g, [[x0 - 4, y0 + h + 10], [x0 - 20, y0 + h * 0.55], [x0 + 6, y0 + 40]], { color: '#0f130e', rim: 'rgba(255,170,90,0.16)', leafLen: 15, leafW: 6, every: 12, seed: 9 });
        vine(g, [[x0 + w + 4, y0 + h + 6], [x0 + w + 22, y0 + h * 0.6], [x0 + w - 6, y0 + 90]], { color: '#0f130e', rim: 'rgba(255,170,90,0.14)', leafLen: 14, leafW: 6, every: 13, seed: 13 });
        vine(g, [[x0 + 30, y0 - 2], [x0 + 70, y0 - 16], [x0 + 130, y0 + 2]], { color: '#10140f', rim: 'rgba(255,170,90,0.12)', leafLen: 12, leafW: 5, every: 10, seed: 17 });
    }

    /* ── paper：纸幕纤维 / 纸边 / 纸内暗纹 ── */
    function drawPaperLayer(g) {
        const rnd = rng(7);
        const edge = [];
        const step = 8;
        const j = () => (rnd() - 0.2) * 1.6;
        for (let x = 0; x <= S.w; x += step) edge.push([S.x + x, S.y - j()]);
        for (let y = step; y <= S.h; y += step) edge.push([S.x + S.w + j(), S.y + y]);
        for (let x = S.w - step; x >= 0; x -= step) edge.push([S.x + x, S.y + S.h + j()]);
        for (let y = S.h - step; y > 0; y -= step) edge.push([S.x - j(), S.y + y]);
        paperEdge = edge;
        g.beginPath();
        edge.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.closePath();
        g.fillStyle = '#f1dfbd';
        g.fill();
        g.save();
        g.clip();
        if (images.paper) {
            g.drawImage(images.paper, S.x, S.y, S.w, S.h);
        } else {
            for (let i = 0; i < 1400; i++) {
                const x = S.x + rnd() * S.w;
                const y = S.y + rnd() * S.h;
                const a = rnd() * Math.PI;
                const len = 4 + rnd() * 22;
                g.strokeStyle = rnd() < 0.55 ? 'rgba(140,96,54,0.10)' : 'rgba(255,250,236,0.30)';
                g.lineWidth = 0.35 + rnd() * 0.5;
                g.beginPath();
                g.moveTo(x, y);
                g.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + (rnd() - 0.5) * 5, y + Math.sin(a) * len * 0.5 + (rnd() - 0.5) * 5, x + Math.cos(a) * len, y + Math.sin(a) * len);
                g.stroke();
            }
            // 纸内透出的植物暗纹（幕后远处的花草，只在下部两角）
            g.fillStyle = 'rgba(96,60,30,0.16)';
            g.strokeStyle = 'rgba(96,60,30,0.16)';
            const plant = (bx, dir, hgt, sd) => {
                const r2 = rng(sd);
                for (let k = 0; k < 5; k++) {
                    const x = bx + dir * k * 14;
                    frond(g, x, S.y + S.h + 4, -Math.PI / 2 + dir * (0.15 + r2() * 0.35), hgt * (0.55 + r2() * 0.5), 7, 'rgba(96,60,30,0.14)', null);
                }
                for (let k = 0; k < 6; k++) {
                    const x = bx + dir * (10 + r2() * 70);
                    const y = S.y + S.h - 30 - r2() * hgt * 0.8;
                    g.beginPath();
                    g.arc(x, y, 2.5 + r2() * 3, 0, TAU);
                    g.fill();
                }
            };
            plant(S.x + 8, 1, 110, 31);
            plant(S.x + S.w - 8, -1, 96, 37);
        }
        g.restore();
    }

    /* ── table：铜盘 ── */
    function drawTableLayer(g) {
        const top = S.y + S.h + FRAME + 8;
        const tg = g.createLinearGradient(0, top, 0, H);
        tg.addColorStop(0, '#20160f');
        tg.addColorStop(1, '#0a0705');
        g.fillStyle = tg;
        g.fillRect(0, top, W, H - top);
        g.strokeStyle = 'rgba(200,146,90,0.18)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(0, top + 0.5);
        g.lineTo(W, top + 0.5);
        g.stroke();
        // 铜盘：外沿 → 盘面 → 同心纹
        const T = TRAY;
        g.fillStyle = '#3a2413';
        g.beginPath();
        g.ellipse(T.x, T.y + 5, T.rx + 4, T.ry + 5, 0, 0, TAU);
        g.fill();
        const plate = g.createLinearGradient(0, T.y - T.ry, 0, T.y + T.ry);
        plate.addColorStop(0, '#8a5a2c');
        plate.addColorStop(0.5, '#5a3818');
        plate.addColorStop(1, '#2e1c0c');
        g.fillStyle = plate;
        g.beginPath();
        g.ellipse(T.x, T.y, T.rx, T.ry, 0, 0, TAU);
        g.fill();
        g.strokeStyle = 'rgba(255,200,130,0.45)';
        g.lineWidth = 1.2;
        g.stroke();
        [0.84, 0.66, 0.46].forEach((k, i) => {
            g.strokeStyle = `rgba(255,190,120,${0.18 - i * 0.04})`;
            g.lineWidth = 0.8;
            g.beginPath();
            g.ellipse(T.x, T.y + 1, T.rx * k, T.ry * k, 0, 0, TAU);
            g.stroke();
        });
    }

    /* ── front：书本 / 卡片 / 前景植物 ── */
    function drawFrontLayer(g) {
        if (images.front) {
            g.drawImage(images.front, 0, 0, W, H);
            return;
        }
        const base = TRAY.y + 26;
        // 左下书堆
        const book = (x, y, w, h, ang, col) => {
            g.save();
            g.translate(x, y);
            g.rotate(ang);
            g.fillStyle = col;
            g.fillRect(-w / 2, -h / 2, w, h);
            g.fillStyle = 'rgba(236,214,172,0.55)';
            g.fillRect(-w / 2 + 3, -h / 2 + 2, w - 6, 2);
            g.strokeStyle = 'rgba(255,180,100,0.35)';
            g.lineWidth = 0.8;
            g.strokeRect(-w / 2 + 0.5, -h / 2 + 0.5, w - 1, h - 1);
            g.restore();
        };
        book(46, base + 40, 110, 20, -0.04, '#2a1712');
        book(52, base + 20, 96, 18, 0.03, '#1d2226');
        book(40, base + 2, 84, 16, -0.07, '#35201a');
        // 右下散落的卡片
        const card = (x, y, ang) => {
            g.save();
            g.translate(x, y);
            g.rotate(ang);
            g.fillStyle = '#2b2118';
            g.fillRect(-34, -22, 68, 44);
            g.strokeStyle = 'rgba(255,200,140,0.35)';
            g.lineWidth = 1;
            g.strokeRect(-31, -19, 62, 38);
            g.strokeStyle = 'rgba(255,200,140,0.18)';
            g.beginPath();
            g.arc(0, 0, 9, 0, TAU);
            g.stroke();
            g.restore();
        };
        card(W - 62, base + 44, -0.28);
        card(W - 30, base + 30, 0.18);
        card(W - 96, base + 66, 0.08);
        // 角落植物剪影（最前景，最暗）
        frond(g, -10, H + 6, -1.15, 170, 8, '#07080a', 'rgba(255,170,90,0.10)');
        frond(g, 10, H + 10, -0.8, 130, 7, '#08090b', null);
        frond(g, W + 12, H + 8, Math.PI + 1.05, 150, 7, '#07080a', 'rgba(255,170,90,0.08)');
        // 底部暗角
        const vg = g.createLinearGradient(0, H - 90, 0, H);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.55)');
        g.fillStyle = vg;
        g.fillRect(0, H - 90, W, 90);
    }

    function ensure(renderScale) {
        if (scale === renderScale && layers.back) return;
        scale = renderScale;
        layers.back = makeLayer(drawBackLayer);
        layers.paper = makeLayer(drawPaperLayer);
        layers.table = makeLayer(drawTableLayer);
        layers.front = makeLayer(drawFrontLayer);
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
        paperEdge.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.clip();
    }

    return {
        TRAY,
        ensure,
        clipPaper,
        back(ctx, rs) { blit(ctx, layers.back, rs); },
        front(ctx, rs) { blit(ctx, layers.front, rs); },

        /** 纸幕 + 灯光透射：中心过曝、边缘橙褐 */
        paper(ctx, rs, lightX, lightY, boost, flicker) {
            blit(ctx, layers.paper, rs);
            ctx.save();
            clipPaper(ctx);
            ctx.globalCompositeOperation = 'multiply';
            const falloff = ctx.createRadialGradient(lightX, lightY, 40, lightX, lightY, 400);
            falloff.addColorStop(0, 'rgb(255,255,255)');
            falloff.addColorStop(0.45, 'rgb(250,226,190)');
            falloff.addColorStop(0.8, 'rgb(214,150,86)');
            falloff.addColorStop(1, 'rgb(150,86,40)');
            ctx.fillStyle = falloff;
            ctx.fillRect(S.x, S.y, S.w, S.h);
            ctx.globalCompositeOperation = 'lighter';
            const hot = ctx.createRadialGradient(lightX, lightY, 0, lightX, lightY, 190);
            hot.addColorStop(0, `rgba(255,236,200,${(0.26 + boost) * flicker})`);
            hot.addColorStop(0.5, `rgba(255,200,130,${0.08 + boost * 0.5})`);
            hot.addColorStop(1, 'rgba(255,190,110,0)');
            ctx.fillStyle = hot;
            ctx.fillRect(S.x, S.y, S.w, S.h);
            ctx.restore();
        },

        rail(ctx, alpha) {
            ctx.save();
            ctx.globalAlpha = alpha;
            const g = ctx.createLinearGradient(0, RAIL_Y - 5, 0, RAIL_Y + 5);
            g.addColorStop(0, '#5e3e24');
            g.addColorStop(0.45, '#c08650');
            g.addColorStop(1, '#3e2716');
            ctx.fillStyle = g;
            ctx.fillRect(S.x - 22, RAIL_Y - 3.5, S.w + 44, 7);
            [S.x - 24, S.x + S.w + 24].forEach((x) => {
                const f = ctx.createRadialGradient(x - 2, RAIL_Y - 2, 1, x, RAIL_Y, 7);
                f.addColorStop(0, '#ffe0a6');
                f.addColorStop(1, '#8a5a2e');
                ctx.fillStyle = f;
                ctx.beginPath();
                ctx.arc(x, RAIL_Y, 6.5, 0, TAU);
                ctx.fill();
            });
            ctx.restore();
        },

        /** 铜盘（缓存）+ 灯下的动态反光 */
        table(ctx, rs, lamp, flicker) {
            blit(ctx, layers.table, rs);
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const T = TRAY;
            const rx = lamp.x;
            const ry = Math.min(T.y + T.ry * 0.5, lamp.y + 14);
            const refl = ctx.createRadialGradient(rx, ry, 2, rx, ry, 120);
            refl.addColorStop(0, `rgba(255,200,120,${0.55 * flicker})`);
            refl.addColorStop(0.3, `rgba(255,160,80,${0.20 * flicker})`);
            refl.addColorStop(1, 'rgba(255,150,70,0)');
            ctx.fillStyle = refl;
            ctx.beginPath();
            ctx.ellipse(T.x, T.y, T.rx, T.ry, 0, 0, TAU);
            ctx.fill();
            ctx.restore();
        },

        /** 铜灯：底座 → 玻璃球 → 铜笼 → 顶盖与提环 → 火苗 → 光晕 */
        lamp(ctx, lamp, flicker, opts) {
            const { movable, selected, clock } = opts;
            const x = lamp.x;
            const y = lamp.y;
            const gy = y - 22;       // 玻璃球心
            ctx.save();
            // 大光晕（bloom）
            ctx.globalCompositeOperation = 'lighter';
            const bloom = ctx.createRadialGradient(x, gy, 4, x, gy, 150);
            bloom.addColorStop(0, `rgba(255,220,160,${0.55 * flicker})`);
            bloom.addColorStop(0.18, `rgba(255,170,80,${0.30 * flicker})`);
            bloom.addColorStop(0.5, `rgba(255,130,50,${0.08 * flicker})`);
            bloom.addColorStop(1, 'rgba(255,120,40,0)');
            ctx.fillStyle = bloom;
            ctx.fillRect(x - 160, gy - 160, 320, 320);
            // 投向纸幕的光锥
            // 光锥只画在灯与纸幕下沿之间（压到纸上会留下一道硬边斜线）
            const top = S.y + S.h + 14;
            const cone = ctx.createLinearGradient(0, gy, 0, top);
            cone.addColorStop(0, `rgba(255,190,110,${0.16 * flicker})`);
            cone.addColorStop(1, 'rgba(255,190,110,0.02)');
            ctx.fillStyle = cone;
            const spread = (gy - top) * 1.1;
            ctx.beginPath();
            ctx.moveTo(x - 14, gy - 12);
            ctx.lineTo(x + 14, gy - 12);
            ctx.lineTo(x + spread, top);
            ctx.lineTo(x - spread, top);
            ctx.closePath();
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';

            if (movable) {
                ctx.strokeStyle = selected ? 'rgba(255,215,154,0.85)' : `rgba(255,215,154,${0.28 + 0.16 * Math.sin(clock * 2.4)})`;
                ctx.setLineDash([3, 5]);
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.ellipse(x, y + 14, 40, 10, 0, 0, TAU);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            // 影子与底座
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.beginPath();
            ctx.ellipse(x, y + 14, 26, 6, 0, 0, TAU);
            ctx.fill();
            const brass = (x0, x1) => {
                const b = ctx.createLinearGradient(x0, 0, x1, 0);
                b.addColorStop(0, '#6a4220');
                b.addColorStop(0.35, '#e9bc7a');
                b.addColorStop(0.6, '#b07a42');
                b.addColorStop(1, '#4e3016');
                return b;
            };
            ctx.fillStyle = brass(x - 20, x + 20);
            ctx.beginPath();
            ctx.ellipse(x, y + 10, 20, 5, 0, 0, TAU);
            ctx.fill();
            ctx.fillRect(x - 15, y + 1, 30, 9);
            ctx.beginPath();
            ctx.ellipse(x, y + 1, 15, 4, 0, 0, TAU);
            ctx.fill();
            // 玻璃球
            const glass = ctx.createRadialGradient(x, gy + 2, 2, x, gy, 22);
            glass.addColorStop(0, '#fffbe9');
            glass.addColorStop(0.35, `rgba(255,214,140,${0.95 * flicker})`);
            glass.addColorStop(0.8, 'rgba(236,140,60,0.85)');
            glass.addColorStop(1, 'rgba(150,70,24,0.9)');
            ctx.fillStyle = glass;
            ctx.beginPath();
            ctx.ellipse(x, gy, 19, 22, 0, 0, TAU);
            ctx.fill();
            // 玻璃高光
            ctx.strokeStyle = 'rgba(255,255,255,0.45)';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.ellipse(x - 7, gy - 6, 5, 10, 0.3, Math.PI * 1.05, Math.PI * 1.6);
            ctx.stroke();
            // 铜笼：经线 + 纬圈
            ctx.strokeStyle = '#a8713c';
            ctx.lineWidth = 1.3;
            [-1, -0.45, 0.45, 1].forEach((k) => {
                ctx.beginPath();
                ctx.moveTo(x, gy - 22);
                ctx.bezierCurveTo(x + k * 26, gy - 16, x + k * 26, gy + 16, x, gy + 22);
                ctx.stroke();
            });
            ctx.beginPath();
            ctx.ellipse(x, gy, 19, 4, 0, 0, TAU);
            ctx.stroke();
            // 顶盖 + 尖顶 + 提环
            ctx.fillStyle = brass(x - 13, x + 13);
            ctx.beginPath();
            ctx.moveTo(x - 13, gy - 18);
            ctx.quadraticCurveTo(x, gy - 34, x + 13, gy - 18);
            ctx.closePath();
            ctx.fill();
            ctx.fillRect(x - 2, gy - 38, 4, 8);
            ctx.strokeStyle = '#c28a4e';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(x, gy - 44, 6, 0, TAU);
            ctx.stroke();
            // 火苗
            const fh = 10 * flicker;
            const fl = ctx.createLinearGradient(0, gy - 4 - fh, 0, gy + 8);
            fl.addColorStop(0, '#ffffff');
            fl.addColorStop(0.6, '#fff1b0');
            fl.addColorStop(1, '#ffb347');
            ctx.fillStyle = fl;
            ctx.beginPath();
            ctx.moveTo(x, gy - 4 - fh);
            ctx.quadraticCurveTo(x + 5, gy + 2, x, gy + 8);
            ctx.quadraticCurveTo(x - 5, gy + 2, x, gy - 4 - fh);
            ctx.fill();
            ctx.restore();
        },

        /** 萤火光尘：大多在纸幕外漂，不打扰谜题 */
        motes(ctx, motes, clock, dim) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            motes.forEach((m) => {
                const t = clock * m.v + m.p;
                const x = m.x + Math.sin(t * 1.3) * 22;
                const y = m.y + Math.cos(t * 0.9) * 16;
                const tw = 0.5 + 0.5 * Math.sin(t * 3.1 + m.p * 7);
                const a = (0.25 + 0.55 * tw) * (1 - dim * 0.4) * m.a;
                const r = m.r * (0.8 + 0.4 * tw);
                const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
                g.addColorStop(0, `rgba(255,226,160,${a})`);
                g.addColorStop(0.25, `rgba(255,190,100,${a * 0.45})`);
                g.addColorStop(1, 'rgba(255,170,80,0)');
                ctx.fillStyle = g;
                ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
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
        if (wid < 16 || len * wid < 900) return;
        const margin = 2.5;
        if (len / wid > 1.7) {
            // 叶脉：中线两侧成对的斜孔，朝向尖端
            const n = Math.max(2, Math.min(6, Math.floor(len / 26)));
            const hl = Math.min(wid * 0.34, 22);
            const hw = Math.max(3, hl * 0.32);
            for (let i = 0; i < n; i++) {
                const t = (i + 0.8) / (n + 0.6);
                const along = a0 + len * t;
                const px = cx + ux * along;
                const py = cy + uy * along;
                [-1, 1].forEach((side) => {
                    const dir = ang + side * 0.62;
                    const ox = px - uy * side * 2.2;
                    const oy = py + ux * side * 2.2;
                    const h = leafHole(ox, oy, dir, hl * (1 - Math.abs(t - 0.5) * 0.6), hw);
                    if (inside(poly, h, margin)) holes.push(h);
                });
            }
        } else {
            // 团花：一圈花瓣孔 + 花心
            const R = Math.min(len, wid) / 2;
            const petals = R > 26 ? 8 : 6;
            const r0 = R * 0.2;
            const pl = R * 0.42;
            const pw = Math.max(3, R * 0.17);
            for (let k = 0; k < petals; k++) {
                const a = ang + (k / petals) * Math.PI * 2;
                const h = leafHole(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, a, pl, pw);
                if (inside(poly, h, margin)) holes.push(h);
            }
            const dot = [];
            const rd = Math.max(2, R * 0.08);
            for (let k = 0; k < 10; k++) dot.push([cx + Math.cos((k / 10) * TAU) * rd, cy + Math.sin((k / 10) * TAU) * rd]);
            if (inside(poly, dot, margin)) holes.push(dot);
        }
    });
    return holes;
}
