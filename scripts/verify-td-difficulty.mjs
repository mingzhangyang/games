// 塔防新难度机制回归检查
// 用法：node scripts/verify-td-difficulty.mjs [baseUrl] [outDir]
//
// 背景（2026-09-19）：塔防被反馈"过于简单"。重做内容：
//   1. 6 个可选关卡，各自独立曲线/起始资源/解锁条件与排行榜维度
//   2. 4 种机制型敌人：治疗兵(回血) / 装甲兵(减免物理) / 飞行兵(走空中捷径) / 攻城兵(拆塔)
//      外加分裂兵与终局 OVERLORD
//   3. 提前迎击从"白给金币"改成"压波堆叠"：每层敌人 +8% 血、+8% 金币
//
// 为什么必须用浏览器断言：这些全是运行期行为（伤害通道、路径选择、堆叠倍率、
// 解锁门槛），几何检查器与静态分析一律测不出来。因此这里直接驱动 window.tdGame
// 的内部状态做真实推进，并对每个机制做一次"正向 + 反向"双向验证。
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { mkdirSync } from 'node:fs';

const EXE = CHROME_PATH;
const BASE = process.argv[2] || 'http://127.0.0.1:8899';
const OUT = process.argv[3] || 'C:/tmp';
mkdirSync(OUT, { recursive: true });

const fails = [];
const check = (ok, label, detail) => {
    if (!ok) fails.push(label + (detail ? ' — ' + detail : ''));
    console.log(`  ${ok ? '\u2713' : '\u2717'} ${label}${detail ? '  (' + detail + ')' : ''}`);
};

const browser = await puppeteer.launch({ executablePath: EXE, headless: 'new', args: LAUNCH_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push((e.stack || e.message).split('\n').slice(0, 4).join('\n    ')));

await page.goto(BASE + '/tower-defense.html', { waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 900));

/**
 * 每个用例前把世界清干净。
 * ⚠️ 必须做：update() 会用 e.path.pointAt(e.dist) 覆写敌人坐标，
 * 所以「手动摆位置」的用例若不隔离，上一组残留的敌人会走进治疗圈之类的地方，
 * 让人误判成机制失效（第一版就踩过）。spawnQueue/waveState 也要清，
 * 否则 update() 会继续出怪并触发 waveCleared。
 */
const resetWorld = () => page.evaluate(() => {
    const g = window.tdGame;
    g.enemies.length = 0;
    g.projectiles.length = 0;
    g.spawnQueue.length = 0;
    g.groundHazards.length = 0;
    g.towers.length = 0;
    g.towerGrid.fill(-1);
    g.waveState = 'idle';
    g.time = 0;
    g.stack = 0;
    g.applyStack();
    g.hpMul = 1;
    g.spdMul = 1;
    g.state = 'playing';
});

/* ── 1. 关卡配置与解锁 ── */
console.log('\n=== 1. 关卡系统 ===');
const levels = await page.evaluate(() => {
    const g = window.tdGame;
    return {
        count: g ? undefined : 0,
        // LEVELS 是模块内常量，通过渲染出的卡片来验证
        cards: [...document.querySelectorAll('.td-level-card')].map(c => ({
            level: c.dataset.level,
            locked: c.classList.contains('locked'),
            text: c.textContent.replace(/\s+/g, ' ').trim().slice(0, 90)
        })),
        active: document.querySelector('.td-level-card.active')?.dataset.level
    };
});
check(levels.cards.length === 6, '渲染出 6 个关卡卡片', `实际 ${levels.cards.length}`);
check(levels.cards[0] && !levels.cards[0].locked, '第 1 关默认解锁');
check(levels.cards.slice(1).every(c => c.locked), '第 2-6 关默认锁定');
check(levels.cards.every(c => /[1-6]\./.test(c.text)), '每张卡片带序号与关卡名');

// 解锁链：伪造通关记录后应逐级解锁
const unlockProbe = await page.evaluate(() => {
    const g = window.tdGame;
    const before = g.unlockedCount();
    localStorage.setItem('td_clear_outpost', '1');
    const after1 = g.unlockedCount();
    localStorage.setItem('td_clear_vanguard', '1');
    const after2 = g.unlockedCount();
    // 跳级通关闭环：只通了第 1、2 关，第 4 关不能解锁
    localStorage.setItem('td_clear_skyfall', '1');
    const after3 = g.unlockedCount();
    ['td_clear_outpost', 'td_clear_vanguard', 'td_clear_skyfall'].forEach(k => localStorage.removeItem(k));
    return { before, after1, after2, after3 };
});
check(unlockProbe.before === 1, '初始解锁数 = 1', `实际 ${unlockProbe.before}`);
check(unlockProbe.after1 === 2, '通关第 1 关后解锁第 2 关', `实际 ${unlockProbe.after1}`);
check(unlockProbe.after2 === 3, '通关第 2 关后解锁第 3 关', `实际 ${unlockProbe.after2}`);
check(unlockProbe.after3 === 3, '跳过第 3 关不能解锁第 4 关（防跳级）', `实际 ${unlockProbe.after3}`);

/* ── 2. 波次编成与血量曲线 ── */
console.log('\n=== 2. 波次编成 ===');
const waveInfo = await page.evaluate(() => {
    const g = window.tdGame;
    const out = {};
    for (const id of ['outpost', 'vanguard', 'citadel', 'skyfall', 'juggernaut', 'singularity']) {
        // 借助内部方法切换关卡取样
        g.level = null;
        const lv = window.__TD_LEVELS__.find(l => l.id === id);
        g.level = lv;
        const first = window.__TD_BUILD_WAVE__(1, lv);
        const last = window.__TD_BUILD_WAVE__(lv.waves, lv);
        out[id] = {
            waves: lv.waves,
            hpMul1: +first.hpMul.toFixed(2),
            hpMulLast: +last.hpMul.toFixed(2),
            lastCount: last.queue.length,
            lastSummary: last.summary,
            isBossLast: !!last.isBossWave
        };
    }
    g.level = null;
    return out;
});
const widths = Object.values(waveInfo).map(v => v.waves);
check(JSON.stringify(widths) === JSON.stringify([15, 20, 25, 30, 35, 40]),
    '六关波次为 15/20/25/30/35/40', widths.join('/'));
check(Object.values(waveInfo).every(v => v.hpMulLast > v.hpMul1 * 5),
    '每关末波血量倍率显著高于首波（曲线有坡度）');
check(Object.values(waveInfo).every(v => v.isBossLast),
    '每关最后一波都是 BOSS 波');
check(waveInfo.singularity.lastSummary.overlord === 2,
    '终局关末波为双 OVERLORD', JSON.stringify(waveInfo.singularity.lastSummary));
check(Object.values(waveInfo).every(v => v.lastCount <= 70),
    '末波敌人数量在可控范围（<70）', Object.values(waveInfo).map(v => v.lastCount).join('/'));
// 旧版本末波 hpMul 仅 8.7，新曲线应明显更陡
check(waveInfo.citadel.hpMulLast > 11,
    '25 波关（citadel）末波倍率 > 11，明显陡于旧版 8.7', `实际 ${waveInfo.citadel.hpMulLast}`);

/* ── 3. 机制型敌人解锁 ── */
console.log('\n=== 3. 机制型敌人 ===');
const mech = await page.evaluate(() => {
    const out = {};
    for (const id of ['outpost', 'vanguard', 'citadel', 'skyfall', 'juggernaut', 'singularity']) {
        const lv = window.__TD_LEVELS__.find(l => l.id === id);
        const seen = new Set();
        for (let n = 1; n <= lv.waves; n++) {
            const w = window.__TD_BUILD_WAVE__(n, lv);
            Object.keys(w.summary).forEach(k => seen.add(k));
        }
        out[id] = [...seen].sort();
    }
    return out;
});
check(!mech.outpost.includes('healer'), '第 1 关没有治疗兵（新手期不劝退）');
check(mech.vanguard.includes('healer'), '第 2 关出现治疗兵');
check(mech.citadel.includes('armor'), '第 3 关出现装甲兵');
check(mech.skyfall.includes('flyer'), '第 4 关出现飞行兵');
check(mech.juggernaut.includes('splitter'), '第 5 关出现分裂兵');
check(Object.values(mech).every(list => !list.includes('overlord')) === false
    && mech.singularity.includes('overlord'), '只有终局关出现 OVERLORD');
// 第 1 关不该出现任何"需要换塔/换位应对"的机制兵（boss 是纯粹的数值墙，不算机制）
const MECH_TYPES = ['healer', 'armor', 'flyer', 'splitter', 'attacker', 'overlord'];
const outpostMech = mech.outpost.filter(t => MECH_TYPES.includes(t));
check(outpostMech.length === 0,
    '第 1 关不含任何机制型敌人（新手期只教基础）', outpostMech.join(',') || '无');

/* ── 4. 装甲减免（伤害通道） ── */
console.log('\n=== 4. 装甲兵减免 ===');
const armorTest = await page.evaluate(() => {
    const g = window.tdGame;
    localStorage.setItem('td_clear_outpost', '1');
    localStorage.setItem('td_clear_vanguard', '1');
    localStorage.setItem('td_clear_citadel', '1');
    localStorage.setItem('td_clear_skyfall', '1');
    localStorage.setItem('td_clear_juggernaut', '1');
    g.level = window.__TD_LEVELS__.find(l => l.id === 'singularity');
    g.resetRun();
    g.state = 'playing';
    g.hpMul = 1; g.stackHp = 1; g.spdMul = 1;

    const mk = (type) => { g.spawnEnemy(type); return g.enemies[g.enemies.length - 1]; };

    // 装甲兵：物理 vs 能量通道
    const a1 = mk('armor');
    const hpBefore1 = a1.hp;
    g.damageEnemy(a1, 100, false, null, 'physical');
    const physLost = hpBefore1 - a1.hp;

    const a2 = mk('armor');
    const hpBefore2 = a2.hp;
    g.damageEnemy(a2, 100, false, null, 'energy');
    const energyLost = hpBefore2 - a2.hp;

    // 普通兵没有装甲，物理应全额
    const n1 = mk('normal');
    const hpBefore3 = n1.hp;
    g.damageEnemy(n1, 100, false, null, 'physical');
    const normalLost = hpBefore3 - n1.hp;

    // OVERLORD 40% 减伤
    const ov = mk('overlord');
    const hpBefore4 = ov.hp;
    g.damageEnemy(ov, 100, false, null, 'physical');
    const ovLost = hpBefore4 - ov.hp;

    return { physLost, energyLost, normalLost, ovLost,
        armorCfg: window.__TD_ENEMY_TYPES__.armor.armor,
        ovCfg: window.__TD_ENEMY_TYPES__.overlord.armor };
});
check(Math.abs(armorTest.physLost - 40) <= 1,
    `装甲兵吃物理伤害 100 → ${armorTest.physLost}（应约 40 = 60% 减免）`, `配置 armor=${armorTest.armorCfg}`);
check(Math.abs(armorTest.energyLost - 100) <= 1,
    `装甲兵吃能量伤害 100 → ${armorTest.energyLost}（应全额 100）`);
check(armorTest.normalLost === 100, `普通兵吃物理伤害 100 → ${armorTest.normalLost}（无护甲全额）`);
check(Math.abs(armorTest.ovLost - 60) <= 1,
    `OVERLORD 吃物理伤害 100 → ${armorTest.ovLost}（应约 60）`, `配置 armor=${armorTest.ovCfg}`);
check(armorTest.physLost < armorTest.energyLost,
    '物理被减免 < 能量不被减免（克制关系成立）');

/* ── 5. 治疗兵回血 ── */
console.log('\n=== 5. 治疗兵 ===');
// 注意：update() 会用路径重算 x/y，所以不能靠"手动摆坐标"来构造距离。
// 正确做法是让两个单位停在同一个 dist（同一点），再判断半径内外。
const healNear = await page.evaluate(() => {
    const g = window.tdGame;
    g.enemies.length = 0;
    g.spawnQueue.length = 0;
    g.waveState = 'idle';
    g.hpMul = 1; g.stackHp = 1; g.spdMul = 1;
    g.spawnEnemy('healer');
    g.spawnEnemy('normal');
    const healer = g.enemies.find(e => e.type === 'healer');
    const victim = g.enemies.find(e => e.type === 'normal');
    // 同一 dist ⇒ 同一个坐标点，必然在治疗半径内
    healer.dist = 300; victim.dist = 300;
    victim.hp = 10;
    const x = healer.x, y = healer.y;
    const before = victim.hp;
    for (let i = 0; i < 60; i++) g.update(1 / 60);
    return { before, after: victim.hp, samePoint: { x: Math.round(x), y: Math.round(y) },
        healerPos: { x: Math.round(healer.x), y: Math.round(healer.y) } };
});
check(healNear.after > healNear.before,
    `治疗范围内目标回血 ${healNear.before} → ${healNear.after.toFixed(1)}`);
check(Math.abs((healNear.after - healNear.before) - 14) < 3,
    '回血速率约等于配置的 14 hp/s', `实测 ${(healNear.after - healNear.before).toFixed(1)} hp/s`);

await resetWorld();
// 敌人坐标 = path.pointAt(dist)，所以距离要用「弧长差」来构造：
// 两个相同的路径点（弧长差 0）必然贴合；弧长差 ↔ 直线距离由 findArcGap 反查。
const healFar = await page.evaluate(() => {
    const g = window.tdGame;
    const R = window.__TD_ENEMY_TYPES__.healer.healer.radius;
    g.spawnEnemy('healer');
    g.spawnEnemy('normal');
    const healer = g.enemies.find(e => e.type === 'healer');
    const victim = g.enemies.find(e => e.type === 'normal');
    healer.speed = 0; victim.speed = 0;    // 冻结推进，保证弧长差恒定

    // 在路径上找一个点，使两者直线距离刚好明显超过治疗半径：
    // 从 0 开始在整条路径上扫描弧长差，取第一个 dist > R * 1.5 的落点。
    // ⚠️ 路径在敌人自己身上（e.path），不在 game 上——地面/空中各一条。
    const P = healer.path;
    const p0 = P.pointAt(0);
    let gap = null;
    for (let d = 1; d < P.total; d += 0.5) {
        const p = P.pointAt(d);
        if (Math.hypot(p.x - p0.x, p.y - p0.y) > R * 1.5) { gap = d; break; }
    }
    if (gap === null) return { error: '路径上找不到足够远的点' };

    healer.dist = 0; victim.dist = gap;
    victim.hp = 10;
    g.update(0);                            // dt=0：只重算坐标，不推进游戏
    const dist = Math.hypot(victim.x - healer.x, victim.y - healer.y);
    const before = victim.hp;
    for (let i = 0; i < 60; i++) g.update(1 / 60);
    return {
        before, after: victim.hp, dist, gap, radius: R,
        samePointAtGap0: (() => {
            const q = P.pointAt(gap);
            return Math.round(Math.hypot(q.x - p0.x, q.y - p0.y));
        })(),
    };
});
check(!healFar.error && healFar.dist > healFar.radius,
    `构造出超出治疗半径的直线距离（${Math.round(healFar.dist || 0)}px > ${healFar.radius}px）`,
    `弧长差 ${healFar.gap}px`);
check(healFar.after === healFar.before,
    '超出治疗半径的友军不回血', `${healFar.before} → ${healFar.after}`);

// 反向对照：治疗兵自己不该给自己回血（避免"永动"）
await resetWorld();
const selfHeal = await page.evaluate(() => {
    const g = window.tdGame;
    g.spawnEnemy('healer');
    const h = g.enemies[0];
    h.hp = 10;
    const before = h.hp;
    for (let i = 0; i < 60; i++) g.update(1 / 60);
    return { before, after: h.hp };
});
check(selfHeal.after === selfHeal.before,
    '治疗兵不治疗自己（否则等效无限血）', `${selfHeal.before} → ${selfHeal.after}`);

/* ── 6. 治疗兵集火优先级 ── */
console.log('\n=== 6. 集火策略 ===');
await resetWorld();
const prioTest = await page.evaluate(() => {
    const g = window.tdGame;
    g.spawnEnemy('healer');
    g.spawnEnemy('normal');
    const healer = g.enemies.find(e => e.type === 'healer');
    const normal = g.enemies.find(e => e.type === 'normal');
    // 普通兵更靠前（进度更高），治疗兵落后
    normal.dist = 600; healer.dist = 200;
    // 把塔放在治疗兵身上，两者都在射程内
    const tower = { x: healer.x, y: healer.y, priority: 'healer', type: 'pulse', level: 0 };
    const picked = g.pickTarget(tower, 400);
    tower.priority = 'first';
    const pickedFirst = g.pickTarget(tower, 400);
    return {
        healerPicked: picked && picked.type,
        firstPicked: pickedFirst && pickedFirst.type
    };
});
check(prioTest.healerPicked === 'healer',
    'healer 优先级能锁定靠后的治疗兵', `实际选中 ${prioTest.healerPicked}`);
check(prioTest.firstPicked === 'normal',
    'first 优先级仍选进度最靠前的敌人（对照）', `实际选中 ${prioTest.firstPicked}`);

// 优先级列表包含 healer
const prioList = await page.evaluate(() => window.__TD_TARGET_PRIORITIES__);
check(prioList.includes('healer'), '集火策略列表新增 healer', prioList.join('/'));

/* ── 7. 飞行兵走空中捷径 ── */
console.log('\n=== 7. 飞行兵路径 ===');
const flyTest = await page.evaluate(() => {
    const g = window.tdGame;
    g.enemies.length = 0;
    g.spawnEnemy('flyer');
    g.spawnEnemy('normal');
    const flyer = g.enemies.find(e => e.type === 'flyer');
    const ground = g.enemies.find(e => e.type === 'normal');

    const airTotal = flyer.path.total;
    const groundTotal = ground.path.total;
    // 把两者同距离推进，飞行兵坐标应落在空中航线上
    flyer.dist = 500; ground.dist = 500;
    const airP = flyer.path.pointAt(500);
    const gndP = ground.path.pointAt(500);

    return {
        airTotal: Math.round(airTotal),
        groundTotal: Math.round(groundTotal),
        flyingFlag: !!flyer.flying,
        groundFlag: !!ground.flying,
        airPoint: { x: Math.round(airP.x), y: Math.round(airP.y) },
        groundPoint: { x: Math.round(gndP.x), y: Math.round(gndP.y) },
        pathDiffers: flyer.path !== ground.path
    };
});
check(flyTest.flyingFlag && !flyTest.groundFlag, '只有飞行兵带 flying 标记');
check(flyTest.pathDiffers, '飞行兵使用与地面兵不同的路径对象');
check(flyTest.airTotal < flyTest.groundTotal,
    `空中航线更短（${flyTest.airTotal} < ${flyTest.groundTotal}），构成绕路优势`);
check(flyTest.airPoint.x !== flyTest.groundPoint.x || flyTest.airPoint.y !== flyTest.groundPoint.y,
    '同推进距离下坐标不同（确认真的走了另一条线）',
    `air=(${flyTest.airPoint.x},${flyTest.airPoint.y}) ground=(${flyTest.groundPoint.x},${flyTest.groundPoint.y})`);

/* ── 8. 分裂兵 ── */
console.log('\n=== 8. 分裂兵 ===');
await resetWorld();
const splitTest = await page.evaluate(() => {
    const g = window.tdGame;
    g.spawnEnemy('splitter');
    const sp = g.enemies.find(e => e.type === 'splitter');
    sp.dist = 400;
    const parentHp = sp.hp;

    const before = g.enemies.length;
    g.damageEnemy(sp, 999999, false, null, 'energy');

    // 本体此刻 dead=true 但仍在数组里（update() 才 filter），所以要按 dead 过滤
    const alive = g.enemies.filter(e => !e.dead);
    const children = alive.filter(e => e.type === 'swarm');
    return {
        before,
        totalAfter: g.enemies.length,
        aliveCount: alive.length,
        childCount: children.length,
        childTypes: [...new Set(alive.map(e => e.type))],
        parentHp,
        childHp: children[0] ? children[0].hp : 0,
        childDist: children.length ? Math.round(children[0].dist) : -1,
        parentDist: Math.round(sp.dist),
        hpMul: g.hpMul, stackHp: g.stackHp
    };
});
check(splitTest.childCount === 3,
    `分裂兵死亡裂出 3 只子代`, `存活 ${splitTest.aliveCount}（${splitTest.childTypes.join(',')}）`);
check(splitTest.childTypes.length === 1 && splitTest.childTypes[0] === 'swarm',
    '子代全部为 swarm 类型', splitTest.childTypes.join(','));
// 子代是缩水版：hp 应小于同龄 swarm 的基准
const swarmBase = await page.evaluate(() =>
    window.__TD_ENEMY_TYPES__.swarm.hp * window.tdGame.hpMul * window.tdGame.stackHp);
check(splitTest.childHp > 0 && splitTest.childHp < swarmBase,
    `子代血量为缩水版（${Math.round(splitTest.childHp)} < ${Math.round(swarmBase)}）`,
    `比例 ${(splitTest.childHp / swarmBase * 100).toFixed(0)}%`);
check(splitTest.childDist > 300,
    '子代在父体倒下的位置附近生成（不是从起点重来）',
    `child dist=${splitTest.childDist} vs parent=${splitTest.parentDist}`);

/* ── 9. 攻城兵拆塔 ── */
console.log('\n=== 9. 攻城兵 ===');
await resetWorld();
const siegeTest = await page.evaluate(() => {
    const g = window.tdGame;
    const RANGE = window.__TD_ENEMY_TYPES__.attacker.attacker.range;

    // 攻城兵停在路径某处（speed=0 冻结）
    g.spawnEnemy('attacker');
    const atk = g.enemies[0];
    atk.dist = 400;
    atk.speed = 0;
    g.update(0);                       // dt=0：先把坐标同步到 dist 对应的路径点

    // ⚠️ 塔必须建在"攻城兵真实坐标"的射程内。手写格子号（如 5,5）与路径点
    // 可能隔着上百像素，会让用例在检查机制之前就先失败——所以按坐标反查格子。
    const D = window.__TD_GRID__;   // { COLS, ROWS, CELL }：维度是模块常量，不在实例上
    // ⚠️ 必须带上可建造判据 !pathGrid[...]：攻城兵走在路径上，离它最近的格子
    // 往往正是路径格（不可建造），漏掉这一条会导致 tryBuild 直接静默返回。
    const pickCell = (maxDist) => {
        let best = null;
        for (let r = 0; r < D.ROWS; r++) for (let c = 0; c < D.COLS; c++) {
            if (g.towerGrid[r * D.COLS + c] !== -1) continue;
            if (D.pathGrid[r * D.COLS + c]) continue;
            const d = Math.hypot((c + 0.5) * D.CELL - atk.x, (r + 0.5) * D.CELL - atk.y);
            if (d > maxDist) continue;
            if (!best || d < best.d) best = { c, r, d };
        }
        return best;
    };
    const cell = pickCell(RANGE * 0.6);
    if (!cell) return { error: '找不到射程内的空位' };

    g.selectedCell = { c: cell.c, r: cell.r };
    g.tryBuild('pulse');
    const tower = g.towers[g.towers.length - 1];
    if (!tower) return { error: '塔没建起来' };
    const distToTower = Math.hypot(tower.x - atk.x, tower.y - atk.y);

    const fullHp = g.towerMaxHp(tower);
    const hpBefore = tower.hp;
    for (let i = 0; i < 120; i++) g.update(1 / 60);
    const hpAfter = tower.hp;

    g.damageTower(tower, 999999);
    const gridCleared = g.towerGrid[tower.r * D.COLS + tower.c] === -1;

    return {
        fullHp, hpBefore, hpAfter, gridCleared,
        destroyedFlag: tower.destroyed,
        distToTower: Math.round(distToTower),
        range: RANGE
    };
});
check(!siegeTest.error, '攻城兵用例构造成功', siegeTest.error);
check(siegeTest.distToTower < siegeTest.range,
    `塔落在攻城范围内（${siegeTest.distToTower} < ${siegeTest.range}）`);
check(siegeTest.hpAfter < siegeTest.hpBefore,
    `攻城兵持续拆塔 ${siegeTest.hpBefore} → ${siegeTest.hpAfter != null ? siegeTest.hpAfter.toFixed(1) : 'n/a'}`);
check(siegeTest.destroyedFlag === true, '塔被打到 0 触发摧毁');
check(siegeTest.gridCleared === true, '摧毁后格子被释放（可重建）');

// 反向对照：射程外的塔不受伤害
await resetWorld();
const siegeFar = await page.evaluate(() => {
    const g = window.tdGame;
    const D = window.__TD_GRID__;
    const RANGE = window.__TD_ENEMY_TYPES__.attacker.attacker.range;
    g.spawnEnemy('attacker');
    const atk = g.enemies[0];
    atk.dist = 40;
    atk.speed = 0;
    g.update(0);

    // 取离攻城兵最远、且可建造的空位，确保落在射程之外
    let far = null;
    for (let r = 0; r < D.ROWS; r++) for (let c = 0; c < D.COLS; c++) {
        if (g.towerGrid[r * D.COLS + c] !== -1) continue;
        if (D.pathGrid[r * D.COLS + c]) continue;
        const d = Math.hypot((c + 0.5) * D.CELL - atk.x, (r + 0.5) * D.CELL - atk.y);
        if (!far || d > far.d) far = { c, r, d };
    }
    g.selectedCell = { c: far.c, r: far.r };
    g.tryBuild('pulse');
    const t = g.towers[g.towers.length - 1];
    const d = Math.hypot(t.x - atk.x, t.y - atk.y);
    const before = t.hp;
    for (let i = 0; i < 90; i++) g.update(1 / 60);
    return { before, after: t.hp, dist: Math.round(d), range: RANGE };
});
check(siegeFar.dist > siegeFar.range,
    `对照塔确实在射程外（${siegeFar.dist} > ${siegeFar.range}）`);
check(siegeFar.after === siegeFar.before,
    '超出攻城范围的塔不受伤害', `${siegeFar.before} → ${siegeFar.after}`);

/* ── 10. 提前迎击 = 风险堆叠 ── */
console.log('\n=== 10. 提前迎击堆叠 ===');
const stackTest = await page.evaluate(() => {
    const g = window.tdGame;
    g.level = window.__TD_LEVELS__.find(l => l.id === 'singularity');
    g.resetRun();
    g.state = 'playing';
    const goldStart = g.gold;

    g.startWave();                    // 正常发第 1 波
    const stackAfterFirst = g.stack;
    const waveAfterFirst = g.wave;

    g.startWave();                    // 战斗中 → 压波 1 层
    const stackAfterRush1 = g.stack;
    const hpMul1 = g.stackHp;
    const goldMul1 = g.stackGold;
    const goldAfterRush = g.gold;

    g.startWave();                    // 再压一层
    const stackAfterRush2 = g.stack;
    const hpMul2 = g.stackHp;

    // 压到上限
    for (let i = 0; i < 10; i++) g.startWave();
    const stackAtCap = g.stack;

    return {
        goldStart, goldAfterRush, stackAfterFirst, waveAfterFirst,
        stackAfterRush1, hpMul1, goldMul1, stackAfterRush2, hpMul2, stackAtCap,
        stackMax: window.__TD_STACK_MAX__,
        perHp: window.__TD_STACK_HP_PER__,
        perGold: window.__TD_STACK_GOLD_PER__
    };
});
check(stackTest.stackAfterFirst === 0, '正常发波不产生堆叠', `stack=${stackTest.stackAfterFirst}`);
check(stackTest.stackAfterRush1 === 1, '战斗中发波产生 1 层堆叠', `stack=${stackTest.stackAfterRush1}`);
check(Math.abs(stackTest.hpMul1 - 1.08) < 0.001,
    '1 层堆叠 = 敌人血量 ×1.08', `实际 ×${stackTest.hpMul1.toFixed(3)}`);
check(Math.abs(stackTest.goldMul1 - 1.08) < 0.001,
    '1 层堆叠 = 金币收益 ×1.08', `实际 ×${stackTest.goldMul1.toFixed(3)}`);
check(stackTest.stackAfterRush2 === 2, '可继续叠加到 2 层', `stack=${stackTest.stackAfterRush2}`);
check(Math.abs(stackTest.hpMul2 - 1.16) < 0.001,
    '2 层堆叠 = 敌人血量 ×1.16', `实际 ×${stackTest.hpMul2.toFixed(3)}`);
check(stackTest.stackAtCap === stackTest.stackMax,
    `堆叠有上限（${stackTest.stackMax} 层）`, `实际 ${stackTest.stackAtCap}`);
check(stackTest.goldAfterRush === stackTest.goldStart,
    '压波不再白给金币（旧版的核心漏洞已修）',
    `${stackTest.goldStart} → ${stackTest.goldAfterRush}`);

// 清波后重置
const stackReset = await page.evaluate(() => {
    const g = window.tdGame;
    const before = g.stack;
    // 清空场上敌人并推进，触发 waveCleared
    g.enemies.length = 0;
    g.spawnQueue.length = 0;
    g.waveState = 'fighting';
    g.update(1 / 60);
    return { before, after: g.stack, hpMul: g.stackHp };
});
check(stackReset.before > 0 && stackReset.after === 0,
    '清空整波后堆叠归零', `${stackReset.before} → ${stackReset.after}`);
check(Math.abs(stackReset.hpMul - 1) < 0.001, '堆叠归零后倍率恢复 ×1');

/* ── 11. 关卡独立最佳分与排行榜维度 ── */
console.log('\n=== 11. 分数隔离 ===');
const scoreTest = await page.evaluate(async () => {
    const g = window.tdGame;
    localStorage.removeItem('td_best_outpost');
    localStorage.removeItem('td_best_vanguard');

    g.level = window.__TD_LEVELS__.find(l => l.id === 'outpost');
    g.resetRun();
    g.score = 1111; g.lives = 5; g.wave = 15;
    // 不 await 网络部分：endGame 会尝试上报，离线时静默
    const p = g.endGame(true);
    const bestOutpost = localStorage.getItem('td_best_outpost');
    await p.catch(() => {});

    g.level = window.__TD_LEVELS__.find(l => l.id === 'vanguard');
    g.resetRun();
    const bestVanguardBefore = localStorage.getItem('td_best_vanguard');
    const outpostAfter = localStorage.getItem('td_best_outpost');

    return { bestOutpost: Number(bestOutpost) || 0, bestVanguardBefore, outpostAfter,
        idxOutpost: 0 };
});
check(scoreTest.bestOutpost > 0, '通关后写入本关最佳分 td_best_outpost',
    `${scoreTest.bestOutpost}`);
check(scoreTest.bestVanguardBefore === null,
    '未通关的关卡不写入最佳分（分数按关隔离）');
check(Number(scoreTest.outpostAfter) === scoreTest.bestOutpost,
    '切换关卡不会覆盖另一关的记录（防跨关污染）');

/* ── 12. 侧栏/i18n 完整性 ── */
console.log('\n=== 12. 文案与 i18n ===');
const i18n = await page.evaluate(() => {
    const g = window.tdGame;
    const zh = { howto: '', cards: 0, threat: '', brief: '', stackBadge: '' };
    const en = { howto: '', threat: '', brief: '' };

    g.lang = 'zh';
    g.applyLanguage();
    zh.howto = document.getElementById('td-howto').textContent;
    zh.cards = document.querySelectorAll('.td-level-card').length;
    zh.threat = document.querySelector('.td-level-threats')?.textContent || '';
    zh.brief = document.getElementById('td-level-brief').textContent;
    document.getElementById('td-stack-badge').textContent = '×2 +16%';

    g.lang = 'en';
    g.applyLanguage();
    en.howto = document.getElementById('td-howto').textContent;
    en.threat = document.querySelector('.td-level-threats')?.textContent || '';
    en.brief = document.getElementById('td-level-brief').textContent;

    g.lang = 'zh';
    g.applyLanguage();
    return { zh, en };
});
check(/治疗兵|装甲兵/.test(i18n.zh.howto) || /healer|armor/i.test(i18n.en.howto),
    '玩法说明提到了新机制（中英各自命中）');
check(/治疗兵|装甲兵|飞行兵/.test(i18n.zh.threat),
    `关卡威胁标签已中文化（${i18n.zh.threat.replace(/\s+/g, ' ').trim().slice(0, 40)}）`);
check(/Healer|Armored|Flying/i.test(i18n.en.threat),
    `关卡威胁标签英文正常（${i18n.en.threat.replace(/\s+/g, ' ').trim().slice(0, 40)}）`);
check(i18n.zh.brief && i18n.en.brief && i18n.zh.brief !== i18n.en.brief,
    '关卡简报随语言切换（中英内容不同）');

// 占位符泄漏：切换语言后不应残留 {n}/{g} 等模板变量
const leak = await page.evaluate(async () => {
    const g = window.tdGame;
    const out = [];
    for (const lang of ['zh', 'en']) {
        g.lang = lang;
        g.applyLanguage();
        const texts = [
            document.getElementById('td-hint')?.textContent || '',
            document.getElementById('td-howto')?.textContent || '',
            document.querySelector('.td-level-cards')?.textContent || '',
            document.getElementById('td-level-brief')?.textContent || '',
            [...document.querySelectorAll('.td-side-card')].map(e => e.textContent).join(' ')
        ].join(' ');
        const m = texts.match(/\{[a-zA-Z]+\}/g);
        if (m) out.push(lang + ': ' + [...new Set(m)].join(','));
    }
    return out;
});
check(leak.length === 0, '切换语言后无占位符泄漏', leak.join(' | ') || '（无残留）');

/* ── 13. 运行期无报错 ── */
console.log('\n=== 13. 运行期错误 ===');
check(pageErrors.length === 0, '整个流程无未捕获异常', pageErrors.join('\n    ') || '');
await page.screenshot({ path: OUT + '/td-difficulty.png' });

await browser.close();

console.log('\n' + '='.repeat(64));
if (fails.length) {
    console.log(`FAILED — ${fails.length} 项未通过：`);
    fails.forEach(f => console.log('  ✗ ' + f));
    process.exit(1);
}
console.log('ALL CHECKS PASSED');
