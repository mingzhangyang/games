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
// 对修改前的版本，①②③ 在各页上都会失败。
// 2026-10-21 收尾第 2 步 A 批：关卡计数十页（bf/cc/cb/ec/fv/gd/lm/md/rd/sd）的「关卡号 + 计数」一行随流排在画布上方，
// 另断言它整体落在画布上方（不浮在铺满画布的棋盘上）。
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:8899';
const VIEWPORTS = [
    { label: '390', width: 390, height: 664, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    { label: '1280', width: 1280, height: 800, deviceScaleFactor: 1 },
];

// status: 移进舞台的状态元素；hud: 舞台里原有、不得与状态重叠的局内 HUD；
// name: 顶栏中槽里应当剩下的游戏名；start: 进入对局的点击序列；playing: 对局就绪条件；
// above: 状态必须整体落在它上方的元素（关卡计数页的画布：状态行随流排在画布上方，不得盖住棋盘第一行）。
// 关卡计数十页结构相同：「关卡」按钮直接进入第一个未完成关卡，开始层收起即对局就绪。
const levelCounter = (id, prefix, name) => ({
    id,
    status: [`#${prefix}-stage-status`],
    hud: [],
    above: `#${prefix}-canvas`,
    name,
    start: [`#${prefix}-btn-levels`],
    // waitForFunction 也接受表达式字符串：在页面里求值，免得为每页各写一个闭包
    playing: `document.getElementById('${prefix}-start').classList.contains('hidden')`,
});

const PAGES = [
    {
        id: 'magnetic-garden',
        status: ['#mg-hud'],
        hud: [],
        name: { zh: '磁极花园', en: 'Magnetic Garden' },
        start: ['#mg-btn-start'],
        playing: () => window.mgGame?.state === 'playing',
    },
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
    levelCounter('bond-forge', 'bf', { zh: '键合工坊', en: 'Bond Forge' }),
    levelCounter('circuit', 'cc', { zh: '电路谜题', en: 'Circuit' }),
    levelCounter('crystal-bloom', 'cb', { zh: '晶绽', en: 'Crystal Bloom' }),
    levelCounter('echo-cave', 'ec', { zh: '回声洞窟', en: 'Echo Cave' }),
    levelCounter('flame-verse', 'fv', { zh: '焰语', en: 'Flame Verse' }),
    levelCounter('gravity-slingshot', 'gd', { zh: '引力弹弓', en: 'Gravity Slingshot' }),
    levelCounter('lumen', 'lm', { zh: '折光', en: 'Lumen' }),
    levelCounter('maxwell-demon', 'md', { zh: '麦克斯韦妖', en: 'Maxwell\'s Demon' }),
    levelCounter('ripple-duet', 'rd', { zh: '涟漪双生', en: 'Ripple Duet' }),
    levelCounter('silk-dew', 'sd', { zh: '垂丝引露', en: 'Silkfall' }),
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

            const snap = await page.evaluate(({ status, hud, above }) => {
                const rect = el => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
                const topbar = document.querySelector('.game-topbar');
                const center = topbar.querySelector('.game-topbar-center');
                const stage = document.querySelector('.game-stage');
                const visibleText = el => [...el.querySelectorAll('*')].filter(n => n.children.length === 0
                    && getComputedStyle(n).display !== 'none' && n.getClientRects().length
                    && n.getBoundingClientRect().width > 1 && n.getBoundingClientRect().height > 1)
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
                    above: above && document.querySelector(above) ? rect(document.querySelector(above)) : null,
                };
            }, { status: spec.status, hud: spec.hud, above: spec.above || null });

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
                if (spec.above) {
                    check(!!snap.above, `${tag}: ${spec.above} 存在`);
                    if (snap.above) check(r.b <= snap.above.t + 1, `${tag}: ${s.sel} 整体在 ${spec.above} 上方、不压画面`, `${Math.round(r.b)} > ${Math.round(snap.above.t)}`);
                }
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
