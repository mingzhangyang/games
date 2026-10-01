/** The game-local names for the shared UTC+8 daily clock. */
import { todayKey, todayKeyDisplay } from '../../../platform/daily.js';
import { storageGet, storageSet } from '../../../platform/safe-storage.js';
import { STORAGE_KEYS } from '../config.js';

export const getDailyDateKey = todayKey;
export const getDailyDateString = todayKeyDisplay;
export const getDailyLeaderboardKey = (dateKey = todayKey()) => `sword-flight-d${dateKey}`;

/** Local completion is independent of network submission, including 0 points. */
export function saveDailyResult(score) {
    const key = `${STORAGE_KEYS.DAILY_PREFIX}${todayKey()}`;
    const previous = Number(storageGet(key));
    const best = Number.isFinite(previous) ? Math.max(previous, score) : score;
    storageSet(key, best.toString());
}
