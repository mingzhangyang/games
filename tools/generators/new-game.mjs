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
const cssPath = `css/${id}.css`;
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
const entrySource = `import { onReady } from '../../platform/boot.js';
import { mountGameRuntime } from '../../platform/runtime/game-runtime.js';
import { createI18nBinder } from '../../platform/i18n/bindings.js';
import { getLang } from '../../platform/site-settings.js';

const TEXT = {
    en: { title: ${JSON.stringify(game.name.en)}, titleZh: ${JSON.stringify(game.name.zh)}, hint: 'Tap or use the keyboard to play.' },
    zh: { title: ${JSON.stringify(game.name.zh)}, titleZh: ${JSON.stringify(game.name.en)}, hint: '点击或使用键盘开始游戏。' },
};

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
        frame: {},
        more: '#${prefix}SideMore',
        drawer: {
            idPrefix: ${JSON.stringify(prefix)},
            onPause: g => g.pauseQuiet(),
            onResume: g => g.resumeQuiet(),
            isBusy: () => game.isRunning(),
            getText: () => TEXT[getLang()] || TEXT.en,
        },
        chrome: { owns: ['more'], getText: () => TEXT[getLang()] || TEXT.en },
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
