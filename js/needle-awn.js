/**
 * 针尖对麦芒 (Pinpoint Clash: Needle vs Awn)
 * Cyber-Ink Martial Precision Action Game
 *
 * 核心机制：硬碰硬 · 针尖对麦芒
 * 敌来刺我，正对锋芒冲刺，毫厘之间触发时空定格、反震碎芒与绝境反击。
 * 银针（穿云疾刺/子弹时间）与金芒（回旋破晓/全屏天爆）双姿态流转。
 *
 * Vanilla JS ES Module. No runtime dependencies.
 */

import { ensurePlayerName, getPlayerName, setPlayerName } from './player.js';
import { getLang, setLang, getMuted, setMuted } from './site-settings.js';
import { ICONS } from './icons.js';
import { updateMoreGames } from './more-games.js';
import { createStatsDrawer } from './game-drawer.js';
import { bindChrome } from './game-chrome.js';

/* ────────────────────────── 常量与配置 ────────────────────────── */

const ARENA_WIDTH = 480;
const ARENA_HEIGHT = 640;
const LEADERBOARD_URL = 'https://game-scores.orangely.workers.dev';

const STORAGE_KEYS = {
    UNLOCKED_LEVEL: 'na_unlocked_level',
    LEVEL_STARS: 'na_level_stars',
    ENDLESS_BEST: 'na_endless_best',
    CLASH_MAX: 'na_clash_max',
    DAILY_PREFIX: 'zj_daily_'
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
        close: '关闭',
        stats: '数据统计',
        gameTitle: '针尖对麦芒',
        gameSub: '极速破锋 · 针芒毕露 · 刹那生灭',
        badge: '东方赛博交锋',
        trials: '十关演武',
        trialsSub: '10 Trials & Bosses',
        endless: '无尽争锋',
        endlessSub: '极限冲分 生存挑战',
        daily: '每日论剑',
        dailySub: '全球同谱 每日一局',
        duel: '双雄对决',
        duelSub: '1v1 AI人机 / 双人同屏',
        howTo: '<b>核心玩法：</b>敌来刺我，非退即进！正对敌方锋芒<b>破空突刺</b>触发<b>【针尖对麦芒】</b>极致弹反！<br>破空瞬息定格时空，震落碎芒反弹追击。流转<b>银针</b>与<b>金芒</b>双姿态，聚极意，斩乾坤！',
        selectLevel: '选择演武关卡',
        duelModeLbl: '对决模式',
        duelTypeAi: 'vs AI 人机',
        duelType2P: '双人同屏 2P',
        aiDiffLbl: 'AI 宗师造诣',
        diffEasy: '剑徒',
        diffMedium: '宗师',
        diffHard: '剑圣',
        startDuel: '开始对决 ▶',
        pauseTitle: '凝神静思 · 暂停',
        pauseSub: '调息片刻，蓄势待发',
        resume: '继续战斗 ▶',
        restart: '重新挑战 ⟲',
        home: '返回菜单',
        victoryTitle: '大获全胜 · 锋芒毕露',
        defeatTitle: '气力耗尽 · 胜败常事',
        duelP1Win: '银针破阵 · P1 胜出！',
        duelP2Win: '金芒贯日 · P2 胜出！',
        duelAiWin: '宗师破极 · AI 胜出！',
        scoreLbl: '交锋得分',
        clashesLbl: '针尖麦芒碰撞',
        comboLbl: '最高连击',
        extraLbl: '用时 / 关卡',
        nextStage: '下一关卡 ▶',
        replay: '再战一局 ⟲',
        toastClash: '针尖对麦芒！',
        toastZen: '极意·刹那！',
        toastNova: '金芒天爆！',
        toastUlt: '万芒天破！',
        sideRulesTitle: '⚔️ 针尖对麦芒 · 核心法则',
        sideRulesText: '<b>硬碰硬：</b>朝向迎面而来的利刃或尖刺突刺，在毫厘之间触发<b>针尖对麦芒</b>！完美格挡所有伤害并爆发出碎芒反弹。<br><br><b>双锋流转：</b><br>• <b>银针（水蓝）</b>：极速穿云刺，碰撞触发时空凝滞（子弹时间）。<br>• <b>金芒（暖金）</b>：回旋破晓舞，碰撞引发金芒天爆全屏净空。<br><b>逆克爆发：</b>以针刺破麦芒，倍率翻倍！',
        sideRecordsTitle: '🏆 绝巅战绩',
        sideEndlessLbl: '无尽争锋最高分',
        sideClashLbl: '单局极致碰撞',
        sideStarsLbl: '演武通关星数',
        sideDailyLbl: '今日论剑状态',
        sideControlsTitle: '⌨️ 键位与操控',
        scAim: '瞄准方向',
        scAimKey: '鼠标移动 / 触屏拖拽（右半屏）',
        scDash: '破空突刺 (交锋)',
        scDashKey: '鼠标左键 / 空格 / ⚡按钮',
        scStance: '转换锋芒姿态',
        scStanceKey: '鼠标右键 / Q / 🔄按钮',
        scUlt: '万芒天破 (极意)',
        scUltKey: 'E 键 / 双击 / 🌟按钮',
        scMove: '身法游走',
        scMoveKey: 'W A S D / 左半屏摇杆',
        dailyDone: '今日已登顶',
        dailyNotDone: '今日未挑战',
        stanceNeedle: '银针态',
        stanceAwn: '金芒态',
        touchDash: '破空刺',
        touchStance: '转锋',
        touchUlt: '极意',
        ultLabel: '极意',
        namePlaceholder: '输入侠客尊号以登金榜...',
        duelFinale: '⚔️ 对决终局 ⚔️',
        duelSubResult: '双雄争锋 · 胜负已分',
        victorySub: '演武告捷 · 锋芒初试',
        defeatSub: '胜败常事 · 重整旗鼓',
        modeBadgeMenu: '演武',
        badgeStage: '第 {n} / 10 关',
        badgeWave: '第 {n} 波',
        badgeDaily: '每日挑战',
        lbSubmitFail: '金榜上传失败——战绩已存本地',
        duel2pTouchWarn: '双人同屏 2P 需要实体键盘，触屏设备建议选择 vs AI',
        levelNames: [
            '初试锋芒', '飞针入微', '芒刺在背', '阴阳交错', '灵虚针尊',
            '暴雨梨花', '麦浪连天', '扶摇麦皇', '绝命千本', '针尖麦芒'
        ],
        sound: '声音',
        moreGames: '更多游戏',
        hint: '移动即突刺 · Q 转锋 · E 极意 · P 暂停',
    },
    en: {
        close: 'Close',
        stats: 'Stats',
        gameTitle: 'Pinpoint Clash',
        gameSub: 'Needle vs Awn · Pierce · Clash · Awaken',
        badge: 'ORIENTAL KINETIC ACTION',
        trials: '10 Trials',
        trialsSub: 'Handcrafted Stages & Bosses',
        endless: 'Endless Duel',
        endlessSub: 'Survive & Rank Globally',
        daily: 'Daily Duel',
        dailySub: 'World-shared Seeded Run',
        duel: '1v1 Arena',
        duelSub: 'vs AI or 2-Player Pass & Play',
        howTo: '<b>Core Mechanic:</b> Dodge less, clash more! Thrust head-on into enemy tips to trigger <b>【Pinpoint Clash】</b>!<br>Freeze time, detonate homing ricochets, and fluidly weave between <b>Silver Needle</b> &amp; <b>Golden Awn</b> stances to unleash Awakening!',
        selectLevel: 'Select Trial Stage',
        duelModeLbl: 'Duel Mode',
        duelTypeAi: 'vs AI Bot',
        duelType2P: '2-Player (Same Screen)',
        aiDiffLbl: 'AI Grandmaster Skill',
        diffEasy: 'Apprentice',
        diffMedium: 'Master',
        diffHard: 'Sword Saint',
        startDuel: 'Start Duel ▶',
        pauseTitle: 'Focused Pause',
        pauseSub: 'Catch your breath and prepare to clash',
        resume: 'Resume Battle ▶',
        restart: 'Restart ⟲',
        home: 'Menu',
        victoryTitle: 'VICTORY · Sharp & Radiant',
        defeatTitle: 'DEFEAT · The Blade Broke',
        duelP1Win: 'Silver Needle Strikes · P1 Wins!',
        duelP2Win: 'Golden Awn Radiates · P2 Wins!',
        duelAiWin: 'Master Deflects · AI Wins!',
        scoreLbl: 'Clash Score',
        clashesLbl: 'Tip-to-Tip Clashes',
        comboLbl: 'Max Combo',
        extraLbl: 'Time / Wave',
        nextStage: 'Next Stage ▶',
        replay: 'Play Again ⟲',
        toastClash: 'PINPOINT CLASH!',
        toastZen: 'BULLET TIME!',
        toastNova: 'SOLAR NOVA!',
        toastUlt: 'AWAKENED LOTUS!',
        sideRulesTitle: '⚔️ Core Rules: Pinpoint Clash',
        sideRulesText: '<b>Head-on Precision:</b> Thrust directly towards incoming blade tips to trigger <b>Pinpoint Clash</b>! Parries all damage, freeze-frames impact, and fires homing shards.<br><br><b>Dual Stances:</b><br>• <b>Silver Needle (Cyan)</b>: Piercing dash, triggers Bullet Time on clash.<br>• <b>Golden Awn (Gold)</b>: Wide arc sweep, triggers Solar Nova on clash.<br><b>Opposite Clash:</b> Needle vs Awn yields ×2 bonus multiplier!',
        sideRecordsTitle: '🏆 Grand Records',
        sideEndlessLbl: 'Endless Best Score',
        sideClashLbl: 'Max Tip Clashes',
        sideStarsLbl: 'Total Trial Stars',
        sideDailyLbl: 'Daily Challenge',
        sideControlsTitle: '⌨️ Controls & Shortcuts',
        scAim: 'Aim Angle',
        scAimKey: 'Mouse Move / Touch Drag (right half)',
        scDash: 'Thrust (Clash)',
        scDashKey: 'Left Click / Space / ⚡',
        scStance: 'Switch Stance',
        scStanceKey: 'Right Click / Q / 🔄',
        scUlt: 'Awakened Lotus',
        scUltKey: 'E / Double Tap / 🌟',
        scMove: 'Agile Maneuver',
        scMoveKey: 'W A S D / Touch Joystick (left half)',
        dailyDone: 'Completed Today',
        dailyNotDone: 'Unattempted',
        stanceNeedle: 'Needle Stance',
        stanceAwn: 'Awn Stance',
        touchDash: 'Thrust',
        touchStance: 'Stance',
        touchUlt: 'Awaken',
        ultLabel: 'Awaken',
        namePlaceholder: 'Warrior / Player Name...',
        duelFinale: '⚔️ DUEL FINALE ⚔️',
        duelSubResult: '1v1 Arena Duel Concluded',
        victorySub: 'Trial Accomplished',
        defeatSub: 'Defeated · Strike Again',
        modeBadgeMenu: 'Trials',
        badgeStage: 'Stage {n}/10',
        badgeWave: 'Wave {n}',
        badgeDaily: 'Daily Run',
        lbSubmitFail: 'Score upload failed — saved locally',
        duel2pTouchWarn: '2P mode needs a physical keyboard; on touch devices try vs AI',
        levelNames: [
            'First Spark', 'Needle Stream', 'Awn Swarm', 'Dual Weaving', 'Needle Sovereign',
            'Blossom Rain', 'Golden Surge', 'Awn Emperor', 'Thousand Needles', 'Grandmaster Duel'
        ],
        sound: 'Sound',
        moreGames: 'More games',
        hint: 'Move to thrust · Q switch stance · E ultimate · P pause',
    }
};

/* ────────────────────────── Web Audio 音频引擎 ────────────────────────── */

const SoundEngine = {
    ctx: null,
    bgmOsc: null,
    bgmGain: null,
    bgmInterval: null,
    pentatonic: [220, 246.94, 277.18, 329.63, 369.99, 440, 493.88, 554.37, 659.25],

    init() {
        if (getMuted()) return null;
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

    playTone(freq, duration, type = 'sine', vol = 0.12, endFreq = null) {
        const ctx = this.init();
        if (!ctx) return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        if (endFreq) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), now + duration);
        }

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(vol, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + duration + 0.05);
    },

    clashPing() {
        // 银针碰撞：高频金属脆响 + 泛音
        const ctx = this.init();
        if (!ctx) return;
        this.playTone(1320, 0.28, 'triangle', 0.16, 2640);
        this.playTone(2640, 0.18, 'sine', 0.12);
        this.playTone(90, 0.12, 'triangle', 0.2, 45); // 顿击低音
    },

    awnBurst() {
        // 金麦芒爆：洪厚青铜钟鸣 + 暖音低破
        const ctx = this.init();
        if (!ctx) return;
        this.playTone(440, 0.35, 'triangle', 0.18, 220);
        this.playTone(880, 0.25, 'sine', 0.14);
        this.playTone(65, 0.22, 'sawtooth', 0.18, 30);
    },

    dashWhoosh() {
        // 破空急啸
        const ctx = this.init();
        if (!ctx) return;
        const now = ctx.currentTime;
        const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.16), ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 1.8);
        }
        const src = ctx.createBufferSource();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(800, now);
        filter.frequency.exponentialRampToValueAtTime(2400, now + 0.08);
        filter.frequency.exponentialRampToValueAtTime(600, now + 0.16);
        filter.Q.value = 3.0;

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

        src.buffer = buffer;
        src.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        src.start(now);
    },

    stanceSwitch() {
        this.playTone(620, 0.08, 'sine', 0.09, 880);
    },

    hurt() {
        this.playTone(220, 0.25, 'sawtooth', 0.22, 60);
    },

    awaken() {
        const ctx = this.init();
        if (!ctx) return;
        // 琴音拂弦升调 + 爆鸣
        [329.63, 440, 493.88, 659.25, 880].forEach((freq, idx) => {
            setTimeout(() => {
                this.playTone(freq, 0.35, 'triangle', 0.15);
            }, idx * 45);
        });
        setTimeout(() => {
            this.playTone(60, 0.5, 'triangle', 0.25, 20);
        }, 220);
    },

    startAmbientMusic() {
        if (this.bgmInterval) return;
        this.bgmInterval = setInterval(() => {
            if (getMuted()) return;
            // 随机弹拨五声音阶
            if (Math.random() < 0.6) {
                const note = this.pentatonic[Math.floor(Math.random() * this.pentatonic.length)];
                this.playTone(note, 0.6, 'sine', 0.04);
            }
        }, 1200);
    },

    stopAmbientMusic() {
        if (this.bgmInterval) {
            clearInterval(this.bgmInterval);
            this.bgmInterval = null;
        }
    }
};

/* ────────────────────────── 粒子与特效系统 ────────────────────────── */

class ParticleSystem {
    constructor() {
        this.particles = [];
        this.shockwaves = [];
        this.popups = [];
        this.screenShake = 0;
    }

    addSpark(x, y, vx, vy, color, size, life) {
        if (this.particles.length > 240) return;
        this.particles.push({
            x, y, vx, vy, color, size,
            maxLife: life,
            life: life
        });
    }

    addShockwave(x, y, color, maxRadius = 120, speed = 320) {
        this.shockwaves.push({
            x, y, color,
            radius: 5,
            maxRadius,
            speed,
            alpha: 1
        });
    }

    addPopup(text, x, y, color = '#ffffff') {
        this.popups.push({
            text, x, y, color,
            alpha: 1,
            scale: 0.7,
            life: 0.8
        });
    }

    burst(x, y, color1, color2, count = 28, speedMul = 1) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = (120 + Math.random() * 260) * speedMul;
            const col = Math.random() < 0.5 ? color1 : color2;
            this.addSpark(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                col,
                2 + Math.random() * 3,
                0.3 + Math.random() * 0.4
            );
        }
    }

    shake(intensity = 8) {
        this.screenShake = Math.max(this.screenShake, intensity);
    }

    update(dt) {
        // 震屏阻尼衰减
        if (this.screenShake > 0) {
            this.screenShake = Math.max(0, this.screenShake - dt * 25);
        }

        // 粒子更新
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vx *= 0.95;
            p.vy *= 0.95;
            p.life -= dt;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }

        // 冲击波更新
        for (let i = this.shockwaves.length - 1; i >= 0; i--) {
            const s = this.shockwaves[i];
            s.radius += s.speed * dt;
            s.alpha = Math.max(0, 1 - s.radius / s.maxRadius);
            if (s.radius >= s.maxRadius) {
                this.shockwaves.splice(i, 1);
            }
        }

        // 文字弹出特效更新
        for (let i = this.popups.length - 1; i >= 0; i--) {
            const pop = this.popups[i];
            pop.life -= dt;
            pop.y -= dt * 45;
            pop.scale = Math.min(1.2, pop.scale + dt * 2.5);
            pop.alpha = Math.max(0, pop.life / 0.8);
            if (pop.life <= 0) {
                this.popups.splice(i, 1);
            }
        }
    }

    draw(ctx) {
        // 绘制冲击波
        ctx.save();
        for (const s of this.shockwaves) {
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
            ctx.strokeStyle = s.color;
            ctx.globalAlpha = s.alpha * 0.85;
            ctx.lineWidth = 3;
            ctx.stroke();
        }
        ctx.restore();

        // 绘制火花粒子
        ctx.save();
        for (const p of this.particles) {
            const alpha = Math.max(0, p.life / p.maxLife);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // 绘制书法飘字
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const pop of this.popups) {
            ctx.save();
            ctx.translate(pop.x, pop.y);
            ctx.scale(pop.scale, pop.scale);
            ctx.globalAlpha = pop.alpha;
            ctx.font = 'bold 20px "Segoe UI", "PingFang SC", system-ui, sans-serif';
            ctx.shadowColor = pop.color;
            ctx.shadowBlur = 12;
            ctx.fillStyle = pop.color;
            ctx.fillText(pop.text, 0, 0);
            ctx.restore();
        }
        ctx.restore();
    }
}

/* ────────────────────────── 游戏主状态机 ────────────────────────── */

class GameEngine {
    constructor() {
        this.canvas = document.getElementById('na-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.fx = new ParticleSystem();

        this.dpr = window.devicePixelRatio || 1;
        this.scale = 1;
        this.setupCanvas();
        this._buildBackground();

        this.mode = 'levels'; // 'levels' | 'endless' | 'daily' | 'duel'
        this.currentLevel = 1;
        this.unlockedLevel = parseInt(storageGet(STORAGE_KEYS.UNLOCKED_LEVEL) || '1', 10);
        this.levelStars = JSON.parse(storageGet(STORAGE_KEYS.LEVEL_STARS) || '{}');
        this.endlessBest = parseInt(storageGet(STORAGE_KEYS.ENDLESS_BEST) || '0', 10);
        this.clashMax = parseInt(storageGet(STORAGE_KEYS.CLASH_MAX) || '0', 10);

        this.duelMode = 'ai'; // 'ai' | '2p'
        this.aiDifficulty = 'medium'; // 'easy' | 'medium' | 'hard'

        this.state = 'menu'; // 'menu' | 'playing' | 'paused' | 'over'
        this.score = 0;
        this.combo = 1;
        this.comboTimer = 0;
        this.totalClashes = 0;
        this.maxComboThisRun = 1;
        this.timeElapsed = 0;
        this.waveTimer = 0;
        this.waveIndex = 0;

        // 子弹时间 / 定格系统
        this.timeScale = 1.0;
        this.hitStop = 0;
        this.slowMoTimer = 0;

        // 玩家实体
        this.player = this.createPlayer(ARENA_WIDTH / 2, ARENA_HEIGHT * 0.72);
        // 对决模式 2P 或 AI 实体
        this.player2 = null;

        // 实体容器
        this.enemies = [];
        this.bullets = [];
        this.ricochets = []; // 碰撞反弹破风飞刺

        // 输入控制
        this.keys = {};
        this.pointer = { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT * 0.4, down: false };
        this.lastTouchTime = 0;
        this.aimTouchId = null;
        // 触屏虚拟摇杆状态（左半屏浮动出现，控制 P1 身法）
        this.joy = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0, x: 0, y: 0 };

        this.initDOM();
        this.initInput();
        this.bindEvents();
        this.updateSideRecords();
        this.applyLanguage(getLang());

        // 启动渲染循环
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    }

    setupCanvas() {
        this.canvas.width = ARENA_WIDTH * this.dpr;
        this.canvas.height = ARENA_HEIGHT * this.dpr;
        this.ctx.scale(this.dpr, this.dpr);
    }

    createPlayer(x, y, isP2 = false) {
        return {
            x, y,
            vx: 0, vy: 0,
            angle: isP2 ? Math.PI / 2 : -Math.PI / 2,
            targetAngle: isP2 ? Math.PI / 2 : -Math.PI / 2,
            radius: 15,
            tipDistance: 22,
            stance: isP2 ? 'awn' : 'needle', // P1默认为银针，P2默认为金芒
            isDashing: false,
            dashTimer: 0,
            dashDuration: 0.22,
            dashSpeed: 640,
            dashCooldown: 0,
            dashVector: { x: 0, y: 0 },
            lives: 3,
            maxLives: 3,
            ultCharge: 0, // 0 - 100
            invulnerable: 0,
            score: 0,
            isP2
        };
    }

    initDOM() {
        this.dom = {
            topbar: document.querySelector('.na-topbar'),
            stageLabel: document.getElementById('na-stage-label'),
            modeBadge: document.getElementById('na-mode-badge'),
            scoreVal: document.getElementById('na-score-val'),
            comboVal: document.getElementById('na-combo-val'),
            btnHome: document.getElementById('na-btn-home'),
            btnPause: document.getElementById('na-btn-pause'),
            btnSound: document.getElementById('na-btn-sound'),
            btnLang: document.getElementById('na-btn-lang'),
            toast: document.getElementById('na-toast'),

            // In-hud
            livesWrap: document.getElementById('na-lives-wrap'),
            stanceChip: document.getElementById('na-stance-chip'),
            stanceIcon: document.getElementById('na-stance-icon'),
            stanceText: document.getElementById('na-stance-text'),
            ultFill: document.getElementById('na-ult-bar-fill'),
            ultLabel: document.getElementById('na-ult-label'),
            touchControls: document.getElementById('na-touch-controls'),
            touchDash: document.getElementById('na-touch-dash'),
            touchStance: document.getElementById('na-touch-stance'),
            touchUlt: document.getElementById('na-touch-ult'),
            joy: document.getElementById('na-joy'),
            joyKnob: document.getElementById('na-joy-knob'),

            // Overlays
            overlayStart: document.getElementById('na-overlay-start'),
            overlayPause: document.getElementById('na-overlay-pause'),
            overlayResult: document.getElementById('na-overlay-result'),
            levelSelectWrap: document.getElementById('na-level-select-wrap'),
            levelGrid: document.getElementById('na-level-grid'),
            duelPanel: document.getElementById('na-duel-panel'),

            // Start Mode Buttons
            btnLevels: document.getElementById('na-btn-levels'),
            btnEndless: document.getElementById('na-btn-endless'),
            btnDaily: document.getElementById('na-btn-daily'),
            btnDuel: document.getElementById('na-btn-duel'),

            // Duel options
            duelTypeAi: document.getElementById('na-duel-type-ai'),
            duelType2P: document.getElementById('na-duel-type-2p'),
            aiDiffRow: document.getElementById('na-ai-diff-row'),
            btnStartDuel: document.getElementById('na-btn-start-duel'),

            // Pause actions
            btnResume: document.getElementById('na-btn-resume'),
            btnRestart: document.getElementById('na-btn-restart'),
            btnPauseHome: document.getElementById('na-btn-pause-home'),

            // Result
            resultTitle: document.getElementById('na-result-title'),
            resultStars: document.getElementById('na-result-stars'),
            resultSub: document.getElementById('na-result-sub'),
            statScoreVal: document.getElementById('na-stat-score-val'),
            statClashesVal: document.getElementById('na-stat-clashes-val'),
            statComboVal: document.getElementById('na-stat-combo-val'),
            statExtraVal: document.getElementById('na-stat-extra-val'),
            playerInput: document.getElementById('na-player-input'),
            btnNextStage: document.getElementById('na-btn-next-stage'),
            btnReplay: document.getElementById('na-btn-replay'),
            btnResultHome: document.getElementById('na-btn-result-home'),

            // Records
            recEndless: document.getElementById('na-side-rec-endless'),
            recClash: document.getElementById('na-side-rec-clash'),
            recStars: document.getElementById('na-side-rec-stars'),
            recDaily: document.getElementById('na-side-rec-daily')
        };
    }

    initInput() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            if (e.code === 'KeyQ' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
                this.toggleStance(this.player);
            }
            if (e.code === 'Space') {
                e.preventDefault();
                this.triggerDash(this.player);
            }
            if (e.code === 'KeyE') {
                this.triggerUltimate(this.player);
            }
            if (e.code === 'Escape' && this.state === 'playing') {
                this.togglePause();
            }

            // 2P 模式下 P2 键位 (方向键 + Enter 冲刺 + Numpad0/Slash 换态)
            if (this.mode === 'duel' && this.duelMode === '2p' && this.player2) {
                if (e.code === 'Enter') {
                    this.triggerDash(this.player2);
                }
                if (e.code === 'Slash' || e.code === 'Numpad0') {
                    this.toggleStance(this.player2);
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        // 鼠标瞄准与冲刺
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.pointer.x = (e.clientX - rect.left) * (ARENA_WIDTH / rect.width);
            this.pointer.y = (e.clientY - rect.top) * (ARENA_HEIGHT / rect.height);
        });

        this.canvas.addEventListener('mousedown', (e) => {
            if (this.state !== 'playing') return;
            if (e.button === 0) {
                this.triggerDash(this.player);
            } else if (e.button === 2) {
                e.preventDefault();
                this.toggleStance(this.player);
            }
        });

        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // 移动端触控：左半屏为浮动摇杆（身法），其余区域拖拽为瞄准
        const JOY_RADIUS = 56;

        const setPointerFromTouch = (touch, rect) => {
            this.pointer.x = (touch.clientX - rect.left) * (ARENA_WIDTH / rect.width);
            this.pointer.y = (touch.clientY - rect.top) * (ARENA_HEIGHT / rect.height);
        };

        const moveJoyKnob = () => {
            const kx = 50 + (this.joy.dx / JOY_RADIUS) * 38;
            const ky = 50 + (this.joy.dy / JOY_RADIUS) * 38;
            this.dom.joyKnob.style.left = `${kx}%`;
            this.dom.joyKnob.style.top = `${ky}%`;
        };

        const updateJoyVector = (touch) => {
            let dx = touch.clientX - this.joy.ox;
            let dy = touch.clientY - this.joy.oy;
            const dist = Math.hypot(dx, dy);
            if (dist > JOY_RADIUS) {
                dx = (dx / dist) * JOY_RADIUS;
                dy = (dy / dist) * JOY_RADIUS;
            }
            this.joy.dx = dx;
            this.joy.dy = dy;
            this.joy.x = dx / JOY_RADIUS;
            this.joy.y = dy / JOY_RADIUS;
            moveJoyKnob();
        };

        this.canvas.addEventListener('touchstart', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const stageRect = this.dom.joy.parentElement.getBoundingClientRect();
            for (const touch of e.changedTouches) {
                const isLeftZone = !this.joy.active && (touch.clientX - rect.left) < rect.width * 0.45;
                if (isLeftZone) {
                    // 启动摇杆
                    this.joy.active = true;
                    this.joy.id = touch.identifier;
                    this.joy.ox = touch.clientX;
                    this.joy.oy = touch.clientY;
                    this.joy.dx = 0;
                    this.joy.dy = 0;
                    this.joy.x = 0;
                    this.joy.y = 0;
                    this.dom.joy.style.left = `${touch.clientX - stageRect.left}px`;
                    this.dom.joy.style.top = `${touch.clientY - stageRect.top}px`;
                    this.dom.joy.classList.remove('hidden');
                    moveJoyKnob();
                } else {
                    this.aimTouchId = touch.identifier;
                    setPointerFromTouch(touch, rect);
                    const now = performance.now();
                    if (now - this.lastTouchTime < 300) {
                        // 双击释放大招
                        this.triggerUltimate(this.player);
                    }
                    this.lastTouchTime = now;
                }
            }
        }, { passive: true });

        this.canvas.addEventListener('touchmove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            for (const touch of e.changedTouches) {
                if (this.joy.active && touch.identifier === this.joy.id) {
                    updateJoyVector(touch);
                } else if (touch.identifier === this.aimTouchId) {
                    setPointerFromTouch(touch, rect);
                }
            }
        }, { passive: true });

        const endCanvasTouch = (e) => {
            for (const touch of e.changedTouches) {
                if (this.joy.active && touch.identifier === this.joy.id) {
                    this.joy.active = false;
                    this.joy.id = null;
                    this.joy.x = 0;
                    this.joy.y = 0;
                    this.dom.joy.classList.add('hidden');
                } else if (touch.identifier === this.aimTouchId) {
                    this.aimTouchId = null;
                }
            }
        };
        this.canvas.addEventListener('touchend', endCanvasTouch);
        this.canvas.addEventListener('touchcancel', endCanvasTouch);

        // 触控按钮绑定
        this.dom.touchDash.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.triggerDash(this.player);
        });
        this.dom.touchDash.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.triggerDash(this.player);
        });

        this.dom.touchStance.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.toggleStance(this.player);
        });
        this.dom.touchStance.addEventListener('click', () => {
            this.toggleStance(this.player);
        });

        this.dom.touchUlt.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.triggerUltimate(this.player);
        });
        this.dom.touchUlt.addEventListener('click', () => {
            this.triggerUltimate(this.player);
        });

        this.dom.stanceChip.addEventListener('click', () => {
            this.toggleStance(this.player);
        });
    }

    bindEvents() {
        // 模式切换
        this.dom.btnLevels.addEventListener('click', () => {
            this.mode = 'levels';
            this.dom.duelPanel.classList.add('hidden');
            this.dom.levelSelectWrap.classList.toggle('hidden');
            this.renderLevelGrid();
        });

        this.dom.btnEndless.addEventListener('click', () => {
            this.startEndlessMode();
        });

        this.dom.btnDaily.addEventListener('click', () => {
            this.startDailyMode();
        });

        this.dom.btnDuel.addEventListener('click', () => {
            this.mode = 'duel';
            this.dom.levelSelectWrap.classList.add('hidden');
            this.dom.duelPanel.classList.toggle('hidden');
        });

        // 1v1 对决参数
        this.dom.duelTypeAi.addEventListener('click', () => {
            this.duelMode = 'ai';
            this.dom.duelTypeAi.classList.add('active');
            this.dom.duelType2P.classList.remove('active');
            this.dom.aiDiffRow.style.display = 'flex';
        });

        this.dom.duelType2P.addEventListener('click', () => {
            this.duelMode = '2p';
            this.dom.duelType2P.classList.add('active');
            this.dom.duelTypeAi.classList.remove('active');
            this.dom.aiDiffRow.style.display = 'none';
            // 2P 全程依赖键盘，触屏设备给出提示
            if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
                const t = I18N[getLang()] || I18N.zh;
                this.showToast(t.duel2pTouchWarn, 3200);
            }
        });

        ['easy', 'medium', 'hard'].forEach(diff => {
            const btn = document.getElementById(`na-diff-${diff}`);
            if (btn) {
                btn.addEventListener('click', () => {
                    this.aiDifficulty = diff;
                    document.querySelectorAll('.na-diff-options .na-diff-btn').forEach(b => {
                        if (b.dataset.diff) b.classList.toggle('active', b.dataset.diff === diff);
                    });
                });
            }
        });

        this.dom.btnStartDuel.addEventListener('click', () => {
            this.startDuelMode();
        });

        // 暂停 / 恢复
        this.dom.btnPause.addEventListener('click', () => this.togglePause());
        this.dom.btnResume.addEventListener('click', () => this.togglePause());
        this.dom.btnRestart.addEventListener('click', () => this.restartCurrentMode());
        this.dom.btnPauseHome.addEventListener('click', () => this.showMenu());

        // 结算
        this.dom.btnNextStage.addEventListener('click', () => {
            if (this.currentLevel < 10) {
                this.startLevel(this.currentLevel + 1);
            } else {
                this.showMenu();
            }
        });
        this.dom.btnReplay.addEventListener('click', () => this.restartCurrentMode());
        this.dom.btnResultHome.addEventListener('click', () => this.showMenu());

        // 顶栏声音与语言
        const updateSoundIcons = () => {
            const isMuted = getMuted();
            const svg = isMuted ? ICONS.soundOff : ICONS.soundOn;
            this.dom.btnSound.innerHTML = svg;
            const startSound = document.getElementById('na-start-sound');
            if (startSound) startSound.innerHTML = svg;
        };

        this.dom.btnSound.addEventListener('click', () => {
            setMuted(!getMuted());
            updateSoundIcons();
        });

        const startSound = document.getElementById('na-start-sound');
        if (startSound) {
            startSound.addEventListener('click', () => {
                setMuted(!getMuted());
                updateSoundIcons();
            });
        }

        this.dom.btnLang.addEventListener('click', () => {
            const nextLang = getLang() === 'zh' ? 'en' : 'zh';
            setLang(nextLang);
            this.applyLanguage(nextLang);
        });

        // 玩家名称输入
        this.dom.playerInput.value = ensurePlayerName();
        this.dom.playerInput.addEventListener('change', (e) => {
            setPlayerName(e.target.value.trim() || 'Anonymous');
        });

        // 监听页面可见性
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.state === 'playing') {
                this.togglePause();
            }
        });

        // 监听全局设置变动
        window.addEventListener('site-settings:changed', () => {
            updateSoundIcons();
            this.applyLanguage(getLang());
        });

        updateSoundIcons();
    }

    applyLanguage(lang) {
        const t = I18N[lang] || I18N.zh;
        document.documentElement.lang = lang;
        document.title = lang === 'zh' ? '针尖对麦芒 — Pinpoint Clash' : 'Pinpoint Clash — Needle vs Awn';

        // 页脚操作提示（契约里 hint 不归 chrome，由各页自己的 applyLanguage 写）
        const naHint = document.getElementById('na-hint');
        if (naHint) naHint.textContent = t.hint;

        document.getElementById('na-main-title').textContent = t.gameTitle;
        document.getElementById('na-main-sub').textContent = t.gameSub;
        document.getElementById('na-howto-box').innerHTML = t.howTo;

        document.getElementById('na-lbl-mode-levels').textContent = t.trials;
        document.getElementById('na-sub-mode-levels').textContent = t.trialsSub;
        document.getElementById('na-lbl-mode-endless').textContent = t.endless;
        document.getElementById('na-sub-mode-endless').textContent = t.endlessSub;
        document.getElementById('na-lbl-mode-daily').textContent = t.daily;
        document.getElementById('na-sub-mode-daily').textContent = t.dailySub;
        document.getElementById('na-lbl-mode-duel').textContent = t.duel;
        document.getElementById('na-sub-mode-duel').textContent = t.duelSub;

        document.getElementById('na-level-title').textContent = t.selectLevel;
        document.getElementById('na-duel-mode-lbl').textContent = t.duelModeLbl;
        document.getElementById('na-duel-type-ai').textContent = t.duelTypeAi;
        document.getElementById('na-duel-type-2p').textContent = t.duelType2P;
        document.getElementById('na-ai-diff-lbl').textContent = t.aiDiffLbl;
        document.getElementById('na-diff-easy').textContent = t.diffEasy;
        document.getElementById('na-diff-medium').textContent = t.diffMedium;
        document.getElementById('na-diff-hard').textContent = t.diffHard;
        document.getElementById('na-btn-start-duel').textContent = t.startDuel;

        document.getElementById('na-pause-title').textContent = t.pauseTitle;
        document.getElementById('na-pause-sub').textContent = t.pauseSub;
        document.getElementById('na-btn-resume').textContent = t.resume;
        document.getElementById('na-btn-restart').textContent = t.restart;
        document.getElementById('na-btn-pause-home').innerHTML = `${ICONS.home}<span>${t.home}</span>`;

        document.getElementById('na-stat-score-lbl').textContent = t.scoreLbl;
        document.getElementById('na-stat-clashes-lbl').textContent = t.clashesLbl;
        document.getElementById('na-stat-combo-lbl').textContent = t.comboLbl;
        document.getElementById('na-stat-extra-lbl').textContent = t.extraLbl;
        document.getElementById('na-btn-next-stage').textContent = t.nextStage;
        document.getElementById('na-btn-replay').textContent = t.replay;
        document.getElementById('na-btn-result-home').innerHTML = `${ICONS.home}<span>${t.home}</span>`;

        document.getElementById('na-side-rules-title').textContent = t.sideRulesTitle;
        document.getElementById('na-side-rules-text').innerHTML = t.sideRulesText;
        document.getElementById('na-side-records-title').textContent = t.sideRecordsTitle;
        document.getElementById('na-side-rec-endless-lbl').textContent = t.sideEndlessLbl;
        document.getElementById('na-side-rec-clash-lbl').textContent = t.sideClashLbl;
        document.getElementById('na-side-rec-stars-lbl').textContent = t.sideStarsLbl;
        document.getElementById('na-side-rec-daily-lbl').textContent = t.sideDailyLbl;
        document.getElementById('na-side-controls-title').textContent = t.sideControlsTitle;

        document.getElementById('na-sc-aim').textContent = t.scAim;
        const scAimKeyEl = document.getElementById('na-sc-aim-key');
        if (scAimKeyEl) scAimKeyEl.textContent = t.scAimKey;
        document.getElementById('na-sc-dash').textContent = t.scDash;
        const scDashKeyEl = document.getElementById('na-sc-dash-key');
        if (scDashKeyEl) scDashKeyEl.textContent = t.scDashKey;
        document.getElementById('na-sc-stance').textContent = t.scStance;
        const scStanceKeyEl = document.getElementById('na-sc-stance-key');
        if (scStanceKeyEl) scStanceKeyEl.textContent = t.scStanceKey;
        document.getElementById('na-sc-ult').textContent = t.scUlt;
        const scUltKeyEl = document.getElementById('na-sc-ult-key');
        if (scUltKeyEl) scUltKeyEl.textContent = t.scUltKey;
        document.getElementById('na-sc-move').textContent = t.scMove;
        const scMoveKeyEl = document.getElementById('na-sc-move-key');
        if (scMoveKeyEl) scMoveKeyEl.textContent = t.scMoveKey;

        document.getElementById('na-touch-dash-lbl').textContent = t.touchDash;
        document.getElementById('na-touch-stance-lbl').textContent = t.touchStance;
        document.getElementById('na-touch-ult-lbl').textContent = t.touchUlt;
        this.dom.btnLang.textContent = lang === 'zh' ? 'English' : '中文';

        // 内部 HUD 姿态与极意标签
        const isNeedle = !this.player || this.player.stance === 'needle';
        this.dom.stanceText.textContent = isNeedle ? t.stanceNeedle : t.stanceAwn;
        this.dom.stanceIcon.textContent = isNeedle ? '⚡' : '🌾';
        if (this.dom.ultLabel) this.dom.ultLabel.textContent = t.ultLabel;

        // 玩家名称输入占位符
        if (this.dom.playerInput) this.dom.playerInput.placeholder = t.namePlaceholder;

        this.updateHUDLabels();
        this.updateSideRecords();
        updateMoreGames(lang);
    }

    updateHUDLabels() {
        const t = I18N[getLang()] || I18N.zh;
        if (this.state === 'menu') {
            this.dom.stageLabel.textContent = t.gameTitle;
            this.dom.modeBadge.textContent = t.modeBadgeMenu;
            return;
        }
        if (this.mode === 'levels') {
            const lvlName = (t.levelNames && t.levelNames[this.currentLevel - 1]) || this.currentLevel;
            this.dom.stageLabel.textContent = `${t.trials} · ${lvlName}`;
            this.dom.modeBadge.textContent = (t.badgeStage || 'Stage {n}/10').replace('{n}', this.currentLevel);
        } else if (this.mode === 'endless') {
            this.dom.stageLabel.textContent = t.endless;
            this.dom.modeBadge.textContent = (t.badgeWave || 'Wave {n}').replace('{n}', this.waveIndex + 1);
        } else if (this.mode === 'daily') {
            this.dom.stageLabel.textContent = t.daily;
            this.dom.modeBadge.textContent = t.badgeDaily || 'Daily Run';
        } else if (this.mode === 'duel') {
            this.dom.stageLabel.textContent = t.duel;
            this.dom.modeBadge.textContent = this.duelMode === 'ai' ? 'vs AI' : '1v1 2P';
        }
    }

    renderLevelGrid() {
        this.dom.levelGrid.innerHTML = '';
        for (let i = 1; i <= 10; i++) {
            const chip = document.createElement('div');
            const isUnlocked = i <= this.unlockedLevel;
            chip.className = `na-level-chip ${isUnlocked ? 'unlocked' : 'locked'}`;
            const stars = this.levelStars[i] || 0;
            const starText = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);

            chip.innerHTML = `
                <span>${i}</span>
                <span class="na-level-stars">${isUnlocked ? starText : '🔒'}</span>
            `;

            if (isUnlocked) {
                chip.addEventListener('click', () => {
                    this.startLevel(i);
                });
            }
            this.dom.levelGrid.appendChild(chip);
        }
    }

    showToast(msg) {
        this.dom.toast.textContent = msg;
        this.dom.toast.classList.remove('hidden');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => {
            this.dom.toast.classList.add('hidden');
        }, 1400);
    }

    updateSideRecords() {
        this.dom.recEndless.textContent = this.endlessBest.toLocaleString();
        this.dom.recClash.textContent = this.clashMax.toLocaleString();

        let totalStars = 0;
        for (let i = 1; i <= 10; i++) {
            totalStars += (this.levelStars[i] || 0);
        }
        this.dom.recStars.textContent = `${totalStars} / 30`;

        const todayKey = this.getTodayDateString();
        const dailyRecord = storageGet(`${STORAGE_KEYS.DAILY_PREFIX}${todayKey}`);
        const t = I18N[getLang()] || I18N.zh;
        this.dom.recDaily.textContent = dailyRecord ? t.dailyDone : t.dailyNotDone;
    }

    getTodayDateString() {
        const now = new Date();
        // 采用 UTC+8 确定每日种子与键值
        const utc8 = new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000);
        const y = utc8.getFullYear();
        const m = String(utc8.getMonth() + 1).padStart(2, '0');
        const d = String(utc8.getDate()).padStart(2, '0');
        return `${y}${m}${d}`;
    }

    /* ────────────────────────── 游戏流程启动 ────────────────────────── */

    showMenu() {
        this.state = 'menu';
        this.dom.overlayStart.classList.remove('hidden');
        this.dom.overlayPause.classList.add('hidden');
        this.dom.overlayResult.classList.add('hidden');
        this.renderLevelGrid();
        this.updateHUDLabels();
        this.updateSideRecords();
        SoundEngine.stopAmbientMusic();
    }

    startLevel(levelNum) {
        this.mode = 'levels';
        this.currentLevel = levelNum;
        this.resetGameState();
        this.loadStageWave(levelNum);
        this.resumeBattle();
        if (window.hubTrack) window.hubTrack('needle-awn', 'play');
    }

    startEndlessMode() {
        this.mode = 'endless';
        this.resetGameState();
        this.resumeBattle();
        if (window.hubTrack) window.hubTrack('needle-awn', 'play');
    }

    startDailyMode() {
        this.mode = 'daily';
        this.resetGameState();
        this.resumeBattle();
        if (window.hubTrack) window.hubTrack('needle-awn', 'play');
    }

    startDuelMode() {
        this.mode = 'duel';
        this.resetGameState();
        this.player2 = this.createPlayer(ARENA_WIDTH / 2, ARENA_HEIGHT * 0.28, true);
        this.player2.stance = 'awn';
        this.resumeBattle();
        if (window.hubTrack) window.hubTrack('needle-awn', 'play');
    }

    restartCurrentMode() {
        if (this.mode === 'levels') this.startLevel(this.currentLevel);
        else if (this.mode === 'endless') this.startEndlessMode();
        else if (this.mode === 'daily') this.startDailyMode();
        else if (this.mode === 'duel') this.startDuelMode();
    }

    resetGameState() {
        this.score = 0;
        this.combo = 1;
        this.comboTimer = 0;
        this.totalClashes = 0;
        this.maxComboThisRun = 1;
        this.timeElapsed = 0;
        this.waveTimer = 0;
        this.waveIndex = 0;
        this.enemies = [];
        this.bullets = [];
        this.ricochets = [];
        this.player = this.createPlayer(ARENA_WIDTH / 2, ARENA_HEIGHT * 0.72);
        this.player2 = null;

        const t = I18N[getLang()] || I18N.zh;
        this.dom.stanceChip.className = 'na-stance-chip needle';
        this.dom.stanceIcon.textContent = '⚡';
        this.dom.stanceText.textContent = t.stanceNeedle;
        if (this.dom.ultLabel) this.dom.ultLabel.textContent = t.ultLabel;

        this.updateHUD();
        this.updateHUDLabels();
    }

    resumeBattle() {
        this.state = 'playing';
        this.dom.overlayStart.classList.add('hidden');
        this.dom.overlayPause.classList.add('hidden');
        this.dom.overlayResult.classList.add('hidden');
        SoundEngine.startAmbientMusic();
    }

    togglePause() {
        if (this.state === 'playing') {
            this.state = 'paused';
            this.dom.overlayPause.classList.remove('hidden');
            this.dom.btnPause.innerHTML = ICONS.play;
        } else if (this.state === 'paused') {
            this.state = 'playing';
            this.dom.overlayPause.classList.add('hidden');
            this.dom.btnPause.innerHTML = ICONS.pause;
        }
    }

    /**
     * 静默暂停 / 恢复 —— 给底部统计抽屉用。
     *
     * ⚠️ 本页的 rAF 循环是**自续**的（每帧末尾无条件再排一帧），不像 pm/hs 那样
     * 靠 `stopLoop()` 掐断。好在 `loop()` 内部已经用 `state === 'playing'` 门禁
     * 包住了所有 update，所以只改状态就能让模拟真正停住 —— 不需要也无法用
     * cancelAnimationFrame（循环没有保存 id）。这里刻意不进暂停遮罩。
     */
    pauseQuiet() {
        if (this.state !== 'playing') return;
        this.state = 'paused';
        // 按钮图标要跟着切（暂停中显示"播放"），否则关掉抽屉后图标与状态不符
        if (this.dom.btnPause) this.dom.btnPause.innerHTML = ICONS.play;
    }

    resumeQuiet() {
        if (this.state !== 'paused') return;
        this.state = 'playing';
        this.lastTime = performance.now();   // 丢掉暂停期间的时间跳跃，避免恢复瞬间 dt 爆炸
        if (this.dom.btnPause) this.dom.btnPause.innerHTML = ICONS.pause;
    }

    /** 抽屉判据 */
    isRunning() {
        return this.state === 'playing';
    }

    /* ────────────────────────── 核心交互与操作 ────────────────────────── */

    toggleStance(entity) {
        if (!entity || this.state !== 'playing') return;
        entity.stance = entity.stance === 'needle' ? 'awn' : 'needle';
        SoundEngine.stanceSwitch();
        this.fx.burst(entity.x, entity.y, entity.stance === 'needle' ? '#38bdf8' : '#f59e0b', '#ffffff', 14);

        if (!entity.isP2) {
            const t = I18N[getLang()] || I18N.zh;
            const isNeedle = entity.stance === 'needle';
            this.dom.stanceChip.className = `na-stance-chip ${isNeedle ? 'needle' : 'awn'}`;
            this.dom.stanceIcon.textContent = isNeedle ? '⚡' : '🌾';
            this.dom.stanceText.textContent = isNeedle ? t.stanceNeedle : t.stanceAwn;
        }
    }

    triggerDash(entity) {
        if (!entity || entity.dashCooldown > 0 || this.state !== 'playing') return;

        entity.isDashing = true;
        entity.dashTimer = entity.dashDuration;
        entity.dashCooldown = 0.38;

        // 计算冲刺向量
        const angle = entity.angle;
        entity.dashVector = {
            x: Math.cos(angle) * entity.dashSpeed,
            y: Math.sin(angle) * entity.dashSpeed
        };

        SoundEngine.dashWhoosh();
        const col = entity.stance === 'needle' ? '#38bdf8' : '#f59e0b';
        this.fx.addShockwave(entity.x, entity.y, col, 60, 280);
    }

    triggerUltimate(entity) {
        if (!entity || entity.ultCharge < 100 || this.state !== 'playing') return;
        entity.ultCharge = 0;
        this.updateHUD();

        SoundEngine.awaken();
        this.fx.shake(14);
        const t = I18N[getLang()] || I18N.zh;
        this.showToast(t.toastUlt);
        this.fx.addPopup(t.toastUlt, entity.x, entity.y - 30, '#fef08a');

        // 全屏万芒破阵：环射 16 根追踪极意飞芒
        const count = 16;
        for (let i = 0; i < count; i++) {
            const ang = (Math.PI * 2 / count) * i;
            this.ricochets.push({
                x: entity.x,
                y: entity.y,
                vx: Math.cos(ang) * 580,
                vy: Math.sin(ang) * 580,
                color: i % 2 === 0 ? '#38bdf8' : '#fbbf24',
                radius: 6,
                damage: 60,
                life: 1.8,
                homing: true
            });
        }
        this.fx.addShockwave(entity.x, entity.y, '#fef08a', 240, 500);

        // 清除周围敌方所有子弹
        this.bullets = [];
    }

    /* ────────────────────────── 核心机制：针尖对麦芒碰撞判定 ────────────────────────── */

    checkTipClash(p, enemy) {
        // 计算两个实体的尖端全局坐标
        const pTipX = p.x + Math.cos(p.angle) * p.tipDistance;
        const pTipY = p.y + Math.sin(p.angle) * p.tipDistance;

        const eTipX = enemy.x + Math.cos(enemy.angle) * enemy.tipDistance;
        const eTipY = enemy.y + Math.sin(enemy.angle) * enemy.tipDistance;

        const dx = pTipX - eTipX;
        const dy = pTipY - eTipY;
        const dist = Math.hypot(dx, dy);

        // 尖端判定半径之和 (宽容判定，保证极致爽感与微秒级响应)
        const clashRadius = 26;

        if (dist <= clashRadius) {
            // 向量夹角检测：必须迎面相对 (Dot product < -0.25)
            const pAim = { x: Math.cos(p.angle), y: Math.sin(p.angle) };
            const eAim = { x: Math.cos(enemy.angle), y: Math.sin(enemy.angle) };
            const dot = pAim.x * eAim.x + pAim.y * eAim.y;

            if (dot < -0.25) {
                // 触发【针尖对麦芒】极致对撞！
                this.handleSuccessfulClash(p, enemy, (pTipX + eTipX) / 2, (pTipY + eTipY) / 2);
                return true;
            }
        }
        return false;
    }

    handleSuccessfulClash(p, enemy, clashX, clashY) {
        this.totalClashes++;
        if (this.totalClashes > this.clashMax) {
            this.clashMax = this.totalClashes;
            storageSet(STORAGE_KEYS.CLASH_MAX, this.clashMax);
        }

        // 连招累加
        this.combo++;
        this.comboTimer = 3.2; // 3.2秒连击窗口
        if (this.combo > this.maxComboThisRun) {
            this.maxComboThisRun = this.combo;
        }

        // 基础得分 × 连招倍率
        const isOppositeStance = (p.stance === 'needle' && enemy.stance === 'awn') ||
                                 (p.stance === 'awn' && enemy.stance === 'needle');
        const stanceMultiplier = isOppositeStance ? 2.0 : 1.2;
        const addScore = Math.floor(100 * this.combo * stanceMultiplier);
        this.score += addScore;
        p.score += addScore;

        // 充能与冲刺重置（神技：弹反成功立即刷新突刺，可连续无限连冲！）
        p.dashCooldown = 0;
        p.isDashing = false;
        p.ultCharge = Math.min(100, p.ultCharge + 16);

        // 顿挫定格与震屏
        this.hitStop = 0.055;
        this.fx.shake(12);

        // 视听音效
        if (p.stance === 'needle') {
            SoundEngine.clashPing();
            // 银针特性：触发子弹时间 0.85s（游戏时钟计时），放慢世界
            this.timeScale = 0.35;
            this.slowMoTimer = 0.85;
        } else {
            SoundEngine.awnBurst();
            // 金芒特性：金芒天爆，轰击周围小怪与弹幕
            this.fx.addShockwave(clashX, clashY, '#fbbf24', 160, 420);
            this.clearBulletsNear(clashX, clashY, 130);
        }

        const t = I18N[getLang()] || I18N.zh;
        const popupText = isOppositeStance ? t.toastClash : (p.stance === 'needle' ? t.toastZen : t.toastNova);
        this.fx.addPopup(popupText, clashX, clashY - 25, isOppositeStance ? '#fef08a' : (p.stance === 'needle' ? '#38bdf8' : '#f59e0b'));

        // 碰撞特效粒子喷射 (垂直于冲刺方向喷涌激射)
        this.fx.burst(clashX, clashY, '#ffffff', p.stance === 'needle' ? '#38bdf8' : '#fbbf24', 35, 1.4);
        this.fx.addShockwave(clashX, clashY, '#ffffff', 90, 360);

        // 碎芒反弹飞刺 (生成 4-6 枚高能追踪飞刺消灭杂兵)
        const ricochetCount = 5;
        for (let i = 0; i < ricochetCount; i++) {
            const spread = (Math.PI * 2 / ricochetCount) * i + Math.random() * 0.4;
            this.ricochets.push({
                x: clashX,
                y: clashY,
                vx: Math.cos(spread) * 460,
                vy: Math.sin(spread) * 460,
                color: p.stance === 'needle' ? '#38bdf8' : '#fbbf24',
                radius: 4,
                damage: 40,
                life: 1.4,
                homing: true
            });
        }

        // 受到碰撞的敌人扣血或湮灭
        if (enemy.isBoss) {
            enemy.hp -= 45 * stanceMultiplier;
            enemy.stunTimer = 0.6;
            if (enemy.hp <= 0) {
                this.destroyEnemy(enemy);
            }
        } else {
            this.destroyEnemy(enemy);
        }

        this.updateHUD();
    }

    clearBulletsNear(x, y, radius) {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            if (Math.hypot(b.x - x, b.y - y) <= radius) {
                this.fx.burst(b.x, b.y, '#fbbf24', '#ffffff', 5);
                this.bullets.splice(i, 1);
            }
        }
    }

    destroyEnemy(enemy) {
        const idx = this.enemies.indexOf(enemy);
        if (idx !== -1) {
            this.fx.burst(enemy.x, enemy.y, enemy.stance === 'needle' ? '#38bdf8' : '#f59e0b', '#ffffff', 25);
            this.enemies.splice(idx, 1);
        }
    }

    handlePlayerHit(p) {
        if (p.invulnerable > 0) return;

        p.lives--;
        p.invulnerable = 1.8;
        this.combo = 1;
        this.fx.shake(10);
        SoundEngine.hurt();

        this.updateHUD();

        if (p.lives <= 0) {
            this.handleGameOver(false);
        }
    }

    handleGameOver(victory = false) {
        this.state = 'over';
        SoundEngine.stopAmbientMusic();

        const t = I18N[getLang()] || I18N.zh;
        this.dom.resultTitle.className = `na-card-title ${victory ? 'victory' : 'defeat'}`;

        if (this.mode === 'duel') {
            const winnerText = this.player.score >= this.player2.score
                ? (this.duelMode === 'ai' ? t.victoryTitle : t.duelP1Win)
                : (this.duelMode === 'ai' ? t.duelAiWin : t.duelP2Win);
            this.dom.resultTitle.textContent = winnerText;
            this.dom.resultStars.textContent = t.duelFinale;
            if (this.dom.resultSub) this.dom.resultSub.textContent = t.duelSubResult;
        } else {
            this.dom.resultTitle.textContent = victory ? t.victoryTitle : t.defeatTitle;
            if (this.dom.resultSub) this.dom.resultSub.textContent = victory ? t.victorySub : t.defeatSub;

            // 星级计算
            let stars = 0;
            if (victory) {
                stars = 1;
                if (this.totalClashes >= 5) stars++;
                if (this.player.lives === this.player.maxLives) stars++;
                this.dom.resultStars.textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);

                // 解锁下一关
                if (this.mode === 'levels') {
                    if (this.currentLevel === this.unlockedLevel && this.unlockedLevel < 10) {
                        this.unlockedLevel++;
                        storageSet(STORAGE_KEYS.UNLOCKED_LEVEL, this.unlockedLevel);
                    }
                    const prevStars = this.levelStars[this.currentLevel] || 0;
                    if (stars > prevStars) {
                        this.levelStars[this.currentLevel] = stars;
                        storageSet(STORAGE_KEYS.LEVEL_STARS, JSON.stringify(this.levelStars));
                    }
                }
            } else {
                this.dom.resultStars.textContent = '☆☆☆';
            }
        }

        // 填充面板统计
        this.dom.statScoreVal.textContent = this.score.toLocaleString();
        this.dom.statClashesVal.textContent = this.totalClashes.toLocaleString();
        this.dom.statComboVal.textContent = `×${this.maxComboThisRun}`;
        this.dom.statExtraVal.textContent = `${Math.floor(this.timeElapsed)}s`;

        // 按钮显示逻辑
        this.dom.btnNextStage.style.display = (this.mode === 'levels' && victory && this.currentLevel < 10) ? 'block' : 'none';

        // 成绩提交与持久化
        this.submitScore();
        this.updateSideRecords();
        this.dom.overlayResult.classList.remove('hidden');

        if (window.hubTrack) window.hubTrack('needle-awn', 'finish');
    }

    async submitScore() {
        if (this.score <= 0) return;

        // 无尽模式记录更新
        if (this.mode === 'endless' && this.score > this.endlessBest) {
            this.endlessBest = this.score;
            storageSet(STORAGE_KEYS.ENDLESS_BEST, this.endlessBest);
        }

        // 每日挑战记录保存
        if (this.mode === 'daily') {
            const today = this.getTodayDateString();
            storageSet(`${STORAGE_KEYS.DAILY_PREFIX}${today}`, String(this.score));
        }

        // 尝试向共享排行榜 Worker 提交分数 (网络可用时)
        const name = getPlayerName() || ensurePlayerName();
        const gameKey = this.mode === 'daily' ? `needle-awn-d${this.getTodayDateString()}` : 'needle-awn';

        try {
            await fetch(`${LEADERBOARD_URL}/scores`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    game: gameKey,
                    name: name,
                    score: this.score
                })
            });
        } catch (e) {
            // 离线环境静默降级，但要让玩家知道未进金榜
            const t = I18N[getLang()] || I18N.zh;
            this.showToast(t.lbSubmitFail || '金榜上传失败', 2600);
        }
    }

    updateHUD() {
        this.dom.scoreVal.textContent = this.score.toLocaleString();
        this.dom.comboVal.textContent = `×${this.combo}`;
        this.dom.comboVal.style.color = this.combo > 5 ? '#fef08a' : (this.combo > 2 ? '#f59e0b' : '#94a3b8');

        // 血量展示
        for (let i = 1; i <= 3; i++) {
            const el = document.getElementById(`na-heart-${i}`);
            if (el) {
                el.className = `na-heart ${i <= this.player.lives ? '' : 'lost'}`;
            }
        }

        // 极意槽
        this.dom.ultFill.style.width = `${this.player.ultCharge}%`;
        const isReady = this.player.ultCharge >= 100;
        this.dom.ultFill.classList.toggle('ready', isReady);
        this.dom.touchUlt.classList.toggle('active', isReady);
    }

    /* ────────────────────────── 关卡生成与怪物编排 ────────────────────────── */

    loadStageWave(level) {
        this.enemies = [];
        this.bullets = [];

        // 10 关特色配置
        switch (level) {
            case 1: // 初试锋芒：3 只单飞针，极度适合练习正面对冲
                this.spawnEnemy('needle', 240, 60, Math.PI / 2, 140);
                break;
            case 2: // 飞针入微：双飞针夹击
                this.spawnEnemy('needle', 120, 50, Math.PI * 0.45, 170);
                this.spawnEnemy('needle', 360, 50, Math.PI * 0.55, 170);
                break;
            case 3: // 芒刺在背：金芒盘旋旋转，大范围扫射
                this.spawnEnemy('awn', 160, 80, Math.PI * 0.5, 130);
                this.spawnEnemy('awn', 320, 80, Math.PI * 0.5, 130);
                break;
            case 4: // 阴阳交错：针与芒协同出击，考验换姿态
                this.spawnEnemy('needle', 100, 60, Math.PI * 0.48, 160);
                this.spawnEnemy('awn', 380, 60, Math.PI * 0.52, 140);
                this.spawnEnemy('needle', 240, 40, Math.PI * 0.5, 180);
                break;
            case 5: // 灵虚针尊 (Boss 1)
                this.spawnBoss('needle_sovereign', 240, 90);
                break;
            case 6: // 暴雨梨花：弹幕反弹雨
                this.spawnEnemy('needle', 140, 60, Math.PI * 0.5, 180);
                this.spawnEnemy('needle', 240, 40, Math.PI * 0.5, 190);
                this.spawnEnemy('needle', 340, 60, Math.PI * 0.5, 180);
                break;
            case 7: // 麦浪连天：高密度金芒轮舞
                this.spawnEnemy('awn', 100, 60, Math.PI * 0.45, 150);
                this.spawnEnemy('awn', 200, 40, Math.PI * 0.5, 160);
                this.spawnEnemy('awn', 300, 40, Math.PI * 0.5, 160);
                this.spawnEnemy('awn', 400, 60, Math.PI * 0.55, 150);
                break;
            case 8: // 扶摇麦皇 (Boss 2)
                this.spawnBoss('awn_emperor', 240, 90);
                break;
            case 9: // 绝命千本：高烈度快攻试炼
                this.spawnEnemy('needle', 80, 50, Math.PI * 0.45, 220);
                this.spawnEnemy('needle', 400, 50, Math.PI * 0.55, 220);
                this.spawnEnemy('awn', 240, 40, Math.PI * 0.5, 180);
                break;
            case 10: // 终极对决：双圣合璧 (Grandmaster Boss)
                this.spawnBoss('grandmaster', 240, 90);
                break;
        }
    }

    spawnEnemy(type, x, y, angle, speed) {
        this.enemies.push({
            type,
            stance: type,
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            angle,
            speed,
            radius: 14,
            tipDistance: 20,
            hp: 1,
            maxHp: 1,
            isBoss: false,
            shootCooldown: 1.2 + Math.random() * 0.8
        });
    }

    spawnBoss(bossType, x, y) {
        let hp = 300;
        let radius = 28;
        let tipDist = 34;
        let stance = 'needle';

        if (bossType === 'awn_emperor') {
            hp = 420;
            stance = 'awn';
        } else if (bossType === 'grandmaster') {
            hp = 550;
            stance = 'needle';
        }

        this.enemies.push({
            bossType,
            type: bossType,
            stance,
            x, y,
            vx: 60,
            vy: 0,
            angle: Math.PI / 2,
            radius,
            tipDistance: tipDist,
            hp,
            maxHp: hp,
            isBoss: true,
            stunTimer: 0,
            phaseTimer: 0,
            shootCooldown: 0.8
        });
    }

    /* ────────────────────────── 主更新与渲染循环 ────────────────────────── */

    loop(timestamp) {
        const dt = Math.min(0.05, (timestamp - this.lastTime) / 1000);
        this.lastTime = timestamp;

        if (this.state === 'playing') {
            if (this.hitStop > 0) {
                this.hitStop -= dt;
            } else {
                // 子弹时间用游戏时钟计时：暂停/定格时不消耗时长
                if (this.timeScale < 1 && this.slowMoTimer > 0) {
                    this.slowMoTimer -= dt;
                    if (this.slowMoTimer <= 0) {
                        this.timeScale = 1.0;
                        this.slowMoTimer = 0;
                    }
                }
                const scaledDt = dt * this.timeScale;
                this.update(scaledDt);
            }
        }

        this.draw();
        requestAnimationFrame((t) => this.loop(t));
    }

    update(dt) {
        this.timeElapsed += dt;

        // 连击计时器
        if (this.comboTimer > 0) {
            this.comboTimer -= dt;
            if (this.comboTimer <= 0) {
                this.combo = 1;
                this.updateHUD();
            }
        }

        // 更新玩家 1
        this.updatePlayer(this.player, dt, false);

        // 更新玩家 2 或 AI
        if (this.mode === 'duel' && this.player2) {
            this.updatePlayer(this.player2, dt, this.duelMode === 'ai');
            // 判定 P1 与 P2 之间的针尖对麦芒
            if (this.checkTipClash(this.player, this.player2)) {
                if (this.player.score >= 500 || this.player2.score >= 500) {
                    this.handleGameOver(true);
                }
            }
        }

        // 更新敌人
        this.updateEnemies(dt);

        // 更新弹幕
        this.updateBullets(dt);

        // 更新碎芒反弹飞刺
        this.updateRicochets(dt);

        // 更新特效
        this.fx.update(dt);

        // 关卡进度检测
        if (this.mode === 'levels' && this.enemies.length === 0) {
            this.handleGameOver(true);
        } else if (this.mode === 'endless') {
            this.waveTimer += dt;
            if (this.waveTimer > 3.5 || this.enemies.length === 0) {
                this.waveTimer = 0;
                this.waveIndex++;
                this.spawnEndlessWave();
            }
        } else if (this.mode === 'daily') {
            if (this.enemies.length === 0) {
                this.waveIndex++;
                if (this.waveIndex >= 5) {
                    this.handleGameOver(true);
                } else {
                    this.spawnDailyWave(this.waveIndex);
                }
            }
        }
    }

    updatePlayer(p, dt, isAI = false) {
        // 无敌闪烁计时
        if (p.invulnerable > 0) {
            p.invulnerable -= dt;
        }

        // 冲刺冷却
        if (p.dashCooldown > 0) {
            p.dashCooldown -= dt;
        }

        if (isAI) {
            this.updateAI(p, dt);
        } else if (!p.isP2) {
            // P1 控制逻辑 (鼠标瞄准 + WASD身法)
            const targetDx = this.pointer.x - p.x;
            const targetDy = this.pointer.y - p.y;
            p.angle = Math.atan2(targetDy, targetDx);

            let moveX = 0;
            let moveY = 0;
            if (this.keys['KeyW'] || this.keys['ArrowUp']) moveY -= 1;
            if (this.keys['KeyS'] || this.keys['ArrowDown']) moveY += 1;
            if (this.keys['KeyA'] || this.keys['ArrowLeft']) moveX -= 1;
            if (this.keys['KeyD'] || this.keys['ArrowRight']) moveX += 1;

            // 触屏摇杆兜底（键盘不动时生效），偏移量决定移动速度
            if (moveX === 0 && moveY === 0 && this.joy.active) {
                moveX = this.joy.x;
                moveY = this.joy.y;
            }

            if (moveX !== 0 || moveY !== 0) {
                const len = Math.hypot(moveX, moveY);
                const speed = 220 * Math.min(1, len);
                p.vx = (moveX / len) * speed;
                p.vy = (moveY / len) * speed;
            } else {
                p.vx *= 0.82;
                p.vy *= 0.82;
            }
        } else {
            // P2 控制逻辑 (方向键身法 + 方向键瞄准)
            let moveX = 0;
            let moveY = 0;
            if (this.keys['ArrowUp']) moveY -= 1;
            if (this.keys['ArrowDown']) moveY += 1;
            if (this.keys['ArrowLeft']) moveX -= 1;
            if (this.keys['ArrowRight']) moveX += 1;

            if (moveX !== 0 || moveY !== 0) {
                p.angle = Math.atan2(moveY, moveX);
                p.vx = moveX * 220;
                p.vy = moveY * 220;
            } else {
                p.vx *= 0.82;
                p.vy *= 0.82;
            }
        }

        // 冲刺位移更新
        if (p.isDashing) {
            p.dashTimer -= dt;
            p.x += p.dashVector.x * dt;
            p.y += p.dashVector.y * dt;

            // 尾迹火花
            this.fx.addSpark(
                p.x, p.y,
                -p.dashVector.x * 0.15 + (Math.random() - 0.5) * 40,
                -p.dashVector.y * 0.15 + (Math.random() - 0.5) * 40,
                p.stance === 'needle' ? '#38bdf8' : '#f59e0b',
                3,
                0.2
            );

            if (p.dashTimer <= 0) {
                p.isDashing = false;
            }
        } else {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
        }

        // 边缘约束与弹性反弹
        const pad = p.radius + 6;
        if (p.x < pad) { p.x = pad; p.vx *= -0.5; }
        if (p.x > ARENA_WIDTH - pad) { p.x = ARENA_WIDTH - pad; p.vx *= -0.5; }
        if (p.y < pad) { p.y = pad; p.vy *= -0.5; }
        if (p.y > ARENA_HEIGHT - pad) { p.y = ARENA_HEIGHT - pad; p.vy *= -0.5; }
    }

    updateAI(ai, dt) {
        // AI 宗师逻辑：追踪 P1 位置，适时突刺弹反
        const dx = this.player.x - ai.x;
        const dy = this.player.y - ai.y;
        const dist = Math.hypot(dx, dy);

        ai.angle = Math.atan2(dy, dx);

        // 保持中距离周旋
        const targetDist = 180;
        if (dist > targetDist + 30) {
            ai.vx = (dx / dist) * 160;
            ai.vy = (dy / dist) * 160;
        } else if (dist < targetDist - 30) {
            ai.vx = -(dx / dist) * 140;
            ai.vy = -(dy / dist) * 140;
        } else {
            // 横向切向盘旋
            ai.vx = -(dy / dist) * 140;
            ai.vy = (dx / dist) * 140;
        }

        // 冲刺对决判断
        if (ai.dashCooldown <= 0) {
            let shouldDash = false;
            if (this.aiDifficulty === 'easy' && Math.random() < 0.02) shouldDash = true;
            if (this.aiDifficulty === 'medium') {
                // 当玩家冲刺时，尝试正面截击弹反
                if (this.player.isDashing && dist < 220) shouldDash = true;
                else if (Math.random() < 0.035) shouldDash = true;
            }
            if (this.aiDifficulty === 'hard') {
                // 剑圣造诣：精准算力，正面迎刺
                if (this.player.isDashing && dist < 260) shouldDash = true;
                else if (dist < 180 && Math.random() < 0.06) shouldDash = true;
            }

            if (shouldDash) {
                this.triggerDash(ai);
            }
        }
    }

    updateEnemies(dt) {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];

            if (e.isBoss) {
                this.updateBoss(e, dt);
            } else {
                // 普通小怪位移
                e.x += e.vx * dt;
                e.y += e.vy * dt;

                // 转向玩家或边缘反弹
                if (e.x < 25 || e.x > ARENA_WIDTH - 25) e.vx *= -1;
                if (e.y < 25 || e.y > ARENA_HEIGHT * 0.85) e.vy *= -1;

                e.angle = Math.atan2(e.vy, e.vx);
            }

            // 针尖对麦芒碰撞检测 (玩家突刺 vs 敌人锋芒)
            if (this.player.isDashing) {
                if (this.checkTipClash(this.player, e)) {
                    continue;
                }
            }

            // 普通碰撞伤害检测 (如果玩家没有触发弹反被敌人碰到)
            const bodyDist = Math.hypot(this.player.x - e.x, this.player.y - e.y);
            if (bodyDist < this.player.radius + e.radius) {
                if (this.player.isDashing) {
                    // 玩家冲撞到了侧面，造成普通斩击
                    this.score += 50;
                    this.destroyEnemy(e);
                } else {
                    this.handlePlayerHit(this.player);
                }
            }
        }
    }

    updateBoss(boss, dt) {
        if (boss.stunTimer > 0) {
            boss.stunTimer -= dt;
            return;
        }

        boss.phaseTimer += dt;

        // 横向游弋
        boss.x += boss.vx * dt;
        if (boss.x < 80 || boss.x > ARENA_WIDTH - 80) boss.vx *= -1;

        // 攻击弹幕与冲刺
        boss.shootCooldown -= dt;
        if (boss.shootCooldown <= 0) {
            boss.shootCooldown = 1.0;

            if (boss.bossType === 'needle_sovereign') {
                // 灵虚针尊：向玩家连续喷射 3 道极速银针
                const angleToP = Math.atan2(this.player.y - boss.y, this.player.x - boss.x);
                [-0.2, 0, 0.2].forEach(off => {
                    this.bullets.push({
                        x: boss.x,
                        y: boss.y,
                        vx: Math.cos(angleToP + off) * 260,
                        vy: Math.sin(angleToP + off) * 260,
                        angle: angleToP + off,
                        stance: 'needle',
                        radius: 5,
                        tipDistance: 12
                    });
                });
            } else if (boss.bossType === 'awn_emperor') {
                // 扶摇麦皇：环形散射 8 朵旋转金芒
                for (let k = 0; k < 8; k++) {
                    const ang = (Math.PI * 2 / 8) * k + boss.phaseTimer;
                    this.bullets.push({
                        x: boss.x,
                        y: boss.y,
                        vx: Math.cos(ang) * 190,
                        vy: Math.sin(ang) * 190,
                        angle: ang,
                        stance: 'awn',
                        radius: 6,
                        tipDistance: 14
                    });
                }
            } else if (boss.bossType === 'grandmaster') {
                // 终极宗师：在针态与芒态之间自如转换
                boss.stance = boss.stance === 'needle' ? 'awn' : 'needle';
                const angleToP = Math.atan2(this.player.y - boss.y, this.player.x - boss.x);
                this.bullets.push({
                    x: boss.x,
                    y: boss.y,
                    vx: Math.cos(angleToP) * 320,
                    vy: Math.sin(angleToP) * 320,
                    angle: angleToP,
                    stance: boss.stance,
                    radius: 7,
                    tipDistance: 16
                });
            }
        }
    }

    updateBullets(dt) {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.x += b.vx * dt;
            b.y += b.vy * dt;

            // 越界回收
            if (b.x < -20 || b.x > ARENA_WIDTH + 20 || b.y < -20 || b.y > ARENA_HEIGHT + 20) {
                this.bullets.splice(i, 1);
                continue;
            }

            // 与玩家冲刺的针尖弹反！(玩家冲刺时正对子弹尖峰也可以触发弹反！)
            if (this.player.isDashing) {
                const bTipX = b.x + Math.cos(b.angle) * b.tipDistance;
                const bTipY = b.y + Math.sin(b.angle) * b.tipDistance;
                const pTipX = this.player.x + Math.cos(this.player.angle) * this.player.tipDistance;
                const pTipY = this.player.y + Math.sin(this.player.angle) * this.player.tipDistance;

                if (Math.hypot(bTipX - pTipX, bTipY - pTipY) < 24) {
                    this.handleSuccessfulClash(this.player, b, (bTipX + pTipX) / 2, (bTipY + pTipY) / 2);
                    this.bullets.splice(i, 1);
                    continue;
                }
            }

            // 击中玩家判定
            if (Math.hypot(b.x - this.player.x, b.y - this.player.y) < b.radius + this.player.radius) {
                this.handlePlayerHit(this.player);
                this.bullets.splice(i, 1);
            }
        }
    }

    updateRicochets(dt) {
        for (let i = this.ricochets.length - 1; i >= 0; i--) {
            const r = this.ricochets[i];
            r.life -= dt;

            // 自动追踪最近的敌人
            if (r.homing && this.enemies.length > 0) {
                let closest = null;
                let minDist = Infinity;
                for (const e of this.enemies) {
                    const d = Math.hypot(e.x - r.x, e.y - r.y);
                    if (d < minDist) {
                        minDist = d;
                        closest = e;
                    }
                }
                if (closest) {
                    const targetAngle = Math.atan2(closest.y - r.y, closest.x - r.x);
                    r.vx += Math.cos(targetAngle) * 950 * dt;
                    r.vy += Math.sin(targetAngle) * 950 * dt;
                    const spd = Math.hypot(r.vx, r.vy);
                    if (spd > 520) {
                        r.vx = (r.vx / spd) * 520;
                        r.vy = (r.vy / spd) * 520;
                    }
                }
            }

            r.x += r.vx * dt;
            r.y += r.vy * dt;

            // 击中敌人
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const e = this.enemies[j];
                if (Math.hypot(e.x - r.x, e.y - r.y) < e.radius + r.radius) {
                    if (e.isBoss) {
                        e.hp -= r.damage;
                        if (e.hp <= 0) this.destroyEnemy(e);
                    } else {
                        this.destroyEnemy(e);
                    }
                    this.fx.burst(r.x, r.y, r.color, '#ffffff', 8);
                    r.life = 0;
                    break;
                }
            }

            if (r.life <= 0) {
                this.ricochets.splice(i, 1);
            }
        }
    }

    spawnEndlessWave() {
        const count = Math.min(6, 2 + Math.floor(this.waveIndex / 2));
        for (let i = 0; i < count; i++) {
            const type = Math.random() < 0.5 ? 'needle' : 'awn';
            const x = 50 + Math.random() * (ARENA_WIDTH - 100);
            const y = 40 + Math.random() * 80;
            const speed = 140 + Math.min(120, this.waveIndex * 8);
            this.spawnEnemy(type, x, y, Math.PI / 2 + (Math.random() - 0.5) * 0.4, speed);
        }
    }

    spawnDailyWave(wave) {
        // 基于 UTC+8 种子的固定难度波次
        const count = 3 + wave;
        for (let i = 0; i < count; i++) {
            const type = i % 2 === 0 ? 'needle' : 'awn';
            const x = 60 + (i * (ARENA_WIDTH - 120)) / (count - 1);
            this.spawnEnemy(type, x, 50, Math.PI / 2, 160 + wave * 15);
        }
    }

    /* ────────────────────────── 渲染层 (赛博水墨画风) ────────────────────────── */

    _buildBackground() {
        // 大半径极弱 radial 墨晕（仅构建一次，运行时只平移 → 零每帧渐变）
        this.bgBlobs = [
            this._makeInkBlob('#38bdf8', 0.05),
            this._makeInkBlob('#fbbf24', 0.045),
            this._makeInkBlob('#38bdf8', 0.04)
        ];
        this.bgBlobInfo = [
            { x: ARENA_WIDTH * 0.28, y: ARENA_HEIGHT * 0.30, r: 230, sx: 0.18, sy: 0.12, ph: 0.0 },
            { x: ARENA_WIDTH * 0.72, y: ARENA_HEIGHT * 0.58, r: 270, sx: 0.10, sy: 0.15, ph: 2.1 },
            { x: ARENA_WIDTH * 0.50, y: ARENA_HEIGHT * 0.82, r: 190, sx: 0.22, sy: 0.14, ph: 4.0 }
        ];
    }

    _makeInkBlob(hex, alpha) {
        const s = 256;
        const c = document.createElement('canvas');
        c.width = s;
        c.height = s;
        const x = c.getContext('2d');
        const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        g.addColorStop(0, this._hexA(hex, alpha));
        g.addColorStop(1, this._hexA(hex, 0));
        x.fillStyle = g;
        x.fillRect(0, 0, s, s);
        return c;
    }

    _hexA(hex, a) {
        const n = parseInt(hex.slice(1), 16);
        return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    }

    draw() {
        const ctx = this.ctx;
        ctx.save();

        // 震屏偏移
        if (this.fx.screenShake > 0) {
            const shakeX = (Math.random() - 0.5) * this.fx.screenShake;
            const shakeY = (Math.random() - 0.5) * this.fx.screenShake;
            ctx.translate(shakeX, shakeY);
        }

        // 1. 背景绘制 (赛博水墨：漂移斜网格 + 极弱墨晕)
        ctx.fillStyle = '#02040b';
        ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

        // 缓慢漂移的水墨斜网格 (细线 alpha <= 0.06)
        const gridDrift = (this.timeElapsed * 8) % 46;
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.05)';
        ctx.lineWidth = 1;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
        ctx.clip();
        for (let x = -ARENA_HEIGHT - 46 + gridDrift; x < ARENA_WIDTH; x += 46) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x + ARENA_HEIGHT, ARENA_HEIGHT);
        }
        for (let x = gridDrift; x < ARENA_WIDTH + ARENA_HEIGHT; x += 46) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x - ARENA_HEIGHT, ARENA_HEIGHT);
        }
        ctx.stroke();
        ctx.restore();

        // 大半径极弱 radial 墨晕 (预渲染一次，运行时仅平移 → 零每帧渐变)
        if (this.bgBlobs) {
            for (let i = 0; i < this.bgBlobs.length; i++) {
                const info = this.bgBlobInfo[i];
                const dx = Math.sin(this.timeElapsed * info.sx + info.ph) * info.r * 0.35;
                const dy = Math.cos(this.timeElapsed * info.sy + info.ph) * info.r * 0.35;
                ctx.drawImage(this.bgBlobs[i], info.x + dx - info.r, info.y + dy - info.r, info.r * 2, info.r * 2);
            }
        }

        // 2. 绘制边界竞技场界圈 (八卦太极微光虚环)
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
        ctx.lineWidth = 2;
        ctx.strokeRect(16, 16, ARENA_WIDTH - 32, ARENA_HEIGHT - 32);

        // 3. 绘制弹幕与反弹飞芒
        this.drawBullets(ctx);
        this.drawRicochets(ctx);

        // 4. 绘制敌人与 Boss
        this.drawEnemies(ctx);

        // 5. 绘制玩家 1 与 玩家 2
        this.drawEntity(ctx, this.player);
        if (this.player2) {
            this.drawEntity(ctx, this.player2);
        }

        // 6. 绘制粒子与震波
        this.fx.draw(ctx);

        ctx.restore();
    }

    drawEntity(ctx, p) {
        if (p.invulnerable > 0 && Math.floor(performance.now() / 80) % 2 === 0) {
            return; // 无敌状态闪烁
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);

        const isNeedle = p.stance === 'needle';
        const colorCore = isNeedle ? '#f0f9ff' : '#fef08a';
        const colorGlow = isNeedle ? '#38bdf8' : '#f59e0b';

        ctx.shadowColor = colorGlow;
        ctx.shadowBlur = p.isDashing ? 20 : 12;

        if (isNeedle) {
            // 银针形体：冷冽极速棱形针刺
            ctx.fillStyle = colorGlow;
            ctx.beginPath();
            ctx.moveTo(p.tipDistance, 0); // 针尖
            ctx.lineTo(-p.radius, -p.radius * 0.6);
            ctx.lineTo(-p.radius * 0.5, 0);
            ctx.lineTo(-p.radius, p.radius * 0.6);
            ctx.closePath();
            ctx.fill();

            // 针身白银辉光
            ctx.fillStyle = colorCore;
            ctx.beginPath();
            ctx.moveTo(p.tipDistance - 2, 0);
            ctx.lineTo(-p.radius * 0.3, -2);
            ctx.lineTo(-p.radius * 0.3, 2);
            ctx.closePath();
            ctx.fill();
        } else {
            // 金麦芒形体：璀璨金色羽状麦穗芒刃
            ctx.fillStyle = colorGlow;
            ctx.beginPath();
            ctx.moveTo(p.tipDistance, 0); // 麦芒尖
            ctx.lineTo(-p.radius, -p.radius * 0.7);
            ctx.lineTo(-p.radius * 0.4, 0);
            ctx.lineTo(-p.radius, p.radius * 0.7);
            ctx.closePath();
            ctx.fill();

            // 两侧麦芒绒刺
            ctx.strokeStyle = colorCore;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(p.tipDistance * 0.6, 0);
            ctx.lineTo(p.tipDistance * 0.2, -p.radius * 0.8);
            ctx.moveTo(p.tipDistance * 0.6, 0);
            ctx.lineTo(p.tipDistance * 0.2, p.radius * 0.8);
            ctx.stroke();
        }

        // 尖端判定光点
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.tipDistance, 0, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    drawEnemies(ctx) {
        for (const e of this.enemies) {
            ctx.save();
            ctx.translate(e.x, e.y);
            ctx.rotate(e.angle);

            const isNeedle = e.stance === 'needle';
            const colorGlow = isNeedle ? '#38bdf8' : '#f59e0b';
            ctx.shadowColor = colorGlow;
            ctx.shadowBlur = 10;

            if (e.isBoss) {
                // Boss 多层描边「法相」
                const R = e.radius;
                const tB = this.timeElapsed;

                // 内核实心
                ctx.shadowColor = colorGlow;
                ctx.shadowBlur = 14;
                ctx.fillStyle = colorGlow;
                ctx.beginPath();
                ctx.arc(0, 0, R * 0.55, 0, Math.PI * 2);
                ctx.fill();

                // 中层金色虚线环（反向旋转）
                ctx.shadowBlur = 0;
                ctx.strokeStyle = '#fbbf24';
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 7]);
                ctx.save();
                ctx.rotate(-tB * 0.6);
                ctx.beginPath();
                ctx.arc(0, 0, R * 0.82, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
                ctx.setLineDash([]);

                // 外层青色细环（正向旋转）
                ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
                ctx.lineWidth = 1.5;
                ctx.save();
                ctx.rotate(tB * 0.9);
                ctx.beginPath();
                ctx.arc(0, 0, R * 1.05, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();

                // 6-8 根环绕芒刺（短径向线段）
                const spikes = 8;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                for (let s = 0; s < spikes; s++) {
                    const a = (s / spikes) * Math.PI * 2 + tB * 0.5;
                    const r0 = R * 1.12;
                    const r1 = R * 1.32;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
                    ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
                    ctx.stroke();
                }

                // 尖端破阵光标（保留原白三角描边）
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(e.tipDistance, 0);
                ctx.lineTo(-e.radius * 0.8, -e.radius);
                ctx.lineTo(-e.radius * 0.8, e.radius);
                ctx.closePath();
                ctx.stroke();

                // 绘制 Boss 血条
                ctx.restore();
                ctx.save();
                ctx.translate(e.x, e.y - e.radius - 16);
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fillRect(-35, 0, 70, 5);
                ctx.fillStyle = colorGlow;
                ctx.fillRect(-35, 0, (e.hp / e.maxHp) * 70, 5);
                ctx.restore();
                continue;
            } else {
                // 普通小怪飞刃
                ctx.fillStyle = colorGlow;
                ctx.beginPath();
                ctx.moveTo(e.tipDistance, 0);
                ctx.lineTo(-e.radius, -e.radius * 0.6);
                ctx.lineTo(-e.radius, e.radius * 0.6);
                ctx.closePath();
                ctx.fill();

                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(e.tipDistance, 0, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        }
    }

    drawBullets(ctx) {
        for (const b of this.bullets) {
            ctx.save();
            ctx.translate(b.x, b.y);
            ctx.rotate(b.angle);

            const isNeedle = b.stance === 'needle';
            ctx.fillStyle = isNeedle ? '#38bdf8' : '#f59e0b';
            ctx.shadowColor = ctx.fillStyle;
            ctx.shadowBlur = 8;

            ctx.beginPath();
            ctx.moveTo(b.tipDistance, 0);
            ctx.lineTo(-b.radius, -b.radius * 0.5);
            ctx.lineTo(-b.radius, b.radius * 0.5);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        }
    }

    drawRicochets(ctx) {
        ctx.save();
        for (const r of this.ricochets) {
            ctx.fillStyle = r.color;
            ctx.shadowColor = r.color;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}

// 页面加载完成后实例化
document.addEventListener('DOMContentLoaded', () => {
    window.gameEngine = new GameEngine();

    // 移动端底部统计抽屉
    window.naDrawer = createStatsDrawer({
        idPrefix: 'na',
        getGame: () => window.gameEngine,
        onPause: (g) => g && g.pauseQuiet(),
        onResume: (g) => g && g.resumeQuiet(),
        isBusy: () => {
            const g = window.gameEngine;
            return !!g && typeof g.isRunning === 'function' && g.isRunning();
        },
        ICONS,
        getText: () => I18N[getLang()] || I18N.zh,
    });
    if (window.naDrawer) window.naDrawer.init();
});

/* ── 顶栏 / 页脚通用控件：Home · Sound · Lang · More ──
   槽位结构见 css/layout.css 的契约，行为统一由 js/game-chrome.js 接管。
   owns 默认只含 lang / more：静音钮在本页早就有自己的 handler（还要顺带做
   SFX 初始化之类的页面私事），chrome 再挂一个就会一次点击切换两次 = 净效果为零。
       na-btn-home 历史上只被 cache、从未绑过点击（HEAD 即如此），
       顺手交给 chrome 接管。 */
window.addEventListener('DOMContentLoaded', () => {
    bindChrome({
        self: 'needle-awn.html',
        owns: ['lang', 'more', 'home'],
        getText: () => I18N[getLang()] || I18N.zh,
        labels: { pause: () => (I18N[getLang()] || {}).pause },
    });
});
