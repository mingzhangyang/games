/**
 * Neon Tower Defense 霓虹塔防
 * Canvas 塔防：脉冲 / 冰霜 / 加农 / 电磁四类塔，六个 15–40 波作战行动，
 * 目标集火策略、战术指挥技能、提前发波奖励、4阶觉醒形态、×1/×2/×3倍速、全球排行榜。
 *
 * 逻辑坐标固定 800×600（20×15 格，格宽 40），每个行动拥有自己的路径地图。
 * 渲染时按 4:3 舞台等比缩放并乘 devicePixelRatio；背景静态层离屏预渲染；
 * 生产 SVG atlas 加载失败时回退到程序绘制。
 *
 * Vanilla JS. No runtime dependencies.
 */

import { ensurePlayerName } from '../../platform/player.js';
import { getLang } from '../../platform/site-settings.js';
import { ICONS } from '../../platform/icons.js';
import {
    loadTowerDefenseBest,
    saveTowerDefenseBest,
    loadTowerDefenseGlobalBest,
    saveTowerDefenseGlobalBest,
    loadTowerDefenseLocalScores,
    saveTowerDefenseLocalScores,
    saveTowerDefenseClear,
} from './storage.js';
import { track } from '../../platform/analytics.js';
import { submitScore, fetchBoard } from '../../platform/leaderboard.js';
import { LANGUAGES } from './i18n.js';
import { createTowerDefenseArt } from './art.js';
import { LEVELS } from './levels.js';
import { Sfx } from './audio.js';
import { formatNumber } from './config.js';
import { compileLevelMap } from './model/level-runtime.js';
import { resize, renderBackground, drawFrame, drawTower } from './render/scene-renderer.js';
import { bindInput, toLogical } from './input/pointer.js';
import {
    updateGame, burst, floater, damageEnemy, killEnemy, leakEnemy,
    spawnEnemy, applyStack, startWave, waveCleared
} from './systems/combat.js';
import {
    towerAt, tryBuild, tryUpgrade, trySell, cycleTargetPriority, toggleShowAllRanges,
    nearestTower, towerMaxHp, damageTower, destroyTower, pickTarget, fireTower, explodeShell
} from './systems/targeting.js';
import {
    applyArtBindings, updateRotationPrompt, toggleTacticalPanel, closeTacticalPanel,
    renderTacticalPanel, applyLanguage, updateSideSkills, unlockedCount,
    isLevelUnlocked, levelThreats, renderLevelCards, renderBriefing, updateSideTowers,
    updateSideShortcuts, updateSideRecords
} from './ui/overlays.js';
import {
    closePanel, renderPanel, castEmp, castOverdrive, updateSkillButtons,
    updateHud, renderWaveButton, showToast, bindUI, updateMuteButtons, toggleMute
} from './ui/controls.js';

/* ────────────────────────── 游戏类 ────────────────────────── */

export class TowerDefenseGame {
    constructor() {
        this.canvas = document.getElementById('td-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.el = {};
        ['td-lives', 'td-gold', 'td-wave', 'td-wave-btn', 'td-wave-text', 'td-wave-preview',
            'td-stat-lives', 'td-stat-gold', 'td-stat-wave', 'td-stack-badge',
            'td-panel', 'td-toast', 'td-start', 'td-title', 'td-subtitle', 'td-howto', 'td-tower-intro',
            'td-btn-play', 'td-best-line', 'td-start-mute',
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
            'td-start-hero', 'td-rotate-prompt', 'td-rotate-title', 'td-rotate-copy', 'tdTacticalPanel', 'tdTacticalClose', 'tdTacticalPanelTitle', 'tdStatsToggle',
            'td-side-howto-title', 'td-side-howto', 'td-side-skills-title', 'td-side-skills',
            'td-side-towers-title', 'td-side-towers', 'td-side-shortcuts-title', 'td-side-shortcuts',
            'td-side-records-title', 'td-side-records'
        ].forEach(id => {
            const el = document.getElementById(id);
            if (el) this.el[id.replace(/^td-/, '')] = el;
        });

        this.el.tacticalPanel = document.getElementById('tdTacticalPanel');
        this.el.tacticalClose = document.getElementById('tdTacticalClose');
        this.el.tacticalTitle = document.getElementById('tdTacticalPanelTitle');
        this.el.statsToggle = document.getElementById('tdStatsToggle');

        this.lang = this.readLang();
        this.art = createTowerDefenseArt();
        this.artReady = this.art.ready.then(result => {
            this.artStatus = result.status;
            this.applyArtBindings();
            this.renderBackground(this.canvas.width, this.canvas.height);
            this.drawFrame();
            return result;
        });
        this.artStatus = 'loading';
        window.__TD_CREATE_ART__ = createTowerDefenseArt;
        this.bgCanvas = document.createElement('canvas');
        this.resetRun();
        this.applyLanguage();

        this.state = 'menu'; // menu | playing | paused | over
        this.animationId = null;
        this.lastFrameTime = 0;

        this.bindInput();
        this.bindUI();
        this.updateMuteButtons();
        this.updateHud();
        this.resize();
        window.addEventListener('resize', () => this.resize());
        // 桌面舞台尺寸随 --frame-chrome 实测值变化（见 src/platform/game-frame.js）：
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

    applyArtBindings(...args) { return applyArtBindings(this, ...args); }
    updateRotationPrompt(...args) { return updateRotationPrompt(this, ...args); }
    toggleTacticalPanel(...args) { return toggleTacticalPanel(this, ...args); }
    closeTacticalPanel(...args) { return closeTacticalPanel(this, ...args); }
    renderTacticalPanel(...args) { return renderTacticalPanel(this, ...args); }
    applyLanguage(...args) { return applyLanguage(this, ...args); }
    updateSideSkills(...args) { return updateSideSkills(this, ...args); }
    unlockedCount(...args) { return unlockedCount(this, ...args); }
    isLevelUnlocked(...args) { return isLevelUnlocked(this, ...args); }
    levelThreats(...args) { return levelThreats(this, ...args); }
    renderLevelCards(...args) { return renderLevelCards(this, ...args); }
    renderBriefing(...args) { return renderBriefing(this, ...args); }
    updateSideTowers(...args) { return updateSideTowers(this, ...args); }
    updateSideShortcuts(...args) { return updateSideShortcuts(this, ...args); }
    updateSideRecords(...args) { return updateSideRecords(this, ...args); }

    closePanel(...args) { return closePanel(this, ...args); }
    renderPanel(...args) { return renderPanel(this, ...args); }
    castEmp(...args) { return castEmp(this, ...args); }
    castOverdrive(...args) { return castOverdrive(this, ...args); }
    updateSkillButtons(...args) { return updateSkillButtons(this, ...args); }
    updateHud(...args) { return updateHud(this, ...args); }
    renderWaveButton(...args) { return renderWaveButton(this, ...args); }
    showToast(...args) { return showToast(this, ...args); }
    bindUI(...args) { return bindUI(this, ...args); }
    updateMuteButtons(...args) { return updateMuteButtons(this, ...args); }
    toggleMute(...args) { return toggleMute(this, ...args); }

    toLogical(...args) { return toLogical(this, ...args); }
    bindInput(...args) { return bindInput(this, ...args); }

    towerAt(...args) { return towerAt(this, ...args); }
    tryBuild(...args) { return tryBuild(this, ...args); }
    tryUpgrade(...args) { return tryUpgrade(this, ...args); }
    trySell(...args) { return trySell(this, ...args); }
    cycleTargetPriority(...args) { return cycleTargetPriority(this, ...args); }
    toggleShowAllRanges(...args) { return toggleShowAllRanges(this, ...args); }
    nearestTower(...args) { return nearestTower(this, ...args); }
    towerMaxHp(...args) { return towerMaxHp(this, ...args); }
    damageTower(...args) { return damageTower(this, ...args); }
    destroyTower(...args) { return destroyTower(this, ...args); }
    pickTarget(...args) { return pickTarget(this, ...args); }
    fireTower(...args) { return fireTower(this, ...args); }
    explodeShell(...args) { return explodeShell(this, ...args); }

    burst(...args) { return burst(this, ...args); }
    floater(...args) { return floater(this, ...args); }
    damageEnemy(...args) { return damageEnemy(this, ...args); }
    killEnemy(...args) { return killEnemy(this, ...args); }
    leakEnemy(...args) { return leakEnemy(this, ...args); }
    spawnEnemy(...args) { return spawnEnemy(this, ...args); }
    applyStack(...args) { return applyStack(this, ...args); }
    startWave(...args) { return startWave(this, ...args); }
    waveCleared(...args) { return waveCleared(this, ...args); }
    update(...args) { return updateGame(this, ...args); }

    resize(...args) { return resize(this, ...args); }
    renderBackground(...args) { return renderBackground(this, ...args); }
    drawFrame(...args) { return drawFrame(this, ...args); }
    drawTower(...args) { return drawTower(this, ...args); }

    get TEXT() { return LANGUAGES[this.lang]; }






    exposeActiveMap() {
        window.__TD_ACTIVE_MAP__ = this.map;
        window.__TD_AIR_PATH__ = this.map.airPath;
        window.__TD_GROUND_PATH__ = this.map.groundPath;
        window.__TD_GRID__ = {
            COLS: this.map.cols,
            ROWS: this.map.rows,
            CELL: this.map.cell,
            pathGrid: this.map.pathGrid,
            buildableCount: this.map.buildableCount,
            signature: this.map.signature
        };
    }

    /* ── 一局的初始状态 ── */

    resetRun() {
        this.level = this.level || LEVELS[0];
        this.map = compileLevelMap(this.level.map);
        this.gold = this.level.gold;
        this.lives = this.level.lives;
        this.wave = 0;
        this.score = 0;
        this.totalKills = 0;
        this.speedMult = 1;
        this.time = 0;

        this.towers = [];
        this.towerGrid = new Int16Array(this.map.cols * this.map.rows).fill(-1);
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
        this.closeTacticalPanel();
        this.updateRotationPrompt();
        this.exposeActiveMap();
    }

    /* ── 震屏特效 ── */

    shake(mag, dur = 0.2) {
        this.shakeMag = Math.max(this.shakeMag, mag);
        this.shakeDur = Math.max(this.shakeDur, dur);
    }

    /* ── 语言与侧栏 ── */



    /* ── 关卡选择 ── */

    /** 关卡解锁进度：通关过的最小难度关卡数 + 1 */


    /** 该关会出现的机制型敌人（用于关卡卡片上的威胁标签） */






    /* ── 尺寸与离屏背景 ── */



    /* ── 输入与快捷键 ── */




    /* ── 建造 / 升级 / 出售 / 集火策略 ── */






    /* ── 面板渲染 ── */



    /* ── 指挥官战术技能 ── */




    /* ── HUD 与波次按钮 ── */




    /* ── 特效池 ── */



    /* ── 战斗逻辑 ── */

    /**
     * 统一伤害入口。
     * channel: 'physical' 走护甲减免，'energy'（电磁/火海/EMP）无视护甲。
     */




    /** 把当前堆叠层数换算成倍率 */



    /* ── 防御塔受损（攻城兵） ── */


    /**
     * 塔的血量 = 投资额的一半 + 下限，越贵的塔越耐拆。
     * 塔被打到 0 不是卖掉，是就地摧毁：不给退款，格子清空。
     */



    /* ── 塔索敌与攻击 ── */




    /* ── 帧更新 ── */


    /* ── 画布渲染 ── */



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
        this.closeTacticalPanel();
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
        this.closeTacticalPanel();
        this.renderLevelCards();
        this.resize();
        this.drawFrame();
    }

    pause() {
        if (this.state !== 'playing') return;
        this.state = 'paused';
        this.closeTacticalPanel();
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
        this.closeTacticalPanel();

        if (victory) {
            // 越难的关卡，通关奖励越高；提前压波也折算成额外分数
            const diffIdx = LEVELS.indexOf(this.level);
            const bonus = this.lives * 35 * (1 + diffIdx * 0.35) + this.level.waves * 40;
            this.score += Math.round(bonus);
            // 记录通关，用于解锁下一关
            saveTowerDefenseClear(this.level.id);
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
            this.el['over-verdict'].textContent = victory ? 'DEFENSE SECURED' : 'CORE LOST';
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
        const prevBest = loadTowerDefenseBest(this.level.id);
        const isBest = this.score > prevBest;
        if (isBest) {
            saveTowerDefenseBest(this.level.id, this.score);
            // 跨关卡全局记录也进入 GameStorage；legacy td_best 仅用于首次导入。
            const globalBest = loadTowerDefenseGlobalBest();
            if (this.score > globalBest) saveTowerDefenseGlobalBest(this.score);
        }
        this.updateSideRecords();
        if (this.el['best-line']) {
            this.el['best-line'].textContent = `BEST · ${t.best}: ${formatNumber(Math.max(prevBest, this.score))}` +
                (isBest ? ` · ${t.newBest}` : '');
        }
        this.renderLevelCards();

        // 本地榜（按关卡隔离）
        const local = this.localScores();
        local.push({ name: ensurePlayerName() || 'Anonymous', score: this.score, level: this.level.id });
        local.sort((a, b) => b.score - a.score);
        saveTowerDefenseLocalScores(local.slice(0, 30));

        if (this.el.over) this.el.over.classList.remove('hidden');
        if (this.el.username) this.el.username.value = ensurePlayerName() || '';

        // 上报全球榜（带关卡维度）；网络层收敛到 src/platform/leaderboard.js（false=静默保留本地榜）
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
        return loadTowerDefenseLocalScores();
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
        const text = `[NEON DEFENSE] ${t.title} · ${this.levelName(this.level)}\n${t.score}: ${formatNumber(this.score)} · ${t.wave} ${this.wave}/${this.level.waves}\nhttps://games.orangely.xyz/tower-defense.html`;
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



}
