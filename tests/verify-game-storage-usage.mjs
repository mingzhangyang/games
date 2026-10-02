#!/usr/bin/env node
// Static guard for the first GameStorage migration batch.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(ROOT, path), 'utf8');
const failures = [];
const check = (condition, label) => {
    console.log(`${condition ? '✓' : '✗'} ${label}`);
    if (!condition) failures.push(label);
};

const carrotRuntime = read('src/games/carrot-pull/runtime.js');
const hoopRuntime = read('src/games/hoop-shot/runtime.js');
const bondRuntime = read('src/games/bond-forge/runtime.js');
const carrotStorage = read('src/games/carrot-pull/storage.js');
const hoopStorage = read('src/games/hoop-shot/storage.js');
const bondStorage = read('src/games/bond-forge/storage.js');

for (const [id, source] of [
    ['carrot-pull', carrotRuntime],
    ['hoop-shot', hoopRuntime],
]) {
    check(!/safe-storage|storage(Get|Set|Remove)\s*\(/.test(source),
        `${id}: runtime has no direct platform storage calls`);
    check(source.includes("from './storage.js'"),
        `${id}: runtime composes its GameStorage adapter`);
}

check(!/storageGet\s*\(/.test(bondRuntime),
    'bond-forge: runtime has no direct private-state reads');
check(!/storageSet\s*\(\s*PROGRESS_KEY/.test(bondRuntime),
    'bond-forge: progress is not written through a legacy key');
const keepsDailyCompletionKey = bondRuntime.includes('DAILY_COMPLETION_KEY_PREFIX')
    && /storageSet\s*\(\s*`\$\{DAILY_COMPLETION_KEY_PREFIX\}/.test(bondRuntime);
check(keepsDailyCompletionKey, 'bond-forge: daily completion marker keeps its legacy contract');
check(bondRuntime.includes("from './storage.js'"),
    'bond-forge: runtime composes its GameStorage adapter');

for (const [id, source, gameId] of [
    ['carrot-pull', carrotStorage, 'carrot-pull'],
    ['hoop-shot', hoopStorage, 'hoop-shot'],
    ['bond-forge', bondStorage, 'bond-forge'],
]) {
    check(source.includes('createGameStorage'), `${id}: adapter uses createGameStorage`);
    check(source.includes(`createGameStorage('${gameId}'`), `${id}: adapter uses the canonical game id`);
    check(source.includes('version: 1'), `${id}: adapter declares an explicit storage version`);
    check(source.includes('legacy:'), `${id}: adapter declares legacy key mappings`);
}

if (failures.length) {
    console.error(`\nverify-game-storage-usage: ${failures.length} failure(s)`);
    process.exit(1);
}
console.log('\nverify-game-storage-usage: all green');
