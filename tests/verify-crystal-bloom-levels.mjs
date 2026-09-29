/**
 * Crystal Bloom 晶绽 — 关卡校验（M2）
 * ==================================================================
 * par 铁律：关卡表里的 par 一律由这里的求解器现算，绝不手填。
 * 断言分六类：
 *   ① schema        —— 20 关、id 连续、中英名、晶形合法、终温窗口/时限自洽
 *   ② par 可解      —— lv.par === solve(lv).cost（求解器真跑出一条通关方案）
 *   ③ par 最小      —— 成本 < par 的层里一个解都没有（穷尽低层）
 *   ④ 方案回放      —— 用真实引擎逐帧重放参考解，断言 evaluate() 四项全绿
 *   ⑤ 三星可达      —— par 层内存在 quality ≥ lv.minQuality 的解
 *   ⑥ daily         —— 赛程确定性 / 5 关 / 不重复 / par 升序
 *
 * 网格密度说明：par 是**离散网格上的最小成本**。低层必须穷尽才能断言「没有更便宜
 * 的解」，所以 2 锚/3 锚用了比 1 锚更粗的网格（否则单关 20 秒起）。
 */
import * as R from '../js/crystal-bloom-rules.js';

const TS = [3, 8, 14, 20, 28, 36, 45, 55, 66, 78, 90];
const TEMP = [10, 14, 18, 22, 26, 30, 34, 38, 42, 46, 50, 54, 58, 62, 66, 70, 74, 78, 82, 86];
const STIRS = [1, 5, 9, 13, 18, 24, 31, 39, 50, 64];
const TS2 = [3, 12, 24, 40, 58, 78];
const TEMP2 = [10, 18, 26, 34, 42, 50, 58, 66, 74, 82];
const TS3 = [5, 18, 36, 60, 90];

/** 多次搅拌按「首尾相接连续覆盖」参数化 —— 压住一段高 S 的最省次数方案必然如此 */
const stirRuns = (s, k) => Array.from({ length: k }, (_, i) => s + i * R.RULES.stirSpan);

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } };
const section = (t) => console.log('\n▶ ' + t);

function attempt(spec, anchors, stirs) {
    const w = R.simulate(spec, anchors, stirs, spec.id);
    if (!R.evaluate(spec, w).pass) return null;
    return { cost: R.costOf(anchors, stirs), anchors, stirs, w };
}

function* level1(spec) {
    for (const t of TS) for (const T of TEMP) {
        if (T > spec.t0) continue;
        yield attempt(spec, [{ t, T }], []);
    }
}
function* level2(spec) {
    // ⚠️ 先「1 锚 + 1 搅拌」再「2 锚」：搅拌是压档的直球解，命中率高得多。
    for (const t of TS) for (const T of TEMP) {
        if (T > spec.t0) continue;
        for (const s of STIRS) yield attempt(spec, [{ t, T }], [s]);
    }
    for (let i = 0; i < TS2.length; i++) for (let j = i + 1; j < TS2.length; j++) {
        for (const T1 of TEMP2) {
            if (T1 > spec.t0) continue;
            for (const T2 of TEMP2) {
                if (T2 > T1) continue;
                yield attempt(spec, [{ t: TS2[i], T: T1 }, { t: TS2[j], T: T2 }], []);
            }
        }
    }
}
function* level3(spec) {
    for (const t of TS) for (const T of TEMP) {
        if (T > spec.t0) continue;
        for (const s of STIRS) yield attempt(spec, [{ t, T }], stirRuns(s, 2));
    }
    for (let i = 0; i < TS3.length; i++) for (let j = i + 1; j < TS3.length; j++) for (let k = j + 1; k < TS3.length; k++) {
        for (const T1 of TEMP2) {
            if (T1 > spec.t0) continue;
            for (const T2 of TEMP2) {
                if (T2 > T1) continue;
                for (const T3 of TEMP2) {
                    if (T3 > T2) continue;
                    yield attempt(spec, [{ t: TS3[i], T: T1 }, { t: TS3[j], T: T2 }, { t: TS3[k], T: T3 }], []);
                }
            }
        }
    }
    for (let i = 0; i < TS2.length; i++) for (let j = i + 1; j < TS2.length; j++) {
        for (const T1 of TEMP2) {
            if (T1 > spec.t0) continue;
            for (const T2 of TEMP2) {
                if (T2 > T1) continue;
                for (const s of STIRS) yield attempt(spec, [{ t: TS2[i], T: T1 }, { t: TS2[j], T: T2 }], [s]);
            }
        }
    }
}
function* level4(spec) {
    for (const t of TS) for (const T of TEMP) {
        if (T > spec.t0) continue;
        for (const s of STIRS) yield attempt(spec, [{ t, T }], stirRuns(s, 3));
    }
}
const LEVEL_GENS = [null, level1, level2, level3, level4];

function solve(spec, maxCost = 4) {
    for (let c = 1; c <= maxCost; c++) {
        for (const r of LEVEL_GENS[c](spec)) if (r) return r;
    }
    return null;
}

/* ────────────────────── ① schema ────────────────────── */
section('① schema：20 关的结构自洽');
const LV = R.LEVELS;
ok(LV.length === 20, `关卡数应为 20，实际 ${LV.length}`);
LV.forEach((lv, i) => {
    ok(lv.id === 'cb' + (i + 1), `${lv.id} 的 id 与序号不符（应为 cb${i + 1}）`);
    ok(!!(lv.name && lv.name.en && lv.name.zh), `${lv.id} 缺中/英文名`);
    ok(R.HABIT_ORDER.includes(lv.target), `${lv.id} 目标晶形 ${lv.target} 不在 HABIT_ORDER 里`);
    ok(lv.tEndMin <= lv.tEndMax, `${lv.id} 终温窗口反向（${lv.tEndMin} > ${lv.tEndMax}）`);
    ok(lv.tEndMax <= lv.t0, `${lv.id} 终温上界 ${lv.tEndMax} 高于起始温度 ${lv.t0}`);
    ok(lv.tChill >= 1 && lv.tChill <= lv.tMax, `${lv.id} 急冷时限 ${lv.tChill} 超出 [1, ${lv.tMax}]`);
    ok(lv.minCells > 0 && lv.minQuality >= 0 && lv.minQuality <= 1, `${lv.id} 尺寸/质量门槛越界`);
    ok(lv.par >= 1 && Number.isInteger(lv.par), `${lv.id} par=${lv.par} 不是 ≥1 的整数`);
    ok(lv.tipKey === null || typeof lv.tipKey === 'string', `${lv.id} tipKey 类型不对`);
    if (lv.target === 'needle') {
        ok(!!lv.aniso && lv.maxAspect > 1, `${lv.id} 针状关必须给 aniso 与 maxAspect`);
    }
});
// 难度单调只能**同一晶形系列内**比：针状关的终温天然比枝晶关暖（针要中等温度才
// 长得出来），跨晶形比终温会误报。针状组只看终温与急冷时限，尺寸门槛另算。
const byHabit = new Map();
for (const lv of LV) {
    if (!byHabit.has(lv.target)) byHabit.set(lv.target, []);
    byHabit.get(lv.target).push(lv);
}
for (const [habit, list] of byHabit) {
    for (let i = 1; i < list.length; i++) {
        ok(list[i].tEndMax <= list[i - 1].tEndMax,
            `${list[i].id}（${habit}）终温上界比同系列前一关更暖（${list[i].tEndMax} > ${list[i - 1].tEndMax}）`);
        ok(list[i].tChill <= list[i - 1].tChill,
            `${list[i].id}（${habit}）急冷时限比同系列前一关更松`);
        if (habit !== 'needle') {
            ok(list[i].minCells >= list[i - 1].minCells,
                `${list[i].id}（${habit}）尺寸门槛比同系列前一关更低`);
        }
    }
}

/* ────────────────────── ② ③ par 现算 + 最小性 ────────────────────── */
section('②③ par：求解器现算 + 最小性');
const refs = new Map();
for (const lv of LV) {
    const t0 = Date.now();
    const r = solve(lv, 4);
    const dt = Date.now() - t0;
    ok(!!r, `${lv.id} 求解器在成本 ≤4 内找不到通关方案`);
    if (!r) continue;
    ok(r.cost === lv.par, `${lv.id} par 应为 ${r.cost}，关卡表里写的是 ${lv.par}`);
    // 最小性：所有更便宜的层必须一个解都没有
    for (let c = 1; c < lv.par; c++) {
        let cheaper = null;
        for (const x of LEVEL_GENS[c](lv)) if (x) { cheaper = x; break; }
        ok(!cheaper, `${lv.id} 存在成本 ${c} 的解，par=${lv.par} 不是最小值`);
    }
    refs.set(lv.id, r);
    const a = r.anchors.map(x => x.t + '→' + x.T).join(',');
    console.log(`  ✓ ${lv.id} ${lv.target.padEnd(9)} par=${r.cost} ${(a + (r.stirs.length ? ' | stir@' + r.stirs.join(',') : '')).padEnd(26)} cells ${String(r.w.cells).padStart(3)} q ${r.w.quality.toFixed(2)} (${dt}ms)`);
}

/* ────────────────────── ④ 参考解逐帧回放 ────────────────────── */
section('④ 参考解：用真实引擎逐帧重放');
for (const lv of LV) {
    const r = refs.get(lv.id);
    if (!r) continue;
    const w = R.createWorld(lv, lv.id);
    w.anchors = r.anchors;
    w.stirs = r.stirs;
    let steps = 0;
    while (w.state !== 'done' && w.t < lv.tMax) { R.stepWorld(w, r.anchors, r.stirs); steps++; }
    ok(w.state === 'done', `${lv.id} 回放没跑到 done（steps=${steps}）`);
    const ev = R.evaluate(lv, w);
    ok(ev.chilled, `${lv.id} 回放未满足急冷时限 tChill=${lv.tChill}`);
    ok(ev.endOk, `${lv.id} 回放终温 ${ev.lastT.toFixed(1)} 不在 [${lv.tEndMin}, ${lv.tEndMax}]`);
    ok(ev.shapeOk, `${lv.id} 回放晶形是 ${w.habit}，目标是 ${lv.target}`);
    ok(ev.sizeOk, `${lv.id} 回放尺寸 ${w.cells} < minCells ${lv.minCells}`);
    // 确定性：同一方案跑两遍必须逐格一致
    const w2 = R.simulate(lv, r.anchors, r.stirs, lv.id);
    let same = w2.cells === w.cells && w2.habit === w.habit;
    if (same) for (let i = 0; i < w.grid.length; i++) if (w.grid[i] !== w2.grid[i]) { same = false; break; }
    ok(same, `${lv.id} 同一方案两次模拟结果不一致（元胞自动机不是确定性的）`);
}

/* ────────────────────── ⑤ 三星可达 ────────────────────── */
section('⑤ 三星：par 层内存在 quality ≥ minQuality 的解');
for (const lv of LV) {
    const r = refs.get(lv.id);
    if (!r) continue;
    let best = r.w.quality;
    for (const x of LEVEL_GENS[lv.par](lv)) if (x && x.w.quality > best) best = x.w.quality;
    ok(best >= lv.minQuality, `${lv.id} par 层最优 quality=${best.toFixed(2)} < minQuality ${lv.minQuality}`);
    ok(R.starsForLevel(lv.par, lv.par, true, best, lv.minQuality) === 3,
        `${lv.id} 最优解拿不到三星（quality ${best.toFixed(2)}）`);
    ok(R.starsForLevel(lv.par + 1, lv.par, true, best, lv.minQuality) === 2,
        `${lv.id} 超 par 一档应恰好 2 星`);
    ok(R.starsForLevel(lv.par, lv.par, false, best, lv.minQuality) === 0,
        `${lv.id} 未通关应判 0 星`);
}

/* ────────────────────── ⑥ 每日赛程 ────────────────────── */
section('⑥ 每日赛程：730 天扫描');
{
    const seen = new Set();
    let bad = 0;
    for (let i = 0; i < 730; i++) {
        const d = new Date(Date.UTC(2026, 8, 22) + i * 86400000).toISOString().slice(0, 10);
        const course = R.dailyCourse(d);
        const again = R.dailyCourse(d);
        if (course.length !== Math.min(R.DAILY_COUNT, LV.length)) { bad++; continue; }
        if (course.map(l => l.id).join(',') !== again.map(l => l.id).join(',')) { bad++; continue; }
        if (new Set(course.map(l => l.id)).size !== course.length) { bad++; continue; }
        for (let k = 1; k < course.length; k++) if (course[k].par < course[k - 1].par) { bad++; break; }
        seen.add(course.map(l => l.id).join(','));
    }
    ok(bad === 0, `每日赛程有 ${bad} 天不满足（长度/确定性/不重复/par 升序）`);
    ok(seen.size > 20, `730 天只出现 ${seen.size} 种赛程，洗牌退化`);
    const anchor = R.dailyCourse('2026-09-22').map(l => l.id).join(',');
    ok(/^cb\d+(,cb\d+){4}$/.test(anchor), `黄金锚 2026-09-22 形如 ${anchor}，不是 5 关`);
    console.log(`  ✓ 黄金锚 2026-09-22 → ${anchor}（730 天共 ${seen.size} 种赛程）`);
}

console.log(`\nverify-crystal-bloom-levels ${fail === 0 ? '全部通过 ✅' : '失败 ❌'}（${pass} 项断言${fail ? '，' + fail + ' 项失败' : ''}）`);
process.exit(fail === 0 ? 0 : 1);
