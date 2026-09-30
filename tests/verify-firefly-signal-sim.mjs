#!/usr/bin/env node
// verify-firefly-signal-sim.mjs — 萤火信号的模拟层与关卡可玩性（离线，无需浏览器）
//
//   ① 相位推进 / 闪光复位 / 距离耦合（近强远弱、半径外为 0）/ 捕获窗口
//   ② Normal / Fast / Solitary 的参数差异与行为差异（Fast 闪得更勤，Solitary 更难被拉动）
//   ③ Harmony = 圆周序参量（全同相 = 1、均匀铺开 ≈ 0、两群反相 ≈ 0；与「亮着几只」无关）
//   ④ 种子随机与确定性回放：同 seed + 同输入 = 逐位相同；改一个输入 / 换 seed 就不同
//   ⑤ 玩家干预：立即闪光 + 相位归零 + 圈内同伴被拉动 + 扣次数；冷却；上限
//   ⑥ 关卡可玩性（本轮原型的核心判据，见 docs/proposal-firefly-signal-development.md §1 / §21）：
//      - 不干预等 240 秒永远赢不了（等待不是策略）
//      - 求解器（观察 + 找连接两群的个体）在干预上限内能赢
//      - 快速随机点击的胜率明显低于求解器
//      - 第 2 关：只点桥接虫也能赢（「寻找连接群体的关键个体」这条路真实存在）
//      - 完成同步后状态稳定：强制同相后 60 秒内非独行者始终锁在一起
//
// 用法：node scripts/verify-firefly-signal-sim.mjs
import {
    createSimulation, replay, orderParameter, falloff, ringFalloff, responseCurve, signedGap,
    DT, TYPES, TUNING, WORLD,
} from '../js/firefly-signal/simulation.js';
import { LEVELS, BRIDGES } from '../js/firefly-signal/levels.js';
import { solve, randomPlay, idle } from './lib/firefly-solver.mjs';

let failed = 0;
const ok = (cond, label, extra) => {
    if (cond) { console.log(`✓ ${label}`); return; }
    failed++;
    console.error(`✗ ${label}${extra !== undefined ? ' —— ' + extra : ''}`);
};
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const sec = s => Math.round(s / DT);

/** 最小关卡夹具 */
const lvl = (flies, extra = {}) => ({ target: 0.9, maxInterventions: 3, jitter: 0, groups: [{ phase: 0, spread: 0 }], flies, ...extra });

/* ── ① 相位推进 / 闪光复位 / 距离耦合 ── */
console.log('▶ ① 相位推进 / 闪光 / 距离耦合');
{
    const sim = createSimulation(lvl([{ x: 100, y: 100, phase: 0.1 }]));
    const p0 = sim.flies[0].phase;
    for (let i = 0; i < 30; i++) sim.step();
    ok(close(sim.flies[0].phase, p0 + 30 * DT / TYPES.normal.period, 1e-12), '孤虫每 tick 前进 DT / period');
    const s2 = createSimulation(lvl([{ x: 100, y: 100, phase: 0.995 }]));
    s2.step();
    ok(s2.flashed.length === 1 && s2.flies[0].phase === 0 && s2.flies[0].lastFlash === 1, '跨过 1 → 当 tick 闪光且相位归零');

    // 一只在 0.99 马上闪，另两只（同相位 0.9，处在捕获窗口内）一近一远
    const near = 30, far = 70;
    const s3 = createSimulation(lvl([
        { x: 0, y: 0, phase: 0.999 },
        { x: near, y: 0, phase: 0.9 },
        { x: 0, y: far, phase: 0.9 },
        { x: 500, y: 500, phase: 0.9 },
    ]));
    s3.step();
    const adv = i => s3.flies[i].phase - (0.9 + DT / TYPES.normal.period);
    ok(adv(1) > adv(2) && adv(2) > 0, '距离越近，被 pulse 推得越多', `near ${adv(1).toFixed(4)} far ${adv(2).toFixed(4)}`);
    ok(close(adv(3), 0, 1e-12), '自然半径之外不受影响');
    // 漫游让实际位置偏离 home 几个单位：按 step 后的实际距离核对公式
    const d1 = Math.hypot(s3.flies[1].x - s3.flies[0].x, s3.flies[1].y - s3.flies[0].y);
    ok(close(adv(1), TYPES.normal.coupling * falloff(d1 / TYPES.normal.radius) * responseCurve(0.9 + DT / TYPES.normal.period), 1e-12),
        'phase += coupling × distanceFalloff × responseCurve');
    ok(falloff(0) === 1 && falloff(1) === 0 && falloff(0.5) > falloff(0.8), 'falloff 单调：1 → 0');
    ok(ringFalloff(0.3) === 1 && ringFalloff(1) === 0 && ringFalloff(0.9) < ringFalloff(0.7), '干预圈：平台全额，圈边平滑到 0');
    ok(signedGap(0.9) > 0 && signedGap(0.1) < 0, '响应方向：落后的推前、领先的拉后');
    ok(responseCurve(0.5) === 0 && responseCurve(0.62) === 0 && responseCurve(0.95) > 0, '捕获窗口：反相附近自然 pulse 不起作用');
}

/* ── ② 三种萤火虫 ── */
console.log('\n▶ ② Normal / Fast / Solitary');
{
    const N = TYPES.normal, F = TYPES.fast, S = TYPES.solitary;
    ok(F.period < N.period && N.period < S.period, '周期：Fast < Normal < Solitary');
    ok(S.coupling < N.coupling && N.coupling < F.coupling, '耦合：Solitary 最低');
    ok(F.size < N.size && N.size < S.size, '体型：Fast 略小、Solitary 稍大');
    ok(F.wanderSpeed > N.wanderSpeed && S.wanderSpeed < N.wanderSpeed, '移动：Fast 略快、Solitary 较慢');
    const sim = createSimulation(lvl([
        { x: 0, y: 0, type: 'normal', phase: 0 },
        { x: 300, y: 0, type: 'fast', phase: 0 },
        { x: 600, y: 0, type: 'solitary', phase: 0 },
    ]));
    for (let i = 0; i < sec(120); i++) sim.step();
    const [n, f, s] = sim.flies.map(x => x.flashes);
    ok(f > n && n > s, '孤立时 Fast 闪得最勤、Solitary 最少', `${f} / ${n} / ${s}`);
    // 同一只 0.92 的接收者，被同样距离的闪光推动：Solitary 远小于 Normal
    const pushed = type => {
        const t = createSimulation(lvl([{ x: 0, y: 0, phase: 0.999 }, { x: 30, y: 0, phase: 0.92, type }]));
        t.step();
        return t.flies[1].phase - (0.92 + DT / TYPES[type].period);
    };
    ok(pushed('solitary') < pushed('normal') * 0.5 && pushed('fast') > pushed('normal'), '接收灵敏度：Solitary ≪ Normal < Fast');
}

/* ── ③ Harmony ── */
console.log('\n▶ ③ Harmony（圆周序参量）');
{
    ok(close(orderParameter([0.3, 0.3, 0.3, 0.3]), 1), '全同相 = 1');
    ok(orderParameter([0, 0.25, 0.5, 0.75]) < 1e-9, '均匀铺开 ≈ 0');
    ok(orderParameter([0.1, 0.1, 0.6, 0.6]) < 1e-9, '两群反相 ≈ 0（尽管每一刻都有半数同时亮）');
    ok(close(orderParameter([0.99, 0.01]), Math.cos(Math.PI * 0.02), 1e-12), '跨过 0/1 边界也按圆周计算');
    const sim = createSimulation(LEVELS[0]);
    ok(close(sim.harmony, orderParameter(sim.flies.map(f => f.phase)), 1e-12), 'sim.harmony 与 orderParameter 一致');
}

/* ── ④ 种子随机 / 确定性回放 ── */
console.log('\n▶ ④ 确定性');
{
    const L = LEVELS[2];
    const a = createSimulation(L, { seed: 42 }), b = createSimulation(L, { seed: 42 }), c = createSimulation(L, { seed: 43 });
    ok(a.fingerprint() === b.fingerprint(), '同 seed 初始状态逐位相同');
    ok(a.fingerprint() !== c.fingerprint(), '换 seed 初始状态不同');
    const inputs = [{ tick: 120, id: 3 }, { tick: 200, id: 22 }, { tick: 333, id: 28 }];
    const r1 = replay(L, 42, inputs, sec(20)), r2 = replay(L, 42, inputs, sec(20));
    ok(r1.fingerprint() === r2.fingerprint(), '同 seed + 同输入序列 → 20 秒后逐位相同');
    const r3 = replay(L, 42, [{ tick: 120, id: 3 }, { tick: 201, id: 22 }, { tick: 333, id: 28 }], sec(20));
    ok(r1.fingerprint() !== r3.fingerprint(), '输入晚 1 tick → 结果不同（输入确实被计入）');
    const cl = r1.clone();
    for (let i = 0; i < 120; i++) { cl.step(); r1.step(); }
    ok(cl.fingerprint() === r1.fingerprint(), 'clone() 之后与原局同步推进逐位相同');
    const probe = createSimulation(L);
    ok(!/Math\.random|Date\.now|performance\.now/.test(String(probe.step) + String(probe.intervene) + String(createSimulation)),
        '模拟代码不读 Math.random / Date.now / performance.now');
}

/* ── ⑤ 玩家干预 ── */
console.log('\n▶ ⑤ 玩家干预');
{
    const L = lvl([
        { x: 100, y: 100, phase: 0.4 },
        { x: 140, y: 100, phase: 0.6 },
        { x: 100, y: 320, phase: 0.6 },
    ], { maxInterventions: 2 });
    const sim = createSimulation(L);
    for (let i = 0; i < 10; i++) sim.step();
    const before = sim.flies.map(f => f.phase);
    ok(sim.intervene(0) === true, '可以干预');
    ok(sim.flies[0].phase === 0 && sim.flies[0].lastFlash === sim.tick && sim.flashed.includes(0), '被点的虫立即闪光、相位归零');
    ok(sim.flies[1].phase > before[1], '圈内同伴被拉向「此刻」（即使处在反相附近，干预不受捕获窗口限制）');
    ok(close(sim.flies[2].phase, before[2], 1e-12), '圈外同伴不受影响', `R=${(TYPES.normal.radius * TUNING.interventionRange).toFixed(0)}`);
    ok(sim.remaining() === 1 && sim.interventions[0].tick === sim.tick && sim.interventions[0].id === 0, '扣一次并记录 (tick, id)');
    ok(sim.intervene(1) === false && sim.cooldown() > 0, '冷却中（信号还在扩散）不能再干预，也不扣次数');
    for (let i = 0; i < sec(TUNING.interventionCooldown) + 1; i++) sim.step();
    ok(sim.intervene(1) === true && sim.remaining() === 0, '冷却结束后可再干预');
    for (let i = 0; i < sec(1); i++) sim.step();
    ok(sim.intervene(2) === false && sim.interventions.length === 2, '用尽上限后不再生效');
}

/* ── ⑥ 关卡可玩性 ── */
console.log('\n▶ ⑥ 关卡可玩性');
ok(LEVELS.map(l => l.id).join(',') === 'first-light,two-meadows,midsummer', '三关：First Light / Two Meadows / Midsummer');
{
    const count = (L, t) => L.flies.filter(f => (f.type || 'normal') === t).length;
    const [l1, l2, l3] = LEVELS;
    ok(l1.flies.length === 8 && count(l1, 'normal') === 8 && l1.maxInterventions === 3 && l1.target === 0.85, 'L1：8 Normal / 3 次 / 85%');
    ok(l2.flies.length >= 16 && l2.flies.length <= 20 && count(l2, 'normal') === l2.flies.length && l2.maxInterventions === 5, 'L2：约 18 Normal / 5 次');
    ok(count(l3, 'normal') === 25 && count(l3, 'fast') === 3 && count(l3, 'solitary') === 2 && l3.maxInterventions === 8 && l3.target === 0.9,
        'L3：25 Normal + 3 Fast + 2 Solitary / 8 次 / 90%');
    for (const L of LEVELS) {
        const inWorld = L.flies.every(f => f.x >= 0 && f.x <= WORLD.w && f.y >= 0 && f.y <= WORLD.h);
        ok(inWorld, `${L.id}：全部在世界范围内`);
    }
}
const RANDOM_RUNS = 40;
for (const L of LEVELS) {
    const i = idle(L, L.seed, 240);
    ok(!i.won, `${L.id}：不干预等 240 秒赢不了`, `峰值 ${(i.peak * 100).toFixed(0)}%`);
    const s = solve(L);
    ok(s.won && s.used <= L.maxInterventions, `${L.id}：求解器在上限内通关`, `${s.used}/${L.maxInterventions}，${(s.wonTick * DT).toFixed(1)}s`);
    let rw = 0;
    for (let k = 1; k <= RANDOM_RUNS; k++) if (randomPlay(L, L.seed, k, { meanGap: 0.4 }).won) rw++;
    const rate = rw / RANDOM_RUNS;
    ok(rate <= 0.3, `${L.id}：快速随机点击胜率 ≤ 30%（求解器 100%）`, `${rw}/${RANDOM_RUNS}`);
    if (L.id === 'first-light') {
        ok(s.wonTick * DT <= 20, 'L1：会观察的玩家 20 秒内看到第一次全场同步', `${(s.wonTick * DT).toFixed(1)}s`);
    }
}
{
    const L = LEVELS[1];
    const s = solve(L, L.seed, { candidates: BRIDGES[L.id] });
    ok(s.won, 'L2：只点桥接虫也能通关（找「连接两群的个体」是真实可行的策略）', `${s.used} 次`);
}
{
    const L = LEVELS[2];
    const sim = createSimulation(L);
    for (const f of sim.flies) f.phase = 0.5;
    let worstSpread = 0;
    for (let t = 0; t < sec(60); t++) {
        sim.step();
        if (t > sec(10) && t % 30 === 0) {
            // 非独行者的相位离散度（圆周意义上）：锁在一起时远小于 0.1
            const ph = sim.flies.filter(f => f.type !== 'solitary').map(f => f.phase);
            const R = orderParameter(ph);
            worstSpread = Math.max(worstSpread, 1 - R);
        }
    }
    ok(worstSpread < 0.05, 'L3：全体同相后 60 秒内 Normal + Fast 始终锁在一起（同步是稳定的，不会自己散掉）', `1-R 最大 ${worstSpread.toFixed(3)}`);
}

{
    // 成功序列的 gather：收拢后每只虫每个周期只闪一次（不会在 0/1 边界被拉回去连闪）
    const sim = createSimulation(LEVELS[2]);
    const counts = new Array(sim.flies.length).fill(0);
    for (let t = 0; t < sec(4); t++) {
        sim.step();
        sim.gather(t < sec(1.2) ? 0.06 : 0.02);
        if (t >= sec(1.5)) for (const id of sim.flashed) counts[id]++;
    }
    const worst = Math.max(...counts);
    ok(worst <= 3 && Math.min(...counts) >= 1, '成功序列：gather 后每只虫约每周期闪一次（2.5 秒内 1–3 次，无连闪）', `最多 ${worst} 次`);
}

console.log(failed === 0 ? '\nverify-firefly-signal-sim 全部通过 ✅' : `\n${failed} 个失败 ❌`);
process.exit(failed === 0 ? 0 : 1);
