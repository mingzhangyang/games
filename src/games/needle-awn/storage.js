import { createGameStorage } from '../../platform/storage/game-storage.js';
import { STORAGE_KEYS } from './config.js';

export const NEEDLE_AWN_STORAGE_SLOTS = Object.freeze({
    UNLOCKED_LEVEL: 'unlockedLevel',
    LEVEL_STARS: 'levelStars',
    ENDLESS_BEST: 'endlessBest',
    CLASH_MAX: 'clashMax',
});

export const NEEDLE_AWN_STORAGE = createGameStorage('needle-awn', {
    version: 1,
    legacy: {
        [NEEDLE_AWN_STORAGE_SLOTS.UNLOCKED_LEVEL]: STORAGE_KEYS.UNLOCKED_LEVEL,
        [NEEDLE_AWN_STORAGE_SLOTS.LEVEL_STARS]: STORAGE_KEYS.LEVEL_STARS,
        [NEEDLE_AWN_STORAGE_SLOTS.ENDLESS_BEST]: STORAGE_KEYS.ENDLESS_BEST,
        [NEEDLE_AWN_STORAGE_SLOTS.CLASH_MAX]: STORAGE_KEYS.CLASH_MAX,
    },
});
