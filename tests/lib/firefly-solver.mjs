// 萤火信号的测试用玩家模型（只给校验器 / 冒烟测试用，不进产物）。
//
//   solve(level, seed)       —— 「会观察的玩家」：每隔一小段时间，在副本上试点每一只虫、
//                               往后推几秒看同步度，只有明显变好才真的点。
//   randomPlay(level, seed, rngSeed, opts) —— 「随机点击的玩家」：随机时刻点随机的虫。
//
// 两者都只通过 sim.intervene(id) 输入，产出 (tick, id) 序列，可在浏览器里逐 tick 回放。
import { createSimulation, DT } from '../../js/firefly-signal/simulation.js';
import { mulberry32 } from '../../js/daily.js';

const sec = s => Math.round(s / DT);

function lookahead(sim, ticks) {
    // 取后半段平均同步度：抹掉干预瞬间的尖峰，看的是「稳住了没有」
    const c = sim.clone();
    let acc = 0, n = 0;
    for (let t = 0; t < ticks; t++) {
        c.step();
        if (c.won) return 2;
        if (t >= ticks / 2) { acc += c.harmony; n++; }
    }
    return acc / n;
}

export function solve(level, seed = level.seed, opts = {}) {
    const {
        observe = 3,          // 先看几秒再动手（与真人一致：先观察）
        every = 0.15,         // 决策间隔（秒）
        horizon = 3,          // 往后看几秒
        margin = 0.06,        // 必须比「不点」好这么多才点
        tail = 20,            // 用完次数后最多再等几秒
        limit = 90,           // 总时长上限（秒）
        candidates = null,    // 只允许点这些 id（null = 全部）；校验「桥接虫才是关键」用
    } = opts;
    const sim = createSimulation(level, { seed });
    const inputs = [];
    while (sim.tick < sec(observe)) sim.step();
    let lastUse = sim.tick;
    while (!sim.won && sim.tick < sec(limit)) {
        if (sim.remaining() > 0 && sim.tick % Math.max(1, sec(every)) === 0) {
            const base = lookahead(sim, sec(horizon));
            let best = -1, bestScore = base + margin;
            for (const f of sim.flies) {
                if (candidates && !candidates.includes(f.id)) continue;
                const c = sim.clone();
                c.intervene(f.id);
                const s = lookahead(c, sec(horizon));
                if (s > bestScore) { bestScore = s; best = f.id; }
            }
            if (best >= 0) {
                inputs.push({ tick: sim.tick, id: best });
                sim.intervene(best);
                lastUse = sim.tick;
            }
        }
        if (sim.remaining() === 0 && sim.tick - lastUse > sec(tail)) break;
        sim.step();
    }
    return { won: sim.won, wonTick: sim.wonTick, inputs, used: inputs.length, harmony: sim.harmony, sim };
}

export function randomPlay(level, seed = level.seed, rngSeed = 1, opts = {}) {
    const { meanGap = 1.2, observe = 0.5, tail = 20, limit = 90 } = opts;
    const rng = mulberry32(rngSeed);
    const sim = createSimulation(level, { seed });
    const inputs = [];
    let next = sec(observe + rng() * meanGap * 2);
    let lastUse = 0;
    while (!sim.won && sim.tick < sec(limit)) {
        if (sim.remaining() > 0 && sim.tick >= next) {
            const id = Math.floor(rng() * sim.flies.length);
            inputs.push({ tick: sim.tick, id });
            sim.intervene(id);
            lastUse = sim.tick;
            next = sim.tick + Math.max(1, sec(rng() * meanGap * 2));
        }
        if (sim.remaining() === 0 && sim.tick - lastUse > sec(tail)) break;
        sim.step();
    }
    return { won: sim.won, wonTick: sim.wonTick, inputs, used: inputs.length };
}

/** 不干预，最多等 seconds 秒：返回是否赢、过程中的最高同步度 */
export function idle(level, seed = level.seed, seconds = 120) {
    const sim = createSimulation(level, { seed });
    let peak = 0;
    while (sim.tick < sec(seconds) && !sim.won) {
        sim.step();
        if (sim.harmony > peak) peak = sim.harmony;
    }
    return { won: sim.won, peak, final: sim.harmony };
}
