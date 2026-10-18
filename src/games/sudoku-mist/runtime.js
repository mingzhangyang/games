/**
 * 雾隐九宫 — 游戏层：把规则模型（model/session.js）、棋盘、雾层、声音、HUD、浮层与输入接起来
 * ===========================================================================
 * 状态机：menu → playing（isPaused 叠加）→ result → replay（回放结束回到 result）。
 *   - 手动暂停（顶栏暂停钮 / P / Esc / 切到后台）显示暂停浮层，必须手动继续，计时同时停下；
 *   - 顶栏重开（contextual-restart）只在对局中可见，有落子时先确认；
 *   - 排行榜弹窗走 pauseOwnership 的 'ranking' 租约，静默暂停、关闭后自动继续。
 * 每日一雾（设计 §8.2）：第一次完成之前是「计分局」——每次输入后把输入序列存进本地，
 *   刷新 / 离开后回来按 replay() 原样恢复；不能重开；完成时只提交这一次（onDailyCleared）。
 *   完成后再进是练习局：可重开，不存进度、不提交。
 *   「今天完成过没有」一律问 dailyDoneFor()：本地完成标记 + 本页内存里的兜底（存储写不进去时
 *   也不会在本页重新开出计分局）。完成那一刻再查一次——同一天在两个标签页里各开了一局，
 *   先完成的那个算数，后完成的自动降为练习局，不覆盖、不重复提交。
 *   同一时刻只有一个标签页能在今天的计分局里（daily-run.js：Web Locks 独占，离开就释放），
 *   别的标签页点进来会被拒绝并说明原因；所以进度只有一个写入者，不会互相覆盖、把失误和点灯「撤销」掉。
 *   存档写不进去时，本页内存检查点照样更新，回菜单再进也不会丢掉没写成的输入。
 * 规则全部在 session 里；本文件只管输入映射、渲染与反馈，不自己判断对错或计分。
 * 主循环：requestAnimationFrame 只在对局 / 回放且未暂停时运行（雾丝漂移 + 揭雾淡出）；
 * 菜单、暂停、结算时停下，状态变化时补画一帧。
 */
import { bindContextualRestart } from '../../platform/contextual-restart.js';
import { getLang } from '../../platform/site-settings.js';
import { bindPalette } from '../../platform/theme.js';
import { isCoarsePointer } from '../../platform/i18n/touch-copy.js';
import { createPauseOwnership, bindPageVisibility } from '../../platform/runtime/pause-ownership.js';
import { todayKey, todayKeyDisplay } from '../../platform/daily.js';
import { createSession, prepareLevel, replay } from './model/session.js';
import { generate, generateDaily } from './model/generator.js';
import { starsFor } from './model/scoring.js';
import { CHAPTERS, LEVELS, levelById } from './model/levels.js';
import { PEERS, CELLS } from './model/grid.js';
import { LANGUAGES } from './i18n.js';
import { createBoard } from './render/board.js';
import { createMist } from './render/mist.js';
import { createSudokuMistAudio } from './audio.js';
import { createDailyRunGuard } from './daily-run.js';
import {
    loadBest, saveBest, loadDailyDone, saveDailyDone, clearDailyRun,
} from './storage.js';

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
const starText = n => '★'.repeat(n) + '☆'.repeat(3 - n);
const fmtTime = ms => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export class SudokuMistGame {
    /** @param {object} hooks { track(gameId, event), onDailyCleared({ dateKey, score }) } */
    constructor(hooks = {}) {
        this.track = typeof hooks.track === 'function' ? hooks.track : () => {};
        this.onDailyCleared = typeof hooks.onDailyCleared === 'function' ? hooks.onDailyCleared : () => {};
        // 每日题只按日期生成一次（手机上出题要几百毫秒）
        this.dailyPuzzle = null;
        // 本页里完成过的每日局 dateKey → { score, time }（完成标记写不进存储时的兜底）
        this.dailyCleared = new Map();
        // 计分局的跨标签页互斥锁 + 本页检查点
        this.daily = createDailyRunGuard();
        this.contextualRestart = null;
        this.state = 'menu'; this.contextualRestart?.sync();
        this.isPaused = false; this.contextualRestart?.sync();
        // 本局进度（落子 / 笔记 / 点灯次数）：顶栏重开据此决定要不要先确认
        this.moves = 0;
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

    /** 今天第一次的每日局：存进度、不能重开、完成时提交排行榜 */
    isRanked() { return this.meta?.kind === 'daily' && this.meta.ranked === true; }

    /** 这一天的第一次完成成绩（本地标记优先，其次本页内存）；null = 还没完成 */
    dailyDoneFor(dateKey) { return loadDailyDone(dateKey) || this.dailyCleared.get(dateKey) || null; }

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
            daily: $('sm-daily'),
            chapters: $('sm-chapters'),
            free: $('sm-free'),
            status: $('sm-start-status'),
            controls: $('sm-controls'),
            pause: $('sm-pause'),
            pauseCopy: $('sm-pause-copy'),
            pauseRestart: $('sm-btn-restart'),
            result: $('sm-result'),
            resultTitle: $('sm-result-title'),
            resultCopy: $('sm-result-copy'),
            resultScore: $('sm-result-score'),
            resultBest: $('sm-result-best'),
            resultStars: $('sm-result-stars'),
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
            // 计分中的每日局不能重开（否则记住雾的布局再来一遍，分数就失真了）
            active: () => this.isRunning() && !this.isRanked(),
            hasProgress: () => this.moves > 0,
            restart: () => this.restart(),
            purpose: 'retry',
        });
        bindPageVisibility(this.pauseOwnership, {
            autoResume: false,
            // 回到前台不自动继续：显示暂停浮层，由玩家决定何时继续
            onHidden: () => this.showPauseOverlay(),
        });
        // 直接关页（没有先切到后台）时也把每日局的用时存下来
        window.addEventListener('pagehide', () => this.persist());
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
        this.renderDailyEntry();
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
                btn.classList.toggle('sm-level--done', best !== null);
                const num = document.createElement('span');
                num.className = 'sm-level-num';
                num.textContent = String(n + 1);
                const name = document.createElement('span');
                name.className = 'sm-level-name';
                name.textContent = level.name[lang];
                const sub = document.createElement('span');
                sub.className = 'sm-level-best';
                sub.textContent = best !== null ? fill(t.levelBest, { n: best }) : t.levelNew;
                btn.append(num, name, sub);
                if (best !== null) {
                    const n = starsFor(best, level.stars);
                    const stars = document.createElement('span');
                    stars.className = 'sm-level-stars';
                    stars.dataset.stars = String(n);
                    stars.textContent = starText(n);
                    stars.setAttribute('aria-label', fill(t.starsLabel, { n }));
                    btn.appendChild(stars);
                }
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
            sub.textContent = best !== null ? fill(t.levelBest, { n: best }) : '';
            btn.append(label, sub);
            btn.addEventListener('click', () => this.startFree(p.id));
            this.el.free.appendChild(btn);
        }
    }

    /** 菜单顶部的每日一雾入口：未开始 / 进行中（第几步）/ 已完成（成绩 · 练习） */
    renderDailyEntry() {
        const t = this.t();
        const key = todayKey();
        const done = this.dailyDoneFor(key);
        const run = done ? null : this.daily.resumeFor(key);
        this.el.daily.textContent = '';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sm-daily-btn';
        btn.id = 'sm-daily-btn';
        btn.classList.toggle('sm-daily-btn--done', !!done);
        const name = document.createElement('span');
        name.className = 'sm-daily-name';
        name.textContent = fill(t.dailyName, { date: todayKeyDisplay() });
        const sub = document.createElement('span');
        sub.className = 'sm-daily-sub';
        sub.textContent = done ? fill(t.dailyDone, { n: done.score })
            : run?.inputs.length ? fill(t.dailyResume, { n: run.inputs.length }) : t.dailyNew;
        btn.append(name, sub);
        btn.addEventListener('click', () => { void this.startDaily(); });
        this.el.daily.appendChild(btn);
    }

    /* ───────────── 开局 ───────────── */

    /** id 也可以是关卡序号（共享校验器以 startLevel(0) 开局） */
    startLevel(id) {
        const level = typeof id === 'number' ? LEVELS[id] : levelById(id);
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

    /**
     * 每日一雾：今天第一次完成之前是计分局（有存档就按输入序列恢复），之后是练习局。
     * dateKey 只给测试用；排行榜键跟着对局的日期走，跨过午夜也不会串到第二天的榜。
     */
    startDaily(dateKey = todayKey()) {
        this.el.status.textContent = this.t().generating;
        this.el.start.setAttribute('aria-busy', 'true');
        return new Promise(resolve => {
            setTimeout(async () => {
                if (this.dailyPuzzle?.dateKey !== dateKey) this.dailyPuzzle = { dateKey, puzzle: generateDaily(dateKey) };
                const { puzzle } = this.dailyPuzzle;
                const done = this.dailyDoneFor(dateKey);
                // 计分局要先独占锁；另一个标签页正在这局里就不进，留在菜单说明原因
                if (!done && !await this.daily.acquire(dateKey)) {
                    if (this.state !== 'menu') this.toMenu();
                    this.el.start.removeAttribute('aria-busy');
                    this.el.status.textContent = this.t().dailyLocked;
                    resolve(null);
                    return;
                }
                this.el.status.textContent = '';
                this.el.start.removeAttribute('aria-busy');
                const date = `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`;
                const name = { en: fill(LANGUAGES.en.dailyName, { date }), zh: fill(LANGUAGES.zh.dailyName, { date }) };
                const run = done ? null : this.daily.resumeFor(dateKey);
                // 生成器升过版本（同一天的题变了）就丢掉旧进度，免得拿旧输入重放新题
                const resume = run && run.seed === puzzle.seed ? run : null;
                this.begin({ kind: 'daily', id: puzzle.id, dateKey, seed: puzzle.seed, ranked: !done, name }, puzzle, { resume });
                resolve(puzzle);
            }, 30);
        });
    }

    begin(meta, levelData, { resume = null } = {}) {
        this.cancelTimers();
        this.meta = meta;
        // 计分局记下检查点起点；其他任何局都不需要锁
        if (this.isRanked()) this.daily.start(meta.dateKey, meta.seed, resume);
        else this.daily.release();
        this.level = prepareLevel({ ...levelData, id: meta.id });
        this.session = resume ? replay(this.level, resume.inputs) : createSession(this.level);
        this.notes.fill(0);
        if (resume?.notes) this.notes.set(resume.notes);
        this.selected = -1;
        this.armed = 0;
        this.hintCell = -1;
        this.hintUnit = -1;
        this.result = null;
        this.elapsed = resume ? resume.elapsed : 0;
        this.moves = resume ? resume.inputs.length : 0;
        this.isPaused = false; this.contextualRestart?.sync();
        this.state = 'playing'; this.contextualRestart?.sync();
        this.runStart = performance.now();
        // 新一局已经在跑之后再作废旧租约：排行榜弹窗还开着时开局，新局要停在弹窗后面，
        // 关掉弹窗也不会被旧租约「顺手」继续
        this.pauseOwnership.invalidate();
        this.el.start.classList.add('hidden');
        this.el.stage.classList.remove('sm-stage--menu', 'sm-stage--sheet');
        this.el.pause.classList.add('hidden');
        this.el.result.classList.add('hidden');
        this.el.replayBar.classList.add('hidden');
        this.el.hud.classList.remove('hidden');
        this.el.panel.classList.remove('hidden');
        this.el.message.textContent = resume?.inputs.length ? this.t().dailyResumed : '';
        this.clearFloats();
        this.mist.resize();
        this.mist.sync(i => this.session.isVisible(i), { instant: true });
        this.render();
        this.syncChrome();
        if (!resume) this.track(GAME_ID, 'play');
        // 计时显示独立于雾的动画循环（减弱动效时循环会停）
        this.clockTimer = setInterval(() => {
            if (this.state === 'playing') this.el.time.textContent = fmtTime(this.elapsedMs());
        }, 500);
        this.ensureLoop();
        // 存档里的输入恰好已经走完（完成标记没写成）：直接结算
        if (this.session.done) this.finish();
    }

    restart() {
        if (!this.meta || this.isRanked()) return;
        this.begin(this.meta, this.level);
    }

    again() {
        if (this.meta?.kind === 'free') void this.startFree(this.meta.profile);
        else if (this.meta?.kind === 'daily') void this.startDaily(this.meta.dateKey);
        else this.restart();
    }

    /** 计分中的每日局：每次输入 / 暂停 / 离开后存一次（输入序列 + 用时 + 笔记）；返回存储有没有写成 */
    persist() {
        if (!this.isRanked() || !this.session || this.state !== 'playing') return false;
        return this.daily.save(this.meta.dateKey, { inputs: this.session.inputs, elapsed: this.elapsedMs(), notes: this.notes });
    }

    next() {
        const k = LEVELS.findIndex(l => l.id === this.meta?.id);
        if (k >= 0 && k + 1 < LEVELS.length) this.startLevel(LEVELS[k + 1].id);
        else this.toMenu();
    }

    toMenu() {
        this.persist();
        this.daily.release();
        this.cancelTimers();
        this.pauseOwnership.invalidate();
        this.stopLoop();
        if (this.state === 'playing') this.elapsed = this.elapsedMs();
        this.state = 'menu'; this.contextualRestart?.sync();
        this.isPaused = false; this.contextualRestart?.sync();
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
        if (this.session.isCharged(i)) {
            this.selected = i;
            this.activate(i);
            return;
        }
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
        this.moves++;
        const t = this.t();
        if (!r.correct) {
            this.audio.wrong();
            this.board.flash(i, 'sm-cell--wrong');
            this.mist.ripple(i, 'wrong');
            this.float(i, `−${r.penalty || 0}`, 'wrong');
            this.announce(fill(t.srWrong, { d, n: r.penalty || 0 }));
            this.render();
            this.ensureLoop();
            this.persist();
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
        if (r.done) this.finish(); else this.persist();
    }

    /** Voluntary, single-use reveal from a hidden clue that became visible before being placed. */
    activate(i) {
        const r = this.session.activate(i);
        if (!r.ok) return;
        this.moves++;
        this.armed = 0;
        this.hintCell = -1;
        this.hintUnit = -1;
        for (const j of r.revealed) {
            const v = this.session.cell(j);
            if (v.digit) this.clearNotesFor(j, v.digit);
        }
        this.mist.reveal(r.revealed, i);
        this.mist.ripple(i);
        this.float(i, this.t().floatRekindle, 'muted');
        this.audio.hint();
        this.el.message.textContent = '';
        this.announce(fill(this.t().srRekindle, { n: r.revealed.length }));
        this.render();
        this.ensureLoop();
        if (r.done) this.finish(); else this.persist();
    }

    toggleNote(i, d) {
        if (this.session.isKnown(i)) return;
        this.notes[i] ^= 1 << (d - 1);
        this.moves++;
        this.render();
        this.persist();
    }

    clearNotesFor(i, d) {
        this.notes[i] = 0;
        for (const p of PEERS[i]) this.notes[p] &= ~(1 << (d - 1));
    }

    eraseNotes() {
        if (this.state !== 'playing' || this.isPaused || this.selected < 0) return;
        this.notes[this.selected] = 0;
        this.render();
        this.persist();
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
        this.moves++;
        this.persist();
        const t = this.t();
        this.selected = h.cell;
        this.hintCell = h.cell;
        this.hintUnit = h.unit;
        this.armed = 0;
        if (h.action === 'activate') {
            this.el.message.textContent = t.hintRekindle;
            this.announce(t.hintRekindle);
            this.audio.hint();
            this.render();
            this.board.focus(h.cell);
            return;
        }
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
        this.state = 'result'; this.contextualRestart?.sync();
        this.pauseOwnership.invalidate();
        const summary = this.session.summary();
        if (this.meta.kind === 'daily') {
            const { dateKey } = this.meta;
            // 兜底：完成标记已经在了（例如不支持 Web Locks 的环境里另一个标签页先完成）就降为练习局
            const ranked = this.isRanked() && !this.dailyDoneFor(dateKey);
            this.meta.ranked = ranked;
            if (ranked) {
                const record = { score: summary.score, time: this.elapsed };
                this.dailyCleared.set(dateKey, record);
                // 完成标记写成了才清进度。写不进去时：本页靠内存兜底不再开计分局；进度改存成
                // 「含最后一步」的完整输入序列（最后一步走的是 finish 不是 persist），
                // 刷新后 begin() 重放到 done 直接结算出同一个分数
                if (saveDailyDone(dateKey, record)) this.daily.clear(dateKey);
                else this.daily.save(dateKey, { inputs: this.session.inputs, elapsed: this.elapsed, notes: this.notes });
                // 只有第一次完成进排行榜；之后再进都是练习局
                this.onDailyCleared({ dateKey, score: summary.score });
            } else if (loadDailyDone(dateKey)) {
                // 只有完成标记真的落盘了才清进度——内存兜底不算，否则练习局会删掉唯一的恢复数据
                clearDailyRun(dateKey);
            }
            // 这一局结束了，放开锁（别的标签页可以进来：已完成就是练习局）
            this.daily.release();
            const first = this.dailyDoneFor(dateKey);
            this.result = { summary, ranked, rankedScore: first ? first.score : summary.score, time: this.elapsed, inputs: this.session.inputs };
        } else {
            const prev = loadBest(this.meta.id);
            const isBest = prev === null || summary.score > prev;
            if (isBest) saveBest(this.meta.id, summary.score);
            this.result = { summary, best: prev === null ? summary.score : Math.max(prev, summary.score), isBest, time: this.elapsed, inputs: this.session.inputs };
        }
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
        const daily = this.meta.kind === 'daily';
        this.el.resultTitle.textContent = t.cleared;
        this.el.resultCopy.textContent = fill(t.clearedCopy, { name: this.meta.name[lang] });
        this.el.resultScore.textContent = String(summary.score);
        if (daily) {
            this.el.resultBest.textContent = this.result.ranked ? t.dailyRanked : fill(t.dailyPractice, { n: this.result.rankedScore });
            this.el.resultBest.classList.toggle('sm-result-best--new', this.result.ranked);
        } else {
            this.el.resultBest.textContent = isBest ? t.newBest : fill(t.bestLine, { n: best });
            this.el.resultBest.classList.toggle('sm-result-best--new', isBest);
        }
        // 星级只给章节关卡（阈值在 levels.js）；自由局 / 每日题没有
        const level = levelById(this.meta.id);
        const stars = this.meta.kind === 'level' && level ? starsFor(summary.score, level.stars) : 0;
        this.el.resultStars.classList.toggle('hidden', !stars);
        this.el.resultStars.dataset.stars = String(stars);
        this.el.resultStars.textContent = stars ? starText(stars) : '';
        this.el.resultStars.setAttribute('aria-label', stars ? fill(t.starsLabel, { n: stars }) : '');
        // 结算卡上的排行榜入口只在每日局出现（排行榜只有每日榜）
        this.el.result.querySelector('.scoreboard-trigger')?.classList.toggle('hidden', !daily);
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
        this.state = 'replay'; this.contextualRestart?.sync();
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
        } else if (a.type === 'activate') {
            const r = this.replaySession.activate(a.cell);
            this.selected = a.cell;
            if (r.ok) {
                this.mist.reveal(r.revealed, a.cell);
                this.mist.ripple(a.cell);
                this.float(a.cell, this.t().floatRekindle, 'muted');
            }
        } else if (a.type === 'hint') {
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
        this.state = 'result'; this.contextualRestart?.sync();
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
        const t = this.t();
        this.el.pauseCopy.textContent = this.isRanked() ? t.pausedCopyDaily : t.pausedCopy;
        this.el.pauseRestart.classList.toggle('hidden', this.isRanked());
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
        this.persist();
        this.elapsed = this.elapsedMs();
        this.isPaused = true; this.contextualRestart?.sync();
        this.runStart = 0;
        this.stopLoop();
        this.syncChrome();
    }

    resumeQuiet() {
        if (this.state !== 'playing' || !this.isPaused) return;
        this.isPaused = false; this.contextualRestart?.sync();
        this.runStart = performance.now();
        this.syncChrome();
        this.ensureLoop();
    }

    /* ───────────── 渲染 ───────────── */

    cellLabel(i, v, mask) {
        const t = this.t();
        const parts = [fill(t.cellLabel, { r: ((i / 9) | 0) + 1, c: (i % 9) + 1 })];
        if (v.state === 'fog') parts.push(t.cellFog);
        else if (v.state === 'given') {
            parts.push(fill(t.cellGiven, { d: v.digit }));
            if (v.revealReady) parts.push(t.cellRekindle);
        }
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
        this.el.pauseCopy.textContent = this.isRanked() ? t.pausedCopyDaily : t.pausedCopy;
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
