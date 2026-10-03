import { createGameStorage } from '../../platform/storage/game-storage.js';

export const MAXWELL_DEMON_STORAGE_SLOTS = Object.freeze({
    PROGRESS: 'progress',
});

export const MAXWELL_DEMON_STORAGE = createGameStorage('maxwell-demon', {
    version: 1,
    legacy: {
        [MAXWELL_DEMON_STORAGE_SLOTS.PROGRESS]: 'md_progress',
    },
});
