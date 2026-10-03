#!/usr/bin/env node
// Static contract for Phase 3C package migrations.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';
import { registry } from './lib/registry.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const specs = [
    {
        id: 'maxwell-demon',
        files: ['index.js', 'runtime.js', 'storage.js', 'i18n.js', 'model/rules.js'],
        indexNeedles: ["from './runtime.js'", "from './i18n.js'", 'initCanvasPalette', 'mountGameRuntime', 'window.mdGame', 'window.mdRuntime'],
        runtimeNeedles: ["from './i18n.js'", "from './storage.js'", "from './model/rules.js'", "from '../../platform/icons.js'", "from '../../platform/daily.js'", "from '../../platform/game-sfx.js'"],
        handles: ['window.mdGame', 'window.mdRuntime', 'window.mdDrawer'],
        keys: ["'md_lb_'"],
        storageKeys: ["'md_progress'"],
    },
    {
        id: 'crystal-bloom',
        files: ['index.js', 'runtime.js', 'storage.js', 'i18n.js', 'model/rules.js'],
        indexNeedles: ["from './runtime.js'", "from './i18n.js'", 'initCanvasPalette', 'mountGameRuntime', 'window.cbGame', 'window.cbRuntime'],
        runtimeNeedles: ["from './i18n.js'", "from './storage.js'", "from './model/rules.js'", "from '../../platform/icons.js'", "from '../../platform/daily.js'", "from '../../platform/game-sfx.js'"],
        handles: ['window.cbGame', 'window.cbRuntime', 'window.cbDrawer'],
        keys: ["'cb_lb_'"],
        storageKeys: ["'cb_progress'"],
    },
    {
        id: 'flame-verse',
        files: ['index.js', 'runtime.js', 'storage.js', 'i18n.js', 'model/rules.js'],
        indexNeedles: ["from './runtime.js'", "from './i18n.js'", 'mountGameRuntime', 'window.fvGame', 'window.fvRuntime'],
        runtimeNeedles: ["from './i18n.js'", "from './storage.js'", "from './model/rules.js'", "from '../../platform/icons.js'", "from '../../platform/daily.js'", "from '../../platform/game-sfx.js'"],
        handles: ['window.fvGame', 'window.fvRuntime', 'window.fvDrawer'],
        keys: ["'fv_lb_'"],
        storageKeys: ["'fv_progress'"],
    },
    {
        id: 'echo-cave',
        files: ['index.js', 'runtime.js', 'storage.js', 'i18n.js', 'model/rules.js'],
        indexNeedles: ["from './runtime.js'", "from './i18n.js'", 'mountGameRuntime', 'window.ecGame', 'window.ecRuntime'],
        runtimeNeedles: ["from './i18n.js'", "from './storage.js'", "from './model/rules.js'", "from '../../platform/icons.js'", "from '../../platform/daily.js'", "from '../../platform/game-sfx.js'"],
        handles: ['window.ecGame', 'window.ecRuntime', 'window.ecDrawer'],
        keys: ["'ec_lb_'"],
        storageKeys: ["'ec_progress'"],
    },
];

const selectedSpecs = specs.filter(spec => keepPage(spec.id));
exitIfNoPages(selectedSpecs, 'verify-game-packages-wave-2b');

const failures = [];
const check = (condition, label) => {
    console.log(`${condition ? '✓' : '✗'} ${label}`);
    if (!condition) failures.push(label);
};
const read = path => readFileSync(join(ROOT, path), 'utf8');

for (const spec of selectedSpecs) {
    const packageRoot = `src/games/${spec.id}`;
    const game = registry.byId(spec.id);
    const index = read(`${packageRoot}/index.js`);
    const runtime = read(`${packageRoot}/runtime.js`);
    const rules = read(`${packageRoot}/model/rules.js`);
    const i18n = read(`${packageRoot}/i18n.js`);
    const shim = read(`js/${spec.id}.js`).trim();
    const storage = spec.storageKeys ? read(`${packageRoot}/storage.js`) : '';

    check(game.entry === `${packageRoot}/index.js`, `${spec.id}: registry points at the package composition root`);
    for (const file of spec.files) check(existsSync(join(ROOT, packageRoot, file)), `${spec.id}: ${file} exists`);
    for (const needle of spec.indexNeedles) check(index.includes(needle), `${spec.id}: index composes ${needle}`);
    for (const needle of spec.runtimeNeedles) check(runtime.includes(needle), `${spec.id}: runtime delegates ${needle}`);
    check(i18n.includes("from '../../platform/i18n.js'") && i18n.includes('export const LANGUAGES = makeText({'),
        `${spec.id}: language table is extracted into the package`);
    check(rules.includes("from '../../../platform/daily.js'"), `${spec.id}: model uses the shared daily module`);
    for (const handle of spec.handles) check(index.includes(handle), `${spec.id}: preserves ${handle}`);
    for (const key of spec.keys || []) check(runtime.includes(key), `${spec.id}: preserves runtime storage contract ${key}`);
    for (const key of spec.storageKeys || []) check(storage.includes(key), `${spec.id}: adapter preserves legacy storage contract ${key}`);
    check(!/from ['"]\.\/(?:input|render|model)\//.test(index), `${spec.id}: index does not own implementation modules`);
    check(index.length < 8 * 1024, `${spec.id}: composition root stays below 8 KiB`);
    check(shim === `// Compatibility entry kept for the existing ${spec.id}.html URL.\n// The canonical game package lives under src/games/${spec.id}/.\nimport '../src/games/${spec.id}/index.js';\nexport * from '../src/games/${spec.id}/runtime.js';`,
        `${spec.id}: legacy entry is a compatibility shim`);
    check(!existsSync(join(ROOT, `js/${spec.id}-rules.js`)) && !existsSync(join(ROOT, `js/${spec.id}-caves.js`)),
        `${spec.id}: legacy rules module is retired from js/`);
}

if (failures.length) {
    console.error(`\nverify-game-packages-wave-2b: ${failures.length} failure(s)`);
    process.exit(1);
}
console.log('\nverify-game-packages-wave-2b: all green');
