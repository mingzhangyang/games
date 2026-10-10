#!/usr/bin/env node
/**
 * The website is auto-published by Cloudflare. Scores are manually deployed.
 * Verify they are independent and late backends cannot block the site.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    CANARY_KEYS, verifyScoresWorker, waitForScoresWorker,
} from '../tools/deploy/verify-scores-worker.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(join(ROOT, file), 'utf8');
const scripts = JSON.parse(read('package.json')).scripts;
assert.equal(scripts.deploy, 'vite build && wrangler deploy',
    'site deploy must not publish scores or require a deployed score Worker');
assert.equal(scripts['deploy:scores'], 'wrangler deploy -c Workers/wrangler-game-scores.jsonc',
    'standalone score Worker requires an explicit manual target');
assert.equal(scripts['verify:scores:live'], 'node tools/deploy/verify-scores-worker.mjs',
    'live verification remains opt-in after manual Worker deployment');
assert.deepEqual(scripts['deploy:all'].split(' && '), [
    'npm run deploy:scores', 'npm run verify:scores:live',
    'npm run deploy:analytics', 'npm run deploy:word-stats', 'npm run deploy',
], 'explicit manual combined release runs the scores Worker before the site');
assert.ok(!scripts.deploy.includes('verify:scores:live'));
assert.ok(!scripts.deploy.includes('deploy:scores'));
const workflow = read('.github/workflows/deploy-workers.yml');
assert.ok(workflow.includes('scores)     npm run deploy:scores && npm run verify:scores:live'),
    'manual score publication validates the public Worker');
assert.ok(workflow.includes('site)       npm run deploy ;;'),
    'manual site fallback is a separate target');
assert.ok(workflow.includes('all)        npm run deploy:all ;;'),
    'the opt-in all target retains its coordinated ordering');

const dialog = read('src/platform/scoreboard-dialog.js');
assert.ok(dialog.includes('UnsupportedLeaderboardError'), 'new client handles old Worker');
assert.ok(dialog.includes('enqueuePendingScore'), 'failed submissions can survive late backend rollout');
assert.ok(dialog.includes('retryPendingScores'), 'scores get retried on a future successful read');
assert.ok(dialog.includes('pendingWorker'), 'UI distinguishes unsupported games from empty boards');
assert.ok(CANARY_KEYS.includes('tetris') && CANARY_KEYS.includes('math-rain-6'),
    'live manual checks cover legacy and new score families');

const visited = [];
await verifyScoresWorker(async (url, options) => {
    visited.push({ url, options });
    return { ok: true, json: async () => [] };
});
assert.equal(visited.length, CANARY_KEYS.length, 'all game families are checked');
const validOrigins = visited.every(({ options }) =>
    options.headers.Origin === 'https://games.orangely.xyz' && options.signal);
assert.ok(validOrigins, 'manual gate is read-only and uses the real site origin');
await assert.rejects(verifyScoresWorker(async () => ({ ok: false, status: 400 })),
    /Scoreboard tetris: HTTP 400/, 'a stale Worker fails an explicit readiness check');
await assert.rejects(verifyScoresWorker(async () => ({ ok: true, json: async () => ({}) })),
    /expected an array/, 'unrelated success cannot pass readiness checks');
let checks = 0;
await waitForScoresWorker({
    verify: async () => { if (++checks < 3) throw new Error('not yet live'); },
    attempts: 3, delayMs: 0, sleep: async () => {},
});
assert.equal(checks, 3, 'propagation is retried on manual verification');
checks = 0;
await assert.rejects(waitForScoresWorker({
    verify: async () => { checks++; throw new Error('unhealthy'); },
    attempts: 2, delayMs: 0, sleep: async () => {},
}), /unhealthy/, 'persistent failure surfaces an error to the manual publisher');
assert.equal(checks, 2, 'readiness retries are bounded');
console.log('PASS independent web auto-deploy and manual scores deployment contracts');
