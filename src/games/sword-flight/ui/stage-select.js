/** Stage and daily challenge selection UI. */
import { getLang } from '../../../platform/site-settings.js';
import { I18N } from '../i18n.js';
import { getDailyDateString as dailyDateStr } from '../model/daily.js';

export function showStageSelect(game) {
    const wrap = document.getElementById('sf-stage-select-wrap');
    const grid = document.getElementById('sf-stage-grid');
    const starsTotal = document.getElementById('sf-stage-stars-total');
    const lang = getLang();
    const isZh = lang === 'zh';
    const t = I18N[isZh ? 'zh' : 'en'];

    let totalStars = 0;
    grid.innerHTML = '';

    t.stages.forEach((st, idx) => {
        const stageNum = idx + 1;
        const isUnlocked = stageNum <= game.unlockedStage;
        const stars = game.stageStars[stageNum] || 0;
        totalStars += stars;

        const card = document.createElement('button');
        card.type = 'button';
        card.className = `sf-stage-card ${isUnlocked ? '' : 'locked'}`;
        card.disabled = !isUnlocked;
        card.setAttribute('aria-label', isUnlocked ? st.name : `${st.name} · 🔒`);
        card.innerHTML = `
                <span class="sf-stage-num">${isUnlocked ? (isZh ? `第${stageNum}重` : `Realm ${stageNum}`) : '🔒'}</span>
                <span class="sf-stage-name">${st.name}</span>
                <span class="sf-stage-stars">${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>
            `;

        if (isUnlocked) {
            card.addEventListener('click', () => {
                game.startFlight('stages', idx);
            });
        }
        grid.appendChild(card);
    });

    starsTotal.textContent = `⭐ ${totalStars}/27`;
    wrap.classList.remove('hidden');
    document.getElementById('sf-daily-card').classList.add('hidden');
    document.getElementById('sf-overlay-start').scrollTop = 0;

}

export function showDailyCard(game) {
    const wrap = document.getElementById('sf-stage-select-wrap');
    wrap.classList.add('hidden');
    const dailyCard = document.getElementById('sf-daily-card');
    dailyCard.classList.remove('hidden');

    const dateStr = dailyDateStr();
    document.getElementById('sf-daily-date').textContent = `${getLang() === 'zh' ? '今日仙历' : 'Daily Date'}：${dateStr}`;
    document.getElementById('sf-overlay-start').scrollTop = 0;

}
