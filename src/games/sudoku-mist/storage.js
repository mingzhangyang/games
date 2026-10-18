import { createGameStorage } from '../../platform/storage/game-storage.js';

/**
 * 本地存档（新游戏，无历史键可迁移）：
 *   best:<id>          每关 / 每个自由局档位的最佳 { score }
 *   daily-run:<date>   每日局进行中的进度 { seed, owner, inputs, elapsed, notes }——每次输入后写，刷新 / 回来后按 inputs 重放；
 *                      owner = 最近一次接手这局的标签页令牌（别的标签页据此知道自己已过期，不再覆盖）
 *   daily:<date>       每日局第一次完成 { score, time }——完成标记（键 game:sudoku-mist:v1:daily:<YYYYMMDD>，
 *                      首页每日任务区如果接入就读它），之后的练习局不再改它
 */
export const SUDOKU_MIST_STORAGE = createGameStorage('sudoku-mist', { version: 1 });

const slotFor = id => `best:${id}`;
const isDate = key => /^\d{8}$/.test(String(key));
const count = v => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : null);

export function loadBest(id) {
    const raw = SUDOKU_MIST_STORAGE.get(slotFor(id), null);
    if (raw?.score === undefined || raw?.score === null || raw.score === '') return null;
    return count(raw.score);
}

export function saveBest(id, score) {
    return SUDOKU_MIST_STORAGE.set(slotFor(id), { score: Math.floor(score) });
}

const isInput = a => a && (
    (a.type === 'place' && Number.isInteger(a.cell) && Number.isInteger(a.digit))
    || (a.type === 'activate' && Number.isInteger(a.cell))
    || a.type === 'hint');

/** 进行中的每日局；数据损坏时当作没有（从头开始，而不是带着坏数据重放） */
export function loadDailyRun(dateKey) {
    if (!isDate(dateKey)) return null;
    const raw = SUDOKU_MIST_STORAGE.get(`daily-run:${dateKey}`, null);
    if (!raw || !Array.isArray(raw.inputs) || !raw.inputs.every(isInput)) return null;
    const notes = Array.isArray(raw.notes) && raw.notes.length === 81
        && raw.notes.every(n => Number.isInteger(n) && n >= 0 && n < 512) ? raw.notes : null;
    return {
        seed: Number.isInteger(raw.seed) ? raw.seed : null,
        owner: typeof raw.owner === 'string' ? raw.owner : null,
        inputs: raw.inputs.map(a => (a.type === 'hint' ? { type: 'hint' } : a.type === 'activate'
            ? { type: 'activate', cell: a.cell } : { type: 'place', cell: a.cell, digit: a.digit })),
        elapsed: count(raw.elapsed) ?? 0,
        notes,
    };
}

/** 存储里这一局进度的完整键（storage 事件比对用） */
export const dailyRunKey = dateKey => SUDOKU_MIST_STORAGE.key(`daily-run:${dateKey}`);

export function saveDailyRun(dateKey, { seed, owner, inputs, elapsed, notes }) {
    if (!isDate(dateKey)) return false;
    return SUDOKU_MIST_STORAGE.trySet(`daily-run:${dateKey}`, {
        seed, owner, inputs, elapsed: Math.floor(elapsed), notes: Array.from(notes),
    });
}

export function clearDailyRun(dateKey) {
    if (isDate(dateKey)) SUDOKU_MIST_STORAGE.remove(`daily-run:${dateKey}`);
}

/** 第一次完成的每日成绩；null = 今天还没完成 */
export function loadDailyDone(dateKey) {
    if (!isDate(dateKey)) return null;
    const raw = SUDOKU_MIST_STORAGE.get(`daily:${dateKey}`, null);
    const score = count(raw?.score);
    return score === null ? null : { score, time: count(raw.time) ?? 0 };
}

export function saveDailyDone(dateKey, { score, time }) {
    if (!isDate(dateKey)) return false;
    return SUDOKU_MIST_STORAGE.trySet(`daily:${dateKey}`, { score: Math.floor(score), time: Math.floor(time) });
}
