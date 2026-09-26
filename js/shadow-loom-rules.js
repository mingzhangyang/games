/**
 * 影织 Shadow Loom — 纯几何内核（无 DOM，Node 与浏览器共用）
 * =============================================================
 * 渲染、判定、关卡校验器（scripts/verify-shadow-loom-levels.mjs）都只走这里，
 * 保证「看到的影子」与「被判定的影子」是同一组多边形（设计方案 §6.1 / §8）。
 *
 * 投影模型（设计方案 §6.1，归一化 Zl = 0、Zs = 1）：
 *     S = L + (P − L) / Zp
 * 纸片形状以「幕布上影子的尺寸」定义（本地坐标，单位 = 舞台像素），因此
 *   · 影子顶点   = Sc + R(θ)·v，其中影子中心 Sc = L + (P − L) / z
 *   · 纸片顶点   = P  + R(θ)·(v·z)  —— 纸片本体比影子小 z 倍
 * 同样的拖动距离 d，影子移动 d / z：越靠近灯（z 越小）响应越大，这就是玩法核心。
 *
 * 灯：画面上的灯在底部托盘里（视觉坐标 lamp.x / lamp.y）；投影用的灯位
 * L = lampModel(lamp) 与视觉灯同 x，y 压到幕布下沿附近（风格化：真实比例下
 * 影子会整片飞出幕布）。拖灯同时改变所有影子，不同深度视差不同。
 */

export const STAGE = { w: 480, h: 720 };
/** 纸幕（可见影子区域 = 判定网格区域） */
export const SCREEN = { x: 40, y: 64, w: 400, h: 420 };
/** 判定网格：5px 一格 → 80 × 84 */
export const CELL = 5;
export const COLS = SCREEN.w / CELL;
export const ROWS = SCREEN.h / CELL;

/** 灯的视觉托盘范围与投影映射 */
export const LAMP_BOX = { x0: 72, x1: 408, y0: 572, y1: 652 };
export const LAMP_HOME = { x: 240, y: 612 };
const LAMP_MODEL_Y = 474;
const LAMP_MODEL_K = 0.6;
/** 纸片中心可活动的范围（悬挂在幕前） */
export const PIECE_BOX = { x0: 26, x1: 454, y0: 70, y1: 540 };

/** 相似度 → 反馈阶段（设计方案 §8：阈值需试玩调校，这里是唯一出处） */
export const THRESHOLDS = { faint: 0.70, glow: 0.85, stitch: 0.89, win: 0.925 };
/** 完成需持续的时长（ms） */
export const WIN_HOLD_MS = 400;
/** 轮廓距离的容差（格）：≤ FREE 记满分，≥ ZERO 记 0 分，之间线性 */
const CONTOUR_FREE = 1.2;
const CONTOUR_ZERO = 3.6;
const W_IOU = 0.5;
const edgeScore = d => (d <= CONTOUR_FREE ? 1 : Math.max(0, 1 - (d - CONTOUR_FREE) / (CONTOUR_ZERO - CONTOUR_FREE)));

export function lampModel(lamp) {
    return { x: lamp.x, y: LAMP_MODEL_Y + (lamp.y - LAMP_HOME.y) * LAMP_MODEL_K };
}

export function clampLamp(x, y) {
    return {
        x: Math.min(LAMP_BOX.x1, Math.max(LAMP_BOX.x0, x)),
        y: Math.min(LAMP_BOX.y1, Math.max(LAMP_BOX.y0, y)),
    };
}

export function clampPiece(x, y) {
    return {
        x: Math.min(PIECE_BOX.x1, Math.max(PIECE_BOX.x0, x)),
        y: Math.min(PIECE_BOX.y1, Math.max(PIECE_BOX.y0, y)),
    };
}

/* ───────────────────────── 形状 → 多边形 ───────────────────────── */

const DEG = Math.PI / 180;

function rotPts(pts, cx, cy, rotDeg) {
    const c = Math.cos(rotDeg * DEG);
    const s = Math.sin(rotDeg * DEG);
    return pts.map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}

function ellipsePts({ cx = 0, cy = 0, rx, ry, rot = 0 }, n = 44) {
    const pts = [];
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        pts.push([Math.cos(a) * rx, Math.sin(a) * ry]);
    }
    return rotPts(pts, cx, cy, rot);
}

/** 叶形（两端尖）：len 长、w 宽，bend 让中线弯成弧，skew 把最宽处前后挪 */
function leafPts({ cx = 0, cy = 0, len, w, rot = 0, bend = 0, skew = 0 }, n = 22) {
    const top = [];
    const bot = [];
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        const u = Math.min(1, Math.max(0, t + skew * t * (1 - t)));
        const hw = (w / 2) * Math.pow(Math.sin(Math.PI * u), 0.8);
        const x = -len / 2 + len * t;
        const y = bend * (4 * (t - 0.5) * (t - 0.5) - 1) * -1;
        top.push([x, y - hw]);
        bot.push([x, y + hw]);
    }
    return rotPts(top.concat(bot.reverse().slice(1, -1)), cx, cy, rot);
}

/** 闭合 Catmull-Rom 样条：控制点 → 平滑轮廓 */
function blobPts({ pts, cx = 0, cy = 0, rot = 0, scale = 1 }, seg = 7) {
    const P = pts.map(([x, y]) => [x * scale, y * scale]);
    const n = P.length;
    const out = [];
    for (let i = 0; i < n; i++) {
        const p0 = P[(i - 1 + n) % n];
        const p1 = P[i];
        const p2 = P[(i + 1) % n];
        const p3 = P[(i + 2) % n];
        for (let k = 0; k < seg; k++) {
            const t = k / seg;
            const t2 = t * t;
            const t3 = t2 * t;
            const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
            out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
        }
    }
    return rotPts(out, cx, cy, rot);
}

function polyPts({ pts, cx = 0, cy = 0, rot = 0 }) {
    return rotPts(pts, cx, cy, rot);
}

function signedArea(pts) {
    let a = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        a += (pts[j][0] * pts[i][1]) - (pts[i][0] * pts[j][1]);
    }
    return a / 2;
}

/** 确定性伪随机（纸边毛刺用；渲染与判定烘焙进同一份多边形） */
function hash01(n) {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
}

/** 纸边微小不规则：沿法向抖 ±amp，平滑过的噪声（相邻顶点相关，不是锯齿） */
function roughen(pts, seed, amp = 0.8) {
    const n = pts.length;
    const noise = pts.map((_, i) => {
        const a = hash01(seed * 31 + i) - 0.5;
        const b = hash01(seed * 31 + ((i + 1) % n)) - 0.5;
        const c = hash01(seed * 31 + ((i - 1 + n) % n)) - 0.5;
        return (a * 2 + b + c) / 4;
    });
    return pts.map(([x, y], i) => {
        const [px, py] = pts[(i - 1 + n) % n];
        const [nx, ny] = pts[(i + 1) % n];
        let tx = nx - px;
        let ty = ny - py;
        const len = Math.hypot(tx, ty) || 1;
        tx /= len;
        ty /= len;
        const k = noise[i] * 2 * amp;
        return [x + ty * k, y - tx * k];
    });
}

export function shapeToPolys(shape, seed = 1) {
    return shape.map((sub, idx) => {
        let pts;
        if (sub.t === 'ellipse') pts = ellipsePts(sub);
        else if (sub.t === 'circle') pts = ellipsePts({ ...sub, rx: sub.r, ry: sub.r });
        else if (sub.t === 'leaf') pts = leafPts(sub);
        else if (sub.t === 'blob') pts = blobPts(sub);
        else if (sub.t === 'poly') pts = polyPts(sub);
        else throw new Error(`unknown shape type ${sub.t}`);
        // 统一绕向：非零填充下同一纸片的子形状重叠处不会被抵消
        if (signedArea(pts) < 0) pts.reverse();
        return roughen(pts, seed * 7 + idx + 1, sub.rough ?? 0.8);
    });
}

/* ───────────────────────── 关卡编译 ───────────────────────── */

const compiled = new WeakMap();

/**
 * 把关卡定义编译成：各纸片本地多边形 + 目标 mask + 目标轮廓距离场。
 * 关卡的「解」以影子中心给出（sol.x / sol.y / sol.rot）：设计者直接画目标剪影，
 * 纸片的正确摆位由投影公式反推 —— 解一定存在（构造即可解）。
 */
export function compileLevel(level) {
    if (compiled.has(level)) return compiled.get(level);
    const pieces = level.pieces.map((p, i) => {
        const polys = shapeToPolys(p.shape, (level.seed || 1) * 13 + i);
        // 悬挂点：默认取包围盒顶边中点（本地坐标，影子尺度）
        let minY = Infinity;
        let minX = Infinity;
        let maxX = -Infinity;
        polys.forEach(poly => poly.forEach(([x, y]) => {
            if (y < minY) minY = y;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
        }));
        const attach = p.attach || [(minX + maxX) / 2, minY];
        return { polys, attach };
    });
    const solLamp = level.lamp.sol || level.lamp.start;
    const Lsol = lampModel(solLamp);
    const solution = {
        lamp: { x: solLamp.x, y: solLamp.y },
        pieces: level.pieces.map(p => ({
            x: Lsol.x + (p.sol.x - Lsol.x) * p.z,
            y: Lsol.y + (p.sol.y - Lsol.y) * p.z,
            rot: p.sol.rot || 0,
        })),
    };
    const targetPolys = [];
    level.pieces.forEach((p, i) => {
        pieces[i].polys.forEach(poly => targetPolys.push(placePoly(poly, p.sol.x, p.sol.y, p.sol.rot || 0)));
    });
    const target = rasterize(targetPolys);
    const targetEdge = boundary(target);
    const targetDist = distanceField(targetEdge);
    // 目标轮廓按纸片分段：每段轮廓都要「缝上」，小纸片错位不会被大纸片的面积淹没
    const edgeOwner = new Int8Array(targetEdge.length).fill(-1);
    level.pieces.forEach((p, i) => {
        const own = rasterize(pieces[i].polys.map(poly => placePoly(poly, p.sol.x, p.sol.y, p.sol.rot || 0)));
        for (let k = 0; k < own.length; k++) if (own[k] && targetEdge[k] && edgeOwner[k] < 0) edgeOwner[k] = i;
    });
    const out = { pieces, solution, targetPolys, target, targetEdge, targetDist, edgeOwner };
    compiled.set(level, out);
    return out;
}

export function initialState(level) {
    const c = compileLevel(level);
    return {
        lamp: { ...(level.lamp.start) },
        pieces: level.pieces.map((p, i) => (p.pinned
            ? { ...c.solution.pieces[i] }
            : { x: p.start.x, y: p.start.y, rot: p.start.rot || 0 })),
    };
}

export function solvedState(level) {
    const c = compileLevel(level);
    return {
        lamp: { ...c.solution.lamp },
        pieces: c.solution.pieces.map(p => ({ ...p })),
    };
}

/* ───────────────────────── 投影 ───────────────────────── */

export function placePoly(poly, x, y, rotDeg, scale = 1) {
    const c = Math.cos(rotDeg * DEG);
    const s = Math.sin(rotDeg * DEG);
    return poly.map(([vx, vy]) => [x + (vx * c - vy * s) * scale, y + (vx * s + vy * c) * scale]);
}

export function shadowCenter(lamp, pose, z) {
    const L = lampModel(lamp);
    return { x: L.x + (pose.x - L.x) / z, y: L.y + (pose.y - L.y) / z };
}

/** 某纸片投在幕布上的影子多边形（幕布 = 舞台坐标） */
export function shadowPolys(level, lamp, pose, i) {
    const c = compileLevel(level);
    const z = level.pieces[i].z;
    const S = shadowCenter(lamp, pose, z);
    return c.pieces[i].polys.map(poly => placePoly(poly, S.x, S.y, pose.rot || 0));
}

/** 纸片本体多边形（画在幕前的剪纸，尺寸 = 影子 × z） */
export function piecePolys(level, pose, i) {
    const c = compileLevel(level);
    const z = level.pieces[i].z;
    return c.pieces[i].polys.map(poly => placePoly(poly, pose.x, pose.y, pose.rot || 0, z));
}

/** 悬挂点的世界坐标（绳子的下端） */
export function attachPoint(level, pose, i) {
    const c = compileLevel(level);
    const z = level.pieces[i].z;
    const [ax, ay] = c.pieces[i].attach;
    return placePoly([[ax, ay]], pose.x, pose.y, pose.rot || 0, z)[0];
}

export function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i];
        const [xj, yj] = poly[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

/* ───────────────────────── 判定 ───────────────────────── */

/** 多边形集合 → 低分辨率 mask（格中心采样，子形状取并集） */
export function rasterize(polys) {
    const m = new Uint8Array(COLS * ROWS);
    for (const poly of polys) {
        let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
        for (const [x, y] of poly) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
        }
        const c0 = Math.max(0, Math.floor((x0 - SCREEN.x) / CELL));
        const c1 = Math.min(COLS - 1, Math.floor((x1 - SCREEN.x) / CELL));
        const r0 = Math.max(0, Math.floor((y0 - SCREEN.y) / CELL));
        const r1 = Math.min(ROWS - 1, Math.floor((y1 - SCREEN.y) / CELL));
        for (let r = r0; r <= r1; r++) {
            const cy = SCREEN.y + (r + 0.5) * CELL;
            for (let c = c0; c <= c1; c++) {
                const idx = r * COLS + c;
                if (m[idx]) continue;
                if (pointInPoly(SCREEN.x + (c + 0.5) * CELL, cy, poly)) m[idx] = 1;
            }
        }
    }
    return m;
}

/** 轮廓格：自身为 1 且 4 邻里有 0（出界视为 0） */
export function boundary(mask) {
    const e = new Uint8Array(mask.length);
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const i = r * COLS + c;
            if (!mask[i]) continue;
            if (c === 0 || r === 0 || c === COLS - 1 || r === ROWS - 1
                || !mask[i - 1] || !mask[i + 1] || !mask[i - COLS] || !mask[i + COLS]) e[i] = 1;
        }
    }
    return e;
}

/** 3-4 倒角距离变换（单位：格），到最近的 seed 格 */
export function distanceField(seed) {
    const INF = 1e6;
    const d = new Float32Array(seed.length);
    for (let i = 0; i < seed.length; i++) d[i] = seed[i] ? 0 : INF;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const i = r * COLS + c;
            let v = d[i];
            if (c > 0) v = Math.min(v, d[i - 1] + 3);
            if (r > 0) {
                v = Math.min(v, d[i - COLS] + 3);
                if (c > 0) v = Math.min(v, d[i - COLS - 1] + 4);
                if (c < COLS - 1) v = Math.min(v, d[i - COLS + 1] + 4);
            }
            d[i] = v;
        }
    }
    for (let r = ROWS - 1; r >= 0; r--) {
        for (let c = COLS - 1; c >= 0; c--) {
            const i = r * COLS + c;
            let v = d[i];
            if (c < COLS - 1) v = Math.min(v, d[i + 1] + 3);
            if (r < ROWS - 1) {
                v = Math.min(v, d[i + COLS] + 3);
                if (c < COLS - 1) v = Math.min(v, d[i + COLS + 1] + 4);
                if (c > 0) v = Math.min(v, d[i + COLS - 1] + 4);
            }
            d[i] = v;
        }
    }
    for (let i = 0; i < d.length; i++) d[i] /= 3;
    return d;
}

/** 当前局面的全部影子多边形 */
export function allShadowPolys(level, state) {
    const out = [];
    level.pieces.forEach((_, i) => {
        shadowPolys(level, state.lamp, state.pieces[i], i).forEach(p => out.push(p));
    });
    return out;
}

/**
 * 相似度 = 区域重合度（IoU）与轮廓距离（双向倒角，容差 CONTOUR_D 格）的加权。
 * 返回 sim ∈ [0,1] 与渲染需要的中间量：
 *   matchedEdge —— 目标轮廓上「已经缝上」的格（当前轮廓在 1.5 格内），画金线用
 */
export function evaluate(level, state) {
    const c = compileLevel(level);
    const mask = rasterize(allShadowPolys(level, state));
    let inter = 0;
    let uni = 0;
    for (let i = 0; i < mask.length; i++) {
        const a = mask[i];
        const b = c.target[i];
        if (a && b) inter++;
        if (a || b) uni++;
    }
    const iou = uni ? inter / uni : 0;
    const edge = boundary(mask);
    const dist = distanceField(edge);
    let sa = 0;
    let na = 0;
    for (let i = 0; i < edge.length; i++) {
        if (!edge[i]) continue;
        na++;
        sa += edgeScore(c.targetDist[i]);
    }
    const n = level.pieces.length;
    const sb = new Float64Array(n);
    const nb = new Float64Array(n);
    const matchedEdge = new Uint8Array(edge.length);
    for (let i = 0; i < c.targetEdge.length; i++) {
        const o = c.edgeOwner[i];
        if (o < 0) continue;
        nb[o]++;
        sb[o] += edgeScore(dist[i]);
        if (dist[i] <= 1.5) matchedEdge[i] = 1;
    }
    // 轮廓分 = min(当前轮廓贴合目标, 目标每段轮廓都被缝上)
    let worst = na ? sa / na : 0;
    for (let k = 0; k < n; k++) if (nb[k]) worst = Math.min(worst, sb[k] / nb[k]);
    const contour = worst;
    const sim = W_IOU * iou + (1 - W_IOU) * contour;
    return { sim, iou, contour, mask, matchedEdge };
}

/** 反馈阶段：0 无 / 1 暖色边线 / 2 幕布增亮 / 3 金线缝合 / 4 可完成 */
export function stageOf(sim) {
    if (sim >= THRESHOLDS.win) return 4;
    if (sim >= THRESHOLDS.stitch) return 3;
    if (sim >= THRESHOLDS.glow) return 2;
    if (sim >= THRESHOLDS.faint) return 1;
    return 0;
}

/** 网格格中心的舞台坐标（渲染金线用） */
export function cellCenter(idx) {
    const r = Math.floor(idx / COLS);
    const c = idx - r * COLS;
    return [SCREEN.x + (c + 0.5) * CELL, SCREEN.y + (r + 0.5) * CELL];
}
