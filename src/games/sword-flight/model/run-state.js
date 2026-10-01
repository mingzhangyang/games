/** Run-state reset and persistence for Sword Flight. */
import { storageGet, storageSet } from '../../../platform/safe-storage.js';
import { track } from '../../../platform/analytics.js';
import { SFX } from '../audio.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH, STORAGE_KEYS } from '../config.js';

export function loadRecords(game) {
    game.unlockedStage = parseInt(storageGet(STORAGE_KEYS.UNLOCKED_STAGE) || '1', 10);
    try {
        game.stageStars = JSON.parse(storageGet(STORAGE_KEYS.STAGE_STARS) || '{}');
    } catch (e) {
        game.stageStars = {};
    }
    game.endlessBest = parseInt(storageGet(STORAGE_KEYS.ENDLESS_BEST) || '0', 10);
    game.maxRealm = storageGet(STORAGE_KEYS.MAX_REALM) || '炼气期';
    game.maxComboRecord = parseInt(storageGet(STORAGE_KEYS.MAX_COMBO) || '1', 10);

}

export function saveRecords(game) {
    storageSet(STORAGE_KEYS.UNLOCKED_STAGE, game.unlockedStage.toString());
    storageSet(STORAGE_KEYS.STAGE_STARS, JSON.stringify(game.stageStars));
    storageSet(STORAGE_KEYS.ENDLESS_BEST, game.endlessBest.toString());
    storageSet(STORAGE_KEYS.MAX_REALM, game.maxRealm);
    storageSet(STORAGE_KEYS.MAX_COMBO, game.maxComboRecord.toString());
    game.updateSideRecords();

}

export function startFlight(game, mode = 'stages', stageIndex = 0) {
    SFX.init();
    game.mode = mode;
    game.currentStageIndex = stageIndex;
    game.isPlaying = true;
    game.isPaused = false;
    game.setGameplayHudVisible(true);
    game.setTouchControlsVisible(true);
    game.refreshPauseButton();

    // 隐藏所有弹窗
    document.getElementById('sf-overlay-start').classList.add('hidden');
    document.getElementById('sf-overlay-pause').classList.add('hidden');
    document.getElementById('sf-overlay-victory').classList.add('hidden');
    document.getElementById('sf-overlay-gameover').classList.add('hidden');

    // 重置玩家
    game.player.x = CANVAS_WIDTH / 2;
    game.player.y = CANVAS_HEIGHT * 0.75;
    game.player.targetX = game.player.x;
    game.player.targetY = game.player.y;
    game.player.vx = 0;
    game.player.vy = 0;
    game.player.angle = 0;
    game.player.tilt = 0;
    game.player.lives = (mode === 'zen') ? 99 : 3;
    game.player.qi = 100;
    game.player.ultEnergy = 0;
    game.player.dashTimer = 0;
    game.player.invincibleTimer = 0;
    game.player.realmIndex = 0;
    game.player.swordCount = 1;
    game.player.trailHistory = [];
    for (let i = 0; i < 5; i++) {
        game.player.ribbonNodes[i] = { x: game.player.x, y: game.player.y };
    }

    game.score = 0;
    game.combo = 1;
    game.maxComboThisRun = 1;
    game.ringsThreaded = 0;
    game.distanceSoared = 0;
    game.scrollOffset = 0;
    game.worldSpeed = 5;

    // 根据模式与关卡设置目标与实体
    game.stageTargetDistance = (mode === 'stages') ? (2000 + stageIndex * 400) : Infinity;
    game.totalRingsInStage = 0;

    // 清空实体池
    game.rings = [];
    game.spiritStones = [];
    game.hazards = [];
    game.thunders = [];
    game.fiendBirds = [];
    game.windTunnels = [];
    game.particles = [];
    game.satelliteSwords = [];

    // 生成初始天道法阵与实体
    game.seedStageEntities();

    game.updateHUD();
    game.updateRealmDisplay();
    game.showToast(game.getRealmName(0));

    // Analytics
    track('sword-flight', 'play');

}
