import { bindContextualRestart } from '../../platform/contextual-restart.js';
import { createSfxEngine } from '../../platform/game-sfx.js';
import { getLang } from '../../platform/site-settings.js';
import { track } from '../../platform/analytics.js';
import { LANGUAGES } from './i18n.js';
import { CARROT_PULL_STORAGE, CARROT_PULL_STORAGE_SLOTS } from './storage.js';
import { ART_UI, loadCarrotPullArt } from './render/art.js';
import { createCarrotScene } from './render/scene.js';
import { createCarrotPullFallbackScene } from './render/fallback-scene.js';

const TOTAL_CARROTS = 6;
const ROUND_TIME = 45;
const TARGETS = [0.36, 0.66, 0.48, 0.72, 0.42, 0.58];
const PULLS_NEEDED = [4, 4, 5, 5, 6, 6];

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function usesTouchInput() {
    return Boolean(
        window.matchMedia?.('(pointer: coarse)').matches
        || navigator.maxTouchPoints > 0
    );
}

export function createGame({ i18nBinder = null } = {}) {
    const state = {
        mode: 'menu',
        paused: false,
        round: 0,
        score: 0,
        time: ROUND_TIME,
        needle: 0.12,
        needleDirection: 1,
        target: TARGETS[0],
        pulls: 0,
        needed: PULLS_NEEDED[0],
        streak: 0,
        lastFrame: 0,
        messageTimer: 0,
        resultTimer: 0,
        won: false,
    };
    const refs = {};
    const pageI18nBinder = i18nBinder;
    let lang = getLang();
    const sfx = createSfxEngine({ masterGain: 0.55 });

    const text = () => LANGUAGES[lang] || LANGUAGES.en;
    let scene = null;
    let productionScene = null;
    let fallbackScene = null;
    let rafId = 0;
    let pausedByHidden = false;
    let best = 0;
    let dotsRound = -1;

    function cacheRefs() {
        [
            'cp-start', 'cp-result', 'cp-start-kicker', 'cp-start-title', 'cp-start-copy',
            'cp-howto-one', 'cp-howto-two', 'cp-howto-three', 'cp-start-label', 'cp-key-hint',
            'cp-result-stamp', 'cp-result-title', 'cp-result-copy', 'cp-result-score-label',
            'cp-again-label', 'cp-menu-label', 'cp-round-label', 'cp-score-label', 'cp-time-label',
            'cp-round', 'cp-score', 'cp-time', 'cp-status', 'cp-meter-label', 'cp-sweet-label',
            'cp-pull-label', 'cp-side-howto-title', 'cp-side-howto', 'cp-side-progress-title',
            'cp-side-score-label', 'cp-side-best-label', 'cp-side-tip-title', 'cp-side-tip', 'cp-hint',
            'cp-side-score', 'cp-side-best', 'cp-final-score', 'cp-meter', 'cp-meter-needle',
            'cp-sweet-zone', 'cp-pull-btn', 'cp-start-btn', 'cp-again-btn', 'cp-menu-btn',
            'cp-reset-btn', 'cp-stage', 'cp-toast', 'cp-status-dot', 'cp-progress-dots',
        ].forEach(id => { refs[id] = document.getElementById(id); });
        refs.card = document.querySelector('.cp-stage-card');
    }

    function bestScore() {
        const value = Number.parseInt(
            CARROT_PULL_STORAGE.get(CARROT_PULL_STORAGE_SLOTS.BEST, 0),
            10,
        );
        return Number.isFinite(value) ? value : 0;
    }

    function updateProgressDots(force = false) {
        if (!refs['cp-progress-dots'] || (!force && dotsRound === state.round)) return;
        dotsRound = state.round;
        refs['cp-progress-dots'].replaceChildren();
        for (let i = 0; i < TOTAL_CARROTS; i += 1) {
            const dot = document.createElement('span');
            dot.className = `cp-progress-dot${i < state.round ? ' is-done' : ''}`;
            dot.setAttribute('aria-label', `${text().statusCarrot} ${i + 1}${i < state.round ? ' ✓' : ''}`);
            const icon = document.createElement('img');
            icon.src = ART_UI.carrotMark;
            icon.alt = '';
            icon.setAttribute('aria-hidden', 'true');
            dot.appendChild(icon);
            refs['cp-progress-dots'].appendChild(dot);
        }
    }

    function applyLanguage(nextLang = getLang()) {
        lang = nextLang === 'zh' ? 'zh' : 'en';
        const t = text();
        const touchInput = usesTouchInput();
        pageI18nBinder?.apply(lang);
        const labels = {
            'cp-key-hint': touchInput ? t.keyHintTouch : t.keyHint,
            'cp-hint': touchInput ? t.hintTouch : t.hint,
        };
        Object.entries(labels).forEach(([id, value]) => {
            const node = document.getElementById(id);
            if (node) node.textContent = value;
        });
        updateProgressDots(true);
        if (state.mode === 'over') renderResult();
        updateStatus(currentStatusText(), state.mode === 'over' ? (state.won ? 'good' : 'bad') : '');
    }

    function currentStatusText() {
        const t = text();
        if (state.mode === 'menu') return t.statusReady;
        if (state.mode === 'over') return state.won ? t.resultWinTitle : t.resultLoseTitle;
        return state.paused ? t.statusPaused : t.statusPlaying;
    }

    function renderResult() {
        const t = text();
        const won = state.won;
        if (refs['cp-result-stamp']) refs['cp-result-stamp'].textContent = won ? t.harvestedStamp : t.resultLoseStamp;
        if (refs['cp-result-title']) refs['cp-result-title'].textContent = won ? t.resultWinTitle : t.resultLoseTitle;
        if (refs['cp-result-copy']) refs['cp-result-copy'].textContent = won ? t.resultWinCopy : t.resultLoseCopy;
    }

    function updateStatus(message, tone = '') {
        if (refs['cp-status']) refs['cp-status'].textContent = message;
        if (refs['cp-status-dot']) refs['cp-status-dot'].className = `cp-status-dot${tone ? ` is-${tone}` : ''}`;
    }

    function showToast(message, tone = '') {
        if (!refs['cp-toast']) return;
        refs['cp-toast'].textContent = message;
        refs['cp-toast'].className = `cp-toast game-toast is-on${tone ? ` is-${tone}` : ''}`;
        window.clearTimeout(state.messageTimer);
        state.messageTimer = window.setTimeout(() => refs['cp-toast'].classList.remove('is-on'), 850);
    }

    // Per-frame work only: needle and timer (the scene animates itself in frame()).
    function updateFrameUi() {
        if (refs['cp-time']) refs['cp-time'].textContent = String(Math.ceil(state.time));
        if (refs['cp-meter-needle']) refs['cp-meter-needle'].style.left = `${state.needle * 100}%`;
        if (refs['cp-meter']) refs['cp-meter'].setAttribute('aria-valuenow', String(Math.round(state.needle * 100)));
    }

    function updateUi() {
        if (refs['cp-round']) refs['cp-round'].textContent = `${Math.min(state.round + 1, TOTAL_CARROTS)}/${TOTAL_CARROTS}`;
        if (refs['cp-score']) refs['cp-score'].textContent = String(state.score);
        if (refs['cp-side-score']) refs['cp-side-score'].textContent = String(state.score);
        if (refs['cp-side-best']) refs['cp-side-best'].textContent = String(best);
        if (refs['cp-sweet-zone']) {
            refs['cp-sweet-zone'].style.left = `${clamp((state.target - 0.12) * 100, 0, 76)}%`;
        }
        if (refs['cp-pull-btn']) refs['cp-pull-btn'].disabled = state.mode !== 'playing' || state.paused;
        const artAvailable = ['ready', 'fallback'].includes(refs['cp-stage']?.dataset.artState);
        if (refs['cp-start-btn']) refs['cp-start-btn'].disabled = state.mode !== 'menu' || !artAvailable;
        if (refs['cp-again-btn']) refs['cp-again-btn'].disabled = !artAvailable;
        if (refs['cp-final-score']) refs['cp-final-score'].textContent = String(state.score);
        updateProgressDots();
        updateFrameUi();
    }

    function nextCarrot() {
        state.target = TARGETS[state.round] || TARGETS[TARGETS.length - 1];
        state.needed = PULLS_NEEDED[state.round] || PULLS_NEEDED[PULLS_NEEDED.length - 1];
        state.pulls = 0;
        updateStatus(text().statusPlaying);
        updateUi();
    }

    function saveBest() {
        if (state.score > best) {
            best = state.score;
            CARROT_PULL_STORAGE.set(CARROT_PULL_STORAGE_SLOTS.BEST, best);
        }
    }

    function hideToast() {
        window.clearTimeout(state.messageTimer);
        refs['cp-toast']?.classList.remove('is-on');
    }

    function finish(won) {
        if (state.mode !== 'playing') return;
        state.mode = 'over';
        state.paused = false;
        saveBest();
        state.won = won;
        if (won) state.pulls = 0;
        hideToast();
        renderResult();
        // 通关时先让最后一根萝卜飞出去，再盖上结算层
        window.clearTimeout(state.resultTimer);
        state.resultTimer = window.setTimeout(() => {
            if (state.mode !== 'over') return;
            if (refs['cp-result']) refs['cp-result'].hidden = false;
            if (refs['cp-start']) refs['cp-start'].hidden = true;
        }, won ? 820 : 0);
        updateUi();
        updateStatus(currentStatusText(), won ? 'good' : 'bad');
        track('carrot-pull', 'finish');
        if (won) sfx.tone({ freq: 523, slideTo: 784, type: 'triangle', dur: 0.36, vol: 0.18 });
        else sfx.tone({ freq: 220, slideTo: 140, type: 'sine', dur: 0.28, vol: 0.13 });
    }

    function start() {
        if (!['ready', 'fallback'].includes(refs['cp-stage']?.dataset.artState)) return;
        state.mode = 'playing';
        state.paused = false;
        state.round = 0;
        state.score = 0;
        state.time = ROUND_TIME;
        state.needle = 0.12;
        state.needleDirection = 1;
        state.streak = 0;
        state.target = TARGETS[0];
        state.needed = PULLS_NEEDED[0];
        state.pulls = 0;
        window.clearTimeout(state.resultTimer);
        scene?.reset();
        if (refs['cp-start']) refs['cp-start'].hidden = true;
        if (refs['cp-result']) refs['cp-result'].hidden = true;
        updateStatus(text().statusPlaying);
        updateUi();
        track('carrot-pull', 'play');
        ensureLoop();
        sfx.tone({ freq: 392, slideTo: 659, type: 'triangle', dur: 0.2, vol: 0.13 });
    }

    function resetToMenu() {
        state.mode = 'menu';
        state.paused = false;
        state.round = 0;
        state.score = 0;
        state.time = ROUND_TIME;
        state.pulls = 0;
        state.target = TARGETS[0];
        state.needed = PULLS_NEEDED[0];
        window.clearTimeout(state.resultTimer);
        hideToast();
        scene?.reset();
        if (refs['cp-start']) refs['cp-start'].hidden = false;
        if (refs['cp-result']) refs['cp-result'].hidden = true;
        updateStatus(text().statusReady);
        updateUi();
        ensureLoop();
    }

    function tryPull() {
        if (state.mode !== 'playing' || state.paused) return;
        const distance = Math.abs(state.needle - state.target);
        const success = distance <= 0.12;
        if (success) {
            state.pulls += 1;
            state.streak += 1;
            const perfect = distance <= 0.045;
            state.score += (perfect ? 150 : 100) + Math.min(state.streak, 8) * 20;
            scene?.hit();
            refs.card.classList.add('is-good');
            window.setTimeout(() => refs.card.classList.remove('is-good'), 300);
            updateStatus(perfect ? text().statusGreat : text().statusGood, 'good');
            showToast(perfect ? text().toastPerfect : text().toastGood, 'good');
            sfx.tone({ freq: perfect ? 740 : 560, slideTo: perfect ? 1040 : 760, type: 'triangle', dur: 0.12, vol: 0.12 });
            if (state.pulls >= state.needed) {
                state.score += 180 + state.streak * 25;
                state.round += 1;
                scene?.harvest(performance.now());
                if (state.round >= TOTAL_CARROTS) {
                    finish(true);
                    return;
                }
                sfx.tone({ freq: 784, slideTo: 988, type: 'triangle', dur: 0.22, vol: 0.12, delay: 0.08 });
                nextCarrot();
            }
        } else {
            state.streak = 0;
            state.time = Math.max(0, state.time - 1);
            scene?.miss();
            updateStatus(text().statusBad, 'bad');
            showToast(text().toastBad, 'bad');
            sfx.tone({ freq: 160, slideTo: 110, type: 'sine', dur: 0.12, vol: 0.09 });
        }
        updateUi();
        ensureLoop();
    }

    function setPaused(paused) {
        if (state.mode !== 'playing' || state.paused === paused) return;
        state.paused = paused;
        if (!paused) pausedByHidden = false;
        updateUi();
        updateStatus(currentStatusText());
        ensureLoop();
    }

    // rAF 只在对局进行中、或场景动画还没落定时运行；空闲（菜单 / 结算 / 暂停落定）就停下
    function ensureLoop() {
        if (rafId) return;
        state.lastFrame = 0;
        rafId = window.requestAnimationFrame(frame);
    }

    function frame(now) {
        rafId = 0;
        if (!state.lastFrame) state.lastFrame = now;
        const delta = Math.min(100, now - state.lastFrame);
        state.lastFrame = now;
        if (state.mode === 'playing' && !state.paused) {
            state.time = Math.max(0, state.time - delta / 1000);
            state.needle += state.needleDirection * delta / 1000 * 0.76;
            if (state.needle >= 1) {
                state.needle = 1;
                state.needleDirection = -1;
            } else if (state.needle <= 0) {
                state.needle = 0;
                state.needleDirection = 1;
            }
            if (state.time <= 0) finish(false);
            else updateFrameUi();
        }
        const running = state.mode === 'playing' && !state.paused;
        const animating = scene
            ? scene.tick(now, state.mode === 'menu' ? 0 : state.pulls / state.needed, running)
            : false;
        if (running || animating) rafId = window.requestAnimationFrame(frame);
    }

    function bindEvents() {
        refs['cp-start-btn'].addEventListener('click', start);
        refs['cp-again-btn'].addEventListener('click', start);
        refs['cp-menu-btn'].addEventListener('click', resetToMenu);
        bindContextualRestart({
            button: refs['cp-reset-btn'],
            active: () => state.mode === 'playing' && !state.paused,
            hasProgress: () => state.pulls > 0 || state.time < ROUND_TIME - 1,
            restart: resetToMenu,
            purpose: 'exit',
        });
        refs['cp-pull-btn'].addEventListener('pointerdown', (event) => {
            event.preventDefault();
            refs['cp-pull-btn'].classList.add('is-pressed');
            tryPull();
        });
        // 键盘 Enter / 读屏激活只派发 click（detail === 0）；指针点击已在 pointerdown 处理，不重复
        refs['cp-pull-btn'].addEventListener('click', (event) => {
            if (event.detail === 0) tryPull();
        });
        refs['cp-pull-btn'].addEventListener('pointerup', () => refs['cp-pull-btn'].classList.remove('is-pressed'));
        refs['cp-pull-btn'].addEventListener('pointercancel', () => refs['cp-pull-btn'].classList.remove('is-pressed'));
        document.getElementById('cp-carrot-hit').addEventListener('pointerdown', (event) => {
            event.preventDefault();
            tryPull();
        });
        document.addEventListener('keydown', (event) => {
            if ((event.key === ' ' || event.key === 'ArrowUp') && !event.repeat) {
                event.preventDefault();
                tryPull();
            }
            if (event.key === 'Escape' && state.mode === 'playing') {
                setPaused(!state.paused);
            }
        });
        window.addEventListener('site-settings:changed', () => applyLanguage(getLang()));
        // 切到后台暂停；回来时只恢复「因切后台而暂停」的那一次（手机上没有暂停键，否则会卡住）
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                if (state.mode === 'playing' && !state.paused) {
                    setPaused(true);
                    pausedByHidden = true;
                }
            } else if (pausedByHidden) {
                setPaused(false);
            }
        });
    }

    function init() {
        cacheRefs();
        productionScene = createCarrotScene();
        fallbackScene = createCarrotPullFallbackScene();
        scene = fallbackScene || productionScene;
        best = bestScore();
        applyLanguage(lang);
        updateUi();
        bindEvents();
        ensureLoop();
        loadCarrotPullArt({
            stage: refs['cp-stage'],
            svg: document.getElementById('cp-scene'),
            onReady: () => {
                scene = productionScene || fallbackScene;
                scene?.reset();
                updateUi();
                ensureLoop();
            },
            onFallback: () => {
                scene = fallbackScene || productionScene;
                scene?.reset();
                updateUi();
                ensureLoop();
            },
        });
    }

    return {
        state,
        init,
        applyLanguage,
        start,
        pauseQuiet: () => setPaused(true),
        resumeQuiet: () => setPaused(false),
        isRunning: () => state.mode === 'playing' && !state.paused,
    };
}
