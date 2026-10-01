/** Sword Flight runtime state container. Modules own rules, rendering, input, and menus. */
import { bindKeyboardInput } from './input/keyboard.js';
import { bindTouchInput } from './input/touch.js';
import { bindDOMEvents } from './ui/dom-events.js';
import { createPlayerState } from './model/player-state.js';
import { loadRecords, saveRecords, startFlight } from './model/run-state.js';
import { checkCultivationBreakthrough, getRealmName } from './model/realm.js';
import { seedStageEntities, spawnRing, spawnSpiritStone, spawnHazard, spawnThunder, spawnFiendBird, updateSatelliteSwords, updateSpawners } from './systems/spawn.js';
import { gameLoop, update } from './systems/movement.js';
import { triggerDash, triggerSwordArray, triggerUltimate, cleaveNearbyHazards, updateEntities, handleRingThreaded, handlePlayerHit } from './systems/combat.js';
import { handleStageVictory, handleGameOver } from './systems/scoring.js';
import { resizeCanvas, initBackgrounds, generateMountainLayer, render, renderSkyDome, renderMountains, renderClouds, renderFloatingIslands, renderRings, renderSpiritStones, renderHazards, renderThunders, renderFiendBirds, renderPlayer, renderSatelliteSwords } from './render/world.js';
import { renderParticles, spawnSparkle, spawnRingBurst, spawnShatterParticles, spawnShockwave, spawnSwordWave, spawnLotusAscension, spawnLightningEffect } from './render/effects.js';
import { setGameplayHudVisible, setTouchControlsVisible, refreshPauseButton, updateHUD, updateRealmDisplay, updateSideRecords, showToast, togglePause, pauseGame, resumeGame, pauseQuiet, resumeQuiet, isRunning, restartGame } from './render/hud.js';
import { showStageSelect, showDailyCard } from './ui/stage-select.js';
import { returnToMenu, openLeaderboardModal, renderLeaderboardList, submitScoreToLeaderboard, applyLanguage } from './ui/menus.js';

export class SwordFlightGame {
    constructor() {
        this.canvas = document.getElementById('sf-canvas');
        this.ctx = this.canvas.getContext('2d');

        // 视口与缩放
        this.dpr = window.devicePixelRatio || 1;
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        // 桌面舞台尺寸随 --frame-chrome 实测值变化（见 js/game-frame.js）：
        // 后端缓冲区必须在 CSS 尺寸变化之后重算
        window.addEventListener('game-frame:changed', () => this.resizeCanvas());

        // 游戏模式: 'stages' | 'endless' | 'daily' | 'zen'
        this.mode = 'stages';
        this.currentStageIndex = 0; // 0 to 8
        this.isPlaying = false;
        this.isPaused = false;

        // 玩家实体
        this.player = createPlayerState();

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

    resizeCanvas(...args) { return resizeCanvas(this, ...args); }

    initBackgrounds(...args) { return initBackgrounds(this, ...args); }

    generateMountainLayer(...args) { return generateMountainLayer(this, ...args); }

    initControls(...args) {
        bindKeyboardInput(this, ...args);
        return bindTouchInput(this, ...args);
    }

    initDOM(...args) { return bindDOMEvents(this, ...args); }

    loadRecords(...args) { return loadRecords(this, ...args); }

    saveRecords(...args) { return saveRecords(this, ...args); }

    showStageSelect(...args) { return showStageSelect(this, ...args); }

    showDailyCard(...args) { return showDailyCard(this, ...args); }

    startFlight(...args) { return startFlight(this, ...args); }

    seedStageEntities(...args) { return seedStageEntities(this, ...args); }

    spawnRing(...args) { return spawnRing(this, ...args); }

    spawnSpiritStone(...args) { return spawnSpiritStone(this, ...args); }

    spawnHazard(...args) { return spawnHazard(this, ...args); }

    spawnThunder(...args) { return spawnThunder(this, ...args); }

    spawnFiendBird(...args) { return spawnFiendBird(this, ...args); }

    triggerDash(...args) { return triggerDash(this, ...args); }

    triggerSwordArray(...args) { return triggerSwordArray(this, ...args); }

    triggerUltimate(...args) { return triggerUltimate(this, ...args); }

    cleaveNearbyHazards(...args) { return cleaveNearbyHazards(this, ...args); }

    checkCultivationBreakthrough(...args) { return checkCultivationBreakthrough(this, ...args); }

    getRealmName(...args) { return getRealmName(this, ...args); }

    gameLoop(...args) { return gameLoop(this, ...args); }

    update(...args) { return update(this, ...args); }

    updateSatelliteSwords(...args) { return updateSatelliteSwords(this, ...args); }

    updateSpawners(...args) { return updateSpawners(this, ...args); }

    updateEntities(...args) { return updateEntities(this, ...args); }

    handleRingThreaded(...args) { return handleRingThreaded(this, ...args); }

    handlePlayerHit(...args) { return handlePlayerHit(this, ...args); }

    handleStageVictory(...args) { return handleStageVictory(this, ...args); }

    handleGameOver(...args) { return handleGameOver(this, ...args); }

    render(...args) { return render(this, ...args); }

    renderSkyDome(...args) { return renderSkyDome(this, ...args); }

    renderMountains(...args) { return renderMountains(this, ...args); }

    renderClouds(...args) { return renderClouds(this, ...args); }

    renderFloatingIslands(...args) { return renderFloatingIslands(this, ...args); }

    renderRings(...args) { return renderRings(this, ...args); }

    renderSpiritStones(...args) { return renderSpiritStones(this, ...args); }

    renderHazards(...args) { return renderHazards(this, ...args); }

    renderThunders(...args) { return renderThunders(this, ...args); }

    renderFiendBirds(...args) { return renderFiendBirds(this, ...args); }

    renderPlayer(...args) { return renderPlayer(this, ...args); }

    renderSatelliteSwords(...args) { return renderSatelliteSwords(this, ...args); }

    renderParticles(...args) { return renderParticles(this, ...args); }

    spawnSparkle(...args) { return spawnSparkle(this, ...args); }

    spawnRingBurst(...args) { return spawnRingBurst(this, ...args); }

    spawnShatterParticles(...args) { return spawnShatterParticles(this, ...args); }

    spawnShockwave(...args) { return spawnShockwave(this, ...args); }

    spawnSwordWave(...args) { return spawnSwordWave(this, ...args); }

    spawnLotusAscension(...args) { return spawnLotusAscension(this, ...args); }

    spawnLightningEffect(...args) { return spawnLightningEffect(this, ...args); }

    setGameplayHudVisible(...args) { return setGameplayHudVisible(this, ...args); }

    setTouchControlsVisible(...args) { return setTouchControlsVisible(this, ...args); }

    refreshPauseButton(...args) { return refreshPauseButton(this, ...args); }

    updateHUD(...args) { return updateHUD(this, ...args); }

    updateRealmDisplay(...args) { return updateRealmDisplay(this, ...args); }

    updateSideRecords(...args) { return updateSideRecords(this, ...args); }

    showToast(...args) { return showToast(this, ...args); }

    togglePause(...args) { return togglePause(this, ...args); }

    pauseGame(...args) { return pauseGame(this, ...args); }

    resumeGame(...args) { return resumeGame(this, ...args); }

    pauseQuiet(...args) { return pauseQuiet(this, ...args); }

    resumeQuiet(...args) { return resumeQuiet(this, ...args); }

    isRunning(...args) { return isRunning(this, ...args); }

    restartGame(...args) { return restartGame(this, ...args); }

    returnToMenu(...args) { return returnToMenu(this, ...args); }

    async openLeaderboardModal(...args) { return openLeaderboardModal(this, ...args); }

    renderLeaderboardList(...args) { return renderLeaderboardList(this, ...args); }

    async submitScoreToLeaderboard(...args) { return submitScoreToLeaderboard(this, ...args); }

    applyLanguage(...args) { return applyLanguage(this, ...args); }
}
