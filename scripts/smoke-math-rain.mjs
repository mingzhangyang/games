#!/usr/bin/env node
/**
 * smoke-math-rain — math-rain 页运行时冒烟（P4-3 最小对齐的回归防线）。
 * 断言：bootstrap 成功（languageManager 初始化）、main 语义、布局未被子契约破坏、无页面错误。
 * 语言态显式 setItem('site_lang')（headless 默认 en-US 教训）。
 */
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';

const BASE = process.argv.find(a => a.startsWith('http')) || 'http://127.0.0.1:8897';
const fails = [];
const fail = m => fails.push(m);

const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_BIN || CHROME_PATH,
    headless: 'new',
    args: LAUNCH_ARGS,
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
const errs = [];
const consoleErrors = [];
page.on('pageerror', e => errs.push(String(e.message || e).split('\n')[0]));
page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().split('\n')[0]);
});
await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem('site_lang', 'zh'); } catch (e) { /* ignore */ }
});
await page.goto(`${BASE}/math-rain.html`, { waitUntil: 'networkidle0', timeout: 45000 });
// P1：main.js 静态直连依赖后初始化时序略有变化——轮询等待核心组件就位（上限 8s），
// 不再用固定 sleep（固定 1200ms 在慢机上会假红）
{
    const deadline = Date.now() + 8000;
    let ready = false;
    while (Date.now() < deadline) {
        ready = await page.evaluate(() =>
            !!window.mathRainGame?.gameStateManager && !!window.mathRainGame?.uiController
        );
        if (ready) break;
        await new Promise((r) => setTimeout(r, 100));
    }
    if (!ready) console.error('[smoke] 8s 内核心组件未就位，按当前状态断言');
}

const snap = await page.evaluate(() => {
    const gc = document.getElementById('game-container');
    const r = gc ? gc.getBoundingClientRect() : null;
    return {
        mainTag: !!document.querySelector('main.mr-main'),
        h1: document.getElementById('game-title')?.textContent || '',
        containerSize: r ? `${Math.round(r.width)}x${Math.round(r.height)}` : 'missing',
        languageManager: typeof window.languageManager?.selectLanguage === 'function',
        shopManager: !!window.shopManager,
        // P1 加固：main.js 初始化失败会被自身 catch 吞成 console.error（不触发 pageerror），
        // 必须显式断言游戏实例与核心组件就位，否则 smoke 假绿
        gameInstance: !!window.mathRainGame,
        gameStateReady: !!window.mathRainGame?.gameStateManager && !!window.mathRainGame?.uiController,
        tokensApplied: getComputedStyle(document.documentElement).getPropertyValue('--tok-bg').trim() !== '',
        bodyOverflowHidden: getComputedStyle(document.body).overflow === 'hidden',
    };
});

// bootstrap 失败会走 console.error('Failed to bootstrap Math Rain:', ...)
// main.js 初始化失败会走 console.error('❌ Math Rain - Initialization failed:', ...)
const bootFail = consoleErrors.find(t => t.includes('Failed to bootstrap Math Rain'));
if (bootFail) fail(`bootstrap 失败: ${bootFail}`);
if (consoleErrors.some(t => t.includes('Initialization failed'))) fail('main.js 初始化失败（见控制台错误）');
if (errs.length) fail(`页面错误: ${errs.join(' | ')}`);
if (!snap.mainTag) fail('缺 <main class="mr-main">');
if (!snap.h1) fail('缺 #game-title h1');
if (snap.containerSize === 'missing') fail('缺 #game-container');
else {
    const [w, h] = snap.containerSize.split('x').map(Number);
    if (w < 300 || h < 300) fail(`game-container 尺寸异常（布局被契约 CSS 破坏？）: ${snap.containerSize}`);
}
if (!snap.languageManager) fail('languageManager 未初始化（bootstrap 未完成）');
if (!snap.shopManager) fail('shopManager 未初始化');
if (!snap.gameInstance) fail('mathRainGame 实例未创建（main.js 初始化链中断）');
if (!snap.gameStateReady) fail('GameStateManager/UIController 未就位');
if (!snap.tokensApplied) fail('tokens.css 变量未生效');
if (!snap.bodyOverflowHidden) fail('body overflow:hidden 被破坏（游戏页需满屏）');

await browser.close();
if (fails.length) {
    console.error('✗ smoke-math-rain');
    for (const f of fails) console.error(`  - ${f}`);
    process.exit(1);
}
console.log('smoke-math-rain：bootstrap / main 语义 / 布局完整全部通过 ✅');
