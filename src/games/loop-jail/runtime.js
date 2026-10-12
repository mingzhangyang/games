/**
 * 画牢 Loop Jail — 游戏层：把模拟、渲染、声音、HUD、浮层与输入接起来
 * =================================================================
 * 状态机：menu → playing（isPaused 叠加）→ over。
 *   - 手动暂停（顶栏暂停钮 / P / Esc / 切到后台）显示暂停浮层，必须手动继续；
 *   - 排行榜弹窗走 pauseOwnership 的 'ranking' 租约，静默暂停、关闭后自动继续原局；
 *   - 顶栏重开（contextual-restart）只在游玩中可见，有进度时先确认。
 * 输入：Pointer Events 统一鼠标与触屏。鼠标移动即移动笔尖、按住左键画线；触屏按下即画。
 * 主循环：requestAnimationFrame，dt 钳制 0.033s；暂停 / 菜单时循环停下，只在需要时补画一帧。
 */
import { bindContextualRestart } from '../../platform/contextual-restart.js';
import { ICONS } from '../../platform/icons.js';
import { getLang } from '../../platform/site-settings.js';
import { createPauseOwnership, bindPageVisibility } from '../../platform/runtime/pause-ownership.js';
import { LANGUAGES } from './i18n.js';
import { LoopJailSim, INK_MAX, MAX_LIVES, WAVE_BREAK, DT_MAX } from './simulation.js';
import { createRenderer } from './renderer.js';
import { createLoopJailAudio } from './audio.js';
import { loadBest, saveBest } from './storage.js';

const GAME_ID = 'loop-jail';
const RESULT_DELAY_MS = 700;
const INK_LOW = 25;

const $ = id => document.getElementById(id);
const fill = (template, vars) => String(template).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

function usesTouchInput() {
    return Boolean(window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
}

export class LoopJailGame {
    /**
     * @param {object} hooks { track(gameId, event), onFinish({ score, wave }) }
     */
    constructor(hooks = {}) {
        this.track = typeof hooks.track === 'function' ? hooks.track : () => {};
        this.onFinish = typeof hooks.onFinish === 'function' ? hooks.onFinish : () => {};
        this.contextualRestart = null;
        this.state = 'menu'; this.contextualRestart?.sync();
        this.isPaused = false; this.contextualRestart?.sync();
        this.strokes = 0;
        this.sim = new LoopJailSim({ seed: 1 });
        this.renderer = null;
        this.audio = createLoopJailAudio();
        this.best = loadBest();
        this.raf = 0;
        this.lastFrame = 0;
        this.pointerId = null;
        this.bannerT = 0;
        this.resultTimer = 0;
        this.hud = {};
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
            releaseInputs: () => this.releasePointer(),
        });
    }

    t() { return LANGUAGES[getLang()] || LANGUAGES.en; }

    isRunning() { return this.state === 'playing' && !this.isPaused; }

    /* ───────────── 初始化 ───────────── */

    init() {
        this.el = {
            stage: $('lj-stage'),
            scene: $('lj-scene'),
            canvas: $('lj-canvas'),
            hud: $('lj-hud'),
            score: $('lj-score'),
            wave: $('lj-wave'),
            ink: $('lj-ink'),
            inkFill: $('lj-ink-fill'),
            lives: $('lj-lives'),
            effects: $('lj-effects'),
            banner: $('lj-banner'),
            sr: $('lj-sr-status'),
            start: $('lj-start'),
            pause: $('lj-pause'),
            over: $('lj-over'),
            bestLine: $('lj-best-line'),
            controls: $('lj-controls'),
            overScore: $('lj-over-score'),
            overWave: $('lj-over-wave'),
            overDetail: $('lj-over-detail'),
            overBest: $('lj-over-best'),
            overNewBest: $('lj-over-newbest'),
            pauseBtn: $('lj-pause-btn'),
            resetBtn: $('lj-reset-btn'),
            hint: $('lj-hint'),
        };
        this.renderer = createRenderer(this.el.canvas, {
            getSim: () => this.sim,
            reducedMotion: () => this.reducedMotion,
        });
        this.bindInput();
        this.bindButtons();
        this.bindResize();
        this.contextualRestart = bindContextualRestart({
            button: this.el.resetBtn,
            active: () => this.isRunning(),
            hasProgress: () => this.strokes > 0 || this.sim.score > 0
                || this.sim.wave > 1 || this.sim.lives < MAX_LIVES,
            restart: () => this.restart(),
            purpose: 'retry',
        });
        bindPageVisibility(this.pauseOwnership, {
            autoResume: false,
            // 回到前台不自动开打：显示暂停浮层，由玩家决定何时继续
            onHidden: () => this.showPauseOverlay(),
        });
        this.applyLanguage();
        window.addEventListener('site-settings:changed', () => this.applyLanguage());
        this.toMenu();
    }

    bindResize() {
        const apply = () => this.resizeNow();
        if (typeof ResizeObserver !== 'undefined') new ResizeObserver(apply).observe(this.el.scene);
        window.addEventListener('resize', apply);
        window.addEventListener('game-frame:changed', apply);
        apply();
    }

    /** 同步量一次画布：世界宽高比跟随舞台，后备缓冲跟随 DPR */
    resizeNow() {
        if (!this.renderer) return;
        const { cssW, cssH } = this.renderer.resize();
        if (this.sim.resize(cssW / cssH)) this.renderer.invalidate();
        if (!this.raf) this.renderer.draw({ playing: this.state === 'playing' });
    }

    /* ───────────── 输入 ───────────── */

    bindInput() {
        const canvas = this.el.canvas;
        const toWorld = e => this.renderer.worldFromClient(e.clientX, e.clientY);
        canvas.addEventListener('pointerdown', e => {
            if (!this.isRunning()) return;
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            e.preventDefault();
            if (this.pointerId !== null) return; // 第二根手指不接管笔尖
            this.pointerId = e.pointerId;
            try { canvas.setPointerCapture(e.pointerId); } catch { /* 合成事件没有活动指针 */ }
            this.audio.prime();
            const p = toWorld(e);
            this.sim.penDown(p.x, p.y);
            this.strokes++;
            this.consumeEvents();
            this.ensureLoop();
        });
        canvas.addEventListener('pointermove', e => {
            if (!this.isRunning()) return;
            const drawing = this.pointerId !== null;
            if (drawing && e.pointerId !== this.pointerId) return;
            if (!drawing && e.pointerType !== 'mouse') return;
            const list = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
            for (const ev of (list.length ? list : [e])) {
                const p = toWorld(ev);
                this.sim.movePen(p.x, p.y);
            }
            this.consumeEvents();
        });
        const up = e => {
            if (this.pointerId === null || e.pointerId !== this.pointerId) return;
            this.pointerId = null;
            this.sim.penUp();
        };
        canvas.addEventListener('pointerup', up);
        canvas.addEventListener('pointercancel', up);
        canvas.addEventListener('lostpointercapture', up);
        canvas.addEventListener('contextmenu', e => e.preventDefault());
        document.addEventListener('keydown', e => {
            if (e.defaultPrevented || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
            const key = e.key.toLowerCase();
            if (key !== 'p' && key !== 'escape') return;
            if (this.state !== 'playing' || this.pauseOwnership.isHeld()) return;
            e.preventDefault();
            this.togglePause();
        });
    }

    releasePointer() {
        if (this.pointerId !== null) {
            try { this.el.canvas.releasePointerCapture(this.pointerId); } catch { /* 已释放 */ }
        }
        this.pointerId = null;
        if (this.sim.pen.down) this.sim.penUp();
    }

    bindButtons() {
        $('lj-btn-start').addEventListener('click', () => this.start());
        $('lj-btn-again').addEventListener('click', () => this.start());
        $('lj-btn-menu').addEventListener('click', () => this.toMenu());
        $('lj-btn-resume').addEventListener('click', () => this.resume());
        $('lj-btn-restart').addEventListener('click', () => this.restart());
        $('lj-btn-pause-menu').addEventListener('click', () => this.toMenu());
        this.el.pauseBtn.addEventListener('click', () => this.togglePause());
    }

    /* ───────────── 生命周期 ───────────── */

    newSeed() {
        return (Math.floor(Math.random() * 0x7fffffff) ^ Date.now()) >>> 0;
    }

    start() {
        window.clearTimeout(this.resultTimer);
        this.releasePointer();
        this.el.start.classList.add('hidden');
        this.el.over.classList.add('hidden');
        this.el.pause.classList.add('hidden');
        this.el.hud.classList.remove('hidden');
        // 菜单收起后舞台回到满屏：先同步量一次，再按新的宽高比开局（生成点离笔尖的安全距离才准）
        this.resizeNow();
        this.sim.reset(this.newSeed());
        this.strokes = 0;
        this.bannerT = 0;
        this.renderer.clearFx();
        this.state = 'playing'; this.contextualRestart?.sync();
        this.isPaused = false; this.contextualRestart?.sync();
        this.pauseOwnership.invalidate();
        this.hud = {};
        this.syncPauseButton();
        this.consumeEvents();
        this.updateHud();
        this.track(GAME_ID, 'play');
        this.audio.start();
        this.ensureLoop();
    }

    restart() {
        this.start();
    }

    toMenu() {
        window.clearTimeout(this.resultTimer);
        this.releasePointer();
        this.state = 'menu'; this.contextualRestart?.sync();
        this.isPaused = false; this.contextualRestart?.sync();
        this.pauseOwnership.invalidate();
        this.el.over.classList.add('hidden');
        this.el.pause.classList.add('hidden');
        this.el.hud.classList.add('hidden');
        this.hideBanner();
        this.el.start.classList.remove('hidden');
        // 菜单背景：一局崭新的第 1 波静止摆在场上（不跑循环，省电）
        this.sim.reset(7);
        for (const m of this.sim.monsters) m.spawn = 0;
        this.sim.drainEvents();
        this.renderer.clearFx();
        this.renderBest();
        this.syncPauseButton();
        this.resizeNow();
        this.renderer.draw({ playing: false });
    }

    finish() {
        if (this.state !== 'playing') return;
        this.releasePointer();
        this.state = 'over'; this.contextualRestart?.sync();
        this.isPaused = false; this.contextualRestart?.sync();
        this.pauseOwnership.invalidate();
        const score = this.sim.score;
        const wave = this.sim.wave;
        const prev = this.best;
        const newBest = score > prev.score;
        // 最高分与最远波次各自记录（可能来自不同的局）
        const best = { score: Math.max(score, prev.score), wave: Math.max(wave, prev.wave) };
        if (best.score !== prev.score || best.wave !== prev.wave) {
            this.best = best;
            saveBest(best);
        }
        this.lastResult = { score, wave, newBest, stats: { ...this.sim.stats } };
        this.onFinish({ score, wave });
        this.track(GAME_ID, 'finish');
        this.audio.gameOver();
        this.renderResult();
        this.syncPauseButton();
        this.hideBanner();
        this.announce(fill(this.t().srOver, { score, wave }));
        this.resultTimer = window.setTimeout(() => {
            if (this.state !== 'over') return;
            this.el.hud.classList.add('hidden');
            this.el.over.classList.remove('hidden');
            $('lj-btn-again').focus({ preventScroll: true });
        }, RESULT_DELAY_MS);
        this.ensureLoop();
    }

    /** 静默暂停（排行榜 / 抽屉之类的 UI 租约用）：不弹暂停浮层 */
    pauseQuiet() {
        if (this.state !== 'playing' || this.isPaused) return;
        this.releasePointer();
        this.isPaused = true; this.contextualRestart?.sync();
        this.syncPauseButton();
        this.renderer.draw({ playing: true });
    }

    resumeQuiet() {
        if (this.state !== 'playing' || !this.isPaused) return;
        this.el.pause.classList.add('hidden');
        this.isPaused = false; this.contextualRestart?.sync();
        this.syncPauseButton();
        this.ensureLoop();
    }

    showPauseOverlay() {
        if (this.state !== 'playing') return;
        this.pauseQuiet();
        this.el.pause.classList.remove('hidden');
    }

    pause() {
        if (!this.isRunning()) return;
        this.showPauseOverlay();
        $('lj-btn-resume').focus({ preventScroll: true });
    }

    resume() {
        if (this.state !== 'playing' || this.pauseOwnership.isHeld()) return;
        this.resumeQuiet();
    }

    togglePause() {
        if (this.state !== 'playing') return;
        if (this.isPaused) this.resume();
        else this.pause();
    }

    /* ───────────── 主循环 ───────────── */

    ensureLoop() {
        if (this.raf) return;
        this.lastFrame = 0;
        this.raf = requestAnimationFrame(this.frame);
    }

    frame(now) {
        this.raf = 0;
        const dt = this.lastFrame ? Math.min(DT_MAX, Math.max(0, (now - this.lastFrame) / 1000)) : 0;
        this.lastFrame = now;
        const running = this.isRunning();
        if (running) {
            this.sim.step(dt);
            this.consumeEvents();
            if (this.bannerT > 0) {
                this.bannerT -= dt;
                if (this.bannerT <= 0) this.hideBanner();
            }
        }
        // 结算后仍让最后的爆散 / 红闪播完；暂停时视觉效果一起冻结
        if (running || this.state === 'over') this.renderer.update(dt);
        this.renderer.draw({ playing: this.state === 'playing' });
        this.updateHud();
        if (this.isRunning() || (this.state === 'over' && this.renderer.isAnimating())) {
            this.raf = requestAnimationFrame(this.frame);
        }
    }

    consumeEvents() {
        const events = this.sim.drainEvents();
        if (!events.length) return;
        const t = this.t();
        this.renderer.handle(events, t);
        const now = this.sim.time;
        for (const e of events) {
            switch (e.type) {
                case 'capture':
                    this.audio.capture(e.count);
                    if (e.count > 0) this.announce(fill(t.srCapture, { n: e.count, score: e.score }));
                    break;
                case 'bite':
                    this.audio.bite();
                    this.announce(t.srBite);
                    break;
                case 'shieldBlock': this.audio.shieldBlock(); break;
                case 'hit':
                    this.audio.hit();
                    if (e.lives > 0) this.announce(fill(t.srHit, { n: e.lives }));
                    break;
                case 'split': this.audio.split(); break;
                case 'pickup': this.audio.pickup(e.kind); break;
                case 'charge': this.audio.charge(now); break;
                case 'inkEmpty': this.audio.inkEmpty(); break;
                case 'waveStart':
                    this.showBanner(fill(t.waveBanner, { n: e.wave }), 1.3);
                    this.announce(fill(t.srWave, { n: e.wave, m: this.sim.monsters.length }));
                    if (e.wave > 1) this.audio.waveStart();
                    break;
                case 'waveClear':
                    this.showBanner(fill(t.waveClear, { n: e.wave }) + (e.healed ? ' · ' + t.healed : ''), WAVE_BREAK);
                    this.audio.waveClear();
                    break;
                case 'gameOver':
                    this.finish();
                    break;
                default:
                    break;
            }
        }
    }

    /* ───────────── HUD / 浮层 ───────────── */

    showBanner(text, seconds) {
        this.el.banner.textContent = text;
        this.el.banner.classList.add('is-on');
        this.bannerT = seconds;
    }

    hideBanner() {
        this.bannerT = 0;
        this.el.banner.classList.remove('is-on');
    }

    announce(text) {
        if (this.el.sr) this.el.sr.textContent = text;
    }

    setText(key, node, value) {
        if (this.hud[key] === value) return;
        this.hud[key] = value;
        node.textContent = value;
    }

    updateHud() {
        const sim = this.sim;
        const t = this.t();
        this.setText('score', this.el.score, sim.score.toLocaleString());
        this.setText('wave', this.el.wave, String(sim.wave));
        const ink = Math.round(sim.ink);
        if (this.hud.ink !== ink) {
            this.hud.ink = ink;
            this.el.inkFill.style.transform = `scaleX(${Math.max(0, Math.min(1, sim.ink / INK_MAX))})`;
            this.el.ink.classList.toggle('is-low', ink < INK_LOW);
            this.el.ink.setAttribute('aria-valuenow', String(ink));
            this.el.ink.setAttribute('aria-valuetext', fill(t.inkAria, { n: ink }));
        }
        if (this.hud.lives !== sim.lives) {
            this.hud.lives = sim.lives;
            [...this.el.lives.children].forEach((node, i) => node.classList.toggle('is-on', i < sim.lives));
            this.el.lives.setAttribute('aria-label', fill(t.livesAria, { n: sim.lives }));
        }
        const d = Math.ceil(sim.effects.double);
        const s = Math.ceil(sim.effects.shield);
        const key = `${d}|${s}|${getLang()}`;
        if (this.hud.effects !== key) {
            this.hud.effects = key;
            this.el.effects.replaceChildren();
            const chip = (cls, text) => {
                const node = document.createElement('span');
                node.className = 'lj-effect ' + cls;
                node.textContent = text;
                this.el.effects.append(node);
            };
            if (d > 0) chip('lj-effect--double', fill(t.chipDouble, { n: d }));
            if (s > 0) chip('lj-effect--shield', fill(t.chipShield, { n: s }));
        }
    }

    syncPauseButton() {
        const btn = this.el.pauseBtn;
        const t = this.t();
        const paused = this.state === 'playing' && this.isPaused;
        btn.innerHTML = paused ? ICONS.play : ICONS.pause;
        const label = paused ? t.resumeLabel : t.pause;
        btn.title = label;
        btn.setAttribute('aria-label', label);
        btn.disabled = this.state !== 'playing';
    }

    renderBest() {
        const t = this.t();
        this.el.bestLine.textContent = this.best.score > 0
            ? fill(t.bestLine, { score: this.best.score.toLocaleString(), wave: this.best.wave })
            : t.noBest;
    }

    renderResult() {
        const r = this.lastResult;
        if (!r) return;
        const t = this.t();
        this.el.overScore.textContent = r.score.toLocaleString();
        this.el.overWave.textContent = fill(t.reachedWave, { n: r.wave });
        // 护盾消灭的小怪计入「收监」但不算闭环，所以单环数为 0 时不显示那一段
        this.el.overDetail.textContent = fill(t.captured, { n: r.stats.captured })
            + (r.stats.bestCombo > 0 ? ' · ' + fill(t.bestLoop, { n: r.stats.bestCombo }) : '');
        this.el.overBest.textContent = fill(t.bestScore, { n: this.best.score.toLocaleString() });
        this.el.overNewBest.textContent = r.newBest ? t.newBest : '';
        this.el.overNewBest.classList.toggle('hidden', !r.newBest);
    }

    applyLanguage() {
        const t = this.t();
        const touch = usesTouchInput();
        this.el.canvas.setAttribute('aria-label', t.canvasLabel);
        this.el.controls.textContent = touch ? t.controlsTouch : t.controlsDesktop;
        this.el.hint.textContent = touch ? t.hintTouch : t.hint;
        this.el.ink.setAttribute('aria-label', t.ink);
        this.hud = {};
        this.renderBest();
        this.renderResult();
        this.syncPauseButton();
        if (this.state === 'playing' || this.state === 'over') this.updateHud();
    }
}
