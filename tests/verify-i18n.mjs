#!/usr/bin/env node
// verify-i18n.mjs — src/platform/i18n.js 公共文案唯一来源回归防线（P2-5）
//
// 断言：
//   1) 行为：makeText 原型链兜底（缺失键落 COMMON）、own 键优先覆盖、
//      COMMON_TEXT 黄金值（改文案须有意识地在 i18n.js 改一处）。
//   2) 收敛：11 个 shell-family 页均通过入口图使用提取的 i18n 模块且语言表经 makeText 包装；
//      js/ 下除 i18n.js 外不再存在 6 个公共键的字面量副本（防复制复活）。
//   3) 语言键：site_lang 仍由 src/platform/site-settings.js 管理（历史教训：键名曾写错）。
//
// 用法：node scripts/verify-i18n.mjs（无需浏览器/服务器）

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { registry } from './lib/registry.mjs';
import { graphIncludes } from './lib/static-module-graph.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// 页面清单来自注册表：骨架契约内的页面（caps:topbar）。新游戏自动纳入。
const PAGES = registry.withCap('topbar');
const KEYS = ['sound', 'language', 'moreGames', 'close', 'copied', 'usernameLabel'];
const DECLARATIVE_PAGES = new Set(['minesweeper', 'reversi', 'tetris', 'carrot-pull', 'circuit']);
const BINDING_ATTR_RE = /\b(data-i18n(?:-(?:title|label|placeholder|tooltip))?)\s*=\s*(["'])([^"']+)\2/g;

function skipQuoted(source, start) {
    const quote = source[start];
    for (let i = start + 1; i < source.length; i++) {
        if (source[i] === '\\') { i++; continue; }
        if (source[i] === quote) return i + 1;
    }
    return source.length;
}

function skipTrivia(source, start) {
    let i = start;
    while (i < source.length) {
        if (/\s/.test(source[i])) { i++; continue; }
        if (source.startsWith('//', i)) {
            const end = source.indexOf('\n', i + 2);
            i = end === -1 ? source.length : end + 1;
            continue;
        }
        if (source.startsWith('/*', i)) {
            const end = source.indexOf('*/', i + 2);
            i = end === -1 ? source.length : end + 2;
            continue;
        }
        break;
    }
    return i;
}

function findMatchingBrace(source, open) {
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        if (source[i] === '\'' || source[i] === '"' || source[i] === '`') {
            i = skipQuoted(source, i) - 1;
            continue;
        }
        if (source.startsWith('//', i)) {
            const end = source.indexOf('\n', i + 2);
            i = (end === -1 ? source.length : end) - 1;
            continue;
        }
        if (source.startsWith('/*', i)) {
            const end = source.indexOf('*/', i + 2);
            i = (end === -1 ? source.length : end + 2) - 1;
            continue;
        }
        if (source[i] === '{') depth++;
        if (source[i] === '}' && --depth === 0) return i;
    }
    return -1;
}

function extractObjectKeys(source, open) {
    const close = findMatchingBrace(source, open);
    const keys = new Set();
    if (close === -1) return keys;

    let depth = 0;
    for (let i = open + 1; i < close;) {
        if (source[i] === '\'' || source[i] === '"' || source[i] === '`') {
            const end = skipQuoted(source, i);
            if (depth === 0) {
                const after = skipTrivia(source, end);
                if (source[after] === ':') keys.add(source.slice(i + 1, end - 1));
            }
            i = end;
            continue;
        }
        if (source.startsWith('//', i) || source.startsWith('/*', i)) {
            i = skipTrivia(source, i);
            continue;
        }
        if (depth === 0 && /[$A-Z_a-z]/.test(source[i])) {
            const start = i++;
            while (i < close && /[$\w]/.test(source[i])) i++;
            const after = skipTrivia(source, i);
            if (source[after] === ':') keys.add(source.slice(start, i));
            continue;
        }
        if ('{[('.includes(source[i])) depth++;
        else if ('}])'.includes(source[i])) depth--;
        i++;
    }
    return keys;
}

function extractLanguageTableKeys(source, tableName) {
    const tablePattern = new RegExp(`\\b(?:const|let|var)\\s+${tableName}\\s*=\\s*(?:makeText\\s*\\(\\s*)?\\{`);
    const tableMatch = tablePattern.exec(source);
    if (!tableMatch) return { en: new Set(), zh: new Set() };
    const tableOpen = tableMatch.index + tableMatch[0].lastIndexOf('{');
    const tableClose = findMatchingBrace(source, tableOpen);
    const result = { en: new Set(), zh: new Set() };
    for (const lang of ['en', 'zh']) {
        const langPattern = new RegExp(`\\b${lang}\\s*:\\s*\\{`);
        const langMatch = langPattern.exec(source.slice(tableOpen + 1, tableClose));
        if (langMatch) {
            const langOpen = tableOpen + 1 + langMatch.index + langMatch[0].lastIndexOf('{');
            result[lang] = extractObjectKeys(source, langOpen);
        }
    }
    return result;
}

function extractBindingKeys(html) {
    return [...html.matchAll(BINDING_ATTR_RE)].map(([, attribute, , key]) => ({ attribute, key }));
}

function missingBindingKeys(bindings, tables) {
    return bindings.flatMap(({ attribute, key }) => ['en', 'zh']
        .filter(lang => !tables[lang].has(key))
        .map(lang => `${attribute}="${key}" missing in ${lang}`));
}

function withCommonKeys(tables) {
    return {
        en: new Set([...tables.en, ...Object.keys(COMMON_TEXT.en)]),
        zh: new Set([...tables.zh, ...Object.keys(COMMON_TEXT.zh)]),
    };
}

let failed = 0;
const ok = (cond, label, extra) => {
    if (cond) { console.log(`✓ ${label}`); return; }
    failed++;
    console.error(`✗ ${label}${extra !== undefined ? ' —— got: ' + extra : ''}`);
};

/* ─────────────── 行为断言 ─────────────── */

console.log('▶ 行为（makeText 原型链）');
const i18n = await import(pathToFileURL(join(ROOT, 'src', 'platform', 'i18n.js')).href);
const { COMMON_TEXT, makeText } = i18n;

ok(COMMON_TEXT.en.sound === 'Sound' && COMMON_TEXT.zh.sound === '声音', 'COMMON_TEXT.sound 黄金值');
ok(COMMON_TEXT.en.home === 'Home' && COMMON_TEXT.zh.home === '返回主页', 'COMMON_TEXT.home 黄金值');
ok(COMMON_TEXT.en.stats === 'Stats' && COMMON_TEXT.zh.stats === '数据统计', 'COMMON_TEXT.stats 黄金值');
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
const typoCase = missingBindingKeys(
    [{ attribute: 'data-i18n', key: 'pageTitel' }],
    { en: new Set(['pageTitle']), zh: new Set(['pageTitle']) },
);
ok(typoCase.length === 2, '绑定键校验能捕获拼写错误（en/zh）');

/* ─────────────── 静态收敛断言 ─────────────── */

console.log('\n▶ 源码收敛（防复制粘贴复活）');
for (const g of PAGES) {
    const src = readFileSync(join(ROOT, g.entry), 'utf8');
    const i18nVar = g.i18nVar || 'LANGUAGES';
    const extracted = join(ROOT, 'src', 'games', g.id, 'i18n.js');
    const hasExtracted = existsSync(extracted);
    const tableSrc = hasExtracted ? readFileSync(extracted, 'utf8') : src;
    const declarative = /createI18nBinder/.test(src);
    if (DECLARATIVE_PAGES.has(g.id)) {
        ok(declarative, `${g.id}: Phase 6 page uses declarative i18n binder`);
    }
    if (declarative) {
        ok(/import \{ createI18nBinder \} from ['"][^'"]*platform\/i18n\/bindings\.js['"];/.test(src),
            `${g.entry}: declarative i18n imports platform binder`);
        ok(/createI18nBinder\s*\(\s*\{/.test(src),
            `${g.entry}: declarative i18n creates binder`);
        const html = readFileSync(join(ROOT, g.href), 'utf8');
        ok(/data-i18n(?:-[a-z]+)?\s*=/.test(html),
            `${g.href}: declarative markup contains i18n bindings`);
        const tableKeys = withCommonKeys(extractLanguageTableKeys(tableSrc, i18nVar));
        const bindings = extractBindingKeys(html);
        const missing = missingBindingKeys(bindings, tableKeys);
        ok(tableKeys.en.size > 0 && tableKeys.zh.size > 0,
            `${g.id}: declarative en/zh language tables parsed`);
        ok(missing.length === 0,
            `${g.href}: all declarative binding keys resolve in en/zh`, missing.join(', '));
    }

    if (hasExtracted) {
        const moduleSrc = readFileSync(extracted, 'utf8');
        ok(new RegExp(`import \\{ makeText \\} from ['"][^'"]*platform/i18n\\.js['"];`).test(moduleSrc),
            `${g.id}: extracted i18n imports platform makeText`);
        ok(new RegExp(`export const ${i18nVar} = makeText\\(\\{`).test(moduleSrc),
            `${g.id}: extracted table ${i18nVar} uses makeText`);
        const namedImport = new RegExp(`import \\{\\s*${i18nVar}\\s*\\} from ['"][^'"]+['"];`).test(src);
        const extractedInGraph = graphIncludes(g.entry, `src/games/${g.id}/i18n.js`, ROOT);
        ok(namedImport && extractedInGraph,
            `${g.entry}: imports extracted ${i18nVar}`);
    } else {
        ok(/import \{ makeText \} from ['"][^'"]*i18n\.js['"];/.test(src), `${g.entry} import makeText`);
        ok(new RegExp(`const ${i18nVar} = makeText\\(\\{`).test(src),
            `${g.entry} 语言表 ${i18nVar} 经 makeText 包装`);
    }
}
const LITS = {
    en: { sound: 'Sound', language: '中文', moreGames: 'More games', close: 'Close', copied: 'Copied!', usernameLabel: 'Username (Enter to save)' },
    zh: { sound: '声音', language: 'English', moreGames: '更多游戏', close: '关闭', copied: '已复制！', usernameLabel: '用户名（回车保存）' },
};
function walkJs(dir, out = []) {
    if (!existsSync(dir)) return out;
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        const st = statSync(p);
        if (st.isDirectory()) walkJs(p, out);
        else if (entry.endsWith('.js')) out.push(p);
    }
    return out;
}
const SCAN_FILES = [
    ...walkJs(join(ROOT, 'js')),
    ...walkJs(join(ROOT, 'src', 'games')),
];
for (const abs of SCAN_FILES) {
    const rel = abs.slice(ROOT.length + 1).replace(/\\/g, '/');
    if (rel === 'src/platform/i18n.js') continue;
    const src = readFileSync(abs, 'utf8');
    let leaks = [];
    for (const lang of ['en', 'zh']) {
        for (const k of KEYS) {
            const val = LITS[lang][k];
            const re = new RegExp(`\\b${k}\\s*:\\s*(['"\`])${val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1`);
            if (re.test(src)) leaks.push(`${lang}.${k}`);
        }
    }
    ok(leaks.length === 0, `${rel} 无公共键字面量副本${leaks.length ? '（泄漏: ' + leaks.join(',') + '）' : ''}`);
}
const siteSrc = readFileSync(join(ROOT, 'src', 'platform', 'site-settings.js'), 'utf8');
ok(/['"]site_lang['"]/.test(siteSrc), '语言键 site_lang 仍由 src/platform/site-settings.js 管理');

console.log(failed === 0 ? '\nverify-i18n 全部通过 ✅' : `\n${failed} 个失败 ❌`);
process.exit(failed === 0 ? 0 : 1);
