// Verify that Analytics V2 covers the registry, not a parallel hand-edited ID list.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { registry } from './lib/registry.mjs';

const entries = registry.all();
const external = registry.site().home.externalGames || [];
const ids = [...entries.map(g => g.id), ...external.map(g => g.id)];
const load = path => readFileSync(path, 'utf8');
const browser = load('public/analytics.js');
const worker = load('Workers/games-analytics.js');

const setLine = browser.match(/var VALID_GAMES = new Set\((\[[^\n]+\])\);/);
assert(setLine, 'registry-generated browser game ID allowlist missing');
assert.deepEqual(JSON.parse(setLine[1]), ids, 'browser game IDs must match registry order');
const originLine = browser.match(/var EXTERNAL_ORIGINS = (\{[^\n]+\});/);
assert(originLine, 'registry-generated browser standalone origin map missing');
assert.deepEqual(JSON.parse(originLine[1]),
    Object.fromEntries(external.map(g => [g.id, new URL(g.url).origin])));

const workerList = worker.match(/const GAMES = \[([^\n]+)\];/);
assert(workerList, 'Worker registry game IDs missing');
assert.deepEqual(JSON.parse('[' + workerList[1].replace(/'/g, '"') + ']'), ids);
const origins = worker.match(/const ALLOWED_ORIGINS = \[([^\n]+)\];/);
assert(origins, 'Worker registry origin allowlist missing');
for (const g of external) {
    assert(origins[1].includes(new URL(g.url).origin),
        'Worker must permit standalone origin for ' + g.id);
}
const localPages = new Set();
function jsUnder(folder) {
    return readdirSync(folder, { withFileTypes: true }).flatMap(e => {
        const path = join(folder, e.name);
        return e.isDirectory() ? jsUnder(path) : e.name.endsWith('.js') ? [path] : [];
    });
}
for (const game of entries) {
    assert(!localPages.has(game.href), 'duplicate registered page ' + game.href);
    localPages.add(game.href);
    const html = load(game.href);
    assert(/src=["']\/analytics\.js["']/.test(html), game.id + ': must load shared client');
    assert(!html.includes('data-analytics-external="true"'),
        game.id + ': local game is not an external game');
    const source = jsUnder(join('src', 'games', game.id)).map(load).join('\n');
    assert(source.includes("'play'") && source.includes("'finish'"),
        game.id + ': must have real play/finish lifecycle code');
}
assert(!browser.includes('localStorage'), 'client must have no persistent storage');
assert(!browser.includes('document.cookie'), 'client must not use cookies');
assert.equal((browser.match(/setInterval\(/g) || []).length, 1,
    'only one client sampling timer is allowed');
assert(!browser.includes('requestAnimationFrame'), 'telemetry must not run inside animation frames');
assert(browser.includes('Math.min(60,'), 'bounded activity interval required');
assert(browser.includes('sendBeacon') && browser.includes('keepalive: true'));
console.log('Analytics V2 registry coverage: ' + entries.length
    + ' local games, ' + external.length + ' standalone IDs, canonical origins and single timer: PASS');
