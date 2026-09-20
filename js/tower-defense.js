/**
 * Neon Tower Defense 霓虹塔防
 * Canvas 塔防：脉冲 / 冰霜 / 加农 / 电磁四类塔，25 波敌人，
 * 目标集火策略、战术指挥技能、提前发波奖励、4阶觉醒形态、×1/×2/×3倍速、全球排行榜。
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
import { updateMoreGames } from './more-games.js';
import { createStatsDrawer } from './game-drawer.js';
import { bindChrome } from './game-chrome.js';
import { bindFrame } from './game-frame.js';
import { storageGet, storageSet } from './safe-storage.js';
import { track } from './analytics.js';
import { submitScore, fetchBoard } from './leaderboard.js';
import { makeText } from './i18n.js';

/* ────────────────────────── utilities ────────────────────────── */

function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
}

function formatNumber(n) {
    return Number(n).toLocaleString('en-US');
}

/* ────────────────────────── i18n ────────────────────────── */

const LANGUAGES = makeText({
    en: {
        stats: 'Stats',
        title: 'Neon Tower Defense',
        subtitle: 'Build · Upgrade · Survive',
        howto: 'Tap a cell to build towers, tap a tower to upgrade, sell or set targeting priority. Watch out for healers, armored units, flyers and tower-breakers — pick the right counter. Use commander skills (EMP & Overdrive) to hold every line.',
        play: 'Play',
        pulse: 'Pulse', frost: 'Frost', cannon: 'Cannon', tesla: 'Tesla',
        pulseDesc: 'rapid single laser', frostDesc: 'slows & freezes creeps', cannonDesc: 'splash damage & napalm', teslaDesc: 'chain lightning & shock',
        towerIntro: '🔹 Pulse · ❄️ Frost · 💥 Cannon · ⚡ Tesla',
        towerLegend: 'Towers & Awakenings',
        sideHowTo: 'How to Play',
        sideSkillsTitle: 'Tactical Skills',
        sideShortcutsTitle: 'Shortcuts',
        sideRecords: 'Records',
        wave: 'Wave',
        startWave: '▶ Wave {n}',
        waveRunning: 'Wave {n}',
        paused: 'Paused',
        resume: 'Resume',
        home: 'Home',
        again: 'Play Again',
        gameOver: 'Base Destroyed',
        victory: 'VICTORY!',
        defeatSub: 'You reached wave {n} of {total}',
        victorySub: '{lv} cleared — {lives} lives left',
        score: 'Score',
        best: 'Best',
        newBest: 'NEW BEST!',
        waveCleared: 'Wave {n} cleared! +{g} gold',
        bossIncoming: '⚠️ BOSS INCOMING',
        overlordIncoming: '💀 OVERLORD INCOMING',
        bossDefeated: '👑 BOSS ELIMINATED!',
        towerLost: '⚠️ A tower was destroyed!',
        splitToast: 'SPLIT!',
        notEnoughGold: 'Not enough gold',
        cantBuild: 'Can\'t build here',
        maxLevel: 'MAX',
        upgrade: 'Upgrade',
        sell: 'Sell',
        dmg: 'DMG', range: 'RNG', rate: 'RATE',
        priority: 'Priority',
        prioFirst: 'First', prioLast: 'Last', prioStrong: 'Strong', prioWeak: 'Weak', prioClose: 'Close', prioHealer: 'Healer',
        emp: 'EMP Shockwave',
        empDesc: 'Stuns all creeps 2.4s + electric damage [Q]',
        empCast: '⚡ EMP Shockwave Triggered!',
        overdrive: 'Overdrive',
        overdriveDesc: '+50% fire rate & +20% range for 6s [E]',
        overdriveCast: '🔥 Overdrive Activated!',
        earlyCall: '⚡ Rush Wave {n}',
        earlyCallBonus: 'Early Call',
        earlyCallToast: '⚡ Early Wave Bonus: +{g} Gold!',
        stackToast: '⚡ Wave rushed! Stack ×{n} — enemies +{hp}% HP, +{g}% gold',
        stackMax: '⚠️ Stack limit reached — clear the wave first!',
        stackLabel: 'Rush',
        ultimate: 'AWAKENING',
        damageDealt: 'DMG',
        kills: 'Kills',
        lives: 'Lives',
        waveStat: 'Wave',
        toggleRanges: 'Ranges',
        leaderboard: 'Global Top 10',
        loadingScores: 'Loading…',
        noScores: 'No scores yet',
        lbOffline: 'Leaderboard offline',
        copyResult: 'Copy',
        statLives: 'Lives',
        statGold: 'Gold',
        statWave: 'Wave',
        rangeBtnTitle: 'Toggle Ranges (R)',
        speedBtnTitle: 'Speed',
        pauseBtnTitle: 'Pause',
        muteBtnTitle: 'Sound',
        homeBtnTitle: 'Home',
        empBtnTitle: 'EMP Shockwave (Q)',
        overdriveBtnTitle: 'Overdrive (E)',
        hint: 'Click cell to build · Click tower to upgrade · Space to start wave',

        // 关卡选择
        selectLevel: 'Select Operation',
        levelBest: 'Best',
        levelLocked: 'Locked',
        levelLockHint: 'Clear {name} to unlock',
        levelWaves: '{n} waves',
        levelGold: '{n} gold',
        levelLives: '{n} lives',
        difficulty: 'Difficulty',
        enemyTeaches: 'New threats',
        levelStart: '▶ Deploy',
        back: 'Back',
        finalWave: 'FINAL SHOWDOWN',
        bossWave: '⚠️ BOSS INCOMING ⚠️',
        levels: {
            outpost: { name: 'Neon Outpost', tag: 'Recruit', desc: 'A calm perimeter run. Learn the grid and the four towers.' },
            vanguard: { name: 'Vanguard Line', tag: 'Standard', desc: 'Field medics appear. Kill them first or nothing dies.' },
            citadel: { name: 'Iron Citadel', tag: 'Hard', desc: 'Armored columns soak physical hits — bring Tesla or napalm.' },
            skyfall: { name: 'Skyfall', tag: 'Brutal', desc: 'Flyers cut straight across the map. Cover the middle, not the road.' },
            juggernaut: { name: 'Juggernaut', tag: 'Extreme', desc: 'Splitters and siege hammers. Rebuild as your towers fall.' },
            singularity: { name: 'Singularity', tag: 'Nightmare', desc: 'Every threat at once, and the Overlord heals its own army.' }
        },
        threatHealer: 'Healer', threatArmor: 'Armored', threatFlyer: 'Flying',
        threatSplitter: 'Splitter', threatAttacker: 'Siege', threatOverlord: 'Overlord',
    },
    zh: {
        stats: '数据统计',
        title: '霓虹塔防',
        subtitle: '建造 · 升级 · 守护',
        howto: '点击空格子建塔，点击塔升级、出售或切换集火策略。当心治疗兵、装甲兵、飞行兵和攻城兵——用对克制手段。合理运用指挥官技能（EMP震荡与超频加速），守住每一道防线。',
        play: '开始游戏',
        pulse: '脉冲塔', frost: '冰霜塔', cannon: '加农炮', tesla: '电磁塔',
        pulseDesc: '高速单体激光', frostDesc: '减速与冰冻急冻', cannonDesc: '范围溅射与火海', teslaDesc: '闪电连锁与感电',
        towerIntro: '🔹 脉冲 · ❄️ 冰霜 · 💥 加农 · ⚡ 电磁',
        towerLegend: '防御塔与觉醒',
        sideHowTo: '玩法说明',
        sideSkillsTitle: '指挥官技能',
        sideShortcutsTitle: '键盘快捷键',
        sideRecords: '战绩',
        wave: '第',
        startWave: '▶ 第 {n} 波',
        waveRunning: '第 {n} 波',
        paused: '已暂停',
        resume: '继续游戏',
        home: '返回主页',
        again: '再来一局',
        gameOver: '核心被摧毁',
        victory: '胜利！',
        defeatSub: '你到达了第 {n} / {total} 波',
        victorySub: '{lv} 已攻陷——剩余 {lives} 条生命',
        score: '得分',
        best: '最佳',
        newBest: '新纪录！',
        waveCleared: '第 {n} 波守住！+{g} 金币',
        bossIncoming: '⚠️ BOSS 来袭',
        overlordIncoming: '💀 霸主降临',
        bossDefeated: '👑 BOSS 已歼灭！',
        towerLost: '⚠️ 一座防御塔被摧毁！',
        splitToast: '分裂！',
        notEnoughGold: '金币不足',
        cantBuild: '这里不能建造',
        maxLevel: '满级',
        upgrade: '升级',
        sell: '出售',
        dmg: '攻击', range: '射程', rate: '攻速',
        priority: '集火目标',
        prioFirst: '首位', prioLast: '末位', prioStrong: '强敌', prioWeak: '残血', prioClose: '最近', prioHealer: '治疗兵',
        emp: 'EMP 震荡',
        empDesc: '全屏瘫痪 2.4 秒并造成高额电击伤害 [Q]',
        empCast: '⚡ EMP 电磁脉冲已释放！',
        overdrive: '战术超频',
        overdriveDesc: '全塔攻速提升 50%，射程提升 20%，持续 6 秒 [E]',
        overdriveCast: '🔥 全塔超频启动！',
        earlyCall: '⚡ 抢发第 {n} 波',
        earlyCallBonus: '提前迎击',
        earlyCallToast: '⚡ 提前迎击奖励：+{g} 金币！',
        stackToast: '⚡ 已抢发！堆叠 ×{n} —— 敌人血量 +{hp}%、金币 +{g}%',
        stackMax: '⚠️ 已达堆叠上限，先清完这波！',
        stackLabel: '堆叠',
        ultimate: '觉醒形态',
        damageDealt: '总伤',
        kills: '击杀',
        lives: '生命',
        waveStat: '波次',
        toggleRanges: '射程',
        leaderboard: '全球前 10',
        loadingScores: '加载中…',
        noScores: '暂无分数',
        lbOffline: '榜单离线',
        copyResult: '复制',
        statLives: '生命',
        statGold: '金币',
        statWave: '波次',
        rangeBtnTitle: '切换射程圈 (R)',
        speedBtnTitle: '游戏速度',
        pauseBtnTitle: '暂停',
        muteBtnTitle: '声音',
        homeBtnTitle: '返回主页',
        empBtnTitle: 'EMP 电磁震荡 (Q)',
        overdriveBtnTitle: '战术超频 (E)',
        hint: '点空格建塔 · 点塔升级/集火 · 空格发波',

        // 关卡选择
        selectLevel: '选择作战行动',
        levelBest: '最佳',
        levelLocked: '未解锁',
        levelLockHint: '通关「{name}」后解锁',
        levelWaves: '{n} 波',
        levelGold: '{n} 金币',
        levelLives: '{n} 生命',
        difficulty: '难度',
        enemyTeaches: '新增威胁',
        levelStart: '▶ 出击',
        back: '返回',
        finalWave: '终极决战',
        bossWave: '⚠️ BOSS 降临 ⚠️',
        levels: {
            outpost: { name: '霓虹哨站', tag: '新兵', desc: '一段平静的外围巡逻，用来熟悉棋盘与四种塔。' },
            vanguard: { name: '先锋防线', tag: '标准', desc: '战地医师登场——不先切掉它，其他敌人根本打不死。' },
            citadel: { name: '钢铁堡垒', tag: '困难', desc: '装甲纵队硬吃物理伤害，请带上电磁塔或加农火海破甲。' },
            skyfall: { name: '天穹坠落', tag: '残酷', desc: '飞行兵直线穿越地图。要守住中路，而不是守那条路。' },
            juggernaut: { name: '重装军团', tag: '极限', desc: '分裂兵与攻城锤齐上。塔倒了就得边打边重建。' },
            singularity: { name: '奇点终局', tag: '噩梦', desc: '所有威胁同时压上，霸主还会给整支军队回血。' }
        },
        threatHealer: '治疗兵', threatArmor: '装甲兵', threatFlyer: '飞行兵',
        threatSplitter: '分裂兵', threatAttacker: '攻城兵', threatOverlord: '霸主',
    }
});

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
        const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * duration)), ctx.sampleRate);
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
    explode() { this.noise(0.22, 0.18); this.tone({ freq: 140, endFreq: 60, type: 'sawtooth', duration: 0.2, volume: 0.16 }); },
    zap() { this.tone({ freq: 900, endFreq: 240, type: 'sawtooth', duration: 0.1, volume: 0.08 }); },
    leak() {
        this.tone({ freq: 220, endFreq: 90, type: 'square', duration: 0.25, volume: 0.18 });
        this.noise(0.15, 0.1);
    },
    bigDeath() { this.noise(0.35, 0.22); this.tone({ freq: 180, endFreq: 50, type: 'sawtooth', duration: 0.3, volume: 0.18 }); },
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
    emp() {
        this.tone({ freq: 1100, endFreq: 70, type: 'sawtooth', duration: 0.45, volume: 0.22 });
        this.noise(0.3, 0.15, 0.05);
    },
    overdrive() {
        [330, 440, 554, 659, 880].forEach((f, i) => {
            this.tone({ freq: f, type: 'triangle', duration: 0.11, volume: 0.11, delay: i * 0.05 });
        });
    },
    crit() {
        this.tone({ freq: 1200, endFreq: 1600, type: 'sine', duration: 0.08, volume: 0.15 });
    },
    freeze() {
        this.tone({ freq: 880, endFreq: 440, type: 'sine', duration: 0.18, volume: 0.14 });
        this.noise(0.12, 0.08);
    },
    earlyWave() {
        [440, 554, 659, 880].forEach((f, i) => {
            this.tone({ freq: f, type: 'triangle', duration: 0.1, volume: 0.13, delay: i * 0.06 });
        });
    },
    shieldBreak() {
        this.tone({ freq: 900, endFreq: 250, type: 'square', duration: 0.15, volume: 0.12 });
        this.noise(0.15, 0.1);
    },
    toggleMuted() {
        this.muted = !this.muted;
        setMuted(this.muted);
        return this.muted;
    }
};

/* ────────────────────────── 常量与配置 ────────────────────────── */

const W = 480, H = 640;
const COLS = 12, ROWS = 16, CELL = 40;
const SELL_RATIO = 0.7;
const MAX_PARTICLES = 160;
const MAX_FLOATERS = 40;

// 提前迎击：每叠一层，敌人血量与金币同步上浮，清波后重置
const STACK_HP_PER = 0.08;
const STACK_GOLD_PER = 0.08;
const STACK_MAX = 6;

/*
 * 关卡配置。
 * waves       —— 本关波次总数
 * gold/lives  —— 本关起始资源（后面的关卡给得更少，逼玩家精打细算）
 * hpBase      —— 血量曲线基数，决定本关"体感难度"
 * hpExp       —— 血量指数，把线性曲线改成前松后紧
 * speed       —— 敌人速度整体倍率
 * bounty      —— 金币收益倍率（越低越穷，越难滚雪球）
 * modifiers   —— 本关专属规则
 */
const LEVELS = [
    {
        id: 'outpost', waves: 15, gold: 240, lives: 20,
        hpBase: 0.16, hpExp: 1.16, speed: 1.0, bounty: 1.0,
        modifiers: {}
    },
    {
        id: 'vanguard', waves: 20, gold: 230, lives: 18,
        hpBase: 0.19, hpExp: 1.20, speed: 1.03, bounty: 0.98,
        modifiers: { regen: true }
    },
    {
        id: 'citadel', waves: 25, gold: 220, lives: 15,
        hpBase: 0.21, hpExp: 1.24, speed: 1.06, bounty: 0.95,
        modifiers: { regen: true, armored: true }
    },
    {
        id: 'skyfall', waves: 30, gold: 210, lives: 12,
        hpBase: 0.23, hpExp: 1.27, speed: 1.09, bounty: 0.92,
        modifiers: { regen: true, armored: true, flyers: true }
    },
    {
        id: 'juggernaut', waves: 35, gold: 200, lives: 10,
        hpBase: 0.25, hpExp: 1.30, speed: 1.12, bounty: 0.89,
        modifiers: { regen: true, armored: true, flyers: true, splitters: true }
    },
    {
        id: 'singularity', waves: 40, gold: 190, lives: 8,
        hpBase: 0.27, hpExp: 1.34, speed: 1.15, bounty: 0.86,
        modifiers: { regen: true, armored: true, flyers: true, splitters: true, drain: 2 }
    }
];

const LEVEL_BY_ID = {};
LEVELS.forEach(lv => { LEVEL_BY_ID[lv.id] = lv; });

// 敌人路径（格子坐标，起点在画布上方之外）
const WAYPOINTS = [
    [5, -1], [5, 3], [9, 3], [9, 6], [2, 6], [2, 10], [8, 10], [8, 13], [3, 13], [3, 15]
];

// 飞行单位的空中捷径：几乎直线插到底，不再绕行
const AIR_WAYPOINTS = [
    [5, -1], [6, 2], [4, 5], [7, 8], [5, 11], [3, 15]
];

/*
 * 敌人类型。
 * armor    —— 物理伤害减免比例（脉冲/加农被压，需电磁或火海破防）
 * attacker —— 可以攻击防御塔
 * healer   —— 周期性治疗附近友军
 * split    —— 死亡时分裂
 * flying   —— 走空中捷径
 * energy   —— 电磁伤害减免（装甲兵的抗性反制面）
 */
const ENEMY_TYPES = {
    normal: {
        hp: 34, speed: 55, gold: 6, dmg: 1, r: 9, sides: 8,
        color: '#ff6b7a', icon: '👾'
    },
    fast: {
        hp: 20, speed: 98, gold: 5, dmg: 1, r: 7, sides: 3,
        color: '#ffd34d', icon: '⚡'
    },
    tank: {
        hp: 135, speed: 33, gold: 14, dmg: 2, r: 12, sides: 6,
        color: '#a78bfa', icon: '🛡️'
    },
    swarm: {
        hp: 16, speed: 108, gold: 3, dmg: 1, r: 6.5, sides: 4,
        color: '#34d399', icon: '🐝'
    },
    shield: {
        hp: 75, speed: 48, gold: 10, dmg: 1, r: 10, sides: 7,
        color: '#38bdf8', icon: '💠', maxShield: 50
    },
    // 治疗兵：自身脆，但持续给周围友军回血，不管它就永远打不完
    healer: {
        hp: 90, speed: 44, gold: 16, dmg: 1, r: 11, sides: 6,
        color: '#86efac', icon: '💚', healer: { radius: 90, hps: 14 }
    },
    // 装甲兵：减免 60% 物理伤害，脉冲/加农打得动但极慢，要靠电磁或火海
    armor: {
        hp: 170, speed: 40, gold: 18, dmg: 2, r: 12, sides: 5,
        color: '#cbd5e1', icon: '🪨', armor: 0.6
    },
    // 飞行兵：走空中捷径，路线短、不绕路，塔位覆盖不到就必漏
    flyer: {
        hp: 60, speed: 88, gold: 11, dmg: 1, r: 8.5, sides: 3,
        color: '#f0abfc', icon: '🦇', flying: true
    },
    // 分裂兵：死亡裂成 3 只小怪，溅射清不干净就雪崩
    splitter: {
        hp: 120, speed: 52, gold: 15, dmg: 1, r: 10.5, sides: 4,
        color: '#fdba74', icon: '🧬', split: { type: 'swarm', count: 3 }
    },
    // 攻城兵：远程攻击防御塔，会把你辛苦建的塔一座座拆掉
    attacker: {
        hp: 200, speed: 38, gold: 22, dmg: 2, r: 12, sides: 6,
        color: '#fb7185', icon: '🔨',
        attacker: { range: 130, dps: 16, rate: 0.9 }
    },
    boss: {
        hp: 950, speed: 25, gold: 90, dmg: 4, r: 17, sides: 5,
        color: '#ff5a3c', icon: '👑'
    },
    // 终局 BOSS：带回血光环 + 40% 物理减伤，是最硬的一道墙
    overlord: {
        hp: 1600, speed: 22, gold: 200, dmg: 6, r: 20, sides: 8,
        color: '#e11d48', icon: '💀', armor: 0.4,
        healer: { radius: 110, hps: 22 }
    }
};

const TOWER_TYPES = {
    pulse: {
        icon: '🔹', color: '#40d8ff', cost: 50,
        levels: [
            { dmg: 9,   range: 105, rate: 2.2 },
            { dmg: 16,  range: 115, rate: 2.6, cost: 40 },
            { dmg: 28,  range: 125, rate: 3.0, cost: 65 },
            { dmg: 48,  range: 140, rate: 3.6, cost: 110, crit: 0.35, critMul: 2.5, perkName: 'Hyper Cannon (Crit)' }
        ]
    },
    frost: {
        icon: '❄️', color: '#7dd3fc', cost: 70,
        levels: [
            { dmg: 4,   range: 95,  rate: 1.1, slow: 0.42, slowDur: 1.3 },
            { dmg: 7,   range: 105, rate: 1.3, slow: 0.52, slowDur: 1.6, cost: 55 },
            { dmg: 11,  range: 115, rate: 1.5, slow: 0.62, slowDur: 2.0, cost: 90 },
            { dmg: 18,  range: 130, rate: 1.8, slow: 0.72, slowDur: 2.4, cost: 140, blizzard: true, perkName: 'Blizzard Cryo (Freeze)' }
        ]
    },
    cannon: {
        icon: '💥', color: '#ff9f43', cost: 100,
        levels: [
            { dmg: 24,  range: 110, rate: 0.75, splash: 55 },
            { dmg: 40,  range: 120, rate: 0.85, splash: 62, cost: 80 },
            { dmg: 66,  range: 130, rate: 0.95, splash: 70, cost: 130 },
            { dmg: 105, range: 145, rate: 1.1,  splash: 80, cost: 200, napalm: true, perkName: 'Napalm Nova (Fire Zone)' }
        ]
    },
    tesla: {
        icon: '⚡', color: '#c084fc', cost: 140,
        levels: [
            { dmg: 15,  range: 100, rate: 1.3, chain: 3 },
            { dmg: 25,  range: 110, rate: 1.5, chain: 4, cost: 110 },
            { dmg: 40,  range: 120, rate: 1.7, chain: 5, cost: 170 },
            { dmg: 65,  range: 135, rate: 2.0, chain: 7, cost: 250, shock: true, perkName: 'Overcharge Storm (Shock)' }
        ]
    }
};

const TARGET_PRIORITIES = ['first', 'strong', 'weak', 'close', 'healer', 'last'];

/* ────────────────────────── 路径几何 ────────────────────────── */

/** 把格子路径编译成可沿着走的折线（累计长度 + 按距离取点） */
function compilePath(waypoints) {
    const pts = waypoints.map(([c, r]) => ({ x: (c + 0.5) * CELL, y: (r + 0.5) * CELL }));
    const segs = [];
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
        const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
        segs.push(len);
        total += len;
    }
    const pointAt = (d) => {
        if (d <= 0) return { x: pts[0].x, y: pts[0].y };
        if (d >= total) return { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y };
        let acc = 0;
        for (let i = 0; i < segs.length; i++) {
            if (d <= acc + segs[i]) {
                const t = (d - acc) / segs[i];
                const a = pts[i], b = pts[i + 1];
                return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
            }
            acc += segs[i];
        }
        return { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y };
    };
    return { pts, segs, total, pointAt };
}

const GROUND_PATH = compilePath(WAYPOINTS);
const AIR_PATH = compilePath(AIR_WAYPOINTS);

const pathPts = GROUND_PATH.pts;
const PATH_TOTAL = GROUND_PATH.total;
const AIR_PATH_TOTAL = AIR_PATH.total;

function pointAtDist(d) {
    return GROUND_PATH.pointAt(d);
}

function pathOf(enemy) {
    return enemy && enemy.flying ? AIR_PATH : GROUND_PATH;
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

/* ────────────────────────── 波次构建 ────────────────────────── */

/**
 * 单波编成。
 * 血量/速度/收益均由所属关卡的曲线推导，本函数只负责"放什么、放多少、多密"。
 * 新增机制型敌人按关卡 modifiers 解锁，越靠后的关卡解锁越早、分量越重。
 */
function buildWave(n, level) {
    const L = level || LEVELS[0];
    const mods = L.modifiers || {};
    const queue = [];
    const push = (type, count, gap) => {
        for (let i = 0; i < count; i++) queue.push({ type, gap });
    };

    // 血量：前段温和、后段陡增，避免"线性曲线 = 第 1 波和第 25 波差不多"
    const t = (n - 1) / Math.max(1, L.waves - 1);
    const hpMul = (1 + (n - 1) * L.hpBase) * Math.pow(1 + t * 0.9, L.hpExp) * 1.0;
    const spdMul = L.speed * (1 + Math.min(0.4, (n - 1) * 0.013));

    // BOSS 波：每 10 波一次，末波压轴
    const isBossWave = n === L.waves || n % 10 === 0;

    if (n === L.waves) {
        // 终局：全兵种总攻，末关改为双 OVERLORD
        push('normal', 8, 0.26);
        push('fast', 8, 0.28);
        push('swarm', 12, 0.15);
        push('shield', 5, 0.6);
        push('tank', 4, 1.0);
        if (mods.armored) push('armor', 5, 0.8);
        if (mods.flyers) push('flyer', 8, 0.42);
        if (mods.splitters) push('splitter', 5, 0.85);
        if (mods.regen) push('healer', 3, 1.3);
        push(L.id === 'singularity' ? 'overlord' : 'boss', L.id === 'singularity' ? 2 : 2, 2.1);
    } else if (n % 10 === 0) {
        // 阶段 BOSS，前面垫兵
        push('normal', 7, 0.35);
        push('shield', 3, 0.7);
        push('tank', 3, 1.1);
        if (mods.armored) push('armor', 3, 0.9);
        if (mods.flyers) push('flyer', 5, 0.45);
        if (mods.regen) push('healer', 2, 1.5);
        const bossCount = n >= 30 ? 2 : 1;
        push(n >= L.waves - 10 && L.id === 'singularity' ? 'overlord' : 'boss', bossCount, 2.5);
    } else {
        // 常规波：基础兵种滚动增长
        push('normal', 5 + Math.floor(n * 1.0), Math.max(0.24, 0.78 - n * 0.018));
        if (n >= 3) push('fast', 2 + Math.floor((n - 2) * 1.0), 0.34);
        if (n >= 5) push('tank', Math.max(1, Math.floor((n - 3) * 0.7)), 1.2);
        if (n >= 6) push('swarm', Math.floor(4 + (n - 6) * 1.3), 0.16);
        if (n >= 8) push('shield', Math.floor(1 + (n - 8) * 0.6), 0.85);

        // 机制兵种：解锁后穿插进场，密度随波次抬高
        if (mods.regen && n >= 5) {
            push('healer', Math.max(1, Math.floor((n - 4) * 0.28)), 1.4);
        }
        if (mods.armored && n >= 7) {
            push('armor', Math.max(1, Math.floor((n - 6) * 0.32)), 0.95);
        }
        if (mods.flyers && n >= 9) {
            push('flyer', Math.max(2, Math.floor((n - 8) * 0.5)), 0.4);
        }
        if (mods.splitters && n >= 11) {
            push('splitter', Math.max(1, Math.floor((n - 10) * 0.28)), 0.9);
        }
        // 攻城兵：越后面越多，专门拆塔
        if (mods.armored && n >= 13) {
            push('attacker', Math.max(1, Math.floor((n - 12) * 0.22)), 1.0);
        }
    }

    const summary = {};
    for (const item of queue) {
        summary[item.type] = (summary[item.type] || 0) + 1;
    }

    return { queue, hpMul, spdMul, summary, isBossWave, bounty: L.bounty };
}

/* ────────────────────────── 游戏类 ────────────────────────── */

class TowerDefenseGame {
    constructor() {
        this.canvas = document.getElementById('td-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.el = {};
        ['td-lives', 'td-gold', 'td-wave', 'td-wave-btn', 'td-wave-text', 'td-wave-preview',
         'td-stat-lives', 'td-stat-gold', 'td-stat-wave', 'td-stack-badge',
         'td-panel', 'td-toast', 'td-start', 'td-title', 'td-subtitle', 'td-howto', 'td-tower-intro',
         'td-btn-play', 'td-best-line', 'td-start-mute', 'td-start-lang',
         'td-level-cards', 'td-level-brief', 'td-brief-waves', 'td-brief-gold', 'td-brief-lives',
         'td-select-title', 'td-brief-lbl-waves', 'td-brief-lbl-gold', 'td-brief-lbl-lives',
         'td-pause', 'td-pause-title', 'td-btn-resume', 'td-btn-menu',
         'td-over', 'td-over-title', 'td-over-verdict', 'td-over-score', 'td-over-sub',
         'td-over-waves', 'td-over-kills', 'td-over-lives',
         'td-over-lbl-waves', 'td-over-lbl-kills', 'td-over-lbl-lives',
         'td-btn-again', 'td-btn-copy', 'td-btn-menu2',
         'td-lb-title', 'td-lb-list', 'td-lb-status', 'td-username', 'td-username-label',
         'td-btn-home', 'td-speed-btn', 'td-pause-btn', 'td-mute-btn', 'td-range-btn', 'td-hint',
         'td-skill-emp', 'td-emp-timer', 'td-emp-ring', 'td-skill-boost', 'td-boost-timer', 'td-boost-ring',
         'td-side-howto-title', 'td-side-howto', 'td-side-skills-title', 'td-side-skills',
         'td-side-towers-title', 'td-side-towers', 'td-side-shortcuts-title', 'td-side-shortcuts',
         'td-side-records-title', 'td-side-records'
        ].forEach(id => {
            const el = document.getElementById(id);
            if (el) this.el[id.replace(/^td-/, '')] = el;
        });

        this.lang = this.readLang();
        this.resetRun();
        this.applyLanguage();

        this.bgCanvas = document.createElement('canvas');
        this.state = 'menu'; // menu | playing | paused | over
        this.animationId = null;
        this.lastFrameTime = 0;

        this.bindInput();
        this.bindUI();
        this.updateMuteButtons();
        this.updateHud();
        this.resize();
        window.addEventListener('resize', () => this.resize());
        // 桌面舞台尺寸随 --frame-chrome 实测值变化（见 js/game-frame.js）：
        // 后端缓冲区必须在 CSS 尺寸变化之后重算
        window.addEventListener('game-frame:changed', () => this.resize());
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.state === 'playing') this.pause();
        });

        this.drawFrame();
    }

    readLang() {
        return getLang();
    }

    get TEXT() { return LANGUAGES[this.lang]; }

    /* ── 一局的初始状态 ── */

    resetRun() {
        this.level = this.level || LEVELS[0];
        this.gold = this.level.gold;
        this.lives = this.level.lives;
        this.wave = 0;
        this.score = 0;
        this.totalKills = 0;
        this.speedMult = 1;
        this.time = 0;

        this.towers = [];
        this.towerGrid = new Int16Array(COLS * ROWS).fill(-1);
        this.enemies = [];
        this.projectiles = [];
        this.particles = [];
        this.floaters = [];
        this.effects = [];
        this.groundHazards = [];

        this.spawnQueue = [];
        this.spawnTimer = 0;
        this.hpMul = 1;
        this.spdMul = 1;
        this.waveState = 'idle'; // idle | spawning | fighting

        // 提前迎击堆叠：层数越高敌人越强、赏金越高
        this.stack = 0;
        this.stackHp = 1;
        this.stackGold = 1;

        this.empCd = 0;
        this.boostCd = 0;
        this.overdriveUntil = 0;
        this.showAllRanges = false;
        this.shakeMag = 0;
        this.shakeDur = 0;

        this.selectedCell = null;
        this.selectedTowerIdx = -1;
        this.preview = null;
        this.hoverCell = null;
        this.coreFlash = 0;
        this.sellConfirming = false;
        if (this.sellTimer) {
            clearTimeout(this.sellTimer);
            this.sellTimer = null;
        }
        document.querySelectorAll('.td-confetti-piece').forEach(el => el.remove());

        this.updateHud();
        this.renderWaveButton();
        this.updateSkillButtons();
        this.closePanel();
    }

    /* ── 震屏特效 ── */

    shake(mag, dur = 0.2) {
        this.shakeMag = Math.max(this.shakeMag, mag);
        this.shakeDur = Math.max(this.shakeDur, dur);
    }

    /* ── 语言与侧栏 ── */

    applyLanguage() {
        const t = this.TEXT;
        document.documentElement.lang = this.lang;
        document.title = this.lang === 'zh'
            ? '霓虹塔防 — 策略塔防游戏'
            : 'Neon Tower Defense — Strategy TD';
        if (this.el.title) this.el.title.textContent = t.title;
        if (this.el.subtitle) this.el.subtitle.textContent = t.subtitle;
        if (this.el.howto) this.el.howto.textContent = t.howto;
        if (this.el['tower-intro']) this.el['tower-intro'].textContent = t.towerIntro;
        if (this.el['btn-play']) this.el['btn-play'].innerHTML = `${ICONS.play}<span>${t.levelStart.replace('▶ ', '')}</span>`;
        if (this.el['pause-title']) this.el['pause-title'].textContent = t.paused;
        if (this.el['btn-resume']) this.el['btn-resume'].textContent = t.resume;
        if (this.el['btn-menu']) this.el['btn-menu'].innerHTML = `${ICONS.home}<span>${t.home}</span>`;
        if (this.el['btn-menu2']) this.el['btn-menu2'].innerHTML = `${ICONS.home}<span>${t.home}</span>`;
        if (this.el['btn-again']) this.el['btn-again'].innerHTML = `${ICONS.retry}<span>${t.again}</span>`;
        if (this.el['btn-copy']) this.el['btn-copy'].innerHTML = `${ICONS.copy}<span>${t.copyResult}</span>`;
        if (this.el['lb-title']) this.el['lb-title'].textContent = `🏆 ${t.leaderboard}`;
        if (this.el['username-label']) this.el['username-label'].textContent = t.usernameLabel;
        if (this.el.username) this.el.username.placeholder = t.usernameLabel;
        if (this.el.hint) this.el.hint.textContent = t.hint;
        if (this.el['start-lang']) this.el['start-lang'].textContent = t.language;
        if (this.el['select-title']) this.el['select-title'].textContent = t.selectLevel;
        if (this.el['brief-lbl-waves']) this.el['brief-lbl-waves'].textContent = t.statWave;
        if (this.el['brief-lbl-gold']) this.el['brief-lbl-gold'].textContent = t.statGold;
        if (this.el['brief-lbl-lives']) this.el['brief-lbl-lives'].textContent = t.statLives;
        if (this.el['best-line']) {
            const best = Number(storageGet(`td_best_${this.level.id}`)) || 0;
            this.el['best-line'].textContent = best ? `🏆 ${t.best}: ${formatNumber(best)}` : '';
        }
        if (this.el['over-lbl-waves']) this.el['over-lbl-waves'].textContent = t.waveStat;
        if (this.el['over-lbl-kills']) this.el['over-lbl-kills'].textContent = t.kills;
        if (this.el['over-lbl-lives']) this.el['over-lbl-lives'].textContent = t.lives;
        if (this.el['stat-lives']) this.el['stat-lives'].title = t.statLives;
        if (this.el['stat-gold']) this.el['stat-gold'].title = t.statGold;
        if (this.el['stat-wave']) this.el['stat-wave'].title = t.statWave;
        if (this.el['range-btn']) {
            this.el['range-btn'].title = t.rangeBtnTitle;
            this.el['range-btn'].setAttribute('aria-label', t.rangeBtnTitle);
        }
        if (this.el['speed-btn']) this.el['speed-btn'].title = t.speedBtnTitle;
        if (this.el['pause-btn']) {
            this.el['pause-btn'].title = t.pauseBtnTitle;
            this.el['pause-btn'].setAttribute('aria-label', t.pauseBtnTitle);
        }
        if (this.el['mute-btn']) {
            this.el['mute-btn'].title = t.muteBtnTitle;
            this.el['mute-btn'].setAttribute('aria-label', t.muteBtnTitle);
        }
        if (this.el['btn-home']) {
            this.el['btn-home'].title = t.homeBtnTitle;
            this.el['btn-home'].setAttribute('aria-label', t.homeBtnTitle);
        }
        if (this.el['skill-emp']) {
            this.el['skill-emp'].title = t.empBtnTitle;
            this.el['skill-emp'].setAttribute('aria-label', t.empBtnTitle);
        }
        if (this.el['skill-boost']) {
            this.el['skill-boost'].title = t.overdriveBtnTitle;
            this.el['skill-boost'].setAttribute('aria-label', t.overdriveBtnTitle);
        }

        // 侧栏
        if (this.el['side-howto-title']) this.el['side-howto-title'].textContent = `📖 ${t.sideHowTo}`;
        if (this.el['side-howto']) this.el['side-howto'].textContent = t.howto;
        if (this.el['side-skills-title']) this.el['side-skills-title'].textContent = `⚡ ${t.sideSkillsTitle}`;
        this.updateSideSkills();
        if (this.el['side-towers-title']) this.el['side-towers-title'].textContent = `🗼 ${t.towerLegend}`;
        this.updateSideTowers();
        if (this.el['side-shortcuts-title']) this.el['side-shortcuts-title'].textContent = `⌨️ ${t.sideShortcutsTitle}`;
        this.updateSideShortcuts();
        if (this.el['side-records-title']) this.el['side-records-title'].textContent = `🏅 ${t.sideRecords}`;
        this.updateSideRecords();

        this.renderPanel();
        this.renderWaveButton();
        this.updateSkillButtons();
        this.renderLevelCards();
        updateMoreGames(this.lang);
    }

    updateSideSkills() {
        const box = this.el['side-skills'];
        if (!box) return;
        const t = this.TEXT;
        const skills = [
            ['⚡ ' + t.emp, t.empDesc],
            ['🔥 ' + t.overdrive, t.overdriveDesc]
        ];
        box.textContent = '';
        skills.forEach(([name, desc]) => {
            const item = document.createElement('div');
            item.className = 'td-side-skill-item';
            const nameEl = document.createElement('b');
            nameEl.textContent = name;
            const descEl = document.createElement('span');
            descEl.textContent = desc;
            item.append(nameEl, descEl);
            box.appendChild(item);
        });
    }

    /* ── 关卡选择 ── */

    /** 关卡解锁进度：通关过的最小难度关卡数 + 1 */
    unlockedCount() {
        let count = 1;
        for (let i = 0; i < LEVELS.length - 1; i++) {
            if (storageGet(`td_clear_${LEVELS[i].id}`)) count = i + 2;
            else break;
        }
        return Math.min(LEVELS.length, count);
    }

    isLevelUnlocked(level) {
        return LEVELS.indexOf(level) < this.unlockedCount();
    }

    /** 该关会出现的机制型敌人（用于关卡卡片上的威胁标签） */
    levelThreats(level) {
        const m = level.modifiers || {};
        const list = [];
        if (m.regen) list.push('threatHealer');
        if (m.armored) list.push('threatArmor');
        if (m.flyers) list.push('threatFlyer');
        if (m.splitters) list.push('threatSplitter');
        // 攻城兵随 armored 解锁但更晚，只在长波次关卡提示
        if (m.armored && level.waves >= 30) list.push('threatAttacker');
        if (level.id === 'singularity') list.push('threatOverlord');
        return list;
    }

    renderLevelCards() {
        const box = this.el['level-cards'];
        if (!box) return;
        const t = this.TEXT;
        const unlocked = this.unlockedCount();
        box.textContent = '';

        LEVELS.forEach((level, idx) => {
            const name = t.levels[level.id] || { name: level.id, tag: '', desc: '' };
            const isUnlocked = idx < unlocked;
            const best = Number(storageGet(`td_best_${level.id}`)) || 0;
            const cleared = !!storageGet(`td_clear_${level.id}`);

            const card = document.createElement('button');
            card.type = 'button';
            card.className = `td-level-card${isUnlocked ? '' : ' locked'}${idx === LEVELS.indexOf(this.level) ? ' active' : ''}`;
            card.dataset.level = level.id;
            if (!isUnlocked) card.disabled = true;

            const head = document.createElement('div');
            head.className = 'td-level-head';
            const nameEl = document.createElement('b');
            nameEl.className = 'td-level-name';
            nameEl.textContent = `${idx + 1}. ${name.name}`;
            const tagEl = document.createElement('span');
            tagEl.className = 'td-level-tag';
            tagEl.textContent = cleared ? `✓ ${name.tag}` : name.tag;
            head.append(nameEl, tagEl);

            const descEl = document.createElement('p');
            descEl.className = 'td-level-desc';
            descEl.textContent = isUnlocked
                ? name.desc
                : t.levelLockHint.replace('{name}', name.name);

            const stats = document.createElement('div');
            stats.className = 'td-level-stats';
            [`🌊 ${t.levelWaves.replace('{n}', level.waves)}`,
             `💰 ${t.levelGold.replace('{n}', level.gold)}`,
             `❤️ ${t.levelLives.replace('{n}', level.lives)}`].forEach(txt => {
                const chip = document.createElement('span');
                chip.className = 'td-level-chip';
                chip.textContent = txt;
                stats.appendChild(chip);
            });

            card.append(head, descEl, stats);

            // 机制提示：这关新增了什么威胁
            const threats = this.levelThreats(level);
            if (isUnlocked && threats.length) {
                const row = document.createElement('div');
                row.className = 'td-level-threats';
                const lbl = document.createElement('span');
                lbl.className = 'td-level-threats-lbl';
                lbl.textContent = `${t.enemyTeaches}:`;
                row.appendChild(lbl);
                threats.forEach(key => {
                    const chip = document.createElement('span');
                    chip.className = 'td-level-threat-chip';
                    chip.textContent = t[key];
                    row.appendChild(chip);
                });
                card.appendChild(row);
            }

            if (best) {
                const bestEl = document.createElement('span');
                bestEl.className = 'td-level-best';
                bestEl.textContent = `🏆 ${t.levelBest} ${formatNumber(best)}`;
                card.appendChild(bestEl);
            } else if (!isUnlocked) {
                const lockEl = document.createElement('span');
                lockEl.className = 'td-level-best locked';
                lockEl.textContent = `🔒 ${t.levelLocked}`;
                card.appendChild(lockEl);
            }

            card.addEventListener('click', () => {
                if (!isUnlocked) return;
                Sfx.click();
                this.level = level;
                this.resetRun();
                this.renderLevelCards();
                this.renderBriefing();
            });
            box.appendChild(card);
        });

        this.renderBriefing();
    }

    renderBriefing() {
        const box = this.el['level-brief'];
        if (!box) return;
        const t = this.TEXT;
        const level = this.level;
        const name = t.levels[level.id] || { name: level.id, tag: '', desc: '' };
        box.textContent = '';

        const title = document.createElement('div');
        title.className = 'td-brief-title';
        title.textContent = `${name.name} · ${name.tag}`;
        const desc = document.createElement('p');
        desc.className = 'td-brief-desc';
        desc.textContent = name.desc;
        box.append(title, desc);

        if (this.el['brief-waves']) {
            this.el['brief-waves'].textContent = String(level.waves);
        }
        if (this.el['brief-gold']) {
            this.el['brief-gold'].textContent = String(level.gold);
        }
        if (this.el['brief-lives']) {
            this.el['brief-lives'].textContent = String(level.lives);
        }
    }

    updateSideTowers() {
        const box = this.el['side-towers'];
        if (!box) return;
        const t = this.TEXT;
        const zh = this.lang === 'zh';
        const defs = [
            [TOWER_TYPES.pulse.icon, t.pulse, t.pulseDesc,
                'Lv4: ' + (zh ? '超导脉冲 (35%暴击 2.5×伤害)' : 'Hyper Cannon (35% Crit 2.5×)'),
                zh ? '物理 · 被装甲减免' : 'Physical · reduced by armor'],
            [TOWER_TYPES.frost.icon, t.frost, t.frostDesc,
                'Lv4: ' + (zh ? '绝对零度 (72%减速 + 急冻寒潮)' : 'Blizzard Cryo (72% Slow + Freeze)'),
                zh ? '能量 · 无视装甲' : 'Energy · ignores armor'],
            [TOWER_TYPES.cannon.icon, t.cannon, t.cannonDesc,
                'Lv4: ' + (zh ? '超新星迫击炮 (持续火海地面DOT)' : 'Napalm Nova (Lingering Fire Zone)'),
                zh ? '溅射物理 / 火海破甲' : 'Splash physical / napalm pierces armor'],
            [TOWER_TYPES.tesla.icon, t.tesla, t.teslaDesc,
                'Lv4: ' + (zh ? '超能雷暴 (7跳连锁 + 感电+20%易伤)' : 'Overcharge Storm (7 Chains + Shock)'),
                zh ? '能量 · 装甲兵的克星' : 'Energy · the armor answer']
        ];
        box.textContent = '';
        defs.forEach(([icon, name, desc, perk, channel]) => {
            const row = document.createElement('div');
            row.className = 'td-side-tower';
            const nameEl = document.createElement('b');
            nameEl.textContent = `${icon} ${name}`;
            const descEl = document.createElement('span');
            descEl.textContent = desc;
            const chEl = document.createElement('span');
            chEl.className = 'td-side-channel';
            chEl.textContent = channel;
            const perkEl = document.createElement('span');
            perkEl.className = 'td-perk';
            perkEl.textContent = `⭐ ${perk}`;
            row.append(nameEl, descEl, chEl, perkEl);
            box.appendChild(row);
        });
    }

    updateSideShortcuts() {
        const box = this.el['side-shortcuts'];
        if (!box) return;
        const shortcuts = [
            ['Space', this.lang === 'zh' ? '发波 / 提前迎击' : 'Wave / Early Call'],
            ['1 - 4', this.lang === 'zh' ? '建造脉冲/冰霜/加农/电磁' : 'Build Tower 1-4'],
            ['U / S', this.lang === 'zh' ? '升级 / 出售所选塔' : 'Upgrade / Sell Tower'],
            ['T', this.lang === 'zh' ? '切换集火策略 (首位/强敌/残血)' : 'Cycle Target Priority'],
            ['Q / E', this.lang === 'zh' ? '释放 EMP / 战术超频' : 'Cast EMP / Overdrive'],
            ['R', this.lang === 'zh' ? '显示/隐藏全屏射程覆盖' : 'Toggle Range Circles'],
            ['P / Esc', this.lang === 'zh' ? '暂停 / 取消选择' : 'Pause / Deselect']
        ];
        box.textContent = '';
        shortcuts.forEach(([key, desc]) => {
            const row = document.createElement('div');
            row.className = 'td-side-shortcut-row game-side-kbd-row';
            const descEl = document.createElement('span');
            descEl.textContent = desc;
            const kbd = document.createElement('kbd');
            kbd.textContent = key;
            row.append(descEl, kbd);
            box.appendChild(row);
        });
    }

    updateSideRecords() {
        const box = this.el['side-records'];
        if (!box) return;
        const t = this.TEXT;
        const best = Number(storageGet('td_best')) || 0;
        const rows = [
            [`🏆 ${t.best}`, best ? formatNumber(best) : '—'],
            [`💀 ${t.kills}`, formatNumber(this.totalKills || 0)]
        ];
        box.textContent = '';
        rows.forEach(([label, value]) => {
            const row = document.createElement('div');
            row.className = 'td-side-row game-side-row';
            const labelEl = document.createElement('span');
            labelEl.textContent = label;
            const valueEl = document.createElement('b');
            valueEl.textContent = value;
            row.append(labelEl, valueEl);
            box.appendChild(row);
        });
    }

    /* ── 尺寸与离屏背景 ── */

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

        // 底色渐变
        const bg = ctx.createLinearGradient(0, 0, W, H);
        bg.addColorStop(0, '#0a0e24');
        bg.addColorStop(1, '#0c132c');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        // 可建网格
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (pathGrid[r * COLS + c]) continue;
                const x = c * CELL, y = r * CELL;
                ctx.fillStyle = 'rgba(255,255,255,0.026)';
                ctx.beginPath();
                ctx.roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 7);
                ctx.fill();
                ctx.strokeStyle = 'rgba(64,216,255,0.055)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }

        // 道路底层
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(pathPts[0].x, pathPts[0].y);
        for (let i = 1; i < pathPts.length; i++) ctx.lineTo(pathPts[i].x, pathPts[i].y);
        ctx.strokeStyle = '#12183e';
        ctx.lineWidth = CELL - 8;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(64,216,255,0.12)';
        ctx.lineWidth = CELL - 8;
        ctx.stroke();

        // 道路中心虚线
        ctx.beginPath();
        ctx.moveTo(pathPts[0].x, pathPts[0].y);
        for (let i = 1; i < pathPts.length; i++) ctx.lineTo(pathPts[i].x, pathPts[i].y);
        ctx.strokeStyle = 'rgba(64,216,255,0.24)';
        ctx.lineWidth = 2;
        ctx.setLineDash([9, 11]);
        ctx.stroke();
        ctx.setLineDash([]);

        // 空中航线：飞行兵走的直线捷径。
        // ⚠️ 只在「本关真的会出飞行兵」时才画（modifiers.flyers）。
        // 否则新手关会平白多出一条斜穿棋盘的紫色宽带，玩家会以为路画糊了；
        // 宽度也从 CELL-16(24px) 收到 12px、透明度 0.20→0.10 —— 它只是提示，
        // 不该抢地面主路的视觉权重。
        if (this.level && this.level.modifiers && this.level.modifiers.flyers) {
            const air = AIR_PATH.pts;
            ctx.beginPath();
            ctx.moveTo(air[0].x, air[0].y);
            for (let i = 1; i < air.length; i++) ctx.lineTo(air[i].x, air[i].y);
            ctx.strokeStyle = 'rgba(240,171,252,0.10)';
            ctx.lineWidth = 12;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(air[0].x, air[0].y);
            for (let i = 1; i < air.length; i++) ctx.lineTo(air[i].x, air[i].y);
            ctx.strokeStyle = 'rgba(240,171,252,0.42)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 9]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    /* ── 输入与快捷键 ── */

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
            if (this.selectedTowerIdx !== towerIdx) {
                if (this.sellTimer) clearTimeout(this.sellTimer);
                this.sellConfirming = false;
            }
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

        // 全局键盘快捷键
        window.addEventListener('keydown', (e) => {
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
            if (this.state === 'menu' && e.code === 'Space') {
                e.preventDefault();
                this.startGame();
                return;
            }
            if (this.state !== 'playing') {
                if (this.state === 'paused' && (e.code === 'Space' || e.key === 'p' || e.key === 'P')) {
                    e.preventDefault();
                    this.resume();
                }
                return;
            }

            if (e.code === 'Space') {
                e.preventDefault();
                this.startWave();
            } else if (e.key === '1') {
                this.tryBuild('pulse');
            } else if (e.key === '2') {
                this.tryBuild('frost');
            } else if (e.key === '3') {
                this.tryBuild('cannon');
            } else if (e.key === '4') {
                this.tryBuild('tesla');
            } else if (e.key === 'u' || e.key === 'U') {
                this.tryUpgrade();
            } else if (e.key === 's' || e.key === 'S') {
                this.trySell();
            } else if (e.key === 't' || e.key === 'T') {
                this.cycleTargetPriority();
            } else if (e.key === 'q' || e.key === 'Q') {
                this.castEmp();
            } else if (e.key === 'e' || e.key === 'E') {
                this.castOverdrive();
            } else if (e.key === 'r' || e.key === 'R') {
                this.toggleShowAllRanges();
            } else if (e.code === 'Escape') {
                this.closePanel();
            } else if (e.key === 'p' || e.key === 'P') {
                this.pause();
            }
        });
    }

    towerAt(c, r) {
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return -1;
        return this.towerGrid[r * COLS + c];
    }

    /* ── 建造 / 升级 / 出售 / 集火策略 ── */

    tryBuild(type) {
        if (!this.selectedCell || this.state !== 'playing') return;
        const { c, r } = this.selectedCell;
        if (!isBuildable(c, r) || this.towerAt(c, r) >= 0) return;
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
            angle: -Math.PI / 2,
            priority: 'first',
            damageDealt: 0,
            kills: 0,
            blizzardCount: 0,
            hp: this.towerMaxHp({ invested: cfg.cost }),
            destroyed: false,
            hurtFlash: 0
        };
        this.towers.push(tower);
        this.towerGrid[r * COLS + c] = this.towers.length - 1;
        this.gold -= cfg.cost;
        this.selectedTowerIdx = this.towers.length - 1;
        Sfx.place();
        this.burst(tower.x, tower.y, cfg.color, 12);
        this.updateHud();
        this.renderPanel();
    }

    tryUpgrade() {
        const tower = this.towers[this.selectedTowerIdx];
        if (!tower || this.state !== 'playing') return;
        const cfg = TOWER_TYPES[tower.type];
        if (tower.level >= cfg.levels.length - 1) return;
        const nextLv = cfg.levels[tower.level + 1];
        if (nextLv.cost > this.gold) {
            this.showToast(this.TEXT.notEnoughGold);
            return;
        }
        this.gold -= nextLv.cost;
        tower.invested += nextLv.cost;
        tower.level++;
        // 升级同时加固：满血补上新增的耐久
        tower.hp = this.towerMaxHp(tower);
        Sfx.upgrade();
        this.burst(tower.x, tower.y, tower.level === 3 ? '#ffd34d' : cfg.color, tower.level === 3 ? 24 : 14);
        if (tower.level === 3) {
            this.shake(3, 0.2);
            this.floater(tower.x, tower.y - 16, `⭐ ${this.TEXT.ultimate}!`, '#ffd34d', 1.3);
        }
        this.updateHud();
        this.renderPanel();
    }

    trySell() {
        const tower = this.towers[this.selectedTowerIdx];
        if (!tower || this.state !== 'playing') return;
        if (!this.sellConfirming) {
            this.sellConfirming = true;
            if (this.sellTimer) clearTimeout(this.sellTimer);
            this.sellTimer = setTimeout(() => {
                this.sellConfirming = false;
                this.renderPanel();
            }, 2500);
            Sfx.click();
            this.renderPanel();
            return;
        }
        if (this.sellTimer) clearTimeout(this.sellTimer);
        this.sellConfirming = false;
        const refund = Math.round(tower.invested * SELL_RATIO);
        this.gold += refund;
        this.towerGrid[tower.r * COLS + tower.c] = -1;
        this.towers[this.selectedTowerIdx] = null;
        Sfx.sell();
        this.closePanel();
        this.updateHud();
    }

    cycleTargetPriority() {
        const tower = this.towers[this.selectedTowerIdx];
        if (!tower || this.state !== 'playing') return;
        const curIdx = TARGET_PRIORITIES.indexOf(tower.priority || 'first');
        tower.priority = TARGET_PRIORITIES[(curIdx + 1) % TARGET_PRIORITIES.length];
        Sfx.click();
        this.renderPanel();
    }

    toggleShowAllRanges() {
        this.showAllRanges = !this.showAllRanges;
        if (this.el['range-btn']) {
            this.el['range-btn'].classList.toggle('active', this.showAllRanges);
        }
        Sfx.click();
    }

    /* ── 面板渲染 ── */

    closePanel() {
        if (this.sellTimer) {
            clearTimeout(this.sellTimer);
            this.sellTimer = null;
        }
        this.sellConfirming = false;
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

        if (this.selectedTowerIdx >= 0 && this.towers[this.selectedTowerIdx]) {
            const tower = this.towers[this.selectedTowerIdx];
            const cfg = TOWER_TYPES[tower.type];
            const lv = cfg.levels[tower.level];
            const isMax = tower.level >= cfg.levels.length - 1;
            const next = isMax ? null : cfg.levels[tower.level + 1];

            this.preview = {
                x: tower.x, y: tower.y,
                range: lv.range,
                nextRange: next ? next.range : null,
                color: cfg.color
            };

            const prioKey = 'prio' + (tower.priority || 'first').charAt(0).toUpperCase() + (tower.priority || 'first').slice(1);
            const prioName = t[prioKey] || tower.priority;

            // 头部：塔名、等级标牌、总伤击杀、关闭按钮
            const header = document.createElement('div');
            header.className = 'td-panel-header';

            const titleRow = document.createElement('div');
            titleRow.className = 'td-panel-title-row';
            titleRow.innerHTML = `<span>${cfg.icon}</span> <b>${t[tower.type]}</b> <span class="td-lv-tag ${tower.level === 3 ? 'ult' : ''}">Lv.${tower.level + 1}</span>`;

            const mvpTag = document.createElement('span');
            mvpTag.className = 'td-mvp-tag';
            mvpTag.textContent = `💥 ${formatNumber(tower.damageDealt || 0)} · 💀 ${tower.kills || 0}`;

            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'td-close-btn';
            closeBtn.textContent = '✕';
            closeBtn.addEventListener('click', () => { Sfx.click(); this.closePanel(); });

            header.append(titleRow, mvpTag, closeBtn);

            // 动作网格：集火策略、升级、出售
            const inspectGrid = document.createElement('div');
            inspectGrid.className = 'td-inspect-grid';

            // 1. 集火按钮
            const prioBtn = document.createElement('button');
            prioBtn.type = 'button';
            prioBtn.className = 'td-action-card priority';
            prioBtn.innerHTML = `<span class="td-act-label">🎯 ${t.priority} [T]</span><b class="td-act-val">${prioName}</b><span class="td-act-diff">Tap to switch</span>`;
            prioBtn.addEventListener('click', () => this.cycleTargetPriority());

            // 2. 升级按钮
            const upBtn = document.createElement('button');
            upBtn.type = 'button';
            if (next) {
                const isNextUlt = (tower.level + 1) === 3;
                upBtn.className = `td-action-card upgrade ${isNextUlt ? 'ultimate' : ''} ${next.cost > this.gold ? 'poor' : ''}`;
                upBtn.innerHTML = `<span class="td-act-label">${isNextUlt ? '⭐ ' + t.ultimate : '⬆️ ' + t.upgrade + ' [U]'}</span><b class="td-act-val">${next.cost} 💰</b><span class="td-act-diff">${t.dmg} ${lv.dmg}→${next.dmg} · ${t.range} ${lv.range}→${next.range}</span>`;
                upBtn.addEventListener('click', () => this.tryUpgrade());
            } else {
                upBtn.className = 'td-action-card maxed';
                upBtn.innerHTML = `<span class="td-act-label">⭐ ${t.maxLevel}</span><b class="td-act-val">MAXED</b><span class="td-act-diff">${lv.perkName || ''}</span>`;
            }

            // 3. 出售按钮
            const refund = Math.round(tower.invested * SELL_RATIO);
            const sellBtn = document.createElement('button');
            sellBtn.type = 'button';
            if (this.sellConfirming) {
                sellBtn.className = 'td-action-card sell confirming';
                sellBtn.innerHTML = `<span class="td-act-label">⚠️ ${this.lang === 'zh' ? '确认出售?' : 'Confirm?'} [S]</span><b class="td-act-val">+${refund} 💰</b><span class="td-act-diff">${this.lang === 'zh' ? '再次点击确认' : 'Tap again'}</span>`;
            } else {
                sellBtn.className = 'td-action-card sell';
                sellBtn.innerHTML = `<span class="td-act-label">💰 ${t.sell} [S]</span><b class="td-act-val">+${refund}</b><span class="td-act-diff">70% refund</span>`;
            }
            sellBtn.addEventListener('click', () => this.trySell());

            inspectGrid.append(prioBtn, upBtn, sellBtn);
            panel.append(header, inspectGrid);
        } else {
            const { c, r } = this.selectedCell;
            if (!isBuildable(c, r) || this.towerAt(c, r) >= 0) {
                this.closePanel();
                return;
            }

            // 选定建造模式
            this.preview = { x: (c + 0.5) * CELL, y: (r + 0.5) * CELL, range: 105, color: '#40d8ff' };

            const header = document.createElement('div');
            header.className = 'td-panel-header';
            header.innerHTML = `<div class="td-panel-title-row"><span>🏗️</span> <b>${this.lang === 'zh' ? '建造防御塔' : 'Build Tower'}</b></div>`;
            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'td-close-btn';
            closeBtn.textContent = '✕';
            closeBtn.addEventListener('click', () => { Sfx.click(); this.closePanel(); });
            header.appendChild(closeBtn);

            const buildGrid = document.createElement('div');
            buildGrid.className = 'td-build-grid';

            const hotkeys = { pulse: '1', frost: '2', cannon: '3', tesla: '4' };

            for (const [type, cfg] of Object.entries(TOWER_TYPES)) {
                const lv = cfg.levels[0];
                const card = document.createElement('button');
                card.type = 'button';
                card.className = `td-build-card ${type} ${cfg.cost > this.gold ? 'poor' : ''}`;
                card.innerHTML = `
                    <span class="td-card-hotkey">[${hotkeys[type]}]</span>
                    <span class="td-card-icon">${cfg.icon}</span>
                    <span class="td-card-name">${t[type]}</span>
                    <span class="td-card-cost">${cfg.cost} 💰</span>
                    <span class="td-card-stats">${lv.dmg}⚔️ · ${lv.range}🎯</span>
                `;
                card.addEventListener('mouseenter', () => {
                    this.preview = { x: (c + 0.5) * CELL, y: (r + 0.5) * CELL, range: lv.range, color: cfg.color };
                });
                card.addEventListener('mouseleave', () => {
                    this.preview = { x: (c + 0.5) * CELL, y: (r + 0.5) * CELL, range: 105, color: '#40d8ff' };
                });
                card.addEventListener('click', () => this.tryBuild(type));
                buildGrid.appendChild(card);
            }

            panel.append(header, buildGrid);
        }
    }

    /* ── 指挥官战术技能 ── */

    castEmp() {
        if (this.state !== 'playing' || this.empCd > 0) return;
        this.empCd = 35;
        const dmg = 45 + this.wave * 6;
        for (const e of this.enemies) {
            if (e.dead) continue;
            e.stunUntil = Math.max(e.stunUntil, this.time + 2.4);
            // EMP 是能量系：无视装甲
            this.damageEnemy(e, dmg, false, null, 'energy');
            this.burst(e.x, e.y, '#40d8ff', 8);
        }
        this.effects.push({ kind: 'emp_wave', x: W / 2, y: H / 2, maxR: Math.hypot(W, H) / 2 + 60, age: 0, life: 0.65 });
        this.shake(5, 0.35);
        Sfx.emp();
        this.showToast(this.TEXT.empCast, 1500);
        this.updateSkillButtons();
    }

    castOverdrive() {
        if (this.state !== 'playing' || this.boostCd > 0) return;
        this.boostCd = 45;
        this.overdriveUntil = this.time + 6.0;
        this.effects.push({ kind: 'overdrive_burst', age: 0, life: 0.8 });
        this.shake(3, 0.25);
        Sfx.overdrive();
        this.showToast(this.TEXT.overdriveCast, 1500);
        this.updateSkillButtons();
    }

    updateSkillButtons() {
        if (this.el['skill-emp']) {
            const ready = this.empCd <= 0;
            this.el['skill-emp'].classList.toggle('ready', ready && this.state === 'playing');
            this.el['skill-emp'].classList.toggle('on-cooldown', !ready);
            if (this.el['emp-timer']) {
                this.el['emp-timer'].textContent = ready ? '' : `${Math.ceil(this.empCd)}s`;
            }
            if (this.el['emp-ring']) {
                const pct = clamp(this.empCd / 35, 0, 1);
                this.el['emp-ring'].style.strokeDashoffset = (119.38 * pct).toFixed(1);
            }
        }
        if (this.el['skill-boost']) {
            const ready = this.boostCd <= 0;
            this.el['skill-boost'].classList.toggle('ready', ready && this.state === 'playing');
            this.el['skill-boost'].classList.toggle('on-cooldown', !ready);
            if (this.el['boost-timer']) {
                this.el['boost-timer'].textContent = ready ? '' : `${Math.ceil(this.boostCd)}s`;
            }
            if (this.el['boost-ring']) {
                const pct = clamp(this.boostCd / 45, 0, 1);
                this.el['boost-ring'].style.strokeDashoffset = (119.38 * pct).toFixed(1);
            }
        }
    }

    /* ── HUD 与波次按钮 ── */

    updateHud() {
        if (this.el.lives) {
            this.el.lives.textContent = Math.max(0, this.lives);
            const livesStat = this.el.lives.closest('.td-stat');
            if (livesStat) {
                livesStat.classList.toggle('danger', this.lives <= 5 && this.lives > 0);
            }
        }
        if (this.el.gold) {
            const currentGoldStr = formatNumber(this.gold);
            if (this.el.gold.textContent !== currentGoldStr) {
                this.el.gold.textContent = currentGoldStr;
                this.el.gold.classList.remove('gold-bounce');
                void this.el.gold.offsetWidth;
                this.el.gold.classList.add('gold-bounce');
            }
        }
        const total = this.level ? this.level.waves : 1;
        if (this.el.wave) this.el.wave.textContent = `${Math.max(1, this.wave)}/${total}`;

        // 堆叠徽标：只在压波时出现，提示玩家当前承受的额外强度
        if (this.el['stack-badge']) {
            const badge = this.el['stack-badge'];
            if (this.stack > 0) {
                badge.classList.remove('hidden');
                badge.textContent = `×${this.stack} +${Math.round(this.stack * STACK_HP_PER * 100)}%`;
                badge.classList.remove('pulse');
                void badge.offsetWidth;
                badge.classList.add('pulse');
            } else {
                badge.classList.add('hidden');
            }
        }
    }

    renderWaveButton() {
        const btn = this.el['wave-btn'];
        const textEl = this.el['wave-text'];
        const previewEl = this.el['wave-preview'];
        if (!btn || !textEl) return;
        const t = this.TEXT;
        const L = this.level;

        if (this.waveState === 'idle') {
            btn.disabled = false;
            btn.classList.remove('early-call');
            const nextWave = Math.min(L.waves, this.wave + 1);
            textEl.textContent = t.startWave.replace('{n}', nextWave);

            // 下波怪物预告
            if (previewEl && this.wave < L.waves) {
                const nextCfg = buildWave(nextWave, L);
                const chips = Object.entries(nextCfg.summary)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, cnt]) => `${ENEMY_TYPES[type].icon}×${cnt}`)
                    .slice(0, 5)
                    .join(' ');
                previewEl.textContent = chips;
            } else if (previewEl) {
                previewEl.textContent = '';
            }
        } else {
            const stackCap = Math.min(STACK_MAX, L.waves - this.wave);
            if (this.wave < L.waves) {
                btn.disabled = false;
                // 还能压波 → 高亮成"有风险的加速"；已到上限 → 收敛为普通状态
                btn.classList.toggle('early-call', this.stack < stackCap);
                textEl.textContent = this.stack < stackCap
                    ? t.earlyCall.replace('{n}', this.stack + 1)
                    : t.waveRunning.replace('{n}', this.wave);
                const alive = this.enemies.length + this.spawnQueue.length;
                if (previewEl) previewEl.textContent = `${t.waveRunning.replace('{n}', this.wave)} · ${alive}`;
            } else {
                btn.disabled = true;
                btn.classList.remove('early-call');
                const alive = this.enemies.length + this.spawnQueue.length;
                textEl.textContent = `${t.waveRunning.replace('{n}', this.wave)} · ${alive}`;
                if (previewEl) previewEl.textContent = t.finalWave;
            }
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
            if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
            const ang = Math.random() * Math.PI * 2;
            const spd = 40 + Math.random() * 140;
            this.particles.push({
                x, y,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd,
                life: 0.35 + Math.random() * 0.35,
                age: 0,
                size: 1.5 + Math.random() * 2.5,
                color
            });
        }
    }

    floater(x, y, text, color, scale = 1) {
        if (this.floaters.length >= MAX_FLOATERS) this.floaters.shift();
        this.floaters.push({ x, y, text, color, scale, age: 0, life: 0.85 });
    }

    /* ── 战斗逻辑 ── */

    /**
     * 统一伤害入口。
     * channel: 'physical' 走护甲减免，'energy'（电磁/火海/EMP）无视护甲。
     */
    damageEnemy(e, dmg, isCrit = false, killerTower = null, channel = 'physical') {
        if (e.dead) return;

        // 装甲减免：物理伤害被大幅削减，逼玩家上电磁塔或加农火海
        if (e.armor > 0 && channel === 'physical') {
            dmg = dmg * (1 - e.armor);
        }

        // 感电易伤（Tesla Lv4）
        if (this.time < e.shockUntil) {
            dmg = dmg * 1.2;
        }

        dmg = Math.max(1, Math.round(dmg));

        // 护盾抵消机制
        if (e.shield > 0) {
            if (e.shield >= dmg) {
                e.shield -= dmg;
                this.burst(e.x, e.y, '#38bdf8', 4);
                dmg = 0;
            } else {
                dmg -= e.shield;
                e.shield = 0;
                this.burst(e.x, e.y, '#38bdf8', 8);
                Sfx.shieldBreak();
            }
        }

        if (dmg > 0) {
            e.hp -= dmg;
            e.hitFlash = 0.08;
            if (killerTower) killerTower.damageDealt = (killerTower.damageDealt || 0) + dmg;
            if (isCrit) {
                this.floater(e.x, e.y - 12, `CRIT ${dmg}!`, '#ffd34d', 1.25);
                this.burst(e.x, e.y, '#ffd34d', 8);
                Sfx.crit();
            }
        }

        if (e.hp <= 0) this.killEnemy(e, killerTower);
    }

    killEnemy(e, killerTower = null) {
        if (e.dead) return;
        e.dead = true;
        this.gold += e.gold;
        this.score += e.gold;
        this.totalKills = (this.totalKills || 0) + 1;
        if (killerTower) killerTower.kills = (killerTower.kills || 0) + 1;

        const isBig = e.type === 'boss' || e.type === 'overlord';
        this.burst(e.x, e.y, e.color, isBig ? 34 : 10);
        this.floater(e.x, e.y - 10, `+${e.gold}`, '#ffd34d');

        // 分裂：死亡裂出一群小怪，位置接在当前位置，溅射清不干净就会滚雪球
        if (e.split) {
            const path = e.path;
            for (let i = 0; i < e.split.count; i++) {
                this.spawnEnemy(e.split.type, Math.max(0, e.dist - i * 14), true);
            }
            this.floaters.push({
                x: e.x, y: e.y - 22, text: this.TEXT.splitToast,
                color: '#fdba74', scale: 1, age: 0, life: 0.7
            });
        }

        if (e.type === 'tank' || isBig) {
            this.shake(isBig ? 7 : 3, 0.3);
            Sfx.bigDeath();
        }
        if (isBig) {
            this.showToast(this.TEXT.bossDefeated, 2200);
        }

        this.updateHud();
        this.renderWaveButton();
        this.updateSideRecords();
    }

    leakEnemy(e) {
        e.dead = true;
        this.lives -= e.dmg;
        this.coreFlash = 0.45;
        this.shake(5.5, 0.35);
        Sfx.leak();
        this.updateHud();
        if (this.lives <= 0) {
            this.endGame(false);
        }
    }

    spawnEnemy(type, overrideDist = 0, isSplitChild = false) {
        const cfg = ENEMY_TYPES[type];
        const hp = cfg.hp * this.hpMul * this.stackHp * (isSplitChild ? 0.55 : 1);
        const maxShield = (cfg.maxShield || 0) * this.hpMul * this.stackHp;
        const path = cfg.flying ? AIR_PATH : GROUND_PATH;
        const start = path.pointAt(overrideDist);
        const bounty = this.stackGold * (this.level ? this.level.bounty : 1);

        this.enemies.push({
            type,
            hp,
            maxHp: hp,
            shield: maxShield,
            maxShield,
            speed: cfg.speed * this.spdMul,
            gold: Math.max(1, Math.round(cfg.gold * bounty)),
            dmg: cfg.dmg,
            r: cfg.r,
            color: cfg.color,
            armor: cfg.armor || 0,
            flying: !!cfg.flying,
            healer: cfg.healer || null,
            attacker: cfg.attacker || null,
            split: cfg.split || null,
            path,
            dist: overrideDist,
            x: start.x,
            y: start.y,
            slowUntil: 0,
            slowFactor: 0,
            stunUntil: 0,
            shockUntil: 0,
            hitFlash: 0,
            healPulse: 0,
            attackCd: 0,
            dead: false
        });

        if (type === 'boss' || type === 'overlord') {
            this.showToast(type === 'overlord' ? this.TEXT.overlordIncoming : this.TEXT.bossIncoming);
            this.shake(6, 0.45);
            Sfx.bigDeath();
        }
    }

    /** 把当前堆叠层数换算成倍率 */
    applyStack() {
        this.stackHp = 1 + this.stack * STACK_HP_PER;
        this.stackGold = 1 + this.stack * STACK_GOLD_PER;
    }

    startWave() {
        if (this.state !== 'playing') return;
        const L = this.level;
        const stackCap = Math.min(STACK_MAX, L.waves - this.wave);

        // 战斗中再点 = 提前迎击：没有白给的金币，取而代之的是"压波"堆叠。
        // 每压一波，敌人血量与赏金同步 +8%，层数只有等全部清空才重置。
        if (this.waveState !== 'idle') {
            if (this.wave < L.waves && this.stack < stackCap) {
                this.stack++;
                this.applyStack();
                this.wave++;
                const waveCfg = buildWave(this.wave, L);
                this.spawnQueue.push(...waveCfg.queue);
                this.hpMul = waveCfg.hpMul;
                this.spdMul = waveCfg.spdMul;

                this.effects.push({ kind: 'emp_wave', x: W / 2, y: H / 2, maxR: Math.hypot(W, H) / 2 + 60, age: 0, life: 0.5 });
                this.shake(3, 0.25);
                Sfx.earlyWave();
                this.showToast(this.TEXT.stackToast
                    .replace('{n}', this.stack)
                    .replace('{hp}', Math.round(this.stack * STACK_HP_PER * 100))
                    .replace('{g}', Math.round(this.stack * STACK_GOLD_PER * 100)), 1700);
                this.updateHud();
                this.renderWaveButton();
            } else if (this.stack >= stackCap && this.wave < L.waves) {
                this.showToast(this.TEXT.stackMax, 1500);
            }
            return;
        }

        this.wave++;
        const waveCfg = buildWave(this.wave, L);
        this.spawnQueue = waveCfg.queue;
        this.hpMul = waveCfg.hpMul;
        this.spdMul = waveCfg.spdMul;
        this.spawnTimer = 0.35;
        this.waveState = 'spawning';
        const t = this.TEXT;
        this.waveBanner = {
            text: (this.wave === L.waves) ? t.finalWave :
                  waveCfg.isBossWave ? t.bossWave :
                  this.lang === 'zh' ? `第 ${this.wave} 波` : `WAVE ${this.wave}`,
            sub: this.stack > 0
                ? (this.lang === 'zh' ? `堆叠 ×${this.stack} · 敌人强度 +${Math.round(this.stack * STACK_HP_PER * 100)}%` : `STACKED ×${this.stack} · +${Math.round(this.stack * STACK_HP_PER * 100)}% ENEMY POWER`)
                : '',
            isBoss: waveCfg.isBossWave,
            life: 1.5,
            age: 0
        };
        Sfx.waveStart();
        this.updateHud();
        this.renderWaveButton();
    }

    waveCleared() {
        const L = this.level;
        const bonus = 25 + this.wave * 3;
        this.gold += bonus;
        this.score += 40 + this.wave * 5;
        const stacked = this.stack;
        this.showToast(this.TEXT.waveCleared.replace('{n}', this.wave).replace('{g}', bonus), 2000);
        if (this.wave >= L.waves) {
            this.endGame(true);
            return;
        }
        // 清空整波才重置堆叠：这就是"压波"的风险所在
        if (stacked > 0) {
            this.stack = 0;
            this.applyStack();
        }
        this.waveState = 'idle';
        this.updateHud();
        this.renderWaveButton();
    }

    /* ── 防御塔受损（攻城兵） ── */

    nearestTower(e, range) {
        const r2 = range * range;
        let best = null, bd = Infinity;
        for (const t of this.towers) {
            if (!t || t.destroyed) continue;
            const dx = t.x - e.x, dy = t.y - e.y;
            const d2 = dx * dx + dy * dy;
            if (d2 <= r2 && d2 < bd) { bd = d2; best = t; }
        }
        return best;
    }

    /**
     * 塔的血量 = 投资额的一半 + 下限，越贵的塔越耐拆。
     * 塔被打到 0 不是卖掉，是就地摧毁：不给退款，格子清空。
     */
    towerMaxHp(tower) {
        return Math.round(tower.invested * 0.6) + 60;
    }

    damageTower(tower, amount) {
        if (!tower || tower.destroyed) return;
        if (tower.hp === undefined) tower.hp = this.towerMaxHp(tower);
        tower.hp -= amount;
        tower.hurtFlash = 0.18;
        if (Math.random() < 0.35) {
            this.particles.push({
                x: tower.x + (Math.random() - 0.5) * 20,
                y: tower.y + (Math.random() - 0.5) * 20,
                vx: (Math.random() - 0.5) * 40,
                vy: -20 - Math.random() * 30,
                life: 0.35, age: 0, size: 2.4,
                color: '#ff9f43'
            });
        }
        if (tower.hp <= 0) this.destroyTower(tower);
    }

    destroyTower(tower) {
        tower.destroyed = true;
        this.burst(tower.x, tower.y, '#ff6b7a', 22);
        this.shake(4.5, 0.3);
        Sfx.explode();
        this.showToast(this.TEXT.towerLost, 1800);
        const idx = this.towers.indexOf(tower);
        if (idx >= 0) {
            this.towerGrid[tower.r * COLS + tower.c] = -1;
            this.towers[idx] = null;
        }
        if (this.selectedTowerIdx === idx) {
            this.selectedTowerIdx = -1;
            this.closePanel();
        }
    }

    /* ── 塔索敌与攻击 ── */

    pickTarget(tower, range) {
        const rangeSq = range * range;
        const candidates = [];
        for (const e of this.enemies) {
            if (e.dead) continue;
            const dx = e.x - tower.x, dy = e.y - tower.y;
            const d2 = dx * dx + dy * dy;
            if (d2 <= rangeSq) {
                // 进度按"走了全程的百分比"算：地面兵和飞行兵路径长度不同，
                // 直接用 dist 排序会把绕远路的敌人误判成"最靠前"
                candidates.push({
                    e, d2, hp: e.hp,
                    prog: e.dist / e.path.total
                });
            }
        }
        if (!candidates.length) return null;

        const prio = tower.priority || 'first';
        if (prio === 'first') {
            candidates.sort((a, b) => b.prog - a.prog);
        } else if (prio === 'last') {
            candidates.sort((a, b) => a.prog - b.prog);
        } else if (prio === 'strong') {
            candidates.sort((a, b) => b.hp - a.hp || b.prog - a.prog);
        } else if (prio === 'weak') {
            candidates.sort((a, b) => a.hp - b.hp || b.prog - a.prog);
        } else if (prio === 'close') {
            candidates.sort((a, b) => a.d2 - b.d2);
        } else if (prio === 'healer') {
            // 优先集火治疗兵：不切掉它，前面的伤害全被奶回来
            candidates.sort((a, b) => {
                const ah = a.e.healer ? 1 : 0;
                const bh = b.e.healer ? 1 : 0;
                return bh - ah || b.prog - a.prog;
            });
        }
        return candidates[0].e;
    }

    fireTower(tower) {
        const cfg = TOWER_TYPES[tower.type];
        const lv = cfg.levels[tower.level];
        const isBoosted = this.time < this.overdriveUntil;
        const range = isBoosted ? lv.range * 1.2 : lv.range;

        // 冰霜塔：全向光环攻击
        if (tower.type === 'frost') {
            let any = false;
            const rangeSq = range * range;
            const isBlizzard = lv.blizzard && ((tower.blizzardCount = (tower.blizzardCount || 0) + 1) % 4 === 0);

            for (const e of this.enemies) {
                if (e.dead) continue;
                const dx = e.x - tower.x, dy = e.y - tower.y;
                if (dx * dx + dy * dy <= rangeSq) {
                    // 冰霜塔是能量系：无视装甲
                    this.damageEnemy(e, lv.dmg, false, tower, 'energy');
                    const expired = this.time >= e.slowUntil;
                    e.slowUntil = this.time + lv.slowDur;
                    e.slowFactor = expired ? lv.slow : Math.max(e.slowFactor, lv.slow);
                    if (isBlizzard) {
                        e.stunUntil = Math.max(e.stunUntil, this.time + 0.8);
                    }
                    any = true;
                }
            }
            if (!any) return false;

            if (isBlizzard) {
                Sfx.freeze();
                this.effects.push({ kind: 'ring', x: tower.x, y: tower.y, r: 8, maxR: range * 1.15, age: 0, life: 0.55, color: '#e0f2fe' });
                this.burst(tower.x, tower.y, '#e0f2fe', 16);
            } else {
                this.effects.push({ kind: 'ring', x: tower.x, y: tower.y, r: 8, maxR: range, age: 0, life: 0.42, color: cfg.color });
            }
            return true;
        }

        const target = this.pickTarget(tower, range);
        if (!target) return false;
        tower.angle = Math.atan2(target.y - tower.y, target.x - tower.x);

        if (tower.type === 'pulse') {
            const isCrit = lv.crit && (Math.random() < lv.crit);
            const dmg = isCrit ? Math.round(lv.dmg * lv.critMul) : lv.dmg;
            this.projectiles.push({
                kind: 'bullet', x: tower.x, y: tower.y,
                target, lastX: target.x, lastY: target.y,
                speed: 460, dmg, isCrit, tower, color: cfg.color, r: isCrit ? 4.5 : 3
            });
            return true;
        }

        if (tower.type === 'cannon') {
            this.projectiles.push({
                kind: 'shell', x: tower.x, y: tower.y,
                target, lastX: target.x, lastY: target.y,
                speed: 280, dmg: lv.dmg, splash: lv.splash,
                napalm: lv.napalm, tower, color: cfg.color, r: 5
            });
            return true;
        }

        if (tower.type === 'tesla') {
            const chain = [target];
            let current = target;
            const chainRangeSq = 85 * 85;
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
                if (lv.shock) e.shockUntil = this.time + 3.0;
                // 电磁塔是能量系：无视装甲，是装甲兵的正确答案
                this.damageEnemy(e, dmg, false, tower, 'energy');
                this.burst(e.x, e.y, cfg.color, 4);
                dmg = Math.round(dmg * 0.7);
            }
            this.effects.push({ kind: 'zap', pts, age: 0, life: 0.18, color: cfg.color });
            Sfx.zap();
            return true;
        }

        return false;
    }

    explodeShell(x, y, dmg, radius, tower, napalm) {
        const rSq = radius * radius;
        for (const e of this.enemies) {
            if (e.dead) continue;
            const dx = e.x - x, dy = e.y - y;
            // 加农炮是物理系：会被装甲大幅削减
            if (dx * dx + dy * dy <= rSq) this.damageEnemy(e, dmg, false, tower, 'physical');
        }
        this.effects.push({ kind: 'ring', x, y, r: 4, maxR: radius, age: 0, life: 0.32, color: '#ff9f43' });
        this.burst(x, y, '#ff9f43', 12);
        this.shake(3.2, 0.2);
        Sfx.explode();

        // 4阶觉醒：火海地面持续伤害
        if (napalm) {
            this.groundHazards.push({
                x, y, r: radius * 0.75,
                dps: 18,
                duration: 3.5,
                age: 0,
                tower
            });
        }
    }

    /* ── 帧更新 ── */

    update(dt) {
        this.time += dt;

        // 技能冷却
        if (this.empCd > 0) {
            this.empCd = Math.max(0, this.empCd - dt);
            this.updateSkillButtons();
        }
        if (this.boostCd > 0) {
            this.boostCd = Math.max(0, this.boostCd - dt);
            this.updateSkillButtons();
        }

        // 震屏衰减
        if (this.shakeDur > 0) {
            this.shakeDur -= dt;
            if (this.shakeDur <= 0) this.shakeMag = 0;
        }

        // 全息波次通告
        if (this.waveBanner) {
            this.waveBanner.age += dt;
            if (this.waveBanner.age >= this.waveBanner.life) this.waveBanner = null;
        }

        // 出怪队列
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

        // 地面火海危害
        for (let i = this.groundHazards.length - 1; i >= 0; i--) {
            const g = this.groundHazards[i];
            g.age += dt;
            if (g.age >= g.duration) {
                this.groundHazards.splice(i, 1);
                continue;
            }
            const tickDmg = g.dps * dt;
            const rSq = g.r * g.r;
            for (const e of this.enemies) {
                if (e.dead) continue;
                const dx = e.x - g.x, dy = e.y - g.y;
                if (dx * dx + dy * dy <= rSq) {
                    // 火海是能量系持续伤害：无视装甲，是加农塔 Lv4 的破甲答案
                    e.hp -= tickDmg;
                    e.hitFlash = 0.04;
                    if (g.tower) g.tower.damageDealt = (g.tower.damageDealt || 0) + tickDmg;
                    if (e.hp <= 0) this.killEnemy(e, g.tower);
                }
            }
            if (Math.random() < 0.25) {
                const ang = Math.random() * Math.PI * 2;
                const rad = Math.random() * g.r;
                this.particles.push({
                    x: g.x + Math.cos(ang) * rad,
                    y: g.y + Math.sin(ang) * rad,
                    vx: (Math.random() - 0.5) * 15,
                    vy: -15 - Math.random() * 20,
                    life: 0.35,
                    age: 0,
                    size: 2,
                    color: '#ff9f43'
                });
            }
        }

        // 敌人更新
        let alive = 0;
        for (const e of this.enemies) {
            if (e.dead) continue;
            alive++;

            const isStunned = this.time < e.stunUntil;
            if (!isStunned) {
                const slowed = this.time < e.slowUntil;
                const speed = e.speed * (slowed ? (1 - e.slowFactor) : 1);
                e.dist += speed * dt;
                const p = e.path.pointAt(e.dist);
                e.x = p.x;
                e.y = p.y;
            } else if (Math.random() < 0.2) {
                this.particles.push({
                    x: e.x + (Math.random() - 0.5) * 12,
                    y: e.y + (Math.random() - 0.5) * 12,
                    vx: 0, vy: -10,
                    life: 0.25, age: 0, size: 2,
                    color: '#40d8ff'
                });
            }

            // 治疗兵：持续给范围内的友军（不含自己）回血，是"必须先切掉"的目标
            if (e.healer && !isStunned) {
                const hr2 = e.healer.radius * e.healer.radius;
                for (const other of this.enemies) {
                    if (other === e || other.dead || other.hp >= other.maxHp) continue;
                    const ox = other.x - e.x, oy = other.y - e.y;
                    if (ox * ox + oy * oy <= hr2) {
                        other.hp = Math.min(other.maxHp, other.hp + e.healer.hps * dt);
                        other.healedBy = e;
                    }
                }
            }

            // 攻城兵：停下来拆最近的塔
            if (e.attacker && !isStunned) {
                e.attackCd -= dt;
                if (e.attackCd <= 0) {
                    const t = this.nearestTower(e, e.attacker.range);
                    if (t) {
                        this.damageTower(t, e.attacker.dps / e.attacker.rate);
                        e.attackCd = 1 / e.attacker.rate;
                    } else {
                        e.attackCd = 0.2;
                    }
                }
            }

            if (e.hitFlash > 0) e.hitFlash -= dt;
            if (e.dist >= e.path.total - 6) {
                this.leakEnemy(e);
                alive--;
            }
        }

        if (this.enemies.some(e => e.dead)) {
            this.enemies = this.enemies.filter(e => !e.dead);
        }
        if (alive === 0 && this.waveState === 'fighting') {
            this.waveCleared();
        }

        // 防御塔更新
        const isBoosted = this.time < this.overdriveUntil;
        for (const tower of this.towers) {
            if (!tower) continue;
            tower.cooldown -= dt;
            if (tower.cooldown <= 0) {
                const fired = this.fireTower(tower);
                const rate = TOWER_TYPES[tower.type].levels[tower.level].rate * (isBoosted ? 1.5 : 1);
                tower.cooldown = fired ? 1 / rate : 0.05;
            }
            if (tower.type === 'frost') tower.angle += dt * 1.4;
        }

        // 子弹更新
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
                if (p.kind === 'shell') {
                    this.explodeShell(tx, ty, p.dmg, p.splash, p.tower, p.napalm);
                } else if (p.target && !p.target.dead) {
                    this.damageEnemy(p.target, p.dmg, p.isCrit, p.tower);
                }
                p.dead = true;
            } else {
                p.x += dx / dist * step;
                p.y += dy / dist * step;
            }
        }
        this.projectiles = this.projectiles.filter(p => !p.dead);

        // 粒子更新
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

        // 漂浮文字更新
        w = 0;
        for (let i = 0; i < this.floaters.length; i++) {
            const f = this.floaters[i];
            f.age += dt;
            if (f.age >= f.life) continue;
            f.y -= 28 * dt;
            this.floaters[w++] = f;
        }
        this.floaters.length = w;

        // 特效更新
        w = 0;
        for (let i = 0; i < this.effects.length; i++) {
            const fx = this.effects[i];
            fx.age += dt;
            if (fx.kind === 'ring') fx.r = fx.maxR * (fx.age / fx.life);
            if (fx.kind === 'emp_wave') fx.r = fx.maxR * (fx.age / fx.life);
            if (fx.age >= fx.life) continue;
            this.effects[w++] = fx;
        }
        this.effects.length = w;

        if (this.coreFlash > 0) this.coreFlash -= dt;
    }

    /* ── 画布渲染 ── */

    drawFrame() {
        const ctx = this.ctx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 静态背景层
        ctx.drawImage(this.bgCanvas, 0, 0);

        // 震屏变换
        let shakeX = 0, shakeY = 0;
        if (this.shakeDur > 0 && this.shakeMag > 0) {
            shakeX = (Math.random() - 0.5) * this.shakeMag;
            shakeY = (Math.random() - 0.5) * this.shakeMag;
        }
        ctx.setTransform(
            this.renderScale, 0, 0, this.renderScale,
            shakeX * this.renderScale, shakeY * this.renderScale
        );

        // 赛博光脉冲沿路径流动
        if (this.state === 'playing') {
            const pulseDist = (this.time * 95) % PATH_TOTAL;
            const pt1 = pointAtDist(pulseDist);
            const pt2 = pointAtDist((pulseDist + PATH_TOTAL * 0.5) % PATH_TOTAL);
            [pt1, pt2].forEach(p => {
                ctx.fillStyle = 'rgba(64,216,255,0.7)';
                ctx.beginPath();
                ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        // 入口动态传送门
        const entry = pointAtDist(26);
        ctx.save();
        ctx.translate(entry.x, entry.y);
        ctx.rotate(this.time * 2.5);
        ctx.strokeStyle = '#ff6b7a';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // 核心基地（旋转防护六角形）
        const core = pathPts[pathPts.length - 1];
        ctx.save();
        ctx.translate(core.x, core.y - 14);
        ctx.rotate(-this.time * 0.9);
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const ang = (i / 6) * Math.PI * 2 - Math.PI / 2;
            const px = Math.cos(ang) * 16, py = Math.sin(ang) * 16;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = '#12204a';
        ctx.fill();
        ctx.strokeStyle = this.coreFlash > 0 ? '#ff6b7a' : '#40d8ff';
        ctx.lineWidth = 2.4;
        ctx.stroke();

        // 核心能量水晶
        ctx.rotate(this.time * 1.8);
        ctx.beginPath();
        ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
        ctx.fillStyle = this.coreFlash > 0 ? '#ff6b7a' : '#40d8ff';
        ctx.fill();
        ctx.restore();

        // 全局射程透视
        if (this.showAllRanges) {
            for (const tower of this.towers) {
                if (!tower) continue;
                const cfg = TOWER_TYPES[tower.type];
                const lv = cfg.levels[tower.level];
                ctx.beginPath();
                ctx.arc(tower.x, tower.y, lv.range, 0, Math.PI * 2);
                ctx.strokeStyle = cfg.color + '26';
                ctx.lineWidth = 1.2;
                ctx.stroke();
            }
        }

        // 选定塔 / 空格射程预览
        if (this.preview) {
            ctx.beginPath();
            ctx.arc(this.preview.x, this.preview.y, this.preview.range, 0, Math.PI * 2);
            ctx.fillStyle = this.preview.color + '14';
            ctx.fill();
            ctx.strokeStyle = this.preview.color + '66';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // 下级升级射程预览虚线
            if (this.preview.nextRange) {
                ctx.beginPath();
                ctx.arc(this.preview.x, this.preview.y, this.preview.nextRange, 0, Math.PI * 2);
                ctx.strokeStyle = '#ffd34d88';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([5, 5]);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // 选定塔的当前锁敌指示准星与激光瞄准线
            if (this.selectedTowerIdx >= 0 && this.towers[this.selectedTowerIdx]) {
                const tower = this.towers[this.selectedTowerIdx];
                const target = this.pickTarget(tower, this.preview.range);
                if (target) {
                    ctx.save();
                    ctx.setLineDash([4, 4]);
                    ctx.strokeStyle = 'rgba(255, 107, 122, 0.65)';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(tower.x, tower.y);
                    ctx.lineTo(target.x, target.y);
                    ctx.stroke();
                    ctx.setLineDash([]);

                    // 目标准星
                    ctx.strokeStyle = '#ff6b7a';
                    ctx.lineWidth = 1.6;
                    ctx.beginPath();
                    ctx.arc(target.x, target.y, target.r + 5, 0, Math.PI * 2);
                    ctx.stroke();

                    // 准星十字刻度
                    ctx.beginPath();
                    ctx.moveTo(target.x - target.r - 8, target.y); ctx.lineTo(target.x - target.r - 2, target.y);
                    ctx.moveTo(target.x + target.r + 2, target.y); ctx.lineTo(target.x + target.r + 8, target.y);
                    ctx.moveTo(target.x, target.y - target.r - 8); ctx.lineTo(target.x, target.y - target.r - 2);
                    ctx.moveTo(target.x, target.y + target.r + 2); ctx.lineTo(target.x, target.y + target.r + 8);
                    ctx.stroke();
                    ctx.restore();
                }
            }
        }

        // 地面火海危害
        for (const g of this.groundHazards) {
            const grad = ctx.createRadialGradient(g.x, g.y, g.r * 0.2, g.x, g.y, g.r);
            grad.addColorStop(0, 'rgba(255, 159, 67, 0.42)');
            grad.addColorStop(1, 'rgba(255, 107, 122, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
            ctx.fill();
        }

        // 选中格高亮
        if (this.selectedCell) {
            const { c, r } = this.selectedCell;
            ctx.strokeStyle = 'rgba(94,234,176,0.85)';
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

        // 防御塔渲染
        for (const tower of this.towers) {
            if (!tower) continue;
            this.drawTower(ctx, tower);
        }
        // 敌人渲染
        for (const e of this.enemies) {
            // 飞行单位投影到地面，提示它不在路径上
            if (e.flying) {
                ctx.globalAlpha = 0.22;
                ctx.fillStyle = '#000000';
                ctx.beginPath();
                ctx.ellipse(e.x, e.y + 16, e.r * 0.9, e.r * 0.38, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }

            const sprite = enemySprites[e.type];
            if (sprite) {
                ctx.drawImage(sprite, e.x - sprite.width / 2, e.y - sprite.height / 2);
            }

            // 治疗兵：脉动的治疗光环 + 与受疗目标的连线
            if (e.healer) {
                const pulse = 0.5 + Math.sin(this.time * 3.4) * 0.5;
                ctx.strokeStyle = `rgba(134, 239, 172, ${0.22 + pulse * 0.24})`;
                ctx.lineWidth = 1.4;
                ctx.beginPath();
                ctx.arc(e.x, e.y, e.healer.radius, 0, Math.PI * 2);
                ctx.stroke();

                // 十字标，一眼认出是奶妈
                ctx.strokeStyle = '#dcfce7';
                ctx.lineWidth = 2.2;
                ctx.beginPath();
                ctx.moveTo(e.x, e.y - e.r - 7);
                ctx.lineTo(e.x, e.y - e.r - 1);
                ctx.moveTo(e.x - 3, e.y - e.r - 4);
                ctx.lineTo(e.x + 3, e.y - e.r - 4);
                ctx.stroke();
            }

            // 装甲兵：外圈装甲板示意
            if (e.armor > 0) {
                ctx.strokeStyle = 'rgba(226, 232, 240, 0.85)';
                ctx.lineWidth = 2.6;
                ctx.setLineDash([5, 4]);
                ctx.beginPath();
                ctx.arc(e.x, e.y, e.r + 2.5, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // 攻城兵：炮口指向最近的目标塔
            if (e.attacker) {
                const tgt = this.nearestTower(e, e.attacker.range);
                if (tgt) {
                    ctx.strokeStyle = 'rgba(251, 113, 133, 0.5)';
                    ctx.lineWidth = 1.3;
                    ctx.setLineDash([3, 4]);
                    ctx.beginPath();
                    ctx.moveTo(e.x, e.y);
                    ctx.lineTo(tgt.x, tgt.y);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            }

            // 冰冻 / 眩晕电流标志
            if (this.time < e.stunUntil) {
                ctx.strokeStyle = '#40d8ff';
                ctx.lineWidth = 1.8;
                ctx.beginPath();
                ctx.arc(e.x, e.y, e.r + 4, 0, Math.PI * 2);
                ctx.stroke();
            }

            // 护盾光环
            if (e.shield > 0) {
                ctx.strokeStyle = '#38bdf8';
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.arc(e.x, e.y, e.r + 3.5, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // 受击白闪
            if (e.hitFlash > 0) {
                ctx.globalAlpha = Math.min(1, e.hitFlash * 8);
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }

            // 血条与护盾条
            if (e.hp < e.maxHp || e.shield > 0) {
                const bw = e.r * 2.2;
                const frac = Math.max(0, e.hp / e.maxHp);
                ctx.fillStyle = 'rgba(0,0,0,0.6)';
                ctx.fillRect(e.x - bw / 2, e.y - e.r - 8, bw, 3.5);
                ctx.fillStyle = frac > 0.5 ? '#3fd97c' : frac > 0.25 ? '#ffd34d' : '#ff6b7a';
                ctx.fillRect(e.x - bw / 2, e.y - e.r - 8, bw * frac, 3.5);

                if (e.shield > 0 && e.maxShield > 0) {
                    const sFrac = Math.max(0, e.shield / e.maxShield);
                    ctx.fillStyle = '#38bdf8';
                    ctx.fillRect(e.x - bw / 2, e.y - e.r - 12, bw * sFrac, 2.5);
                }
            }
        }

        // 子弹渲染
        ctx.globalCompositeOperation = 'lighter';
        for (const p of this.projectiles) {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
            if (p.kind === 'shell') {
                ctx.globalAlpha = 0.45;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r + 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }
        }

        // 特效渲染
        for (const fx of this.effects) {
            const t = fx.age / fx.life;
            ctx.globalAlpha = 1 - t;
            if (fx.kind === 'ring' || fx.kind === 'emp_wave') {
                ctx.strokeStyle = fx.kind === 'emp_wave' ? '#40d8ff' : fx.color;
                ctx.lineWidth = fx.kind === 'emp_wave' ? 4 : 2.5;
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
                    const mx = (a.x + b.x) / 2 + (Math.random() - 0.5) * 12;
                    const my = (a.y + b.y) / 2 + (Math.random() - 0.5) * 12;
                    ctx.lineTo(mx, my);
                    ctx.lineTo(b.x, b.y);
                }
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }

        // 粒子渲染
        for (const pt of this.particles) {
            const alpha = 1 - pt.age / pt.life;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = pt.color;
            ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';

        // 漂浮文字
        for (const f of this.floaters) {
            ctx.globalAlpha = 1 - f.age / f.life;
            ctx.fillStyle = f.color;
            const fontSz = Math.round(13 * (f.scale || 1));
            ctx.font = `800 ${fontSz}px "Segoe UI", system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(f.text, f.x, f.y);
        }
        ctx.globalAlpha = 1;

        // BOSS / 霸主 血条（当场上有 BOSS 时在顶部渲染）
        const boss = this.enemies.find(e => (e.type === 'boss' || e.type === 'overlord') && !e.dead);
        if (boss) {
            const isOverlord = boss.type === 'overlord';
            const bx = W / 2 - 130, by = 12, bw = 260, bh = 14;
            ctx.fillStyle = 'rgba(10, 14, 36, 0.85)';
            ctx.strokeStyle = isOverlord ? '#e11d48' : '#ff5a3c';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(bx, by, bw, bh, 7);
            ctx.fill();
            ctx.stroke();

            const hpRatio = clamp(boss.hp / boss.maxHp, 0, 1);
            const bGrad = ctx.createLinearGradient(bx, by, bx + bw, by);
            bGrad.addColorStop(0, isOverlord ? '#e11d48' : '#ff5a3c');
            bGrad.addColorStop(1, '#ffd34d');
            ctx.fillStyle = bGrad;
            ctx.beginPath();
            ctx.roundRect(bx + 2, by + 2, (bw - 4) * hpRatio, bh - 4, 5);
            ctx.fill();

            ctx.font = '800 10px "Segoe UI", system-ui, sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            const tag = isOverlord ? '💀 OVERLORD' : '👑 BOSS';
            ctx.fillText(`${tag} · ${Math.ceil(boss.hp)} / ${Math.ceil(boss.maxHp)}`, W / 2, by + 11);
        }

        // 全息波次通告横幅
        if (this.waveBanner) {
            const b = this.waveBanner;
            const progress = b.age / b.life;
            const alpha = progress < 0.2 ? progress / 0.2 : progress > 0.7 ? (1 - progress) / 0.3 : 1;
            const cy = H * 0.36;
            ctx.save();
            ctx.fillStyle = b.isBoss ? `rgba(255, 90, 60, ${alpha * 0.18})` : `rgba(64, 216, 255, ${alpha * 0.14})`;
            ctx.fillRect(0, cy - 24, W, 48);
            ctx.strokeStyle = b.isBoss ? `rgba(255, 90, 60, ${alpha * 0.65})` : `rgba(64, 216, 255, ${alpha * 0.55})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(0, cy - 24); ctx.lineTo(W, cy - 24);
            ctx.moveTo(0, cy + 24); ctx.lineTo(W, cy + 24);
            ctx.stroke();

            ctx.font = '900 22px "Segoe UI", system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = b.isBoss ? `rgba(255, 211, 77, ${alpha})` : `rgba(255, 255, 255, ${alpha})`;
            ctx.shadowColor = b.isBoss ? '#ff5a3c' : '#40d8ff';
            ctx.shadowBlur = 14;
            ctx.fillText(b.text, W / 2, b.sub ? cy - 7 : cy);

            // 压波提示：告诉玩家这一波额外承受了多少强度
            if (b.sub) {
                ctx.font = '800 12px "Segoe UI", system-ui, sans-serif';
                ctx.fillStyle = `rgba(255, 176, 160, ${alpha})`;
                ctx.shadowBlur = 8;
                ctx.fillText(b.sub, W / 2, cy + 13);
            }
            ctx.restore();
        }

        // 核心受击全屏红光
        if (this.coreFlash > 0) {
            ctx.fillStyle = `rgba(255,60,60,${this.coreFlash * 0.5})`;
            ctx.fillRect(0, 0, W, H);
        }
    }

    drawTower(ctx, tower) {
        const cfg = TOWER_TYPES[tower.type];
        ctx.drawImage(towerBaseSprite, tower.c * CELL, tower.r * CELL);
        const cx = tower.x, cy = tower.y;

        // 战术超频高能光环
        if (this.time < this.overdriveUntil) {
            ctx.strokeStyle = 'rgba(255, 180, 84, 0.6)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(cx, cy, 18 + Math.sin(this.time * 8) * 2, 0, Math.PI * 2);
            ctx.stroke();
        }

        // 4阶觉醒皇冠光芒
        if (tower.level === 3) {
            ctx.strokeStyle = '#ffd34d88';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(cx, cy, 17, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(tower.angle);

        if (tower.type === 'pulse') {
            ctx.fillStyle = cfg.color;
            ctx.fillRect(0, -3.5, 16, 7);
            ctx.beginPath();
            ctx.arc(16, 0, tower.level === 3 ? 4.5 : 3.4, 0, Math.PI * 2);
            ctx.fill();
        } else if (tower.type === 'cannon') {
            ctx.fillStyle = '#1a2148';
            ctx.fillRect(-2, -6, 21, 12);
            ctx.strokeStyle = cfg.color;
            ctx.lineWidth = 2;
            ctx.strokeRect(-2, -6, 21, 12);
            ctx.fillStyle = cfg.color;
            ctx.beginPath();
            ctx.arc(19, 0, 4.2, 0, Math.PI * 2);
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
        } else if (tower.type === 'frost') {
            ctx.strokeStyle = cfg.color;
            ctx.lineWidth = 2;
            for (let i = 0; i < 3; i++) {
                const ang = (i / 3) * Math.PI;
                ctx.beginPath();
                ctx.moveTo(Math.cos(ang) * -10, Math.sin(ang) * -10);
                ctx.lineTo(Math.cos(ang) * 10, Math.sin(ang) * 10);
                ctx.stroke();
            }
        }
        ctx.restore();

        // 等级指示点
        const lv = tower.level + 1;
        for (let i = 0; i < lv; i++) {
            ctx.beginPath();
            ctx.arc(tower.x - (lv - 1) * 3.5 + i * 7, tower.y + 14, 2.2, 0, Math.PI * 2);
            ctx.fillStyle = tower.level === 3 ? '#ffd34d' : '#ffffff';
            ctx.fill();
        }

        // 受损闪烁
        if (tower.hurtFlash > 0) {
            tower.hurtFlash -= 1 / 60;
            ctx.globalAlpha = Math.min(1, tower.hurtFlash * 5);
            ctx.fillStyle = '#ff6b7a';
            ctx.beginPath();
            ctx.roundRect(tower.c * CELL + 3, tower.r * CELL + 3, CELL - 6, CELL - 6, 8);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // 受损血条：只在掉血后出现，避免平时画面变乱
        const maxHp = this.towerMaxHp(tower);
        if (tower.hp !== undefined && tower.hp < maxHp) {
            const frac = clamp(tower.hp / maxHp, 0, 1);
            const bw = CELL - 12;
            const bx = tower.c * CELL + 6;
            const by = tower.r * CELL + CELL - 7;
            ctx.fillStyle = 'rgba(0,0,0,0.65)';
            ctx.fillRect(bx, by, bw, 3.5);
            ctx.fillStyle = frac > 0.5 ? '#3fd97c' : frac > 0.25 ? '#ffd34d' : '#ff6b7a';
            ctx.fillRect(bx, by, bw * frac, 3.5);
        }
    }

    /* ── 游戏主循环 ── */

    startLoop() {
        this.stopLoop();
        this.lastFrameTime = performance.now();
        const tick = (now) => {
            this.animationId = requestAnimationFrame(tick);
            let dt = (now - this.lastFrameTime) / 1000;
            this.lastFrameTime = now;
            if (dt > 0.05) dt = 0.05;
            if (this.state === 'playing') {
                const scaled = dt * this.speedMult;
                const steps = this.speedMult === 3 ? 3 : 2;
                for (let i = 0; i < steps; i++) {
                    this.update(scaled / steps);
                }
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
        track('tower-defense', 'play');
    }

    toMenu() {
        this.stopLoop();
        this.state = 'menu';
        this.resetRun();
        if (this.el.pause) this.el.pause.classList.add('hidden');
        if (this.el.over) this.el.over.classList.add('hidden');
        if (this.el.start) this.el.start.classList.remove('hidden');
        this.closePanel();
        this.renderLevelCards();
        this.drawFrame();
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

    /**
     * 静默暂停 / 恢复 —— 给底部统计抽屉用。
     * 与 pause()/resume() 状态迁移一致，但不显示暂停遮罩、不播点击音，
     * 免得玩家开抽屉时背后闪一层暂停界面。
     */
    pauseQuiet() {
        if (this.state !== 'playing') return;
        this.state = 'paused';
        this.lastFrameTime = performance.now();
    }

    resumeQuiet() {
        if (this.state !== 'paused') return;
        this.state = 'playing';
        this.lastFrameTime = performance.now();
    }

    /** 抽屉判据 */
    isRunning() {
        return this.state === 'playing';
    }

    async endGame(victory) {
        this.state = 'over';
        this.stopLoop();
        this.closePanel();

        if (victory) {
            // 越难的关卡，通关奖励越高；提前压波也折算成额外分数
            const diffIdx = LEVELS.indexOf(this.level);
            const bonus = this.lives * 35 * (1 + diffIdx * 0.35) + this.level.waves * 40;
            this.score += Math.round(bonus);
            // 记录通关，用于解锁下一关
            storageSet(`td_clear_${this.level.id}`, '1');
            Sfx.win();
        } else {
            Sfx.lose();
        }
        track('tower-defense', 'finish');

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
                ? t.victorySub.replace('{lives}', this.lives).replace('{lv}', this.levelName(this.level))
                : t.defeatSub.replace('{n}', Math.max(1, this.wave)).replace('{total}', this.level.waves);
        }

        if (this.el['over-waves']) {
            this.el['over-waves'].textContent = `${Math.max(1, this.wave)}/${this.level.waves}`;
        }
        if (this.el['over-kills']) {
            this.el['over-kills'].textContent = formatNumber(this.totalKills || 0);
        }
        if (this.el['over-lives']) {
            this.el['over-lives'].textContent = Math.max(0, this.lives);
        }
        if (victory) {
            this.triggerConfetti();
        }

        // 每关独立最佳分：简单关卡的高分不该压掉困难关卡的成绩
        const bestKey = `td_best_${this.level.id}`;
        const prevBest = Number(storageGet(bestKey)) || 0;
        const isBest = this.score > prevBest;
        if (isBest) {
            storageSet(bestKey, String(this.score));
            // 兼容旧键：只要新成绩比旧记录好就同步，避免老玩家记录丢失
            const legacy = Number(storageGet('td_best')) || 0;
            if (this.score > legacy) storageSet('td_best', String(this.score));
        }
        this.updateSideRecords();
        if (this.el['best-line']) {
            this.el['best-line'].textContent = `🏆 ${t.best}: ${formatNumber(Math.max(prevBest, this.score))}` +
                (isBest ? `  🌟 ${t.newBest}` : '');
        }
        this.renderLevelCards();

        // 本地榜（按关卡隔离）
        const local = this.localScores();
        local.push({ name: ensurePlayerName() || 'Anonymous', score: this.score, level: this.level.id });
        local.sort((a, b) => b.score - a.score);
        storageSet('td_local_scores', JSON.stringify(local.slice(0, 30)));

        if (this.el.over) this.el.over.classList.remove('hidden');
        if (this.el.username) this.el.username.value = ensurePlayerName() || '';

        // 上报全球榜（带关卡维度）；网络层收敛到 js/leaderboard.js（false=静默保留本地榜）
        await submitScore({ game: `tower-defense-${this.level.id}`, name: ensurePlayerName() || 'Anonymous', score: this.score });
        this.fetchLeaderboard();
    }

    levelName(level) {
        const name = this.TEXT.levels && this.TEXT.levels[level.id];
        return name ? name.name : level.id;
    }

    triggerConfetti() {
        const over = this.el.over;
        if (!over) return;
        document.querySelectorAll('.td-confetti-piece').forEach(el => el.remove());
        const colors = ['#40d8ff', '#ffd34d', '#ff4b6b', '#5eead4', '#c084fc', '#4ade80'];
        for (let i = 0; i < 32; i++) {
            const piece = document.createElement('div');
            piece.className = 'td-confetti-piece';
            piece.style.left = `${6 + Math.random() * 88}%`;
            piece.style.backgroundColor = colors[i % colors.length];
            piece.style.animationDelay = `${Math.random() * 0.7}s`;
            piece.style.animationDuration = `${1.8 + Math.random() * 1.4}s`;
            piece.style.width = `${6 + Math.random() * 6}px`;
            piece.style.height = `${8 + Math.random() * 10}px`;
            over.appendChild(piece);
        }
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
        // 只显示当前关卡的本地成绩
        const filtered = this.localScores()
            .filter(s => !s.level || s.level === (this.level && this.level.id))
            .slice(0, 10);
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
        nameEl.textContent = entry.name;
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
            const data = await fetchBoard(`tower-defense-${this.level.id}`);
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
        const text = `🏰 ${t.title} · ${this.levelName(this.level)}\n${t.score}: ${formatNumber(this.score)} · ${t.wave} ${this.wave}/${this.level.waves}\nhttps://games.orangely.xyz/tower-defense.html`;
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
            const original = `${ICONS.copy}<span>${t.copyResult}</span>`;
            this.el['btn-copy'].innerHTML = ok
                ? `${ICONS.check}<span>${t.copied}</span>`
                : original;
            setTimeout(() => {
                if (this.el['btn-copy']) this.el['btn-copy'].innerHTML = original;
            }, 1600);
        }
    }

    /* ── UI 绑定 ── */

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

        // 战术技能
        if (this.el['skill-emp']) this.el['skill-emp'].addEventListener('click', () => this.castEmp());
        if (this.el['skill-boost']) this.el['skill-boost'].addEventListener('click', () => this.castOverdrive());

        // 射程透视开关
        if (this.el['range-btn']) this.el['range-btn'].addEventListener('click', () => this.toggleShowAllRanges());

        // ×1 / ×2 / ×3 倍速
        if (this.el['speed-btn']) this.el['speed-btn'].addEventListener('click', () => {
            this.speedMult = this.speedMult === 1 ? 2 : this.speedMult === 2 ? 3 : 1;
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

        window.addEventListener('site-settings:changed', () => {
            this.lang = this.readLang();
            this.applyLanguage();
        });
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

// 回归测试挂钩：scripts/verify-td-difficulty.mjs 需要直接驱动内部状态。
// 这些全是常量与纯函数，暴露出来不会改变任何玩法行为。
window.__TD_LEVELS__ = LEVELS;
window.__TD_BUILD_WAVE__ = buildWave;
window.__TD_ENEMY_TYPES__ = ENEMY_TYPES;
window.__TD_TOWER_TYPES__ = TOWER_TYPES;
window.__TD_TARGET_PRIORITIES__ = TARGET_PRIORITIES;
window.__TD_STACK_MAX__ = STACK_MAX;
window.__TD_STACK_HP_PER__ = STACK_HP_PER;
window.__TD_STACK_GOLD_PER__ = STACK_GOLD_PER;
window.__TD_AIR_PATH__ = AIR_PATH;
window.__TD_GROUND_PATH__ = GROUND_PATH;
// 网格维度是模块常量（不在实例上），回归脚本按坐标反查格子时需要它；
// pathGrid 同理——不导出的话脚本会挑到路径格，tryBuild 静默失败。
window.__TD_GRID__ = { COLS, ROWS, CELL, pathGrid };

document.addEventListener('DOMContentLoaded', () => {
    window.tdGame = new TowerDefenseGame();

    // 桌面端舞台纵向预算：td 的技能条在 .game-main 内部（桌面网格第二行），
    // bindFrame 量的顶栏/页脚不含它，用 extraChrome 并入。只量技能条自身高度 +
    // 外边距——不能量 main 总高减 stage 高：桌面网格里侧栏跨两行会把行高撑到
    // 侧栏自身高度，量出来是「侧栏-舞台」的差值，形成 chrome↑→stage-w↓→差值↑
    // 的反馈环，舞台会收敛到 0
    bindFrame({
        logicalWidth: W,
        extraChrome: () => {
            const c = document.querySelector('.td-bottom-controls');
            if (!c) return 0;
            const cs = getComputedStyle(c);
            return c.getBoundingClientRect().height
                + parseFloat(cs.marginTop || '0')
                + parseFloat(cs.marginBottom || '0');
        },
    });

    // 移动端底部统计抽屉
    window.tdDrawer = createStatsDrawer({
        idPrefix: 'td',
        getGame: () => window.tdGame,
        onPause: (g) => g && g.pauseQuiet(),
        onResume: (g) => g && g.resumeQuiet(),
        isBusy: () => {
            const g = window.tdGame;
            return !!g && typeof g.isRunning === 'function' && g.isRunning();
        },
        ICONS,
        getText: () => LANGUAGES[getLang()] || LANGUAGES.en,
    });
    if (window.tdDrawer) window.tdDrawer.init();
});

/* ── 顶栏 / 页脚通用控件：Home · Sound · Lang · More ──
   槽位结构见 css/layout.css 的契约，行为统一由 js/game-chrome.js 接管。
   owns 默认只含 lang / more：静音钮在本页早就有自己的 handler（还要顺带做
   SFX 初始化之类的页面私事），chrome 再挂一个就会一次点击切换两次 = 净效果为零。 */
window.addEventListener('DOMContentLoaded', () => {
    bindChrome({
        self: 'tower-defense.html',
        owns: ['lang', 'more'],
        getText: () => LANGUAGES[getLang()] || LANGUAGES.en,
        labels: { pause: () => (LANGUAGES[getLang()] || {}).pause },
    });
});
