// 一次性迁移：38 处 hubTrack 手写守卫 → js/analytics.js 的 track()（P2-2）。
// 调用点语义零变更（track 内部就是最严格的那份守卫）。
// 用法：node scripts/migrate-analytics.mjs [--dry]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'js');
const DRY = process.argv.includes('--dry');

const FILES = [
    'gomoku.js', 'gravity-slingshot.js', 'hoop-shot.js', 'minesweeper.js',
    'needle-awn.js', 'planet-merge.js', 'reversi.js', 'sword-flight.js',
    'tank-battle.js', 'tetris.js', 'tower-defense.js', 'word-daily.js',
    'math-rain/main.js',
];

let total = 0;
for (const rel of FILES) {
    const path = join(DIR, rel);
    const src = readFileSync(path, 'utf8');
    let out = src;
    let count = 0;

    // ① 多行守卫（sword-flight）：if (typeof window !== 'undefined' && window.hubTrack) { ... }
    out = out.replace(
        /^([ \t]*)if \(typeof window !== 'undefined' && window\.hubTrack\) \{\n[ \t]*window\.hubTrack\('([^']+)', '([^']+)'\);\n[ \t]*\}\n/gm,
        (_m, ind, id, ev) => { count++; return `${ind}track('${id}', '${ev}');\n`; },
    );
    // ② typeof 单行守卫
    out = out.replace(
        /^([ \t]*)if \(typeof window\.hubTrack === 'function'\) window\.hubTrack\('([^']+)', '([^']+)'\);[ \t]*\n/gm,
        (_m, ind, id, ev) => { count++; return `${ind}track('${id}', '${ev}');\n`; },
    );
    // ③ 真值单行守卫
    out = out.replace(
        /^([ \t]*)if \(window\.hubTrack\) window\.hubTrack\('([^']+)', '([^']+)'\);[ \t]*\n/gm,
        (_m, ind, id, ev) => { count++; return `${ind}track('${id}', '${ev}');\n`; },
    );

    if (!count) { console.log(`SKIP   ${rel}（无匹配）`); continue; }

    // 插 import（math-rain/main.js 在子目录，路径要 ../）
    const spec = rel.includes('/') ? '../analytics.js' : './analytics.js';
    const importLine = `import { track } from '${spec}';`;
    if (!out.includes(importLine)) {
        const imports = [...out.matchAll(/^import [^\n]*$/gm)];
        if (!imports.length) { console.log(`FAIL   ${rel}: 没有顶部 import`); continue; }
        const last = imports[imports.length - 1];
        const insEnd = last.index + last[0].length;
        out = out.slice(0, insEnd) + '\n' + importLine + out.slice(insEnd);
    }

    if (!DRY) writeFileSync(path, out);
    console.log(`${DRY ? '[dry] ' : ''}OK     ${rel}（${count} 处替换）`);
    total += count;
}
console.log(total ? `共 ${total} 处调用点` : '无事可做');
