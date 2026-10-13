#!/usr/bin/env node
// verify-loop-jail-sim.mjs — 画牢 Loop Jail 的模拟层（离线，无需浏览器）
//
//   ① 几何纯函数：面积 / 质心 / 点在多边形内 / 线段相交 / 点到线段距离 / 世界面积恒定
//   ② 波次组成（3+n 圆、min(n,4) 三角、min(1+⌊n/2⌋,4) 方块，总数封顶 18）与计分公式
//   ③ 闭环：自交成环捕获环内小怪、清掉墨线、返还墨水；< 1500px² 的无意小回环不触发；小回环后再画大环照样成立
//   ④ 咬断 / 护盾：碰到未闭合墨线整条消失；护盾期间改为消灭咬线的小怪且墨线保留
//   ⑤ 墨水：按长度扣（0.045/px）、5/s 回复、上限 100、耗尽停笔、按住时回到 10 才续笔
//   ⑥ 方块分裂 / 受击无敌 / 生命归零结算 / 清波回血 / 生成避开笔尖 120px
//   ⑦ 三角：锁定笔尖 → 蓄力 0.35s → 朝锁定点冲刺 → 回到游荡
//   ⑧ 道具：14–22 秒刷新、最多 2 个、双线笔两条线各自判定、墨水瓶 +40
//   ⑨ 接着画 / 转屏缩放 / 确定性回放
//   ⑩ 可玩性：原地不动必然阵亡；只会绕最近小怪画小圈的机器人也能清掉前几波
//
// 用法：node tests/verify-loop-jail-sim.mjs
import {
    LoopJailSim, waveComposition, captureScore, polygonArea, polygonCentroid, pointInPolygon,
    segmentIntersection, distToSegmentSq, findLoop, worldSize, monsterScore,
    WORLD_AREA, INK_MAX, INK_PER_PX, INK_REGEN, INK_PER_CAPTURE, INK_RESUME, MIN_LOOP_AREA,
    MAX_LIVES, INVULN_TIME, SPAWN_SAFE_RADIUS, MAX_MONSTERS, WAVE_BREAK, POWERUP_INTERVAL,
    POWERUP_MAX, DOUBLE_TIME, SHIELD_TIME, INK_BOTTLE, TWIN_OFFSET, RESUME_RADIUS, MONSTERS,
    SPLIT_GRACE, ASPECT_MIN, ASPECT_MAX, MAX_STROKE_POINTS,
    MAX_RETAINED_STROKES, MAX_RETAINED_SEGMENTS,
} from '../src/games/loop-jail/simulation.js';
import { createLoopJailAudio } from '../src/games/loop-jail/audio.js';
import { idle, circler, DT } from './lib/loop-jail-bot.mjs';

let failed = 0;
let passed = 0;
const ok = (cond, label, extra) => {
    if (cond) { passed++; console.log(`✓ ${label}`); return; }
    failed++;
    console.error(`✗ ${label}${extra !== undefined ? ' —— ' + extra : ''}`);
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

/** 干净的夹具：清场、关掉道具刷新；monsters = [{ type, level?, x, y, vx?, vy? }]（默认静止、已显形） */
function fixture(monsters = [], { seed = 1, anchor = true } = {}) {
    const sim = new LoopJailSim({ seed });
    sim.monsters = [];
    sim.powerups = [];
    sim.nextPowerup = 1e9;
    sim.movePen(sim.pen.x, sim.pen.y); // 笔尖上场（真实玩家：鼠标移入 / 第一次按下）
    sim.drainEvents();
    const add = spec => {
        const m = sim.addMonster(spec.type, spec.level || 0, { x: spec.x, y: spec.y });
        m.spawn = 0;
        m.vx = spec.vx || 0;
        m.vy = spec.vy || 0;
        m.boost = 1;
        if (m.type === 'triangle') { m.state = 'recover'; m.timer = 1e9; }
        return m;
    };
    const list = monsters.map(add);
    // 远处一只静止的「锚」，防止清场触发换波
    if (anchor) add({ type: 'circle', x: 14, y: sim.h - 14 });
    sim.drainEvents();
    return { sim, list, add };
}

/** 以 (cx, cy) 为圆心、半径 R 画一整圈（多画 extra 圈保证越过起点），每 stepEvery 个点推进一帧 */
function drawCircle(sim, cx, cy, R, { extra = 0.12, n = 64, stepEvery = 0, start = 0 } = {}) {
    sim.penDown(cx + Math.cos(start) * R, cy + Math.sin(start) * R);
    for (let i = 1; i <= Math.round(n * (1 + extra)); i++) {
        const a = start + (i / n) * Math.PI * 2;
        sim.movePen(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        if (stepEvery && i % stepEvery === 0) sim.step(DT);
    }
}
const eventsOf = (events, type) => events.filter(e => e.type === type);

/* ── ① 几何纯函数 ── */
console.log('▶ ① 几何纯函数');
{
    const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    ok(near(polygonArea(sq), 100) && near(polygonArea([...sq].reverse()), 100), '面积：10×10 正方形 = 100（与绕向无关）');
    const c = polygonCentroid(sq);
    ok(near(c.x, 5) && near(c.y, 5), '质心：正方形中心');
    ok(pointInPolygon(5, 5, sq) && !pointInPolygon(15, 5, sq) && !pointInPolygon(-1, -1, sq), '点在多边形内 / 外');
    const hit = segmentIntersection({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 });
    ok(hit && near(hit.x, 5) && near(hit.y, 5), '线段相交：交叉点 (5,5)');
    ok(!segmentIntersection({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 1 }, { x: 10, y: 1 }), '平行线段不相交');
    ok(!segmentIntersection({ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 10 }, { x: 10, y: 0 }), '未到达的线段不相交');
    ok(!segmentIntersection({ x: 5, y: 5 }, { x: 10, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 5 }), '与上一段共享起点不算相交（t > 0）');
    ok(near(distToSegmentSq(5, 3, { x: 0, y: 0 }, { x: 10, y: 0 }), 9) && near(distToSegmentSq(13, 4, { x: 0, y: 0 }, { x: 10, y: 0 }), 25),
        '点到线段距离²：投影在段内 / 落在端点外');
    // 世界面积恒定、宽高比钳制
    for (const aspect of [0.3, 0.42, 0.56, 1, 1.9, 3]) {
        const { w, h } = worldSize(aspect);
        const a = Math.min(ASPECT_MAX, Math.max(ASPECT_MIN, aspect));
        ok(near(w * h, WORLD_AREA, 1e-6) && near(w / h, a, 1e-9), `世界面积恒为 ${WORLD_AREA}，宽高比 ${aspect} → ${a.toFixed(2)}`);
    }
}

/* ── ② 波次组成与计分 ── */
console.log('\n▶ ② 波次组成与计分');
{
    for (let n = 1; n <= 14; n++) {
        const c = waveComposition(n);
        const raw = { circles: 3 + n, triangles: Math.min(n, 4), squares: Math.min(1 + Math.floor(n / 2), 4) };
        const total = c.circles + c.triangles + c.squares;
        const rawTotal = raw.circles + raw.triangles + raw.squares;
        const expect = rawTotal <= MAX_MONSTERS ? raw
            : { ...raw, circles: raw.circles - (rawTotal - MAX_MONSTERS) };
        ok(JSON.stringify(c) === JSON.stringify(expect) && total <= MAX_MONSTERS,
            `第 ${n} 波：${c.circles} 圆 / ${c.triangles} 三角 / ${c.squares} 方块（共 ${total}）`);
    }
    ok(captureScore(50, 8000, 1) === 150, '单只：(50 + 8000/80) × 1 = 150');
    ok(captureScore(50 + 120 + 80, 16000, 3) === 900, '三只：(250 + 200) × 2 = 900');
    ok(captureScore(50, 4000, 2) === Math.round((50 + 50) * 1.5), '两只倍率 1.5');
    ok(captureScore(0, 99999, 0) === 0, '空环不得分');
    ok(MONSTERS.square.scores.join('/') === '80/40/20' && MONSTERS.circle.score === 50 && MONSTERS.triangle.score === 120,
        '基础分：圆 50 / 三角 120 / 方块 80·40·20');
}

/* ── ③ 闭环捕获 ── */
console.log('\n▶ ③ 闭环捕获');
{
    const { sim } = fixture([{ type: 'circle', x: 200, y: 300 }]);
    const ink0 = sim.ink;
    drawCircle(sim, 200, 300, 60);
    const ev = sim.drainEvents();
    const caps = eventsOf(ev, 'capture');
    ok(caps.length === 1 && caps[0].count === 1, '绕圆形小怪画一圈：捕获 1 只', JSON.stringify(caps.map(c => c.count)));
    const cap = caps[0];
    ok(cap && cap.area >= MIN_LOOP_AREA && near(cap.area, Math.PI * 3600, 600), '闭环面积 ≈ πR²', cap && cap.area.toFixed(0));
    ok(cap && sim.score === captureScore(50, cap.area, 1), '得分 = (基础分 + 面积/80) × 倍率', `${sim.score}`);
    ok(cap && Math.hypot(cap.x - 200, cap.y - 300) < 6, '飘字位置 = 闭环中心');
    ok(sim.monsters.length === 1 && sim.monsters[0].x === 14, '被捕获的小怪离场，环外的锚点不受影响');
    const used = sim.stats.inkUsed;
    ok(near(sim.ink, Math.min(INK_MAX, ink0 - used + INK_PER_CAPTURE), 1e-6), '墨水：按长度扣除后每只返还 6', `${sim.ink.toFixed(2)}`);
    ok(!sim.strokes.some(s => s.points.length > 20), '已闭合的墨线被清掉（只剩笔尖处新起的一小段）');
    sim.penUp();
    ok(sim.strokes.every(s => s.points.length >= 2), '抬笔后不留单点墨线');
}
{
    // 一笔多抓：倍率
    const { sim } = fixture([
        { type: 'circle', x: 180, y: 300 }, { type: 'triangle', x: 220, y: 300 }, { type: 'square', x: 200, y: 340 },
    ]);
    drawCircle(sim, 200, 315, 80);
    const cap = eventsOf(sim.drainEvents(), 'capture')[0];
    ok(cap && cap.count === 3 && sim.score === captureScore(50 + 120 + 80, cap.area, 3), '一笔抓 3 只：倍率 ×2', cap && `${cap.count} → ${sim.score}`);
    ok(sim.stats.bestCombo === 3, '记录单环最多捕获数');
}
{
    // 小于 1500px² 的回环不触发
    const { sim } = fixture([{ type: 'circle', x: 200, y: 300 }]);
    drawCircle(sim, 300, 300, 15);
    const ev = sim.drainEvents();
    ok(eventsOf(ev, 'capture').length === 0 && sim.strokes.length >= 1, '半径 15 的小回环（≈700px²）不触发捕获，墨线保留');
    sim.penUp();
    const { sim: s2 } = fixture([{ type: 'circle', x: 200, y: 300 }]);
    drawCircle(s2, 200, 300, 20);
    ok(eventsOf(s2.drainEvents(), 'capture').length === 0 && s2.monsters.length === 2, '紧贴小怪的小回环（<1500px²）抓不到');
}
{
    // 先打个无意小结，再接着画大环：大环照样成立
    const { sim } = fixture([{ type: 'circle', x: 200, y: 300 }]);
    sim.penDown(120, 300);
    for (let i = 1; i <= 40; i++) { const a = (i / 32) * Math.PI * 2; sim.movePen(120 + Math.cos(a) * 10 + i, 300 + Math.sin(a) * 10); }
    ok(eventsOf(sim.drainEvents(), 'capture').length === 0, '小结不触发');
    const from = { ...sim.pen };
    const cx = 200; const cy = 300; const R = Math.hypot(from.x - cx, from.y - cy);
    const a0 = Math.atan2(from.y - cy, from.x - cx);
    for (let i = 1; i <= 74; i++) { const a = a0 + (i / 64) * Math.PI * 2; sim.movePen(cx + Math.cos(a) * R, cy + Math.sin(a) * R); }
    const cap = eventsOf(sim.drainEvents(), 'capture')[0];
    ok(cap && cap.count === 1, '小结之后再绕一大圈：照常捕获');
}
{
    // findLoop：自交但面积达标 / 未自交
    const pts = [];
    for (let i = 0; i <= 70; i++) { const a = (i / 64) * Math.PI * 2; pts.push({ x: 100 + Math.cos(a) * 40, y: 100 + Math.sin(a) * 40 }); }
    let found = null;
    for (let k = 4; k <= pts.length && !found; k++) found = findLoop(pts.slice(0, k));
    ok(found && found.area > 4000, 'findLoop：圆形笔迹在越过起点时成环');
    ok(!findLoop(pts.slice(0, 40)), 'findLoop：半圈不成环');
}

/* ── ④ 咬断 / 护盾 ── */
console.log('\n▶ ④ 咬断 / 护盾');
{
    const { sim, list } = fixture([{ type: 'circle', x: 200, y: 200, vx: 0, vy: 120 }]);
    sim.penDown(100, 300);
    sim.movePen(300, 300);
    sim.penUp();
    ok(sim.strokes.length === 1, '松开后墨线保留在场上');
    let bites = [];
    for (let i = 0; i < 90 && !bites.length; i++) { sim.step(DT); bites = eventsOf(sim.drainEvents(), 'bite'); }
    ok(bites.length === 1 && sim.strokes.length === 0 && sim.stats.bites === 1, '小怪碰到未闭合墨线：整条咬断消失');
    ok(bites[0] && Math.abs(list[0].y - 300) < MONSTERS.circle.r + 4, '咬断发生在接触处', bites[0] && list[0].y.toFixed(1));
}
{
    // 正在画的墨线被咬：整条消失，仍按住则从笔尖续一条新线
    const { sim } = fixture([{ type: 'circle', x: 150, y: 300 }]);
    sim.penDown(100, 300);
    sim.movePen(250, 300);
    sim.step(DT);
    const ev = sim.drainEvents();
    ok(eventsOf(ev, 'bite').length === 1, '正在画的墨线也会被咬断');
    ok(sim.active.main && sim.active.main.points.length === 1 && near(sim.active.main.points[0].x, 250),
        '仍按住：从笔尖重新起笔');
}
{
    const { sim, list } = fixture([{ type: 'square', x: 200, y: 200, vx: 0, vy: 120 }]);
    sim.effects.shield = SHIELD_TIME;
    sim.penDown(100, 300);
    sim.movePen(300, 300);
    sim.penUp();
    let block = [];
    for (let i = 0; i < 90 && !block.length; i++) { sim.step(DT); block = eventsOf(sim.drainEvents(), 'shieldBlock'); }
    ok(block.length === 1 && sim.strokes.length === 1, '护盾：墨线不断');
    ok(!sim.monsters.includes(list[0]) && sim.monsters.length === 1, '护盾：咬线的小怪被消灭（不分裂）');
    ok(sim.effects.shield === 0 && sim.score === monsterScore({ type: 'square', level: 0 }), '护盾只挡一次，并给基础分');
    for (let i = 0; i < 400; i++) sim.step(DT);
    const { sim: s2 } = fixture([]);
    s2.effects.shield = 0.5;
    for (let i = 0; i < 40; i++) s2.step(DT);
    ok(s2.effects.shield === 0, '护盾 10 秒内未触发则自然失效（倒计时归零）');
}

/* ── ⑤ 墨水 ── */
console.log('\n▶ ⑤ 墨水');
{
    const { sim } = fixture([]);
    sim.penDown(20, 100);
    sim.movePen(370, 100);
    ok(near(sim.ink, INK_MAX - 350 * INK_PER_PX, 1e-6), `画 350px 扣 ${(350 * INK_PER_PX).toFixed(2)} 墨水`, sim.ink.toFixed(3));
    sim.penUp();
    sim.ink = 50;
    for (let i = 0; i < 60; i++) sim.step(1 / 60);
    ok(near(sim.ink, 50 + INK_REGEN, 1e-6), '每秒回复 5', sim.ink.toFixed(3));
    sim.ink = 99;
    for (let i = 0; i < 60; i++) sim.step(1 / 60);
    ok(sim.ink === INK_MAX, '上限 100');
}
{
    const { sim } = fixture([]);
    sim.ink = 9;
    sim.penDown(20, 100);
    sim.movePen(400, 100);
    const ev = sim.drainEvents();
    const len = Math.hypot(sim.strokes[0].points.at(-1).x - 20, 0);
    ok(sim.ink === 0 && near(len, 9 / INK_PER_PX, 0.5), '墨水耗尽：恰好画到 9/0.045 = 200px 停笔', len.toFixed(1));
    ok(eventsOf(ev, 'inkEmpty').length === 1 && !sim.active.main && sim.strokes.length === 1, '停笔：已有墨线保留，不再延长');
    // 按住不放：回复到 10 之前不续笔
    for (let i = 0; i < Math.floor((INK_RESUME / INK_REGEN) * 60) - 3; i++) sim.step(1 / 60);
    sim.movePen(300, 300);
    ok(!sim.active.main, `按住时墨水 < ${INK_RESUME} 不续笔`, sim.ink.toFixed(2));
    for (let i = 0; i < 6; i++) sim.step(1 / 60);
    ok(sim.active.main && sim.active.main.points.length === 1, `回复到 ${INK_RESUME} 后自动从笔尖续笔`);
    sim.penUp();
    sim.ink = 0.5;
    sim.penDown(100, 400);
    ok(!sim.active.main, '墨水 < 1 时按下不起笔');
}

/* ── ⑥ 分裂 / 受击 / 结算 / 清波 / 生成 ── */
console.log('\n▶ ⑥ 分裂 / 受击 / 结算 / 清波 / 生成');
{
    const { sim } = fixture([{ type: 'square', level: 0, x: 200, y: 300 }]);
    drawCircle(sim, 200, 300, 60);
    sim.penUp();
    const kids = sim.monsters.filter(m => m.type === 'square');
    ok(kids.length === 2 && kids.every(k => k.level === 1 && k.spawn === SPLIT_GRACE), '大方块被捕获：分裂成 2 个中方块（带出生保护）');
    const splitCap = eventsOf(sim.drainEvents(), 'capture')[0];
    ok(splitCap && sim.score === captureScore(80, splitCap.area, 1), '大方块 80 分（+ 面积分）', sim.score);
    const p0 = kids.map(k => ({ x: k.x, y: k.y }));
    for (let i = 0; i < 20; i++) sim.step(DT);
    ok(kids.every((k, i) => Math.hypot(k.x - p0[i].x, k.y - p0[i].y) > 10), '分裂后随机弹开（保护期内也在移动）');
    const { sim: s2 } = fixture([{ type: 'square', level: 2, x: 200, y: 300 }]);
    drawCircle(s2, 200, 300, 50);
    ok(s2.monsters.filter(m => m.type === 'square').length === 0, '最小方块不再分裂');
    ok(MONSTERS.square.scores[2] === 20, '小方块 20 分');
}
{
    // 分裂保护期：贴着笔尖也不撞
    const { sim } = fixture([]);
    const kid = sim.addMonster('square', 1, { x: sim.pen.x + 5, y: sim.pen.y });
    kid.vx = 0; kid.vy = 0;
    sim.step(DT);
    ok(sim.lives === MAX_LIVES, '保护期内的小方块不撞笔尖');
}
{
    const { sim } = fixture([]);
    const m = sim.addMonster('circle', 0, { x: sim.pen.x + 10, y: sim.pen.y });
    m.spawn = 0; m.vx = 0; m.vy = 0;
    sim.step(DT);
    const ev = sim.drainEvents();
    ok(sim.lives === MAX_LIVES - 1 && eventsOf(ev, 'hit').length === 1, '小怪碰到笔尖：扣 1 条命');
    ok(near(sim.pen.invuln, INVULN_TIME), '1.6 秒无敌', sim.pen.invuln);
    ok(Math.hypot(m.x - sim.pen.x, m.y - sim.pen.y) > 8 + m.r, '击退该小怪');
    m.x = sim.pen.x; m.y = sim.pen.y; m.vx = 0; m.vy = 0; m.boost = 1;
    for (let i = 0; i < Math.floor(INVULN_TIME * 60) - 2; i++) { sim.step(1 / 60); m.x = sim.pen.x + 3; m.y = sim.pen.y; }
    ok(sim.lives === MAX_LIVES - 1, '无敌期间不再扣命');
    for (let i = 0; i < 5; i++) { sim.step(1 / 60); m.x = sim.pen.x + 3; m.y = sim.pen.y; }
    ok(sim.lives === MAX_LIVES - 2, '无敌结束后再次受击');
    for (let i = 0; i < 120 && !sim.over; i++) { sim.step(1 / 60); m.x = sim.pen.x + 3; m.y = sim.pen.y; }
    const end = sim.drainEvents();
    ok(sim.over && sim.lives === 0 && eventsOf(end, 'gameOver').length === 1, '生命归零：游戏结束');
    const t = sim.time;
    sim.step(DT);
    ok(sim.time === t, '结束后 step 不再推进');
}
{
    const { sim } = fixture([], { anchor: false });
    sim.lives = 2;
    sim.step(DT);
    const ev = sim.drainEvents();
    const clear = eventsOf(ev, 'waveClear')[0];
    ok(clear && clear.wave === 1 && sim.phase === 'break' && sim.lives === 3 && clear.healed, '清空当波：横幅 + 回复 1 条命');
    for (let i = 0; i < Math.ceil(WAVE_BREAK * 60) + 2; i++) sim.step(1 / 60);
    const start = eventsOf(sim.drainEvents(), 'waveStart')[0];
    const c = waveComposition(2);
    ok(start && sim.wave === 2 && sim.monsters.length === c.circles + c.triangles + c.squares, '短暂停顿后进入第 2 波');
    sim.monsters = [];
    sim.step(DT);
    ok(sim.lives === MAX_LIVES, '生命上限 3');
}
{
    let worst = Infinity;
    for (let seed = 1; seed <= 40; seed++) {
        const sim = new LoopJailSim({ seed, aspect: seed % 2 ? 0.46 : 1.8 });
        for (const wave of [1, 4, 9]) {
            sim.monsters = [];
            sim.pen.x = sim.range(0, sim.w);
            sim.pen.y = sim.range(0, sim.h);
            sim.startWave(wave);
            for (const m of sim.monsters) worst = Math.min(worst, Math.hypot(m.x - sim.pen.x, m.y - sim.pen.y));
        }
    }
    ok(worst >= SPAWN_SAFE_RADIUS - 1e-6, `生成位置避开笔尖 ${SPAWN_SAFE_RADIUS}px（40 种子 × 3 波 × 随机笔尖，最近 ${worst.toFixed(1)}px）`);
}

{
    // 笔尖上场之前：不被撞、三角不锁定、不拾取道具（触屏玩家还没碰屏幕）
    const sim = new LoopJailSim({ seed: 5 });
    sim.nextPowerup = 1e9;
    ok(sim.pen.placed === false, '开局时笔尖尚未上场');
    const m = sim.monsters[0];
    const tri = sim.monsters.find(x => x.type === 'triangle');
    sim.powerups = [{ id: 998, kind: 'ink', x: sim.pen.x, y: sim.pen.y, age: 0 }];
    let charges = 0;
    for (let i = 0; i < 60 * 8; i++) {
        m.spawn = 0; m.x = sim.pen.x + 2; m.y = sim.pen.y; m.vx = 0; m.vy = 0;
        sim.step(1 / 60);
        charges += eventsOf(sim.drainEvents(), 'charge').length;
    }
    ok(sim.lives === MAX_LIVES && !sim.over, '上场前：小怪压在笔尖位置也不扣命');
    ok(charges === 0 && tri.state === 'wander', '上场前：三角没有可锁定的目标，只游荡');
    ok(sim.powerups.length === 1, '上场前：不拾取道具');
    sim.movePen(sim.pen.x, sim.pen.y);
    sim.step(1 / 60);
    ok(sim.pen.placed && sim.lives === MAX_LIVES - 1, '鼠标移入 / 按下后笔尖上场：照常受击');
}

/* ── ⑦ 三角冲刺 ── */
console.log('\n▶ ⑦ 三角冲刺');
{
    const { sim, list } = fixture([{ type: 'triangle', x: 100, y: 100 }]);
    const tri = list[0];
    tri.state = 'wander'; tri.timer = 0.2; tri.vx = 0; tri.vy = 0; tri.speed = 0;
    sim.pen.x = 300; sim.pen.y = 400;
    let charge = null;
    for (let i = 0; i < 30 && !charge; i++) { sim.step(1 / 60); charge = eventsOf(sim.drainEvents(), 'charge')[0]; }
    ok(charge && tri.state === 'charge' && near(tri.target.x, 300) && near(tri.target.y, 400), '游荡计时到：锁定此刻的笔尖位置');
    sim.pen.x = 380; sim.pen.y = 120; // 玩家在蓄力期间躲开
    const at = { x: tri.x, y: tri.y };
    for (let i = 0; i < 18; i++) sim.step(1 / 60);
    ok(tri.state === 'charge' && near(tri.x, at.x) && near(tri.y, at.y), '蓄力约 0.35 秒：原地不动');
    for (let i = 0; i < 4; i++) sim.step(1 / 60);
    ok(tri.state === 'dash' && Math.hypot(tri.vx, tri.vy) >= 400, '蓄力结束：高速冲刺', `${tri.state} ${Math.hypot(tri.vx, tri.vy).toFixed(0)}`);
    const dir = Math.atan2(tri.vy, tri.vx);
    ok(Math.abs(dir - Math.atan2(400 - at.y, 300 - at.x)) < 1e-6, '冲向锁定点，而不是追踪笔尖');
    for (let i = 0; i < 90 && tri.state !== 'wander'; i++) sim.step(1 / 60);
    ok(tri.state === 'wander' && sim.lives === MAX_LIVES, '扑空后刹车回到游荡（躲开了就不扣命）');
}

/* ── ⑧ 道具 ── */
console.log('\n▶ ⑧ 道具');
{
    const sim = new LoopJailSim({ seed: 3 });
    ok(sim.nextPowerup >= POWERUP_INTERVAL[0] && sim.nextPowerup <= POWERUP_INTERVAL[1], `首个道具在 ${POWERUP_INTERVAL.join('–')} 秒后`);
    sim.monsters = [];
    sim.pen.x = -999; // 笔尖不碰道具
    const gaps = [];
    let last = 0;
    let maxOnField = 0;
    for (let i = 0; i < 60 * 200; i++) {
        sim.lives = MAX_LIVES;
        sim.monsters = [];
        sim.phase = 'break'; sim.phaseTimer = 1e9;
        sim.step(1 / 60);
        for (const e of sim.drainEvents()) if (e.type === 'powerupSpawn') { gaps.push(sim.time - last); last = sim.time; }
        maxOnField = Math.max(maxOnField, sim.powerups.length);
    }
    ok(maxOnField === POWERUP_MAX && gaps.length === POWERUP_MAX, `场上最多同时 ${POWERUP_MAX} 个（不拾取时只刷 2 个）`, `${maxOnField}/${gaps.length}`);
    ok(gaps.every(g => g >= POWERUP_INTERVAL[0] - 0.05 && g <= POWERUP_INTERVAL[1] + 0.05), '刷新间隔 14–22 秒', gaps.map(g => g.toFixed(1)).join(','));
    ok(new Set(sim.powerups.map(p => p.kind)).size >= 1 && sim.powerups.every(p => ['double', 'shield', 'ink'].includes(p.kind)), '道具种类：双线笔 / 护盾 / 墨水瓶');
}
{
    const { sim } = fixture([]);
    const pick = kind => {
        sim.powerups = [{ id: 999, kind, x: sim.pen.x + 3, y: sim.pen.y, age: 0 }];
        sim.step(DT);
        return eventsOf(sim.drainEvents(), 'pickup')[0];
    };
    sim.ink = 80;
    ok(pick('ink')?.kind === 'ink' && sim.ink === INK_MAX, `墨水瓶：+${INK_BOTTLE}（封顶 100）`);
    sim.ink = 30;
    pick('ink');
    ok(near(sim.ink, 30 + INK_BOTTLE + INK_REGEN * DT, 1e-6), '墨水瓶：30 → 70');
    pick('shield');
    ok(sim.effects.shield > SHIELD_TIME - 0.1, '护盾持续 10 秒');
    pick('double');
    ok(sim.effects.double > DOUBLE_TIME - 0.1 && sim.powerups.length === 0, '双线笔持续 12 秒；拾取后道具离场');
}
{
    // 双线笔：两条平行线、各自独立闭环与咬断
    const { sim } = fixture([{ type: 'circle', x: 200, y: 300 }]);
    sim.effects.double = DOUBLE_TIME;
    sim.penDown(100, 200);
    for (let x = 104; x <= 300; x += 4) sim.movePen(x, 200);
    const main = sim.active.main;
    const twin = sim.active.twin;
    ok(main && twin && twin.twin && sim.strokes.length === 2, '画线时同时画出两条墨线');
    const ty = twin.points.at(-1).y;
    ok(near(Math.abs(ty - 200), TWIN_OFFSET, 0.5) && Math.abs(twin.points.at(-1).x - 300) < 1, `第二条线平行偏移 ${TWIN_OFFSET}px`, ty.toFixed(2));
    sim.penUp();
    // 只咬第二条线
    // 静止的小怪贴在第二条线外侧（离主线 > 半径 + 线宽）
    const side = Math.sign(ty - 200);
    const biter = sim.addMonster('circle', 0, { x: 200, y: ty + side * (MONSTERS.circle.r + 1) });
    biter.spawn = 0; biter.vx = 0; biter.vy = 0;
    sim.step(DT);
    const bites = eventsOf(sim.drainEvents(), 'bite');
    ok(bites.length === 1 && bites[0].twin && sim.strokes.length === 1 && !sim.strokes[0].twin, '两条线各自判定咬断：只断被咬的那条');
}
{
    // 方形环：最后一条边横穿第一条边（真人画环大多是这样交叉闭合，而不是严丝合缝的同心圆）。
    // 第二条线是向内偏移 16px 的小方形，会比主线更早越过自己的起笔边。
    const { sim } = fixture([{ type: 'circle', x: 200, y: 300 }]);
    sim.effects.double = DOUBLE_TIME;
    const path = [[140, 220], [140, 360], [260, 360], [260, 240], [120, 240]];
    sim.penDown(...path[0]);
    for (let k = 1; k < path.length; k++) {
        const [x0, y0] = path[k - 1];
        const [x1, y1] = path[k];
        for (let i = 1; i <= 30; i++) sim.movePen(x0 + (x1 - x0) * (i / 30), y0 + (y1 - y0) * (i / 30));
    }
    const caps = eventsOf(sim.drainEvents(), 'capture');
    ok(caps.length === 2 && caps.some(c => c.twin) && caps.some(c => !c.twin), '两条线各自判定闭环', caps.map(c => (c.twin ? 'twin' : 'main') + c.count).join(','));
    ok(sim.monsters.length === 1, '同一只小怪只被捕获一次');
    sim.penUp();
    sim.effects.double = 0.02;
    sim.penDown(50, 500);
    sim.movePen(90, 500);
    sim.step(DT);
    sim.step(DT);
    ok(sim.effects.double === 0 && !sim.active.twin, '双线笔到时：第二条线收笔');
}

/* ── ⑨ 接着画 / 转屏 / 确定性 ── */
console.log('\n▶ ⑨ 接着画 / 转屏 / 确定性');
{
    const { sim } = fixture([]);
    sim.penDown(100, 100);
    sim.movePen(200, 100);
    sim.penUp();
    const s = sim.strokes[0];
    const n = s.points.length;
    sim.penDown(200 + RESUME_RADIUS - 4, 104);
    sim.movePen(260, 120);
    ok(sim.strokes.length === 1 && sim.active.main === s && s.points.length > n, `在线头 ${RESUME_RADIUS}px 内按下：接着那条线画`);
    sim.penUp();
    sim.penDown(100, 400);
    ok(sim.strokes.length === 2, '离线头远：另起一条');
}
{
    const sim = new LoopJailSim({ seed: 9, aspect: 0.5 });
    const m0 = sim.monsters[0];
    const rel = { x: m0.x / sim.w, y: m0.y / sim.h };
    sim.resize(1.6);
    ok(near(sim.w * sim.h, WORLD_AREA, 1e-6) && near(sim.w / sim.h, 1.6), '转屏：世界面积不变、宽高比跟随');
    ok(near(m0.x / sim.w, rel.x) && near(m0.y / sim.h, rel.y), '转屏：所有坐标按比例搬过去');
    ok(sim.resize(1.6) === false, '同一宽高比不重复缩放');
}
{
    const { sim, list } = fixture([{ type: 'triangle', x: 120, y: 160 }]);
    const tri = list[0];
    tri.state = 'dash';
    tri.vx = 300;
    tri.vy = 180;
    tri.target = { x: 320, y: 280 };
    const old = { w: sim.w, h: sim.h, vx: tri.vx, vy: tri.vy };
    sim.resize(1.6);
    const sx = sim.w / old.w, sy = sim.h / old.h;
    ok(near(tri.vx, old.vx * sx) && near(tri.vy, old.vy * sy),
        '转屏：正在冲刺的三角形速度按坐标比例缩放');
    ok(near(tri.angle, Math.atan2(tri.vy, tri.vx)),
        '转屏：冲刺朝向跟随新速度向量');
    ok(near(tri.target.x, 320 * sx) && near(tri.target.y, 280 * sy),
        '转屏：冲刺目标与速度保持同一坐标系');
}
{
    const script = seed => {
        const sim = new LoopJailSim({ seed, aspect: 0.56 });
        for (let i = 0; i < 60 * 40; i++) {
            if (i % 180 === 30) sim.penDown(sim.w * 0.3, sim.h * 0.4);
            if (i % 180 > 30 && i % 180 < 90) {
                const a = ((i % 180) - 30) / 50 * Math.PI * 2;
                sim.movePen(sim.w * 0.5 + Math.cos(a) * 90, sim.h * 0.4 + Math.sin(a) * 90);
            }
            if (i % 180 === 90) sim.penUp();
            sim.step(1 / 60);
            sim.drainEvents();
        }
        return sim.fingerprint();
    };
    const a = script(42);
    ok(a === script(42), '确定性回放：同 seed + 同输入 = 同结果');
    ok(a !== script(43), '换 seed 结果不同');
}

/* ── 长局性能 / 重开音效：资源上限、索引一致性、重置边界 ── */
console.log('\n▶ 长局性能与音效复位');
{
    const calls = [];
    const audio = createLoopJailAudio({ ensure() {}, tone(opts) { calls.push(opts); }, noise() {} });
    const charges = () => calls.filter(tone => tone.freq === 300).length;
    audio.charge(60);
    audio.charge(60.1);
    ok(charges() === 1, '同一局 250ms 内多只三角蓄力只响一次');
    audio.charge(0.05);
    audio.charge(0.15);
    audio.charge(0.35);
    ok(charges() === 3, '模拟时间倒退立即重置音效去重，且新局内部仍限频');
    audio.start();
    audio.charge(0.36);
    ok(charges() === 4, '显式重新开始即清除蓄力限频状态');
}
{
    const { sim } = fixture([]);
    for (let j = 0; j < MAX_RETAINED_STROKES + 24; j++) {
        const y = 100 + (j % 50) * 10;
        sim.ink = INK_MAX;
        sim.penDown(30, y);
        for (let k = 1; k <= 75; k++) sim.movePen(30 + k * 4.6, y + (k % 2) * 8);
        sim.penUp();
    }
    const total = () => sim.strokes.reduce((n, stroke) => n + stroke.points.length - 1, 0);
    ok(sim.strokes.length <= MAX_RETAINED_STROKES && sim.segmentGrid.size <= MAX_RETAINED_SEGMENTS,
        '长局积累的墨线与线段被限制在全局预算内', JSON.stringify({ strokes: sim.strokes.length, segments: sim.segmentGrid.size }));
    ok(sim.segmentGrid.size === total(), '过期线段已从索引移除，没有悬空索引条目');
    const retained = sim.strokes.at(-1);
    const probe = retained.points[Math.floor(retained.points.length / 2)];
    const monster = sim.addMonster('circle', 0, { x: probe.x, y: probe.y });
    monster.spawn = 0; monster.vx = 0; monster.vy = 0;
    sim.resize(1.2);
    sim.step(DT);
    ok(!sim.strokes.includes(retained) && sim.stats.bites > 0,
        '转屏重建空间索引后，最新墨线仍可被准确咬断');
    ok(sim.segmentGrid.size === total(), '咬断后索引大小仍与渲染笔迹完全一致');
}
{
    const { sim } = fixture([]);
    sim.penDown(30, 200);
    for (let i = 1; i <= MAX_STROKE_POINTS + 150; i++) {
        sim.ink = INK_MAX;
        sim.movePen(30 + i * 0.5, i % 2 ? 320 : 200);
    }
    const live = sim.active.main;
    ok(!!live && live.points.length <= MAX_STROKE_POINTS,
        '单条超长未闭合笔迹按块裁剪历史，不会无限变大', live?.points.length);
    ok(sim.segmentGrid.size === live.points.length - 1,
        '单笔裁剪后索引与几何一一对应');
    sim.penUp();
    sim.reset(12);
    ok(sim.strokes.length === 0 && sim.segmentGrid.size === 0,
        '重新开局清空所有旧墨线和网格索引');
}

/* ── ⑩ 可玩性 ── */
console.log('\n▶ ⑩ 可玩性');
{
    const seeds = Array.from({ length: 12 }, (_, i) => i + 1);
    const idles = seeds.map(seed => idle({ seed, maxSeconds: 120 }));
    ok(idles.every(r => r.sim.over && r.seconds < 60), '原地不动必然阵亡（三角会锁定冲刺）：等待不是策略',
        idles.map(r => r.seconds.toFixed(0)).join(','));
    const bots = seeds.map(seed => circler({ seed, maxSeconds: 600 }));
    const waves = bots.map(r => r.sim.wave);
    const cleared = waves.filter(w => w >= 2).length;
    ok(bots.every(r => r.sim.score > 0 && r.sim.stats.captured > 0), '只会画小圈的机器人每局都能得分');
    ok(cleared >= 10, `只会画小圈的机器人至少 10/12 局清掉第 1 波（实际 ${cleared}/12）`, waves.join(','));
    const sorted = [...waves].sort((x, y) => x - y);
    const median = (sorted[5] + sorted[6]) / 2;
    ok(median >= 3, `机器人中位到达第 ${median} 波（≥ 3）`, waves.join(','));
    ok(bots.every((r, i) => r.sim.score > idles[i].sim.score), '主动画圈稳定优于原地不动');
}

console.log(failed === 0 ? `\nverify-loop-jail-sim 全部通过 ✅（${passed} 项断言）` : `\n${failed} 个失败 ❌`);
process.exit(failed === 0 ? 0 : 1);
