#!/usr/bin/env node
/**
 * p3-token-swap — P3-4 逐页 hex→令牌收敛（值精确映射，边界严格）。
 * 用法：node scripts/p3-token-swap.mjs [--dry]
 * 规则：
 *   - 仅处理 css 目录递归的全部 .css（豁免 math-rain 子目录，化外页 P4 收编）
 *   - 11 个值精确映射到既有令牌（大小写不敏感，\b 边界防 8 位 hex 误伤）
 *   - 跳过 custom property 定义行（--xxx: #...）——定义收敛另行处理
 * 幂等：var() 产物不再匹配，第二遍 0 替换。
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');

const MAP = [
    ['e8ecff', 'tok-text'],
    ['9aa6d8', 'tok-text-dim'],
    ['56618f', 'tok-text-mute'],
    ['c3cdf2', 'tok-text-soft'],
    ['7c89bf', 'tok-text-faint'],
    ['05060f', 'tok-bg'],
    ['0b0f26', 'tok-bg-2'],
    ['40d8ff', 'tok-cyan'],
    ['ffd34d', 'tok-gold'],
    ['34d399', 'tok-success'],
    ['ff6b7a', 'tok-danger'],
].map(([hex, tok]) => [new RegExp(`#${hex}\\b`, 'gi'), `var(--${tok})`]);

function walk(dir, out = []) {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, name.name);
        if (name.isDirectory()) {
            if (name.name === 'math-rain') continue; // 化外页豁免
            walk(p, out);
        } else if (name.name.endsWith('.css')) {
            out.push(p);
        }
    }
    return out;
}

const files = walk(join(ROOT, 'css'));
let total = 0;
for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const lines = src.split('\n');
    let n = 0;
    const next = lines.map((line) => {
        if (/^\s*--[\w-]+\s*:/.test(line)) return line; // 定义行跳过
        let out = line;
        for (const [re, tok] of MAP) {
            out = out.replace(re, (m, off) => {
                n++;
                return tok;
            });
        }
        return out;
    });
    if (n > 0) {
        total += n;
        const rel = file.slice(ROOT.length + 1);
        console.log(`${DRY ? 'DRY' : 'WRITE'} ${rel}  ${n} 处`);
        if (!DRY) writeFileSync(file, next.join('\n'));
    }
}
console.log(`${DRY ? '[dry] 将替换' : '已替换'} ${total} 处 / ${files.length} 个文件扫描`);
