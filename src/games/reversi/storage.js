import { createGameStorage } from '../../platform/storage/game-storage.js';

export const REVERSI_STORAGE_SLOTS = Object.freeze({
    MODE: 'mode',
    DIFFICULTY: 'difficulty',
    BEST_STREAK: 'bestStreak',
    STREAK: 'streak',
    LOCAL_SCORES: 'localScores',
});

export const REVERSI_STORAGE = createGameStorage('reversi', {
    version: 1,
    legacy: {
        [REVERSI_STORAGE_SLOTS.MODE]: 'rv_mode',
        [REVERSI_STORAGE_SLOTS.DIFFICULTY]: 'rv_diff',
        [REVERSI_STORAGE_SLOTS.BEST_STREAK]: 'rv_best_streak',
        [REVERSI_STORAGE_SLOTS.STREAK]: 'rv_streak',
        [REVERSI_STORAGE_SLOTS.LOCAL_SCORES]: 'rv_local_scores',
    },
});

const nonNegativeInteger = value => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
};

export function loadReversiMode() {
    return REVERSI_STORAGE.get(REVERSI_STORAGE_SLOTS.MODE, 'ai') === '2p' ? '2p' : 'ai';
}

export function saveReversiMode(mode) {
    return REVERSI_STORAGE.trySet(
        REVERSI_STORAGE_SLOTS.MODE,
        mode === '2p' ? '2p' : 'ai',
    );
}

export function loadReversiDifficulty() {
    const value = REVERSI_STORAGE.get(REVERSI_STORAGE_SLOTS.DIFFICULTY, 'medium');
    return ['easy', 'medium', 'hard'].includes(value) ? value : 'medium';
}

export function saveReversiDifficulty(difficulty) {
    const value = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium';
    return REVERSI_STORAGE.trySet(REVERSI_STORAGE_SLOTS.DIFFICULTY, value);
}

export function loadReversiBestStreak() {
    return nonNegativeInteger(REVERSI_STORAGE.get(REVERSI_STORAGE_SLOTS.BEST_STREAK, 0));
}

export function saveReversiBestStreak(streak) {
    return REVERSI_STORAGE.trySet(
        REVERSI_STORAGE_SLOTS.BEST_STREAK,
        nonNegativeInteger(streak),
    );
}

export function loadReversiStreak() {
    return nonNegativeInteger(REVERSI_STORAGE.get(REVERSI_STORAGE_SLOTS.STREAK, 0));
}

export function loadReversiLocalScores() {
    const value = REVERSI_STORAGE.get(REVERSI_STORAGE_SLOTS.LOCAL_SCORES, []);
    return Array.isArray(value) ? value.slice() : [];
}

export function saveReversiLocalScores(scores) {
    return REVERSI_STORAGE.trySet(
        REVERSI_STORAGE_SLOTS.LOCAL_SCORES,
        Array.isArray(scores) ? scores.slice() : [],
    );
}
