/** DOM-heavy menus, leaderboard, and language binding. */
import { getLang } from '../../../platform/site-settings.js';
import { ICONS } from '../../../platform/icons.js';
import { updateMoreGames } from '../../../platform/more-games.js';
import { submitScore, fetchBoard, escapeHTML } from '../../../platform/leaderboard.js';
import { I18N } from '../i18n.js';
import {
    getDailyDateKey as dailyDateKey,
    getDailyLeaderboardKey,
} from '../model/daily.js';

export function returnToMenu(game) {
    game.isPlaying = false;
    game.isPaused = false;
    game.score = 0;
    game.combo = 1;
    game.setGameplayHudVisible(false);
    game.setTouchControlsVisible(false);
    game.refreshPauseButton();
    document.getElementById('sf-overlay-pause').classList.add('hidden');
    document.getElementById('sf-overlay-victory').classList.add('hidden');
    document.getElementById('sf-overlay-gameover').classList.add('hidden');
    document.getElementById('sf-stage-select-wrap').classList.add('hidden');
    document.getElementById('sf-daily-card').classList.add('hidden');
    document.getElementById('sf-overlay-start').scrollTop = 0;
    document.getElementById('sf-overlay-start').classList.remove('hidden');
    game.loadRecords();
    game.updateHUD();
    game.updateSideRecords();

}

export async function openLeaderboardModal(game, tab = 'endless') {
    const modal = document.getElementById('sf-rank-modal');
    modal.classList.remove('hidden');
    const list = document.getElementById('sf-rank-list');
    list.innerHTML = `<div class="sf-rank-loading">${I18N[getLang() === 'zh' ? 'zh' : 'en'].loadingRank}</div>`;

    const tabEndless = document.getElementById('sf-tab-endless');
    const tabDaily = document.getElementById('sf-tab-daily');
    if (tab === 'endless') {
        tabEndless.classList.add('active');
        tabDaily.classList.remove('active');
    } else {
        tabDaily.classList.add('active');
        tabEndless.classList.remove('active');
    }

    // 修复：此处曾用本地时区 new Date() 算读取键，与提交侧 dailyDateKey()（UTC+8）
    // 不一致，UTC+8 以外的玩家提交到 A 键、读取 B 键，每日榜恒为空。
    const dateKey = dailyDateKey();
    const gameKey = (tab === 'endless') ? 'sword-flight' : getDailyLeaderboardKey(dateKey);

    try {
        const data = await fetchBoard(gameKey);
        game.renderLeaderboardList(data);
    } catch (e) {
        list.innerHTML = `<div class="sf-rank-loading">${I18N[getLang() === 'zh' ? 'zh' : 'en'].noRankData}</div>`;
    }

}

export function renderLeaderboardList(game, data) {
    const list = document.getElementById('sf-rank-list');
    list.innerHTML = '';
    if (!data || data.length === 0) {
        list.innerHTML = `<div class="sf-rank-loading">${I18N[getLang() === 'zh' ? 'zh' : 'en'].noRankData}</div>`;
        return;
    }

    data.slice(0, 30).forEach((entry, idx) => {
        const item = document.createElement('div');
        const topClass = idx === 0 ? 'top1' : idx === 1 ? 'top2' : idx === 2 ? 'top3' : '';
        item.className = `sf-rank-item ${topClass}`;
        // 剥字符正则退役：escapeHTML 转义而非删除（原名 "A & B" 不再丢 &）
        const safeName = escapeHTML(entry.name || '无名剑仙');
        item.innerHTML = `
                <span><b>#${idx + 1}</b> ${safeName}</span>
                <b>${entry.score.toLocaleString()}</b>
            `;
        list.appendChild(item);
    });

}

export async function submitScoreToLeaderboard(game, name, score) {
    if (game.mode !== 'endless' && game.mode !== 'daily') return false;

    const fb = document.getElementById('sf-submit-feedback');
    fb.classList.remove('hidden');
    fb.textContent = I18N[getLang() === 'zh' ? 'zh' : 'en'].submitting;

    const gameKey = game.mode === 'daily'
        ? getDailyLeaderboardKey(game.dailyDateKey || dailyDateKey())
        : 'sword-flight';

    // 网络层收敛到 src/platform/leaderboard.js（原无超时，统一补齐；false=未进全球榜）
    const ok = await submitScore({ game: gameKey, name, score });
    if (ok) {
        fb.textContent = I18N[getLang() === 'zh' ? 'zh' : 'en'].scoreSubmitted;
    } else {
        fb.textContent = I18N[getLang() === 'zh' ? 'zh' : 'en'].scoreSubmitFailed;
    }
    return ok;

}

export function applyLanguage(game) {
    const lang = getLang() === 'zh' ? 'zh' : 'en';
    const t = I18N[lang];
    // HTML 里静态写的是 zh-CN；加载时若全站语言是 en，这里要把它纠正过来
    // （语言切换已于 2026-09-21 收敛到首页，这里只能靠 boot 时纠正一次）。
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';

    // 页脚操作提示（契约里 hint 不归 chrome，由各页自己的 applyLanguage 写）
    const sfHint = document.getElementById('sf-hint');

    document.getElementById('sf-howto-box').innerHTML = t.howTo;


    const touchLabels = [
        ['sf-touch-array-lbl', 'sf-touch-array', t.touchArray, t.touchArrayLabel],
        ['sf-touch-ult-lbl', 'sf-touch-ult', t.touchUlt, t.touchUltLabel],
        ['sf-touch-dash-lbl', 'sf-touch-dash', t.touchDash, t.touchDashLabel],
    ];
    touchLabels.forEach(([textId, buttonId, text, label]) => {
        const textNode = document.getElementById(textId);
        const button = document.getElementById(buttonId);
        if (textNode) textNode.textContent = text;
        if (button) button.setAttribute('aria-label', label);
    });


    document.getElementById('sf-btn-menu').innerHTML = `${ICONS.home}<span>${t.home}</span>`;

    document.getElementById('sf-btn-victory-menu').innerHTML = `${ICONS.home}<span>${t.home}</span>`;

    document.getElementById('sf-btn-go-menu').innerHTML = `${ICONS.home}<span>${t.home}</span>`;
    document.getElementById('sf-player-name-input').placeholder = t.namePlaceholder;

    // 侧边栏
    document.getElementById('sf-side-rules-text').innerHTML = t.sideRulesText;

    [
        ['sf-sc-steer-key', t.scSteerKey],
        ['sf-sc-keyboard-key', t.scKeybKey],
        ['sf-sc-dash-key', t.scDashKey],
        ['sf-sc-array-key', t.scArrayKey],
        ['sf-sc-ult-key', t.scUltKey],
        ['sf-sc-pause-key', t.scPauseKey],
    ].forEach(([id, text]) => {
        const node = document.getElementById(id);
        if (node) node.textContent = text;
    });

    updateMoreGames(lang);

    // 每日卡标签
    const dailyMod = document.getElementById('sf-daily-modifier');

    game.updateRealmDisplay();
    game.updateSideRecords();
    game.refreshPauseButton();
    if (!document.getElementById('sf-stage-select-wrap').classList.contains('hidden')) {
        game.showStageSelect();
    }

}
