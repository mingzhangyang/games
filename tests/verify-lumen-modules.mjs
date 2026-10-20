#!/usr/bin/env node
// verify-lumen-modules.mjs — Lumen 模块拆分的静态契约（node 直跑，无需浏览器）
//
// 锁定 2026-10 拆分后的分层，防止 runtime.js 重新长回一个 48 KB 的大文件：
//   1) 包内 import 只能向下：i18n/storage/audio → model/ → systems/ → render/ → input/ → ui/
//      → runtime.js → index.js，且没有环；包里不允许出现不在分层表里的文件；
//   2) model/ 是纯模块（无 DOM / window / 计时器 / 存储），浏览器与校验器共用；
//   3) 只有 systems/records.js 碰存储，只有 ui/daily-board.js 碰排行榜网络层；
//   4) render/ 不碰 DOM 查询、存储与网络；ui/ 不碰画布；
//   5) runtime.js 只编排：不画画、不拼 DOM、不碰存储与网络。
//
// 用法：node tests/verify-lumen-modules.mjs

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE = join(ROOT, 'src', 'games', 'lumen');
let failed = 0;
let passed = 0;
const check = (cond, label, detail = '') => {
    if (cond) { passed++; return; }
    failed++;
    console.error(`✗ ${label}${detail ? ` —— ${detail}` : ''}`);
};

const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
});
const files = walk(PACKAGE).filter(file => extname(file) === '.js');
const fileSet = new Set(files);
const rel = file => relative(PACKAGE, file).replace(/\\/g, '/');
// 去掉注释再查关键字：模块头注释里会写「无 DOM、无 window」
const code = file => readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const importPattern = /(?:import|export)\s+(?:[\s\S]*?\sfrom\s+)?(['"])([^'"]+)\1\s*;?/gm;

const RANKS = [
    [p => p === 'i18n.js' || p === 'storage.js' || p === 'audio.js', 0],
    [p => p.startsWith('model/'), 1],
    [p => p.startsWith('systems/'), 2],
    [p => p.startsWith('render/'), 3],
    [p => p.startsWith('input/'), 4],
    [p => p.startsWith('ui/'), 5],
    [p => p === 'runtime.js', 6],
    [p => p === 'index.js', 7],
];
const rankOf = file => RANKS.find(([match]) => match(rel(file)))?.[1] ?? null;

const imports = new Map(files.map(file => [file, []]));
const external = new Map(files.map(file => [file, []]));
for (const file of files) {
    for (const match of readFileSync(file, 'utf8').matchAll(importPattern)) {
        const spec = match[2];
        if (!spec.startsWith('.')) continue;
        const target = resolve(dirname(file), spec);
        if (fileSet.has(target)) imports.get(file).push(target);
        else external.get(file).push(rel(target));
    }
}

console.log('▶ 分层与依赖方向');
for (const file of files) {
    check(rankOf(file) !== null, `${rel(file)} 属于某一层`, '新文件请放进 model/ systems/ render/ input/ ui/ 之一');
    for (const target of imports.get(file)) {
        check(rankOf(target) <= rankOf(file), `${rel(file)} → ${rel(target)} 只向下依赖`);
    }
}
const states = new Map();
const stack = [];
const cycles = [];
const visit = file => {
    if (states.get(file) === 'visiting') {
        cycles.push([...stack.slice(stack.indexOf(file)), file].map(rel).join(' → '));
        return;
    }
    if (states.get(file) === 'visited') return;
    states.set(file, 'visiting');
    stack.push(file);
    imports.get(file).forEach(visit);
    stack.pop();
    states.set(file, 'visited');
};
files.forEach(visit);
check(cycles.length === 0, '包内无循环依赖', cycles.join('; '));

console.log('▶ 各层职责');
const pkg = p => join(PACKAGE, p);
const usesPlatform = (file, mod) => external.get(file).some(p => p.endsWith(`platform/${mod}`));

for (const file of files.filter(f => rel(f).startsWith('model/'))) {
    const src = code(file);
    check(!/\b(document|window|navigator|localStorage|requestAnimationFrame|setTimeout|performance)\b/.test(src),
        `${rel(file)} 是纯模块（无 DOM / 计时器 / 存储）`);
    check(external.get(file).every(p => p.endsWith('platform/daily.js')),
        `${rel(file)} 只依赖 platform/daily.js`, external.get(file).join(', '));
}

const storageUsers = files.filter(f => usesPlatform(f, 'safe-storage.js') || imports.get(f).includes(pkg('storage.js')));
check(storageUsers.length === 1 && rel(storageUsers[0]) === 'systems/records.js',
    '只有 systems/records.js 碰存储', storageUsers.map(rel).join(', '));
const networkUsers = files.filter(f => usesPlatform(f, 'leaderboard.js'));
check(networkUsers.length === 1 && rel(networkUsers[0]) === 'ui/daily-board.js',
    '只有 ui/daily-board.js 碰排行榜网络层', networkUsers.map(rel).join(', '));
const sfxUsers = files.filter(f => usesPlatform(f, 'game-sfx.js'));
check(sfxUsers.length === 1 && rel(sfxUsers[0]) === 'audio.js', '只有 audio.js 建音效引擎', sfxUsers.map(rel).join(', '));

for (const file of files.filter(f => rel(f).startsWith('render/') || rel(f).startsWith('input/'))) {
    const src = code(file);
    check(!/document\.(getElementById|querySelector|createElement)/.test(src), `${rel(file)} 不查找 / 拼装 DOM`);
    check(!/\b(storageGet|storageSet|fetch)\s*\(/.test(src), `${rel(file)} 不碰存储与网络`);
}
const canvasOwners = files.filter(f => /\.getContext\(/.test(code(f)));
check(canvasOwners.length === 1 && rel(canvasOwners[0]) === 'render/board.js',
    '只有 render/board.js 拿画布上下文', canvasOwners.map(rel).join(', '));
for (const file of files.filter(f => rel(f).startsWith('ui/'))) {
    check(!/\bctx\.|getContext/.test(code(file)), `${rel(file)} 不画画布`);
}

{
    const src = code(pkg('runtime.js'));
    check(!/\bctx\.|getContext|createLinearGradient/.test(src), 'runtime.js 不画画布');
    check(!/document\.(getElementById|querySelector|createElement)|innerHTML|textContent|classList/.test(src),
        'runtime.js 不查找 / 拼装 DOM（交给 ui/view.js）');
    check(!/\b(storageGet|storageSet|submitScore|fetchBoard|fetch)\s*\(/.test(src), 'runtime.js 不碰存储与网络');
    check(!/\btraceGrid\s*\(|\btapGrid\s*\(/.test(src), 'runtime.js 不直接改盘面（经由 model/session.js）');
}
{
    const src = code(pkg('index.js'));
    check(/mountGameRuntime\(/.test(src) && /new LumenGame\(/.test(src), 'index.js 是组合根');
}

console.log(failed === 0
    ? `\nverify-lumen-modules 全部通过 ✅（${files.length} 个模块，${passed} 项断言）`
    : `\n${failed} 个失败 ❌（通过 ${passed}）`);
process.exit(failed === 0 ? 0 : 1);
