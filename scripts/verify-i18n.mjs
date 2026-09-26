#!/usr/bin/env node
// verify-i18n.mjs — js/i18n.js 公共文案唯一来源回归防线（P2-5）
//
// 断言：
//   1) 行为：makeText 原型链兜底（缺失键落 COMMON）、own 键优先覆盖、
//      COMMON_TEXT 黄金值（改文案须有意识地在 i18n.js 改一处）。
//   2) 收敛：11 个 shell-family 页均 import ./i18n.js 且语言表经 makeText 包装；
//      js/ 下除 i18n.js 外不再存在 6 个公共键的字面量副本（防复制复活）。
//   3) 语言键：site_lang 仍由 js/site-settings.js 管理（历史教训：键名曾写错）。
//
// 用法：node scripts/verify-i18n.mjs（无需浏览器/服务器）

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { registry } from './lib/registry.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// 页面清单来自注册表：骨架契约内的页面（caps:topbar）。新游戏自动纳入。
const PAGES = registry.withCap('topbar');
const KEYS = ['sound', 'language', 'moreGames', 'close', 'copied', 'usernameLabel'];

let failed = 0;
const ok = (cond, label, extra) => {
    if (cond) { console.log(`✓ ${label}`); return; }
    failed++;
    console.error(`✗ ${label}${extra !== undefined ? ' —— got: ' + extra : ''}`);
};

/* ─────────────── 行为断言 ─────────────── */

console.log('▶ 行为（makeText 原型链）');
const i18n = await import(pathToFileURL(join(ROOT, 'js', 'i18n.js')).href);
const { COMMON_TEXT, makeText } = i18n;

ok(COMMON_TEXT.en.sound === 'Sound' && COMMON_TEXT.zh.sound === '声音', 'COMMON_TEXT.sound 黄金值');
ok(COMMON_TEXT.en.language === '中文' && COMMON_TEXT.zh.language === 'English', 'COMMON_TEXT.language 黄金值（按钮显示切换目标）');
ok(COMMON_TEXT.en.copied === 'Copied!' && COMMON_TEXT.zh.copied === '已复制！', 'COMMON_TEXT.copied 黄金值');
ok(COMMON_TEXT.en.moreGames === 'More games' && COMMON_TEXT.zh.moreGames === '更多游戏', 'COMMON_TEXT.moreGames 黄金值');
ok(COMMON_TEXT.en.close === 'Close' && COMMON_TEXT.zh.close === '关闭', 'COMMON_TEXT.close 黄金值');
ok(COMMON_TEXT.en.usernameLabel === 'Username (Enter to save)' && COMMON_TEXT.zh.usernameLabel === '用户名（回车保存）',
    'COMMON_TEXT.usernameLabel 黄金值');

const plain = makeText({ en: { title: 'T' }, zh: { title: '题' } });
ok(plain.en.sound === 'Sound' && plain.zh.sound === '声音', '缺失键经原型链落到 COMMON');
ok(plain.en.title === 'T' && plain.zh.title === '题', 'own 键原样保留');
const override = makeText({ en: { sound: 'S2' }, zh: { sound: '声2' } });
ok(override.en.sound === 'S2' && override.zh.sound === '声2', 'own 键优先覆盖 COMMON');
ok(Object.getPrototypeOf(plain.en) === COMMON_TEXT.en && Object.getPrototypeOf(plain.zh) === COMMON_TEXT.zh,
    '原型即 COMMON_TEXT（改一处全局生效）');

/* ─────────────── 静态收敛断言 ─────────────── */

console.log('\n▶ 源码收敛（防复制粘贴复活）');
for (const g of PAGES) {
    const src = readFileSync(join(ROOT, g.entry), 'utf8');
    const i18nVar = g.i18nVar || 'LANGUAGES';
    // 入口可以在 js/ 顶层（'./i18n.js'）或子目录（js/firefly-signal/main.js → '../i18n.js'）
    ok(/import \{ makeText \} from '\.{1,2}\/i18n\.js';/.test(src), `${g.entry} import makeText`);
    // 表名由注册表的 i18nVar 决定（缺省 LANGUAGES）—— 与迁移脚本同一判据，
    // 页面改名而注册表没跟着改，这里就会红。
    ok(new RegExp(`const ${i18nVar} = makeText\\(\\{`).test(src),
        `${g.entry} 语言表 ${i18nVar} 经 makeText 包装`);
}
const LITS = {
    en: { sound: 'Sound', language: '中文', moreGames: 'More games', close: 'Close', copied: 'Copied!', usernameLabel: 'Username (Enter to save)' },
    zh: { sound: '声音', language: 'English', moreGames: '更多游戏', close: '关闭', copied: '已复制！', usernameLabel: '用户名（回车保存）' },
};
// 扫描范围：js/ 顶层 + 骨架契约页入口所在的子目录（如 js/firefly-signal/）；js/math-rain/ 化外
const SCAN_DIRS = ['js', ...new Set(PAGES.map(g => dirname(g.entry)).filter(d => d !== 'js'))];
for (const f of SCAN_DIRS.flatMap(d => readdirSync(join(ROOT, d)).filter(x => x.endsWith('.js')).map(x => (d === 'js' ? x : `${d.slice(3)}/${x}`)))) {
    if (f === 'i18n.js') continue;
    const src = readFileSync(join(ROOT, 'js', f), 'utf8');
    let leaks = [];
    for (const lang of ['en', 'zh']) {
        for (const k of KEYS) {
            const val = LITS[lang][k];
            const re = new RegExp(`\\b${k}\\s*:\\s*(['"\`])${val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1`);
            if (re.test(src)) leaks.push(`${lang}.${k}`);
        }
    }
    ok(leaks.length === 0, `${f} 无公共键字面量副本${leaks.length ? '（泄漏: ' + leaks.join(',') + '）' : ''}`);
}
const siteSrc = readFileSync(join(ROOT, 'js', 'site-settings.js'), 'utf8');
ok(/['"]site_lang['"]/.test(siteSrc), '语言键 site_lang 仍由 site-settings.js 管理');

console.log(failed === 0 ? '\nverify-i18n 全部通过 ✅' : `\n${failed} 个失败 ❌`);
process.exit(failed === 0 ? 0 : 1);
