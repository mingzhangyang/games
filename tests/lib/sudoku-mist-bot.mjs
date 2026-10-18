// 雾隐九宫的测试用玩家模型（只给校验器用，不进产物）。全部通过真实的 session.place / hint 输入，
// 产出的 inputs 可原样交给 replay() 回放。
//
//   deducer(level, rng)  —— 「会推理的玩家」：每步在当前知识下跑关卡 cap 档闭包，随机选一个可推格落子。
//                           找不到可推格就是卡死（stuck: true）——永不卡死的判据。
//   greedy(level)        —— 「贪分的玩家」：在可推格里挑本步得分最高的（档位高、在雾里），近似理想玩家。
//   guesser(level, rng)  —— 「瞎猜的玩家」：随便挑一个未知格，按随机顺序试数字直到填对。
import { createSession, prepareLevel } from '../../src/games/sudoku-mist/model/session.js';
import { analyze, MAX_TIER } from '../../src/games/sudoku-mist/model/techniques.js';
import { placementPoints } from '../../src/games/sudoku-mist/model/scoring.js';
import { CELLS } from '../../src/games/sudoku-mist/model/grid.js';

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

function options(session, cap) {
    const k = session.knowledge();
    const a = analyze(k, { cap });
    return { a, cells: a.order.filter(i => !k[i]) };
}

export function deducer(level, rng, { cap = prepareLevel(level).cap } = {}) {
    const s = createSession(prepareLevel(level));
    let fogOnly = 0, steps = 0;
    while (!s.done) {
        const { a, cells } = options(s, cap);
        if (!cells.length) {
            const ready = Array.from({ length: CELLS }, (_, i) => i).filter(i => s.isCharged(i));
            if (!ready.length) return { stuck: true, steps, session: s };
            s.activate(pick(ready, rng));
            steps++;
            continue;
        }
        if (cells.every(i => !s.isVisible(i))) fogOnly++;
        const i = pick(cells, rng);
        s.place(i, a.values[i]);
        steps++;
    }
    return { stuck: false, steps, fogOnly, session: s, summary: s.summary() };
}

export function greedy(level) {
    const s = createSession(prepareLevel(level));
    while (!s.done) {
        const { a, cells } = options(s, MAX_TIER);
        if (!cells.length) {
            const ready = Array.from({ length: CELLS }, (_, i) => i).find(i => s.isCharged(i));
            if (ready === undefined) return { stuck: true, session: s };
            s.activate(ready);
            continue;
        }
        let best = cells[0], bestPts = -1;
        for (const i of cells) {
            const pts = placementPoints({ tier: a.tierOf[i], intoFog: !s.isVisible(i), streak: s.streak + 1 });
            if (pts > bestPts) { best = i; bestPts = pts; }
        }
        s.place(best, a.values[best]);
    }
    return { stuck: false, session: s, summary: s.summary() };
}

export function guesser(level, rng) {
    const s = createSession(prepareLevel(level));
    while (!s.done) {
        const unknown = [];
        for (let i = 0; i < CELLS; i++) if (!s.isKnown(i)) unknown.push(i);
        const i = pick(unknown, rng);
        const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
        for (let k = digits.length - 1; k > 0; k--) {
            const j = Math.floor(rng() * (k + 1));
            [digits[k], digits[j]] = [digits[j], digits[k]];
        }
        for (const d of digits) if (s.place(i, d).correct) break;
    }
    return { session: s, summary: s.summary() };
}
