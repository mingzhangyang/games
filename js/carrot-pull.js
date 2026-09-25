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
        stats: 'Stats',
        statusPaused: 'Paused — take a breath.',
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
        stats: '数据统计',
        statusPaused: '暂停中，准备好再继续。',
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

// ── 场景动画 ──
// 所有角色位移都写 SVG 的 transform 属性，不用 CSS transform：两者作用在同一
// 元素上时 CSS 会整体覆盖属性，萝卜会在抖动期间跳回初始高度。
// 手里握着的叶茎是实时路径：一端跟随萝卜顶部，一端跟随手/爪，永远连着。
const SCENE = {
    carrot: { x: 316, y: 506 },
    girl: { x: 186, y: 692, s: 0.94 },
    mole: { x: 482, y: 612, s: 0.9 },
    girlHands: [[38, -218], [32, -210], [26, -200]],
    molePaws: [[-70, -46], [-60, -22]],
    crown: [[-8, -22], [0, -24], [8, -22]],
    maxRise: 92,
    harvestMs: 720,
    emergeMs: 460,
};
const SVG_NS = 'http://www.w3.org/2000/svg';
const easeOut = t => 1 - (1 - t) ** 3;

function place(point, x, y, deg, scale = 1) {
    const rad = deg * Math.PI / 180;
    const px = point[0] * scale;
    const py = point[1] * scale;
    return [x + px * Math.cos(rad) - py * Math.sin(rad), y + px * Math.sin(rad) + py * Math.cos(rad)];
}

function stemPath(from, to, sag) {
    const mx = (from[0] + to[0]) / 2;
    const my = (from[1] + to[1]) / 2 - sag;
    return `M${from[0].toFixed(1)} ${from[1].toFixed(1)}Q${mx.toFixed(1)} ${my.toFixed(1)} ${to[0].toFixed(1)} ${to[1].toFixed(1)}`;
}

function createScene() {
    const $ = id => document.getElementById(id);
    const svg = $('cp-scene');
    const nodes = {
        carrot: $('cp-carrot'),
        girl: $('cp-girl'),
        girlHands: $('cp-girl-hands'),
        mole: $('cp-mole'),
        molePaws: $('cp-mole-paws'),
        stemsGirl: $('cp-stems-girl'),
        stemsMole: $('cp-stems-mole'),
        tug: $('cp-tug-lines'),
        particles: $('cp-particles'),
    };
    if (!svg || !nodes.carrot) return null;
    const girlStems = [...nodes.stemsGirl.querySelectorAll('path')];
    const moleStems = [...nodes.stemsMole.querySelectorAll('path')];
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const fx = { rise: 0, tug: 0, miss: 0, harvestAt: -1e9, harvestRise: 0, last: 0 };
    let lastKey = '';
    let oopsTimer = 0;

    function hit() {
        fx.tug = 1;
        burst(true);
    }

    function miss() {
        fx.miss = 1;
        burst(false);
        svg.classList.add('is-oops');
        window.clearTimeout(oopsTimer);
        oopsTimer = window.setTimeout(() => svg.classList.remove('is-oops'), 650);
    }

    function harvest(now) {
        fx.harvestAt = now;
        fx.harvestRise = fx.rise;
        fx.rise = 0;
        burst(true, true);
    }

    function reset() {
        fx.rise = 0;
        fx.tug = 0;
        fx.miss = 0;
        fx.harvestAt = -1e9;
        svg.classList.remove('is-oops');
        nodes.particles.replaceChildren();
    }

    // 土块从洞口四散 + 叶冠附近的金色火花；动画走 CSS（元素本身没有 transform 属性）
    function burst(success, big = false) {
        if (reduced) return;
        const count = big ? 16 : success ? 9 : 5;
        for (let i = 0; i < count; i += 1) {
            const dirt = document.createElementNS(SVG_NS, 'circle');
            const side = i % 2 ? 1 : -1;
            dirt.setAttribute('cx', String(SCENE.carrot.x + side * (40 + Math.random() * 50)));
            dirt.setAttribute('cy', String(596 + Math.random() * 8));
            dirt.setAttribute('r', String(3 + Math.random() * (big ? 6 : 4)));
            dirt.setAttribute('fill', i % 3 ? '#7a4a2b' : '#a26a3e');
            dirt.setAttribute('class', 'cp-dirt');
            dirt.style.setProperty('--dx', `${side * (20 + Math.random() * (big ? 90 : 50))}px`);
            dirt.style.setProperty('--dy', `${-(30 + Math.random() * (big ? 110 : 60))}px`);
            spawn(dirt);
        }
        if (success) {
            for (let i = 0; i < (big ? 10 : 5); i += 1) {
                const spark = document.createElementNS(SVG_NS, 'circle');
                const angle = (Math.PI * 2 * i) / (big ? 10 : 5) + Math.random();
                spark.setAttribute('cx', String(SCENE.carrot.x));
                spark.setAttribute('cy', String(SCENE.carrot.y - fx.rise - 40));
                spark.setAttribute('r', String(big ? 5 : 3.5));
                spark.setAttribute('fill', i % 2 ? '#fff3b0' : '#f7d36e');
                spark.setAttribute('class', 'cp-spark');
                spark.style.setProperty('--dx', `${Math.cos(angle) * (big ? 110 : 60)}px`);
                spark.style.setProperty('--dy', `${Math.sin(angle) * (big ? 90 : 50)}px`);
                spawn(spark);
            }
        }
    }

    function spawn(node) {
        node.addEventListener('animationend', () => node.remove(), { once: true });
        nodes.particles.appendChild(node);
    }

    // progress: 当前这根萝卜已拔的比例 0..1；playing: 对局进行中（控制呼吸晃动）
    function tick(now, progress, playing) {
        const dt = Math.min(100, fx.last ? now - fx.last : 16);
        fx.last = now;
        fx.rise += (progress * SCENE.maxRise - fx.rise) * (1 - Math.exp(-dt / 90));
        fx.tug *= Math.exp(-dt / 170);
        fx.miss *= Math.exp(-dt / 220);
        if (fx.tug < 0.002) fx.tug = 0;
        if (fx.miss < 0.002) fx.miss = 0;

        const sway = playing && !reduced ? Math.sin(now / 420) : 0;
        const shake = reduced ? 0 : Math.sin(now / 26) * 7 * fx.miss;
        let girlLean = -3 - progress * 4 - fx.tug * 9 + fx.miss * 5 + sway * 0.8;
        let moleLean = 2 + progress * 3 + fx.tug * 7 - fx.miss * 3 - sway * 0.8;
        let hop = 0;
        let cx = SCENE.carrot.x - fx.tug * 6;
        let cy = SCENE.carrot.y - fx.rise - fx.tug * 12;
        let tilt = -6 - progress * 10 - fx.tug * 4 + shake;
        let stemAlpha = 1;

        const since = now - fx.harvestAt;
        if (since < SCENE.harvestMs) {
            // 收获：萝卜连根飞起、旋转着越过女孩头顶；两人往后一仰再蹦一下
            const p = easeOut(since / SCENE.harvestMs);
            cx = SCENE.carrot.x - 150 * p;
            cy = SCENE.carrot.y - fx.harvestRise - 430 * p;
            tilt = -16 - 70 * p;
            stemAlpha = Math.max(0, 1 - since / 120);
            girlLean -= 5 * Math.sin(Math.PI * Math.min(1, since / 500));
            moleLean += 8 * Math.sin(Math.PI * Math.min(1, since / 500));
            hop = -18 * Math.sin(Math.PI * Math.min(1, since / 420));
        } else if (since < SCENE.harvestMs + SCENE.emergeMs) {
            // 新萝卜从土里冒出来
            const p = easeOut((since - SCENE.harvestMs) / SCENE.emergeMs);
            cy += 110 * (1 - p);
            stemAlpha = p;
        }

        const key = `${cx.toFixed(1)}|${cy.toFixed(1)}|${tilt.toFixed(2)}|${girlLean.toFixed(2)}|${moleLean.toFixed(2)}|${hop.toFixed(1)}|${stemAlpha.toFixed(2)}|${fx.tug.toFixed(2)}`;
        if (key === lastKey) return;
        lastKey = key;

        const g = SCENE.girl;
        const m = SCENE.mole;
        const carrotTf = `translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${tilt.toFixed(2)})`;
        const girlTf = `translate(${g.x} ${(g.y + hop).toFixed(1)}) rotate(${girlLean.toFixed(2)}) scale(${g.s})`;
        const moleTf = `translate(${m.x} ${(m.y + hop * 0.7).toFixed(1)}) rotate(${moleLean.toFixed(2)}) scale(${m.s})`;
        nodes.carrot.setAttribute('transform', carrotTf);
        nodes.girl.setAttribute('transform', girlTf);
        nodes.girlHands.setAttribute('transform', girlTf);
        nodes.mole.setAttribute('transform', moleTf);
        nodes.molePaws.setAttribute('transform', moleTf);

        const crowns = SCENE.crown.map(pt => place(pt, cx, cy, tilt));
        girlStems.forEach((path, i) => {
            const hand = place(SCENE.girlHands[i], g.x, g.y + hop, girlLean, g.s);
            path.setAttribute('d', stemPath(crowns[i], hand, 10 - fx.tug * 8));
        });
        moleStems.forEach((path, i) => {
            const paw = place(SCENE.molePaws[i], m.x, m.y + hop * 0.7, moleLean, m.s);
            path.setAttribute('d', stemPath(crowns[2 - i], paw, 8 - fx.tug * 6));
        });
        nodes.stemsGirl.setAttribute('opacity', stemAlpha.toFixed(2));
        nodes.stemsMole.setAttribute('opacity', stemAlpha.toFixed(2));
        nodes.tug.setAttribute('opacity', (fx.tug * 0.9).toFixed(2));
    }

    return { hit, miss, harvest, reset, tick };
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
        lastFrame: 0,
        messageTimer: 0,
        resultTimer: 0,
        won: false,
    };
    const refs = {};
    let lang = getLang();
    const sfx = createSfxEngine({ masterGain: 0.55 });

    const text = () => LANGUAGES[lang] || LANGUAGES.en;
    let scene = null;
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
        const value = Number.parseInt(storageGet(BEST_KEY) || '0', 10);
        return Number.isFinite(value) ? value : 0;
    }

    function updateProgressDots(force = false) {
        if (!refs['cp-progress-dots'] || (!force && dotsRound === state.round)) return;
        dotsRound = state.round;
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
            storageSet(BEST_KEY, String(best));
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
    }

    function setPaused(paused) {
        if (state.mode !== 'playing' || state.paused === paused) return;
        state.paused = paused;
        updateUi();
        updateStatus(currentStatusText());
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
            if (state.time <= 0) finish(false);
            else updateFrameUi();
        }
        scene?.tick(now, state.mode === 'menu' ? 0 : state.pulls / state.needed, state.mode === 'playing' && !state.paused);
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
                setPaused(!state.paused);
            }
        });
        window.addEventListener('site-settings:changed', () => applyLanguage(getLang()));
    }

    function init() {
        cacheRefs();
        scene = createScene();
        best = bestScore();
        applyLanguage(lang);
        updateUi();
        bindEvents();
        window.requestAnimationFrame(frame);
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

onReady(() => {
    const game = createGame();
    window.cpGame = game;
    const more = document.getElementById('cpSideMore');
    if (more) renderMoreGames(more, { exclude: 'carrot-pull.html' });
    const getText = () => LANGUAGES[getLang()] || LANGUAGES.en;
    const drawer = createStatsDrawer({
        idPrefix: 'cp',
        getGame: () => game.state,
        isBusy: () => game.isRunning(),
        onPause: () => game.pauseQuiet(),
        onResume: () => game.resumeQuiet(),
        ICONS,
        getText,
    });
    if (drawer) drawer.init();
    // 顶栏首页钮是无 href 的 <button>，跳转靠 chrome 接管，所以 owns 必须含 'home'；
    // 本页静音钮没有自己的 handler，交给 chrome（见 docs/contracts/chrome.md §1.3）。
    bindChrome({ self: 'carrot-pull.html', getText, owns: ['more', 'home', 'sound'] });
    bindFrame({ logicalWidth: 560 });
    game.init();
});
