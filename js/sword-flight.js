/**
 * 御剑飞行 (Sword Flight: Soaring Heavens)
 * Oriental Xianxia Kinetic Flight Action Game
 *
 * 扶摇直上九重天，剑气纵横御清风。
 * 踏灵剑遨游云海，引雷淬剑，御剑化阵，突破境界，凝万剑归宗！
 *
 * Vanilla JS ES Module. No runtime dependencies.
 */

import { ensurePlayerName, getPlayerName, setPlayerName } from './player.js';
import { getLang, setLang, getMuted, setMuted } from './site-settings.js';
import { ICONS } from './icons.js';
import { updateMoreGames } from './more-games.js';

/* ────────────────────────── 常量与配置 ────────────────────────── */

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 640;
const LEADERBOARD_URL = 'https://game-scores.orangely.workers.dev';

const STORAGE_KEYS = {
    UNLOCKED_STAGE: 'sf_unlocked_stage',
    STAGE_STARS: 'sf_stage_stars',
    ENDLESS_BEST: 'sf_endless_best',
    MAX_REALM: 'sf_max_realm',
    MAX_COMBO: 'sf_max_combo',
    DAILY_PREFIX: 'sf_daily_'
};

function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
}

function storageSet(key, val) {
    try { localStorage.setItem(key, val); } catch (e) {}
}

/* ────────────────────────── 国际化 i18n ────────────────────────── */

const I18N = {
    zh: {
        gameTitle: '御剑飞行',
        gameSub: '扶摇直上九重天 · 剑气纵横御清风',
        badge: '国风仙侠御剑',
        modeStages: '九天问道',
        modeStagesSub: '九重天关 破境登仙',
        modeEndless: '万里长空',
        modeEndlessSub: '无尽云海 极速冲榜',
        modeDaily: '每日仙缘',
        modeDailySub: '全球同谱 每日一卦',
        modeZen: '问道清修',
        modeZenSub: '闲云野鹤 抚琴参道',
        howTo: '<b>仙道法门：</b>鼠标引路或触控拖曳御剑穿云，穿行<b>【玄天仙环】</b>聚引天地灵气与五音合鸣！<br>按<b>空格/点击</b>发动<b>破空疾刺</b>斩断断崖绝壁、吞纳九天玄雷；聚万仙灵韵突破<b>境界飞升</b>，祭出<b>【万剑归宗】</b>！',
        selectStage: '选择天境重霄',
        todayDate: '今日仙历',
        dailyModPrefix: '天象奇观：',
        dailyStart: '开启今日仙途 ▶',
        openRank: '查看九天仙榜',
        pauseTitle: '凝神静思 · 调息',
        pauseSub: '调和龙虎，蓄势待发',
        resume: '继续御剑 ▶',
        restart: '重新启程 ⟲',
        home: '返回仙门 🏠',
        victoryTitle: '破境飞升 · 仙门洞开',
        victorySub: '剑意通神，跨入更高重天！',
        defeatTitle: '仙缘未尽 · 调息重来',
        defeatSub: '剑心不灭，再问长生',
        scoreLbl: '修仙得分',
        ringsRateLbl: '仙环通贯率',
        ringsCountLbl: '贯通仙环总数',
        comboLbl: '最高连环合鸣',
        realmResultLbl: '修得道果',
        distLbl: '翱翔万里长空',
        nextStage: '下一重天 ▶',
        replayStage: '再战此境 ⟲',
        replayEndless: '再次御剑 ⟲',
        rankTitle: '🏆 九天绝巅仙榜',
        tabEndless: '万里长空总榜',
        tabDaily: '今日仙缘榜',
        loadingRank: '正在接引九天仙榜...',
        noRankData: '暂无道友铭刻仙榜',
        submitScore: '铭刻道号',
        scoreSubmitted: '道号已永驻九天仙榜！',
        scoreSubmitFailed: '铭刻未遂，灵脉受阻',
        namePlaceholder: '输入道号以铭刻仙榜...',
        sideRulesTitle: '📜 仙道御剑法则',
        sideRulesText: '<b>御剑随心：</b>移动光标或手指引领飞剑穿行。俯冲蓄势破空，冲霄直入云霄！<br><br>• <b>玄天仙环</b>：连续穿梭灵环可引发<b>五音合鸣</b>，真气急速回复，得分倍率飞升！<br>• <b>破空疾刺 (空格)</b>：消耗真气化身银色剑光，斩断孤石断崖、吞纳九天玄雷！<br>• <b>伴生剑阵 (Q)</b>：境界突破后唤出游龙飞剑护体，自动绞杀凶禽与煞气，释放剑气浪涌。<br>• <b>青莲万剑 (E)</b>：极意圆满后引万剑归宗，百丈青莲绽放，涤荡乾坤！',
        sideRecordsTitle: '🏆 仙修造诣记录',
        sideStarsLbl: '九天问道星数',
        sideEndlessLbl: '万里长空最高分',
        sideRealmMaxLbl: '至高修成境界',
        sideComboLbl: '单局极意连环',
        sideDailyLbl: '今日仙缘修途',
        sideControlsTitle: '⌨️ 键位与操控指南',
        scSteer: '指引剑路',
        scSteerKey: '鼠标移动 / 触控拖拽',
        scKeyb: '身法微调',
        scKeybKey: 'W A S D / 方向键',
        scDash: '破空疾刺 (无敌穿斩)',
        scDashKey: '鼠标左键 / 空格 / ⚡按钮',
        scArray: '唤发剑气 / 阵列变幻',
        scArrayKey: '鼠标右键 / Q 键 / ⚔️按钮',
        scUlt: '万剑归宗 (青莲绝技)',
        scUltKey: 'E 键 / 双击 / 🌸按钮',
        scPause: '调息凝神 (暂停)',
        scPauseKey: 'P 键 / Esc 键',
        toastRing: '仙环合鸣！',
        toastBreakthrough: '境界突破！',
        toastDash: '破空疾刺！',
        toastThunder: '以剑引雷！',
        toastUlt: '万剑归宗！',
        toastHurt: '灵气涣散！',
        dailyStatusDone: '今日已飞升',
        dailyStatusUndone: '未涉足',
        realms: [
            '炼气期', '筑基期', '结丹期', '元婴期', '化神期', '渡劫登仙'
        ],
        stages: [
            { name: '青峦云海', desc: '祥云环绕，初试飞剑' },
            { name: '暮霞千仞', desc: '落日熔金，断崖穿梭' },
            { name: '太虚剑冢', desc: '上古神剑，阵眼交织' },
            { name: '极光冰渊', desc: '寒魄冰晶，幽蓝星汉' },
            { name: '星河倒悬', desc: '九天星河，星尘引力' },
            { name: '万劫雷海', desc: '紫霄神雷，引雷淬锋' },
            { name: '炽焰赤霄', desc: '涅槃朱雀，热浪翻涌' },
            { name: '九幽魔障', desc: '魔禽夜袭，剑阵诛煞' },
            { name: '登仙天门', desc: '云开仙阙，万剑朝宗' }
        ]
    },
    en: {
        gameTitle: 'Sword Flight',
        gameSub: 'Soaring Heavens · Treading the Wind with Divine Blades',
        badge: 'ORIENTAL XIANXIA FLIGHT',
        modeStages: '9 Heavens',
        modeStagesSub: '9 Celestial Realms & Boss Trials',
        modeEndless: 'Endless Sky',
        modeEndlessSub: 'Infinite Clouds & Global Leaderboard',
        modeDaily: 'Daily Realm',
        modeDailySub: 'Global Seeded Course Each Day',
        modeZen: 'Zen Flight',
        modeZenSub: 'Serene Cloud Meditation & Guqin',
        howTo: '<b>Celestial Path:</b> Steer your flying sword with mouse or touch, threading <b>Celestial Rings</b> to harmonize pentatonic notes and gather Spiritual Qi!<br>Press <b>Space / Click</b> to unleash <b>Sword Qi Dash</b>, cleaving crags and absorbing tribulation thunder. Break through <b>Cultivation Realms</b> and summon <b>Thousand Swords</b>!',
        selectStage: 'Select Celestial Realm',
        todayDate: 'Daily Date',
        dailyModPrefix: 'Heavenly Omen: ',
        dailyStart: 'Begin Today\'s Flight ▶',
        openRank: 'View Celestial Leaderboard',
        pauseTitle: 'Meditation & Breath',
        pauseSub: 'Calm the mind, gathering inner power',
        resume: 'Resume Flight ▶',
        restart: 'Restart Flight ⟲',
        home: 'Immortal Gate 🏠',
        victoryTitle: 'Ascension Accomplished',
        victorySub: 'Sword intent reaches divinity, opening the celestial gate!',
        defeatTitle: 'Qi Exhausted · Recenter',
        defeatSub: 'The sword heart remains eternal. Rise again.',
        scoreLbl: 'Flight Score',
        ringsRateLbl: 'Ring Thread Rate',
        ringsCountLbl: 'Total Rings Threaded',
        comboLbl: 'Max Ring Harmony Combo',
        realmResultLbl: 'Attained Realm',
        distLbl: 'Distance Soared',
        nextStage: 'Next Realm ▶',
        replayStage: 'Replay Realm ⟲',
        replayEndless: 'Soar Again ⟲',
        rankTitle: '🏆 Nine Heavens Leaderboard',
        tabEndless: 'Endless Soaring',
        tabDaily: 'Daily Seeded',
        loadingRank: 'Communing with the Nine Heavens...',
        noRankData: 'No cultivators recorded yet',
        submitScore: 'Inscribe Dao Name',
        scoreSubmitted: 'Dao name inscribed on the Celestial Pillar!',
        scoreSubmitFailed: 'Failed to inscribe score. Qi blocked.',
        namePlaceholder: 'Enter your Daoist title...',
        sideRulesTitle: '📜 Sacred Sword Laws',
        sideRulesText: '<b>Effortless Flight:</b> Guide the sword with mouse or touch. Dive to surge in speed, ascend to punch through clouds!<br><br>• <b>Celestial Rings:</b> Thread rings sequentially to trigger <b>Pentatonic Chime Harmonies</b>, restoring Qi and stacking score multipliers!<br>• <b>Sword Qi Dash (Space):</b> Become an invincible streak of cyan light, cleaving crags and absorbing heavenly thunder.<br>• <b>Companion Sword Array (Q):</b> Ascend realms to summon orbiting spirit swords that slice nearby fiends.<br>• <b>Thousand Swords (E):</b> At max resonance, unleash a colossal blooming lotus that purges all perils!',
        sideRecordsTitle: '🏆 Cultivator Records',
        sideStarsLbl: 'Nine Heavens Stars',
        sideEndlessLbl: 'Endless High Score',
        sideRealmMaxLbl: 'Highest Cultivation Realm',
        sideComboLbl: 'Max Ring Harmony',
        sideDailyLbl: 'Today\'s Daily Status',
        sideControlsTitle: '⌨️ Controls Guide',
        scSteer: 'Steer Sword',
        scSteerKey: 'Mouse Move / Touch Drag',
        scKeyb: 'Maneuver',
        scKeybKey: 'W A S D / Arrow Keys',
        scDash: 'Sword Qi Dash (Invincible)',
        scDashKey: 'Left Click / Space / ⚡Btn',
        scArray: 'Sword Wave / Formation',
        scArrayKey: 'Right Click / Q Key / ⚔️Btn',
        scUlt: 'Thousand Swords (Ultimate)',
        scUltKey: 'E Key / Double-Tap / 🌸Btn',
        scPause: 'Meditate (Pause)',
        scPauseKey: 'P Key / Esc',
        toastRing: 'Ring Harmony!',
        toastBreakthrough: 'Realm Breakthrough!',
        toastDash: 'Sword Qi Surge!',
        toastThunder: 'Thunder Forging!',
        toastUlt: 'Thousand Swords Bloom!',
        toastHurt: 'Spiritual Qi Shaken!',
        dailyStatusDone: 'Ascended Today',
        dailyStatusUndone: 'Untraveled',
        realms: [
            'Qi Refining', 'Foundation', 'Golden Core', 'Nascent Soul', 'God Transformation', 'Immortal Ascension'
        ],
        stages: [
            { name: 'Emerald Cloud Sea', desc: 'Gentle misty peaks, maiden flight' },
            { name: 'Sunset Precipice', desc: 'Golden amber crags & wind currents' },
            { name: 'Taixu Sword Grave', desc: 'Ancient floating colossi & talisman seals' },
            { name: 'Aurora Frost Abyss', desc: 'Glistening ice crystals & polar lights' },
            { name: 'Inverted Star River', desc: 'Astral dust & cosmic tides' },
            { name: 'Thunder Tribulation Sea', desc: 'Divine purple lightning storms' },
            { name: 'Blazing Vermilion Sky', desc: 'Crimson plumes & soaring updrafts' },
            { name: 'Nine Nether Fiends', desc: 'Phantom birds & shadow rifts' },
            { name: 'Ascension Gate', desc: 'The golden gate to true immortality' }
        ]
    }
};

/* ────────────────────────── Web Audio API 声音合成 ────────────────────────── */

class SoundFX {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.windGain = null;
        this.windFilter = null;
        this.windSource = null;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
            this.masterGain = this.ctx.createGain();
            this.masterGain.connect(this.ctx.destination);
            this.updateMute();

            this.setupWindAmbience();
            this.initialized = true;
        } catch (e) {
            console.warn('AudioContext not available:', e);
        }
    }

    updateMute() {
        if (!this.masterGain || !this.ctx) return;
        const muted = getMuted();
        this.masterGain.gain.setValueAtTime(muted ? 0 : 0.38, this.ctx.currentTime);
    }

    setupWindAmbience() {
        if (!this.ctx) return;
        // 生成粉红/白噪音循环缓冲区作为环境风声
        const bufferSize = this.ctx.sampleRate * 2;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99 * b0 + white * 0.05;
            b1 = 0.95 * b1 + white * 0.1;
            b2 = 0.85 * b2 + white * 0.15;
            data[i] = (b0 + b1 + b2) * 0.3;
        }

        this.windSource = this.ctx.createBufferSource();
        this.windSource.buffer = buffer;
        this.windSource.loop = true;

        this.windFilter = this.ctx.createBiquadFilter();
        this.windFilter.type = 'lowpass';
        this.windFilter.frequency.value = 400;

        this.windGain = this.ctx.createGain();
        this.windGain.gain.value = 0.15;

        this.windSource.connect(this.windFilter);
        this.windFilter.connect(this.windGain);
        this.windGain.connect(this.masterGain);

        try {
            this.windSource.start(0);
        } catch (e) {}
    }

    updateWind(speedRatio) {
        if (!this.initialized || !this.windFilter || !this.ctx) return;
        const now = this.ctx.currentTime;
        const targetFreq = 300 + speedRatio * 1800;
        const targetGain = 0.08 + speedRatio * 0.25;
        this.windFilter.frequency.setTargetAtTime(targetFreq, now, 0.1);
        this.windGain.gain.setTargetAtTime(targetGain, now, 0.1);
    }

    // 仙环五音合鸣 (宫商角徵羽循环)
    playRingChime(combo) {
        if (!this.ctx || getMuted()) return;
        const now = this.ctx.currentTime;
        // 宫商角徵羽音符频率表 (C-D-E-G-A Pentatonic)
        const scale = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 880.00];
        const noteFreq = scale[(combo - 1) % scale.length];

        const osc = this.ctx.createOscillator();
        const oscHarmonic = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(noteFreq, now);

        oscHarmonic.type = 'triangle';
        oscHarmonic.frequency.setValueAtTime(noteFreq * 2, now);

        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

        osc.connect(gain);
        oscHarmonic.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        oscHarmonic.start(now);
        osc.stop(now + 0.9);
        oscHarmonic.stop(now + 0.9);
    }

    // 破空疾刺 (龙吟剑鸣 + 啸音)
    playDash() {
        if (!this.ctx || getMuted()) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(1400, now + 0.12);
        osc.frequency.exponentialRampToValueAtTime(450, now + 0.35);

        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.35);
    }

    // 伴生剑阵出鞘 (剑气波)
    playArrayWave() {
        if (!this.ctx || getMuted()) return;
        const now = this.ctx.currentTime;
        [587.33, 880.00, 1174.66].forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + idx * 0.04);
            gain.gain.setValueAtTime(0.2, now + idx * 0.04);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.4);
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(now + idx * 0.04);
            osc.stop(now + idx * 0.04 + 0.4);
        });
    }

    // 绝技：万剑归宗 / 青莲剑歌 (巨钟震鸣 + 天籁和弦)
    playUltimate() {
        if (!this.ctx || getMuted()) return;
        const now = this.ctx.currentTime;
        // 洪钟低鸣
        const bassOsc = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();
        bassOsc.type = 'triangle';
        bassOsc.frequency.setValueAtTime(110, now);
        bassOsc.frequency.exponentialRampToValueAtTime(55, now + 1.2);
        bassGain.gain.setValueAtTime(0.6, now);
        bassGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
        bassOsc.connect(bassGain);
        bassGain.connect(this.masterGain);
        bassOsc.start(now);
        bassOsc.stop(now + 1.5);

        // 仙乐琶音 (C5, E5, G5, B5, C6)
        [523.25, 659.25, 783.99, 987.77, 1046.50].forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.08);
            gain.gain.setValueAtTime(0.3, now + i * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 1.2);
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(now + i * 0.08);
            osc.stop(now + i * 0.08 + 1.2);
        });
    }

    // 雷劫吸收 (轰鸣雷鸣)
    playThunderAbsorb() {
        if (!this.ctx || getMuted()) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.5);
        gain.gain.setValueAtTime(0.45, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.5);
    }

    // 斩击碎石 / 妖禽消散
    playSlashHit() {
        if (!this.ctx || getMuted()) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(700, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.15);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.15);
    }

    // 拾取灵石
    playGem() {
        if (!this.ctx || getMuted()) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1760, now + 0.12);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.15);
    }

    // 受到冲击受损
    playHurt() {
        if (!this.ctx || getMuted()) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.3);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.35);
    }
}

const SFX = new SoundFX();

/* ────────────────────────── 游戏核心逻辑 ────────────────────────── */

class SwordFlightGame {
    constructor() {
        this.canvas = document.getElementById('sf-canvas');
        this.ctx = this.canvas.getContext('2d');

        // 视口与缩放
        this.dpr = window.devicePixelRatio || 1;
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // 游戏模式: 'stages' | 'endless' | 'daily' | 'zen'
        this.mode = 'stages';
        this.currentStageIndex = 0; // 0 to 8
        this.isPlaying = false;
        this.isPaused = false;

        // 玩家实体
        this.player = {
            x: CANVAS_WIDTH / 2,
            y: CANVAS_HEIGHT * 0.72,
            targetX: CANVAS_WIDTH / 2,
            targetY: CANVAS_HEIGHT * 0.72,
            vx: 0,
            vy: 0,
            angle: 0,
            tilt: 0,
            speed: 5,
            baseSpeed: 5,
            lives: 3,
            maxLives: 3,
            qi: 100,
            maxQi: 100,
            ultEnergy: 0,
            maxUltEnergy: 100,
            dashTimer: 0,
            invincibleTimer: 0,
            realmIndex: 0, // 0: 炼气, 1: 筑基, 2: 结丹, 3: 元婴, 4: 化神, 5: 渡劫
            swordCount: 1, // 伴生飞剑数 (1 -> 3 -> 5 -> 7 -> 9)
            // 飘带物理质点 (5段)
            ribbonNodes: [
                { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }
            ],
            // 剑气尾迹轨迹缓存
            trailHistory: []
        };

        // 游戏进度与数据
        this.score = 0;
        this.combo = 1;
        this.maxComboThisRun = 1;
        this.ringsThreaded = 0;
        this.totalRingsInStage = 0;
        this.distanceSoared = 0; // 米
        this.stageTargetDistance = 2000;
        this.scrollOffset = 0;
        this.worldSpeed = 5;

        // 伴生飞剑数组
        this.satelliteSwords = [];
        this.swordArrayAngle = 0;

        // 场景实体列表
        this.rings = [];
        this.spiritStones = [];
        this.hazards = []; // 浮空断崖, 太古巨剑, 封天古符
        this.thunders = []; // 九天玄雷云
        this.fiendBirds = []; // 幽冥魔禽
        this.windTunnels = []; // 罡风涡流通道
        this.particles = [];
        this.screenShakes = 0;
        this.hitStopFrames = 0;

        // 背景图层 (群山与云海)
        this.initBackgrounds();

        // 键盘按键状态
        this.keys = {};

        // 绑定事件与初始化
        this.initControls();
        this.initDOM();
        this.loadRecords();
        this.updateHUD();
        this.updateSideRecords();
        this.applyLanguage();

        // 主循环
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.gameLoop(t));
    }

    resizeCanvas() {
        this.dpr = window.devicePixelRatio || 1;
        this.canvas.width = CANVAS_WIDTH * this.dpr;
        this.canvas.height = CANVAS_HEIGHT * this.dpr;
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    /* ── 背景多重视差与云海初始化 ── */
    initBackgrounds() {
        // 山峰轮廓点生成
        this.mountains = [
            this.generateMountainLayer(CANVAS_HEIGHT * 0.45, 120, 0.25),
            this.generateMountainLayer(CANVAS_HEIGHT * 0.60, 90, 0.45),
            this.generateMountainLayer(CANVAS_HEIGHT * 0.78, 60, 0.70)
        ];

        // 灵气浮云
        this.clouds = [];
        for (let i = 0; i < 16; i++) {
            this.clouds.push({
                x: Math.random() * CANVAS_WIDTH,
                y: Math.random() * CANVAS_HEIGHT * 1.5,
                radius: 45 + Math.random() * 60,
                speedFactor: 0.3 + Math.random() * 0.6,
                opacity: 0.15 + Math.random() * 0.25
            });
        }

        // 悬浮仙岛
        this.floatingIslands = [
            { x: 80, y: -200, width: 90, height: 45, speedFactor: 0.35 },
            { x: 340, y: -700, width: 120, height: 60, speedFactor: 0.35 }
        ];

        // 飘落仙桃灵瓣 / 灵光微粒
        this.petals = [];
        for (let i = 0; i < 24; i++) {
            this.petals.push({
                x: Math.random() * CANVAS_WIDTH,
                y: Math.random() * CANVAS_HEIGHT,
                speedX: (Math.random() - 0.5) * 1.5,
                speedY: 1.5 + Math.random() * 2,
                size: 2 + Math.random() * 3,
                angle: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.05
            });
        }
    }

    generateMountainLayer(baseY, variance, speedFactor) {
        const points = [];
        const segCount = 18;
        const segWidth = (CANVAS_WIDTH + 100) / segCount;
        for (let i = 0; i <= segCount + 2; i++) {
            points.push({
                x: (i - 1) * segWidth,
                y: baseY + (Math.sin(i * 1.2) * 0.6 + Math.cos(i * 0.8) * 0.4) * variance
            });
        }
        return { points, speedFactor, baseY };
    }

    /* ── 输入与操控 ── */
    initControls() {
        const stage = document.getElementById('sf-stage');

        // 鼠标移动导引
        stage.addEventListener('mousemove', (e) => {
            if (!this.isPlaying || this.isPaused) return;
            const rect = this.canvas.getBoundingClientRect();
            this.player.targetX = ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
            this.player.targetY = ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
        });

        // 鼠标点击 -> 破空刺
        stage.addEventListener('mousedown', (e) => {
            if (!this.isPlaying || this.isPaused) return;
            SFX.init();
            if (e.button === 0) {
                this.triggerDash();
            } else if (e.button === 2) {
                this.triggerSwordArray();
            }
        });

        stage.addEventListener('contextmenu', (e) => e.preventDefault());

        // 触控拖拽
        const handleTouch = (e) => {
            if (!this.isPlaying || this.isPaused) return;
            SFX.init();
            const touch = e.touches[0];
            if (!touch) return;
            const rect = this.canvas.getBoundingClientRect();
            this.player.targetX = Math.max(20, Math.min(CANVAS_WIDTH - 20, ((touch.clientX - rect.left) / rect.width) * CANVAS_WIDTH));
            this.player.targetY = Math.max(40, Math.min(CANVAS_HEIGHT - 60, ((touch.clientY - rect.top) / rect.height) * CANVAS_HEIGHT));
            e.preventDefault();
        };

        stage.addEventListener('touchstart', handleTouch, { passive: false });
        stage.addEventListener('touchmove', handleTouch, { passive: false });

        // 键盘操控
        window.addEventListener('keydown', (e) => {
            if (e.repeat) return;
            this.keys[e.code] = true;

            if (e.code === 'KeyP' || e.code === 'Escape') {
                this.togglePause();
                return;
            }

            if (!this.isPlaying || this.isPaused) return;
            SFX.init();

            if (e.code === 'Space') {
                this.triggerDash();
                e.preventDefault();
            } else if (e.code === 'KeyQ') {
                this.triggerSwordArray();
                e.preventDefault();
            } else if (e.code === 'KeyE') {
                this.triggerUltimate();
                e.preventDefault();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        // 移动端触控按钮
        document.getElementById('sf-touch-dash').addEventListener('click', () => {
            SFX.init();
            this.triggerDash();
        });

        document.getElementById('sf-touch-array').addEventListener('click', () => {
            SFX.init();
            this.triggerSwordArray();
        });

        document.getElementById('sf-touch-ult').addEventListener('click', () => {
            SFX.init();
            this.triggerUltimate();
        });

        // 页面失焦自动暂停
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.isPlaying && !this.isPaused) {
                this.pauseGame();
            }
        });
    }

    /* ── DOM 事件初始化 ── */
    initDOM() {
        // 顶栏按钮
        document.getElementById('sf-btn-home').addEventListener('click', () => {
            location.href = 'index.html';
        });

        document.getElementById('sf-btn-pause').addEventListener('click', () => {
            SFX.init();
            this.togglePause();
        });

        const soundBtn = document.getElementById('sf-btn-sound');
        const refreshSoundIcon = () => {
            soundBtn.innerHTML = getMuted() ? ICONS.soundOff : ICONS.soundOn;
        };
        refreshSoundIcon();

        soundBtn.addEventListener('click', () => {
            SFX.init();
            setMuted(!getMuted());
            SFX.updateMute();
            refreshSoundIcon();
        });

        window.addEventListener('site-settings:changed', () => {
            SFX.updateMute();
            refreshSoundIcon();
            this.applyLanguage();
        });

        // 主菜单模式选择
        document.getElementById('sf-btn-stages').addEventListener('click', () => {
            SFX.init();
            this.showStageSelect();
        });

        document.getElementById('sf-btn-endless').addEventListener('click', () => {
            SFX.init();
            this.startFlight('endless');
        });

        document.getElementById('sf-btn-daily').addEventListener('click', () => {
            SFX.init();
            this.showDailyCard();
        });

        document.getElementById('sf-btn-start-daily').addEventListener('click', () => {
            SFX.init();
            this.startFlight('daily');
        });

        document.getElementById('sf-btn-zen').addEventListener('click', () => {
            SFX.init();
            this.startFlight('zen');
        });

        // 暂停弹窗按钮
        document.getElementById('sf-btn-resume').addEventListener('click', () => this.resumeGame());
        document.getElementById('sf-btn-restart').addEventListener('click', () => this.restartGame());
        document.getElementById('sf-btn-menu').addEventListener('click', () => this.returnToMenu());

        // 胜利弹窗按钮
        document.getElementById('sf-btn-next-stage').addEventListener('click', () => {
            if (this.currentStageIndex < 8) {
                this.currentStageIndex++;
                this.startFlight('stages', this.currentStageIndex);
            } else {
                this.returnToMenu();
            }
        });
        document.getElementById('sf-btn-stage-replay').addEventListener('click', () => {
            this.startFlight('stages', this.currentStageIndex);
        });
        document.getElementById('sf-btn-victory-menu').addEventListener('click', () => this.returnToMenu());

        // 失败/无尽结算弹窗
        document.getElementById('sf-btn-go-replay').addEventListener('click', () => {
            this.startFlight(this.mode, this.currentStageIndex);
        });
        document.getElementById('sf-btn-go-menu').addEventListener('click', () => this.returnToMenu());

        // 铭刻道号到排行榜
        const nameInput = document.getElementById('sf-player-name-input');
        nameInput.value = getPlayerName() || '';
        document.getElementById('sf-btn-submit-score').addEventListener('click', () => {
            const name = nameInput.value.trim() || '无名剑仙';
            setPlayerName(name);
            this.submitScoreToLeaderboard(name, this.score);
        });

        // 排行榜入口与模态框
        document.getElementById('sf-btn-open-rank').addEventListener('click', () => {
            this.openLeaderboardModal('endless');
        });
        document.getElementById('sf-btn-close-rank').addEventListener('click', () => {
            document.getElementById('sf-rank-modal').classList.add('hidden');
        });
        document.getElementById('sf-tab-endless').addEventListener('click', () => {
            this.openLeaderboardModal('endless');
        });
        document.getElementById('sf-tab-daily').addEventListener('click', () => {
            this.openLeaderboardModal('daily');
        });
    }

    /* ── 数据持久化读取 ── */
    loadRecords() {
        this.unlockedStage = parseInt(storageGet(STORAGE_KEYS.UNLOCKED_STAGE) || '1', 10);
        try {
            this.stageStars = JSON.parse(storageGet(STORAGE_KEYS.STAGE_STARS) || '{}');
        } catch (e) {
            this.stageStars = {};
        }
        this.endlessBest = parseInt(storageGet(STORAGE_KEYS.ENDLESS_BEST) || '0', 10);
        this.maxRealm = storageGet(STORAGE_KEYS.MAX_REALM) || '炼气期';
        this.maxComboRecord = parseInt(storageGet(STORAGE_KEYS.MAX_COMBO) || '1', 10);
    }

    saveRecords() {
        storageSet(STORAGE_KEYS.UNLOCKED_STAGE, this.unlockedStage.toString());
        storageSet(STORAGE_KEYS.STAGE_STARS, JSON.stringify(this.stageStars));
        storageSet(STORAGE_KEYS.ENDLESS_BEST, this.endlessBest.toString());
        storageSet(STORAGE_KEYS.MAX_REALM, this.maxRealm);
        storageSet(STORAGE_KEYS.MAX_COMBO, this.maxComboRecord.toString());
        this.updateSideRecords();
    }

    /* ── 关卡选择面板渲染 ── */
    showStageSelect() {
        const wrap = document.getElementById('sf-stage-select-wrap');
        const grid = document.getElementById('sf-stage-grid');
        const starsTotal = document.getElementById('sf-stage-stars-total');
        const lang = getLang();
        const isZh = lang === 'zh';
        const t = I18N[isZh ? 'zh' : 'en'];

        let totalStars = 0;
        grid.innerHTML = '';

        t.stages.forEach((st, idx) => {
            const stageNum = idx + 1;
            const isUnlocked = stageNum <= this.unlockedStage;
            const stars = this.stageStars[stageNum] || 0;
            totalStars += stars;

            const card = document.createElement('div');
            card.className = `sf-stage-card ${isUnlocked ? '' : 'locked'}`;
            card.innerHTML = `
                <span class="sf-stage-num">${isUnlocked ? `第${stageNum}重` : '🔒'}</span>
                <span class="sf-stage-name">${st.name}</span>
                <span class="sf-stage-stars">${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>
            `;

            if (isUnlocked) {
                card.addEventListener('click', () => {
                    this.startFlight('stages', idx);
                });
            }
            grid.appendChild(card);
        });

        starsTotal.textContent = `⭐ ${totalStars}/27`;
        wrap.classList.remove('hidden');
        document.getElementById('sf-daily-card').classList.add('hidden');
    }

    showDailyCard() {
        const wrap = document.getElementById('sf-stage-select-wrap');
        wrap.classList.add('hidden');
        const dailyCard = document.getElementById('sf-daily-card');
        dailyCard.classList.remove('hidden');

        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10);
        document.getElementById('sf-daily-date').textContent = `${getLang() === 'zh' ? '今日仙历' : 'Daily Date'}：${dateStr}`;
    }

    /* ── 开始一局飞行 ── */
    startFlight(mode = 'stages', stageIndex = 0) {
        SFX.init();
        this.mode = mode;
        this.currentStageIndex = stageIndex;
        this.isPlaying = true;
        this.isPaused = false;

        // 隐藏所有弹窗
        document.getElementById('sf-overlay-start').classList.add('hidden');
        document.getElementById('sf-overlay-pause').classList.add('hidden');
        document.getElementById('sf-overlay-victory').classList.add('hidden');
        document.getElementById('sf-overlay-gameover').classList.add('hidden');

        // 重置玩家
        this.player.x = CANVAS_WIDTH / 2;
        this.player.y = CANVAS_HEIGHT * 0.75;
        this.player.targetX = this.player.x;
        this.player.targetY = this.player.y;
        this.player.vx = 0;
        this.player.vy = 0;
        this.player.angle = 0;
        this.player.tilt = 0;
        this.player.lives = (mode === 'zen') ? 99 : 3;
        this.player.qi = 100;
        this.player.ultEnergy = 0;
        this.player.dashTimer = 0;
        this.player.invincibleTimer = 0;
        this.player.realmIndex = 0;
        this.player.swordCount = 1;
        this.player.trailHistory = [];
        for (let i = 0; i < 5; i++) {
            this.player.ribbonNodes[i] = { x: this.player.x, y: this.player.y };
        }

        this.score = 0;
        this.combo = 1;
        this.maxComboThisRun = 1;
        this.ringsThreaded = 0;
        this.distanceSoared = 0;
        this.scrollOffset = 0;
        this.worldSpeed = 5;

        // 根据模式与关卡设置目标与实体
        this.stageTargetDistance = (mode === 'stages') ? (2000 + stageIndex * 400) : Infinity;
        this.totalRingsInStage = 0;

        // 清空实体池
        this.rings = [];
        this.spiritStones = [];
        this.hazards = [];
        this.thunders = [];
        this.fiendBirds = [];
        this.windTunnels = [];
        this.particles = [];
        this.satelliteSwords = [];

        // 生成初始天道法阵与实体
        this.seedStageEntities();

        this.updateHUD();
        this.updateRealmDisplay();
        this.showToast(this.getRealmName(0));

        // Analytics
        if (typeof window !== 'undefined' && window.hubTrack) {
            window.hubTrack('sword-flight', 'play');
        }
    }

    /* ── 生成初始与随行天境实体 ── */
    seedStageEntities() {
        // 仙环 (按优雅的正弦波或连环曲线分布)
        const ringSpacing = 160;
        const initialCount = 10;
        for (let i = 0; i < initialCount; i++) {
            this.spawnRing(-i * ringSpacing - 180);
        }

        // 灵石散点
        for (let i = 0; i < 15; i++) {
            this.spawnSpiritStone(-Math.random() * 1200);
        }

        // 障碍绝壁
        if (this.mode !== 'zen') {
            for (let i = 0; i < 4; i++) {
                this.spawnHazard(-300 - i * 400);
            }
        }
    }

    spawnRing(y) {
        const amplitude = 140;
        const x = CANVAS_WIDTH / 2 + Math.sin(y * 0.005) * amplitude;
        this.rings.push({
            x,
            y,
            rx: 34,
            ry: 18,
            angle: Math.sin(y * 0.003) * 0.35,
            passed: false,
            missed: false,
            pulse: Math.random() * Math.PI * 2
        });
        this.totalRingsInStage++;
    }

    spawnSpiritStone(y) {
        this.spiritStones.push({
            x: 50 + Math.random() * (CANVAS_WIDTH - 100),
            y,
            size: 8,
            rotation: 0,
            value: 50,
            collected: false
        });
    }

    spawnHazard(y) {
        // 浮空绝壁 / 太古神剑 / 阵眼
        const isLeft = Math.random() > 0.5;
        const width = 100 + Math.random() * 80;
        const height = 45 + Math.random() * 30;
        this.hazards.push({
            x: isLeft ? width / 2 : CANVAS_WIDTH - width / 2,
            y,
            width,
            height,
            broken: false,
            type: Math.random() > 0.4 ? 'cliff' : 'giant-sword'
        });
    }

    spawnThunder(y) {
        this.thunders.push({
            x: 60 + Math.random() * (CANVAS_WIDTH - 120),
            y,
            radius: 50,
            active: false,
            chargeTime: 0,
            discharged: false
        });
    }

    spawnFiendBird(y) {
        this.fiendBirds.push({
            x: Math.random() * CANVAS_WIDTH,
            y,
            vx: (Math.random() - 0.5) * 3,
            vy: 3 + Math.random() * 2,
            wingAngle: 0,
            slain: false
        });
    }

    /* ── 动作指令：破空疾刺 (Dash) ── */
    triggerDash() {
        if (this.player.qi < 25 || this.player.dashTimer > 0) return;
        this.player.qi -= 25;
        this.player.dashTimer = 0.35; // 0.35s 冲刺无敌
        this.player.invincibleTimer = 0.45;
        SFX.playDash();
        this.screenShakes = 8;

        // 产生音爆环和冲击剑气粒子
        this.spawnShockwave(this.player.x, this.player.y, 40, '#38bdf8');
        this.showToast(I18N[getLang() === 'zh' ? 'zh' : 'en'].toastDash);

        // 斩击周围直接障碍
        this.cleaveNearbyHazards(80);
    }

    /* ── 动作指令：伴生剑阵出鞘 (Sword Array Wave) ── */
    triggerSwordArray() {
        if (this.satelliteSwords.length === 0) return;
        SFX.playArrayWave();
        this.screenShakes = 4;

        // 飞剑散开成弧形向前方疾斩
        this.satelliteSwords.forEach((sw) => {
            sw.activeSlash = true;
            sw.slashTimer = 0.4;
        });

        // 产生月牙剑气
        this.spawnSwordWave(this.player.x, this.player.y - 20);
        this.cleaveNearbyHazards(120);
    }

    /* ── 动作指令：绝技·万剑归宗 / 青莲剑歌 (Ultimate) ── */
    triggerUltimate() {
        if (this.player.ultEnergy < 100) return;
        this.player.ultEnergy = 0;
        SFX.playUltimate();
        this.screenShakes = 16;
        this.hitStopFrames = 12;

        this.showToast(I18N[getLang() === 'zh' ? 'zh' : 'en'].toastUlt);

        // 绽放百丈青莲与漫天剑雨
        this.spawnLotusAscension(this.player.x, this.player.y);

        // 净化全屏障碍与魔禽
        this.hazards.forEach((h) => {
            if (!h.broken) {
                h.broken = true;
                this.score += 200;
                this.spawnShatterParticles(h.x, h.y, '#38bdf8');
            }
        });
        this.fiendBirds.forEach((b) => {
            if (!b.slain) {
                b.slain = true;
                this.score += 300;
                this.spawnShatterParticles(b.x, b.y, '#fbbf24');
            }
        });
        this.thunders.forEach((th) => {
            th.discharged = true;
            this.score += 150;
        });

        // 奖励真气全满
        this.player.qi = this.player.maxQi;
    }

    cleaveNearbyHazards(range) {
        this.hazards.forEach((h) => {
            if (h.broken) return;
            const dist = Math.hypot(this.player.x - h.x, this.player.y - h.y);
            if (dist < range + Math.max(h.width, h.height) / 2) {
                h.broken = true;
                this.score += 150 * this.combo;
                this.player.ultEnergy = Math.min(100, this.player.ultEnergy + 15);
                SFX.playSlashHit();
                this.spawnShatterParticles(h.x, h.y, '#38bdf8');
            }
        });

        this.fiendBirds.forEach((b) => {
            if (b.slain) return;
            const dist = Math.hypot(this.player.x - b.x, this.player.y - b.y);
            if (dist < range + 30) {
                b.slain = true;
                this.score += 200 * this.combo;
                this.player.ultEnergy = Math.min(100, this.player.ultEnergy + 20);
                SFX.playSlashHit();
                this.spawnShatterParticles(b.x, b.y, '#fbbf24');
            }
        });
    }

    /* ── 境界突破与飞剑升级 ── */
    checkCultivationBreakthrough() {
        const realmThresholds = [0, 1500, 4500, 10000, 20000, 40000];
        const nextRealm = this.player.realmIndex + 1;
        if (nextRealm < realmThresholds.length && this.score >= realmThresholds[nextRealm]) {
            this.player.realmIndex = nextRealm;
            this.player.swordCount = 1 + nextRealm * 2; // 1, 3, 5, 7, 9
            this.player.maxQi = 100 + nextRealm * 20;
            this.player.qi = this.player.maxQi;

            SFX.playRingChime(5);
            this.screenShakes = 10;
            this.showToast(`${I18N[getLang() === 'zh' ? 'zh' : 'en'].toastBreakthrough}：${this.getRealmName(nextRealm)}！`);
            this.updateRealmDisplay();

            // 升级记录
            const rName = this.getRealmName(nextRealm);
            this.maxRealm = rName;
            storageSet(STORAGE_KEYS.MAX_REALM, rName);
        }
    }

    getRealmName(idx) {
        const lang = getLang() === 'zh' ? 'zh' : 'en';
        const realms = I18N[lang].realms;
        return realms[Math.min(idx, realms.length - 1)];
    }

    /* ── 游戏主循环 Update & Render ── */
    gameLoop(now) {
        const dt = Math.min((now - this.lastTime) / 1000, 0.1);
        this.lastTime = now;

        if (this.hitStopFrames > 0) {
            this.hitStopFrames--;
        } else if (this.isPlaying && !this.isPaused) {
            this.update(dt);
        }

        this.render();
        requestAnimationFrame((t) => this.gameLoop(t));
    }

    update(dt) {
        // 键盘移动支持
        let kx = 0, ky = 0;
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) kx -= 1;
        if (this.keys['KeyD'] || this.keys['ArrowRight']) kx += 1;
        if (this.keys['KeyW'] || this.keys['ArrowUp']) ky -= 1;
        if (this.keys['KeyS'] || this.keys['ArrowDown']) ky += 1;

        if (kx !== 0 || ky !== 0) {
            this.player.targetX += kx * 8;
            this.player.targetY += ky * 8;
            this.player.targetX = Math.max(25, Math.min(CANVAS_WIDTH - 25, this.player.targetX));
            this.player.targetY = Math.max(45, Math.min(CANVAS_HEIGHT - 65, this.player.targetY));
        }

        // 玩家运动平滑导引与倾角物理
        const dx = this.player.targetX - this.player.x;
        const dy = this.player.targetY - this.player.y;
        this.player.vx += (dx * 10 - this.player.vx) * 0.18;
        this.player.vy += (dy * 10 - this.player.vy) * 0.18;

        this.player.x += this.player.vx * dt;
        this.player.y += this.player.vy * dt;

        // 俯冲与翱翔速度调制
        const isDashing = this.player.dashTimer > 0;
        const diveBonus = Math.max(0, (this.player.y - CANVAS_HEIGHT * 0.5) / (CANVAS_HEIGHT * 0.5)) * 4;
        this.worldSpeed = isDashing ? 14 : (this.player.baseSpeed + diveBonus);

        // 更新风声
        SFX.updateWind(this.worldSpeed / 14);

        // 剑体倾角与转向
        const targetTilt = (this.player.vx / 15) * 0.4;
        this.player.tilt += (targetTilt - this.player.tilt) * 0.2;
        this.player.angle = this.player.tilt * 0.6;

        // 剑气尾迹记录
        this.player.trailHistory.unshift({ x: this.player.x, y: this.player.y });
        if (this.player.trailHistory.length > 22) this.player.trailHistory.pop();

        // 飘带布料多节点物理
        let prevX = this.player.x;
        let prevY = this.player.y + 12;
        for (let i = 0; i < this.player.ribbonNodes.length; i++) {
            const node = this.player.ribbonNodes[i];
            const segDist = 7;
            const ndx = node.x - prevX;
            const ndy = node.y - prevY;
            const dist = Math.hypot(ndx, ndy) || 1;
            node.x = prevX + (ndx / dist) * segDist - this.player.vx * 0.04;
            node.y = prevY + (ndy / dist) * segDist + this.worldSpeed * 0.6;
            prevX = node.x;
            prevY = node.y;
        }

        // 伴生飞剑阵列公转计算
        this.swordArrayAngle += dt * 3.5;
        this.updateSatelliteSwords(dt);

        // 真气自动恢复
        if (this.player.qi < this.player.maxQi) {
            this.player.qi = Math.min(this.player.maxQi, this.player.qi + dt * 12);
        }

        // 计时器递减
        if (this.player.dashTimer > 0) this.player.dashTimer -= dt;
        if (this.player.invincibleTimer > 0) this.player.invincibleTimer -= dt;

        // 飞行里程与卷轴
        const traveled = this.worldSpeed * dt * 25;
        this.distanceSoared += Math.floor(traveled * 0.1);
        this.scrollOffset += traveled;

        // 实体生成调度
        this.updateSpawners(traveled);

        // 实体运动与碰撞判定
        this.updateEntities(dt, traveled);

        // 境界突破检测
        this.checkCultivationBreakthrough();

        // 关卡胜利检测 (九天问道)
        if (this.mode === 'stages' && this.distanceSoared >= this.stageTargetDistance) {
            this.handleStageVictory();
            return;
        }

        // 刷新 HUD
        this.updateHUD();
    }

    updateSatelliteSwords(dt) {
        const count = this.player.swordCount - 1; // 伴生飞剑数量
        while (this.satelliteSwords.length < count) {
            this.satelliteSwords.push({
                offsetAngle: (this.satelliteSwords.length * Math.PI * 2) / Math.max(1, count),
                radius: 42,
                x: this.player.x,
                y: this.player.y,
                activeSlash: false,
                slashTimer: 0
            });
        }
        while (this.satelliteSwords.length > count) {
            this.satelliteSwords.pop();
        }

        this.satelliteSwords.forEach((sw, idx) => {
            const angle = this.swordArrayAngle + (idx * Math.PI * 2) / count;
            const currentRadius = sw.activeSlash ? 90 : sw.radius;
            sw.x = this.player.x + Math.cos(angle) * currentRadius;
            sw.y = this.player.y + Math.sin(angle) * (currentRadius * 0.6);
            if (sw.slashTimer > 0) {
                sw.slashTimer -= dt;
                if (sw.slashTimer <= 0) sw.activeSlash = false;
            }
        });
    }

    updateSpawners(traveled) {
        // 生成仙环
        const lastRing = this.rings[this.rings.length - 1];
        if (!lastRing || lastRing.y > 100) {
            this.spawnRing(lastRing ? lastRing.y - 180 : -100);
        }

        // 生成灵石
        if (Math.random() < 0.05) {
            this.spawnSpiritStone(-50);
        }

        // 生成障碍
        if (this.mode !== 'zen' && Math.random() < 0.02) {
            this.spawnHazard(-80);
        }

        // 高阶关卡生成玄雷与妖禽
        if (this.mode !== 'zen' && (this.currentStageIndex >= 3 || this.mode === 'endless')) {
            if (Math.random() < 0.012) this.spawnThunder(-100);
            if (Math.random() < 0.015) this.spawnFiendBird(-100);
        }
    }

    updateEntities(dt, traveled) {
        // 1. 仙环判定
        for (let i = this.rings.length - 1; i >= 0; i--) {
            const r = this.rings[i];
            r.y += traveled;
            r.pulse += dt * 3;

            // 穿环碰撞判定
            if (!r.passed && !r.missed) {
                const distY = Math.abs(this.player.y - r.y);
                const distX = Math.abs(this.player.x - r.x);
                if (distY < 18 && distX < r.rx + 10) {
                    r.passed = true;
                    this.handleRingThreaded(r);
                } else if (r.y > this.player.y + 30) {
                    r.missed = true;
                    // 漏环重置合鸣连击
                    if (this.combo > 1) {
                        this.combo = 1;
                        this.updateHUD();
                    }
                }
            }

            if (r.y > CANVAS_HEIGHT + 100) {
                this.rings.splice(i, 1);
            }
        }

        // 2. 灵石收集判定 (具有灵气磁吸效果)
        for (let i = this.spiritStones.length - 1; i >= 0; i--) {
            const s = this.spiritStones[i];
            s.y += traveled;
            s.rotation += dt * 2;

            // 磁吸
            const dx = this.player.x - s.x;
            const dy = this.player.y - s.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 100) {
                s.x += (dx / dist) * 8;
                s.y += (dy / dist) * 8;
            }

            if (dist < 28) {
                this.score += s.value * this.combo;
                this.player.ultEnergy = Math.min(100, this.player.ultEnergy + 5);
                SFX.playGem();
                this.spawnSparkle(s.x, s.y, '#fef08a');
                this.spiritStones.splice(i, 1);
            } else if (s.y > CANVAS_HEIGHT + 50) {
                this.spiritStones.splice(i, 1);
            }
        }

        // 3. 障碍与绝壁
        for (let i = this.hazards.length - 1; i >= 0; i--) {
            const h = this.hazards[i];
            h.y += traveled;

            if (!h.broken) {
                // 碰撞检测
                const withinX = Math.abs(this.player.x - h.x) < (h.width / 2 + 14);
                const withinY = Math.abs(this.player.y - h.y) < (h.height / 2 + 16);

                if (withinX && withinY) {
                    if (this.player.dashTimer > 0 || this.player.invincibleTimer > 0) {
                        // 破空斩断
                        h.broken = true;
                        this.score += 250 * this.combo;
                        this.player.ultEnergy = Math.min(100, this.player.ultEnergy + 15);
                        SFX.playSlashHit();
                        this.spawnShatterParticles(h.x, h.y, '#38bdf8');
                    } else {
                        // 玩家受伤
                        this.handlePlayerHit();
                        h.broken = true;
                    }
                }
            }

            if (h.y > CANVAS_HEIGHT + 100) {
                this.hazards.splice(i, 1);
            }
        }

        // 4. 玄雷云
        for (let i = this.thunders.length - 1; i >= 0; i--) {
            const th = this.thunders[i];
            th.y += traveled;
            th.chargeTime += dt;

            const dist = Math.hypot(this.player.x - th.x, this.player.y - th.y);
            if (!th.discharged && dist < th.radius + 18) {
                if (this.player.dashTimer > 0) {
                    // 以剑引雷！
                    th.discharged = true;
                    this.score += 300 * this.combo;
                    this.player.ultEnergy = Math.min(100, this.player.ultEnergy + 25);
                    SFX.playThunderAbsorb();
                    this.showToast(I18N[getLang() === 'zh' ? 'zh' : 'en'].toastThunder);
                    this.spawnLightningEffect(th.x, th.y, this.player.x, this.player.y);
                } else if (this.player.invincibleTimer <= 0) {
                    this.handlePlayerHit();
                    th.discharged = true;
                }
            }

            if (th.y > CANVAS_HEIGHT + 80) {
                this.thunders.splice(i, 1);
            }
        }

        // 5. 幽冥魔禽
        for (let i = this.fiendBirds.length - 1; i >= 0; i--) {
            const b = this.fiendBirds[i];
            b.x += b.vx;
            b.y += traveled + b.vy;
            b.wingAngle += dt * 10;

            if (b.x < 30 || b.x > CANVAS_WIDTH - 30) b.vx *= -1;

            if (!b.slain) {
                const dist = Math.hypot(this.player.x - b.x, this.player.y - b.y);
                if (dist < 32) {
                    if (this.player.dashTimer > 0 || this.player.invincibleTimer > 0) {
                        b.slain = true;
                        this.score += 200 * this.combo;
                        SFX.playSlashHit();
                        this.spawnShatterParticles(b.x, b.y, '#f59e0b');
                    } else {
                        this.handlePlayerHit();
                        b.slain = true;
                    }
                }
            }

            if (b.y > CANVAS_HEIGHT + 60) {
                this.fiendBirds.splice(i, 1);
            }
        }

        // 6. 粒子系统更新
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.alpha -= dt * p.fade;
            p.size = Math.max(0, p.size - dt * p.shrink);
            if (p.alpha <= 0 || p.size <= 0) {
                this.particles.splice(i, 1);
            }
        }

        // 7. 云彩与花瓣漂浮
        this.clouds.forEach((c) => {
            c.y += traveled * c.speedFactor;
            if (c.y > CANVAS_HEIGHT + c.radius) {
                c.y = -c.radius;
                c.x = Math.random() * CANVAS_WIDTH;
            }
        });

        this.petals.forEach((pt) => {
            pt.x += pt.speedX;
            pt.y += pt.speedY + traveled * 0.4;
            pt.angle += pt.rotSpeed;
            if (pt.y > CANVAS_HEIGHT + 20) {
                pt.y = -20;
                pt.x = Math.random() * CANVAS_WIDTH;
            }
        });
    }

    handleRingThreaded(ring) {
        this.ringsThreaded++;
        this.combo++;
        if (this.combo > this.maxComboThisRun) this.maxComboThisRun = this.combo;
        if (this.combo > this.maxComboRecord) {
            this.maxComboRecord = this.combo;
            storageSet(STORAGE_KEYS.MAX_COMBO, this.maxComboRecord.toString());
        }

        const ringScore = 100 * this.combo;
        this.score += ringScore;
        this.player.qi = Math.min(this.player.maxQi, this.player.qi + 18);
        this.player.ultEnergy = Math.min(100, this.player.ultEnergy + 8);

        SFX.playRingChime(this.combo);
        this.spawnRingBurst(ring.x, ring.y);
    }

    handlePlayerHit() {
        if (this.mode === 'zen') return; // 清修模式无损
        SFX.playHurt();
        this.player.lives--;
        this.player.invincibleTimer = 1.2; // 1.2s 无敌受击保护
        this.screenShakes = 14;
        this.combo = 1;
        this.showToast(I18N[getLang() === 'zh' ? 'zh' : 'en'].toastHurt);

        if (this.player.lives <= 0) {
            this.handleGameOver();
        }
    }

    handleStageVictory() {
        this.isPlaying = false;
        SFX.playUltimate();

        // 计算通关星级
        let stars = 1;
        const ringRatio = this.totalRingsInStage > 0 ? (this.ringsThreaded / this.totalRingsInStage) : 0;
        if (ringRatio >= 0.75) stars++;
        if (this.player.lives === this.player.maxLives) stars++;

        const currentStageNum = this.currentStageIndex + 1;
        const prevStars = this.stageStars[currentStageNum] || 0;
        if (stars > prevStars) {
            this.stageStars[currentStageNum] = stars;
            storageSet(STORAGE_KEYS.STAGE_STARS, JSON.stringify(this.stageStars));
        }

        if (currentStageNum >= this.unlockedStage && this.unlockedStage < 9) {
            this.unlockedStage = currentStageNum + 1;
            storageSet(STORAGE_KEYS.UNLOCKED_STAGE, this.unlockedStage.toString());
        }

        this.saveRecords();

        // 展现通关面板
        const overlay = document.getElementById('sf-overlay-victory');
        overlay.classList.remove('hidden');

        document.getElementById('sf-v-score').textContent = this.score.toLocaleString();
        document.getElementById('sf-v-rings').textContent = `${Math.round(ringRatio * 100)}%`;
        document.getElementById('sf-v-combo').textContent = `×${this.maxComboThisRun}`;
        document.getElementById('sf-v-realm').textContent = this.getRealmName(this.player.realmIndex);

        const starSlots = document.querySelectorAll('.sf-star-slot');
        starSlots.forEach((slot, i) => {
            slot.textContent = i < stars ? '⭐' : '☆';
            slot.style.opacity = i < stars ? '1' : '0.35';
        });

        if (typeof window !== 'undefined' && window.hubTrack) {
            window.hubTrack('sword-flight', 'finish');
        }
    }

    handleGameOver() {
        this.isPlaying = false;
        if (this.score > this.endlessBest) {
            this.endlessBest = this.score;
            storageSet(STORAGE_KEYS.ENDLESS_BEST, this.endlessBest.toString());
        }
        this.saveRecords();

        const overlay = document.getElementById('sf-overlay-gameover');
        overlay.classList.remove('hidden');

        document.getElementById('sf-go-score').textContent = this.score.toLocaleString();
        document.getElementById('sf-go-distance').textContent = `${this.distanceSoared} 里`;
        document.getElementById('sf-go-realm').textContent = this.getRealmName(this.player.realmIndex);
        document.getElementById('sf-go-rings').textContent = this.ringsThreaded.toString();

        if (typeof window !== 'undefined' && window.hubTrack) {
            window.hubTrack('sword-flight', 'finish');
        }
    }

    /* ── 渲染系统 (Render) ── */
    render() {
        const ctx = this.ctx;
        ctx.save();

        // 震屏位移
        if (this.screenShakes > 0) {
            const shakeX = (Math.random() - 0.5) * this.screenShakes;
            const shakeY = (Math.random() - 0.5) * this.screenShakes;
            ctx.translate(shakeX, shakeY);
            this.screenShakes *= 0.88;
            if (this.screenShakes < 0.5) this.screenShakes = 0;
        }

        // 1. 绘制天境穹顶与远景渐变
        this.renderSkyDome(ctx);

        // 2. 绘制多重视差山峰
        this.renderMountains(ctx);

        // 3. 绘制灵气浮云
        this.renderClouds(ctx);

        // 4. 绘制悬浮仙岛
        this.renderFloatingIslands(ctx);

        // 5. 绘制仙环
        this.renderRings(ctx);

        // 6. 绘制灵石与仙露
        this.renderSpiritStones(ctx);

        // 7. 绘制悬浮绝壁与巨剑残骸
        this.renderHazards(ctx);

        // 8. 绘制九天玄雷
        this.renderThunders(ctx);

        // 9. 绘制幽冥魔禽
        this.renderFiendBirds(ctx);

        // 10. 绘制玩家飞剑与剑仙主体
        this.renderPlayer(ctx);

        // 11. 绘制伴生飞剑阵列
        this.renderSatelliteSwords(ctx);

        // 12. 绘制灵华花瓣与粒子
        this.renderParticles(ctx);

        ctx.restore();
    }

    renderSkyDome(ctx) {
        // 根据不同关卡定制的天际配色
        const palettes = [
            ['#020816', '#061a30', '#0a2d4b'], // 1. 青峦
            ['#12071a', '#361026', '#6b2014'], // 2. 暮霞
            ['#040714', '#0d182b', '#1e2c4a'], // 3. 剑冢
            ['#010e17', '#032638', '#07485e'], // 4. 极光
            ['#040313', '#110c2c', '#201140'], // 5. 星河
            ['#080415', '#1a0932', '#3e1578'], // 6. 雷海
            ['#170505', '#330c0a', '#6b182a'], // 7. 炽焰
            ['#020206', '#090514', '#170923'], // 8. 九幽
            ['#061022', '#122547', '#254b85']  // 9. 登仙
        ];
        const p = palettes[this.currentStageIndex % palettes.length];
        const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
        grad.addColorStop(0, p[0]);
        grad.addColorStop(0.5, p[1]);
        grad.addColorStop(1, p[2]);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    renderMountains(ctx) {
        const tints = ['rgba(7, 26, 46, 0.45)', 'rgba(9, 36, 64, 0.7)', 'rgba(11, 48, 85, 0.9)'];
        this.mountains.forEach((m, idx) => {
            ctx.fillStyle = tints[idx];
            ctx.beginPath();
            ctx.moveTo(-20, CANVAS_HEIGHT);
            m.points.forEach((pt, i) => {
                const py = pt.y + Math.sin((this.scrollOffset * m.speedFactor * 0.02) + i) * 8;
                if (i === 0) ctx.lineTo(pt.x, py);
                else ctx.lineTo(pt.x, py);
            });
            ctx.lineTo(CANVAS_WIDTH + 20, CANVAS_HEIGHT);
            ctx.closePath();
            ctx.fill();
        });
    }

    renderClouds(ctx) {
        ctx.save();
        this.clouds.forEach((c) => {
            const grad = ctx.createRadialGradient(c.x, c.y, c.radius * 0.2, c.x, c.y, c.radius);
            grad.addColorStop(0, `rgba(224, 242, 254, ${c.opacity})`);
            grad.addColorStop(0.7, `rgba(186, 230, 253, ${c.opacity * 0.5})`);
            grad.addColorStop(1, 'rgba(186, 230, 253, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    }

    renderFloatingIslands(ctx) {
        this.floatingIslands.forEach((isl) => {
            const iy = isl.y + (this.scrollOffset * isl.speedFactor) % (CANVAS_HEIGHT + 400) - 200;
            ctx.save();
            ctx.translate(isl.x, iy);

            // 岛屿主体
            ctx.fillStyle = '#0a1e33';
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-isl.width / 2, 0);
            ctx.quadraticCurveTo(-isl.width * 0.2, -isl.height * 0.4, isl.width / 2, 0);
            ctx.quadraticCurveTo(0, isl.height, -isl.width / 2, 0);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // 浮空仙阁
            ctx.fillStyle = '#38bdf8';
            ctx.fillRect(-12, -isl.height * 0.4 - 10, 24, 10);
            ctx.fillStyle = '#fbbf24';
            ctx.fillRect(-16, -isl.height * 0.4 - 14, 32, 4);

            ctx.restore();
        });
    }

    renderRings(ctx) {
        this.rings.forEach((r) => {
            ctx.save();
            ctx.translate(r.x, r.y);
            ctx.rotate(r.angle);

            const scalePulse = 1 + Math.sin(r.pulse) * 0.05;
            ctx.scale(scalePulse, scalePulse);

            // 仙环外光晕
            ctx.strokeStyle = r.passed ? 'rgba(56, 189, 248, 0.3)' : 'rgba(251, 191, 36, 0.9)';
            ctx.lineWidth = r.passed ? 2 : 4.5;
            ctx.shadowColor = '#fbbf24';
            ctx.shadowBlur = r.passed ? 4 : 14;

            ctx.beginPath();
            ctx.ellipse(0, 0, r.rx, r.ry, 0, 0, Math.PI * 2);
            ctx.stroke();

            // 内部太极/灵动游涡
            if (!r.passed) {
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.ellipse(0, 0, r.rx * 0.7, r.ry * 0.7, 0, 0, Math.PI * 2);
                ctx.stroke();
            }

            ctx.restore();
        });
    }

    renderSpiritStones(ctx) {
        this.spiritStones.forEach((s) => {
            ctx.save();
            ctx.translate(s.x, s.y);
            ctx.rotate(s.rotation);

            ctx.fillStyle = '#fef08a';
            ctx.shadowColor = '#fbbf24';
            ctx.shadowBlur = 10;

            ctx.beginPath();
            ctx.moveTo(0, -s.size);
            ctx.lineTo(s.size * 0.7, 0);
            ctx.lineTo(0, s.size);
            ctx.lineTo(-s.size * 0.7, 0);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        });
    }

    renderHazards(ctx) {
        this.hazards.forEach((h) => {
            if (h.broken) return;
            ctx.save();
            ctx.translate(h.x, h.y);

            if (h.type === 'cliff') {
                // 浮空绝壁
                ctx.fillStyle = '#08172b';
                ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.roundRect(-h.width / 2, -h.height / 2, h.width, h.height, 8);
                ctx.fill();
                ctx.stroke();

                // 崖壁灵纹
                ctx.strokeStyle = '#38bdf8';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(-h.width * 0.3, 0);
                ctx.lineTo(h.width * 0.3, 0);
                ctx.stroke();
            } else {
                // 太古巨剑残骸
                ctx.fillStyle = '#1e293b';
                ctx.strokeStyle = '#94a3b8';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(0, -h.height / 2);
                ctx.lineTo(h.width / 4, h.height / 2);
                ctx.lineTo(-h.width / 4, h.height / 2);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }

            ctx.restore();
        });
    }

    renderThunders(ctx) {
        this.thunders.forEach((th) => {
            ctx.save();
            ctx.translate(th.x, th.y);

            // 紫电乌云
            const grad = ctx.createRadialGradient(0, 0, 10, 0, 0, th.radius);
            grad.addColorStop(0, 'rgba(168, 85, 247, 0.5)');
            grad.addColorStop(0.7, 'rgba(126, 34, 206, 0.3)');
            grad.addColorStop(1, 'rgba(126, 34, 206, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(0, 0, th.radius, 0, Math.PI * 2);
            ctx.fill();

            // 跃动雷弧
            if (!th.discharged && Math.random() < 0.6) {
                ctx.strokeStyle = '#e9d5ff';
                ctx.lineWidth = 2;
                ctx.shadowColor = '#c084fc';
                ctx.shadowBlur = 8;
                ctx.beginPath();
                ctx.moveTo((Math.random() - 0.5) * 20, -15);
                ctx.lineTo((Math.random() - 0.5) * 30, 0);
                ctx.lineTo((Math.random() - 0.5) * 20, 20);
                ctx.stroke();
            }

            ctx.restore();
        });
    }

    renderFiendBirds(ctx) {
        this.fiendBirds.forEach((b) => {
            if (b.slain) return;
            ctx.save();
            ctx.translate(b.x, b.y);

            ctx.fillStyle = '#f59e0b';
            ctx.shadowColor = '#f59e0b';
            ctx.shadowBlur = 8;

            // 妖禽双翼挥舞
            const wingSpread = Math.sin(b.wingAngle) * 14;
            ctx.beginPath();
            ctx.moveTo(0, -10);
            ctx.lineTo(18, wingSpread);
            ctx.lineTo(0, 6);
            ctx.lineTo(-18, wingSpread);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        });
    }

    renderPlayer(ctx) {
        const p = this.player;

        // 无敌闪烁
        if (p.invincibleTimer > 0 && Math.floor(p.invincibleTimer * 18) % 2 === 0) {
            return;
        }

        // 1. 剑气尾迹 (Ribbon Trail)
        if (p.trailHistory.length > 2) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(p.trailHistory[0].x, p.trailHistory[0].y);
            for (let i = 1; i < p.trailHistory.length; i++) {
                ctx.lineTo(p.trailHistory[i].x, p.trailHistory[i].y);
            }
            ctx.strokeStyle = p.dashTimer > 0 ? 'rgba(255, 255, 255, 0.85)' : 'rgba(56, 189, 248, 0.45)';
            ctx.lineWidth = p.dashTimer > 0 ? 12 : 5;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.shadowColor = '#38bdf8';
            ctx.shadowBlur = 12;
            ctx.stroke();
            ctx.restore();
        }

        // 2. 飘带 (Flowing Ribbon)
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(p.ribbonNodes[0].x, p.ribbonNodes[0].y);
        for (let i = 1; i < p.ribbonNodes.length; i++) {
            ctx.lineTo(p.ribbonNodes[i].x, p.ribbonNodes[i].y);
        }
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();

        // 3. 剑仙与飞剑姿态变换
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);

        // 飞剑光刃
        ctx.shadowColor = p.dashTimer > 0 ? '#ffffff' : '#38bdf8';
        ctx.shadowBlur = p.dashTimer > 0 ? 20 : 12;
        ctx.fillStyle = p.dashTimer > 0 ? '#ffffff' : '#e0f2fe';

        // 剑身 (流线型仙剑)
        ctx.beginPath();
        ctx.moveTo(0, -32); // 剑尖朝上
        ctx.lineTo(6, 16);
        ctx.lineTo(0, 22);
        ctx.lineTo(-6, 16);
        ctx.closePath();
        ctx.fill();

        // 剑脊金光与剑格
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -28);
        ctx.lineTo(0, 18);
        ctx.stroke();

        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(-8, 14, 16, 3); // 剑格

        // 剑仙人偶造型 (白衣青带，侧立踏剑)
        // 躯干与道袍
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.moveTo(0, -18);
        ctx.lineTo(5, 4);
        ctx.lineTo(-5, 4);
        ctx.closePath();
        ctx.fill();

        // 青色披风后飘
        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        ctx.moveTo(-3, -12);
        ctx.lineTo(-12, 10);
        ctx.lineTo(-3, 6);
        ctx.closePath();
        ctx.fill();

        // 头部与发髻
        ctx.fillStyle = '#fbcfe8';
        ctx.beginPath();
        ctx.arc(0, -22, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#0f172a'; // 乌发
        ctx.beginPath();
        ctx.arc(0, -23, 4, Math.PI, Math.PI * 2);
        ctx.fill();

        // 境界外溢护体光环 (结丹及以上)
        if (p.realmIndex >= 2) {
            ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(0, -4, 28, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();
    }

    renderSatelliteSwords(ctx) {
        this.satelliteSwords.forEach((sw) => {
            ctx.save();
            ctx.translate(sw.x, sw.y);
            ctx.rotate(this.swordArrayAngle + Math.PI / 2);

            ctx.fillStyle = sw.activeSlash ? '#ffffff' : '#7dd3fc';
            ctx.shadowColor = '#38bdf8';
            ctx.shadowBlur = sw.activeSlash ? 14 : 6;

            ctx.beginPath();
            ctx.moveTo(0, -16);
            ctx.lineTo(3.5, 8);
            ctx.lineTo(0, 12);
            ctx.lineTo(-3.5, 8);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        });
    }

    renderParticles(ctx) {
        // 花瓣
        this.petals.forEach((pt) => {
            ctx.save();
            ctx.translate(pt.x, pt.y);
            ctx.rotate(pt.angle);
            ctx.fillStyle = 'rgba(244, 114, 182, 0.6)';
            ctx.beginPath();
            ctx.ellipse(0, 0, pt.size, pt.size * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });

        // 动态碎芒粒子
        this.particles.forEach((p) => {
            ctx.save();
            ctx.fillStyle = p.color;
            ctx.globalAlpha = Math.max(0, p.alpha);
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
    }

    /* ── 特效发生器 ── */
    spawnSparkle(x, y, color) {
        for (let i = 0; i < 6; i++) {
            this.particles.push({
                x,
                y,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4,
                size: 2 + Math.random() * 2.5,
                color,
                alpha: 1,
                fade: 2.5,
                shrink: 1.2
            });
        }
    }

    spawnRingBurst(x, y) {
        for (let i = 0; i < 14; i++) {
            const ang = (i / 14) * Math.PI * 2;
            const spd = 3 + Math.random() * 3;
            this.particles.push({
                x,
                y,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd,
                size: 3,
                color: '#fbbf24',
                alpha: 1,
                fade: 1.8,
                shrink: 1
            });
        }
    }

    spawnShatterParticles(x, y, color) {
        for (let i = 0; i < 18; i++) {
            this.particles.push({
                x,
                y,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8,
                size: 2.5 + Math.random() * 3.5,
                color,
                alpha: 1,
                fade: 2.2,
                shrink: 1.5
            });
        }
    }

    spawnShockwave(x, y, radius, color) {
        for (let i = 0; i < 16; i++) {
            const ang = (i / 16) * Math.PI * 2;
            this.particles.push({
                x: x + Math.cos(ang) * radius * 0.4,
                y: y + Math.sin(ang) * radius * 0.4,
                vx: Math.cos(ang) * 6,
                vy: Math.sin(ang) * 6,
                size: 3,
                color,
                alpha: 1,
                fade: 2.8,
                shrink: 1.5
            });
        }
    }

    spawnSwordWave(x, y) {
        for (let i = -5; i <= 5; i++) {
            this.particles.push({
                x: x + i * 8,
                y: y - Math.abs(i) * 2,
                vx: i * 0.8,
                vy: -8,
                size: 3.5,
                color: '#38bdf8',
                alpha: 1,
                fade: 2,
                shrink: 1
            });
        }
    }

    spawnLotusAscension(x, y) {
        for (let i = 0; i < 36; i++) {
            const ang = (i / 36) * Math.PI * 2;
            const spd = 5 + Math.random() * 5;
            this.particles.push({
                x,
                y,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd,
                size: 4 + Math.random() * 3,
                color: i % 2 === 0 ? '#38bdf8' : '#fbbf24',
                alpha: 1,
                fade: 1.2,
                shrink: 0.8
            });
        }
    }

    spawnLightningEffect(x1, y1, x2, y2) {
        const segs = 6;
        let cx = x1, cy = y1;
        for (let i = 1; i <= segs; i++) {
            const targetX = x1 + ((x2 - x1) * i) / segs + (Math.random() - 0.5) * 25;
            const targetY = y1 + ((y2 - y1) * i) / segs + (Math.random() - 0.5) * 25;
            this.particles.push({
                x: cx,
                y: cy,
                vx: (targetX - cx) * 0.2,
                vy: (targetY - cy) * 0.2,
                size: 3,
                color: '#e9d5ff',
                alpha: 1,
                fade: 4,
                shrink: 1
            });
            cx = targetX;
            cy = targetY;
        }
    }

    /* ── UI 界面与悬浮气泡 ── */
    updateHUD() {
        document.getElementById('sf-score-val').textContent = this.score.toLocaleString();
        const comboEl = document.getElementById('sf-combo-val');
        comboEl.textContent = `×${this.combo}`;
        if (this.combo > 1) {
            comboEl.style.transform = 'scale(1.25)';
            setTimeout(() => { comboEl.style.transform = 'scale(1)'; }, 150);
        }

        // 生命值仙剑状态
        for (let i = 1; i <= 3; i++) {
            const el = document.getElementById(`sf-heart-${i}`);
            if (el) {
                if (i <= this.player.lives) el.classList.remove('lost');
                else el.classList.add('lost');
            }
        }

        // 登仙进度条
        const progressFill = document.getElementById('sf-progress-fill');
        if (this.mode === 'stages') {
            const pct = Math.min(100, Math.round((this.distanceSoared / this.stageTargetDistance) * 100));
            progressFill.style.width = `${pct}%`;
        } else {
            progressFill.style.width = `${Math.min(100, (this.distanceSoared % 5000) / 50)}%`;
        }

        // 真气槽
        const qiPct = Math.round((this.player.qi / this.player.maxQi) * 100);
        document.getElementById('sf-bar-qi').style.width = `${qiPct}%`;
        document.getElementById('sf-val-qi').textContent = `${qiPct}%`;

        // 绝技槽
        const ultPct = Math.round(this.player.ultEnergy);
        document.getElementById('sf-bar-ult').style.width = `${ultPct}%`;
        document.getElementById('sf-val-ult').textContent = `${ultPct}%`;
        const ultBtn = document.getElementById('sf-touch-ult');
        if (ultBtn) ultBtn.disabled = (ultPct < 100);
    }

    updateRealmDisplay() {
        const realmName = this.getRealmName(this.player.realmIndex);
        document.getElementById('sf-realm-text').textContent = realmName;
    }

    updateSideRecords() {
        let stars = 0;
        Object.values(this.stageStars).forEach(s => { stars += s; });
        document.getElementById('sf-rec-stars').textContent = `${stars} / 27 ⭐`;
        document.getElementById('sf-rec-endless').textContent = this.endlessBest.toLocaleString();
        document.getElementById('sf-rec-realm').textContent = this.maxRealm;
        document.getElementById('sf-rec-combo').textContent = `${this.maxComboRecord} 环`;

        const now = new Date();
        const dateKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const dailyRecord = storageGet(`${STORAGE_KEYS.DAILY_PREFIX}${dateKey}`);
        const isZh = getLang() === 'zh';
        document.getElementById('sf-rec-daily').textContent = dailyRecord
            ? (isZh ? '今日已飞升' : 'Ascended Today')
            : (isZh ? '未涉足' : 'Untraveled');
    }

    showToast(msg) {
        const toast = document.getElementById('sf-toast');
        toast.textContent = msg;
        toast.classList.remove('hidden');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => {
            toast.classList.add('hidden');
        }, 1500);
    }

    togglePause() {
        if (!this.isPlaying) return;
        if (this.isPaused) this.resumeGame();
        else this.pauseGame();
    }

    pauseGame() {
        this.isPaused = true;
        document.getElementById('sf-overlay-pause').classList.remove('hidden');
    }

    resumeGame() {
        this.isPaused = false;
        this.lastTime = performance.now();
        document.getElementById('sf-overlay-pause').classList.add('hidden');
    }

    restartGame() {
        document.getElementById('sf-overlay-pause').classList.add('hidden');
        this.startFlight(this.mode, this.currentStageIndex);
    }

    returnToMenu() {
        this.isPlaying = false;
        this.isPaused = false;
        document.getElementById('sf-overlay-pause').classList.add('hidden');
        document.getElementById('sf-overlay-victory').classList.add('hidden');
        document.getElementById('sf-overlay-gameover').classList.add('hidden');
        document.getElementById('sf-overlay-start').classList.remove('hidden');
        this.loadRecords();
        this.updateSideRecords();
    }

    /* ── 全球排行榜接入 ── */
    async openLeaderboardModal(tab = 'endless') {
        const modal = document.getElementById('sf-rank-modal');
        modal.classList.remove('hidden');
        const list = document.getElementById('sf-rank-list');
        list.innerHTML = `<div class="sf-rank-loading">${I18N[getLang() === 'zh' ? 'zh' : 'en'].loadingRank}</div>`;

        const tabEndless = document.getElementById('sf-tab-endless');
        const tabDaily = document.getElementById('sf-tab-daily');
        if (tab === 'endless') {
            tabEndless.classList.add('active');
            tabDaily.classList.remove('active');
        } else {
            tabDaily.classList.add('active');
            tabEndless.classList.remove('active');
        }

        const now = new Date();
        const dateKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const gameKey = (tab === 'endless') ? 'sword-flight' : `sword-flight-d${dateKey}`;

        try {
            const res = await fetch(`${LEADERBOARD_URL}/scores?game=${gameKey}`);
            if (!res.ok) throw new Error('Network error');
            const data = await res.json();
            this.renderLeaderboardList(data);
        } catch (e) {
            list.innerHTML = `<div class="sf-rank-loading">${I18N[getLang() === 'zh' ? 'zh' : 'en'].noRankData}</div>`;
        }
    }

    renderLeaderboardList(data) {
        const list = document.getElementById('sf-rank-list');
        list.innerHTML = '';
        if (!data || data.length === 0) {
            list.innerHTML = `<div class="sf-rank-loading">${I18N[getLang() === 'zh' ? 'zh' : 'en'].noRankData}</div>`;
            return;
        }

        data.slice(0, 30).forEach((entry, idx) => {
            const item = document.createElement('div');
            const topClass = idx === 0 ? 'top1' : idx === 1 ? 'top2' : idx === 2 ? 'top3' : '';
            item.className = `sf-rank-item ${topClass}`;
            const safeName = (entry.name || '无名剑仙').replace(/[<>&"]/g, '');
            item.innerHTML = `
                <span><b>#${idx + 1}</b> ${safeName}</span>
                <b>${entry.score.toLocaleString()}</b>
            `;
            list.appendChild(item);
        });
    }

    async submitScoreToLeaderboard(name, score) {
        const fb = document.getElementById('sf-submit-feedback');
        fb.classList.remove('hidden');
        fb.textContent = '正在沟通天地灵脉...';

        const now = new Date();
        const dateKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const gameKey = (this.mode === 'daily') ? `sword-flight-d${dateKey}` : 'sword-flight';

        try {
            const res = await fetch(`${LEADERBOARD_URL}/scores`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ game: gameKey, name, score })
            });
            if (res.ok) {
                fb.textContent = I18N[getLang() === 'zh' ? 'zh' : 'en'].scoreSubmitted;
                if (this.mode === 'daily') {
                    storageSet(`${STORAGE_KEYS.DAILY_PREFIX}${dateKey}`, score.toString());
                }
            } else {
                fb.textContent = I18N[getLang() === 'zh' ? 'zh' : 'en'].scoreSubmitFailed;
            }
        } catch (e) {
            fb.textContent = I18N[getLang() === 'zh' ? 'zh' : 'en'].scoreSubmitFailed;
        }
    }

    /* ── 多语言国际化适配 ── */
    applyLanguage() {
        const lang = getLang() === 'zh' ? 'zh' : 'en';
        const t = I18N[lang];

        document.getElementById('sf-stage-label').textContent = t.gameTitle;
        document.getElementById('sf-main-title').textContent = t.gameTitle;
        document.getElementById('sf-main-sub').textContent = t.gameSub;
        document.getElementById('sf-howto-box').innerHTML = t.howTo;

        document.getElementById('sf-lbl-mode-stages').textContent = t.modeStages;
        document.getElementById('sf-sub-mode-stages').textContent = t.modeStagesSub;
        document.getElementById('sf-lbl-mode-endless').textContent = t.modeEndless;
        document.getElementById('sf-sub-mode-endless').textContent = t.modeEndlessSub;
        document.getElementById('sf-lbl-mode-daily').textContent = t.modeDaily;
        document.getElementById('sf-sub-mode-daily').textContent = t.modeDailySub;
        document.getElementById('sf-lbl-mode-zen').textContent = t.modeZen;
        document.getElementById('sf-sub-mode-zen').textContent = t.modeZenSub;

        document.getElementById('sf-btn-start-daily').textContent = t.dailyStart;
        document.getElementById('sf-lbl-open-rank').textContent = t.openRank;

        document.getElementById('sf-pause-title').textContent = t.pauseTitle;
        document.getElementById('sf-pause-sub').textContent = t.pauseSub;
        document.getElementById('sf-btn-resume').textContent = t.resume;
        document.getElementById('sf-btn-restart').textContent = t.restart;
        document.getElementById('sf-btn-menu').textContent = t.home;

        document.getElementById('sf-victory-title').textContent = t.victoryTitle;
        document.getElementById('sf-victory-sub').textContent = t.victorySub;
        document.getElementById('sf-v-lbl-score').textContent = t.scoreLbl;
        document.getElementById('sf-v-lbl-rings').textContent = t.ringsRateLbl;
        document.getElementById('sf-v-lbl-combo').textContent = t.comboLbl;
        document.getElementById('sf-v-lbl-realm').textContent = t.realmResultLbl;
        document.getElementById('sf-btn-next-stage').textContent = t.nextStage;
        document.getElementById('sf-btn-stage-replay').textContent = t.replayStage;
        document.getElementById('sf-btn-victory-menu').textContent = t.home;

        document.getElementById('sf-go-title').textContent = t.defeatTitle;
        document.getElementById('sf-go-sub').textContent = t.defeatSub;
        document.getElementById('sf-go-lbl-score').textContent = t.scoreLbl;
        document.getElementById('sf-go-lbl-distance').textContent = t.distLbl;
        document.getElementById('sf-go-lbl-realm').textContent = t.realmResultLbl;
        document.getElementById('sf-go-lbl-rings').textContent = t.ringsCountLbl;
        document.getElementById('sf-btn-go-replay').textContent = t.replayEndless;
        document.getElementById('sf-btn-go-menu').textContent = t.home;
        document.getElementById('sf-btn-submit-score').textContent = t.submitScore;
        document.getElementById('sf-player-name-input').placeholder = t.namePlaceholder;

        // 侧边栏
        document.getElementById('sf-side-rules-title').textContent = t.sideRulesTitle;
        document.getElementById('sf-side-rules-text').innerHTML = t.sideRulesText;
        document.getElementById('sf-side-records-title').textContent = t.sideRecordsTitle;
        document.getElementById('sf-side-stars-lbl').textContent = t.sideStarsLbl;
        document.getElementById('sf-side-endless-lbl').textContent = t.sideEndlessLbl;
        document.getElementById('sf-side-maxrealm-lbl').textContent = t.sideRealmMaxLbl;
        document.getElementById('sf-side-combo-lbl').textContent = t.sideComboLbl;
        document.getElementById('sf-side-daily-lbl').textContent = t.sideDailyLbl;
        document.getElementById('sf-side-controls-title').textContent = t.sideControlsTitle;

        document.getElementById('sf-sc-steer').textContent = t.scSteer;
        document.getElementById('sf-sc-keyboard').textContent = t.scKeyb;
        document.getElementById('sf-sc-dash').textContent = t.scDash;
        document.getElementById('sf-sc-array').textContent = t.scArray;
        document.getElementById('sf-sc-ult').textContent = t.scUlt;
        document.getElementById('sf-sc-pause').textContent = t.scPause;

        updateMoreGames(lang);
        this.updateRealmDisplay();
        this.updateSideRecords();
    }
}

// 启动游戏实例
window.addEventListener('DOMContentLoaded', () => {
    window.game = new SwordFlightGame();
});
