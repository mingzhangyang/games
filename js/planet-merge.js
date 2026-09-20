/**
 * Planet Merge 星球合成
 * Suika-style physics merge game — drop planets, merge identical ones,
 * chain combos, forge a sun, beat the daily challenge.
 *
 * Vanilla JS + hand-rolled circle physics. No runtime dependencies.
 */

import { ensurePlayerName, setPlayerName } from './player.js';
import { getLang, setLang, getMuted, setMuted } from './site-settings.js';
import { ICONS } from './icons.js';
import { updateMoreGames, renderMoreGames } from './more-games.js';
import { createStatsDrawer } from './game-drawer.js';
import { bindChrome } from './game-chrome.js';
import { bindFrame } from './game-frame.js';
import { storageGet, storageSet } from './safe-storage.js';
import { track } from './analytics.js';

/* ────────────────────────── utilities ────────────────────────── */

function escapeHTML(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// 隐私模式/禁用存储时 localStorage 会抛 SecurityError，所有访问必须兜底
function storageParse(key, fallback) {
    try {
        const parsed = JSON.parse(storageGet(key));
        return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (e) {
        return fallback;
    }
}

function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
}

// UTC+8 日期键：每日挑战以同一天为界，全球一致
function todayKey() {
    const d = new Date(Date.now() + 8 * 3600 * 1000);
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

function todayKeyDisplay() {
    const k = todayKey();
    return `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`;
}

function hashString(str) {
    let h = 1779033703;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
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

function formatNumber(n) {
    return Number(n).toLocaleString('en-US');
}

/* ────────────────────────── i18n ────────────────────────── */

const LANGUAGES = {
    en: {
        close: 'Close',
        stats: 'Stats',
        title: 'Planet Merge',
        subtitle: 'Drop · Merge · Chain the cosmos',
        howto: 'Drag to aim, release to drop. Two identical planets merge into the next one. Don\'t let the pile cross the danger line!',
        endless: 'Endless',
        daily: 'Daily Challenge',
        dailySameForAll: 'Everyone plays the same sequence today',
        todayBest: 'Today\'s best',
        best: 'Best',
        score: 'Score',
        chainTitle: 'Merge chain',
        paused: 'Paused',
        resume: 'Resume',
        restart: 'Restart',
        home: 'Home',
        again: 'Play Again',
        gameOver: 'Game Over',
        newBest: 'NEW BEST!',
        largestPlanet: 'Largest planet',
        sunsForged: 'Suns forged',
        merges: 'Merges',
        share: 'Share',
        copyResult: 'Copy Result',
        copied: 'Copied!',
        leaderboard: 'Global Leaderboard',
        today: 'Today',
        allTime: 'All-Time',
        loadingScores: 'Loading…',
        noScores: 'No scores yet',
        lbOffline: 'Leaderboard offline — showing local scores',
        lbSubmitFail: 'Score upload failed — saved locally',
        usernameLabel: 'Username (Enter to save)',
        next: 'Next',
        mute: 'Sound',
        language: '中文',
        hint: 'P pause · M mute · R restart',
        sideHowTo: 'How to play',
        sideRecords: 'Records',
        modeEndless: 'Endless',
        modeDaily: 'Daily',
        confirmReplace: 'Start a new daily run? Your current progress will be lost.',
        sound: 'Sound',
        moreGames: 'More games',
    },
    zh: {
        close: '关闭',
        stats: '数据统计',
        title: '星球合成',
        subtitle: '投放 · 合成 · 连锁宇宙',
        howto: '拖动瞄准，松手投放。两颗相同星球合成下一级。堆过危险线就结束！',
        endless: '无尽模式',
        daily: '每日挑战',
        dailySameForAll: '今天所有人的投放顺序都一样',
        todayBest: '今日最佳',
        best: '最佳',
        score: '分数',
        chainTitle: '合成链',
        paused: '已暂停',
        resume: '继续游戏',
        restart: '重新开始',
        home: '返回主页',
        again: '再来一局',
        gameOver: '游戏结束',
        newBest: '新纪录！',
        largestPlanet: '最大星球',
        sunsForged: '合成太阳',
        merges: '合成次数',
        share: '分享',
        copyResult: '复制成绩',
        copied: '已复制！',
        leaderboard: '全球排行榜',
        today: '今日榜',
        allTime: '总榜',
        loadingScores: '加载中…',
        noScores: '暂无分数',
        lbOffline: '榜单离线——显示本地成绩',
        lbSubmitFail: '成绩上传失败——已保存到本地',
        usernameLabel: '用户名（回车保存）',
        next: '下一个',
        mute: '音效',
        language: 'English',
        hint: 'P 暂停 · M 静音 · R 重开',
        sideHowTo: '玩法说明',
        sideRecords: '战绩',
        modeEndless: '无尽',
        modeDaily: '每日',
        confirmReplace: '开始新的每日挑战？当前进度将丢失。',
        sound: '声音',
        moreGames: '更多游戏',
    }
};

/* ────────────────────────── game config ────────────────────────── */

const WORLD_W = 420;
const WORLD_H = 640;
const WALL = 10;          // 容器壁厚（世界坐标）
const FLOOR = 14;         // 底部厚
const SPAWN_Y = 62;       // 投放点高度
const DANGER_Y = 122;     // 危险线
const DANGER_GRACE = 0.8; // 新星球免判时长（秒）
const DANGER_LIMIT = 1.5; // 越线判定时长（秒）
const DROP_COOLDOWN = 520; // 投放冷却（毫秒）
const COMBO_WINDOW = 2000; // 连锁窗口（毫秒）
const SUPERNOVA_SCORE = 500;

// 星球链：9 级可见星球 + 双太阳合成超新星爆炸
// 星球链的结构字段（尺寸/分数固定），视觉由皮肤（SKINS）提供
const CHAIN = [
    { key: 'asteroid', r: 15, score: 2 },
    { key: 'moon',     r: 21, score: 4 },
    { key: 'mars',     r: 28, score: 8 },
    { key: 'earth',    r: 36, score: 14 },
    { key: 'neptune',  r: 45, score: 22 },
    { key: 'uranus',   r: 55, score: 32 },
    { key: 'saturn',   r: 66, score: 45 },
    { key: 'jupiter',  r: 78, score: 60 },
    { key: 'sun',      r: 90, score: 80 }
];

// 皮肤：每级提供 emoji / 配色 / 名称（ring = 土星环，glow = 顶级光晕）
const SKINS = {
    planets: {
        label: { en: 'Planets', zh: '星球' },
        icon: '🪐',
        tiers: [
            { emoji: '🪨', color: '#9b8d7d', light: '#cdbfa9', dark: '#5d5347', name: { en: 'Asteroid', zh: '陨石' } },
            { emoji: '🌙', color: '#c8cede', light: '#f0f3fb', dark: '#7c8296', name: { en: 'Moon', zh: '月球' } },
            { emoji: '🔴', color: '#e0654a', light: '#ffb09a', dark: '#8c301d', name: { en: 'Mars', zh: '火星' } },
            { emoji: '🌏', color: '#3f8fd2', light: '#9fd8ff', dark: '#1c4e7e', name: { en: 'Earth', zh: '地球' } },
            { emoji: '🔵', color: '#4467e0', light: '#a3b8ff', dark: '#22347f', name: { en: 'Neptune', zh: '海王星' } },
            { emoji: '🟢', color: '#4fc7b5', light: '#b2f2e8', dark: '#237061', name: { en: 'Uranus', zh: '天王星' } },
            { emoji: '🪐', color: '#d8b46a', light: '#ffe7b0', dark: '#8a6c33', name: { en: 'Saturn', zh: '土星' }, ring: true },
            { emoji: '🟠', color: '#d7914f', light: '#ffd0a0', dark: '#8c5322', name: { en: 'Jupiter', zh: '木星' } },
            { emoji: '☀️', color: '#f7c948', light: '#fff4c2', dark: '#b98a12', name: { en: 'Sun', zh: '太阳' }, glow: true }
        ]
    },
    fruits: {
        label: { en: 'Fruits', zh: '水果' },
        icon: '🍉',
        tiers: [
            { emoji: '🍒', color: '#d94f6b', light: '#ffa3b5', dark: '#8c2438', name: { en: 'Cherry', zh: '樱桃' } },
            { emoji: '🍓', color: '#e8434f', light: '#ff9da6', dark: '#8c1d2a', name: { en: 'Strawberry', zh: '草莓' } },
            { emoji: '🍇', color: '#8b5cf6', light: '#c4b5fd', dark: '#4c1d95', name: { en: 'Grape', zh: '葡萄' } },
            { emoji: '🍊', color: '#f97316', light: '#fdba74', dark: '#9a3412', name: { en: 'Orange', zh: '橘子' } },
            { emoji: '🍏', color: '#84cc16', light: '#d9f99d', dark: '#3f6212', name: { en: 'Green Apple', zh: '青苹果' } },
            { emoji: '🍎', color: '#ef4444', light: '#fca5a5', dark: '#7f1d1d', name: { en: 'Apple', zh: '苹果' } },
            { emoji: '🥭', color: '#f59e0b', light: '#fde68a', dark: '#92400e', name: { en: 'Mango', zh: '芒果' } },
            { emoji: '🍍', color: '#eab308', light: '#fef08a', dark: '#854d0e', name: { en: 'Pineapple', zh: '菠萝' } },
            { emoji: '🍉', color: '#22c55e', light: '#86efac', dark: '#14532d', name: { en: 'Watermelon', zh: '西瓜' }, glow: true }
        ]
    },
    faces: {
        label: { en: 'Faces', zh: '表情' },
        icon: '🤩',
        tiers: [
            { emoji: '🙂', color: '#94a3b8', light: '#e2e8f0', dark: '#475569', name: { en: 'Smile', zh: '微笑' } },
            { emoji: '😊', color: '#6ee7b7', light: '#d1fae5', dark: '#065f46', name: { en: 'Happy', zh: '开心' } },
            { emoji: '😄', color: '#fbbf24', light: '#fef3c7', dark: '#92400e', name: { en: 'Cheer', zh: '欢乐' } },
            { emoji: '😎', color: '#38bdf8', light: '#bae6fd', dark: '#075985', name: { en: 'Cool', zh: '酷炫' } },
            { emoji: '🤩', color: '#a78bfa', light: '#ddd6fe', dark: '#5b21b6', name: { en: 'Starstruck', zh: '惊叹' } },
            { emoji: '😍', color: '#f472b6', light: '#fbcfe8', dark: '#9d174d', name: { en: 'Lovestruck', zh: '心动' } },
            { emoji: '🥳', color: '#fb923c', light: '#fed7aa', dark: '#9a3412', name: { en: 'Party', zh: '派对' } },
            { emoji: '🤯', color: '#f87171', light: '#fecaca', dark: '#7f1d1d', name: { en: 'Mind-blown', zh: '爆炸' } },
            { emoji: '😇', color: '#fde047', light: '#fef9c3', dark: '#a16207', name: { en: 'Angel', zh: '天使' }, glow: true }
        ]
    }
};

let skinId = SKINS[storageGet('pm_skin')] ? storageGet('pm_skin') : 'planets';

// 应用皮肤：把选中皮肤的字段写入 CHAIN（尺寸/分数保持不变）
function applySkin(id) {
    skinId = SKINS[id] ? id : 'planets';
    storageSet('pm_skin', skinId);
    const tiers = SKINS[skinId].tiers;
    CHAIN.forEach((tier, i) => {
        const v = tiers[i];
        tier.emoji = v.emoji;
        tier.color = v.color;
        tier.light = v.light;
        tier.dark = v.dark;
        tier.name = v.name;
        tier.ring = !!v.ring;
        tier.glow = !!v.glow;
    });
}

const MAX_TIER = CHAIN.length - 1;

// 可投放的层级与权重（层级越高越稀有）
const DROP_WEIGHTS = [30, 25, 20, 15, 10];

// 物理参数
const GRAVITY = 2000;      // px/s²
const RESTITUTION = 0.18;
const AIR_DAMP = 0.16;     // 指数阻尼系数（每秒）
const MAX_SPEED = 2400;    // px/s，防隧穿
const PHYS_STEP = 1 / 120; // 固定物理步长

const LEADERBOARD_URL = 'https://game-scores.orangely.workers.dev';

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
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
            return this.ctx;
        } catch (e) {
            return null;
        }
    },

    tone({ freq = 440, endFreq = null, type = 'sine', duration = 0.12, volume = 0.2, delay = 0 }) {
        const ctx = this.ensure();
        if (!ctx) return;
        const now = ctx.currentTime + delay;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        if (endFreq !== null) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), now + duration);
        }
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + duration + 0.02);
    },

    noise(duration = 0.4, volume = 0.25) {
        const ctx = this.ensure();
        if (!ctx) return;
        const now = ctx.currentTime;
        const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
        }
        const src = ctx.createBufferSource();
        const gain = ctx.createGain();
        gain.gain.value = volume;
        src.buffer = buffer;
        src.connect(gain).connect(ctx.destination);
        src.start(now);
    },

    click() { this.tone({ freq: 640, type: 'square', duration: 0.05, volume: 0.08 }); },
    drop() { this.tone({ freq: 170, endFreq: 95, type: 'sine', duration: 0.1, volume: 0.18 }); },
    merge(tier, combo) {
        const base = 300 + tier * 42 + Math.min(combo, 8) * 24;
        this.tone({ freq: base, endFreq: base * 1.5, type: 'triangle', duration: 0.14, volume: 0.2 });
        this.tone({ freq: base * 2, type: 'sine', duration: 0.09, volume: 0.08, delay: 0.03 });
    },
    supernova() {
        this.noise(0.5, 0.3);
        this.tone({ freq: 220, endFreq: 50, type: 'sawtooth', duration: 0.5, volume: 0.25 });
    },
    danger() { this.tone({ freq: 880, type: 'sine', duration: 0.07, volume: 0.1 }); },
    gameOver() {
        this.tone({ freq: 420, endFreq: 90, type: 'sawtooth', duration: 0.6, volume: 0.2 });
        this.tone({ freq: 300, endFreq: 70, type: 'sine', duration: 0.7, volume: 0.15, delay: 0.1 });
    },
    newBest() {
        [523, 659, 784, 1046].forEach((f, i) => {
            this.tone({ freq: f, type: 'triangle', duration: 0.16, volume: 0.16, delay: i * 0.09 });
        });
    },
    toggleMuted() {
        this.muted = !this.muted;
        storageSet('pm_muted', this.muted ? '1' : '0');
        setMuted(this.muted);
        return this.muted;
    }
};

/* ────────────────────────── physics body ────────────────────────── */

class Planet {
    constructor(tier, x, y) {
        this.tier = tier;
        this.x = x;
        this.y = y;
        this.r = CHAIN[tier].r;
        this.mass = this.r * this.r;
        this.vx = 0;
        this.vy = 0;
        this.age = 0;
        this.dead = false;
        // 合成时的弹入动画
        this.popScale = 0.4;
    }
}

/* ────────────────────────── game ────────────────────────── */

class PlanetMergeGame {
    constructor() {
        this.canvas = document.getElementById('pm-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.el = {};
        this.gatherElements();

        this.state = 'menu';   // menu | playing | paused | gameover
        this.mode = 'endless'; // endless | daily

        this.bodies = [];
        this.particles = [];
        this.popups = [];
        this.shockwaves = [];

        this.score = 0;
        this.best = storageParse('pm_best', 0);
        this.combo = 0;
        this.lastMergeAt = -1e9;
        this.mergesCount = 0;
        this.sunsMade = 0;
        this.maxTierSeen = 0;

        this.aimX = WORLD_W / 2;
        this.aiming = false;
        this.canDrop = true;
        this.cooldownUntil = 0;
        this.currentTier = 0;
        this.nextT = 1;
        this.rng = Math.random;

        this.dangerTimer = 0;
        this.lastDangerBeep = 0;
        this.shake = 0;
        this.time = 0;

        this.animationId = null;
        this.lastFrameTime = 0;
        this.accumulator = 0;

        this.leaderboardTab = 'daily';
        this.dailyDay = todayKey();

        this.starfield = null;

        applySkin(skinId);
        this.applyLanguage();
        this.bindInput();
        this.bindUI();
        this.resize();
        window.addEventListener('resize', () => this.resize());
        // 桌面舞台尺寸随 --frame-chrome 实测值变化（见 js/game-frame.js）：
        // 后端缓冲区必须在 CSS 尺寸变化之后重算
        window.addEventListener('game-frame:changed', () => this.resize());
        this.updateHud();
        this.showStartScreen();
        this.startLoop();
    }

    gatherElements() {
        const ids = [
            'pm-score', 'pm-best', 'pm-mode-label', 'pm-next-emoji',
            'pm-start', 'pm-title', 'pm-subtitle', 'pm-howto', 'pm-chain',
            'pm-btn-endless', 'pm-btn-daily', 'pm-daily-best-line', 'pm-best-line',
            'pm-start-mute', 'pm-start-lang',
            'pm-skin-row', 'pm-daily-note',
            'pm-pause', 'pm-btn-resume', 'pm-btn-restart', 'pm-btn-menu', 'pm-pause-title',
            'pm-over', 'pm-over-title', 'pm-over-score', 'pm-over-best', 'pm-over-newbest',
            'pm-over-max', 'pm-over-suns', 'pm-over-merges',
            'pm-btn-share', 'pm-btn-copy', 'pm-btn-again', 'pm-btn-home',
            'pm-lb-title', 'pm-tab-daily', 'pm-tab-alltime', 'pm-lb-list', 'pm-lb-status',
            'pm-username', 'pm-username-label',
            'pm-pause-btn', 'pm-mute-btn',
            'pm-toast',
            'pm-side-howto-title', 'pm-side-howto', 'pm-side-records-title', 'pm-side-records'
        ];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) this.el[id.replace(/^(pm-)/, '')] = el;
        });
    }

    /* ── language ── */

    resolveLanguage() {
        return getLang();
    }

    applyLanguage() {
        this.lang = this.resolveLanguage();
        this.TEXT = LANGUAGES[this.lang];
        const t = this.TEXT;
        document.documentElement.lang = this.lang;
        document.title = this.lang === 'zh' ? '星球合成 — 宇宙合成消除' : 'Planet Merge — Cosmic Merge Puzzle';

        if (this.el.title) this.el.title.textContent = t.title;
        if (this.el.subtitle) this.el.subtitle.textContent = t.subtitle;
        if (this.el.howto) this.el.howto.textContent = t.howto;
        if (this.el['btn-endless']) this.el['btn-endless'].textContent = `♾️ ${t.endless}`;
        if (this.el['btn-daily']) this.el['btn-daily'].textContent = `📅 ${t.daily}`;
        if (this.el['daily-note']) this.el['daily-note'].textContent = t.dailySameForAll;
        if (this.el['pause-title']) this.el['pause-title'].textContent = t.paused;
        if (this.el['btn-resume']) this.el['btn-resume'].textContent = t.resume;
        if (this.el['btn-restart']) this.el['btn-restart'].textContent = t.restart;
        if (this.el['btn-menu']) this.el['btn-menu'].innerHTML = `${ICONS.home}<span>${t.home}</span>`;
        if (this.el['over-title']) this.el['over-title'].textContent = t.gameOver;
        if (this.el['btn-share']) this.el['btn-share'].innerHTML = `${ICONS.share}<span>${t.share}</span>`;
        if (this.el['btn-copy']) this.el['btn-copy'].innerHTML = `${ICONS.copy}<span>${t.copyResult}</span>`;
        if (this.el['btn-again']) this.el['btn-again'].innerHTML = `${ICONS.retry}<span>${t.again}</span>`;
        if (this.el['btn-home']) this.el['btn-home'].innerHTML = `${ICONS.home}<span>${t.home}</span>`;
        const btnHome2 = document.getElementById('pm-btn-home2');
        if (btnHome2) btnHome2.innerHTML = `${ICONS.home}<span>${t.home}</span>`;
        if (this.el['lb-title']) this.el['lb-title'].textContent = `🏆 ${t.leaderboard}`;
        if (this.el['tab-daily']) this.el['tab-daily'].textContent = t.today;
        if (this.el['tab-alltime']) this.el['tab-alltime'].textContent = t.allTime;
        if (this.el['lb-status']) this.el['lb-status'].textContent = '';
        if (this.el['username-label']) this.el['username-label'].textContent = t.usernameLabel;
        if (this.el['username']) this.el['username'].placeholder = t.usernameLabel;
        if (this.el['over-max']) this.el['over-max'].textContent = '';
        if (this.el['over-suns']) this.el['over-suns'].textContent = '';
        if (this.el['over-merges']) this.el['over-merges'].textContent = '';

        this.updateMuteButtons();
        // 桌面侧栏（≥1024px 可见）
        if (this.el['side-howto-title']) this.el['side-howto-title'].textContent = `📖 ${t.sideHowTo}`;
        if (this.el['side-howto']) this.el['side-howto'].textContent = t.howto;
        if (this.el['side-records-title']) this.el['side-records-title'].textContent = `🏅 ${t.sideRecords}`;
        this.updateSideRecords();
        if (this.el['start-lang']) this.el['start-lang'].textContent = t.language;
        // HUD 小标签
        const scoreLabel = document.getElementById('pm-score-label');
        if (scoreLabel) scoreLabel.textContent = t.score;
        const nextLabel = document.getElementById('pm-next-label');
        if (nextLabel) nextLabel.textContent = t.next;
        const hint = document.querySelector('.pm-footer-hint');
        if (hint) hint.textContent = t.hint;
        this.updateStartStats();
        this.renderChainShowcase();
        this.renderSkinPicker();
        updateMoreGames(this.lang);
    }

    renderChainShowcase() {
        if (!this.el.chain) return;
        this.el.chain.textContent = '';
        CHAIN.forEach((c, i) => {
            const span = document.createElement('span');
            span.className = 'pm-chain-item';
            span.textContent = c.emoji;
            span.title = c.name[this.lang];
            this.el.chain.appendChild(span);
            if (i < CHAIN.length - 1) {
                const arrow = document.createElement('span');
                arrow.className = 'pm-chain-arrow';
                arrow.textContent = '→';
                this.el.chain.appendChild(arrow);
            }
        });
    }

    /**
     * 皮肤选择器（开始界面）：当前皮肤高亮，点击即时切换并持久化
     */
    renderSkinPicker() {
        const row = this.el['skin-row'];
        if (!row) return;
        row.textContent = '';
        Object.entries(SKINS).forEach(([id, skin]) => {
            const btn = document.createElement('button');
            btn.className = 'pm-skin-btn' + (id === skinId ? ' selected' : '');
            btn.textContent = skin.icon + ' ' + skin.label[this.lang];
            btn.addEventListener('click', () => {
                if (id === skinId) return;
                applySkin(id);
                this.renderSkinPicker();
                this.renderChainShowcase();
                this.updateStartStats();
                Sfx.click();
            });
            row.appendChild(btn);
        });
    }

    /* ── start / flow ── */

    updateStartStats() {
        const t = this.TEXT;
        if (this.el['best-line']) {
            this.el['best-line'].textContent = `🏆 ${t.best}: ${formatNumber(this.best)}`;
        }
        const dayBest = storageParse(`pm_daily_${this.dailyDay}`, null);
        if (this.el['daily-best-line']) {
            this.el['daily-best-line'].textContent = dayBest !== null
                ? `📅 ${t.todayBest}: ${formatNumber(dayBest)}`
                : '';
        }
    }

    showStartScreen() {
        this.state = 'menu';
        this.showOverlay('pm-start');
        this.updateStartStats();
    }

    showOverlay(id) {
        ['pm-start', 'pm-pause', 'pm-over'].forEach(screenId => {
            const el = document.getElementById(screenId);
            if (el) el.classList.toggle('hidden', screenId !== id);
        });
        if (id === null) {
            ['pm-start', 'pm-pause', 'pm-over'].forEach(screenId => {
                const el = document.getElementById(screenId);
                if (el) el.classList.add('hidden');
            });
        }
    }

    startGame(mode) {
        this.mode = mode;
        this.dailyDay = todayKey();
        // 每日挑战：以日期为种子，全球玩家同一投放序列
        this.rng = mode === 'daily'
            ? mulberry32(hashString(`planet-merge-${this.dailyDay}`))
            : Math.random;

        this.bodies = [];
        this.particles = [];
        this.popups = [];
        this.shockwaves = [];
        this.score = 0;
        this.combo = 0;
        this.lastMergeAt = -1e9;
        this.mergesCount = 0;
        this.sunsMade = 0;
        this.maxTierSeen = 0;
        this.dangerTimer = 0;
        this.shake = 0;
        this.aimX = WORLD_W / 2;
        this.canDrop = true;
        this.cooldownUntil = 0;
        this.currentTier = this.pickTier();
        this.nextT = this.pickTier();

        this.state = 'playing';
        this.showOverlay(null);
        this.ensureLoop();
        this.updateHud();
        this.updateNextPreview();
        track('planet-merge', 'play');
    }

    pickTier() {
        let r = this.rng() * 100;
        for (let i = 0; i < DROP_WEIGHTS.length; i++) {
            r -= DROP_WEIGHTS[i];
            if (r < 0) return i;
        }
        return 0;
    }

    togglePause() {
        if (this.state === 'playing') {
            this.state = 'paused';
            this.showOverlay('pm-pause');
            this.stopLoop(); // 暂停即停渲染循环
        } else if (this.state === 'paused') {
            this.state = 'playing';
            this.showOverlay(null);
            this.ensureLoop();
        }
    }

    /**
     * 静默暂停 / 恢复 —— 给底部统计抽屉用。
     *
     * 普通的 `togglePause()` 会给玩家看「Paused」遮罩，但打开抽屉时那个遮罩
     * 会顶在抽屉后面闪一下，体验很怪。这里复用同一套状态迁移，只是**不碰遮罩**：
     * 状态与循环的变更和 togglePause 完全一致，保证不会出现"状态说在玩、循环已停"的错配。
     */
    pauseQuiet() {
        if (this.state !== 'playing') return;
        this.state = 'paused';
        this.stopLoop();
    }

    resumeQuiet() {
        if (this.state !== 'paused') return;
        this.state = 'playing';
        this.ensureLoop();
    }

    /** 供抽屉判断"是否值得暂停"：只有真正在跑的对局才需要 */
    isRunning() {
        return this.state === 'playing';
    }

    goHome() {
        this.state = 'menu';
        this.ensureLoop();
        this.render();
        this.showStartScreen();
    }

    /* ── input ── */

    bindInput() {
        const canvas = this.canvas;

        const toWorldX = (clientX) => {
            const rect = canvas.getBoundingClientRect();
            return (clientX - rect.left) * (WORLD_W / rect.width);
        };

        canvas.addEventListener('pointerdown', (e) => {
            if (this.state !== 'playing') return;
            e.preventDefault();
            this.aiming = true;
            this.aimX = clamp(toWorldX(e.clientX), WALL + this.currentRadius(), WORLD_W - WALL - this.currentRadius());
            try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        }, { passive: false });

        canvas.addEventListener('pointermove', (e) => {
            if (!this.aiming || this.state !== 'playing') return;
            e.preventDefault();
            this.aimX = clamp(toWorldX(e.clientX), WALL + this.currentRadius(), WORLD_W - WALL - this.currentRadius());
        }, { passive: false });

        canvas.addEventListener('pointerup', (e) => {
            e.preventDefault();
            if (this.aiming && this.state === 'playing') {
                this.aimX = clamp(toWorldX(e.clientX), WALL + this.currentRadius(), WORLD_W - WALL - this.currentRadius());
                this.dropPlanet();
            }
            this.aiming = false;
        }, { passive: false });

        canvas.addEventListener('pointercancel', () => {
            this.aiming = false;
        });

        document.addEventListener('keydown', (e) => {
            const tag = e.target && e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
            if (e.key === 'p' || e.key === 'P') {
                if (this.state === 'playing' || this.state === 'paused') this.togglePause();
            } else if (e.key === 'm' || e.key === 'M') {
                this.toggleMute();
            } else if ((e.key === 'r' || e.key === 'R') && this.state === 'gameover') {
                this.startGame(this.mode);
            }
        });

        // 切换标签页自动暂停
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.state === 'playing') {
                this.togglePause();
            }
        });
    }

    currentRadius() {
        return CHAIN[this.currentTier].r;
    }

    dropPlanet() {
        const now = performance.now();
        if (!this.canDrop || now < this.cooldownUntil) return;

        const body = new Planet(this.currentTier, this.aimX, SPAWN_Y);
        body.vy = 60;
        body.popScale = 1;
        this.bodies.push(body);

        this.currentTier = this.nextT;
        this.nextT = this.pickTier();
        this.canDrop = false;
        this.cooldownUntil = now + DROP_COOLDOWN;

        Sfx.drop();
        this.updateNextPreview();

        setTimeout(() => {
            this.canDrop = true;
        }, DROP_COOLDOWN);
    }

    updateNextPreview() {
        if (this.el['next-emoji']) {
            this.el['next-emoji'].textContent = CHAIN[this.nextT].emoji;
        }
    }

    /* ── physics ── */

    physicsStep(dt) {
        const bodies = this.bodies;

        for (const b of bodies) {
            b.age += dt;
            b.vy += GRAVITY * dt;
            const damp = Math.exp(-AIR_DAMP * dt);
            b.vx *= damp;
            b.vy *= damp;
            const sp = Math.hypot(b.vx, b.vy);
            if (sp > MAX_SPEED) {
                b.vx *= MAX_SPEED / sp;
                b.vy *= MAX_SPEED / sp;
            }
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            if (b.popScale < 1) {
                b.popScale = Math.min(1, b.popScale + dt * 5);
            }
        }

        // 容器壁与底
        for (const b of bodies) {
            if (b.x - b.r < WALL) {
                b.x = WALL + b.r;
                b.vx = Math.abs(b.vx) * RESTITUTION;
            } else if (b.x + b.r > WORLD_W - WALL) {
                b.x = WORLD_W - WALL - b.r;
                b.vx = -Math.abs(b.vx) * RESTITUTION;
            }
            if (b.y + b.r > WORLD_H - FLOOR) {
                b.y = WORLD_H - FLOOR - b.r;
                b.vy = -Math.abs(b.vy) * RESTITUTION;
                b.vx *= 0.92; // 地面摩擦
            }
        }

        // 圆-圆碰撞（O(n²)，星球数量有限，可接受）
        const mergeCandidates = [];
        for (let i = 0; i < bodies.length; i++) {
            const a = bodies[i];
            for (let j = i + 1; j < bodies.length; j++) {
                const b = bodies[j];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const minD = a.r + b.r;
                const d2 = dx * dx + dy * dy;
                if (d2 >= minD * minD || d2 === 0) continue;

                const d = Math.sqrt(d2);
                const nx = dx / d;
                const ny = dy / d;
                const overlap = minD - d;
                const invA = 1 / a.mass;
                const invB = 1 / b.mass;
                const invSum = invA + invB;

                // 位置修正（按质量比例推开）
                const corr = (overlap * 0.85) / invSum;
                a.x -= nx * corr * invA;
                a.y -= ny * corr * invA;
                b.x += nx * corr * invB;
                b.y += ny * corr * invB;

                // 冲量
                const rvx = b.vx - a.vx;
                const rvy = b.vy - a.vy;
                const velN = rvx * nx + rvy * ny;
                if (velN < 0) {
                    const jImp = (-(1 + RESTITUTION) * velN) / invSum;
                    a.vx -= jImp * nx * invA;
                    a.vy -= jImp * ny * invA;
                    b.vx += jImp * nx * invB;
                    b.vy += jImp * ny * invB;

                    // 切向摩擦
                    const tx = -ny;
                    const ty = nx;
                    const velT = rvx * tx + rvy * ty;
                    const jT = (-velT * 0.08) / invSum;
                    a.vx -= jT * tx * invA;
                    a.vy -= jT * ty * invA;
                    b.vx += jT * tx * invB;
                    b.vy += jT * ty * invB;
                }

                if (a.tier === b.tier) {
                    mergeCandidates.push([a, b]);
                }
            }
        }

        // 合成处理（标记 dead 避免同一次重复合成）
        if (mergeCandidates.length > 0) {
            const merged = new Set();
            for (const [a, b] of mergeCandidates) {
                if (a.dead || b.dead || merged.has(a) || merged.has(b)) continue;
                merged.add(a);
                merged.add(b);
                a.dead = true;
                b.dead = true;
                this.handleMerge(a, b);
            }
            if (merged.size > 0) {
                this.bodies = bodies.filter(b => !b.dead);
            }
        }
    }

    handleMerge(a, b) {
        const now = performance.now();
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        this.mergesCount++;

        // 连锁窗口
        this.combo = (now - this.lastMergeAt < COMBO_WINDOW) ? this.combo + 1 : 1;
        this.lastMergeAt = now;
        const comboMult = 1 + 0.5 * Math.min(this.combo - 1, 7);

        let gained;
        if (a.tier >= MAX_TIER) {
            // 双太阳 → 超新星爆炸：双方消失 + 巨额分数
            gained = Math.round(SUPERNOVA_SCORE * comboMult);
            this.shockwaves.push({ x: cx, y: cy, r: 20, maxR: 300, life: 1 });
            this.spawnParticles(cx, cy, 40, '#fff3c2', 9);
            this.shake = 14;
            Sfx.supernova();
        } else {
            const newTier = a.tier + 1;
            const planet = new Planet(newTier, cx, cy);
            planet.vx = (a.vx + b.vx) / 2;
            planet.vy = (a.vy + b.vy) / 2;
            this.bodies.push(planet);
            const cfg = CHAIN[newTier];
            gained = cfg.score * comboMult;
            this.spawnParticles(cx, cy, 14 + newTier * 2, cfg.light, 5 + newTier * 0.4);
            this.shockwaves.push({ x: cx, y: cy, r: cfg.r * 0.6, maxR: cfg.r * 2.2, life: 1 });
            this.shake = Math.min(10, 3 + newTier);
            Sfx.merge(newTier, this.combo);
            if (newTier === MAX_TIER) this.sunsMade++;
            if (newTier > this.maxTierSeen) this.maxTierSeen = newTier;
        }

        this.score += gained;
        this.popups.push({
            x: cx,
            y: cy - 24,
            text: `+${formatNumber(gained)}`,
            sub: this.combo > 1 ? `COMBO ×${this.combo}` : null,
            life: 1
        });
        this.updateHud();
    }

    spawnParticles(x, y, count, color, speed) {
        const cap = 320;
        for (let i = 0; i < count && this.particles.length < cap; i++) {
            const angle = Math.random() * Math.PI * 2;
            const v = (Math.random() * 0.7 + 0.3) * speed * 60;
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * v,
                vy: Math.sin(angle) * v - 60,
                life: 1,
                decay: 1.6 + Math.random() * 1.4,
                size: 2 + Math.random() * 3.5,
                color
            });
        }
    }

    /* ── danger & game over ── */

    checkDanger(dt) {
        let offender = false;
        for (const b of this.bodies) {
            if (b.age > DANGER_GRACE && b.y - b.r < DANGER_Y) {
                offender = true;
                break;
            }
        }
        if (offender) {
            this.dangerTimer += dt;
            if (this.time - this.lastDangerBeep > 0.45) {
                this.lastDangerBeep = this.time;
                Sfx.danger();
            }
            if (this.dangerTimer >= DANGER_LIMIT) {
                this.endGame();
            }
        } else {
            this.dangerTimer = Math.max(0, this.dangerTimer - dt * 2.5);
        }
    }

    endGame() {
        if (this.state !== 'playing') return;
        this.state = 'gameover';
        this.aiming = false;
        Sfx.gameOver();

        const isNewBest = this.score > this.best;
        if (isNewBest) {
            this.best = this.score;
            storageSet('pm_best', String(this.best));
            this.updateSideRecords();
        }
        const isDaily = this.mode === 'daily';
        if (isDaily) {
            const key = `pm_daily_${this.dailyDay}`;
            const prev = storageParse(key, 0);
            if (this.score > prev) storageSet(key, String(this.score));
        }

        // 填充结算界面
        const t = this.TEXT;
        if (this.el['over-score']) this.el['over-score'].textContent = formatNumber(this.score);
        if (this.el['over-best']) this.el['over-best'].textContent = `${t.best}: ${formatNumber(this.best)}`;
        if (this.el['over-newbest']) {
            this.el['over-newbest'].textContent = isNewBest ? `🌟 ${t.newBest}` : '';
            this.el['over-newbest'].classList.toggle('show', isNewBest);
            if (isNewBest) Sfx.newBest();
        }
        const maxCfg = CHAIN[this.maxTierSeen] || CHAIN[0];
        if (this.el['over-max']) {
            this.el['over-max'].textContent = `${t.largestPlanet}: ${maxCfg.emoji} ${maxCfg.name[this.lang]}`;
        }
        if (this.el['over-suns']) {
            this.el['over-suns'].textContent = `☀️ ${t.sunsForged}: ${this.sunsMade}`;
        }
        if (this.el['over-merges']) {
            this.el['over-merges'].textContent = `✨ ${t.merges}: ${this.mergesCount}`;
        }

        this.showOverlay('pm-over');
        // 先同步记录本地榜，再尝试全球榜（Worker 离线也不影响本地成绩显示）
        track('planet-merge', 'finish');
        this.recordLocalScore();
        this.leaderboardTab = isDaily ? 'daily' : 'alltime';
        this.updateLbTabs();
        this.renderLocalScores();
        this.fetchLeaderboard();
        this.submitScore();
        this.updateHud();
    }

    /* ── persistence & hud ── */

    updateHud() {
        if (this.el.score) this.el.score.textContent = formatNumber(this.score);
        if (this.el.best) this.el.best.textContent = formatNumber(Math.max(this.best, this.score));
        if (this.el['mode-label']) {
            this.el['mode-label'].textContent = this.mode === 'daily' ? `📅 ${this.TEXT.modeDaily}` : `♾️ ${this.TEXT.modeEndless}`;
        }
    }

    updateMuteButtons() {
        const icon = Sfx.muted ? ICONS.soundOff : ICONS.soundOn;
        if (this.el['mute-btn']) this.el['mute-btn'].innerHTML = icon;
        if (this.el['start-mute']) this.el['start-mute'].innerHTML = icon;
    }

    /** 桌面侧栏战绩（≥1024px 可见） */
    updateSideRecords() {
        const box = this.el['side-records'];
        if (!box) return;
        const t = this.TEXT;
        const rows = [
            [`🏆 ${t.best}`, formatNumber(this.best)]
        ];
        box.textContent = '';
        rows.forEach(([label, value]) => {
            const row = document.createElement('div');
            row.className = 'pm-side-row game-side-row';
            const labelEl = document.createElement('span');
            labelEl.textContent = label;
            const valueEl = document.createElement('b');
            valueEl.textContent = value;
            row.append(labelEl, valueEl);
            box.appendChild(row);
        });
    }

    toggleMute() {
        Sfx.toggleMuted();
        this.updateMuteButtons();
        if (!Sfx.muted) Sfx.click();
    }

    /* ── leaderboard ── */

    localScores() {
        const all = storageParse('pm_local_scores', []);
        return Array.isArray(all) ? all : [];
    }

    renderLocalScores() {
        const t = this.TEXT;
        const list = this.el['lb-list'];
        if (!list) return;
        list.textContent = '';
        const day = this.dailyDay;
        const filtered = this.localScores()
            .filter(s => this.leaderboardTab === 'alltime' || s.day === day)
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);
        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'pm-lb-empty';
            empty.textContent = t.noScores;
            list.appendChild(empty);
            return;
        }
        filtered.forEach((s, i) => {
            list.appendChild(this.buildLbRow(i, s));
        });
    }

    buildLbRow(rank, entry) {
        const row = document.createElement('div');
        row.className = 'pm-lb-row' + (rank < 3 ? ` pm-lb-top${rank + 1}` : '');
        const rankEl = document.createElement('span');
        rankEl.className = 'pm-lb-rank';
        rankEl.textContent = `${rank + 1}.`;
        const nameEl = document.createElement('span');
        nameEl.className = 'pm-lb-name';
        nameEl.textContent = entry.name; // textContent 防注入
        const scoreEl = document.createElement('span');
        scoreEl.className = 'pm-lb-score';
        scoreEl.textContent = formatNumber(entry.score);
        row.append(rankEl, nameEl, scoreEl);
        return row;
    }

    async fetchLeaderboard() {
        const statusEl = this.el['lb-status'];
        const list = this.el['lb-list'];
        if (!list) return;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        try {
            // 共享榜 Worker：每日榜是按天一个 game id（planet-merge-d<YYYYMMDD>）
            const game = this.leaderboardTab === 'daily' ? `planet-merge-d${this.dailyDay}` : 'planet-merge';
            const res = await fetch(`${LEADERBOARD_URL}/scores?game=${game}`, {
                signal: controller.signal,
                mode: 'cors'
            });
            clearTimeout(timeoutId);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (this.state !== 'gameover') return;
            if (!Array.isArray(data) || data.length === 0) {
                list.textContent = '';
                const empty = document.createElement('div');
                empty.className = 'pm-lb-empty';
                empty.textContent = this.TEXT.noScores;
                list.appendChild(empty);
            } else {
                list.textContent = '';
                data.slice(0, 10).forEach((entry, i) => {
                    list.appendChild(this.buildLbRow(i, entry));
                });
            }
            if (statusEl) statusEl.textContent = '';
        } catch (e) {
            clearTimeout(timeoutId);
            // Worker 未部署/网络失败：保留本地榜
            if (statusEl) statusEl.textContent = this.TEXT.lbOffline;
        }
    }

    /**
     * 同步记录本地榜（无网络依赖，结算面板立即可见）
     */
    recordLocalScore() {
        if (this.score <= 0) return;
        const local = this.localScores();
        local.push({ name: this.getUsername(), score: this.score, day: this.dailyDay, mode: this.mode });
        local.sort((a, b) => b.score - a.score);
        storageSet('pm_local_scores', JSON.stringify(local.slice(0, 30)));
    }

    async submitScore() {
        if (this.score <= 0) return;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        // 与旧 Worker 语义一致：每次提交同时进总榜与当日榜（两个 game id）
        const entries = [
            { game: 'planet-merge', score: this.score },
            { game: `planet-merge-d${this.dailyDay}`, score: this.score }
        ];
        try {
            await Promise.all(entries.map(entry => fetch(`${LEADERBOARD_URL}/scores`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: this.getUsername(), ...entry }),
                signal: controller.signal,
                mode: 'cors'
            })));
            clearTimeout(timeoutId);
        } catch (e) {
            // 提交失败：本地榜已由 recordLocalScore 记录，但要让玩家知道未进全球榜
            this.showToast(this.TEXT.lbSubmitFail);
        }
    }

    showToast(msg, duration = 2400) {
        const toast = this.el.toast;
        if (!toast) return;
        toast.textContent = msg;
        toast.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
    }

    getUsername() {
        // 统一玩家身份：全站共享昵称（player.js 自动迁移旧的 pm_username）
        return ensurePlayerName();
    }

    updateLbTabs() {
        if (this.el['tab-daily']) this.el['tab-daily'].classList.toggle('active', this.leaderboardTab === 'daily');
        if (this.el['tab-alltime']) this.el['tab-alltime'].classList.toggle('active', this.leaderboardTab === 'alltime');
    }

    /* ── share ── */

    buildShareText() {
        const t = this.TEXT;
        const maxCfg = CHAIN[this.maxTierSeen] || CHAIN[0];
        const chainEmojis = CHAIN.slice(0, Math.max(3, this.maxTierSeen + 1)).map(c => c.emoji).join('');
        const modeLabel = this.mode === 'daily' ? `📅 ${t.daily} ${todayKeyDisplay()}` : `♾️ ${t.endless}`;
        return `🪐 ${t.title}\n${modeLabel}\n${t.score}: ${formatNumber(this.score)}  ${t.best}: ${formatNumber(this.best)}\n${t.largestPlanet}: ${maxCfg.emoji} ${maxCfg.name[this.lang]}\n${chainEmojis}\nhttps://games.orangely.xyz/planet-merge.html`;
    }

    async copyResult() {
        const text = this.buildShareText();
        let ok = false;
        try {
            await navigator.clipboard.writeText(text);
            ok = true;
        } catch (e) {
            // 降级：隐藏 textarea + execCommand
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.cssText = 'position:fixed;opacity:0;left:-999px;top:-999px;';
                document.body.appendChild(ta);
                ta.select();
                ok = document.execCommand('copy');
                ta.remove();
            } catch (e2) {
                ok = false;
            }
        }
        if (this.el['btn-copy']) {
            const original = `📋 ${this.TEXT.copyResult}`;
            this.el['btn-copy'].textContent = ok ? `✅ ${this.TEXT.copied}` : original;
            setTimeout(() => {
                if (this.el['btn-copy']) this.el['btn-copy'].textContent = original;
            }, 1600);
        }
    }

    async shareResult() {
        const text = this.buildShareText();
        // 生成分享图
        let shareFile = null;
        try {
            const cardCanvas = this.drawShareCard();
            const blob = await new Promise(resolve => cardCanvas.toBlob(resolve, 'image/png'));
            if (blob) {
                shareFile = new File([blob], 'planet-merge.png', { type: 'image/png' });
            }
        } catch (e) {
            // 分享图生成失败不阻塞分享
        }
        try {
            if (shareFile && navigator.canShare && navigator.canShare({ files: [shareFile] })) {
                await navigator.share({ files: [shareFile], text });
                return;
            }
            if (navigator.share) {
                await navigator.share({ text });
                return;
            }
        } catch (e) {
            // 用户取消或分享失败，回退到复制
        }
        await this.copyResult();
    }

    drawShareCard() {
        const c = document.createElement('canvas');
        c.width = 900;
        c.height = 1100;
        const ctx = c.getContext('2d');
        const t = this.TEXT;

        const bg = ctx.createLinearGradient(0, 0, 900, 1100);
        bg.addColorStop(0, '#0b0f24');
        bg.addColorStop(0.55, '#141a3a');
        bg.addColorStop(1, '#1c1440');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, 900, 1100);

        // 星星
        for (let i = 0; i < 90; i++) {
            ctx.globalAlpha = 0.25 + Math.random() * 0.5;
            ctx.fillStyle = '#fff';
            const r = Math.random() * 1.8 + 0.4;
            ctx.beginPath();
            ctx.arc(Math.random() * 900, Math.random() * 1100, r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // 边框
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 3;
        ctx.strokeRect(28, 28, 844, 1044);

        ctx.textAlign = 'center';
        ctx.fillStyle = '#c9d4ff';
        ctx.font = '600 34px "Segoe UI", system-ui, sans-serif';
        ctx.fillText(`🪐 ${t.title}`, 450, 130);

        ctx.fillStyle = '#ffffff';
        ctx.font = '800 132px "Segoe UI", system-ui, sans-serif';
        ctx.fillText(formatNumber(this.score), 450, 330);

        ctx.fillStyle = '#8fa0d8';
        ctx.font = '34px "Segoe UI", system-ui, sans-serif';
        ctx.fillText(`${t.score}  ·  ${t.best}: ${formatNumber(this.best)}`, 450, 400);

        // 星球链
        const maxCfg = CHAIN[this.maxTierSeen] || CHAIN[0];
        ctx.font = '72px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
        ctx.fillText(maxCfg.emoji, 450, 560);
        ctx.fillStyle = '#e8ecff';
        ctx.font = '600 40px "Segoe UI", system-ui, sans-serif';
        ctx.fillText(`${t.largestPlanet}: ${maxCfg.name[this.lang]}`, 450, 650);

        const stats = `${t.sunsForged}: ${this.sunsMade}   ·   ${t.merges}: ${this.mergesCount}`;
        ctx.fillStyle = '#8fa0d8';
        ctx.font = '32px "Segoe UI", system-ui, sans-serif';
        ctx.fillText(stats, 450, 720);

        const modeLabel = this.mode === 'daily' ? `📅 ${t.daily} · ${todayKeyDisplay()}` : `♾️ ${t.endless}`;
        ctx.fillStyle = '#a9b6ea';
        ctx.font = '34px "Segoe UI", system-ui, sans-serif';
        ctx.fillText(modeLabel, 450, 830);

        // 星球链带
        const chainY = 930;
        const total = CHAIN.length;
        CHAIN.forEach((cfg, i) => {
            const x = 120 + (660 / (total - 1)) * i;
            ctx.font = `${28 + i * 5}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
            ctx.fillText(cfg.emoji, x, chainY);
        });

        ctx.fillStyle = '#6d7bb2';
        ctx.font = '26px "Segoe UI", system-ui, sans-serif';
        ctx.fillText('games.orangely.xyz/planet-merge', 450, 1030);

        return c;
    }

    /* ── UI wiring ── */

    bindUI() {
        const on = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', (e) => {
                e.preventDefault();
                Sfx.click();
                fn();
            });
        };

        on('pm-btn-endless', () => this.startGame('endless'));
        on('pm-btn-daily', () => this.startGame('daily'));
        on('pm-btn-resume', () => this.togglePause());
        on('pm-btn-restart', () => this.startGame(this.mode));
        on('pm-btn-menu', () => this.goHome());
        on('pm-btn-again', () => this.startGame(this.mode));
        on('pm-btn-home2', () => this.goHome());
        on('pm-pause-btn', () => this.togglePause());
        on('pm-mute-btn', () => this.toggleMute());
        on('pm-home-btn', () => {
            window.location.href = 'index.html';
        });
        on('pm-start-mute', () => this.toggleMute());
        on('pm-start-lang', () => {
            setLang(this.lang === 'zh' ? 'en' : 'zh');
            this.applyLanguage();
        });
        on('pm-btn-copy', () => this.copyResult());
        on('pm-btn-share', () => this.shareResult());
        on('pm-tab-daily', () => {
            this.leaderboardTab = 'daily';
            this.updateLbTabs();
            this.renderLocalScores();
            this.fetchLeaderboard();
        });
        on('pm-tab-alltime', () => {
            this.leaderboardTab = 'alltime';
            this.updateLbTabs();
            this.renderLocalScores();
            this.fetchLeaderboard();
        });

        const username = document.getElementById('pm-username');
        if (username) {
            username.value = this.getUsername();
            username.addEventListener('change', () => {
                // 写入全局玩家身份，全站排行榜同步
                username.value = setPlayerName(username.value);
            });
            username.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') username.blur();
            });
        }
    }

    /* ── render ── */

    resize() {
        const dpr = window.devicePixelRatio || 1;
        // 可用高度 = 视口高度 - shell 直接子节点里除 .game-main 之外的部分
        // （顶栏 + 页脚 + 抽屉）。旧实现取 canvas.parentElement.parentElement
        // 得到的是 .game-main，其非舞台子节点只有侧栏 —— usedH 实际等于侧栏
        // 高度，与"视口高度 - 顶栏页脚"的注释完全不是一回事（2026-09-19 修正）。
        const shell = this.canvas.closest('.game-shell');
        const main = this.canvas.closest('.game-main');
        const usedH = shell
            ? Array.from(shell.children)
                .filter(el => el !== main)
                .reduce((sum, el) => sum + el.getBoundingClientRect().height, 0)
            : 120;
        const availH = Math.max(320, window.innerHeight - usedH - 20);
        // 量舞台不量画布：本方法会把 cssWidth 写进内联 style.width，内联胜过
        // width:100%，再用 clientWidth 当输入就自锁了 —— 舞台放宽画布也不会长
        const stage = this.canvas.parentElement;
        let cssWidth = (stage && stage.clientWidth) || WORLD_W;
        let cssHeight = cssWidth * (WORLD_H / WORLD_W);
        if (cssHeight > availH) {
            cssHeight = availH;
            cssWidth = cssHeight * (WORLD_W / WORLD_H);
        }
        this.canvas.width = Math.round(cssWidth * dpr);
        this.canvas.height = Math.round(cssHeight * dpr);
        this.canvas.style.width = `${cssWidth}px`;
        this.canvas.style.height = `${cssHeight}px`;
        this.scale = (cssWidth / WORLD_W) * dpr;
        this.buildStarfield();
    }

    buildStarfield() {
        const c = document.createElement('canvas');
        c.width = Math.max(1, this.canvas.width);
        c.height = Math.max(1, this.canvas.height);
        const ctx = c.getContext('2d');
        const bg = ctx.createLinearGradient(0, 0, 0, c.height);
        bg.addColorStop(0, '#0a0e24');
        bg.addColorStop(0.6, '#111737');
        bg.addColorStop(1, '#181240');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, c.width, c.height);
        // 星星
        const starCount = Math.round((c.width * c.height) / 5200);
        for (let i = 0; i < starCount; i++) {
            const a = 0.15 + Math.random() * 0.6;
            ctx.globalAlpha = a;
            ctx.fillStyle = Math.random() < 0.12 ? '#ffd9a0' : '#dfe7ff';
            const r = Math.random() * 1.4 + 0.3;
            ctx.beginPath();
            ctx.arc(Math.random() * c.width, Math.random() * c.height, r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        // 星云
        const nebula = ctx.createRadialGradient(c.width * 0.75, c.height * 0.2, 10, c.width * 0.75, c.height * 0.2, c.width * 0.7);
        nebula.addColorStop(0, 'rgba(99,102,241,0.13)');
        nebula.addColorStop(1, 'rgba(99,102,241,0)');
        ctx.fillStyle = nebula;
        ctx.fillRect(0, 0, c.width, c.height);
        const nebula2 = ctx.createRadialGradient(c.width * 0.15, c.height * 0.75, 10, c.width * 0.15, c.height * 0.75, c.width * 0.6);
        nebula2.addColorStop(0, 'rgba(52,211,153,0.08)');
        nebula2.addColorStop(1, 'rgba(52,211,153,0)');
        ctx.fillStyle = nebula2;
        ctx.fillRect(0, 0, c.width, c.height);
        this.starfield = c;
    }

    predictLanding(tier, x) {
        const r = CHAIN[tier].r;
        let y = SPAWN_Y;
        const stepSize = 5;
        while (y + r < WORLD_H - FLOOR) {
            const ny = y + stepSize;
            let hit = ny + r > WORLD_H - FLOOR;
            if (!hit) {
                for (const b of this.bodies) {
                    const dx = b.x - x;
                    const dy = b.y - ny;
                    const rr = b.r + r;
                    if (dx * dx + dy * dy < rr * rr) {
                        hit = true;
                        break;
                    }
                }
            }
            if (hit) break;
            y = ny;
        }
        return y;
    }

    render() {
        const ctx = this.ctx;
        ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
        this.time += 1 / 60;

        // 屏幕震动
        let shakeX = 0;
        let shakeY = 0;
        if (this.shake > 0.1) {
            shakeX = (Math.random() - 0.5) * this.shake;
            shakeY = (Math.random() - 0.5) * this.shake;
            this.shake *= 0.88;
        } else {
            this.shake = 0;
        }
        ctx.save();
        ctx.translate(shakeX, shakeY);

        // 背景
        if (this.starfield) {
            ctx.drawImage(this.starfield, -shakeX * this.scale, -shakeY * this.scale, WORLD_W, WORLD_H);
        } else {
            ctx.fillStyle = '#0a0e24';
            ctx.fillRect(0, 0, WORLD_W, WORLD_H);
        }

        // 容器
        this.drawJar(ctx);

        // 危险线
        this.drawDangerLine(ctx);

        // 星球
        for (const b of this.bodies) {
            this.drawPlanet(ctx, b);
        }

        // 瞄准状态
        if (this.state === 'playing' && this.canDrop) {
            this.drawAim(ctx);
        } else if (this.state === 'playing') {
            // 冷却中的半透明预览
            ctx.globalAlpha = 0.35;
            this.drawPlanetShape(ctx, this.currentTier, this.aimX, SPAWN_Y, 1);
            ctx.globalAlpha = 1;
        }

        // 粒子
        for (const p of this.particles) {
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // 冲击波
        for (const s of this.shockwaves) {
            ctx.globalAlpha = Math.max(0, s.life) * 0.8;
            ctx.strokeStyle = '#ffe9a8';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // 飘分文字
        for (const p of this.popups) {
            const alpha = Math.max(0, p.life);
            ctx.globalAlpha = alpha;
            ctx.textAlign = 'center';
            ctx.font = '800 22px "Segoe UI", system-ui, sans-serif';
            ctx.fillStyle = '#ffe9a8';
            ctx.fillText(p.text, p.x, p.y);
            if (p.sub) {
                ctx.font = '700 15px "Segoe UI", system-ui, sans-serif';
                ctx.fillStyle = '#ff9f6e';
                ctx.fillText(p.sub, p.x, p.y - 24);
            }
        }
        ctx.globalAlpha = 1;

        ctx.restore();
    }

    drawJar(ctx) {
        // 容器内侧微光
        const inner = ctx.createLinearGradient(0, 0, 0, WORLD_H);
        inner.addColorStop(0, 'rgba(255,255,255,0.045)');
        inner.addColorStop(0.3, 'rgba(255,255,255,0.015)');
        inner.addColorStop(1, 'rgba(0,0,0,0.22)');
        ctx.fillStyle = inner;
        ctx.fillRect(WALL, 0, WORLD_W - WALL * 2, WORLD_H - FLOOR);

        ctx.strokeStyle = 'rgba(148,163,255,0.35)';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(WALL, 0, WORLD_W - WALL * 2, WORLD_H - FLOOR);

        // 底部
        ctx.fillStyle = 'rgba(148,163,255,0.18)';
        ctx.fillRect(WALL, WORLD_H - FLOOR, WORLD_W - WALL * 2, FLOOR);
    }

    drawDangerLine(ctx) {
        const t = this.time;
        const warn = this.dangerTimer > 0;
        const pulse = warn ? 0.5 + 0.5 * Math.sin(t * 12) : 0.35 + 0.12 * Math.sin(t * 2);
        const progress = clamp(this.dangerTimer / DANGER_LIMIT, 0, 1);

        ctx.save();
        ctx.setLineDash([10, 8]);
        ctx.lineWidth = warn ? 2.5 + progress * 1.5 : 1.5;
        ctx.strokeStyle = `rgba(${warn ? '255,86,86' : '148,163,255'},${0.35 + pulse * 0.4})`;
        ctx.beginPath();
        ctx.moveTo(WALL + 4, DANGER_Y);
        ctx.lineTo(WORLD_W - WALL - 4, DANGER_Y);
        ctx.stroke();
        ctx.restore();

        // 危险进度：越线越久线越红
        if (progress > 0) {
            ctx.fillStyle = `rgba(255,86,86,${0.08 + progress * 0.15})`;
            ctx.fillRect(WALL, 0, WORLD_W - WALL * 2, DANGER_Y);
        }
    }

    drawPlanet(ctx, b) {
        const wobble = 1 + Math.sin(this.time * 10) * 0.02 * (1 - b.popScale);
        const scale = b.popScale * (b.popScale < 1 ? wobble : 1);
        this.drawPlanetShape(ctx, b.tier, b.x, b.y, scale);
    }

    drawPlanetShape(ctx, tier, x, y, scale) {
        const cfg = CHAIN[tier];
        const r = cfg.r * scale;

        ctx.save();

        // 太阳光晕
        if (cfg.glow) {
            const glow = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 1.6);
            glow.addColorStop(0, 'rgba(255,220,120,0.5)');
            glow.addColorStop(1, 'rgba(255,220,120,0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(x, y, r * 1.6, 0, Math.PI * 2);
            ctx.fill();
        }

        // 土星环（后半）
        if (cfg.ring) {
            ctx.strokeStyle = 'rgba(232,203,138,0.85)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.ellipse(x, y, r * 1.45, r * 0.42, -0.35, Math.PI, Math.PI * 2);
            ctx.stroke();
        }

        // 球体
        const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.15, x, y, r);
        grad.addColorStop(0, cfg.light);
        grad.addColorStop(0.55, cfg.color);
        grad.addColorStop(1, cfg.dark);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();

        // 高光
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.beginPath();
        ctx.ellipse(x - r * 0.32, y - r * 0.42, r * 0.22, r * 0.13, -0.6, 0, Math.PI * 2);
        ctx.fill();

        // emoji 纹理（缩到约 r*0.72，整体下移，让渐变球体当主角；高级星球更小）
        const emojiScale = tier <= 3 ? 0.72 : 0.5;
        ctx.font = `${r * emojiScale}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(cfg.emoji, x, y + r * 0.18);

        // 土星环（前半）
        if (cfg.ring) {
            ctx.strokeStyle = '#f0d9a0';
            ctx.lineWidth = 4.5;
            ctx.beginPath();
            ctx.ellipse(x, y, r * 1.45, r * 0.42, -0.35, 0, Math.PI);
            ctx.stroke();
        }

        ctx.restore();
    }

    drawAim(ctx) {
        const r = this.currentRadius();
        const landingY = this.predictLanding(this.currentTier, this.aimX);

        // 引导虚线
        ctx.save();
        ctx.setLineDash([6, 9]);
        ctx.strokeStyle = 'rgba(255,255,255,0.32)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(this.aimX, SPAWN_Y + r);
        ctx.lineTo(this.aimX, landingY - r);
        ctx.stroke();
        ctx.restore();

        // 落点虚影
        ctx.globalAlpha = 0.22;
        this.drawPlanetShape(ctx, this.currentTier, this.aimX, landingY, 1);
        ctx.globalAlpha = 1;

        // 悬挂星球
        const bob = Math.sin(this.time * 2.2) * 2;
        this.drawPlanetShape(ctx, this.currentTier, this.aimX, SPAWN_Y + bob, 1);

        // 悬挂轨道
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(WALL + 4, SPAWN_Y);
        ctx.lineTo(WORLD_W - WALL - 4, SPAWN_Y);
        ctx.stroke();
    }

    /* ── effects update ── */

    updateEffects(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= p.decay * dt;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 600 * dt;
        }
        for (let i = this.popups.length - 1; i >= 0; i--) {
            const p = this.popups[i];
            p.life -= 1.1 * dt;
            p.y -= 46 * dt;
            if (p.life <= 0) this.popups.splice(i, 1);
        }
        for (let i = this.shockwaves.length - 1; i >= 0; i--) {
            const s = this.shockwaves[i];
            s.life -= 2.2 * dt;
            s.r += (s.maxR - s.r) * 6 * dt;
            if (s.life <= 0) this.shockwaves.splice(i, 1);
        }
    }

    /* ── main loop ── */

    ensureLoop() {
        if (this.animationId) return;
        this.lastFrameTime = performance.now();
        this.accumulator = 0;
        this.animationId = requestAnimationFrame(this.loopBound);
    }

    stopLoop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    startLoop() {
        this.loopBound = (now) => {
            const dtMs = Math.min(now - this.lastFrameTime, 50);
            this.lastFrameTime = now;

            if (this.state === 'playing') {
                this.animationId = requestAnimationFrame(this.loopBound);

                // 固定步长物理累加器
                this.accumulator += dtMs / 1000;
                let steps = 0;
                while (this.accumulator >= PHYS_STEP && steps < 8) {
                    this.physicsStep(PHYS_STEP);
                    this.accumulator -= PHYS_STEP;
                    steps++;
                }
                this.checkDanger(dtMs / 1000);
                this.updateEffects(dtMs / 1000);
            } else {
                // 非进行中：只让粒子余韵继续衰减，衰减完即停止循环省电
                this.updateEffects(dtMs / 1000);
                const effectsActive = this.particles.length > 0 || this.popups.length > 0 || this.shockwaves.length > 0;
                if (effectsActive) {
                    this.animationId = requestAnimationFrame(this.loopBound);
                } else {
                    this.animationId = null;
                    this.render();
                    return;
                }
            }

            this.render();
        };
        this.lastFrameTime = performance.now();
        this.animationId = requestAnimationFrame(this.loopBound);
    }
}

/* ────────────────────────── bootstrap ────────────────────────── */

window.addEventListener('DOMContentLoaded', () => {
    window.planetMergeGame = new PlanetMergeGame();

    // 桌面端舞台纵向预算：实测 --frame-chrome 写入 shell（首帧兜底 150px），
    // 变化后经 game-frame:changed 驱动上面的 resize()
    bindFrame({ logicalWidth: WORLD_W });

    // 桌面侧栏「更多游戏」卡（P3）：语言切换由 more-games.js 的全局
    // updateMoreGames 监听自动同步（id 不以 MoreNav 结尾）
    const pmSideMore = document.getElementById('pmSideMore');
    if (pmSideMore) renderMoreGames(pmSideMore, { exclude: 'planet-merge.html' });

    // 移动端底部统计抽屉：把侧栏面板收进抽屉，顶栏 Stats 钮开合
    window.pmDrawer = createStatsDrawer({
        idPrefix: 'pm',
        getGame: () => window.planetMergeGame,
        onPause: (g) => g && g.pauseQuiet(),
        onResume: (g) => g && g.resumeQuiet(),
        isBusy: () => {
            const g = window.planetMergeGame;
            return !!g && typeof g.isRunning === 'function' && g.isRunning();
        },
        ICONS,
        getText: () => LANGUAGES[getLang()] || LANGUAGES.en,
    });
    if (window.pmDrawer) window.pmDrawer.init();

    // 顶栏语言钮由 chrome 接管后，切换只派发 site-settings:changed —— 本页此前没有
    // 监听它（语言只在开始浮层里切，切完自己调 applyLanguage），补上才会真正刷新。
    window.addEventListener('site-settings:changed', () => {
        if (window.planetMergeGame) window.planetMergeGame.applyLanguage();
    });
});

/* ── 顶栏 / 页脚通用控件：Home · Sound · Lang · More ──
   槽位结构见 css/layout.css 的契约，行为统一由 js/game-chrome.js 接管。
   owns 默认只含 lang / more：静音钮在本页早就有自己的 handler（还要顺带做
   SFX 初始化之类的页面私事），chrome 再挂一个就会一次点击切换两次 = 净效果为零。 */
window.addEventListener('DOMContentLoaded', () => {
    bindChrome({
        self: 'planet-merge.html',
        owns: ['lang', 'more'],
        getText: () => LANGUAGES[getLang()] || LANGUAGES.en,
        labels: { pause: () => (LANGUAGES[getLang()] || {}).pause },
    });
});
