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

const LANGUAGES = makeText({
    en: {
        brand: 'Carrot Pull',
        kicker: 'GARDEN RHYTHM',
        startTitle: 'Carrot Pull',
        startCopy: 'Watch the green sweet spot, then pull in rhythm. Help the mole harvest six giant carrots before time runs out.',
        howtoOne: 'Watch the needle',
        howtoTwo: 'Hit the sweet spot',
        howtoThree: 'Keep the streak',
        startLabel: 'Start pulling',
        keyHint: 'Space / ↑ also pulls',
        round: 'Round',
        score: 'Score',
        time: 'Time',
        statusReady: 'Find the beat. Get ready to pull!',
        statusPlaying: 'Pull when the needle enters the green zone.',
        statusGood: 'Nice pull! Keep that rhythm.',
        statusGreat: 'Perfect! The carrot is coming loose!',
        statusBad: 'A little early. Watch the needle.',
        meterLabel: 'Pull rhythm',
        sweetLabel: 'Sweet spot',
        pullLabel: 'Pull!',
        sideHowtoTitle: 'How to play',
        sideHowto: 'Press “Pull!” when the needle lands inside the green sweet spot. A streak builds your score; a miss only breaks the streak.',
        sideProgressTitle: 'Garden run',
        sideScore: 'This run',
        sideBest: 'Best score',
        sideTipTitle: 'Mole tip',
        sideTip: 'Don’t panic-pull. Find the green beat and the carrot will loosen itself.',
        hint: 'Press the button or use Space / ↑ when the needle is in the green zone.',
        harvestedStamp: 'HARVESTED!',
        resultWinTitle: 'A bumper harvest!',
        resultWinCopy: 'You and the mole cleared the whole garden.',
        resultLoseStamp: 'TIME OUT',
        resultLoseTitle: 'The garden can wait.',
        resultLoseCopy: 'The carrot tops are still waving. Try another pull?',
        finalScore: 'Score',
        again: 'Pull again',
        menu: 'Back to menu',
        statusCarrot: 'Carrot',
        toastGood: 'Great pull!',
        toastPerfect: 'Perfect pull!',
        toastBad: 'Missed the beat',
        stats: 'Garden stats',
    },
    zh: {
        brand: '拔萝卜',
        kicker: 'GARDEN RHYTHM',
        startTitle: '拔萝卜',
        startCopy: '看准绿色甜蜜区，按下按钮用力一拔！和鼹鼠一起，在时间结束前收获 6 根大萝卜。',
        howtoOne: '看准指针',
        howtoTwo: '落在甜蜜区',
        howtoThree: '连续拔出',
        startLabel: '开始拔萝卜',
        keyHint: 'Space / ↑ 也可以用力拔',
        round: '萝卜',
        score: '得分',
        time: '时间',
        statusReady: '找准节奏，准备发力！',
        statusPlaying: '指针进入绿色区间时再拔。',
        statusGood: '拔得漂亮！保持节奏。',
        statusGreat: '完美！萝卜快松土啦！',
        statusBad: '早了一点，再看准指针。',
        meterLabel: '拔萝卜节奏',
        sweetLabel: '甜蜜区',
        pullLabel: '用力拔！',
        sideHowtoTitle: '怎么玩',
        sideHowto: '按下“用力拔！”时，让指针落进绿色甜蜜区。连续命中会增加连击分，失误不会结束游戏，但会打断连击。',
        sideProgressTitle: '今日菜园',
        sideScore: '本局得分',
        sideBest: '最佳记录',
        sideTipTitle: '小鼹鼠提示',
        sideTip: '不要急着乱拔。把节奏踩在绿色区域，萝卜会自己松土。',
        hint: '按住按钮或使用 Space / ↑，在绿色区间拔萝卜。',
        harvestedStamp: '大丰收！',
        resultWinTitle: '萝卜大丰收！',
        resultWinCopy: '你和鼹鼠把整座菜园都搬空啦。',
        resultLoseStamp: '时间到',
        resultLoseTitle: '菜园还在等你。',
        resultLoseCopy: '萝卜叶子还在招手，再试一次吧？',
        finalScore: '得分',
        again: '再拔一次',
        menu: '回到菜单',
        statusCarrot: '萝卜',
        toastGood: '拔得漂亮！',
        toastPerfect: '完美一拔！',
        toastBad: '没踩准节奏',
        stats: '菜园统计',
    },
});

const TOTAL_CARROTS = 6;
const ROUND_TIME = 45;
const TARGETS = [0.36, 0.66, 0.48, 0.72, 0.42, 0.58];
const PULLS_NEEDED = [4, 4, 5, 5, 6, 6];
const BEST_KEY = 'cp_best_score';

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function createGame() {
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
        wobble: 0,
        lastFrame: 0,
        messageTimer: 0,
    };
    const refs = {};
    let lang = getLang();
    const sfx = createSfxEngine({ masterGain: 0.55 });

    const text = () => LANGUAGES[lang] || LANGUAGES.en;

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
            'cp-reset-btn', 'cp-stage', 'cp-toast', 'cp-carrot-root', 'cp-carrot-leaves',
            'cp-tug-lines', 'cp-particles', 'cp-status-dot', 'cp-progress-dots',
        ].forEach(id => { refs[id] = document.getElementById(id); });
    }

    function bestScore() {
        const value = Number.parseInt(storageGet(BEST_KEY) || '0', 10);
        return Number.isFinite(value) ? value : 0;
    }

    function updateProgressDots() {
        if (!refs['cp-progress-dots']) return;
        refs['cp-progress-dots'].replaceChildren();
        for (let i = 0; i < TOTAL_CARROTS; i += 1) {
            const dot = document.createElement('span');
            dot.className = `cp-progress-dot${i < state.round ? ' is-done' : ''}`;
            dot.textContent = '🥕';
            dot.setAttribute('aria-label', `${text().statusCarrot} ${i + 1}${i < state.round ? ' ✓' : ''}`);
            refs['cp-progress-dots'].appendChild(dot);
        }
    }

    function applyLanguage(nextLang = getLang()) {
        lang = nextLang === 'zh' ? 'zh' : 'en';
        const t = text();
        document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
        const labels = {
            'cp-brand-zh': t.brand,
            'cp-start-kicker': t.kicker,
            'cp-start-title': t.startTitle,
            'cp-start-copy': t.startCopy,
            'cp-howto-one': t.howtoOne,
            'cp-howto-two': t.howtoTwo,
            'cp-howto-three': t.howtoThree,
            'cp-start-label': t.startLabel,
            'cp-key-hint': t.keyHint,
            'cp-again-label': t.again,
            'cp-menu-label': t.menu,
            'cp-round-label': t.round,
            'cp-score-label': t.score,
            'cp-time-label': t.time,
            'cp-meter-label': t.meterLabel,
            'cp-sweet-label': t.sweetLabel,
            'cp-pull-label': t.pullLabel,
            'cp-side-howto-title': t.sideHowtoTitle,
            'cp-side-howto': t.sideHowto,
            'cp-side-progress-title': t.sideProgressTitle,
            'cp-side-score-label': t.sideScore,
            'cp-side-best-label': t.sideBest,
            'cp-side-tip-title': t.sideTipTitle,
            'cp-side-tip': t.sideTip,
            'cp-hint': t.hint,
            'cp-result-score-label': t.finalScore,
        };
        Object.entries(labels).forEach(([id, value]) => {
            const node = document.getElementById(id);
            if (node) node.textContent = value;
        });
        updateProgressDots();
        updateStatus(state.mode === 'menu' ? t.statusReady : t.statusPlaying);
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

    function paintCarrot() {
        const y = -state.pulls * 7;
        const rotation = state.wobble;
        if (refs['cp-carrot-root']) refs['cp-carrot-root'].setAttribute('transform', `translate(0 ${y}) rotate(${rotation} 280 360)`);
        if (refs['cp-carrot-leaves']) refs['cp-carrot-leaves'].setAttribute('transform', `translate(0 ${y}) rotate(${rotation} 280 360)`);
        if (refs['cp-tug-lines']) refs['cp-tug-lines'].setAttribute('opacity', state.mode === 'playing' && state.pulls > 0 ? '0.82' : '0');
    }

    function updateUi() {
        const t = text();
        if (refs['cp-round']) refs['cp-round'].textContent = `${Math.min(state.round + 1, TOTAL_CARROTS)}/${TOTAL_CARROTS}`;
        if (refs['cp-score']) refs['cp-score'].textContent = String(state.score);
        if (refs['cp-time']) refs['cp-time'].textContent = String(Math.ceil(state.time));
        if (refs['cp-side-score']) refs['cp-side-score'].textContent = String(state.score);
        if (refs['cp-side-best']) refs['cp-side-best'].textContent = String(bestScore());
        if (refs['cp-meter-needle']) refs['cp-meter-needle'].style.left = `${state.needle * 100}%`;
        if (refs['cp-sweet-zone']) {
            refs['cp-sweet-zone'].style.left = `${clamp((state.target - 0.12) * 100, 0, 76)}%`;
        }
        if (refs['cp-meter']) refs['cp-meter'].setAttribute('aria-valuenow', String(Math.round(state.needle * 100)));
        if (refs['cp-pull-btn']) refs['cp-pull-btn'].disabled = state.mode !== 'playing' || state.paused;
        if (refs['cp-final-score']) refs['cp-final-score'].textContent = String(state.score);
        updateProgressDots();
        paintCarrot();
        if (state.mode === 'playing' && refs['cp-status']?.textContent === t.statusReady) updateStatus(t.statusPlaying);
    }

    function addParticles(success) {
        const group = refs['cp-particles'];
        if (!group) return;
        group.replaceChildren();
        const ns = 'http://www.w3.org/2000/svg';
        for (let i = 0; i < (success ? 10 : 4); i += 1) {
            const circle = document.createElementNS(ns, 'circle');
            const angle = (Math.PI * 2 * i) / (success ? 10 : 4);
            const radius = success ? 28 + (i % 3) * 10 : 18;
            circle.setAttribute('cx', String(280 + Math.cos(angle) * radius));
            circle.setAttribute('cy', String(333 + Math.sin(angle) * radius));
            circle.setAttribute('r', success ? String(3 + (i % 2)) : '4');
            circle.setAttribute('fill', success ? (i % 2 ? '#f7d36e' : '#f08a3c') : '#a86e52');
            circle.classList.add('cp-particle');
            group.appendChild(circle);
        }
        window.setTimeout(() => group.replaceChildren(), 430);
    }

    function nextCarrot() {
        state.target = TARGETS[state.round] || TARGETS[TARGETS.length - 1];
        state.needed = PULLS_NEEDED[state.round] || PULLS_NEEDED[PULLS_NEEDED.length - 1];
        state.pulls = 0;
        state.wobble = 0;
        updateStatus(text().statusPlaying);
        updateUi();
    }

    function saveBest() {
        if (state.score > bestScore()) storageSet(BEST_KEY, String(state.score));
    }

    function finish(won) {
        if (state.mode !== 'playing') return;
        state.mode = 'over';
        state.paused = false;
        saveBest();
        const t = text();
        if (refs['cp-result']) refs['cp-result'].hidden = false;
        if (refs['cp-start']) refs['cp-start'].hidden = true;
        if (refs['cp-result-stamp']) refs['cp-result-stamp'].textContent = won ? t.harvestedStamp : t.resultLoseStamp;
        if (refs['cp-result-title']) refs['cp-result-title'].textContent = won ? t.resultWinTitle : t.resultLoseTitle;
        if (refs['cp-result-copy']) refs['cp-result-copy'].textContent = won ? t.resultWinCopy : t.resultLoseCopy;
        if (refs['cp-pull-btn']) refs['cp-pull-btn'].disabled = true;
        updateStatus(won ? t.resultWinTitle : t.resultLoseTitle, won ? 'good' : 'bad');
        track('carrot-pull', won ? 'complete' : 'timeout');
        if (won) sfx.tone({ freq: 523, slideTo: 784, type: 'triangle', dur: 0.36, vol: 0.18 });
        else sfx.tone({ freq: 220, slideTo: 140, type: 'sine', dur: 0.28, vol: 0.13 });
    }

    function start() {
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
        if (refs['cp-start']) refs['cp-start'].hidden = true;
        if (refs['cp-result']) refs['cp-result'].hidden = true;
        updateStatus(text().statusPlaying);
        updateUi();
        track('carrot-pull', 'start');
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
        if (refs['cp-start']) refs['cp-start'].hidden = false;
        if (refs['cp-result']) refs['cp-result'].hidden = true;
        updateStatus(text().statusReady);
        updateUi();
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
            state.wobble = 0;
            addParticles(true);
            refs['cp-stage'].classList.remove('is-miss');
            refs['cp-stage'].classList.add('is-good');
            window.setTimeout(() => refs['cp-stage'].classList.remove('is-good'), 300);
            updateStatus(perfect ? text().statusGreat : text().statusGood, 'good');
            showToast(perfect ? text().toastPerfect : text().toastGood, 'good');
            sfx.tone({ freq: perfect ? 740 : 560, slideTo: perfect ? 1040 : 760, type: 'triangle', dur: 0.12, vol: 0.12 });
            if (state.pulls >= state.needed) {
                state.score += 180 + state.streak * 25;
                state.round += 1;
                addParticles(true);
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
            state.wobble = distance > 0.3 ? 5 : -4;
            addParticles(false);
            refs['cp-stage'].classList.remove('is-good');
            refs['cp-stage'].classList.add('is-miss');
            window.setTimeout(() => refs['cp-stage'].classList.remove('is-miss'), 320);
            updateStatus(text().statusBad, 'bad');
            showToast(text().toastBad, 'bad');
            sfx.tone({ freq: 160, slideTo: 110, type: 'sine', dur: 0.12, vol: 0.09 });
        }
        updateUi();
    }

    function frame(now) {
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
            state.wobble *= 0.88;
            if (state.time <= 0) finish(false);
            updateUi();
        }
        window.requestAnimationFrame(frame);
    }

    function bindEvents() {
        refs['cp-start-btn'].addEventListener('click', start);
        refs['cp-again-btn'].addEventListener('click', start);
        refs['cp-menu-btn'].addEventListener('click', resetToMenu);
        refs['cp-reset-btn'].addEventListener('click', resetToMenu);
        refs['cp-pull-btn'].addEventListener('pointerdown', (event) => {
            event.preventDefault();
            refs['cp-pull-btn'].classList.add('is-pressed');
            tryPull();
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
                state.paused = !state.paused;
                updateStatus(state.paused ? (lang === 'zh' ? '暂停中，准备好再继续。' : 'Paused — take a breath.') : text().statusPlaying);
            }
        });
        window.addEventListener('site-settings:changed', () => applyLanguage(getLang()));
    }

    function init() {
        cacheRefs();
        applyLanguage(lang);
        updateUi();
        bindEvents();
        window.requestAnimationFrame(frame);
    }

    return { state, init, applyLanguage };
}

onReady(() => {
    const game = createGame();
    const getText = () => LANGUAGES[getLang()] || LANGUAGES.en;
    const drawer = createStatsDrawer({
        idPrefix: 'cp',
        getGame: () => game.state,
        isBusy: () => game.state.mode === 'playing' && !game.state.paused,
        onPause: () => { game.state.paused = true; },
        onResume: () => { game.state.paused = false; },
        ICONS,
        getText,
    });
    if (drawer) drawer.init();
    bindChrome({ self: 'carrot-pull.html', getText, owns: ['more', 'sound'] });
    bindFrame({ logicalWidth: 560 });
    game.init();
});
