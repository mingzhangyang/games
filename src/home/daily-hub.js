// Daily Hub：三项固定任务的完成态（读各游戏写下的存储键，均为 UTC+8 日期）、今日对局总数、
// 「更多每日 (N)」入口、全站昵称输入框。
import { todayKey, todayKeyDisplay } from '../platform/daily.js';
import { getPlayerName } from '../platform/player.js';
import { storageGet, storageSet } from '../platform/safe-storage.js';
import { setFilter } from './filter.js';
import { currentLang, t } from './i18n.js';

const STATS_URL = 'https://games-analytics.orangely.workers.dev/stats?day=';

function setTask(id, done) {
    const task = document.getElementById(id);
    if (!task) return;
    task.classList.toggle('done', done);
    const status = task.querySelector('.daily-task-status');
    if (status) status.textContent = done ? '✅' : '⚪';
}

export function updateDailyHub() {
    const iso = todayKeyDisplay();
    const compact = todayKey();
    const wordDone = [`wd_daily_${iso}_en`, `wd_daily_${iso}_en_4`, `wd_daily_${iso}_en_5`, `wd_daily_${iso}_en_6`, `wd_daily_${iso}_zh`]
        .some(k => storageGet(k));
    const mergeDone = !!storageGet(`pm_daily_${compact}`);
    const gravityDone = !!storageGet(`gs_daily_${compact}`);
    const doneCount = [wordDone, mergeDone, gravityDone].filter(Boolean).length;
    setTask('hub-task-word', wordDone);
    setTask('hub-task-merge', mergeDone);
    setTask('hub-task-gravity', gravityDone);
    const progress = document.getElementById('hub-progress');
    if (progress) {
        progress.textContent = `${doneCount}/3`;
        progress.classList.toggle('all-done', doneCount === 3);
    }
    const nameInput = document.getElementById('player-name');
    if (nameInput && document.activeElement !== nameInput) {
        nameInput.value = getPlayerName() || '';
    }
    fetch(STATS_URL + compact)
        .then(r => (r.ok ? r.json() : Promise.reject(new Error('offline'))))
        .then(s => {
            const el = document.getElementById('hub-total');
            if (el && s?.total?.p > 0) {
                el.textContent = currentLang() === 'zh'
                    ? `🔥 今日已玩 ${s.total.p} ${t('hubTotalPlayed', '次今日对局')}`
                    : `🔥 ${s.total.p} plays today`;
                el.hidden = false;
            }
        })
        .catch(() => {});
}

/** 「更多每日 (N)」：N = 带「每日」胶囊的卡减去 Hub 已列出的三项，点击走筛选条的 #cat=daily */
function bindMoreDaily() {
    const more = document.getElementById('hub-more-daily');
    if (!more) return;
    const listed = [...document.querySelectorAll('.daily-task[href]')].map(a => a.getAttribute('href'));
    const n = [...document.querySelectorAll('.game-card')]
        .filter(c => c.querySelector('.card-chip--daily') && !listed.includes(c.getAttribute('href'))).length;
    document.getElementById('hub-more-count').textContent = String(n);
    more.hidden = !n;
    more.addEventListener('click', e => { e.preventDefault(); setFilter('daily', true); });
}

function bindNameInput() {
    const input = document.getElementById('player-name');
    if (!input) return;
    input.addEventListener('change', () => {
        const clean = String(input.value).replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().slice(0, 20);
        input.value = clean;
        storageSet('player_name', clean);
    });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
}

export function bindDailyHub() {
    bindMoreDaily();
    bindNameInput();
    updateDailyHub();
}
