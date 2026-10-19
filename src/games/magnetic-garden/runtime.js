import { getLang } from '../../platform/site-settings.js';
import { ICONS } from '../../platform/icons.js';
import { createPauseOwnership, bindPageVisibility } from '../../platform/runtime/pause-ownership.js';
import { LANGUAGES } from './i18n.js';
import { LEVELS, CHAPTERS, getLevel } from './model/levels.js';
import { createState, applyAction, stateKey } from './model/rules.js';
import { loadProgress, writeProgress } from './storage.js';
import { flower, HERO, stars, FLIP_ICON } from './art.js';
import { describePreview } from './preview-description.js';
const $ = id => document.getElementById(id);
const fill = (s, values) => s.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '');
const chapterIds = CHAPTERS.map(chapter => chapter.id);
const clone = value => JSON.parse(JSON.stringify(value));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
// The finished garden blooms on the board before the result card covers it.
const BLOOM_MS = 600, BLOOM_STAGGER_MS = 80;
const CONFIRM_GUARD_MS = 250;
const iconLabel = (id, icon, label) => { $(id).innerHTML = `${icon || ''}<span></span>`; $(id).lastElementChild.textContent = label; };

export class MagneticGardenGame {
    constructor({ track = () => {}, onChapter = () => {} } = {}) {
        this.track = track; this.onChapter = onChapter;
        this.state = 'menu'; this.isPaused = false; this.animating = false;
        this.level = LEVELS[0]; this.sim = createState(this.level); this.actions = []; this.history = [];
        const saved = loadProgress(); this.best = saved.best; this.savedCurrent = saved.current; this.recovered = saved.recovered;
        this.selected = null; this.preview = null; this.hintStage = 0; this.focusCell = 0; this.animationToken = 0; this.hintToken = 0; this.hintWorker = null; this.sessionFinished = false;
        this.pauseOwnership = createPauseOwnership({
            isRunning: () => this.isRunning(),
            canResume: () => this.state === 'playing' && this.isPaused && $('mg-pause').classList.contains('hidden'),
            pause: () => this.pauseQuiet(), resume: () => this.resumeQuiet(), releaseInputs: () => this.clearPreview(),
        });
    }
    t() { return LANGUAGES[getLang()] || LANGUAGES.en; }
    chapterText(id, field = 'title') { const text = CHAPTERS.find(chapter => chapter.id === id)?.[field]; return text?.[getLang()] || text?.en || ''; }
    starCount(level, moves) { return moves <= level.par ? 3 : moves <= level.excellent ? 2 : 1; }
    get moves() { return this.sim.moves; }
    isRunning() { return this.state === 'playing' && !this.isPaused && !document.hidden; }
    init() {
        $('mg-hero').innerHTML = HERO; this.loadHeroArt(); $('mg-pause-flower').innerHTML = flower(4);
        const on = (id, fn) => $(id).addEventListener('click', fn);
        on('mg-btn-start', () => this.start(this.resumeLevelId(), !!this.savedCurrent));
        on('mg-undo', () => this.undo()); on('mg-result-undo', () => this.undo()); on('mg-flip', () => this.flip());
        on('mg-commit', () => this.commit(this.preview?.action)); on('mg-clear-preview', () => this.clearPreview());
        on('mg-hint-btn', () => this.hint()); on('mg-pause-btn', () => this.togglePause());
        on('mg-resume', () => this.resume()); on('mg-restart', () => this.restart()); on('mg-pause-menu', () => this.toMenu());
        on('mg-result-menu', () => this.toMenu()); on('mg-again', () => this.restart());
        on('mg-next', () => { const next = LEVELS[LEVELS.indexOf(this.level) + 1]; next ? this.start(next.id) : this.toMenu(); });
        on('mg-help-btn', () => this.openHelp()); on('mg-help-close', () => this.closeHelp());
        $('mg-chapters').addEventListener('click', e => { const button = e.target.closest('[data-level]'); if (button) this.start(button.dataset.level); });
        $('mg-board').addEventListener('click', e => { const cell = e.target.closest('[data-cell]'); if (cell) this.selectCell(Number(cell.dataset.cell)); });
        $('mg-board').addEventListener('pointerover', e => { const cell = e.target.closest('[data-cell]'); if (cell && e.pointerType !== 'touch') this.hoverCell(Number(cell.dataset.cell)); });
        $('mg-board').addEventListener('focusin', e => { const cell = e.target.closest('[data-cell]'); if (cell) { this.focusCell = Number(cell.dataset.cell); this.hoverCell(this.focusCell); } });
        $('mg-inventory').addEventListener('click', e => { const b = e.target.closest('[data-magnet]'); if (b && this.isRunning()) { this.selected = b.dataset.magnet; this.clearPreview(); this.render(); } });
        document.addEventListener('keydown', e => this.keydown(e));
        bindPageVisibility(this.pauseOwnership, { autoResume: false, onHidden: () => { this.save(); if (this.state === 'playing') this.showPauseOverlay(); } });
        window.addEventListener('pagehide', () => this.save());
        window.addEventListener('site-settings:changed', () => this.applyLanguage());
        this.applyLanguage(); this.toMenu();
        if (this.recovered) this.announce(this.t().resetNotice);
    }
    loadHeroArt() {
        // Keep the original vector nursery visible until the decorative artwork decodes.
        const image = document.createElement('img'); image.className = 'mg-hero-image'; image.alt = ''; image.decoding = 'async'; image.width = 1536; image.height = 1024;
        image.onload = async () => { try { await image.decode(); } catch { /* A loaded image may already be decoded. */ } image.classList.add('is-ready'); $('mg-hero').querySelector('.mg-hero-art')?.classList.add('is-retired'); };
        image.onerror = () => image.remove();
        $('mg-hero').append(image);
        image.src = new URL('../../../assets/magnetic-garden/greenhouse-hero.webp', import.meta.url).href;
    }
    start(id = LEVELS[0].id, restore = false) {
        const level = getLevel(id); if (!level) return false;
        this.cancelHint(); this.animationToken++; this.animating = false; this.sessionFinished = false; this.level = level;
        if (restore && this.savedCurrent?.level.id === id && !this.savedCurrent.state.won) {
            this.sim = clone(this.savedCurrent.state); this.history = clone(this.savedCurrent.history); this.actions = clone(this.savedCurrent.actions);
        } else { this.sim = createState(level); this.history = []; this.actions = []; }
        this.state = 'playing'; this.isPaused = false; this.pauseOwnership.invalidate(); this.selected = this.sim.magnets.find(m => !m.fixed)?.id ?? null;
        this.preview = null; this.hintStage = 0; this.hintMessage = ''; this.focusCell = this.sim.magnets.find(m => m.id === this.selected)?.cell ?? 0;
        this.hideModals(); $('mg-start').classList.add('hidden'); $('mg-play').classList.remove('hidden');
        // The long mobile menu scrolls the document; play uses a viewport stage.
        // Reset after hiding the menu, before focus({ preventScroll: true }).
        if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
        this.track('magnetic-garden', 'play'); this.save(); this.render();
        requestAnimationFrame(() => $('mg-board').querySelector(`[data-cell="${this.focusCell}"]`)?.focus({ preventScroll: true }));
        return true;
    }
    restart() { return this.start(this.level.id); }
    /** An unfinished run first, then the first unplanted garden, then the first one short of perfect. */
    resumeLevelId() { return this.savedCurrent?.level.id ?? (LEVELS.find(l => !this.best[l.id]) || LEVELS.find(l => this.best[l.id].moves > l.par) || LEVELS[0]).id; }
    toMenu() {
        if (this.state === 'playing') this.save();
        this.cancelHint(); this.animationToken++; this.animating = false; this.state = 'menu'; this.isPaused = false; this.pauseOwnership.invalidate();
        this.preview = null; this.syncPreviewSummary(); this.hideModals(); $('mg-play').classList.add('hidden'); $('mg-start').classList.remove('hidden'); $('mg-start').inert = false;
        this.renderMenu(); this.syncPause();
    }
    currentSnapshot() { return { levelId: this.level.id, levelVersion: this.level.version, actions: clone(this.actions), state: clone(this.sim), history: clone(this.history) }; }
    save() {
        let current = this.savedCurrent ? { levelId: this.savedCurrent.level.id, levelVersion: this.savedCurrent.level.version, actions: this.savedCurrent.actions, state: this.savedCurrent.state, history: this.savedCurrent.history } : null;
        // A won garden is a record, not resumable progress, even while its winning slide still plays.
        if (this.state === 'over' || (this.state === 'playing' && this.sim.won)) { current = null; this.savedCurrent = null; }
        else if (this.state === 'playing') {
            current = this.currentSnapshot(); this.savedCurrent = { level: this.level, state: clone(this.sim), actions: clone(this.actions), history: clone(this.history) };
        }
        if (!writeProgress(this.best, current)) this.announce(this.t().saveNotice);
    }
    async commit(action) {
        if (!this.isRunning() || this.animating || !action) return false;
        const result = applyAction(this.level, this.sim, action);
        if (!result.valid) { this.announce(this.t().invalid); return false; }
        this.cancelHint(); this.history.push(clone(this.sim)); this.actions.push(clone(action)); this.preview = null; this.hintStage = 0; this.hintMessage = '';
        this.sim = result.state;
        // Record the win before the slide plays, so leaving mid-animation never loses it;
        // the result card waits until the last seed has visibly bloomed (or a resume shows it).
        if (this.sim.won) this.recordWin();
        this.save(); this.render();
        const token = ++this.animationToken; const motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (motion && result.frames.length) {
            this.animating = true;
            for (const frame of result.frames) {
                if (token !== this.animationToken) return true;
                this.renderBoard({ ...this.sim, seeds: frame.seeds });
                await wait(95);
            }
        }
        if (token !== this.animationToken) return true;
        this.render();
        if (this.sim.won && motion) {
            this.animating = true; await wait(this.bloomBoard());
            if (token !== this.animationToken) return true;
        }
        this.animating = false;
        if (this.sim.won) this.finish(); else this.announce(fill(this.t().srMove, { n: this.sim.moves, planted: this.plantedText() }));
        return true;
    }
    undo() {
        if ((!this.isRunning() && this.state !== 'over') || !this.history.length) return false;
        this.cancelHint();
        if (this.state === 'over') { this.state = 'playing'; this.isPaused = false; this.hideModals(); this.pauseOwnership.invalidate(); }
        this.animationToken++; this.animating = false; this.sim = this.history.pop(); this.actions.pop(); this.clearPreview(); this.hintStage = 0; this.hintMessage = '';
        this.save(); this.render(); this.announce(fill(this.t().srMove, { n: this.sim.moves, planted: this.plantedText() })); return true;
    }
    recordWin() {
        const old = this.best[this.level.id]; this.newBest = !old || this.sim.moves < old.moves;
        if (this.newBest) this.best[this.level.id] = { version: this.level.version, moves: this.sim.moves, actions: clone(this.actions) };
        if (!this.sessionFinished) { this.track('magnetic-garden', 'finish'); this.sessionFinished = true; }
        const total = this.chapterTotal(this.level.chapter);
        if (total !== null && this.newBest) this.onChapter({ chapter: this.level.chapter, score: total });
    }
    finish() {
        if (this.state !== 'playing') return;
        this.state = 'over'; this.isPaused = false; this.pauseOwnership.invalidate(); this.save();
        this.renderResult(); this.openModal('mg-result', 'mg-next'); this.bloomAnimation(); this.syncPause(); this.announce(fill(this.t().srWin, { n: this.sim.moves }));
    }
    chapterTotal(chapter) { const levels = LEVELS.filter(l => l.chapter === chapter); return levels.every(l => this.best[l.id]) ? levels.reduce((n, l) => n + this.best[l.id].moves, 0) : null; }
    selectCell(cell) {
        if (!this.isRunning() || this.animating) return;
        const magnet = this.sim.magnets.find(m => m.cell === cell);
        if (magnet) {
            if (magnet.fixed) { this.announce(this.t().fixed); return; }
            if (this.selected === magnet.id) this.choose({ type: 'flip', magnetId: magnet.id });
            else { this.selected = magnet.id; this.clearPreview(); this.render(); this.announce(fill(this.t().selected, { id: magnet.id })); }
        } else if (this.selected && this.level.sockets.includes(cell)) this.choose({ type: 'move', magnetId: this.selected, cell });
    }
    /** Choosing the previewed action again makes the move; a too-quick repeat is a double tap, not a decision. */
    choose(action) {
        const shown = this.preview?.pinned ? this.preview : null;
        if (shown && shown.action.type === action.type && shown.action.magnetId === action.magnetId && shown.action.cell === action.cell) {
            if (performance.now() - shown.at >= CONFIRM_GUARD_MS) void this.commit(action);
            return;
        }
        this.previewAction(action);
    }
    hoverCell(cell) {
        if (!this.isRunning() || !this.selected || this.animating || this.preview?.pinned) return;
        const action = { type: 'move', magnetId: this.selected, cell };
        const result = applyAction(this.level, this.sim, action);
        if (result.valid) { this.preview = { action, result, pinned: false }; this.renderTrails(); }
    }
    previewAction(action) {
        if (!this.isRunning() || this.animating || !action) return false;
        const result = applyAction(this.level, this.sim, action);
        if (!result.valid) { this.announce(this.t().invalid); return false; }
        this.preview = { action: clone(action), result, pinned: true, at: performance.now() }; this.showPreview(); this.renderTrails(); return true;
    }
    showPreview() { if (!this.preview) return; this.syncPreviewPanel(); $('mg-instruction').textContent = this.t().previewCopy; this.syncPreviewSummary(); }
    /** The confirm row takes the tool row's place, so a preview never pushes controls below the fold. */
    syncPreviewPanel() {
        const panel = $('mg-preview-panel'), tools = $('mg-tool-row'), pinned = !!this.preview?.pinned;
        if (!panel || panel.classList.contains('hidden') !== pinned) return;
        const refocus = (pinned ? tools : panel).contains(document.activeElement);
        panel.classList.toggle('hidden', !pinned); tools.classList.toggle('hidden', pinned);
        // Return to the selected magnet: focusing a socket would immediately preview again.
        const anchor = this.sim.magnets.find(m => m.id === this.selected)?.cell ?? this.focusCell;
        if (refocus) (pinned ? $('mg-commit') : $('mg-board').querySelector(`[data-cell="${anchor}"]`))?.focus({ preventScroll: true });
    }
    syncPreviewSummary() {
        const status = $('mg-preview-summary');
        const description = describePreview(this.level, this.sim, this.preview, this.t());
        if (status.textContent !== description) status.textContent = description;
    }
    clearPreview() { this.preview = null; this.syncPreviewSummary(); this.syncPreviewPanel(); $('mg-trails')?.replaceChildren(); $('mg-board')?.querySelectorAll('.is-preview-end').forEach(n => n.classList.remove('is-preview-end')); if ($('mg-instruction')) $('mg-instruction').textContent = this.selected ? fill(this.t().selected, { id: this.selected }) : this.t().select; }
    flip() { if (this.selected) this.choose({ type: 'flip', magnetId: this.selected }); }
    cancelHint() { this.hintToken++; this.hintWorker?.terminate(); this.hintWorker = null; }
    bloomAnimation() {
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        $('mg-result-flower').animate([{ transform:'translateY(16px) scale(.65)', opacity:0 },{ transform:'translateY(-7px) scale(1.07)', opacity:1 },{ transform:'translateY(0) scale(1)', opacity:1 }], { duration:650, easing:'cubic-bezier(.22,.7,.3,1)' });
    }
    /** Blooms every planted flower in turn; returns when the last one has finished opening. */
    bloomBoard() {
        const flowers = [...$('mg-board').querySelectorAll('.is-grown .mg-flower')];
        flowers.forEach((node,i) => node.animate([{transform:'scale(.25)',opacity:0},{transform:'scale(1.1)',opacity:1},{transform:'scale(1)',opacity:1}],{duration:BLOOM_MS,delay:i*BLOOM_STAGGER_MS,easing:'ease-out'}));
        return BLOOM_MS + Math.max(0, flowers.length - 1) * BLOOM_STAGGER_MS;
    }
    showHintAction(action) {
        const previous = this.selected;
        this.selected = action.magnetId;
        if (!this.previewAction(action)) { this.selected = previous; return; }
        // Shared by authored-path and Worker hints: retarget the visual and ARIA
        // selection before the player can clear the preview or flip the magnet.
        if (previous !== this.selected) { this.renderBoard(); this.renderInventory(); }
        this.hintMessage = fill(this.t().hintMove, { action: action.type === 'flip' ? fill(this.t().flipAction, { id: action.magnetId }) : fill(this.t().moveAction, { id: action.magnetId, r: Math.floor(action.cell / this.level.width) + 1, c: action.cell % this.level.width + 1 }) });
        $('mg-hint-text').classList.remove('hidden'); $('mg-hint-text').textContent = this.hintMessage; this.announce(this.hintMessage);
    }
    searchHint() {
        this.cancelHint(); const token = this.hintToken, key = stateKey(this.sim);
        this.hintMessage = this.t().hintSearching; $('mg-hint-text').classList.remove('hidden'); $('mg-hint-text').textContent = this.hintMessage;
        try {
            const worker = new Worker(new URL('./hint-worker.js', import.meta.url), { type:'module' }); this.hintWorker = worker;
            const finish = message => { if (token !== this.hintToken || key !== stateKey(this.sim) || this.state !== 'playing') return; worker.terminate(); this.hintWorker = null; this.hintMessage = message; $('mg-hint-text').textContent = message; this.announce(message); };
            worker.onmessage = ({data}) => { if (token !== this.hintToken || key !== stateKey(this.sim) || this.state !== 'playing') return; if (data.status === 'solved' && data.solution?.length) { worker.terminate(); this.hintWorker = null; this.showHintAction(data.solution[0]); } else finish(data.status === 'unsolvable' ? this.t().hintDeadEnd : this.t().hintUnknown); };
            worker.onerror = () => finish(this.t().hintUnknown);
            worker.postMessage({ level:this.level, state:clone(this.sim) });
        } catch { this.hintMessage = this.t().hintUnknown; $('mg-hint-text').textContent = this.hintMessage; }
    }
    hint() {
        if (!this.isRunning() || this.animating) return;
        this.hintStage++;
        if (this.hintStage === 1) this.hintMessage = this.level.hint?.[getLang()] || this.t().hintStart;
        else {
            let state = createState(this.level); let action = null;
            for (const candidate of this.level.solution) { if (stateKey(state) === stateKey(this.sim)) { action = candidate; break; } state = applyAction(this.level, state, candidate, { frames: false }).state; }
            if (action) this.showHintAction(action); else { this.searchHint(); return; }
        }
        $('mg-hint-text').classList.remove('hidden'); $('mg-hint-text').textContent = this.hintMessage;
        iconLabel('mg-hint-btn', ICONS.help, this.hintStage ? this.t().nextHint : this.t().hint); this.announce(this.hintMessage);
    }
    pauseQuiet() { if (this.state !== 'playing') return; this.cancelHint(); if (this.hintMessage === this.t().hintSearching) this.hintMessage = ''; this.isPaused = true; this.animationToken++; this.animating = false; this.render(); }
    resumeQuiet() { if (this.state !== 'playing') return; this.isPaused = false; this.hideModals(); this.render(); if (this.sim.won) this.finish(); }
    showPauseOverlay() { if (this.state !== 'playing') return; this.pauseQuiet(); this.openModal('mg-pause', 'mg-resume'); }
    pause() { if (this.isRunning()) this.showPauseOverlay(); }
    resume() { if (this.state === 'playing' && !this.pauseOwnership.isHeld()) this.resumeQuiet(); }
    togglePause() { if (this.state !== 'playing' || this.pauseOwnership.isHeld()) return; this.isPaused ? this.resume() : this.pause(); }
    hideModals() { for (const id of ['mg-pause', 'mg-result', 'mg-help']) $(id).classList.add('hidden'); $('mg-play').inert = false; $('mg-start').inert = false; }
    openModal(id, focusId) { $(id).classList.remove('hidden'); $('mg-play').inert = true; $('mg-start').inert = true; requestAnimationFrame(() => $(focusId).focus({ preventScroll: true })); }
    openHelp() { this.helpReturn = document.activeElement; this.pauseOwnership.acquire('help'); this.openModal('mg-help', 'mg-help-close'); }
    closeHelp() { $('mg-help').classList.add('hidden'); $('mg-play').inert = false; $('mg-start').inert = false; this.pauseOwnership.release('help'); this.helpReturn?.focus({ preventScroll: true }); }
    syncPause() { $('mg-pause-btn').innerHTML = this.isPaused ? ICONS.play : ICONS.pause; $('mg-pause-btn').disabled = this.state !== 'playing'; $('mg-pause-btn').setAttribute('aria-label', this.isPaused ? this.t().resumeLabel : this.t().pause); $('mg-pause-btn').title = this.isPaused ? this.t().resumeLabel : this.t().pause; }
    plantedText() { return fill(this.t().planted, { n: this.sim.seeds.filter(s => s.captured).length, total: this.sim.seeds.length }); }
    announce(message) { $('mg-sr-status').textContent = message; }
    render() {
        const t = this.t(); const n = LEVELS.indexOf(this.level) + 1;
        $('mg-chapter-label').textContent = `${this.chapterText(this.level.chapter)} · ${String(n).padStart(2, '0')} / ${LEVELS.length}`;
        $('mg-level-title').textContent = this.level.title[getLang()] || this.level.title.en;
        $('mg-moves').textContent = this.sim.moves; $('mg-planted').textContent = this.plantedText();
        $('mg-best').textContent = `${t.best} ${this.best[this.level.id]?.moves ?? t.noBest}`; $('mg-target').textContent = `${t.target} ${this.level.par}`;
        $('mg-instruction').textContent = this.preview?.pinned ? t.previewCopy : this.selected ? fill(t.selected, { id: this.selected }) : t.select;
        $('mg-undo').disabled = !this.history.length || !this.isRunning(); $('mg-flip').disabled = !this.selected || !this.isRunning(); $('mg-hint-btn').disabled = !this.isRunning();
        iconLabel('mg-hint-btn', ICONS.help, this.hintStage ? t.nextHint : t.hint);
        $('mg-hint-text').classList.toggle('hidden', !this.hintMessage); $('mg-hint-text').textContent = this.hintMessage || '';
        this.syncPreviewPanel();
        this.renderBoard(); this.renderInventory(); this.syncPause();
    }
    renderBoard(state = this.sim) {
        const board = $('mg-board'); const focus = board.contains(document.activeElement) ? Number(document.activeElement.dataset.cell) : null;
        // The board area sizes the frame from both of its dimensions (css/magnetic-garden.css).
        $('mg-board-area').style.setProperty('--mg-cols', this.level.width); $('mg-board-area').style.setProperty('--mg-rows', this.level.height);
        board.setAttribute('aria-label', `${this.t().title}: ${this.level.title[getLang()] || this.level.title.en}`);
        board.setAttribute('aria-rowcount', this.level.height); board.setAttribute('aria-colcount', this.level.width);
        const cells = document.createDocumentFragment(); let row;
        for (let cell = 0; cell < this.level.width * this.level.height; cell++) {
            if (cell % this.level.width === 0) { row = document.createElement('div'); row.className = 'mg-row'; row.setAttribute('role', 'row'); cells.append(row); }
            const b = document.createElement('button'); b.type = 'button'; b.className = 'mg-cell'; b.dataset.cell = cell; b.setAttribute('role', 'gridcell');
            b.tabIndex = cell === this.focusCell ? 0 : -1; b.setAttribute('aria-rowindex', Math.floor(cell / this.level.width) + 1); b.setAttribute('aria-colindex', cell % this.level.width + 1);
            let label = this.t().empty;
            if (this.level.sockets.includes(cell)) { b.classList.add('is-socket'); b.innerHTML = '<span class="mg-socket" aria-hidden="true"></span>'; label = this.t().socket; }
            if (this.level.stones.includes(cell)) { b.classList.add('is-stone'); b.innerHTML = '<span class="mg-stone" aria-hidden="true"></span>'; label = this.t().stone; }
            if (this.level.pots.includes(cell)) { b.classList.add('is-pot'); b.innerHTML = '<span class="mg-pot" aria-hidden="true"><i></i></span>'; label = this.t().pot; }
            const seed = state.seeds.find(s => s.cell === cell);
            if (seed) {
                b.classList.add(seed.captured ? 'is-grown' : 'has-seed');
                b.innerHTML += seed.captured ? flower(this.sim.seeds.findIndex(s => s.id === seed.id)) : `<span class="mg-seed mg-seed--${seed.polarity}" aria-hidden="true"><i class="mg-seed-leaf"></i><b class="mg-seed-letter">${seed.polarity}</b></span>`;
                label += `, ${fill(this.t().seed, { pole: seed.polarity })}${seed.captured ? `, ${this.t().completed}` : ''}`;
            }
            const magnet = state.magnets.find(m => m.cell === cell);
            if (magnet) {
                b.classList.add('has-magnet'); b.classList.toggle('is-selected', magnet.id === this.selected); b.setAttribute('aria-selected', String(magnet.id === this.selected));
                b.innerHTML = `<span class="mg-magnet mg-magnet--${magnet.polarity}${magnet.fixed ? ' mg-magnet--rooted' : ''}" aria-hidden="true"><b class="mg-magnet-letter">${magnet.polarity}</b><small class="mg-magnet-id">${magnet.fixed ? '•' : magnet.id.replace(/^m/, '')}</small></span>`;
                label = fill(this.t().magnet, { pole: magnet.polarity, id: magnet.id }) + (magnet.fixed ? `, ${this.t().rooted}` : '');
            }
            b.setAttribute('aria-label', `${fill(this.t().cell, { r: Math.floor(cell / this.level.width) + 1, c: cell % this.level.width + 1 })}: ${label}`);
            row.append(b);
        }
        board.replaceChildren(cells);
        if (focus !== null) board.querySelector(`[data-cell="${focus}"]`)?.focus({ preventScroll: true });
        this.renderTrails();
    }
    renderInventory() {
        const list = $('mg-inventory'); list.replaceChildren();
        for (const magnet of this.sim.magnets.filter(m => m.cell === null)) {
            const b = document.createElement('button'); b.type = 'button'; b.dataset.magnet = magnet.id; b.className = 'mg-inventory-magnet';
            b.setAttribute('aria-label', fill(this.t().magnet, { id: magnet.id, pole: magnet.polarity })); b.setAttribute('aria-pressed', String(this.selected === magnet.id));
            b.innerHTML = `<span class="mg-magnet mg-magnet--${magnet.polarity}" aria-hidden="true"><b class="mg-magnet-letter">${magnet.polarity}</b><small class="mg-magnet-id">${magnet.id.replace(/^m/, '')}</small></span>`; list.append(b);
        }
        list.classList.toggle('hidden', !list.children.length);
    }
    renderTrails() {
        this.syncPreviewSummary();
        const svg = $('mg-trails'); svg.replaceChildren(); $('mg-board').querySelectorAll('.is-preview-end').forEach(n => n.classList.remove('is-preview-end'));
        if (!this.preview) return;
        const w = this.level.width * 100, h = this.level.height * 100; svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        const point = cell => [cell % this.level.width * 100 + 50, Math.floor(cell / this.level.width) * 100 + 50];
        const paths = this.sim.seeds.filter(s => !s.captured).map(seed => {
            const cells = [seed.cell, ...this.preview.result.frames.map(f => f.seeds.find(s => s.id === seed.id)?.cell ?? seed.cell)];
            const end = this.preview.result.state.seeds.find(s => s.id === seed.id); $('mg-board').querySelector(`[data-cell="${end.cell}"]`)?.classList.add('is-preview-end');
            return `<polyline points="${cells.map(c => point(c).join(',')).join(' ')}" class="mg-path mg-path--${seed.polarity}"/><circle cx="${point(end.cell)[0]}" cy="${point(end.cell)[1]}" r="23" class="mg-ghost mg-path--${seed.polarity}"/>`;
        });
        const magnet = this.preview.result.state.magnets.find(m => m.id === this.preview.action.magnetId);
        if (magnet?.cell !== null && magnet) { const [x,y] = point(magnet.cell); paths.push(`<rect x="${x-34}" y="${y-34}" width="68" height="68" rx="18" class="mg-preview-magnet mg-path--${magnet.polarity}"/><text x="${x}" y="${y+11}" class="mg-preview-letter">${magnet.polarity}</text>`); }
        svg.innerHTML = paths.join('');
    }
    renderMenu() {
        const t = this.t(); const count = Object.keys(this.best).length;
        iconLabel('mg-btn-start', ICONS.play, this.savedCurrent || count ? t.continue : t.start); $('mg-earned').textContent = fill(t.earned, { n: count, total: LEVELS.length }); $('mg-all-open').textContent = fill(t.allOpen, { n: LEVELS.length });
        const list = $('mg-chapters'); list.replaceChildren();
        for (const [chapterIndex, chapter] of chapterIds.entries()) {
            const section = document.createElement('section'); section.className = 'mg-chapter'; section.dataset.chapter = chapter;
            const header = document.createElement('div'); header.className = 'mg-chapter-head';
            const number = document.createElement('span'); number.className = 'mg-chapter-number'; number.textContent = String(chapterIndex + 1).padStart(2, '0');
            const text = document.createElement('div'); const title = document.createElement('h4'); title.className = 'mg-chapter-title'; title.textContent = this.chapterText(chapter); const copy = document.createElement('p'); copy.className = 'mg-chapter-copy'; copy.textContent = this.chapterText(chapter, 'description'); text.append(title, copy); header.append(number, text);
            const levels = document.createElement('div'); levels.className = 'mg-levels';
            for (const level of LEVELS.filter(l => l.chapter === chapter)) {
                const n = LEVELS.indexOf(level) + 1; const best = this.best[level.id]; const button = document.createElement('button'); button.type = 'button'; button.className = `mg-level${best ? ' is-complete' : ''}`; button.dataset.level = level.id;
                button.setAttribute('aria-label', `${fill(t.level, { n })}: ${level.title[getLang()] || level.title.en}, ${best ? `${t.completed}, ${t.best} ${best.moves}, ${fill(t.stars, { n: this.starCount(level, best.moves) })}` : t.notYet}`);
                const index = document.createElement('b'); index.className = 'mg-level-number'; index.textContent = String(n).padStart(2, '0'); const mark = document.createElement('span'); mark.className = 'mg-level-mark'; mark.textContent = best ? `${best.moves} ${t.moves}` : '·'; button.append(index); if (best) { const rating = document.createElement('span'); rating.className = 'mg-level-stars'; rating.innerHTML = stars(this.starCount(level, best.moves)); button.append(rating); } button.append(mark); levels.append(button);
            }
            const score = document.createElement('p'); score.className = 'mg-chapter-score'; const total = this.chapterTotal(chapter); score.textContent = total === null ? t.chapterScore : fill(t.chapterDone, { n: total });
            section.append(header, levels, score); list.append(section);
        }
        const flowers = $('mg-flowers'); flowers.replaceChildren();
        LEVELS.forEach((level, i) => {
            const item = document.createElement('div'); item.className = `mg-collected-flower${this.best[level.id] ? ' is-earned' : ''}`;
            item.setAttribute('role', 'img'); item.setAttribute('aria-label', this.best[level.id] ? fill(t.flower, { n: i + 1, name: level.title[getLang()] || level.title.en }) : `${fill(t.level, { n: i + 1 })}: ${t.notYet}`);
            item.innerHTML = flower(i); flowers.append(item);
        });
    }
    renderResult() {
        const t = this.t(); $('mg-result-flower').innerHTML = flower(LEVELS.indexOf(this.level));
        const count = this.starCount(this.level, this.sim.moves); $('mg-result-stars').innerHTML = stars(count); $('mg-result-stars').setAttribute('aria-label', fill(t.stars, { n: count }));
        $('mg-result-badge').textContent = this.newBest ? t.newBest : this.sim.moves <= (this.level.excellent ?? this.level.par) ? t.excellentWin : t.completed;
        $('mg-result-score').textContent = `${this.sim.moves} ${t.moves} · ${t.best} ${this.best[this.level.id]?.moves ?? this.sim.moves}`;
        const total = this.chapterTotal(this.level.chapter); $('mg-result-chapter').textContent = total === null ? t.chapterScore : fill(t.chapterDone, { n: total });
        iconLabel('mg-next', ICONS.arrowRight, LEVELS.indexOf(this.level) === LEVELS.length - 1 ? t.menu : t.next);
    }
    applyLanguage() {
        const t = this.t(); document.title = t.pageTitle; this.cancelHint();
        for (const [id, icon, key] of [['mg-home',ICONS.home,'home'],['mg-undo',ICONS.retry,'undo'],['mg-flip',FLIP_ICON,'flip'],['mg-commit',ICONS.check,'commit'],['mg-clear-preview',ICONS.close,'cancelPreview'],['mg-help-btn',ICONS.help,'how'],['mg-help-close',ICONS.check,'closeHelp'],['mg-resume',ICONS.play,'resume'],['mg-restart',ICONS.retry,'restart'],['mg-pause-menu',ICONS.home,'menu'],['mg-result-undo',ICONS.retry,'undo'],['mg-again',ICONS.retry,'again'],['mg-result-menu',ICONS.home,'menu'],['mg-next',ICONS.arrowRight,'next']]) {
            if (id === 'mg-home') { $(id).innerHTML = icon; $(id).title = t[key]; $(id).setAttribute('aria-label', t[key]); } else iconLabel(id, icon, t[key]);
        }
        if (this.hintMessage) { this.hintStage = 0; this.hintMessage = ''; }
        this.renderMenu(); this.render(); if (this.state === 'over') this.renderResult();
    }
    keydown(e) {
        if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
        if (document.querySelector('dialog[open]')) return;
        const modal = ['mg-help','mg-pause','mg-result'].map($).find(n => !n.classList.contains('hidden'));
        if (modal) {
            if (e.key === 'Tab') { const buttons = [...modal.querySelectorAll('button:not(:disabled)')]; const first = buttons[0], last = buttons.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
            if (e.key === 'Escape') { e.preventDefault(); if (modal.id === 'mg-help') this.closeHelp(); else if (modal.id === 'mg-pause') this.resume(); }
            return;
        }
        if (this.state !== 'playing' || this.pauseOwnership.isHeld()) return;
        const key = e.key.toLowerCase();
        if (key === 'escape' && this.preview?.pinned) { e.preventDefault(); this.clearPreview(); return; }
        if (key === 'escape' || key === 'p') { e.preventDefault(); this.togglePause(); return; }
        if (!this.isRunning()) return;
        if (['arrowup','arrowdown','arrowleft','arrowright'].includes(key) && $('mg-board').contains(e.target)) {
            e.preventDefault(); const w = this.level.width; let x = this.focusCell % w, y = Math.floor(this.focusCell / w);
            if (key === 'arrowleft') x = Math.max(0, x - 1); if (key === 'arrowright') x = Math.min(w - 1, x + 1); if (key === 'arrowup') y = Math.max(0, y - 1); if (key === 'arrowdown') y = Math.min(this.level.height - 1, y + 1);
            this.focusCell = y * w + x; $('mg-board').querySelectorAll('[data-cell]').forEach(b => { b.tabIndex = Number(b.dataset.cell) === this.focusCell ? 0 : -1; }); $('mg-board').querySelector(`[data-cell="${this.focusCell}"]`)?.focus();
        } else if (key === 'f') { e.preventDefault(); this.flip(); } else if (key === 'u') { e.preventDefault(); this.undo(); } else if (key === 'h') { e.preventDefault(); this.hint(); }
    }
}
