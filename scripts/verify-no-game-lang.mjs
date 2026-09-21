/**
 * 校验器：游戏页不得再出现语言切换 UI / 语言写入路径。
 *
 * 背景（2026-09-21）：语言切换已收敛到首页 index.html。首_batch（3dd693d）用 Puppeteer 的
 * `verify-chrome` 做负向断言，但它只遍历**挂了 topbar cap 的页面**（见 registry），
 * tank-battle / math-rain 这类化外页面完全不在覆盖内 —— tank-battle 就这样带着自己的
 * #btnLang + switchLanguage() 漏了整整一轮。
 *
 * 所以补一个**静态源扫描**守卫：不需要起服务、不需要浏览器，1 秒内跑完，覆盖所有页面，
 * 专门盯「页面上又长出语言钮 / 又有人调 setLang」这类回归。
 *
 * 用法：node scripts/verify-no-game-lang.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 不扫描的目录 */
const SKIP_DIRS = new Set([
    'dist', 'node_modules', 'scratch', 'scripts', 'docs',
    '.git', '.workbuddy', '.vite', 'coverage'
]);

/**
 * 完全豁免的文件：它们是「首页」与「语言状态本体」，天然拥有语言 UI / 写入权。
 */
const SKIP_FILES = new Set([
    'index.html',          // 首页：唯一保留语言切换 UI 的地方
    'js/index-page.js',    // 首页逻辑：lang-toggle 的 click handler
    'js/site-settings.js'  // setLang 的定义处，也是合法的调用方
]);

/**
 * HTML 按钮豁免清单 —— 名字里带 lang 但**不是语言切换**的按钮。
 * 必须写清理由，禁止无理由加豁免。
 */
const HTML_BUTTON_ALLOWLIST = [
    { file: 'word-daily.html', id: 'wd-btn-lang', why: '词库模式切换（Idioms/…），不是语言切换' }
];

/**
 * 禁止出现在源码里的调用/标识符。
 * 注意全部是「调用形」或「赋值形」，避免误伤注释里提到的名字。
 */
const FORBIDDEN = [
    { re: /\bsetLang\s*\(/, why: '游戏页不得写入全站语言（setLang 由首页独占）' },
    { re: /\bselectLanguage\s*\(/, why: 'math-rain 的语言切换入口，已随语言钮一并删除' },
    { re: /\bswitchLanguage\s*\(/, why: '页面自带的语言切换函数' },
    { re: /\bupdateLanguageButtons\s*\(/, why: '语言钮 active 态刷新，DOM 已不存在' },
    { re: /\blangTitle\b/, why: '语言钮的 title 文案键' },
    { re: /\bbtnLang\b/, why: '页面自带的语言钮 id' },
    { re: /\blangBtn\b/, why: '页面自带的语言钮 id' },
    { re: /__pendingLanguageSelection\s*=/, why: '配合 window.selectLanguage 的缓存机制' },
    { re: /data-chrome="lang"/, why: '顶栏语言钮（共享 chrome 已移除该角色）' }
];

/** 递归收集待扫文件 */
function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (SKIP_DIRS.has(name)) continue;
        const abs = join(dir, name);
        const rel = relative(ROOT, abs).split(sep).join('/');
        const st = statSync(abs);
        if (st.isDirectory()) {
            walk(abs, out);
        } else if (/\.(html|js)$/.test(name)) {
            out.push(rel);
        }
    }
    return out;
}

// 根目录 *.html 走一层；js/ 走递归
const FILES = [
    ...readdirSync(ROOT)
        .filter((n) => n.endsWith('.html'))
        .filter((n) => !SKIP_FILES.has(n)),
    ...walk(join(ROOT, 'js')).map((p) => p)
].filter((rel) => !SKIP_FILES.has(rel));

const failures = [];
let scanned = 0;

for (const rel of FILES) {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    scanned += 1;
    const lines = src.split('\n');

    // ① 调用形 / 标识符禁令
    for (const { re, why } of FORBIDDEN) {
        lines.forEach((line, i) => {
            if (re.test(line)) {
                failures.push(`${rel}:${i + 1}  命中 ${re} —— ${why}\n        > ${line.trim().slice(0, 120)}`);
            }
        });
    }

    // ② HTML 里名字带 lang 的按钮（不合豁免清单的一律算语言钮回归）
    if (rel.endsWith('.html')) {
        const btnRe = /<button\b[^>]*>/g;
        let m;
        while ((m = btnRe.exec(src)) !== null) {
            const tag = m[0];
            const id = (tag.match(/\bid="([^"]*)"/) || [])[1] || '';
            const cls = (tag.match(/\bclass="([^"]*)"/) || [])[1] || '';
            const hitsLang = /\blang(?:uage)?\b/i.test(id) || /\blang(?:uage)?\b/i.test(cls);
            if (!hitsLang) continue;
            const allowed = HTML_BUTTON_ALLOWLIST.some((a) => a.file === rel && a.id === id);
            if (allowed) continue;
            const lineNo = src.slice(0, m.index).split('\n').length;
            failures.push(
                `${rel}:${lineNo}  名字带 lang 的按钮 <${id ? '#' + id : '.' + cls}> —— 疑似语言钮回归\n` +
                `        > ${tag.slice(0, 120)}`
            );
        }
    }
}

console.log(`扫描 ${scanned} 个源文件（html 页面 + js/**）`);
if (failures.length) {
    console.error(`\n✗ 发现 ${failures.length} 处语言切换残留：\n`);
    failures.forEach((f) => console.error('  · ' + f));
    console.error('\n语言切换 UI 只允许存在于 index.html / js/index-page.js；');
    console.error('如需豁免，请在 scripts/verify-no-game-lang.mjs 里写明理由。');
    process.exit(1);
}
console.log('✓ 无语言切换 UI 残留（index.html / js/index-page.js / js/site-settings.js 已豁免）');
