import { createGameStorage } from '../../platform/storage/game-storage.js';
import { STORAGE_KEYS } from './config.js';

export const SWORD_FLIGHT_STORAGE_SLOTS = Object.freeze({
    UNLOCKED_STAGE: 'unlockedStage',
    STAGE_STARS: 'stageStars',
    ENDLESS_BEST: 'endlessBest',
    MAX_REALM: 'maxRealm',
    MAX_COMBO: 'maxCombo',
});

export const SWORD_FLIGHT_STORAGE = createGameStorage('sword-flight', {
    version: 1,
    legacy: {
        [SWORD_FLIGHT_STORAGE_SLOTS.UNLOCKED_STAGE]: STORAGE_KEYS.UNLOCKED_STAGE,
        [SWORD_FLIGHT_STORAGE_SLOTS.STAGE_STARS]: STORAGE_KEYS.STAGE_STARS,
        [SWORD_FLIGHT_STORAGE_SLOTS.ENDLESS_BEST]: STORAGE_KEYS.ENDLESS_BEST,
        [SWORD_FLIGHT_STORAGE_SLOTS.MAX_REALM]: STORAGE_KEYS.MAX_REALM,
        [SWORD_FLIGHT_STORAGE_SLOTS.MAX_COMBO]: STORAGE_KEYS.MAX_COMBO,
    },
});
