#!/usr/bin/env node
// Static guard for the first four GameStorage migration batches.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = relPath => readFileSync(join(ROOT, relPath), 'utf8');
const failures = [];
const check = (condition, label) => {
    console.log(`${condition ? '✓' : '✗'} ${label}`);
    if (!condition) failures.push(label);
};

const runtimes = {
    'carrot-pull': read('src/games/carrot-pull/runtime.js'),
    'hoop-shot': read('src/games/hoop-shot/runtime.js'),
    'bond-forge': read('src/games/bond-forge/runtime.js'),
    'shadow-loom': read('src/games/shadow-loom/runtime.js'),
    'echo-cave': read('src/games/echo-cave/runtime.js'),
    'maxwell-demon': read('src/games/maxwell-demon/runtime.js'),
    'crystal-bloom': read('src/games/crystal-bloom/runtime.js'),
    'flame-verse': read('src/games/flame-verse/runtime.js'),
    'ripple-duet': read('src/games/ripple-duet/runtime.js'),
    'circuit': read('src/games/circuit/runtime.js'),
    'lumen': read('src/games/lumen/runtime.js'),
};
const adapters = {
    'carrot-pull': read('src/games/carrot-pull/storage.js'),
    'hoop-shot': read('src/games/hoop-shot/storage.js'),
    'bond-forge': read('src/games/bond-forge/storage.js'),
    'shadow-loom': read('src/games/shadow-loom/storage.js'),
    'echo-cave': read('src/games/echo-cave/storage.js'),
    'maxwell-demon': read('src/games/maxwell-demon/storage.js'),
    'crystal-bloom': read('src/games/crystal-bloom/storage.js'),
    'flame-verse': read('src/games/flame-verse/storage.js'),
    'ripple-duet': read('src/games/ripple-duet/storage.js'),
    'circuit': read('src/games/circuit/storage.js'),
    'lumen': read('src/games/lumen/storage.js'),
};

for (const id of ['carrot-pull', 'hoop-shot']) {
    const source = runtimes[id];
    check(!/safe-storage|storage(Get|Set|Remove)\s*\(/.test(source),
        `${id}: runtime has no direct platform storage calls`);
    check(source.includes("from './storage.js'"),
        `${id}: runtime composes its GameStorage adapter`);
}

const bondRuntime = runtimes['bond-forge'];
check(!/storageGet\s*\(/.test(bondRuntime),
    'bond-forge: runtime has no direct private-state reads');
check(!/storageSet\s*\(\s*['"`]bf_progress['"`]/.test(bondRuntime),
    'bond-forge: progress is not written through the legacy key');
check(/BOND_FORGE_STORAGE\.set\s*\(\s*BOND_FORGE_STORAGE_SLOTS\.PROGRESS\b/.test(bondRuntime),
    'bond-forge: progress writes go through GameStorage');
const keepsDailyCompletionKey = bondRuntime.includes('DAILY_COMPLETION_KEY_PREFIX')
    && /storageSet\s*\(\s*`\$\{DAILY_COMPLETION_KEY_PREFIX\}/.test(bondRuntime);
check(keepsDailyCompletionKey, 'bond-forge: daily completion marker keeps its legacy contract');
check(bondRuntime.includes("from './storage.js'"),
    'bond-forge: runtime composes its GameStorage adapter');

const shadowRuntime = runtimes['shadow-loom'];
check(!shadowRuntime.includes("from '../../platform/safe-storage.js'"),
    'shadow-loom: runtime no longer imports the platform storage facade');
check(!/\bstorage(Get|Set|Remove)\s*\(/.test(shadowRuntime),
    'shadow-loom: runtime has no direct platform storage calls');
check(!/\bsl_(progress|seen_chapters)\b/.test(shadowRuntime),
    'shadow-loom: legacy private keys are isolated in its adapter');
check(/SHADOW_LOOM_STORAGE\.set\s*\(\s*SHADOW_LOOM_STORAGE_SLOTS\.PROGRESS\b/.test(shadowRuntime),
    'shadow-loom: progress writes go through GameStorage');
check(/SHADOW_LOOM_STORAGE\.set\s*\(\s*SHADOW_LOOM_STORAGE_SLOTS\.SEEN_CHAPTERS\b/.test(shadowRuntime),
    'shadow-loom: chapter-history writes go through GameStorage');
check(shadowRuntime.includes("from './storage.js'"),
    'shadow-loom: runtime composes its GameStorage adapter');

for (const [id, prefix, slotName] of [
    ['echo-cave', 'ec', 'ECHO_CAVE'],
    ['maxwell-demon', 'md', 'MAXWELL_DEMON'],
    ['crystal-bloom', 'cb', 'CRYSTAL_BLOOM'],
    ['flame-verse', 'fv', 'FLAME_VERSE'],
    ['ripple-duet', 'rd', 'RIPPLE_DUET'],
]) {
    const source = runtimes[id];
    check(source.includes("import { storageGet } from '../../platform/safe-storage.js';"),
        `${id}: only the legacy leaderboard reader remains on platform storage`);
    check(!/\bstorageSet\s*\(/.test(source),
        `${id}: runtime has no direct platform storage writes`);
    const legacyProgressRead = source.includes(`storageGet('${prefix}_progress')`)
        || source.includes(`storageGet("${prefix}_progress")`);
    check(!legacyProgressRead,
        `${id}: private progress no longer reads the legacy key directly`);
    check(source.includes(`storageGet('${prefix}_lb_' + game)`),
        `${id}: leaderboard cache keeps its legacy/protocol key`);
    check(new RegExp(`${slotName}_STORAGE\\.set\\s*\\(\\s*${slotName}_STORAGE_SLOTS\\.PROGRESS\\b`).test(source),
        `${id}: progress writes go through GameStorage`);
    check(source.includes("from './storage.js'"),
        `${id}: runtime composes its GameStorage adapter`);
}


for (const [id, prefix, slotName] of [
    ['circuit', 'cc', 'CIRCUIT'],
    ['lumen', 'lm', 'LUMEN'],
]) {
    const source = runtimes[id];
    check(source.includes("import { storageGet, storageSet } from '../../platform/safe-storage.js';"),
        `${id}: protocol storage remains on the platform facade`);
    check(!source.includes(`storageGet('${prefix}_stars')`)
        && !source.includes(`storageSet('${prefix}_stars'`),
        `${id}: private stars no longer use the legacy key directly`);
    check(new RegExp(`${slotName}_STORAGE\\.set\\s*\\(\\s*${slotName}_STORAGE_SLOTS\\.STARS\\b`).test(source),
        `${id}: stars writes go through GameStorage`);
    check(source.includes(`storageGet('${prefix}_daily_' + todayKey())`)
        && source.includes(`storageSet('${prefix}_daily_' + date`),
        `${id}: daily compatibility keys remain unchanged`);
    check(source.includes(`${prefix}_local_`),
        `${id}: local leaderboard compatibility keys remain unchanged`);
    check(source.includes("from './storage.js'"),
        `${id}: runtime composes its GameStorage adapter`);
}

for (const [id, source] of Object.entries(adapters)) {
    check(source.includes('createGameStorage'), `${id}: adapter uses createGameStorage`);
    check(source.includes(`createGameStorage('${id}'`), `${id}: adapter uses the canonical game id`);
    check(source.includes('version: 1'), `${id}: adapter declares an explicit storage version`);
    check(source.includes('legacy:'), `${id}: adapter declares legacy key mappings`);
}

for (const [id, source, legacyKeys] of [
    ['shadow-loom', adapters['shadow-loom'], ['sl_progress', 'sl_seen_chapters']],
    ['echo-cave', adapters['echo-cave'], ['ec_progress']],
    ['maxwell-demon', adapters['maxwell-demon'], ['md_progress']],
    ['crystal-bloom', adapters['crystal-bloom'], ['cb_progress']],
    ['flame-verse', adapters['flame-verse'], ['fv_progress']],
    ['ripple-duet', adapters['ripple-duet'], ['rd_progress']],
    ['circuit', adapters['circuit'], ['cc_stars']],
    ['lumen', adapters['lumen'], ['lm_stars']],
]) {
    for (const key of legacyKeys) {
        check(source.includes(`'${key}'`), `${id}: adapter preserves legacy key ${key}`);
    }
}

if (failures.length) {
    console.error(`\nverify-game-storage-usage: ${failures.length} failure(s)`);
    process.exit(1);
}
console.log('\nverify-game-storage-usage: all green');
