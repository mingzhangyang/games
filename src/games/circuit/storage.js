import { createGameStorage } from '../../platform/storage/game-storage.js';

export const CIRCUIT_STORAGE_SLOTS = Object.freeze({
    STARS: 'stars',
});

export const CIRCUIT_STORAGE = createGameStorage('circuit', {
    version: 1,
    legacy: {
        [CIRCUIT_STORAGE_SLOTS.STARS]: 'cc_stars',
    },
});
