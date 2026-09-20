#!/usr/bin/env node
/**
 * run-lint — P3-2 lint 编排器：串行跑 ESLint（js/）与 Stylelint（css/）。
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
