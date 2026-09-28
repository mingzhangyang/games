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
    executablePath: CHROME_PATH,
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

async function getBadgeSnapshot(page) {
    return page.evaluate(() => [...document.querySelectorAll('.card-badge')].map(el => {
        const title = el.closest('.game-card')?.querySelector('.card-title');
        const badgeRect = el.getBoundingClientRect();
        const titleRect = title?.getBoundingClientRect();
        const intersectsTitle = Boolean(titleRect
            && titleRect.left < badgeRect.right
            && titleRect.right > badgeRect.left
            && titleRect.top < badgeRect.bottom
            && titleRect.bottom > badgeRect.top);
        return {
            text: el.textContent.trim(),
            tooltip: el.getAttribute('data-tooltip') || '',
            title: el.getAttribute('title') || '',
            aria: el.getAttribute('aria-label') || '',
            icon: Boolean(el.querySelector('svg')),
            intersectsTitle,
        };
    }));
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
    const badgeDetails = await getBadgeSnapshot(page);

    if (errs.length) fail(`zh 页面错误: ${errs.join(' | ')}`);
    if (snap.title !== '单页游戏合集') fail(`zh i18n 注入未生效: main-title="${snap.title}"`);
    if (snap.cards < 13) fail(`zh 游戏卡片不足: ${snap.cards} < 13`);
    if (!snap.hubTitle) fail('zh daily hub 标题为空（updateDailyHub 未跑？）');
    if (!snap.hubWord) fail('zh daily task 名称为空');
    if (!snap.langBtn) fail('zh 缺 #lang-toggle');
    if (snap.bodyBg === 'rgba(0, 0, 0, 0)' || snap.bodyBg === 'rgb(255, 255, 255)') {
        fail(`zh CSS 疑似未生效: body 背景=${snap.bodyBg}`);
    }
    if (snap.badges < 1) fail('zh 首页没有状态书签');
    if (badgeDetails.some(b => b.text || !b.icon || !b.tooltip || b.tooltip !== b.title || b.tooltip !== b.aria)) {
        fail('zh 状态书签缺图标或 tooltip / aria-label 不一致');
    }
    if (badgeDetails.some(b => b.intersectsTitle)) fail('zh 状态书签仍与游戏标题重叠');
    if (!badgeDetails.some(b => b.tooltip === '今日挑战') || !badgeDetails.some(b => b.tooltip === '新上线')) {
        fail('zh 状态书签没有完成双语文案注入');
    }

    // 语言切换交互：zh → en
    if (snap.langBtn) {
        await page.evaluate(() => document.getElementById('lang-toggle').click());
        await new Promise(r => setTimeout(r, 200));
        const titleEn = await page.evaluate(() => document.getElementById('main-title')?.textContent || '');
        if (titleEn !== 'Mini Games Collection') fail(`语言切换未生效: main-title="${titleEn}"`);
        const switchedBadges = await getBadgeSnapshot(page);
        if (!switchedBadges.some(b => b.tooltip === 'Daily') || !switchedBadges.some(b => b.tooltip === 'New')) {
            fail('zh → en 后状态书签 tooltip 未切换回英文');
        }
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
    const badgeDetails = await getBadgeSnapshot(page);
    if (errs.length) fail(`en 页面错误: ${errs.join(' | ')}`);
    if (snap.title !== 'Mini Games Collection') fail(`en i18n 注入未生效: main-title="${snap.title}"`);
    if (snap.badges.some(text => text !== '')) fail('en 状态书签仍包含可见文字');
    if (badgeDetails.some(b => !b.icon || !b.tooltip || b.tooltip !== b.title || b.tooltip !== b.aria || b.intersectsTitle)) {
        fail('en 状态书签图标、tooltip、无障碍文案或标题避让异常');
    }
    await page.setViewport({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
    const narrowBadges = await getBadgeSnapshot(page);
    if (narrowBadges.some(b => b.intersectsTitle)) fail('390px 首页状态书签仍与游戏标题重叠');
    await page.close();
}

await browser.close();

if (fails.length) {
    console.error('✗ smoke-index');
    for (const f of fails) console.error(`  - ${f}`);
    process.exit(1);
}
console.log('smoke-index：i18n 注入 / daily hub / 卡片 / 语言切换 / CSS 全部通过 ✅');
