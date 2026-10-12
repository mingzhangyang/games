import { createGameStorage } from '../../platform/storage/game-storage.js';

export const LOOP_JAIL_STORAGE_SLOTS = Object.freeze({
    BEST: 'best',
});

/** 本地最佳：{ score, wave }（新游戏，无历史键可迁移） */
export const LOOP_JAIL_STORAGE = createGameStorage('loop-jail', { version: 1 });

export function loadBest() {
    const raw = LOOP_JAIL_STORAGE.get(LOOP_JAIL_STORAGE_SLOTS.BEST, null);
    const score = Number(raw?.score);
    const wave = Number(raw?.wave);
    return {
        score: Number.isFinite(score) && score > 0 ? Math.floor(score) : 0,
        wave: Number.isFinite(wave) && wave > 0 ? Math.floor(wave) : 0,
    };
}

export function saveBest(best) {
    return LOOP_JAIL_STORAGE.set(LOOP_JAIL_STORAGE_SLOTS.BEST, { score: best.score, wave: best.wave });
}
