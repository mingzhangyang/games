// 顶栏/页脚槽位契约校验：node scripts/verify-chrome.mjs [baseUrl] [--shots <dir>]
//
// 断言（每页 × 移动 390 / 桌面 1280 × zh / en）：
//   ① 顶栏三槽位齐全；右簇通用钮顺序 = stats → pause → sound
//   ② home / sound / more / pause 的 title 与 aria-label 非空，且随语言变化
//   ③ 页脚在 390 宽下**可见**（此前 ≤480px 被 display:none，等于没有页脚），hint 非空
//   ④ 游戏页**不得**出现语言钮（2026-09-21 语言切换 UI 收敛到首页 index.html；
//      历史上的「点一次语言钮 UI 必须换语言」断言随 UI 一起移除）
//   ⑤ 点一次静音钮，site_muted 真的翻转（挡住"页面与 chrome 各挂一个 handler
//      导致一次点击切换两次 = 净效果为零"这个最隐蔽的回归）
//   ⑥ 页脚「更多游戏」展开后 aria-expanded=true、列表非空、不含指向本页的自链接
//   ⑦ 整轮无 pageerror
//   ⑧ 点一次**顶栏**首页钮，必须真的导航回 index.html。顶栏 home 多为无 href 的
//      <button>，跳转完全依赖 chrome（owns 含 'home'）或页面自绑 —— §② 只查标签，
//      查不出「按钮是死的」。bond-forge / silk-dew 曾双双中招（footer 的 <a> 天然
//      可用，所以用户只见顶栏坏）。每页只测一次、且是本轮最后一个操作（会真的离开页面）。
//
// ⚠️ 语言存储键是 site_lang（js/site-settings.js 的 LANG_KEY），不是 'lang'。
//    游戏页只读不写：语言切换入口只在首页，boot 时的 site_lang 决定本页初始语言。
import puppeteer from 'puppeteer-core';
import { CHROME_PATH } from './lib/browser.mjs';
import { registry } from './lib/registry.mjs';

const CHROME = process.env.CHROME_BIN ||
    CHROME_PATH;
const args = process.argv.slice(2);
const BASE = args.find(a => a.startsWith('http')) || 'http://127.0.0.1:8899';

// 顶栏契约页 = 挂了 topbar cap 的游戏（tank-battle / math-rain 化外，见 docs/backlog）
const PAGES = registry.withCap('topbar').map(g => g.id);
const CANON = ['stats', 'pause', 'sound'];

// 共享层（bindChrome / createStatsDrawer）在这些钮上消耗的**公共**键，
// 它们的 zh/en 值全站唯一（js/i18n.js 的 COMMON_TEXT）。
//
// ⚠️ 为什么要按语言断死值，而不是只断「文案非空 / 切换后变了」：
//   这两条早就有（下面 §② 的非空 + §④ 的「变了」），但 silk-dew 曾把
//   `getText` 传成 `(k) => t(k)`（共享层要的是 `() => 整表`），于是共享层读到的
//   整表为空、全部退回内置英文兜底 —— 文案非空 ✅、「切换后变了」也 ✅
//   （因为变的是页面自己的 hint/title），全绿。只有把期望值写死，
//   「该是中文却给了英文」才无处可躲。
const EXPECT_LABEL = {
    zh: { sound: '声音', more: '更多游戏' },
    en: { sound: 'Sound', more: 'More games' },
};

// 语义标签契约的已登记缺口：这三页主体是平铺结构，升级 <main> 需引入新包裹层。
// 见 docs/backlog.md。补一页就从这里删一页 —— 白名单只许缩不许涨。
const MAIN_PENDING = new Set(['gomoku', 'minesweeper', 'reversi']);

const fails = [];
const warns = [];
const knownGaps = new Set();
const homeTested = new Set();   // §⑧ 每页只测一次（与视口/语言无关）
const fail = (p, vp, lang, msg) => fails.push(`${p} @${vp}/${lang}: ${msg}`);
const gap = msg => knownGaps.add(msg);

const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-first-run', '--disable-gpu', '--hide-scrollbars', '--mute-audio'],
});

for (const vp of [{ tag: 'M390', w: 390, h: 844 }, { tag: 'D1280', w: 1280, h: 900 }]) {
    for (const lang of ['zh', 'en']) {
        for (const name of PAGES) {
            const page = await browser.newPage();
            await page.setViewport({ width: vp.w, height: vp.h });
            const errs = [];
            page.on('pageerror', e => errs.push(String(e.message || e).split('\n')[0]));
            await page.evaluateOnNewDocument(l => {
                try {
                    localStorage.setItem('site_lang', l);
                    localStorage.setItem('site_muted', '0');
                } catch (e) { /* 隐私模式 */ }
            }, lang);

            try {
                await page.goto(`${BASE}/${name}.html`, { waitUntil: 'networkidle2', timeout: 25000 });
            } catch {
                fail(name, vp.tag, lang, '页面加载超时');
                await page.close();
                continue;
            }
            await new Promise(r => setTimeout(r, 700));

            if (errs.length) fail(name, vp.tag, lang, `pageerror: ${errs.join(' | ')}`);

            /* ── ①②③⑥ 结构与标签 ── */
            const snap = await page.evaluate(() => {
                const header = document.querySelector('.game-topbar');
                const actions = header && header.querySelector('.game-topbar-group:last-of-type, [class*="topbar-actions"]');
                const roleOf = n => n.getAttribute('data-chrome');
                const label = n => ({
                    role: roleOf(n),
                    title: (n.getAttribute('title') || '').trim(),
                    aria: (n.getAttribute('aria-label') || '').trim(),
                    text: (n.textContent || '').trim(),
                });
                const footer = document.querySelector('.game-footer');
                const hint = document.querySelector('.game-footer .game-footer-hint');
                const vis = el => {
                    if (!el) return false;
                    const cs = getComputedStyle(el);
                    const r = el.getBoundingClientRect();
                    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.height > 0;
                };
                return {
                    hasLead: !!(header && header.querySelector('[class*="topbar-lead"], .game-topbar-group')),
                    hasCenter: !!(header && header.querySelector('.game-topbar-center')),
                    hasActions: !!actions,
                    h1Count: document.querySelectorAll('h1').length,
                    mainCount: document.querySelectorAll('main').length,
                    rightRoles: actions ? Array.from(actions.querySelectorAll('[data-chrome]')).map(roleOf) : [],
                    chrome: Array.from(document.querySelectorAll('[data-chrome]')).map(label),
                    footerVisible: vis(footer),
                    hintText: hint ? (hint.textContent || '').trim() : null,
                    htmlLang: document.documentElement.lang,
                    docTitle: document.title,
                    muted: (() => { try { return localStorage.getItem('site_muted'); } catch (e) { return null; } })(),
                };
            });

            if (!snap.hasLead) fail(name, vp.tag, lang, '顶栏缺左簇');
            if (!snap.hasCenter) fail(name, vp.tag, lang, '顶栏缺中槽 .game-topbar-center');
            if (!snap.hasActions) fail(name, vp.tag, lang, '顶栏缺右簇');
            if (snap.h1Count < 1) fail(name, vp.tag, lang, '页面缺 <h1>（语义标题，可为 .sr-only 视觉隐藏）');

            // 语义标签契约（docs/contracts/layout.md §1.2）：单一 <main>。
            // ⚠ MAIN_PENDING 三页主体是平铺结构（无 .game-main 单一容器），
            //   升级需引入新包裹层、有布局风险，已在 docs/backlog.md 登记为独立任务。
            //   这里降级为告警而不是放弃断言 —— 一旦其中某页补上了，白名单也该跟着缩。
            if (snap.mainCount < 1) {
                if (MAIN_PENDING.has(name)) {
                    gap(`${name}: 缺 <main>（docs/backlog.md 已登记，待独立改动）`);
                } else {
                    fail(name, vp.tag, lang, '页面缺 <main>（语义主体容器，契约 layout.md §1.2）');
                }
            } else if (snap.mainCount > 1) {
                fail(name, vp.tag, lang, `页面有 ${snap.mainCount} 个 <main>，契约要求单一`);
            }

            const canonSeen = snap.rightRoles.filter(r => CANON.includes(r));
            const expect = CANON.filter(c => canonSeen.includes(c));
            if (canonSeen.join(',') !== expect.join(','))
                fail(name, vp.tag, lang, `右簇顺序 ${canonSeen.join(',')} ≠ 契约 ${expect.join(',')}`);

            for (const c of snap.chrome) {
                if (!c.title) fail(name, vp.tag, lang, `data-chrome="${c.role}" 缺 title`);
                if (!c.aria) fail(name, vp.tag, lang, `data-chrome="${c.role}" 缺 aria-label`);
            }

            /* ── ②b 共享文案必须真的本地化（不是只「非空」）──
               只查 sound / moreGames：这两个键来自 js/i18n.js 的 COMMON_TEXT，
               zh 值全站唯一，断死值不会误伤。
               ⚠️ 刻意不查 home —— 它是**页面自有键**，各页取值不同（'Home' /
               '返回菜单' / '返回仙门'），断死值会在 needle-awn、sword-flight 上误报。 */
            const want = EXPECT_LABEL[lang];
            const labelOf = role => (snap.chrome.find(c => c.role === role) || {}).aria || '';
            const soundLabel = labelOf('sound');
            // 静音态下文案会换成 soundOffLabel（'Unmute' / '取消静音'），两种情况都接受
            if (soundLabel && soundLabel !== want.sound && !/Unmute|取消静音/.test(soundLabel))
                fail(name, vp.tag, lang, `静音钮文案未本地化：期望「${want.sound}」，实得「${soundLabel}」（共享层 getText 是否返回整表？）`);
            const moreLabel = labelOf('more');
            if (moreLabel && moreLabel !== want.more)
                fail(name, vp.tag, lang, `更多游戏钮文案未本地化：期望「${want.more}」，实得「${moreLabel}」（共享层 getText 是否返回整表？）`);

            // ④ 负向断言：游戏页不允许再有语言钮（入口收敛到首页，2026-09-21）
            if (snap.chrome.some(c => c.role === 'lang'))
                fail(name, vp.tag, lang, '游戏页出现了语言钮（data-chrome="lang"，2026-09-21 已收敛到首页）');
            if (!snap.chrome.some(c => c.role === 'sound'))
                fail(name, vp.tag, lang, '没有静音钮');

            if (!snap.footerVisible) fail(name, vp.tag, lang, '页脚不可见');
            if (!snap.hintText) fail(name, vp.tag, lang, '页脚提示为空');
            if (snap.htmlLang && !snap.htmlLang.startsWith(lang))
                warns.push(`${name} @${vp.tag}/${lang}: <html lang="${snap.htmlLang}">`);

            /* ── ⑤ 静音钮：一次点击必须真的翻转（双绑会净效果为零） ── */
            const muteRes = await page.evaluate(() => {
                const btn = document.querySelector('[data-chrome="sound"]');
                if (!btn) return { skip: true };
                const get = () => { try { return localStorage.getItem('site_muted'); } catch (e) { return null; } };
                const before = get();
                btn.click();
                return { before, after: get() };
            });
            if (!muteRes.skip && muteRes.before === muteRes.after)
                fail(name, vp.tag, lang, `静音钮点击无效（site_muted 仍为 ${muteRes.after}）—— 多半是页面与 chrome 双绑，一次点击切了两次`);

            /* ── ⑥ 更多游戏 ── */
            const moreRes = await page.evaluate(name => {
                const btn = document.querySelector('[data-chrome="more"]');
                if (!btn) return { missing: true };
                btn.click();
                const nav = document.getElementById(btn.getAttribute('aria-controls'));
                const links = nav ? Array.from(nav.querySelectorAll('a')).map(a => a.getAttribute('href')) : [];
                return {
                    expanded: btn.getAttribute('aria-expanded'),
                    hidden: nav ? nav.hidden : null,
                    count: links.length,
                    self: links.includes(name + '.html'),
                };
            }, name);
            if (moreRes.missing) fail(name, vp.tag, lang, '页脚没有「更多游戏」钮');
            else {
                if (moreRes.expanded !== 'true') fail(name, vp.tag, lang, '更多游戏：aria-expanded 未置 true');
                if (moreRes.hidden !== false) fail(name, vp.tag, lang, '更多游戏：展开后 nav 仍 hidden');
                if (!moreRes.count) fail(name, vp.tag, lang, '更多游戏：列表为空');
                if (moreRes.self) fail(name, vp.tag, lang, '更多游戏：包含指向本页的自链接');
            }

            /* ── ⑧ 顶栏首页钮：点击必须真的导航回 index.html ──
               编程式 click（element.click()）只验证「监听器接没接」，绕开命中测试 ——
               遮挡类问题归 verify-button-icons 的几何断言，两处口径互补。
               必须是本轮最后一个操作：点击会真的离开本页。 */
            if (!homeTested.has(name)) {
                homeTested.add(name);
                const nav = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => null);
                const clicked = await page.evaluate(() => {
                    const btn = document.querySelector('.game-topbar [data-chrome="home"]');
                    if (!btn) return false;
                    btn.click();
                    return true;
                });
                await nav;
                if (!clicked) fail(name, vp.tag, lang, '顶栏没有首页钮（.game-topbar [data-chrome="home"] 不存在）');
                else {
                    const landed = new URL(page.url()).pathname;
                    if (!/index\.html$/.test(landed))
                        fail(name, vp.tag, lang, `顶栏首页钮点击无效（仍停在 ${landed}）—— topbar home 是无 href 的 <button> 且 chrome owns 漏了 'home'、页面也没自绑？`);
                }
            }

            await page.close();
        }
    }
}

await browser.close();

if (knownGaps.size) {
    console.warn(`\n⚠ 已登记缺口 ${knownGaps.size} 项（不计失败，见 docs/backlog.md）：`);
    [...knownGaps].forEach(g => console.warn('  ⚠ ' + g));
}
if (warns.length) {
    console.log(`\n提醒 ${warns.length} 条：`);
    warns.forEach(w => console.log('  · ' + w));
}
if (fails.length) {
    console.log(`\n✗ ${fails.length} 项失败：`);
    fails.forEach(f => console.log('  ✗ ' + f));
    process.exit(1);
}
console.log(`\n✓ 全部通过（${PAGES.length} 页 × 2 视口 × 2 语言）`);
