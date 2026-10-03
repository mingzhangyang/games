#!/usr/bin/env node
// Static guard for the first seven GameStorage migration batches.
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
    'needle-awn': read('src/games/needle-awn/runtime.js'),
    'silk-dew': read('src/games/silk-dew/runtime.js'),
    'planet-merge': read('src/games/planet-merge/runtime.js'),
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
    'needle-awn': read('src/games/needle-awn/storage.js'),
    'sword-flight': read('src/games/sword-flight/storage.js'),
    'silk-dew': read('src/games/silk-dew/storage.js'),
    'planet-merge': read('src/games/planet-merge/storage.js'),
};

const swordFlightSources = {
    runState: read('src/games/sword-flight/model/run-state.js'),
    realm: read('src/games/sword-flight/model/realm.js'),
    scoring: read('src/games/sword-flight/systems/scoring.js'),
    combat: read('src/games/sword-flight/systems/combat.js'),
    daily: read('src/games/sword-flight/model/daily.js'),
    config: read('src/games/sword-flight/config.js'),
};
const needleConfig = read('src/games/needle-awn/config.js');

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
    const legacyStarsAccess = new RegExp(
        `\\bstorage(?:Get|Set|Remove)\\s*\\(\\s*(['"\\x60])${prefix}_stars\\1`,
    ).test(source);
    check(!legacyStarsAccess,
        `${id}: private stars no longer use the legacy key directly`);
    check(new RegExp(`${slotName}_STORAGE\\.set\\s*\\(\\s*${slotName}_STORAGE_SLOTS\\.STARS\\b`).test(source),
        `${id}: stars writes go through GameStorage`);
    const keepsDailyRead = source.includes(`storageGet('${prefix}_daily_' + todayKey())`);
    const keepsDailyWrite = source.includes(`storageSet('${prefix}_daily_' + date`);
    check(keepsDailyRead && keepsDailyWrite,
        `${id}: daily compatibility keys remain unchanged`);
    check(source.includes(`${prefix}_local_`),
        `${id}: local leaderboard compatibility keys remain unchanged`);
    check(source.includes("from './storage.js'"),
        `${id}: runtime composes its GameStorage adapter`);
}


const needleRuntime = runtimes['needle-awn'];
for (const keyName of ['UNLOCKED_LEVEL', 'LEVEL_STARS', 'ENDLESS_BEST', 'CLASH_MAX']) {
    const directPrivateAccess = new RegExp(
        `\\bstorage(?:Get|Set|Remove)\\s*\\(\\s*STORAGE_KEYS\\.${keyName}\\b`,
    ).test(needleRuntime);
    check(!directPrivateAccess, `needle-awn: ${keyName} no longer bypasses GameStorage`);
}
check(needleRuntime.includes("from './storage.js'"),
    'needle-awn: runtime composes its GameStorage adapter');
check(needleRuntime.includes('STORAGE_KEYS.DAILY_PREFIX'),
    'needle-awn: Daily compatibility key stays on the legacy protocol');
for (const keyName of ['UNLOCKED_LEVEL', 'LEVEL_STARS', 'ENDLESS_BEST', 'CLASH_MAX']) {
    check(adapters['needle-awn'].includes(`STORAGE_KEYS.${keyName}`),
        `needle-awn: adapter maps legacy ${keyName}`);
}
check(needleConfig.includes("DAILY_PREFIX: 'zj_daily_'"),
    'needle-awn: zj_daily_ protocol prefix is preserved');

const swordPrivateSource = [
    swordFlightSources.runState,
    swordFlightSources.realm,
    swordFlightSources.scoring,
    swordFlightSources.combat,
].join('\n');
const swordPrivateStorageIsolated = !swordPrivateSource.includes('safe-storage.js')
    && !/\bstorage(?:Get|Set|Remove)\s*\(/.test(swordPrivateSource);
check(swordPrivateStorageIsolated,
    'sword-flight: private record modules no longer use the platform storage facade');
for (const keyName of ['UNLOCKED_STAGE', 'STAGE_STARS', 'ENDLESS_BEST', 'MAX_REALM', 'MAX_COMBO']) {
    check(!swordPrivateSource.includes(`STORAGE_KEYS.${keyName}`),
        `sword-flight: ${keyName} is isolated behind GameStorage`);
    check(adapters['sword-flight'].includes(`STORAGE_KEYS.${keyName}`),
        `sword-flight: adapter maps legacy ${keyName}`);
}
const swordDailyStoragePreserved = swordFlightSources.daily.includes("from '../../../platform/safe-storage.js'")
    && swordFlightSources.daily.includes('STORAGE_KEYS.DAILY_PREFIX');
check(swordDailyStoragePreserved,
    'sword-flight: Daily compatibility storage remains unchanged');
check(swordFlightSources.config.includes("DAILY_PREFIX: 'sf_daily_'"),
    'sword-flight: sf_daily_ protocol prefix is preserved');


const silkRuntime = runtimes['silk-dew'];
check(silkRuntime.includes("import { storageGet } from '../../platform/safe-storage.js';"),
    'silk-dew: only leaderboard compatibility storage remains on the platform facade');
check(!/\bstorageSet\s*\(/.test(silkRuntime),
    'silk-dew: runtime has no direct platform storage writes');
check(!/\bsd_progress(?:_version)?\b/.test(silkRuntime),
    'silk-dew: legacy progress keys are isolated in its adapter');
check(silkRuntime.includes("from './storage.js'"),
    'silk-dew: runtime composes its GameStorage adapter');
check(silkRuntime.includes('loadSilkDewProgress()') && silkRuntime.includes('saveSilkDewProgress(this.progress)'),
    'silk-dew: progress reads and writes go through the adapter');
check(silkRuntime.includes("storageGet('sd_lb_' + game)"),
    'silk-dew: sd_lb_* leaderboard compatibility keys remain unchanged');
check(adapters['silk-dew'].includes("'sd_progress'") && adapters['silk-dew'].includes("'sd_progress_version'"),
    'silk-dew: adapter preserves the historical progress payload and v2 marker');
check(!adapters['silk-dew'].includes("'sd_lb_"),
    'silk-dew: leaderboard compatibility keys stay outside GameStorage');

const planetRuntime = runtimes['planet-merge'];
check(planetRuntime.includes("import { storageGet, storageSet } from '../../platform/safe-storage.js';"),
    'planet-merge: global mute and Daily compatibility storage remain on the platform facade');
const planetPrivateBypass = /\b(?:storage(?:Get|Set|Remove)|storageParse)\s*\(\s*(['"`])pm_(?:skin|best|local_scores)\1/.test(planetRuntime);
check(!planetPrivateBypass,
    'planet-merge: private skin, best, and local scores no longer bypass GameStorage');
check(planetRuntime.includes("from './storage.js'"),
    'planet-merge: runtime composes its GameStorage adapter');
check(/PLANET_MERGE_STORAGE\.set\s*\(\s*PLANET_MERGE_STORAGE_SLOTS\.SKIN\b/.test(planetRuntime),
    'planet-merge: skin writes go through GameStorage');
check(/PLANET_MERGE_STORAGE\.set\s*\(\s*PLANET_MERGE_STORAGE_SLOTS\.BEST\b/.test(planetRuntime),
    'planet-merge: best-score writes go through GameStorage');
check(/PLANET_MERGE_STORAGE\.set\s*\(\s*PLANET_MERGE_STORAGE_SLOTS\.LOCAL_SCORES\b/.test(planetRuntime),
    'planet-merge: local-score writes go through GameStorage');
check(planetRuntime.includes("storageSet('pm_muted', muted ? '1' : '0')"),
    'planet-merge: pm_muted remains a global mute compatibility mirror');
const planetDailyStoragePreserved = planetRuntime.includes('const key = `pm_daily_${this.dailyDay}`;')
    && planetRuntime.includes('storageParse(key, 0)')
    && planetRuntime.includes('storageSet(key, String(this.score))');
check(planetDailyStoragePreserved,
    'planet-merge: pm_daily_* compatibility keys remain unchanged');
const planetCompatibilityKeysIsolated = !adapters['planet-merge'].includes('pm_muted')
    && !adapters['planet-merge'].includes('pm_daily_');
check(planetCompatibilityKeysIsolated,
    'planet-merge: global/daily compatibility keys stay outside GameStorage');

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
    ['silk-dew', adapters['silk-dew'], ['sd_progress']],
    ['planet-merge', adapters['planet-merge'], ['pm_skin', 'pm_best', 'pm_local_scores']],
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
