#!/usr/bin/env node
/**
 * smoke-index — index.html 落地页运行时冒烟（P4-1 内联抽离后的回归防线）。
 * 用法：node scripts/smoke-index.mjs [http://127.0.0.1:PORT]
 * 断言：module 脚本执行（i18n 注入）、daily hub 更新、卡片渲染、语言切换、CSS 生效、无页面错误。
 * 语言态必须显式 setItem('site_lang')（headless 默认 en-US，见 verify 教训）。
 */
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';

const BASE = process.argv.find(a => a.startsWith('http')) || 'http://127.0.0.1:8899';
const fails = [];
const fail = msg => fails.push(msg);

const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_BIN || CHROME_PATH,
    headless: 'new',
    args: LAUNCH_ARGS,
});

async function loadPage(lang) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message || e).split('\n')[0]));
    await page.evaluateOnNewDocument(l => {
        try { localStorage.setItem('site_lang', l); } catch (e) { /* ignore */ }
    }, lang);
    await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle0', timeout: 30000 });
    return { page, errs };
}

// ── zh ──
{
    const { page, errs } = await loadPage('zh');
    const snap = await page.evaluate(() => ({
        title: document.getElementById('main-title')?.textContent || '',
        cards: document.querySelectorAll('.game-card').length,
        hubTitle: document.getElementById('hub-title')?.textContent || '',
        hubWord: document.getElementById('hub-task-word-name')?.textContent || '',
        langBtn: !!document.getElementById('lang-toggle'),
        bodyBg: getComputedStyle(document.body).backgroundColor,
        badges: document.querySelectorAll('.card-badge--daily, .card-badge--new').length,
    }));

    if (errs.length) fail(`zh 页面错误: ${errs.join(' | ')}`);
    if (snap.title !== '单页游戏合集') fail(`zh i18n 注入未生效: main-title="${snap.title}"`);
    if (snap.cards < 13) fail(`zh 游戏卡片不足: ${snap.cards} < 13`);
    if (!snap.hubTitle) fail('zh daily hub 标题为空（updateDailyHub 未跑？）');
    if (!snap.hubWord) fail('zh daily task 名称为空');
    if (!snap.langBtn) fail('zh 缺 #lang-toggle');
    if (snap.bodyBg === 'rgba(0, 0, 0, 0)' || snap.bodyBg === 'rgb(255, 255, 255)') {
        fail(`zh CSS 疑似未生效: body 背景=${snap.bodyBg}`);
    }

    // 语言切换交互：zh → en
    if (snap.langBtn) {
        await page.evaluate(() => document.getElementById('lang-toggle').click());
        await new Promise(r => setTimeout(r, 200));
        const titleEn = await page.evaluate(() => document.getElementById('main-title')?.textContent || '');
        if (titleEn !== 'Mini Games Collection') fail(`语言切换未生效: main-title="${titleEn}"`);
    }
    await page.close();
}

// ── en ──
{
    const { page, errs } = await loadPage('en');
    const snap = await page.evaluate(() => ({
        title: document.getElementById('main-title')?.textContent || '',
        hubWordStatus: document.getElementById('hub-task-word-status')?.textContent || '',
        badges: [...document.querySelectorAll('.card-badge--daily, .card-badge--new')].map(el => el.textContent),
    }));
    if (errs.length) fail(`en 页面错误: ${errs.join(' | ')}`);
    if (snap.title !== 'Mini Games Collection') fail(`en i18n 注入未生效: main-title="${snap.title}"`);
    if (snap.badges.includes('')) fail('en 卡片徽章有空白（card-badge 注入缺失）');
    await page.close();
}

await browser.close();

if (fails.length) {
    console.error('✗ smoke-index');
    for (const f of fails) console.error(`  - ${f}`);
    process.exit(1);
}
console.log('smoke-index：i18n 注入 / daily hub / 卡片 / 语言切换 / CSS 全部通过 ✅');
