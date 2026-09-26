#!/usr/bin/env node
// verify-boot.mjs — js/boot.js 启动包装唯一来源回归防线（P2-6）
//
// 断言：
//   1) 行为：readyState='loading' 时挂 DOMContentLoaded 一次性监听；
//      已 'interactive'/'complete' 时同步立即执行（模块脚本 defer 运行时的真实路径）。
//   2) 收敛：11 个 shell-family 页均 import ./boot.js 且使用 onReady；
//      js/ 下除 boot.js 外不再存在 DOMContentLoaded 注册（防手写复活）。
//
// 用法：node scripts/verify-boot.mjs（无需浏览器/服务器）

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { registry } from './lib/registry.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// 页面清单来自注册表：骨架契约内的页面（caps:topbar）。新游戏一进
// games.config.json 就自动纳入本校验，不必再手工往数组里补一行。
// math-rain / tank-battle 不在骨架契约内，故不在此列。
const PAGES = registry.withCap('topbar');

let failed = 0;
const ok = (cond, label, extra) => {
    if (cond) { console.log(`✓ ${label}`); return; }
    failed++;
    console.error(`✗ ${label}${extra !== undefined ? ' —— got: ' + extra : ''}`);
};

/* ─────────────── 行为断言（stub document） ─────────────── */

console.log('▶ 行为（stub document）');

// stub 必须先于动态 import 就位（boot.js 函数体引用 document）
const listeners = [];
globalThis.document = {
    readyState: 'loading',
    addEventListener(type, fn, opts) { listeners.push({ type, fn, opts }); },
};
const boot = await import(pathToFileURL(join(ROOT, 'js', 'boot.js')).href);

// 1) loading 态：挂 DOMContentLoaded 一次性监听，不立即执行
let ranA = false;
boot.onReady(() => { ranA = true; });
ok(listeners.length === 1 && listeners[0].type === 'DOMContentLoaded'
    && listeners[0].opts && listeners[0].opts.once === true,
"readyState='loading' → 挂 DOMContentLoaded once 监听");
ok(ranA === false, 'loading 态不立即执行');

// 2) interactive 态：同步立即执行（defer 模块脚本的真实路径）
globalThis.document.readyState = 'interactive';
let order = [];
boot.onReady(() => order.push('a'));
boot.onReady(() => order.push('b'));
ok(order.join(',') === 'a,b', "readyState='interactive' → 同步立即执行且保持注册顺序", order.join(','));
ok(listeners.length === 1, 'interactive 态不再挂监听');

// 3) complete 态同上
globalThis.document.readyState = 'complete';
let ranC = false;
boot.onReady(() => { ranC = true; });
ok(ranC === true, "readyState='complete' → 立即执行");

/* ─────────────── 静态收敛断言 ─────────────── */

console.log('\n▶ 源码收敛（防手写复活）');
for (const g of PAGES) {
    const src = readFileSync(join(ROOT, g.entry), 'utf8');
    // 入口可以在 js/ 顶层（'./boot.js'）或子目录（js/firefly-signal/main.js → '../boot.js'）
    ok(/import \{ onReady \} from '\.{1,2}\/boot\.js';/.test(src), `${g.entry} import onReady`);
    ok(!/addEventListener\(\s*['"]DOMContentLoaded['"]/.test(src), `${g.entry} 无 DOMContentLoaded 注册`);
}
// 扫描范围：js/ 顶层 + 骨架契约页入口所在的子目录（如 js/firefly-signal/）。
// 子目录入口的同目录模块同样不许手写 DOMContentLoaded；js/math-rain/ 化外，不在此列。
const SCAN_DIRS = ['js', ...new Set(PAGES.map(g => dirname(g.entry)).filter(d => d !== 'js'))];
for (const dir of SCAN_DIRS) {
    for (const f of readdirSync(join(ROOT, dir)).filter(f => f.endsWith('.js'))) {
        if (dir === 'js' && f === 'boot.js') continue;
        const src = readFileSync(join(ROOT, dir, f), 'utf8');
        ok(!/addEventListener\(\s*['"]DOMContentLoaded['"]/.test(src), `${dir}/${f} 无 DOMContentLoaded 注册`);
    }
}

console.log(failed === 0 ? '\nverify-boot 全部通过 ✅' : `\n${failed} 个失败 ❌`);
process.exit(failed === 0 ? 0 : 1);
