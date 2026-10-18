import { createGameStorage } from '../../platform/storage/game-storage.js';
import { LEVELS, getLevel } from './model/levels.js';
import { createState, applyAction, stateKey } from './model/rules.js';
export const MAGNETIC_GARDEN_STORAGE = createGameStorage('magnetic-garden', { version: 1 });
export const MAGNETIC_GARDEN_STORAGE_SLOTS = Object.freeze({ PROGRESS: 'progress' });
const LIMIT = 4000;
export function replaySaved(raw) {
    const level = getLevel(raw?.levelId);
    if (!level || raw.levelVersion !== level.version || !Array.isArray(raw.actions) || raw.actions.length > LIMIT) return null;
    let state = createState(level); const history = [];
    for (const action of raw.actions) {
        const result = applyAction(level, state, action, { frames: false });
        if (!result.valid) return null;
        history.push(state); state = result.state;
    }
    if (raw.state && stateKey(state) !== stateKey(raw.state)) return null;
    return { level, state, history, actions: raw.actions };
}
export function loadProgress() {
    const stored = MAGNETIC_GARDEN_STORAGE.get('progress', {});
    const raw = stored?.schema === 1 ? stored : {}; const best = {};
    for (const level of LEVELS) {
        const record = raw?.best?.[level.id];
        if (!record) continue;
        try {
            const replay = replaySaved({ ...record, levelId: level.id, levelVersion: record.version });
            if (replay?.state.won && replay.state.moves === record.moves) best[level.id] = record;
        } catch { /* Isolate malformed records so the rest of the garden still loads. */ }
    }
    let current = null;
    try { current = replaySaved(raw?.current); if (current?.state.won) current = null; } catch { /* A malformed old snapshot is not executable progress. */ }
    return { best, current, recovered: !!raw?.current && !current };
}
export function writeProgress(best, current) {
    return MAGNETIC_GARDEN_STORAGE.trySet('progress', { schema: 1, best, current });
}
