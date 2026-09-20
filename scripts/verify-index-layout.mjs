#!/usr/bin/env node
// verify-index-layout.mjs — 首页三块（daily-hub / games-section / perks）横向居中回归。
//
// 背景：`.daily-hub` 曾经左右 margin 对称但宽度受限，在 `.idx-main`（普通块容器，
// 不像 body 那样 flex 居中）里被顶到**左边缘**。肉眼在宽屏上很扎眼，但所有既有
// 校验器都测不到 —— 它们量的是游戏页的画布/侧栏/热区，没人量落地页的居中度。
//
// 判据：skew = 左间隙 − 右间隙，|skew| ≤ 2px 视为居中。五档视口全覆盖。
// 用法：node scripts/verify-index-layout.mjs [baseUrl]（需静态服务器）
import puppeteer from 'puppeteer-core';
import { CHROME_PATH } from './lib/browser.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:8911';
const CHROME = process.env.CHROME_BIN || CHROME_PATH;

const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox'],
});

const VIEWPORTS = [
    { w: 1440, h: 900, label: 'desktop-1440' },
    { w: 1024, h: 800, label: 'tablet-1024' },
    { w: 768, h: 900, label: 'mobile-768' },
    { w: 390, h: 844, label: 'phone-390' },
    { w: 320, h: 568, label: 'phone-320' },
];

let failed = 0;
const page = await browser.newPage();

for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.w, height: vp.h });
    await page.goto(BASE + '/index.html', { waitUntil: 'networkidle2' });

    const m = await page.evaluate(() => {
        const pick = sel => {
            const el = document.querySelector(sel);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return {
                left: Math.round(r.left),
                right: Math.round(r.right),
                width: Math.round(r.width),
                // 左间隙 与 右间隙 的差值：0 = 完美居中
                skew: Math.round(r.left - (document.documentElement.clientWidth - r.right)),
            };
        };
        return {
            vw: document.documentElement.clientWidth,
            hub: pick('.daily-hub'),
            games: pick('.games-section'),
            perks: pick('.perks'),
            cards: document.querySelectorAll('.game-card').length,
            lumen: !!document.getElementById('lumen-name'),
            circuit: !!document.getElementById('circuit-name'),
        };
    });

    const bad = [];
    for (const [k, v] of Object.entries(m)) {
        if (!v || typeof v !== 'object') continue;
        if (Math.abs(v.skew) > 2) bad.push(`${k} skew=${v.skew}`);
    }
    if (bad.length) failed++;
    const mark = bad.length ? '✗' : '✓';
    console.log(`${mark} ${vp.label.padEnd(14)} vw=${m.vw}  cards=${m.cards}  lumen=${m.lumen} circuit=${m.circuit}`);
    for (const k of ['hub', 'games', 'perks']) {
        const v = m[k];
        if (v) console.log(`     ${k.padEnd(6)} w=${String(v.width).padStart(4)} left=${String(v.left).padStart(4)} right=${String(v.right).padStart(4)} skew=${v.skew}`);
    }
    if (bad.length) console.log(`     ↳ 未居中: ${bad.join(', ')}`);
}

await browser.close();
console.log(failed === 0 ? '\n首页三块均居中 ✅' : `\n${failed} 个视口未居中 ❌`);
process.exit(failed === 0 ? 0 : 1);
