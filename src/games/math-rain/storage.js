import { createGameStorage } from '../../platform/storage/game-storage.js';

export const MATH_RAIN_STORAGE_SLOTS = Object.freeze({
    INVENTORY: 'inventory',
    SFX_VOLUME: 'sfxVolume',
    MUSIC_VOLUME: 'musicVolume',
});

export const MATH_RAIN_STORAGE = createGameStorage('math-rain', {
    version: 1,
    legacy: {
        [MATH_RAIN_STORAGE_SLOTS.INVENTORY]: 'math-rain-inventory',
        [MATH_RAIN_STORAGE_SLOTS.SFX_VOLUME]: 'mr_sfx_volume',
        [MATH_RAIN_STORAGE_SLOTS.MUSIC_VOLUME]: 'mr_music_volume',
    },
});

function normalizeVolume(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return Math.max(0, Math.min(100, number));
}

export function loadMathRainInventory() {
    const value = MATH_RAIN_STORAGE.get(MATH_RAIN_STORAGE_SLOTS.INVENTORY, null);
    return value && typeof value === 'object' && !Array.isArray(value)
        ? { ...value }
        : null;
}

export function saveMathRainInventory(inventory) {
    if (!inventory || typeof inventory !== 'object' || Array.isArray(inventory)) return false;
    return MATH_RAIN_STORAGE.trySet(MATH_RAIN_STORAGE_SLOTS.INVENTORY, { ...inventory });
}

export function loadMathRainSfxVolume() {
    return normalizeVolume(MATH_RAIN_STORAGE.get(MATH_RAIN_STORAGE_SLOTS.SFX_VOLUME, null));
}

export function saveMathRainSfxVolume(volume) {
    const value = normalizeVolume(volume);
    return value === null ? false : MATH_RAIN_STORAGE.trySet(MATH_RAIN_STORAGE_SLOTS.SFX_VOLUME, value);
}

export function loadMathRainMusicVolume() {
    return normalizeVolume(MATH_RAIN_STORAGE.get(MATH_RAIN_STORAGE_SLOTS.MUSIC_VOLUME, null));
}

export function saveMathRainMusicVolume(volume) {
    const value = normalizeVolume(volume);
    return value === null ? false : MATH_RAIN_STORAGE.trySet(MATH_RAIN_STORAGE_SLOTS.MUSIC_VOLUME, value);
}
