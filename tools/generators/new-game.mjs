#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderGameShell } from '../../src/platform/shell/render-game-shell.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const id = process.argv.find(arg => !arg.startsWith('--') && arg !== process.argv[0] && arg !== process.argv[1]);
const dryRun = process.argv.includes('--dry-run');
if (!id) {
    console.error('usage: npm run new:game -- <registry-id> [--dry-run]');
    process.exit(2);
}
const registry = JSON.parse(readFileSync(join(ROOT, 'games.config.json'), 'utf8'));
const game = registry.games.find(item => item.id === id);
if (!game) {
    console.error(`registry game not found: ${id}`);
    process.exit(2);
}
const entry = game.entry;
const htmlPath = game.href;
const cssPath = game.shell?.styles?.page || `css/${id}.css`;
for (const path of [entry, htmlPath, cssPath]) {
    if (existsSync(join(ROOT, path))) {
        console.error(`refusing to overwrite existing file: ${path}`);
        process.exit(1);
    }
}
if (!entry.startsWith(`src/games/${id}/`)) {
    console.error(`new games must use entry under src/games/${id}/ (registry has ${entry})`);
    process.exit(1);
}

const prefix = game.prefix || id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const caps = game.caps || [];
const hasDrawer = caps.includes('drawer');
// Historical drawer IDs belong to each shipped game's existing adapter. Fresh
// games use the shared adapter's convention, so a custom ID must not silently
// produce an unbound Stats button.
if (hasDrawer && game.shell?.drawer?.idBase && game.shell.drawer.idBase !== `${prefix}Stats`) {
    throw new Error('new-game drawer requires the default ID convention');
}
const footer = game.shell?.footer || {};
const footerKey = footer.key === undefined ? 'hint' : footer.key;
const footerTouchKey = footer.touchKey === undefined ? 'hintTouch' : footer.touchKey;
if (footerKey === null && (typeof footer.text !== 'string' || !footer.text.trim())) {
    throw new Error('new-game requires non-empty static footer text when its i18n key is null');
}
// Touch copy is an alternative for a bound i18n key, never a standalone binding.
// Preserve the registry default by requiring static footers to opt out explicitly.
if (footerKey === null && footerTouchKey !== null) {
    throw new Error('new-game static footer requires touchKey: null');
}
const textTables = {
    en: { title: game.name.en, titleZh: game.name.zh, stats: 'Stats', close: 'Close' },
    zh: { title: game.name.zh, titleZh: game.name.en, stats: '统计', close: '关闭' },
};
const defaultHints = {
    en: { desktop: 'Tap or use the keyboard to play.', touch: 'Tap to play.' },
    zh: { desktop: '点击或使用键盘开始游戏。', touch: '轻触开始游戏。' },
};
for (const [lang, table] of Object.entries(textTables)) {
    if (footerKey !== null && !Object.hasOwn(table, footerKey)) {
        table[footerKey] = defaultHints[lang].desktop;
    }
    if (footerTouchKey !== null && !Object.hasOwn(table, footerTouchKey)) {
        table[footerTouchKey] = defaultHints[lang].touch;
    }
}
const drawerOptions = hasDrawer ? `        drawer: {
            ICONS,
            idPrefix: ${JSON.stringify(prefix)},
            onPause: g => g.pauseQuiet(),
            onResume: g => g.resumeQuiet(),
            isBusy: () => game.isRunning(),
            getText: () => TEXT[getLang()] || TEXT.en,
        },
` : '';
const entrySource = `import { makeText } from '../../platform/i18n.js';
${hasDrawer ? "import { ICONS } from '../../platform/icons.js';\n" : ''}import { onReady } from '../../platform/boot.js';
import { mountGameRuntime } from '../../platform/runtime/game-runtime.js';
import { createI18nBinder } from '../../platform/i18n/bindings.js';
import { getLang } from '../../platform/site-settings.js';

const TEXT = makeText(${JSON.stringify(textTables, null, 4)});

class Game {
    pauseQuiet() {}
    resumeQuiet() {}
    isRunning() { return false; }
}

onReady(() => {
    const game = new Game();
    const i18n = createI18nBinder({ getLang, tables: TEXT });
    i18n.apply();
    window.addEventListener('site-settings:changed', () => i18n.apply());

    window.gameRuntime = mountGameRuntime({
        self: ${JSON.stringify(game.href)},
        game,
        frame: ${game.layout === 'immersive' ? "{ layout: 'immersive' }" : '{}'},
${caps.includes('sidebar') ? `        more: '#${prefix}SideMore',\n` : ''}${drawerOptions}        chrome: { owns: ['home', 'sound'], getText: () => TEXT[getLang()] || TEXT.en },
    });
});
`;
const cssSource = `/* Page-specific styles. Shared structure belongs to tokens/layout/components layers. */
body { margin: 0; background: var(--tok-bg); color: var(--tok-text); }
`;
const html = renderGameShell(game);

if (dryRun) {
    console.log([htmlPath, entry, cssPath].join('\n'));
    process.exit(0);
}
for (const [path, content] of [[htmlPath, html], [entry, entrySource], [cssPath, cssSource]]) {
    const full = join(ROOT, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
    console.log('created ' + path);
}
console.log('next: npm run gen && npm run verify:changed');
