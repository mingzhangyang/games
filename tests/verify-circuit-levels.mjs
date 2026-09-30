// verify-circuit-levels.mjs — circuit 数据层黄金断言（node 直跑，无需浏览器）
import {
    LEVELS, GRID_COLS, GRID_ROWS, operableIndexes, initStatesOf,
    isCircuitSolved, minSteps, dailyLevel,
} from '../js/circuit-levels.js';

let passed = 0, failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; } else { failed++; console.error('  ✗ ' + msg); }
}

// 端点键 → 计数（结点归一化后，每个结点必须恰好 2 个端点对接）
function jk(r, c, s) {
    if (s === 'e') return r + '>' + c + '>e';
    if (s === 'w') return r + '>' + (c - 1) + '>e';
    if (s === 's') return r + '>' + c + '>s';
    return (r - 1) + '>' + c + '>s'; // 'n'
}
function endpointKeys(spec) {
    const counts = new Map();
    const add = (k) => counts.set(k, (counts.get(k) || 0) + 1);
    for (const el of spec.elements) {
        let eps;
        if (el.t === 'tee') eps = el.arms.split('');
        else if (el.t === 'spdt') eps = [el.a, el.o1, el.o2];
        else eps = { h: ['w', 'e'], v: ['n', 's'], ne: ['n', 'e'], nw: ['n', 'w'], se: ['s', 'e'], sw: ['s', 'w'] }[el.o];
        for (const s of eps) add(jk(el.r, el.c, s));
    }
    return counts;
}

// 结构连通性：导线/tee 全接、开关视作闭合、spdt 两路都算、灯泡/电池串在回路里
function componentCount(spec) {
    const parent = new Map();
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    const union = (a, b) => { parent.set(find(a), find(b)); };
    const node = (r, c, s) => { const k = jk(r, c, s); if (!parent.has(k)) parent.set(k, k); return k; };
    for (const el of spec.elements) {
        let eps;
        if (el.t === 'tee') eps = el.arms.split('');
        else if (el.t === 'spdt') eps = [el.a, el.o1, el.o2];
        else eps = { h: ['w', 'e'], v: ['n', 's'], ne: ['n', 'e'], nw: ['n', 'w'], se: ['s', 'e'], sw: ['s', 'w'] }[el.o];
        const ks = eps.map((s) => node(el.r, el.c, s));
        for (let i = 1; i < ks.length; i++) union(ks[0], ks[i]);
        if (el.t === 'spdt') union(ks[0], ks[2]); // a-o1 已是相邻 union，再并 a-o2
    }
    const roots = new Set([...parent.keys()].map((k) => find(k)));
    return roots.size;
}

console.log('== circuit-levels ==');
assert(LEVELS.length === 20, 'LEVELS 应为 20 关，实际 ' + LEVELS.length);
for (const diff of ['easy', 'medium', 'hard', 'expert']) {
    assert(LEVELS.filter((l) => l.diff === diff).length === 5, diff + ' 应为 5 关');
}
assert(new Set(LEVELS.map((l) => l.id)).size === 20, '关卡 id 不得重复');

for (const lv of LEVELS) {
    const els = lv.elements;
    const bats = els.filter((e) => e.t === 'bat');
    const targets = els.filter((e) => e.t === 'bulb' && e.target);
    const k = operableIndexes(lv).length;
    assert(bats.length === 1, lv.id + ' 恰好 1 个电池');
    assert(targets.length >= 1, lv.id + ' 至少 1 个目标灯');
    assert(k >= 1 && k <= 8, lv.id + ' 可操作元件数 1..8，实际 ' + k);

    const cells = new Set();
    let inBounds = true, noOverlap = true;
    for (const e of els) {
        if (!(e.r >= 0 && e.r < GRID_ROWS && e.c >= 0 && e.c < GRID_COLS)) inBounds = false;
        const ck = e.r + ',' + e.c;
        if (cells.has(ck)) noOverlap = false;
        cells.add(ck);
    }
    assert(inBounds, lv.id + ' 全部元件在网格内');
    assert(noOverlap, lv.id + ' 无同格重叠元件');

    const counts = endpointKeys(lv);
    let paired = true;
    for (const [key, n] of counts) if (n !== 2) { paired = false; console.error('    端点 ' + key + ' 出现 ' + n + ' 次'); }
    assert(paired, lv.id + ' 所有端点恰好两两对接（无悬空）');
    assert(componentCount(lv) === 1, lv.id + ' 电路单连通分量');

    const init = initStatesOf(lv);
    assert(!isCircuitSolved(lv, init), lv.id + ' 初始态未解');
    const ms = minSteps(lv, init);
    assert(ms === lv.par, lv.id + ' par=' + lv.par + ' 应等于 BFS 最少步数 ' + ms);
    assert(ms >= 1, lv.id + ' 至少需要 1 步');
}

// ---- 每日挑战：731 天确定性 + 重掷合法性 ----
const DAY_MS = 86400000;
const baseDay = Date.UTC(2026, 0, 1);
const fmt = (t) => new Date(t).toISOString().slice(0, 10);
let dailyOk = true;
for (let i = 0; i < 731; i++) {
    const key = fmt(baseDay + i * DAY_MS);
    const a = dailyLevel(key);
    const b = dailyLevel(key);
    if (JSON.stringify(a) !== JSON.stringify(b)) { dailyOk = false; console.error('  ✗ 每日不确定性: ' + key); break; }
    const counts = endpointKeys(a);
    let paired = true;
    for (const [, n] of counts) if (n !== 2) paired = false;
    if (!paired) { dailyOk = false; console.error('  ✗ 每日悬空端点: ' + key); break; }
    const init = initStatesOf(a);
    if (isCircuitSolved(a, init)) { dailyOk = false; console.error('  ✗ 每日初始已解: ' + key); break; }
    const ms = minSteps(a, init);
    if (ms !== a.par || ms < 1) { dailyOk = false; console.error('  ✗ 每日 par 不符: ' + key + ' par=' + a.par + ' ms=' + ms); break; }
}
assert(dailyOk, '每日挑战 731 天全部通过（确定性/无悬空/初始未解/par 一致）');

console.log('circuit-levels: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
