import { createGameStorage } from '../../platform/storage/game-storage.js';

export const BOND_FORGE_STORAGE_SLOTS = Object.freeze({
    PROGRESS: 'progress',
});

export const BOND_FORGE_STORAGE = createGameStorage('bond-forge', {
    version: 1,
    legacy: {
        [BOND_FORGE_STORAGE_SLOTS.PROGRESS]: 'bf_progress',
    },
});
