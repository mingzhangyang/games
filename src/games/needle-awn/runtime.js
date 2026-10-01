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

import { ensurePlayerName, getPlayerName, setPlayerName } from '../../platform/player.js';
import { getLang, getMuted, setMuted } from '../../platform/site-settings.js';
import { storageGet, storageSet } from '../../platform/safe-storage.js';
import { track } from '../../platform/analytics.js';
import { todayKey } from '../../platform/daily.js';
import { submitScore } from '../../platform/leaderboard.js';
import { ICONS } from '../../platform/icons.js';
import { updateMoreGames } from '../../platform/more-games.js';
import { I18N } from './i18n.js';
import { ART_UI, loadNeedleAwnArt } from './render/art.js';
import { createNeedleAwnScene } from './render/scene.js';
import { bindNeedleAwnInput } from './input/controls.js';
import { ARENA_HEIGHT, ARENA_WIDTH, STORAGE_KEYS } from './config.js';

/* ────────────────────────── 常量与配置 ────────────────────────── */

/* ────────────────────────── 国际化 i18n ────────────────────────── */

// I18N moved to src/games/needle-awn/i18n.js.


import { SoundEngine } from './audio.js';
import { ParticleSystem } from './effects.js';

/* ────────────────────────── 游戏主状态机 ────────────────────────── */

class GameEngine {
    constructor() {
        this.canvas = document.getElementById('na-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.fx = new ParticleSystem();

        this.dpr = window.devicePixelRatio || 1;
        this.scale = 1;
        this.setupCanvas();
        this.scene = createNeedleAwnScene({ ctx: this.ctx, width: ARENA_WIDTH, height: ARENA_HEIGHT });
        this.artReady = false;
        this.artState = 'loading';
        this.debugHitbox = new URLSearchParams(window.location.search).get('debug-hitbox') === '1';
        // 本页此前没有任何 resize 监听（画布尺寸恒定），现在舞台尺寸会随
        // --frame-chrome 实测值与视口变化（见 js/game-frame.js），必须跟上；
        // setupCanvas 用 setTransform 幂等重设变换，重复调用安全。
        window.addEventListener('resize', () => this.setupCanvas());
        window.addEventListener('game-frame:changed', () => this.setupCanvas());
        this.mode = 'levels'; // 'levels' | 'endless' | 'daily' | 'duel'
        this.dailyDateKey = '';
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
        this.setArtControlsDisabled(true);
        loadNeedleAwnArt({
            stage: document.getElementById('na-stage'),
            onReady: (art) => this.setArtState('ready', art),
            onFallback: (_error, art) => this.setArtState('fallback', art),
        });
        this.updateSideRecords();
        this.applyLanguage(getLang());

        // 启动渲染循环
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    }

    setupCanvas() {
        // 按容器实测缩放（照 js/gravity-slingshot.js 的形状，2026-09-19）：
        // 此前后端固定 ARENA_WIDTH*dpr 且无 resize 监听，桌面舞台放大后位图
        // 跟不上会整体拉伸变糊。
        // ⚠️ 必须用 setTransform（幂等）——原先的 ctx.scale(dpr, dpr) 是累乘的，
        // 一旦有了 resize 监听，第二次调用就会把缩放翻倍、画面瞬间放大两倍。
        const stage = this.canvas.parentElement;
        const cssW = (stage && stage.clientWidth) || ARENA_WIDTH;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const s = (cssW / ARENA_WIDTH) * dpr;
        const pw = Math.round(ARENA_WIDTH * s);
        if (this.canvas.width !== pw) {
            this.canvas.width = pw;
            this.canvas.height = Math.round(ARENA_HEIGHT * s);
        }
        this.ctx.setTransform(s, 0, 0, s, 0, 0);
        this.dpr = dpr;
    }

    setArtControlsDisabled(disabled) {
        document.querySelectorAll('[data-art-gated]').forEach((button) => {
            button.disabled = disabled;
        });
        this.dom?.overlayStart?.toggleAttribute('data-art-loading', disabled);
    }

    setArtState(state, art) {
        this.artState = state;
        this.artReady = true;
        this.scene?.setArt(art, state);
        const stage = document.getElementById('na-stage');
        if (stage) stage.dataset.artState = state;
        this.setStanceIcon(this.player);
        this.setArtControlsDisabled(false);
        this.renderLevelGrid();
    }

    setStanceIcon(entityOrStance) {
        const stance = typeof entityOrStance === 'string' ? entityOrStance : entityOrStance?.stance;
        if (!this.dom?.stanceIcon) return;
        this.dom.stanceIcon.src = stance === 'awn' ? ART_UI.stanceAwn : ART_UI.stanceNeedle;
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
        return bindNeedleAwnInput(this);
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
        document.getElementById('na-canvas').setAttribute('aria-label', t.canvasAria);
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

        // 内部 HUD 姿态与极意标签
        const isNeedle = !this.player || this.player.stance === 'needle';
        this.dom.stanceText.textContent = isNeedle ? t.stanceNeedle : t.stanceAwn;
        this.setStanceIcon(isNeedle ? 'needle' : 'awn');
        const ultText = this.dom.ultLabel?.querySelector('[data-ult-text]');
        if (ultText) ultText.textContent = t.ultLabel;

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
            const starText = '✦'.repeat(stars) + '·'.repeat(3 - stars);

            chip.innerHTML = `
                <span>${i}</span>
                <span class="na-level-stars">${isUnlocked ? starText : '—'}</span>
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
        // UTC+8 唯一口径已收敛到 js/daily.js（原 getTimezoneOffset 手写版退役）
        return todayKey();
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
        if (!this.artReady) return;
        this.mode = 'levels';
        this.currentLevel = levelNum;
        this.resetGameState();
        this.loadStageWave(levelNum);
        this.resumeBattle();
        track('needle-awn', 'play');
    }

    startEndlessMode() {
        if (!this.artReady) return;
        this.mode = 'endless';
        this.resetGameState();
        this.resumeBattle();
        track('needle-awn', 'play');
    }

    startDailyMode() {
        if (!this.artReady) return;
        this.mode = 'daily';
        this.dailyDateKey = this.getTodayDateString();
        this.resetGameState();
        this.resumeBattle();
        track('needle-awn', 'play');
    }

    startDuelMode() {
        if (!this.artReady) return;
        this.mode = 'duel';
        this.resetGameState();
        this.player2 = this.createPlayer(ARENA_WIDTH / 2, ARENA_HEIGHT * 0.28, true);
        this.player2.stance = 'awn';
        this.resumeBattle();
        track('needle-awn', 'play');
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
        this.setStanceIcon('needle');
        this.dom.stanceText.textContent = t.stanceNeedle;
        const ultText = this.dom.ultLabel?.querySelector('[data-ult-text]');
        if (ultText) ultText.textContent = t.ultLabel;

        this.updateHUD();
        this.updateHUDLabels();
    }

    resumeBattle() {
        if (!this.artReady) return;
        this.state = 'playing';
        this.dom.overlayStart.classList.add('hidden');
        this.dom.overlayPause.classList.add('hidden');
        this.dom.overlayResult.classList.add('hidden');
        SoundEngine.startAmbientMusic();
    }

    refreshPauseLabel() {
        const chrome = window.naRuntime && window.naRuntime.chrome;
        if (chrome && typeof chrome.renderPause === 'function') chrome.renderPause();
    }

    togglePause() {
        if (this.state === 'playing') {
            this.state = 'paused';
            this.dom.overlayPause.classList.remove('hidden');
            this.dom.btnPause.innerHTML = ICONS.play;
            this.refreshPauseLabel();
        } else if (this.state === 'paused') {
            this.state = 'playing';
            this.dom.overlayPause.classList.add('hidden');
            this.dom.btnPause.innerHTML = ICONS.pause;
            this.refreshPauseLabel();
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
        this.refreshPauseLabel();
    }

    resumeQuiet() {
        if (this.state !== 'paused') return;
        this.state = 'playing';
        this.lastTime = performance.now();   // 丢掉暂停期间的时间跳跃，避免恢复瞬间 dt 爆炸
        if (this.dom.btnPause) this.dom.btnPause.innerHTML = ICONS.pause;
        this.refreshPauseLabel();
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
            this.setStanceIcon(isNeedle ? 'needle' : 'awn');
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
                this.dom.resultStars.textContent = '✦'.repeat(stars) + '·'.repeat(3 - stars);

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
                this.dom.resultStars.textContent = '···';
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

        track('needle-awn', 'finish');
    }

    async submitScore() {
        if (this.score <= 0) return;

        // 无尽模式记录更新
        if (this.mode === 'endless' && this.score > this.endlessBest) {
            this.endlessBest = this.score;
            storageSet(STORAGE_KEYS.ENDLESS_BEST, this.endlessBest);
        }

        const dailyDate = this.mode === 'daily'
            ? (this.dailyDateKey || this.getTodayDateString())
            : '';

        // 每日挑战记录保存
        if (this.mode === 'daily') {
            storageSet(`${STORAGE_KEYS.DAILY_PREFIX}${dailyDate}`, String(this.score));
        }

        // 尝试向共享排行榜 Worker 提交分数 (网络可用时)
        const name = getPlayerName() || ensurePlayerName();
        const gameKey = this.mode === 'daily' ? `needle-awn-d${dailyDate}` : 'needle-awn';

        // 网络层收敛到 js/leaderboard.js（原无超时/cors，统一补齐；false=未进金榜）
        const ok = await submitScore({ game: gameKey, name, score: this.score });
        if (!ok) {
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
        const radius = 28;
        const tipDist = 34;
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
            level: this.currentLevel,
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
        // 背景由 NeedleAwnScene 统一管理并缓存；保留空方法兼容旧扩展点。
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

        const sceneMeta = {
            mode: this.mode,
            level: this.currentLevel,
            waveIndex: this.waveIndex,
            timeElapsed: this.timeElapsed,
        };

        // 1. 分层水墨背景（静态层缓存，按关卡章节切换色调）
        this.scene.drawBackground(ctx, sceneMeta);

        // 2. 绘制弹幕与反弹飞芒
        this.drawBullets(ctx);
        this.drawRicochets(ctx);

        // 3. 绘制敌人与 Boss 法相
        this.drawEnemies(ctx);

        // 4. 绘制玩家 1 与 玩家 2
        this.drawEntity(ctx, this.player);
        if (this.player2) {
            this.drawEntity(ctx, this.player2);
        }

        // 5. 绘制粒子与震波
        this.fx.draw(ctx);

        // 6. 前景剪影最后压住场景边缘，保留战斗纵深
        this.scene.drawForeground(ctx, sceneMeta);

        // 7. 调试碰撞层必须位于前景之上，才能准确校对尖端锚点
        this.drawDebugHitboxes(ctx);

        ctx.restore();
    }

    drawEntity(ctx, p) {
        if (!p) return;
        if (p.invulnerable > 0 && Math.floor(performance.now() / 80) % 2 === 0) {
            return; // 无敌状态闪烁
        }
        this.scene.drawPlayer(ctx, p, this.timeElapsed);
    }

    drawEnemies(ctx) {
        for (const e of this.enemies) {
            if (e.isBoss) {
                this.scene.drawBoss(ctx, e, this.timeElapsed);
            } else {
                this.scene.drawEnemy(ctx, e, this.timeElapsed);
            }
        }
    }

    drawDebugHitboxes(ctx) {
        if (!this.debugHitbox) return;
        for (const enemy of this.enemies) {
            this.scene.drawHitbox(ctx, enemy);
        }
        if (this.player) this.scene.drawHitbox(ctx, this.player);
        if (this.player2) this.scene.drawHitbox(ctx, this.player2);
    }

    drawBullets(ctx) {
        for (const b of this.bullets) {
            this.scene.drawBullet(ctx, b);
        }
    }

    drawRicochets(ctx) {
        for (const r of this.ricochets) {
            this.scene.drawRicochet(ctx, r);
        }
    }
}

// 页面加载完成后实例化
export { GameEngine };
export { ARENA_WIDTH, ARENA_HEIGHT } from './config.js';
