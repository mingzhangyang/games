// Depth measures for Magnetic Garden boards, computed with the production rules only.
// They model a player who sees every exact preview and can undo freely, which is how the
// game is played: depth is what such a player still has to work out.
import { applyAction, createState, legalActions, stateKey } from '../../src/games/magnetic-garden/model/rules.js';
import { mulberry32 } from '../../src/platform/daily.js';

const next = (level, state, action) => applyAction(level, state, action, { frames: false }).state;

/** How promising a position looks: planted seeds first, then free seeds near an empty pot. */
export function progress(level, state) {
    const used = new Set(state.seeds.filter(seed => seed.captured).map(seed => seed.cell));
    let value = used.size * 100;
    for (const seed of state.seeds) {
        if (seed.captured) continue;
        const x = seed.cell % level.width, y = Math.floor(seed.cell / level.width);
        let nearest = 99;
        for (const pot of level.pots) {
            if (!used.has(pot)) nearest = Math.min(nearest, Math.abs(pot % level.width - x) + Math.abs(Math.floor(pot / level.width) - y));
        }
        value -= nearest;
    }
    return value;
}

/** Share of runs a preview-scanning player wins: it takes the best-looking new position, 15% at random. */
export function previewPlayerWinRate(level, { trials = 60, steps = 160, seed = 5, randomness = 0.15 } = {}) {
    const random = mulberry32(seed);
    let wins = 0;
    for (let trial = 0; trial < trials; trial++) {
        let state = createState(level);
        const seen = new Set([stateKey(state)]);
        for (let step = 0; step < steps && !state.won; step++) {
            const options = legalActions(level, state).map(action => next(level, state, action));
            if (random() < randomness) state = options[Math.floor(random() * options.length)];
            else {
                let best = -Infinity, picks = [];
                for (const option of options) {
                    const score = progress(level, option) - (seen.has(stateKey(option)) ? 1000 : 0);
                    if (score > best) { best = score; picks = [option]; } else if (score === best) picks.push(option);
                }
                state = picks[Math.floor(random() * picks.length)];
            }
            seen.add(stateKey(state));
        }
        if (state.won) wins++;
    }
    return wins / trials;
}

/** Positions a best-first explorer (most promising first, then fewest moves) opens before a win. */
export function explorerEffort(level, cap = 200000) {
    const heap = [];
    const before = (a, b) => a.priority < b.priority || (a.priority === b.priority && a.order < b.order);
    const push = item => {
        heap.push(item);
        for (let i = heap.length - 1; i;) { const parent = (i - 1) >> 1; if (!before(heap[i], heap[parent])) break; [heap[i], heap[parent]] = [heap[parent], heap[i]]; i = parent; }
    };
    const pop = () => {
        const top = heap[0], last = heap.pop();
        if (heap.length) {
            heap[0] = last;
            for (let i = 0; ;) {
                const left = 2 * i + 1, right = left + 1; let smallest = i;
                if (left < heap.length && before(heap[left], heap[smallest])) smallest = left;
                if (right < heap.length && before(heap[right], heap[smallest])) smallest = right;
                if (smallest === i) break;
                [heap[i], heap[smallest]] = [heap[smallest], heap[i]]; i = smallest;
            }
        }
        return top;
    };
    let order = 0;
    const start = createState(level);
    const seen = new Set([stateKey(start)]);
    push({ priority: -progress(level, start) * 1000, order: order++, state: start, depth: 0 });
    let opened = 0;
    while (heap.length && opened < cap) {
        const { state, depth } = pop();
        opened++;
        if (state.won) return opened;
        for (const action of legalActions(level, state)) {
            const after = next(level, state, action);
            const key = stateKey(after);
            if (seen.has(key)) continue;
            seen.add(key);
            push({ priority: -progress(level, after) * 1000 + depth + 1, order: order++, state: after, depth: depth + 1 });
        }
    }
    return opened;
}

/** The whole reachable graph: its size, the share of positions that can no longer finish, and fatal first moves. */
export function reachability(level, cap = 200000) {
    const start = createState(level);
    const nodes = new Map([[stateKey(start), { state: start, edges: [] }]]);
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
        const state = queue[i];
        if (state.won) continue;
        const node = nodes.get(stateKey(state));
        for (const action of legalActions(level, state)) {
            const after = next(level, state, action);
            const key = stateKey(after);
            node.edges.push(key);
            if (!nodes.has(key)) {
                if (nodes.size >= cap) return { reach: Infinity, dead: NaN, fatalOpeners: NaN };
                nodes.set(key, { state: after, edges: [] });
                queue.push(after);
            }
        }
    }
    const reverse = new Map();
    for (const [key, node] of nodes) for (const edge of node.edges) (reverse.get(edge) || reverse.set(edge, []).get(edge)).push(key);
    const alive = new Set([...nodes].filter(([, node]) => node.state.won).map(([key]) => key));
    const frontier = [...alive];
    for (let i = 0; i < frontier.length; i++) {
        for (const parent of reverse.get(frontier[i]) || []) if (!alive.has(parent)) { alive.add(parent); frontier.push(parent); }
    }
    const openers = nodes.get(stateKey(start)).edges;
    return {
        reach: nodes.size,
        dead: 1 - alive.size / nodes.size,
        fatalOpeners: openers.filter(key => !alive.has(key)).length / openers.length,
    };
}
