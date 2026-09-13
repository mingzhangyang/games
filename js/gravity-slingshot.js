/**
 * Gravity Slingshot 引力弹弓
 * 原创轨道物理游戏：拖拽向后拉弹弓发射探测器，
 * 借助行星引力转弯、甩尾，把探测器送进虫洞。
 * 杆数计分（越少越好）：12 个手工关卡 + 每日赛程（5 洞，全场同一套，
 * 由 UTC+8 日期种子生成，并用弹道采样器验证可解性与标准杆）。
 *
 * 物理：固定 1/120s 子步半隐式欧拉积分， softened 逆平方引力，
 * 弹道预测与实际飞行共用同一积分器（完全确定）。
 *
 * Vanilla JS. No runtime dependencies.
 */

import { ensurePlayerName, setPlayerName } from './player.js';

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

function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
}

/* ────────────────────────── i18n ────────────────────────── */

const LANGUAGES = {
    en: {
        title: 'Gravity Slingshot',
        subtitle: 'Aim · Bend · Orbit · Capture',
        howto: 'Drag anywhere to pull back the slingshot, release to launch the probe. Planets bend your path — use their gravity to slingshot into the wormhole. Fewer launches, more stars!',
        playLevels: '🛰 Levels',
        playDaily: '📅 Daily Course',
        level: 'Hole',
        daily: 'Daily',
        launches: 'Launches',
        par: 'Par',
        total: 'Total',
        stars: 'Stars',
        retry: 'Retry',
        next: 'Next ▶',
        menu: 'Home',
        again: 'Again',
        holeCleared: 'Wormhole captured!',
        crashed: 'Crashed!',
        lost: 'Probe lost in deep space!',
        dailyDone: 'Daily course complete!',
        levelDone: 'All holes cleared!',
        bestToday: 'Your best today',
        parIn: 'in',
        launchesWord: 'launches',
        levelSelect: 'Select hole',
        leaderboard: 'Global · Today\'s Course',
        loadingScores: 'Loading…',
        noScores: 'No scores yet',
        lbOffline: 'Leaderboard offline',
        usernameLabel: 'Username (Enter to save)',
        copyResult: 'Copy',
        copied: 'Copied!',
        language: '中文',
        hint: 'Pull back & release to launch · planets bend your path',
        crashHint: 'Auto retry in a moment…',
        tapToAim: 'Drag to aim · release to launch'
    },
    zh: {
        title: '引力弹弓',
        subtitle: '瞄准 · 变轨 · 绕行 · 捕获',
        howto: '按住任意位置向后拉弹弓，松手发射探测器。行星引力会弯曲你的轨迹——借力甩尾，把探测器送进虫洞。杆数越少，星星越多！',
        playLevels: '🛰 关卡模式',
        playDaily: '📅 每日赛程',
        level: '第',
        daily: '每日',
        launches: '杆数',
        par: '标准杆',
        total: '总计',
        stars: '星星',
        retry: '重试',
        next: '下一洞 ▶',
        menu: '返回主页',
        again: '再来一次',
        holeCleared: '成功进入虫洞！',
        crashed: '撞毁！',
        lost: '探测器迷失深空！',
        dailyDone: '每日赛程完成！',
        levelDone: '全部洞口通关！',
        bestToday: '今日最好成绩',
        parIn: '',
        launchesWord: '杆',
        levelSelect: '选择洞口',
        leaderboard: '全球榜 · 今日赛程',
        loadingScores: '加载中…',
        noScores: '暂无成绩',
        lbOffline: '榜单离线',
        usernameLabel: '用户名（回车保存）',
        copyResult: '复制',
        copied: '已复制！',
        language: 'English',
        hint: '向后拉弹弓松手发射 · 借助行星引力变轨',
        crashHint: '即将自动重试…',
        tapToAim: '拖拽瞄准 · 松手发射'
    }
};

/* ────────────────────────── audio ────────────────────────── */

const Sfx = {
    ctx: null,
    muted: storageGet('gd_muted') === '1',

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

    launch(power) {
        this.tone({ freq: 180 + power * 160, endFreq: 420 + power * 220, type: 'triangle', duration: 0.22, volume: 0.16 });
    },
    crash() {
        this.tone({ freq: 200, endFreq: 45, type: 'sawtooth', duration: 0.4, volume: 0.2 });
    },
    capture() {
        [523, 659, 784, 1046].forEach((f, i) => {
            this.tone({ freq: f, type: 'triangle', duration: 0.15, volume: 0.13, delay: i * 0.08 });
        });
    },
    star3() {
        [784, 988, 1175].forEach((f, i) => {
            this.tone({ freq: f, type: 'sine', duration: 0.2, volume: 0.12, delay: 0.3 + i * 0.1 });
        });
    },
    lost() { this.tone({ freq: 320, endFreq: 110, type: 'sine', duration: 0.4, volume: 0.12 }); },
    click() { this.tone({ freq: 640, type: 'square', duration: 0.05, volume: 0.06 }); },
    toggleMuted() {
        this.muted = !this.muted;
        storageSet('gd_muted', this.muted ? '1' : '0');
        return this.muted;
    }
};

/* ────────────────────────── 物理常量 ────────────────────────── */

const W = 480, H = 640;
const G = 5300;              // 引力常数（配合 m = r²·0.5 调校手感）
const SOFT2 = 900;           // 引力软化距离²（防奇点）
const ACCEL_CAP = 2600;      // 最大加速度 px/s²
const SPEED_CAP = 540;       // 最大速度 px/s
const PROBE_R = 4;           // 探测器半径
const CAPTURE_R = 15;        // 虫洞捕获半径
const BOUNDS = 170;          // 出界边距
const FLIGHT_TIMEOUT = 20;   // 飞行超时（卡死轨道）
const DT = 1 / 120;          // 物理子步
const PREVIEW_STEPS = 66;    // 弹道预测步数（0.55s，留操作空间）
const POWER_K = 2.6;         // 拖拽像素 → 速度
const MIN_DRAG = 18;         // 最小拖拽（逻辑像素）

/* ────────────────────────── 随机与日期 ────────────────────────── */

function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function todayCompact() {
    const d = new Date(Date.now() + 8 * 3600 * 1000);
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

/* ────────────────────────── 物理引擎 ────────────────────────── */

// 天体运行时形态（静态行星 + 按时间求位的卫星）写入 scratch
const bodyScratch = Array.from({ length: 12 }, () => ({ x: 0, y: 0, r: 0, m: 0 }));

function bodiesAt(level, t) {
    let n = 0;
    for (const b of level.bodies) {
        bodyScratch[n].x = b.x;
        bodyScratch[n].y = b.y;
        bodyScratch[n].r = b.r;
        bodyScratch[n].m = b.r * b.r * 0.5;
        n++;
        if (b.moon) {
            const ang = b.moon.speed * t + b.moon.phase;
            bodyScratch[n].x = b.x + Math.cos(ang) * b.moon.dist;
            bodyScratch[n].y = b.y + Math.sin(ang) * b.moon.dist;
            bodyScratch[n].r = b.moon.r;
            bodyScratch[n].m = b.moon.r * b.moon.r * 0.5;
            n++;
        }
    }
    return n;
}

function accelAt(x, y, count) {
    let ax = 0, ay = 0;
    for (let i = 0; i < count; i++) {
        const b = bodyScratch[i];
        const dx = b.x - x, dy = b.y - y;
        const d2 = dx * dx + dy * dy + SOFT2;
        const d = Math.sqrt(d2);
        const a = Math.min(ACCEL_CAP, G * b.m / d2);
        ax += a * dx / d;
        ay += a * dy / d;
    }
    return { ax, ay };
}

function collisionAt(x, y, count) {
    for (let i = 0; i < count; i++) {
        const b = bodyScratch[i];
        const dx = x - b.x, dy = y - b.y;
        const rr = b.r + PROBE_R;
        if (dx * dx + dy * dy < rr * rr) return true;
    }
    return false;
}

/**
 * 从 (x,y) 以初速 (vx,vy) 模拟弹道。与实际飞行的积分完全一致。
 * 返回 { pts, outcome, steps } — outcome: capture|crash|lost|timeout|capped
 */
function simulate(level, x, y, vx, vy, maxSteps) {
    const pts = [];
    let t = 0;
    for (let i = 0; i < maxSteps; i++) {
        const n = bodiesAt(level, t);
        const a = accelAt(x, y, n);
        vx += a.ax * DT;
        vy += a.ay * DT;
        const sp = Math.hypot(vx, vy);
        if (sp > SPEED_CAP) {
            vx *= SPEED_CAP / sp;
            vy *= SPEED_CAP / sp;
        }
        x += vx * DT;
        y += vy * DT;
        t += DT;
        if (collisionAt(x, y, n)) return { pts, outcome: 'crash', steps: i };
        const dx = x - level.target.x, dy = y - level.target.y;
        if (dx * dx + dy * dy < CAPTURE_R * CAPTURE_R) return { pts, outcome: 'capture', steps: i };
        if (x < -BOUNDS || x > W + BOUNDS || y < -BOUNDS || y > H + BOUNDS) return { pts, outcome: 'lost', steps: i };
        pts.push({ x, y });
    }
    return { pts, outcome: 'timeout', steps: maxSteps };
}

/* ────────────────────────── 关卡（手工 12 洞） ────────────────────────── */

const LEVELS = [
    { pad: { x: 90, y: 545 },  target: { x: 395, y: 110 }, par: 1, bodies: [] },
    { pad: { x: 85, y: 545 },  target: { x: 390, y: 120 }, par: 1, bodies: [{ x: 240, y: 330, r: 30 }] },
    { pad: { x: 80, y: 560 },  target: { x: 235, y: 85 },  par: 1, bodies: [{ x: 310, y: 370, r: 34 }] },
    { pad: { x: 70, y: 555 },  target: { x: 425, y: 95 },  par: 1, bodies: [{ x: 195, y: 420, r: 24 }, { x: 330, y: 300, r: 24 }] },
    { pad: { x: 75, y: 560 },  target: { x: 255, y: 85 },  par: 2, bodies: [{ x: 195, y: 350, r: 40 }, { x: 320, y: 470, r: 30 }] },
    { pad: { x: 80, y: 555 },  target: { x: 240, y: 195 }, par: 2, bodies: [{ x: 245, y: 345, r: 46 }] },
    { pad: { x: 405, y: 550 }, target: { x: 85, y: 110 },  par: 2, bodies: [{ x: 250, y: 330, r: 30, moon: { dist: 74, r: 10, speed: 1.15, phase: 0 } }] },
    { pad: { x: 65, y: 560 },  target: { x: 420, y: 115 }, par: 2, bodies: [{ x: 180, y: 300, r: 26 }, { x: 315, y: 430, r: 26 }] },
    { pad: { x: 80, y: 555 },  target: { x: 400, y: 320 }, par: 2, bodies: [{ x: 300, y: 480, r: 22 }, { x: 300, y: 330, r: 22 }, { x: 300, y: 180, r: 22 }] },
    { pad: { x: 70, y: 570 },  target: { x: 345, y: 240 }, par: 3, bodies: [{ x: 240, y: 340, r: 40, moon: { dist: 80, r: 11, speed: 1.0, phase: 0 } }, { x: 150, y: 220, r: 22 }] },
    { pad: { x: 95, y: 560 },  target: { x: 140, y: 110 }, par: 3, bodies: [{ x: 250, y: 470, r: 36 }, { x: 360, y: 300, r: 24 }] },
    { pad: { x: 70, y: 580 },  target: { x: 240, y: 75 },  par: 3, bodies: [{ x: 150, y: 430, r: 24 }, { x: 300, y: 330, r: 28, moon: { dist: 66, r: 10, speed: -1.25, phase: 2.1 } }, { x: 395, y: 190, r: 22 }] }
];

/* ────────────────────────── 每日赛程生成 + 可解性验证 ────────────────────────── */

function generateDailyLevel(rng, holeIdx) {
    const pad = { x: 50 + rng() * 130, y: 440 + rng() * 115 };
    const ang = rng() * Math.PI * 2;
    const dist = 270 + rng() * 150;
    const target = {
        x: clamp(pad.x + Math.cos(ang) * dist, 45, 435),
        y: clamp(pad.y + Math.sin(ang) * dist, 70, 590)
    };
    if (Math.hypot(target.x - pad.x, target.y - pad.y) < 240) return null;

    const bodies = [];
    const count = 1 + Math.floor(rng() * 2.3); // 1-3 个行星
    for (let i = 0; i < count; i++) {
        let ok = false, bx = 0, by = 0, r = 0;
        for (let tries = 0; tries < 24 && !ok; tries++) {
            r = 18 + rng() * 13;
            bx = 55 + rng() * (W - 110);
            by = 80 + rng() * (H - 220);
            ok = Math.hypot(bx - pad.x, by - pad.y) > 115
                && Math.hypot(bx - target.x, by - target.y) > 78
                && bodies.every(b => Math.hypot(bx - b.x, by - b.y) > b.r + r + 42);
        }
        if (!ok) return null;
        const body = { x: bx, y: by, r };
        // 第 3 洞起概率带一颗公转卫星，制造时机要素
        if (holeIdx >= 2 && rng() < 0.28) {
            body.moon = { dist: r + 30 + rng() * 16, r: 9 + rng() * 3, speed: (rng() < 0.5 ? -1 : 1) * (0.8 + rng() * 0.6), phase: rng() * Math.PI * 2 };
        }
        bodies.push(body);
    }
    return { pad, target, par: 1, bodies };
}

// 弹道采样：验证可解性并给出诚实的标准杆
// 720 个角度 × 6 档力度；出现 ≥3 个连续角度命中 → 存在人手可复现的一杆路线（par 1）
function solvePar(level) {
    const K = 720;
    const hitAngles = [];
    let bestDist = Infinity;
    for (let i = 0; i < K; i++) {
        const ang = (i / K) * Math.PI * 2;
        const power = 150 + (i % 6) * 82;
        const res = simulate(level, level.pad.x, level.pad.y, Math.cos(ang) * power, Math.sin(ang) * power, 60 * 20);
        if (res.outcome === 'capture') hitAngles.push(i);
        for (let j = 0; j < res.pts.length; j += 4) {
            const dd = Math.hypot(res.pts[j].x - level.target.x, res.pts[j].y - level.target.y);
            if (dd < bestDist) bestDist = dd;
        }
    }
    if (hitAngles.length === 0 && bestDist > CAPTURE_R * 3.2) return null; // 不可解 → 重生成

    let run = 1, bestRun = 0;
    for (let k = 1; k <= hitAngles.length; k++) {
        if (k < hitAngles.length && hitAngles[k] === hitAngles[k - 1] + 1) run++;
        else { bestRun = Math.max(bestRun, run); run = 1; }
    }
    if (hitAngles.length > 0 && bestRun >= 3) return 1;   // ≈1° 瞄准窗口，可复现
    if (hitAngles.length > 0 || bestDist < CAPTURE_R * 2.4) return 2; // 微调即可
    return 3;                                             // 需要行星辅助的多杆路线
}

function buildDailyCourse() {
    const rng = mulberry32(hashStr('gravity-daily-' + todayCompact()));
    const holes = [];
    for (let i = 0; i < 5; i++) {
        let lv = null, par = null;
        for (let tries = 0; tries < 40 && !lv; tries++) {
            const cand = generateDailyLevel(rng, i);
            if (!cand) continue;
            const p = solvePar(cand);
            if (p) { lv = cand; par = p; }
        }
        if (!lv) {
            // 兜底：退化为简单的单行星洞
            lv = { pad: { x: 80, y: 550 }, target: { x: 390, y: 110 }, par: 2, bodies: [{ x: 235, y: 330, r: 28 }] };
            par = 2;
        }
        lv.par = par;
        holes.push(lv);
    }
    return holes;
}

/* ────────────────────────── 精灵预渲染 ────────────────────────── */

const PLANET_TONES = [
    ['#5a7bff', '#1b2a6b'],
    ['#ff8a5c', '#6b2a1b'],
    ['#8a5cff', '#331b6b'],
    ['#3fd9a4', '#14503a'],
    ['#ffcf5c', '#6b551b']
];
const spriteCache = new Map();

function planetSprite(r, toneIdx) {
    const key = `${r | 0}|${toneIdx % PLANET_TONES.length}`;
    let cv = spriteCache.get(key);
    if (cv) return cv;
    const pad = 12;
    const size = (r + pad) * 2;
    cv = document.createElement('canvas');
    cv.width = size;
    cv.height = size;
    const ctx = cv.getContext('2d');
    const cx = size / 2, cy = size / 2;
    const [c1, c2] = PLANET_TONES[toneIdx % PLANET_TONES.length];

    const glow = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r + pad * 0.9);
    glow.addColorStop(0, c1 + '3a');
    glow.addColorStop(1, c1 + '00');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r + pad * 0.9, 0, Math.PI * 2);
    ctx.fill();

    const body = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    body.addColorStop(0, c1);
    body.addColorStop(0.55, c2);
    body.addColorStop(1, '#0a0e20');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = c1 + '88';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    spriteCache.set(key, cv);
    return cv;
}

const bgCanvas = document.createElement('canvas');

function renderBackground(scale) {
    bgCanvas.width = Math.round(W * scale);
    bgCanvas.height = Math.round(H * scale);
    const ctx = bgCanvas.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#070a1c');
    bg.addColorStop(0.55, '#0b1028');
    bg.addColorStop(1, '#101336');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 星云
    const neb = [
        [110, 150, 150, 'rgba(99,102,241,0.10)'],
        [380, 460, 170, 'rgba(52,211,153,0.07)'],
        [240, 90, 120, 'rgba(168,85,247,0.08)']
    ];
    for (const [x, y, r, c] of neb) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, c);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // 静态星星
    const rng = mulberry32(20260912);
    ctx.fillStyle = '#dfe7ff';
    for (let i = 0; i < 110; i++) {
        const x = rng() * W, y = rng() * H;
        const r = 0.5 + rng() * 1.1;
        ctx.globalAlpha = 0.18 + rng() * 0.4;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

/* ────────────────────────── game ────────────────────────── */

class GravityGame {
    constructor() {
        this.canvas = document.getElementById('gd-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.el = {};
        ['gd-btn-home', 'gd-hole-label', 'gd-launches', 'gd-par', 'gd-total-box', 'gd-total',
         'gd-reset-btn', 'gd-mute-btn', 'gd-toast',
         'gd-start', 'gd-title', 'gd-subtitle', 'gd-howto', 'gd-btn-levels', 'gd-btn-daily',
         'gd-level-grid', 'gd-daily-best', 'gd-start-mute', 'gd-start-lang',
         'gd-hole', 'gd-hole-stars', 'gd-hole-line', 'gd-btn-next', 'gd-btn-replay', 'gd-btn-menu1',
         'gd-over', 'gd-over-title', 'gd-over-score', 'gd-over-sub',
         'gd-btn-again', 'gd-btn-copy', 'gd-btn-menu2',
         'gd-lb-title', 'gd-lb-list', 'gd-lb-status', 'gd-username', 'gd-username-label',
         'gd-hint'
        ].forEach(id => {
            const el = document.getElementById(id);
            if (el) this.el[id.replace(/^gd-/, '')] = el;
        });

        this.lang = this.readLang();
        this.stars = storageParseStars();

        this.mode = 'levels';
        this.course = LEVELS;     // 当前洞口序列
        this.holeIdx = 0;
        this.launches = 0;
        this.totalLaunches = 0;
        this.dailyBest = Number(storageGet('gd_daily_' + todayCompact())) || 0;

        // 飞行状态
        this.phase = 'menu';      // menu | aiming | flying | resolved | holed
        this.probe = null;
        this.trail = [];
        this.flightT = 0;
        this.particles = [];
        this.rings = [];
        this.time = 0;
        this.shake = 0;

        // 拖拽
        this.drag = null;         // {sx, sy, cx, cy}
        this.preview = null;      // {pts, outcome}

        this.animationId = null;
        this.lastFrame = 0;
        this.renderScale = 1;

        this.applyLanguage();
        this.renderLevelGrid();
        this.bindInput();
        this.bindUI();
        this.updateMuteButtons();
        this.resize();
        window.addEventListener('resize', () => this.resize());
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.phase !== 'menu') {
                // 飞行中切走：直接判负重置，避免追赶
                if (this.phase === 'flying') this.abortFlight();
            }
        });

        this.loadLevelIntoView(LEVELS[0]);
        this.startLoop();
    }

    readLang() {
        const saved = storageGet('gd_lang');
        return saved === 'zh' || saved === 'en' ? saved
            : (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
    }

    get TEXT() { return LANGUAGES[this.lang]; }

    /* ── 语言 ── */

    applyLanguage() {
        const t = this.TEXT;
        document.documentElement.lang = this.lang;
        if (this.el.title) this.el.title.textContent = t.title;
        if (this.el.subtitle) this.el.subtitle.textContent = t.subtitle;
        if (this.el.howto) this.el.howto.textContent = t.howto;
        if (this.el['btn-levels']) this.el['btn-levels'].textContent = t.playLevels;
        if (this.el['btn-daily']) this.el['btn-daily'].textContent = t.playDaily;
        if (this.el['btn-next']) this.el['btn-next'].textContent = t.next;
        if (this.el['btn-replay']) this.el['btn-replay'].textContent = `⟲ ${t.retry}`;
        if (this.el['btn-menu1']) this.el['btn-menu1'].textContent = `🏠 ${t.menu}`;
        if (this.el['btn-menu2']) this.el['btn-menu2'].textContent = `🏠 ${t.menu}`;
        if (this.el['btn-again']) this.el['btn-again'].textContent = `🔄 ${t.again}`;
        if (this.el['btn-copy']) this.el['btn-copy'].textContent = `📋 ${t.copyResult}`;
        if (this.el['lb-title']) this.el['lb-title'].textContent = `🏆 ${t.leaderboard}`;
        if (this.el['username-label']) this.el['username-label'].textContent = t.usernameLabel;
        if (this.el.username) this.el.username.placeholder = t.usernameLabel;
        if (this.el.hint) this.el.hint.textContent = t.hint;
        if (this.el['start-lang']) this.el['start-lang'].textContent = t.language;
        this.renderLevelGrid();
        this.updateDailyBest();
    }

    updateDailyBest() {
        if (!this.el['daily-best']) return;
        const best = Number(storageGet('gd_daily_' + todayCompact())) || 0;
        this.el['daily-best'].textContent = best
            ? `📅 ${this.TEXT.bestToday}: ${best} ${this.TEXT.launchesWord}`
            : '';
    }

    renderLevelGrid() {
        const grid = this.el['level-grid'];
        if (!grid) return;
        grid.textContent = '';
        for (let i = 0; i < LEVELS.length; i++) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'gd-level-chip';
            const num = document.createElement('span');
            num.className = 'gd-chip-num';
            num.textContent = String(i + 1);
            const starLine = document.createElement('span');
            starLine.className = 'gd-chip-stars';
            const n = this.stars[i] || 0;
            starLine.textContent = n > 0 ? '⭐'.repeat(n) : '☆☆☆';
            chip.append(num, starLine);
            chip.addEventListener('click', () => {
                Sfx.click();
                this.startLevelMode(i);
            });
            grid.appendChild(chip);
        }
    }

    /* ── 模式与洞口 ── */

    startLevelMode(idx) {
        this.mode = 'levels';
        this.course = LEVELS;
        this.holeIdx = clamp(idx, 0, LEVELS.length - 1);
        this.totalLaunches = 0;
        this.enterMenu(false);
        this.loadHole();
        if (window.hubTrack) window.hubTrack('gravity-slingshot', 'play');
    }

    startDailyMode() {
        this.mode = 'daily';
        this.course = buildDailyCourse();
        this.holeIdx = 0;
        this.totalLaunches = 0;
        this.enterMenu(false);
        this.loadHole();
        this.showToast(`📅 ${this.TEXT.daily} · ${this.TEXT.launchesWord} ↓`, 1800);
        if (window.hubTrack) window.hubTrack('gravity-slingshot', 'play');
    }

    loadHole() {
        this.launches = 0;
        this.loadLevelIntoView(this.course[this.holeIdx]);
        this.phase = 'aiming';
        this.updateHud();
        this.hideOverlays();
        if (this.el.hint) this.el.hint.textContent = this.TEXT.tapToAim;
    }

    loadLevelIntoView(level) {
        this.level = level;
        this.probe = { x: level.pad.x, y: level.pad.y };
        this.trail = [];
        this.preview = null;
        this.drag = null;
        this.particles.length = 0;
        this.rings.length = 0;
    }

    enterMenu(show = true) {
        this.phase = 'menu';
        if (show) {
            this.loadLevelIntoView(LEVELS[0]);
        }
        if (this.el.start) this.el.start.classList.toggle('hidden', !show);
        if (this.el.hole) this.el.hole.classList.add('hidden');
        if (this.el.over) this.el.over.classList.add('hidden');
        this.updateDailyBest();
        this.renderLevelGrid();
        this.updateHud();
    }

    hideOverlays() {
        if (this.el.start) this.el.start.classList.add('hidden');
        if (this.el.hole) this.el.hole.classList.add('hidden');
        if (this.el.over) this.el.over.classList.add('hidden');
    }

    /* ── HUD ── */

    updateHud() {
        const t = this.TEXT;
        if (this.el['hole-label']) {
            const label = this.mode === 'daily' ? `${t.daily} · ${this.holeIdx + 1}/5` : `${t.level} ${this.holeIdx + 1}/${LEVELS.length}`;
            this.el['hole-label'].textContent = label;
        }
        if (this.el.launches) this.el.launches.textContent = String(this.launches);
        if (this.el.par) this.el.par.textContent = `· ${t.par} ${this.level ? this.level.par : 1}`;
        if (this.el.total) {
            this.el.total.textContent = this.mode === 'daily'
                ? `Σ ${this.totalLaunches}`
                : `⭐ ${this.stars.reduce((a, b) => a + (b || 0), 0)}`;
        }
    }

    showToast(text, duration = 1500, warn = false) {
        const toast = this.el.toast;
        if (!toast) return;
        toast.textContent = text;
        toast.classList.remove('hidden');
        toast.classList.toggle('warn', warn);
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => toast.classList.add('hidden'), duration);
    }

    /* ── 发射与飞行 ── */

    fire(vx, vy) {
        this.launches++;
        this.phase = 'flying';
        this.probe = { x: this.level.pad.x, y: this.level.pad.y, vx, vy };
        this.trail = [];
        this.flightT = 0;
        Sfx.launch(clamp(Math.hypot(vx, vy) / SPEED_CAP, 0, 1));
        this.updateHud();
    }

    stepFlight() {
        let steps = Math.min(8, Math.round(this.frameDt / DT));
        if (steps <= 0) steps = 1;
        const sub = this.frameDt / steps;
        for (let s = 0; s < steps; s++) {
            const n = bodiesAt(this.level, this.flightT);
            const a = accelAt(this.probe.x, this.probe.y, n);
            this.probe.vx += a.ax * sub;
            this.probe.vy += a.ay * sub;
            const sp = Math.hypot(this.probe.vx, this.probe.vy);
            if (sp > SPEED_CAP) {
                this.probe.vx *= SPEED_CAP / sp;
                this.probe.vy *= SPEED_CAP / sp;
            }
            this.probe.x += this.probe.vx * sub;
            this.probe.y += this.probe.vy * sub;
            this.flightT += sub;

            if (collisionAt(this.probe.x, this.probe.y, n)) {
                this.resolveFlight('crash');
                return;
            }
            const dx = this.probe.x - this.level.target.x;
            const dy = this.probe.y - this.level.target.y;
            if (dx * dx + dy * dy < CAPTURE_R * CAPTURE_R) {
                this.resolveFlight('capture');
                return;
            }
            if (this.probe.x < -BOUNDS || this.probe.x > W + BOUNDS ||
                this.probe.y < -BOUNDS || this.probe.y > H + BOUNDS) {
                this.resolveFlight('lost');
                return;
            }
            if (this.flightT > FLIGHT_TIMEOUT) {
                this.resolveFlight('lost');
                return;
            }
        }
        this.trail.push({ x: this.probe.x, y: this.probe.y });
        if (this.trail.length > 34) this.trail.shift();
    }

    resolveFlight(outcome) {
        this.phase = 'resolved';
        if (outcome === 'crash') {
            Sfx.crash();
            this.shake = 0.35;
            this.burst(this.probe.x, this.probe.y, '#ff8a5c', 18);
            this.showToast(this.TEXT.crashed + ' ' + this.TEXT.crashHint, 900, true);
        } else if (outcome === 'lost') {
            Sfx.lost();
            this.showToast(this.TEXT.lost + ' ' + this.TEXT.crashHint, 900, true);
        } else if (outcome === 'capture') {
            this.onCapture();
            return;
        }
        setTimeout(() => {
            if (this.phase === 'resolved') {
                this.phase = 'aiming';
                this.loadLevelIntoView(this.level);
                this.updateHud();
            }
        }, 650);
    }

    abortFlight() {
        this.phase = 'aiming';
        this.loadLevelIntoView(this.level);
        this.updateHud();
    }

    onCapture() {
        this.phase = 'holed';
        Sfx.capture();
        this.burst(this.probe.x, this.probe.y, '#7dfad0', 26);
        this.rings.push({ x: this.probe.x, y: this.probe.y, r: 6, maxR: 90, age: 0, life: 0.6, color: '#7dfad0' });

        const par = this.level.par;
        const starCount = this.launches <= par ? 3 : this.launches <= par + 1 ? 2 : 1;
        if (starCount === 3) Sfx.star3();

        if (this.mode === 'daily') {
            this.totalLaunches += this.launches;
            this.updateHud();
            if (this.holeIdx >= this.course.length - 1) {
                this.finishDaily();
            } else {
                this.showToast(`✅ ${this.TEXT.holeCleared} ${this.launches} ${this.TEXT.launchesWord}`, 1100);
                setTimeout(() => {
                    if (this.phase !== 'holed') return;
                    this.holeIdx++;
                    this.loadHole();
                }, 1150);
            }
            return;
        }

        // 关卡模式：记录星星
        const prev = this.stars[this.holeIdx] || 0;
        if (starCount > prev) {
            this.stars[this.holeIdx] = starCount;
            storageSet('gd_stars', JSON.stringify(this.stars));
        }
        if (this.el['hole-stars']) this.el['hole-stars'].textContent = '⭐'.repeat(starCount) + '☆☆☆'.slice(0, (3 - starCount) * 1);
        if (this.el['hole-line']) {
            this.el['hole-line'].textContent = `${this.TEXT.launches} ${this.launches} · ${this.TEXT.par} ${par}`;
        }
        if (this.el['btn-next']) {
            this.el['btn-next'].textContent = this.holeIdx >= LEVELS.length - 1 ? `🏁 ${this.TEXT.levelDone}` : this.TEXT.next;
        }
        this.updateHud();
        setTimeout(() => {
            if (this.phase === 'holed' && this.el.hole) this.el.hole.classList.remove('hidden');
        }, 620);
    }

    nextHole() {
        if (this.mode === 'levels' && this.holeIdx >= LEVELS.length - 1) {
            if (window.hubTrack) window.hubTrack('gravity-slingshot', 'finish');
            this.enterMenu(true);
            return;
        }
        this.holeIdx++;
        this.loadHole();
    }

    /* ── 每日赛程结算 ── */

    finishDaily() {
        const date = todayCompact();
        const prev = Number(storageGet('gd_daily_' + date)) || 0;
        const isBest = !prev || this.totalLaunches < prev;
        if (isBest) storageSet('gd_daily_' + date, String(this.totalLaunches));
        this.updateDailyBest();

        if (this.el['over-title']) this.el['over-title'].textContent = `📅 ${this.TEXT.dailyDone}`;
        if (this.el['over-score']) this.el['over-score'].textContent = `${this.totalLaunches} ${this.TEXT.launchesWord}`;
        if (this.el['over-sub']) {
            this.el['over-sub'].textContent = isBest ? `🌟 ${this.TEXT.bestToday}` : `${this.TEXT.bestToday}: ${Math.min(prev, this.totalLaunches)}`;
        }
        if (this.el.username) this.el.username.value = ensurePlayerName() || '';
        if (this.el.over) this.el.over.classList.remove('hidden');
        if (window.hubTrack) window.hubTrack('gravity-slingshot', 'finish');

        const game = `gravity-d${date}`;
        fetch('https://game-scores.orangely.workers.dev/scores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game, name: ensurePlayerName() || 'Anonymous', score: this.totalLaunches }),
            mode: 'cors'
        }).then(() => this.fetchDailyBoard(game)).catch(() => {
            this.renderLocalBoard();
            if (this.el['lb-status']) this.el['lb-status'].textContent = this.TEXT.lbOffline;
        });
    }

    localBoardKey() { return `gd_local_${todayCompact()}`; }

    renderLocalBoard() {
        const list = this.el['lb-list'];
        if (!list) return;
        list.textContent = '';
        let local = [];
        try {
            local = JSON.parse(storageGet(this.localBoardKey())) || [];
        } catch (e) { local = []; }
        if (!Array.isArray(local) || local.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'gd-lb-empty';
            empty.textContent = this.TEXT.noScores;
            list.appendChild(empty);
            return;
        }
        local.slice(0, 10).forEach((s, i) => list.appendChild(this.buildLbRow(i, s)));
    }

    buildLbRow(rank, entry) {
        const row = document.createElement('div');
        row.className = 'gd-lb-row' + (rank < 3 ? ` gd-lb-top${rank + 1}` : '');
        const rankEl = document.createElement('span');
        rankEl.className = 'gd-lb-rank';
        rankEl.textContent = `${rank + 1}.`;
        const nameEl = document.createElement('span');
        nameEl.className = 'gd-lb-name';
        nameEl.textContent = entry.name; // textContent 防注入
        const scoreEl = document.createElement('span');
        scoreEl.className = 'gd-lb-score';
        scoreEl.textContent = `${entry.score}`;
        row.append(rankEl, nameEl, scoreEl);
        return row;
    }

    async fetchDailyBoard(game) {
        const list = this.el['lb-list'];
        const statusEl = this.el['lb-status'];
        if (!list) return;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);
            const res = await fetch(`https://game-scores.orangely.workers.dev/scores?game=${encodeURIComponent(game)}`, {
                signal: controller.signal,
                mode: 'cors'
            });
            clearTimeout(timeoutId);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (this.phase !== 'holed' || !this.el.over || this.el.over.classList.contains('hidden')) return;
            list.textContent = '';
            if (!Array.isArray(data) || data.length === 0) {
                this.renderLocalBoard();
                return;
            }
            data.slice(0, 10).forEach((entry, i) => list.appendChild(this.buildLbRow(i, entry)));
            if (statusEl) statusEl.textContent = '';
        } catch (e) {
            this.renderLocalBoard();
            if (statusEl) statusEl.textContent = this.TEXT.lbOffline;
        }
    }

    /* ── 粒子 ── */

    burst(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            if (this.particles.length >= 130) this.particles.shift();
            const ang = Math.random() * Math.PI * 2;
            const spd = 30 + Math.random() * 150;
            this.particles.push({
                x, y,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd,
                life: 0.45 + Math.random() * 0.4,
                age: 0,
                size: 1.4 + Math.random() * 2.4,
                color
            });
        }
    }

    /* ── 输入 ── */

    toLogical(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / rect.width * W,
            y: (e.clientY - rect.top) / rect.height * H
        };
    }

    aimVector() {
        if (!this.drag) return null;
        const dx = this.drag.sx - this.drag.cx;   // 向后拉 → 反向发射
        const dy = this.drag.sy - this.drag.cy;
        const len = Math.hypot(dx, dy);
        if (len < MIN_DRAG) return null;
        const power = clamp(len * POWER_K, 60, SPEED_CAP);
        return { vx: dx / len * power, vy: dy / len * power, power: len };
    }

    bindInput() {
        this.canvas.addEventListener('pointerdown', (e) => {
            if (this.phase !== 'aiming') return;
            e.preventDefault();
            const p = this.toLogical(e);
            this.drag = { sx: p.x, sy: p.y, cx: p.x, cy: p.y };
            this.canvas.setPointerCapture?.(e.pointerId);
        });
        this.canvas.addEventListener('pointermove', (e) => {
            if (!this.drag || this.phase !== 'aiming') return;
            const p = this.toLogical(e);
            this.drag.cx = p.x;
            this.drag.cy = p.y;
            const aim = this.aimVector();
            if (aim) {
                const res = simulate(this.level, this.level.pad.x, this.level.pad.y, aim.vx, aim.vy, PREVIEW_STEPS);
                this.preview = res;
            } else {
                this.preview = null;
            }
        });
        const endDrag = () => {
            if (!this.drag) return;
            const aim = this.aimVector();
            this.drag = null;
            this.preview = null;
            if (aim && this.phase === 'aiming') this.fire(aim.vx, aim.vy);
        };
        this.canvas.addEventListener('pointerup', endDrag);
        this.canvas.addEventListener('pointercancel', () => {
            this.drag = null;
            this.preview = null;
        });
    }

    /* ── UI 事件 ── */

    bindUI() {
        if (this.el['btn-levels']) this.el['btn-levels'].addEventListener('click', () => {
            Sfx.click();
            this.startLevelMode(0);
        });
        if (this.el['btn-daily']) this.el['btn-daily'].addEventListener('click', () => {
            Sfx.click();
            this.startDailyMode();
        });
        if (this.el['btn-home']) this.el['btn-home'].addEventListener('click', () => { Sfx.click(); this.enterMenu(true); });
        if (this.el['btn-menu1']) this.el['btn-menu1'].addEventListener('click', () => { Sfx.click(); this.enterMenu(true); });
        if (this.el['btn-menu2']) this.el['btn-menu2'].addEventListener('click', () => { Sfx.click(); this.enterMenu(true); });
        if (this.el['btn-next']) this.el['btn-next'].addEventListener('click', () => { Sfx.click(); this.nextHole(); });
        if (this.el['btn-replay']) this.el['btn-replay'].addEventListener('click', () => { Sfx.click(); this.loadHole(); });
        if (this.el['btn-again']) this.el['btn-again'].addEventListener('click', () => { Sfx.click(); this.startDailyMode(); });
        if (this.el['reset-btn']) this.el['reset-btn'].addEventListener('click', () => {
            Sfx.click();
            if (this.phase === 'flying' || this.phase === 'resolved' || this.phase === 'aiming') {
                this.phase = 'aiming';
                this.loadLevelIntoView(this.level);
                this.updateHud();
            }
        });
        if (this.el['btn-copy']) this.el['btn-copy'].addEventListener('click', () => this.copyResult());

        if (this.el['mute-btn']) this.el['mute-btn'].addEventListener('click', () => this.toggleMute());
        if (this.el['start-mute']) this.el['start-mute'].addEventListener('click', () => this.toggleMute());
        if (this.el['start-lang']) this.el['start-lang'].addEventListener('click', () => {
            this.lang = this.lang === 'zh' ? 'en' : 'zh';
            storageSet('gd_lang', this.lang);
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

    toggleMute() {
        const muted = Sfx.toggleMuted();
        this.updateMuteButtons();
        if (!muted) Sfx.click();
    }

    updateMuteButtons() {
        const icon = Sfx.muted ? '🔇' : '🔊';
        if (this.el['mute-btn']) this.el['mute-btn'].textContent = icon;
        if (this.el['start-mute']) this.el['start-mute'].textContent = icon;
    }

    async copyResult() {
        const t = this.TEXT;
        const text = `🚀 ${t.title}\n${t.daily}: ${this.totalLaunches} ${t.launchesWord}\nhttps://games.orangely.xyz/gravity-slingshot.html`;
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

    /* ── 尺寸 ── */

    resize() {
        const cssW = this.canvas.clientWidth || 300;
        const scale = cssW / W;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.renderScale = scale * dpr;
        const pw = Math.round(W * this.renderScale);
        if (this.canvas.width !== pw) {
            this.canvas.width = pw;
            this.canvas.height = Math.round(H * this.renderScale);
        }
        renderBackground(this.renderScale);
    }

    /* ── 主循环 ── */

    startLoop() {
        this.lastFrame = performance.now();
        const tick = (now) => {
            this.animationId = requestAnimationFrame(tick);
            let dt = (now - this.lastFrame) / 1000;
            this.lastFrame = now;
            if (dt > 0.05) dt = 0.05;
            this.frameDt = dt;
            this.time += dt;
            if (this.phase === 'flying') this.stepFlight();

            // 粒子
            let w = 0;
            for (let i = 0; i < this.particles.length; i++) {
                const p = this.particles[i];
                p.age += dt;
                if (p.age >= p.life) continue;
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.vx *= 0.93;
                p.vy *= 0.93;
                this.particles[w++] = p;
            }
            this.particles.length = w;

            // 波纹
            w = 0;
            for (let i = 0; i < this.rings.length; i++) {
                const r = this.rings[i];
                r.age += dt;
                if (r.age >= r.life) continue;
                r.r = r.maxR * (r.age / r.life);
                this.rings[w++] = r;
            }
            this.rings.length = w;

            if (this.shake > 0) this.shake -= dt;

            this.draw();
        };
        this.animationId = requestAnimationFrame(tick);
    }

    /* ── 渲染 ── */

    draw() {
        const ctx = this.ctx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.drawImage(bgCanvas, 0, 0);

        if (this.shake > 0) {
            const s = this.shake * 7;
            ctx.setTransform(this.renderScale, 0, 0, this.renderScale, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
        } else {
            ctx.setTransform(this.renderScale, 0, 0, this.renderScale, 0, 0);
        }

        // 闪烁星
        ctx.fillStyle = '#dfe7ff';
        for (let i = 0; i < 20; i++) {
            const tw = 0.25 + 0.3 * Math.sin(this.time * (1.1 + (i % 5) * 0.35) + i * 1.7);
            ctx.globalAlpha = Math.max(0.05, tw);
            ctx.beginPath();
            ctx.arc((i * 97 + 31) % W, (i * 197 + 83) % H, 1.1, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        const level = this.level;
        if (!level) return;
        const n = bodiesAt(level, this.phase === 'flying' ? this.flightT : this.time * 0.2);

        // 卫星轨道环
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.lineWidth = 1;
        for (const b of level.bodies) {
            if (!b.moon) continue;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.moon.dist, 0, Math.PI * 2);
            ctx.stroke();
        }

        // 行星 + 卫星
        for (let i = 0; i < n; i++) {
            const b = bodyScratch[i];
            const tone = 2; // 精灵缓存按半径区分，色相由 key 决定——这里用半径哈希选色
            const sprite = planetSprite(b.r, (b.r | 0) % PLANET_TONES.length);
            ctx.drawImage(sprite, b.x - sprite.width / 2, b.y - sprite.height / 2);
        }

        // 虫洞（目标）
        const tw = level.target;
        const pulse = 0.75 + 0.25 * Math.sin(this.time * 3.4);
        const glow = ctx.createRadialGradient(tw.x, tw.y, 2, tw.x, tw.y, 34);
        glow.addColorStop(0, `rgba(125,250,208,${0.5 * pulse})`);
        glow.addColorStop(1, 'rgba(125,250,208,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(tw.x, tw.y, 34, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(tw.x, tw.y);
        ctx.rotate(this.time * 1.6);
        ctx.strokeStyle = '#7dfad0';
        ctx.lineWidth = 2.4;
        for (let k = 0; k < 2; k++) {
            ctx.beginPath();
            ctx.arc(0, 0, CAPTURE_R - 2 + k * 4, k * Math.PI, k * Math.PI + Math.PI * 1.25);
            ctx.stroke();
        }
        ctx.restore();
        ctx.fillStyle = '#eafff6';
        ctx.beginPath();
        ctx.arc(tw.x, tw.y, 3.4 * pulse + 1.5, 0, Math.PI * 2);
        ctx.fill();

        // 发射台
        if (this.phase === 'aiming' || this.phase === 'menu') {
            ctx.strokeStyle = 'rgba(125,250,208,0.35)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 5]);
            ctx.beginPath();
            ctx.arc(level.pad.x, level.pad.y, 15, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // 拖拽弹弓带
        if (this.drag && this.phase === 'aiming') {
            const aim = this.aimVector();
            const pull = {
                x: this.level.pad.x + (this.drag.cx - this.drag.sx),
                y: this.level.pad.y + (this.drag.cy - this.drag.sy)
            };
            ctx.strokeStyle = 'rgba(255,255,255,0.28)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(this.level.pad.x, this.level.pad.y);
            ctx.lineTo(pull.x, pull.y);
            ctx.stroke();
            if (aim) {
                // 力量弧
                const frac = clamp(Math.hypot(aim.vx, aim.vy) / SPEED_CAP, 0, 1);
                ctx.strokeStyle = frac > 0.85 ? '#ff8a5c' : '#7dfad0';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(this.level.pad.x, this.level.pad.y, 21, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
                ctx.stroke();
            }
        }

        // 弹道预测
        if (this.preview && this.preview.pts.length) {
            ctx.fillStyle = 'rgba(223,231,255,0.7)';
            for (let i = 2; i < this.preview.pts.length; i += 3) {
                const p = this.preview.pts[i];
                ctx.globalAlpha = 0.65 * (1 - i / this.preview.pts.length);
                ctx.beginPath();
                ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }

        // 飞行尾迹（发光渐变）
        if (this.trail.length > 1) {
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 1; i < this.trail.length; i++) {
                const a = i / this.trail.length;
                const p0 = this.trail[i - 1], p1 = this.trail[i];
                const sp = clamp(Math.hypot(this.probe.vx, this.probe.vy) / SPEED_CAP, 0, 1);
                ctx.strokeStyle = sp > 0.72
                    ? `rgba(255,138,92,${a * 0.5})`
                    : `rgba(96,165,250,${a * 0.5})`;
                ctx.lineWidth = 1 + a * 2.4;
                ctx.beginPath();
                ctx.moveTo(p0.x, p0.y);
                ctx.lineTo(p1.x, p1.y);
                ctx.stroke();
            }
            ctx.globalCompositeOperation = 'source-over';
        }

        // 探测器
        const probeDraw = this.phase === 'flying' ? this.probe : this.level.pad;
        const bob = this.phase === 'aiming' ? Math.sin(this.time * 3) * 1.5 : 0;
        const pglow = ctx.createRadialGradient(probeDraw.x, probeDraw.y + bob, 1, probeDraw.x, probeDraw.y + bob, 12);
        pglow.addColorStop(0, 'rgba(223,231,255,0.8)');
        pglow.addColorStop(1, 'rgba(223,231,255,0)');
        ctx.fillStyle = pglow;
        ctx.beginPath();
        ctx.arc(probeDraw.x, probeDraw.y + bob, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f4f7ff';
        ctx.beginPath();
        ctx.arc(probeDraw.x, probeDraw.y + bob, PROBE_R, 0, Math.PI * 2);
        ctx.fill();

        // 波纹
        for (const r of this.rings) {
            ctx.strokeStyle = r.color;
            ctx.globalAlpha = 1 - r.age / r.life;
            ctx.lineWidth = 2.4;
            ctx.beginPath();
            ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // 粒子
        ctx.globalCompositeOperation = 'lighter';
        for (const p of this.particles) {
            ctx.globalAlpha = 1 - p.age / p.life;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    }
}

function storageParseStars() {
    try {
        const arr = JSON.parse(storageGet('gd_stars'));
        return Array.isArray(arr) ? arr : new Array(LEVELS.length).fill(0);
    } catch (e) {
        return new Array(LEVELS.length).fill(0);
    }
}

/* ────────────────────────── boot ────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
    const game = new GravityGame();
    window.gdGame = game; // 调试/测试句柄
    window.__gravityDebug = { LEVELS, simulate, solvePar, buildDailyCourse, DT, SPEED_CAP }; // QA 用
});
