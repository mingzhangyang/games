/** The game-local names for the shared UTC+8 daily clock. */
import { todayKey, todayKeyDisplay } from '../../../platform/daily.js';
import { storageGet, storageSet } from '../../../platform/safe-storage.js';
import { STORAGE_KEYS } from '../config.js';

export const getDailyDateKey = todayKey;
export const getDailyDateString = todayKeyDisplay;
export const getDailyLeaderboardKey = (dateKey = todayKey()) => `sword-flight-d${dateKey}`;

export const DAILY_MODIFIERS = Object.freeze({
    speedMultiplier: 1.3,
    ringScoreMultiplier: 2,
});

/** Create the deterministic gameplay random stream used by today's course. */
export function createDailyRandom(seed = todayKey()) {
    let state = 2166136261;
    for (const character of String(seed)) {
        state ^= character.charCodeAt(0);
        state = Math.imul(state, 16777619);
    }

    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

/** Local completion is independent of network submission, including 0 points. */
export function saveDailyResult(score) {
    const key = `${STORAGE_KEYS.DAILY_PREFIX}${todayKey()}`;
    const previous = Number(storageGet(key));
    const best = Number.isFinite(previous) ? Math.max(previous, score) : score;
    storageSet(key, best.toString());
}
