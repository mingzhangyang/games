// 六个页面「顶部 Stats 钮 + 底部抽屉」快速冒烟测试
// 用法：node scripts/verify-stats-drawer.mjs <baseUrl> [outDir]
import puppeteer from 'puppeteer-core';
import { CHROME_PATH } from './lib/browser.mjs';
import { registry } from './lib/registry.mjs';
import { existsSync, mkdirSync } from 'node:fs';

const EXE = [
    CHROME_PATH,
].find(existsSync);
const BASE = process.argv[2] || 'http://127.0.0.1:8899';
const OUT = process.argv[3] || '';
if (OUT) mkdirSync(OUT, { recursive: true });

// 抽屉页清单 = 挂 drawer cap 的游戏（tetris 的抽屉由 verify-tetris-drawer.mjs 专检，
// 其启动路径与共享契约不同，不进本表的 AUGMENT）。
// pre 前缀来自注册表；gameVar / runningExpr / startMethod 是本脚本自己的测试数据，不进注册表。
const AUGMENT = {
    'planet-merge':      { gameVar: 'planetMergeGame', runningExpr: 'g.state === "playing"', startMethod: 'startGame' },
    'hoop-shot':         { gameVar: 'hoopShotGame',    runningExpr: 'g.state === "playing"', startMethod: 'startGame' },
    'needle-awn':        { gameVar: 'gameEngine',      runningExpr: 'g.state === "playing"', startMethod: 'startLevel', startArgs: [1] },
    'tower-defense':     { gameVar: 'tdGame',          runningExpr: 'g.state === "playing"', startMethod: 'startGame' },
    'gravity-slingshot': { gameVar: 'gdGame',          runningExpr: '!g.isPaused && g.phase !== "menu"', startMethod: 'startLevelMode', startArgs: [0] },
    'sword-flight':      { gameVar: 'game',            runningExpr: 'g.isPlaying && !g.isPaused', startMethod: 'startFlight', startArgs: ['endless'] },
    'lumen':             { gameVar: 'lmGame',          runningExpr: 'g.state === "playing" && !g.isPaused', startMethod: 'startLevel', startArgs: [0] },
    'circuit':           { gameVar: 'ccGame',          runningExpr: 'g.state === "playing" && !g.isPaused', startMethod: 'startLevel', startArgs: [0] },
    'silk-dew':          { gameVar: 'sdGame',          runningExpr: 'g.state === "playing" && !g.isPaused', startMethod: 'startLevel', startArgs: [0] },
};
// ⚠ 曾经这里写的是 `.filter(g => AUGMENT[g.id])` —— 手工表静默收窄注册表：
// 新游戏挂了 drawer cap 却忘了补 AUGMENT，校验器当它不存在，抽屉没接也全绿。
// 现在缺条目直接抛错。tetris 是唯一豁免，理由见上。
registry.assertCovered({ cap: 'drawer', covered: Object.keys(AUGMENT), exempt: ['tetris'], label: 'AUGMENT' });
const PAGES = registry.withCap('drawer')
    .filter(g => AUGMENT[g.id])
    .map(g => ({ name: g.id, pre: g.prefix, ...AUGMENT[g.id] }));

const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const DESKTOP = { width: 1280, height: 900, deviceScaleFactor: 1, hasTouch: false };

const fails = [];
const check = (ok, label, detail) => {
    if (!ok) fails.push(`${label}${detail ? ' — ' + detail : ''}`);
    console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? '  (' + detail + ')' : ''}`);
};

// 本地已知噪声（与业务无关）：analytics / sw-register / 分数 API 的 CORS
const IGNORABLE = [
    /analytics\.js/, /sw-register\.js/, /manifest/i, /CORS/i,
    /game-scores\.orangely/, /ERR_FAILED/,
    /Failed to load resource: the server responded with a status of 404/,
];
const isNoise = (m) => IGNORABLE.some(re => re.test(m));

const domClick = (page, sel) => page.$eval(sel, el => el.click());

const browser = await puppeteer.launch({
    executablePath: EXE, headless: 'new', args: ['--no-sandbox'],
});

for (const P of PAGES) {
    console.log(`\n════════ ${P.name} ════════`);

    // ── 移动端 ──
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setViewport(MOBILE);
    await page.goto(`${BASE}/${P.name}.html`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 900));

    const ids = {
        drawer: `${P.pre}StatsDrawer`,
        body: `${P.pre}StatsDrawerBody`,
        toggle: `${P.pre}StatsToggle`,
        close: `${P.pre}StatsClose`,
        panels: `${P.pre}StatsPanels`,
    };

    const s = await page.evaluate((ids) => {
        const box = (el) => { const r = el.getBoundingClientRect(); return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), y: +r.y.toFixed(1), bottom: +r.bottom.toFixed(1) }; };
        const drawer = document.getElementById(ids.drawer);
        const toggle = document.getElementById(ids.toggle);
        const panels = document.getElementById(ids.panels);
        const sidebar = document.querySelector('.game-sidebar');
        const body = document.getElementById(ids.body);
        const tcs = toggle ? getComputedStyle(toggle) : null;
        // 热区：读 ::after 外扩
        let hit = null;
        if (toggle) {
            const af = getComputedStyle(toggle, '::after');
            const inset = af.inset || `${af.top} ${af.right} ${af.bottom} ${af.left}`;
            hit = inset;
        }
        return {
            drawerExists: !!drawer,
            drawerHidden: drawer ? drawer.hasAttribute('hidden') : null,
            drawerDisplay: drawer ? getComputedStyle(drawer).display : null,
            toggleExists: !!toggle,
            toggleVisible: toggle ? getComputedStyle(toggle).display !== 'none' : false,
            toggleBox: toggle ? box(toggle) : null,
            toggleSvgCount: toggle ? toggle.querySelectorAll('svg').length : 0,
            toggleText: toggle ? toggle.textContent.trim() : null,
            toggleLabel: toggle ? toggle.getAttribute('aria-label') : null,
            toggleExpanded: toggle ? toggle.getAttribute('aria-expanded') : null,
            hitInset: hit,
            panelsParent: panels ? (panels.parentElement && panels.parentElement.id) : null,
            panelsCardCount: panels ? panels.querySelectorAll('.game-side-card').length : 0,
            sidebarDisplay: sidebar ? getComputedStyle(sidebar).display : null,
            sidebarHasPanels: sidebar ? !!sidebar.querySelector('[id$="StatsPanels"]') : null,
            bodyExists: !!body,
            titleText: (document.getElementById(ids.drawer + 'Title') || {}).textContent ?? null,
        };
    }, ids);

    check(s.drawerExists, '抽屉骨架存在');
    check(s.toggleExists, 'Stats 钮存在');
    check(s.toggleVisible, '移动端 Stats 钮可见', `display=${s.toggleVisible}`);
    check(s.toggleSvgCount === 1, 'Stats 钮是图标钮（有 1 个 inline SVG）', `svg=${s.toggleSvgCount}`);
    check((s.toggleText || '') === '', 'Stats 钮无文字子节点', JSON.stringify(s.toggleText));
    check(!!s.toggleLabel, 'Stats 钮有 aria-label', `label=${s.toggleLabel}`);
    check(s.toggleBox && s.toggleBox.w >= 36 && s.toggleBox.h >= 36,
        'Stats 钮触控尺寸 ≥36px', s.toggleBox ? `${s.toggleBox.w}×${s.toggleBox.h}` : '-');
    check(s.sidebarDisplay === 'none', '窄屏侧栏已让位（display:none）', `display=${s.sidebarDisplay}`);
    check(s.panelsParent === ids.body, '面板已挂载到抽屉内容区', `parent=${s.panelsParent}`);
    check(s.panelsCardCount > 0, '抽屉里确有面板卡片', `cards=${s.panelsCardCount}`);
    check(s.drawerHidden === true, '未打开时抽屉是 hidden');
    check(!!s.titleText, '抽屉标题已渲染（非空）', `title=${JSON.stringify(s.titleText)}`);
    check(await page.evaluate((ids) => {
        const panels = document.getElementById(ids.panels);
        if (!panels) return false;
        const inPanels = panels.querySelectorAll('.game-side-card').length;
        // 抽屉 body 内不得出现 panels 之外的复制卡
        const body = document.getElementById(ids.body);
        const inBody = body ? body.querySelectorAll('.game-side-card').length : -1;
        // 侧栏内 panels 外不得残留面板卡（P3 的更多游戏导航卡含 .more-games，合法除外）
        const sidebar = document.querySelector('.game-sidebar');
        const stray = sidebar ? [...sidebar.querySelectorAll('.game-side-card')]
            .filter(c => !panels.contains(c) && !c.querySelector('.more-games')).length : -1;
        return inBody === inPanels && stray === 0;
    }, ids), '面板卡片没有重复（原地搬移而非复制）');

    // 远点不得命中 Stats 钮（防隐形全页命中层）
    const far = await page.evaluate((ids) => {
        const t = document.getElementById(ids.toggle);
        if (!t) return null;
        const r = t.getBoundingClientRect();
        const below = document.elementFromPoint(r.x + r.width / 2, r.y + r.height + 40);
        const left = document.elementFromPoint(Math.max(2, r.x - 100), r.y + r.height / 2);
        const idOf = (el) => el ? (el.id || el.className || el.tagName) : null;
        return { below: idOf(below), left: idOf(left) };
    }, ids);
    check(far && far.below !== ids.toggle && far.left !== ids.toggle,
        'Stats 钮的远点不命中自己（无隐形全页命中层）',
        `下40=${far && far.below} 左100=${far && far.left}`);

    await page.screenshot({ path: OUT ? `${OUT}/${P.name}-mobile.png` : undefined });

    // 真实点击打开
    await domClick(page, `#${ids.toggle}`);
    await new Promise(r => setTimeout(r, 700));
    const opened = await page.evaluate((ids) => {
        const d = document.getElementById(ids.drawer);
        const p = d.querySelector('.game-drawer-panel');
        const r = p.getBoundingClientRect();
        return {
            hidden: d.hasAttribute('hidden'),
            isOpen: d.classList.contains('is-open'),
            opacity: +getComputedStyle(d).opacity,
            panelBottom: +r.bottom.toFixed(1),
            panelTop: +r.top.toFixed(1),
            vh: window.innerHeight,
            locked: document.body.classList.contains('drawer-locked'),
            bodyPos: getComputedStyle(document.body).position,
            expanded: document.getElementById(ids.toggle).getAttribute('aria-expanded'),
            role: p.getAttribute('role'),
            ariaModal: p.getAttribute('aria-modal'),
            panelMaxH: +getComputedStyle(p).maxHeight.replace('px', ''),
            focusInside: d.contains(document.activeElement),
        };
    }, ids);

    check(!opened.hidden && opened.isOpen, '点击后抽屉呈现并带 .is-open');
    check(opened.opacity > 0.9, '遮罩已淡入', `opacity=${opened.opacity}`);
    check(opened.panelBottom <= opened.vh + 1 && opened.panelTop < opened.vh,
        '面板已滑入视口', `top=${opened.panelTop} bottom=${opened.panelBottom} vh=${opened.vh}`);
    check(opened.panelMaxH > 0 && opened.panelMaxH <= opened.vh * 0.92,
        '面板高度上限约 90dvh', `maxH=${opened.panelMaxH} vh=${opened.vh}`);
    check(opened.locked, '背景滚动已锁（body.drawer-locked）');
    check(opened.bodyPos !== 'fixed', '锁滚动没有把 body 变成 position:fixed', opened.bodyPos);
    check(opened.expanded === 'true', 'Stats 钮 aria-expanded=true');
    check(opened.role === 'dialog' && opened.ariaModal === 'true', '面板 role=dialog / aria-modal=true');
    check(opened.focusInside, '打开后焦点进入抽屉');

    await page.screenshot({ path: OUT ? `${OUT}/${P.name}-drawer.png` : undefined });

    // 三条关闭路径
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 450));
    let cl = await page.evaluate((ids) => ({
        open: document.getElementById(ids.drawer).classList.contains('is-open'),
        locked: document.body.classList.contains('drawer-locked'),
        expanded: document.getElementById(ids.toggle).getAttribute('aria-expanded'),
    }), ids);
    check(!cl.open && !cl.locked && cl.expanded === 'false', 'Esc 可关闭抽屉并解锁滚动');

    await domClick(page, `#${ids.toggle}`);
    await new Promise(r => setTimeout(r, 500));
    await domClick(page, `#${ids.close}`);
    await new Promise(r => setTimeout(r, 450));
    cl = await page.evaluate((ids) => document.getElementById(ids.drawer).classList.contains('is-open'), ids);
    check(cl === false, '关闭钮可关闭抽屉');

    await domClick(page, `#${ids.toggle}`);
    await new Promise(r => setTimeout(r, 500));
    await page.mouse.click(195, 60);   // 遮罩区域（面板之外）
    await new Promise(r => setTimeout(r, 450));
    cl = await page.evaluate((ids) => document.getElementById(ids.drawer).classList.contains('is-open'), ids);
    check(cl === false, '点遮罩可关闭抽屉');

    const realErr = errors.filter(e => !isNoise(e));
    check(realErr.length === 0, '无 JS 运行时错误', realErr.slice(0, 2).join(' | ') || 'none');

    // ── 强制暂停 ──
    // 用户明确的硬要求：抽屉打开时游戏必须暂停。各页暂停机制不同，所以：
    //   ① 用该页自己的"开始游戏"按钮真正开一局（不能靠改状态——那测的是假象）；
    //   ② 断言 stopExpr（模拟已停）而非仅看标志位。
    const started = await page.evaluate(({ gameVar, startMethod, startArgs }) => {
        const g = window[gameVar];
        if (!g) return { ok: false, why: 'no game instance' };
        // 先试该页声明的真实入口，再退回到常见命名
        const cands = [startMethod, 'startGame', 'start', 'play', 'beginGame']
            .filter(Boolean);
        for (const m of cands) {
            if (typeof g[m] === 'function') {
                try {
                    g[m](...(startArgs || []));
                    return { ok: true, via: m };
                } catch (e) { /* 换下一个 */ }
            }
        }
        return { ok: false, why: `no start method (tried ${cands.join('/')})` };
    }, P).catch(() => ({ ok: false, why: 'eval failed' }));

    if (started.ok) {
        await new Promise(r => setTimeout(r, 400));
        const running = await page.evaluate(({ gameVar, runningExpr }) => {
            const g = window[gameVar];
             
            return new Function('g', `return (${runningExpr});`)(g);
        }, P);
        check(running, `开局后游戏在跑（为暂停断言建立基线）`, `via=${started.via}`);

        if (running) {
            await domClick(page, `#${ids.toggle}`);
            await new Promise(r => setTimeout(r, 600));
            const afterOpen = await page.evaluate(({ gameVar, runningExpr }) => {
                const g = window[gameVar];
                 
                return new Function('g', `return (${runningExpr});`)(g);
            }, P);
            check(afterOpen === false, '打开抽屉后游戏被强制暂停');

            // 关闭后应恢复（因为这次暂停是抽屉造成的）
            await domClick(page, `#${ids.close}`);
            await new Promise(r => setTimeout(r, 600));
            const afterClose = await page.evaluate(({ gameVar, runningExpr }) => {
                const g = window[gameVar];
                 
                return new Function('g', `return (${runningExpr});`)(g);
            }, P);
            check(afterClose === true, '关闭抽屉后恢复「因抽屉而暂停」的那一次（游戏继续）');

            // 反向：玩家自己先暂停 → 开抽屉 → 关抽屉，不得被偷偷继续
            const userPaused = await page.evaluate(({ gameVar }) => {
                const g = window[gameVar];
                if (typeof g.pauseQuiet === 'function') { g.pauseQuiet(); return true; }
                return false;
            }, P);
            if (userPaused) {
                await new Promise(r => setTimeout(r, 300));
                await domClick(page, `#${ids.toggle}`);
                await new Promise(r => setTimeout(r, 500));
                await domClick(page, `#${ids.close}`);
                await new Promise(r => setTimeout(r, 600));
                const stillPaused = await page.evaluate(({ gameVar, runningExpr }) => {
                    const g = window[gameVar];
                     
                    return new Function('g', `return (${runningExpr});`)(g);
                }, P);
                check(stillPaused === false,
                    '用户先手动暂停时，开合抽屉不会误恢复对局');
            }
        }
    } else {
        console.log(`  · 跳过强制暂停断言：${started.why}`);
    }

    // ── 桌面端 ──
    const d = await browser.newPage();
    const dErr = [];
    d.on('pageerror', e => dErr.push(e.message));
    await d.setViewport(DESKTOP);
    await d.goto(`${BASE}/${P.name}.html`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 800));
    const ds = await d.evaluate((ids) => {
        const drawer = document.getElementById(ids.drawer);
        const toggle = document.getElementById(ids.toggle);
        const sidebar = document.querySelector('.game-sidebar');
        return {
            drawerDisplay: drawer ? getComputedStyle(drawer).display : null,
            toggleDisplay: toggle ? getComputedStyle(toggle).display : null,
            sidebarDisplay: sidebar ? getComputedStyle(sidebar).display : null,
            sidebarHasPanels: sidebar ? !!sidebar.querySelector('[id$="StatsPanels"]') : null,
        };
    }, ids);
    check(ds.drawerDisplay === 'none', '桌面端抽屉不呈现', `display=${ds.drawerDisplay}`);
    check(ds.toggleDisplay === 'none', '桌面端 Stats 钮隐藏', `display=${ds.toggleDisplay}`);
    check(ds.sidebarDisplay === 'flex', '桌面端侧栏常驻', `display=${ds.sidebarDisplay}`);
    check(ds.sidebarHasPanels, '桌面端面板回到侧栏');
    const dRealErr = dErr.filter(e => !isNoise(e));
    check(dRealErr.length === 0, '桌面端无 JS 运行时错误', dRealErr.slice(0, 2).join(' | ') || 'none');

    await d.screenshot({ path: OUT ? `${OUT}/${P.name}-desktop.png` : undefined });
    await page.close();
    await d.close();

    // ── i18n：Stats / 关闭 的文案必须随语言切换 ──
    //
    // 这条断言是补上的：add-drawer-i18n.py 曾经只写了 `stats` 键、漏了 `close`，
    // 于是关闭钮在中英文下都退回 fallback 的 'Close'，而上面所有几何/可点击性断言
    // 全部照常通过 —— 文案类的缺陷只有专门断言文案才抓得到。
    //
    // ⚠️ 存储键是 js/site-settings.js 的 LANG_KEY = 'site_lang'；写成 'lang' 会让页面
    // 一直走 navigator.language 默认值，于是"zh 不生效"变成彻头彻尾的假象。
    const WANT = {
        zh: { stats: '数据统计', close: '关闭' },
        en: { stats: 'Stats', close: 'Close' },
    };
    for (const lang of ['zh', 'en']) {
        const lp = await browser.newPage();
        await lp.setViewport(MOBILE);
        await lp.evaluateOnNewDocument((l) => { try { localStorage.setItem('site_lang', l); } catch (e) {} }, lang);
        await lp.goto(`${BASE}/${P.name}.html`, { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 500));
        const ls = await lp.evaluate(() => {
            const t = document.querySelector('[id$="StatsToggle"]');
            const c = document.querySelector('.game-drawer-close');
            const title = document.querySelector('.game-drawer-title');
            return {
                stats: t && t.getAttribute('aria-label'),
                close: c && c.getAttribute('aria-label'),
                title: title && title.textContent,
            };
        });
        const w = WANT[lang];
        check(ls.stats === w.stats && ls.close === w.close && ls.title === w.stats,
            `[${lang}] Stats/关闭/标题 文案已本地化`,
            `stats=${ls.stats} close=${ls.close} title=${ls.title}`);
        await lp.close();
    }
}

await browser.close();

console.log('\n' + '─'.repeat(62));
if (fails.length) {
    console.log(`失败 ${fails.length} 项：`);
    fails.forEach(f => console.log('  ✗ ' + f));
    process.exit(1);
} else {
    console.log('全部通过');
}
