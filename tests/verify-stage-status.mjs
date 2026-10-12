// 局内状态归舞台：顶栏只留游戏名，回合 / 分数 / 关卡 / 进度挂在舞台顶部（css/stage-status.css）。
// 用法：node tests/lib/serve-static.mjs 8899 &  然后  node tests/verify-stage-status.mjs http://127.0.0.1:8899
//
// 背景（2026-10-12 用户反馈）：拔萝卜等页把局内状态排在顶栏游戏名下方 —— 手机上顶栏被撑成两行、
// 状态字号压到 9–11px，离玩家正在看的画面最远。改成画牢那样：顶栏单行只放名字和按钮，状态浮在舞台顶部。
// 逐页 × 手机 / 桌面 × 中 / 英，进入真实对局后断言：
//   ① 状态元素在 .game-stage 里、不在顶栏里；顶栏中槽只剩游戏名（只按当前语言显示一种）
//   ② 顶栏是单行（高度不超过一排图标按钮）
//   ③ 状态贴舞台顶边、完整落在舞台内，与舞台里原有的局内 HUD 不重叠
//   ④ 状态文案是当前玩法的（御剑飞行的模式徽章跟随模式；针尖对麦芒进入对局后不再显示菜单态标签）
// 对修改前的版本，①②③ 在四页上都会失败。
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:8899';
const VIEWPORTS = [
    { label: '390', width: 390, height: 664, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    { label: '1280', width: 1280, height: 800, deviceScaleFactor: 1 },
];

// status: 移进舞台的状态元素；hud: 舞台里原有、不得与状态重叠的局内 HUD；
// name: 顶栏中槽里应当剩下的游戏名；start: 进入对局的点击序列；playing: 对局就绪条件。
const PAGES = [
    {
        id: 'carrot-pull',
        status: ['#cp-hud-row'],
        hud: [],
        name: { zh: '拔萝卜', en: 'Carrot Pull' },
        start: ['#cp-start-btn'],
        playing: () => document.getElementById('cp-start').hidden,
    },
    {
        id: 'needle-awn',
        status: ['#na-stage-status'],
        hud: ['#na-lives-wrap', '#na-stance-chip', '#na-ult-bar-wrap'],
        name: { zh: '针尖对麦芒', en: 'Pinpoint Clash' },
        start: ['#na-btn-levels', '#na-level-grid .unlocked'],
        playing: () => document.getElementById('na-overlay-start').classList.contains('hidden'),
        label: async page => {
            const text = await page.$eval('#na-stage-label', el => el.textContent.trim());
            const brand = await page.$eval('#na-brand', el => el.textContent.trim());
            return [text !== brand, '对局中的关卡标签不是菜单态的游戏名', text];
        },
    },
    {
        id: 'sword-flight',
        status: ['#sf-stage-status'],
        hud: ['#sf-lives-wrap', '#sf-realm-chip', '#sf-progress-wrap'],
        name: { zh: '御剑飞行', en: 'Sword Flight' },
        start: ['#sf-btn-endless'],
        playing: () => !document.getElementById('sf-in-hud').classList.contains('hidden'),
        label: async (page, lang) => {
            const text = await page.$eval('#sf-mode-badge', el => el.textContent.trim());
            const want = lang === 'zh' ? '万里长空' : 'Endless Sky';
            return [text === want, '模式徽章跟随当前玩法（无尽）', text];
        },
    },
    {
        id: 'shadow-loom',
        status: ['#sl-progress'],
        hud: [],
        name: { zh: '影织', en: 'Shadow Loom' },
        start: ['#sl-level-grid .sl-chip'],
        playing: () => window.slGame?.state === 'playing',
    },
].filter(p => keepPage(p.id));
exitIfNoPages(PAGES, 'verify-stage-status');

const fails = [];
let passes = 0;
const check = (ok, label, detail = '') => {
    if (ok) passes++;
    else fails.push(label + (detail !== '' ? ' — ' + detail : ''));
    if (!ok) console.log(`  ✗ ${label}${detail !== '' ? '  (' + detail + ')' : ''}`);
};

const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });

for (const spec of PAGES) {
    for (const vp of VIEWPORTS) {
        for (const lang of ['zh', 'en']) {
            const tag = `${spec.id} @${vp.label} ${lang}`;
            const page = await browser.newPage();
            const errs = [];
            page.on('pageerror', e => errs.push(String(e.message || e).split('\n')[0]));
            await page.setViewport(vp);
            await page.setBypassServiceWorker(true);
            await page.setRequestInterception(true);
            page.on('request', req => (/workers\.dev/.test(req.url())
                ? req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '[]' })
                : req.continue()));
            await page.evaluateOnNewDocument(l => {
                try { localStorage.setItem('site_lang', l); localStorage.setItem('site_muted', '1'); } catch { /* private mode */ }
            }, lang);
            await page.goto(`${BASE}/${spec.id}.html`, { waitUntil: 'load' });
            let started = true;
            for (const sel of spec.start) {
                try {
                    await page.waitForSelector(sel + ':not([disabled])', { visible: true, timeout: 10000 });
                    await page.click(sel);
                } catch {
                    started = false;
                }
            }
            started = started && await page.waitForFunction(spec.playing, { timeout: 10000 }).then(() => true, () => false);
            check(started, `${tag}: 进入对局`);
            if (!started) { await page.close(); continue; }
            // 进入对局后等两帧，让 HUD / 标签刷新完
            await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

            const snap = await page.evaluate(({ status, hud }) => {
                const rect = el => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
                const topbar = document.querySelector('.game-topbar');
                const center = topbar.querySelector('.game-topbar-center');
                const stage = document.querySelector('.game-stage');
                const visibleText = el => [...el.querySelectorAll('*')].filter(n => n.children.length === 0
                    && getComputedStyle(n).display !== 'none' && n.getClientRects().length)
                    .map(n => n.textContent.trim()).filter(Boolean);
                const icon = topbar.querySelector('.game-icon-btn');
                return {
                    topbar: rect(topbar),
                    iconH: icon ? icon.getBoundingClientRect().height : 44,
                    centerText: visibleText(center),
                    stage: rect(stage),
                    status: status.map(sel => {
                        const el = document.querySelector(sel);
                        return el && {
                            sel,
                            inStage: stage.contains(el),
                            inTopbar: topbar.contains(el),
                            rect: rect(el),
                            shown: getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && el.getClientRects().length > 0,
                        };
                    }),
                    hud: hud.map(sel => {
                        const el = document.querySelector(sel);
                        return el && el.getClientRects().length ? { sel, rect: rect(el) } : null;
                    }).filter(Boolean),
                };
            }, { status: spec.status, hud: spec.hud });

            // ① 位置与顶栏内容
            for (const s of snap.status) {
                check(!!s, `${tag}: 状态元素存在`);
                if (!s) continue;
                check(s.inStage && !s.inTopbar, `${tag}: ${s.sel} 在舞台里而不在顶栏里`);
                check(s.shown, `${tag}: ${s.sel} 对局中可见`);
            }
            const name = spec.name[lang];
            check(snap.centerText.length === 1 && snap.centerText[0].replace(/\s+/g, '') === name.replace(/\s+/g, ''),
                `${tag}: 顶栏中槽只剩当前语言的游戏名`, JSON.stringify(snap.centerText));
            // ② 单行顶栏：不高于一排图标按钮 + 上下内边距
            check(snap.topbar.h <= snap.iconH + 20, `${tag}: 顶栏单行`, `${Math.round(snap.topbar.h)}px`);
            // ③ 贴舞台顶边、完整在舞台内、不压原有 HUD
            for (const s of snap.status.filter(Boolean)) {
                const r = s.rect;
                const inside = r.l >= snap.stage.l - 1 && r.r <= snap.stage.r + 1 && r.t >= snap.stage.t - 1 && r.b <= snap.stage.b + 1;
                check(inside, `${tag}: ${s.sel} 完整落在舞台内`, JSON.stringify(r));
                check(r.t - snap.stage.t <= 24, `${tag}: ${s.sel} 贴舞台顶边`, `${Math.round(r.t - snap.stage.t)}px`);
                for (const h of snap.hud) {
                    const overlap = !(r.r <= h.rect.l || h.rect.r <= r.l || r.b <= h.rect.t || h.rect.b <= r.t);
                    check(!overlap, `${tag}: ${s.sel} 不压 ${h.sel}`, JSON.stringify({ status: r, hud: h.rect }));
                }
            }
            // ④ 文案跟随当前玩法
            if (spec.label) {
                const [ok, label, detail] = await spec.label(page, lang).catch(e => [false, '状态文案可读', e.message]);
                check(ok, `${tag}: ${label}`, detail);
            }
            check(errs.length === 0, `${tag}: 无 pageerror`, errs.join(' | '));
            await page.close();
            console.log(`  · ${tag}`);
        }
    }
}

await browser.close();
if (fails.length) {
    console.log(`\n✗ verify-stage-status：${fails.length} 项失败 / ${passes} 项通过`);
    process.exit(1);
}
console.log(`\n✓ verify-stage-status 全部通过（${passes} 项断言，${PAGES.length} 页 × ${VIEWPORTS.length} 视口 × 2 语言）`);
