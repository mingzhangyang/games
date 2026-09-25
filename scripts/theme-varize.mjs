#!/usr/bin/env node
// theme-varize.mjs — 把页面 CSS 的字面色收编成页面变量，并生成浅色覆盖的初稿（docs/contracts/theme.md §2.3）
//
//   node scripts/theme-varize.mjs css/minesweeper.css ms --dry   只打印将要做什么
//   node scripts/theme-varize.mjs css/minesweeper.css ms         就地改写
//
// 做法：
//   · 逐条声明扫描：属性是颜色类（color / background* / border* / box-shadow / text-shadow /
//     outline* / fill / stroke / caret-color / text-decoration-color），值里含字面色
//     （#hex / rgb() / rgba() / hsl()）→ 整个值换成 var(--<prefix>-<选择器>-<属性>)。
//   · 深色取值 = 原值，写进文件顶部的 `:root { }` 区域 —— 深色外观逐字不变。
//   · 浅色取值 = 启发式初稿，写进 `:root[data-theme="light"] { }` 区域，**必须人工校准**
//     （截图 + verify-theme 的对比度检查）。重跑时已校准的浅色值原样保留，只追加新变量。
//   · 跳过：自定义属性定义行、data: URL（SVG 内联色要手改）、已是 var() 的值、
//     两个 theme 区域本身。幂等：第二遍 0 替换。
import { readFileSync, writeFileSync } from 'node:fs';

const [file, prefix] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const DRY = process.argv.includes('--dry');
if (!file || !prefix) {
    console.error('用法：node scripts/theme-varize.mjs <css 文件> <前缀> [--dry]');
    process.exit(2);
}

const COLOR_PROPS = /^(color|background(-color|-image)?|border(-(top|right|bottom|left))?(-color)?|box-shadow|text-shadow|outline(-color)?|fill|stroke|caret-color|text-decoration-color)$/;
const LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g;
const BEGIN_DARK = '/* theme:begin vars — 由 scripts/theme-varize.mjs 生成：深色 = 原值；浅色在下一块，需人工校准 */';
const END_DARK = '/* theme:end vars */';
const BEGIN_LIGHT = '/* theme:begin light */';
const END_LIGHT = '/* theme:end light */';

let src = readFileSync(file, 'utf8');

// ── 读出已有区域（重跑时保留已校准的浅色值）──
const existingDark = new Map();
const existingLight = new Map();
function readRegion(begin, end, into) {
    const bi = src.indexOf(begin);
    if (bi < 0) return;
    const ei = src.indexOf(end, bi);
    for (const m of src.slice(bi, ei).matchAll(/(--[\w-]+):\s*([^;]+);/g)) into.set(m[1], m[2].trim());
}
readRegion(BEGIN_DARK, END_DARK, existingDark);
readRegion(BEGIN_LIGHT, END_LIGHT, existingLight);
// 区域先整体摘掉，改写完再放回
function stripRegion(begin, end) {
    const bi = src.indexOf(begin);
    if (bi < 0) return;
    const ei = src.indexOf(end, bi) + end.length;
    src = src.slice(0, bi) + src.slice(ei).replace(/^\n*/, '');
}
stripRegion(BEGIN_DARK, END_DARK);
stripRegion(BEGIN_LIGHT, END_LIGHT);

// ── 颜色工具 ──
function parse(lit) {
    let m = lit.match(/^#([0-9a-f]{3,8})$/i);
    if (m) {
        let h = m[1];
        if (h.length <= 4) h = h.split('').map(c => c + c).join('');
        const n = parseInt(h.slice(0, 6), 16);
        return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 };
    }
    m = lit.match(/^rgba?\(([^)]*)\)$/i);
    if (m) {
        const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    return null;   // hsl 等：初稿里原样保留，人工处理
}
const fmt = (c) => {
    if (c.a < 1) return `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${+c.a.toFixed(3)})`;
    const hex = [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    // stylelint color-hex-length：能缩写就缩写（#ffffff → #fff）
    return /^(.)\1(.)\2(.)\3$/.test(hex) ? `#${hex[0]}${hex[2]}${hex[4]}` : `#${hex}`;
};
function hsl({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return { h: 0, s: 0, l };
    const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: h / 6, s, l };
}
function rgbOf({ h, s, l }) {
    if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = t => { t = (t + 1) % 1; return 255 * (t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p); };
    return { r: f(h + 1 / 3), g: f(h), b: f(h - 1 / 3) };
}
const SLATE = { r: 15, g: 23, b: 42 };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** 单个颜色的浅色初稿。role: text | bg | border | shadow */
function lightOf(c, role) {
    const { h, s, l } = hsl(c);
    if (role === 'shadow') return { ...SLATE, a: clamp(c.a * 0.35, 0.04, 0.2) };
    if (role === 'text' && l > 0.8) {   // 深底上的浅色文字（含半透明）→ 深石板色，保留透明度层级
        return { ...SLATE, a: c.a >= 1 ? 1 : clamp(c.a + 0.15, 0.55, 0.95) };
    }
    if (l > 0.85 && c.a < 0.5) {   // 深底上的白色玻璃
        if (role === 'border') return { ...SLATE, a: clamp(c.a * 1.1, 0.08, 0.2) };
        if (role === 'text') return { ...SLATE, a: clamp(c.a + 0.2, 0.5, 0.9) };
        return { r: 255, g: 255, b: 255, a: clamp(0.55 + c.a * 3, 0.6, 0.95) };
    }
    if (l < 0.18 && c.a < 1) {     // 黑色半透明：遮罩 / 凹槽
        if (role === 'bg' && c.a >= 0.9) return { r: 255, g: 255, b: 255, a: 0.98 };   // 近乎不透明的深色卡片 → 白卡
        return role === 'bg' && c.a > 0.6 ? { ...SLATE, a: 0.32 } : { ...SLATE, a: clamp(c.a * 0.25, 0.03, 0.12) };
    }
    if (role === 'text') {         // 文字：浅底上压暗到可读
        return { ...rgbOf({ h, s: Math.min(s, 0.85), l: Math.min(l, 0.4) }), a: c.a };
    }
    if (l < 0.35 && s < 0.6) {     // 深色实底 → 对应的浅色实底
        return { ...rgbOf({ h, s: s * 0.5, l: clamp(1 - l * 0.55, 0.86, 0.98) }), a: c.a };
    }
    return c;                      // 高饱和强调色：保留
}
function roleOf(prop) {
    if (/shadow/.test(prop)) return 'shadow';
    if (/^border|^outline/.test(prop)) return 'border';
    if (/^(color|fill|stroke|caret-color|text-decoration-color)$/.test(prop)) return 'text';
    return 'bg';
}
function lightValue(value, prop) {
    // 发光（带模糊半径的 text-shadow）在浅底上发脏 → 去掉
    if (prop === 'text-shadow' && /(^|,)\s*-?\d+(px)?\s+-?\d+(px)?\s+[1-9]\d*px/.test(value)) return 'none';
    return value.replace(LITERAL, lit => {
        const c = parse(lit);
        return c ? fmt(lightOf(c, roleOf(prop))) : lit;
    });
}

// ── 扫描规则 ──
const vars = new Map();          // name → dark value
const byValue = new Map();       // `${选择器}|${prop}|${value}` → name（同一选择器内复用）
const light = new Map();
let replaced = 0;
const SHORT = { 'background': 'bg', 'background-color': 'bg', 'background-image': 'bg', 'color': 'text', 'box-shadow': 'shadow', 'text-shadow': 'glow',
    'border': 'border', 'border-color': 'border', 'border-top': 'border-top', 'border-bottom': 'border-bottom', 'border-left': 'border-left', 'border-right': 'border-right',
    'border-top-color': 'border-top', 'border-bottom-color': 'border-bottom', 'outline': 'outline', 'outline-color': 'outline', 'fill': 'fill', 'stroke': 'stroke', 'caret-color': 'caret' };

function slug(selector) {
    const first = selector.split(',')[0].trim();
    const cls = [...first.matchAll(/[.#]([\w-]+)/g)].map(m => m[1].replace(new RegExp(`^${prefix}-`), ''));
    const states = [...first.matchAll(/:(hover|active|focus|focus-visible|checked|disabled)/g)].map(m => m[1]);
    const base = cls.length ? cls.join('-') : first.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'root';
    return [base, ...states].join('-').toLowerCase().slice(0, 48);
}

// 用一个极简的扫描器：记录当前选择器（最近一个 `{` 前的文本），逐条改写声明
let out = '';
let i = 0;
const stack = [];
while (i < src.length) {
    const open = src.indexOf('{', i);
    const close = src.indexOf('}', i);
    if (open >= 0 && (close < 0 || open < close)) {
        const head = src.slice(i, open);
        const selector = head.slice(head.lastIndexOf(';') + 1).replace(/\/\*[\s\S]*?\*\//g, '').trim();
        stack.push(selector);
        out += src.slice(i, open + 1);
        i = open + 1;
        continue;
    }
    if (close < 0) { out += src.slice(i); break; }
    // 声明体：i..close
    const body = src.slice(i, close);
    const selector = stack[stack.length - 1] || '';
    const skip = /^@keyframes|^(from|to|\d+%)/.test(selector) && false;
    const rewritten = skip ? body : body.replace(/(^|[;{\s])([a-z-]+)(\s*:\s*)([^;{}]+)(;?)/g, (all, pre, prop, colon, value, semi) => {
        // 已是单个 var() 的跳过（幂等）；var() 与字面色混用的（如 body 渐变里的 #101a2b）照样收编
        if (!COLOR_PROPS.test(prop) || /^\s*var\([^()]*\)\s*$/.test(value) || /url\(/.test(value)) return all;
        const lits = value.match(LITERAL);
        if (!lits) return all;
        const v = value.trim();
        // 只在同一选择器内复用：跨选择器共用一个变量会把语义不同的用法绑死
        //（word-daily 的「图标钮按下态文字」与「绿色格子上的白字」同值，浅色下却必须分开）
        const key = `${slug(selector)}|${prop}|${v}`;
        let name = byValue.get(key);
        if (!name) {
            const baseName = `--${prefix}-${slug(selector)}-${SHORT[prop] || prop}`;
            name = baseName;
            for (let n = 2; vars.has(name) && vars.get(name) !== v; n++) name = `${baseName}-${n}`;
            vars.set(name, v);
            byValue.set(key, name);
            light.set(name, existingLight.get(name) ?? lightValue(v, prop));
        }
        replaced++;
        return `${pre}${prop}${colon}var(${name})${value.endsWith(' ') ? ' ' : ''}${semi}`;
    });
    out += rewritten + '}';
    stack.pop();
    i = close + 1;
}

// 上一轮已收编（值已是 var）的变量也要留在区域里
for (const [name, v] of existingDark) if (!vars.has(name)) { vars.set(name, v); light.set(name, existingLight.get(name) ?? v); }

const pad = '    ';
const darkBlock = `${BEGIN_DARK}\n:root {\n${[...vars].map(([n, v]) => `${pad}${n}: ${v};`).join('\n')}\n}\n${END_DARK}\n`;
const lightBlock = `${BEGIN_LIGHT}\n:root[data-theme="light"] {\n${[...light].map(([n, v]) => `${pad}${n}: ${v};`).join('\n')}\n}\n${END_LIGHT}\n`;

// 区域插在文件头注释之后
const headerEnd = out.startsWith('/*') ? out.indexOf('*/') + 2 : 0;
const result = out.slice(0, headerEnd) + (headerEnd ? '\n\n' : '') + darkBlock + '\n' + lightBlock + '\n' + out.slice(headerEnd).replace(/^\n+/, '');

const newVars = [...vars.keys()].filter(n => !existingDark.has(n)).length;
console.log(`${file}: 收编 ${replaced} 处声明，变量 ${vars.size} 个（新增 ${newVars}）${DRY ? '（--dry，未写盘）' : ''}`);
if (DRY) {
    for (const [n, v] of vars) if (!existingDark.has(n)) console.log(`  ${n}\n      dark : ${v}\n      light: ${light.get(n)}`);
} else if (result !== readFileSync(file, 'utf8')) {
    writeFileSync(file, result);
}
