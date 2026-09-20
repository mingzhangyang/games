#!/usr/bin/env node
/**
 * P3-3 一次性迁移：div.game-main → main.game-main（标签深度配对替换）
 * 幂等：页面已含 <main ...game-main 时跳过。--dry 只打印。
 * 用法：node scripts/p3-main-tag.mjs [--dry]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = [
    'tetris.html', 'planet-merge.html', 'hoop-shot.html', 'tower-defense.html',
    'gravity-slingshot.html', 'needle-awn.html', 'sword-flight.html',
];
const DRY = process.argv.includes('--dry');

let changed = 0;
for (const page of PAGES) {
    const p = join(ROOT, page);
    let src = readFileSync(p, 'utf8');
    if (/<main[^>]*game-main/.test(src)) {
        console.log(`skip  ${page}（已是 main）`);
        continue;
    }
    const open = src.match(/<div class="([^"]*\bgame-main\b[^"]*)">/);
    if (!open) {
        console.log(`FAIL  ${page}：未找到 div.game-main 开标签`);
        changed = -1;
        break;
    }
    const openStart = open.index;
    const openEnd = openStart + open[0].length;

    // 标签深度扫描找配对 </div>（注释内的 div 不计——game-main 内无 HTML 注释含 div 标签）
    let depth = 1, i = openEnd, closeIdx = -1;
    const re = /<\/?div\b/g;
    re.lastIndex = openEnd;
    let m;
    while ((m = re.exec(src)) !== null) {
        depth += m[0] === '</div' ? -1 : 1;
        if (depth === 0) { closeIdx = m.index; break; }
    }
    if (closeIdx < 0) {
        console.log(`FAIL  ${page}：未找到配对 </div>`);
        changed = -1;
        break;
    }
    const closeEnd = src.indexOf('>', closeIdx) + 1;

    const out = src.slice(0, openStart)
        + `<main class="${open[1]}">`
        + src.slice(openEnd, closeIdx)
        + '</main>'
        + src.slice(closeEnd);
    if (!DRY) writeFileSync(p, out);
    console.log(`${DRY ? 'dry ' : 'ok  '}  ${page}: <div class="${open[1]}"> → <main> @${openStart}..${closeEnd}`);
    changed++;
}
console.log(DRY ? '(dry run)' : `done: ${changed} page(s)`);
process.exit(changed < 0 ? 1 : 0);
