/**
 * Lumen 元件画法：一组纯函数，只依赖传入的 ctx / 坐标 / 状态，不持有任何游戏状态。
 * 坐标全部是 560×560 逻辑像素（DPR 缩放由 board.js 的 setTransform 统一处理）。
 */
import { GRID_N } from '../model/beam.js';
import { CELL, H, W, cellCenter, idxCenter } from './geometry.js';

/** 联动组配色（按组序号取；同组 = 同色光环 + 虚线系绳） */
export const LINK_COLORS = ['#ffb547', '#ff7eb6', '#b18cff', '#7ee0ff'];
export const MIRROR_COLOR = '#8fb7ff';
export const linkColor = group => LINK_COLORS[group % LINK_COLORS.length];

/** 镜面字符 → 绘制角度（'/' 自左下到右上） */
export const mirrorAngle = ch => (ch === '/' ? -Math.PI / 4 : Math.PI / 4);

const STEP = { '>': [0, 1], 'v': [1, 0], '<': [0, -1], '^': [-1, 0] };

export function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

/** 折线总长与按弧长取点（光束流动动画用） */
function polylineGeom(pts) {
    const px = pts.map(([r, c]) => cellCenter(r, c));
    const segs = [];
    let total = 0;
    for (let i = 1; i < px.length; i++) {
        const dx = px[i].x - px[i - 1].x;
        const dy = px[i].y - px[i - 1].y;
        const len = Math.hypot(dx, dy);
        segs.push({ a: px[i - 1], b: px[i], len, acc: total });
        total += len;
    }
    return { px, segs, total };
}

function pointAtDist(geom, dist) {
    const d = ((dist % geom.total) + geom.total) % geom.total;
    for (const s of geom.segs) {
        if (d <= s.acc + s.len) {
            const k = (d - s.acc) / s.len;
            return { x: s.a.x + (s.b.x - s.a.x) * k, y: s.a.y + (s.b.y - s.a.y) * k };
        }
    }
    return geom.px[geom.px.length - 1];
}

/** 深空底 + 闪烁星点 */
export function drawBackdrop(ctx, stars, time) {
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0a0f2e');
    bg.addColorStop(0.55, '#0b1030');
    bg.addColorStop(1, '#0d1338');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    for (const st of stars) {
        ctx.globalAlpha = st.a * (0.75 + 0.25 * Math.sin(time * 0.8 + st.x));
        ctx.fillStyle = '#cdd8ff';
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

export function drawGridLines(ctx) {
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < GRID_N; i++) {
        ctx.moveTo(i * CELL, 0);
        ctx.lineTo(i * CELL, H);
        ctx.moveTo(0, i * CELL);
        ctx.lineTo(W, i * CELL);
    }
    ctx.stroke();
}

/** 光路经过的空格铺一层淡光底（增强「光走过了这里」的体感） */
export function drawLitFloor(ctx, lit) {
    ctx.fillStyle = 'rgba(125, 250, 208, 0.055)';
    for (let r = 0; r < GRID_N; r++) {
        for (let c = 0; c < GRID_N; c++) {
            if (lit[r * GRID_N + c]) {
                ctx.fillRect(c * CELL + 2, r * CELL + 2, CELL - 4, CELL - 4);
            }
        }
    }
}

export function drawRays(ctx, rays, time) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const geoms = [];
    for (const ray of rays) {
        if (ray.pts.length < 2) continue;
        const geom = polylineGeom(ray.pts);
        geoms.push(geom);
        ctx.beginPath();
        geom.px.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.shadowColor = 'rgba(125, 250, 208, 0.9)';
        ctx.shadowBlur = 14;
        ctx.strokeStyle = 'rgba(125, 250, 208, 0.5)';
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(240, 255, 250, 0.95)';
        ctx.lineWidth = 1.8;
        ctx.stroke();
    }
    // 流动光点：沿折线匀速推进（能量在光路里流动的体感）
    for (const geom of geoms) {
        const n = Math.max(1, Math.round(geom.total / 90));
        for (let k = 0; k < n; k++) {
            const p = pointAtDist(geom, time * 130 + k * (geom.total / n));
            ctx.fillStyle = 'rgba(220, 255, 245, 0.9)';
            ctx.shadowColor = 'rgba(125, 250, 208, 1)';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }
    ctx.restore();
}

/** 联动组的虚线系绳：同组镜面按行序依次相连 */
export function drawLinkTethers(ctx, links, time) {
    if (!links || !links.length) return;
    ctx.save();
    ctx.lineWidth = 1.6;
    ctx.setLineDash([3, 6]);
    ctx.lineDashOffset = -time * 12;
    links.forEach((group, gi) => {
        ctx.strokeStyle = linkColor(gi);
        ctx.globalAlpha = 0.32;
        ctx.beginPath();
        group.forEach((idx, i) => {
            const p = idxCenter(idx);
            if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
        });
        ctx.stroke();
    });
    ctx.restore();
}

export function drawWall(ctx, r, c) {
    const x = c * CELL, y = r * CELL;
    ctx.fillStyle = 'rgba(22, 28, 62, 0.95)';
    ctx.strokeStyle = 'rgba(154, 166, 216, 0.28)';
    ctx.lineWidth = 1.5;
    roundRectPath(ctx, x + 4, y + 4, CELL - 8, CELL - 8, 7);
    ctx.fill();
    ctx.stroke();
}

export function drawCrystal(ctx, r, c, lit, time) {
    const { x, y } = cellCenter(r, c);
    const s = CELL * 0.26;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    if (lit) {
        const pulse = 0.85 + 0.15 * Math.sin(time * 3 + (r + c));
        ctx.shadowColor = 'rgba(125, 250, 208, 0.95)';
        ctx.shadowBlur = 16 * pulse;
        ctx.fillStyle = '#eafff6';
        ctx.strokeStyle = '#7dfad0';
    } else {
        // 未点亮：淡青描边（「等着被照亮」），与紫黑色的暗晶区分开
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(125, 250, 208, 0.07)';
        ctx.strokeStyle = 'rgba(125, 250, 208, 0.42)';
    }
    ctx.lineWidth = 2;
    roundRectPath(ctx, -s, -s, s * 2, s * 2, 4);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

/** 暗晶：紫黑色晶体；被照到时转红、抖动、裂纹，提示「这里不该有光」 */
export function drawShadow(ctx, r, c, lit, time) {
    const { x, y } = cellCenter(r, c);
    const s = CELL * 0.26;
    ctx.save();
    if (lit) {
        const jitter = Math.sin(time * 60 + r * 7 + c) * 0.9;
        ctx.translate(x + jitter, y);
    } else {
        ctx.translate(x, y);
    }
    ctx.rotate(Math.PI / 4);
    if (lit) {
        const pulse = 0.75 + 0.25 * Math.sin(time * 9);
        ctx.shadowColor = 'rgba(255, 77, 109, 0.95)';
        ctx.shadowBlur = 18 * pulse;
        ctx.fillStyle = 'rgba(120, 18, 40, 0.95)';
        ctx.strokeStyle = '#ff4d6d';
    } else {
        ctx.shadowColor = 'rgba(138, 92, 255, 0.45)';
        ctx.shadowBlur = 8;
        ctx.fillStyle = 'rgba(16, 8, 30, 0.95)';
        ctx.strokeStyle = 'rgba(160, 120, 255, 0.75)';
    }
    ctx.lineWidth = 2;
    roundRectPath(ctx, -s, -s, s * 2, s * 2, 4);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 内核：暗时是一颗深色小核，亮时变成十字裂纹
    ctx.strokeStyle = lit ? 'rgba(255, 200, 210, 0.9)' : 'rgba(160, 120, 255, 0.5)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    if (lit) {
        ctx.moveTo(-s * 0.7, -s * 0.15); ctx.lineTo(s * 0.1, 0); ctx.lineTo(s * 0.6, s * 0.55);
        ctx.moveTo(s * 0.1, 0); ctx.lineTo(s * 0.2, -s * 0.7);
    } else {
        ctx.rect(-s * 0.32, -s * 0.32, s * 0.64, s * 0.64);
    }
    ctx.stroke();
    ctx.restore();
}

export function drawMirror(ctx, r, c, angle, hit) {
    const { x, y } = cellCenter(r, c);
    const half = CELL * 0.3;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.shadowColor = hit ? 'rgba(125, 250, 208, 0.9)' : 'rgba(90, 123, 255, 0.4)';
    ctx.shadowBlur = hit ? 14 : 7;
    ctx.strokeStyle = hit ? '#aefee0' : MIRROR_COLOR;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-half, 0);
    ctx.lineTo(half, 0);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-half, 0);
    ctx.lineTo(half, 0);
    ctx.stroke();
    ctx.restore();
}

/** 分光镜：半透明的金色玻璃片（双线 + 半透明填充），区别于实心镜面 */
export function drawSplitter(ctx, r, c, angle, hit) {
    const { x, y } = cellCenter(r, c);
    const half = CELL * 0.32;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.shadowColor = hit ? 'rgba(255, 217, 138, 0.95)' : 'rgba(255, 196, 92, 0.45)';
    ctx.shadowBlur = hit ? 14 : 7;
    ctx.fillStyle = hit ? 'rgba(255, 226, 160, 0.4)' : 'rgba(255, 210, 120, 0.2)';
    roundRectPath(ctx, -half, -3.6, half * 2, 7.2, 3);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = hit ? '#fff1c9' : '#ffd98a';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-half, -3.6); ctx.lineTo(half, -3.6);
    ctx.moveTo(-half, 3.6); ctx.lineTo(half, 3.6);
    ctx.stroke();
    // 中线点阵：光一半穿过、一半反射
    ctx.fillStyle = 'rgba(255, 245, 220, 0.9)';
    for (let k = -2; k <= 2; k++) {
        ctx.beginPath();
        ctx.arc(k * half * 0.4, 0, 1.2, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

/** 联动镜底座：组色光环 + 顶端小圆点（圆点数 = 组号 + 1，不只靠颜色区分） */
export function drawLinkRing(ctx, r, c, group) {
    const color = linkColor(group);
    const { x, y } = cellCenter(r, c);
    const rad = CELL * 0.4;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    for (let k = 0; k <= group; k++) {
        ctx.beginPath();
        ctx.arc(x - (group * 3.5) + k * 7, y - rad, 2.6, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

export function drawEmitter(ctx, r, c, ch) {
    const { x, y } = cellCenter(r, c);
    const s = CELL * 0.3;
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = 'rgba(125, 250, 208, 0.8)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = 'rgba(18, 30, 46, 0.95)';
    ctx.strokeStyle = '#7dfad0';
    ctx.lineWidth = 2;
    roundRectPath(ctx, -s, -s, s * 2, s * 2, 8);
    ctx.fill();
    ctx.stroke();
    // 出光口：指向发射方向的小三角
    const [dr, dc] = STEP[ch];
    const ux = dc, uy = dr;
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#aefee0';
    ctx.beginPath();
    ctx.moveTo(ux * s * 0.75, uy * s * 0.75);
    ctx.lineTo(ux * s * 0.1 - uy * s * 0.34, uy * s * 0.1 + ux * s * 0.34);
    ctx.lineTo(ux * s * 0.1 + uy * s * 0.34, uy * s * 0.1 - ux * s * 0.34);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}
