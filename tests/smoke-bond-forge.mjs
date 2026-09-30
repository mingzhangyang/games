#!/usr/bin/env node
/**
 * smoke-bond-forge — bond-forge（键合工坊）页运行时冒烟 + 最小可玩性路径。
 *
 * 几何/元素存在性只能证明「页面长得对」，测不出「游戏能玩」。本脚本走真实交互链：
 *   menu → startLevel(0) 水 → canvas 位图非空 → 托盘拖出 2 个 H 分别接到 O
 *   → canon 判定成键 → 通关结算 → HUD drags ≥2 → 星级写入 bf_progress
 *
 * 关键：
 *   · 坐标一律由页面实时状态（window.bfGame.atoms / .tray）换算，不硬编码像素 ——
 *     硬编码会在任何布局调整后静默失准。
 *   · 拖拽必须分多步 move（模拟真实指针）。
 *   · 语言态显式 setItem('site_lang','zh')（headless 默认 en-US）。
 *   · 同分异构体（乙醇/二甲醚）单独走一遍：拼出二甲醚时**不能**判通关。
 */
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';

const BASE = process.argv.find(a => a.startsWith('http')) || 'http://127.0.0.1:8899';
const fails = [];
const fail = m => fails.push(m);
const ok = [];
const pass = m => ok.push(m);

const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: LAUNCH_ARGS,
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
const errs = [];
page.on('pageerror', e => errs.push(String(e.message || e).split('\n')[0]));
await page.evaluateOnNewDocument(() => {
    try {
        localStorage.clear();
        localStorage.setItem('site_lang', 'zh');
    } catch (e) { /* ignore */ }
});
await page.goto(`${BASE}/bond-forge.html`, { waitUntil: 'networkidle0', timeout: 45000 });
await new Promise(r => setTimeout(r, 900));

/* ── 1. bootstrap ── */
const boot = await page.evaluate(() => ({
    hasGame: !!window.bfGame,
    hasDrawer: !!window.bfDrawer,
    state: window.bfGame ? window.bfGame.state : null,
    startVisible: !document.getElementById('bf-start').classList.contains('hidden'),
    hudLevel: document.getElementById('bf-hud-level').textContent,
    titleZh: document.title,
    moreCards: document.querySelectorAll('#bfSideMore a').length,
    canvasW: document.getElementById('bf-canvas').width,
    levelGrid: document.querySelectorAll('#bf-level-grid button').length,
    cheatRows: document.querySelectorAll('#bf-cheat-body .bf-cheat-row').length,
}));
if (!boot.hasGame) fail('window.bfGame 未创建（boot 失败）');
if (!boot.hasDrawer) fail('createStatsDrawer 未初始化');
if (boot.state !== 'menu') fail(`初始 state 应为 menu，got ${boot.state}`);
if (!boot.startVisible) fail('开始覆盖层未显示');
if (boot.levelGrid !== 20) fail(`关卡格应渲染 20 个（实际 ${boot.levelGrid}）`);
if (boot.cheatRows < 9) fail(`元素小抄应有 9 行（实际 ${boot.cheatRows}）`);
if (boot.moreCards < 1) fail('桌面侧栏「更多游戏」未渲染');
if (!boot.canvasW || boot.canvasW < 200) fail(`canvas 后端缓冲未按 CSS 尺寸重算: ${boot.canvasW}`);
if (errs.length) fail(`首屏 JS 运行时错误: ${errs.slice(0, 2).join(' | ')}`);
pass('bootstrap：句柄/初始态/20 关格/小抄/更多游戏');

/* ── 2. canvas 位图非空（真画了东西） ── */
const pixels = await page.evaluate(() => {
    const c = document.getElementById('bf-canvas');
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let ink = 0;
    for (let i = 0; i < d.length; i += 40) {
        // 背景是深靛蓝渐变（#141a38→#0a0c1c），"有内容"的判据是显著偏离底色
        if (d[i] > 60 || d[i + 1] > 60 || d[i + 2] > 90) ink++;
    }
    return ink;
});
if (pixels < 20) fail(`canvas 位图近乎全空（ink=${pixels}）`);
else pass(`canvas 位图非空（ink=${pixels}）`);

/* ── 3. 开局 L1 水：placed=[O] + tray=[H,H] ── */
await page.evaluate(() => { window.bfGame.startLevel(0); });
await new Promise(r => setTimeout(r, 500));

const l1 = await page.evaluate(() => {
    const g = window.bfGame;
    return {
        state: g.state,
        levelId: g.level ? g.level.id : null,
        par: g.par,
        drags: g.drags,
        atoms: g.atoms.map(a => ({ sym: a.sym, x: a.x, y: a.y })),
        trayFree: g.tray.filter(t => !t.used).map(t => t.sym),
        startHidden: document.getElementById('bf-start').classList.contains('hidden'),
    };
});
if (l1.levelId !== 'bf-01-water') fail(`L1 应为 bf-01-water，got ${l1.levelId}`);
if (l1.par !== 2) fail(`L1 par 应为 2，got ${l1.par}`);
if (l1.atoms.length !== 1 || l1.atoms[0].sym !== 'O') fail(`L1 开局应只有 1 个 O，got ${JSON.stringify(l1.atoms)}`);
if (l1.trayFree.join(',') !== 'H,H') fail(`L1 托盘应有 2 个 H，got ${l1.trayFree.join(',')}`);
if (!l1.startHidden) fail('开局后开始覆盖层未隐藏');
else pass('L1 开局：placed=[O]、tray=[H,H]、par=2、覆盖层已隐藏');

/* ── 拖拽工具：把托盘第 n 个原子拖到目标坐标 ── */
async function dragTrayTo(targetXY) {
    const info = await page.evaluate(() => {
        const g = window.bfGame;
        const c = document.getElementById('bf-canvas');
        const rect = c.getBoundingClientRect();
        // 托盘几何由页面自己报出（trayGeometry），不在测试里复算 —— 见该方法注释
        const geo = g.trayGeometry();
        const free = geo.slots.filter(s => !s.used);
        if (!free.length) return null;
        const s = free[0];
        const toScreen = (lx, ly) => ({
            x: rect.left + (lx / 520) * rect.width,
            y: rect.top + (ly / 680) * rect.height,
        });
        return { from: toScreen(s.x, s.y), sym: s.sym };
    });
    if (!info) return null;

    const target = await page.evaluate(([lx, ly]) => {
        const c = document.getElementById('bf-canvas');
        const rect = c.getBoundingClientRect();
        return {
            x: rect.left + (lx / 520) * rect.width,
            y: rect.top + (ly / 680) * rect.height,
        };
    }, [targetXY.x, targetXY.y]);

    await page.mouse.move(info.from.x, info.from.y);
    await page.mouse.down();
    // 分多步移动（一步瞬移会让 hover 判定只跑最后一帧）
    for (let s = 1; s <= 8; s++) {
        await page.mouse.move(
            info.from.x + ((target.x - info.from.x) * s) / 8,
            info.from.y + ((target.y - info.from.y) * s) / 8,
        );
        await new Promise(r => setTimeout(r, 30));
    }
    await page.mouse.up();
    await new Promise(r => setTimeout(r, 220));
    return info.sym;
}

/* ── 4. 把两个 H 接到 O 上 ── */
const oPos = await page.evaluate(() => {
    const o = window.bfGame.atoms.find(a => a.sym === 'O');
    return { x: o.x, y: o.y };
});
const sym1 = await dragTrayTo({ x: oPos.x - 30, y: oPos.y + 6 });
const sym2 = await dragTrayTo({ x: oPos.x + 30, y: oPos.y + 6 });

const after = await page.evaluate(() => {
    const g = window.bfGame;
    return {
        state: g.state,
        drags: g.drags,
        bonds: g.bonds.length,
        bondOrders: g.bonds.map(b => b.order || 1),
        atomSyms: g.atoms.map(a => a.sym).sort().join(','),
        cleared: !document.getElementById('bf-clear').classList.contains('hidden'),
        stars: document.getElementById('bf-clear-stars').textContent,
        progress: (() => { try { return JSON.parse(localStorage.getItem('bf_progress') || '{}'); } catch (e) { return null; } })(),
    };
});
if (sym1 !== 'H' || sym2 !== 'H') fail(`应拖出两个 H，实际 ${sym1},${sym2}`);
if (after.atomSyms !== 'H,H,O') fail(`画布原子应为 H,H,O，got ${after.atomSyms}`);
if (after.bonds !== 2) fail(`水应有 2 根键，got ${after.bonds}`);
if (after.bondOrders.some(o => o !== 1)) fail(`水的键都应是单键，got ${after.bondOrders.join(',')}`);
if (after.drags !== 2) fail(`拖拽数应为 2，got ${after.drags}`);
if (!after.cleared) fail('拼出 H₂O 后未弹出结算面板');
if (after.state !== 'clear') fail(`通关后 state 应为 clear，got ${after.state}`);
if (after.stars !== '★★★') fail(`drags=par 应给 3 星，got "${after.stars}"`);
if (!after.progress || !after.progress['bf-01-water']) fail('星级未写入 bf_progress');
else if (after.progress['bf-01-water'].stars !== 3) fail(`存档星级应为 3，got ${after.progress['bf-01-water'].stars}`);
if (errs.length) fail(`对局中 JS 运行时错误: ${errs.slice(0, 2).join(' | ')}`);
else pass('L1 通关：拖 2 个 H 接 O → 2 根单键 → 3 星 → 结算 → 存档');

/* ── 5. 价键上限：碳不能接第 5 根键 ──
 *
 * 本步测的是**价键规则**，不是托盘供给，所以直接往台面上摆 5 个氢再逐个
 * tryBond()，不去掏托盘（甲烷关托盘只有 4 个 H，掏第 5 个只会拿到 undefined
 * 而把测试自己搞崩 —— 那是测试的 bug，不是游戏的）。
 */
await page.evaluate(() => { window.bfGame.startLevel(1); });
await new Promise(r => setTimeout(r, 400));

const hLimit = await page.evaluate(() => {
    const g = window.bfGame;
    const c = g.atoms.find(a => a.sym === 'C');
    const tries = [];
    for (let i = 0; i < 5; i++) {
        const id = g.nextId++;
        const h = { id, sym: 'H', x: c.x + 46 + i * 8, y: c.y };
        g.atoms.push(h);
        const before = g.bonds.length;
        g.tryBond(h, c);
        tries.push({ added: g.bonds.length > before, bonds: g.bonds.length });
    }
    return { tries, bondCount: g.bonds.length };
});
if (hLimit.bondCount !== 4) {
    fail(`碳的价键上限应为 4（第 5 次必须被拒），实际成了 ${hLimit.bondCount} 根`);
} else {
    pass(`碳的价键上限生效：连续 5 次尝试只成 4 根键（第 5 次被拒）`);
}

/* ── 5b. 多重键：同一对原子反复拖 → 键级累加，且不超价键上限 ── */
await page.evaluate(() => { window.bfGame.startLevel(0); });   // 水（O 上限 2）
await new Promise(r => setTimeout(r, 300));
const multi = await page.evaluate(() => {
    const g = window.bfGame;
    const o = g.atoms.find(a => a.sym === 'O');
    const id = g.nextId++;
    const x = { id, sym: 'O', x: o.x + 120, y: o.y };
    g.atoms.push(x);
    const seq = [];
    for (let i = 0; i < 4; i++) {
        g.tryBond(x, o);   // 反复拖同一对 → 每次尝试 +1 级
        const b = g.bonds.find(z => (z.a === x.id && z.b === o.id) || (z.b === x.id && z.a === o.id));
        seq.push(b ? (b.order || 1) : 0);
    }
    return { seq, bondCount: g.bonds.length };
});
// O 的上限是 2：第一次成单键(1)、第二次升双键(2)、第三次/第四次必须被拒
if (multi.seq[0] !== 1 || multi.seq[1] !== 2) {
    fail(`O–O 键级应累加到 2（实得 ${multi.seq.join('→')}）`);
} else if (multi.seq[2] !== 2 || multi.seq[3] !== 2) {
    fail(`O–O 键级超过 2 后必须被拒（实得 ${multi.seq.join('→')}）`);
} else if (multi.bondCount !== 1) {
    fail(`同一对原子之间只应有 1 条键记录（实得 ${multi.bondCount}）`);
} else {
    pass(`多重键是"拧"出来的：O–O 键级 ${multi.seq.join('→')}（上限 2，第 3 次起被拒）`);
}

/* ── 6. 同分异构体必须可区分：乙醇关拼成二甲醚 ≠ 通关 ──
 *
 * 这是本作的招牌教学点，也是唯一会让"数元素个数"式实现翻车的地方：
 * 乙醇和二甲醚都是 C₂H₆O。这里直接在 L17 关的台面上按二甲醚的拓扑接线，
 * 断言 game 状态**不能**变成 clear。
 */
const iso = await page.evaluate(() => {
    const g = window.bfGame;
    // 找到 bf-17（乙醇 / 异构体教学关）
    const levels = g.allLevels();
    const i = levels.findIndex(l => l.id === 'bf-17-ethanol-vs-ether');
    if (i < 0) return { found: false };
    g.startLevel(i);
    // 用二甲醚的拓扑手工摆原子：C–O–C 骨架 + 6 个 H
    g.atoms = [];
    g.bonds = [];
    g.tray.forEach(t => { t.used = false; });
    const mk = (sym, x, y) => {
        const id = g.nextId++;
        g.atoms.push({ id, sym, x, y });
        return id;
    };
    const c1 = mk('C', 170, 260);
    const o = mk('O', 260, 260);
    const c2 = mk('C', 350, 260);
    g.bonds.push({ a: c1, b: o, order: 1 }, { a: o, b: c2, order: 1 });
    // 每个碳补 3 个 H，凑成 C₂H₆O 的二甲醚
    [c1, c2].forEach((ci, k) => {
        for (let j = 0; j < 3; j++) {
            const h = mk('H', 120 + k * 180 + j * 26, 200 + j * 30);
            g.bonds.push({ a: ci, b: h, order: 1 });
        }
    });
    g.drags = 9;
    g.checkProgress();
    return {
        found: true,
        levelId: g.level ? g.level.id : null,
        state: g.state,
        atomCount: g.atoms.length,
        bondCount: g.bonds.length,
    };
});
if (!iso.found) fail('未找到 bf-17 异构体教学关');
else if (iso.state === 'clear') fail('拼成二甲醚却判成了乙醇关通关（同分异构体未被区分）');
else pass(`异构体判定：L17 拼成二甲醚不判通关（state=${iso.state}, ${iso.atomCount} 原子/${iso.bondCount} 键）`);

/* ── 8. 沙盒入口：清盘 + 满元素盘 + 不判定通关 ──
 *
 * 回归的正是 M1 收尾时发现的那个洞：`startSandbox()` 早期只写了
 * `this.level = null` 就 return，没有重置棋盘。后果是从某一关点「自由搭建」，
 * 上一关的原子和半成品键会原地留着 —— 玩家以为进了空沙盒，实际在拖残留物。
 * 本步先用真实关卡把台面铺满，再进沙盒，断言台面被清空且托盘是满的。
 */
await page.evaluate(() => { window.bfGame.startLevel(0); });
await new Promise(r => setTimeout(r, 300));
const sandbox = await page.evaluate(() => {
    const g = window.bfGame;
    // 先在关卡里堆点东西，确保"残留"这件事真的有可能发生。
    // ⚠️ L1 开局台面只有 1 个 O，且 O 的价键上限是 2 ⇒ 最多再接 2 个 H 就满了。
    //    这里显式 push 原子再成键（**不掏托盘** —— 掏了会把托盘那 2 个 H 用掉，
    //    后面"满元素盘"的断言就失去意义了）。
    const o = g.atoms[0];
    const h1 = { id: g.nextId++, sym: 'H', x: o.x - 46, y: o.y + 30 };
    g.atoms.push(h1);
    g.tryBond(h1, o);
    const beforeAtoms = g.atoms.length;
    const beforeBonds = g.bonds.length;

    g.startSandbox();
    return {
        beforeAtoms,
        beforeBonds,
        mode: g.mode,
        level: g.level ? g.level.id : null,
        state: g.state,
        atoms: g.atoms.length,
        bonds: g.bonds.length,
        trayTotal: g.tray.length,
        trayFree: g.tray.filter(t => !t.used).length,
        par: g.par,
        hudLevel: document.getElementById('bf-hud-level').textContent,
        parText: document.getElementById('bf-par').textContent,
        clearHidden: document.getElementById('bf-clear').classList.contains('hidden'),
    };
});
if (sandbox.mode !== 'sandbox') fail(`startSandbox 后 mode 应为 sandbox，got ${sandbox.mode}`);
if (sandbox.level !== null) fail(`沙盒不应有关卡对象，got ${sandbox.level}`);
if (sandbox.beforeAtoms < 2) fail(`前置条件失败：进沙盒前台面应已有内容（got ${sandbox.beforeAtoms} 原子）`);
if (sandbox.atoms !== 0 && sandbox.bonds !== 0) fail(`沙盒未清盘：残留 ${sandbox.atoms} 原子 / ${sandbox.bonds} 键`);
if (sandbox.trayFree < 8) fail(`沙盒托盘应有满元素盘（自由 ${sandbox.trayFree} 个，期望 ≥8）`);
if (!sandbox.clearHidden) fail('进沙盒不该弹出结算面板');
if (/0\/20|0\/0/.test(sandbox.hudLevel)) fail(`沙盒 HUD 不应显示关卡号，got "${sandbox.hudLevel}"`);
if (sandbox.parText.trim() !== '') fail(`沙盒不应显示 par 读数，got "${sandbox.parText}"`);
// 沙盒里拼个完整分子也不能被判通关（level=null ⇒ checkProgress 短路）
const sandboxClear = await page.evaluate(() => {
    const g = window.bfGame;
    const c1 = { id: g.nextId++, sym: 'H', x: 200, y: 300 };
    const o = { id: g.nextId++, sym: 'O', x: 260, y: 300 };
    const c2 = { id: g.nextId++, sym: 'H', x: 320, y: 300 };
    g.atoms.push(c1, o, c2);
    g.bonds.push({ a: c1.id, b: o.id, order: 1 }, { a: o.id, b: c2.id, order: 1 });
    g.checkProgress();
    return { state: g.state, clearHidden: document.getElementById('bf-clear').classList.contains('hidden') };
});
if (sandboxClear.state === 'clear' || !sandboxClear.clearHidden) {
    fail('沙盒里拼出 H₂O 被判成通关（沙盒不该判定通关）');
} else {
    pass(`沙盒：清盘（原 ${sandbox.beforeAtoms} 原子/${sandbox.beforeBonds} 键 → 0）、满盘 ${sandbox.trayFree} 个、不判定通关`);
}

/* ── 7. 每日挑战：确定性 + 有 5 关 ── */
await page.evaluate(() => { window.bfGame.startLevel(0); });
await new Promise(r => setTimeout(r, 200));
const daily = await page.evaluate(() => {
    const g = window.bfGame;
    const a = g.buildDailyCourse().map(l => l && l.id);
    const b = g.buildDailyCourse().map(l => l && l.id);
    return { a, b, same: JSON.stringify(a) === JSON.stringify(b) };
});
if (daily.a.length !== 5) fail(`每日应有 5 关，got ${daily.a.length}`);
if (!daily.same) fail('每日赛程应确定性（同一天两次调用不一致）');
else pass(`每日赛程：5 关且同一天内确定性 [${daily.a.slice(0, 2).join(',')}…]`);

/* ── 9. 托盘几何：任何托盘规模都不许溢出/重叠 ──
 *
 * 回归的是沙盒那个洞：旧 `trayGeometry()` 用 `slot = min(58, (W-40)/n)` 单行排布，
 * 18 个原子时 pitch ≈ 26.7px，而碳直径 44、槽位圈直径 48 ⇒ 原子互相叠压，
 * 整行还从台面右侧溢出去（截图里 Na 被裁掉一半）。修法是折行 + 均分 + 必要时压缩槽距。
 * 这里对 1..20 个原子的**每一种规模**都断言落点不越界。
 */
const trayGeom = await page.evaluate(() => {
    const g = window.bfGame;
    const slotR = 24;
    const rows = [];
    const saved = g.tray.slice();
    for (let n = 1; n <= 20; n++) {
        g.tray = [];
        for (let i = 0; i < n; i++) g.tray.push({ sym: 'C', used: false });
        const geo = g.trayGeometry();
        const xs = geo.slots.map(s => s.x);
        const ys = geo.slots.map(s => s.y);
        // 越界：最左/最右槽位的圆边必须落在 [0, W]
        const minX = Math.min(...xs) - slotR;
        const maxX = Math.max(...xs) + slotR;
        // 重叠：同一行（y 相近）内相邻槽距必须 > 0（留一点余量，避免贴死）
        let worstGap = Infinity;
        for (let i = 0; i + 1 < geo.slots.length; i++) {
            const a = geo.slots[i], b = geo.slots[i + 1];
            if (Math.abs(a.y - b.y) < 1) worstGap = Math.min(worstGap, Math.abs(b.x - a.x));
        }
        rows.push({ n, nRows: geo.rows, minX, maxX, worstGap: worstGap === Infinity ? null : worstGap, distinctY: new Set(ys).size });
    }
    g.tray = saved;
    return rows;
});
const oob = trayGeom.filter(r => r.minX < -0.5 || r.maxX > 520.5);
const tooTight = trayGeom.filter(r => r.worstGap !== null && r.worstGap <= 48);
const tooTall = trayGeom.filter(r => r.nRows > 2);
if (oob.length) fail(`托盘越界（n=${oob.map(r => r.n).join(',')}）`);
if (tooTight.length) fail(`托盘槽距不足 48px（会叠压，n=${tooTight.map(r => r.n).join(',')}）`);
if (tooTall.length) fail(`托盘行数超过 2（会画出背板，n=${tooTall.map(r => r.n).join(',')}）`);
if (!oob.length && !tooTight.length && !tooTall.length) {
    const n18 = trayGeom.find(r => r.n === 18);
    pass(`托盘几何：n=1..20 全部不越界不叠压（n=18 → ${n18.nRows} 行、x[${n18.minX.toFixed(0)}..${n18.maxX.toFixed(0)}]）`);
}

await browser.close();

/* ── 结果 ── */
console.log('');
ok.forEach(m => console.log('  ✓ ' + m));
if (fails.length) {
    console.log('');
    fails.forEach(m => console.log('  ✗ ' + m));
    console.log(`\nsmoke-bond-forge: 失败 ${fails.length} 项`);
    process.exit(1);
}
console.log('\nsmoke-bond-forge: 全部通过');
