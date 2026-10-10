#!/usr/bin/env node
/**
 * Registry -> game runtime -> visible control -> real submission -> Worker contract.
 * Independent of game CSS/layout fixtures.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registry } from './lib/registry.mjs';
import { collectStaticModuleGraph } from './lib/static-module-graph.mjs';
import { encodeFireflyScore, formatFireflyScore } from '../src/games/firefly-signal/leaderboard-score.js';
import { encodeShadowLoomScore, formatShadowLoomScore } from '../src/games/shadow-loom/leaderboard-score.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(ROOT, path), 'utf8');
const worker = read('Workers/game-scores.js');
const required = ['needle-awn','carrot-pull','tank-battle','firefly-signal','shadow-loom','math-rain'];
const expectedKeys = {
    'needle-awn': ['needle-awn', 'needle-awn-endless'],
    'carrot-pull': ['carrot-pull'],
    'tank-battle': ['tank-battle'],
    'firefly-signal': ['first-light','two-meadows','midsummer'].map(id => 'firefly-signal-' + id),
    'shadow-loom': ['rabbit','bird','whale','deer','pagoda','tree','koi','crane'].map(id => 'shadow-loom-' + id),
    'math-rain': [1,2,3,4,5,6].map(level => 'math-rain-' + level),
};
const games = registry.withCap('leaderboard').filter(g => g.scores?.ui === 'dialog');
assert.deepEqual(games.map(g => g.id).sort(), required.slice().sort(),
    'Leaderboard dialog rollout coverage changed: review expected list');
for (const game of games) {
    const prefix = game.id + ': ';
    const declaredKeys = game.scores.keys || [game.scores.key];
    assert.deepEqual(declaredKeys, expectedKeys[game.id], prefix + 'score keys must be complete and stable');
    for (const key of declaredKeys) {
        assert.ok(worker.includes("'" + key + "':"), prefix + key + ' must be accepted by generated Worker');
    }
    if (game.scores.daily) {
        assert.ok(worker.includes(game.scores.dailyKeyPrefix + '-d\\d{8}'),
            prefix + 'must preserve date-specific allowlist');
    }
    assert.ok(read(game.href).includes('css/scoreboard-dialog.css'),
        prefix + 'page includes dialog styles');
    const graph = collectStaticModuleGraph(game.entry, ROOT);
    assert.ok(graph.has('src/platform/leaderboard.js'), prefix + 'game reaches Worker client');
    assert.ok(graph.has('src/platform/scoreboard-dialog.js'), prefix + 'game mounts visible UI');
    const packageSource = [...graph.values()].join('\n');
    assert.match(packageSource, /mountScoreboardDialog\s*\(\s*\{/,
        prefix + 'game creates dialog');
    assert.match(packageSource, /triggers:\s*\[/, prefix + 'game has concrete visible entry points');
    assert.match(packageSource, /\bscoreboard\.submit\s*\(\s*\{/,
        prefix + 'game submits end-of-run score');
    console.log('PASS', prefix, declaredKeys.join(', '));
}
assert.equal(encodeFireflyScore(3, 0.97), 3033);
assert.ok(encodeFireflyScore(2, 0.85) < encodeFireflyScore(3, 1));
assert.ok(encodeFireflyScore(3, 0.96) < encodeFireflyScore(3, 0.95));
assert.equal(encodeFireflyScore(-1, 0.9), null);
assert.equal(encodeFireflyScore(3, 1.5), null);
assert.equal(formatFireflyScore(3033, 'zh'), '3 次 · 97.0%');
assert.equal(formatFireflyScore(3033, 'en'), '3 signals · 97.0%');
assert.match(read('src/games/carrot-pull/runtime.js'), /saveBest\(\);\s*void scoreboard\.submit/,
    'Carrot Pull uploads zero-point finished runs');
const tank = read('src/games/tank-battle/index.js');
assert.match(tank, /this\.gameState = 'gameOver';\s*void this\.scoreboard\.submit/,
    'Tank Battle uploads zero-point defeats');
assert.match(tank, /this\.gameState = 'victory';\s*void this\.scoreboard\.submit/,
    'Tank Battle uploads every win');
assert.equal(encodeShadowLoomScore(90000, 10), 90000000010);
assert.ok(encodeShadowLoomScore(90001, 999999) < encodeShadowLoomScore(90999, 0),
    'Time must dominate any move count');
assert.ok(encodeShadowLoomScore(90000.1, 0) > encodeShadowLoomScore(90000, 999999),
    'Millisecond precision dominates move count');
assert.ok(encodeShadowLoomScore(89999, 99) < encodeShadowLoomScore(90100, 0));
assert.ok(encodeShadowLoomScore(90000, 3) < encodeShadowLoomScore(90000, 4));
assert.equal(encodeShadowLoomScore(-1, 0), null);
assert.equal(encodeShadowLoomScore(0, 1000000), null);
assert.equal(formatShadowLoomScore(90000000010, 'zh'), '1:30.000 · 10 步');
assert.equal(formatShadowLoomScore(90000000010, 'en'), '1:30.000 · 10 moves');
const needle = read('src/games/needle-awn/runtime.js');
assert.match(needle, /this\.mode !== 'endless' && this\.mode !== 'daily'/,
    'Needle Awn must exclude trial/duel runs');
assert.match(needle, /needle-awn-endless/, 'Needle endless must not write legacy mixed board');
const math = read('src/games/math-rain/index.js');
for (const event of ['powerup:freeze:used', 'powerup:bomb:used', 'powerup:shield:used']) {
    assert.ok(math.includes(event), 'Math Rain must exclude ' + event);
}
assert.match(math, /sessionData\.finalScore >= 0/, 'Math Rain allows completed zero-point sessions');
assert.match(math, /gameTime >= 175000/, 'Math Rain only submits a full timed session');
assert.match(math, /baseLevel === run\.level/, 'Math Rain guards the starting difficulty');
assert.match(needle, /this\.score < 0/, 'Needle Awn allows zero-point terminal runs');
const shadow = read('src/games/shadow-loom/runtime.js');
assert.match(shadow, /encodeShadowLoomScore\(rec\.time, rec\.moves\)/,
    'Shadow Loom ranks one run, never combines independent record minima');
const firefly = read('src/games/firefly-signal/index.js');
assert.match(firefly, /if \(!won\) return;/, 'Firefly Signal excludes failed runs');
console.log('PASS visible leaderboard contract: six games and metric invariants');
