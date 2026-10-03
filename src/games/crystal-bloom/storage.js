import { createGameStorage } from '../../platform/storage/game-storage.js';

export const CRYSTAL_BLOOM_STORAGE_SLOTS = Object.freeze({
    PROGRESS: 'progress',
});

export const CRYSTAL_BLOOM_STORAGE = createGameStorage('crystal-bloom', {
    version: 1,
    legacy: {
        [CRYSTAL_BLOOM_STORAGE_SLOTS.PROGRESS]: 'cb_progress',
    },
});
