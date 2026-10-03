import { createGameStorage } from '../../platform/storage/game-storage.js';

export const ECHO_CAVE_STORAGE_SLOTS = Object.freeze({
    PROGRESS: 'progress',
});

export const ECHO_CAVE_STORAGE = createGameStorage('echo-cave', {
    version: 1,
    legacy: {
        [ECHO_CAVE_STORAGE_SLOTS.PROGRESS]: 'ec_progress',
    },
});
