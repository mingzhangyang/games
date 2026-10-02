import { createGameStorage } from '../../platform/storage/game-storage.js';

export const HOOP_SHOT_STORAGE_SLOTS = Object.freeze({
    BEST: 'best',
    LONGEST_STREAK: 'longestStreak',
    LOCAL_SCORES: 'localScores',
});

export const HOOP_SHOT_STORAGE = createGameStorage('hoop-shot', {
    version: 1,
    legacy: {
        [HOOP_SHOT_STORAGE_SLOTS.BEST]: 'hs_best',
        [HOOP_SHOT_STORAGE_SLOTS.LONGEST_STREAK]: 'hs_longest_streak',
        [HOOP_SHOT_STORAGE_SLOTS.LOCAL_SCORES]: 'hs_local_scores',
    },
});
