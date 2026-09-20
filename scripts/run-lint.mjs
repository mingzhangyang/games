#!/usr/bin/env node
/**
 * run-lint — P3-2 lint 编排器：串行跑 ESLint（js/）、Stylelint（css/）
 * 与令牌收敛检查（p3-token-swap --check）。
 * 用法：node scripts/run-lint.mjs [--fix]
 * 退出码：两器全 0 才 0。warn 不阻断（error 阻断）。
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIX = process.argv.includes('--fix');
const NODE = process.execPath;

const ESLINT_BIN = join(ROOT, 'node_modules', 'eslint', 'bin', 'eslint.js');
const STYLELINT_BIN = join(ROOT, 'node_modules', 'stylelint', 'bin', 'stylelint.mjs');

const steps = [];
if (existsSync(ESLINT_BIN)) {
    steps.push({ name: 'eslint', args: [ESLINT_BIN, ...(FIX ? ['--fix'] : []), '.'] });
} else {
    console.error('✗ eslint 未安装（node_modules/eslint/bin/eslint.js 不存在）');
    process.exit(1);
}
if (existsSync(STYLELINT_BIN)) {
    steps.push({ name: 'stylelint', args: [STYLELINT_BIN, ...(FIX ? ['--fix'] : []), 'css/**/*.css'] });
} else {
    console.error('✗ stylelint 未安装（node_modules/stylelint/bin/stylelint.mjs 不存在）');
    process.exit(1);
}

// 第三步：设计令牌字面量残留检查。
// docs/contracts/style.md §2 的"禁止再写已映射的 11 个字面 hex"此前只是文档里的
// 一句话，stylelint 只 extends config-standard，没有任何规则执行它 —— 结果
// css/index.css 带着 3 处 #34d399 进了仓库（P3-4 收敛只扫 css/，那时它们还在
// index.html 的内联 <style> 里；P4-1 抽离后才落进 CSS 树，再没人复扫）。
// 这里把它变成机器约束。--fix 档顺带真的替换掉。
const TOKEN_SWAP = join(ROOT, 'scripts', 'p3-token-swap.mjs');
if (existsSync(TOKEN_SWAP)) {
    steps.push({ name: 'token-swap', args: FIX ? [TOKEN_SWAP] : [TOKEN_SWAP, '--check'] });
}

function run(step) {
    return new Promise((resolve) => {
        const child = spawn(NODE, step.args, { cwd: ROOT, stdio: 'inherit' });
        child.on('exit', (code) => resolve(code === 0));
        child.on('error', (err) => {
            console.error(`✗ ${step.name} 启动失败: ${err.message}`);
            resolve(false);
        });
    });
}

let ok = true;
for (const step of steps) {
    console.log(`\n▶ ${step.name}`);
    const passed = await run(step);
    if (!passed) ok = false;
}
console.log(ok ? '\nlint: all green' : '\nlint: FAILURES');
process.exit(ok ? 0 : 1);
