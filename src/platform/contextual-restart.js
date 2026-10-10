/**
 * Context-sensitive topbar restart/exit action.
 *
 * The game state remains authoritative; the existing menu/result overlay
 * mutations provide lifecycle notifications. No polling, duplicate state,
 * style injection, or new CSS ownership is necessary.
 */
import { getLang } from './site-settings.js';
import { ICONS } from './icons.js';

const TEXT = {
    en: {
        retry: 'Restart current level',
        attempt: 'Reset current shot',
        discard: 'Restart this level? Your current progress will be lost.',
        exit: 'End round and return to menu',
        abandon: 'End this round? Your score and remaining time will be lost.',
    },
    zh: {
        retry: '重开当前关卡',
        attempt: '重置本次发射',
        discard: '重新开始本关？当前进度将会丢失。',
        exit: '结束本局并返回菜单',
        abandon: '结束本局并返回菜单？本局分数与剩余时间将会丢失。',
    },
};
const dismissed = overlay => overlay.hidden || overlay.classList.contains('hidden');

/**
 * Each consumer must have an xx-reset-btn and an xx-start menu plus at least
 * one result/clear overlay. The game owns active/progress/restart decisions.
 * The existing game-hidden-contract ensures .hidden wins over button display.
 */
export function bindContextualRestart({
    button, active, hasProgress, restart, purpose = 'retry',
}) {
    if (!button || !/^[a-z]{2}-reset-btn$/.test(button.id)
        || typeof active !== 'function' || typeof hasProgress !== 'function'
        || typeof restart !== 'function' || !['retry', 'exit', 'attempt'].includes(purpose)) {
        throw new Error('Contextual restart requires an existing button and explicit game callbacks');
    }
    const prefix = button.id.slice(0, 2);
    const overlays = ['start', 'clear', 'over', 'hole', 'result', 'pause']
        .map(name => document.getElementById(prefix + '-' + name))
        .filter(Boolean);
    if (!document.getElementById(prefix + '-start') || overlays.length < 2) {
        throw new Error('Contextual restart cannot observe the menu/result lifecycle for ' + prefix);
    }
    button.dataset.contextualRestart = purpose;
    if (purpose === 'exit') button.innerHTML = ICONS.close;

    const copy = () => TEXT[getLang() === 'zh' ? 'zh' : 'en'];
    const updateLabel = () => {
        const label = copy()[purpose];
        button.title = label;
        button.setAttribute('aria-label', label);
    };
    const canShow = () => Boolean(active()) && overlays.every(dismissed);
    function sync() {
        const shown = canShow();
        button.classList.toggle('hidden', !shown);
        button.disabled = !shown;
        return shown;
    }
    const requestRestart = () => {
        // Click and keyboard shortcuts share the same progress safeguard.
        if (!canShow()) {
            sync();
            return false;
        }
        if (hasProgress() && !window.confirm(copy()[purpose === 'exit' ? 'abandon' : 'discard'])) return false;
        restart();
        sync();
        return true;
    };
    button.addEventListener('click', requestRestart);
    const observer = new MutationObserver(sync);
    for (const overlay of overlays) {
        observer.observe(overlay, { attributes: true, attributeFilter: ['class', 'hidden'] });
    }
    window.addEventListener('site-settings:changed', updateLabel);
    updateLabel();
    sync();
    return {
        sync,
        requestRestart,
        disconnect() {
            observer.disconnect();
            window.removeEventListener('site-settings:changed', updateLabel);
        },
    };
}
