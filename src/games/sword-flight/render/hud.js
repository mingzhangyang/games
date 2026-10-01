/** HUD, pause state, and the persistent stats drawer contract. */
let swordFlightChrome = null;

export function setSwordFlightChrome(chrome) {
    swordFlightChrome = chrome;
}
import { getLang } from '../../../platform/site-settings.js';
import { storageGet } from '../../../platform/safe-storage.js';
import { ICONS } from '../../../platform/icons.js';
import { I18N } from '../i18n.js';
import { getDailyDateKey as dailyDateKey } from '../model/daily.js';
import { STORAGE_KEYS } from '../config.js';

export function setGameplayHudVisible(game, visible) {
    const hud = document.getElementById('sf-in-hud');
    if (hud) hud.classList.toggle('hidden', !visible);

}

export function setTouchControlsVisible(game, visible) {
    const controls = document.getElementById('sf-touch-controls');
    if (!controls) return;
    controls.classList.toggle('hidden', !visible);
    controls.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (!visible && controls.contains(document.activeElement)) {
        document.activeElement.blur();
    }

}

export function refreshPauseButton(game) {
    const button = document.getElementById('sf-btn-pause');
    const t = I18N[getLang() === 'zh' ? 'zh' : 'en'];
    if (!button || !t) return;
    button.innerHTML = game.isPaused ? ICONS.play : ICONS.pause;
    button.setAttribute('title', game.isPaused ? t.resume : t.pause);
    button.setAttribute('aria-label', game.isPaused ? t.resume : t.pause);
    swordFlightChrome?.renderPause();

}

export function updateHUD(game) {
    document.getElementById('sf-score-val').textContent = game.score.toLocaleString();
    const comboEl = document.getElementById('sf-combo-val');
    comboEl.textContent = `×${game.combo}`;
    if (game.combo > 1) {
        comboEl.style.transform = 'scale(1.25)';
        setTimeout(() => { comboEl.style.transform = 'scale(1)'; }, 150);
    }

    // 生命值仙剑状态
    for (let i = 1; i <= 3; i++) {
        const el = document.getElementById(`sf-heart-${i}`);
        if (el) {
            if (i <= game.player.lives) el.classList.remove('lost');
            else el.classList.add('lost');
        }
    }

    // 登仙进度条
    const progressFill = document.getElementById('sf-progress-fill');
    if (game.mode === 'stages') {
        const pct = Math.min(100, Math.round((game.distanceSoared / game.stageTargetDistance) * 100));
        progressFill.style.width = `${pct}%`;
    } else {
        progressFill.style.width = `${Math.min(100, (game.distanceSoared % 5000) / 50)}%`;
    }

    // 真气槽
    const qiPct = Math.round((game.player.qi / game.player.maxQi) * 100);
    document.getElementById('sf-bar-qi').style.width = `${qiPct}%`;
    document.getElementById('sf-val-qi').textContent = `${qiPct}%`;

    // 绝技槽
    const ultPct = Math.round(game.player.ultEnergy);
    document.getElementById('sf-bar-ult').style.width = `${ultPct}%`;
    document.getElementById('sf-val-ult').textContent = `${ultPct}%`;
    const ultBtn = document.getElementById('sf-touch-ult');
    if (ultBtn) ultBtn.disabled = (ultPct < 100);

}

export function updateRealmDisplay(game) {
    const realmName = game.getRealmName(game.player.realmIndex);
    document.getElementById('sf-realm-text').textContent = realmName;

}

export function updateSideRecords(game) {
    let stars = 0;
    Object.values(game.stageStars).forEach(s => { stars += s; });
    document.getElementById('sf-rec-stars').textContent = `${stars} / 27 ⭐`;
    document.getElementById('sf-rec-endless').textContent = game.endlessBest.toLocaleString();
    document.getElementById('sf-rec-realm').textContent = game.maxRealm;
    document.getElementById('sf-rec-combo').textContent = `${game.maxComboRecord} ${I18N[getLang() === 'zh' ? 'zh' : 'en'].unitRings}`;

    const dateKey = dailyDateKey();
    const dailyRecord = storageGet(`${STORAGE_KEYS.DAILY_PREFIX}${dateKey}`);
    const isZh = getLang() === 'zh';
    document.getElementById('sf-rec-daily').textContent = dailyRecord
        ? (isZh ? I18N.zh.dailyStatusDone : I18N.en.dailyStatusDone)
        : (isZh ? I18N.zh.dailyStatusUndone : I18N.en.dailyStatusUndone);

}

export function showToast(game, msg) {
    const toast = document.getElementById('sf-toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(game.toastTimer);
    game.toastTimer = setTimeout(() => {
        toast.classList.add('hidden');
    }, 1500);

}

export function togglePause(game) {
    if (!game.isPlaying) return;
    if (game.isPaused) game.resumeGame();
    else game.pauseGame();

}

export function pauseGame(game) {
    game.isPaused = true;
    game.setTouchControlsVisible(false);
    game.refreshPauseButton();
    document.getElementById('sf-overlay-pause').classList.remove('hidden');

}

export function resumeGame(game) {
    game.isPaused = false;
    game.setTouchControlsVisible(true);
    game.refreshPauseButton();
    game.lastTime = performance.now();
    document.getElementById('sf-overlay-pause').classList.add('hidden');

}

export function pauseQuiet(game) {
    if (!game.isPlaying || game.isPaused) return;
    game.isPaused = true;
    game.setTouchControlsVisible(false);
    game.refreshPauseButton();

}

export function resumeQuiet(game) {
    if (!game.isPaused) return;
    game.isPaused = false;
    game.setTouchControlsVisible(true);
    game.refreshPauseButton();
    game.lastTime = performance.now();   // 丢掉暂停期间的时间跳跃

}

export function isRunning(game) {
    return game.isPlaying && !game.isPaused;

}

export function restartGame(game) {
    document.getElementById('sf-overlay-pause').classList.add('hidden');
    game.startFlight(game.mode, game.currentStageIndex);

}
