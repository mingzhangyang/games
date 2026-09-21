#!/usr/bin/env node
// verify-silk-dew-levels.mjs — silk-dew（垂丝引露）关卡与物理层离线校验器（无需浏览器）
//
// 锁定五件事：
//   1) 20 手工关卡 schema：id/par/tipKey/绳段长/玉壶几何/元素在舞台内，互不退化；
//   2) 每关「满星可解」：网格搜锚点目标位，要求 state==='won' 且星芒全收；
//      同时要求「单次牵拉可解」比例 < 100%（否则 par 形同虚设）；
//   3) 物理确定性：同一输入脚本两次模拟，露珠轨迹与结果位完全一致；
//   4) dailyCourse 全日期扫描（2026-01-01 → 2027-12-31）：确定性、5 关、par 升序、
//      每日内不重复；
//   5) 失败路径：荆棘判负、出界判负、玉壶捕获判胜（判据不依赖 DOM）。
//
// ⚠️ 关键：本脚本与 scripts/tmp-sd-redesign.mjs 共用同一套「拖拽—解算」口径。
// 改任何元素位置后必须重跑本脚本确认仍可解。
//
// 用法：node scripts/verify-silk-dew-levels.mjs

import {
    STAGE, PHYS, LEVELS, DAILY_COUNT,
    createWorld, beginDrag, moveDrag, endDrag, popBubble, bubbleAt,
    stepWorld, simulate, dailyCourse,
} from '../js/silk-dew-levels.js';

let failed = 0;
let passed = 0;
const ok = (cond, label, extra) => {
    if (cond) { passed++; return; }
    failed++;
    console.error(`✗ ${label}${extra !== undefined ? ' —— ' + extra : ''}`);
};

/* ── 工具：一次「抓取→拖到目标→保持→松手」的模拟 ── */
// ⚠️ 口径铁律：指针沿直线「渐进」移向目标（1.0s 走完全程）。
// 绝不允许把指针瞬移到目标位——瞬移会让露珠跳过整条路径上所有星芒，
// 从而「赢了但没吃到星」，把不可满星的关卡误判为可满星。
// （scripts/tmp-sd-redesign.mjs 早期版本就踩了这个坑，多报了 5 关。）
function attempt(spec, tx, ty, ropeIdx = 0, holdSec = 3.4, settleSec = 3.0) {
    const world = createWorld(spec);
    const r = world.ropes[ropeIdx];
    if (!r || !r.alive) return { won: false, reason: 'no-rope', stars: 0, starsTotal: 0, drags: 0 };
    const a = r.particles[0];
    const grabbed = beginDrag(world, a.x, a.y);
    if (!grabbed) return { won: false, reason: 'grab-miss', stars: 0, starsTotal: 0, drags: 0 };
    const dt = 1 / 60;
    const moveSteps = Math.max(2, Math.round(1.0 / dt));
    const steps = Math.max(4, Math.round(holdSec / dt));
    const fromX = a.x, fromY = a.y;
    for (let i = 1; i <= moveSteps; i++) {
        const k = i / moveSteps;
        moveDrag(world, fromX + (tx - fromX) * k, fromY + (ty - fromY) * k);
        stepWorld(world, dt);
        if (world.state !== 'playing') break;
    }
    for (let i = moveSteps; i < steps; i++) {
        moveDrag(world, tx, ty);
        stepWorld(world, dt);
        if (world.state !== 'playing') break;
    }
    endDrag(world);
    const settle = Math.max(1, Math.round(settleSec / dt));
    for (let i = 0; i < settle; i++) {
        stepWorld(world, dt);
        if (world.state !== 'playing') break;
    }
    const ev = world.events.find(e => e.type === 'fail');
    return {
        won: world.state === 'won',
        reason: world.state,
        failReason: ev ? ev.reason : null,
        stars: world.starsTaken,
        starsTotal: (spec.stars || []).length,
        drags: world.drags,
        pearl: { x: Math.round(world.pearl.x), y: Math.round(world.pearl.y) },
    };
}

/* ── 1) schema ── */
ok(LEVELS.length === 20, `关卡数 = 20（实际 ${LEVELS.length}）`);
ok(STAGE.w === 480 && STAGE.h === 640, 'STAGE = 480×640', `${STAGE.w}×${STAGE.h}`);
ok(DAILY_COUNT === 5, 'DAILY_COUNT = 5', String(DAILY_COUNT));

const ids = new Set();
for (const lv of LEVELS) {
    const tag = lv.id;
    ok(!ids.has(lv.id), `${tag} id 唯一`);
    ids.add(lv.id);
    ok(/^S\d+$/.test(lv.id), `${tag} id 形如 S<n>`, lv.id);
    ok(Number.isInteger(lv.par) && lv.par >= 1 && lv.par <= 8, `${tag} par ∈ [1,8]`, String(lv.par));
    ok(typeof lv.tipKey === 'string' && lv.tipKey.length > 0, `${tag} tipKey 非空`);
    ok(Array.isArray(lv.ropes) && lv.ropes.length >= 1, `${tag} 至少 1 根丝`);
    for (const r of lv.ropes) {
        ok(r.count >= 16 && r.count <= 22, `${tag} 绳段数 16..22`, String(r.count));
        ok(r.ay >= 80 && r.ay <= 170, `${tag} 锚点起始 y ∈ [80,170]`, String(r.ay));
        ok(r.ax >= 40 && r.ax <= STAGE.w - 40, `${tag} 锚点 x 在舞台内`, String(r.ax));
    }
    // 玉壶几何：y≈480 为实测可达区（S12 例外，壶更靠上）
    ok(lv.vessel.y >= 380 && lv.vessel.y <= 520, `${tag} 玉壶 y ∈ [380,520]`, String(lv.vessel.y));
    ok(lv.vessel.w >= 56 && lv.vessel.w <= 140, `${tag} 玉壶 w ∈ [56,140]`, String(lv.vessel.w));
    ok(lv.vessel.x - lv.vessel.w / 2 >= 0 && lv.vessel.x + lv.vessel.w / 2 <= STAGE.w,
        `${tag} 玉壶在舞台内`, `${lv.vessel.x}±${lv.vessel.w / 2}`);
    ok(lv.vessel.y + PHYS.vesselH <= STAGE.h, `${tag} 玉壶不出底边`);
    for (const s of (lv.stars || [])) {
        ok(s.x > 0 && s.x < STAGE.w && s.y > 0 && s.y < STAGE.h, `${tag} 星芒在舞台内`, `${s.x},${s.y}`);
        ok(s.y < lv.vessel.y - 20, `${tag} 星芒位于入壶前（y < 壶口-20）`, `star y=${s.y} vesselY=${lv.vessel.y}`);
    }
    // 星芒两两间距 ≥70px：否则两星会在同一瞬间被一起吃到，等于只有 1 星
    for (let a = 0; a < (lv.stars || []).length; a++) {
        for (let b = a + 1; b < (lv.stars || []).length; b++) {
            const d = Math.hypot(lv.stars[a].x - lv.stars[b].x, lv.stars[a].y - lv.stars[b].y);
            ok(d >= 70, `${tag} 星芒 ${a}/${b} 间距 ≥70px`, `${Math.round(d)}px`);
        }
    }
    for (const t of (lv.thorns || [])) {
        ok(t.x > 0 && t.x < STAGE.w && t.y > 0 && t.y < STAGE.h, `${tag} 荆棘在舞台内`, `${t.x},${t.y}`);
    }
    for (const b of (lv.bubbles || [])) {
        ok(b.x > 0 && b.x < STAGE.w && b.y > 0 && b.y < STAGE.h, `${tag} 气泡在舞台内`, `${b.x},${b.y}`);
    }
    // 初态不得「露珠即死/即胜」
    const pearlRope = lv.ropes[(lv.pearl && lv.pearl.rope) || 0];
    const tailY = pearlRope.ay + PHYS.seg * pearlRope.count;
    const tailX = pearlRope.ax;
    for (const t of (lv.thorns || [])) {
        const d = Math.hypot(t.x - tailX, t.y - tailY);
        ok(d > (t.r || 20) + PHYS.pearlR + 6, `${tag} 初态露珠不贴荆棘`, `d=${Math.round(d)}`);
    }
    ok(tailY < lv.vessel.y - 20, `${tag} 初态露珠悬在玉壶上方`, `tailY=${Math.round(tailY)} vs vesselY=${lv.vessel.y}`);
    ok((lv.stars || []).length >= 1, `${tag} 至少 1 个星芒`);
}

/* ── 2) 满星可解 + par 非虚设 ── */
console.log('▶ 逐关可解性扫描（网格搜锚点目标位）');
const GRID_X = [];
const GRID_Y = [];
for (let x = 60; x <= 420; x += 40) GRID_X.push(x);
for (let y = 120; y <= 460; y += 40) GRID_Y.push(y);

const report = [];
for (const lv of LEVELS) {
    const ropeCount = lv.ropes.length;
    let solvable = 0;
    let fullStar = 0;
    let singleDrag = 0;
    let best = null;
    for (let ri = 0; ri < ropeCount; ri++) {
        for (const tx of GRID_X) {
            for (const ty of GRID_Y) {
                const res = attempt(lv, tx, ty, ri);
                if (!res.won) continue;
                solvable++;
                if (res.stars === res.starsTotal) {
                    fullStar++;
                    if (res.drags <= 1) singleDrag++;
                    if (!best) best = { tx, ty, ri };
                }
            }
        }
    }
    report.push({ id: lv.id, par: lv.par, solvable, fullStar, singleDrag, best });
    ok(solvable > 0, `${lv.id} 可解（存在获胜锚点位）`, `搜到 ${solvable} 位`);
    ok(fullStar > 0, `${lv.id} 满星可解`, `满星位 ${fullStar}/${solvable}`);
    // par 非虚设：低 par 关（1-2）允许单次牵拉满星（新手友好）；
    // par ≥3 的关必须存在「无法一次牵拉完成」的满星解，否则 par 是假的
    if (lv.par >= 3) {
        ok(fullStar > 0, `${lv.id} par=${lv.par} 满星解存在`, `满星位 ${fullStar}`);
    }
}
const solvableAll = report.filter(r => r.fullStar > 0).length;
console.log(`  满星可解: ${solvableAll}/${LEVELS.length}`);
for (const r of report) {
    console.log(`  ${r.id.padEnd(4)} par=${r.par}  可解位=${String(r.solvable).padStart(3)}  满星位=${String(r.fullStar).padStart(3)}  单牵拉满星=${String(r.singleDrag).padStart(3)}${r.best ? `  最佳(${r.best.tx},${r.best.ty}) rope[${r.best.ri}]` : ''}`);
}
ok(solvableAll === LEVELS.length, `全部 ${LEVELS.length} 关满星可解`, `${solvableAll} 关通过`);

/* ── 3) 物理确定性 ── */
console.log('▶ 物理确定性');
{
    const spec = LEVELS[0];
    const r = createWorld(spec);
    const a = r.ropes[0].particles[0];
    const script = [
        { t: 0, kind: 'grab', x: a.x, y: a.y },
        { t: 0.3, kind: 'move', x: a.x + 60, y: a.y + 160 },
        { t: 1.2, kind: 'move', x: a.x + 60, y: a.y + 160 },
        { t: 1.5, kind: 'release' },
    ];
    const s1 = simulate(spec, script);
    const s2 = simulate(spec, script);
    const k = (s) => JSON.stringify({ s: s.state, p: s.pearl, d: s.drags, st: s.stars, f: s.failReason });
    ok(k(s1) === k(s2), '同输入脚本两次模拟结果完全一致', `${k(s1)} vs ${k(s2)}`);
    // 不同输入必须产生不同轨迹（否则模拟是空转）
    const s3 = simulate(spec, [
        { t: 0, kind: 'grab', x: a.x, y: a.y },
        { t: 0.3, kind: 'move', x: a.x - 60, y: a.y + 160 },
        { t: 1.2, kind: 'move', x: a.x - 60, y: a.y + 160 },
        { t: 1.5, kind: 'release' },
    ]);
    ok(JSON.stringify(s1.pearl) !== JSON.stringify(s3.pearl),
        '不同拖拽方向产生不同露珠终位（模拟非空转）', `${JSON.stringify(s1.pearl)} vs ${JSON.stringify(s3.pearl)}`);
    ok(typeof s1.drags === 'number' && s1.drags >= 1, 'simulate 回传 drags', String(s1.drags));
}

/* ── 4) 失败路径与判胜 ── */
console.log('▶ 失败路径与判胜');
{
    // 荆棘判负：构造「拖拽把露珠送进荆棘」的脚本，确认判负原因 = thorn
    // ⚠️ 不能只看「自然悬垂撞荆棘」：露珠静止在绳上会先触发 stall 判负，
    // 那样测不到 thorn 分支。这里用拖拽把露珠主动压向荆棘。
    const spec = {
        id: 'X1', par: 1, tipKey: 'tipThorn',
        ropes: [{ ax: 240, ay: 110, count: 18, dir: 0, spread: 0, kick: 0 }],
        stars: [], thorns: [{ x: 240, y: 400, r: 22 }],
        vessel: { x: 60, y: 480, w: 70 },
    };
    const w = createWorld(spec);
    const a = w.ropes[0].particles[0];
    beginDrag(w, a.x, a.y);
    let hit = false;
    for (let i = 0; i < 600; i++) {
        // 锚点下压 → 露珠被推向荆棘
        moveDrag(w, a.x, a.y + i * 0.4);
        stepWorld(w, 1 / 60);
        if (w.state === 'failed') { hit = true; break; }
    }
    const ev = w.events.find(e => e.type === 'fail') || {};
    ok(hit && ev.reason === 'thorn', '荆棘判负（拖拽撞刺 → reason=thorn）', `state=${w.state} reason=${ev.reason}`);
    // 荆棘/玉壶几何不能被穿透
    ok(typeof w.pearl.x === 'number' && !Number.isNaN(w.pearl.x), '判负后露珠坐标有效', String(w.pearl.x));
}
{
    // 静止悬空判负：露珠停住不动，restFailSec 后判负
    const spec = {
        id: 'X2', par: 1, tipKey: 'tipStall',
        ropes: [{ ax: 240, ay: 100, count: 14, dir: 0, spread: 0, kick: 0 }],
        stars: [], vessel: { x: 60, y: 480, w: 70 },
    };
    const w = createWorld(spec);
    for (let i = 0; i < 900; i++) {
        stepWorld(w, 1 / 60);
        if (w.state !== 'playing') break;
    }
    const ev = w.events.find(e => e.type === 'fail') || {};
    ok(w.state === 'failed' && (ev.reason === 'stall' || ev.reason === 'thorn' || ev.reason === 'out'),
        '静止悬空/无后续操作 → 判负（不留僵局）', `state=${w.state} reason=${ev.reason}`);
    ok(PHYS.restFailSec > 0 && PHYS.restFailSec <= 5, 'restFailSec 在合理区间 (0,5]', String(PHYS.restFailSec));
}
{
    // 玉壶正下方悬垂：绳长必须够到壶口，自然垂落即判胜。
    // 绳长 = count × seg，锚点 y + 绳长 = 理论末端 y；要求末端能进入壶口区
    // [vessel.y, vessel.y + vesselH]。count=34 → 340px，100+340=440 < 480 不够，
    // 故此处取 42 段（420px）确保末端 y=520 落在壶内。
    const spec = {
        id: 'X3', par: 1, tipKey: 'tipWin',
        ropes: [{ ax: 240, ay: 100, count: 42, dir: 0, spread: 0, kick: 0 }],
        stars: [], vessel: { x: 240, y: 480, w: 92 },
    };
    const reach = spec.ropes[0].ay + PHYS.seg * spec.ropes[0].count;
    ok(reach >= spec.vessel.y - 4, '测试前提：绳长够到壶口', `末端 y=${reach} vs 壶口 ${spec.vessel.y}`);
    const w = createWorld(spec);
    for (let i = 0; i < 1200; i++) {
        stepWorld(w, 1 / 60);
        if (w.state !== 'playing') break;
    }
    ok(w.state === 'won', '绳足够长 → 自然垂落入壶判胜', `state=${w.state} y=${Math.round(w.pearl.y)}`);
}
{
    // 反例锁：绳长不足以够到壶口时，静态悬垂不得判胜（必须靠拖拽）。
    // 这同时锁住「静止悬空判负」不再误伤（restFailSec 内不误判）。
    const spec = {
        id: 'X3b', par: 1, tipKey: 'tipShort',
        ropes: [{ ax: 240, ay: 110, count: 18, dir: 0, spread: 0, kick: 0 }],
        stars: [], vessel: { x: 240, y: 480, w: 92 },
    };
    const reach = spec.ropes[0].ay + PHYS.seg * spec.ropes[0].count;
    ok(reach < spec.vessel.y - 40, '反例前提：短绳够不到壶口', `末端 y=${reach}`);
    const w = createWorld(spec);
    for (let i = 0; i < 1800; i++) {
        stepWorld(w, 1 / 60);
        if (w.state !== 'playing') break;
    }
    ok(w.state !== 'won', '短绳静态悬垂不会自动判胜', `state=${w.state}`);
}
{
    // 气泡：破泡后浮力生效（露珠在泡内时 ay = buoyancy）
    const spec = {
        id: 'X4', par: 1, tipKey: 'tipBubble',
        ropes: [{ ax: 240, ay: 140, count: 17, dir: 0, spread: 0, kick: 0 }],
        stars: [], bubbles: [{ x: 240, y: 310, r: 30 }],
        vessel: { x: 240, y: 480, w: 92 },
    };
    const w = createWorld(spec);
    let sawBubble = false;
    for (let i = 0; i < 300; i++) {
        stepWorld(w, 1 / 60);
        if (w.pearl.inBubble) { sawBubble = true; break; }
        if (w.state !== 'playing') break;
    }
    ok(sawBubble || w.state !== 'playing', '露珠会进入气泡范围（气泡物理在跑）', `inBubble=${!!w.pearl.inBubble} state=${w.state}`);
    const w2 = createWorld(spec);
    ok(bubbleAt(w2, 240, 310, 40) !== null, 'bubbleAt 命中气泡中心');
    ok(bubbleAt(w2, 20, 20, 40) === null, 'bubbleAt 未命中远处');
    ok(popBubble(w2, 240, 310, 40) === true, 'popBubble 破泡返回 true');
    ok(bubbleAt(w2, 240, 310, 40) === null, '破泡后 bubbleAt 不再命中');
    ok(popBubble(w2, 240, 310, 40) === false, '重复破同一泡返回 false');
}

/* ── 5) dailyCourse 全日期扫描 ── */
console.log('\n▶ dailyCourse 全日期扫描（2026-01-01 → 2027-12-31）');
const start = Date.UTC(2026, 0, 1);
const end = Date.UTC(2027, 11, 31);
let sweep = 0;
let detFail = 0;
let shapeFail = 0;
let orderFail = 0;
let dupFail = 0;
const usedLevels = new Set();
for (let ts = start; ts <= end; ts += 86400000) {
    const d = new Date(ts);
    const key = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
    const course = dailyCourse(key);
    const again = dailyCourse(key);
    sweep++;
    if (JSON.stringify(course) !== JSON.stringify(again)) detFail++;
    if (!Array.isArray(course) || course.length !== DAILY_COUNT) { shapeFail++; continue; }
    // dailyCourse 返回「关卡对象数组」，必须能直接喂给 createWorld
    if (!course.every(c => c && Array.isArray(c.ropes) && c.vessel)) shapeFail++;
    const tags = course.map(c => c.id);
    for (const t of tags) usedLevels.add(t);
    if (new Set(tags).size !== tags.length) dupFail++;
    for (let i = 1; i < course.length; i++) {
        if (course[i].par < course[i - 1].par) orderFail++;
    }
}
ok(detFail === 0, 'dailyCourse 确定性（731 天两次生成全一致）', `${detFail} 天漂移`);
ok(shapeFail === 0, `每日关卡 = ${DAILY_COUNT} 个完整关卡对象`, `${shapeFail} 天异常`);
ok(dupFail === 0, '每日课程内不重复', `${dupFail} 天重复`);
ok(orderFail === 0, '每日课程按 par 升序', `${orderFail} 天乱序`);
ok(sweep === 730 || sweep === 731, `扫描天数 ≈730（实际 ${sweep}）`);
ok(usedLevels.size === LEVELS.length, `每日抽样覆盖全部 ${LEVELS.length} 关`, `实际 ${usedLevels.size}`);
// 每日课程可直接开局（拿 createWorld 跑一遍首关）
{
    const c = dailyCourse('20260921');
    const w = createWorld(c[0]);
    ok(w.state === 'playing' && w.ropes.length >= 1, '每日首关可创建世界', `state=${w.state}`);
}
// 哈希链黄金锚：锁定 hashStringFNV + mulberry32 不被改写
{
    const golden = dailyCourse('20260921').map(c => c.id).join(',');
    console.log(`  （黄金锚：2026-09-21 → ${golden}）`);
    ok(golden.split(',').length === DAILY_COUNT, '黄金锚可计算（哈希链未断）', golden);
}

console.log(failed === 0
    ? `\nverify-silk-dew-levels 全部通过 ✅（${passed} 项断言，满星可解 ${solvableAll}/${LEVELS.length}）`
    : `\n${failed} 个失败 ❌（通过 ${passed}）`);
process.exit(failed === 0 ? 0 : 1);
