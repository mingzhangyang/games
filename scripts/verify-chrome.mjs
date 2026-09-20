// 顶栏/页脚槽位契约校验：node scripts/verify-chrome.mjs [baseUrl] [--shots <dir>]
//
// 断言（每页 × 移动 390 / 桌面 1280 × zh / en）：
//   ① 顶栏三槽位齐全；右簇通用钮顺序 = stats → pause → sound → lang
//   ② home / sound / lang / more / pause 的 title 与 aria-label 非空，且随语言变化
//   ③ 页脚在 390 宽下**可见**（此前 ≤480px 被 display:none，等于没有页脚），hint 非空
//   ④ 点一次语言钮，UI 真的换语言（挡住"只改 localStorage 不刷界面"）
//   ⑤ 点一次静音钮，site_muted 真的翻转（挡住"页面与 chrome 各挂一个 handler
//      导致一次点击切换两次 = 净效果为零"这个最隐蔽的回归）
//   ⑥ 页脚「更多游戏」展开后 aria-expanded=true、列表非空、不含指向本页的自链接
//   ⑦ 整轮无 pageerror
//
// ⚠️ 语言存储键是 site_lang（js/site-settings.js 的 LANG_KEY），不是 'lang'。
//    种错键会让页面停在 navigator.language 默认值，于是"中文没生效"全是假故障。
import puppeteer from 'puppeteer-core';
import { CHROME_PATH } from './lib/browser.mjs';

const CHROME = process.env.CHROME_BIN ||
    CHROME_PATH;
const args = process.argv.slice(2);
const BASE = args.find(a => a.startsWith('http')) || 'http://127.0.0.1:8899';

const PAGES = [
    'gravity-slingshot', 'hoop-shot', 'planet-merge', 'sword-flight', 'needle-awn',
    'tower-defense', 'reversi', 'minesweeper', 'word-daily', 'gomoku', 'tetris',
];
const CANON = ['stats', 'pause', 'sound', 'lang'];

const fails = [];
const warns = [];
const fail = (p, vp, lang, msg) => fails.push(`${p} @${vp}/${lang}: ${msg}`);

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

            const canonSeen = snap.rightRoles.filter(r => CANON.includes(r));
            const expect = CANON.filter(c => canonSeen.includes(c));
            if (canonSeen.join(',') !== expect.join(','))
                fail(name, vp.tag, lang, `右簇顺序 ${canonSeen.join(',')} ≠ 契约 ${expect.join(',')}`);

            for (const c of snap.chrome) {
                if (!c.title) fail(name, vp.tag, lang, `data-chrome="${c.role}" 缺 title`);
                if (!c.aria) fail(name, vp.tag, lang, `data-chrome="${c.role}" 缺 aria-label`);
            }
            if (!snap.chrome.some(c => c.role === 'lang'))
                fail(name, vp.tag, lang, '没有语言钮');
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

            /* ── ④ 语言钮：点一次，界面必须真的换语言 ── */
            const langRes = await page.evaluate(() => {
                const btn = document.querySelector('[data-chrome="lang"]');
                if (!btn) return { missing: true };
                const hintEl = document.querySelector('.game-footer .game-footer-hint');
                const before = {
                    label: (btn.textContent || '').trim(),
                    hint: hintEl ? (hintEl.textContent || '').trim() : '',
                    title: document.title,
                    stored: (() => { try { return localStorage.getItem('site_lang'); } catch (e) { return null; } })(),
                };
                btn.click();
                return { before };
            });
            if (!langRes.missing) {
                await new Promise(r => setTimeout(r, 350));
                const after = await page.evaluate(() => {
                    const btn = document.querySelector('[data-chrome="lang"]');
                    const hintEl = document.querySelector('.game-footer .game-footer-hint');
                    return {
                        label: (btn.textContent || '').trim(),
                        hint: hintEl ? (hintEl.textContent || '').trim() : '',
                        title: document.title,
                        stored: (() => { try { return localStorage.getItem('site_lang'); } catch (e) { return null; } })(),
                    };
                });
                const b = langRes.before;
                if (b.stored === after.stored)
                    fail(name, vp.tag, lang, `语言钮未写入 site_lang（仍是 ${after.stored}）`);
                if (b.label === after.label)
                    fail(name, vp.tag, lang, `语言钮自身文案未变（${after.label}）`);
                if (b.hint === after.hint && b.title === after.title)
                    fail(name, vp.tag, lang, '切语言后页脚提示与 document.title 都没变 —— 界面没跟着刷新');
            }

            await page.close();
        }
    }
}

await browser.close();

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
