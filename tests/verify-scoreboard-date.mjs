#!/usr/bin/env node
// Validate bounded, real calendar days BEFORE any Durable Object is selected.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    validDailyDateKey, DAILY_PAST_DAYS, DAILY_FUTURE_DAYS,
} from '../Workers/scoreboard-date.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(ROOT, path), 'utf8');
const DAY = 86400000;
const utcDay = time => new Date(time).toISOString().slice(0, 10).replace(/-/g, '');
const atDay = time => Math.floor(time / DAY) * DAY;
const now = Date.now();
const today = atDay(now);
const daily = date => 'needle-awn-d' + date;

assert.equal(validDailyDateKey(daily(utcDay(today)), now), true);
assert.equal(validDailyDateKey(daily(utcDay(today - DAILY_PAST_DAYS * DAY)), now), true,
    'last retained day remains accessible');
assert.equal(validDailyDateKey(daily(utcDay(today + DAILY_FUTURE_DAYS * DAY)), now), true,
    'UTC+8 challenge may advance into next UTC calendar day');
assert.equal(validDailyDateKey(daily(utcDay(today - (DAILY_PAST_DAYS + 1) * DAY)), now), false);
assert.equal(validDailyDateKey(daily(utcDay(today + (DAILY_FUTURE_DAYS + 1) * DAY)), now), false);
for (const game of [
    'needle-awn', 'planet-merge', 'gravity', 'sword-flight', 'lumen',
    'circuit', 'silk-dew', 'bond-forge', 'echo-cave', 'maxwell-demon',
    'crystal-bloom', 'flame-verse', 'ripple-duet',
]) {
    assert.equal(validDailyDateKey(game + '-d20260230', Date.UTC(2026, 1, 28)), false);
    assert.equal(validDailyDateKey(game + '-d20261301', Date.UTC(2026, 9, 10)), false);
}
assert.equal(validDailyDateKey('needle-awn-d20240229', Date.UTC(2024, 1, 29)), true);
assert.equal(validDailyDateKey('needle-awn-d20230229', Date.UTC(2023, 1, 28)), false);
assert.equal(validDailyDateKey('needle-awn-d00000000', now), false);
assert.equal(validDailyDateKey('needle-awn-d99999999', now), false);
assert.equal(validDailyDateKey('needle-awn-d2026010', now), false);

// Run actual Worker request handlers in Node. Only the Cloudflare Durable
// Object export is replaced with the real pure date validator source.
// This verifies both HTTP verbs reject bad keys before idFromName/get.
const dateModule = read('Workers/scoreboard-date.js').replace(/^export /gm, '');
const workerSource = read('Workers/game-scores.js')
    .replace("export { GameScoreBoard } from './scoreboard-durable.js';", '')
    .replace("import { validDailyDateKey } from './scoreboard-date.js';", dateModule);
const uri = 'data:text/javascript;base64,' + Buffer.from(workerSource).toString('base64');
const { default: worker } = await import(uri);

let allocations = 0;
let submissions = 0;
const env = { SCORE_BOARDS: {
    idFromName(game) { allocations++; return game; },
    get(game) { return {
        list: async () => [{ name: 'Historical', score: 7 }],
        submit: async () => { submissions++; },
    }; },
} };
const origin = 'https://games.orangely.xyz';
async function request(game, method) {
    const base = 'https://game-scores.orangely.workers.dev/scores';
    const options = { method, headers: { Origin: origin } };
    const url = method === 'GET' ? base + '?game=' + encodeURIComponent(game) : base;
    if (method === 'POST') {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify({ game, name: 'Tester', score: 4 });
    }
    return worker.fetch(new Request(url, options), env);
}

const invalid = [
    daily('20260230'),
    daily('20261301'),
    daily('00000000'),
    daily('99999999'),
    daily(utcDay(today - 31 * DAY)),
    daily(utcDay(today + 2 * DAY)),
    'gravity-d12345678',
    'lumen-d20260010',
];
for (const game of invalid) {
    for (const method of ['GET', 'POST']) {
        const result = await request(game, method);
        assert.equal(result.status, 400, game + ': ' + method + ' must be rejected');
    }
}
assert.equal(allocations, 0, 'invalid GET/POST must not allocate any DO identity');
assert.equal(submissions, 0, 'invalid POST never mutates durable storage');

for (const game of [daily(utcDay(today)), 'gravity-d' + utcDay(today + DAY), 'tetris']) {
    for (const method of ['GET', 'POST']) {
        const response = await request(game, method);
        assert.equal(response.status, 200, game + ': ' + method + ' valid requests still work');
    }
}
assert.equal(allocations, 6);
assert.equal(submissions, 3);
console.log('PASS daily calendar/range validation and Worker GET/POST non-allocation');
