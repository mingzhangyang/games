// 一次性迁移：把所有校验/截图脚本里硬编码的 chrome.exe 路径统一替换为
// scripts/lib/browser.mjs 导出的 CHROME_PATH（支持 CHROME_BIN 环境变量）。
// 覆盖三种现有写法：
//   const EXE = 'C:\\...\\chrome.exe';
//   const CHROME = ['C:/.../chrome.exe', ...].find(existsSync)   ← 数组形态
//   const X = process.env.CHROME_BIN || 'C:\\...\\chrome.exe';
// 用法：node scripts/migrate-chrome-paths.mjs [--dry]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)));
const DRY = process.argv.includes('--dry');
// 匹配单引号字符串里的 chrome.exe 路径（正反斜杠都算），含 win64-xxx 版本段
const PATH_RE = /'(C:[\\/]+Users[\\/]+mingz[\\/]+\.cache[\\/]+puppeteer[\\/]+chrome[\\/]+win64-[^']+\.exe)'/g;
const IMPORT_LINE = "import { CHROME_PATH } from './lib/browser.mjs';";

let touched = 0;
for (const name of readdirSync(DIR)) {
    if (!name.endsWith('.mjs') || name === 'migrate-chrome-paths.mjs') continue;
    const file = join(DIR, name);
    const src = readFileSync(file, 'utf8');
    if (!PATH_RE.test(src)) continue;
    PATH_RE.lastIndex = 0;

    let out = src.replace(PATH_RE, "CHROME_PATH");
    if (!out.includes("./lib/browser.mjs")) {
        // 插到第一条 import 之后（所有命中文件都有 puppeteer import）
        out = out.replace(/^import .*$/m, m => `${m}\n${IMPORT_LINE}`);
    }
    const count = (src.match(PATH_RE) || []).length;
    console.log(`${DRY ? '[dry] ' : ''}${name}: ${count} 处路径替换`);
    if (!DRY) writeFileSync(file, out);
    touched++;
}
console.log(touched ? (DRY ? `将改写 ${touched} 个文件` : `已改写 ${touched} 个文件`) : '没有需要改写的文件');
