/**
 * Lumen 的 DOM 层：元素查找、文案、选关网格、HUD、提示、侧栏战绩、结算面板。
 * 只接收数据、只回调意图（bind 的 handlers），不读写对局状态、不碰存储与网络。
 */
import { ICONS } from '../../../platform/icons.js';
import { CHAPTERS, LEVELS_PER_CHAPTER, LUMEN_LEVELS } from '../model/levels.js';

const IDS = [
    'lm-canvas', 'lm-btn-home', 'lm-hud-level', 'lm-flips', 'lm-par', 'lm-reset-btn', 'lm-mute-btn', 'lm-toast',
    'lm-start', 'lm-btn-levels', 'lm-btn-daily', 'lm-level-grid', 'lm-daily-best',
    'lm-side-howto-title', 'lm-side-records-title', 'lm-side-records',
    'lm-clear', 'lm-clear-stars', 'lm-clear-line', 'lm-btn-next', 'lm-btn-replay', 'lm-btn-menu1',
    'lm-over', 'lm-over-title', 'lm-over-score', 'lm-over-sub',
    'lm-btn-again', 'lm-btn-copy', 'lm-btn-menu2',
    'lm-lb-title', 'lm-lb-list', 'lm-lb-status', 'lm-username',
];

/** 关卡编号「章-关」，如 2-3 */
export function levelLabel(i) {
    return `${Math.floor(i / LEVELS_PER_CHAPTER) + 1}-${(i % LEVELS_PER_CHAPTER) + 1}`;
}

/** 剪贴板（含 execCommand 兜底），返回是否成功 */
export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (e) {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            ta.remove();
            return ok;
        } catch (e2) {
            return false;
        }
    }
}

const sumStars = list => list.reduce((a, b) => a + (b || 0), 0);

export class LumenView {
    constructor(doc = document) {
        this.el = {};
        for (const id of IDS) {
            const el = doc.getElementById(id);
            if (el) this.el[id.replace(/^lm-/, '')] = el;
        }
        this.lang = 'en';
        this.t = null;
        this.toastTimer = 0;
    }

    get canvas() { return this.el.canvas; }

    chapterName(ch) {
        const c = CHAPTERS[ch];
        return c ? c.name[this.lang] || c.name.en : '';
    }

    /** 用户意图 → handlers（runtime 提供）；选关网格用事件委托，重绘不重绑 */
    bind(h) {
        const on = (key, fn) => this.el[key]?.addEventListener('click', fn);
        on('btn-home', h.home);
        on('btn-levels', h.levels);
        on('btn-daily', h.daily);
        on('btn-next', h.next);
        on('btn-replay', h.replay);
        on('btn-menu1', h.menu);
        on('btn-menu2', h.menu);
        on('btn-again', h.again);
        on('btn-copy', h.copy);
        on('mute-btn', h.mute);
        this.el['level-grid']?.addEventListener('click', (e) => {
            const chip = e.target.closest('[data-level]');
            if (chip) h.pickLevel(Number(chip.dataset.level));
        });
        this.el.username?.addEventListener('change', () => h.rename(this.el.username.value));
    }

    setLanguage(lang, t) {
        this.lang = lang;
        this.t = t;
        const el = this.el;
        document.documentElement.lang = lang;
        document.title = lang === 'zh' ? '折光 Lumen — 光束折射解谜' : 'Lumen — Beam Refraction Puzzle';
        const label = (key, icon, text) => { if (el[key]) el[key].innerHTML = `${icon}<span>${text}</span>`; };
        label('btn-next', ICONS.arrowRight, t.next);
        label('btn-replay', ICONS.retry, t.retry);
        label('btn-menu1', ICONS.home, t.menu);
        label('btn-menu2', ICONS.home, t.menu);
        label('btn-again', ICONS.retry, t.again);
        label('btn-copy', ICONS.copy, t.copyResult);
        if (el['lb-title']) el['lb-title'].textContent = `🏆 ${t.leaderboard}`;
        if (el['side-howto-title']) el['side-howto-title'].textContent = `📖 ${t.sideHowTo}`;
        if (el['side-records-title']) el['side-records-title'].textContent = `🏅 ${t.sideRecords}`;
    }

    /** 一章一行（5 列网格 × 5 关），章节色只调边框 / 编号颜色 */
    renderLevelGrid(stars) {
        const grid = this.el['level-grid'];
        if (!grid) return;
        grid.textContent = '';
        LUMEN_LEVELS.forEach((lv, i) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'lm-level-chip game-start-level-chip';
            chip.dataset.chapter = String(lv.chapter);
            chip.dataset.level = String(i);
            const label = levelLabel(i);
            const n = stars[i] || 0;
            chip.title = `${this.chapterName(lv.chapter)} · ${label}`;
            // aria-label 会覆盖子节点文字：星级必须写进可访问名，否则读屏分不清玩过没玩过
            chip.setAttribute('aria-label', `${chip.title} · ${this.t.stars} ${n}/3`);
            const num = document.createElement('span');
            num.className = 'lm-chip-num game-start-chip-num';
            num.textContent = label;
            const starLine = document.createElement('span');
            starLine.className = 'lm-chip-stars game-start-chip-stars';
            starLine.textContent = n > 0 ? '⭐'.repeat(n) : '☆☆☆';
            chip.append(num, starLine);
            grid.appendChild(chip);
        });
    }

    renderDailyBest(best) {
        if (!this.el['daily-best']) return;
        this.el['daily-best'].textContent = best ? `📅 ${this.t.bestToday}: ${best} ${this.t.flipsWord}` : '';
    }

    renderRecords(stars, best) {
        const box = this.el['side-records'];
        if (!box) return;
        const t = this.t;
        const rows = [
            [`📅 ${t.bestToday}`, best ? `${best} ${t.flipsWord}` : '—'],
            [`⭐ ${t.stars}`, `${sumStars(stars)}/${LUMEN_LEVELS.length * 3}`],
        ];
        CHAPTERS.forEach((ch, ci) => {
            const got = sumStars(stars.slice(ci * LEVELS_PER_CHAPTER, (ci + 1) * LEVELS_PER_CHAPTER));
            rows.push([`${ci + 1} · ${this.chapterName(ci)}`, `${got}/${LEVELS_PER_CHAPTER * 3}`]);
        });
        box.textContent = '';
        for (const [label, value] of rows) {
            const row = document.createElement('div');
            row.className = 'lm-side-row game-side-row';
            const labelEl = document.createElement('span');
            labelEl.textContent = label;
            const valueEl = document.createElement('b');
            valueEl.textContent = value;
            row.append(labelEl, valueEl);
            box.appendChild(row);
        }
    }

    renderHud({ daily, levelIdx, flips, par }) {
        const t = this.t;
        if (this.el['hud-level']) {
            this.el['hud-level'].textContent = daily ? `📅 ${t.daily}` : `${t.level} ${levelLabel(levelIdx)}`;
        }
        if (this.el.flips) this.el.flips.textContent = String(flips);
        if (this.el.par) this.el.par.textContent = `· ${t.par} ${par}`;
    }

    toast(text, duration = 1500, warn = false) {
        const toast = this.el.toast;
        if (!toast) return;
        toast.textContent = text;
        toast.classList.remove('hidden');
        toast.classList.toggle('warn', warn);
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => toast.classList.add('hidden'), duration);
    }

    hideOverlays() {
        for (const key of ['start', 'clear', 'over']) this.el[key]?.classList.add('hidden');
    }

    showStart() {
        this.hideOverlays();
        this.el.start?.classList.remove('hidden');
    }

    showClear({ stars, flips, par }) {
        const t = this.t;
        if (this.el['clear-stars']) this.el['clear-stars'].textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
        if (this.el['clear-line']) this.el['clear-line'].textContent = `${t.flips} ${flips} · ${t.par} ${par}`;
        this.el.clear?.classList.remove('hidden');
    }

    showDailyResult({ score, isBest, best, playerName }) {
        const t = this.t;
        if (this.el['over-title']) this.el['over-title'].textContent = `📅 ${t.dailyDone}`;
        if (this.el['over-score']) this.el['over-score'].textContent = `${score} ${t.flipsWord}`;
        if (this.el['over-sub']) this.el['over-sub'].textContent = isBest ? `🌟 ${t.bestToday}` : `${t.bestToday}: ${best}`;
        if (this.el.username) this.el.username.value = playerName;
        this.el.over?.classList.remove('hidden');
    }

    isDailyResultOpen() {
        return !!this.el.over && !this.el.over.classList.contains('hidden');
    }

    renderMute(muted) {
        const btn = this.el['mute-btn'];
        if (!btn) return;
        btn.innerHTML = muted ? ICONS.soundOff : ICONS.soundOn;
        btn.title = this.t.sound;
        btn.setAttribute('aria-label', this.t.sound);
        btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
    }

    /** 复制结果的按钮反馈：1.2 秒后恢复图标 + 文案 */
    copyFeedback(ok) {
        const btn = this.el['btn-copy'];
        if (!btn) return;
        const t = this.t;
        btn.textContent = ok ? `✅ ${t.copied}` : `📋 ${t.copyResult}`;
        setTimeout(() => { btn.innerHTML = `${ICONS.copy}<span>${t.copyResult}</span>`; }, 1200);
    }
}
