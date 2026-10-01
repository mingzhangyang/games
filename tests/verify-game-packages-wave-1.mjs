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
        files: ['index.js', 'runtime.js', 'storage.js', 'config.js', 'model/course.js', 'model/physics.js', 'render/scene.js', 'input/pointer.js'],
        indexNeedles: ["from './runtime.js'", 'mountGameRuntime', 'window.__gravityDebug'],
        runtimeNeedles: ["from './model/course.js'", "from './storage.js'", "from './model/physics.js'", "from './render/scene.js'", "from './input/pointer.js"],
        shim: "import '../src/games/gravity-slingshot/index.js';\nexport * from '../src/games/gravity-slingshot/runtime.js';",
    },
    {
        id: 'bond-forge',
        files: ['index.js', 'runtime.js', 'model/molecules.js', 'model/levels.js', 'render/scene.js', 'input/pointer.js', 'i18n.js'],
        indexNeedles: ["from './runtime.js'", "from './i18n.js'", 'mountGameRuntime'],
        runtimeNeedles: ["from './model/molecules.js'", "from './model/levels.js'", "from './render/scene.js'", "from './input/pointer.js"],
        modelNeedles: ["from './molecules.js'"],
        shim: "import '../src/games/bond-forge/index.js';\nexport * from '../src/games/bond-forge/runtime.js';",
    },
    {
        id: 'needle-awn',
        files: ['index.js', 'runtime.js', 'config.js', 'input/controls.js', 'render/art.js', 'render/scene.js', 'i18n.js', 'audio.js', 'effects.js'],
        indexNeedles: ["from './runtime.js'", 'mountGameRuntime'],
        runtimeNeedles: ["from './i18n.js'", "from './audio.js'", "from './effects.js'", "from './input/controls.js"],
        shim: "import '../src/games/needle-awn/index.js';\nexport * from '../src/games/needle-awn/runtime.js';",
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
const gravityHomeOwnership = read('src/games/gravity-slingshot/index.js').includes("owns: ['more', 'home']")
    && !read('src/games/gravity-slingshot/runtime.js').includes("this.el['btn-home'].addEventListener");
check(gravityHomeOwnership, 'gravity-slingshot: shared chrome exclusively owns the header Home button');

const bondRuntime = read('src/games/bond-forge/runtime.js');
check(bondRuntime.includes("const DAILY_COMPLETION_KEY_PREFIX = 'bf_daily_';"),
    'bond-forge: preserves the local daily completion key prefix');
check(bondRuntime.includes("const DAILY_LEADERBOARD_KEY_PREFIX = 'bond-forge';"),
    'bond-forge: uses the registry prefix for leaderboard keys');
check(bondRuntime.includes('dailyKey(DAILY_LEADERBOARD_KEY_PREFIX'),
    'bond-forge: leaderboard requests use the registry daily key');
check(bondRuntime.includes('this.dailyTotalDrags += this.drags'),
    'bond-forge: daily score aggregates every completed molecule');
const bondPinsDailyDate = bondRuntime.includes('this.dailyStartedAt = Date.now();')
    && bondRuntime.includes('this.dailyDateKey = todayKey(this.dailyStartedAt);')
    && bondRuntime.includes('this.buildDailyCourse(this.dailyStartedAt)')
    && bondRuntime.includes('const date = this.dailyDateKey || todayKey();')
    && bondRuntime.includes('DAILY_COMPLETION_KEY_PREFIX}${date}')
    && (bondRuntime.match(/dailyKey\(DAILY_LEADERBOARD_KEY_PREFIX, startedAt\)/g) || []).length >= 2;
check(bondPinsDailyDate, 'bond-forge: Daily result and leaderboard stay pinned to the UTC+8 start date');
const bondUsesCanonicalAnalytics = bondRuntime.includes("track('bond-forge', 'play')")
    && bondRuntime.includes("track('bond-forge', 'finish')")
    && !/track\('bond-forge',\s*['"](?:daily_start|level_start)['"]/.test(bondRuntime);
check(bondUsesCanonicalAnalytics, 'bond-forge: emits canonical analytics play events');
const bondDailyRetryContract = bondRuntime.includes("el['btn-again'].addEventListener('click', () => { sfxTone(660, 0.09, 'triangle', 0.12); this.startDaily(); });")
    && bondRuntime.includes('this.dailyIndex >= this.dailyCourse.length')
    && bondRuntime.includes("if (this.state === 'clear')")
    && bondRuntime.includes('this.dailyTotalDrags = Math.max(0, this.dailyTotalDrags - this.drags);');
check(bondDailyRetryContract, 'bond-forge: Daily Retry replaces the current attempt and Again starts a fresh run');

const needleControls = read('src/games/needle-awn/input/controls.js');
const needlePauseShortcuts = needleControls.includes("event.code === 'KeyP'")
    && needleControls.includes("event.code === 'Escape'")
    && needleControls.includes('!event.repeat')
    && needleControls.includes("game.state === 'paused'");
check(needlePauseShortcuts, 'needle-awn: P and Escape toggle pause and resume');
const needleKeyboardAccessibility = needleControls.includes('isInteractiveTarget(event.target)')
    && needleControls.includes("game.state === 'playing'")
    && needleControls.includes("game.dom.touchDash.addEventListener('click'")
    && !needleControls.includes("game.dom.touchDash.addEventListener('mousedown'");
check(needleKeyboardAccessibility, 'needle-awn: gameplay shortcuts preserve native keyboard control activation');

const needleIndex = read('src/games/needle-awn/index.js');
const needleRuntime = read('src/games/needle-awn/runtime.js');
const needleDuelArrowOwnership = needleRuntime.includes("const arrowsControlP1 = !(this.mode === 'duel' && this.duelMode === '2p');")
    && needleRuntime.includes("(arrowsControlP1 && this.keys['ArrowUp'])")
    && needleRuntime.includes("(arrowsControlP1 && this.keys['ArrowDown'])")
    && needleRuntime.includes("(arrowsControlP1 && this.keys['ArrowLeft'])")
    && needleRuntime.includes("(arrowsControlP1 && this.keys['ArrowRight'])");
check(needleDuelArrowOwnership, 'needle-awn: local 2P reserves Arrow movement for P2');
const needlePauseLabelContract = needleIndex.includes("window.gameEngine.state === 'paused'")
    && needleIndex.includes('text.resume')
    && needleIndex.includes('text.pauseTitle')
    && needleRuntime.includes("typeof chrome.renderPause === 'function'")
    && (needleRuntime.match(/this\.refreshPauseLabel\(\);/g) || []).length >= 4;
check(needlePauseLabelContract, 'needle-awn: chrome pause label follows localized engine state');

const gravityRuntime = read('src/games/gravity-slingshot/runtime.js');
const gravityCourse = read('src/games/gravity-slingshot/model/course.js');
const gravityStorage = read('src/games/gravity-slingshot/storage.js');
const gravityPureCourseModel = !gravityCourse.includes('safe-storage.js')
    && !gravityCourse.includes('storageGet(')
    && !gravityCourse.includes('storageSet(')
    && gravityStorage.includes("from '../../platform/safe-storage.js'")
    && gravityStorage.includes("from './model/course.js'");
check(gravityPureCourseModel, 'gravity-slingshot: daily course model stays pure and storage lives in an adapter');
const gravityPinsDailyDate = gravityRuntime.includes('this.dailyStartedAt = Date.now();')
    && gravityRuntime.includes('this.dailyDateKey = todayCompact(this.dailyStartedAt);')
    && gravityRuntime.includes('loadDailyCourse(this.dailyStartedAt)')
    && gravityRuntime.includes('const date = this.dailyDateKey || todayCompact(this.dailyStartedAt || Date.now());')
    && gravityCourse.includes('buildDailyCourse(now = Date.now())')
    && gravityCourse.includes('const date = todayCompact(now);');
check(gravityPinsDailyDate, 'gravity-slingshot: Daily result and board stay pinned to the UTC+8 start date');
check(gravityRuntime.includes("storageSet('gs_daily_' + date, '1')"),
    'gravity-slingshot: Daily completion writes the landing hub marker');

const needlePinsDailyDate = needleRuntime.includes('this.dailyDateKey = this.getTodayDateString();')
    && needleRuntime.includes("const dailyDate = this.mode === 'daily'")
    && needleRuntime.includes('STORAGE_KEYS.DAILY_PREFIX}${dailyDate}')
    && needleRuntime.includes('needle-awn-d${dailyDate}');
check(needlePinsDailyDate, 'needle-awn: Daily result and leaderboard stay pinned to the UTC+8 start date');

if (failures.length) {
    console.error(`\nverify-game-packages-wave-1: ${failures.length} failure(s)`);
    process.exit(1);
}
console.log('\nverify-game-packages-wave-1: all green');
