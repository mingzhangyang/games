#!/usr/bin/env node
// 拔萝卜生产美术烟测：加载状态、真实点击、结算、响应式比例与资源失败 fallback。
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';

const BASE = process.argv.find(arg => arg.startsWith('http')) || 'http://127.0.0.1:8899';
const fails = [];
const fail = message => fails.push(message);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function isIgnorable(message) {
    return /analytics\.js|sw-register\.js|manifest|apple-touch-icon|favicon|game-scores|games-analytics|CORS/i.test(message);
}

async function setupPage(page, { blockArt = false } = {}) {
    const pageErrors = [];
    const consoleErrors = [];
    const failedRequests = [];
    page.on('pageerror', error => pageErrors.push(String(error.message || error).split('\n')[0]));
    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(`${message.text().split('\n')[0]} @ ${message.location()?.url || ''}`);
    });
    page.on('requestfailed', request => failedRequests.push(request.url()));
    if (blockArt) {
        await page.setRequestInterception(true);
        page.on('request', request => {
            const url = request.url();
            const isArt = request.resourceType() === 'image' && /\.(?:webp|svg)(?:\?|$)/i.test(url);
            if (isArt) request.abort();
            else request.continue();
        });
    }
    await page.evaluateOnNewDocument(() => {
        try {
            localStorage.clear();
            localStorage.setItem('site_lang', 'zh');
        } catch { /* storage is optional in private contexts */ }
    });
    await page.goto(`${BASE}/carrot-pull.html`, { waitUntil: 'networkidle0', timeout: 45000 });
    await page.waitForFunction(() => window.cpGame && ['ready', 'fallback'].includes(document.getElementById('cp-stage')?.dataset.artState), { timeout: 15000 });
    await wait(180);
    return { pageErrors, consoleErrors, failedRequests };
}

async function assertNormalPage() {
    const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    let diagnostics;
    try {
        diagnostics = await setupPage(page);
        const boot = await page.evaluate(() => {
            const stage = document.getElementById('cp-stage');
            const svg = document.getElementById('cp-scene');
            return {
                hasGame: !!window.cpGame,
                state: window.cpGame?.state?.mode,
                artState: stage?.dataset.artState,
                startVisible: !document.getElementById('cp-start')?.hidden,
                sceneVisible: getComputedStyle(svg?.querySelector('[data-art-production]')).visibility !== 'hidden',
                layerHrefs: [...document.querySelectorAll('[data-art-layer]')].map(node => node.getAttribute('href') || node.getAttribute('xlink:href')),
                spriteWidths: [...document.querySelectorAll('[data-art-sprite]')].map(node => node.getBoundingClientRect().width),
                progressDots: document.querySelectorAll('#cp-progress-dots .cp-progress-dot').length,
                progressHasEmoji: document.getElementById('cp-progress-dots')?.textContent.includes('🥕'),
                miniCarrot: document.querySelector('[data-art-ui="carrot-mark"]')?.getAttribute('src'),
                pullIcon: {
                    tag: document.querySelector('#cp-pull-btn .cp-pull-arrow')?.tagName,
                    hasPath: Boolean(document.querySelector('#cp-pull-btn .cp-pull-arrow path')),
                },
                residualPaws: Boolean(document.querySelector('#cp-mole-paws, [data-art-sprite="mole-paws"]')),
            };
        });
        if (!boot.hasGame || boot.state !== 'menu') fail(`boot state 异常: ${JSON.stringify(boot)}`);
        if (boot.artState !== 'ready') fail(`正常资源应进入 ready，实际为 ${boot.artState}`);
        if (!boot.startVisible || !boot.sceneVisible) fail('开始层或 production 场景未显示');
        if (boot.layerHrefs.some(href => !href)) fail('有 production 图层没有加载 href');
        if (boot.spriteWidths.some(width => width <= 0)) fail('有角色/萝卜精灵没有可见尺寸');
        if (boot.progressDots !== 6 || boot.progressHasEmoji) fail('进度萝卜图标未按正式 SVG 渲染');
        if (!boot.miniCarrot || !boot.pullIcon.hasPath || boot.pullIcon.tag !== 'svg') fail('正式 UI 图标没有加载');
        if (boot.residualPaws) fail('production scene contains residual mole paws');

        await page.click('#cp-start-btn');
        await page.evaluate(() => {
            window.cpGame.state.needle = window.cpGame.state.target;
        });
        await page.click('#cp-pull-btn');
        const hit = await page.evaluate(() => ({ pulls: window.cpGame.state.pulls, score: window.cpGame.state.score }));
        if (hit.pulls !== 1 || hit.score <= 0) fail(`真实命中未生效: ${JSON.stringify(hit)}`);

        const beforeMiss = await page.evaluate(() => {
            window.cpGame.state.needle = 0;
            return window.cpGame.state.time;
        });
        await page.click('#cp-pull-btn');
        const miss = await page.evaluate(() => ({ time: window.cpGame.state.time, oops: document.getElementById('cp-scene').classList.contains('is-oops') }));
        if (miss.time >= beforeMiss || !miss.oops) fail(`失误反馈未生效: ${JSON.stringify({ beforeMiss, miss })}`);

        let attempts = 0;
        while (attempts < 48) {
            const state = await page.evaluate(() => ({ mode: window.cpGame.state.mode, pulls: window.cpGame.state.pulls, needed: window.cpGame.state.needed }));
            if (state.mode === 'over') break;
            await page.evaluate(() => { window.cpGame.state.needle = window.cpGame.state.target; });
            await page.click('#cp-pull-btn');
            attempts += 1;
            await wait(15);
        }
        await wait(950);
        const result = await page.evaluate(() => ({
            mode: window.cpGame.state.mode,
            won: window.cpGame.state.won,
            resultVisible: !document.getElementById('cp-result').hidden,
            storedBest: Number.parseInt(localStorage.getItem('cp_best_score') || '0', 10),
            round: window.cpGame.state.round,
        }));
        if (result.mode !== 'over' || !result.won || !result.resultVisible || result.round !== 6 || result.storedBest <= 0) {
            fail(`连续命中未完成结算: ${JSON.stringify(result)}`);
        }

        for (const viewport of [[390, 844], [430, 932], [844, 390], [1440, 900]]) {
            await page.setViewport({ width: viewport[0], height: viewport[1] });
            await page.reload({ waitUntil: 'networkidle0', timeout: 45000 });
            await page.waitForFunction(() => window.cpGame && ['ready', 'fallback'].includes(document.getElementById('cp-stage')?.dataset.artState), { timeout: 15000 });
            const layout = await page.evaluate(() => {
                const stage = document.getElementById('cp-stage')?.getBoundingClientRect();
                return {
                    viewport: window.innerWidth,
                    bodyWidth: document.body.scrollWidth,
                    stageWidth: stage?.width || 0,
                    stageHeight: stage?.height || 0,
                };
            });
            if (layout.bodyWidth > viewport[0] + 1 || layout.stageWidth <= 0 || layout.stageHeight <= 0) {
                fail(`响应式布局异常 ${viewport.join('×')}: ${JSON.stringify(layout)}`);
            }
        }
    } catch (error) {
        fail(`正常路径脚本异常: ${error.message}`);
    } finally {
        for (const message of diagnostics?.pageErrors || []) if (!isIgnorable(message)) fail(`页面错误: ${message}`);
        for (const message of diagnostics?.consoleErrors || []) if (!isIgnorable(message)) fail(`console 错误: ${message}`);
        await browser.close();
    }
}

async function assertFallbackPage() {
    const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    let diagnostics;
    try {
        diagnostics = await setupPage(page, { blockArt: true });
        const fallback = await page.evaluate(() => ({
            artState: document.getElementById('cp-stage')?.dataset.artState,
            fallbackVisible: getComputedStyle(document.getElementById('cp-fallback-scene')).visibility !== 'hidden',
            hasGame: !!window.cpGame,
        }));
        if (fallback.artState !== 'fallback' || !fallback.fallbackVisible || !fallback.hasGame) {
            fail(`资源失败时 fallback 未接管: ${JSON.stringify(fallback)}`);
        }
        await page.click('#cp-start-btn');
        await page.evaluate(() => { window.cpGame.state.needle = window.cpGame.state.target; });
        await page.click('#cp-pull-btn');
        const playable = await page.evaluate(() => ({ mode: window.cpGame.state.mode, pulls: window.cpGame.state.pulls }));
        if (playable.mode !== 'playing' || playable.pulls !== 1) fail(`fallback 场景不可交互: ${JSON.stringify(playable)}`);
    } catch (error) {
        fail(`fallback 路径脚本异常: ${error.message}`);
    } finally {
        for (const message of diagnostics?.pageErrors || []) if (!isIgnorable(message)) fail(`fallback 页面错误: ${message}`);
        for (const message of diagnostics?.consoleErrors || []) if (!isIgnorable(message)) fail(`fallback console 错误: ${message}`);
        await browser.close();
    }
}

await assertNormalPage();
await assertFallbackPage();
if (fails.length) {
    console.error('✗ smoke-carrot-pull');
    fails.forEach(message => console.error(`  - ${message}`));
    process.exit(1);
}
console.log('smoke-carrot-pull：production 资源 / 真实命中 / 失误 / 通关 / 响应式 / fallback 全部通过 ✅');
