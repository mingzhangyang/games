/**
 * Neon Tower Defense 霓虹塔防
 * Canvas 塔防：脉冲 / 冰霜 / 加农 / 电磁四类塔，25 波敌人，
 * 升级与出售（70% 回收），×2 倍速，全球排行榜。
 *
 * 逻辑坐标固定 480×640（12×16 格，格宽 40），渲染时按容器宽度
 * 等比缩放并乘 devicePixelRatio；背景静态层离屏预渲染；
 * 敌人/塔的光晕用预渲染精灵，避免逐帧 shadowBlur。
 *
 * Vanilla JS. No runtime dependencies.
 */

import { ensurePlayerName, setPlayerName } from './player.js';
import { getLang, setLang, getMuted, setMuted } from './site-settings.js';
import { ICONS } from './icons.js';

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

function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
}

function formatNumber(n) {
    return Number(n).toLocaleString('en-US');
}

/* ────────────────────────── i18n ────────────────────────── */

const LANGUAGES = {
    en: {
        title: 'Neon Tower Defense',
        subtitle: 'Build · Upgrade · Survive',
        howto: 'Tap a free cell to build a tower, tap a tower to upgrade or sell. Stop every creep before it reaches your core — 25 waves and you win!',
        play: 'Play',
        pulse: 'Pulse', frost: 'Frost', cannon: 'Cannon', tesla: 'Tesla',
        pulseDesc: 'rapid single shot', frostDesc: 'slows creeps', cannonDesc: 'splash damage', teslaDesc: 'chain lightning',
        towerIntro: '🔹 Pulse · ❄️ Frost · 💥 Cannon · ⚡ Tesla',
        wave: 'Wave',
        startWave: '▶ Wave {n}',
        waveRunning: 'Wave {n}',
        paused: 'Paused',
        resume: 'Resume',
        home: 'Home',
        again: 'Play Again',
        gameOver: 'Base Destroyed',
        victory: 'VICTORY!',
        defeatSub: 'You reached wave {n}',
        victorySub: 'All 25 waves cleared — {lives} lives left',
        score: 'Score',
        best: 'Best',
        newBest: 'NEW BEST!',
        waveCleared: 'Wave {n} cleared! +{g} gold',
        bossIncoming: '⚠️ BOSS INCOMING',
        notEnoughGold: 'Not enough gold',
        cantBuild: 'Can\'t build here',
        maxLevel: 'MAX',
        upgrade: 'Upgrade',
        sell: 'Sell',
        dmg: 'DMG', range: 'RNG', rate: 'RATE',
        leaderboard: 'Global Top 10',
        loadingScores: 'Loading…',
        noScores: 'No scores yet',
        lbOffline: 'Leaderboard offline',
        usernameLabel: 'Username (Enter to save)',
        copyResult: 'Copy',
        copied: 'Copied!',
        language: '中文',
        hint: 'Tap a free cell to build · tap a tower to upgrade'
    },
    zh: {
        title: '霓虹塔防',
        subtitle: '建造 · 升级 · 守护',
        howto: '点击空格子建塔，点击塔升级或出售。别让任何敌人碰到核心——守住 25 波即获胜！',
        play: '开始游戏',
        pulse: '脉冲塔', frost: '冰霜塔', cannon: '加农炮', tesla: '电磁塔',
        pulseDesc: '高速单发', frostDesc: '减速光环', cannonDesc: '溅射伤害', teslaDesc: '闪电连锁',
        towerIntro: '🔹 脉冲 · ❄️ 冰霜 · 💥 加农 · ⚡ 电磁',
        wave: '第',
        startWave: '▶ 第 {n} 波',
        waveRunning: '第 {n} 波',
        paused: '已暂停',
        resume: '继续游戏',
        home: '返回主页',
        again: '再来一局',
        gameOver: '核心被摧毁',
        victory: '胜利！',
        defeatSub: '你到达了第 {n} 波',
        victorySub: '25 波全部守住——剩余 {lives} 条生命',
        score: '得分',
        best: '最佳',
        newBest: '新纪录！',
        waveCleared: '第 {n} 波守住！+{g} 金币',
        bossIncoming: '⚠️ BOSS 来袭',
        notEnoughGold: '金币不足',
        cantBuild: '这里不能建造',
        maxLevel: '满级',
        upgrade: '升级',
        sell: '出售',
        dmg: '攻击', range: '射程', rate: '攻速',
        leaderboard: '全球前 10',
        loadingScores: '加载中…',
        noScores: '暂无分数',
        lbOffline: '榜单离线',
        usernameLabel: '用户名（回车保存）',
        copyResult: '复制',
        copied: '已复制！',
        language: 'English',
        hint: '点空格建塔 · 点塔升级'
    }
};

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

    tone({ freq = 440, endFreq = null, type = 'sine', duration = 0.1, volume = 0.14, delay = 0 }) {
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

    noise(duration = 0.25, volume = 0.15, delay = 0) {
        const ctx = this.ensure();
        if (!ctx) return;
        const now = ctx.currentTime + delay;
        const buffer = ctx.createBuffer(1, Math.max(1, ctx.sampleRate * duration), ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 1.6);
        }
        const src = ctx.createBufferSource();
        const gain = ctx.createGain();
        gain.gain.value = volume;
        src.buffer = buffer;
        src.connect(gain).connect(ctx.destination);
        src.start(now);
    },

    place() { this.tone({ freq: 300, endFreq: 520, type: 'triangle', duration: 0.12, volume: 0.16 }); },
    upgrade() {
        this.tone({ freq: 520, type: 'triangle', duration: 0.09, volume: 0.14 });
        this.tone({ freq: 780, type: 'triangle', duration: 0.11, volume: 0.12, delay: 0.07 });
    },
    sell() { this.tone({ freq: 520, endFreq: 260, type: 'sine', duration: 0.14, volume: 0.13 }); },
    explode() { this.noise(0.22, 0.16); this.tone({ freq: 140, endFreq: 60, type: 'sawtooth', duration: 0.2, volume: 0.14 }); },
    zap() { this.tone({ freq: 900, endFreq: 240, type: 'sawtooth', duration: 0.1, volume: 0.08 }); },
    leak() {
        this.tone({ freq: 220, endFreq: 90, type: 'square', duration: 0.25, volume: 0.18 });
        this.noise(0.15, 0.1);
    },
    bigDeath() { this.noise(0.35, 0.2); this.tone({ freq: 180, endFreq: 50, type: 'sawtooth', duration: 0.3, volume: 0.16 }); },
    waveStart() {
        this.tone({ freq: 392, type: 'triangle', duration: 0.12, volume: 0.15 });
        this.tone({ freq: 523, type: 'triangle', duration: 0.14, volume: 0.15, delay: 0.12 });
    },
    win() {
        [523, 659, 784, 1046].forEach((f, i) => {
            this.tone({ freq: f, type: 'triangle', duration: 0.18, volume: 0.15, delay: i * 0.1 });
        });
    },
    lose() {
        this.tone({ freq: 380, endFreq: 80, type: 'sawtooth', duration: 0.8, volume: 0.2 });
        this.noise(0.5, 0.18, 0.1);
    },
    click() { this.tone({ freq: 640, type: 'square', duration: 0.05, volume: 0.06 }); },
    toggleMuted() {
        this.muted = !this.muted;
        setMuted(this.muted);
        return this.muted;
    }
};

/* ────────────────────────── 常量与配置 ────────────────────────── */

const W = 480, H = 640;
const COLS = 12, ROWS = 16, CELL = 40;
const MAX_WAVES = 25;
const START_GOLD = 220;
const START_LIVES = 20;
const SELL_RATIO = 0.7;
const LEADERBOARD_URL = 'https://game-scores.orangely.workers.dev';
const MAX_PARTICLES = 140;
const MAX_FLOATERS = 30;

// 敌人路径（格子坐标，起点在画布上方之外）
const WAYPOINTS = [
    [5, -1], [5, 3], [9, 3], [9, 6], [2, 6], [2, 10], [8, 10], [8, 13], [3, 13], [3, 15]
];

const ENEMY_TYPES = {
    normal: { hp: 34,  speed: 55, gold: 6,  dmg: 1, r: 9,  color: '#ff6b7a', sides: 8 },
    fast:   { hp: 20,  speed: 96, gold: 5,  dmg: 1, r: 7,  color: '#ffd34d', sides: 3 },
    tank:   { hp: 130, speed: 33, gold: 14, dmg: 2, r: 12, color: '#a78bfa', sides: 6 },
    boss:   { hp: 950, speed: 26, gold: 90, dmg: 4, r: 17, color: '#ff5a3c', sides: 5 }
};

const TOWER_TYPES = {
    pulse: {
        icon: '🔹', color: '#40d8ff', cost: 50,
        levels: [
            { dmg: 9,  range: 105, rate: 2.2 },
            { dmg: 16, range: 115, rate: 2.6, cost: 40 },
            { dmg: 28, range: 125, rate: 3.0, cost: 65 }
        ]
    },
    frost: {
        icon: '❄️', color: '#7dd3fc', cost: 70,
        levels: [
            { dmg: 4,  range: 95,  rate: 1.1, slow: 0.42, slowDur: 1.3 },
            { dmg: 7,  range: 105, rate: 1.3, slow: 0.52, slowDur: 1.6, cost: 55 },
            { dmg: 11, range: 115, rate: 1.5, slow: 0.62, slowDur: 2.0, cost: 90 }
        ]
    },
    cannon: {
        icon: '💥', color: '#ff9f43', cost: 100,
        levels: [
            { dmg: 24, range: 110, rate: 0.75, splash: 55 },
            { dmg: 40, range: 120, rate: 0.85, splash: 62, cost: 80 },
            { dmg: 66, range: 130, rate: 0.95, splash: 70, cost: 130 }
        ]
    },
    tesla: {
        icon: '⚡', color: '#c084fc', cost: 140,
        levels: [
            { dmg: 15, range: 100, rate: 1.3, chain: 3 },
            { dmg: 25, range: 110, rate: 1.5, chain: 4, cost: 110 },
            { dmg: 40, range: 120, rate: 1.7, chain: 5, cost: 170 }
        ]
    }
};

/* ────────────────────────── 路径几何 ────────────────────────── */

const pathPts = WAYPOINTS.map(([c, r]) => ({ x: (c + 0.5) * CELL, y: (r + 0.5) * CELL }));
const pathSegLen = [];
let PATH_TOTAL = 0;
for (let i = 0; i < pathPts.length - 1; i++) {
    const dx = pathPts[i + 1].x - pathPts[i].x;
    const dy = pathPts[i + 1].y - pathPts[i].y;
    const len = Math.hypot(dx, dy);
    pathSegLen.push(len);
    PATH_TOTAL += len;
}

function pointAtDist(d) {
    if (d <= 0) return { x: pathPts[0].x, y: pathPts[0].y, seg: 0 };
    if (d >= PATH_TOTAL) {
        const p = pathPts[pathPts.length - 1];
        return { x: p.x, y: p.y, seg: pathPts.length - 2 };
    }
    let acc = 0;
    for (let i = 0; i < pathSegLen.length; i++) {
        if (d <= acc + pathSegLen[i]) {
            const t = (d - acc) / pathSegLen[i];
            const a = pathPts[i], b = pathPts[i + 1];
            return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, seg: i };
        }
        acc += pathSegLen[i];
    }
    const p = pathPts[pathPts.length - 1];
    return { x: p.x, y: p.y, seg: 0 };
}

// 路径覆盖的格子（禁止建造）
const pathGrid = new Uint8Array(COLS * ROWS);
for (let i = 0; i < WAYPOINTS.length - 1; i++) {
    const [c0, r0] = WAYPOINTS[i];
    const [c1, r1] = WAYPOINTS[i + 1];
    const dc = Math.sign(c1 - c0), dr = Math.sign(r1 - r0);
    let c = c0, r = r0;
    while (true) {
        if (c >= 0 && c < COLS && r >= 0 && r < ROWS) pathGrid[r * COLS + c] = 1;
        if (c === c1 && r === r1) break;
        c += dc; r += dr;
    }
}

function isBuildable(c, r) {
    return c >= 0 && c < COLS && r >= 0 && r < ROWS && !pathGrid[r * COLS + c];
}

/* ────────────────────────── 预渲染精灵 ────────────────────────── */

function makeGlowSprite(radius, color, sides) {
    const pad = 10;
    const size = (radius + pad) * 2;
    const cv = document.createElement('canvas');
    cv.width = size;
    cv.height = size;
    const ctx = cv.getContext('2d');
    const cx = size / 2, cy = size / 2;

    const grad = ctx.createRadialGradient(cx, cy, radius * 0.3, cx, cy, radius + pad * 0.8);
    grad.addColorStop(0, color + '66');
    grad.addColorStop(1, color + '00');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + pad * 0.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i <= sides; i++) {
        const ang = (i / sides) * Math.PI * 2 - Math.PI / 2;
        const px = cx + Math.cos(ang) * radius;
        const py = cy + Math.sin(ang) * radius;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = '#0d1230';
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = color;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    return cv;
}

const enemySprites = {};
for (const [type, cfg] of Object.entries(ENEMY_TYPES)) {
    enemySprites[type] = makeGlowSprite(cfg.r, cfg.color, cfg.sides);
}

const towerBaseSprite = (() => {
    const size = CELL;
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const ctx = cv.getContext('2d');
    const cx = size / 2;
    ctx.beginPath();
    ctx.roundRect(4, 4, size - 8, size - 8, 9);
    ctx.fillStyle = '#141b3f';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cx, 11, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fill();
    return cv;
})();

/* ────────────────────────── 波次 ────────────────────────── */

function buildWave(n) {
    const queue = [];
    const push = (type, count, gap) => {
        for (let i = 0; i < count; i++) queue.push({ type, gap });
    };
    const hpMul = 1 + (n - 1) * 0.18 + Math.max(0, n - 12) ** 2 * 0.02;
    const spdMul = 1 + Math.min(0.35, (n - 1) * 0.012);

    if (n === MAX_WAVES) {
        // 终局波：常规大股敌人 + 双 BOSS 压轴
        push('normal', 6 + Math.floor(n * 1.3), 0.34);
        push('fast', 2 + Math.floor((n - 2) * 1.35), 0.4);
        push('tank', Math.floor((n - 3) * 0.9), 1.4);
        push('boss', 2, 2.4);
    } else if (n % 10 === 0) {
        push('normal', 6 + n, 0.55);
        push('boss', Math.max(1, Math.floor(n / 10)), 2.4);
    } else {
        push('normal', 6 + Math.floor(n * 1.3), Math.max(0.34, 0.85 - n * 0.02));
        if (n >= 3) push('fast', 2 + Math.floor((n - 2) * 1.35), 0.4);
        if (n >= 5) push('tank', Math.floor((n - 3) * 0.9), 1.5);
    }
    return { queue, hpMul, spdMul };
}

/* ────────────────────────── game ────────────────────────── */

class TowerDefenseGame {
    constructor() {
        this.canvas = document.getElementById('td-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.el = {};
        ['td-lives', 'td-gold', 'td-wave', 'td-wave-btn', 'td-panel', 'td-toast',
         'td-start', 'td-title', 'td-subtitle', 'td-howto', 'td-tower-intro',
         'td-btn-play', 'td-best-line', 'td-start-mute', 'td-start-lang',
         'td-pause', 'td-pause-title', 'td-btn-resume', 'td-btn-menu',
         'td-over', 'td-over-title', 'td-over-verdict', 'td-over-score', 'td-over-sub',
         'td-btn-again', 'td-btn-copy', 'td-btn-menu2',
         'td-lb-title', 'td-lb-list', 'td-lb-status', 'td-username', 'td-username-label',
         'td-btn-home', 'td-speed-btn', 'td-pause-btn', 'td-mute-btn', 'td-hint'
        ].forEach(id => {
            const el = document.getElementById(id);
            if (el) this.el[id.replace(/^td-/, '')] = el;
        });

        this.lang = this.readLang();
        this.resetRun(); // 先建好全部运行状态，再渲染语言相关的 UI
        this.applyLanguage();

        this.bgCanvas = document.createElement('canvas');
        this.state = 'menu';   // menu | playing | paused | over
        this.animationId = null;
        this.lastFrameTime = 0;

        this.resetRun();

        this.bindInput();
        this.bindUI();
        this.updateMuteButtons();
        this.updateHud();
        this.resize();
        window.addEventListener('resize', () => this.resize());
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.state === 'playing') this.pause();
        });

        this.drawFrame(); // 菜单背后先画一帧静态场景
    }

    readLang() {
        return getLang();
    }

    get TEXT() { return LANGUAGES[this.lang]; }

    /* ── 一局的初始状态 ── */

    resetRun() {
        this.gold = START_GOLD;
        this.lives = START_LIVES;
        this.wave = 0;
        this.score = 0;
        this.speedMult = 1;
        this.time = 0;

        this.towers = [];
        this.towerGrid = new Int16Array(COLS * ROWS).fill(-1);
        this.enemies = [];
        this.projectiles = [];
        this.particles = [];
        this.floaters = [];
        this.effects = [];

        this.spawnQueue = [];
        this.spawnTimer = 0;
        this.spawnGap = 0;
        this.hpMul = 1;
        this.spdMul = 1;
        this.waveState = 'idle'; // idle | spawning | fighting

        this.selectedCell = null;   // {c, r} 面板目标格
        this.selectedTowerIdx = -1; // 面板选中塔
        this.preview = null;        // {x,y,range,color}
        this.hoverCell = null;

        this.coreFlash = 0;
        this.updateHud();
        this.renderWaveButton();
        this.closePanel();
    }

    /* ── 语言 ── */

    applyLanguage() {
        const t = this.TEXT;
        document.documentElement.lang = this.lang;
        if (this.el.title) this.el.title.textContent = t.title;
        if (this.el.subtitle) this.el.subtitle.textContent = t.subtitle;
        if (this.el.howto) this.el.howto.textContent = t.howto;
        if (this.el['tower-intro']) this.el['tower-intro'].textContent = t.towerIntro;
        if (this.el['btn-play']) this.el['btn-play'].textContent = `🏰 ${t.play}`;
        if (this.el['pause-title']) this.el['pause-title'].textContent = t.paused;
        if (this.el['btn-resume']) this.el['btn-resume'].textContent = t.resume;
        if (this.el['btn-menu']) this.el['btn-menu'].textContent = `🏠 ${t.home}`;
        if (this.el['btn-menu2']) this.el['btn-menu2'].textContent = `🏠 ${t.home}`;
        if (this.el['btn-again']) this.el['btn-again'].textContent = `🔄 ${t.again}`;
        if (this.el['btn-copy']) this.el['btn-copy'].textContent = `📋 ${t.copyResult}`;
        if (this.el['lb-title']) this.el['lb-title'].textContent = `🏆 ${t.leaderboard}`;
        if (this.el['username-label']) this.el['username-label'].textContent = t.usernameLabel;
        if (this.el.username) this.el.username.placeholder = t.usernameLabel;
        if (this.el.hint) this.el.hint.textContent = t.hint;
        if (this.el['start-lang']) this.el['start-lang'].textContent = t.language;
        if (this.el['best-line']) {
            const best = Number(storageGet('td_best')) || 0;
            this.el['best-line'].textContent = best ? `🏆 ${t.best}: ${formatNumber(best)}` : '';
        }
        this.renderPanel();
        this.renderWaveButton();
    }

    /* ── 尺寸与背景 ── */

    resize() {
        const cssW = this.canvas.clientWidth || 300;
        const scale = cssW / W;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.renderScale = scale * dpr;
        const pw = Math.round(W * this.renderScale);
        const ph = Math.round(H * this.renderScale);
        if (this.canvas.width !== pw) {
            this.canvas.width = pw;
            this.canvas.height = ph;
        }
        this.renderBackground(pw, ph);
        if (this.state === 'menu') this.drawFrame();
    }

    renderBackground(pw, ph) {
        this.bgCanvas.width = pw;
        this.bgCanvas.height = ph;
        const ctx = this.bgCanvas.getContext('2d');
        ctx.setTransform(this.renderScale, 0, 0, this.renderScale, 0, 0);

        // 底色
        const bg = ctx.createLinearGradient(0, 0, W, H);
        bg.addColorStop(0, '#0a0e24');
        bg.addColorStop(1, '#0d1530');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        // 可建格
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (pathGrid[r * COLS + c]) continue;
                const x = c * CELL, y = r * CELL;
                ctx.fillStyle = 'rgba(255,255,255,0.028)';
                ctx.beginPath();
                ctx.roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 7);
                ctx.fill();
                ctx.strokeStyle = 'rgba(64,216,255,0.05)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }

        // 道路
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(pathPts[0].x, pathPts[0].y);
        for (let i = 1; i < pathPts.length; i++) ctx.lineTo(pathPts[i].x, pathPts[i].y);
        ctx.strokeStyle = '#141c44';
        ctx.lineWidth = CELL - 8;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(64,216,255,0.10)';
        ctx.lineWidth = CELL - 8;
        ctx.setLineDash([]);
        ctx.stroke();
        // 中心虚线
        ctx.beginPath();
        ctx.moveTo(pathPts[0].x, pathPts[0].y);
        for (let i = 1; i < pathPts.length; i++) ctx.lineTo(pathPts[i].x, pathPts[i].y);
        ctx.strokeStyle = 'rgba(64,216,255,0.22)';
        ctx.lineWidth = 2;
        ctx.setLineDash([9, 11]);
        ctx.stroke();
        ctx.setLineDash([]);

        // 入口传送门
        const entry = pointAtDist(26);
        ctx.beginPath();
        ctx.arc(entry.x, entry.y, 15, 0, Math.PI * 2);
        ctx.strokeStyle = '#ff6b7a';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#ff6b7a';
        ctx.shadowBlur = 14;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // 核心基地
        const core = pathPts[pathPts.length - 1];
        ctx.save();
        ctx.translate(core.x, core.y - 14);
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const ang = (i / 6) * Math.PI * 2 - Math.PI / 2;
            const px = Math.cos(ang) * 16, py = Math.sin(ang) * 16;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = '#12204a';
        ctx.fill();
        ctx.strokeStyle = '#40d8ff';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#40d8ff';
        ctx.shadowBlur = 16;
        ctx.stroke();
        ctx.restore();
        ctx.shadowBlur = 0;
    }

    /* ── 输入 ── */

    toLogical(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / rect.width * W,
            y: (e.clientY - rect.top) / rect.height * H
        };
    }

    bindInput() {
        this.canvas.addEventListener('pointerdown', (e) => {
            if (this.state !== 'playing') return;
            const p = this.toLogical(e);
            const c = Math.floor(p.x / CELL);
            const r = Math.floor(p.y / CELL);
            if (!isBuildable(c, r) && !this.towerAt(c, r)) {
                this.closePanel();
                return;
            }
            const towerIdx = this.towerAt(c, r);
            this.selectedCell = { c, r };
            this.selectedTowerIdx = towerIdx;
            Sfx.click();
            this.renderPanel();
        });

        this.canvas.addEventListener('pointermove', (e) => {
            if (this.state !== 'playing') return;
            const p = this.toLogical(e);
            const c = Math.floor(p.x / CELL), r = Math.floor(p.y / CELL);
            this.hoverCell = (c >= 0 && c < COLS && r >= 0 && r < ROWS) ? { c, r } : null;
        });
        this.canvas.addEventListener('pointerleave', () => { this.hoverCell = null; });
    }

    towerAt(c, r) {
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return -1;
        return this.towerGrid[r * COLS + c];
    }

    /* ── 建造 / 升级 / 出售 ── */

    tryBuild(type) {
        if (!this.selectedCell || this.state !== 'playing') return;
        const { c, r } = this.selectedCell;
        const cfg = TOWER_TYPES[type];
        if (cfg.cost > this.gold) {
            this.showToast(this.TEXT.notEnoughGold);
            return;
        }
        const tower = {
            type, c, r,
            x: (c + 0.5) * CELL, y: (r + 0.5) * CELL,
            level: 0,
            cooldown: 0,
            invested: cfg.cost,
            angle: -Math.PI / 2
        };
        this.towers.push(tower);
        this.towerGrid[r * COLS + c] = this.towers.length - 1;
        this.gold -= cfg.cost;
        this.selectedTowerIdx = this.towers.length - 1;
        Sfx.place();
        this.burst(tower.x, tower.y, cfg.color, 10);
        this.updateHud();
        this.renderPanel();
    }

    tryUpgrade() {
        const tower = this.towers[this.selectedTowerIdx];
        if (!tower || this.state !== 'playing') return;
        const cfg = TOWER_TYPES[tower.type];
        if (tower.level >= cfg.levels.length - 1) return;
        const cost = cfg.levels[tower.level + 1].cost;
        if (cost > this.gold) {
            this.showToast(this.TEXT.notEnoughGold);
            return;
        }
        this.gold -= cost;
        tower.invested += cost;
        tower.level++;
        Sfx.upgrade();
        this.burst(tower.x, tower.y, cfg.color, 12);
        this.updateHud();
        this.renderPanel();
    }

    trySell() {
        const tower = this.towers[this.selectedTowerIdx];
        if (!tower || this.state !== 'playing') return;
        const refund = Math.round(tower.invested * SELL_RATIO);
        this.gold += refund;
        this.towerGrid[tower.r * COLS + tower.c] = -1;
        this.towers[this.selectedTowerIdx] = null;
        // 压缩塔数组会破坏 towerGrid 索引——保留 null 槽位即可
        Sfx.sell();
        this.closePanel();
        this.updateHud();
    }

    /* ── 面板 ── */

    closePanel() {
        this.selectedCell = null;
        this.selectedTowerIdx = -1;
        this.preview = null;
        if (this.el.panel) this.el.panel.classList.add('hidden');
    }

    renderPanel() {
        const panel = this.el.panel;
        if (!panel || this.state !== 'playing' || !this.selectedCell) {
            if (panel) panel.classList.add('hidden');
            this.preview = null;
            return;
        }
        const t = this.TEXT;
        panel.textContent = '';
        panel.classList.remove('hidden');

        const mkCard = (cls, icon, name, cost, stats, action) => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'td-card' + (cls ? ' ' + cls : '');
            if (action.startsWith('build:') && cost > this.gold) card.classList.add('poor');
            if (action === 'info') card.classList.add('info');
            const iconEl = document.createElement('span');
            iconEl.className = 'td-card-icon';
            iconEl.textContent = icon;
            const nameEl = document.createElement('span');
            nameEl.className = 'td-card-name';
            nameEl.textContent = name;
            const costEl = document.createElement('span');
            costEl.className = 'td-card-cost';
            costEl.textContent = cost;
            const statsEl = document.createElement('span');
            statsEl.className = 'td-card-stats';
            statsEl.textContent = stats || '';
            card.append(iconEl, nameEl, costEl, statsEl);
            if (action !== 'info') {
                card.addEventListener('click', () => {
                    if (action.startsWith('build:')) this.tryBuild(action.slice(6));
                    else if (action === 'upgrade') this.tryUpgrade();
                    else if (action === 'sell') this.trySell();
                    else if (action === 'close') { Sfx.click(); this.closePanel(); }
                });
            }
            return card;
        };

        if (this.selectedTowerIdx >= 0 && this.towers[this.selectedTowerIdx]) {
            const tower = this.towers[this.selectedTowerIdx];
            const cfg = TOWER_TYPES[tower.type];
            const lv = cfg.levels[tower.level];
            const isMax = tower.level >= cfg.levels.length - 1;
            const next = isMax ? null : cfg.levels[tower.level + 1];

            this.preview = { x: tower.x, y: tower.y, range: lv.range, color: cfg.color };

            panel.appendChild(mkCard('info', cfg.icon, `${t[tower.type]} Lv${tower.level + 1}`,
                '', `${t.dmg} ${lv.dmg} · ${t.range} ${lv.range} · ${t.rate} ${lv.rate}`, 'info'));

            if (next) {
                const up = mkCard('upgrade', '⬆️', t.upgrade, next.cost,
                    `${t.dmg} ${next.dmg} · ${t.range} ${next.range}`, 'upgrade');
                if (next.cost > this.gold) up.classList.add('poor');
                panel.appendChild(up);
            } else {
                panel.appendChild(mkCard('info', '⭐', t.maxLevel, '', '', 'info'));
            }
            const refund = Math.round(tower.invested * SELL_RATIO);
            panel.appendChild(mkCard('sell', '💰', t.sell, `+${refund}`, '', 'sell'));
        } else {
            const { c, r } = this.selectedCell;
            if (!isBuildable(c, r) || this.towerAt(c, r) >= 0) {
                this.closePanel();
                return;
            }
            this.preview = null;
            for (const [type, cfg] of Object.entries(TOWER_TYPES)) {
                const lv = cfg.levels[0];
                panel.appendChild(mkCard('', cfg.icon, t[type], cfg.cost,
                    `${t.dmg} ${lv.dmg} · ${t.range} ${lv.range}`, 'build:' + type));
            }
            // 点击空格时给出落点预览（最近塔类型射程以 pulse 为参考）
            this.preview = { x: (c + 0.5) * CELL, y: (r + 0.5) * CELL, range: 105, color: '#40d8ff' };
        }
        if (!panel.lastChild || panel.querySelector('.td-card') === null) {
            panel.classList.add('hidden');
        }
    }

    /* ── HUD ── */

    updateHud() {
        if (this.el.lives) this.el.lives.textContent = Math.max(0, this.lives);
        if (this.el.gold) this.el.gold.textContent = formatNumber(this.gold);
        if (this.el.wave) this.el.wave.textContent = `${Math.max(1, this.wave)}/${MAX_WAVES}`;
    }

    renderWaveButton() {
        const btn = this.el['wave-btn'];
        if (!btn) return;
        const t = this.TEXT;
        if (this.waveState === 'idle') {
            btn.disabled = false;
            btn.textContent = t.startWave.replace('{n}', Math.min(MAX_WAVES, this.wave + 1));
        } else {
            btn.disabled = true;
            const alive = this.enemies.length + this.spawnQueue.length;
            btn.textContent = `${t.waveRunning.replace('{n}', this.wave)} · ${alive}`;
        }
    }

    showToast(text, duration = 1600) {
        const toast = this.el.toast;
        if (!toast) return;
        toast.textContent = text;
        toast.classList.remove('hidden');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => toast.classList.add('hidden'), duration);
    }

    /* ── 特效池 ── */

    burst(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            if (this.particles.length >= MAX_PARTICLES) {
                this.particles.shift();
            }
            const ang = Math.random() * Math.PI * 2;
            const spd = 40 + Math.random() * 130;
            this.particles.push({
                x, y,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd,
                life: 0.4 + Math.random() * 0.3,
                age: 0,
                size: 1.5 + Math.random() * 2.5,
                color
            });
        }
    }

    floater(x, y, text, color) {
        if (this.floaters.length >= MAX_FLOATERS) this.floaters.shift();
        this.floaters.push({ x, y, text, color, age: 0, life: 0.8 });
    }

    /* ── 战斗逻辑 ── */

    damageEnemy(e, dmg) {
        if (e.dead) return;
        e.hp -= dmg;
        e.hitFlash = 0.09;
        if (e.hp <= 0) this.killEnemy(e);
    }

    killEnemy(e) {
        e.dead = true;
        this.gold += e.gold;
        this.score += e.gold;
        this.burst(e.x, e.y, e.color, e.type === 'boss' ? 26 : 8);
        this.floater(e.x, e.y - 10, `+${e.gold}`, '#ffd34d');
        if (e.type === 'tank' || e.type === 'boss') Sfx.bigDeath();
        this.updateHud();
        this.renderWaveButton();
    }

    leakEnemy(e) {
        e.dead = true;
        this.lives -= e.dmg;
        this.coreFlash = 0.4;
        Sfx.leak();
        this.updateHud();
        if (this.lives <= 0) {
            this.endGame(false);
        }
    }

    spawnEnemy(type) {
        const cfg = ENEMY_TYPES[type];
        this.enemies.push({
            type,
            hp: cfg.hp * this.hpMul,
            maxHp: cfg.hp * this.hpMul,
            speed: cfg.speed * this.spdMul,
            gold: cfg.gold,
            dmg: cfg.dmg,
            r: cfg.r,
            color: cfg.color,
            dist: 0,
            x: pathPts[0].x,
            y: pathPts[0].y,
            slowUntil: 0,
            slowFactor: 0,
            hitFlash: 0,
            dead: false
        });
        if (type === 'boss') {
            this.showToast(this.TEXT.bossIncoming);
            Sfx.bigDeath();
        }
    }

    startWave() {
        if (this.waveState !== 'idle' || this.state !== 'playing') return;
        this.wave++;
        const waveCfg = buildWave(this.wave);
        this.spawnQueue = waveCfg.queue;
        this.hpMul = waveCfg.hpMul;
        this.spdMul = waveCfg.spdMul;
        this.spawnTimer = 0.4;
        this.waveState = 'spawning';
        Sfx.waveStart();
        this.updateHud();
        this.renderWaveButton();
    }

    waveCleared() {
        const bonus = 25 + this.wave * 3;
        this.gold += bonus;
        this.score += 40 + this.wave * 5;
        this.showToast(this.TEXT.waveCleared.replace('{n}', this.wave).replace('{g}', bonus), 2000);
        if (this.wave >= MAX_WAVES) {
            this.endGame(true);
            return;
        }
        this.waveState = 'idle';
        this.updateHud();
        this.renderWaveButton();
    }

    /* ── 塔攻击 ── */

    pickTarget(tower, range) {
        let best = null, bestDist = -1;
        const rangeSq = range * range;
        for (const e of this.enemies) {
            if (e.dead) continue;
            const dx = e.x - tower.x, dy = e.y - tower.y;
            const d2 = dx * dx + dy * dy;
            if (d2 <= rangeSq && e.dist > bestDist) {
                bestDist = e.dist;
                best = e;
            }
        }
        return best;
    }

    fireTower(tower) {
        const cfg = TOWER_TYPES[tower.type];
        const lv = cfg.levels[tower.level];

        if (tower.type === 'frost') {
            // 光环脉冲：伤害 + 减速范围内所有敌人
            let any = false;
            const rangeSq = lv.range * lv.range;
            for (const e of this.enemies) {
                if (e.dead) continue;
                const dx = e.x - tower.x, dy = e.y - tower.y;
                if (dx * dx + dy * dy <= rangeSq) {
                    this.damageEnemy(e, lv.dmg);
                    const expired = this.time >= e.slowUntil;
                    e.slowUntil = this.time + lv.slowDur;
                    e.slowFactor = expired ? lv.slow : Math.max(e.slowFactor, lv.slow);
                    any = true;
                }
            }
            if (!any) return false;
            this.effects.push({ kind: 'ring', x: tower.x, y: tower.y, r: 8, maxR: lv.range, age: 0, life: 0.45, color: cfg.color });
            return true;
        }

        const target = this.pickTarget(tower, lv.range);
        if (!target) return false;
        tower.angle = Math.atan2(target.y - tower.y, target.x - tower.x);

        if (tower.type === 'pulse') {
            this.projectiles.push({
                kind: 'bullet', x: tower.x, y: tower.y,
                target, lastX: target.x, lastY: target.y,
                speed: 430, dmg: lv.dmg, color: cfg.color, r: 3
            });
            return true;
        }
        if (tower.type === 'cannon') {
            this.projectiles.push({
                kind: 'shell', x: tower.x, y: tower.y,
                target, lastX: target.x, lastY: target.y,
                speed: 270, dmg: lv.dmg, splash: lv.splash, color: cfg.color, r: 5
            });
            return true;
        }
        if (tower.type === 'tesla') {
            // 闪电链
            const chain = [target];
            let current = target;
            const chainRangeSq = 75 * 75;
            while (chain.length < lv.chain) {
                let next = null, nd = Infinity;
                for (const e of this.enemies) {
                    if (e.dead || chain.includes(e)) continue;
                    const dx = e.x - current.x, dy = e.y - current.y;
                    const d2 = dx * dx + dy * dy;
                    if (d2 <= chainRangeSq && d2 < nd) {
                        nd = d2;
                        next = e;
                    }
                }
                if (!next) break;
                chain.push(next);
                current = next;
            }
            const pts = [{ x: tower.x, y: tower.y }];
            let dmg = lv.dmg;
            for (const e of chain) {
                pts.push({ x: e.x, y: e.y });
                this.damageEnemy(e, dmg);
                dmg = Math.round(dmg * 0.65);
            }
            this.effects.push({ kind: 'zap', pts, age: 0, life: 0.16, color: cfg.color });
            Sfx.zap();
            return true;
        }
        return false;
    }

    explodeShell(x, y, dmg, radius) {
        const rSq = radius * radius;
        for (const e of this.enemies) {
            if (e.dead) continue;
            const dx = e.x - x, dy = e.y - y;
            if (dx * dx + dy * dy <= rSq) this.damageEnemy(e, dmg);
        }
        this.effects.push({ kind: 'ring', x, y, r: 4, maxR: radius, age: 0, life: 0.3, color: '#ff9f43' });
        this.burst(x, y, '#ff9f43', 10);
        Sfx.explode();
    }

    /* ── 更新 ── */

    update(dt) {
        this.time += dt;

        // 出怪
        if (this.waveState === 'spawning') {
            this.spawnTimer -= dt;
            if (this.spawnTimer <= 0 && this.spawnQueue.length) {
                const item = this.spawnQueue.shift();
                this.spawnEnemy(item.type);
                this.spawnTimer = item.gap;
                this.renderWaveButton();
            }
            if (!this.spawnQueue.length) this.waveState = 'fighting';
        }

        // 敌人
        let alive = 0;
        for (const e of this.enemies) {
            if (e.dead) continue;
            alive++;
            const slowed = this.time < e.slowUntil;
            const speed = e.speed * (slowed ? (1 - e.slowFactor) : 1);
            e.dist += speed * dt;
            const p = pointAtDist(e.dist);
            e.x = p.x;
            e.y = p.y;
            if (e.hitFlash > 0) e.hitFlash -= dt;
            if (e.dist >= PATH_TOTAL - 6) {
                this.leakEnemy(e);
                alive--;
            }
        }
        // 压缩死亡敌人
        if (this.enemies.some(e => e.dead)) {
            this.enemies = this.enemies.filter(e => !e.dead);
        }
        if (alive === 0 && this.waveState === 'fighting') {
            this.waveCleared();
        }

        // 塔
        for (const tower of this.towers) {
            if (!tower) continue;
            tower.cooldown -= dt;
            if (tower.cooldown <= 0) {
                const fired = this.fireTower(tower);
                const rate = TOWER_TYPES[tower.type].levels[tower.level].rate;
                tower.cooldown = fired ? 1 / rate : 0.06; // 无目标时低频探测
            }
            if (tower.type === 'frost') tower.angle += dt * 1.2;
        }

        // 子弹
        for (const p of this.projectiles) {
            const tx = p.target && !p.target.dead ? p.target.x : p.lastX;
            const ty = p.target && !p.target.dead ? p.target.y : p.lastY;
            if (p.target && !p.target.dead) {
                p.lastX = tx; p.lastY = ty;
            }
            const dx = tx - p.x, dy = ty - p.y;
            const dist = Math.hypot(dx, dy);
            const step = p.speed * dt;
            if (dist <= step + 3) {
                // 命中
                if (p.kind === 'shell') {
                    this.explodeShell(tx, ty, p.dmg, p.splash);
                } else if (p.target && !p.target.dead) {
                    this.damageEnemy(p.target, p.dmg);
                }
                p.dead = true;
            } else {
                p.x += dx / dist * step;
                p.y += dy / dist * step;
            }
        }
        this.projectiles = this.projectiles.filter(p => !p.dead);

        // 粒子
        let w = 0;
        for (let i = 0; i < this.particles.length; i++) {
            const pt = this.particles[i];
            pt.age += dt;
            if (pt.age >= pt.life) continue;
            pt.x += pt.vx * dt;
            pt.y += pt.vy * dt;
            pt.vx *= 0.92;
            pt.vy *= 0.92;
            this.particles[w++] = pt;
        }
        this.particles.length = w;

        // 漂浮文字
        w = 0;
        for (let i = 0; i < this.floaters.length; i++) {
            const f = this.floaters[i];
            f.age += dt;
            if (f.age >= f.life) continue;
            f.y -= 28 * dt;
            this.floaters[w++] = f;
        }
        this.floaters.length = w;

        // 特效
        w = 0;
        for (let i = 0; i < this.effects.length; i++) {
            const fx = this.effects[i];
            fx.age += dt;
            if (fx.kind === 'ring') {
                fx.r = fx.maxR * (fx.age / fx.life);
            }
            if (fx.age >= fx.life) continue;
            this.effects[w++] = fx;
        }
        this.effects.length = w;

        if (this.coreFlash > 0) this.coreFlash -= dt;
    }

    /* ── 渲染 ── */

    drawFrame() {
        const ctx = this.ctx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.drawImage(this.bgCanvas, 0, 0);

        ctx.setTransform(this.renderScale, 0, 0, this.renderScale, 0, 0);

        // 预览射程
        if (this.preview) {
            ctx.beginPath();
            ctx.arc(this.preview.x, this.preview.y, this.preview.range, 0, Math.PI * 2);
            ctx.fillStyle = this.preview.color + '14';
            ctx.fill();
            ctx.strokeStyle = this.preview.color + '55';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }

        // 选中格高亮
        if (this.selectedCell) {
            const { c, r } = this.selectedCell;
            ctx.strokeStyle = 'rgba(94,234,176,0.7)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(c * CELL + 2, r * CELL + 2, CELL - 4, CELL - 4, 7);
            ctx.stroke();
        } else if (this.hoverCell && this.state === 'playing' && isBuildable(this.hoverCell.c, this.hoverCell.r) && this.towerAt(this.hoverCell.c, this.hoverCell.r) < 0) {
            ctx.strokeStyle = 'rgba(64,216,255,0.35)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(this.hoverCell.c * CELL + 3, this.hoverCell.r * CELL + 3, CELL - 6, CELL - 6, 6);
            ctx.stroke();
        }

        // 塔
        for (const tower of this.towers) {
            if (!tower) continue;
            this.drawTower(ctx, tower);
        }

        // 敌人
        for (const e of this.enemies) {
            const sprite = enemySprites[e.type];
            ctx.drawImage(sprite, e.x - sprite.width / 2, e.y - sprite.height / 2);
            if (e.hitFlash > 0) {
                ctx.globalAlpha = Math.min(1, e.hitFlash * 8);
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }
            // 血条
            if (e.hp < e.maxHp) {
                const bw = e.r * 2.2;
                const frac = Math.max(0, e.hp / e.maxHp);
                ctx.fillStyle = 'rgba(0,0,0,0.55)';
                ctx.fillRect(e.x - bw / 2, e.y - e.r - 8, bw, 3.5);
                ctx.fillStyle = frac > 0.5 ? '#3fd97c' : frac > 0.25 ? '#ffd34d' : '#ff6b7a';
                ctx.fillRect(e.x - bw / 2, e.y - e.r - 8, bw * frac, 3.5);
            }
        }

        // 子弹
        ctx.globalCompositeOperation = 'lighter';
        for (const p of this.projectiles) {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
            if (p.kind === 'shell') {
                ctx.globalAlpha = 0.4;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r + 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }
        }

        // 特效
        for (const fx of this.effects) {
            const t = fx.age / fx.life;
            ctx.globalAlpha = 1 - t;
            if (fx.kind === 'ring') {
                ctx.strokeStyle = fx.color;
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.arc(fx.x, fx.y, fx.r, 0, Math.PI * 2);
                ctx.stroke();
            } else if (fx.kind === 'zap') {
                ctx.strokeStyle = fx.color;
                ctx.lineWidth = 2.2;
                ctx.beginPath();
                for (let i = 0; i < fx.pts.length - 1; i++) {
                    const a = fx.pts[i], b = fx.pts[i + 1];
                    ctx.moveTo(a.x, a.y);
                    const mx = (a.x + b.x) / 2 + (Math.random() - 0.5) * 10;
                    const my = (a.y + b.y) / 2 + (Math.random() - 0.5) * 10;
                    ctx.lineTo(mx, my);
                    ctx.lineTo(b.x, b.y);
                }
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }

        // 粒子
        for (const pt of this.particles) {
            const alpha = 1 - pt.age / pt.life;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = pt.color;
            ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';

        // 漂浮文字
        ctx.font = '800 13px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        for (const f of this.floaters) {
            ctx.globalAlpha = 1 - f.age / f.life;
            ctx.fillStyle = f.color;
            ctx.fillText(f.text, f.x, f.y);
        }
        ctx.globalAlpha = 1;

        // 核心受击红光
        if (this.coreFlash > 0) {
            ctx.fillStyle = `rgba(255,60,60,${this.coreFlash * 0.5})`;
            ctx.fillRect(0, 0, W, H);
        }
    }

    drawTower(ctx, tower) {
        const cfg = TOWER_TYPES[tower.type];
        ctx.drawImage(towerBaseSprite, tower.c * CELL, tower.r * CELL);
        const cx = tower.x, cy = tower.y;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(tower.angle);

        if (tower.type === 'pulse') {
            ctx.fillStyle = cfg.color;
            ctx.fillRect(0, -3, 15, 6);
            ctx.beginPath();
            ctx.arc(15, 0, 3.4, 0, Math.PI * 2);
            ctx.fill();
        } else if (tower.type === 'cannon') {
            ctx.fillStyle = '#1a2148';
            ctx.fillRect(-2, -6, 20, 12);
            ctx.strokeStyle = cfg.color;
            ctx.lineWidth = 2;
            ctx.strokeRect(-2, -6, 20, 12);
            ctx.fillStyle = cfg.color;
            ctx.beginPath();
            ctx.arc(18, 0, 4, 0, Math.PI * 2);
            ctx.fill();
        } else if (tower.type === 'tesla') {
            ctx.strokeStyle = cfg.color;
            ctx.lineWidth = 2;
            const orbR = 7 + Math.sin(this.time * 6) * 1.2;
            ctx.beginPath();
            ctx.arc(0, 0, orbR, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, -orbR - 5); ctx.lineTo(0, -orbR + 1);
            ctx.moveTo(0, orbR + 5); ctx.lineTo(0, orbR - 1);
            ctx.stroke();
        }
        ctx.restore();

        if (tower.type === 'frost') {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(tower.angle);
            ctx.strokeStyle = cfg.color;
            ctx.lineWidth = 2;
            for (let i = 0; i < 3; i++) {
                const ang = (i / 3) * Math.PI;
                ctx.beginPath();
                ctx.moveTo(Math.cos(ang) * -10, Math.sin(ang) * -10);
                ctx.lineTo(Math.cos(ang) * 10, Math.sin(ang) * 10);
                ctx.stroke();
            }
            ctx.restore();
        }

        // 等级点
        const lv = tower.level + 1;
        for (let i = 0; i < lv; i++) {
            ctx.beginPath();
            ctx.arc(tower.x - (lv - 1) * 3.5 + i * 7, tower.y + 14, 2.2, 0, Math.PI * 2);
            ctx.fillStyle = '#ffd34d';
            ctx.fill();
        }
    }

    /* ── 主循环 ── */

    startLoop() {
        this.stopLoop();
        this.lastFrameTime = performance.now();
        const tick = (now) => {
            this.animationId = requestAnimationFrame(tick);
            let dt = (now - this.lastFrameTime) / 1000;
            this.lastFrameTime = now;
            if (dt > 0.05) dt = 0.05; // 防止切页后追赶螺旋
            if (this.state === 'playing') {
                const scaled = dt * this.speedMult;
                // ×2 时分两步更新，避免高速穿模
                this.update(scaled / 2);
                this.update(scaled / 2);
            }
            this.drawFrame();
        };
        this.animationId = requestAnimationFrame(tick);
    }

    stopLoop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    /* ── 流程控制 ── */

    startGame() {
        this.resetRun();
        this.state = 'playing';
        if (this.el.start) this.el.start.classList.add('hidden');
        if (this.el.over) this.el.over.classList.add('hidden');
        if (this.el.pause) this.el.pause.classList.add('hidden');
        if (this.el.username) this.el.username.value = ensurePlayerName() || '';
        this.resize();
        this.startLoop();
        if (window.hubTrack) window.hubTrack('tower-defense', 'play');
    }

    pause() {
        if (this.state !== 'playing') return;
        this.state = 'paused';
        if (this.el.pause) this.el.pause.classList.remove('hidden');
        Sfx.click();
    }

    resume() {
        if (this.state !== 'paused') return;
        this.state = 'playing';
        if (this.el.pause) this.el.pause.classList.add('hidden');
        this.lastFrameTime = performance.now();
        Sfx.click();
    }

    toMenu() {
        this.stopLoop();
        this.state = 'menu';
        this.resetRun();
        if (this.el.pause) this.el.pause.classList.add('hidden');
        if (this.el.over) this.el.over.classList.add('hidden');
        if (this.el.start) this.el.start.classList.remove('hidden');
        this.closePanel();
        this.drawFrame();
    }

    async endGame(victory) {
        this.state = 'over';
        this.stopLoop();
        this.closePanel();

        if (victory) {
            const bonus = this.lives * 30;
            this.score += bonus;
            Sfx.win();
        } else {
            Sfx.lose();
        }
        if (window.hubTrack) window.hubTrack('tower-defense', 'finish');

        const t = this.TEXT;
        if (this.el['over-title']) {
            this.el['over-title'].textContent = victory ? t.victory : t.gameOver;
        }
        if (this.el['over-verdict']) {
            this.el['over-verdict'].textContent = victory ? '🏆' : '💀';
        }
        if (this.el['over-score']) this.el['over-score'].textContent = formatNumber(this.score);
        if (this.el['over-sub']) {
            this.el['over-sub'].textContent = victory
                ? t.victorySub.replace('{lives}', this.lives)
                : t.defeatSub.replace('{n}', Math.max(1, this.wave));
        }

        // 本地最佳
        const prevBest = Number(storageGet('td_best')) || 0;
        const isBest = this.score > prevBest;
        if (isBest) storageSet('td_best', String(this.score));
        if (this.el['best-line']) {
            this.el['best-line'].textContent = `🏆 ${t.best}: ${formatNumber(Math.max(prevBest, this.score))}` +
                (isBest ? `  🌟 ${t.newBest}` : '');
        }

        // 本地榜
        const local = this.localScores();
        local.push({ name: ensurePlayerName() || 'Anonymous', score: this.score });
        local.sort((a, b) => b.score - a.score);
        storageSet('td_local_scores', JSON.stringify(local.slice(0, 30)));

        if (this.el.over) this.el.over.classList.remove('hidden');
        if (this.el.username) this.el.username.value = ensurePlayerName() || '';

        // 上报 + 拉取全球榜
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            await fetch(`${LEADERBOARD_URL}/scores`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ game: 'tower-defense', name: ensurePlayerName() || 'Anonymous', score: this.score }),
                signal: controller.signal,
                mode: 'cors'
            });
            clearTimeout(timeoutId);
        } catch (e) { /* Worker 未部署：保留本地榜 */ }
        this.fetchLeaderboard();
    }

    localScores() {
        try {
            const all = JSON.parse(storageGet('td_local_scores'));
            return Array.isArray(all) ? all : [];
        } catch (e) {
            return [];
        }
    }

    renderLocalScores() {
        const list = this.el['lb-list'];
        if (!list) return;
        list.textContent = '';
        const filtered = this.localScores().slice(0, 10);
        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'td-lb-empty';
            empty.textContent = this.TEXT.noScores;
            list.appendChild(empty);
            return;
        }
        filtered.forEach((s, i) => list.appendChild(this.buildLbRow(i, s)));
    }

    buildLbRow(rank, entry) {
        const row = document.createElement('div');
        row.className = 'td-lb-row' + (rank < 3 ? ` td-lb-top${rank + 1}` : '');
        const rankEl = document.createElement('span');
        rankEl.className = 'td-lb-rank';
        rankEl.textContent = `${rank + 1}.`;
        const nameEl = document.createElement('span');
        nameEl.className = 'td-lb-name';
        nameEl.textContent = entry.name; // textContent 防注入
        const scoreEl = document.createElement('span');
        scoreEl.className = 'td-lb-score';
        scoreEl.textContent = formatNumber(entry.score);
        row.append(rankEl, nameEl, scoreEl);
        return row;
    }

    async fetchLeaderboard() {
        const list = this.el['lb-list'];
        const statusEl = this.el['lb-status'];
        if (!list || this.state !== 'over') return;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);
            const res = await fetch(`${LEADERBOARD_URL}/scores?game=tower-defense`, {
                signal: controller.signal,
                mode: 'cors'
            });
            clearTimeout(timeoutId);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (this.state !== 'over') return;
            list.textContent = '';
            if (!Array.isArray(data) || data.length === 0) {
                this.renderLocalScores();
                if (statusEl) statusEl.textContent = '';
                return;
            }
            data.slice(0, 10).forEach((entry, i) => list.appendChild(this.buildLbRow(i, entry)));
            if (statusEl) statusEl.textContent = '';
        } catch (e) {
            if (this.state !== 'over') return;
            this.renderLocalScores();
            if (statusEl) statusEl.textContent = this.TEXT.lbOffline;
        }
    }

    async copyResult() {
        const t = this.TEXT;
        const text = `🏰 ${t.title}\n${t.score}: ${formatNumber(this.score)} · ${t.wave} ${this.wave}/${MAX_WAVES}\nhttps://games.orangely.xyz/tower-defense.html`;
        let ok = false;
        try {
            await navigator.clipboard.writeText(text);
            ok = true;
        } catch (e) {
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
            const original = `📋 ${t.copyResult}`;
            this.el['btn-copy'].textContent = ok ? `✅ ${t.copied}` : original;
            setTimeout(() => {
                if (this.el['btn-copy']) this.el['btn-copy'].textContent = original;
            }, 1600);
        }
    }

    /* ── UI 事件 ── */

    bindUI() {
        if (this.el['btn-play']) this.el['btn-play'].addEventListener('click', () => {
            Sfx.click();
            this.startGame();
        });
        if (this.el['wave-btn']) this.el['wave-btn'].addEventListener('click', () => this.startWave());
        if (this.el['btn-home']) this.el['btn-home'].addEventListener('click', () => { window.location.href = 'index.html'; });
        if (this.el['pause-btn']) this.el['pause-btn'].addEventListener('click', () => {
            if (this.state === 'playing') this.pause();
            else if (this.state === 'paused') this.resume();
        });
        if (this.el['btn-resume']) this.el['btn-resume'].addEventListener('click', () => this.resume());
        if (this.el['btn-menu']) this.el['btn-menu'].addEventListener('click', () => this.toMenu());
        if (this.el['btn-menu2']) this.el['btn-menu2'].addEventListener('click', () => this.toMenu());
        if (this.el['btn-again']) this.el['btn-again'].addEventListener('click', () => {
            Sfx.click();
            this.startGame();
        });
        if (this.el['btn-copy']) this.el['btn-copy'].addEventListener('click', () => this.copyResult());

        if (this.el['speed-btn']) this.el['speed-btn'].addEventListener('click', () => {
            this.speedMult = this.speedMult === 1 ? 2 : 1;
            this.el['speed-btn'].textContent = `×${this.speedMult}`;
            Sfx.click();
        });

        if (this.el['mute-btn']) this.el['mute-btn'].addEventListener('click', () => this.toggleMute());
        if (this.el['start-mute']) this.el['start-mute'].addEventListener('click', () => this.toggleMute());

        if (this.el['start-lang']) this.el['start-lang'].addEventListener('click', () => {
            this.lang = this.lang === 'zh' ? 'en' : 'zh';
            setLang(this.lang);
            this.applyLanguage();
        });

        if (this.el.username) {
            this.el.username.addEventListener('change', () => {
                setPlayerName(this.el.username.value);
                this.el.username.value = ensurePlayerName();
            });
            this.el.username.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.el.username.blur();
            });
        }
    }

    updateMuteButtons() {
        const icon = Sfx.muted ? ICONS.soundOff : ICONS.soundOn;
        if (this.el['mute-btn']) this.el['mute-btn'].innerHTML = icon;
        if (this.el['start-mute']) this.el['start-mute'].innerHTML = icon;
    }

    toggleMute() {
        const muted = Sfx.toggleMuted();
        this.updateMuteButtons();
        if (!muted) Sfx.click();
    }
}

/* ────────────────────────── boot ────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
    window.tdGame = new TowerDefenseGame();
});
