// Daily Hub：固定任务的完成态、今日对局总数、「更多每日 (N)」入口、全站昵称输入框。
// 任务由 gen 从 registry 的 home.hub 输出（registry:begin home-hub），每项的 data-done-keys 是该游戏
// daily.doneKey 的存储键模板，任一键今天（UTC+8）存在即完成；这里不再认识具体游戏。
import { todayKey, todayKeyDisplay } from '../platform/daily.js';
import { storageGet, storageSet } from '../platform/safe-storage.js';
import { setFilter } from './filter.js';
import { currentLang, t } from './i18n.js';

const STATS_URL = 'https://games-analytics.orangely.workers.dev/stats?day=';
const LEGACY_NAME_KEYS = ['tetris_username', 'pm_username', 'hs_username'];

const expandKey = (template, compact, iso) => template.replace('{YYYYMMDD}', compact).replace('{YYYY-MM-DD}', iso);

export function updateDailyHub() {
    const iso = todayKeyDisplay();
    const compact = todayKey();
    const tasks = [...document.querySelectorAll('.daily-task[data-done-keys]')];
    let doneCount = 0;
    for (const task of tasks) {
        const done = task.dataset.doneKeys.split(/\s+/).some(k => storageGet(expandKey(k, compact, iso)));
        if (done) doneCount++;
        task.classList.toggle('done', done);
        const status = task.querySelector('.daily-task-status');
        if (status) status.textContent = done ? '✅' : '⚪';
    }
    const progress = document.getElementById('hub-progress');
    if (progress) {
        progress.textContent = `${doneCount}/${tasks.length}`;
        progress.classList.toggle('all-done', tasks.length > 0 && doneCount === tasks.length);
    }
    const nameInput = document.getElementById('player-name');
    if (nameInput && document.activeElement !== nameInput) {
        nameInput.value = storageGet('player_name') || LEGACY_NAME_KEYS.map(storageGet).find(Boolean) || '';
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

/** 「更多每日 (N)」：N = 带「每日」胶囊的卡减去 Hub 已列出的任务，点击走筛选条的 #cat=daily */
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
