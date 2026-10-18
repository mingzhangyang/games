/**
 * 雾隐九宫 — 游戏层：把规则模型（model/session.js）、棋盘、雾层、声音、HUD、浮层与输入接起来
 * ===========================================================================
 * 状态机：menu → playing（isPaused 叠加）→ result → replay（回放结束回到 result）。
 *   - 手动暂停（顶栏暂停钮 / P / Esc / 切到后台）显示暂停浮层，必须手动继续，计时同时停下；
 *   - 顶栏重开（contextual-restart）只在对局中可见，有落子时先确认。
 * 规则全部在 session 里；本文件只管输入映射、渲染与反馈，不自己判断对错或计分。
 * 主循环：requestAnimationFrame 只在对局 / 回放且未暂停时运行（雾丝漂移 + 揭雾淡出）；
 * 菜单、暂停、结算时停下，状态变化时补画一帧。
 */
import { bindContextualRestart } from '../../platform/contextual-restart.js';
import { getLang } from '../../platform/site-settings.js';
import { bindPalette } from '../../platform/theme.js';
import { isCoarsePointer } from '../../platform/i18n/touch-copy.js';
import { createPauseOwnership, bindPageVisibility } from '../../platform/runtime/pause-ownership.js';
import { createSession, prepareLevel } from './model/session.js';
import { generate } from './model/generator.js';
import { CHAPTERS, LEVELS, levelById } from './model/levels.js';
import { PEERS, CELLS } from './model/grid.js';
import { LANGUAGES } from './i18n.js';
import { createBoard } from './render/board.js';
import { createMist } from './render/mist.js';
import { createSudokuMistAudio } from './audio.js';
import { loadBest, saveBest } from './storage.js';

const GAME_ID = 'sudoku-mist';
const RESULT_DELAY_MS = 900;
const REPLAY_STEP_MS = 280;
const FLOAT_MS = 1100;
const FREE_PROFILES = Object.freeze([
    { id: 'first', key: 'freeThin' },
    { id: 'through', key: 'freeThrough' },
    { id: 'deep', key: 'freeDeep' },
]);
const NEEDS_KEY = Object.freeze({
    pointing: 'techPointing', claiming: 'techClaiming', nakedPair: 'techNakedPair', hiddenPair: 'techHiddenPair',
    nakedTriple: 'techNakedTriple', hiddenTriple: 'techHiddenTriple', xWing: 'techXWing',
});

const $ = id => document.getElementById(id);
/** 占位符的唯一展开点 */
const fill = (template, vars) => String(template).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
const fmtTime = ms => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export class SudokuMistGame {
    /** @param {object} hooks { track(gameId, event) } */
    constructor(hooks = {}) {
        this.track = typeof hooks.track === 'function' ? hooks.track : () => {};
        this.contextualRestart = null;
        this.state = 'menu';
        this.isPaused = false;
        this.meta = null;
        this.level = null;
        this.session = null;
        this.notes = new Uint16Array(CELLS);
        this.selected = -1;
        this.armed = 0;
        this.notesMode = false;
        this.hintCell = -1;
        this.hintUnit = -1;
        this.elapsed = 0;
        this.runStart = 0;
        this.raf = 0;
        this.lastFrame = 0;
        this.resultTimer = 0;
        this.replayTimer = 0;
        this.clockTimer = 0;
        this.replaySession = null;
        this.replayIndex = 0;
        this.result = null;
        this.audio = createSudokuMistAudio();
        this.reducedMotion = typeof matchMedia === 'function'
            && matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.frame = this.frame.bind(this);
        this.pauseOwnership = createPauseOwnership({
            isRunning: () => this.isRunning(),
            // 玩家自己按的暂停（浮层可见）永远不被 UI 租约「顺手」恢复
            canResume: () => this.state === 'playing' && this.isPaused
                && !!this.el?.pause.classList.contains('hidden'),
            pause: () => this.pauseQuiet(),
            resume: () => this.resumeQuiet(),
        });
    }

    t() { return LANGUAGES[getLang()] || LANGUAGES.en; }

    isRunning() { return this.state === 'playing' && !this.isPaused; }

    /** 当前计时（毫秒）：暂停 / 结算时冻结 */
    elapsedMs() {
        return this.elapsed + (this.isRunning() && this.runStart ? performance.now() - this.runStart : 0);
    }

    /* ───────────── 初始化 ───────────── */

    init() {
        this.el = {
            stage: $('sm-stage'),
            wrap: $('sm-board-wrap'),
            board: $('sm-board'),
            mist: $('sm-mist'),
            floats: $('sm-floats'),
            hud: $('sm-hud'),
            level: $('sm-level'),
            score: $('sm-score'),
            streak: $('sm-streak'),
            fog: $('sm-fog'),
            mistakes: $('sm-mistakes'),
            time: $('sm-time'),
            panel: $('sm-panel'),
            pad: $('sm-pad'),
            notesBtn: $('sm-btn-notes'),
            eraseBtn: $('sm-btn-erase'),
            hintBtn: $('sm-btn-hint'),
            message: $('sm-message'),
            sr: $('sm-sr-status'),
            start: $('sm-start'),
            chapters: $('sm-chapters'),
            free: $('sm-free'),
            status: $('sm-start-status'),
            controls: $('sm-controls'),
            pause: $('sm-pause'),
            result: $('sm-result'),
            resultTitle: $('sm-result-title'),
            resultCopy: $('sm-result-copy'),
            resultScore: $('sm-result-score'),
            resultBest: $('sm-result-best'),
            resultStats: $('sm-result-stats'),
            nextBtn: $('sm-btn-next'),
            replayBar: $('sm-replay-bar'),
            replayText: $('sm-replay-text'),
            pauseBtn: $('sm-pause-btn'),
            resetBtn: $('sm-reset-btn'),
        };
        this.palette = bindPalette({
            fogRgb: '--sm-cv-fog-rgb',
            fogAlpha: '--sm-cv-fog-alpha',
            wispRgb: '--sm-cv-wisp-rgb',
            wispAlpha: '--sm-cv-wisp-alpha',
            ripple: '--sm-cv-ripple',
            wrong: '--sm-cv-wrong',
        }, {
            onChange: () => { this.mist.rebuildWisps(); this.mist.draw(); },
        });
        this.board = createBoard(this.el.board, { onCell: i => this.onCell(i) });
        this.mist = createMist(this.el.mist, { palette: this.palette, reducedMotion: () => this.reducedMotion });
        this.bindPad();
        this.bindButtons();
        this.bindKeys();
        this.bindResize();
        this.contextualRestart = bindContextualRestart({
            button: this.el.resetBtn,
            active: () => this.isRunning(),
            hasProgress: () => !!this.session && this.session.inputs.length > 0,
            restart: () => this.restart(),
            purpose: 'retry',
        });
        bindPageVisibility(this.pauseOwnership, {
            autoResume: false,
            // 回到前台不自动继续：显示暂停浮层，由玩家决定何时继续
            onHidden: () => this.showPauseOverlay(),
        });
        this.applyLanguage();
        window.addEventListener('site-settings:changed', () => this.applyLanguage());
        this.toMenu();
    }

    bindResize() {
        const apply = () => { this.mist.resize(); this.mist.draw(); };
        if (typeof ResizeObserver !== 'undefined') new ResizeObserver(apply).observe(this.el.wrap);
        window.addEventListener('resize', apply);
        window.addEventListener('game-frame:changed', apply);
        apply();
    }

    bindPad() {
        this.el.pad.querySelectorAll('[data-digit]').forEach(btn => {
            btn.addEventListener('click', () => this.onDigit(Number(btn.dataset.digit), { notes: this.notesMode }));
        });
        this.el.notesBtn.addEventListener('click', () => this.toggleNotesMode());
        this.el.eraseBtn.addEventListener('click', () => this.eraseNotes());
        this.el.hintBtn.addEventListener('click', () => this.hint());
    }

    bindButtons() {
        $('sm-btn-resume').addEventListener('click', () => this.resume());
        $('sm-btn-restart').addEventListener('click', () => this.restart());
        $('sm-btn-pause-menu').addEventListener('click', () => this.toMenu());
        $('sm-btn-again').addEventListener('click', () => this.again());
        $('sm-btn-replay').addEventListener('click', () => this.startReplay());
        $('sm-btn-menu').addEventListener('click', () => this.toMenu());
        $('sm-btn-stop-replay').addEventListener('click', () => this.stopReplay());
        this.el.nextBtn.addEventListener('click', () => this.next());
        this.el.pauseBtn.addEventListener('click', () => {
            if (this.state !== 'playing') return;
            if (this.isPaused) this.resume(); else this.pause();
        });
    }

    bindKeys() {
        document.addEventListener('keydown', e => {
            if (e.target instanceof HTMLInputElement || e.altKey || e.ctrlKey || e.metaKey) return;
            if (this.state === 'replay' && e.key === 'Escape') { e.preventDefault(); this.stopReplay(); return; }
            if (this.state !== 'playing') return;
            if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
                e.preventDefault();
                if (this.isPaused) this.resume(); else this.pause();
                return;
            }
            if (this.isPaused) return;
            const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
            if (m) {
                e.preventDefault();
                this.onDigit(Number(m[1]), { notes: e.shiftKey !== this.notesMode });
                return;
            }
            const move = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[e.key];
            if (move) {
                e.preventDefault();
                this.moveSelection(move);
                return;
            }
            if (e.key === 'n' || e.key === 'N') { e.preventDefault(); this.toggleNotesMode(); return; }
            if (e.key === 'h' || e.key === 'H') { e.preventDefault(); this.hint(); return; }
            if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { e.preventDefault(); this.eraseNotes(); }
        });
    }

    /* ───────────── 菜单 ───────────── */

    renderMenu() {
        const t = this.t();
        const lang = getLang() === 'zh' ? 'zh' : 'en';
        this.el.chapters.textContent = '';
        for (const ch of CHAPTERS) {
            const section = document.createElement('section');
            section.className = 'sm-chapter';
            const h = document.createElement('h3');
            h.className = 'sm-chapter-title';
            h.textContent = ch.name[lang];
            const list = document.createElement('div');
            list.className = 'sm-level-list';
            LEVELS.filter(l => l.chapter === ch.id).forEach((level, n) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'sm-level';
                btn.id = `sm-level-${level.id}`;
                const best = loadBest(level.id);
                btn.classList.toggle('sm-level--done', best > 0);
                const num = document.createElement('span');
                num.className = 'sm-level-num';
                num.textContent = String(n + 1);
                const name = document.createElement('span');
                name.className = 'sm-level-name';
                name.textContent = level.name[lang];
                const sub = document.createElement('span');
                sub.className = 'sm-level-best';
                sub.textContent = best > 0 ? fill(t.levelBest, { n: best }) : t.levelNew;
                btn.append(num, name, sub);
                btn.addEventListener('click', () => this.startLevel(level.id));
                list.appendChild(btn);
            });
            section.append(h, list);
            this.el.chapters.appendChild(section);
        }
        this.el.free.textContent = '';
        for (const p of FREE_PROFILES) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'sm-free-btn';
            btn.id = `sm-free-${p.id}`;
            const label = document.createElement('span');
            label.className = 'sm-free-name';
            label.textContent = t[p.key];
            const best = loadBest(`free-${p.id}`);
            const sub = document.createElement('span');
            sub.className = 'sm-level-best';
            sub.textContent = best > 0 ? fill(t.levelBest, { n: best }) : '';
            btn.append(label, sub);
            btn.addEventListener('click', () => this.startFree(p.id));
            this.el.free.appendChild(btn);
        }
    }

    /* ───────────── 开局 ───────────── */

    startLevel(id) {
        const level = levelById(id);
        if (!level) throw new Error(`unknown level ${id}`);
        this.begin({ kind: 'level', id: level.id, name: level.name }, level);
    }

    /** 自由局：运行时出题（深雾档 Node 下最慢约 0.5s）；先让「起雾中」画出来再出题 */
    startFree(profile, seed = (Math.random() * 2 ** 32) >>> 0) {
        const p = FREE_PROFILES.find(x => x.id === profile);
        if (!p) throw new Error(`unknown profile ${profile}`);
        this.el.status.textContent = this.t().generating;
        this.el.start.setAttribute('aria-busy', 'true');
        return new Promise(resolve => {
            setTimeout(() => {
                const puzzle = generate(seed, profile);
                this.el.status.textContent = '';
                this.el.start.removeAttribute('aria-busy');
                const t = { en: LANGUAGES.en, zh: LANGUAGES.zh };
                const name = { en: fill(t.en.freeName, { p: t.en[p.key] }), zh: fill(t.zh.freeName, { p: t.zh[p.key] }) };
                this.begin({ kind: 'free', id: `free-${profile}`, profile, seed: puzzle.seed, name }, puzzle);
                resolve(puzzle);
            }, 30);
        });
    }

    begin(meta, levelData) {
        this.cancelTimers();
        this.pauseOwnership.invalidate();
        this.meta = meta;
        this.level = prepareLevel({ ...levelData, id: meta.id });
        this.session = createSession(this.level);
        this.notes.fill(0);
        this.selected = -1;
        this.armed = 0;
        this.hintCell = -1;
        this.hintUnit = -1;
        this.result = null;
        this.elapsed = 0;
        this.isPaused = false;
        this.state = 'playing';
        this.runStart = performance.now();
        this.el.start.classList.add('hidden');
        this.el.stage.classList.remove('sm-stage--menu', 'sm-stage--sheet');
        this.el.pause.classList.add('hidden');
        this.el.result.classList.add('hidden');
        this.el.replayBar.classList.add('hidden');
        this.el.hud.classList.remove('hidden');
        this.el.panel.classList.remove('hidden');
        this.el.message.textContent = '';
        this.clearFloats();
        this.mist.resize();
        this.mist.sync(i => this.session.isVisible(i), { instant: true });
        this.render();
        this.syncChrome();
        this.track(GAME_ID, 'play');
        // 计时显示独立于雾的动画循环（减弱动效时循环会停）
        this.clockTimer = setInterval(() => {
            if (this.state === 'playing') this.el.time.textContent = fmtTime(this.elapsedMs());
        }, 500);
        this.ensureLoop();
    }

    restart() {
        if (!this.meta) return;
        this.begin(this.meta, this.level);
    }

    again() {
        if (this.meta?.kind === 'free') void this.startFree(this.meta.profile);
        else this.restart();
    }

    next() {
        const k = LEVELS.findIndex(l => l.id === this.meta?.id);
        if (k >= 0 && k + 1 < LEVELS.length) this.startLevel(LEVELS[k + 1].id);
        else this.toMenu();
    }

    toMenu() {
        this.cancelTimers();
        this.pauseOwnership.invalidate();
        this.stopLoop();
        if (this.state === 'playing') this.elapsed = this.elapsedMs();
        this.state = 'menu';
        this.isPaused = false;
        this.el.pause.classList.add('hidden');
        this.el.result.classList.add('hidden');
        this.el.replayBar.classList.add('hidden');
        this.el.hud.classList.add('hidden');
        this.el.panel.classList.add('hidden');
        this.el.message.textContent = '';
        this.clearFloats();
        this.renderMenu();
        this.el.stage.classList.remove('sm-stage--sheet');
        this.el.stage.classList.add('sm-stage--menu');
        this.el.start.classList.remove('hidden');
        // 菜单后面是一盘满雾的空棋盘
        this.mist.sync(() => false, { instant: true });
        this.board.update({ view: Array.from({ length: CELLS }, () => ({ state: 'fog' })), selected: -1, armed: 0, notes: this.notes, label: () => '' });
        this.mist.draw();
        this.syncChrome();
    }

    /* ───────────── 输入 → 规则 ───────────── */

    onCell(i) {
        if (this.state !== 'playing' || this.isPaused) return;
        if (this.armed && !this.session.isKnown(i)) {
            this.selected = i;
            this.apply(i, this.armed, { notes: this.notesMode });
            return;
        }
        this.selected = this.selected === i && !this.armed ? -1 : i;
        this.render();
    }

    onDigit(d, { notes = false } = {}) {
        if (this.state !== 'playing' || this.isPaused) return;
        if (this.selected < 0 || this.session.isKnown(this.selected)) {
            // 先选数再点格：没有可落子的选中格时，数字键改为「拿起」这个数字
            this.armed = this.armed === d ? 0 : d;
            this.render();
            return;
        }
        this.apply(this.selected, d, { notes });
    }

    apply(i, d, { notes }) {
        if (notes) { this.toggleNote(i, d); return; }
        const r = this.session.place(i, d);
        if (!r.ok) return;
        const t = this.t();
        if (!r.correct) {
            this.audio.wrong();
            this.board.flash(i, 'sm-cell--wrong');
            this.mist.ripple(i, 'wrong');
            this.float(i, `−${r.penalty || 0}`, 'wrong');
            this.announce(fill(t.srWrong, { d, n: r.penalty || 0 }));
            this.render();
            this.ensureLoop();
            return;
        }
        // 笔记清理：这一格、以及同行列宫里同一个数字的笔记；揭开的题面数字同理
        this.clearNotesFor(i, d);
        for (const j of r.revealed) {
            const v = this.session.cell(j);
            if (v.digit) this.clearNotesFor(j, v.digit);
        }
        if (r.hinted || i === this.hintCell) { this.hintCell = -1; this.hintUnit = -1; }
        this.mist.reveal(r.revealed, i);
        this.mist.ripple(i);
        if (r.hinted) this.float(i, t.floatHint, 'muted');
        else if (r.luck) this.float(i, t.floatLuck, 'muted');
        else this.float(i, `+${r.points} · ${t['tier' + r.tier]}${r.intoFog ? ` · ${t.floatFog}` : ''}`, r.tier >= 3 ? 'deep' : 'ok');
        if (r.luck) this.audio.luck(); else this.audio.place(r.tier, r.intoFog);
        this.el.message.textContent = '';
        this.announce(fill(t.srPlaced, { d, pts: r.points, n: r.revealed.length }));
        this.render();
        this.ensureLoop();
        if (r.done) this.finish();
    }

    toggleNote(i, d) {
        if (this.session.isKnown(i)) return;
        this.notes[i] ^= 1 << (d - 1);
        this.render();
    }

    clearNotesFor(i, d) {
        this.notes[i] = 0;
        for (const p of PEERS[i]) this.notes[p] &= ~(1 << (d - 1));
    }

    eraseNotes() {
        if (this.state !== 'playing' || this.isPaused || this.selected < 0) return;
        this.notes[this.selected] = 0;
        this.render();
    }

    toggleNotesMode() {
        if (this.state !== 'playing' || this.isPaused) return;
        this.notesMode = !this.notesMode;
        this.render();
    }

    moveSelection(delta) {
        let i = this.selected < 0 ? 40 : this.selected;
        const r = (i / 9) | 0, c = i % 9;
        if (delta === -1) i = r * 9 + (c + 8) % 9;
        else if (delta === 1) i = r * 9 + (c + 1) % 9;
        else i = (i + delta + CELLS) % CELLS;
        this.selected = i;
        this.render();
        this.board.focus(i);
    }

    hint() {
        if (this.state !== 'playing' || this.isPaused) return;
        const h = this.session.hint();
        if (!h) return;
        const t = this.t();
        this.selected = h.cell;
        this.hintCell = h.cell;
        this.hintUnit = h.unit;
        this.armed = 0;
        let text;
        if (h.via === 'nakedSingle') text = fill(t.hintNaked, { d: h.digit });
        else text = fill(h.via === 'fullHouse' ? t.hintFullHouse : t.hintHidden, { u: this.unitName(h.unit), d: h.digit });
        if (h.tier >= 3 && NEEDS_KEY[h.key]) text += fill(t.hintNeeds, { t: t[NEEDS_KEY[h.key]] });
        this.el.message.textContent = text;
        this.announce(text);
        this.audio.hint();
        this.render();
        this.board.focus(h.cell);
    }

    unitName(u) {
        const t = this.t();
        return fill(u < 9 ? t.unitRow : u < 18 ? t.unitCol : t.unitBox, { n: (u % 9) + 1 });
    }

    /* ───────────── 结算 / 回放 ───────────── */

    finish() {
        this.elapsed = this.elapsedMs();
        this.runStart = 0;
        clearInterval(this.clockTimer);
        this.clockTimer = 0;
        this.state = 'result';
        this.pauseOwnership.invalidate();
        const summary = this.session.summary();
        const prev = loadBest(this.meta.id);
        const isBest = summary.score > prev;
        if (isBest) saveBest(this.meta.id, summary.score);
        this.result = { summary, best: Math.max(prev, summary.score), isBest, time: this.elapsed, inputs: this.session.inputs };
        this.audio.cleared();
        this.track(GAME_ID, 'finish');
        this.announce(fill(this.t().srCleared, { n: summary.score }));
        this.hintCell = -1;
        this.hintUnit = -1;
        this.selected = -1;
        this.render();
        this.syncChrome();
        this.resultTimer = setTimeout(() => this.showResult(), this.reducedMotion ? 0 : RESULT_DELAY_MS);
    }

    showResult() {
        this.resultTimer = 0;
        if (this.state !== 'result' || !this.result) return;
        const t = this.t();
        const { summary, best, isBest, time } = this.result;
        const lang = getLang() === 'zh' ? 'zh' : 'en';
        this.el.resultTitle.textContent = t.cleared;
        this.el.resultCopy.textContent = fill(t.clearedCopy, { name: this.meta.name[lang] });
        this.el.resultScore.textContent = String(summary.score);
        this.el.resultBest.textContent = isBest ? t.newBest : fill(t.bestLine, { n: best });
        this.el.resultBest.classList.toggle('sm-result-best--new', isBest);
        const rows = [
            [t.statT1, summary.byTier[1]], [t.statT2, summary.byTier[2]],
            [t.statT3, summary.byTier[3]], [t.statT4, summary.byTier[4]],
            [t.statFog, summary.fog], [t.statLuck, summary.luck], [t.statHint, summary.hintPlaced],
            [t.statMistakes, summary.mistakes], [t.statStreak, summary.maxStreak], [t.statTime, fmtTime(time)],
        ];
        this.el.resultStats.textContent = '';
        for (const [label, value] of rows) {
            const li = document.createElement('li');
            li.className = 'sm-stat';
            const a = document.createElement('span');
            a.className = 'sm-stat-label';
            a.textContent = label;
            const b = document.createElement('b');
            b.className = 'sm-stat-value';
            b.textContent = String(value);
            li.append(a, b);
            this.el.resultStats.appendChild(li);
        }
        const k = LEVELS.findIndex(l => l.id === this.meta.id);
        this.el.nextBtn.classList.toggle('hidden', !(k >= 0 && k + 1 < LEVELS.length));
        this.el.panel.classList.add('hidden');
        this.el.stage.classList.add('sm-stage--sheet');
        this.el.result.classList.remove('hidden');
        $('sm-btn-again').focus({ preventScroll: true });
    }

    startReplay() {
        if (this.state !== 'result' || !this.result) return;
        this.state = 'replay';
        this.el.result.classList.add('hidden');
        this.el.stage.classList.remove('sm-stage--sheet');
        this.replaySession = createSession(this.level);
        this.replayIndex = 0;
        this.selected = -1;
        this.mist.sync(i => this.replaySession.isVisible(i), { instant: true });
        this.el.replayBar.classList.remove('hidden');
        this.clearFloats();
        this.render();
        this.ensureLoop();
        this.replayTick();
    }

    replayTick() {
        const inputs = this.result.inputs;
        if (this.state !== 'replay') return;
        if (this.replayIndex >= inputs.length) {
            this.replayTimer = setTimeout(() => this.stopReplay(), 700);
            return;
        }
        const a = inputs[this.replayIndex++];
        this.el.replayText.textContent = fill(this.t().replaying, { n: this.replayIndex, total: inputs.length });
        if (a.type === 'place') {
            const r = this.replaySession.place(a.cell, a.digit);
            this.selected = a.cell;
            if (r.correct) {
                this.mist.reveal(r.revealed, a.cell);
                this.mist.ripple(a.cell);
                this.float(a.cell, r.hinted || r.luck ? '0' : `+${r.points}`, r.tier >= 3 ? 'deep' : 'ok');
            } else if (r.ok) {
                this.board.flash(a.cell, 'sm-cell--wrong');
                this.float(a.cell, `−${r.penalty || 0}`, 'wrong');
            }
        } else {
            this.replaySession.hint();
        }
        this.render();
        this.ensureLoop();
        this.replayTimer = setTimeout(() => this.replayTick(), this.reducedMotion ? 60 : REPLAY_STEP_MS);
    }

    stopReplay() {
        if (this.state !== 'replay') return;
        clearTimeout(this.replayTimer);
        this.replayTimer = 0;
        this.replaySession = null;
        this.state = 'result';
        this.el.replayBar.classList.add('hidden');
        this.clearFloats();
        this.mist.sync(i => this.session.isVisible(i), { instant: true });
        this.render();
        this.mist.draw();
        this.stopLoop();
        this.showResult();
    }

    /* ───────────── 暂停 ───────────── */

    pause() {
        if (this.state !== 'playing' || this.isPaused) return;
        this.pauseQuiet();
        this.showPauseOverlay();
    }

    showPauseOverlay() {
        if (this.state !== 'playing' || !this.isPaused) return;
        this.el.pause.classList.remove('hidden');
        $('sm-btn-resume').focus({ preventScroll: true });
        this.syncChrome();
    }

    resume() {
        if (this.state !== 'playing' || !this.isPaused) return;
        this.el.pause.classList.add('hidden');
        this.resumeQuiet();
    }

    pauseQuiet() {
        if (this.state !== 'playing' || this.isPaused) return;
        this.elapsed = this.elapsedMs();
        this.isPaused = true;
        this.runStart = 0;
        this.stopLoop();
        this.syncChrome();
    }

    resumeQuiet() {
        if (this.state !== 'playing' || !this.isPaused) return;
        this.isPaused = false;
        this.runStart = performance.now();
        this.syncChrome();
        this.ensureLoop();
    }

    /* ───────────── 渲染 ───────────── */

    cellLabel(i, v, mask) {
        const t = this.t();
        const parts = [fill(t.cellLabel, { r: ((i / 9) | 0) + 1, c: (i % 9) + 1 })];
        if (v.state === 'fog') parts.push(t.cellFog);
        else if (v.state === 'given') parts.push(fill(t.cellGiven, { d: v.digit }));
        else if (v.state === 'placed') parts.push(fill(t.cellPlaced, { d: v.digit }));
        else parts.push(t.cellOpen);
        if (mask) {
            const ds = [];
            for (let d = 1; d <= 9; d++) if (mask & (1 << (d - 1))) ds.push(d);
            parts.push(fill(t.cellNotes, { n: ds.join(' ') }));
        }
        return parts.join(lang() === 'zh' ? '，' : ', ');
    }

    render() {
        const s = this.state === 'replay' ? this.replaySession : this.session;
        if (!s) return;
        const view = s.view();
        this.board.update({
            view,
            selected: this.selected,
            armed: this.state === 'playing' ? this.armed : 0,
            notes: this.state === 'playing' ? this.notes : new Uint16Array(CELLS),
            hintCell: this.hintCell,
            hintUnit: this.hintUnit,
            label: (i, v, mask) => this.cellLabel(i, v, mask),
        });
        this.renderHud(s, view);
        this.renderPad(view);
    }

    renderHud(s, view) {
        const lang = getLang() === 'zh' ? 'zh' : 'en';
        this.el.level.textContent = this.meta ? this.meta.name[lang] : '';
        this.el.score.textContent = String(s.score);
        this.el.streak.textContent = `×${(1 + 0.1 * Math.min(Math.max(s.streak, 1) - 1, 10)).toFixed(1)}`;
        this.el.streak.classList.toggle('sm-hud-value--hot', s.streak >= 4);
        const fog = view.filter(v => v.state === 'fog').length;
        this.el.fog.textContent = `${Math.round(fog / CELLS * 100)}%`;
        this.el.mistakes.textContent = String(s.summary().mistakes);
        this.el.time.textContent = fmtTime(this.state === 'replay' ? this.result.time : this.elapsedMs());
    }

    renderPad(view) {
        const t = this.t();
        const counts = new Array(10).fill(0);
        for (const v of view) if (v.digit) counts[v.digit]++;
        this.el.pad.querySelectorAll('[data-digit]').forEach(btn => {
            const d = Number(btn.dataset.digit);
            btn.classList.toggle('sm-key--armed', this.armed === d);
            btn.classList.toggle('sm-key--done', counts[d] >= 9);
            btn.setAttribute('aria-pressed', this.armed === d ? 'true' : 'false');
        });
        this.el.notesBtn.classList.toggle('sm-tool--on', this.notesMode);
        this.el.notesBtn.setAttribute('aria-pressed', this.notesMode ? 'true' : 'false');
        this.el.notesBtn.setAttribute('aria-label', this.notesMode ? t.notesOn : t.notesOff);
        this.el.notesBtn.title = this.notesMode ? t.notesOn : t.notesOff;
    }

    float(i, text, kind) {
        const el = document.createElement('span');
        el.className = `sm-float sm-float--${kind}`;
        el.textContent = text;
        const { x, y } = this.board.center(i);
        el.style.setProperty('--sm-x', `${x}%`);
        el.style.setProperty('--sm-y', `${y}%`);
        this.el.floats.appendChild(el);
        requestAnimationFrame(() => el.classList.add('sm-float--go'));
        setTimeout(() => el.remove(), FLOAT_MS);
    }

    clearFloats() { this.el.floats.textContent = ''; }

    announce(text) { this.el.sr.textContent = text; }

    syncChrome() {
        const t = this.t();
        const playing = this.state === 'playing';
        this.el.pauseBtn.disabled = !playing;
        const label = this.isPaused ? t.resumeLabel : t.pause;
        this.el.pauseBtn.title = label;
        this.el.pauseBtn.setAttribute('aria-label', label);
        this.el.pauseBtn.setAttribute('aria-pressed', this.isPaused ? 'true' : 'false');
        this.contextualRestart?.sync();
    }

    applyLanguage() {
        const t = this.t();
        this.el.controls.textContent = isCoarsePointer() ? t.controlsTouch : t.controls;
        if (this.state === 'menu') this.renderMenu();
        if (this.state === 'result' && !this.el.result.classList.contains('hidden')) this.showResult();
        this.render();
        this.syncChrome();
    }

    /* ───────────── 主循环 ───────────── */

    ensureLoop() {
        if (this.raf) return;
        this.lastFrame = performance.now();
        this.raf = requestAnimationFrame(this.frame);
    }

    stopLoop() {
        if (this.raf) cancelAnimationFrame(this.raf);
        this.raf = 0;
    }

    frame(now) {
        this.raf = 0;
        const dt = Math.min(0.05, Math.max(0, (now - this.lastFrame) / 1000));
        this.lastFrame = now;
        const moving = this.mist.step(dt);
        this.mist.draw();
        // 对局中（雾丝漂移）或仍有淡出 / 涟漪时继续；减弱动效下雾丝不动，淡完就停
        const keep = (this.state === 'playing' && !this.isPaused && !this.reducedMotion) || this.state === 'replay' || moving;
        if (keep && !(this.state === 'playing' && this.isPaused)) this.raf = requestAnimationFrame(this.frame);
    }

    cancelTimers() {
        clearTimeout(this.resultTimer);
        clearTimeout(this.replayTimer);
        clearInterval(this.clockTimer);
        this.resultTimer = 0;
        this.replayTimer = 0;
        this.clockTimer = 0;
        this.replaySession = null;
    }
}

function lang() { return getLang() === 'zh' ? 'zh' : 'en'; }
