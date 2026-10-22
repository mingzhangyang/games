// Priority chooses membership; canonical action order is never sorted.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registry } from './lib/registry.mjs';
import { planMobileTopbar, renderTopbar, expandTopbarChrome } from '../src/platform/shell/render-topbar.js';

const expected = {
    'tower-defense': ['range', 'stats'],
    'needle-awn': ['leaderboard'],
    'carrot-pull': ['restart'],
    'shadow-loom': ['restart'],
    'loop-jail': ['restart'],
    'sudoku-mist': ['restart'],
};
const games = registry.withCap('topbar');
assert.deepEqual(games.filter(g => planMobileTopbar(g).overflow.length).map(g => g.id).sort(),
    Object.keys(expected).sort(), 'review the complete overflow rollout when it changes');
for (const game of games) {
    const { visible, overflow } = planMobileTopbar(game);
    assert(visible.length <= 2, game.id + ': mobile action budget');
    assert(!visible.includes('sound') && !overflow.includes('sound'), 'Sound is always pinned');
    assert.deepEqual(overflow, expected[game.id] || [], game.id + ': expected secondary actions');
    const chrome = expandTopbarChrome(game);
    const html = renderTopbar(game);
    assert.equal((html.match(/popover="auto"/g) || []).length, overflow.length ? 1 : 0);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    assert.equal(ids.length, new Set(ids).size, game.id + ': no duplicate DOM ids');
    const proxies = [...html.matchAll(/data-topbar-proxy="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(proxies, chrome.actions.filter(a => overflow.includes(a.role)).map(a => a.attrs.id));
    const roles = [...html.matchAll(/data-topbar-action="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(roles, game.chrome.actions, game.id + ': priority must not reorder canonical actions');
    if (game.scores?.ui === 'dialog') {
        assert(game.chrome.actions.includes('leaderboard'), game.id + ': trophy belongs to generator');
        assert.equal((html.match(/data-scoreboard-trigger=/g) || []).length, 1);
    }
}
const fixture = mobile => ({ id: 'priority-fixture', prefix: 'tf', name: { en: 'Test', zh: 'Test' },
    chrome: { actions: ['restart', 'leaderboard', 'stats', 'pause', 'sound'], mobile } });
assert.deepEqual(planMobileTopbar(fixture({ priority: { restart: 500, pause: 400 } })).visible,
    ['restart', 'pause'], 'choose highest priorities while preserving source order');
assert.deepEqual(planMobileTopbar(fixture({ priority: { restart: 100, leaderboard: 100, stats: 100, pause: 100 } })).visible,
    ['restart', 'leaderboard'], 'ties are stable');
assert.deepEqual(planMobileTopbar(fixture({ maxVisibleActions: 0 })).visible, []);
for (const mobile of [
    { maxVisibleActions: 3 }, { maxVisibleActions: -1 }, { maxVisibleActions: 1.5 },
    { priority: { unused: 100 } }, { priority: { sound: 100 } },
    { priority: { pause: -1 } }, { priority: { pause: 1001 } }, { priority: { pause: '90' } },
]) assert.throws(() => planMobileTopbar(fixture(mobile)), 'invalid mobile config must fail generation');
const source = readFileSync(new URL('../src/platform/game-topbar-overflow.js', import.meta.url), 'utf8');
assert(source.includes('entry.source.click()'), 'proxy must invoke the sole original handler');
assert(!source.includes('cloneNode'), 'never clone stateful controls');
console.log('verify-topbar-overflow-model: priorities, six-page coverage, ids, ownership, and validation passed');
