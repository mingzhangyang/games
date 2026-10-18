/**
 * 一局的规则状态机（设计 §4 / §5 / §6.3 / §9.3）——无 DOM、无时间、无随机。
 * ===========================================================================
 * 确定性契约：同一关卡 + 同一输入序列（inputs）= 同一结果；replay() 据此恢复每日局进度。
 *
 * 信息隔离：终盘与雾中题面只留在本闭包里。view() 交给渲染层的是知识视图，
 * 雾中格只有 { state: 'fog' }，不带任何数字。
 */
import { CELLS, parseGrid } from './grid.js';
import { countSolutions, solve } from './brute.js';
import { analyze, MAX_TIER } from './techniques.js';
import { parseWindow, revealAround, knowledgeOf, DEFAULT_REVEAL } from './fog.js';
import { placementPoints, WRONG_PENALTY } from './scoring.js';

const preparedLevels = new WeakSet();

/** 关卡 → 求出唯一解；非唯一解直接抛错（关卡数据有误）。已准备好的关卡原样返回 */
export function prepareLevel(level) {
    if (preparedLevels.has(level)) return level;
    // Validate before typed-array conversion can truncate fractions or wrap out-of-range digits.
    // Supplied solution/visible0 fields are not proof that a level has already been validated.
    const rawGivens = typeof level.givens === 'string' ? parseGrid(level.givens) : level.givens;
    if (countSolutions(rawGivens) !== 1) throw new Error(`level ${level.id || '?'} has no unique solution`);
    const givens = Int8Array.from(rawGivens);
    const window = level.visible0 ?? level.window;
    const visible0 = typeof window === 'string' ? parseWindow(window) : Uint8Array.from(window);
    const prepared = {
        id: level.id || null,
        cap: level.cap ?? MAX_TIER,
        givens,
        visible0,
        solution: solve(givens),
        reveal: level.reveal || DEFAULT_REVEAL,
    };
    preparedLevels.add(prepared);
    return prepared;
}

export function createSession(level) {
    const lv = prepareLevel(level);
    const { givens, solution, reveal } = lv;
    const visible = Uint8Array.from(lv.visible0);
    const placed = new Int8Array(CELLS);
    const hinted = new Uint8Array(CELLS);
    // A fog-hidden given that is revealed before the player places it retains one manual reveal.
    // This is necessary for order-independent solvability: it must not silently lose its turn.
    const charged = new Uint8Array(CELLS);
    const inputs = [];
    const log = [];
    let score = 0, streak = 0, maxStreak = 0, mistakes = 0, hintsUsed = 0;
    let cache = null;

    const knowledge = () => knowledgeOf(givens, visible, placed);
    const analysis = () => (cache ||= analyze(knowledge(), { cap: MAX_TIER }));
    const isKnown = i => !!placed[i] || (!!visible[i] && !!givens[i]);
    const isDone = () => {
        for (let i = 0; i < CELLS; i++) if (!isKnown(i)) return false;
        return true;
    };

    function cellView(i) {
        if (placed[i]) return { state: 'placed', digit: placed[i] };
        if (!visible[i]) return { state: 'fog' };
        if (givens[i]) return charged[i]
            ? { state: 'given', digit: givens[i], revealReady: true }
            : { state: 'given', digit: givens[i] };
        return { state: 'open' };
    }

    /** Preserve each newly exposed hidden clue's optional, single-use fog-reveal action. */
    function revealFrom(i) {
        const opened = revealAround(visible, i, reveal);
        for (const j of opened) {
            if (givens[j] && !placed[j] && !lv.visible0[j]) charged[j] = 1;
        }
        cache = null;
        return opened;
    }

    /** A revealed clue can release the fog that it could have cleared if placed while hidden. */
    function activate(i) {
        if (!Number.isInteger(i) || i < 0 || i >= CELLS || !charged[i]) {
            return { ok: false, reason: 'unavailable' };
        }
        charged[i] = 0;
        inputs.push({ type: 'activate', cell: i });
        streak = 0;
        const revealed = revealFrom(i);
        return { ok: true, cell: i, revealed, score, done: isDone() };
    }

    function place(i, d) {
        if (!Number.isInteger(i) || i < 0 || i >= CELLS || !Number.isInteger(d) || d < 1 || d > 9) {
            return { ok: false, reason: 'invalid' };
        }
        if (isKnown(i)) return { ok: false, reason: 'known' };
        inputs.push({ type: 'place', cell: i, digit: d });
        const intoFog = !visible[i];
        if (solution[i] !== d) {
            const before = score;
            score = Math.max(0, score - WRONG_PENALTY);
            streak = 0;
            mistakes++;
            const entry = { cell: i, digit: d, correct: false, intoFog, penalty: before - score };
            log.push(entry);
            return { ok: true, ...entry, score };
        }
        const a = analysis();
        const tier = a.tierOf[i];
        const wasHinted = !!hinted[i];
        const deduced = tier > 0 && !wasHinted;
        streak = deduced ? streak + 1 : 0;
        maxStreak = Math.max(maxStreak, streak);
        const points = placementPoints({ tier, intoFog, streak, hinted: wasHinted });
        score += points;
        placed[i] = d;
        const revealed = revealFrom(i);
        const entry = {
            cell: i, digit: d, correct: true, intoFog, tier,
            via: a.viaOf[i], key: a.keyOf[i], luck: tier === 0, hinted: wasHinted,
            points, streak,
        };
        log.push(entry);
        return { ok: true, ...entry, revealed, score, done: isDone() };
    }

    /** 点灯：照亮当前最容易的一处推理（档位最低、闭包里最先落子的那一格） */
    function hint() {
        if (isDone()) return null;
        const a = analysis();
        const cell = a.order.find(i => !isKnown(i));
        if (cell === undefined) {
            const ready = charged.findIndex(Boolean);
            if (ready < 0) return null;
            inputs.push({ type: 'hint' });
            hintsUsed++;
            return { action: 'activate', cell: ready };
        }
        inputs.push({ type: 'hint' });
        if (!hinted[cell]) { hinted[cell] = 1; hintsUsed++; }
        return {
            cell, digit: a.values[cell], tier: a.tierOf[cell],
            via: a.viaOf[cell], key: a.keyOf[cell], unit: a.unitOf[cell], intoFog: !visible[cell],
        };
    }

    function summary() {
        const byTier = { 1: 0, 2: 0, 3: 0, 4: 0 };
        let luck = 0, fog = 0, hintPlaced = 0;
        for (const e of log) {
            if (!e.correct) continue;
            if (e.intoFog) fog++;
            if (e.hinted) hintPlaced++;
            else if (e.luck) luck++;
            else byTier[e.tier]++;
        }
        return { score, done: isDone(), placements: log.filter(e => e.correct).length, byTier, luck, fog, hintPlaced, mistakes, hintsUsed, maxStreak };
    }

    return {
        get score() { return score; },
        get streak() { return streak; },
        get done() { return isDone(); },
        get inputs() { return inputs.slice(); },
        get log() { return log.slice(); },
        view: () => Array.from({ length: CELLS }, (_, i) => cellView(i)),
        cell: cellView,
        isKnown,
        isCharged: i => !!charged[i],
        isVisible: i => !!visible[i],
        knowledge,
        analysis,
        place,
        activate,
        hint,
        summary,
    };
}

/** 按输入序列重放一局（每日局续玩 / 确定性校验） */
export function replay(level, inputs) {
    const s = createSession(level);
    for (const a of inputs) {
        if (a.type === 'place') s.place(a.cell, a.digit);
        else if (a.type === 'activate') s.activate(a.cell);
        else if (a.type === 'hint') s.hint();
    }
    return s;
}
