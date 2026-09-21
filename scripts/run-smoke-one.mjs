#!/usr/bin/env node
/**
 * run-smoke-one — 起静态服务器 → 跑单个 smoke 脚本 → 关掉。
 * 用途：verify-all 全量跑一次 10 分钟，调单个冒烟时用它把反馈压到 15 秒。
 * 用法：node scripts/run-smoke-one.mjs <smoke-script.mjs>
 */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NODE = process.execPath;
const target = process.argv[2];
if (!target) {
    console.error('用法: node scripts/run-smoke-one.mjs <smoke-script.mjs>');
    process.exit(2);
}

const PORT = 8951;
const server = spawn(NODE, [join('scripts', 'serve-static.mjs'), String(PORT)], {
    cwd: ROOT, stdio: 'ignore',
});

const done = (code) => {
    try { server.kill(); } catch (e) { /* ignore */ }
    process.exit(code);
};

// 等端口起来（serve-static 无就绪回调，用固定短等 + 探测）
await new Promise(r => setTimeout(r, 1200));

const child = spawn(NODE, [target, `http://127.0.0.1:${PORT}`], {
    cwd: ROOT, stdio: 'inherit',
});
child.on('exit', done);
child.on('error', (e) => { console.error(e); done(1); });
