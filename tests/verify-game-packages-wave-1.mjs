#!/usr/bin/env node
// Static contract for Phase 3 / PR D package boundaries.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registry } from './lib/registry.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const specs = [
    {
        id: 'gravity-slingshot',
        files: ['index.js', 'runtime.js', 'config.js', 'model/course.js', 'model/physics.js', 'render/scene.js', 'input/pointer.js'],
        indexNeedles: ["from './runtime.js'", 'mountGameRuntime', 'window.__gravityDebug'],
        runtimeNeedles: ["from './model/course.js'", "from './model/physics.js'", "from './render/scene.js'", "from './input/pointer.js"],
        shim: "import '../src/games/gravity-slingshot/index.js';",
    },
    {
        id: 'bond-forge',
        files: ['index.js', 'runtime.js', 'model/molecules.js', 'model/levels.js', 'render/scene.js', 'input/pointer.js', 'i18n.js'],
        indexNeedles: ["from './runtime.js'", "from './i18n.js'", 'mountGameRuntime'],
        runtimeNeedles: ["from './model/molecules.js'", "from './model/levels.js'", "from './render/scene.js'", "from './input/pointer.js"],
        modelNeedles: ["from './molecules.js'"],
        shim: "import '../src/games/bond-forge/index.js';",
    },
    {
        id: 'needle-awn',
        files: ['index.js', 'runtime.js', 'config.js', 'input/controls.js', 'render/art.js', 'render/scene.js', 'i18n.js', 'audio.js', 'effects.js'],
        indexNeedles: ["from './runtime.js'", 'mountGameRuntime'],
        runtimeNeedles: ["from './i18n.js'", "from './audio.js'", "from './effects.js'", "from './input/controls.js"],
        shim: "import '../src/games/needle-awn/index.js';",
    },
];

const failures = [];
const check = (condition, label) => {
    console.log(`${condition ? '✓' : '✗'} ${label}`);
    if (!condition) failures.push(label);
};
const read = path => readFileSync(join(ROOT, path), 'utf8');

for (const spec of specs) {
    const game = registry.byId(spec.id);
    const packageRoot = `src/games/${spec.id}`;
    const index = read(`${packageRoot}/index.js`);
    const runtime = read(`${packageRoot}/runtime.js`);
    const shim = read(`js/${spec.id}.js`).trim();

    check(game.entry === `${packageRoot}/index.js`, `${spec.id}: registry points at the package composition root`);
    for (const file of spec.files) check(existsSync(join(ROOT, packageRoot, file)), `${spec.id}: ${file} exists`);
    for (const needle of spec.indexNeedles) check(index.includes(needle), `${spec.id}: index composes ${needle}`);
    for (const needle of spec.runtimeNeedles) check(runtime.includes(needle), `${spec.id}: runtime delegates ${needle}`);
    for (const needle of spec.modelNeedles || []) check(read(`${packageRoot}/model/levels.js`).includes(needle), `${spec.id}: data model reuses ${needle}`);
    check(!/from ['"]\.\/(?:input|render|model)\//.test(index), `${spec.id}: index does not own implementation modules`);
    check(index.length < 8 * 1024, `${spec.id}: composition root stays below 8 KiB`);
    check(shim === `// Compatibility entry kept for the existing ${spec.id}.html URL.\n// The canonical game package lives under src/games/${spec.id}/.\n${spec.shim}`,
        `${spec.id}: legacy entry is a compatibility shim`);
}

check(read('src/games/bond-forge/index.js').includes("from './i18n.js'"), 'bond-forge: existing package i18n module is reused');
const needleUsesExistingModules = read('src/games/needle-awn/runtime.js').includes("from './i18n.js'")
    && read('src/games/needle-awn/runtime.js').includes("from './audio.js'")
    && read('src/games/needle-awn/runtime.js').includes("from './effects.js'");
check(needleUsesExistingModules, 'needle-awn: existing i18n/audio/effects modules are reused');
check(read('src/games/gravity-slingshot/index.js').includes('window.__gravityDebug'),
    'gravity-slingshot: __gravityDebug remains published by the entry');

if (failures.length) {
    console.error(`\nverify-game-packages-wave-1: ${failures.length} failure(s)`);
    process.exit(1);
}
console.log('\nverify-game-packages-wave-1: all green');
