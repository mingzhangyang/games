import { createGameStorage } from '../../platform/storage/game-storage.js';

export const FLAME_VERSE_STORAGE_SLOTS = Object.freeze({
    PROGRESS: 'progress',
});

export const FLAME_VERSE_STORAGE = createGameStorage('flame-verse', {
    version: 1,
    legacy: {
        [FLAME_VERSE_STORAGE_SLOTS.PROGRESS]: 'fv_progress',
    },
});
