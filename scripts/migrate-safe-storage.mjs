// 一次性迁移：11 份手写 localStorage 包装 → js/safe-storage.js（P2-1）。
// 策略：删掉各页的 getter/setter 函数对，在最后一个顶部 import 后插入
// 别名 import —— 调用点零改动（纯机械替换，零行为变更）。
// 用法：node scripts/migrate-safe-storage.mjs [--dry]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'js');
const DRY = process.argv.includes('--dry');

// 文件 → [getter, setter, 别名 getter, 别名 setter]（别名与原函数同名，调用点不动）
const FILES = [
    ['gravity-slingshot.js', 'storageGet', 'storageSet'],
    ['hoop-shot.js', 'storageGet', 'storageSet'],
    ['minesweeper.js', 'storageGet', 'storageSet'],
    ['needle-awn.js', 'storageGet', 'storageSet'],
    ['planet-merge.js', 'storageGet', 'storageSet'],
    ['reversi.js', 'storageGet', 'storageSet'],
    ['sword-flight.js', 'storageGet', 'storageSet'],
    ['tower-defense.js', 'storageGet', 'storageSet'],
    ['word-daily.js', 'storageGet', 'storageSet'],
    ['tank-battle.js', 'safeStorageGet', 'safeStorageSet'],
    ['tetris.js', 'safeGetItem', 'safeSetItem'],
];

// 两种历史字形：多行展开版（9 页）与单行紧凑版（na/sf）
const GET_BODY = '(?:    try \\{\\n        return localStorage\\.getItem\\(key\\);\\n    \\} catch \\(e\\) \\{\\n        return null;\\n    \\}\\n\\}|    try \\{ return localStorage\\.getItem\\(key\\); \\} catch \\(e\\) \\{ return null; \\}\\n\\})';
const SET_BODY = '(?:    try \\{\\n        localStorage\\.setItem\\(key, (?:value|val)\\);\\n    \\} catch \\(e\\) \\{(?:\\n        [^\\n]*)?\\n    \\}\\n\\}|    try \\{ localStorage\\.setItem\\(key, (?:value|val)\\); \\} catch \\(e\\) \\{\\}\\n\\})';

let touched = 0;
for (const [file, get, set] of FILES) {
    const path = join(DIR, file);
    const src = readFileSync(path, 'utf8');
    const pairRe = new RegExp(
        `function ${get}\\(key\\) \\{\\n${GET_BODY}\\n\\nfunction ${set}\\(key, (?:value|val)\\) \\{\\n${SET_BODY}\\n(?:\\n)?`,
    );
    const m = src.match(pairRe);
    if (!m) {
        console.log(`SKIP   ${file}（没有匹配的函数对，可能已迁移）`);
        continue;
    }
    // 收集绝对位置，倒序删：① 函数对整块 ② 无
    const importLine = get === 'storageGet'
        ? `import { storageGet, storageSet } from './safe-storage.js';`
        : `import { storageGet as ${get}, storageSet as ${set} } from './safe-storage.js';`;

    let out = src.slice(0, m.index) + src.slice(m.index + m[0].length);
    // 插到最后一个顶部 import 之后
    const imports = [...out.matchAll(/^import [^\n]*$/gm)];
    if (!imports.length) { console.log(`FAIL   ${file}: 没有顶部 import`); continue; }
    const last = imports[imports.length - 1];
    const insEnd = last.index + last[0].length;
    out = out.slice(0, insEnd) + '\n' + importLine + out.slice(insEnd);

    if (!DRY) writeFileSync(path, out);
    console.log(`${DRY ? '[dry] ' : ''}OK     ${file}（删 ${m[0].length} 字节，插 import）`);
    touched++;
}
console.log(touched ? (DRY ? `将改写 ${touched} 个文件` : `已改写 ${touched} 个文件`) : '无事可做');
