/**
 * 出题器（设计 §7.2 / §7.4）——纯函数、确定性：同 seed + 同 profile = 同一道题。
 * ===========================================================================
 * 「先有雾，再挖空」：
 *   1. mulberry32(seed) 生成终盘，先把终盘整个当作题面，全部藏在雾里，只开一宫；
 *   2. 模拟「按技巧梯推进的玩家」（每步取 cap 档闭包里最先落子的格，落子后揭雾），
 *      卡住就在卡住处的雾边缘多开一格视野，直到能走完——此时雾里全是题面数字；
 *   3. 按随机顺序逐格尝试：去掉这个题面数字 / 把这格从开局视野里收回，
 *      只要存在一条带雾可通关路径就保留改动（题面数字不少于 targetGivens）。
 *      带雾路径能走完意味着解唯一：每一步落子都是推理的必然结果；
 *   4. 路径统计不满足 profile.accept 就换下一个种子。
 * 这样挖出来的题「在雾里刚好可解」：开局视野只剩少数题面数字，雾会一直绷着。
 * 先全视野挖空、再布雾的做法实测不行——开一宫什么都推不出，补视野补到九成题面可见，雾形同虚设。
 * 收完视野后开局只剩零星的题面数字、没有可见空格，所以开局几步必然是穿雾；
 * 曾试过把可见数字周围的空格也露出来（不带信息），结果开局近半盘清晰、只能穿雾的状态减半，已放弃。
 *
 * ⚠ 每日题由本文件在运行时生成：改动任何会影响输出的逻辑都必须升 GENERATOR_VERSION，
 *   并更新 tests/verify-sudoku-mist-daily.mjs 的黄金值（否则已发布的每日题会全部变样）。
 */
import { CELLS, chebyshev, formatGrid } from './grid.js';
import { randomSolution } from './brute.js';
import { analyze } from './techniques.js';
import { revealArea, revealAround, knowledgeOf, formatWindow, DEFAULT_REVEAL } from './fog.js';
import { mulberry32, hashString } from '../../../platform/daily.js';

export const GENERATOR_VERSION = 1;

/**
 * cap          出题允许的最高档位（玩家只需掌握到这一档）
 * reveal       揭雾核（fog.js）
 * targetGivens 题面数字下限（挖到这里就停）
 * accept       路径统计门槛：bottlenecks = 可推格 ≤ 2 的状态数；fogOnly = 可推格全在雾中的状态数
 */
export const PROFILES = Object.freeze({
    first: { cap: 2, reveal: 'box', targetGivens: 34, accept: { minBottlenecks: 6, minFogOnly: 2 } },
    through: { cap: 2, reveal: 'cross', targetGivens: 30, accept: { minBottlenecks: 9, minFogOnly: 6 } },
    deep: { cap: 4, reveal: 'cross', targetGivens: 26, accept: { minBottlenecks: 9, minFogOnly: 6, minMaxTier: 3 } },
    daily: { cap: 3, reveal: 'cross', targetGivens: 28, accept: { minBottlenecks: 9, minFogOnly: 5 } },
});

const MAX_ATTEMPTS = 12;

function shuffle(arr, rng) {
    for (let k = arr.length - 1; k > 0; k--) {
        const j = Math.floor(rng() * (k + 1));
        [arr[k], arr[j]] = [arr[j], arr[k]];
    }
    return arr;
}

/**
 * 「按技巧梯推进的玩家」：每步在当前知识下跑 cap 档闭包，choose(options, tierOf) 选一格落子并揭雾。
 * 返回路径统计；卡住时 stuck = 卡住那一刻的可见集。
 */
export function simulatePath({ givens, solution, visible0, cap, reveal = DEFAULT_REVEAL, choose = options => options[0] }) {
    const visible = Uint8Array.from(visible0);
    const placed = new Int8Array(CELLS);
    const stats = { steps: 0, options: 0, bottlenecks: 0, fogOnly: 0, maxTier: 0, tiers: { 1: 0, 2: 0, 3: 0, 4: 0 }, fogPlacements: 0 };
    for (;;) {
        const k = knowledgeOf(givens, visible, placed);
        let unknown = 0;
        for (let i = 0; i < CELLS; i++) if (!k[i]) unknown++;
        if (!unknown) {
            stats.options = stats.steps ? +(stats.options / stats.steps).toFixed(2) : 0;
            return { solved: true, stats, stuck: null };
        }
        const a = analyze(k, { cap });
        const options = a.order.filter(i => !k[i]);
        if (!options.length) return { solved: false, stats, stuck: visible };
        stats.options += options.length;
        if (options.length <= 2) stats.bottlenecks++;
        if (options.every(i => !visible[i])) stats.fogOnly++;
        const cell = choose(options, a.tierOf);
        const tier = a.tierOf[cell];
        stats.steps++;
        stats.tiers[tier]++;
        stats.maxTier = Math.max(stats.maxTier, tier);
        if (!visible[cell]) stats.fogPlacements++;
        placed[cell] = solution[cell];
        revealAround(visible, cell, reveal);
    }
}

/**
 * 只判断「是否存在一条带雾可通关路径」：每轮把闭包推出的格子一次性全落下、一起揭雾。
 * 批量推进是存在性判据，不能单靠知识单调性声称玩家任意顺序都安全：被提前揭开的隐藏题面
 * 会失去原本可落子的揭雾机会。session 为这种题面保留一次主动拨雾权（设计 §7.3），
 * 使存在的逐格路径可在其他顺序下复现；最终统计仍用 simulatePath 逐格验证。
 * 批量走比逐格走少一个数量级的闭包，且不改变生成种子 / 输出。
 */
export function isSolvable({ givens, visible0, cap, reveal = DEFAULT_REVEAL }) {
    const visible = Uint8Array.from(visible0);
    const k = knowledgeOf(givens, visible, new Int8Array(CELLS));
    for (;;) {
        let unknown = 0;
        for (let i = 0; i < CELLS; i++) if (!k[i]) unknown++;
        if (!unknown) return true;
        const a = analyze(k, { cap });
        if (a.broken) return false;
        let progressed = false;
        for (const i of a.order) {
            if (k[i]) continue;
            k[i] = a.values[i];
            progressed = true;
            for (const j of revealArea(i, reveal)) {
                if (visible[j]) continue;
                visible[j] = 1;
                if (givens[j]) k[j] = givens[j];
            }
        }
        if (!progressed) return false;
    }
}

function attempt(seed, profile) {
    const rng = mulberry32(seed);
    const solution = randomSolution(rng);
    const givens = Int8Array.from(solution);
    const visible0 = new Uint8Array(CELLS);
    const b = Math.floor(rng() * 9);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) visible0[(((b / 3) | 0) * 3 + r) * 9 + (b % 3) * 3 + c] = 1;
    const run = () => simulatePath({ givens, solution, visible0, cap: profile.cap, reveal: profile.reveal });
    const ok = () => isSolvable({ givens, visible0, cap: profile.cap, reveal: profile.reveal });

    // ② 只开视野、不动题面，直到能走完（雾里全是题面数字，迟早走得完）
    for (let res = run(); !res.solved; res = run()) {
        const visible = res.stuck;
        const frontier = [];
        for (let i = 0; i < CELLS; i++) {
            if (visible[i]) continue;
            for (let j = 0; j < CELLS; j++) {
                if (visible[j] && chebyshev(i, j) === 1) { frontier.push(i); break; }
            }
        }
        visible0[frontier[Math.floor(rng() * frontier.length)]] = 1;
    }

    // ③ 挖题面、收视野
    let count = CELLS;
    for (const i of shuffle([...Array(CELLS).keys()], rng)) {
        if (count > profile.targetGivens) {
            const d = givens[i];
            givens[i] = 0;
            if (ok()) count--;
            else givens[i] = d;
        }
        if (visible0[i]) {
            visible0[i] = 0;
            if (!ok()) visible0[i] = 1;
        }
    }
    const final = run();
    return final.solved ? { givens, solution, visible0, stats: final.stats } : null;
}

function accepted(res, accept) {
    const s = res.stats;
    return s.bottlenecks >= accept.minBottlenecks
        && s.fogOnly >= accept.minFogOnly
        && s.maxTier >= (accept.minMaxTier || 0);
}

/** 由种子出一道题；会按确定的种子序列重试，直到满足 profile.accept（最多 MAX_ATTEMPTS 次） */
export function generate(seed, profileName) {
    const profile = PROFILES[profileName];
    if (!profile) throw new Error(`unknown profile ${profileName}`);
    let fallback = null;
    for (let n = 0; n < MAX_ATTEMPTS; n++) {
        const s = (seed + Math.imul(n, 0x9e3779b1)) >>> 0;
        const res = attempt(s, profile);
        if (!res) continue;
        const out = {
            profile: profileName,
            seed: s,
            cap: profile.cap,
            reveal: profile.reveal,
            givens: formatGrid(res.givens),
            solution: formatGrid(res.solution),
            window: formatWindow(res.visible0),
            stats: res.stats,
        };
        if (accepted(res, profile.accept)) return { ...out, attempts: n + 1, relaxed: false };
        fallback ||= out;
    }
    // 门槛太严时不让每日题出不来：退回第一道可解的题，校验器统计 relaxed 的比例
    if (fallback) return { ...fallback, attempts: MAX_ATTEMPTS, relaxed: true };
    throw new Error(`generator failed for seed ${seed}`);
}

/** 每日题的种子：只由日期（daily.js todayKey() 给出的 UTC+8 YYYYMMDD）和生成器版本决定 */
export function dailySeed(dateKey) {
    return hashString(`sudoku-mist:v${GENERATOR_VERSION}:${dateKey}`);
}

export function generateDaily(dateKey) {
    if (!/^\d{8}$/.test(String(dateKey))) throw new Error(`daily key must be YYYYMMDD, got ${dateKey}`);
    return { ...generate(dailySeed(dateKey), 'daily'), id: `daily-${dateKey}` };
}
