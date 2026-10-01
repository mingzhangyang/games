/** Menu and modal event wiring. */
import { getPlayerName, setPlayerName } from '../../../platform/player.js';
import { getMuted, setMuted } from '../../../platform/site-settings.js';
import { ICONS } from '../../../platform/icons.js';
import { SFX } from '../audio.js';

export function bindDOMEvents(game) {
    document.getElementById('sf-btn-home').addEventListener('click', () => {
        location.href = 'index.html';
    });

    document.getElementById('sf-btn-pause').addEventListener('click', () => {
        SFX.init();
        game.togglePause();
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
        game.applyLanguage();
    });

    document.getElementById('sf-btn-stages').addEventListener('click', () => {
        SFX.init();
        game.showStageSelect();
    });

    document.getElementById('sf-btn-endless').addEventListener('click', () => {
        SFX.init();
        game.startFlight('endless');
    });

    document.getElementById('sf-btn-daily').addEventListener('click', () => {
        SFX.init();
        game.showDailyCard();
    });

    document.getElementById('sf-btn-start-daily').addEventListener('click', () => {
        SFX.init();
        game.startFlight('daily');
    });

    document.getElementById('sf-btn-zen').addEventListener('click', () => {
        SFX.init();
        game.startFlight('zen');
    });

    document.getElementById('sf-btn-resume').addEventListener('click', () => game.resumeGame());
    document.getElementById('sf-btn-restart').addEventListener('click', () => game.restartGame());
    document.getElementById('sf-btn-menu').addEventListener('click', () => game.returnToMenu());

    document.getElementById('sf-btn-next-stage').addEventListener('click', () => {
        if (game.currentStageIndex < 8) {
            game.currentStageIndex++;
            game.startFlight('stages', game.currentStageIndex);
        } else {
            game.returnToMenu();
        }
    });
    document.getElementById('sf-btn-stage-replay').addEventListener('click', () => {
        game.startFlight('stages', game.currentStageIndex);
    });
    document.getElementById('sf-btn-victory-menu').addEventListener('click', () => game.returnToMenu());

    document.getElementById('sf-btn-go-replay').addEventListener('click', () => {
        game.startFlight(game.mode, game.currentStageIndex);
    });
    document.getElementById('sf-btn-go-menu').addEventListener('click', () => game.returnToMenu());

    const nameInput = document.getElementById('sf-player-name-input');
    nameInput.value = getPlayerName() || '';
    document.getElementById('sf-btn-submit-score').addEventListener('click', () => {
        const name = nameInput.value.trim() || '无名剑仙';
        setPlayerName(name);
        game.submitScoreToLeaderboard(name, game.score);
    });

    document.getElementById('sf-btn-open-rank').addEventListener('click', () => {
        game.openLeaderboardModal('endless');
    });
    document.getElementById('sf-btn-close-rank').addEventListener('click', () => {
        document.getElementById('sf-rank-modal').classList.add('hidden');
    });
    document.getElementById('sf-tab-endless').addEventListener('click', () => {
        game.openLeaderboardModal('endless');
    });
    document.getElementById('sf-tab-daily').addEventListener('click', () => {
        game.openLeaderboardModal('daily');
    });
}
