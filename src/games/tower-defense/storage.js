import { createGameStorage } from '../../platform/storage/game-storage.js';

export const TOWER_DEFENSE_LEVEL_IDS = Object.freeze([
    'outpost',
    'vanguard',
    'citadel',
    'skyfall',
    'juggernaut',
    'singularity',
]);

export const TOWER_DEFENSE_STORAGE_SLOTS = Object.freeze({
    GLOBAL_BEST: 'globalBest',
    LOCAL_SCORES: 'localScores',
});

const clearSlot = levelId => `clear:${levelId}`;
const bestSlot = levelId => `best:${levelId}`;

const legacy = {
    [TOWER_DEFENSE_STORAGE_SLOTS.GLOBAL_BEST]: 'td_best',
    [TOWER_DEFENSE_STORAGE_SLOTS.LOCAL_SCORES]: 'td_local_scores',
};
for (const levelId of TOWER_DEFENSE_LEVEL_IDS) {
    legacy[clearSlot(levelId)] = `td_clear_${levelId}`;
    legacy[bestSlot(levelId)] = `td_best_${levelId}`;
}

export const TOWER_DEFENSE_STORAGE = createGameStorage('tower-defense', {
    version: 1,
    legacy: legacy,
});

const nonNegativeScore = value => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
};

export function loadTowerDefenseClear(levelId) {
    return Boolean(TOWER_DEFENSE_STORAGE.get(clearSlot(levelId), false));
}

export function saveTowerDefenseClear(levelId) {
    return TOWER_DEFENSE_STORAGE.trySet(clearSlot(levelId), true);
}

export function loadTowerDefenseBest(levelId) {
    return nonNegativeScore(TOWER_DEFENSE_STORAGE.get(bestSlot(levelId), 0));
}

export function saveTowerDefenseBest(levelId, score) {
    return TOWER_DEFENSE_STORAGE.trySet(bestSlot(levelId), nonNegativeScore(score));
}

export function loadTowerDefenseGlobalBest() {
    return nonNegativeScore(
        TOWER_DEFENSE_STORAGE.get(TOWER_DEFENSE_STORAGE_SLOTS.GLOBAL_BEST, 0),
    );
}

export function saveTowerDefenseGlobalBest(score) {
    return TOWER_DEFENSE_STORAGE.trySet(
        TOWER_DEFENSE_STORAGE_SLOTS.GLOBAL_BEST,
        nonNegativeScore(score),
    );
}

export function loadTowerDefenseLocalScores() {
    const value = TOWER_DEFENSE_STORAGE.get(TOWER_DEFENSE_STORAGE_SLOTS.LOCAL_SCORES, []);
    return Array.isArray(value) ? value.slice() : [];
}

export function saveTowerDefenseLocalScores(scores) {
    return TOWER_DEFENSE_STORAGE.trySet(
        TOWER_DEFENSE_STORAGE_SLOTS.LOCAL_SCORES,
        Array.isArray(scores) ? scores.slice() : [],
    );
}
