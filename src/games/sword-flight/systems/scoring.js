/** Stage completion and run-end scoring side effects. */
import { storageSet } from '../../../platform/safe-storage.js';
import { track } from '../../../platform/analytics.js';
import { SFX } from '../audio.js';
import { STORAGE_KEYS } from '../config.js';
import { saveDailyResult } from '../model/daily.js';

export function handleStageVictory(game) {
    game.isPlaying = false;
    game.setGameplayHudVisible(false);
    game.setTouchControlsVisible(false);
    game.refreshPauseButton();
    SFX.playUltimate();

    // 计算通关星级
    let stars = 1;
    const ringRatio = game.totalRingsInStage > 0 ? (game.ringsThreaded / game.totalRingsInStage) : 0;
    if (ringRatio >= 0.75) stars++;
    if (game.player.lives === game.player.maxLives) stars++;

    const currentStageNum = game.currentStageIndex + 1;
    const prevStars = game.stageStars[currentStageNum] || 0;
    if (stars > prevStars) {
        game.stageStars[currentStageNum] = stars;
        storageSet(STORAGE_KEYS.STAGE_STARS, JSON.stringify(game.stageStars));
    }

    if (currentStageNum >= game.unlockedStage && game.unlockedStage < 9) {
        game.unlockedStage = currentStageNum + 1;
        storageSet(STORAGE_KEYS.UNLOCKED_STAGE, game.unlockedStage.toString());
    }

    game.saveRecords();

    // 展现通关面板
    const overlay = document.getElementById('sf-overlay-victory');
    overlay.classList.remove('hidden');

    document.getElementById('sf-v-score').textContent = game.score.toLocaleString();
    document.getElementById('sf-v-rings').textContent = `${Math.round(ringRatio * 100)}%`;
    document.getElementById('sf-v-combo').textContent = `×${game.maxComboThisRun}`;
    document.getElementById('sf-v-realm').textContent = game.getRealmName(game.player.realmIndex);

    const starSlots = document.querySelectorAll('.sf-star-slot');
    starSlots.forEach((slot, i) => {
        slot.textContent = i < stars ? '⭐' : '☆';
        slot.style.opacity = i < stars ? '1' : '0.35';
    });

    track('sword-flight', 'finish');

}

export function handleGameOver(game) {
    game.isPlaying = false;
    game.setGameplayHudVisible(false);
    game.setTouchControlsVisible(false);
    game.refreshPauseButton();
    if (game.mode === 'endless' && game.score > game.endlessBest) {
        game.endlessBest = game.score;
        storageSet(STORAGE_KEYS.ENDLESS_BEST, game.endlessBest.toString());
    }
    if (game.mode === 'daily') saveDailyResult(game.score);
    game.saveRecords();

    const overlay = document.getElementById('sf-overlay-gameover');
    overlay.classList.remove('hidden');

    document.getElementById('sf-go-score').textContent = game.score.toLocaleString();
    document.getElementById('sf-go-distance').textContent = `${game.distanceSoared} 里`;
    document.getElementById('sf-go-realm').textContent = game.getRealmName(game.player.realmIndex);
    document.getElementById('sf-go-rings').textContent = game.ringsThreaded.toString();

    track('sword-flight', 'finish');

}
