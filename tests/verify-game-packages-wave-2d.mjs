#!/usr/bin/env node
// Static contract for Phase 3E / PR H package migrations.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';
import { registry } from './lib/registry.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const check = (condition, message) => {
    if (!condition) failures.push(message);
    console.log(`${condition ? '✓' : '✗'} ${message}`);
};
const read = file => readFileSync(join(ROOT, file), 'utf8');
const size = file => statSync(join(ROOT, file)).size;

const specs = [
    {
        id: 'circuit',
        files: ['index.js', 'runtime.js', 'storage.js', 'i18n.js', 'model/levels.js'],
        indexNeedles: [
            "from '../../platform/boot.js'",
            "from '../../platform/runtime/game-runtime.js'",
            "from './runtime.js'",
            "from './i18n.js'",
            'initCanvasPalette',
            'window.ccGame',
            'window.ccRuntime',
            'window.ccDrawer',
        ],
        runtimeNeedles: [
            "from './model/levels.js'",
            "from './i18n.js'",
            "from './storage.js'",
            "from '../../platform/game-sfx.js'",
            "from '../../platform/theme.js'",
            'export { LANGUAGES } from',
            'export const W',
            'export class CircuitGame',
            'export function initCanvasPalette',
        ],
        modelNeedles: ["from '../../../platform/daily.js'", 'export const LEVELS', 'export function dailyLevel'],
        storageFile: 'storage.js',
        storageKeys: ["'cc_stars'"],
        runtimeKeys: ["'cc_daily_'", 'cc_local_'],
        legacy: `// Compatibility entry kept for the existing circuit.html URL.\n// The canonical game package lives under src/games/circuit/.\nimport '../src/games/circuit/index.js';\nexport * from '../src/games/circuit/runtime.js';`,
        dataLegacy: `// Compatibility entry kept for level verifiers and existing imports.\n// The canonical circuit data lives under src/games/circuit/model/levels.js.\nexport * from '../src/games/circuit/model/levels.js';`,
    },
    {
        id: 'tetris',
        files: ['index.js', 'runtime.js', 'i18n.js'],
        indexNeedles: [
            "from '../../platform/boot.js'",
            "from '../../platform/runtime/game-runtime.js'",
            "from './runtime.js'",
            "from './i18n.js'",
            'createTetrisGame',
            'window.game',
            'window.tetrisRuntime',
        ],
        runtimeNeedles: [
            "from './i18n.js'",
            "from '../../platform/game-sfx.js'",
            "from '../../platform/storage/game-storage.js'",
            'export class Tetris',
            'export const drawer',
            'export function createTetrisGame',
            'export function initTetrisPage',
            'export function bindTetrisControls',
            'g2.togglePause()',
        ],
        legacy: `// Compatibility entry kept for the existing tetris.html URL.\n// The canonical game package lives under src/games/tetris/.\nimport '../src/games/tetris/index.js';\nexport * from '../src/games/tetris/runtime.js';`,
    },
];

const selectedSpecs = specs.filter(spec => keepPage(spec.id));
exitIfNoPages(selectedSpecs, 'verify-game-packages-wave-2d');

for (const spec of selectedSpecs) {
    const packageRoot = `src/games/${spec.id}`;
    for (const file of spec.files) check(existsSync(join(ROOT, packageRoot, file)), `${spec.id}: package file exists: ${file}`);
    const index = read(`${packageRoot}/index.js`);
    const runtime = read(`${packageRoot}/runtime.js`);
    const storage = spec.storageFile ? read(`${packageRoot}/${spec.storageFile}`) : '';
    for (const needle of spec.indexNeedles) check(index.includes(needle), `${spec.id}: index keeps ${needle}`);
    for (const needle of spec.runtimeNeedles) check(runtime.includes(needle), `${spec.id}: runtime keeps ${needle}`);
    for (const key of spec.storageKeys || []) check(storage.includes(key), `${spec.id}: adapter preserves legacy storage contract ${key}`);
    for (const key of spec.runtimeKeys || []) check(runtime.includes(key), `${spec.id}: runtime preserves protocol storage contract ${key}`);
    for (const needle of spec.modelNeedles || []) check(read(`${packageRoot}/model/levels.js`).includes(needle), `${spec.id}: model keeps ${needle}`);
    check(index.length < 8 * 1024, `${spec.id}: composition root stays below 8 KiB`);
    check(!/\bonReady\s*\(/.test(runtime), `${spec.id}: runtime has no DOM boot registration`);
    check(!/mountGameRuntime/.test(runtime), `${spec.id}: runtime does not own platform composition`);
    check(read(`js/${spec.id}.js`).trimEnd() === spec.legacy, `${spec.id}: legacy entry is a compatibility shim`);
    check(size(`js/${spec.id}.js`) < 4 * 1024, `${spec.id}: legacy entry remains small`);
    const game = registry.all().find(item => item.id === spec.id);
    check(game?.entry === `${packageRoot}/index.js`, `${spec.id}: registry points to canonical package entry`);
    check(game?.href === `${spec.id}.html`, `${spec.id}: public URL remains unchanged`);
    if (spec.dataLegacy) {
        check(read('js/circuit-levels.js').trimEnd() === spec.dataLegacy, 'circuit: legacy level data shim is small and canonical');
        check(size('js/circuit-levels.js') < 4 * 1024, 'circuit: legacy level data shim remains small');
    }
}

if (failures.length) {
    console.error(`\nverify-game-packages-wave-2d: ${failures.length} failure(s)`);
    process.exit(1);
}
console.log('\nverify-game-packages-wave-2d: all green');
