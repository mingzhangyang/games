#!/usr/bin/env node
// 游戏封面图：首页「新上线」卡片封面 + 游戏页 og:image，都从游戏自己的美术生成，不另画占位图。
//
//   node tools/generators/game-covers.mjs            生成全部
//   node tools/generators/game-covers.mjs <id> ...   只生成指定游戏
//
// 每个配方产出两张（原样复制进 dist 的 public/）：
//   public/assets/home-covers/<id>.webp   640×360   首页新上线卡片（卡片 260×146 的 2.5 倍）
//   public/assets/seo/og-<id>.jpg         1200×630  社交分享预览（多数平台不渲染 SVG og:image，所以用 JPEG）
// gen 优先用这些产物，没有才退回 og-<id>.svg（docs/proposal-home-layout.md §7.2）。
// 来源：
//   - art   ：手绘概念图，按 crop 裁出横幅（源坐标为 0–1 比例，高度按目标宽高比由宽度决定）；
//   - game  ：在真实游戏里摆到一个好看的状态（影织把「兔」摆到解；萤火信号用测试求解器在 Node 里
//             解「仲夏」、在浏览器里按同 seed 同输入回放到通关，取全场齐闪的一帧），
//             直接取画布像素裁切——不截 DOM，所以没有顶栏 / 按钮。
// 编码由 Chromium 的 canvas.toDataURL 完成；产物入库，不在构建 / CI 里重跑。
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from '../lib/browser.mjs';
import { registry } from '../lib/registry.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 8931;
const BASE = `http://127.0.0.1:${PORT}`;

// 首页封面只给会出现在「新上线」横排里的游戏（registry 有 home.addedAt），分享图每款都出
const isListedAsNew = id => Boolean(registry.all().find(g => g.id === id)?.home?.addedAt);
const OUTPUTS = [
    { file: id => `public/assets/home-covers/${id}.webp`, w: 640, h: 360, type: 'image/webp', quality: 0.84, when: isListedAsNew },
    { file: id => `public/assets/seo/og-${id}.jpg`, w: 1200, h: 630, type: 'image/jpeg', quality: 0.86 },
];

const RECIPES = {
    // 拔萝卜：小女孩拔萝卜、鼹鼠扒着萝卜——人物、萝卜、鼹鼠都要在画里
    'carrot-pull': { kind: 'art', src: '/assets/carrot-pull/reference/concept-garden.webp', crop: [0, 0.21] },
    // 针尖对麦芒：月下水墨群山 + 擂台，取月亮与山门
    'needle-awn': { kind: 'art', src: '/assets/needle-awn/reference/concept-arena.webp', crop: [0, 0.03] },
    // 影织的舞台有 CSS 宽度上限，画布像素只能靠更大的视口换来
    'shadow-loom': { kind: 'game', capture: captureShadowLoom, crop: [0.1, 0.2, 0.8], viewport: { width: 1080, height: 1920, deviceScaleFactor: 2 } },
    // 萤火信号是沉浸式舞台，视口会改变取景；540×960 时湖面 + 草地齐闪的构图最好
    'firefly-signal': { kind: 'game', capture: captureFireflySignal, crop: [0, 0.5], viewport: { width: 540, height: 960, deviceScaleFactor: 2 } },
    // 数字雨：星空天文台穹顶（就是游戏背景的原画）
    'math-rain': { kind: 'art', src: '/assets/math-rain/reference/concept-observatory.webp', crop: [0, 0.02] },
    // 以下三款的美术是 SVG 部件（图层 / 地块 / 精灵图集），单独的概念图很简陋，所以取真实游戏画面
    'tower-defense': { kind: 'game', capture: captureTowerDefense, crop: [0, 0.12], viewport: { width: 1600, height: 1000, deviceScaleFactor: 2 } },
    // 坦克大战的画布固定 800×600 且开局战场很空：改用它自己的 SVG 精灵（地块 / 砖墙 / 钢板 / 坦克 / 道具）
    // 摆一幕放大的交火场景，矢量直接按目标分辨率光栅化，不放大发糊
    'tank-battle': { kind: 'game', capture: composeTankBattle, crop: [0, 0] },
    // 蛛丝引露：露珠、星点与玉盏（目标）都在画里
    'silk-dew': { kind: 'game', capture: captureSilkDew, crop: [0, 0.455], viewport: { width: 540, height: 960, deviceScaleFactor: 2 } },
};

/** 0–1 比例的裁切框 [x, y, w = 1] → 源像素；高度按输出宽高比由宽度决定，并保证落在图内 */
function fracRect(width, height, [fx, fy, fw = 1], aspect) {
    const w = width * fw;
    const h = w / aspect;
    const y = Math.min(height * fy, height - h);
    return { x: width * fx, y: Math.max(0, y), w, h };
}

/** 把 window.__coverSrc（图片或画布）的源矩形缩放进输出尺寸，在页面里编码 */
const encodeInPage = (page, rect, out) => page.evaluate(({ rect, out }) => {
    const canvas = document.createElement('canvas');
    canvas.width = out.w;
    canvas.height = out.h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(window.__coverSrc, rect.x, rect.y, rect.w, rect.h, 0, 0, out.w, out.h);
    return canvas.toDataURL(out.type, out.quality);
}, { rect, out });

/** 加载概念图到 window.__coverSrc，返回其像素尺寸 */
async function prepareArt(page, recipe) {
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    return page.evaluate(src => new Promise((res, rej) => {
        const img = new window.Image();
        img.onload = () => { window.__coverSrc = img; res({ w: img.naturalWidth, h: img.naturalHeight }); };
        img.onerror = rej;
        img.src = src;
    }), recipe.src);
}

/** 取舞台里最大的画布作 window.__coverSrc */
const pickCanvas = page => page.evaluate(() => {
    const c = [...document.querySelectorAll('.game-stage canvas, canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
    window.__coverSrc = c;
    return { w: c.width, h: c.height };
});

/** 影织：进「兔」，把每块纸片直接摆到内核算出的解（与 smoke / verify-shadow-loom-levels 同源） */
async function captureShadowLoom(page) {
    const { LEVELS } = await import(pathToFileURL(join(ROOT, 'src/games/shadow-loom/model/levels.js')));
    const R = await import(pathToFileURL(join(ROOT, 'src/games/shadow-loom/model/rules.js')));
    const { loadSilhouettes } = await import(pathToFileURL(join(ROOT, 'src/generated/shadow-loom/silhouettes.js')));
    await loadSilhouettes(LEVELS[0].id);
    const sol = R.compileLevel(LEVELS[0]).solution.pieces.map(p => ({ x: p.x, y: p.y }));
    await page.goto(`${BASE}/shadow-loom.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.slGame && window.slGame.state === 'menu', { timeout: 15000 });
    await page.evaluate(() => window.slGame.startLevel(0));
    await page.evaluate(pieces => pieces.forEach((p, i) => Object.assign(window.slGame.st.pieces[i], p)), sol);
    await new Promise(r => setTimeout(r, 600));
    return pickCanvas(page);
}

/** 萤火信号「仲夏」：测试求解器在 Node 里解出 (tick, id) 输入，浏览器按同 seed 同输入回放
 *  （smoke-firefly-signal 锁住了两边逐位一致）；通关后取第一个「大半草地同一 tick 闪光」的帧 */
async function captureFireflySignal(page) {
    const { LEVELS } = await import(pathToFileURL(join(ROOT, 'src/games/firefly-signal/levels.js')));
    const { solve } = await import(pathToFileURL(join(ROOT, 'tests/lib/firefly-solver.mjs')));
    const LEVEL = 2;
    const plan = solve(LEVELS[LEVEL]);
    if (!plan.won) throw new Error('firefly-signal：求解器没能解出「仲夏」，换关或调参数');
    await page.goto(`${BASE}/firefly-signal.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__fireflySignal, { timeout: 15000 });
    const shot = await page.evaluate(({ LEVEL, inputs }) => {
        const g = window.__fireflySignal;
        g.startLevel(LEVEL, { manual: true });
        let clock = 0;
        for (const { tick, id } of inputs) {
            while (g.sim.tick < tick) g.tick();
            clock += 1000; // 越过点击去抖（只看传入的时间戳，模拟不前进）
            if (!g.interveneOn(id, clock)) return { error: `tick ${tick} 点虫 #${id} 被拒` };
        }
        const total = g.sim.flies.length;
        for (let i = 0; i < 60 * 30; i++) {
            g.tick();
            if (g.sim.won && g.sim.flashed.length >= total * 0.6) {
                const flashed = g.sim.flashed.length;
                g.advance(1); // 闪光后一帧：环境光已铺开、光晕最亮
                return { tick: g.sim.tick, flashed, total };
            }
        }
        return { error: '通关后 30 秒内没有出现大半草地齐闪的帧' };
    }, { LEVEL, inputs: plan.inputs });
    if (shot.error) throw new Error(`firefly-signal：${shot.error}`);
    console.log(`  firefly-signal: 回放 ${plan.inputs.length} 次点击，tick ${shot.tick} 齐闪 ${shot.flashed}/${shot.total}`);
    return pickCanvas(page);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** 霓虹塔防：开局，沿航线两侧铺 8 座四种塔，发第一波，让真实循环跑几秒（敌人上路、塔在开火） */
async function captureTowerDefense(page) {
    await page.goto(`${BASE}/tower-defense.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.tdGame && !!window.__TD_GRID__, { timeout: 15000 });
    await page.click('#td-btn-play');
    await page.waitForFunction(() => window.tdGame?.state === 'playing', { timeout: 5000 });
    await page.evaluate(() => {
        const g = window.tdGame;
        const grid = window.__TD_GRID__;
        g.gold = 99999;
        const cells = [];
        for (let r = 0; r < grid.ROWS; r++) {
            for (let c = 0; c < grid.COLS; c++) {
                if (grid.pathGrid[r * grid.COLS + c] || g.towerAt(c, r) >= 0) continue;
                const nearPath = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => {
                    const nc = c + dc, nr = r + dr;
                    return nc >= 0 && nc < grid.COLS && nr >= 0 && nr < grid.ROWS && grid.pathGrid[nr * grid.COLS + nc];
                });
                if (nearPath) cells.push({ c, r });
            }
        }
        const types = ['pulse', 'frost', 'cannon', 'tesla'];
        for (let i = 0; i < 8; i++) {
            g.selectedCell = cells[Math.floor(((i + 0.5) * cells.length) / 8)];
            g.selectedTowerIdx = -1;
            g.tryBuild(types[i % types.length]);
        }
        g.selectedCell = null;
        g.startWave();
    });
    await sleep(6500);
    return page.evaluate(() => {
        window.__coverSrc = document.getElementById('td-canvas');
        return { w: window.__coverSrc.width, h: window.__coverSrc.height };
    });
}

/** 坦克大战：用游戏自己的 SVG 精灵在离屏画布上摆一幕交火（视野 500×262 游戏单位，×4.8 光栅化），
 *  精灵坐标与朝向都是游戏坐标系（800×600，坦克朝上为 0°） */
async function composeTankBattle(page) {
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    return page.evaluate(async () => {
        const A = '/assets/tank-battle/';
        const load = f => new Promise((res, rej) => { const i = new window.Image(); i.onload = () => res(i); i.onerror = rej; i.src = A + f; });
        const [ground, detail, brick, steel, player, enemy, boss, shield, weapon] = await Promise.all([
            'terrain/ground.svg', 'terrain/ground-detail.svg', 'tiles/brick.svg', 'tiles/steel.svg',
            'tanks/player.svg', 'tanks/enemy.svg', 'tanks/boss.svg', 'powerups/shield.svg', 'powerups/weapon.svg',
        ].map(load));
        const VW = 500, VH = 262.5, S = 4.8;
        const c = document.createElement('canvas');
        c.width = VW * S;
        c.height = VH * S;
        const ctx = c.getContext('2d');
        ctx.scale(S, S);
        for (let x = 0; x < VW; x += 40) for (let y = 0; y < VH; y += 40) ctx.drawImage(ground, x, y, 40, 40);
        ctx.drawImage(detail, -60, -90, 800, 600);
        const tile = (img, cx, cy, cols, rows) => { for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) ctx.drawImage(img, cx + i * 20, cy + j * 20, 20, 20); };
        tile(brick, 150, 60, 3, 2);
        tile(brick, 330, 150, 2, 3);
        tile(steel, 230, 170, 2, 1);
        tile(brick, 40, 40, 1, 3);
        tile(steel, 420, 40, 1, 2);
        const sprite = (img, x, y, size, deg) => {
            ctx.save(); ctx.translate(x, y); ctx.rotate((deg * Math.PI) / 180); ctx.drawImage(img, -size / 2, -size / 2, size, size); ctx.restore();
        };
        // 子弹轨迹：玩家朝右上的敌人开火，敌人回击
        ctx.lineCap = 'round';
        const shot = (x1, y1, x2, y2, color) => {
            const g = ctx.createLinearGradient(x1, y1, x2, y2);
            g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, color);
            ctx.strokeStyle = g; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x2, y2, 2.2, 0, Math.PI * 2); ctx.fill();
        };
        shot(118, 196, 118, 128, '#ffe066');
        shot(286, 84, 238, 84, '#ff8a5c');
        sprite(player, 118, 214, 34, 0);
        sprite(enemy, 304, 84, 30, 270);
        sprite(enemy, 222, 128, 30, 180);
        sprite(enemy, 446, 214, 30, 270);
        sprite(boss, 400, 96, 44, 225);
        sprite(shield, 60, 150, 18, 0);
        sprite(weapon, 270, 228, 18, 0);
        window.__coverSrc = c;
        return { w: c.width, h: c.height };
    });
}

/** 蛛丝引露：进第一关，等露珠与丝线在夜园里落定 */
async function captureSilkDew(page) {
    await page.goto(`${BASE}/silk-dew.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.sdGame, { timeout: 15000 });
    await page.evaluate(() => window.sdGame.startLevel(0));
    await sleep(1500);
    return pickCanvas(page);
}

async function main() {
    const only = process.argv.slice(2);
    const ids = only.length ? only : Object.keys(RECIPES);
    const unknown = ids.filter(id => !RECIPES[id]);
    if (unknown.length) throw new Error(`没有封面配方：${unknown.join(', ')}`);
    const server = spawn(process.execPath, [join(ROOT, 'tests/lib/serve-static.mjs'), String(PORT)], { cwd: ROOT, stdio: 'ignore' });
    try {
        for (let i = 0; i < 50; i++) {
            if (await fetch(`${BASE}/index.html`).then(r => r.ok, () => false)) break;
            await new Promise(r => setTimeout(r, 100));
        }
        const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });
        try {
            for (const id of ids) {
                const recipe = RECIPES[id];
                const page = await browser.newPage();
                // 真实游戏的画布按 CSS 尺寸 × 封顶的 DPR 分配像素，视口按配方定（概念图与视口无关）
                await page.setViewport(recipe.viewport || { width: 540, height: 960, deviceScaleFactor: 1 });
                await page.evaluateOnNewDocument(() => { try { localStorage.setItem('site_lang', 'zh'); } catch (e) { /* ignore */ } });
                const size = recipe.kind === 'art' ? await prepareArt(page, recipe) : await recipe.capture(page);
                for (const out of OUTPUTS.filter(o => !o.when || o.when(id))) {
                    const rect = fracRect(size.w, size.h, recipe.crop, out.w / out.h);
                    const dataUrl = await encodeInPage(page, rect, out);
                    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
                    const file = out.file(id);
                    mkdirSync(dirname(join(ROOT, file)), { recursive: true });
                    writeFileSync(join(ROOT, file), buf);
                    const upscale = out.w / rect.w > 1.05 ? `（源 ${Math.round(rect.w)}px 宽，放大 ${(out.w / rect.w).toFixed(2)}×）` : '';
                    console.log(`✓ ${file}  ${(buf.length / 1024).toFixed(1)} KiB${upscale}`);
                }
                await page.close();
            }
        } finally {
            await browser.close();
        }
    } finally {
        server.kill();
    }
}

main().catch(e => { console.error(e); process.exit(1); });
