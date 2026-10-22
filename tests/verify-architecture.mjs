#!/usr/bin/env node
// Module boundaries that keep the codebase layered:
//   src/platform  ← shared browser runtime, never imports a game
//   src/games/<id> ← one package per game, never imports another game
//   worker/, Workers/ ← Cloudflare code, never imports browser modules
// plus the page/registry/shell contracts every game shares.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import { registry } from './lib/registry.mjs';
import { renderGameShell } from '../src/platform/shell/render-game-shell.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rel = abs => relative(ROOT, abs).replaceAll('\\', '/');
const read = path => readFileSync(join(ROOT, path), 'utf8');

let failed = 0;
const ok = (condition, label, detail = '') => {
    if (condition) {
        console.log('✓ ' + label);
        return;
    }
    failed++;
    console.error('✗ ' + label + (detail ? ' — ' + detail : ''));
};

function walk(dir, out = []) {
    if (!existsSync(dir)) return out;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path, out);
        else if (['.js', '.mjs'].includes(extname(entry.name))) out.push(path);
    }
    return out;
}

function visit(node, fn) {
    if (!node || typeof node.type !== 'string') return;
    fn(node);
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(child => visit(child, fn));
        else if (value && typeof value === 'object') visit(value, fn);
    }
}

const astCache = new Map();
function ast(path) {
    if (!astCache.has(path)) {
        astCache.set(path, parse(readFileSync(path, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true }));
    }
    return astCache.get(path);
}

function importsOf(path) {
    const out = [];
    visit(ast(path), node => {
        if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression'].includes(node.type)
            && node.source?.type === 'Literal' && typeof node.source.value === 'string') {
            out.push(node.source.value);
        }
    });
    return out;
}

// Repository path an import points at, or the bare specifier for packages/protocols.
function target(specifier, importer) {
    if (/^\.\.?\//.test(specifier)) return rel(resolve(dirname(importer), specifier));
    if (specifier.startsWith('/')) return specifier.slice(1);
    return specifier;
}

const gameOf = path => /^src\/games\/([^/]+)\//.exec(path)?.[1] || null;

console.log('▶ import boundaries');
const crossGame = [];
const platformToGame = [];
for (const file of walk(join(ROOT, 'src'))) {
    const from = rel(file);
    for (const specifier of importsOf(file)) {
        const to = target(specifier, file);
        const owner = gameOf(from);
        const dest = gameOf(to);
        if (owner && dest && owner !== dest) crossGame.push(`${from} → ${to}`);
        if (/^src\/(platform|home)\//.test(from) && dest) platformToGame.push(`${from} → ${to}`);
    }
}
ok(crossGame.length === 0, 'game packages never import another game', crossGame.join(', '));
ok(platformToGame.length === 0, 'src/platform and src/home never import a game package', platformToGame.join(', '));

const workerLeaks = [];
for (const file of [...walk(join(ROOT, 'worker')), ...walk(join(ROOT, 'Workers'))]) {
    for (const specifier of importsOf(file)) {
        const to = target(specifier, file);
        if (/^(src|js)\//.test(to)) workerLeaks.push(`${rel(file)} → ${to}`);
    }
}
ok(workerLeaks.length === 0, 'Cloudflare Workers never import browser modules', workerLeaks.join(', '));

const directStorage = [];
for (const file of walk(join(ROOT, 'src', 'games'))) {
    visit(ast(file), node => {
        if (node.type === 'Identifier' && ['localStorage', 'sessionStorage'].includes(node.name)) {
            directStorage.push(`${rel(file)}:${node.name}`);
        }
    });
}
ok(directStorage.length === 0, 'games reach storage only through GameStorage / safe-storage', [...new Set(directStorage)].join(', '));

const jsFiles = readdirSync(join(ROOT, 'js')).sort();
ok(JSON.stringify(jsFiles) === JSON.stringify(['index-i18n-zh.js', 'index-page.js']),
    'js/ only holds the homepage entry and its generated zh table', jsFiles.join(', '));

console.log('\n▶ registry, pages and composition roots');
// Math Rain and Tank Battle keep their own shell and boot path by design.
const OWN_SHELL = new Set(['math-rain', 'tank-battle']);
for (const game of registry.all()) {
    const expected = `src/games/${game.id}/index.js`;
    ok(game.entry === expected && existsSync(join(ROOT, expected)), `${game.id}: registry entry is ${expected}`, game.entry);

    const html = read(game.href);
    const scripts = [...html.matchAll(/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/g)].map(match => match[1]);
    ok(scripts.some(src => src.startsWith(`src/games/${game.id}/`)), `${game.id}: page boots its own package`, scripts.join(', '));

    const entryPath = join(ROOT, expected);
    ok(statSync(entryPath).size <= 80 * 1024, `${game.id}: composition root stays below 80 KiB`, String(statSync(entryPath).size));
    if (OWN_SHELL.has(game.id)) continue;

    ok(readFileSync(entryPath, 'utf8').includes('mountGameRuntime'), `${game.id}: entry mounts the shared GameRuntime`);
    const required = (game.layout || 'standard') === 'immersive'
        ? ['game-shell', 'game-shell--immersive', 'game-topbar', 'game-stage']
        : ['game-shell', 'game-topbar', 'game-main', 'game-stage', 'game-footer'];
    const missing = required.filter(className => !html.includes(className));
    ok(missing.length === 0, `${game.id}: page uses the shared shell classes`, missing.join(', '));
}

console.log('\n▶ stylesheet order');
// tokens → layout → page CSS → shared additive sheets → mobile-fit → more-games. The tail sheets
// override page CSS on purpose (docs/contracts/layout.md), so their position is the contract.
const TAIL = ['scoreboard-dialog.css', 'stage-status.css', 'home-cards.css', 'mobile-fit.css', 'more-games.css'];
for (const href of ['index.html', ...registry.all().map(game => game.href)]) {
    const sheets = [...read(href).matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="css\/([^"]+)"/g)].map(match => match[1]);
    const problems = [];
    if (sheets[0] !== 'tokens.css' || sheets[1] !== 'layout.css') problems.push('must start with tokens.css, layout.css');
    if (sheets.filter(sheet => sheet === 'mobile-fit.css').length !== 1) problems.push('needs exactly one mobile-fit.css');
    if (new Set(sheets).size !== sheets.length) problems.push('duplicate stylesheet');
    const firstTail = sheets.findIndex(sheet => TAIL.includes(sheet));
    const tail = sheets.slice(firstTail);
    if (firstTail < 0 || tail.some(sheet => !TAIL.includes(sheet))) problems.push('page CSS must precede the shared tail');
    const order = tail.map(sheet => TAIL.indexOf(sheet));
    if (order.some((rank, i) => i && rank < order[i - 1])) problems.push('shared tail out of order');
    ok(problems.length === 0, `${href}: stylesheet order`, `${problems.join('; ')} [${sheets.join(' ')}]`);
}

console.log('\n▶ generated sources');
const generated = walk(join(ROOT, 'src', 'generated')).map(rel).sort();
const silhouetteManifest = JSON.parse(read('assets/shadow-loom/layers/silhouettes/manifest.json'));
const expectedGenerated = [
    'src/generated/shadow-loom/silhouettes.js',
    ...silhouetteManifest.playableLevels.map(id => `src/generated/shadow-loom/levels/${id}.js`),
].sort();
ok(JSON.stringify(generated) === JSON.stringify(expectedGenerated),
    'generated files exactly match the reproducible eight-level SVG contract', generated.join(', '));
ok(!read('src/generated/shadow-loom/silhouettes.js').includes('export const SILHOUETTES ='),
    'the runtime loader never statically includes every level\'s geometry');
ok(read('src/generated/shadow-loom/silhouettes.js').split('\n').slice(0, 5).join('\n').includes('// Generated by '),
    'generated shadow-loom cache carries its generator stamp');

console.log('\n▶ new-game shell scaffold');
const scaffold = renderGameShell({
    id: 'fixture-game',
    prefix: 'fg',
    entry: 'src/games/fixture-game/index.js',
    name: { en: 'Fixture Game', zh: '示例游戏' },
    caps: ['theme-light', 'topbar'],
    chrome: {
        home: {
            tag: 'a', attrs: { 'data-chrome': 'home', href: 'index.html', 'aria-label': 'Home' },
            icon: 'home',
        },
        name: { tag: 'h1', attrs: { class: 'game-topbar-name' }, textFrom: 'name.en' },
        actions: [
            {
                role: 'stats', tag: 'button', attrs: {
                    'data-chrome': 'stats', type: 'button', 'aria-label': 'Stats',
                    'aria-haspopup': 'dialog', 'aria-expanded': 'false',
                    'aria-controls': 'fgStatsDrawer',
                },
            },
            { role: 'sound', tag: 'button', attrs: { 'data-chrome': 'sound', 'aria-label': 'Sound' } },
        ],
    },
    themeColor: '#101820',
    themeColorLight: '#eef4f8',
});
ok(scaffold.includes('aria-haspopup="dialog"')
    && scaffold.includes('aria-controls="fgStatsDrawer"')
    && scaffold.includes('aria-expanded="false"'),
'generated shell stats trigger exposes its drawer relationship');
ok(scaffold.includes('data-light="#eef4f8"'), 'generated shell emits light theme color');
ok(scaffold.includes('registry:begin seo-script') && scaffold.includes('registry:end seo-script'),
    'generated shell seeds the SEO generation region');
ok(scaffold.includes('registry:begin topbar') && scaffold.includes('registry:end topbar')
    && scaffold.includes('<header class="fg-topbar game-topbar">'),
'generated shell uses the registry-driven shared topbar');

console.log(failed ? `\n${failed} architecture failure(s) ❌` : '\narchitecture contract passed ✅');
process.exit(failed ? 1 : 0);
