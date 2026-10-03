import { createGameStorage } from '../../platform/storage/game-storage.js';

export const MINESWEEPER_STORAGE_SLOTS = Object.freeze({
    DIFFICULTY: 'difficulty',
    BEST_EASY: 'best:easy',
    BEST_MEDIUM: 'best:medium',
    BEST_HARD: 'best:hard',
    LOCAL_EASY: 'localScores:easy',
    LOCAL_MEDIUM: 'localScores:medium',
    LOCAL_HARD: 'localScores:hard',
});

const BEST_SLOTS = Object.freeze({
    easy: MINESWEEPER_STORAGE_SLOTS.BEST_EASY,
    medium: MINESWEEPER_STORAGE_SLOTS.BEST_MEDIUM,
    hard: MINESWEEPER_STORAGE_SLOTS.BEST_HARD,
});
const LOCAL_SLOTS = Object.freeze({
    easy: MINESWEEPER_STORAGE_SLOTS.LOCAL_EASY,
    medium: MINESWEEPER_STORAGE_SLOTS.LOCAL_MEDIUM,
    hard: MINESWEEPER_STORAGE_SLOTS.LOCAL_HARD,
});
const normalizeDifficulty = value => ['easy', 'medium', 'hard'].includes(value) ? value : 'easy';

export const MINESWEEPER_STORAGE = createGameStorage('minesweeper', {
    version: 1,
    legacy: {
        [MINESWEEPER_STORAGE_SLOTS.DIFFICULTY]: 'ms_diff',
        [MINESWEEPER_STORAGE_SLOTS.BEST_EASY]: 'ms_best_easy',
        [MINESWEEPER_STORAGE_SLOTS.BEST_MEDIUM]: 'ms_best_medium',
        [MINESWEEPER_STORAGE_SLOTS.BEST_HARD]: 'ms_best_hard',
        [MINESWEEPER_STORAGE_SLOTS.LOCAL_EASY]: 'ms_local_easy',
        [MINESWEEPER_STORAGE_SLOTS.LOCAL_MEDIUM]: 'ms_local_medium',
        [MINESWEEPER_STORAGE_SLOTS.LOCAL_HARD]: 'ms_local_hard',
    },
});

export function loadMinesweeperDifficulty() {
    return normalizeDifficulty(
        MINESWEEPER_STORAGE.get(MINESWEEPER_STORAGE_SLOTS.DIFFICULTY, 'easy'),
    );
}

export function saveMinesweeperDifficulty(difficulty) {
    return MINESWEEPER_STORAGE.trySet(
        MINESWEEPER_STORAGE_SLOTS.DIFFICULTY,
        normalizeDifficulty(difficulty),
    );
}

export function loadMinesweeperBestTime(difficulty) {
    const slot = BEST_SLOTS[normalizeDifficulty(difficulty)];
    const value = Number(MINESWEEPER_STORAGE.get(slot, 0));
    return Number.isFinite(value) && value > 0 ? value : 0;
}

export function saveMinesweeperBestTime(difficulty, seconds) {
    const slot = BEST_SLOTS[normalizeDifficulty(difficulty)];
    const value = Number(seconds);
    return MINESWEEPER_STORAGE.trySet(
        slot,
        Number.isFinite(value) && value > 0 ? value : 0,
    );
}

export function loadMinesweeperLocalScores(difficulty) {
    const slot = LOCAL_SLOTS[normalizeDifficulty(difficulty)];
    const value = MINESWEEPER_STORAGE.get(slot, []);
    return Array.isArray(value) ? value.slice() : [];
}

export function saveMinesweeperLocalScores(difficulty, scores) {
    const slot = LOCAL_SLOTS[normalizeDifficulty(difficulty)];
    return MINESWEEPER_STORAGE.trySet(
        slot,
        Array.isArray(scores) ? scores.slice() : [],
    );
}
