/**
 * Word Daily 每日猜词
 * Bilingual daily word puzzle —
 *   en: classic 5-letter word deduction
 *   zh: 成语 mode — guess the idiom from its definition + tile feedback
 * Wordle-style loop: one puzzle per day, same for everyone, streaks,
 * spoiler-free emoji share, global daily battle report.
 */

import { EN_ANSWERS, EN_EXTRA } from './word-daily-data-en.js';
import { ZH_IDIOMS } from './word-daily-data-zh.js';
import { getLang, getMuted, setMuted } from './site-settings.js';
import { ICONS } from './icons.js';
import { updateMoreGames } from './more-games.js';

/* ────────────────────────── utilities ────────────────────────── */

function storageGet(key) {
    try {
        return localStorage.getItem(key);
    } catch (e) {
        return null;
    }
}

function storageSet(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        // 存储不可用时静默降级
    }
}

function storageParse(key, fallback) {
    try {
        const parsed = JSON.parse(storageGet(key));
        return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (e) {
        return fallback;
    }
}

// UTC+8 日期键，与全球玩家同一天
function dayKey(date = new Date()) {
    const d = new Date(date.getTime() + 8 * 3600 * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// 距离下一个 UTC+8 午夜的毫秒数
function msUntilNextDay() {
    const now = Date.now();
    const tomorrow = dayKey(new Date(now + 8 * 3600 * 1000 + 24 * 3600 * 1000));
    const [y, m, dd] = tomorrow.split('-').map(Number);
    // UTC+8 的午夜 = UTC 前一日 16:00
    return Date.UTC(y, m - 1, dd) - 8 * 3600 * 1000 - now;
}

// 每日谜题编号（自 2026-01-01 UTC+8 起）
const EPOCH = Date.UTC(2026, 0, 1) - 8 * 3600 * 1000;
function dailyNumber() {
    return Math.floor((Date.now() - EPOCH) / (24 * 3600 * 1000)) + 1;
}

function mulberry32(seed) {
    let a = seed;
    return function () {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hashString(str) {
    let h = 1779033703;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
}

/* ────────────────────────── data prep ────────────────────────── */

const WORD_LEN_EN = 5;
const WORD_LEN_ZH = 4;
const MAX_GUESSES = 6;

const EN = (() => {
    const clean = (list) => {
        const out = [];
        const seen = new Set();
        for (const raw of list) {
            const w = String(raw).toLowerCase().trim();
            if (w.length !== WORD_LEN_EN || !/^[a-z]{5}$/.test(w) || seen.has(w)) continue;
            seen.add(w);
            out.push(w);
        }
        return out;
    };
    const answers = clean(EN_ANSWERS);
    const extra = clean(EN_EXTRA);
    return { answers, valid: new Set([...answers, ...extra]) };
})();

const ZH = (() => {
    const out = [];
    const seen = new Set();
    for (const raw of ZH_IDIOMS) {
        const w = String(raw.w || '').trim();
        if (w.length !== WORD_LEN_ZH || !/^[\u4e00-\u9fa5]{4}$/.test(w) || seen.has(w)) continue;
        seen.add(w);
        out.push({ w, h: String(raw.h || '').trim() });
    }
    return { idioms: out, wordSet: new Set(out.map(x => x.w)) };
})();

// 按谜题编号取当日题目
function dailyEntry(langMode, num) {
    if (langMode === 'zh') {
        return ZH.idioms[(hashString('zh-' + num) + num) % ZH.idioms.length];
    }
    return EN.answers[(hashString('en-' + num) + num) % EN.answers.length];
}

function evaluateGuess(guess, answer) {
    const len = guess.length;
    const result = Array(len).fill('absent');
    const remaining = {};
    for (let i = 0; i < len; i++) {
        if (guess[i] === answer[i]) {
            result[i] = 'correct';
        } else {
            remaining[answer[i]] = (remaining[answer[i]] || 0) + 1;
        }
    }
    for (let i = 0; i < len; i++) {
        if (result[i] === 'correct') continue;
        if ((remaining[guess[i]] || 0) > 0) {
            result[i] = 'present';
            remaining[guess[i]]--;
        }
    }
    return result;
}

/* ────────────────────────── audio ────────────────────────── */

const Sfx = {
    ctx: null,
    muted: getMuted(),
    ensure() {
        if (this.muted) return null;
        try {
            if (!this.ctx) {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return null;
                this.ctx = new AC();
            }
            if (this.ctx.state === 'suspended') this.ctx.resume();
            return this.ctx;
        } catch (e) {
            return null;
        }
    },
    tone({ freq = 440, type = 'sine', duration = 0.08, volume = 0.12, delay = 0 }) {
        const ctx = this.ensure();
        if (!ctx) return;
        const now = ctx.currentTime + delay;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + duration + 0.02);
    },
    key() { this.tone({ freq: 520, type: 'square', duration: 0.04, volume: 0.05 }); },
    invalid() { this.tone({ freq: 180, type: 'sawtooth', duration: 0.15, volume: 0.1 }); },
    reveal(index) { this.tone({ freq: 320 + index * 40, type: 'triangle', duration: 0.09, volume: 0.1, delay: index * 0.28 }); },
    win() { [523, 659, 784, 1046].forEach((f, i) => this.tone({ freq: f, type: 'triangle', duration: 0.18, volume: 0.14, delay: i * 0.11 })); },
    lose() { this.tone({ freq: 300, endFreq: 0, type: 'sine', duration: 0.5, volume: 0.14 }); },
    toggleMuted() {
        this.muted = !this.muted;
        setMuted(this.muted);
        return this.muted;
    }
};

/* ────────────────────────── i18n ────────────────────────── */

const LANGUAGES = {
    en: {
        title: 'Word Daily',
        dailyBadge: 'Puzzle',
        zhModeLabel: 'Idiom mode',
        enModeLabel: 'Word mode',
        practice: 'Practice',
        practiceBanner: 'Practice round — result not recorded',
        stats: 'Stats',
        help: 'How to play',
        langBtn: 'Idioms',
        switchToZh: 'Idioms',
        switchToEn: 'Words',
        switchModeTitle: 'Switch puzzle mode',
        guessPlaceholder: 'Type a 4-character idiom…',
        submit: 'Guess',
        hintLabel: 'Definition',
        notInDict: 'Not in the word list',
        notInIdiomDict: 'No such idiom in the list — try another',
        tooShort: 'Too short',
        needIme: 'Tip: use a Chinese input method (IME) to type the idiom',
        winMsg: 'Brilliant!',
        loseMsg: 'The word was',
        statsTitle: 'Statistics',
        played: 'Played',
        winRate: 'Win %',
        curStreak: 'Streak',
        maxStreak: 'Max Streak',
        guessDist: 'Guess Distribution',
        playedLabel: 'Played',
        winRateLabel: 'Win %',
        curStreakLabel: 'Streak',
        maxStreakLabel: 'Max',
        distTitle: 'Guess Distribution',
        helpTitle: 'How to play',
        ok: 'OK',
        globalReport: 'Today worldwide',
        globalLoading: 'Loading…',
        globalNone: 'Be the first to play today!',
        share: 'Share',
        copied: 'Copied!',
        nextPuzzle: 'Next puzzle',
        playAgain: 'Play Practice',
        close: 'Close',
        rules1: 'Guess the word in 6 tries.',
        rules2: 'Each guess must be a real word of the right length.',
        rules3: 'Green: right letter, right spot. Yellow: right letter, wrong spot. Gray: not in the word.',
        exampleWord: 'PLANT',
        exampleNote: 'P is in the word and in the right spot.',
        practiceOver: 'Practice finished — click Next for another round',
        dailyDone: 'Daily puzzle completed!',
        modeZh: 'Idiom',
        modeEn: 'Word',
        dailyWon: '🎉 Brilliant! Solved in {n} tries',
        dailyLost: '😔 Nice try! The answer is revealed below',
        practiceWon: '🎉 Solved in {n} tries!',
        practiceLost: '😔 Nice try! The answer is revealed below',
        correctAnswer: 'Answer',
        idiomDef: 'Definition',
        nextDaily: 'Next Puzzle (Unlimited Practice)',
        nextPractice: 'Next Puzzle',
        viewStats: 'View Stats',
        backToDaily: 'Back to Daily',
        practiceBadge: 'Practice',
        practiceBannerTpl: 'Practice #{n} — not recorded in streaks'
    },
    zh: {
        title: '每日猜词',
        dailyBadge: '第',
        zhModeLabel: '成语模式',
        enModeLabel: '单词模式',
        practice: '练习模式',
        practiceBanner: '练习模式——不计入统计与连胜',
        stats: '统计',
        help: '玩法说明',
        langBtn: '成语模式',
        switchToZh: '成语模式',
        switchToEn: '单词模式',
        switchModeTitle: '切换词库模式',
        guessPlaceholder: '输入四字成语…',
        submit: '猜',
        hintLabel: '释义',
        notInDict: '词库里没有这个单词',
        notInIdiomDict: '词库里没有这个成语，换一个试试',
        tooShort: '字数不够',
        needIme: '小提示：用中文输入法打出四字成语',
        winMsg: '太棒了！',
        loseMsg: '答案是',
        statsTitle: '统计',
        played: '已玩',
        winRate: '胜率',
        curStreak: '连胜',
        maxStreak: '最长连胜',
        guessDist: '猜测分布',
        playedLabel: '已玩',
        winRateLabel: '胜率',
        curStreakLabel: '连胜',
        maxStreakLabel: '最长',
        distTitle: '猜测分布',
        helpTitle: '玩法说明',
        ok: '好的',
        globalReport: '今日全球战报',
        globalLoading: '加载中…',
        globalNone: '今天你可能是第一个玩的！',
        share: '分享成绩',
        copied: '已复制！',
        nextPuzzle: '下一题',
        playAgain: '来一局练习',
        close: '关闭',
        rules1: '在 6 次机会内猜出词语。',
        rules2: '每次猜测必须是正确长度的真实词语。',
        rules3: '绿色：位置正确；黄色：词中有但位置不对；灰色：词中没有。',
        exampleWord: '示例',
        exampleNote: '词中恰好有这个字，且位置正确。',
        practiceOver: '练习结束——点击"下一题"开始新一轮',
        dailyDone: '今日每日一词已完成！',
        modeZh: '成语',
        modeEn: '单词',
        dailyWon: '🎉 太棒了！用了 {n} 次机会猜中',
        dailyLost: '😔 挑战未成功，答案已在下方揭晓',
        practiceWon: '🎉 恭喜猜中！用了 {n} 次机会',
        practiceLost: '😔 挑战未成功，答案已在下方揭晓',
        correctAnswer: '正确答案',
        idiomDef: '成语释义',
        nextDaily: '下一题（无限练习）',
        nextPractice: '下一题',
        viewStats: '查看战报',
        backToDaily: '返回今日一词',
        practiceBadge: '练习',
        practiceBannerTpl: '练习模式（第 {n} 局）——不计入每日连胜'
    }
};

/* ────────────────────────── game ────────────────────────── */

const STATS_URL = 'https://word-daily-stats.orangely.workers.dev';

class WordDailyGame {
    constructor() {
        this.langMode = this.resolveLangMode(); // 'en' | 'zh'
        this.TEXT = null;
        this.mode = 'daily'; // 'daily' | 'practice'
        this.status = 'playing'; // playing | won | lost
        this.rows = [];   // committed guesses: { word, states }
        this.current = ''; // 正在输入的内容
        this.answer = '';
        this.hint = '';
        this.puzzleNum = dailyNumber();
        this.day = dayKey();
        this.revealing = false;
        this.practiceCount = 0;

        this.el = {};
        this.gatherElements();
        this.applyLanguage();
        this.bindUI();
        this.startDaily();
        this.startRolloverWatch();
    }

    gatherElements() {
        const ids = [
            'wd-title', 'wd-num', 'wd-mode-tag', 'wd-practice-banner',
            'wd-board', 'wd-toast',
            'wd-kb', 'wd-zh-input-row', 'wd-zh-input', 'wd-zh-submit',
            'wd-hint-card', 'wd-hint-text', 'wd-hint-label',
            'wd-btn-stats', 'wd-btn-help', 'wd-btn-practice', 'wd-btn-lang', 'wd-btn-mute',
            'wd-help-modal', 'wd-help-title', 'wd-help-close', 'wd-help-body',
            'wd-stats-modal', 'wd-stats-close', 'wd-stats-title', 'wd-dist-title',
            'wd-st-played', 'wd-st-winrate', 'wd-st-cur', 'wd-st-max',
            'wd-lb-played', 'wd-lb-winrate', 'wd-lb-cur', 'wd-lb-max',
            'wd-dist', 'wd-global', 'wd-share', 'wd-countdown', 'wd-practice-over',
            'wd-end-panel', 'wd-end-status', 'wd-end-answer', 'wd-end-hint',
            'wd-btn-next', 'wd-next-label', 'wd-btn-stats-inline', 'wd-stats-inline-label',
            'wd-btn-share-inline', 'wd-share-inline-label', 'wd-modal-next', 'wd-modal-next-label'
        ];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) this.el[id.replace(/^wd-/, '')] = el;
        });
    }

    resolveLangMode() {
        const saved = storageGet('wd_lang_mode');
        if (saved === 'en' || saved === 'zh') return saved;
        const lang = navigator.language || navigator.userLanguage || '';
        return lang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
    }

    applyLanguage() {
        // UI 语言跟随全站设置（wd-btn-lang 是词库模式切换，不是语言切换）
        this.lang = getLang();
        this.TEXT = LANGUAGES[this.lang];
        document.documentElement.lang = this.lang;
        document.title = this.lang === 'zh'
            ? '每日猜词 — 每日成语与单词益智解谜'
            : 'Word Daily — Daily Bilingual Word Puzzle';
        const t = this.TEXT;

        if (this.el.title) this.el.title.textContent = t.title;
        if (this.el['btn-lang']) {
            this.el['btn-lang'].textContent = this.langMode === 'zh' ? t.switchToEn : t.switchToZh;
            this.el['btn-lang'].title = t.switchModeTitle;
        }
        if (this.el['btn-practice']) {
            this.el['btn-practice'].textContent = this.mode === 'practice'
                ? `📅 ${t.backToDaily}`
                : `🎲 ${t.practice}`;
            this.el['btn-practice'].title = this.mode === 'practice' ? t.backToDaily : t.practice;
        }
        if (this.el['btn-help']) {
            this.el['btn-help'].textContent = `❓ ${t.help}`;
            this.el['btn-help'].title = t.help;
        }
        if (this.el['btn-stats']) {
            this.el['btn-stats'].textContent = `📊 ${t.stats}`;
            this.el['btn-stats'].title = t.stats;
        }
        if (this.el['help-title']) this.el['help-title'].textContent = t.helpTitle;
        if (this.el['help-close']) this.el['help-close'].textContent = t.ok;
        if (this.el['stats-title']) this.el['stats-title'].textContent = t.statsTitle;
        if (this.el['lb-played']) this.el['lb-played'].textContent = t.playedLabel;
        if (this.el['lb-winrate']) this.el['lb-winrate'].textContent = t.winRateLabel;
        if (this.el['lb-cur']) this.el['lb-cur'].textContent = t.curStreakLabel;
        if (this.el['lb-max']) this.el['lb-max'].textContent = t.maxStreakLabel;
        if (this.el['dist-title']) this.el['dist-title'].textContent = t.distTitle;
        if (this.el.share) this.el.share.textContent = `📤 ${t.share}`;
        if (this.el['zh-submit']) this.el['zh-submit'].textContent = t.submit;
        if (this.el['zh-input']) this.el['zh-input'].placeholder = t.guessPlaceholder;
        if (this.el['hint-label']) this.el['hint-label'].textContent = `📖 ${t.hintLabel}`;
        if (this.el['practice-banner']) this.el['practice-banner'].textContent = t.practiceBanner;

        const nextText = this.mode === 'daily' ? t.nextDaily : t.nextPractice;
        if (this.el['next-label']) this.el['next-label'].textContent = nextText;
        if (this.el['modal-next-label']) this.el['modal-next-label'].textContent = nextText;
        if (this.el['stats-inline-label']) this.el['stats-inline-label'].textContent = t.viewStats;
        if (this.el['share-inline-label']) this.el['share-inline-label'].textContent = t.share;

        this.updateHelpBody();

        const modeTag = this.langMode === 'zh' ? t.zhModeLabel : t.enModeLabel;
        if (this.el['mode-tag']) {
            this.el['mode-tag'].textContent = this.mode === 'practice'
                ? `${t.practiceBadge} · ${modeTag}`
                : modeTag;
        }
        this.updateMuteIcon();
        if (this.status !== 'playing') {
            this.renderEndPanel();
        }
        updateMoreGames(this.lang);
    }

    updateHelpBody() {
        const t = this.TEXT;
        const body = this.el['help-body'];
        if (!body) return;
        body.textContent = '';
        const lines = [t.rules1, t.rules2, t.rules3];
        lines.forEach(line => {
            const p = document.createElement('p');
            p.textContent = line;
            body.appendChild(p);
        });
        // 示例行
        const example = document.createElement('div');
        example.className = 'wd-example';
        const sample = this.langMode === 'zh'
            ? { word: '水到渠成', states: ['correct', 'absent', 'absent', 'absent'] }
            : { word: 'PLANT', states: ['correct', 'absent', 'absent', 'absent', 'absent'] };
        sample.states.forEach((s, i) => {
            const tile = document.createElement('span');
            tile.className = `wd-mini-tile ${s}`;
            tile.textContent = sample.word[i];
            example.appendChild(tile);
        });
        const note = document.createElement('span');
        note.className = 'wd-example-note';
        note.textContent = t.exampleNote;
        example.appendChild(note);
        body.appendChild(example);
        if (this.langMode === 'zh' && this.el['zh-input-row']) {
            const tip = document.createElement('p');
            tip.className = 'wd-help-tip';
            tip.textContent = t.needIme;
            body.appendChild(tip);
        }
    }

    /* ── 题目与状态 ── */

    lockKey() {
        return `wd_daily_${this.day}_${this.langMode}`;
    }

    statsKey() {
        return `wd_stats_${this.langMode}`;
    }

    histKey() {
        return `wd_hist_${this.langMode}`;
    }

    startDaily() {
        this.mode = 'daily';
        this.puzzleNum = dailyNumber();
        this.day = dayKey();
        const entry = dailyEntry(this.langMode, this.puzzleNum);
        if (this.langMode === 'zh') {
            this.answer = entry.w;
            this.hint = entry.h;
        } else {
            this.answer = entry;
            this.hint = '';
        }

        const saved = storageParse(this.lockKey(), null);
        if (saved && Array.isArray(saved.rows)) {
            // 今天已玩过：恢复局面，禁止输入
            this.rows = saved.rows;
            this.status = saved.status;
        } else {
            this.rows = [];
            this.status = 'playing';
            if (typeof window.hubTrack === 'function') window.hubTrack('word-daily', 'play');
        }
        this.current = '';
        this.rebuildBoard();
        this.renderRows();
        this.updateModeUi();
    }

    startPractice() {
        this.mode = 'practice';
        this.status = 'playing';
        this.rows = [];
        this.current = '';
        this.practiceCount = (this.practiceCount || 0) + 1;
        this.puzzleNum = this.practiceCount;

        if (this.langMode === 'zh') {
            let entry;
            let attempts = 0;
            do {
                entry = ZH.idioms[Math.floor(Math.random() * ZH.idioms.length)];
                attempts++;
            } while (entry.w === this.answer && attempts < 20 && ZH.idioms.length > 1);
            this.answer = entry.w;
            this.hint = entry.h;
        } else {
            let nextWord;
            let attempts = 0;
            do {
                nextWord = EN.answers[Math.floor(Math.random() * EN.answers.length)];
                attempts++;
            } while (nextWord === this.answer && attempts < 20 && EN.answers.length > 1);
            this.answer = nextWord;
            this.hint = '';
        }

        this.rebuildBoard();
        this.updateModeUi();
        this.showToast(`${this.TEXT.practiceBadge} #${this.practiceCount}`, 1600);
    }

    updateModeUi() {
        const t = this.TEXT;
        const banner = this.el['practice-banner'];
        if (banner) {
            banner.classList.toggle('hidden', this.mode !== 'practice');
            if (this.mode === 'practice') {
                const count = this.practiceCount || 1;
                const bannerText = t.practiceBannerTpl.replace('{n}', count);
                banner.innerHTML = `<span>${bannerText}</span><button type="button" class="wd-banner-btn" id="wd-btn-back-daily">${t.backToDaily}</button>`;
                const backBtn = document.getElementById('wd-btn-back-daily');
                if (backBtn) {
                    backBtn.onclick = (e) => {
                        e.preventDefault();
                        this.startDaily();
                    };
                }
            }
        }

        // 顶部切换练习/每日按钮
        if (this.el['btn-practice']) {
            if (this.mode === 'practice') {
                this.el['btn-practice'].textContent = `📅 ${t.backToDaily}`;
                this.el['btn-practice'].title = t.backToDaily;
            } else {
                this.el['btn-practice'].textContent = `🎲 ${t.practice}`;
                this.el['btn-practice'].title = t.practice;
            }
        }

        if (this.el['btn-lang']) {
            this.el['btn-lang'].textContent = this.langMode === 'zh' ? t.switchToEn : t.switchToZh;
            this.el['btn-lang'].title = t.switchModeTitle;
        }

        this.updateBoardSize();
        if (this.el.num) {
            this.el.num.textContent = this.mode === 'practice'
                ? `${t.practiceBadge} #${this.practiceCount || 1}`
                : `#${this.puzzleNum}`;
        }
        if (this.el['mode-tag']) {
            const baseMode = this.langMode === 'zh' ? t.zhModeLabel : t.enModeLabel;
            this.el['mode-tag'].textContent = this.mode === 'practice'
                ? `${t.practiceBadge} · ${baseMode}`
                : baseMode;
        }
        this.updateInputUi();
        this.updateHintCard();
    }

    updateBoardSize() {
        const board = this.el.board;
        if (!board) return;
        const cols = this.wordLen();
        board.style.setProperty('--cols', String(cols));
    }

    wordLen() {
        return this.langMode === 'zh' ? WORD_LEN_ZH : WORD_LEN_EN;
    }

    updateHintCard() {
        const card = this.el['hint-card'];
        if (!card) return;
        const show = this.langMode === 'zh' && this.hint;
        card.classList.toggle('hidden', !show);
        if (show && this.el['hint-text']) this.el['hint-text'].textContent = this.hint;
    }

    /* ── 棋盘渲染 ── */

    rebuildBoard() {
        const board = this.el.board;
        if (!board) return;
        board.textContent = '';
        this.updateBoardSize();
        const cols = this.wordLen();
        for (let r = 0; r < MAX_GUESSES; r++) {
            const row = document.createElement('div');
            row.className = 'wd-row';
            row.dataset.row = String(r);
            for (let c = 0; c < cols; c++) {
                const tile = document.createElement('div');
                tile.className = 'wd-tile';
                tile.dataset.row = String(r);
                tile.dataset.col = String(c);
                row.appendChild(tile);
            }
            board.appendChild(row);
        }
        this.updateInputUi();
    }

    tileAt(r, c) {
        return this.el.board?.querySelector(`.wd-tile[data-row="${r}"][data-col="${c}"]`) || null;
    }

    renderRows() {
        for (let r = 0; r < MAX_GUESSES; r++) {
            const guess = this.rows[r];
            for (let c = 0; c < this.wordLen(); c++) {
                const tile = this.tileAt(r, c);
                if (!tile) continue;
                tile.className = 'wd-tile';
                if (guess) {
                    tile.textContent = guess.word[c];
                    tile.classList.add(guess.states[c]);
                } else {
                    // 正在输入的行
                    if (r === this.rows.length && this.status === 'playing') {
                        const ch = this.current[c];
                        if (ch) {
                            tile.textContent = ch;
                            tile.classList.add('filled');
                        } else {
                            tile.textContent = '';
                        }
                    } else {
                        tile.textContent = '';
                    }
                }
            }
        }
        this.updateKeyboardColors();
    }

    renderCurrent() {
        const r = this.rows.length;
        for (let c = 0; c < this.wordLen(); c++) {
            const tile = this.tileAt(r, c);
            if (!tile) continue;
            const ch = this.current[c];
            if (ch) {
                tile.textContent = ch;
                tile.classList.add('filled');
                tile.classList.add('pop');
                setTimeout(() => tile.classList.remove('pop'), 120);
            } else {
                tile.textContent = '';
                tile.classList.remove('filled');
            }
        }
    }

    /* ── 输入与操作栏 ── */

    updateInputUi() {
        const zhRow = this.el['zh-input-row'];
        const kb = this.el.kb;
        const endPanel = this.el['end-panel'];
        const isZh = this.langMode === 'zh';
        const playing = this.status === 'playing';

        if (endPanel) {
            endPanel.classList.toggle('hidden', playing);
            if (!playing) {
                this.renderEndPanel();
            }
        }

        if (zhRow) zhRow.classList.toggle('hidden', !isZh || !playing);
        if (kb) kb.classList.toggle('hidden', isZh || !playing);

        if (isZh && playing) {
            setTimeout(() => this.el['zh-input']?.focus(), 50);
        }
        this.renderRows();
    }

    renderEndPanel() {
        const t = this.TEXT;
        const won = this.status === 'won';
        const isDaily = this.mode === 'daily';

        if (this.el['end-status']) {
            this.el['end-status'].className = `wd-end-status ${won ? 'won' : 'lost'}`;
            if (won) {
                const tmpl = isDaily ? t.dailyWon : t.practiceWon;
                this.el['end-status'].textContent = tmpl.replace('{n}', this.rows.length);
            } else {
                this.el['end-status'].textContent = isDaily ? t.dailyLost : t.practiceLost;
            }
        }

        if (this.el['end-answer']) {
            const displayAns = this.langMode === 'zh' ? this.answer : this.answer.toUpperCase();
            this.el['end-answer'].textContent = `${t.correctAnswer}：${displayAns}`;
        }

        if (this.el['end-hint']) {
            if (this.langMode === 'zh' && this.hint) {
                this.el['end-hint'].textContent = `${t.idiomDef}：${this.hint}`;
                this.el['end-hint'].classList.remove('hidden');
            } else {
                this.el['end-hint'].classList.add('hidden');
            }
        }

        const nextText = isDaily ? t.nextDaily : t.nextPractice;
        if (this.el['next-label']) this.el['next-label'].textContent = nextText;
        if (this.el['modal-next-label']) this.el['modal-next-label'].textContent = nextText;
        if (this.el['stats-inline-label']) this.el['stats-inline-label'].textContent = t.viewStats;
        if (this.el['share-inline-label']) this.el['share-inline-label'].textContent = t.share;
    }

    bindZhInput() {
        const input = this.el['zh-input'];
        if (!input) return;
        input.addEventListener('keydown', (e) => {
            if (e.isComposing) return; // 输入法组词过程中的回车不提交
            if (e.key === 'Enter') {
                e.preventDefault();
                this.submitZh();
            }
        });
        this.el['zh-submit']?.addEventListener('click', () => this.submitZh());
    }

    submitZh() {
        if (this.status !== 'playing') return;
        const input = this.el['zh-input'];
        if (!input) return;
        const value = input.value.replace(/[\s，。、]/g, '');
        if (value.length < WORD_LEN_ZH) {
            this.showToast(this.TEXT.tooShort);
            this.shakeRow();
            return;
        }
        if (value.length > WORD_LEN_ZH) {
            this.showToast(this.TEXT.guessPlaceholder);
            return;
        }
        if (!ZH.wordSet.has(value)) {
            this.showToast(this.TEXT.notInIdiomDict);
            this.shakeRow();
            Sfx.invalid();
            return;
        }
        input.value = '';
        this.commitGuess(value);
    }

    bindPhysicalKeyboard() {
        document.addEventListener('keydown', (e) => {
            const tag = e.target && e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
            if (this.langMode !== 'en' || this.status !== 'playing') return;
            if (e.key === 'Enter') {
                this.submitEn();
            } else if (e.key === 'Backspace') {
                if (this.current.length > 0) {
                    this.current = this.current.slice(0, -1);
                    this.renderCurrent();
                }
            } else if (/^[a-zA-Z]$/.test(e.key)) {
                this.typeLetter(e.key.toLowerCase());
            }
        });
    }

    typeLetter(ch) {
        if (this.status !== 'playing') return;
        if (this.current.length >= this.wordLen()) return;
        this.current += ch;
        Sfx.key();
        this.renderCurrent();
    }

    submitEn() {
        if (this.status !== 'playing') return;
        if (this.current.length < this.wordLen()) {
            this.showToast(this.TEXT.tooShort);
            this.shakeRow();
            Sfx.invalid();
            return;
        }
        if (!EN.valid.has(this.current)) {
            this.showToast(this.TEXT.notInDict);
            this.shakeRow();
            Sfx.invalid();
            return;
        }
        const guess = this.current;
        this.current = '';
        this.commitGuess(guess);
    }

    shakeRow() {
        const r = this.rows.length;
        const row = this.el.board?.querySelector(`.wd-row[data-row="${r}"]`);
        if (!row) return;
        row.classList.add('shake');
        setTimeout(() => row.classList.remove('shake'), 500);
    }

    /* ── 提交判定 ── */

    commitGuess(guess) {
        const states = evaluateGuess(guess, this.answer);
        const rowIndex = this.rows.length;
        this.rows.push({ word: guess, states });
        this.revealing = true;
        this.animateReveal(rowIndex, states, () => {
            this.revealing = false;
            this.updateKeyboardColors();
            if (guess === this.answer) {
                this.finish(true);
            } else if (this.rows.length >= MAX_GUESSES) {
                this.finish(false);
            } else {
                this.renderRows();
                this.updateInputUi();
            }
        });
    }

    animateReveal(rowIndex, states, done) {
        for (let c = 0; c < this.wordLen(); c++) {
            const tile = this.tileAt(rowIndex, c);
            if (!tile) continue;
            tile.textContent = this.rows[rowIndex].word[c];
            tile.classList.add('filled');
            Sfx.reveal(c);
            setTimeout(() => {
                tile.classList.add('flip');
                setTimeout(() => {
                    tile.classList.add(states[c]);
                    tile.classList.remove('flip');
                }, 250);
            }, c * 280);
        }
        setTimeout(done, this.wordLen() * 280 + 350);
    }

    finish(won) {
        this.status = won ? 'won' : 'lost';
        this.renderRows();
        if (won) {
            Sfx.win();
            // 胜利行弹跳
            const r = this.rows.length - 1;
            for (let c = 0; c < this.wordLen(); c++) {
                const tile = this.tileAt(r, c);
                if (tile) {
                    tile.classList.add('bounce');
                    setTimeout(() => tile.classList.remove('bounce'), 900 + c * 100);
                }
            }
        } else {
            Sfx.lose();
            this.showToast(`${this.TEXT.loseMsg}: ${this.answer}`, 3500);
        }

        if (this.mode === 'daily') {
            if (typeof window.hubTrack === 'function') window.hubTrack('word-daily', 'finish');
            this.recordDaily(won ? this.rows.length : 0);
            this.reportGlobal(won, this.rows.length);
        }

        // 切换输入区为结算与下一题操作面板
        this.updateInputUi();

        setTimeout(() => this.openStats(), won ? 1500 : 800);
    }

    recordDaily(rowsUsed) {
        // 锁定今日题目并保存局面
        storageSet(this.lockKey(), JSON.stringify({
            rows: this.rows,
            status: this.status
        }));
        // 历史与连胜
        const won = this.status === 'won';
        const hist = storageParse(this.histKey(), {});
        if (typeof hist === 'object' && hist) {
            hist[this.day] = won ? rowsUsed : 0;
            const keys = Object.keys(hist).sort();
            while (keys.length > 120) {
                delete hist[keys.shift()];
            }
            storageSet(this.histKey(), JSON.stringify(hist));
        }
        // 统计
        const stats = this.loadStats();
        stats.played += 1;
        if (won) {
            stats.wins += 1;
            stats.dist[rowsUsed] = (stats.dist[rowsUsed] || 0) + 1;
        }
        const streak = this.computeStreak();
        stats.curStreak = streak;
        stats.maxStreak = Math.max(stats.maxStreak, streak);
        storageSet(this.statsKey(), JSON.stringify(stats));
    }

    loadStats() {
        const s = storageParse(this.statsKey(), null);
        const base = { played: 0, wins: 0, dist: [0, 0, 0, 0, 0, 0, 0], curStreak: 0, maxStreak: 0 };
        if (!s || typeof s !== 'object') return base;
        return {
            played: Number(s.played) || 0,
            wins: Number(s.wins) || 0,
            dist: Array.isArray(s.dist) ? s.dist.concat(base.dist).slice(0, 7).map(n => Number(n) || 0) : base.dist,
            curStreak: Number(s.curStreak) || 0,
            maxStreak: Number(s.maxStreak) || 0
        };
    }

    computeStreak() {
        const hist = storageParse(this.histKey(), {});
        if (!hist || typeof hist !== 'object') return 0;
        let streak = 0;
        const d = new Date();
        // 今天没玩（或刚输）不影响此前连胜的展示；从最近一天往前数
        for (;;) {
            const key = dayKey(d);
            const v = hist[key];
            if (typeof v === 'number' && v > 0) {
                streak++;
            } else if (key === this.day) {
                // 今天还没赢：不中断历史连胜
            } else {
                break;
            }
            d.setDate(d.getDate() - 1);
            if (streak > 365) break;
        }
        return streak;
    }

    /* ── 全球战报 ── */

    async reportGlobal(won, rows) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            await fetch(`${STATS_URL}/stats`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ day: this.day, mode: this.langMode, win: won, rows }),
                signal: controller.signal,
                mode: 'cors'
            });
            clearTimeout(timeoutId);
        } catch (e) {
            // Worker 未部署时静默降级
        }
    }

    async fetchGlobalReport() {
        const el = this.el.global;
        if (!el) return;
        el.textContent = `${this.TEXT.globalLoading}`;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            const res = await fetch(`${STATS_URL}/stats?day=${this.day}&mode=${this.langMode}`, {
                signal: controller.signal,
                mode: 'cors'
            });
            clearTimeout(timeoutId);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const played = Number(data.p) || 0;
            const wins = Number(data.w) || 0;
            if (played === 0) {
                el.textContent = `🌍 ${this.TEXT.globalNone}`;
            } else {
                const pct = Math.round((wins / played) * 100);
                el.textContent = `🌍 ${this.TEXT.globalReport}: ${played} · ${pct}% ✅`;
            }
        } catch (e) {
            el.textContent = '';
        }
    }

    /* ── 键盘 ── */

    buildKeyboard() {
        const kb = this.el.kb;
        if (!kb) return;
        kb.textContent = '';
        const layout = [
            ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
            ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
            ['ENTER', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'BACK']
        ];
        layout.forEach(rowKeys => {
            const row = document.createElement('div');
            row.className = 'wd-kb-row';
            rowKeys.forEach(key => {
                const btn = document.createElement('button');
                btn.className = 'wd-key' + (key.length > 1 ? ' wd-key-wide' : '');
                btn.dataset.key = key;
                btn.textContent = key === 'ENTER' ? '⏎' : key === 'BACK' ? '⌫' : key.toUpperCase();
                btn.addEventListener('click', () => {
                    if (key === 'ENTER') this.submitEn();
                    else if (key === 'BACK') {
                        this.current = this.current.slice(0, -1);
                        this.renderCurrent();
                    } else {
                        this.typeLetter(key);
                    }
                });
                row.appendChild(btn);
            });
            kb.appendChild(row);
        });
    }

    updateKeyboardColors() {
        const best = {};
        const rank = { absent: 1, present: 2, correct: 3 };
        for (const { word, states } of this.rows) {
            for (let i = 0; i < word.length; i++) {
                const ch = word[i];
                if (!best[ch] || rank[states[i]] > rank[best[ch]]) {
                    best[ch] = states[i];
                }
            }
        }
        this.el.kb?.querySelectorAll('.wd-key').forEach(btn => {
            const key = btn.dataset.key;
            btn.classList.remove('correct', 'present', 'absent');
            if (best[key]) btn.classList.add(best[key]);
        });
    }

    /* ── 统计弹窗 ── */

    openStats() {
        const t = this.TEXT;
        const stats = this.loadStats();
        if (this.el['st-played']) this.el['st-played'].textContent = String(stats.played);
        if (this.el['st-winrate']) {
            this.el['st-winrate'].textContent = stats.played > 0
                ? `${Math.round((stats.wins / stats.played) * 100)}%`
                : '—';
        }
        if (this.el['st-cur']) this.el['st-cur'].textContent = String(stats.curStreak);
        if (this.el['st-max']) this.el['st-max'].textContent = String(stats.maxStreak);
        this.renderDistribution(stats);

        const showShare = this.status !== 'playing';
        if (this.el.share) this.el.share.classList.toggle('hidden', !showShare);

        const showNext = this.status !== 'playing';
        if (this.el['modal-next']) {
            this.el['modal-next'].classList.toggle('hidden', !showNext);
            const nextText = this.mode === 'daily' ? t.nextDaily : t.nextPractice;
            if (this.el['modal-next-label']) this.el['modal-next-label'].textContent = nextText;
        }

        this.el['stats-modal']?.classList.remove('hidden');
        if (this.mode === 'daily' && this.status !== 'playing') {
            this.fetchGlobalReport();
            this.startCountdown();
        } else if (this.el.countdown) {
            this.el.countdown.textContent = '';
        }
        if (this.el['modal-next'] && !this.el['modal-next'].classList.contains('hidden')) {
            this.el['modal-next'].focus();
        } else if (showShare) {
            this.el.share?.focus();
        }
    }

    renderDistribution(stats) {
        const wrap = this.el.dist;
        if (!wrap) return;
        wrap.textContent = '';
        const max = Math.max(1, ...stats.dist.slice(1));
        for (let i = 1; i <= 6; i++) {
            const row = document.createElement('div');
            row.className = 'wd-dist-row';
            const label = document.createElement('span');
            label.className = 'wd-dist-label';
            label.textContent = String(i);
            const barWrap = document.createElement('div');
            barWrap.className = 'wd-dist-bar-wrap';
            const bar = document.createElement('div');
            bar.className = 'wd-dist-bar' + (this.status !== 'playing' && this.mode === 'daily' && this.rows.length === i ? ' highlight' : '');
            const count = stats.dist[i] || 0;
            bar.style.width = `${Math.max(7, (count / max) * 100)}%`;
            bar.textContent = count > 0 ? String(count) : '';
            barWrap.appendChild(bar);
            row.append(label, barWrap);
            wrap.appendChild(row);
        }
    }

    startCountdown() {
        this.stopCountdown();
        const tick = () => {
            const ms = msUntilNextDay();
            const h = Math.floor(ms / 3600000);
            const m = Math.floor((ms % 3600000) / 60000);
            const s = Math.floor((ms % 60000) / 1000);
            if (this.el.countdown) {
                this.el.countdown.textContent = `${this.TEXT.nextPuzzle}: ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            }
        };
        tick();
        this._countdownTimer = setInterval(tick, 1000);
    }

    stopCountdown() {
        if (this._countdownTimer) {
            clearInterval(this._countdownTimer);
            this._countdownTimer = null;
        }
    }

    closeStats() {
        this.el['stats-modal']?.classList.add('hidden');
        this.stopCountdown();
    }

    openHelp() {
        this.el['help-modal']?.classList.remove('hidden');
    }

    closeHelp() {
        this.el['help-modal']?.classList.add('hidden');
    }

    /* ── 分享 ── */

    buildShareText() {
        const t = this.TEXT;
        const modeTag = this.langMode === 'zh' ? (this.lang === 'zh' ? '成语' : 'idiom') : (this.lang === 'zh' ? '单词' : 'word');
        const attempts = this.rows.length;
        const result = this.status === 'won' ? `${attempts}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
        const stats = this.loadStats();
        const streak = stats.curStreak > 0 ? ` 🔥${stats.curStreak}` : '';
        const grid = this.rows.map(({ states }) =>
            states.map(s => s === 'correct' ? '🟩' : s === 'present' ? '🟨' : '⬛').join('')
        ).join('\n');
        const headerNum = this.mode === 'practice'
            ? `${this.TEXT.practiceBadge} #${this.practiceCount || 1}`
            : `#${this.puzzleNum}`;
        return `${t.title} ${headerNum} ${modeTag} ${result}${streak}\n${grid}\nhttps://games.orangely.xyz/word-daily.html`;
    }

    async shareResult() {
        const text = this.buildShareText();
        try {
            if (navigator.share) {
                await navigator.share({ text });
                return;
            }
        } catch (e) {
            // 用户取消则不复制
            return;
        }
        try {
            await navigator.clipboard.writeText(text);
            this.showToast(this.TEXT.copied);
        } catch (e) {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.cssText = 'position:fixed;opacity:0;left:-999px;top:-999px;';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
                this.showToast(this.TEXT.copied);
            } catch (e2) {
                // 复制失败
            }
        }
    }

    /* ── toast ── */

    showToast(msg, duration = 1600) {
        const toast = this.el.toast;
        if (!toast) return;
        toast.textContent = msg;
        toast.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
    }

    /* ── 日期滚动 ── */

    startRolloverWatch() {
        // 页面跨天时自动刷新到新题
        this._rolloverTimer = setInterval(() => {
            const now = dayKey();
            if (now !== this.day && this.mode === 'daily') {
                this.puzzleNum = dailyNumber();
                this.startDaily();
            }
        }, 30000);
    }

    updateMuteIcon() {
        if (this.el['btn-mute']) this.el['btn-mute'].innerHTML = Sfx.muted ? ICONS.soundOff : ICONS.soundOn;
    }

    /* ── 事件绑定 ── */

    bindUI() {
        this.buildKeyboard();
        this.bindPhysicalKeyboard();
        this.bindZhInput();

        const on = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', (e) => {
                e.preventDefault();
                fn();
            });
        };

        on('wd-btn-lang', () => {
            this.langMode = this.langMode === 'zh' ? 'en' : 'zh';
            storageSet('wd_lang_mode', this.langMode);
            this.startDaily();
        });
        on('wd-btn-practice', () => {
            if (this.mode === 'practice') {
                this.startDaily();
            } else {
                this.startPractice();
            }
        });
        on('wd-btn-next', () => this.startPractice());
        on('wd-modal-next', () => {
            this.closeStats();
            this.startPractice();
        });
        on('wd-btn-stats-inline', () => this.openStats());
        on('wd-btn-share-inline', () => this.shareResult());
        on('wd-btn-stats', () => this.openStats());
        on('wd-btn-help', () => this.openHelp());
        on('wd-btn-mute', () => {
            Sfx.toggleMuted();
            this.updateMuteIcon();
        });
        on('wd-stats-close', () => this.closeStats());
        on('wd-help-close', () => this.closeHelp());
        on('wd-share', () => this.shareResult());

        // 点击遮罩关闭弹窗
        ['wd-stats-modal', 'wd-help-modal'].forEach(id => {
            const modal = document.getElementById(id);
            if (modal) {
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) modal.classList.add('hidden');
                });
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeStats();
                this.closeHelp();
            }
        });

        window.addEventListener('site-settings:changed', () => {
            this.applyLanguage();
            this.updateModeUi();
        });
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.wordDailyGame = new WordDailyGame();
});
