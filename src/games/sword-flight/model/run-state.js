/** Run-state reset and persistence for Sword Flight. */
import { track } from '../../../platform/analytics.js';
import { SFX } from '../audio.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../config.js';
import { SWORD_FLIGHT_STORAGE, SWORD_FLIGHT_STORAGE_SLOTS } from '../storage.js';
import { createDailyRandom, DAILY_MODIFIERS, getDailyDateKey } from './daily.js';

export function loadRecords(game) {
    game.unlockedStage = parseInt(
        SWORD_FLIGHT_STORAGE.get(SWORD_FLIGHT_STORAGE_SLOTS.UNLOCKED_STAGE, 1),
        10,
    );
    const stageStars = SWORD_FLIGHT_STORAGE.get(SWORD_FLIGHT_STORAGE_SLOTS.STAGE_STARS, {});
    game.stageStars = stageStars && typeof stageStars === 'object' && !Array.isArray(stageStars)
        ? stageStars
        : {};
    game.endlessBest = parseInt(
        SWORD_FLIGHT_STORAGE.get(SWORD_FLIGHT_STORAGE_SLOTS.ENDLESS_BEST, 0),
        10,
    );
    game.maxRealm = SWORD_FLIGHT_STORAGE.get(SWORD_FLIGHT_STORAGE_SLOTS.MAX_REALM, '炼气期') || '炼气期';
    game.maxComboRecord = parseInt(
        SWORD_FLIGHT_STORAGE.get(SWORD_FLIGHT_STORAGE_SLOTS.MAX_COMBO, 1),
        10,
    );
}

export function saveRecords(game) {
    SWORD_FLIGHT_STORAGE.set(SWORD_FLIGHT_STORAGE_SLOTS.UNLOCKED_STAGE, game.unlockedStage);
    SWORD_FLIGHT_STORAGE.set(SWORD_FLIGHT_STORAGE_SLOTS.STAGE_STARS, game.stageStars);
    SWORD_FLIGHT_STORAGE.set(SWORD_FLIGHT_STORAGE_SLOTS.ENDLESS_BEST, game.endlessBest);
    SWORD_FLIGHT_STORAGE.set(SWORD_FLIGHT_STORAGE_SLOTS.MAX_REALM, game.maxRealm);
    SWORD_FLIGHT_STORAGE.set(SWORD_FLIGHT_STORAGE_SLOTS.MAX_COMBO, game.maxComboRecord);
    game.updateSideRecords();
}

export function startFlight(game, mode = 'stages', stageIndex = 0) {
    SFX.init();
    game.mode = mode;
    game.currentStageIndex = stageIndex;
    game.isPlaying = true;
    game.isPaused = false;
    game.dailyDateKey = mode === 'daily' ? getDailyDateKey() : null;
    game.random = game.dailyDateKey ? createDailyRandom(game.dailyDateKey) : Math.random;
    game.dailyModifiers = mode === 'daily' ? DAILY_MODIFIERS : null;
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
    game.player.maxQi = 100;
    game.player.qi = game.player.maxQi;
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
    game.simAccumulator = 0;
    game.hitStopFrames = 0;
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
