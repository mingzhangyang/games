#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { registry } from './lib/registry.mjs';
import { renderGameShell } from '../src/platform/shell/render-game-shell.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const ok = (cond, label, extra = '') => {
    if (cond) {
        console.log('✓ ' + label);
        return;
    }
    failed++;
    console.error('✗ ' + label + (extra ? ' — ' + extra : ''));
};

const scriptsDir = join(ROOT, 'scripts');
const scriptsRemain = existsSync(scriptsDir)
    ? readdirSync(scriptsDir).filter(name => {
        const p = join(scriptsDir, name);
        return statSync(p).isFile() || readdirSync(p).length > 0;
    })
    : [];
ok(scriptsRemain.length === 0, 'legacy scripts/ tree stays empty', scriptsRemain.join(', '));

ok(existsSync(join(ROOT, 'worker', 'index.js')), 'Cloudflare worker lives under worker/');
ok(!existsSync(join(ROOT, 'src', 'index.js')), 'src/index.js worker alias is gone');
ok(existsSync(join(ROOT, 'src', 'generated', 'shadow-loom', 'silhouettes.js')),
    'generated shadow-loom cache lives under src/generated/');
ok(!existsSync(join(ROOT, 'js', 'shadow-loom-silhouettes.js')),
    'generated shadow-loom cache does not leak back into js/');

const platformModules = [
    'analytics', 'boot', 'daily', 'game-chrome', 'game-drawer', 'game-frame',
    'game-sfx', 'i18n', 'icons', 'leaderboard', 'more-games', 'player',
    'safe-storage', 'site-settings', 'theme',
];
for (const name of platformModules) {
    const canonical = join(ROOT, 'src', 'platform', name + '.js');
    const shim = join(ROOT, 'js', name + '.js');
    ok(existsSync(canonical), 'platform module exists: ' + name);
    ok(!existsSync(shim), 'legacy js/' + name + '.js is removed');
}

const independentArchitectures = new Set(['math-rain', 'tank-battle']);
for (const game of registry.all()) {
    if (independentArchitectures.has(game.id)) continue;
    const entry = readFileSync(join(ROOT, game.entry), 'utf8');
    ok(entry.includes('mountGameRuntime'),
        game.id + ': entry uses GameRuntime',
        game.entry);
}

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
for (const [name, command] of Object.entries(pkg.scripts || {})) {
    ok(!/\bscripts\//.test(command), 'package script avoids legacy scripts/: ' + name, command);
}

for (const rel of [
    'tools/generators/gen-from-registry.mjs',
    'tools/checks/run-lint.mjs',
    'tests/lib/serve-static.mjs',
    'tests/verify-all.mjs',
    'games.schema.json',
]) {
    ok(existsSync(join(ROOT, rel)), 'architecture path exists: ' + rel);
}

const scaffold = renderGameShell({
    id: 'fixture-game',
    prefix: 'fg',
    entry: 'src/games/fixture-game/main.js',
    name: { en: 'Fixture Game', zh: '示例游戏' },
    caps: ['theme-light'],
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

console.log(failed ? '\n' + failed + ' architecture contract failure(s) ❌' : '\narchitecture-v2 contract passed ✅');
process.exit(failed ? 1 : 0);
