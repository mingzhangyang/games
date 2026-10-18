import { createGameStorage } from '../../platform/storage/game-storage.js';
import { LEVELS } from './model/levels.js';

// v1 星级按下标存。当时的顺序是这 32 个 id 的前 20 个（实验关上线前）或全部 32 个。
const PREVIOUS_LEVEL_IDS = [
    'S1', 'S2', 'S3', 'S4', 'S5', 'M1', 'M2', 'M3', 'M4', 'M5',
    'H1', 'H2', 'H3', 'H4', 'H5', 'C1', 'C2', 'C3', 'C4', 'C5',
    'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12',
];

function remapStars(value) {
    if (!Array.isArray(value)) return value;
    const byId = new Map();
    for (let i = 0; i < value.length && i < PREVIOUS_LEVEL_IDS.length; i++) {
        byId.set(PREVIOUS_LEVEL_IDS[i], Number(value[i]) || 0);
    }
    return LEVELS.map((lv) => byId.get(lv.id) || 0);
}

export const CIRCUIT_STORAGE_SLOTS = Object.freeze({
    STARS: 'stars',
});

export const CIRCUIT_STORAGE = createGameStorage('circuit', {
    version: 2,
    migrations: {
        1: (value, ctx) => (ctx.slot === CIRCUIT_STORAGE_SLOTS.STARS ? remapStars(value) : value),
    },
    legacy: {
        [CIRCUIT_STORAGE_SLOTS.STARS]: 'cc_stars',
    },
});
