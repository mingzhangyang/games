import { createGameStorage } from '../../platform/storage/game-storage.js';

export const LUMEN_STORAGE_SLOTS = Object.freeze({
    STARS: 'stars',
});

export const LUMEN_STORAGE = createGameStorage('lumen', {
    version: 1,
    legacy: {
        [LUMEN_STORAGE_SLOTS.STARS]: 'lm_stars',
    },
});
