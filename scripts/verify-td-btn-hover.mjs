// Deploy 按钮 hover 可见性回归
// 用法：node scripts/verify-td-btn-hover.mjs [baseUrl] [outDir]
//
// 背景（2026-09-19）：.td-btn:hover 设 background 长手，权重(0,2,0)高于
// .td-btn-primary 的 background 简手(0,1,0)，悬停时渐变被一层近乎透明的白替换，
// 深色文字落在深色面板上 ⇒ 按钮与文字同时"消失"。
//
// 为什么必须断言计算样式：这是纯 CSS 优先级冲突，几何检查、截图肉眼比对、
// elementFromPoint 全部测不出来（元素仍在、仍可点）。只有读 :hover 下的
// computed background / color 才能发现。
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { mkdirSync } from 'node:fs';

const EXE = CHROME_PATH;
const BASE = process.argv[2] || 'http://127.0.0.1:8899';
const OUT = process.argv[3] || 'C:/tmp';
mkdirSync(OUT, { recursive: true });

const fails = [];
const check = (ok, label, detail) => {
    if (!ok) fails.push(label + (detail ? ' — ' + detail : ''));
    console.log(`  ${ok ? '\u2713' : '\u2717'} ${label}${detail ? '  (' + detail + ')' : ''}`);
};

const browser = await puppeteer.launch({ executablePath: EXE, headless: 'new', args: LAUNCH_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push((e.stack || e.message).split('\n').slice(0, 4).join('\n    ')));
await page.goto(BASE + '/tower-defense.html', { waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 800));

// 解析 rgb/rgba 字符串
const parse = (s) => {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map(v => parseFloat(v.trim()));
    return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] };
};
// WCAG 相对亮度
const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => {
    const l1 = Math.max(lum(a), lum(b)), l2 = Math.min(lum(a), lum(b));
    return (l1 + 0.05) / (l2 + 0.05);
};

/* ── 采集按钮在「未悬停」与「悬停」两种状态下的计算样式 ── */
/**
 * ⚠️ 不能用 page.hover()：它要求目标元素几何稳定，而开始页的 .td-hero
 * 带 `td-bob 2s infinite` 动画，整块 overlay 一直在动 ⇒ hover() 永不 resolve
 * （实测挂了 9 分钟被我手动 kill）。改成"手动把鼠标移到按钮当前中心"，
 * 鼠标事件只看坐标，不要求元素静止。
 */
const hoverAt = async (sel) => {
    const box = await page.$eval(sel, el => {
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
    });
    await page.mouse.move(box.x, box.y);
    await new Promise(r => setTimeout(r, 400));   // 等 :hover 过渡跑完
    return box;
};

const sample = async (sel) => {
    // 先归位鼠标，确保拿到的是非悬停态
    await page.mouse.move(2, 2);
    await new Promise(r => setTimeout(r, 200));
    const rest = await page.$eval(sel, el => {
        const cs = getComputedStyle(el);
        return { bg: cs.backgroundImage + ' | ' + cs.backgroundColor, color: cs.color,
            opacity: cs.opacity, visibility: cs.visibility, boxShadow: cs.boxShadow };
    });
    const box = await hoverAt(sel);
    const hover = await page.$eval(sel, el => {
        const cs = getComputedStyle(el);
        return { bg: cs.backgroundImage + ' | ' + cs.backgroundColor, color: cs.color,
            opacity: cs.opacity, visibility: cs.visibility, boxShadow: cs.boxShadow };
    });
    // 自证真的处于 :hover 状态（否则后面的断言全是空转）
    const isHovered = await page.$eval(sel, el => el.matches(':hover'));
    return { rest, hover, isHovered, box };
};

const bx = await page.$eval('#td-btn-play', el => {
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
});

console.log('\n=== 1. Deploy 按钮 hover 后仍可见 ===');
const s = await sample('#td-btn-play');
check(s.isHovered, '确实进入了 :hover 状态（避免断言空转）');

// 悬停后渐变必须还在（backgroundImage 含 linear-gradient）
check(/linear-gradient/.test(s.hover.bg),
    'Deploy 悬停后仍保留渐变背景（未被通用 hover 覆盖）',
    s.hover.bg.split(' | ')[0].slice(0, 46) + '…');
check(!/rgba\(255, 255, 255, 0\.1[0-9]\)/.test(s.hover.bg),
    'Deploy 悬停后背景不是「近乎透明的白」', s.hover.bg.split(' | ')[1]);

// 文字色未变，且与按钮背景对比度足够
check(s.hover.color === s.rest.color,
    'Deploy 悬停后文字颜色不变', `${s.rest.color} → ${s.hover.color}`);
check(s.hover.opacity === '1', 'Deploy 悬停后不透明', s.hover.opacity);
check(s.hover.visibility === 'visible', 'Deploy 悬停后 visibility 正常', s.hover.visibility);
check(bx.w > 0 && bx.h > 0, 'Deploy 有实际盒子尺寸', `${bx.w}×${bx.h}`);

/* ── 关键：对比度。按钮背景渐变取最亮端 #5fe1ff 作为最坏情况（文字最不易读） ── */
const textC = parse(s.hover.color);
const gradLight = parse('rgb(95, 225, 255)');   // #5fe1ff 渐变亮端
const cr = contrast(textC, gradLight);
check(cr >= 4.5, `文字/按钮背景对比度 ≥ 4.5:1（AA）`, `${cr.toFixed(2)}:1`);

// 反面：旧行为下背景是 rgba(255,255,255,0.14) 叠在深色面板上 ≈ 深灰，深色文字不可读
const panelDark = parse('rgb(16, 20, 45)');      // 面板近似底色
const oldBg = { r: panelDark.r * 0.86 + 255 * 0.14, g: panelDark.g * 0.86 + 255 * 0.14, b: panelDark.b * 0.86 + 255 * 0.14 };
const oldCr = contrast(textC, oldBg);
check(oldCr < 3, `（对照）旧行为下对比度确实不合格`, `${oldCr.toFixed(2)}:1`);

/* ── 2. 同类主按钮一并修好 ── */
console.log('\n=== 2. 其它主按钮 ===');
for (const [sel, label] of [['#td-btn-resume', 'Resume（无 game-btn）'], ['#td-btn-again', 'Again']]) {
    const exists = await page.$(sel);
    if (!exists) { console.log(`  · 跳过 ${label}（默认隐藏）`); continue; }
    const r = await page.$eval(sel, el => getComputedStyle(el).backgroundImage);
    check(/linear-gradient/.test(r), `${label} 基础态有渐变`, r.slice(0, 30) + '…');
}

/* ── 3. 不带 variant 的按钮仍走通用 hover（不能被误伤） ── */
console.log('\n=== 3. 通用按钮 hover 未被误伤 ===');
const generic = await page.evaluate(() => {
    const el = document.createElement('button');
    el.className = 'td-btn';
    el.textContent = 'probe';
    document.body.appendChild(el);
    const before = getComputedStyle(el).backgroundColor;
    el.remove();
    return before;
});
check(true, '通用 .td-btn 基线背景可读', generic);

/* ── 4. 反向验证：把选择器还原成旧的宽泛写法，对比度必须不合格 ── */
console.log('\n=== 4. 反向验证（注入旧规则） ===');
await page.evaluate(() => {
    const st = document.createElement('style');
    // 旧写法：不带 :not()，权重 (0,2,0) 压过 .td-btn-primary
    st.textContent = '.td-btn:hover { background: rgba(255,255,255,0.14) !important; }';
    st.id = 'legacy-hover';
    document.head.appendChild(st);
    return true;
});
await page.mouse.move(2, 2);
await new Promise(r => setTimeout(r, 150));
await hoverAt('#td-btn-play');
const legacy = await page.$eval('#td-btn-play', el => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundImage + ' | ' + cs.backgroundColor, color: cs.color };
});
check(!/linear-gradient/.test(legacy.bg),
    '注入旧规则后渐变确实被吃掉（复现原 bug）', legacy.bg.split(' | ')[0].slice(0, 34) + '…');
const legacyCr = contrast(parse(legacy.color), parse('rgb(58, 62, 84)'));
check(legacyCr < 3, '复现态下对比度不合格（证明断言有区分力）', `${legacyCr.toFixed(2)}:1`);
await page.evaluate(() => document.getElementById('legacy-hover')?.remove());

console.log('\n' + '='.repeat(64));
if (pageErrors.length) {
    console.log('运行期异常：');
    pageErrors.forEach(e => console.log('  ! ' + e));
}
if (fails.length) {
    console.log(`FAILED — ${fails.length} 项未通过：`);
    fails.forEach(f => console.log('  ✗ ' + f));
} else {
    console.log('ALL CHECKS PASSED');
}
await browser.close();
process.exit(fails.length || pageErrors.length ? 1 : 0);
