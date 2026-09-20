#!/usr/bin/env node
/**
 * p3-token-swap — P3-4 逐页 hex→令牌收敛（值精确映射，边界严格）。
 * 用法：node scripts/p3-token-swap.mjs [--dry|--check]
 *   --dry    只报告不写盘
 *   --check  只报告不写盘，且发现残留即退出码 1（供 run-lint 把"禁写字面量"
 *            这条规则变成机器约束 —— 此前它只是 docs/contracts/style.md 里的
 *            一句话，没有任何东西执行，结果 css/index.css 带着 3 处 #34d399
 *            进了仓库都没人发现）
 * 规则：
 *   - 仅处理 css 目录递归的全部 .css（文件级豁免 css/math-rain/math-rain.css
 *     主皮肤，化外页 P4 收编；shop.css 已纳入）
 *   - 11 个值精确映射到既有令牌（大小写不敏感，\b 边界防 8 位 hex 误伤）
 *   - 跳过 custom property 定义行（--xxx: #...）——定义收敛另行处理
 * 幂等：var() 产物不再匹配，第二遍 0 替换。
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const DRY = CHECK || process.argv.includes('--dry');

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
            walk(p, out);
        } else if (name.name.endsWith('.css')) {
            // 文件级豁免（B 批次收窄，原为整个 math-rain 目录）：仅 math-rain 主皮肤
            // 保持豁免（化外旧代色板）；css/math-rain/shop.css 已纳入扫描——
            // 其 hex 不在 11 个映射表内，扫描白过，但未来误写映射 hex 会被抓。
            if (p === join(ROOT, 'css', 'math-rain', 'math-rain.css')) continue;
            out.push(p);
        }
    }
    return out;
}

const files = walk(join(ROOT, 'css'));
let total = 0;
const offenders = [];
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
        const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/');
        offenders.push(`${rel}（${n} 处）`);
        console.log(`${CHECK ? 'FOUND' : DRY ? 'DRY' : 'WRITE'} ${rel}  ${n} 处`);
        if (!DRY) writeFileSync(file, next.join('\n'));
    }
}

if (CHECK) {
    if (total === 0) {
        console.log(`token-swap --check：无字面量残留 ✅（扫描 ${files.length} 个文件）`);
        process.exit(0);
    }
    console.error(`\n✗ 发现 ${total} 处应为 var(--tok-*) 的字面 hex：`);
    offenders.forEach(o => console.error('  ✗ ' + o));
    console.error('  修复：node scripts/p3-token-swap.mjs（幂等，可反复跑）');
    console.error('  规则见 docs/contracts/style.md §2');
    process.exit(1);
}
console.log(`${DRY ? '[dry] 将替换' : '已替换'} ${total} 处 / ${files.length} 个文件扫描`);
