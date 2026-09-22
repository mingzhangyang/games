#!/usr/bin/env node
/**
 * run-smoke-dist — 服务 dist/ 产物 → 跑单个 smoke 脚本 → 关掉。
 *
 * 与 run-smoke-one.mjs 的差别只有一个：服务器 cwd 是 `dist/` 而不是仓库根，
 * 这样冒烟打的是**构建产物**（terser 压缩 + 分块 + legacy 产物）而不是源码。
 * 目的：捕捉「dev 全绿、build 才炸」这类问题（顶层 await、drop_console 后
 * 断言失效、chunk 共享失败等）。
 *
 * 用法：node scripts/run-smoke-dist.mjs <smoke-script.mjs>
 *  ⚠ 跑之前先 build（vite build），否则冒的是上一版 dist。
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NODE = process.execPath;
const target = process.argv[2];
if (!target) {
    console.error('用法: node scripts/run-smoke-dist.mjs <smoke-script.mjs>');
    process.exit(2);
}

const DIST = join(ROOT, 'dist');
if (!existsSync(join(DIST, 'index.html'))) {
    console.error('dist/index.html 不存在 —— 先跑 vite build');
    process.exit(2);
}

const PORT = 8952;
const server = spawn(NODE, [join(ROOT, 'scripts', 'serve-static.mjs'), String(PORT)], {
    cwd: DIST, stdio: 'ignore',
});

const done = (code) => {
    try { server.kill(); } catch (e) { /* ignore */ }
    process.exit(code);
};

// serve-static 无就绪回调，固定短等即可
await new Promise(r => setTimeout(r, 1200));

const child = spawn(NODE, [target, `http://127.0.0.1:${PORT}`], {
    cwd: ROOT, stdio: 'inherit',
});
child.on('exit', done);
child.on('error', (e) => { console.error(e); done(1); });
