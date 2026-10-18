import { applyAction, createState, legalActions, stateKey } from './rules.js';

/** Offline breadth-first proof. A budget exit is unknown, never proof of impossibility. */
export function solveLevel(level, { maxStates = 100000, maxDepth = Infinity, start = createState(level) } = {}) {
    if (start.won) return { status: 'solved', solution: [], depth: 0, visited: 1 };
    const nodes = [{ state: start, parent: -1, action: null, depth: 0 }];
    const seen = new Set([stateKey(start)]);
    let depthCutoff = false;
    for (let head = 0; head < nodes.length; head++) {
        const node = nodes[head];
        if (node.depth >= maxDepth) {
            depthCutoff = true;
            continue;
        }
        for (const action of legalActions(level, node.state)) {
            const state = applyAction(level, node.state, action, { frames: false }).state;
            const key = stateKey(state);
            if (seen.has(key)) continue;
            if (seen.size >= maxStates) return { status: 'unknown', solution: null, depth: null, visited: seen.size, reason: 'states' };
            seen.add(key);
            const index = nodes.length;
            nodes.push({ state, parent: head, action, depth: node.depth + 1 });
            if (state.won) {
                const solution = [];
                let cursor = index;
                while (nodes[cursor].parent !== -1) {
                    solution.push(nodes[cursor].action);
                    cursor = nodes[cursor].parent;
                }
                solution.reverse();
                return { status: 'solved', solution, depth: solution.length, visited: seen.size };
            }
        }
    }
    return { status: depthCutoff ? 'unknown' : 'unsolvable', solution: null, depth: null, visited: seen.size, ...(depthCutoff ? { reason: 'depth' } : {}) };
}
