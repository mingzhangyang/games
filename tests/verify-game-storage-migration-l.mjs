#!/usr/bin/env node
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = {
    get length() { return mem.size; },
    key(i) { return [...mem.keys()][i] ?? null; },
    getItem(key) { return mem.has(key) ? mem.get(key) : null; },
    setItem(key, value) { mem.set(key, String(value)); },
    removeItem(key) { mem.delete(key); },
};

const word = await import('../src/games/word-daily/storage.js');

const zhHistory = { '2026-10-01': 3 };
const en4History = { '2026-10-01': 4 };
const en5History = { '2026-10-01': 5 };
const en6History = { '2026-10-01': 6 };
const zhStats = { played: 4, wins: 3 };
const en4Stats = { played: 5, wins: 4 };
const en5Stats = { played: 6, wins: 5 };
const en5OlderStats = { played: 2, wins: 1 };
const en6Stats = { played: 7, wins: 6 };

mem.set('wd_lang_mode', 'zh');
mem.set('wd_word_len_en', '6');
mem.set('wd_seen_help', '1');
mem.set('wd_hist_zh', JSON.stringify(zhHistory));
mem.set('wd_stats_zh', JSON.stringify(zhStats));
mem.set('wd_hist_en_4', JSON.stringify(en4History));
mem.set('wd_stats_en_4', JSON.stringify(en4Stats));
mem.set('wd_hist_en', JSON.stringify(en5History));
mem.set('wd_stats_en_5', JSON.stringify(en5Stats));
mem.set('wd_stats_en', JSON.stringify(en5OlderStats));
mem.set('wd_hist_en_6', JSON.stringify(en6History));
mem.set('wd_stats_en_6', JSON.stringify(en6Stats));

assert.equal(word.loadWordDailyLangMode(), 'zh');
assert.equal(word.loadWordDailyWordLength(), 6);
assert.equal(word.loadWordDailySeenHelp(), 1);
assert.deepEqual(word.loadWordDailyHistory('zh', 4), zhHistory);
assert.deepEqual(word.loadWordDailyStats('zh', 4), zhStats);
assert.deepEqual(word.loadWordDailyHistory('en', 4), en4History);
assert.deepEqual(word.loadWordDailyStats('en', 4), en4Stats);
assert.deepEqual(word.loadWordDailyHistory('en', 5), en5History,
    '5-letter history falls back to the historical unsuffixed key');
assert.deepEqual(word.loadWordDailyStats('en', 5), en5Stats,
    '5-letter suffixed stats take precedence over the older unsuffixed key');
assert.deepEqual(word.loadWordDailyHistory('en', 6), en6History);
assert.deepEqual(word.loadWordDailyStats('en', 6), en6Stats);

mem.set('wd_lang_mode', 'en');
mem.set('wd_word_len_en', '4');
mem.set('wd_hist_en', JSON.stringify({ '2026-10-01': 99 }));
assert.equal(word.loadWordDailyLangMode(), 'zh', 'canonical language wins after import');
assert.equal(word.loadWordDailyWordLength(), 6, 'canonical word length wins after import');
assert.deepEqual(word.loadWordDailyHistory('en', 5), en5History,
    'canonical history wins after import');

const nextHistory = { ...en5History, '2026-10-02': 2 };
const nextStats = { played: 7, wins: 6 };
word.saveWordDailyLangMode('en');
word.saveWordDailyWordLength(5);
word.saveWordDailyHistory('en', 5, nextHistory);
word.saveWordDailyStats('en', 5, nextStats);
word.saveWordDailySeenHelp(true);

assert.equal(word.loadWordDailyLangMode(), 'en');
assert.equal(word.loadWordDailyWordLength(), 5);
assert.deepEqual(word.loadWordDailyHistory('en', 5), nextHistory);
assert.deepEqual(word.loadWordDailyStats('en', 5), nextStats);
assert.equal(word.loadWordDailySeenHelp(), true);

assert.equal(mem.get('wd_lang_mode'), 'en', 'legacy language key is retained without write-back');
assert.equal(mem.get('wd_word_len_en'), '4', 'legacy word-length key is retained without write-back');
assert.equal(mem.get('wd_hist_en'), JSON.stringify({ '2026-10-01': 99 }),
    'legacy history is retained without write-back');
assert.equal(mem.get('wd_stats_en_5'), JSON.stringify(en5Stats),
    'legacy stats are retained without write-back');
assert.equal(mem.get('wd_seen_help'), '1', 'legacy help marker is retained without write-back');

assert.equal(
    mem.get(word.WORD_DAILY_STORAGE.key(word.WORD_DAILY_STORAGE_SLOTS.HISTORY_EN_5)),
    JSON.stringify(nextHistory),
);
assert.equal(
    mem.get(word.WORD_DAILY_STORAGE.key(word.WORD_DAILY_STORAGE_SLOTS.STATS_EN_5)),
    JSON.stringify(nextStats),
);

// Malformed suffixed 5-letter data must not block the historical unsuffixed fallback.
word.WORD_DAILY_STORAGE.remove(word.WORD_DAILY_STORAGE_SLOTS.HISTORY_EN_5);
word.WORD_DAILY_STORAGE.remove(word.WORD_DAILY_STORAGE_SLOTS.STATS_EN_5);
const recoveredHistory = { '2026-10-03': 4 };
const recoveredStats = { played: 8, wins: 7 };
mem.set('wd_hist_en_5', '{broken-json');
mem.set('wd_hist_en', JSON.stringify(recoveredHistory));
mem.set('wd_stats_en_5', '{broken-json');
mem.set('wd_stats_en', JSON.stringify(recoveredStats));

assert.deepEqual(
    word.loadWordDailyHistory('en', 5),
    recoveredHistory,
    'malformed suffixed history falls through to the valid unsuffixed fallback',
);
assert.deepEqual(
    word.loadWordDailyStats('en', 5),
    recoveredStats,
    'malformed suffixed stats fall through to the valid unsuffixed fallback',
);
assert.equal(
    mem.get(word.WORD_DAILY_STORAGE.key(word.WORD_DAILY_STORAGE_SLOTS.HISTORY_EN_5)),
    JSON.stringify(recoveredHistory),
    'recovered history is canonicalized after validated fallback import',
);
assert.equal(
    mem.get(word.WORD_DAILY_STORAGE.key(word.WORD_DAILY_STORAGE_SLOTS.STATS_EN_5)),
    JSON.stringify(recoveredStats),
    'recovered stats are canonicalized after validated fallback import',
);

console.log('✓ Phase 5 Batch L migrates Word Daily private preferences/history/stats while retaining Daily protocol keys');
