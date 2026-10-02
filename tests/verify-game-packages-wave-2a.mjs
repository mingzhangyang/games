#!/usr/bin/env node
// Static contract for Phase 3B package migrations.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';
import { registry } from './lib/registry.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const specs = [
    {
        id: 'silk-dew',
        files: ['index.js', 'runtime.js', 'i18n.js', 'model/levels.js', 'render/art.js', 'render/scene.js'],
        indexNeedles: ["from './runtime.js'", "from './i18n.js'", 'mountGameRuntime', 'setCanvasPalette', 'window.sdGame'],
        runtimeNeedles: ["from './i18n.js'", "from './model/levels.js'", "from './render/scene.js'", "from '../../platform/game-sfx.js'"],
        modelNeedles: ["from '../../../platform/daily.js"],
        handles: ['window.sdGame', 'window.sdRuntime', 'window.sdDrawer'],
        keys: ["'sd_progress'", "'sd_progress_version'"],
    },
    {
        id: 'planet-merge',
        files: ['index.js', 'runtime.js', 'i18n.js'],
        indexNeedles: ["from './runtime.js'", "from './i18n.js'", 'mountGameRuntime', 'window.planetMergeGame', 'window.pmRuntime'],
        runtimeNeedles: ["from './i18n.js'", "from '../../platform/game-sfx.js'", "from '../../platform/daily.js"],
        handles: ['window.planetMergeGame', 'window.pmRuntime', 'window.pmDrawer'],
        keys: ["'pm_best'", "'pm_local_scores'"],
    },
    {
        id: 'word-daily',
        files: ['index.js', 'runtime.js', 'i18n.js', 'data/en.js', 'data/zh.js'],
        indexNeedles: ["from './runtime.js'", "from './i18n.js'", 'mountGameRuntime', 'window.wordDailyGame', 'window.wordDailyRuntime'],
        runtimeNeedles: ["from './i18n.js'", "from './data/en.js'", "from './data/zh.js'", "from '../../platform/storage/game-storage.js'"],
        handles: ['window.wordDailyGame', 'window.wordDailyRuntime'],
        keys: ["'wd_lang_mode'", "'wd_hist_en'", "'wd_stats_en'"],
    },
    {
        id: 'shadow-loom',
        files: ['index.js', 'runtime.js', 'i18n.js', 'model/levels.js', 'model/rules.js', 'render/scene.js'],
        indexNeedles: ["from './runtime.js'", "from './i18n.js'", 'mountGameRuntime', 'window.slGame', 'window.slRuntime'],
        runtimeNeedles: ["from './i18n.js'", "from './model/rules.js'", "from './model/levels.js'", "from './render/scene.js'", "from '../../platform/game-sfx.js'"],
        modelNeedles: ["from '../../../generated/shadow-loom/silhouettes.js"],
        handles: ['window.slGame', 'window.slRuntime', 'window.slDrawer'],
        keys: ["'sl_progress'", "'sl_seen_chapters'"],
    },
];

const selectedSpecs = specs.filter(spec => keepPage(spec.id));
exitIfNoPages(selectedSpecs, 'verify-game-packages-wave-2a');

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
    const shim = read(`js/${spec.id}.js`).trim();

    check(game.entry === `${packageRoot}/index.js`, `${spec.id}: registry points at the package composition root`);
    for (const file of spec.files) check(existsSync(join(ROOT, packageRoot, file)), `${spec.id}: ${file} exists`);
    for (const needle of spec.indexNeedles) check(index.includes(needle), `${spec.id}: index composes ${needle}`);
    for (const needle of spec.runtimeNeedles) check(runtime.includes(needle), `${spec.id}: runtime delegates ${needle}`);
    for (const needle of spec.modelNeedles || []) {
        const modelFile = spec.id === 'silk-dew' ? `${packageRoot}/model/levels.js` : `${packageRoot}/model/rules.js`;
        check(read(modelFile).includes(needle), `${spec.id}: model delegates ${needle}`);
    }
    for (const handle of spec.handles) check(index.includes(handle), `${spec.id}: preserves ${handle}`);
    for (const key of spec.keys) check(runtime.includes(key), `${spec.id}: preserves storage contract ${key}`);
    check(!/from ['"]\.\/(?:input|render|model)\//.test(index), `${spec.id}: index does not own implementation modules`);
    check(index.length < 8 * 1024, `${spec.id}: composition root stays below 8 KiB`);
    check(shim === `// Compatibility entry kept for the existing ${spec.id}.html URL.\n// The canonical game package lives under src/games/${spec.id}/.\nimport '../src/games/${spec.id}/index.js';\nexport * from '../src/games/${spec.id}/runtime.js';`,
        `${spec.id}: legacy entry is a compatibility shim`);
}

if (failures.length) {
    console.error(`\nverify-game-packages-wave-2a: ${failures.length} failure(s)`);
    process.exit(1);
}
console.log('\nverify-game-packages-wave-2a: all green');
