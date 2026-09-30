#!/usr/bin/env node
/**
 * verify-chunk-isolation — 带自动初始化副作用的入口不得泄漏到其它页面。
 *
 * 事故（2026-09-21）：vite.config.js 的对象式 manualChunks 把 math-rain/main.js
 * 连同 safe-storage / site-settings / icons / analytics 打进 math-rain-core，
 * 其它页面为了拿这些共享导出加载该分块，顶层 auto-init 在缺 #game-canvas 时
 * 弹出「❌ 游戏初始化失败」。源码态 dev 走模块图，只有 prod 产物会中招。
 *
 * 断言：
 *   1) vite.config.js 生效配置（去注释后）没有 manualChunks
 *   2) js/math-rain/main.js 的 auto-init 有宿主页门闩
 *   3) 若 dist/ 存在：除 math-rain.html 外的 HTML 不得引用 assets/js/math-rain*
 *
 * 用法：node scripts/verify-chunk-isolation.mjs（无需浏览器/服务器）
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registry } from './lib/registry.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const ok = (cond, label, extra) => {
    if (cond) { console.log(`✓ ${label}`); return; }
    failed++;
    console.error(`✗ ${label}${extra !== undefined ? ' —— ' + extra : ''}`);
};

function stripJsComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function scriptRefs(html) {
    const refs = [];
    for (const m of html.matchAll(/<(?:script|link)[^>]*>/gi)) {
        const tag = m[0];
        if (!/\bscript\b/i.test(tag) && !/rel=["']modulepreload["']/i.test(tag)) continue;
        const src = tag.match(/\b(?:src|href)=["']([^"']+)["']/i);
        if (src) refs.push(src[1]);
    }
    return refs;
}

console.log('▶ vite.config.js');
const viteLive = stripJsComments(readFileSync(join(ROOT, 'vite.config.js'), 'utf8'));
ok(!/\bmanualChunks\s*:/.test(viteLive),
    'vite.config.js 生效配置无 manualChunks（对象式会把依赖图整包塞进分块）');

console.log('\n▶ math-rain auto-init 门闩');
const mainSrc = readFileSync(join(ROOT, 'js/math-rain/main.js'), 'utf8');
ok(mainSrc.includes('querySelector(\'main.mr-main\')'),
    'main.js 以 main.mr-main 作为宿主页门闩');
ok(mainSrc.includes('getElementById(\'game-canvas\')'),
    'main.js 以 #game-canvas 作为宿主页门闩');
const hasGate = /function isMathRainHostPage\(/.test(mainSrc)
    && /if\s*\(\s*!isMathRainHostPage\(\)\s*\)/.test(mainSrc);
ok(hasGate, 'initializeMathRainGame 在创建实例前调用 isMathRainHostPage');

console.log('\n▶ dist 产物（有则查）');
const dist = join(ROOT, 'dist');
if (!existsSync(join(dist, 'math-rain.html'))) {
    console.log('⊘ dist/ 无产物，跳过 HTML 扫描（源码态 verify 正常；npm run build 后再跑会覆盖此项）');
} else {
    const htmls = new Set([
        'index.html',
        ...registry.hrefs(),
    ]);
    for (const f of readdirSync(dist).filter(n => n.endsWith('.html'))) htmls.add(f);

    ok(htmls.has('math-rain.html'), '页面清单含 math-rain.html');

    const leakRe = /(?:^|\/)assets\/js\/math-rain/i;
    for (const f of [...htmls].sort()) {
        const path = join(dist, f);
        if (!existsSync(path)) {
            ok(false, `dist/${f} 存在`, 'missing');
            continue;
        }
        if (f === 'math-rain.html') continue;
        const html = readFileSync(path, 'utf8');
        const leaked = scriptRefs(html).filter(src => leakRe.test(src));
        ok(leaked.length === 0, `${f} 不加载 math-rain 分块`, leaked.join(', '));
    }

    const mrRefs = scriptRefs(readFileSync(join(dist, 'math-rain.html'), 'utf8'));
    ok(mrRefs.some(src => /assets\/js\//.test(src)), 'math-rain.html 仍加载 JS 入口');
}

console.log(failed === 0 ? '\nverify-chunk-isolation 全部通过 ✅' : `\n${failed} 个失败 ❌`);
process.exit(failed === 0 ? 0 : 1);
