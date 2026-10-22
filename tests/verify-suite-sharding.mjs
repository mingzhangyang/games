#!/usr/bin/env node
// CI runs the browser suite as `--browser --with-dist --shard=k/n`. A shard split that drops
// or duplicates a step silently loses (or doubles) coverage, so pin the invariants here.
import assert from 'node:assert/strict';
import { discover, selectChangedSuite, shardSuite } from './verify-all.mjs';

const browser = discover().filter(step => step.needsServer);
const DIST = ['verify-chrome', 'verify-theme', 'verify-stats-drawer', 'smoke-index'];
const steps = [
    ...browser,
    ...browser.filter(step => DIST.includes(step.name)).map(step => ({ ...step, name: `dist:${step.name}`, served: 'dist' })),
];
assert.ok(browser.length > 20, 'browser steps are discovered');

for (let count = 1; count <= 6; count++) {
    const shards = Array.from({ length: count }, (_, i) => shardSuite(steps, i + 1, count).map(step => step.name));
    const all = shards.flat();
    assert.equal(all.length, steps.length, `${count} shards: every step runs exactly once`);
    assert.deepEqual(new Set(all), new Set(steps.map(step => step.name)), `${count} shards: no step is lost`);
    assert.deepEqual(shards, Array.from({ length: count }, (_, i) => shardSuite(steps, i + 1, count).map(step => step.name)),
        `${count} shards: assignment is deterministic`);
}

// The two heaviest steps (source + built-output drawer runs) must not serialize in one shard.
const four = Array.from({ length: 4 }, (_, i) => shardSuite(steps, i + 1, 4).map(step => step.name));
const shardOf = name => four.findIndex(names => names.includes(name));
assert.notEqual(shardOf('verify-stats-drawer'), shardOf('dist:verify-stats-drawer'), 'heaviest pair lands in different shards');

// The registry-owned topbar checker is global in a full run, but must also
// participate when --changed selects a single game page (without scanning all
// unrelated generated headers). The global registry gates remain unfiltered.
const topbarStep = discover().find(step => step.name === 'verify-topbar-registry');
assert(topbarStep?.pages, 'topbar-registry declares support for page filtering');
const changedCircuit = selectChangedSuite(['circuit.html'])
    .find(step => step.name === 'verify-topbar-registry');
assert.equal(changedCircuit?.env?.VERIFY_PAGES, 'circuit',
    'single-page incremental verification must run the topbar ownership guard');
const sharedRegistry = selectChangedSuite(['games.config.json'])
    .find(step => step.name === 'verify-topbar-registry');
assert(sharedRegistry && !sharedRegistry.env?.VERIFY_PAGES,
    'shared registry changes must keep the full topbar coverage check');

console.log('verify-suite-sharding 全部通过 ✅');
