// circuit-levels.js — 电路谜题数据层：元件模型 + 等电位求解器 + 32 关 + 每日挑战
// 元件：wire(h|v|ne|nw|se|sw) / bat(h|v,pol) / bulb(h|v,target,dark?) / sw(h|v,init) /
//       spdt(a,o1,o2,init:0=连o1,1=连o2) / tee(arms 如 'nse')
// 端点对接：(r,c,'e')↔(r,c+1,'w')、(r,c,'s')↔(r+1,c,'n')；悬空端点=非法关卡。
// 求解：Union-Find 等电位——导线/tee 全臂/闭合开关/SPDT 当前触点=可传播边；
//       灯泡/电池不传播；短路=find(+)===find(-)；灯亮=两端分属正负极分量。
import { hashStringFNV, mulberry32 } from '../../../platform/daily.js';

export const GRID_COLS = 14;
export const GRID_ROWS = 10;

const ENDPOINTS = {
    h: ['w', 'e'], v: ['n', 's'],
    ne: ['n', 'e'], nw: ['n', 'w'], se: ['s', 'e'], sw: ['s', 'w'],
};

export function endpointsOf(el) {
    if (el.t === 'tee') return el.arms.split('');
    if (el.t === 'spdt') return [el.a, el.o1, el.o2];
    return ENDPOINTS[el.o];
}

// 结点归一化：对接两端点映射到同一键（(r,c,'s')≡(r+1,c,'n')，(r,c,'e')≡(r,c+1,'w')）
export function jk(r, c, s) {
    if (s === 'e') return r + '>' + c + '>e';
    if (s === 'w') return r + '>' + (c - 1) + '>e';
    if (s === 's') return r + '>' + c + '>s';
    return (r - 1) + '>' + c + '>s'; // 'n'
}

function makeUF() {
    const parent = new Map();
    const find = (x) => {
        if (!parent.has(x)) parent.set(x, x);
        let root = x;
        while (parent.get(root) !== root) root = parent.get(root);
        while (parent.get(x) !== root) { const nx = parent.get(x); parent.set(x, root); x = nx; }
        return root;
    };
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
    return { find, union };
}

// 可操作元件（sw/spdt）下标列表；states 与之对齐（0/1）
export function operableIndexes(spec) {
    const out = [];
    spec.elements.forEach((el, i) => { if (el.t === 'sw' || el.t === 'spdt') out.push(i); });
    return out;
}

export function initStatesOf(spec) {
    return operableIndexes(spec).map((i) => spec.elements[i].init);
}

// 导通并查集：导线/tee 全臂/闭合开关/SPDT 当前触点合并；灯泡/电池不合并且记录正负极
export function buildConductionUF(spec, st) {
    const uf = makeUF();
    let pos = null, neg = null;
    for (const el of spec.elements) {
        const eps = endpointsOf(el);
        const keys = eps.map((s) => jk(el.r, el.c, s));
        if (el.t === 'wire' || el.t === 'tee') {
            for (let i = 1; i < keys.length; i++) uf.union(keys[0], keys[i]);
        } else if (el.t === 'sw') {
            if (st.get(spec.elements.indexOf(el))) uf.union(keys[0], keys[1]);
        } else if (el.t === 'spdt') {
            uf.union(keys[0], st.get(spec.elements.indexOf(el)) === 0 ? keys[1] : keys[2]);
        } else if (el.t === 'bat') {
            pos = keys[el.pol === 'a' ? 0 : 1];
            neg = keys[el.pol === 'a' ? 1 : 0];
        }
    }
    return { uf, pos, neg };
}

// 等电位求解：返回 { short, lit }（lit 按元件下标对齐，非灯为 null）
// short = 纯导线连通正负极（此时全灭、红闪）。
// 灯亮判定 = 节点电压法：导线分量为等电位节点、灯泡为单位电阻边、电池固定 V(+)=1 / V(-)=0，
// 高斯消元解直流工作点；|V_u − V_v| > ε 即有电流（串联/并联/被短接/死端全拓扑正确）。
export function solveCircuit(spec, states) {
    const ops = operableIndexes(spec);
    const st = new Map();
    ops.forEach((idx, k) => st.set(idx, states[k] ? 1 : 0));
    const base = buildConductionUF(spec, st);
    const short = !!base.pos && !!base.neg && base.uf.find(base.pos) === base.uf.find(base.neg);
    const lit = new Array(spec.elements.length).fill(null);
    if (short || !base.pos || !base.neg) return { short, lit };

    // 节点 = 导线分量根；灯泡边（两端同分量=被导线短接，直接灭）
    const nodeIdx = new Map();
    const nodeOf = (k) => {
        const r = base.uf.find(k);
        if (!nodeIdx.has(r)) nodeIdx.set(r, nodeIdx.size);
        return nodeIdx.get(r);
    };
    const edges = [];
    spec.elements.forEach((el, i) => {
        if (el.t !== 'bulb') return;
        const eps = endpointsOf(el);
        const u = nodeOf(jk(el.r, el.c, eps[0])), v = nodeOf(jk(el.r, el.c, eps[1]));
        if (u !== v) edges.push({ i, u, v });
        else lit[i] = false;
    });
    const p = nodeOf(base.pos), n = nodeOf(base.neg);

    // KCL：deg(i)·V_i − Σ_j V_j = Σ(固定邻点)；V(p)=1、V(n)=0 固定，其余节点高斯消元
    const unknown = [];
    for (const idx of nodeIdx.values()) if (idx !== p && idx !== n) unknown.push(idx);
    const rowOf = new Map(unknown.map((idx, r) => [idx, r]));
    const m = unknown.length;
    const A = Array.from({ length: m }, () => new Float64Array(m + 1));
    const fixedV = (idx) => (idx === p ? 1 : 0);
    for (const e of edges) {
        const fu = e.u === p || e.u === n, fv = e.v === p || e.v === n;
        if (!fu) { const r = rowOf.get(e.u); A[r][r] += 1; A[r][m] += fixedV(e.v); }
        if (!fv) { const r = rowOf.get(e.v); A[r][r] += 1; A[r][m] += fixedV(e.u); }
        if (!fu && !fv) { A[rowOf.get(e.u)][rowOf.get(e.v)] -= 1; A[rowOf.get(e.v)][rowOf.get(e.u)] -= 1; }
    }
    for (let col = 0; col < m; col++) {
        let piv = col;
        for (let r = col + 1; r < m; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
        if (Math.abs(A[piv][col]) < 1e-12) continue;
        if (piv !== col) { const t = A[piv]; A[piv] = A[col]; A[col] = t; }
        for (let r = col + 1; r < m; r++) {
            const f = A[r][col] / A[col][col];
            if (!f) continue;
            for (let c = col; c <= m; c++) A[r][c] -= f * A[col][c];
        }
    }
    const x = new Float64Array(m);
    for (let r = m - 1; r >= 0; r--) {
        let s = A[r][m];
        for (let c = r + 1; c < m; c++) s -= A[r][c] * x[c];
        x[r] = Math.abs(A[r][r]) < 1e-12 ? 0 : s / A[r][r];
    }
    const volt = (idx) => (idx === p ? 1 : idx === n ? 0 : x[rowOf.get(idx)]);
    for (const e of edges) lit[e.i] = Math.abs(volt(e.u) - volt(e.v)) > 1e-9;
    return { short, lit };
}

// 胜利判定：无短路 && 所有 target 灯亮 && 所有 dark 灯灭。
// dark 是实验关的「必须熄灭」灯泡（局部短路、选路）。旧关没有 dark，判定与原先一致。
export function isCircuitSolved(spec, states) {
    const r = solveCircuit(spec, states);
    if (r.short) return false;
    for (let i = 0; i < spec.elements.length; i++) {
        const el = spec.elements[i];
        if (el.t !== 'bulb') continue;
        const on = !!r.lit[i];
        if (el.target && !on) return false;
        if (el.dark && on) return false;
    }
    return true;
}

// BFS 状态空间求最少步数；无解返回 -1（可操作元件 ≤8 ⇒ 状态 ≤256）
export function minSteps(spec, states) {
    const k = operableIndexes(spec).length;
    const start = states.reduce((acc, v, i) => acc | (v ? 1 << i : 0), 0);
    if (isCircuitSolved(spec, states)) return 0;
    const seen = new Uint8Array(1 << k);
    seen[start] = 1;
    let frontier = [start], steps = 0;
    while (frontier.length) {
        steps++;
        const next = [];
        for (const mask of frontier) {
            for (let i = 0; i < k; i++) {
                const nm = mask ^ (1 << i);
                if (seen[nm]) continue;
                const ns = [];
                for (let j = 0; j < k; j++) ns.push((nm >> j) & 1);
                if (isCircuitSolved(spec, ns)) return steps;
                seen[nm] = 1;
                next.push(nm);
            }
        }
        frontier = next;
    }
    return -1;
}

// ---- 元件速记 ----
const W = (r, c, o) => ({ t: 'wire', r, c, o });
const B = (r, c, o, pol) => ({ t: 'bat', r, c, o, pol: pol || 'a' });
const L = (r, c, o, target, dark) => ({ t: 'bulb', r, c, o, target: target ? 1 : 0, ...(dark ? { dark: 1 } : {}) });
const S = (r, c, o, init) => ({ t: 'sw', r, c, o, init: init ? 1 : 0 });
const P = (r, c, a, o1, o2, init) => ({ t: 'spdt', r, c, a, o1, o2, init: init ? 1 : 0 });
const T = (r, c, arms) => ({ t: 'tee', r, c, arms });

// 矩形四角：左上 se、右上 sw、左下 ne、右下 nw
function corners(r1, c1, r2, c2) {
    return [W(r1, c1, 'se'), W(r1, c2, 'sw'), W(r2, c1, 'ne'), W(r2, c2, 'nw')];
}
function vline(c, r1, r2) { const a = []; for (let r = r1; r <= r2; r++) a.push(W(r, c, 'v')); return a; }

export const LEVELS = [];

// ---- 简单（单回路入门） ----
LEVELS.push(
    { id: 'S1', diff: 'easy', par: 1, elements: [
        ...corners(2, 4, 5, 9), ...vline(4, 3, 4), ...vline(9, 3, 4),
        W(2, 5, 'h'), L(2, 6, 'h', 1), W(2, 7, 'h'), W(2, 8, 'h'),
        W(5, 5, 'h'), B(5, 6, 'h'), W(5, 7, 'h'), S(5, 8, 'h', 0),
    ] },
    { id: 'S2', diff: 'easy', par: 2, elements: [
        ...corners(2, 4, 5, 9), ...vline(4, 3, 4), ...vline(9, 3, 4),
        W(2, 5, 'h'), L(2, 6, 'h', 1), W(2, 7, 'h'), W(2, 8, 'h'),
        W(5, 5, 'h'), S(5, 6, 'h', 0), B(5, 7, 'h'), S(5, 8, 'h', 0),
    ] },
    { id: 'S3', diff: 'easy', par: 1, elements: [
        ...corners(2, 4, 5, 9), ...vline(4, 3, 4), ...vline(9, 3, 4),
        W(2, 5, 'h'), L(2, 6, 'h', 1), W(2, 7, 'h'), W(2, 8, 'h'),
        S(5, 5, 'h', 1), B(5, 6, 'h'), S(5, 7, 'h', 0), W(5, 8, 'h'),
    ] },
    { id: 'S4', diff: 'easy', par: 1, elements: [
        ...corners(2, 3, 5, 10),
        W(2, 4, 'h'), L(2, 5, 'h', 1), W(2, 6, 'h'), W(2, 7, 'h'), W(2, 8, 'h'), W(2, 9, 'h'),
        W(3, 3, 'v'), T(4, 3, 'nse'), W(3, 10, 'v'), T(4, 10, 'nsw'),
        W(4, 4, 'h'), L(4, 5, 'h', 1), W(4, 6, 'h'), W(4, 7, 'h'), W(4, 8, 'h'), W(4, 9, 'h'),
        W(5, 4, 'h'), S(5, 5, 'h', 0), B(5, 6, 'h'), W(5, 7, 'h'), W(5, 8, 'h'), W(5, 9, 'h'),
    ] },
    { id: 'S5', diff: 'easy', par: 2, elements: [
        ...corners(2, 4, 5, 9), ...vline(4, 3, 4), ...vline(9, 3, 4),
        W(2, 5, 'h'), L(2, 6, 'h', 1), W(2, 7, 'h'), W(2, 8, 'h'),
        S(5, 5, 'h', 1), B(5, 6, 'h'), S(5, 7, 'h', 0), S(5, 8, 'h', 0),
    ] },
);

// ---- 中等（并联 / SPDT 选路） ----
LEVELS.push(
    { id: 'M1', diff: 'medium', par: 2, elements: [
        ...corners(2, 3, 5, 10), W(2, 4, 'h'), L(2, 5, 'h', 0), W(2, 6, 'h'), W(2, 7, 'h'), W(2, 8, 'h'), W(2, 9, 'h'),
        T(3, 3, 'nse'), T(4, 3, 'nse'), T(3, 10, 'nsw'), T(4, 10, 'nsw'),
        W(3, 4, 'h'), S(3, 5, 'h', 0), L(3, 6, 'h', 1), W(3, 7, 'h'), W(3, 8, 'h'), W(3, 9, 'h'),
        W(4, 4, 'h'), S(4, 5, 'h', 0), L(4, 6, 'h', 1), W(4, 7, 'h'), W(4, 8, 'h'), W(4, 9, 'h'),
        W(5, 4, 'h'), W(5, 5, 'h'), B(5, 6, 'h'), W(5, 7, 'h'), W(5, 8, 'h'), W(5, 9, 'h'),
    ] },
    { id: 'M2', diff: 'medium', par: 1, elements: [
        ...corners(2, 4, 5, 9), ...vline(4, 3, 4), ...vline(9, 3, 4),
        W(2, 5, 'h'), P(2, 6, 'w', 'e', 's', 1), W(2, 7, 'h'), L(2, 8, 'h', 1),
        W(3, 6, 'v'), L(4, 6, 'v', 0),
        B(5, 5, 'h'), T(5, 6, 'nwe'), W(5, 7, 'h'), W(5, 8, 'h'),
    ] },
    { id: 'M3', diff: 'medium', par: 2, elements: [
        ...corners(1, 3, 5, 10), W(1, 4, 'h'), L(1, 5, 'h', 0), W(1, 6, 'h'), W(1, 7, 'h'), W(1, 8, 'h'), W(1, 9, 'h'),
        T(2, 3, 'nse'), T(3, 3, 'nse'), T(4, 3, 'nse'), T(2, 10, 'nsw'), T(3, 10, 'nsw'), T(4, 10, 'nsw'),
        W(2, 4, 'h'), S(2, 5, 'h', 0), L(2, 6, 'h', 1), W(2, 7, 'h'), W(2, 8, 'h'), W(2, 9, 'h'),
        W(3, 4, 'h'), S(3, 5, 'h', 0), L(3, 6, 'h', 0), W(3, 7, 'h'), W(3, 8, 'h'), W(3, 9, 'h'),
        W(4, 4, 'h'), S(4, 5, 'h', 0), L(4, 6, 'h', 1), W(4, 7, 'h'), W(4, 8, 'h'), W(4, 9, 'h'),
        W(5, 4, 'h'), B(5, 5, 'h'), W(5, 6, 'h'), W(5, 7, 'h'), W(5, 8, 'h'), W(5, 9, 'h'),
    ] },
    { id: 'M4', diff: 'medium', par: 2, elements: [
        ...corners(2, 4, 5, 9), ...vline(4, 3, 4), ...vline(9, 3, 4),
        W(2, 5, 'h'), L(2, 6, 'h', 1), L(2, 7, 'h', 1), W(2, 8, 'h'),
        S(5, 5, 'h', 0), W(5, 6, 'h'), B(5, 7, 'h'), S(5, 8, 'h', 0),
    ] },
    { id: 'M5', diff: 'medium', par: 2, elements: [
        ...corners(2, 3, 5, 10), ...vline(3, 3, 4), ...vline(10, 3, 4),
        W(2, 4, 'h'), W(2, 5, 'h'), P(2, 6, 'w', 'e', 's', 1), T(2, 7, 'wes'), L(2, 8, 'h', 1), P(2, 9, 'w', 'e', 's', 1),
        L(3, 6, 'v', 0), W(4, 6, 'v'),
        W(3, 9, 'v'), W(4, 9, 'nw'), W(4, 8, 'h'), W(4, 7, 'ne'), W(3, 7, 'v'),
        W(5, 4, 'h'), B(5, 5, 'h'), T(5, 6, 'wen'), W(5, 7, 'h'), W(5, 8, 'h'), W(5, 9, 'h'),
    ] },
);

// ---- 困难（短路陷阱 / 旁路 / 串联） ----
LEVELS.push(
    { id: 'H1', diff: 'hard', par: 2, elements: [
        ...corners(1, 3, 5, 10), W(1, 4, 'h'), L(1, 5, 'h', 0), W(1, 6, 'h'), W(1, 7, 'h'), W(1, 8, 'h'), W(1, 9, 'h'),
        T(2, 3, 'nse'), T(3, 3, 'nse'), T(4, 3, 'nse'), T(2, 10, 'nsw'), T(3, 10, 'nsw'), T(4, 10, 'nsw'),
        W(2, 4, 'h'), S(2, 5, 'h', 0), L(2, 6, 'h', 1), W(2, 7, 'h'), W(2, 8, 'h'), W(2, 9, 'h'),
        W(3, 4, 'h'), S(3, 5, 'h', 0), L(3, 6, 'h', 1), W(3, 7, 'h'), W(3, 8, 'h'), W(3, 9, 'h'),
        W(4, 4, 'h'), S(4, 5, 'h', 0), W(4, 6, 'h'), W(4, 7, 'h'), W(4, 8, 'h'), W(4, 9, 'h'),
        W(5, 4, 'h'), B(5, 5, 'h'), W(5, 6, 'h'), W(5, 7, 'h'), W(5, 8, 'h'), W(5, 9, 'h'),
    ] },
    { id: 'H2', diff: 'hard', par: 1, elements: [
        ...corners(2, 3, 5, 9), ...vline(3, 3, 4), ...vline(9, 3, 4),
        T(2, 4, 'esw'), L(2, 5, 'h', 1), T(2, 6, 'esw'), L(2, 7, 'h', 1), W(2, 8, 'h'),
        W(3, 4, 'v'), W(4, 4, 'ne'), S(4, 5, 'h', 1), W(4, 6, 'nw'), W(3, 6, 'v'),
        W(5, 4, 'h'), B(5, 5, 'h'), W(5, 6, 'h'), W(5, 7, 'h'), W(5, 8, 'h'),
    ] },
    { id: 'H3', diff: 'hard', par: 2, elements: [
        ...corners(1, 3, 5, 10), W(1, 4, 'h'), L(1, 5, 'h', 0), W(1, 6, 'h'), W(1, 7, 'h'), W(1, 8, 'h'), W(1, 9, 'h'),
        T(2, 3, 'nse'), T(4, 3, 'nse'), T(2, 10, 'nsw'), T(4, 10, 'nsw'), W(3, 3, 'v'), W(3, 10, 'v'),
        W(2, 4, 'h'), S(2, 5, 'h', 0), L(2, 6, 'h', 1), W(2, 7, 'h'), W(2, 8, 'h'), W(2, 9, 'h'),
        W(4, 4, 'h'), W(4, 5, 'h'), S(4, 6, 'h', 1), W(4, 7, 'h'), W(4, 8, 'h'), W(4, 9, 'h'),
        W(5, 4, 'h'), B(5, 5, 'h'), W(5, 6, 'h'), W(5, 7, 'h'), W(5, 8, 'h'), W(5, 9, 'h'),
    ] },
    { id: 'H4', diff: 'hard', par: 2, elements: [
        ...corners(2, 3, 5, 10), W(3, 3, 'v'), T(4, 3, 'nse'), W(3, 10, 'v'), W(4, 10, 'v'),
        W(2, 4, 'h'), L(2, 5, 'h', 1), L(2, 6, 'h', 1), W(2, 7, 'h'), S(2, 8, 'h', 0), W(2, 9, 'h'),
        W(4, 4, 'h'), S(4, 5, 'h', 0), W(4, 6, 'h'), W(4, 7, 'h'), W(4, 8, 'h'), W(4, 9, 'sw'),
        W(5, 4, 'h'), S(5, 5, 'h', 0), B(5, 6, 'h'), W(5, 7, 'h'), W(5, 8, 'h'), T(5, 9, 'nwe'),
    ] },
    { id: 'H5', diff: 'hard', par: 3, elements: [
        ...corners(1, 3, 5, 10), W(1, 4, 'h'), L(1, 5, 'h', 0), W(1, 6, 'h'), W(1, 7, 'h'), W(1, 8, 'h'), W(1, 9, 'h'),
        T(2, 3, 'nse'), T(3, 3, 'nse'), T(4, 3, 'nse'), T(2, 10, 'nsw'), T(3, 10, 'nsw'), T(4, 10, 'nsw'),
        W(2, 4, 'h'), S(2, 5, 'h', 0), L(2, 6, 'h', 1), W(2, 7, 'h'), W(2, 8, 'h'), W(2, 9, 'h'),
        W(3, 4, 'h'), S(3, 5, 'h', 0), L(3, 6, 'h', 1), W(3, 7, 'h'), W(3, 8, 'h'), W(3, 9, 'h'),
        W(4, 4, 'h'), S(4, 5, 'h', 0), L(4, 6, 'h', 1), W(4, 7, 'h'), W(4, 8, 'h'), W(4, 9, 'h'),
        W(5, 4, 'h'), B(5, 5, 'h'), W(5, 6, 'h'), W(5, 7, 'h'), W(5, 8, 'h'), W(5, 9, 'h'),
    ] },
);

// ---- 挑战（多重开关协同 / 短路对抗） ----
LEVELS.push(
    { id: 'C1', diff: 'expert', par: 3, elements: [
        ...corners(1, 3, 6, 10), W(1, 4, 'h'), L(1, 5, 'h', 0), W(1, 6, 'h'), W(1, 7, 'h'), W(1, 8, 'h'), W(1, 9, 'h'),
        T(2, 3, 'nse'), T(3, 3, 'nse'), T(4, 3, 'nse'), T(5, 3, 'nse'),
        T(2, 10, 'nsw'), T(3, 10, 'nsw'), T(4, 10, 'nsw'), T(5, 10, 'nsw'),
        S(2, 4, 'h', 0), S(2, 5, 'h', 1), L(2, 6, 'h', 1), W(2, 7, 'h'), W(2, 8, 'h'), W(2, 9, 'h'),
        S(3, 4, 'h', 1), S(3, 5, 'h', 0), L(3, 6, 'h', 1), W(3, 7, 'h'), W(3, 8, 'h'), W(3, 9, 'h'),
        S(4, 4, 'h', 0), S(4, 5, 'h', 0), L(4, 6, 'h', 0), W(4, 7, 'h'), W(4, 8, 'h'), W(4, 9, 'h'),
        S(5, 4, 'h', 0), S(5, 5, 'h', 1), L(5, 6, 'h', 1), W(5, 7, 'h'), W(5, 8, 'h'), W(5, 9, 'h'),
        W(6, 4, 'h'), W(6, 5, 'h'), B(6, 6, 'h'), W(6, 7, 'h'), W(6, 8, 'h'), W(6, 9, 'h'),
    ] },
    { id: 'C2', diff: 'expert', par: 3, elements: [
        ...corners(2, 3, 5, 10),
        T(3, 3, 'nse'), T(4, 3, 'nse'), T(3, 10, 'nsw'), T(4, 10, 'nsw'),
        W(2, 4, 'h'), S(2, 5, 'h', 0), L(2, 6, 'h', 1), W(2, 7, 'h'), W(2, 8, 'h'), W(2, 9, 'h'),
        W(3, 4, 'h'), P(3, 5, 'w', 'e', 's', 1), L(3, 6, 'h', 1), W(3, 7, 'h'), W(3, 8, 'h'), W(3, 9, 'h'),
        W(4, 4, 'h'), T(4, 5, 'nwe'), W(4, 6, 'h'), S(4, 7, 'h', 0), W(4, 8, 'h'), W(4, 9, 'h'),
        S(5, 4, 'h', 0), W(5, 5, 'h'), B(5, 6, 'h'), W(5, 7, 'h'), W(5, 8, 'h'), W(5, 9, 'h'),
    ] },
    { id: 'C3', diff: 'expert', par: 3, elements: [
        ...corners(2, 3, 5, 10),
        T(3, 3, 'nse'), T(3, 10, 'nsw'), W(4, 3, 'v'), W(4, 10, 'v'),
        W(2, 4, 'h'), L(2, 5, 'h', 1), S(2, 6, 'h', 0), L(2, 7, 'h', 1), W(2, 8, 'h'), W(2, 9, 'h'),
        W(3, 4, 'h'), S(3, 5, 'h', 0), L(3, 6, 'h', 1), W(3, 7, 'h'), W(3, 8, 'h'), W(3, 9, 'h'),
        S(5, 4, 'h', 0), W(5, 5, 'h'), B(5, 6, 'h'), W(5, 7, 'h'), W(5, 8, 'h'), W(5, 9, 'h'),
    ] },
);

LEVELS.push(
    { id: 'C4', diff: 'expert', par: 3, elements: [
        ...corners(1, 3, 5, 10), W(1, 4, 'h'), L(1, 5, 'h', 0), W(1, 6, 'h'), W(1, 7, 'h'), W(1, 8, 'h'), W(1, 9, 'h'),
        T(2, 3, 'nse'), T(4, 3, 'nse'), T(2, 10, 'nsw'), T(3, 10, 'nsw'), T(4, 10, 'nsw'), W(3, 3, 'v'),
        W(2, 4, 'h'), P(2, 5, 'w', 'e', 's', 1), P(2, 6, 'w', 'e', 's', 1), W(2, 7, 'h'), L(2, 8, 'h', 1), W(2, 9, 'h'),
        W(3, 5, 'ne'), T(3, 6, 'nwe'), W(3, 7, 'h'), W(3, 8, 'h'), W(3, 9, 'h'),
        W(4, 4, 'h'), S(4, 5, 'h', 0), L(4, 6, 'h', 0), W(4, 7, 'h'), W(4, 8, 'h'), W(4, 9, 'h'),
        S(5, 4, 'h', 0), W(5, 5, 'h'), B(5, 6, 'h'), W(5, 7, 'h'), W(5, 8, 'h'), W(5, 9, 'h'),
    ] },
    { id: 'C5', diff: 'expert', par: 5, elements: [
        ...corners(1, 3, 6, 10), W(1, 4, 'h'), L(1, 5, 'h', 0), W(1, 6, 'h'), W(1, 7, 'h'), W(1, 8, 'h'), W(1, 9, 'h'),
        T(2, 3, 'nse'), T(3, 3, 'nse'), T(4, 3, 'nse'), T(5, 3, 'nse'),
        T(2, 10, 'nsw'), T(3, 10, 'nsw'), T(4, 10, 'nsw'), T(5, 10, 'nsw'),
        W(2, 4, 'h'), S(2, 5, 'h', 0), L(2, 6, 'h', 1), W(2, 7, 'h'), W(2, 8, 'h'), W(2, 9, 'h'),
        W(3, 4, 'h'), S(3, 5, 'h', 0), L(3, 6, 'h', 1), W(3, 7, 'h'), W(3, 8, 'h'), W(3, 9, 'h'),
        W(4, 4, 'h'), P(4, 5, 'w', 'e', 's', 1), L(4, 6, 'h', 1), W(4, 7, 'h'), W(4, 8, 'h'), W(4, 9, 'h'),
        W(5, 4, 'h'), T(5, 5, 'wen'), W(5, 6, 'h'), S(5, 7, 'h', 1), W(5, 8, 'h'), W(5, 9, 'h'),
        S(6, 4, 'h', 0), W(6, 5, 'h'), B(6, 6, 'h'), W(6, 7, 'h'), W(6, 8, 'h'), W(6, 9, 'h'),
    ] },
);

// ---- 实验（初中电路，接在原 20 关之后，星级下标不变） ----
// 拓扑按人教九年级「串联和并联 / 短路」和练习册里的楼梯双控、支路开关、局部短路重画，
// 不是教材插图的描摹。dark 灯泡必须熄灭，所以「全部拨通」不再是通解。
const LAB = [
    { id: 'T1', diff: 'lab', par: 4, topic: { zh: '局部短路', en: 'Local short' }, elements: [
        W(1, 3, 'se'), S(1, 4, 'h', 0), T(1, 5, 'wes'), L(1, 6, 'h', 0, 1), T(1, 7, 'wes'), L(1, 8, 'h', 1), T(1, 9, 'wes'), S(1, 10, 'h', 0), W(1, 11, 'sw'), W(2, 3, 'v'), W(3, 3, 'v'), W(4, 3, 'v'), W(2, 5, 'v'), W(2, 7, 'v'), W(2, 9, 'v'), W(2, 11, 'v'), W(3, 11, 'v'), W(4, 11, 'v'), W(3, 5, 'ne'), S(3, 6, 'h', 0), T(3, 7, 'nwe'), S(3, 8, 'h', 1), W(3, 9, 'nw'), W(5, 3, 'ne'), W(5, 4, 'h'), W(5, 5, 'h'), W(5, 6, 'h'), B(5, 7, 'h'), W(5, 8, 'h'), W(5, 9, 'h'), W(5, 10, 'h'), W(5, 11, 'nw')
    ] },
    { id: 'T2', diff: 'lab', par: 4, topic: { zh: '串联避短路', en: 'Series, no shorts' }, elements: [
        W(1, 3, 'se'), S(1, 4, 'h', 0), T(1, 5, 'wes'), L(1, 6, 'h', 1), T(1, 7, 'wes'), L(1, 8, 'h', 1), T(1, 9, 'wes'), S(1, 10, 'h', 0), W(1, 11, 'sw'), W(2, 3, 'v'), W(3, 3, 'v'), W(4, 3, 'v'), W(2, 5, 'v'), W(2, 7, 'v'), W(2, 9, 'v'), W(2, 11, 'v'), W(3, 11, 'v'), W(4, 11, 'v'), W(3, 5, 'ne'), S(3, 6, 'h', 1), T(3, 7, 'nwe'), S(3, 8, 'h', 1), W(3, 9, 'nw'), W(5, 3, 'ne'), W(5, 4, 'h'), W(5, 5, 'h'), W(5, 6, 'h'), B(5, 7, 'h'), W(5, 8, 'h'), W(5, 9, 'h'), W(5, 10, 'h'), W(5, 11, 'nw')
    ] },
    { id: 'T3', diff: 'lab', par: 5, topic: { zh: '支路开关', en: 'Branch switches' }, elements: [
        W(1, 3, 'se'), W(1, 11, 'sw'), S(1, 4, 'h', 0), S(1, 5, 'h', 0), L(1, 6, 'h', 1), W(1, 7, 'h'), W(1, 8, 'h'), W(1, 9, 'h'), W(1, 10, 'h'), W(2, 3, 'v'), W(2, 11, 'v'), T(3, 3, 'nse'), T(3, 11, 'nsw'), S(3, 4, 'h', 0), L(3, 5, 'h', 1), W(3, 6, 'h'), W(3, 7, 'h'), W(3, 8, 'h'), W(3, 9, 'h'), W(3, 10, 'h'), W(4, 3, 'v'), W(4, 11, 'v'), T(5, 3, 'nse'), T(5, 11, 'nsw'), S(5, 4, 'h', 1), L(5, 5, 'h', 0, 1), W(5, 6, 'h'), W(5, 7, 'h'), W(5, 8, 'h'), W(5, 9, 'h'), W(5, 10, 'h'), W(6, 3, 'v'), W(6, 11, 'v'), T(7, 3, 'nse'), T(7, 11, 'nsw'), S(7, 4, 'h', 1), W(7, 5, 'h'), W(7, 6, 'h'), W(7, 7, 'h'), W(7, 8, 'h'), W(7, 9, 'h'), W(7, 10, 'h'), W(8, 3, 'ne'), W(8, 11, 'nw'), W(8, 4, 'h'), W(8, 5, 'h'), W(8, 6, 'h'), B(8, 7, 'h'), W(8, 8, 'h'), W(8, 9, 'h'), W(8, 10, 'h')
    ] },
    { id: 'T4', diff: 'lab', par: 5, topic: { zh: '并联独立', en: 'Independent branches' }, elements: [
        W(1, 3, 'se'), W(1, 11, 'sw'), S(1, 4, 'h', 0), L(1, 5, 'h', 1), W(1, 6, 'h'), W(1, 7, 'h'), W(1, 8, 'h'), W(1, 9, 'h'), W(1, 10, 'h'), W(2, 3, 'v'), W(2, 11, 'v'), T(3, 3, 'nse'), T(3, 11, 'nsw'), S(3, 4, 'h', 0), L(3, 5, 'h', 1), W(3, 6, 'h'), W(3, 7, 'h'), W(3, 8, 'h'), W(3, 9, 'h'), W(3, 10, 'h'), T(4, 3, 'nse'), T(4, 11, 'nsw'), S(4, 4, 'h', 1), L(4, 5, 'h', 0, 1), W(4, 6, 'h'), W(4, 7, 'h'), W(4, 8, 'h'), W(4, 9, 'h'), W(4, 10, 'h'), W(5, 3, 'v'), W(5, 11, 'v'), T(6, 3, 'nse'), T(6, 11, 'nsw'), S(6, 4, 'h', 1), L(6, 5, 'h', 0, 1), W(6, 6, 'h'), W(6, 7, 'h'), W(6, 8, 'h'), W(6, 9, 'h'), W(6, 10, 'h'), T(7, 3, 'nse'), T(7, 11, 'nsw'), S(7, 4, 'h', 1), W(7, 5, 'h'), W(7, 6, 'h'), W(7, 7, 'h'), W(7, 8, 'h'), W(7, 9, 'h'), W(7, 10, 'h'), W(8, 3, 'ne'), W(8, 11, 'nw'), W(8, 4, 'h'), W(8, 5, 'h'), W(8, 6, 'h'), B(8, 7, 'h'), W(8, 8, 'h'), W(8, 9, 'h'), W(8, 10, 'h')
    ] },
    { id: 'T5', diff: 'lab', par: 4, topic: { zh: '干路灯被短路', en: 'Series lamp bypassed' }, elements: [
        W(1, 3, 'se'), S(1, 4, 'h', 0), T(1, 5, 'wes'), L(1, 6, 'h', 0, 1), T(1, 7, 'wes'), S(1, 8, 'h', 0), L(1, 9, 'h', 1), W(1, 10, 'h'), W(1, 11, 'sw'), W(2, 3, 'v'), W(2, 5, 'v'), W(2, 7, 'v'), W(2, 11, 'v'), W(3, 3, 'v'), W(3, 5, 'ne'), S(3, 6, 'h', 0), T(3, 7, 'nsw'), W(3, 11, 'v'), W(4, 3, 'v'), W(4, 7, 'ne'), S(4, 8, 'h', 1), L(4, 9, 'h', 0, 1), W(4, 10, 'h'), T(4, 11, 'nsw'), W(5, 3, 'v'), W(5, 11, 'v'), W(6, 3, 'ne'), W(6, 4, 'h'), W(6, 5, 'h'), W(6, 6, 'h'), B(6, 7, 'h'), W(6, 8, 'h'), W(6, 9, 'h'), W(6, 10, 'h'), W(6, 11, 'nw')
    ] },
    { id: 'T6', diff: 'lab', par: 5, topic: { zh: '电源短路', en: 'Battery short' }, elements: [
        W(1, 3, 'se'), S(1, 4, 'h', 0), T(1, 5, 'wes'), L(1, 6, 'h', 0, 1), T(1, 7, 'wes'), S(1, 8, 'h', 0), L(1, 9, 'h', 1), W(1, 10, 'h'), W(1, 11, 'sw'), W(2, 3, 'v'), W(2, 5, 'v'), W(2, 7, 'v'), W(2, 11, 'v'), W(3, 3, 'v'), W(3, 5, 'ne'), S(3, 6, 'h', 0), T(3, 7, 'nsw'), W(3, 11, 'v'), W(4, 3, 'v'), W(4, 7, 'ne'), S(4, 8, 'h', 1), L(4, 9, 'h', 0, 1), W(4, 10, 'h'), T(4, 11, 'nsw'), T(5, 3, 'nse'), S(5, 4, 'h', 1), W(5, 5, 'h'), W(5, 6, 'h'), W(5, 7, 'h'), W(5, 8, 'h'), W(5, 9, 'h'), W(5, 10, 'h'), T(5, 11, 'nsw'), W(6, 3, 'ne'), W(6, 4, 'h'), W(6, 5, 'h'), W(6, 6, 'h'), B(6, 7, 'h'), W(6, 8, 'h'), W(6, 9, 'h'), W(6, 10, 'h'), W(6, 11, 'nw')
    ] },
    { id: 'T7', diff: 'lab', par: 5, topic: { zh: '支路偷电', en: 'Sneak path' }, elements: [
        W(1, 3, 'se'), S(1, 4, 'h', 1), T(1, 5, 'wes'), L(1, 6, 'h', 0, 1), W(1, 7, 'h'), W(1, 8, 'h'), W(1, 9, 'h'), W(1, 10, 'h'), W(1, 11, 'sw'), W(2, 3, 'v'), S(2, 5, 'v', 1), W(2, 11, 'v'), W(3, 3, 'v'), W(3, 5, 'v'), W(3, 11, 'v'), T(4, 3, 'nse'), S(4, 4, 'h', 0), T(4, 5, 'nwe'), L(4, 6, 'h', 1), W(4, 7, 'h'), W(4, 8, 'h'), W(4, 9, 'h'), W(4, 10, 'h'), T(4, 11, 'nsw'), T(5, 3, 'nse'), S(5, 4, 'h', 1), W(5, 5, 'h'), W(5, 6, 'h'), W(5, 7, 'h'), W(5, 8, 'h'), W(5, 9, 'h'), W(5, 10, 'h'), T(5, 11, 'nsw'), T(6, 3, 'nse'), S(6, 4, 'h', 1), L(6, 5, 'h', 0, 1), W(6, 6, 'h'), W(6, 7, 'h'), W(6, 8, 'h'), W(6, 9, 'h'), W(6, 10, 'h'), T(6, 11, 'nsw'), W(7, 3, 'ne'), W(7, 4, 'h'), W(7, 5, 'h'), W(7, 6, 'h'), B(7, 7, 'h'), W(7, 8, 'h'), W(7, 9, 'h'), W(7, 10, 'h'), W(7, 11, 'nw')
    ] },
    { id: 'T8', diff: 'lab', par: 5, topic: { zh: '单刀双掷选灯', en: 'SPDT picks the lamp' }, elements: [
        W(1, 3, 'se'), S(1, 4, 'h', 0), S(1, 5, 'h', 0), S(1, 6, 'h', 0), P(1, 7, 'w', 'e', 's', 1), L(1, 8, 'h', 1), W(1, 9, 'h'), W(1, 10, 'h'), W(1, 11, 'h'), W(1, 12, 'sw'), W(2, 3, 'v'), W(2, 7, 'v'), W(2, 12, 'v'), W(3, 3, 'v'), W(3, 7, 'ne'), L(3, 8, 'h', 0, 1), W(3, 9, 'h'), W(3, 10, 'h'), W(3, 11, 'h'), T(3, 12, 'nsw'), W(4, 3, 'v'), W(4, 12, 'v'), T(5, 3, 'nse'), S(5, 4, 'h', 1), W(5, 5, 'h'), W(5, 6, 'h'), W(5, 7, 'h'), W(5, 8, 'h'), W(5, 9, 'h'), W(5, 10, 'h'), W(5, 11, 'h'), T(5, 12, 'nsw'), W(6, 3, 'v'), W(6, 12, 'v'), W(7, 3, 'ne'), W(7, 4, 'h'), W(7, 5, 'h'), W(7, 6, 'h'), W(7, 7, 'h'), B(7, 8, 'h'), W(7, 9, 'h'), W(7, 10, 'h'), W(7, 11, 'h'), W(7, 12, 'nw')
    ] },
    { id: 'T9', diff: 'lab', par: 5, topic: { zh: '楼梯双控', en: 'Two-way stairs' }, elements: [
        W(4, 2, 'se'), B(4, 3, 'h', 'b'), S(4, 4, 'h', 0), S(4, 5, 'h', 0), P(4, 6, 'w', 'n', 's', 0), W(3, 6, 'v'), W(2, 6, 'se'), L(2, 7, 'h', 0, 1), W(2, 8, 'h'), W(2, 9, 'sw'), W(3, 9, 'v'), P(4, 9, 'e', 'n', 's', 0), S(4, 10, 'h', 0), L(4, 11, 'h', 1), W(4, 12, 'sw'), W(5, 12, 'v'), W(6, 12, 'v'), W(7, 12, 'nw'), W(7, 3, 'h'), W(7, 4, 'h'), W(7, 5, 'h'), W(7, 6, 'h'), W(7, 7, 'h'), W(7, 8, 'h'), W(7, 9, 'h'), W(7, 10, 'h'), W(7, 11, 'h'), W(7, 2, 'ne'), W(5, 2, 'v'), W(6, 2, 'v'), W(5, 6, 'v'), W(6, 6, 'ne'), W(6, 7, 'h'), W(6, 8, 'h'), W(6, 9, 'nw'), W(5, 9, 'v')
    ] },
    { id: 'T10', diff: 'lab', par: 7, topic: { zh: '双指纹门', en: 'Two AND gates' }, elements: [
        W(1, 3, 'se'), W(1, 11, 'sw'), S(1, 4, 'h', 0), S(1, 5, 'h', 0), L(1, 6, 'h', 1), W(1, 7, 'h'), W(1, 8, 'h'), W(1, 9, 'h'), W(1, 10, 'h'), W(2, 3, 'v'), W(2, 11, 'v'), T(3, 3, 'nse'), T(3, 11, 'nsw'), S(3, 4, 'h', 0), S(3, 5, 'h', 0), L(3, 6, 'h', 1), W(3, 7, 'h'), W(3, 8, 'h'), W(3, 9, 'h'), W(3, 10, 'h'), W(4, 3, 'v'), W(4, 11, 'v'), T(5, 3, 'nse'), T(5, 11, 'nsw'), S(5, 4, 'h', 1), L(5, 5, 'h', 0, 1), W(5, 6, 'h'), W(5, 7, 'h'), W(5, 8, 'h'), W(5, 9, 'h'), W(5, 10, 'h'), T(6, 3, 'nse'), T(6, 11, 'nsw'), S(6, 4, 'h', 1), L(6, 5, 'h', 0, 1), W(6, 6, 'h'), W(6, 7, 'h'), W(6, 8, 'h'), W(6, 9, 'h'), W(6, 10, 'h'), T(7, 3, 'nse'), T(7, 11, 'nsw'), S(7, 4, 'h', 1), W(7, 5, 'h'), W(7, 6, 'h'), W(7, 7, 'h'), W(7, 8, 'h'), W(7, 9, 'h'), W(7, 10, 'h'), W(8, 3, 'ne'), W(8, 11, 'nw'), W(8, 4, 'h'), W(8, 5, 'h'), W(8, 6, 'h'), B(8, 7, 'h'), W(8, 8, 'h'), W(8, 9, 'h'), W(8, 10, 'h')
    ] },
    { id: 'T11', diff: 'lab', par: 5, topic: { zh: '三灯串联', en: 'Three in series' }, elements: [
        W(1, 3, 'se'), W(1, 11, 'sw'), S(1, 4, 'h', 0), L(1, 5, 'h', 1), S(1, 6, 'h', 0), L(1, 7, 'h', 1), S(1, 8, 'h', 0), L(1, 9, 'h', 1), W(1, 10, 'h'), W(2, 3, 'v'), W(2, 11, 'v'), W(3, 3, 'v'), W(3, 11, 'v'), T(4, 3, 'nse'), T(4, 11, 'nsw'), S(4, 4, 'h', 1), L(4, 5, 'h', 0, 1), W(4, 6, 'h'), W(4, 7, 'h'), W(4, 8, 'h'), W(4, 9, 'h'), W(4, 10, 'h'), W(5, 3, 'v'), W(5, 11, 'v'), T(6, 3, 'nse'), T(6, 11, 'nsw'), S(6, 4, 'h', 1), W(6, 5, 'h'), W(6, 6, 'h'), W(6, 7, 'h'), W(6, 8, 'h'), W(6, 9, 'h'), W(6, 10, 'h'), W(7, 3, 'v'), W(7, 11, 'v'), W(8, 3, 'ne'), W(8, 11, 'nw'), W(8, 4, 'h'), W(8, 5, 'h'), W(8, 6, 'h'), B(8, 7, 'h'), W(8, 8, 'h'), W(8, 9, 'h'), W(8, 10, 'h')
    ] },
    { id: 'T12', diff: 'lab', par: 8, topic: { zh: '实验考核', en: 'Lab exam' }, elements: [
        W(1, 3, 'se'), W(1, 11, 'sw'), S(1, 4, 'h', 0), S(1, 5, 'h', 0), S(1, 6, 'h', 0), L(1, 7, 'h', 1), W(1, 8, 'h'), W(1, 9, 'h'), W(1, 10, 'h'), W(2, 3, 'v'), W(2, 11, 'v'), T(3, 3, 'nse'), T(3, 11, 'nsw'), S(3, 4, 'h', 0), S(3, 5, 'h', 0), L(3, 6, 'h', 1), W(3, 7, 'h'), W(3, 8, 'h'), W(3, 9, 'h'), W(3, 10, 'h'), T(4, 3, 'nse'), T(4, 11, 'nsw'), S(4, 4, 'h', 1), L(4, 5, 'h', 0, 1), W(4, 6, 'h'), W(4, 7, 'h'), W(4, 8, 'h'), W(4, 9, 'h'), W(4, 10, 'h'), T(5, 3, 'nse'), T(5, 11, 'nsw'), S(5, 4, 'h', 1), L(5, 5, 'h', 0, 1), W(5, 6, 'h'), W(5, 7, 'h'), W(5, 8, 'h'), W(5, 9, 'h'), W(5, 10, 'h'), T(6, 3, 'nse'), T(6, 11, 'nsw'), S(6, 4, 'h', 1), W(6, 5, 'h'), W(6, 6, 'h'), W(6, 7, 'h'), W(6, 8, 'h'), W(6, 9, 'h'), W(6, 10, 'h'), W(7, 3, 'v'), W(7, 11, 'v'), W(8, 3, 'ne'), W(8, 11, 'nw'), W(8, 4, 'h'), W(8, 5, 'h'), W(8, 6, 'h'), B(8, 7, 'h'), W(8, 8, 'h'), W(8, 9, 'h'), W(8, 10, 'h')
    ] },
];
LEVELS.push(...LAB);

// ---- 每日挑战：FNV 选关 + mulberry32 重掷全部操作元件初态 ----
// 校验初始 ≠ 解态（重试至多 16 次）；par 按重掷后初态重算。
export function dailyLevel(todayKey) {
    const idx = hashStringFNV('circuit-' + todayKey) % LEVELS.length;
    const base = LEVELS[idx];
    let spec = base;
    for (let attempt = 0; attempt <= 16; attempt++) {
        const rng = mulberry32(hashStringFNV(todayKey + '#' + attempt));
        const elements = base.elements.map((el) => {
            if (el.t !== 'sw' && el.t !== 'spdt') return el;
            return { ...el, init: rng() < 0.5 ? 0 : 1 };
        });
        spec = { id: 'daily-' + todayKey, diff: 'daily', par: base.par, elements };
        const init = initStatesOf(spec);
        if (!isCircuitSolved(spec, init)) { spec.par = minSteps(spec, init); break; }
    }
    return spec;
}
