/**
 * 萤火信号 — 游戏层：把模拟、渲染、声音、HUD 和输入接起来
 * =======================================================
 * 状态机：menu（背景里第一关的虫自己闪，作开场氛围）→ playing → ending（成功序列）→ result
 *
 * 时间：固定步长累加器，每 tick = simulation.DT。真实帧率只决定一帧推进几个 tick，
 * 玩家输入在两个 tick 之间落地（sim.intervene 记下当前 tick），所以
 * same seed + same (tick, id) 序列 = same result（scripts/verify-firefly-signal-sim.mjs 锁住）。
 *
 * 成功序列（不立即弹窗）：达到目标并保持约 2 秒 → HUD 淡出 → 全体被收拢进同一节奏 →
 * 连续 3 次群体闪光，草 / 花 / 露珠 / 水面被一起照亮 → 柔和的完整和弦 → 短暂停顿 → 结算。
 */
import { createSimulation, DT, TUNING } from './simulation.js';
import { createRenderer } from './renderer.js';
import { createFireflyAudio } from './audio.js';
import { LEVELS } from './levels.js';
import { storageGet, storageSet } from '../safe-storage.js';

const GAME_ID = 'firefly-signal';
const HIT_RADIUS = 24;          // CSS 像素：触控目标约 48px，视觉虫体可以很小
const TAP_DEBOUNCE_MS = 320;    // 误触双击：这个间隔内的第二次点击直接丢弃
const FAIL_GRACE = 14;          // 用完干预后再给多少秒让自然耦合把事情做完
const COACH_SECONDS = 7;
const MAX_TICKS_PER_FRAME = 12; // 标签页卡顿后不一次性快进太多

const bestKey = id => `fs_best_${id}`;

export function loadBest(levelId) {
    try {
        const raw = storageGet(bestKey(levelId));
        const v = raw ? JSON.parse(raw) : null;
        return v && typeof v.used === 'number' && typeof v.harmony === 'number' ? v : null;
    } catch (e) {
        return null;
    }
}

function saveBest(levelId, used, harmony) {
    const prev = loadBest(levelId);
    const better = !prev || used < prev.used || (used === prev.used && harmony > prev.harmony);
    if (better) storageSet(bestKey(levelId), JSON.stringify({ used, harmony: Math.round(harmony * 100) / 100 }));
    return better;
}

export class FireflyGame {
    /**
     * @param {object} dom   { stage, canvas, hud, harmony, harmonyValue, ringFill, ringTarget, dots, coach,
     *                         start, result, resultTitle, resultHarmony, resultUsed, btnNext, levelPill, btnRestart }
     * @param {() => object} getText  当前语言整表
     * @param {object} [hooks]  { track(gameId, event) } —— 统计上报由入口注入（入口 import js/analytics.js，
     *                           verify-registry 的 analytics 探针只看入口文件）
     */
    constructor(dom, getText, hooks = {}) {
        this.dom = dom;
        this.t = getText;
        this.track = typeof hooks.track === 'function' ? hooks.track : () => {};
        this.reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.renderer = createRenderer(dom.canvas, {
            reducedMotion: this.reduced,
            // 手绘图层异步加载完成：重画一帧（循环可能已停）并刷新桌面两侧的夜色延展
            onLayersReady: () => { this.render(); this.paintBackdrop(); },
        });
        this.audio = createFireflyAudio();
        this.state = 'menu';
        this.levelIndex = 0;
        this.sim = createSimulation(LEVELS[0]);
        this.pulses = [];
        this.time = 0;
        this.acc = 0;
        this.last = 0;
        this.raf = 0;
        this.paused = false;
        this.manual = false;
        this.displayHarmony = 0;
        this.lastTapAt = -1e9;
        this.coachKey = '';
        this.coachUntil = 0;
        this.ending = null;
        this.failAt = 0;
        this.result = null;
        this.resultAt = 0;
        this.firstTapDone = false;

        this.renderer.setScene(LEVELS[0].seed);
        this.bindInput();
        this.bindResize();
        if (typeof matchMedia === 'function') {
            const mq = matchMedia('(prefers-reduced-motion: reduce)');
            const onMq = () => { this.reduced = mq.matches; this.renderer.setReducedMotion(this.reduced); };
            if (mq.addEventListener) mq.addEventListener('change', onMq);
        }
    }

    /* ───────────── 生命周期 ───────────── */

    startLevel(index, opts = {}) {
        this.levelIndex = Math.max(0, Math.min(LEVELS.length - 1, index));
        const level = LEVELS[this.levelIndex];
        this.sim = createSimulation(level);
        this.renderer.setScene(level.seed);
        this.paintBackdrop();
        this.state = 'playing';
        this.manual = !!opts.manual;
        if (this.manual) this.stopLoop();
        this.pulses = [];
        this.ending = null;
        this.result = null;
        this.failAt = 0;
        this.displayHarmony = this.sim.harmony;
        this.lastTapAt = -1e9;
        this.firstTapDone = false;
        this.audio.reset();
        this.dom.start.classList.add('hidden');
        this.dom.result.classList.add('hidden');
        this.dom.hud.classList.remove('hidden', 'is-faded');
        this.dom.btnRestart.disabled = false;
        this.setCoach('intro');
        this.refreshStatic();
        this.updateHud(true);
        this.track(GAME_ID, 'play');
        if (!this.manual) this.ensureLoop();
        else this.render();
    }

    restart() {
        if (this.state === 'menu') return;
        this.startLevel(this.levelIndex, { manual: this.manual });
    }

    toMenu() {
        this.state = 'menu';
        this.manual = false;
        this.sim = createSimulation(LEVELS[0]);
        this.renderer.setScene(LEVELS[0].seed);
        this.pulses = [];
        this.ending = null;
        this.dom.result.classList.add('hidden');
        this.dom.hud.classList.add('hidden');
        this.dom.btnRestart.disabled = true;
        this.hideCoach();
        this.dom.start.classList.remove('hidden');
        this.refreshStatic();
        this.ensureLoop();
    }

    nextLevel() {
        if (this.levelIndex < LEVELS.length - 1) this.startLevel(this.levelIndex + 1);
        else this.toMenu();
    }

    pauseQuiet() {
        this.paused = true;
        this.stopLoop();
    }

    resumeQuiet() {
        if (!this.paused) return;
        this.paused = false;
        this.ensureLoop();
    }

    /* ───────────── 主循环 ───────────── */

    ensureLoop() {
        if (this.raf || this.paused || this.manual) return;
        this.last = 0;
        const frame = now => {
            this.raf = requestAnimationFrame(frame);
            if (!this.last) this.last = now;
            const dt = Math.min(0.25, (now - this.last) / 1000);
            this.last = now;
            this.acc += dt;
            let n = 0;
            while (this.acc >= DT && n < MAX_TICKS_PER_FRAME) {
                this.tick();
                this.acc -= DT;
                n++;
            }
            if (n >= MAX_TICKS_PER_FRAME) this.acc = 0;
            this.render(dt);
        };
        this.raf = requestAnimationFrame(frame);
    }

    stopLoop() {
        if (this.raf) cancelAnimationFrame(this.raf);
        this.raf = 0;
    }

    /** 测试 / 回放：不走 rAF，精确推进 n 个 tick 后画一帧 */
    advance(n) {
        for (let i = 0; i < n; i++) this.tick();
        this.render(n * DT);
    }

    tick() {
        const sim = this.sim;
        sim.step();
        this.time += DT;
        for (const p of this.pulses) p.age += DT;
        if (this.pulses.length && this.pulses[0].age > 1.2) this.pulses = this.pulses.filter(p => p.age <= 1.2);

        if (this.state === 'menu') return;
        // 结算后让合拍的草地在结算文字后面再亮一会儿，然后停掉循环（约定：game over 停 rAF）
        if (this.state === 'result') {
            if (!this.manual && this.time >= this.resultAt + 8) this.stopLoop();
            return;
        }
        const n = sim.flashed.length;
        if (this.state === 'playing') {
            this.audio.onFlashes(n, sim.flies.length, this.time);
            this.audio.onHarmony(sim.harmony);
            if (sim.won) this.beginEnding();
            else if (sim.remaining() === 0) {
                if (!this.failAt) this.failAt = this.time + FAIL_GRACE;
                if (sim.holdTicks > 0) this.failAt = Math.max(this.failAt, this.time + 2);
                if (this.time >= this.failAt) this.finish(false);
                else if (this.coachKey !== 'outOfSignals' && this.time >= this.failAt - FAIL_GRACE + 5) this.setCoach('outOfSignals');
            }
        } else if (this.state === 'ending') {
            this.tickEnding(n);
        }
    }

    /* ───────────── 成功序列 ───────────── */

    beginEnding() {
        this.state = 'ending';
        const sim = this.sim;
        this.result = { won: true, harmony: sim.harmony, used: sim.interventions.length, max: sim.maxInterventions };
        this.ending = { t: 0, flashes: 0, climax: 0, boost: 1, chordAt: 0, doneAt: 0, lastGroupTick: -99, recent: [] };
        this.dom.hud.classList.add('is-faded');
        this.hideCoach();
        this.dom.btnRestart.disabled = true;
    }

    tickEnding(flashedNow) {
        const e = this.ending;
        const sim = this.sim;
        e.t += DT;
        e.climax = Math.max(0, e.climax - DT * 1.6);
        e.boost = Math.min(1.9, e.boost + DT * 0.6);
        // 前 1.2 秒把所有虫（包括独行者）温柔地收拢进同一个节奏，之后轻轻保持，
        // 免得周期不同的急性子 / 独行者在三次群体闪光之间又漂出去
        sim.gather(e.t < 1.2 ? 0.06 : 0.02);
        // 群体闪光：最近 5 个 tick（≈83ms，肉眼即「同时」）里有七成以上的虫闪过
        e.recent.push(flashedNow);
        if (e.recent.length > 5) e.recent.shift();
        const burst = e.recent.reduce((a, b) => a + b, 0);
        if (e.flashes < 3 && burst >= sim.flies.length * 0.7 && sim.tick - e.lastGroupTick > 20) {
            e.recent.length = 0;
            e.flashes++;
            e.lastGroupTick = sim.tick;
            e.climax = 0.55 + e.flashes * 0.15;
            this.audio.groupFlash(e.flashes);
            if (e.flashes === 3) e.chordAt = e.t + 0.25;
        }
        if (e.chordAt && e.t >= e.chordAt) {
            e.chordAt = 0;
            this.audio.chord();
            e.doneAt = e.t + 1.8;
        }
        if (e.doneAt && e.t >= e.doneAt) this.finish(true);
        // 保险：若因任何原因没凑满 3 次群体闪光，最多 9 秒后照常进入结算
        if (!e.doneAt && e.t > 9) this.finish(true);
    }

    finish(won) {
        const sim = this.sim;
        const level = LEVELS[this.levelIndex];
        if (!won) this.result = { won: false, harmony: sim.harmony, used: sim.interventions.length, max: sim.maxInterventions };
        this.state = 'result';
        this.resultAt = this.time;
        this.hideCoach();
        this.dom.hud.classList.add('is-faded');
        this.dom.btnRestart.disabled = false;
        if (won) this.result.newBest = saveBest(level.id, this.result.used, this.result.harmony);
        this.track(GAME_ID, 'finish');
        this.showResult();
    }

    showResult() {
        const t = this.t();
        const r = this.result;
        const level = LEVELS[this.levelIndex];
        const name = t.levels[level.id].name;
        this.dom.resultTitle.textContent = r.won ? t.resultWin.replace('{name}', name) : t.resultFail;
        this.dom.resultHarmony.textContent = t.resultHarmony.replace('{n}', String(Math.round(r.harmony * 100)));
        this.dom.resultUsed.textContent = t.resultUsed.replace('{used}', String(r.used)).replace('{max}', String(r.max));
        // 最后一关没有「下一关」：只留 Retry / Menu，避免两个同名按钮
        const last = this.levelIndex >= LEVELS.length - 1;
        this.dom.btnNext.classList.toggle('hidden', !r.won || last);
        this.dom.btnNextLabel.textContent = t.next;
        this.dom.result.classList.remove('hidden');
    }

    /* ───────────── 输入 ───────────── */

    bindInput() {
        const c = this.dom.canvas;
        c.addEventListener('pointerdown', e => {
            e.preventDefault();
            this.audio.prime();
            const r = c.getBoundingClientRect();
            this.tapAt(e.clientX - r.left, e.clientY - r.top, performance.now());
        });
        // 双击缩放 / 长按菜单 / 选字：场景是纯手势区（CSS 另有 touch-action:none）
        c.addEventListener('dblclick', e => e.preventDefault());
        c.addEventListener('contextmenu', e => e.preventDefault());
        c.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
    }

    /** 屏幕坐标（CSS 像素，相对画布）→ 最近的虫（在 HIT_RADIUS 内），没有则 -1 */
    pick(x, y) {
        let best = -1, bestD = Infinity;
        for (const f of this.sim.flies) {
            const p = this.renderer.screenOf(f);
            const d = Math.hypot(p.x - x, p.y - y);
            if (d < bestD) { bestD = d; best = f.id; }
        }
        return bestD <= HIT_RADIUS ? best : -1;
    }

    tapAt(x, y, nowMs) {
        if (this.state !== 'playing' || this.paused) return false;
        if (nowMs - this.lastTapAt < TAP_DEBOUNCE_MS) return false;
        const id = this.pick(x, y);
        if (id < 0) return false;
        if (!this.sim.canIntervene()) return false;
        this.lastTapAt = nowMs;
        this.sim.intervene(id);
        for (const p of this.sim.pulses) this.pulses.push({ x: p.x, y: p.y, r: p.r, age: 0 });
        this.audio.intervene();
        if (!this.firstTapDone) {
            this.firstTapDone = true;
            this.setCoach('afterFirst');
        }
        this.updateHud(true);
        if (this.manual) this.render();
        return true;
    }

    /** 测试钩子：某只虫在视口里的坐标（client 像素） */
    flyClientPos(id) {
        const r = this.dom.canvas.getBoundingClientRect();
        const p = this.renderer.screenOf(this.sim.flies[id]);
        return { x: r.left + p.x, y: r.top + p.y };
    }

    /* ───────────── 尺寸 ───────────── */

    bindResize() {
        const apply = () => {
            const w = Math.round(this.dom.stage.clientWidth);
            const h = Math.round(this.dom.stage.clientHeight);
            if (w > 0 && h > 0 && this.renderer.resize(w, h, window.devicePixelRatio || 1)) {
                this.render();
                this.paintBackdrop();
            }
        };
        this.applySize = apply;
        if (typeof ResizeObserver !== 'undefined') new ResizeObserver(apply).observe(this.dom.stage);
        window.addEventListener('resize', apply);
        window.addEventListener('orientationchange', apply);
        window.addEventListener('game-frame:changed', apply);
        apply();
    }

    /** 舞台两侧的夜色延展：背景层列平均竖条，对齐到舞台的纵向位置（仅舞台窄于视口时可见） */
    paintBackdrop() {
        const el = this.dom.backdrop;
        if (!el) return;
        const r = this.dom.stage.getBoundingClientRect();
        el.style.top = `${Math.round(r.top + window.scrollY)}px`;
        el.style.height = `${Math.round(r.height)}px`;
        const url = this.renderer.edgeStrip();
        if (url) el.style.backgroundImage = `url(${url})`;
    }

    /* ───────────── HUD / 文案 ───────────── */

    refreshStatic() {
        const t = this.t();
        const level = LEVELS[this.levelIndex];
        this.dom.levelPill.textContent = this.state === 'menu'
            ? t.title
            : `${this.levelIndex + 1} · ${t.levels[level.id].name}`;
        const tgt = this.sim.target || 0.85;
        this.dom.ringTarget.setAttribute('transform', `rotate(${(tgt * 360).toFixed(1)} 32 32)`);
        this.dom.harmony.setAttribute('aria-label', t.harmony);
        this.dom.dots.setAttribute('aria-label', t.interventions);
        if (this.state === 'result') this.showResult();
        if (this.coachKey) this.setCoach(this.coachKey, true);
    }

    updateHud(force = false, dt = 0) {
        const sim = this.sim;
        const raw = sim.harmony;
        if (force) this.displayHarmony = raw;
        else this.displayHarmony += (raw - this.displayHarmony) * (1 - Math.exp(-dt / 0.35));
        const pct = Math.round(this.displayHarmony * 100);
        this.dom.harmonyValue.textContent = `${pct}%`;
        this.dom.ringFill.setAttribute('stroke-dasharray', `${pct} 100`);
        this.dom.harmony.setAttribute('aria-valuenow', String(pct));
        this.dom.harmony.classList.toggle('is-met', raw >= sim.target);
        // HUD 主色随同步度从冷青过渡到暖金（概念图：28% 青、62% 青金、96% 金）
        const k = Math.max(0, Math.min(1, (this.displayHarmony - 0.3) / 0.6));
        const mix = (a, b) => Math.round(a + (b - a) * k);
        this.dom.hud.style.setProperty('--fs-hud-color', `rgb(${mix(95, 255)}, ${mix(212, 206)}, ${mix(255, 110)})`);
        const used = sim.interventions.length;
        const max = sim.maxInterventions;
        if (this.dom.dots.childElementCount !== max) {
            this.dom.dots.innerHTML = '';
            for (let i = 0; i < max; i++) {
                const d = document.createElement('span');
                d.className = 'fs-dot';
                this.dom.dots.appendChild(d);
            }
        }
        Array.from(this.dom.dots.children).forEach((d, i) => d.classList.toggle('is-used', i >= max - used));
        const t = this.t();
        this.dom.dots.setAttribute('aria-label', `${t.interventions}: ${max - used} / ${max}`);
        this.dom.signalsCount.textContent = `${max - used}/${max}`;
    }

    setCoach(key, silent = false) {
        const t = this.t();
        const level = LEVELS[this.levelIndex];
        const table = (t.coach && t.coach[level.id]) || {};
        const text = table[key];
        if (!text) return;
        this.coachKey = key;
        this.dom.coach.textContent = text;
        this.dom.coach.classList.remove('hidden', 'is-faded');
        if (!silent) this.coachUntil = this.time + COACH_SECONDS;
    }

    hideCoach() {
        this.coachKey = '';
        this.dom.coach.classList.add('hidden');
    }

    /* ───────────── 渲染 ───────────── */

    render(dt = 0) {
        const e = this.ending;
        this.renderer.draw(this.sim, {
            time: this.time,
            pulses: this.pulses,
            climax: e ? e.climax : 0,
            lightBoost: e ? e.boost : 1,
        });
        if (this.state === 'playing') {
            this.updateHud(false, dt);
            // 教学：开场观察几秒后还没点，提示怎么点；提示显示一会儿就淡出
            if (this.coachKey === 'intro' && !this.firstTapDone && this.time > this.coachUntil - COACH_SECONDS + 5) this.setCoach('howTo');
            if (this.coachKey && this.coachKey !== 'outOfSignals' && this.time > this.coachUntil) this.dom.coach.classList.add('is-faded');
        }
    }

    /** 调试 / 测试钩子用的快照 */
    snapshot() {
        const s = this.sim;
        return {
            state: this.state,
            level: LEVELS[this.levelIndex].id,
            tick: s.tick,
            harmony: s.harmony,
            used: s.interventions.length,
            max: s.maxInterventions,
            remaining: s.remaining(),
            cooldown: s.cooldown(),
            won: s.won,
            result: this.result,
            flies: s.flies.length,
        };
    }
}

export { LEVELS, TUNING };
