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
// 2026-10-21 收尾第 2 步 B 批：俄罗斯方块 / 星球合成的分数行随流排在画布上方，投篮的分数悬浮在夜空，
// 塔防的生命 / 金币 / 波次并进底部战术条（贴舞台下沿）。
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
// 手机横握：麦克斯韦妖的场景切到左右分列，状态行竖排到左侧列（css/stage-status.css ⑥），
// 只要求不压画布；同一行若仍占顶部一整行，会把容器压小、读数条带被挤没（smoke-maxwell-demon）。
const NARROW = { label: '320', width: 320, height: 568, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const SE_LANDSCAPE = { label: '568x320', width: 568, height: 320, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true };
const LANDSCAPE = { label: '844x390', width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true, beside: true };

// status: 移进舞台的状态元素；hud: 舞台里原有、不得与状态重叠的局内 HUD；
// name: 顶栏中槽里应当剩下的游戏名；start: 进入对局的点击序列；playing: 对局就绪条件；
// above: 状态必须整体落在它上方的元素（关卡计数页的画布：状态行随流排在画布上方，不得盖住棋盘第一行）；
// toast: 舞台提示条 —— 亮出来后必须是一行高、不压状态行（电路谜题贴底的提示条曾被上移规则改了 top、
// 留着 bottom，拉伸成整块盖住棋盘）；viewports: 额外视口；start 可按视口给（俄罗斯方块手机用底栏开始钮）；
// edge: 'bottom' —— 状态并进舞台下沿的战术条（塔防），断言贴底而不是贴顶；
// stress: 在页面里灌入大数字（及堆叠徽章）后复查 —— 状态内容与 stressAlso 的控件仍在舞台和视口内、
// 不越过 above（定高状态行里内容折行会压进画布；塔防战术条放不下会被 overflow:hidden 的舞台裁掉）。
// 关卡计数十页结构相同：「关卡」按钮直接进入第一个未完成关卡，开始层收起即对局就绪。
const levelCounter = (id, prefix, name) => ({
    id,
    status: [`#${prefix}-stage-status`],
    hud: [],
    above: `#${prefix}-canvas`,
    toast: `#${prefix}-toast`,
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
        status: ['#sl-progress', '#sl-target-btn'],
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
    { ...levelCounter('maxwell-demon', 'md', { zh: '麦克斯韦妖', en: 'Maxwell\'s Demon' }), viewports: [LANDSCAPE] },
    levelCounter('ripple-duet', 'rd', { zh: '涟漪双生', en: 'Ripple Duet' }),
    levelCounter('silk-dew', 'sd', { zh: '垂丝引露', en: 'Silkfall' }),
    // ── C 批：特殊页状态 / 游戏控件归舞台 ──
    {
        id: 'minesweeper',
        status: ['#ms-counter-mines', '#ms-face', '#ms-counter-timer'],
        hud: [],
        above: '#ms-board',
        name: { zh: '扫雷', en: 'Minesweeper' },
        start: ['#ms-btn-play'],
        playing: () => document.getElementById('ms-start').classList.contains('hidden'),
        viewports: [NARROW],
        label: async page => {
            const face = await page.$eval('#ms-face', el => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height }));
            return [face.w >= 44 && face.h >= 44, '笑脸热区 ≥44px', JSON.stringify(face)];
        },
    },
    {
        id: 'reversi',
        status: ['#rv-box-black', '#rv-box-white'],
        hud: [],
        above: '#rv-board',
        name: { zh: '黑白棋', en: 'Reversi' },
        start: ['#rv-btn-play'],
        playing: () => window.rvGame?.state === 'playing',
        viewports: [NARROW],
    },
    {
        id: 'word-daily',
        status: ['.wd-sub-row'],
        hud: [],
        above: '#wd-board',
        name: { zh: '每日猜词', en: 'Word Daily' },
        start: [],
        playing: () => !!window.wordDailyGame && document.querySelectorAll('#wd-board .wd-row').length > 0,
    },
    {
        id: 'firefly-signal',
        status: ['#fs-level-pill'],
        hud: ['#fs-harmony', '#fs-signals'],
        name: { zh: '萤火信号', en: 'Firefly Signal' },
        start: ['#fs-level-list .fs-level-btn'],
        playing: () => window.__fireflySignal?.state === 'playing',
        label: async (page, lang) => {
            const label = await page.$eval('#fs-level-pill', el => el.textContent.trim());
            const want = lang === 'zh' ? /^1 · 初光$/ : /^1 · First Light$/;
            return [want.test(label), '显示当前语言关卡编号与关卡名', label];
        },
    },
    // ── B 批：分数 HUD ──
    {
        id: 'tetris',
        status: ['#tt-stage-status'],
        hud: [],
        above: '#tetris',
        name: { zh: '俄罗斯方块', en: 'Tetris' },
        start: vp => [vp.isMobile ? '#mobileStartBtn' : '#startBtn'],
        playing: () => !!window.game?.animationId && !window.game.gameOver,
    },
    {
        id: 'planet-merge',
        status: ['#pm-stage-status'],
        hud: ['.pm-next-box'],
        above: '#pm-canvas',
        toast: '#pm-toast',
        name: { zh: '星球合成', en: 'Planet Merge' },
        start: ['#pm-btn-endless'],
        playing: () => window.planetMergeGame?.state === 'playing',
        stress: () => {
            document.getElementById('pm-score').textContent = '1234567';
            document.getElementById('pm-best').textContent = '1234567';
        },
        viewports: [NARROW],
    },
    {
        id: 'hoop-shot',
        status: ['#hs-stage-status'],
        hud: ['#hs-fire-badge'],
        name: { zh: '街机投篮', en: 'Hoop Shot' },
        start: ['#hs-btn-play'],
        playing: () => window.hoopShotGame?.state === 'playing',
    },
    {
        id: 'tower-defense',
        status: ['#td-stage-status'],
        hud: ['#td-skill-emp', '#td-wave-btn', '#td-skill-boost'],
        edge: 'bottom',
        name: { zh: '霓虹塔防', en: 'Neon Tower Defense' },
        start: ['#td-btn-play'],
        playing: () => window.tdGame?.state === 'playing',
        stress: () => {
            document.getElementById('td-lives').textContent = '100';
            document.getElementById('td-gold').textContent = '12345';
            document.getElementById('td-wave').textContent = '40/40';
            const badge = document.getElementById('td-stack-badge');
            badge.classList.remove('hidden');
            badge.textContent = '×6 +48%';
        },
        stressAlso: ['#td-skill-emp', '#td-wave-btn', '#td-skill-boost'],
        // 竖屏手机是「请旋转」提示，战场不可玩；只测横屏手机与桌面
        viewports: [{ ...LANDSCAPE, beside: false }, SE_LANDSCAPE],
        skip: vp => vp.label === '390',
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


/* 星球合成：共享的移动端菜单契约是「全部舞台子项落在同一格」。
   对局态才是状态行/画布两行；必须分别测首次菜单与真实返回菜单的路径。 */
const checkPlanetMenuGrid = async (page, tag) => {
    const grid = await page.evaluate(() => {
        const stage = document.querySelector('.pm-stage');
        const menu = document.querySelector('#pm-start');
        const rowCol = selector => {
            const s = getComputedStyle(document.querySelector(selector));
            return s.gridRowStart + '/' + s.gridColumnStart;
        };
        return {
            display: getComputedStyle(stage).display,
            menuVisible: getComputedStyle(menu).display !== 'none',
            rows: getComputedStyle(stage).gridTemplateRows,
            positions: {
                menu: rowCol('#pm-start'),
                status: rowCol('#pm-stage-status'),
                canvas: rowCol('#pm-canvas'),
                next: rowCol('.pm-next-box'),
            },
        };
    });
    check(grid.display === 'grid' && grid.menuVisible, `${tag}: 开始菜单启用共享网格`, grid.display);
    check(Object.values(grid.positions).every(pos => pos === '1/1'),
        `${tag}: 菜单、状态、画布和 Next 同在第一格`, JSON.stringify(grid.positions));
    check(grid.rows.trim().split(/\s+/).length === 1,
        `${tag}: 菜单没有多余的第二行高度`, grid.rows);
};

const checkTowerPanelClearance = async (page, tag, kind) => {
    // 面板有 200ms 入场动画（translateY），等稳定后量实际遮挡而非动画中间帧。
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 260)));
    const geo = await page.evaluate(() => {
        const rect = selector => {
            const r = document.querySelector(selector).getBoundingClientRect();
            return { l: r.left, t: r.top, r: r.right, b: r.bottom };
        };
        const el = document.querySelector('#td-panel');
        return {
            visible: !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none',
            panel: rect('#td-panel'),
            dock: rect('#td-bottom-controls'),
            stage: rect('#td-stage'),
        };
    });
    check(geo.visible, `${tag}: ${kind}面板已展开`);
    if (!geo.visible) return;
    check(geo.panel.b <= geo.dock.t - 6, `${tag}: ${kind}面板不遮挡折行战术条`,
        JSON.stringify({ panelBottom: geo.panel.b, dockTop: geo.dock.t }));
    check(geo.panel.l >= geo.stage.l - 1 && geo.panel.r <= geo.stage.r + 1
        && geo.panel.t >= geo.stage.t - 1,
    `${tag}: ${kind}面板完整落在舞台内`, JSON.stringify(geo.panel));
};

const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });

for (const spec of PAGES) {
    for (const vp of [...VIEWPORTS, ...(spec.viewports || [])].filter(v => !spec.skip?.(v))) {
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
            if (spec.id === 'planet-merge' && vp.width < 1024) {
                await page.waitForFunction(() => window.planetMergeGame?.state === 'menu', { timeout: 10000 });
                await checkPlanetMenuGrid(page, `${tag} 首次菜单`);
            }
            let started = true;
            for (const sel of typeof spec.start === 'function' ? spec.start(vp) : spec.start) {
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

            const snap = await page.evaluate(({ status, hud, above, toast }) => {
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
                    toast: (() => {
                        const el = toast && document.querySelector(toast);
                        if (!el) return null;
                        // 直接亮出提示条量几何：各页 showToast 的签名不一，这里只关心定位
                        el.classList.remove('hidden');
                        el.classList.add('is-on', 'show');
                        el.textContent = 'Toast 提示';
                        const r = rect(el);
                        return r;
                    })(),
                };
            }, { status: spec.status, hud: spec.hud, above: spec.above || null, toast: spec.toast || null });

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
                if (spec.edge === 'bottom') {
                    check(snap.stage.b - r.b <= 32, `${tag}: ${s.sel} 贴舞台下沿（并在战术条里）`, `${Math.round(snap.stage.b - r.b)}px`);
                } else {
                    check(r.t - snap.stage.t <= 24, `${tag}: ${s.sel} 贴舞台顶边`, `${Math.round(r.t - snap.stage.t)}px`);
                }
                if (spec.above) {
                    check(!!snap.above, `${tag}: ${spec.above} 存在`);
                    const a = snap.above;
                    if (a && vp.beside) {
                        // 必须是左右并排：仍占顶部一整行同样「不相交」，但会把横屏容器压小
                        const beside = r.r <= a.l + 1 || a.r <= r.l + 1;
                        check(beside, `${tag}: ${s.sel} 排在 ${spec.above} 旁边、不占顶部一行`, JSON.stringify({ status: r, canvas: a }));
                    } else if (a) {
                        check(r.b <= a.t + 1, `${tag}: ${s.sel} 整体在 ${spec.above} 上方、不压画面`, `${Math.round(r.b)} > ${Math.round(a.t)}`);
                    }
                }
                if (snap.toast) {
                    const t = snap.toast;
                    // 一行提示条含内边距约 30–40px；被 top / bottom 同时拉伸时是 350px 以上
                    check(t.h <= 80, `${tag}: ${spec.toast} 是一行高的提示条（没被 top / bottom 同时拉伸）`, `${Math.round(t.h)}px`);
                    const clear = t.r <= r.l || r.r <= t.l || t.b <= r.t || r.b <= t.t;
                    check(clear, `${tag}: ${spec.toast} 不压 ${s.sel}`, JSON.stringify({ toast: t, status: r }));
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
            if (spec.stress) {
                await page.evaluate(spec.stress);
                await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
                const stressed = await page.evaluate(({ status, also, above }) => {
                    const rect = el => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
                    const stage = rect(document.querySelector('.game-stage'));
                    const leaves = status.flatMap(sel => [...document.querySelectorAll(`${sel} *`)]
                        .filter(n => n.children.length === 0 && n.getClientRects().length && getComputedStyle(n).display !== 'none'));
                    const items = [...leaves.map(n => ({ sel: n.id || n.className || n.tagName, r: rect(n) })),
                        ...also.map(sel => ({ sel, r: rect(document.querySelector(sel)) }))];
                    return { stage, items, vw: innerWidth, above: above ? rect(document.querySelector(above)) : null };
                }, { status: spec.status, also: spec.stressAlso || [], above: spec.above || null });
                const out = stressed.items.filter(({ r }) => r.l < Math.max(0, stressed.stage.l) - 1 || r.r > Math.min(stressed.vw, stressed.stage.r) + 1
                    || r.t < stressed.stage.t - 1 || r.b > stressed.stage.b + 1);
                check(out.length === 0, `${tag}: 大数字下状态与控件仍在舞台和视口内`, out.map(o => o.sel).join(', '));
                if (stressed.above && !vp.beside) {
                    const low = Math.max(...stressed.items.map(({ r }) => r.b));
                    check(low <= stressed.above.t + 1, `${tag}: 大数字下状态内容不折行压进 ${spec.above}`, `${Math.round(low)} > ${Math.round(stressed.above.t)}`);
                }
            }
            if (spec.id === 'planet-merge' && vp.width < 1024) {
                // 走真实 Pause → Home 流程，校验菜单网格在对局结束后恢复。
                await page.click('#pm-pause-btn');
                await page.waitForFunction(() => window.planetMergeGame?.state === 'paused', { timeout: 10000 });
                await page.click('#pm-btn-menu');
                await page.waitForFunction(() => window.planetMergeGame?.state === 'menu', { timeout: 10000 });
                await checkPlanetMenuGrid(page, `${tag} 返回菜单`);
            }
            if (spec.id === 'tower-defense') {
                const ready = await page.evaluate(() => {
                    const g = window.tdGame;
                    const { cols, rows, pathGrid } = g.map;
                    for (let r = 0; r < rows; r++) {
                        for (let c = 0; c < cols; c++) {
                            if (pathGrid[r * cols + c] || g.towerAt(c, r) >= 0) continue;
                            g.selectedCell = { c, r };
                            g.selectedTowerIdx = -1;
                            g.renderPanel();
                            return true;
                        }
                    }
                    return false;
                });
                check(ready, `${tag}: 有可建造格可以打开真实建造面板`);
                if (ready) {
                    await checkTowerPanelClearance(page, tag, '建造');
                    const built = await page.evaluate(() => {
                        const g = window.tdGame;
                        const before = g.towers.length;
                        g.tryBuild('pulse');
                        return g.towers.length > before && g.selectedTowerIdx >= 0;
                    });
                    check(built, `${tag}: 可完成建造并显示真实升级面板`);
                    if (built) await checkTowerPanelClearance(page, tag, '升级');
                }
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
console.log(`\n✓ verify-stage-status 全部通过（${passes} 项断言，${PAGES.length} 页 × ${VIEWPORTS.length} 视口 × 2 语言 + 横屏）`);
