// Tetris 移动端底部抽屉 + 顶栏图标钮回归
// 用法: node scripts/verify-tetris-drawer.mjs <baseUrl> [shotDir]
//
// 覆盖：
//   · 顶栏三区（Home / 分数 HUD / Stats+Theme 图标钮），两个钮必须是 inline SVG、无 emoji 文案
//   · Stats 钮 ≥44px 触控热区；图标钮远点不命中（热区外扩伪元素踩过隐形全命中的坑）
//   · 抽屉打开：真的滑上来、可达 90dvh、背景不可滚、游戏已强制暂停
//   · 三条关闭路径：关闭钮 / 点遮罩 / Esc；关闭后恢复「因抽屉而暂停」的那一次暂停
//   · aria-expanded / aria-modal / role=dialog 同步
//   · 移动端侧栏让位（display:none），桌面端侧栏常驻且 Stats 钮与抽屉隐藏
//   · 面板 DOM 只有一个实例：桌面在侧栏里，移动端在抽屉里
import puppeteer from 'puppeteer-core';
import { CHROME_PATH } from './lib/browser.mjs';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const EXE = process.env.CHROME_BIN || [
    CHROME_PATH,
].find(existsSync);

const BASE = process.argv[2] || 'http://127.0.0.1:8900';
const SHOTS = process.argv[3] || null;

const VIEWPORTS = [
    { tag: '手机 390×844', width: 390, height: 844, touch: true },
    { tag: '手机 360×640', width: 360, height: 640, touch: true },
    { tag: '窄屏 320×568', width: 320, height: 568, touch: true },
    { tag: '平板 768×1024', width: 768, height: 1024, touch: true },
    { tag: '桌面 1280×900', width: 1280, height: 900, touch: false },
];

let pass = 0, fail = 0;
const failures = [];

function check(ok, label, detail = '') {
    if (ok) { pass++; console.log(`  ✓ ${label}`); }
    else { fail++; failures.push(label); console.log(`  ✗ ${label}${detail ? '  → ' + detail : ''}`); }
}

// 用 el.click() 而非 page.click()：抽屉遮罩会盖住底栏/画布上的控件，
// page.click() 会静默落到遮罩上（"点不动"的假失败）。见 web-layout-audit 技能。
const domClick = (page, sel) => page.$eval(sel, el => el.click());

// 面板高度上限是否来自 90dvh，只能看 CSS 源码：
// getComputedStyle 会把 dvh 换算成 px，拿 px 去匹配 /dvh/ 永远失败。
import { readFileSync } from 'node:fs';
const LAYOUT_CSS = readFileSync(new URL('../css/layout.css', import.meta.url), 'utf8');
const panelMaxHIsDvh = () => /--drawer-max:\s*90dvh/.test(LAYOUT_CSS);

// 已知的环境噪声，不计入失败：
//  · analytics.js / sw-register.js 在本地不存在（线上才有）→ console 只报
//    "Failed to load resource ... 404"，**不带 URL**，所以必须按文本模式匹配；
//  · 排行榜接口在 localhost 被 CORS 拦（线上正常）。
const IGNORABLE = [
    /analytics\.js/, /sw-register\.js/, /manifest/i,
    /CORS/i, /game-scores\.orangely/, /ERR_FAILED/,
    /Failed to load resource: the server responded with a status of 404/,
];
const isNoise = msg => IGNORABLE.some(re => re.test(msg));

if (SHOTS) await mkdir(SHOTS, { recursive: true });

const browser = await puppeteer.launch({
    executablePath: EXE,
    headless: 'new',
    args: ['--no-first-run', '--disable-gpu', '--hide-scrollbars', '--mute-audio', '--no-sandbox'],
});

const SNAP = () => {
    const q = s => document.querySelector(s);
    const box = el => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const vis = el => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
    const statBtn = q('#statsToggle'), themeBtn = q('#themeToggle');
    const drawer = q('#statsDrawer'), panel = q('.game-drawer-panel');
    const sidebar = q('#infoPanel'), panels = q('#statsPanels');
    return {
        view: { w: window.innerWidth, h: window.innerHeight },
        hudScore: q('#scoreHud') ? q('#scoreHud').textContent.trim() : null,
        hudLabel: q('#scoreHudLabel') ? q('#scoreHudLabel').textContent.trim() : null,
        hudBox: box(q('.game-hud-box')),
        stat: {
            exists: !!statBtn, visible: vis(statBtn), box: box(statBtn),
            svg: statBtn ? !!statBtn.querySelector('svg') : false,
            text: statBtn ? statBtn.textContent.trim() : null,
            aria: statBtn ? statBtn.getAttribute('aria-expanded') : null,
        },
        theme: {
            exists: !!themeBtn, visible: vis(themeBtn), box: box(themeBtn),
            svg: themeBtn ? !!themeBtn.querySelector('svg') : false,
            text: themeBtn ? themeBtn.textContent.trim() : null,
            label: themeBtn ? themeBtn.getAttribute('aria-label') : null,
            pressed: themeBtn ? themeBtn.getAttribute('aria-pressed') : null,
        },
        drawer: {
            exists: !!drawer,
            hidden: drawer ? drawer.hidden : null,
            open: drawer ? drawer.classList.contains('is-open') : null,
            opacity: drawer ? getComputedStyle(drawer).opacity : null,
            box: box(drawer),
            panelBox: box(panel),
            panelMaxH: panel ? getComputedStyle(panel).maxHeight : null,
            role: panel ? panel.getAttribute('role') : null,
            ariaModal: panel ? panel.getAttribute('aria-modal') : null,
            bodyScrollH: q('.game-drawer-body') ? q('.game-drawer-body').scrollHeight : null,
            bodyClientH: q('.game-drawer-body') ? q('.game-drawer-body').clientHeight : null,
        },
        sidebar: { exists: !!sidebar, visible: vis(sidebar), display: sidebar ? getComputedStyle(sidebar).display : null },
        panelsParent: panels ? (panels.parentElement.id || panels.parentElement.className) : null,
        bodyLocked: document.body.classList.contains('drawer-locked'),
        bodyPosition: getComputedStyle(document.body).position,
        paused: window.game ? window.game.paused : null,
        animating: window.game ? window.game.animationId !== null : null,
        score: window.game ? window.game.score : null,
        themeBtnEl: !!themeBtn,
    };
};

for (const vp of VIEWPORTS) {
    const isDesktop = vp.width >= 1024;
    console.log(`\n=== ${vp.tag}${isDesktop ? '（桌面：侧栏常驻）' : '（移动：抽屉接管）'} ===`);
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 140)));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 140)); });
    // console 的 404/CORS 只会以 "Failed to load resource" 出现（无 URL），
    // 靠 requestfailed 拿到真实 URL 才能判断是不是本地噪声
    page.on('requestfailed', r => errs.push('reqfail: ' + r.url()));
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2, hasTouch: vp.touch, isMobile: vp.touch });
    await page.goto(`${BASE}/tetris.html`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 500));

    let s = await page.evaluate(SNAP);

    // ── 顶栏 ──
    check(s.hudScore !== null && s.hudBox && s.hudBox.h > 0, '顶栏有分数 HUD 且可见',
        `hudScore=${s.hudScore} box=${JSON.stringify(s.hudBox)}`);
    check(s.theme.exists && s.theme.visible && s.theme.svg, '主题钮是可见的图标钮（inline SVG）',
        `exists=${s.theme.exists} visible=${s.theme.visible} svg=${s.theme.svg}`);
    check(s.theme.text === '', '主题钮不含文字子节点（文案只在 aria-label / title）', `text="${s.theme.text}"`);
    check((s.theme.label || '').length > 0, '主题钮有 aria-label 供读屏', `label="${s.theme.label}"`);
    if (!isDesktop) {
        check(s.stat.exists && s.stat.visible && s.stat.svg, 'Stats 钮在移动端可见且为图标钮',
            `visible=${s.stat.visible} svg=${s.stat.svg}`);
        check(s.stat.box && s.stat.box.w >= 36 && s.stat.box.h >= 36,
            'Stats 钮有足够触控热区', JSON.stringify(s.stat.box));
        check(s.theme.box && s.theme.box.w >= 36 && s.theme.box.h >= 36,
            '主题钮有足够触控热区', JSON.stringify(s.theme.box));
        check(s.sidebar.display === 'none', '移动端侧栏让位（display:none）', `display=${s.sidebar.display}`);
        check(s.panelsParent === 'statsDrawerBody', '面板在移动端挂在抽屉内容区', `parent=${s.panelsParent}`);
    } else {
        check(!s.stat.visible, '桌面端 Stats 钮隐藏', `visible=${s.stat.visible}`);
        check(s.drawer.hidden === true, '桌面端抽屉不呈现', `hidden=${s.drawer.hidden}`);
        check(s.sidebar.visible === true, '桌面端侧栏常驻', `display=${s.sidebar.display}`);
        check(s.panelsParent === 'infoPanel', '面板在桌面端挂在侧栏里', `parent=${s.panelsParent}`);
        check(s.theme.box && s.theme.box.w >= 36, '桌面端主题钮仍有正常尺寸', JSON.stringify(s.theme.box));
    }

    // 热区外扩伪元素不能变成隐形全页命中层（用远点断言）
    const strayHit = await page.evaluate(() => {
        const btn = document.querySelector('#statsToggle') || document.querySelector('#themeToggle');
        if (!btn) return null;
        const r = btn.getBoundingClientRect();
        const probe = [
            [window.innerWidth / 2, window.innerHeight / 2],
            [r.left + r.width / 2, r.bottom + 60],
        ];
        return probe.map(([x, y]) => {
            const el = document.elementFromPoint(x, y);
            return el ? (el.id || el.className || el.tagName) : null;
        });
    });
    if (strayHit && !isDesktop) {
        const stolen = strayHit.some(t => /\bstatsToggle\b|\bthemeToggle\b/.test(String(t)));
        check(!stolen, '顶栏钮的远点不命中（无隐形全页命中层）', JSON.stringify(strayHit));
    }

    if (SHOTS) await page.screenshot({ path: `${SHOTS}/vp-${vp.width}-top.png` });

    // ── 抽屉开合（移动端） ──
    if (!isDesktop) {
        // 先开始一局，让"强制暂停"有可验证的对象
        await domClick(page, '#startBtn');
        await new Promise(r => setTimeout(r, 700));
        const before = await page.evaluate(SNAP);
        check(before.paused === false && before.animating === true, '开局后游戏在跑（为暂停断言建立基线）',
            `paused=${before.paused} animating=${before.animating}`);

        // 点 Stats 打开（用真实鼠标点击，验证热区真的可点）
        await page.click('#statsToggle');
        await new Promise(r => setTimeout(r, 500));
        const opened = await page.evaluate(SNAP);
        const panelH = opened.drawer.panelBox ? opened.drawer.panelBox.h : 0;

        check(opened.drawer.hidden === false && opened.drawer.open === true,
            '点击后抽屉呈现并带上 .is-open', `hidden=${opened.drawer.hidden} open=${opened.drawer.open}`);
        check(parseFloat(opened.drawer.opacity) > 0.9, '遮罩已淡入（opacity≈1）', `opacity=${opened.drawer.opacity}`);
        check(opened.drawer.panelBox && opened.drawer.panelBox.y < opened.view.h + 1,
            '面板已滑入视口', JSON.stringify(opened.drawer.panelBox));
        // 面板高度上限：断言**授权值来自 CSS 源码**。
        // getComputedStyle().maxHeight 返回的是解析后的 px（dvh 已被换算），
        // 拿它去匹配 /dvh/ 是必然失败的错断言 —— 改为读源码里的 --drawer-max。
        check(panelMaxHIsDvh(opened.drawer.panelMaxH),
            '面板高度上限来自 90dvh 变量（避开移动端地址栏伸缩）',
            `解析后 max-height=${opened.drawer.panelMaxH}`);
        // 面板高度随内容增长，且绝不超过上限
        const cap = Math.min(opened.view.h * 0.9, opened.view.h);
        check(panelH > 0 && panelH <= cap + 1,
            '面板高度随内容增长且不越过 90dvh 上限',
            `面板 ${panelH}px / 上限约 ${Math.round(cap)}px（视口 ${opened.view.h}）`);
        const bodyOverflows = opened.drawer.bodyScrollH > opened.drawer.bodyClientH;
        check(bodyOverflows ? panelH >= opened.view.h * 0.9 - 2 : panelH > 0,
            bodyOverflows ? '内容溢出时面板已撑到 90dvh 档位' : '内容未溢出，面板按内容高度呈现',
            `body scrollH=${opened.drawer.bodyScrollH} clientH=${opened.drawer.bodyClientH} 面板=${panelH}px`);
        check(opened.paused === true, '打开抽屉时游戏被强制暂停', `paused=${opened.paused}`);
        check(opened.animating === false, '暂停后主循环已停（animationId 已清）', `animating=${opened.animating}`);
        check(opened.bodyLocked === true, '背景滚动已锁（body.drawer-locked）', `locked=${opened.bodyLocked}`);
        check(opened.bodyPosition !== 'fixed', '锁滚动没有把 body 变成 position:fixed（会永久滚不动）',
            `position=${opened.bodyPosition}`);
        check(opened.stat.aria === 'true', 'Stats 钮 aria-expanded=true', `aria=${opened.stat.aria}`);
        check(opened.drawer.role === 'dialog' && opened.drawer.ariaModal === 'true',
            '面板 role=dialog / aria-modal=true', `role=${opened.drawer.role} modal=${opened.drawer.ariaModal}`);
        check(opened.sidebar.display === 'none' && opened.panelsParent === 'statsDrawerBody',
            '抽屉里渲染的是同一份面板实例', `parent=${opened.panelsParent}`);

        // 面板搬进抽屉后，页内主文档会被显著缩短：确认"能滚到底且真的到得了底"
        // （旧的顶栏脚本假设 scrollTop 能给到 250，缩短后只到得了 maxScroll，
        //   属预期变化而非回归 —— 这里按真实边界断言）
        const edge = await page.evaluate(() => {
            const sc = document.scrollingElement;
            const max = sc.scrollHeight - window.innerHeight;
            sc.scrollTop = 999999;
            return { max, reached: sc.scrollTop };
        });
        check(edge.reached >= Math.max(0, edge.max - 1),
            '页面能滚到真实边界（不会被 overflow 传播卡住）',
            `上限 ${edge.max} 实到 ${edge.reached}`);
        await page.evaluate(() => { document.scrollingElement.scrollTop = 0; });

        // 抽屉内容区可滚（比视口高也不怕）
        check(opened.drawer.bodyScrollH !== null, '抽屉内容区存在可度量高度',
            `scrollH=${opened.drawer.bodyScrollH} clientH=${opened.drawer.bodyClientH}`);

        if (SHOTS) await page.screenshot({ path: `${SHOTS}/vp-${vp.width}-drawer-open.png` });

        // 关闭路径 1：Esc
        await page.keyboard.press('Escape');
        await new Promise(r => setTimeout(r, 500));
        const closed = await page.evaluate(SNAP);
        check(closed.drawer.hidden === true && closed.drawer.open === false,
            'Esc 关闭抽屉', `hidden=${closed.drawer.hidden}`);
        check(closed.bodyLocked === false, '关闭后背景滚动锁解除', `locked=${closed.bodyLocked}`);
        check(closed.stat.aria === 'false', 'Stats 钮 aria-expanded=false', `aria=${closed.stat.aria}`);
        check(closed.paused === false, '关闭后恢复「因抽屉而暂停」的那一次暂停（游戏继续）',
            `paused=${closed.paused} animating=${closed.animating}`);

        // 关闭路径 2：关闭钮
        await page.click('#statsToggle');
        await new Promise(r => setTimeout(r, 450));
        const focusInDrawer = await page.evaluate(() =>
            !!document.activeElement && !!document.activeElement.closest('#statsDrawer'));
        check(focusInDrawer, '打开后焦点进入抽屉（键盘用户不会在背景里迷路）');
        await domClick(page, '#statsClose');
        await new Promise(r => setTimeout(r, 550));
        const closed2 = await page.evaluate(SNAP);
        check(closed2.drawer.hidden === true, '关闭钮可关闭抽屉', `hidden=${closed2.drawer.hidden}`);

        // 关闭路径 3：点遮罩
        await page.click('#statsToggle');
        await new Promise(r => setTimeout(r, 450));
        await page.evaluate(() => {
            const d = document.getElementById('statsDrawer');
            d.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 20, clientY: 8 }));
        });
        await new Promise(r => setTimeout(r, 550));
        const closed3 = await page.evaluate(SNAP);
        check(closed3.drawer.hidden === true, '点遮罩可关闭抽屉', `hidden=${closed3.drawer.hidden}`);

        // 用户自己的暂停不该被抽屉"顺手解掉"
        await domClick(page, '#pauseBtn');
        await new Promise(r => setTimeout(r, 300));
        const userPaused = await page.evaluate(SNAP);
        await page.click('#statsToggle');
        await new Promise(r => setTimeout(r, 450));
        // 打开时已经暂停，不能再叠加一次 toggle（否则会反而继续）
        const openedWhileUserPaused = await page.evaluate(SNAP);
        check(openedWhileUserPaused.paused === true, '用户已暂停时打开抽屉不会把它切成继续',
            `paused=${openedWhileUserPaused.paused}`);
        await domClick(page, '#statsClose');
        await new Promise(r => setTimeout(r, 550));
        const stillPaused = await page.evaluate(SNAP);
        check(userPaused.paused === true && stillPaused.paused === true,
            '用户先手动暂停时，抽屉关闭不会误恢复游戏',
            `before=${userPaused.paused} after=${stillPaused.paused}`);

        // 收尾：恢复继续，避免影响后续视口
        await domClick(page, '#pauseBtn');
        await new Promise(r => setTimeout(r, 200));
        const resumed = await page.evaluate(SNAP);
        check(resumed.paused === false, '收尾时游戏已恢复继续', `paused=${resumed.paused}`);
    }

    const realErrs = errs.filter(e => !isNoise(e));
    if (realErrs.length) check(false, '无运行时错误（已滤除本地已知噪声）', realErrs.slice(0, 3).join(' | '));
    else check(true, '无运行时错误（已滤除本地已知噪声）');

    await page.close();
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
if (failures.length) {
    console.log('失败清单：');
    failures.forEach(f => console.log('  · ' + f));
}
await browser.close();
process.exit(fail ? 1 : 0);
