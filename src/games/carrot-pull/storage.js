import { createGameStorage } from '../../platform/storage/game-storage.js';

export const CARROT_PULL_STORAGE_SLOTS = Object.freeze({
    BEST: 'best',
});

export const CARROT_PULL_STORAGE = createGameStorage('carrot-pull', {
    version: 1,
    legacy: {
        [CARROT_PULL_STORAGE_SLOTS.BEST]: 'cp_best_score',
    },
});
