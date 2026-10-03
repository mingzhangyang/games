import { createGameStorage } from '../../platform/storage/game-storage.js';

export const SHADOW_LOOM_STORAGE_SLOTS = Object.freeze({
    PROGRESS: 'progress',
    SEEN_CHAPTERS: 'seenChapters',
});

export const SHADOW_LOOM_STORAGE = createGameStorage('shadow-loom', {
    version: 1,
    legacy: {
        [SHADOW_LOOM_STORAGE_SLOTS.PROGRESS]: 'sl_progress',
        [SHADOW_LOOM_STORAGE_SLOTS.SEEN_CHAPTERS]: 'sl_seen_chapters',
    },
});
