#!/usr/bin/env node
// verify-maxwell-demon-levels.mjs — 麦克斯韦妖：20 关完整性 + par 由「诚实机器人」现算（无需浏览器）
//
// 锁定五件事：
//   1) schema：20 关、id 连续、中英名齐全、分子数 / 门宽 / target / stretch / par / budget 取值合理，
//      tipKey 必须在 js/maxwell-demon.js 的中英两份字典里都存在（漏一条 = 页面静默显示键名）；
//   2) par 由诚实机器人**现算**，不许手填：
//      solve(spec, spec.id).spent === spec.par。
//      诚实机器人的定义 —— 位置永远可见，快慢只能靠花钱观测才知道
//      （revealT > 0 且分子落在 scanR 圈内才记账；速率大小恒定 ⇒ 记住即永久有效）。
//      机器人怎么打，par 就是多少：玩家只要更会用信息就能省下预算拿星。
//   3) 可解性：机器人在**关卡自带预算**内真的 won；且 stretch（三星档）在预算拉满时也真的能摸到；
//   4) 零废窗口：每次武装都成交（passes === arms）—— 这是机器人不浪费预算的前提，
//      一旦物理/判定变了导致武装白花，par 就会虚高，这里立刻红；
//   5) dailyCourse 全日期扫描（2026-01-01 → 2027-12-31）：确定性、5 关、target 升序、
//      日内不重复、覆盖全部关卡。
//
// ⚠️ 机器人抵达预测的**基准面**是隔板带近侧缘（x = wallX ± (wallHalf + r)），不是中心线：
//    物理里 `inBand` 用 x ∈ [wallX - wallHalf - r, wallX + wallHalf + r]，分子进带的第一个子步
//    就被判定对准/弹回，比中心线早 ≈11px。按中心线预测 ⇒ 武装窗口大量作废（实测 7/18），
//    par 直接翻倍。改 RULES.gateWindow / VESSEL.wallHalf / RULES.molR 任一项都必须重跑本脚本。
//
// 用法：node scripts/verify-maxwell-demon-levels.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    VESSEL, RULES, STAGE, LEVELS, DAILY_COUNT,
    createWorld, stepWorld, isFast, budgetLeft, dailyCourse,
} from '../js/maxwell-demon-rules.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WX = VESSEL.wallX;
const DOOR_Y = VESSEL.doorY;
const DT = 1 / 60;

let failed = 0;
let passed = 0;
const ok = (cond, label, extra) => {
    if (cond) { passed++; return true; }
    failed++;
    console.error(`✗ ${label}${extra !== undefined ? ' —— ' + extra : ''}`);
    return false;
};

/* ────────────────────────── 诚实机器人 ────────────────────────── */
// 与 scratch/md-bot.mjs 同源；这里必须自包含（scripts/ 不许依赖 scratch/）。

/**
 * 分子多久后抵达隔板带近侧缘、能否真的穿过去。不能则返回 null。
 *
 * 两处都要对准 y：
 *   ① 进带那一刻（x = 带近侧缘）—— 不对准会被弹回（物理就是这么判的）；
 *   ② 跨中心线那一刻 —— 供机器人判断「这次武装会不会真的成交」。
 */
function arrival(w, m) {
    if (m.vx === 0) return null;
    const vxAbs = Math.abs(m.vx);
    const tEntry = ((m.vx < 0 ? (WX + VESSEL.wallHalf + m.r) : (WX - VESSEL.wallHalf - m.r)) - m.x) / m.vx;
    if (!(tEntry > 0)) return null;
    const tCenter = tEntry + (VESSEL.wallHalf + m.r) * 2 / vxAbs;
    if (tCenter > RULES.gateWindow * 0.9) return null;
    const y0 = VESSEL.pad + m.r, y1 = STAGE.h - VESSEL.pad - m.r;
    const span = y1 - y0;
    const yAt = (dt) => {
        let yy = (m.y + m.vy * dt) - y0;
        yy = ((yy % (2 * span)) + 2 * span) % (2 * span);
        if (yy > span) yy = 2 * span - yy;
        return y0 + yy;
    };
    const lim = w.doorHalf - m.r - 0.5;
    if (Math.abs(yAt(tEntry) - DOOR_Y) > lim) return null;
    if (Math.abs(yAt(tCenter) - DOOR_Y) > lim) return null;
    return tEntry;
}

/** 门附近的「好分子」：快分子该进左腔（此刻在右且向左），慢分子该进右腔（此刻在左且向右） */
function goodDir(m, fast) {
    return (fast && m.x > WX && m.vx < 0) || (!fast && m.x < WX && m.vx > 0);
}

/**
 * 跑一关。真引擎（createWorld + stepWorld）—— 求解即回放。
 * opts.unlimited —— 预算拉满（量 ΔT 天花板 / 验 stretch 可达）
 * opts.target    —— 覆盖 spec.target
 * opts.maxT      —— 模拟时长上限（秒）
 */
function solve(spec, seedKey, opts = {}) {
    const useSpec = {
        ...spec,
        budget: opts.unlimited ? 99999 : spec.budget,
        target: opts.target !== undefined ? opts.target : spec.target,
    };
    const w = createWorld(useSpec, seedKey);
    const n = w.molecules.length;
    const known = new Uint8Array(n);
    const fast = new Uint8Array(n);
    const maxT = opts.maxT ?? 150;
    let t = 0, maxGap = w.gap, scans = 0, arms = 0, passes = 0, expires = 0;
    let wonAt = null;

    while (w.state === 'playing' && t < maxT) {
        // 观测显影期间记账：门附近分子的快慢（速率大小恒定 ⇒ 一次记住，终身有效）
        if (w.revealT > 0) {
            for (const m of w.molecules) {
                const dx = m.x - WX, dy = m.y - DOOR_Y;
                if (dx * dx + dy * dy <= RULES.scanR * RULES.scanR) {
                    known[m.i] = 1;
                    fast[m.i] = isFast(m) ? 1 : 0;
                }
            }
        }
        const cands = [];
        for (const m of w.molecules) {
            const a = arrival(w, m);
            if (a !== null) cands.push({ m, a });
        }
        cands.sort((p, q) => p.a - q.a);

        let gate = false, scan = false;
        const first = cands[0];
        if (!w.gateArmed && first) {
            const dx = first.m.x - WX, dy = first.m.y - DOOR_Y;
            const near = dx * dx + dy * dy <= RULES.scanR * RULES.scanR;
            if (!known[first.m.i]) {
                // 还没看清：它已在观测圈内且当前无显影 ⇒ 花一次观测认识它
                if (near && w.revealT <= 0 && budgetLeft(w) >= RULES.costScan + RULES.costGate) scan = true;
            } else if (goodDir(first.m, !!fast[first.m.i]) && budgetLeft(w) >= RULES.costGate) {
                // 只有**第一个**抵达门洞的分子会过去 ⇒ 必须是它本身好才武装
                gate = true;
            }
        }
        if (scan) scans++;
        if (gate) arms++;
        stepWorld(w, DT, { gate, scan });
        for (const e of w.events) {
            if (e.type === 'pass') passes++;
            else if (e.type === 'gateExpire') expires++;
        }
        w.events.length = 0;
        t += DT;
        if (w.gap > maxGap) maxGap = w.gap;
        if (w.state === 'won' && wonAt === null) wonAt = t;
    }
    return {
        state: w.state, spent: w.spent, gap: w.gap, maxGap, t, wonAt,
        scans, arms, passes, expires,
        knownRatio: known.reduce((a, b) => a + b, 0) / n,
    };
}

/* ────────────────────────── 逐关校验 ────────────────────────── */

const pageSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'maxwell-demon.js'), 'utf8');

console.log('▶ 20 关 schema');
ok(LEVELS.length === 20, `关卡数 = 20（实际 ${LEVELS.length}）`);
ok(RULES.costGate === RULES.costScan, '两个动作同价（par 必为偶数）', `${RULES.costGate} / ${RULES.costScan}`);
ok(VESSEL.doorY === STAGE.h / 2, '门在容器中线', `${VESSEL.doorY} vs ${STAGE.h / 2}`);

const rowsOut = [];
let prevTarget = 0, prevStretch = 0, prevDoor = Infinity;
for (let i = 0; i < LEVELS.length; i++) {
    const lv = LEVELS[i];
    const tag = lv.id;
    ok(lv.id === `md${i + 1}`, `${tag} id 连续`, lv.id);
    ok(!!(lv.name && lv.name.en && lv.name.zh), `${tag} 中英名齐全`, JSON.stringify(lv.name));
    ok(Number.isInteger(lv.molecules) && lv.molecules >= 20 && lv.molecules <= 48,
        `${tag} 分子数 ∈ [20,48]`, String(lv.molecules));
    // ⚠️ 门宽下限 21：实测 <20 时机会密度崩塌（最窄关 150s 内 0 次成交，天花板 −0.019）
    ok(lv.doorHalf >= 21 && lv.doorHalf <= 40, `${tag} 门宽 ∈ [21,40]`, String(lv.doorHalf));
    ok(lv.target >= 0.2 && lv.target <= 0.7, `${tag} target ∈ [0.2,0.7]`, String(lv.target));
    ok(lv.stretch > lv.target + 0.08, `${tag} stretch 高于 target`, `${lv.target} → ${lv.stretch}`);
    ok(Number.isInteger(lv.par) && lv.par >= 4 && lv.par % 2 === 0,
        `${tag} par 为 ≥4 的偶数`, String(lv.par));
    ok(lv.budget - lv.par >= 12, `${tag} 预算余量 ≥12`, String(lv.budget - lv.par));
    ok(lv.target >= prevTarget, `${tag} target 不倒退（难度曲线）`, `${prevTarget} → ${lv.target}`);
    ok(lv.stretch >= prevStretch, `${tag} stretch 不倒退`, `${prevStretch} → ${lv.stretch}`);
    ok(lv.doorHalf <= prevDoor, `${tag} 门宽不反弹`, `${prevDoor} → ${lv.doorHalf}`);
    prevTarget = Math.max(prevTarget, lv.target);
    prevStretch = Math.max(prevStretch, lv.stretch);
    prevDoor = Math.min(prevDoor, lv.doorHalf);

    if (lv.tipKey !== null) {
        const hits = pageSrc.match(new RegExp(`\\b${lv.tipKey}\\s*:`, 'g'));
        ok(hits && hits.length >= 2, `${tag} tipKey「${lv.tipKey}」中英字典都有`,
            hits ? `${hits.length} 处` : '0 处');
    }
}

console.log('\n▶ par 现算（诚实机器人 + 真引擎）');
for (const lv of LEVELS) {
    const tag = lv.id;
    const r = solve(lv, lv.id);
    const s = solve(lv, lv.id, { unlimited: true, target: lv.stretch });
    const c = solve(lv, lv.id, { unlimited: true, target: 999 });
    rowsOut.push({ lv, r, s, ceiling: c.maxGap });

    ok(r.state === 'won', `${tag} 机器人在关卡预算内通关`, `${r.state} gap=${r.gap.toFixed(3)}`);
    ok(lv.par === r.spent, `${tag} par 与求解器一致`, `表内 ${lv.par} / 求解 ${r.spent}`);
    ok(r.passes === r.arms && r.expires === 0, `${tag} 零废窗口（每次武装都成交）`,
        `arms=${r.arms} passes=${r.passes} expire=${r.expires}`);
    ok(r.passes >= 2, `${tag} 至少成交 2 次`, String(r.passes));
    ok(s.state === 'won', `${tag} stretch 可达（三星档）`, `${s.state} maxGap=${s.maxGap.toFixed(3)}`);
    ok(c.maxGap >= lv.stretch + 0.04, `${tag} 天花板余量 ≥0.04`,
        `ceiling=${c.maxGap.toFixed(3)} stretch=${lv.stretch}`);
    ok(r.spent <= lv.budget, `${tag} 花费未超预算`, `${r.spent} / ${lv.budget}`);
}

console.log(`\n  ${'id'.padEnd(5)}${'n'.padStart(3)}${'门'.padStart(4)}${'target'.padStart(7)}${'stretch'.padStart(8)}${'天花板'.padStart(7)}${'par'.padStart(4)}${'预算'.padStart(5)}${'观测'.padStart(5)}${'成交'.padStart(5)}  用时`);
for (const { lv, r, ceiling } of rowsOut) {
    console.log(`  ${lv.id.padEnd(5)}${String(lv.molecules).padStart(3)}${String(lv.doorHalf).padStart(4)}`
        + `${lv.target.toFixed(2).padStart(7)}${lv.stretch.toFixed(2).padStart(8)}${ceiling.toFixed(3).padStart(7)}`
        + `${String(lv.par).padStart(4)}${String(lv.budget).padStart(5)}${String(r.scans).padStart(5)}${String(r.passes).padStart(5)}`
        + `  ${r.wonAt === null ? '—' : r.wonAt.toFixed(1) + 's'}`);
}

// 确定性：同一关跑两次必须完全一致（种子化物理的前提）
{
    const a = solve(LEVELS[0], LEVELS[0].id);
    const b = solve(LEVELS[0], LEVELS[0].id);
    ok(a.spent === b.spent && Math.abs(a.wonAt - b.wonAt) < 1e-9, '求解确定性（两次一致）',
        `${a.spent}/${a.wonAt} vs ${b.spent}/${b.wonAt}`);
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
    if (!a.every(c => c && typeof c.id === 'string' && Number.isFinite(c.target))) { shapeFail++; continue; }
    const tags = a.map(c => c.id);
    for (const t of tags) used.add(t);
    if (new Set(tags).size !== tags.length) dupFail++;
    for (let i = 1; i < a.length; i++) if (a[i].target < a[i - 1].target) orderFail++;
}
ok(detFail === 0, 'dailyCourse 确定性（两次生成全一致）', `${detFail} 天漂移`);
ok(shapeFail === 0, `每日 ${DAILY_COUNT} 个完整关卡对象`, `${shapeFail} 天异常`);
ok(dupFail === 0, '每日课程内不重复', `${dupFail} 天重复`);
ok(orderFail === 0, '每日课程按 target 升序', `${orderFail} 天乱序`);
ok(sweep >= 730, `扫描天数 ≥730（实际 ${sweep}）`);
ok(used.size === LEVELS.length, `每日抽样覆盖全部 ${LEVELS.length} 关`, `实际 ${used.size}`);
{
    const course = dailyCourse('20260921');
    const w = createWorld(course[0], course[0].id);
    ok(w.state === 'playing' && w.molecules.length === course[0].molecules,
        '每日首关可直接开局', `state=${w.state} n=${w.molecules.length}`);
    console.log(`  （黄金锚：2026-09-21 → ${course.map(c => c.id).join(',')}）`);
}

console.log(failed === 0
    ? `\nverify-maxwell-demon-levels 全部通过 ✅（${passed} 项断言，${LEVELS.length} 关）`
    : `\n${failed} 个失败 ❌（通过 ${passed}）`);
process.exit(failed === 0 ? 0 : 1);
