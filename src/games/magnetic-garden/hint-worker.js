import { HINT_SEARCH, solveLevel } from './model/solver.js';
// A capped search runs away from the main thread. Budget exhaustion is unknown.
globalThis.onmessage = ({ data }) => {
    const result = solveLevel(data.level, { start: data.state, ...HINT_SEARCH });
    globalThis.postMessage(result);
};
