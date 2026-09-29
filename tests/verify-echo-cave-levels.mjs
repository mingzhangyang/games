#!/usr/bin/env node
// verify-echo-cave-levels.mjs — 回声洞窟 Echo Cave：关卡完整性 + par 求解器交叉校验（无需浏览器）
//
// 锁定四件事：
//   1) 20 关 schema：地图恒为 32 行 × 24 列、边界全为实体（不允许出现开口地图）、
//      恰好 1 个起点 / 1 个洞口、声晶 1..5 颗、荆棘分布合理、
//      连通性（起点—洞口—每颗声晶在同一片可通行区；**荆棘视作墙** —— par 路线必须是零伤害路线）；
//   2) par 由两级 BFS 求解器现算，不许手填：
//      (a) 纯通关 par：节点 = 上次脉冲所在格；一跳 =「走廊距离 ≤ safeR 的自由移动 + 再发一次脉冲」；
//          起点安全圈 = {P}（未鸣响等于没有信息 ⇒ 第一次脉冲必然在 P），
//          par = P →「距洞口 ≤ safeR 的格」的最少跳数 + 1；
//      (b) 三星可达：状态 = (上次脉冲格, 声晶掩码)，求「全收 + 通关」的最小脉冲数 fullMin，
//          断言 fullMin === par（三星解存在，且 par 没有被人为放宽）；
//   3) 真实引擎回放：把 (b) 给出的脉冲链（含声晶绕行）喂给 createWorld/stepWorld，
//      用 BFS 梯度逐格转向（.move toward 下一格中心），断言真的 won、
//      pulseCount === par、got === total、hearts 无损 —— 即 par 在真实碰撞半径下走得通；
//   4) dailyCourse 全日期扫描（2026-01-01 → 2027-12-31）：确定性、5 关、par 升序、
//      日內不重复、覆盖全部关卡。
//
// ⚠️ safeR 的口径：脉冲实际揭示半径 pulseMaxR = 240px = 12 格，玩家可信穿越半径 safeR = 9 格
// （多留 3 格余量）。改 safeR / pulseMaxR 任意一侧都必须重跑本脚本。
//
// 用法：node scripts/verify-echo-cave-levels.mjs

import {
    GRID, RULES, LEVELS, DAILY_COUNT,
    parseCave, createWorld, stepWorld, computeField, dailyCourse,
} from '../js/echo-cave-caves.js';

const { cols, rows, cell } = GRID;
const SAFE = RULES.safeR;
const DT = 1 / 60;

let failed = 0;
let passed = 0;
const ok = (cond, label, extra) => {
    if (cond) { passed++; return true; }
    failed++;
    console.error(`✗ ${label}${extra !== undefined ? ' —— ' + extra : ''}`);
    return false;
};


/* ────────────────────────── 求解器 ────────────────────────── */
// 走廊距离场做缓存：同一个洞穴里节点数 ≤ 600，每个 BFS 是 O(cells)，完全够快。
class Fields {
    constructor(solid) { this.solid = solid; this.cache = new Map(); }
    of(idx) {
        let f = this.cache.get(idx);
        if (f) return f;
        const cx = idx % cols;
        const cy = (idx - cx) / cols;
        f = computeField(this.solid, cols, rows, cx, cy);
        this.cache.set(idx, f);
        return f;
    }
}

/** 荆棘当作墙：par 路线必须是「能躲开的路线」 */
function buildSolid(cave) {
    const g = Uint8Array.from(cave.grid);
    for (const t of cave.thorns) g[t.cy * cols + t.cx] = 1;
    return g;
}

/**
 * 导航栅格：荆棘 + 其曼哈顿半径 1 的一圈都算不可走。
 *
 * ⚠️ 为什么必须留这一格：真实判定是 thornR + playerR = 19px，而相邻格中心间距正好 20px
 * ——只差 1px。玩家沿「格中心→格中心」移动时会带 ±2.5px 的到位公差，擦身而过必然掉血。
 * 于是 par 路线必须给每根荆棘留出一格余量：这既是可玩性要求（三星 = 零伤害路线），
 * 也让荆棘的定位回到「惩罚偏离最优路线」而不是「随机掉血」。
 */
function buildNav(cave) {
    const g = buildSolid(cave);
    for (const t of cave.thorns) {
        const idx = t.cy * cols + t.cx;
        const cx = t.cx, cy = t.cy;
        g[idx] = 1;
        if (cx > 0) g[idx - 1] = 1;
        if (cx < cols - 1) g[idx + 1] = 1;
        if (cy > 0) g[idx - cols] = 1;
        if (cy < rows - 1) g[idx + cols] = 1;
    }
    return g;
}

/**
 * 纯通关 par：连贯idelberg 一跳 = 同一次脉冲的信息覆盖圈（走廊距离 ≤ SAFE）。
 * 返回 { par, chain } —— chain 是脉冲格序列（chain[0] = P）。
 */
function solvePar(fields, startIdx, exitIdx) {
    const prev = new Map([[startIdx, null]]);
    const hops = new Map([[startIdx, 0]]);
    let frontier = [startIdx];
    let h = 0;
    while (frontier.length) {
        for (const s of frontier) {
            const d = fields.of(s)[exitIdx];
            if (d >= 0 && d <= SAFE) return { par: h + 1, chain: unwind(prev, s) };
        }
        const next = [];
        for (const s of frontier) {
            const f = fields.of(s);
            for (let i = 0; i < f.length; i++) {
                if (f[i] < 0 || f[i] > SAFE || hops.has(i)) continue;
                hops.set(i, h + 1);
                prev.set(i, s);
                next.push(i);
            }
        }
        frontier = next;
        h++;
    }
    return null;
}

function unwind(prev, endNode) {
    const chain = [];
    let cur = endNode;
    while (cur !== null && cur !== undefined) {
        chain.push(cur);
        cur = prev.get(cur);
    }
    return chain.reverse();
}

/**
 * 三星可达：状态 = (上次脉冲格, 声晶掩码)。
 * 在某状态 s 下，走廊距离 ≤ SAFE 的所有声晶都能顺路拾取（信息 = 可行动范围）。
 * 返回 { pulses, chain } 或 null（全收不可达）。
 */
function solveFull(fields, startIdx, exitIdx, crystalIdxs, parCap) {
    const K = crystalIdxs.length;
    const full = (1 << K) - 1;
    const stride = full + 1;
    const key = (n, m) => n * stride + m;
    const bitsCache = new Map();
    const bitsOf = (node) => {
        let m = bitsCache.get(node);
        if (m !== undefined) return m;
        m = 0;
        const f = fields.of(node);
        for (let i = 0; i < K; i++) {
            const d = f[crystalIdxs[i]];
            if (d >= 0 && d <= SAFE) m |= (1 << i);
        }
        bitsCache.set(node, m);
        return m;
    };
    const m0 = bitsOf(startIdx);
    const prevKey = new Map([[key(startIdx, m0), null]]);
    let frontier = [[startIdx, m0]];
    let h = 0;
    while (frontier.length && h <= parCap + 3) {
        for (const [s, m] of frontier) {
            if (m !== full) continue;
            const d = fields.of(s)[exitIdx];
            if (d >= 0 && d <= SAFE) {
                const chain = [];
                let kk = key(s, m);
                while (kk !== null) {
                    const node = Math.floor(kk / stride);
                    chain.push(node);
                    kk = prevKey.get(kk);
                }
                return { pulses: h + 1, chain: chain.reverse() };
            }
        }
        const next = [];
        for (const [s, m] of frontier) {
            const f = fields.of(s);
            const fromKey = key(s, m);
            for (let i = 0; i < f.length; i++) {
                if (i === s || f[i] < 0 || f[i] > SAFE) continue;
                const nm = m | bitsOf(i);
                const kk = key(i, nm);
                if (prevKey.has(kk)) continue;
                prevKey.set(kk, fromKey);
                next.push([i, nm]);
            }
        }
        frontier = next;
        h++;
    }
    return null;
}

/* ─────────────── 真实引擎回放（物理层交叉验证） ─────────────── */

function cellCenter(idx) {
    const cx = idx % cols;
    const cy = (idx - cx) / cols;
    return { x: cx * cell + cell / 2, y: cy * cell + cell / 2 };
}

function cellIndexAt(x, y) {
    const cx = Math.max(0, Math.min(cols - 1, Math.floor(x / cell)));
    const cy = Math.max(0, Math.min(rows - 1, Math.floor(y / cell)));
    return cy * cols + cx;
}

/** 沿「目标格为中心的距离场」逐格下降把玩家走到 targetIdx */
function walkTo(world, field, targetIdx, maxSteps) {
    const target = cellCenter(targetIdx);
    for (let step = 0; step < maxSteps; step++) {
        if (world.state !== 'playing') return true;
        const p = world.player;
        const dx = target.x - p.x;
        const dy = target.y - p.y;
        if (Math.hypot(dx, dy) < 2.5) return true;
        let aimX = target.x, aimY = target.y;
        const cur = cellIndexAt(p.x, p.y);
        const curD = field[cur];
        if (curD > 0) {
            const cx = cur % cols;
            const nbs = [];
            if (cx > 0) nbs.push(cur - 1);
            if (cx < cols - 1) nbs.push(cur + 1);
            if (cur >= cols) nbs.push(cur - cols);
            if (cur < cols * (rows - 1)) nbs.push(cur + cols);
            for (const n of nbs) {
                if (field[n] >= 0 && field[n] === curD - 1) {
                    const c = cellCenter(n);
                    aimX = c.x; aimY = c.y;
                    break;
                }
            }
        }
        const ax = aimX - p.x;
        const ay = aimY - p.y;
        const len = Math.max(1e-6, Math.hypot(ax, ay));
        stepWorld(world, DT, { mx: ax / len, my: ay / len });
    }
    return false;
}

/**
 * 把求解器给的脉冲链 + 声晶绕行走一遍真实物理：
 * 每到一个脉冲格发一次脉冲（pulseCount 应等于 par），
 * 同时校验真实碰撞半径 / 拾取半径 / 洞口判定下这条路线真的走得通。
 */
function replay(spec, cave, chain) {
    const world = createWorld(spec);
    const nav = buildNav(cave);              // 荆棘 + 1 格避让余量
    const crystalIdxs = cave.crystals.map(c => c.cy * cols + c.cx);
    const exitIdx = cave.exit.cy * cols + cave.exit.cx;
    const seen = new Set();
    const route = [];
    for (let k = 0; k < chain.length; k++) {
        route.push({ idx: chain[k], pulse: true });
        const f = computeField(nav, cols, rows, chain[k] % cols, Math.floor(chain[k] / cols));
        for (const c of crystalIdxs) {
            if (seen.has(c)) continue;
            const d = f[c];
            if (d >= 0 && d <= SAFE) { seen.add(c); route.push({ idx: c, pulse: false }); }
        }
    }
    route.push({ idx: exitIdx, pulse: false });

    for (const leg of route) {
        const cur = cellIndexAt(world.player.x, world.player.y);
        if (cur !== leg.idx) {
            if (nav[leg.idx] !== 0) {
                return { error: `路线经过荆棘避让区/墙 ${leg.idx % cols},${Math.floor(leg.idx / cols)}` };
            }
            const f = computeField(nav, cols, rows, leg.idx % cols, Math.floor(leg.idx / cols));
            if (f[cur] < 0) {
                return { error: `(${Math.round(world.player.x)},${Math.round(world.player.y)}) 到 ${leg.idx % cols},${Math.floor(leg.idx / cols)} 没有安全通道` };
            }
            const reached = walkTo(world, f, leg.idx, 3000);
            if (!reached) {
                return { error: `走向 ${leg.idx % cols},${Math.floor(leg.idx / cols)} 时卡住（(${Math.round(world.player.x)},${Math.round(world.player.y)})）` };
            }
        }
        if (leg.pulse) stepWorld(world, DT, { mx: 0, my: 0, pulse: true });
        if (world.state !== 'playing') break;
    }
    // 收尾：让玩家静止到 state 判定（如果还没触发）
    for (let i = 0; i < 240 && world.state === 'playing'; i++) stepWorld(world, DT, { mx: 0, my: 0 });
    return {
        state: world.state,
        pulses: world.pulseCount,
        got: world.got,
        total: world.total,
        hearts: world.hearts,
    };
}

/* ────────────────────────── 逐关校验 ────────────────────────── */

function analyse(spec) {
    const out = { id: spec.id, specPar: spec.par, tipKey: spec.tipKey };
    if (!Array.isArray(spec.map)) { out.fatal = 'map 不是数组'; return out; }
    if (spec.map.length !== rows) { out.fatal = `行数 ${spec.map.length} ≠ ${rows}`; return out; }
    const bad = spec.map.findIndex(s => typeof s !== 'string' || s.length !== cols);
    if (bad >= 0) {
        out.fatal = `第 ${bad} 行长度 ${spec.map[bad] ? spec.map[bad].length : 'n/a'} ≠ ${cols}`;
        return out;
    }
    let cave;
    try { cave = parseCave(spec.map); } catch (e) { out.fatal = `parseCave: ${e.message}`; return out; }

    const joined = spec.map.join('');
    const n = (ch) => joined.split(ch).length - 1;
    out.crystals = cave.crystals.length;
    out.thorns = cave.thorns.length;
    out.pCount = n('P');
    out.eCount = n('E');
    out.open = joined.replace(/[# M]/g, '').length;
    out.moss = n('M');

    // 边界必须是实体
    out.borderBad = [];
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            if (y !== 0 && y !== rows - 1 && x !== 0 && x !== cols - 1) continue;
            const ch = spec.map[y][x];
            if (ch !== '#' && ch !== 'M' && ch !== ' ') out.borderBad.push(`${x},${y}:${ch}`);
        }
    }

    // 声晶数合法 & 与 grid 内的 'C' 一致（防止有人 ⇄ 改 ✍ Map 不改数据）
    out.floorSet = new Set();
    for (let i = 0; i < cols * rows; i++) if (cave.grid[i] === 0) out.floorSet.add(i);
    out.thornSet = new Set(cave.thorns.map(t => t.cy * cols + t.cx));

    // 埋进岩壁里的荆棘（四周没有任何可通行格）= 设计噪声
    out.thornBuried = cave.thorns.filter(t => {
        const idx = t.cy * cols + t.cx;
        const cx = t.cx, cy = t.cy;
        const nb = [];
        if (cx > 0) nb.push(idx - 1);
        if (cx < cols - 1) nb.push(idx + 1);
        if (cy > 0) nb.push(idx - cols);
        if (cy < rows - 1) nb.push(idx + cols);
        return !nb.some(k => out.floorSet.has(k) && !out.thornSet.has(k));
    }).map(t => `${t.cx},${t.cy}`);

    // ⚠️ 求解 / 连通性 / 回放统一跑在 nav（荆棘 + 1 格避让）栅格上。
    // 否则求解器会把脉冲节点摆到「贴脸」的格子上，回放到真实物理就卡住或掉血。
    const nav = buildNav(cave);
    const startIdx = cave.start.cy * cols + cave.start.cx;
    const exitIdx = cave.exit.cy * cols + cave.exit.cx;
    const manh = (a, b) => {
        const ax = a % cols, ay = (a - ax) / cols;
        const bx = b % cols, by = (b - bx) / cols;
        return Math.abs(ax - bx) + Math.abs(ay - by);
    };
    out.tooClose = [];
    const specials = [{ name: 'P', idx: startIdx }, { name: 'E', idx: exitIdx }]
        .concat(cave.crystals.map((c, i) => ({ name: `C${i + 1}`, idx: c.cy * cols + c.cx })));
    for (const sp of specials) {
        for (const t of out.thornSet) {
            if (manh(sp.idx, t) < 2) out.tooClose.push(`${sp.name}↔(${t % cols},${Math.floor(t / cols)})`);
        }
    }
    const fields = new Fields(nav);
    out.fields = fields;
    out.cave = cave;
    out.startIdx = startIdx;
    out.exitIdx = exitIdx;

    // 连通性（荆棘 = 墙）
    const fStart = fields.of(startIdx);
    out.exitReach = fStart[exitIdx];
    out.crystalUnreach = cave.crystals.filter(c => fStart[c.cy * cols + c.cx] < 0).map(c => `${c.cx},${c.cy}`);
    if (out.exitReach < 0) return out;

    const pa = solvePar(fields, startIdx, exitIdx);
    out.solvedPar = pa ? pa.par : Infinity;
    const fa = solveFull(fields, startIdx, exitIdx, cave.crystals.map(c => c.cy * cols + c.cx), pa ? pa.par : 8);
    out.fullMin = fa ? fa.pulses : Infinity;
    out.chain = fa ? fa.chain : null;
    if (out.chain) {
        const rp = replay(spec, cave, out.chain);
        out.replay = rp;
    }
    return out;
}

console.log('▶ 逐关 schema / 连通性 / par 求解');
ok(LEVELS.length === 20, `关卡数 = 20（实际 ${LEVELS.length}）`);
ok(SAFE * cell <= RULES.pulseMaxR,
    `safeR（${SAFE} 格 = ${SAFE * cell}px）不能超过真实揭示半径 pulseMaxR=${RULES.pulseMaxR}px`);
ok(RULES.pulseMaxR / cell >= SAFE + 2, '揭示半径比安全圈多留至少 2 格余量',
    `${RULES.pulseMaxR / cell} vs ${SAFE}`);

const rowsOut = [];
let prevPar = 0;
for (const lv of LEVELS) {
    const r = analyse(lv);
    rowsOut.push(r);
    const tag = r.id;
    if (r.fatal) { ok(false, `${tag} 地图合法`, r.fatal); continue; }
    ok(r.pCount === 1, `${tag} 恰好 1 个起点 P`, String(r.pCount));
    ok(r.eCount === 1, `${tag} 恰好 1 个洞口 E`, String(r.eCount));
    ok(r.crystals >= 1 && r.crystals <= 5, `${tag} 声晶数 1..5`, String(r.crystals));
    ok(r.thorns <= 16, `${tag} 荆棘不超过 16 个`, String(r.thorns));
    ok(r.borderBad.length === 0, `${tag} 边界全为实体`, r.borderBad.join(' '));
    ok(r.open >= 90, `${tag} 可通行格不少于 90`, String(r.open));
    ok(r.thornBuried.length === 0, `${tag} 没有埋进岩壁的荆棘`, r.thornBuried.join(' '));
    ok(r.tooClose.length === 0, `${tag} 荆棘离起点/洞口/声晶 ≥2 格`, r.tooClose.join(' '));
    ok(typeof r.tipKey === 'string' && r.tipKey.length > 0, `${tag} tipKey 非空`);
    ok(Number.isInteger(lv.par) && lv.par >= 1 && lv.par <= 14, `${tag} par ∈ [1,14]`, String(lv.par));
    ok(r.exitReach >= 0, `${tag} 洞口可达（荆棘视作墙）`, `dist=${r.exitReach}`);
    ok(r.crystalUnreach.length === 0, `${tag} 每颗声晶都可达`, r.crystalUnreach.join(' '));
    if (r.exitReach < 0) continue;
    ok(lv.par === r.solvedPar, `${tag} par 与求解器一致`, `手写 ${lv.par} / 求解 ${r.solvedPar}`);
    ok(r.fullMin === r.solvedPar, `${tag} 三星可达（全收 + 通关 = par 次脉冲）`,
        `全收最少 ${r.fullMin} 次 vs par ${r.solvedPar}`);
    if (r.replay) {
        ok(r.replay.error === undefined, `${tag} 真实引擎回放不卡住`, String(r.replay.error));
        ok(r.replay.state === 'won', `${tag} 回放判定获胜`, String(r.replay.state));
        ok(r.replay.pulses === r.solvedPar, `${tag} 回放脉冲数 == par`,
            `${r.replay.pulses} vs ${r.solvedPar}`);
        ok(r.replay.got === r.replay.total, `${tag} 回放全收声晶`,
            `${r.replay.got}/${r.replay.total}`);
        ok(r.replay.hearts === RULES.hearts, `${tag} par 路线零伤害`, `hearts=${r.replay.hearts}`);
    }
    ok(lv.par >= prevPar, `${tag} par 不倒退（难度曲线）`, `${prevPar} → ${lv.par}`);
    prevPar = Math.max(prevPar, lv.par);
}

console.log(`  ${'id'.padEnd(5)}${'par'.padStart(3)}${'求解'.padStart(5)}${'全收'.padStart(5)}${'晶'.padStart(3)}${'刺'.padStart(3)}${'苔'.padStart(3)}${'开放'.padStart(5)}  回放`);
for (const r of rowsOut) {
    if (r.fatal) { console.log(`  ${r.id.padEnd(5)} FATAL ${r.fatal}`); continue; }
    const rp = r.replay
        ? (r.replay.error
            ? 'ERR ' + r.replay.error
            : `${r.replay.state} p=${r.replay.pulses} c=${r.replay.got}/${r.replay.total} h=${r.replay.hearts}`)
        : '-';
    console.log(`  ${r.id.padEnd(5)}${String(r.specPar).padStart(3)}${String(r.solvedPar).padStart(5)}${String(r.fullMin).padStart(5)}${String(r.crystals).padStart(3)}${String(r.thorns).padStart(3)}${String(r.moss).padStart(3)}${String(r.open).padStart(5)}  ${rp}`);
}

/* ────────────────────────── dailyCourse ────────────────────────── */
console.log('\n▶ dailyCourse 全日期扫描（2026-01-01 → 2027-12-31）');
ok(DAILY_COUNT === 5, 'DAILY_COUNT = 5', String(DAILY_COUNT));
ok(DAILY_COUNT <= LEVELS.length, `每日 ${DAILY_COUNT} 关 ≤ 关卡池 ${LEVELS.length}`);
const dayStart = Date.UTC(2026, 0, 1);
const dayEnd = Date.UTC(2027, 11, 31);
let sweep = 0, detFail = 0, shapeFail = 0, orderFail = 0, dupFail = 0;
const used = new Set();
for (let ts = dayStart; ts <= dayEnd; ts += 86400000) {
    const d = new Date(ts);
    const key = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
    const a = dailyCourse(key);
    const b = dailyCourse(key);
    sweep++;
    if (JSON.stringify(a) !== JSON.stringify(b)) detFail++;
    if (!Array.isArray(a) || a.length !== DAILY_COUNT) { shapeFail++; continue; }
    if (!a.every(c => c && Array.isArray(c.map) && c.map.length === rows)) { shapeFail++; continue; }
    const tags = a.map(c => c.id);
    for (const t of tags) used.add(t);
    if (new Set(tags).size !== tags.length) dupFail++;
    for (let i = 1; i < a.length; i++) if (a[i].par < a[i - 1].par) orderFail++;
}
ok(detFail === 0, 'dailyCourse 确定性（两次生成全一致）', `${detFail} 天漂移`);
ok(shapeFail === 0, `每日 ${DAILY_COUNT} 个完整关卡对象`, `${shapeFail} 天异常`);
ok(dupFail === 0, '每日课程内不重复', `${dupFail} 天重复`);
ok(orderFail === 0, '每日课程按 par 升序', `${orderFail} 天乱序`);
ok(sweep >= 730, `扫描天数 ≥730（实际 ${sweep}）`);
ok(used.size === LEVELS.length, `每日抽样覆盖全部 ${LEVELS.length} 关`, `实际 ${used.size}`);
{
    const course = dailyCourse('20260921');
    const w = createWorld(course[0]);
    ok(w.state === 'playing' && w.crystals.length >= 1, '每日首关可直接开局', `state=${w.state}`);
    console.log(`  （黄金锚：2026-09-21 → ${course.map(c => c.id).join(',')}）`);
}

console.log(failed === 0
    ? `\nverify-echo-cave-levels 全部通过 ✅（${passed} 项断言，${LEVELS.length} 关）`
    : `\n${failed} 个失败 ❌（通过 ${passed}）`);
process.exit(failed === 0 ? 0 : 1);