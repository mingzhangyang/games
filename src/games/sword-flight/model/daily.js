/** The game-local names for the shared UTC+8 daily clock. */
import { hashStringFNV, mulberry32, todayKey, todayKeyDisplay } from '../../../platform/daily.js';
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
    return mulberry32(hashStringFNV(String(seed)));
}

/** Local completion is independent of network submission, including 0 points. */
export function saveDailyResult(score, dateKey = todayKey()) {
    const key = `${STORAGE_KEYS.DAILY_PREFIX}${dateKey}`;
    const previous = Number(storageGet(key));
    const best = Number.isFinite(previous) ? Math.max(previous, score) : score;
    storageSet(key, best.toString());
}
