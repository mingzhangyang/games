import { createGameStorage } from '../../platform/storage/game-storage.js';

export const PLANET_MERGE_STORAGE_SLOTS = Object.freeze({
    SKIN: 'skin',
    BEST: 'best',
    LOCAL_SCORES: 'localScores',
});

export const PLANET_MERGE_STORAGE = createGameStorage('planet-merge', {
    version: 1,
    legacy: {
        [PLANET_MERGE_STORAGE_SLOTS.SKIN]: 'pm_skin',
        [PLANET_MERGE_STORAGE_SLOTS.BEST]: 'pm_best',
        [PLANET_MERGE_STORAGE_SLOTS.LOCAL_SCORES]: 'pm_local_scores',
    },
});

export function getPlanetMergeBest() {
    const value = PLANET_MERGE_STORAGE.get(PLANET_MERGE_STORAGE_SLOTS.BEST, 0);
    const normalized = Number(value);
    if (Number.isFinite(normalized)) return normalized;
    PLANET_MERGE_STORAGE.set(PLANET_MERGE_STORAGE_SLOTS.BEST, 0);
    return 0;
}
