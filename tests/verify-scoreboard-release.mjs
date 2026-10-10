#!/usr/bin/env node
/**
 * The release graph must prevent new site keys outrunning the scores backend.
 * Real production deploys are not executed in this test.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { releasePlan, executeRelease } from '../tools/deploy/release.mjs';
import { CANARY_KEYS, verifyScoresWorker, waitForScoresWorker } from '../tools/deploy/verify-scores-worker.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(join(ROOT, file), 'utf8');
const scripts = JSON.parse(read('package.json')).scripts;
assert.equal(scripts.deploy, 'node tools/deploy/release.mjs site',
    'the standard site deploy must use the dependency-aware release gate');
assert.equal(scripts['deploy:all'], 'node tools/deploy/release.mjs all',
    'the standard all deploy must use the same release contract');

function checkPlan(target) {
    const commands = releasePlan(target).map(step => step.args.join(' '));
    const worker = commands.indexOf('run deploy:scores');
    const gate = commands.findIndex(text => text.includes('verify-scores-worker.mjs'));
    const build = commands.indexOf('run build');
    const site = commands.indexOf('exec -- wrangler deploy');
    assert.ok(worker >= 0 && worker < gate && gate < build && build < site,
        target + ': Worker, live gate and site must execute in that order');
    assert.equal(site, commands.length - 1, 'site is always published last');
    return commands;
}

const siteSteps = checkPlan('site');
const allSteps = checkPlan('all');
assert.ok(allSteps.indexOf('run deploy:analytics') > allSteps.indexOf('run deploy:scores'));
assert.ok(allSteps.indexOf('run deploy:word-stats') < allSteps.indexOf('exec -- wrangler deploy'));
assert.throws(() => releasePlan('unknown'), /Unknown release target/);

const executed = [];
const simulatedFail = (command, args) => {
    executed.push(args.join(' '));
    return { status: executed.length === 3 ? 1 : 0 }; // Worker live gate fails
};
assert.equal(executeRelease('site', simulatedFail), 1, 'gate failure fails the release');
assert.deepEqual(executed, siteSteps.slice(0, 3), 'site deploy never executes after a failed gate');
const failedWorker = [];
assert.equal(executeRelease('all', (command, args) => {
    failedWorker.push(args.join(' '));
    return { status: failedWorker.length === 2 ? 42 : 0 };
}), 42);
assert.deepEqual(failedWorker, allSteps.slice(0, 2), 'failed Worker deploy blocks every later deployment');

assert.ok(CANARY_KEYS.includes('tetris') && CANARY_KEYS.includes('math-rain-6'),
    'live canaries must cover old and new keys');
const visited = [];
await verifyScoresWorker(async (url, options) => {
    visited.push({ url, options });
    return { ok: true, json: async () => [] };
});
assert.equal(visited.length, CANARY_KEYS.length, 'all live key families must be checked');
assert.ok(visited.every(({ options }) =>
    options.headers.Origin === 'https://games.orangely.xyz' && options.signal),
    'GET canaries must be read-only and use the real CORS origin');

await assert.rejects(verifyScoresWorker(async () => ({ ok: false, status: 400 })),
    /Scoreboard tetris: HTTP 400/, 'stale Worker allowlist must block release');
await assert.rejects(verifyScoresWorker(async () => ({ ok: true, json: async () => ({}) })),
    /expected an array/, 'an unrelated 200 response cannot pass as a leaderboard');
let checks = 0;
await waitForScoresWorker({
    verify: async () => { if (++checks < 3) throw new Error('not yet live'); },
    attempts: 3, delayMs: 0, sleep: async () => {},
});
assert.equal(checks, 3, 'temporary propagation delay is retried');
checks = 0;
await assert.rejects(waitForScoresWorker({
    verify: async () => { ++checks; throw new Error('unhealthy'); },
    attempts: 2, delayMs: 0, sleep: async () => {},
}), /unhealthy/, 'persistent failure must never allow site release');
assert.equal(checks, 2, 'retries must be bounded');

const manualFlow = read('.github/workflows/deploy-workers.yml');
assert.ok(manualFlow.includes('site)       npm run deploy ;;'),
    'manual site deployment must use the guarded standard command');
assert.ok(manualFlow.includes('all)        npm run deploy:all ;;'),
    'manual all deployment must use the guarded standard command');
assert.ok(manualFlow.includes('npm run deploy:scores && npm run verify:scores:live'),
    'standalone scores deployment verifies public rollout');
console.log('PASS release ordering, live gate, no-publish-on-failure and workflow contract');
