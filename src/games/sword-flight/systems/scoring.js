/** Stage completion and run-end scoring side effects. */
import { getLang } from '../../../platform/site-settings.js';
import { track } from '../../../platform/analytics.js';
import { SFX } from '../audio.js';
import { I18N } from '../i18n.js';
import { SWORD_FLIGHT_STORAGE, SWORD_FLIGHT_STORAGE_SLOTS } from '../storage.js';
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
        SWORD_FLIGHT_STORAGE.set(SWORD_FLIGHT_STORAGE_SLOTS.STAGE_STARS, game.stageStars);
    }

    if (currentStageNum >= game.unlockedStage && game.unlockedStage < 9) {
        game.unlockedStage = currentStageNum + 1;
        SWORD_FLIGHT_STORAGE.set(SWORD_FLIGHT_STORAGE_SLOTS.UNLOCKED_STAGE, game.unlockedStage);
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
        SWORD_FLIGHT_STORAGE.set(SWORD_FLIGHT_STORAGE_SLOTS.ENDLESS_BEST, game.endlessBest);
    }
    if (game.mode === 'daily') saveDailyResult(game.score, game.dailyDateKey || undefined);
    game.saveRecords();

    const leaderboardEligible = game.mode === 'endless' || game.mode === 'daily';
    document.getElementById('sf-name-box').classList.toggle('hidden', !leaderboardEligible);
    const submitFeedback = document.getElementById('sf-submit-feedback');
    submitFeedback.classList.add('hidden');
    submitFeedback.textContent = '';

    const overlay = document.getElementById('sf-overlay-gameover');
    overlay.classList.remove('hidden');

    document.getElementById('sf-go-score').textContent = game.score.toLocaleString();
    const lang = getLang() === 'zh' ? 'zh' : 'en';
    document.getElementById('sf-go-distance').textContent = `${Math.round(game.distanceSoared)} ${I18N[lang].unitLi}`;
    document.getElementById('sf-go-realm').textContent = game.getRealmName(game.player.realmIndex);
    document.getElementById('sf-go-rings').textContent = game.ringsThreaded.toString();

    track('sword-flight', 'finish');

}
