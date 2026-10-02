#!/usr/bin/env node
// Static contract for Phase 3D / PR G package migrations.
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';
import { registry } from './lib/registry.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const specs = [
    {
        id: 'ripple-duet',
        files: ['index.js', 'runtime.js', 'i18n.js', 'model/rules.js', 'model/levels.js'],
        indexNeedles: ["from './runtime.js'", "from './i18n.js'", 'initCanvasPalette', 'mountGameRuntime', 'window.rdGame', 'window.rdRuntime', 'window.rdDrawer'],
        runtimeNeedles: ["from './i18n.js'", "from './model/rules.js'", "from './model/levels.js'", "from '../../platform/game-sfx.js'", "from '../../platform/theme.js'", 'export class RippleDuetGame'],
        modelNeedles: ["from '../../../platform/daily.js"],
        handles: ['window.rdGame', 'window.rdRuntime', 'window.rdDrawer'],
        keys: ["'rd_progress'", "'rd_lb_"],
        analytics: { play: 2, finish: 1, finalDailyGate: true },
        retired: ['js/ripple-duet-rules.js', 'js/ripple-duet-levels.js'],
    },
    {
        id: 'hoop-shot',
        files: ['index.js', 'runtime.js', 'i18n.js'],
        indexNeedles: ["from './runtime.js'", "from './i18n.js'", 'initCanvasPalette', 'mountGameRuntime', 'window.hoopShotGame', 'window.hsRuntime', 'window.hsDrawer'],
        runtimeNeedles: ["from './i18n.js'", "from '../../platform/game-sfx.js'", "from '../../platform/theme.js'", 'export class HoopShotGame', 'export const WORLD_W'],
        handles: ['window.hoopShotGame', 'window.hsRuntime', 'window.hsDrawer'],
        keys: ["'hs_best'", "'hs_longest_streak'", "'hs_local_scores'"],
    },
    {
        id: 'carrot-pull',
        files: ['index.js', 'runtime.js', 'i18n.js', 'render/art.js', 'render/scene.js', 'render/fallback-scene.js'],
        indexNeedles: ["from './runtime.js'", "from './i18n.js'", 'mountGameRuntime', 'window.cpGame', 'window.cpRuntime', 'window.cpDrawer'],
        runtimeNeedles: ["from './i18n.js'", "from './render/art.js'", "from './render/scene.js'", "from './render/fallback-scene.js'", "from '../../platform/game-sfx.js'", 'export function createGame'],
        handles: ['window.cpGame', 'window.cpRuntime', 'window.cpDrawer'],
        keys: ["'cp_best_score'"],
        renderNeedles: ['../../../../assets/carrot-pull/'],
        retired: ['js/carrot-pull-art.js', 'js/carrot-pull-scene.js', 'js/carrot-pull-fallback-scene.js'],
    },
    {
        id: 'lumen',
        files: ['index.js', 'runtime.js', 'i18n.js', 'model/levels.js'],
        indexNeedles: ["from './runtime.js'", "from './i18n.js'", 'mountGameRuntime', 'window.lmGame', 'window.lmRuntime', 'window.lmDrawer'],
        runtimeNeedles: ["from './i18n.js'", "from './model/levels.js'", "from '../../platform/daily.js'", "from '../../platform/game-sfx.js'", 'export class LumenGame'],
        modelNeedles: ["from '../../../platform/daily.js"],
        handles: ['window.lmGame', 'window.lmRuntime', 'window.lmDrawer'],
        keys: ["'lm_stars'", "'lm_daily_"],
        languageRefresh: true,
        retired: ['js/lumen-levels.js'],
    },
];

const selectedSpecs = specs.filter(spec => keepPage(spec.id));
exitIfNoPages(selectedSpecs, 'verify-game-packages-wave-3d');

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
    const i18n = read(`${packageRoot}/i18n.js`);
    const shim = read(`js/${spec.id}.js`).trim();

    check(game.entry === `${packageRoot}/index.js`, `${spec.id}: registry points at the package composition root`);
    for (const file of spec.files) check(existsSync(join(ROOT, packageRoot, file)), `${spec.id}: ${file} exists`);
    for (const needle of spec.indexNeedles) check(index.includes(needle), `${spec.id}: index composes ${needle}`);
    for (const needle of spec.runtimeNeedles) check(runtime.includes(needle), `${spec.id}: runtime delegates ${needle}`);
    for (const needle of spec.modelNeedles || []) check(read(`${packageRoot}/model/${spec.id === 'ripple-duet' ? 'rules' : 'levels'}.js`).includes(needle), `${spec.id}: model delegates ${needle}`);
    for (const needle of spec.renderNeedles || []) check(read(`${packageRoot}/render/art.js`).includes(needle), `${spec.id}: render module resolves ${needle}`);
    check(i18n.includes("from '../../platform/i18n.js'") && i18n.includes('export const LANGUAGES = makeText({'),
        `${spec.id}: language table is extracted into the package`);
    for (const handle of spec.handles) check(index.includes(handle), `${spec.id}: preserves ${handle}`);
    for (const key of spec.keys) check(runtime.includes(key), `${spec.id}: preserves storage contract ${key}`);
    if (spec.languageRefresh) {
        const languageStart = runtime.indexOf('applyLanguage() {');
        const languageEnd = runtime.indexOf('/* ── 菜单部件 ── */', languageStart);
        const languageMethod = runtime.slice(languageStart, languageEnd);
        check(languageMethod.indexOf('this.lang = getLang();') < languageMethod.indexOf('const t = this.TEXT;'),
            `${spec.id}: refreshes the language before resolving localized text`);
    }
    if (spec.analytics) {
        const count = event => (runtime.match(new RegExp(`track\\('${spec.id}', '${event}'\\)`, 'g')) || []).length;
        check(count('play') === spec.analytics.play, `${spec.id}: uses canonical play analytics events`);
        check(count('finish') === spec.analytics.finish, `${spec.id}: uses canonical finish analytics events`);
        if (spec.analytics.finalDailyGate) {
            check(runtime.includes("const isFinalDailyWave = this.mode === 'daily'")
                && runtime.includes('this.daily.cursor === this.daily.course.length - 1')
                && runtime.includes("if (this.mode !== 'daily' || isFinalDailyWave) track('ripple-duet', 'finish');"),
            `${spec.id}: gates daily finish analytics to the final wave`);
        }
        check(!/track\('ripple-duet', '(?:level_start|daily_start|level_win)'/.test(runtime),
            `${spec.id}: has no unsupported analytics event names`);
    }
    check(!/from ['"]\.\/(?:input|render|model)\//.test(index), `${spec.id}: index does not own implementation modules`);
    check(index.length < 8 * 1024, `${spec.id}: composition root stays below 8 KiB`);
    check(shim === `// Compatibility entry kept for the existing ${spec.id}.html URL.\n// The canonical game package lives under src/games/${spec.id}/.\nimport '../src/games/${spec.id}/index.js';\nexport * from '../src/games/${spec.id}/runtime.js';`,
        `${spec.id}: legacy entry is a compatibility shim`);
    for (const file of spec.retired || []) check(!existsSync(join(ROOT, file)), `${spec.id}: legacy implementation ${file} is retired`);
}

if (failures.length) {
    console.error(`\nverify-game-packages-wave-3d: ${failures.length} failure(s)`);
    process.exit(1);
}
console.log('\nverify-game-packages-wave-3d: all green');
