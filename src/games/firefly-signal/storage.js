import { createGameStorage } from '../../platform/storage/game-storage.js';

export const FIREFLY_SIGNAL_STORAGE_SLOTS = Object.freeze({
    BEST_FIRST_LIGHT: 'best:first-light',
    BEST_TWO_MEADOWS: 'best:two-meadows',
    BEST_MIDSUMMER: 'best:midsummer',
});

const BEST_SLOTS = Object.freeze({
    'first-light': FIREFLY_SIGNAL_STORAGE_SLOTS.BEST_FIRST_LIGHT,
    'two-meadows': FIREFLY_SIGNAL_STORAGE_SLOTS.BEST_TWO_MEADOWS,
    midsummer: FIREFLY_SIGNAL_STORAGE_SLOTS.BEST_MIDSUMMER,
});

export const FIREFLY_SIGNAL_STORAGE = createGameStorage('firefly-signal', {
    version: 1,
    legacy: {
        [FIREFLY_SIGNAL_STORAGE_SLOTS.BEST_FIRST_LIGHT]: 'fs_best_first-light',
        [FIREFLY_SIGNAL_STORAGE_SLOTS.BEST_TWO_MEADOWS]: 'fs_best_two-meadows',
        [FIREFLY_SIGNAL_STORAGE_SLOTS.BEST_MIDSUMMER]: 'fs_best_midsummer',
    },
});

const slotFor = levelId => BEST_SLOTS[levelId] || `best:${levelId}`;

export function loadBest(levelId) {
    const value = FIREFLY_SIGNAL_STORAGE.get(slotFor(levelId), null);
    return value
        && typeof value.used === 'number'
        && typeof value.harmony === 'number'
        ? value
        : null;
}

export function saveBest(levelId, used, harmony) {
    const prev = loadBest(levelId);
    const better = !prev || used < prev.used || (used === prev.used && harmony > prev.harmony);
    if (better) {
        FIREFLY_SIGNAL_STORAGE.trySet(slotFor(levelId), {
            used,
            harmony: Math.round(harmony * 100) / 100,
        });
    }
    return better;
}
