import { createGameStorage } from '../../platform/storage/game-storage.js';

/** 本地最佳：每关 / 每个自由局档位一个槽位 { score }（新游戏，无历史键可迁移） */
export const SUDOKU_MIST_STORAGE = createGameStorage('sudoku-mist', { version: 1 });

const slotFor = id => `best:${id}`;

export function loadBest(id) {
    const raw = SUDOKU_MIST_STORAGE.get(slotFor(id), null);
    const score = Number(raw?.score);
    return Number.isFinite(score) && score > 0 ? Math.floor(score) : 0;
}

export function saveBest(id, score) {
    return SUDOKU_MIST_STORAGE.set(slotFor(id), { score: Math.floor(score) });
}
