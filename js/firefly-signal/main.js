/**
 * 萤火信号 Firefly Signal — 页面入口
 * ==================================
 * 模块划分（与 simulation / renderer 解耦的约定见各文件头）：
 *   simulation.js  确定性相位模型（固定步长 + 种子随机）
 *   renderer.js    Canvas 场景、虫体、环境照明（只读模拟状态）
 *   levels.js      三个原型关卡
 *   audio.js       声音（共享引擎，跟随 site_muted）
 *   game.js        状态机 / 输入 / HUD / 成功序列
 *   main.js        本文件：文案、菜单、共享 chrome 与 Immersive Stage 的接线
 */
import { onReady } from '../boot.js';
import { makeText } from '../i18n.js';
import { bindChrome } from '../game-chrome.js';
import { bindFrame } from '../game-frame.js';
import { getLang, getMuted, setMuted } from '../site-settings.js';
import { renderMoreGames } from '../more-games.js';
import { track } from '../analytics.js';
import { FireflyGame, LEVELS, loadBest } from './game.js';

const LANGUAGES = makeText({
    en: {
        title: 'Firefly Signal',
        kicker: 'A midsummer synchrony puzzle',
        startCopy: 'Every firefly blinks to its own rhythm. Nudge just a few, and watch whole meadows fall into step — until the entire field lights up as one.',
        harmony: 'Harmony',
        interventions: 'Signals left',
        harmonyShort: 'Harmony',
        signalsLabel: 'Signals',
        restart: 'Restart',
        home: 'Home',
        best: 'Best {used}/{max} · {n}%',
        signals: '{max} signals · {n}%',
        resultWin: '{name} Resonance',
        resultFail: 'The meadow drifts apart',
        resultHarmony: 'Harmony {n}%',
        resultUsed: '{used} / {max} signals',
        next: 'Continue',
        retry: 'Retry',
        menu: 'Menu',
        hint: 'Tap a firefly to send a signal · its ring shows who will follow',
        canvasLabel: 'A midsummer meadow full of fireflies',
        levels: {
            'first-light': { name: 'First Light', desc: 'Two small groups, two rhythms.' },
            'two-meadows': { name: 'Two Meadows', desc: 'Some fireflies sit in between.' },
            midsummer: { name: 'Midsummer', desc: 'Quick ones lead, loners drift.' },
        },
        coach: {
            'first-light': {
                intro: 'Each firefly blinks to its own rhythm. Watch for a moment.',
                howTo: 'Tap a firefly: it flashes at once, and those inside its ring drift toward its rhythm.',
                afterFirst: 'Try tapping right as the other group flashes.',
                outOfSignals: 'Out of signals — tap ↻ to try again.',
            },
            'two-meadows': {
                intro: 'Two meadows, two rhythms. Some fireflies sit in between.',
                howTo: 'Find a firefly whose ring reaches both meadows.',
                afterFirst: 'Nearby rhythms pull each other in — give them a moment.',
                outOfSignals: 'Out of signals — tap ↻ to try again.',
            },
            midsummer: {
                intro: 'Three meadows by the lake. Quick ones lead; loners drift away.',
                howTo: 'Look for the fireflies that connect the meadows.',
                afterFirst: 'Watch which meadow flashes next before you signal again.',
                outOfSignals: 'Out of signals — tap ↻ to try again.',
            },
        },
    },
    zh: {
        title: '萤火信号',
        kicker: '仲夏夜 · 同步谜题',
        startCopy: '每只萤火虫都按自己的节奏闪烁。只轻轻推动其中几只，看一片片草地渐渐合拍——直到整片原野同时亮起。',
        harmony: '同步度',
        interventions: '剩余干预',
        harmonyShort: '同步度',
        signalsLabel: '干预',
        restart: '重来',
        home: '首页',
        best: '最佳 {used}/{max} · {n}%',
        signals: '{max} 次干预 · {n}%',
        resultWin: '{name} · 共鸣',
        resultFail: '草地的节奏又散开了',
        resultHarmony: '同步度 {n}%',
        resultUsed: '干预 {used} / {max}',
        next: '继续',
        retry: '重来',
        menu: '返回',
        hint: '点一只萤火虫进行干预 · 光圈就是会跟随它的范围',
        canvasLabel: '满是萤火虫的仲夏夜草地',
        levels: {
            'first-light': { name: '初光', desc: '两小群，两种节奏。' },
            'two-meadows': { name: '两片草地', desc: '有几只停在两群中间。' },
            midsummer: { name: '仲夏', desc: '急性子领跑，独行者漂远。' },
        },
        coach: {
            'first-light': {
                intro: '每只萤火虫都按自己的节奏闪。先看一会儿。',
                howTo: '点一只萤火虫：它立刻闪光，光圈里的同伴会向它的节奏靠拢。',
                afterFirst: '试试在另一群刚闪亮的那一刻点。',
                outOfSignals: '干预次数用完了——点 ↻ 再试一次。',
            },
            'two-meadows': {
                intro: '两片草地，两种节奏。有几只停在中间。',
                howTo: '找一只光圈能同时碰到两片草地的萤火虫。',
                afterFirst: '相近的节奏会互相牵引——给它们一点时间。',
                outOfSignals: '干预次数用完了——点 ↻ 再试一次。',
            },
            midsummer: {
                intro: '湖边三片草地。急性子领跑，独行者慢慢漂远。',
                howTo: '找出把草地连在一起的那几只。',
                afterFirst: '下一次干预前，先看清哪一片接着闪。',
                outOfSignals: '干预次数用完了——点 ↻ 再试一次。',
            },
        },
    },
});

const getText = () => LANGUAGES[getLang()] || LANGUAGES.en;
const $ = id => document.getElementById(id);

function renderLevelList(game) {
    const t = getText();
    const list = $('fs-level-list');
    list.innerHTML = '';
    LEVELS.forEach((level, i) => {
        const best = loadBest(level.id);
        const pct = Math.round(level.target * 100);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fs-level-btn';
        btn.id = `fs-level-${level.id}`;
        const meta = best
            ? t.best.replace('{used}', best.used).replace('{max}', level.maxInterventions).replace('{n}', Math.round(best.harmony * 100))
            : t.signals.replace('{max}', level.maxInterventions).replace('{n}', pct);
        const no = document.createElement('span');
        no.className = 'fs-level-no';
        no.textContent = String(i + 1);
        const name = document.createElement('span');
        name.className = 'fs-level-name';
        name.textContent = t.levels[level.id].name;
        const bestEl = document.createElement('span');
        bestEl.className = 'fs-level-best';
        bestEl.textContent = meta;
        const desc = document.createElement('span');
        desc.className = 'fs-level-desc';
        desc.textContent = t.levels[level.id].desc;
        btn.append(no, name, bestEl, desc);
        btn.addEventListener('click', () => game.startLevel(i));
        list.appendChild(btn);
    });
}

function applyLanguage(game) {
    const t = getText();
    document.documentElement.lang = getLang() === 'zh' ? 'zh-CN' : 'en';
    $('fs-h1').textContent = t.title;
    $('fs-kicker').textContent = t.kicker;
    $('fs-start-title').textContent = t.title;
    $('fs-start-copy').textContent = t.startCopy;
    $('fs-hint').textContent = t.hint;
    $('fs-harmony-label').textContent = t.harmonyShort;
    $('fs-signals-label').textContent = t.signalsLabel;
    $('fs-canvas').setAttribute('aria-label', t.canvasLabel);
    const restart = $('fs-btn-restart');
    restart.title = t.restart;
    restart.setAttribute('aria-label', t.restart);
    $('fs-btn-retry').querySelector('span').textContent = t.retry;
    $('fs-btn-menu').querySelector('span').textContent = t.menu;
    renderLevelList(game);
    game.refreshStatic();
}

onReady(() => {
    const game = new FireflyGame({
        stage: $('fs-stage'),
        canvas: $('fs-canvas'),
        hud: $('fs-hud'),
        harmony: $('fs-harmony'),
        harmonyValue: $('fs-harmony-value'),
        ringFill: $('fs-ring-fill'),
        ringTarget: $('fs-ring-target'),
        dots: $('fs-dots'),
        signalsCount: $('fs-signals-count'),
        coach: $('fs-coach'),
        start: $('fs-start'),
        result: $('fs-result'),
        resultTitle: $('fs-result-title'),
        resultHarmony: $('fs-result-harmony'),
        resultUsed: $('fs-result-used'),
        btnNext: $('fs-btn-next'),
        btnNextLabel: $('fs-btn-next').querySelector('span'),
        levelPill: $('fs-level-pill'),
        btnRestart: $('fs-btn-restart'),
        backdrop: $('fs-backdrop'),
    }, getText, { track });
    // 测试钩子（verify-immersive / smoke-firefly-signal 用）：只读快照 + 公开方法，不暴露模拟内部可写引用
    window.__fireflySignal = game;

    $('fs-btn-restart').addEventListener('click', () => game.restart());
    $('fs-btn-next').addEventListener('click', () => game.nextLevel());
    $('fs-btn-retry').addEventListener('click', () => game.restart());
    $('fs-btn-menu').addEventListener('click', () => { game.toMenu(); renderLevelList(game); });

    const startMore = $('fsStartMore');
    if (startMore) renderMoreGames(startMore, { exclude: 'firefly-signal.html' });

    applyLanguage(game);
    window.addEventListener('site-settings:changed', () => applyLanguage(game));

    // 切到后台：停循环（同时就是暂停）；回来只恢复因切后台而停的那一次
    let pausedByHidden = false;
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            if (!game.paused) { game.pauseQuiet(); pausedByHidden = true; }
        } else if (pausedByHidden) {
            pausedByHidden = false;
            game.resumeQuiet();
        }
    });

    // 顶栏首页钮是无 href 的 <button>，跳转交给 chrome（owns 含 'home'）；
    // 静音钮本页不自绑 handler，也交给 chrome，并在切换时预热音频上下文。
    bindChrome({
        self: 'firefly-signal.html',
        getText,
        owns: ['more', 'home', 'sound'],
        isMuted: getMuted,
        onToggleMute: m => { setMuted(m); if (!m) game.audio.prime(); },
    });
    // Immersive Stage：实测「shell 上内距 + 顶栏」写入 --frame-chrome，舞台高度 = 100dvh − chrome − 安全区
    bindFrame({ layout: 'immersive' });
    game.toMenu();
});
