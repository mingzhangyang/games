#!/usr/bin/env node
/**
 * verify-shadow-loom-levels — 影织关卡表的离线黄金校验（无需浏览器）
 *
 * 关卡「构造即可解」（解写成影子中心，纸片摆位由投影公式反推），但构造可解
 * 不等于可玩。本脚本把设计方案里的约束逐条变成断言：
 *   ① 解：相似度 ≥ 0.99；每块纸片的解摆位落在可拖动范围 PIECE_BOX 内；灯的解在托盘内
 *   ② 初始：相似度 ≤ 0.45（开局是抽象碎影，不是「差一点」）；每块可动纸片的初始影子
 *      至少一半落在纸幕上（看得见才谈得上观察）；初始位置在可拖动范围内
 *   ③ 章节开关：灯固定的关卡没有钉住的纸片（否则无解）；钉住的纸片在初始灯位下
 *      影子偏离目标 ≥ 16px（逼玩家去移动灯）；不开放旋转的关卡初始角 = 解角；
 *      开放旋转的关卡至少一块纸片初始角偏离 ≥ 25°
 *   ④ 容差（判定手感）：任一纸片的影子偏 4px 仍可完成；偏 24px 必不可完成
 *   ⑤ 深度：每关至少两个不同深度，第二章起至少三个（「错层」的教学点）
 *   ⑥ 数学：投影公式与设计方案 §6.1 一致（S = L + (P − L) / z），灯视差随深度单调
 *
 * 用法：node scripts/verify-shadow-loom-levels.mjs
 */
import * as R from '../js/shadow-loom-rules.js';
import { LEVELS } from '../js/shadow-loom-levels.js';

let failed = 0;
let passed = 0;
const ok = (cond, label, extra = '') => {
    if (cond) { passed++; return; }
    failed++;
    console.error(`✗ ${label}${extra ? ' —— ' + extra : ''}`);
};
const inBox = (p, b) => p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1;

/** 多边形面积（鞋带公式） */
function area(poly) {
    let a = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
    return Math.abs(a / 2);
}

/* ⑥ 投影公式 */
{
    const lamp = R.LAMP_HOME;
    const L = R.lampModel(lamp);
    const pose = { x: L.x + 30, y: L.y - 90, rot: 0 };
    const S = R.shadowCenter(lamp, pose, 0.6);
    ok(Math.abs(S.x - (L.x + 30 / 0.6)) < 1e-9 && Math.abs(S.y - (L.y - 90 / 0.6)) < 1e-9, '投影 S = L + (P − L) / z');
    // 同一拖动距离：靠灯的纸片影子走得更远
    const near = R.shadowCenter(lamp, { x: pose.x + 10, y: pose.y }, 0.5).x - R.shadowCenter(lamp, pose, 0.5).x;
    const far = R.shadowCenter(lamp, { x: pose.x + 10, y: pose.y }, 0.9).x - R.shadowCenter(lamp, pose, 0.9).x;
    ok(near > far && Math.abs(near - 20) < 1e-9, '拖动响应 = 1/z，靠灯更敏感', `near=${near} far=${far}`);
    // 移灯：影子反向移动 (1/z − 1)，深度越小视差越大
    const moved = { x: lamp.x + 20, y: lamp.y };
    const pNear = R.shadowCenter(moved, pose, 0.5).x - R.shadowCenter(lamp, pose, 0.5).x;
    const pFar = R.shadowCenter(moved, pose, 0.9).x - R.shadowCenter(lamp, pose, 0.9).x;
    ok(pNear < pFar && pFar < 0, '移灯视差随深度单调', `near=${pNear.toFixed(2)} far=${pFar.toFixed(2)}`);
}

const ids = new Set();
for (const lv of LEVELS) {
    const tag = lv.id;
    ok(!ids.has(lv.id), `${tag}: id 唯一`);
    ids.add(lv.id);
    ok(lv.name && lv.name.en && lv.name.zh, `${tag}: 双语名称`);
    const c = R.compileLevel(lv);

    /* ① 解 */
    const solved = R.solvedState(lv);
    const evS = R.evaluate(lv, solved);
    ok(evS.sim >= 0.99, `${tag}: 解的相似度 ≥ 0.99`, evS.sim.toFixed(3));
    solved.pieces.forEach((p, i) => ok(inBox(p, R.PIECE_BOX), `${tag}/${lv.pieces[i].id}: 解摆位在可拖动范围内`, `${p.x.toFixed(0)},${p.y.toFixed(0)}`));
    const lampBox = { x0: R.LAMP_BOX.x0, x1: R.LAMP_BOX.x1, y0: R.LAMP_BOX.y0, y1: R.LAMP_BOX.y1 };
    ok(inBox(lv.lamp.start, lampBox), `${tag}: 灯初始位置在托盘内`);
    if (lv.lamp.sol) ok(inBox(lv.lamp.sol, lampBox), `${tag}: 灯的解在托盘内`);
    // 目标剪影整体落在纸幕内（不被裁）
    let targetArea = 0;
    c.targetPolys.forEach(p => { targetArea += 1; void p; });
    const edgeTouch = [...Array(R.COLS).keys()].some(col => c.target[col] || c.target[(R.ROWS - 1) * R.COLS + col])
        || [...Array(R.ROWS).keys()].some(row => c.target[row * R.COLS] || c.target[row * R.COLS + R.COLS - 1]);
    ok(!edgeTouch && targetArea > 0, `${tag}: 目标剪影完整落在纸幕内`);

    /* ② 初始 */
    const init = R.initialState(lv);
    const evI = R.evaluate(lv, init);
    ok(evI.sim <= 0.45, `${tag}: 初始相似度 ≤ 0.45`, evI.sim.toFixed(3));
    lv.pieces.forEach((p, i) => {
        if (p.pinned) return;
        ok(inBox(init.pieces[i], R.PIECE_BOX), `${tag}/${p.id}: 初始位置在可拖动范围内`);
        const polys = R.shadowPolys(lv, init.lamp, init.pieces[i], i);
        const full = polys.reduce((s, poly) => s + area(poly), 0);
        const m = R.rasterize(polys);
        let on = 0;
        for (let k = 0; k < m.length; k++) on += m[k];
        const frac = (on * R.CELL * R.CELL) / full;
        ok(frac >= 0.5, `${tag}/${p.id}: 初始影子 ≥ 50% 在纸幕上`, frac.toFixed(2));
    });

    /* ③ 章节开关 */
    const pinned = lv.pieces.filter(p => p.pinned);
    if (!lv.lamp.movable) {
        ok(pinned.length === 0, `${tag}: 灯固定的关卡不能有钉住的纸片`);
        ok(!lv.lamp.sol || (lv.lamp.sol.x === lv.lamp.start.x && lv.lamp.sol.y === lv.lamp.start.y), `${tag}: 灯固定 ⇒ 解灯位 = 初始灯位`);
    } else {
        ok(pinned.length >= 1, `${tag}: 灯行关卡至少一块钉住的纸片（否则移灯没有策略价值）`);
    }
    lv.pieces.forEach((p, i) => {
        if (!p.pinned) return;
        const S0 = R.shadowCenter(init.lamp, init.pieces[i], p.z);
        const d = Math.hypot(S0.x - p.sol.x, S0.y - p.sol.y);
        ok(d >= 16, `${tag}/${p.id}: 初始灯位下钉住纸片的影子偏离目标 ≥ 16px`, d.toFixed(1));
    });
    if (!lv.rotate) {
        lv.pieces.forEach(p => ok((p.start?.rot || 0) === (p.sol.rot || 0), `${tag}/${p.id}: 不开放旋转 ⇒ 初始角 = 解角`));
    } else {
        const maxOff = Math.max(...lv.pieces.filter(p => !p.pinned).map(p => Math.abs((p.start.rot || 0) - (p.sol.rot || 0))));
        ok(maxOff >= 25, `${tag}: 旋转关至少一块纸片初始角偏离 ≥ 25°`, `${maxOff}°`);
    }

    /* ④ 容差 */
    lv.pieces.forEach((p, i) => {
        for (const [dx, dy] of [[1, 0], [0, 1], [-0.7, 0.7]]) {
            const shift = (px) => {
                const st = R.solvedState(lv);
                // 影子偏 px ⇒ 纸片偏 px·z
                st.pieces[i] = { ...st.pieces[i], x: st.pieces[i].x + dx * px * p.z, y: st.pieces[i].y + dy * px * p.z };
                return R.evaluate(lv, st).sim;
            };
            const s4 = shift(4);
            const s24 = shift(24);
            ok(s4 >= R.THRESHOLDS.win, `${tag}/${p.id}: 影子偏 4px 仍可完成`, s4.toFixed(3));
            ok(s24 < R.THRESHOLDS.win, `${tag}/${p.id}: 影子偏 24px 不可完成`, s24.toFixed(3));
        }
    });

    /* ⑤ 深度 */
    const depths = new Set(lv.pieces.map(p => p.z));
    ok(depths.size >= (lv.chapter >= 2 ? 3 : 2), `${tag}: 深度层数足够`, `${depths.size}`);
    lv.pieces.forEach(p => ok(p.z > 0.3 && p.z < 1, `${tag}/${p.id}: 深度在 (0.3, 1)`));

    /* 活影：动作引用的纸片存在 */
    (lv.life?.tracks || []).forEach(tr => tr.ids.forEach(id => ok(lv.pieces.some(p => p.id === id), `${tag}: life 引用的纸片 ${id} 存在`)));

    console.log(`  ${tag.padEnd(8)} 解 ${evS.sim.toFixed(3)} · 初始 ${evI.sim.toFixed(3)} · ${lv.pieces.length} 片 · 深度 ${[...depths].join('/')}`);
}

ok(LEVELS.length >= 3, '至少 3 关（设计方案 §16 Prototype 范围）');
ok(LEVELS[0].id === 'rabbit' && !LEVELS[0].lamp.movable && !LEVELS[0].rotate, '首关是兔：灯固定、不能旋转（设计方案 §13）');

console.log(`\n${failed ? '✗' : '✓'} shadow-loom levels：${passed} 通过，${failed} 失败`);
process.exit(failed ? 1 : 0);
