import { createGameStorage } from '../../platform/storage/game-storage.js';

export const WORD_DAILY_STORAGE_SLOTS = Object.freeze({
    SEEN_HELP: 'seenHelp',
    LANG_MODE: 'langMode',
    WORD_LENGTH_EN: 'wordLengthEn',
    HISTORY_ZH: 'history:zh',
    STATS_ZH: 'stats:zh',
    HISTORY_EN_4: 'history:en:4',
    STATS_EN_4: 'stats:en:4',
    HISTORY_EN_5: 'history:en:5',
    STATS_EN_5: 'stats:en:5',
    HISTORY_EN_6: 'history:en:6',
    STATS_EN_6: 'stats:en:6',
});

export const WORD_DAILY_STORAGE = createGameStorage('word-daily', {
    version: 1,
    legacy: {
        [WORD_DAILY_STORAGE_SLOTS.SEEN_HELP]: 'wd_seen_help',
        [WORD_DAILY_STORAGE_SLOTS.LANG_MODE]: 'wd_lang_mode',
        [WORD_DAILY_STORAGE_SLOTS.WORD_LENGTH_EN]: 'wd_word_len_en',
        [WORD_DAILY_STORAGE_SLOTS.HISTORY_ZH]: 'wd_hist_zh',
        [WORD_DAILY_STORAGE_SLOTS.STATS_ZH]: 'wd_stats_zh',
        [WORD_DAILY_STORAGE_SLOTS.HISTORY_EN_4]: 'wd_hist_en_4',
        [WORD_DAILY_STORAGE_SLOTS.STATS_EN_4]: 'wd_stats_en_4',
        [WORD_DAILY_STORAGE_SLOTS.HISTORY_EN_5]: ['wd_hist_en_5', 'wd_hist_en'],
        [WORD_DAILY_STORAGE_SLOTS.STATS_EN_5]: ['wd_stats_en_5', 'wd_stats_en'],
        [WORD_DAILY_STORAGE_SLOTS.HISTORY_EN_6]: 'wd_hist_en_6',
        [WORD_DAILY_STORAGE_SLOTS.STATS_EN_6]: 'wd_stats_en_6',
    },
});

function historySlot(langMode, wordLength) {
    if (langMode === 'zh') return WORD_DAILY_STORAGE_SLOTS.HISTORY_ZH;
    if (wordLength === 4) return WORD_DAILY_STORAGE_SLOTS.HISTORY_EN_4;
    if (wordLength === 6) return WORD_DAILY_STORAGE_SLOTS.HISTORY_EN_6;
    return WORD_DAILY_STORAGE_SLOTS.HISTORY_EN_5;
}

function statsSlot(langMode, wordLength) {
    if (langMode === 'zh') return WORD_DAILY_STORAGE_SLOTS.STATS_ZH;
    if (wordLength === 4) return WORD_DAILY_STORAGE_SLOTS.STATS_EN_4;
    if (wordLength === 6) return WORD_DAILY_STORAGE_SLOTS.STATS_EN_6;
    return WORD_DAILY_STORAGE_SLOTS.STATS_EN_5;
}

export function loadWordDailyLangMode() {
    const value = WORD_DAILY_STORAGE.get(WORD_DAILY_STORAGE_SLOTS.LANG_MODE, null);
    return value === 'en' || value === 'zh' ? value : null;
}

export function saveWordDailyLangMode(value) {
    if (value !== 'en' && value !== 'zh') return false;
    return WORD_DAILY_STORAGE.trySet(WORD_DAILY_STORAGE_SLOTS.LANG_MODE, value);
}

export function loadWordDailyWordLength(fallback = 5) {
    const value = Number(WORD_DAILY_STORAGE.get(WORD_DAILY_STORAGE_SLOTS.WORD_LENGTH_EN, fallback));
    return [4, 5, 6].includes(value) ? value : fallback;
}

export function saveWordDailyWordLength(value) {
    const number = Number(value);
    if (![4, 5, 6].includes(number)) return false;
    return WORD_DAILY_STORAGE.trySet(WORD_DAILY_STORAGE_SLOTS.WORD_LENGTH_EN, number);
}

export function loadWordDailyHistory(langMode, wordLength = 5) {
    const value = WORD_DAILY_STORAGE.get(historySlot(langMode, wordLength), {});
    return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

export function saveWordDailyHistory(langMode, wordLength, history) {
    if (!history || typeof history !== 'object' || Array.isArray(history)) return false;
    return WORD_DAILY_STORAGE.trySet(historySlot(langMode, wordLength), { ...history });
}

export function loadWordDailyStats(langMode, wordLength = 5) {
    const value = WORD_DAILY_STORAGE.get(statsSlot(langMode, wordLength), null);
    return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : null;
}

export function saveWordDailyStats(langMode, wordLength, stats) {
    if (!stats || typeof stats !== 'object' || Array.isArray(stats)) return false;
    return WORD_DAILY_STORAGE.trySet(statsSlot(langMode, wordLength), { ...stats });
}

export function loadWordDailySeenHelp() {
    return WORD_DAILY_STORAGE.get(WORD_DAILY_STORAGE_SLOTS.SEEN_HELP, false);
}

export function saveWordDailySeenHelp(value) {
    return WORD_DAILY_STORAGE.trySet(WORD_DAILY_STORAGE_SLOTS.SEEN_HELP, Boolean(value));
}
