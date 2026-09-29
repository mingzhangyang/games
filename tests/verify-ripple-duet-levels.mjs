#!/usr/bin/env node
/**
 * 涟漪双生关卡校验器
 *
 * par 一条都不信手写：每关都由 solvePar() 重算，并额外做**反向穷举** —— 把
 * 所有 cost < par 的摆位全过一遍，断言它们统统不达标（证明 par 是真的下界）。
 * 再用求解器给出的摆位回放一遍：satisfied 且 cost === par 且 3 星。
 */

import * as R from '../js/ripple-duet-rules.js';
import { LEVELS } from '../js/ripple-duet-levels.js';

let pass = 0;
const fails = [];
const ok = (cond, label) => {
    if (cond) pass++;
    else fails.push(label);
};

/* ① schema */
ok(LEVELS.length === 20, `关卡数应为 20，实际 ${LEVELS.length}`);
LEVELS.forEach((lv, i) => {
    const tag = `${lv.id || `idx${i}`}`;
    ok(lv.id === `rd${i + 1}`, `${tag}: id 应为 rd${i + 1}`);
    ok(!!(lv.name && lv.name.en && lv.name.zh), `${tag}: 缺中英名`);
    ok([64, 72, 80, 96].includes(lv.lambda), `${tag}: lambda ${lv.lambda} 不在允许档`);
    ok(Array.isArray(lv.ctrl) && lv.ctrl.length >= 1 && lv.ctrl.length <= 2, `${tag}: 可控源数应为 1~2`);
    (lv.ctrl || []).forEach((c, si) => {
        ok(c.i >= 0 && c.i < R.GRID.cols, `${tag}: 源${si} 列越界`);
        ok(c.j >= 0 && c.j < R.GRID.rows, `${tag}: 源${si} 行越界`);
        ok(Number.isInteger(c.ph) && c.ph >= 0 && c.ph < R.PHASES, `${tag}: 源${si} 相位越界`);
    });
    (lv.storms || []).forEach((s, si) => {
        ok(s.x > R.SEA.x && s.x < R.SEA.x + R.SEA.w, `${tag}: 风暴${si} x 越界`);
        ok(s.y > R.SEA.y && s.y < R.SEA.y + R.SEA.h, `${tag}: 风暴${si} y 越界`);
    });
    ok(Array.isArray(lv.targets) && lv.targets.length >= 1 && lv.targets.length <= 3, `${tag}: 目标数应为 1~3`);
    (lv.targets || []).forEach((t, ti) => {
        ok(['calm', 'blaze', 'lane'].includes(t.kind), `${tag}: 目标${ti} 类型非法`);
        if (t.kind === 'lane') {
            ok(t.tol > 0 && t.tol <= 0.12, `${tag}: 航道 tol ${t.tol} 虚高`);
            ok((t.n || 5) >= 5, `${tag}: 航道采样点应 ≥5`);
        } else if (t.kind === 'calm') {
            ok(t.tol > 0 && t.tol <= 0.08, `${tag}: 平静 tol ${t.tol} 虚高`);
            ok(t.x > R.SEA.x && t.x < R.SEA.x + R.SEA.w, `${tag}: 平静点在海面外`);
            ok(t.y > R.SEA.y && t.y < R.SEA.y + R.SEA.h, `${tag}: 平静点在海面外`);
        } else {
            ok(t.need >= 0.6, `${tag}: 点亮门槛 ${t.need} 过低`);
        }
    });
    ok(Number.isInteger(lv.par) && lv.par > 0, `${tag}: par 应为正整数`);
});

/* ② par 精确性 + 反向穷举（cost < par 全部不达标）+ 解摆位回放 */
function deltaGroups(src) {
    const g = new Map();
    for (let i = 0; i < R.GRID.cols; i++) {
        for (let j = 0; j < R.GRID.rows; j++) {
            for (let ph = 0; ph < R.PHASES; ph++) {
                const d = (i === src.i && j === src.j ? 0 : 1) + R.phaseSteps(src.ph, ph);
                if (!g.has(d)) g.set(d, []);
                g.get(d).push({ i, j, ph });
            }
        }
    }
    return g;
}

LEVELS.forEach((lv) => {
    const tag = lv.id;
    const k = R.K(lv.lambda);
    const solved = R.solvePar(lv);
    ok(Number.isFinite(solved.par), `${tag}: 求解器判无解`);
    ok(solved.par === lv.par, `${tag}: par 表内 ${lv.par} ≠ 求解器 ${solved.par}`);

    // 反向穷举：所有 cost < par 的摆位都不该达标
    const groups = (lv.ctrl || []).map(deltaGroups);
    const n = groups.length;
    const maxD = Math.max(...groups.map((g) => Math.max(...g.keys())));
    const place = new Array(n);
    let cheaper = 0;
    const ways = [];
    const split = (idx, left, acc) => {
        if (idx === n) { if (left === 0) ways.push(acc.slice()); return; }
        for (let d = 0; d <= Math.min(left, maxD); d++) {
            if (!groups[idx].has(d)) continue;
            acc.push(d);
            split(idx + 1, left - d, acc);
            acc.pop();
        }
    };
    for (let cost = 0; cost < lv.par; cost++) {
        ways.length = 0;
        split(0, cost, []);
        for (const w of ways) {
            const lists = w.map((d, idx) => groups[idx].get(d));
            const walk = (idx) => {
                if (idx === n) {
                    if (R.satisfied(lv, place, k)) cheaper++;
                    return;
                }
                for (const cand of lists[idx]) {
                    place[idx] = cand;
                    walk(idx + 1);
                }
            };
            walk(0);
        }
    }
    ok(cheaper === 0, `${tag}: 存在比 par 更省的摆位（${cheaper} 个）`);

    // 解摆位回放：达标 + cost 恰为 par + 3 星
    ok(!!solved.place, `${tag}: 求解器没给出摆位`);
    if (solved.place) {
        ok(R.satisfied(lv, solved.place, k), `${tag}: 解摆位不达标`);
        ok(R.costOf(lv, solved.place) === lv.par, `${tag}: 解摆位代价 ${R.costOf(lv, solved.place)} ≠ par ${lv.par}`);
        ok(R.starsForLevel(lv.par, lv.par) === 3, `${tag}: par 达成应为 3 星`);
        ok(R.starsForLevel(lv.par + R.RULES.slack, lv.par) === 2, `${tag}: par+slack 应为 2 星`);
        ok(R.starsForLevel(lv.par + R.RULES.slack + 1, lv.par) === 1, `${tag}: 超出 slack 应为 1 星`);
    }

    // 初始摆位不该白送
    const init = (lv.ctrl || []).map((c) => ({ i: c.i, j: c.j, ph: c.ph }));
    ok(!R.satisfied(lv, init, k), `${tag}: 初始摆位就已达标（白送）`);

    // 目标不能压在源头上
    lv.targets.forEach((t, ti) => {
        const pts = R.targetPoints(t);
        pts.forEach((p) => {
            (lv.ctrl || []).forEach((c) => {
                const d = Math.hypot(p.x - R.gridX(c.i), p.y - R.gridY(c.j));
                ok(d >= 30, `${tag}: 目标${ti} 采样点离初始源仅 ${d.toFixed(1)}px`);
            });
        });
    });
});

/* ③ 难度曲线与内容覆盖 */
const pars = LEVELS.map((l) => l.par);
for (let i = 1; i < pars.length; i++) {
    ok(pars[i] >= pars[i - 1] - 2, `难度骤降：rd${i} par ${pars[i - 1]} → rd${i + 1} par ${pars[i]}`);
}
ok(Math.max(...pars.slice(0, 6)) <= 4, `前六关 par 应 ≤4（实际 ${pars.slice(0, 6)}）`);
ok(Math.min(...pars.slice(-3)) >= 3, `末三关 par 应 ≥3（实际 ${pars.slice(-3)}）`);
ok(Math.max(...pars) >= 4, `应有 par ≥4 的关卡（实际最大 ${Math.max(...pars)}）`);

const kinds = new Set();
let src2 = 0, storms = 0, walls = 0;
LEVELS.forEach((l) => {
    l.targets.forEach((t) => kinds.add(t.kind));
    if (l.ctrl.length === 2) src2++;
    if ((l.storms || []).length) storms++;
    if ((l.walls || []).length) walls++;
});
ok(kinds.has('calm') && kinds.has('blaze') && kinds.has('lane'), `目标类型应覆盖 calm/blaze/lane（实际 ${[...kinds]}）`);
ok(src2 >= 8, `双源关卡应 ≥8（实际 ${src2}）`);
ok(storms >= 12, `带风暴的关卡应 ≥12（实际 ${storms}）`);
ok(walls >= 4, `带防波堤的关卡应 ≥4（实际 ${walls}）`);
ok(walls <= 8, `带防波堤的关卡别太多（实际 ${walls}）`);

/* ④ 每日赛程：730 天 */
{
    const a = R.dailyCourse('2026-09-22');
    const b = R.dailyCourse('2026-09-22');
    ok(a.length === R.DAILY_COUNT, `每日应为 ${R.DAILY_COUNT} 皿（实际 ${a.length}）`);
    ok(JSON.stringify(a) === JSON.stringify(b), '每日赛程不确定');
    let bad = 0;
    let minP = Infinity, maxP = 0, maxTol = 0;
    const seen = new Set();
    for (let i = 0; i < 730; i++) {
        const d = new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10);
        const c = R.dailyCourse(d);
        if (c.length !== R.DAILY_COUNT) { bad++; continue; }
        seen.add(c.map((l) => `${l.lambda}:${l.par}`).join('|'));
        for (const l of c) {
            if (!Number.isFinite(l.par) || l.par <= 0) bad++;
            minP = Math.min(minP, l.par);
            maxP = Math.max(maxP, l.par);
            (l.targets || []).forEach((t) => {
                if (t.kind === 'calm') { maxTol = Math.max(maxTol, t.tol); if (t.tol > 0.08) bad++; }
                if (t.kind === 'blaze' && t.need < 0.55) bad++;
            });
        }
    }
    ok(bad === 0, `每日 730 天扫描异常 ${bad} 项`);
    ok(minP >= 1 && maxP <= 8, `每日 par 应在 1..8（实际 ${minP}..${maxP}）`);
    ok(maxTol <= 0.08, `每日 calm tol 上界 ${maxTol.toFixed(4)} 虚高`);
    ok(seen.size >= 300, `每日赛程重复度过高（730 天只有 ${seen.size} 种）`);
}

console.log(`\n涟漪双生关卡校验：${pass} 项通过，${fails.length} 项失败`);
if (fails.length) {
    fails.slice(0, 20).forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
}
console.log('涟漪双生关卡全部通过 ✅');
