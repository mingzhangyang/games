import { createGameStorage } from '../../platform/storage/game-storage.js';

export const RIPPLE_DUET_STORAGE_SLOTS = Object.freeze({
    PROGRESS: 'progress',
});

export const RIPPLE_DUET_STORAGE = createGameStorage('ripple-duet', {
    version: 1,
    legacy: {
        [RIPPLE_DUET_STORAGE_SLOTS.PROGRESS]: 'rd_progress',
    },
});
