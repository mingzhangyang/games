#!/usr/bin/env node
// verify-start-menus.mjs — 手机 / 平板上的开始菜单必须完整可达（docs/contracts/layout.md「开始菜单」）
//
// 事故（2026-09-26）：舞台内浮层是 absolute + inset:0 + 隐藏滚动条，高度被画布卡死。手机上画布只有
// 280–500px 高，关卡网格被压进一个看不出能滚的小盒子 —— 晶绽 / 涟漪 / 焰语只露出 10/20 个关卡，
// 电路谜题一个都看不到。几何检查器全绿，因为菜单「在舞台里」。
//
// 断言（390×844、768×1024，全部注册表页面）：
//   ① 覆盖：加载时可见、且被困在舞台里（非视口级全屏）的 .game-overlay 不得内部溢出 ——
//      溢出的必须加 .game-overlay--menu（新游戏漏加 → 红）
//   ② 可达：带 .game-overlay--menu 的菜单里，每个可见按钮都能滚到视口里、并且中心点命中它自己
//      （elementFromPoint —— 被盖住 / 被裁掉都算失败）；菜单不被 overflow≠visible 的舞台截断
//   视口含横屏手机 844×390（Copilot 在 PR #15 指出：na 的横屏规则给舞台定了高度 + overflow:hidden）
//   ③ 无 pageerror
//
// 用法：node scripts/verify-start-menus.mjs [baseUrl]（verify-all 自动传入）
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { registry } from './lib/registry.mjs';

const BASE = process.argv.slice(2).find(a => a.startsWith('http')) || 'http://127.0.0.1:8899';
const VIEWPORTS = [[390, 844], [768, 1024], [844, 390]];   // 含横屏手机：na 的横屏规则给舞台定了高度

const fails = [];
let passes = 0;
const check = (cond, label, extra = '') => { if (cond) passes++; else fails.push(`${label}${extra ? ' —— ' + extra : ''}`); };

const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });

for (const g of registry.all()) {
    for (const [w, h] of VIEWPORTS) {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.setViewport({ width: w, height: h });
        await page.goto(`${BASE}/${g.href}`, { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 400));

        // ① 覆盖
        const overlays = await page.evaluate(() => [...document.querySelectorAll('.game-overlay')]
            .filter(e => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0)
            .map(e => ({
                id: e.id || e.className.split(' ')[0],
                menu: e.classList.contains('game-overlay--menu'),
                // 视口级全屏浮层（td 的开始页）本来就占满屏幕，内部滚动是它的设计
                fullscreen: e.clientHeight >= innerHeight - 1,
                h: e.clientHeight,
                sh: e.scrollHeight,
            })));
        for (const o of overlays) {
            if (o.fullscreen) continue;
            check(o.sh <= o.h + 2, `${g.id}@${w}：#${o.id} 不内部溢出${o.menu ? '' : '（溢出就加 .game-overlay--menu）'}`, `h=${o.h} scrollH=${o.sh}`);
        }

        // ② 可达：菜单里**所有**可见按钮（不只数字关卡 —— na 的模式按钮也曾被裁）都能滚到并点中；
        //    菜单也不能被裁剪型舞台（overflow ≠ visible）截断
        for (const o of overlays.filter(x => x.menu)) {
            const clip = await page.evaluate((id) => {
                const m = document.getElementById(id);
                const st = m.parentElement;
                const clips = getComputedStyle(st).overflowY !== 'visible' || getComputedStyle(st).overflowX !== 'visible';
                return { clips, menuBottom: Math.round(m.getBoundingClientRect().bottom), stageBottom: Math.round(st.getBoundingClientRect().bottom) };
            }, o.id);
            check(!clip.clips || clip.menuBottom <= clip.stageBottom + 1, `${g.id}@${w}：#${o.id} 没被舞台裁掉`, JSON.stringify(clip));
            const n = await page.evaluate(id => [...document.getElementById(id).querySelectorAll('button')]
                .filter(e => e.offsetParent).length, o.id);
            let reachable = 0;
            const missed = [];
            for (let i = 0; i < n; i++) {
                const r = await page.evaluate((id, i) => {
                    const e = [...document.getElementById(id).querySelectorAll('button')].filter(b => b.offsetParent)[i];
                    e.scrollIntoView({ block: 'center' });
                    const rc = e.getBoundingClientRect();
                    const hit = document.elementFromPoint(rc.left + rc.width / 2, rc.top + rc.height / 2);
                    return { ok: !!hit && (hit === e || e.contains(hit)), name: e.id || e.textContent.trim().slice(0, 10) };
                }, o.id, i);
                if (r.ok) reachable++; else missed.push(r.name);
            }
            check(reachable === n, `${g.id}@${w}：#${o.id} 的按钮全部可点`, `${reachable}/${n} 点不到：${missed.join(', ')}`);
        }
        check(errors.length === 0, `${g.id}@${w}：无 pageerror`, errors.join(' | '));
        await page.close();
    }
}
await browser.close();

if (fails.length) {
    console.error(fails.map(f => `✗ ${f}`).join('\n'));
    console.error(`\nverify-start-menus：${fails.length} 项失败（${passes} 项通过）❌`);
    process.exit(1);
}
console.log(`verify-start-menus 全部通过 ✅（${passes} 项断言，${registry.all().length} 页 × ${VIEWPORTS.length} 视口）`);
