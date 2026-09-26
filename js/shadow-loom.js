/**
 * 影织 Shadow Loom — 纸艺剧场投影解谜（设计方案 docs/proposal-shadow-loom-design.md）
 * =====================================================================================
 * 移动悬挂在不同深度的剪纸（中后期还有灯本身），让散乱的影子在纸幕上「织」成一个意象。
 *
 * 分层（设计方案 §15）：stage background → paper screen → frame / strings → paper pieces
 * → lamp → projected shadows → dynamic lighting → HUD → success outline / living shadow。
 * 纸片位置、灯位、投影全部由同一份实时状态驱动：画出来的影子与判定用的 mask
 * 都来自 js/shadow-loom-rules.js 的同一组多边形（§6.1 / §8）。
 *
 * 状态机：menu → playing → solving（收紧 → 金线 → 活影）→ done（结果层）
 */
import { onReady } from './boot.js';
import { makeText } from './i18n.js';
import { bindChrome } from './game-chrome.js';
import { bindFrame } from './game-frame.js';
import { createStatsDrawer } from './game-drawer.js';
import { ICONS } from './icons.js';
import { createSfxEngine } from './game-sfx.js';
import { getLang } from './site-settings.js';
import { storageGet, storageSet } from './safe-storage.js';
import { track } from './analytics.js';
import { renderMoreGames } from './more-games.js';
import * as R from './shadow-loom-rules.js';
import { LEVELS, CHAPTERS } from './shadow-loom-levels.js';

const LANGUAGES = makeText({
    en: {
        brand: 'Shadow Loom',
        title: 'Shadow Loom',
        subtitle: '影织 · A paper theatre',
        copy: 'Behind the paper screen hang cut-outs at different depths. Move them — and later the lamp — until their scattered shadows weave into one living shape.',
        begin: 'Enter the theatre',
        beginAgain: 'Play from the start',
        levelSelect: 'Scenes',
        progress: 'Progress',
        targetBtn: 'Show the target shape',
        stats: 'Stats',
        sideHowToTitle: 'How to play',
        sideHowTo: 'Drag a paper cut-out and watch its shadow, not the paper. Pieces near the lamp throw big shadows that swing far; pieces near the screen barely move theirs. When the outline starts to glow like golden thread, you are close.',
        sideRecordsTitle: 'Scenes woven',
        sideKeysTitle: 'Keys',
        keySelect: 'Pick a cut-out',
        keyLamp: 'Pick the lamp',
        keyMove: 'Nudge (Shift = fine)',
        keyRotate: 'Turn (where allowed)',
        keyReset: 'Reset the scene',
        hint: 'Drag the paper cut-outs (and the lamp, when it glows) until the shadows weave into the shape.',
        hintRotate: 'Drag a cut-out; drag the brass knob on its ring to turn it.',
        resetToast: 'Scene reset',
        pinnedToast: 'This piece is pinned — move the lamp instead.',
        lampFixedToast: 'The lamp is fixed in this scene.',
        chapterIntro: {
            2: 'Layers — the same drag moves each shadow a different distance.',
            3: 'Lamp Walk — the lamp moves now. Pinned pieces follow only the light.',
            4: 'Turning — drag the brass knob to turn a cut-out.',
            5: 'Living Shadow — the outline shows only at first. Tap the icon above to recall it.',
        },
        wovenKicker: 'The shadow comes alive',
        time: 'Time',
        moves: 'Moves',
        match: 'Best match',
        firstTry: 'First try',
        yes: 'Yes',
        no: '—',
        next: 'Next scene',
        replay: 'Weave again',
        menu: 'Scenes',
        allDone: 'Every scene woven',
        notYet: 'not yet',
        canvasAria: 'Paper theatre: move the paper cut-outs and the lamp until their shadows weave into the shape',
        docTitle: 'Shadow Loom — Paper Shadow Puzzle',
    },
    zh: {
        brand: '影织',
        title: '影织',
        subtitle: 'Shadow Loom · 纸艺剧场',
        copy: '纸幕前悬着深浅不同的剪纸。移动它们——之后还有那盏灯——让散乱的影子慢慢重合，织成一个会动的生命。',
        begin: '走进剧场',
        beginAgain: '从头再织',
        levelSelect: '场景',
        progress: '进度',
        targetBtn: '显示目标剪影',
        stats: '数据统计',
        sideHowToTitle: '怎么玩',
        sideHowTo: '拖动剪纸，但要看的是影子。靠近灯的纸片投影大、一动就跑很远；靠近纸幕的纸片影子几乎跟着走。轮廓开始像金线一样发亮时，就快成了。',
        sideRecordsTitle: '已织成',
        sideKeysTitle: '按键',
        keySelect: '选择剪纸',
        keyLamp: '选择灯',
        keyMove: '微调（Shift 更细）',
        keyRotate: '旋转（开放时）',
        keyReset: '重置场景',
        hint: '拖动剪纸（灯亮起光环时也能拖灯），让影子织成目标剪影。',
        hintRotate: '拖动剪纸；拖动圆环上的铜钮可以旋转。',
        resetToast: '场景已重置',
        pinnedToast: '这片剪纸被钉住了——试试移动灯。',
        lampFixedToast: '这一幕的灯是固定的。',
        chapterIntro: {
            2: '错层 —— 同样的拖动，每个影子走的距离都不一样。',
            3: '灯行 —— 灯可以移动了。钉住的纸片只听光的话。',
            4: '回旋 —— 拖动铜钮可以旋转剪纸。',
            5: '活影 —— 轮廓只在开场浮现，轻触上方图标可以再看一眼。',
        },
        wovenKicker: '影子活过来了',
        time: '用时',
        moves: '移动',
        match: '最高匹配',
        firstTry: '一次完成',
        yes: '是',
        no: '—',
        next: '下一幕',
        replay: '再织一次',
        menu: '场景',
        allDone: '所有场景都已织成',
        notYet: '未完成',
        canvasAria: '纸艺剧场：移动剪纸和灯，让影子织成目标剪影',
        docTitle: '影织 Shadow Loom — 纸影解谜',
    },
});

const W = R.STAGE.w;
const H = R.STAGE.h;
const RAIL_Y = 40;
const PROGRESS_KEY = 'sl_progress';
const SEEN_KEY = 'sl_seen_chapters';
const SNAP_S = 0.45;
const SWEEP_S = 0.8;
const RESULT_AT_S = SNAP_S + SWEEP_S + 2.2;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = t => 1 - (1 - t) ** 3;
const smooth = t => t * t * (3 - 2 * t);

function pathPolys(ctx, polys) {
    ctx.beginPath();
    for (const poly of polys) {
        ctx.moveTo(poly[0][0], poly[0][1]);
        for (let k = 1; k < poly.length; k++) ctx.lineTo(poly[k][0], poly[k][1]);
        ctx.closePath();
    }
}

function fmtTime(ms) {
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function readJson(key, fallback) {
    try {
        const raw = storageGet(key);
        const v = raw ? JSON.parse(raw) : null;
        return v && typeof v === 'object' ? v : fallback;
    } catch (e) {
        return fallback;
    }
}

class ShadowLoomGame {
    constructor() {
        this.canvas = document.getElementById('sl-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.fx = document.createElement('canvas');
        this.fxCtx = this.fx.getContext('2d');
        this.renderScale = 1;
        this.lang = getLang() === 'zh' ? 'zh' : 'en';
        this.sfx = createSfxEngine({ masterGain: 0.5 });
        this.reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;

        this.state = 'menu';
        this.isPaused = false;
        this.pausedByHidden = false;
        this.levelIdx = 0;
        this.level = LEVELS[0];
        this.st = R.initialState(this.level);
        this.sway = [];
        this.sel = -1;              // 选中的纸片（-1 = 无，'lamp' = 灯）
        this.drag = null;
        this.ev = null;
        this.dirty = true;
        this.holdStart = 0;
        this.maxStage = 0;
        this.elapsed = 0;
        this.moves = 0;
        this.bestSim = 0;
        this.resets = 0;
        this.solveT = 0;
        this.snapFrom = null;
        this.revealUntil = 0;
        this.lastFrame = 0;
        this.clock = 0;             // 场景动画钟（暂停时冻结）
        this.leaves = [];
        this.motes = Array.from({ length: 18 }, (_, i) => ({
            x: 120 + ((i * 97) % 240), y: 120 + ((i * 131) % 360), p: i * 0.37,
        }));
        this.progress = readJson(PROGRESS_KEY, {});
        this.seen = readJson(SEEN_KEY, {});
        this.lastRustle = 0;

        this.el = {};
        [
            'start', 'result', 'title', 'subtitle', 'copy', 'btn-begin', 'level-label', 'level-grid',
            'result-kicker', 'result-title', 'result-stats', 'btn-next', 'btn-replay', 'btn-menu',
            'side-howto-title', 'side-howto', 'side-records-title', 'side-records', 'side-keys-title',
            'side-keys', 'hint', 'toast', 'brand', 'progress', 'target-btn', 'target-icon', 'reset-btn',
        ].forEach(id => { this.el[id] = document.getElementById(`sl-${id}`); });

        this.buildPaper();
        this.resize();
        this.bindEvents();
        this.applyLanguage();
        this.loadLevel(this.firstOpenLevel(), false);
        this.showMenu();
        this.loop = this.loop.bind(this);
        requestAnimationFrame(this.loop);
    }

    /* ─────────────── 文案 ─────────────── */

    textTable() { return LANGUAGES[this.lang] || LANGUAGES.en; }
    t(key) { return this.textTable()[key] ?? key; }

    applyLanguage() {
        this.lang = getLang() === 'zh' ? 'zh' : 'en';
        document.documentElement.lang = this.lang === 'zh' ? 'zh-CN' : 'en';
        document.title = this.lang === 'zh' ? '影织 Shadow Loom — 纸影解谜' : 'Shadow Loom 影织 — Paper Shadow Puzzle';
        const put = (id, key) => { if (this.el[id]) this.el[id].textContent = this.t(key); };
        put('title', 'title');
        put('subtitle', 'subtitle');
        put('copy', 'copy');
        put('level-label', 'levelSelect');
        put('side-howto-title', 'sideHowToTitle');
        put('side-howto', 'sideHowTo');
        put('side-records-title', 'sideRecordsTitle');
        put('side-keys-title', 'sideKeysTitle');
        put('brand', 'brand');
        const setBtn = (id, icon, key) => {
            if (this.el[id]) this.el[id].innerHTML = `${ICONS[icon]}<span>${this.t(key)}</span>`;
        };
        setBtn('btn-next', 'arrowRight', 'next');
        setBtn('btn-replay', 'retry', 'replay');
        setBtn('btn-menu', 'home', 'menu');
        this.renderBegin();
        this.canvas.setAttribute('aria-label', this.t('canvasAria'));
        const tb = this.el['target-btn'];
        if (tb) {
            tb.setAttribute('aria-label', this.t('targetBtn'));
            tb.setAttribute('title', this.t('targetBtn'));
        }
        if (this.el.progress) this.el.progress.setAttribute('aria-label', this.t('progress'));
        this.renderKeys();
        this.renderHint();
        this.renderLevelGrid();
        this.renderRecords();
        this.renderProgress();
        if (this.state === 'done') this.renderResult();
    }

    renderBegin() {
        const btn = this.el['btn-begin'];
        if (!btn) return;
        const allDone = LEVELS.every(l => this.progress[l.id]);
        btn.innerHTML = `${ICONS.play}<span>${this.t(allDone ? 'beginAgain' : 'begin')}</span>`;
    }

    renderHint() {
        if (this.el.hint) this.el.hint.textContent = this.t(this.level.rotate ? 'hintRotate' : 'hint');
    }

    renderKeys() {
        const box = this.el['side-keys'];
        if (!box) return;
        const rows = [['1–5', 'keySelect'], ['L', 'keyLamp'], ['← ↑ → ↓', 'keyMove'], ['Q / E', 'keyRotate'], ['R', 'keyReset']];
        box.replaceChildren();
        rows.forEach(([k, key]) => {
            const kbd = document.createElement('kbd');
            kbd.textContent = k;
            const span = document.createElement('span');
            span.textContent = this.t(key);
            box.append(kbd, span);
        });
    }

    levelName(lv) { return lv.name[this.lang] || lv.name.en; }
    chapterName(lv) { return CHAPTERS[lv.chapter][this.lang] || CHAPTERS[lv.chapter].en; }

    renderLevelGrid() {
        const grid = this.el['level-grid'];
        if (!grid) return;
        grid.replaceChildren();
        LEVELS.forEach((lv, i) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = `sl-chip${this.progress[lv.id] ? ' is-done' : ''}`;
            const name = document.createElement('span');
            name.className = 'sl-chip-name';
            name.textContent = this.levelName(lv);
            const ch = document.createElement('span');
            ch.className = 'sl-chip-chapter';
            ch.textContent = `${i + 1} · ${this.chapterName(lv)}`;
            b.append(name, ch);
            b.addEventListener('click', () => this.startLevel(i));
            grid.appendChild(b);
        });
    }

    renderRecords() {
        const box = this.el['side-records'];
        if (!box) return;
        box.replaceChildren();
        LEVELS.forEach((lv) => {
            const rec = this.progress[lv.id];
            const row = document.createElement('div');
            row.className = `sl-rec-row${rec ? ' is-done' : ''}`;
            const b = document.createElement('b');
            b.textContent = this.levelName(lv);
            const t = document.createElement('span');
            t.textContent = rec ? fmtTime(rec.time) : this.t('notYet');
            const m = document.createElement('span');
            m.textContent = rec ? `${rec.moves} ${this.t('moves')}` : '';
            row.append(b, t, m);
            box.appendChild(row);
        });
    }

    renderProgress() {
        const box = this.el.progress;
        if (!box) return;
        box.replaceChildren();
        LEVELS.forEach((lv, i) => {
            const d = document.createElement('i');
            if (this.progress[lv.id]) d.classList.add('is-done');
            if (i === this.levelIdx && this.state !== 'menu') d.classList.add('is-current');
            box.appendChild(d);
        });
    }

    renderResult() {
        const lv = this.level;
        const rec = this.lastResult;
        if (!rec) return;
        if (this.el['result-kicker']) this.el['result-kicker'].textContent = this.t('wovenKicker');
        if (this.el['result-title']) this.el['result-title'].textContent = `${lv.name.zh} · ${lv.name.en}`;
        const stats = this.el['result-stats'];
        if (stats) {
            stats.replaceChildren();
            [
                ['time', fmtTime(rec.time)],
                ['moves', String(rec.moves)],
                ['match', `${Math.round(rec.best * 100)}%`],
                ['firstTry', rec.first ? this.t('yes') : this.t('no')],
            ].forEach(([k, v]) => {
                const d = document.createElement('div');
                const dt = document.createElement('dt');
                dt.textContent = this.t(k);
                const dd = document.createElement('dd');
                dd.textContent = v;
                d.append(dt, dd);
                stats.appendChild(d);
            });
        }
        const last = this.levelIdx >= LEVELS.length - 1;
        if (this.el['btn-next']) {
            this.el['btn-next'].innerHTML = `${ICONS[last ? 'home' : 'arrowRight']}<span>${this.t(last ? 'menu' : 'next')}</span>`;
        }
        if (this.el['btn-menu']) this.el['btn-menu'].classList.toggle('hidden', last);
    }

    toast(msg, ms = 2200) {
        const el = this.el.toast;
        if (!el) return;
        el.textContent = msg;
        el.classList.add('is-on');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('is-on'), ms);
    }

    /* ─────────────── 流程 ─────────────── */

    firstOpenLevel() {
        const i = LEVELS.findIndex(l => !this.progress[l.id]);
        return i < 0 ? 0 : i;
    }

    loadLevel(i, playing) {
        this.levelIdx = clamp(i, 0, LEVELS.length - 1);
        this.level = LEVELS[this.levelIdx];
        this.st = R.initialState(this.level);
        this.sway = this.level.pieces.map(() => ({ a: 0, v: 0 }));
        this.sel = -1;
        this.drag = null;
        this.dirty = true;
        this.holdStart = 0;
        this.maxStage = 0;
        this.elapsed = 0;
        this.moves = 0;
        this.bestSim = 0;
        this.resets = 0;
        this.leaves = [];
        this.snapFrom = null;
        this.revealUntil = playing && this.level.hideTarget ? this.clock + this.level.hideTarget / 1000 : 0;
        this.drawTargetIcon();
        this.renderHint();
        this.el['target-btn']?.classList.toggle('is-hint', !!this.level.hideTarget);
    }

    startLevel(i) {
        this.loadLevel(i, true);
        this.state = 'playing';
        this.isPaused = false;
        this.el.start?.classList.add('hidden');
        this.el.result?.classList.add('hidden');
        this.renderProgress();
        track('shadow-loom', 'play');
        const ch = this.level.chapter;
        const intro = this.t('chapterIntro')[ch];
        if (intro && !this.seen[ch]) {
            this.seen[ch] = 1;
            storageSet(SEEN_KEY, JSON.stringify(this.seen));
            this.toast(intro, 3800);
        }
        this.sfx.tone({ freq: 294, slideTo: 392, type: 'sine', dur: 0.5, vol: 0.05 });
    }

    restartLevel() {
        if (this.state !== 'playing' && this.state !== 'done') return;
        const resets = this.resets + 1;
        const wasDone = this.state === 'done';
        this.startLevel(this.levelIdx);
        this.resets = wasDone ? 0 : resets;
        if (!wasDone) this.toast(this.t('resetToast'), 1200);
    }

    nextLevel() {
        if (this.levelIdx >= LEVELS.length - 1) this.showMenu();
        else this.startLevel(this.levelIdx + 1);
    }

    showMenu() {
        this.state = 'menu';
        this.isPaused = false;
        this.drag = null;
        this.el.result?.classList.add('hidden');
        this.el.start?.classList.remove('hidden');
        this.renderLevelGrid();
        this.renderBegin();
        this.renderProgress();
    }

    solve() {
        this.state = 'solving';
        this.solveT = this.clock;
        // 按住不放也可能完成：这一次拖动同样算一次移动
        if (this.drag && this.drag.moved) this.moves++;
        this.drag = null;
        this.sel = -1;
        this.canvas.classList.remove('is-grabbing');
        this.snapFrom = {
            lamp: { ...this.st.lamp },
            pieces: this.st.pieces.map((p, i) => this.effPose(i)),
        };
        this.sway.forEach(s => { s.a = 0; s.v = 0; });
        const best = Math.max(this.bestSim, this.ev ? this.ev.sim : 0);
        const rec = { time: this.elapsed, moves: this.moves, best, first: this.resets === 0 };
        this.lastResult = rec;
        const prev = this.progress[this.level.id];
        this.progress[this.level.id] = prev ? {
            time: Math.min(prev.time, rec.time),
            moves: Math.min(prev.moves, rec.moves),
            best: Math.max(prev.best || 0, rec.best),
            first: prev.first || rec.first,
        } : rec;
        storageSet(PROGRESS_KEY, JSON.stringify(this.progress));
        track('shadow-loom', 'finish');
        this.renderRecords();
        this.renderProgress();
        this.chime();
    }

    showResult() {
        this.state = 'done';
        this.renderResult();
        this.el.result?.classList.remove('hidden');
    }

    /* ─────────────── 位姿 ─────────────── */

    /** 带悬挂晃动的有效位姿：绕悬挂点转 sway 角（渲染与判定共用） */
    effPose(i) {
        const p = this.st.pieces[i];
        const a = this.sway[i] ? this.sway[i].a : 0;
        if (!a) return p;
        const at = R.attachPoint(this.level, p, i);
        const r = a * Math.PI / 180;
        const dx = p.x - at[0];
        const dy = p.y - at[1];
        return {
            x: at[0] + dx * Math.cos(r) - dy * Math.sin(r),
            y: at[1] + dx * Math.sin(r) + dy * Math.cos(r),
            rot: (p.rot || 0) + a,
        };
    }

    effState() {
        return { lamp: this.st.lamp, pieces: this.st.pieces.map((_, i) => this.effPose(i)) };
    }

    /** 某纸片上一点（冒烟脚本也用它来「抓」纸片） */
    grabPoint(i) {
        const polys = R.piecePolys(this.level, this.effPose(i), i);
        const p = this.effPose(i);
        for (let r = 0; r < 40; r += 2) {
            for (let k = 0; k < 12; k++) {
                const a = (k / 12) * Math.PI * 2;
                const x = p.x + Math.cos(a) * r;
                const y = p.y + Math.sin(a) * r;
                if (polys.some(poly => R.pointInPoly(x, y, poly))) return { x, y };
            }
        }
        const v = polys[0][0];
        return { x: v[0], y: v[1] };
    }

    /** 由近灯到近幕排序（近灯的纸片离观众更近，画在上层） */
    drawOrder() {
        return this.level.pieces.map((p, i) => i).sort((a, b) => this.level.pieces[b].z - this.level.pieces[a].z);
    }

    ringRadius(i) {
        const polys = R.piecePolys(this.level, this.st.pieces[i], i);
        const p = this.st.pieces[i];
        let r = 0;
        polys.forEach(poly => poly.forEach(([x, y]) => { r = Math.max(r, Math.hypot(x - p.x, y - p.y)); }));
        return r + 16;
    }

    knobPos(i) {
        const p = this.st.pieces[i];
        const r = this.ringRadius(i);
        const a = ((p.rot || 0) - 90) * Math.PI / 180;
        return { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r, r };
    }

    /* ─────────────── 输入 ─────────────── */

    toLogical(e) {
        const r = this.canvas.getBoundingClientRect();
        return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
    }

    pieceAt(x, y) {
        const order = this.drawOrder().reverse();
        for (const i of order) {
            const polys = R.piecePolys(this.level, this.effPose(i), i);
            if (polys.some(poly => R.pointInPoly(x, y, poly))) return i;
        }
        // 细小纸片（鹤腿、鹿角）：放宽到 10px 内的顶点
        for (const i of order) {
            const polys = R.piecePolys(this.level, this.effPose(i), i);
            if (polys.some(poly => poly.some(([vx, vy]) => Math.hypot(vx - x, vy - y) < 10))) return i;
        }
        return -1;
    }

    lampHit(x, y) {
        const L = this.st.lamp;
        return Math.hypot(x - L.x, y - (L.y - 12)) < 38;
    }

    canInteract() { return this.state === 'playing' && !this.isPaused; }

    onPointerDown(e) {
        if (!this.canInteract()) return;
        const p = this.toLogical(e);
        let drag = null;
        if (this.level.rotate && typeof this.sel === 'number' && this.sel >= 0 && !this.level.pieces[this.sel].pinned) {
            const k = this.knobPos(this.sel);
            if (Math.hypot(p.x - k.x, p.y - k.y) < 22) {
                const c = this.st.pieces[this.sel];
                drag = { kind: 'rotate', idx: this.sel, a0: Math.atan2(p.y - c.y, p.x - c.x), rot0: c.rot || 0, lastTick: c.rot || 0 };
            }
        }
        if (!drag) {
            const i = this.pieceAt(p.x, p.y);
            if (i >= 0) {
                this.sel = i;
                if (this.level.pieces[i].pinned) {
                    this.sway[i].v += 60;
                    this.toast(this.t('pinnedToast'));
                    this.sfx.tone({ freq: 310, slideTo: 260, type: 'triangle', dur: 0.08, vol: 0.05 });
                } else {
                    const c = this.st.pieces[i];
                    drag = { kind: 'piece', idx: i, ox: c.x - p.x, oy: c.y - p.y, lx: p.x, lt: performance.now(), vx: 0 };
                    this.rustle(true);
                }
            } else if (this.lampHit(p.x, p.y)) {
                if (this.level.lamp.movable) {
                    this.sel = 'lamp';
                    drag = { kind: 'lamp', ox: this.st.lamp.x - p.x, oy: this.st.lamp.y - p.y };
                    this.sfx.noise({ dur: 0.25, vol: 0.035, filterFreq: 520 });
                } else {
                    this.toast(this.t('lampFixedToast'), 1600);
                }
            } else {
                this.sel = -1;
            }
        }
        if (drag) {
            drag.moved = false;
            drag.sx = p.x;
            drag.sy = p.y;
            this.drag = drag;
            this.canvas.classList.add('is-grabbing');
            try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            e.preventDefault();
        }
    }

    onPointerMove(e) {
        const p = this.toLogical(e);
        const d = this.drag;
        if (!d) {
            if (this.canInteract() && e.pointerType === 'mouse') {
                const hit = this.pieceAt(p.x, p.y) >= 0 || (this.level.lamp.movable && this.lampHit(p.x, p.y))
                    || (this.level.rotate && typeof this.sel === 'number' && this.sel >= 0
                        && Math.hypot(p.x - this.knobPos(this.sel).x, p.y - this.knobPos(this.sel).y) < 22);
                this.canvas.classList.toggle('is-idle', !hit);
            }
            return;
        }
        if (!this.canInteract()) return;
        if (Math.hypot(p.x - d.sx, p.y - d.sy) > 2) d.moved = true;
        if (d.kind === 'piece') {
            const next = R.clampPiece(p.x + d.ox, p.y + d.oy);
            const c = this.st.pieces[d.idx];
            const now = performance.now();
            const dt = Math.max(1, now - d.lt);
            d.vx = d.vx * 0.6 + ((p.x - d.lx) / dt) * 0.4 * 16;
            d.lx = p.x;
            d.lt = now;
            c.x = next.x;
            c.y = next.y;
            // 拖动时纸片随速度微微倾斜（悬挂感）
            this.sway[d.idx].a = clamp(-d.vx * 0.5, -5, 5);
            this.sway[d.idx].v = 0;
            this.rustle(false);
        } else if (d.kind === 'lamp') {
            const next = R.clampLamp(p.x + d.ox, p.y + d.oy);
            this.st.lamp.x = next.x;
            this.st.lamp.y = next.y;
        } else if (d.kind === 'rotate') {
            const c = this.st.pieces[d.idx];
            const a = Math.atan2(p.y - c.y, p.x - c.x);
            let delta = ((a - d.a0) * 180) / Math.PI;
            delta = ((delta + 540) % 360) - 180;
            c.rot = d.rot0 + delta;
            if (Math.abs(c.rot - d.lastTick) >= 6) {
                d.lastTick = c.rot;
                this.sfx.tone({ freq: 1500, type: 'triangle', dur: 0.025, vol: 0.025 });
            }
        }
        this.dirty = true;
    }

    onPointerUp() {
        const d = this.drag;
        if (!d) return;
        this.drag = null;
        this.canvas.classList.remove('is-grabbing');
        if (d.moved) this.moves++;
        if (d.kind === 'piece') {
            // 松手后的惯性晃动
            this.sway[d.idx].v += clamp(-d.vx * 6, -80, 80);
        }
        this.dirty = true;
    }

    onKey(e) {
        if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
        if (!this.canInteract()) return;
        const k = e.key;
        const n = this.level.pieces.length;
        if (/^[1-9]$/.test(k) && Number(k) <= n) {
            this.sel = Number(k) - 1;
            return;
        }
        if (k === 'l' || k === 'L') {
            if (this.level.lamp.movable) this.sel = 'lamp';
            else this.toast(this.t('lampFixedToast'), 1600);
            return;
        }
        if (k === 'r' || k === 'R') { this.restartLevel(); return; }
        const step = e.shiftKey ? 1 : 4;
        const dirs = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        if (dirs[k]) {
            e.preventDefault();
            const [dx, dy] = dirs[k];
            if (this.sel === 'lamp') {
                const nx = R.clampLamp(this.st.lamp.x + dx, this.st.lamp.y + dy);
                this.st.lamp.x = nx.x;
                this.st.lamp.y = nx.y;
            } else if (typeof this.sel === 'number' && this.sel >= 0) {
                if (this.level.pieces[this.sel].pinned) { this.toast(this.t('pinnedToast')); return; }
                const c = this.st.pieces[this.sel];
                const nx = R.clampPiece(c.x + dx, c.y + dy);
                c.x = nx.x;
                c.y = nx.y;
            } else {
                return;
            }
            if (!e.repeat) this.moves++;
            this.dirty = true;
            return;
        }
        if ((k === 'q' || k === 'Q' || k === 'e' || k === 'E') && this.level.rotate
            && typeof this.sel === 'number' && this.sel >= 0 && !this.level.pieces[this.sel].pinned) {
            const s = (k.toLowerCase() === 'q' ? -1 : 1) * (e.shiftKey ? 1 : 5);
            this.st.pieces[this.sel].rot = (this.st.pieces[this.sel].rot || 0) + s;
            if (!e.repeat) this.moves++;
            this.dirty = true;
        }
    }

    /* ─────────────── 声音 ─────────────── */

    rustle(force) {
        const now = performance.now();
        if (!force && now - this.lastRustle < 170) return;
        this.lastRustle = now;
        this.sfx.noise({ dur: 0.09, vol: 0.035, filterFreq: 3400, filterSlideTo: 1400 });
    }

    harmony(stage) {
        const f = [0, 392, 494, 587, 659][stage];
        if (!f) return;
        this.sfx.tone({ freq: f, type: 'sine', dur: 1.4, vol: 0.03 });
        this.sfx.tone({ freq: f * 1.5, type: 'sine', dur: 1.2, vol: 0.018, delay: 0.05 });
    }

    chime() {
        this.sfx.tone({ freq: 784, type: 'triangle', dur: 1.1, vol: 0.09 });
        this.sfx.tone({ freq: 1175, type: 'triangle', dur: 1.2, vol: 0.07, delay: 0.14 });
        this.sfx.tone({ freq: 1568, type: 'sine', dur: 1.6, vol: 0.05, delay: 0.3 });
    }

    lifeSound() {
        const id = this.level.id;
        if (id === 'bird' || id === 'crane') {
            for (let i = 0; i < 4; i++) this.sfx.noise({ dur: 0.12, vol: 0.03, filterFreq: 900, delay: i * 0.38 });
        } else if (id === 'rabbit') {
            this.sfx.tone({ freq: 190, slideTo: 150, type: 'sine', dur: 0.12, vol: 0.05, delay: 0.1 });
            this.sfx.tone({ freq: 190, slideTo: 150, type: 'sine', dur: 0.12, vol: 0.05, delay: 0.55 });
        } else if (id === 'whale') {
            this.sfx.tone({ freq: 118, slideTo: 92, type: 'sine', dur: 1.8, vol: 0.06 });
        } else if (id === 'tree') {
            this.sfx.noise({ dur: 1.4, vol: 0.025, filterFreq: 2600, filterSlideTo: 900 });
        } else {
            this.sfx.tone({ freq: 330, slideTo: 392, type: 'sine', dur: 0.9, vol: 0.04 });
        }
    }

    /* ─────────────── 主循环 ─────────────── */

    loop(now) {
        const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 0.016;
        this.lastFrame = now;
        if (!this.isPaused) {
            this.clock += dt;
            this.update(dt, now);
        }
        this.render();
        requestAnimationFrame(this.loop);
    }

    update(dt) {
        // 悬挂晃动：阻尼弹簧，松手后 ~1s 静止
        this.sway.forEach((s, i) => {
            if (this.drag && this.drag.kind === 'piece' && this.drag.idx === i) return;
            if (!s.a && !s.v) return;
            s.v += (-40 * s.a - 5 * s.v) * dt;
            s.a += s.v * dt;
            if (Math.abs(s.a) < 0.02 && Math.abs(s.v) < 0.1) { s.a = 0; s.v = 0; }
            this.dirty = true;
        });

        if (this.state === 'playing') {
            this.elapsed += dt * 1000;
            if (this.dirty) {
                this.dirty = false;
                this.ev = R.evaluate(this.level, this.effState());
                this.bestSim = Math.max(this.bestSim, this.ev.sim);
                const stage = R.stageOf(this.ev.sim);
                if (stage > this.maxStage) {
                    this.maxStage = stage;
                    this.harmony(stage);
                }
            }
            if (this.ev && this.ev.sim >= R.THRESHOLDS.win) {
                if (!this.holdStart) this.holdStart = this.clock;
                if ((this.clock - this.holdStart) * 1000 >= R.WIN_HOLD_MS) this.solve();
            } else {
                this.holdStart = 0;
            }
        } else if (this.state === 'solving') {
            const t = this.clock - this.solveT;
            if (t < SNAP_S) {
                // 杂乱的半透明边缘短暂收紧：纸片与灯缓缓落到精确的解
                const k = ease(t / SNAP_S);
                const sol = R.compileLevel(this.level).solution;
                const f = this.snapFrom;
                this.st.lamp.x = f.lamp.x + (sol.lamp.x - f.lamp.x) * k;
                this.st.lamp.y = f.lamp.y + (sol.lamp.y - f.lamp.y) * k;
                this.st.pieces.forEach((p, i) => {
                    p.x = f.pieces[i].x + (sol.pieces[i].x - f.pieces[i].x) * k;
                    p.y = f.pieces[i].y + (sol.pieces[i].y - f.pieces[i].y) * k;
                    p.rot = f.pieces[i].rot + (sol.pieces[i].rot - f.pieces[i].rot) * k;
                });
            } else if (!this.lifeStarted && t >= SNAP_S + SWEEP_S) {
                this.lifeStarted = true;
                this.lifeSound();
            }
            if (t >= RESULT_AT_S) this.showResult();
            if (this.level.life?.leaves && t > SNAP_S + SWEEP_S && this.leaves.length < 14 && Math.random() < dt * 5 && !this.reduced) {
                this.leaves.push({ x: 150 + Math.random() * 180, y: 230 + Math.random() * 40, vx: -8 + Math.random() * 16, vy: 16 + Math.random() * 18, a: Math.random() * 6, s: 0.7 + Math.random() * 0.6 });
            }
        }
        if (this.state !== 'solving') this.lifeStarted = false;
        if (this.state === 'done' && this.level.life?.leaves && this.leaves.length < 10 && Math.random() < dt * 2.5 && !this.reduced) {
            this.leaves.push({ x: 150 + Math.random() * 180, y: 230 + Math.random() * 40, vx: -8 + Math.random() * 16, vy: 16 + Math.random() * 18, a: Math.random() * 6, s: 0.7 + Math.random() * 0.6 });
        }
        this.leaves.forEach(l => {
            l.x += (l.vx + Math.sin(this.clock * 2 + l.a) * 14) * dt;
            l.y += l.vy * dt;
            l.a += dt * 2;
        });
        this.leaves = this.leaves.filter(l => l.y < R.SCREEN.y + R.SCREEN.h + 10);
    }

    /* ─────────────── 渲染 ─────────────── */

    resize() {
        const cssW = this.canvas.clientWidth || W;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.renderScale = (cssW / W) * dpr;
        const pw = Math.round(W * this.renderScale);
        const ph = Math.round(H * this.renderScale);
        if (this.canvas.width !== pw || this.canvas.height !== ph) {
            this.canvas.width = pw;
            this.canvas.height = ph;
        }
        if (this.fx.width !== pw || this.fx.height !== ph) {
            this.fx.width = pw;
            this.fx.height = ph;
        }
        this.ctx.setTransform(this.renderScale, 0, 0, this.renderScale, 0, 0);
    }

    /** 纸幕：天然纤维 + 不规则边缘，离屏缓存一次 */
    buildPaper() {
        const S = R.SCREEN;
        const k = 2;
        const pad = 6;
        const c = document.createElement('canvas');
        c.width = (S.w + pad * 2) * k;
        c.height = (S.h + pad * 2) * k;
        const g = c.getContext('2d');
        g.scale(k, k);
        g.translate(pad, pad);
        // 不规则纸边
        const edge = [];
        const jitter = (i) => Math.sin(i * 12.9898) * 43758.5453 % 1;
        const step = 10;
        for (let x = 0; x <= S.w; x += step) edge.push([x, -1.2 * Math.abs(jitter(x))]);
        for (let y = step; y <= S.h; y += step) edge.push([S.w + 1.2 * Math.abs(jitter(y + 7)), y]);
        for (let x = S.w - step; x >= 0; x -= step) edge.push([x, S.h + 1.2 * Math.abs(jitter(x + 13))]);
        for (let y = S.h - step; y > 0; y -= step) edge.push([-1.2 * Math.abs(jitter(y + 29)), y]);
        this.paperEdge = edge.map(([x, y]) => [x + S.x, y + S.y]);
        g.beginPath();
        edge.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.closePath();
        g.fillStyle = '#ecdcbc';
        g.fill();
        g.save();
        g.clip();
        // 纤维
        let seed = 7;
        const rnd = () => {
            seed = (seed * 16807) % 2147483647;
            return (seed - 1) / 2147483646;
        };
        for (let i = 0; i < 900; i++) {
            const x = rnd() * S.w;
            const y = rnd() * S.h;
            const a = rnd() * Math.PI;
            const len = 4 + rnd() * 18;
            g.strokeStyle = rnd() < 0.5 ? 'rgba(150,118,80,0.10)' : 'rgba(255,248,230,0.22)';
            g.lineWidth = 0.4 + rnd() * 0.5;
            g.beginPath();
            g.moveTo(x, y);
            g.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + (rnd() - 0.5) * 4, y + Math.sin(a) * len * 0.5 + (rnd() - 0.5) * 4, x + Math.cos(a) * len, y + Math.sin(a) * len);
            g.stroke();
        }
        // 四周极淡的植物影（不影响谜题可读性）
        g.fillStyle = 'rgba(70,52,36,0.07)';
        const frond = (bx, by, dir, h) => {
            for (let j = 0; j < 7; j++) {
                const t = j / 6;
                const x = bx + dir * t * 26;
                const y = by - t * h;
                g.beginPath();
                g.ellipse(x + dir * 8, y, 9, 3.2, dir * (0.5 - t * 0.4), 0, Math.PI * 2);
                g.fill();
                g.beginPath();
                g.ellipse(x - dir * 6, y - 6, 8, 3, -dir * (0.7 - t * 0.3), 0, Math.PI * 2);
                g.fill();
            }
            g.strokeStyle = 'rgba(70,52,36,0.08)';
            g.lineWidth = 1.2;
            g.beginPath();
            g.moveTo(bx, by);
            g.quadraticCurveTo(bx + dir * 10, by - h * 0.5, bx + dir * 26, by - h);
            g.stroke();
        };
        frond(10, S.h, 1, 120);
        frond(34, S.h, 1, 80);
        frond(S.w - 12, S.h, -1, 110);
        frond(S.w - 40, S.h, -1, 70);
        // 纸张四周的暗角
        const vg = g.createRadialGradient(S.w / 2, S.h * 0.55, S.h * 0.2, S.w / 2, S.h * 0.55, S.h * 0.78);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(92,62,32,0.30)');
        g.fillStyle = vg;
        g.fillRect(0, 0, S.w, S.h);
        g.restore();
        this.paper = { canvas: c, pad };
    }

    clipScreen(ctx) {
        ctx.beginPath();
        this.paperEdge.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.clip();
    }

    render() {
        const ctx = this.ctx;
        ctx.setTransform(this.renderScale, 0, 0, this.renderScale, 0, 0);
        const T = this.clock;
        const solving = this.state === 'solving' || this.state === 'done';
        const st = solving ? T - this.solveT : 0;
        const dim = solving ? smooth(clamp((st - SNAP_S) / SWEEP_S, 0, 1)) : 0;
        const stage = this.state === 'playing' && this.ev ? R.stageOf(this.ev.sim) : 0;
        const flicker = this.reduced ? 1 : 1 + Math.sin(T * 9.3) * 0.025 + Math.sin(T * 23.1) * 0.015;

        this.drawBackdrop(ctx, dim);
        this.drawScreen(ctx, stage, dim, flicker);

        ctx.save();
        this.clipScreen(ctx);
        this.drawTarget(ctx, solving);
        if (solving) this.drawLivingShadow(ctx, st);
        else this.drawShadows(ctx, stage);
        if (!solving && this.ev && stage >= 1) this.drawStitches(ctx, stage);
        if (solving) this.drawLeaves(ctx);
        ctx.restore();

        this.drawRail(ctx, dim);
        this.drawPieces(ctx, dim);
        if (!solving) this.drawHandles(ctx);
        this.drawLamp(ctx, flicker, dim);
        this.drawMotes(ctx, dim);
        if (this.isPaused && this.state === 'playing') {
            ctx.fillStyle = 'rgba(9,12,28,0.35)';
            ctx.fillRect(0, 0, W, H);
        }
    }

    drawBackdrop(ctx, dim) {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#0a0e21');
        g.addColorStop(0.55, '#10152f');
        g.addColorStop(1, '#0b0f22');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        // 极少量青绿色环境层次
        const tg = ctx.createRadialGradient(40, 120, 10, 40, 120, 220);
        tg.addColorStop(0, 'rgba(95,168,160,0.10)');
        tg.addColorStop(1, 'rgba(95,168,160,0)');
        ctx.fillStyle = tg;
        ctx.fillRect(0, 0, W, H);
        // 桌面与铜托盘
        const S = R.SCREEN;
        const tableY = S.y + S.h + 26;
        const tg2 = ctx.createLinearGradient(0, tableY, 0, H);
        tg2.addColorStop(0, '#1d1510');
        tg2.addColorStop(1, '#0c0907');
        ctx.fillStyle = tg2;
        ctx.fillRect(0, tableY, W, H - tableY);
        ctx.strokeStyle = 'rgba(176,122,74,0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, tableY + 0.5);
        ctx.lineTo(W, tableY + 0.5);
        ctx.stroke();
        const L = this.st.lamp;
        const tray = ctx.createRadialGradient(L.x, 640, 10, 240, 640, 210);
        tray.addColorStop(0, 'rgba(120,82,46,0.55)');
        tray.addColorStop(1, 'rgba(60,40,24,0.2)');
        ctx.fillStyle = tray;
        ctx.beginPath();
        ctx.ellipse(240, 640, 200, 48, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(200,146,90,0.4)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(200,146,90,0.14)';
        ctx.beginPath();
        ctx.ellipse(240, 640, 168, 36, 0, 0, Math.PI * 2);
        ctx.stroke();
        // 木框
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#2b1d14';
        ctx.lineWidth = 14;
        ctx.strokeRect(S.x - 8, S.y - 8, S.w + 16, S.h + 16);
        ctx.strokeStyle = 'rgba(200,146,90,0.28)';
        ctx.lineWidth = 1;
        ctx.strokeRect(S.x - 15, S.y - 15, S.w + 30, S.h + 30);
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.strokeRect(S.x - 1.5, S.y - 1.5, S.w + 3, S.h + 3);
        ctx.restore();
        if (dim > 0) {
            ctx.fillStyle = `rgba(4,6,14,${0.35 * dim})`;
            ctx.fillRect(0, 0, W, H);
        }
    }

    drawScreen(ctx, stage, dim, flicker) {
        const S = R.SCREEN;
        const p = this.paper;
        ctx.drawImage(p.canvas, S.x - p.pad, S.y - p.pad, S.w + p.pad * 2, S.h + p.pad * 2);
        ctx.save();
        this.clipScreen(ctx);
        // 灯光透射：亮区跟着灯走，接近目标时整体增亮
        const L = R.lampModel(this.st.lamp);
        const cx = L.x;
        const cy = S.y + S.h * 0.58 + (L.y - 474) * 0.8;
        const boost = (stage >= 2 ? 0.08 : 0) + (stage >= 3 ? 0.05 : 0) + dim * 0.12;
        const lg = ctx.createRadialGradient(cx, cy, 20, cx, cy, 330);
        lg.addColorStop(0, `rgba(255,226,180,${(0.13 + boost) * flicker})`);
        lg.addColorStop(0.5, `rgba(255,206,140,${0.05 + boost * 0.6})`);
        lg.addColorStop(1, 'rgba(255,200,120,0)');
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = lg;
        ctx.fillRect(S.x, S.y, S.w, S.h);
        ctx.globalCompositeOperation = 'multiply';
        const vg = ctx.createRadialGradient(cx, cy, 120, cx, cy, 420);
        vg.addColorStop(0, 'rgba(255,255,255,1)');
        vg.addColorStop(1, 'rgba(150,110,70,1)');
        ctx.fillStyle = vg;
        ctx.fillRect(S.x, S.y, S.w, S.h);
        ctx.restore();
    }

    targetAlpha(solving) {
        if (solving) return 0;
        const flash = this.revealUntil > this.clock ? clamp((this.revealUntil - this.clock) / 0.6, 0, 1) : 0;
        if (this.level.hideTarget) return 0.22 * flash;
        return 0.13 + 0.12 * flash;
    }

    drawTarget(ctx, solving) {
        const a = this.targetAlpha(solving);
        if (a <= 0.001) return;
        const c = R.compileLevel(this.level);
        ctx.save();
        pathPolys(ctx, c.targetPolys);
        // 正片叠底的暖褐：淡影像是纸里透出的旧痕，而不是一层灰雾
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = `rgba(176,128,78,${a * 3})`;
        ctx.fill('nonzero');
        ctx.restore();
    }

    blurFor(z) {
        return 1.5 + (1 - z) * 12;
    }

    drawShadows(ctx, stage) {
        const lamp = this.st.lamp;
        const tighten = stage >= 3 ? 0.55 : stage >= 2 ? 0.8 : 1;
        this.level.pieces.forEach((pc, i) => {
            const polys = R.shadowPolys(this.level, lamp, this.effPose(i), i);
            ctx.save();
            pathPolys(ctx, polys);
            ctx.shadowColor = 'rgba(52,32,22,0.55)';
            ctx.shadowBlur = this.blurFor(pc.z) * tighten * this.renderScale;
            ctx.fillStyle = 'rgba(56,36,25,0.5)';
            ctx.fill('nonzero');
            ctx.restore();
        });
    }

    /** 金线：目标轮廓上已经对准的格，隔格画一针 */
    drawStitches(ctx, stage) {
        const e = this.ev.matchedEdge;
        const alpha = [0, 0.28, 0.45, 0.85, 1][stage];
        ctx.save();
        ctx.fillStyle = `rgba(255,200,110,${alpha})`;
        if (stage >= 3) {
            ctx.shadowColor = 'rgba(255,190,90,0.9)';
            ctx.shadowBlur = 4 * this.renderScale;
        }
        for (let i = 0; i < e.length; i++) {
            if (!e[i]) continue;
            const r = Math.floor(i / R.COLS);
            const c = i - r * R.COLS;
            if ((r + c) % 2) continue;
            const [x, y] = R.cellCenter(i);
            ctx.fillRect(x - 1, y - 1, stage >= 3 ? 2.2 : 1.6, stage >= 3 ? 2.2 : 1.6);
        }
        ctx.restore();
    }

    /** 活影阶段：各纸片影子的局部转动 + 整体位移（渲染专用；此时判定已结束） */
    lifeTransform(pieceId, lt) {
        const life = this.level.life || {};
        const ops = [];
        (life.tracks || []).forEach(tr => {
            if (!tr.ids.includes(pieceId) || lt < tr.t0) return;
            const u = lt - tr.t0;
            const env = clamp(u / 0.25, 0, 1) * clamp((tr.t1 - lt) / 0.4, 0, 1);
            let ang;
            if (tr.hold) ang = tr.amp * ease(clamp(u / 0.9, 0, 1)) + Math.sin(u * 2.2) * 0.8 * clamp(u - 0.9, 0, 1);
            else ang = tr.amp * Math.sin(u * tr.freq * Math.PI * 2) * env;
            if (this.reduced) ang *= 0.3;
            ops.push({ pivot: tr.pivot, ang });
        });
        const g = life.group || { kind: 'none' };
        let dx = 0;
        let dy = 0;
        const u = lt - (g.t0 || 0);
        if (u > 0 && !this.reduced) {
            if (g.kind === 'hop') {
                const k = Math.floor(u / g.hopDur);
                const f = (u % g.hopDur) / g.hopDur;
                if (k < g.hops) {
                    dx = g.dx * (k + ease(f));
                    dy = -g.height * Math.sin(Math.PI * f);
                } else {
                    dx = g.dx * g.hops;
                }
            } else if (g.kind === 'fly') {
                dx = g.vx * u * u * 0.8;
                dy = g.vy * u * u * 0.8 - Math.sin(u * 5) * 4;
            } else if (g.kind === 'swim') {
                dx = g.vx * u;
                dy = Math.sin(u * g.freq * Math.PI * 2) * g.amp;
            } else if (g.kind === 'rise') {
                dx = u * 12;
                dy = g.vy * u * u + Math.sin(u * g.freq * Math.PI * 2) * g.amp;
            }
        }
        return { ops, dx, dy };
    }

    drawLivingShadow(ctx, st) {
        const c = R.compileLevel(this.level);
        const lt = st - SNAP_S - SWEEP_S;
        const inLife = lt > 0;
        const snapK = clamp(st / SNAP_S, 0, 1);
        const lamp = this.st.lamp;
        // 1) 影子本体画进离屏层（实心），再带金色晕描回主画布 = 完整剪影的暖金轮廓
        const f = this.fxCtx;
        f.setTransform(1, 0, 0, 1, 0, 0);
        f.clearRect(0, 0, this.fx.width, this.fx.height);
        f.setTransform(this.renderScale, 0, 0, this.renderScale, 0, 0);
        this.level.pieces.forEach((pc, i) => {
            f.save();
            if (inLife) {
                const tf = this.lifeTransform(pc.id, lt);
                f.translate(tf.dx, tf.dy);
                tf.ops.forEach(({ pivot, ang }) => {
                    f.translate(pivot[0], pivot[1]);
                    f.rotate(ang * Math.PI / 180);
                    f.translate(-pivot[0], -pivot[1]);
                });
            }
            const polys = inLife || snapK >= 1
                ? c.pieces[i].polys.map(poly => R.placePoly(poly, pc.sol.x, pc.sol.y, pc.sol.rot || 0))
                : R.shadowPolys(this.level, lamp, this.st.pieces[i], i);
            pathPolys(f, polys);
            f.fillStyle = '#3a261a';
            f.fill('nonzero');
            f.restore();
        });
        const solidity = 0.55 + 0.35 * smooth(snapK);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = solidity;
        ctx.shadowColor = 'rgba(255,190,100,0.9)';
        ctx.shadowBlur = (6 + 10 * smooth(clamp((st - SNAP_S) / SWEEP_S, 0, 1))) * this.renderScale;
        ctx.drawImage(this.fx, 0, 0);
        ctx.restore();
        ctx.setTransform(this.renderScale, 0, 0, this.renderScale, 0, 0);
        // 2) 暖金色光线沿完整轮廓快速流过（按绕质心的角度扫一圈）
        const sweep = (st - SNAP_S) / SWEEP_S;
        if (sweep > 0 && sweep < 1.3) {
            const e = c.targetEdge;
            let sx = 0;
            let sy = 0;
            let n = 0;
            for (let i = 0; i < e.length; i++) {
                if (!e[i]) continue;
                const [x, y] = R.cellCenter(i);
                sx += x;
                sy += y;
                n++;
            }
            sx /= n || 1;
            sy /= n || 1;
            const head = sweep * Math.PI * 2 - Math.PI / 2;
            const fade = clamp((1.3 - sweep) / 0.3, 0, 1);
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < e.length; i++) {
                if (!e[i]) continue;
                const [x, y] = R.cellCenter(i);
                let d = head - Math.atan2(y - sy, x - sx);
                d = ((d % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
                const trail = d < 1.6 ? 1 - d / 1.6 : 0;
                const a = (0.25 + 0.75 * trail) * fade;
                if (a < 0.05) continue;
                ctx.fillStyle = `rgba(255,${190 + Math.round(50 * trail)},${110 + Math.round(80 * trail)},${a})`;
                const s = 1.4 + trail * 1.6;
                ctx.fillRect(x - s / 2, y - s / 2, s, s);
            }
            ctx.restore();
        }
    }

    drawLeaves(ctx) {
        if (!this.leaves.length) return;
        ctx.save();
        ctx.fillStyle = 'rgba(58,38,26,0.75)';
        this.leaves.forEach(l => {
            ctx.save();
            ctx.translate(l.x, l.y);
            ctx.rotate(l.a);
            ctx.beginPath();
            ctx.ellipse(0, 0, 5 * l.s, 2.2 * l.s, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
        ctx.restore();
    }

    drawRail(ctx, dim) {
        ctx.save();
        ctx.globalAlpha = 1 - dim * 0.4;
        const g = ctx.createLinearGradient(0, RAIL_Y - 6, 0, RAIL_Y + 6);
        g.addColorStop(0, '#6d4a2e');
        g.addColorStop(0.5, '#a57344');
        g.addColorStop(1, '#4a311e');
        ctx.fillStyle = g;
        ctx.fillRect(24, RAIL_Y - 4, W - 48, 8);
        ctx.fillStyle = '#c8955a';
        [24, W - 24].forEach(x => {
            ctx.beginPath();
            ctx.arc(x, RAIL_Y, 6, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    }

    drawPieces(ctx, dim) {
        const solving = this.state === 'solving' || this.state === 'done';
        const depths = [...new Set(this.level.pieces.map(p => p.z))].sort((a, b) => b - a);
        this.drawOrder().forEach((i) => {
            const pc = this.level.pieces[i];
            const pose = this.effPose(i);
            const polys = R.piecePolys(this.level, pose, i);
            const at = R.attachPoint(this.level, pose, i);
            const selected = this.sel === i && !solving;
            ctx.save();
            ctx.globalAlpha = 1 - dim * 0.82;
            // 丝线：从横杆垂到悬挂点
            ctx.strokeStyle = 'rgba(236,214,172,0.38)';
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            ctx.moveTo(at[0], RAIL_Y + 3);
            ctx.lineTo(at[0], RAIL_Y + 4);
            ctx.lineTo(at[0], at[1]);
            ctx.stroke();
            ctx.fillStyle = '#c8955a';
            ctx.beginPath();
            ctx.arc(at[0], RAIL_Y + 2, 2.4, 0, Math.PI * 2);
            ctx.fill();
            // 深度珠：离灯越近珠子越多（一眼读出层次）
            const layer = depths.indexOf(pc.z) + 1;
            ctx.fillStyle = 'rgba(255,215,154,0.75)';
            for (let b = 0; b < layer; b++) {
                ctx.beginPath();
                ctx.arc(at[0], RAIL_Y + 12 + b * 6, 1.7, 0, Math.PI * 2);
                ctx.fill();
            }
            // 纸片本体
            pathPolys(ctx, polys);
            if (selected) {
                ctx.shadowColor = 'rgba(255,190,100,0.85)';
                ctx.shadowBlur = 14 * this.renderScale;
            } else {
                ctx.shadowColor = 'rgba(0,0,0,0.45)';
                ctx.shadowBlur = 5 * this.renderScale;
                ctx.shadowOffsetY = 2 * this.renderScale;
            }
            const bb = polys.flat();
            const minY = Math.min(...bb.map(v => v[1]));
            const maxY = Math.max(...bb.map(v => v[1]));
            const pg = ctx.createLinearGradient(0, minY, 0, maxY);
            pg.addColorStop(0, pc.pinned ? '#3c3440' : '#3f2b1f');
            pg.addColorStop(1, pc.pinned ? '#6a5a5c' : '#7a5334');
            ctx.fillStyle = pg;
            ctx.fill('nonzero');
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;
            // 背光暖边
            ctx.strokeStyle = selected ? 'rgba(255,214,150,0.95)' : 'rgba(255,184,110,0.5)';
            ctx.lineWidth = selected ? 1.5 : 1;
            ctx.stroke();
            // 纸纤维 + 叶脉样的剪刻纹（仅装饰本体）
            ctx.save();
            ctx.clip('nonzero');
            ctx.strokeStyle = 'rgba(255,214,160,0.16)';
            ctx.lineWidth = 0.8;
            polys.forEach((poly) => {
                let cx = 0;
                let cy = 0;
                poly.forEach(([x, y]) => { cx += x; cy += y; });
                cx /= poly.length;
                cy /= poly.length;
                for (let k = 0; k < poly.length; k += Math.max(3, Math.floor(poly.length / 7))) {
                    ctx.beginPath();
                    ctx.moveTo(cx, cy);
                    ctx.lineTo(cx + (poly[k][0] - cx) * 0.7, cy + (poly[k][1] - cy) * 0.7);
                    ctx.stroke();
                }
            });
            ctx.restore();
            if (pc.pinned) {
                const pg2 = ctx.createRadialGradient(at[0] - 1, at[1] + 3, 0.5, at[0], at[1] + 4, 5);
                pg2.addColorStop(0, '#ffe2a8');
                pg2.addColorStop(1, '#8a5a2e');
                ctx.fillStyle = pg2;
                ctx.beginPath();
                ctx.arc(at[0], at[1] + 4, 4.2, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        });
    }

    drawHandles(ctx) {
        if (this.state !== 'playing' || !this.level.rotate) return;
        const i = this.sel;
        if (typeof i !== 'number' || i < 0 || this.level.pieces[i].pinned) return;
        const p = this.st.pieces[i];
        const k = this.knobPos(i);
        ctx.save();
        ctx.strokeStyle = 'rgba(255,215,154,0.35)';
        ctx.setLineDash([2, 5]);
        ctx.lineWidth = 1;
        const a = ((p.rot || 0) - 90) * Math.PI / 180;
        ctx.beginPath();
        ctx.arc(p.x, p.y, k.r, a - 0.9, a + 0.9);
        ctx.stroke();
        ctx.setLineDash([]);
        const g = ctx.createRadialGradient(k.x - 2, k.y - 2, 1, k.x, k.y, 8);
        g.addColorStop(0, '#ffe2a8');
        g.addColorStop(1, '#a8703c');
        ctx.fillStyle = g;
        ctx.shadowColor = 'rgba(255,190,100,0.7)';
        ctx.shadowBlur = 8 * this.renderScale;
        ctx.beginPath();
        ctx.arc(k.x, k.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    drawLamp(ctx, flicker, dim) {
        const L = this.st.lamp;
        const movable = this.level.lamp.movable && this.state === 'playing';
        const x = L.x;
        const y = L.y;
        ctx.save();
        // 光锥
        ctx.globalCompositeOperation = 'lighter';
        const cone = ctx.createLinearGradient(0, y - 20, 0, R.SCREEN.y + R.SCREEN.h - 40);
        cone.addColorStop(0, `rgba(255,190,110,${0.16 * flicker})`);
        cone.addColorStop(1, 'rgba(255,190,110,0)');
        ctx.fillStyle = cone;
        ctx.beginPath();
        ctx.moveTo(x - 14, y - 22);
        ctx.lineTo(x + 14, y - 22);
        ctx.lineTo(x + 170, R.SCREEN.y + R.SCREEN.h - 40);
        ctx.lineTo(x - 170, R.SCREEN.y + R.SCREEN.h - 40);
        ctx.closePath();
        ctx.fill();
        const glow = ctx.createRadialGradient(x, y - 14, 2, x, y - 14, 90);
        glow.addColorStop(0, `rgba(255,214,150,${0.55 * flicker})`);
        glow.addColorStop(0.35, `rgba(255,170,80,${0.18 * flicker})`);
        glow.addColorStop(1, 'rgba(255,170,80,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(x - 100, y - 110, 200, 200);
        ctx.restore();

        ctx.save();
        if (movable) {
            // 可拖的灯：一圈淡淡的铜色光环
            ctx.strokeStyle = this.sel === 'lamp' ? 'rgba(255,215,154,0.8)' : `rgba(255,215,154,${0.25 + 0.15 * Math.sin(this.clock * 2.4)})`;
            ctx.setLineDash([3, 5]);
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.ellipse(x, y + 16, 34, 9, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        // 底座
        ctx.fillStyle = '#5a3b22';
        ctx.beginPath();
        ctx.ellipse(x, y + 16, 22, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#9a6a3c';
        ctx.fillRect(x - 12, y + 6, 24, 8);
        // 玻璃罩
        const gl = ctx.createRadialGradient(x, y - 14, 2, x, y - 14, 20);
        gl.addColorStop(0, '#fff6dc');
        gl.addColorStop(0.4, `rgba(255,200,110,${0.95 * flicker})`);
        gl.addColorStop(1, 'rgba(200,110,40,0.55)');
        ctx.fillStyle = gl;
        ctx.beginPath();
        ctx.moveTo(x - 13, y + 6);
        ctx.bezierCurveTo(x - 20, y - 8, x - 16, y - 30, x, y - 36);
        ctx.bezierCurveTo(x + 16, y - 30, x + 20, y - 8, x + 13, y + 6);
        ctx.closePath();
        ctx.fill();
        // 铜笼
        ctx.strokeStyle = '#b07a4a';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y - 36);
        ctx.lineTo(x, y + 6);
        ctx.moveTo(x - 10, y - 26);
        ctx.quadraticCurveTo(x - 6, y - 12, x - 8, y + 6);
        ctx.moveTo(x + 10, y - 26);
        ctx.quadraticCurveTo(x + 6, y - 12, x + 8, y + 6);
        ctx.stroke();
        ctx.fillStyle = '#9a6a3c';
        ctx.beginPath();
        ctx.arc(x, y - 40, 4, 0, Math.PI * 2);
        ctx.fill();
        // 火苗
        const fh = 9 * flicker;
        ctx.fillStyle = '#fffbe8';
        ctx.beginPath();
        ctx.moveTo(x, y - 12 - fh);
        ctx.quadraticCurveTo(x + 4, y - 10, x, y - 6);
        ctx.quadraticCurveTo(x - 4, y - 10, x, y - 12 - fh);
        ctx.fill();
        ctx.restore();
        void dim;
    }

    drawMotes(ctx, dim) {
        if (this.reduced) return;
        const L = this.st.lamp;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        this.motes.forEach((m) => {
            const t = this.clock * 0.25 + m.p;
            const x = m.x + Math.sin(t * 1.3) * 18 + (L.x - 240) * 0.15;
            const y = m.y + Math.cos(t) * 14;
            const a = (0.18 + 0.18 * Math.sin(t * 2.1)) * (1 - dim * 0.5);
            ctx.fillStyle = `rgba(255,220,170,${a})`;
            ctx.fillRect(x, y, 1.4, 1.4);
        });
        ctx.restore();
    }

    /* ─────────────── 目标图标 ─────────────── */

    drawTargetIcon() {
        const cv = this.el['target-icon'];
        if (!cv) return;
        const g = cv.getContext('2d');
        const c = R.compileLevel(this.level);
        g.clearRect(0, 0, cv.width, cv.height);
        let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
        c.targetPolys.forEach(poly => poly.forEach(([x, y]) => {
            x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        }));
        const s = (cv.width - 8) / Math.max(x1 - x0, y1 - y0);
        g.save();
        g.translate(cv.width / 2, cv.height / 2);
        g.scale(s, s);
        g.translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
        pathPolys(g, c.targetPolys);
        g.fillStyle = '#f3e3c3';
        g.fill('nonzero');
        g.restore();
    }

    revealTarget() {
        if (this.state !== 'playing') return;
        this.revealUntil = this.clock + 1.8;
        this.el['target-btn']?.classList.remove('is-hint');
        this.sfx.tone({ freq: 523, type: 'sine', dur: 0.6, vol: 0.03 });
    }

    /* ─────────────── 事件 ─────────────── */

    bindEvents() {
        const c = this.canvas;
        c.addEventListener('pointerdown', e => this.onPointerDown(e));
        c.addEventListener('pointermove', e => this.onPointerMove(e));
        c.addEventListener('pointerup', () => this.onPointerUp());
        c.addEventListener('pointercancel', () => this.onPointerUp());
        c.addEventListener('lostpointercapture', () => this.onPointerUp());
        c.addEventListener('wheel', (e) => {
            if (!this.canInteract() || !this.level.rotate || typeof this.sel !== 'number' || this.sel < 0) return;
            if (this.level.pieces[this.sel].pinned) return;
            e.preventDefault();
            this.st.pieces[this.sel].rot = (this.st.pieces[this.sel].rot || 0) + Math.sign(e.deltaY) * 3;
            this.moves++;
            this.dirty = true;
        }, { passive: false });
        window.addEventListener('keydown', e => this.onKey(e));
        this.el['btn-begin']?.addEventListener('click', () => this.startLevel(this.firstOpenLevel()));
        this.el['btn-next']?.addEventListener('click', () => this.nextLevel());
        this.el['btn-replay']?.addEventListener('click', () => this.startLevel(this.levelIdx));
        this.el['btn-menu']?.addEventListener('click', () => this.showMenu());
        this.el['reset-btn']?.addEventListener('click', () => this.restartLevel());
        this.el['target-btn']?.addEventListener('click', () => this.revealTarget());
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('game-frame:changed', () => this.resize());
        window.addEventListener('site-settings:changed', () => this.applyLanguage());
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                if (this.isRunning()) {
                    this.isPaused = true;
                    this.pausedByHidden = true;
                }
            } else if (this.pausedByHidden) {
                this.pausedByHidden = false;
                this.isPaused = false;
            }
        });
    }

    pauseQuiet() {
        this.isPaused = true;
        this.onPointerUp();
    }

    resumeQuiet() { this.isPaused = false; }
    isRunning() { return this.state === 'playing' && !this.isPaused; }
}

onReady(() => {
    const game = new ShadowLoomGame();
    window.slGame = game;
    bindFrame({ logicalWidth: W });
    const more = document.getElementById('slSideMore');
    if (more) renderMoreGames(more, { exclude: 'shadow-loom.html' });
    window.slDrawer = createStatsDrawer({
        idPrefix: 'sl',
        getGame: () => game,
        onPause: () => game.pauseQuiet(),
        onResume: () => game.resumeQuiet(),
        isBusy: () => game.isRunning(),
        ICONS,
        getText: () => game.textTable(),
    });
    // 必须显式 init()：补 stats 钮的 title/aria，并打上 body.has-stats-drawer
    window.slDrawer.init();
    // 顶栏 Home 是无 href 的 <button>，静音钮没有页面自己的 handler：都交给 chrome
    bindChrome({ self: 'shadow-loom.html', owns: ['more', 'home', 'sound'], getText: () => game.textTable() });
});
