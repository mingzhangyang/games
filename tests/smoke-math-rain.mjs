#!/usr/bin/env node
/**
 * smoke-math-rain — math-rain 页运行时冒烟与交互回归。
 *
 * 覆盖：bootstrap、六档难度、开局与算式生成、正确/错误命中、三种道具、
 * 目标切换、暂停/恢复、会话完成、商店、游戏结束、移动端横竖屏，以及
 * 生产背景在 wide 失败后的 fallback 路径。
 */
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';

const BASE = process.argv.find(a => a.startsWith('http')) || 'http://127.0.0.1:8897';
const fails = [];
const fail = message => fails.push(message);

async function waitFor(page, predicate, message, ...args) {
    try {
        await page.waitForFunction(predicate, { timeout: 8000 }, ...args);
        return true;
    } catch {
        fail(message);
        return false;
    }
}

async function visible(page, id) {
    return page.$eval(`#${id}`, element => (
        !element.classList.contains('hidden') && getComputedStyle(element).display !== 'none'
    )).catch(() => false);
}

async function gameState(page) {
    return page.evaluate(() => window.mathRainGame?.gameStateManager?.getState() || null);
}

async function createFixedExpression(page, result, expressionText) {
    return page.evaluate(({ result: expressionResult, expressionText: text }) => {
        const game = window.mathRainGame;
        const target = game.gameStateManager.getState().targetNumber;
        game.expressions = [];
        game.createCanvasExpression(
            { expression: text, result: expressionResult },
            expressionResult === target,
            12000,
            160
        );
        const expression = game.expressions[0];
        const canvasRect = game.canvas.getBoundingClientRect();
        const logicalWidth = game.canvasCssWidth || canvasRect.width;
        const logicalHeight = game.canvasCssHeight || canvasRect.height;
        const toClient = (x, y) => ({
            x: canvasRect.left + x * (canvasRect.width / logicalWidth),
            y: canvasRect.top + y * (canvasRect.height / logicalHeight),
        });
        const candidates = [
            [0.5, 0.46], [0.35, 0.5], [0.65, 0.5],
            [0.5, 0.62], [0.3, 0.66], [0.7, 0.66],
        ];
        let chosen = null;
        for (const [fx, fy] of candidates) {
            const client = {
                x: canvasRect.left + canvasRect.width * fx,
                y: canvasRect.top + canvasRect.height * fy,
            };
            const hit = document.elementFromPoint(client.x, client.y);
            if (hit === game.canvas || game.canvas.contains(hit)) {
                chosen = client;
                break;
            }
        }
        chosen ||= {
            x: canvasRect.left + canvasRect.width / 2,
            y: canvasRect.top + canvasRect.height / 2,
        };
        expression.position = {
            x: (chosen.x - canvasRect.left) * (logicalWidth / canvasRect.width),
            y: (chosen.y - canvasRect.top) * (logicalHeight / canvasRect.height),
        };
        expression.speed = 0;
        expression.startTime = Date.now();

        const bounds = game.getExpressionBounds(expression);
        const hitBounds = game.getExpressionHitBounds(expression);
        const center = toClient((bounds.left + bounds.right) / 2, (bounds.top + bounds.bottom) / 2);
        const expandedLogical = [
            [(bounds.left + bounds.right) / 2, bounds.bottom + (hitBounds.bottom - bounds.bottom) / 2],
            [(bounds.left + bounds.right) / 2, bounds.top - (bounds.top - hitBounds.top) / 2],
        ];
        let expanded = center;
        for (const [x, y] of expandedLogical) {
            const point = toClient(x, y);
            const hit = document.elementFromPoint(point.x, point.y);
            if (hit === game.canvas || game.canvas.contains(hit)) {
                expanded = point;
                break;
            }
        }
        return {
            id: expression.id,
            x: center.x,
            y: center.y,
            expandedTouchX: expanded.x,
            expandedTouchY: expanded.y,
            visualWidth: bounds.width,
            visualHeight: bounds.height,
            hitWidth: hitBounds.hitWidth,
            hitHeight: hitBounds.hitHeight,
        };
    }, { result, expressionText });
}

const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: LAUNCH_ARGS,
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', error => pageErrors.push(String(error.message || error).split('\n')[0]));
page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text().split('\n')[0]);
});
await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem('site_lang', 'zh'); } catch { /* ignore */ }
});

await page.goto(`${BASE}/math-rain.html`, { waitUntil: 'networkidle0', timeout: 45000 });
await waitFor(
    page,
    () => !!window.mathRainGame?.gameStateManager && !!window.mathRainGame?.uiController,
    '8s 内核心组件未就位'
);

const initial = await page.evaluate(() => {
    const gameContainer = document.getElementById('game-container');
    const gameArea = document.getElementById('game-area');
    const rect = gameContainer?.getBoundingClientRect();
    return {
        mainTag: !!document.querySelector('main.mr-main'),
        h1: document.getElementById('game-title')?.textContent || '',
        startVisible: !document.getElementById('start-screen')?.classList.contains('hidden'),
        difficultyCount: document.querySelectorAll('.difficulty-btn').length,
        containerSize: rect ? `${Math.round(rect.width)}x${Math.round(rect.height)}` : 'missing',
        languageManager: typeof window.languageManager?.updateLanguage === 'function',
        shopManager: !!window.shopManager,
        gameInstance: !!window.mathRainGame,
        tokensApplied: getComputedStyle(document.documentElement).getPropertyValue('--tok-bg').trim() !== '',
        bodyOverflowHidden: getComputedStyle(document.body).overflow === 'hidden',
        backgroundImage: gameArea ? getComputedStyle(gameArea).backgroundImage : '',
        backgroundOverlayPointerEvents: gameArea
            ? getComputedStyle(gameArea, '::after').pointerEvents
            : 'missing',
    };
});

if (!initial.mainTag) fail('缺 <main class="mr-main">');
if (!initial.h1) fail('缺 #game-title h1');
if (!initial.startVisible) fail('start-screen 未显示');
if (initial.difficultyCount !== 6) fail(`难度档位应为 6，实际 ${initial.difficultyCount}`);
if (initial.containerSize === 'missing') fail('缺 #game-container');
else {
    const [width, height] = initial.containerSize.split('x').map(Number);
    if (width < 300 || height < 300) fail(`game-container 尺寸异常：${initial.containerSize}`);
}
if (!initial.languageManager) fail('languageManager 未初始化');
if (!initial.shopManager) fail('shopManager 未初始化');
if (!initial.gameInstance) fail('mathRainGame 实例未创建');
if (!initial.tokensApplied) fail('tokens.css 变量未生效');
if (!initial.bodyOverflowHidden) fail('body overflow:hidden 被破坏');
if (!initial.backgroundImage.includes('observatory-wide')) fail('桌面端未启用 observatory-wide 背景');
if (!initial.backgroundImage.includes('fallback')) fail('桌面端背景未声明 fallback 层');
if (initial.backgroundOverlayPointerEvents !== 'none') fail('背景装饰层会拦截 Canvas 指针事件');

// 六档难度逐档点击，确保新卡片布局没有丢失原有事件绑定。
for (let level = 1; level <= 6; level++) {
    await page.click(`#difficulty-${level}`);
    const selected = await page.$eval(`#difficulty-${level}`, element => element.classList.contains('selected'));
    if (!selected) fail(`难度 ${level} 点击后未选中`);
}
await page.click('#difficulty-1');

await page.click('#start-game-btn');
await waitFor(page, () => window.mathRainGame?.gameStateManager?.getState()?.gameState === 'playing', '点击开始后未进入 playing');
await waitFor(page, () => (window.mathRainGame?.expressions?.length || 0) > 0, '开局后未生成表达式');

const running = await page.evaluate(() => {
    const gameArea = document.getElementById('game-area');
    const rect = gameArea?.getBoundingClientRect();
    const elementAtCanvas = rect
        ? document.elementFromPoint(rect.left + 8, rect.top + 8)
        : null;
    return {
        canvasSize: `${document.getElementById('game-canvas')?.clientWidth || 0}x${document.getElementById('game-canvas')?.clientHeight || 0}`,
        canvasReceivesPointer: elementAtCanvas?.id === 'game-canvas',
        target: document.getElementById('target-number')?.textContent || '',
        toolbar: !!document.getElementById('tool-bar'),
    };
});
if (running.canvasSize === '0x0') fail('playing 状态 Canvas 尺寸为 0');
if (!running.canvasReceivesPointer) fail('playing 状态 Canvas 不是可命中前景层');
if (!running.target) fail('目标数字未显示');
if (!running.toolbar) fail('缺 #tool-bar');

// 实际鼠标坐标命中：正确答案与错误答案各走一次，验证渲染几何和 hit-test 共用。
const beforeCorrect = await gameState(page);
const target = beforeCorrect?.targetNumber;
const correctPoint = await createFixedExpression(page, target, `${target} + 0`);
if (correctPoint.hitWidth < correctPoint.visualWidth || correctPoint.hitHeight < correctPoint.visualHeight) {
    fail(`desktop 表达式热区缩小了旧命中区域：visual=${correctPoint.visualWidth}x${correctPoint.visualHeight} hit=${correctPoint.hitWidth}x${correctPoint.hitHeight}`);
}
await page.mouse.click(correctPoint.x, correctPoint.y);
await waitFor(
    page,
    previous => (window.mathRainGame?.gameStateManager?.getState()?.correctClicks || 0) > previous,
    '正确表达式点击未计入 correctClicks',
    beforeCorrect?.correctClicks || 0
);

const beforeIncorrect = await gameState(page);
const incorrectPoint = await createFixedExpression(page, target + 1, `${target} + 1`);
await page.mouse.click(incorrectPoint.x, incorrectPoint.y);
await waitFor(
    page,
    previous => (window.mathRainGame?.gameStateManager?.getState()?.totalClicks || 0) > previous,
    '错误表达式点击未计入 totalClicks',
    beforeIncorrect?.totalClicks || 0
);
const afterIncorrect = await gameState(page);
if ((afterIncorrect?.correctClicks || 0) !== (beforeIncorrect?.correctClicks || 0)) {
    fail('错误表达式被错误计为 correctClicks');
}

const targetChange = await page.evaluate(() => {
    const game = window.mathRainGame;
    const oldTarget = game.gameStateManager.getState().targetNumber;
    game.generateNewTarget();
    if (game.gameStateManager.getState().targetNumber === oldTarget) {
        game.gameStateManager.setTargetNumber(oldTarget + 1);
    }
    const nextTarget = game.gameStateManager.getState().targetNumber;
    return { nextTarget, domTarget: Number(document.getElementById('target-number').textContent) };
});
if (targetChange.nextTarget !== targetChange.domTarget) fail('目标切换后 DOM readout 未同步');

await page.evaluate(() => {
    const gsm = window.mathRainGame.gameStateManager;
    gsm.freezeCount = 1;
    gsm.bombCount = 1;
    gsm.shieldCount = 1;
    gsm.emitStateChanged();
});
await page.click('#freeze-btn');
await waitFor(page, () => window.mathRainGame?.gameStateManager?.getState()?.freezeActive === true, 'Freeze 道具未生效');

await createFixedExpression(page, targetChange.nextTarget, `${targetChange.nextTarget} + 0`);
await page.click('#bomb-btn');
await waitFor(page, () => (window.mathRainGame?.expressions?.length || 0) === 0, 'Bomb 道具未清空表达式');

await page.click('#shield-btn');
await waitFor(page, () => window.mathRainGame?.gameStateManager?.getState()?.shieldActive === true, 'Shield 道具未生效');

await page.click('#pause-btn');
await waitFor(page, () => window.mathRainGame?.gameStateManager?.getState()?.gameState === 'paused', '暂停按钮未进入 paused');
if (!(await visible(page, 'pause-screen'))) fail('暂停层未显示');
await page.click('#resume-btn');
await waitFor(page, () => window.mathRainGame?.gameStateManager?.getState()?.gameState === 'playing', '恢复按钮未回到 playing');

await page.click('#shop-btn');
await waitFor(page, () => !document.getElementById('shop-screen')?.classList.contains('hidden'), '商店层未显示');
if ((await gameState(page))?.gameState !== 'paused') fail('游戏内打开商店没有暂停');
await page.click('#shop-close-btn');
await waitFor(page, () => document.getElementById('shop-screen')?.classList.contains('hidden'), '关闭商店后层未隐藏');
await waitFor(page, () => window.mathRainGame?.gameStateManager?.getState()?.gameState === 'playing', '关闭商店后游戏未恢复');

await page.evaluate(() => window.mathRainGame.sessionManager.completeSession());
await waitFor(page, () => window.mathRainGame?.gameStateManager?.getState()?.gameState === 'sessionComplete', '会话完成后状态不正确');
if (!(await visible(page, 'session-complete-screen'))) fail('会话完成层未显示');
await page.click('#session-menu-btn');
if (!(await visible(page, 'start-screen'))) fail('会话完成返回菜单失败');

await page.click('#start-game-btn');
await waitFor(page, () => window.mathRainGame?.gameStateManager?.getState()?.gameState === 'playing', '重新开局失败');
await page.evaluate(() => window.mathRainGame.gameStateManager.gameOver());
await waitFor(page, () => window.mathRainGame?.gameStateManager?.getState()?.gameState === 'gameOver', 'gameOver 状态未落地');
if (!(await visible(page, 'game-over-screen'))) fail('game-over 层未显示');

// 移动端 portrait / landscape：布局不能横向溢出，观测舱背景需要切换 mobile crop。
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await page.reload({ waitUntil: 'networkidle0', timeout: 45000 });
await waitFor(page, () => !!window.mathRainGame?.gameStateManager, '移动端 reload 后核心组件未就位');
const portrait = await page.evaluate(() => {
    const area = document.getElementById('game-area');
    const targetArea = document.getElementById('target-area')?.getBoundingClientRect();
    const toolbar = document.getElementById('tool-bar')?.getBoundingClientRect();
    return {
        background: area ? getComputedStyle(area).backgroundImage : '',
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1 || document.body.scrollWidth > window.innerWidth + 1,
        targetInside: !!targetArea && targetArea.left >= -1 && targetArea.right <= window.innerWidth + 1,
        toolbarInside: !!toolbar && toolbar.left >= -1 && toolbar.right <= window.innerWidth + 1,
    };
});
if (!portrait.background.includes('observatory-mobile')) fail('portrait 未启用 observatory-mobile 背景');
if (portrait.overflow) fail('portrait 存在横向溢出');
if (!portrait.targetInside || !portrait.toolbarInside) fail('portrait 目标区或工具栏超出视口');

await page.click('#start-game-btn');
await waitFor(page, () => window.mathRainGame?.gameStateManager?.getState()?.gameState === 'playing', '移动端 portrait 无法开始');

// 触控命中：视觉卡片保持原尺寸，但移动端卡片外沿的最小热区应达到 44px。
const mobileBeforeTouch = await gameState(page);
const mobileTarget = mobileBeforeTouch?.targetNumber;
const mobileTouchPoint = await createFixedExpression(page, mobileTarget, `${mobileTarget}`);
if (
    mobileTouchPoint.hitWidth < 44 ||
    mobileTouchPoint.hitHeight < 44 ||
    mobileTouchPoint.hitWidth < mobileTouchPoint.visualWidth ||
    mobileTouchPoint.hitHeight < mobileTouchPoint.visualHeight
) {
    fail(`mobile 表达式热区契约异常：visual=${mobileTouchPoint.visualWidth}x${mobileTouchPoint.visualHeight} hit=${mobileTouchPoint.hitWidth}x${mobileTouchPoint.hitHeight}`);
}
await page.touchscreen.tap(mobileTouchPoint.expandedTouchX, mobileTouchPoint.expandedTouchY);
await waitFor(
    page,
    previous => (window.mathRainGame?.gameStateManager?.getState()?.correctClicks || 0) > previous,
    '移动端 44px 扩展热区未命中正确表达式',
    mobileBeforeTouch?.correctClicks || 0
);

await page.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true });
await new Promise(resolve => setTimeout(resolve, 180));
const landscape = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1 || document.body.scrollWidth > window.innerWidth + 1,
    canvas: `${document.getElementById('game-canvas')?.clientWidth || 0}x${document.getElementById('game-canvas')?.clientHeight || 0}`,
}));
if (landscape.overflow) fail('landscape 存在横向溢出');
if (landscape.canvas === '0x0') fail('landscape 旋转后 Canvas 尺寸为 0');

// 生产背景 fallback：只阻断 wide 图，保留 fallback 请求和页面运行。
const fallbackPage = await browser.newPage();
await fallbackPage.setViewport({ width: 1280, height: 900 });
await fallbackPage.evaluateOnNewDocument(() => {
    try { localStorage.setItem('site_lang', 'zh'); } catch { /* ignore */ }
});
await fallbackPage.setRequestInterception(true);
let wideAborted = false;
const fallbackResponses = [];
const fallbackBackgroundFailures = [];
const fallbackPageErrors = [];
const fallbackConsoleErrors = [];
fallbackPage.on('pageerror', error => fallbackPageErrors.push(String(error.message || error).split('\n')[0]));
fallbackPage.on('console', message => {
    const text = message.text().split('\n')[0];
    const url = message.location()?.url || '';
    const expectedWideFailure = url.includes('observatory-wide');
    const platformNoise = /sw-register\.js|analytics\.js|manifest|favicon|apple-touch-icon/i.test(`${text} ${url}`);
    if (message.type() === 'error' && !expectedWideFailure && !platformNoise) {
        fallbackConsoleErrors.push(`${text}${url ? ` @ ${url}` : ''}`);
    }
});
fallbackPage.on('request', request => {
    if (request.url().includes('observatory-wide')) {
        wideAborted = true;
        request.abort();
    } else {
        request.continue();
    }
});
fallbackPage.on('requestfailed', request => {
    const url = request.url();
    if (url.includes('/assets/math-rain/backgrounds/') && !url.includes('observatory-wide')) {
        fallbackBackgroundFailures.push(`${url} (${request.failure()?.errorText || 'unknown'})`);
    }
});
fallbackPage.on('response', response => {
    if (response.url().includes('fallback')) fallbackResponses.push(response.status());
});
await fallbackPage.goto(`${BASE}/math-rain.html`, { waitUntil: 'networkidle0', timeout: 45000 });
await waitFor(fallbackPage, () => !!window.mathRainGame?.gameStateManager, 'fallback 页面核心组件未就位');
const fallbackSnapshot = await fallbackPage.evaluate(() => ({
    background: getComputedStyle(document.getElementById('game-area')).backgroundImage,
    productionArtEnabled: getComputedStyle(document.getElementById('game-area')).backgroundImage.includes('observatory-wide'),
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
}));
const fallbackAsset = await fallbackPage.evaluate(() => new Promise(resolve => {
    const image = document.createElement('img');
    const timeout = setTimeout(() => resolve({ ok: false, error: 'timeout' }), 8000);
    image.onload = () => {
        clearTimeout(timeout);
        resolve({ ok: image.naturalWidth > 0 && image.naturalHeight > 0, width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
        clearTimeout(timeout);
        resolve({ ok: false, error: 'load' });
    };
    image.src = new URL('assets/math-rain/backgrounds/fallback.webp', document.baseURI).href;
}));
if (!wideAborted) fail('fallback 测试没有阻断 wide 生产背景');
if (!fallbackResponses.some(status => status >= 200 && status < 400)) fail('fallback 背景请求未成功');
if (fallbackBackgroundFailures.length) fail(`fallback 背景资源请求失败：${fallbackBackgroundFailures.join(' | ')}`);
if (!fallbackAsset.ok) fail(`fallback 资源未能实际加载：${fallbackAsset.error || 'unknown'}`);
if (!fallbackSnapshot.productionArtEnabled || !fallbackSnapshot.background.includes('fallback')) fail('fallback 测试未在生产美术背景契约下运行');
if (fallbackSnapshot.overflow) fail('fallback 页面存在横向溢出');
if (fallbackPageErrors.length) fail(`fallback 页面错误：${fallbackPageErrors.join(' | ')}`);
if (fallbackConsoleErrors.length) fail(`fallback 控制台错误：${fallbackConsoleErrors.join(' | ')}`);
await fallbackPage.close();

if (consoleErrors.some(text => text.includes('Failed to bootstrap Math Rain'))) {
    fail(`bootstrap 失败：${consoleErrors.find(text => text.includes('Failed to bootstrap Math Rain'))}`);
}
if (consoleErrors.some(text => text.includes('Initialization failed'))) fail('main.js 初始化失败（见控制台错误）');
if (pageErrors.length) fail(`页面错误：${pageErrors.join(' | ')}`);

await browser.close();
if (fails.length) {
    console.error('✗ smoke-math-rain');
    for (const message of fails) console.error(`  - ${message}`);
    process.exit(1);
}
console.log('smoke-math-rain：bootstrap / 六档难度 / 交互流程 / 响应式 / fallback 全部通过 ✅');
