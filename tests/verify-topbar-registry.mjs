// Static ownership guard: chrome is authored only in games.config.json.
// The generated region must match the shared serializer byte for byte.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registry } from '../tools/lib/registry.mjs';
import { renderTopbar } from '../src/platform/shell/render-topbar.js';
import { renderGameShell } from '../src/platform/shell/render-game-shell.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFileSync(join(ROOT, name), 'utf8');
const BEGIN = '<!-- registry:begin topbar -->';
const END = '<!-- registry:end topbar -->';
const count = (src, token) => src.split(token).length - 1;

const games = registry.withCap('topbar');
assert(games.length, 'no registered topbar pages');
registry.assertCovered({
    cap: 'topbar', covered: games.map(g => g.id), label: 'topbar-registry',
});
let passed = 0;
for (const game of registry.all()) {
    const html = read(game.href);
    const hasTopbar = (game.caps || []).includes('topbar');
    if (!hasTopbar) {
        assert(!game.chrome, game.id + ': exempt games must not declare chrome');
        assert(!html.includes(BEGIN) && !html.includes(END),
            game.id + ': topbar markers are prohibited without the topbar cap');
        continue;
    }

    assert(game.chrome, game.id + ': topbar pages must define chrome');
    assert.equal(count(html, BEGIN), 1, game.id + ': one begin sentinel');
    assert.equal(count(html, END), 1, game.id + ': one end sentinel');
    const first = html.indexOf(BEGIN);
    const indent = html.slice(html.lastIndexOf('\n', first) + 1, first);
    assert(/^[ \t]*$/.test(indent), game.id + ': marker must occupy its own line');
    const from = html.indexOf('\n', first) + 1;
    const to = html.indexOf('\n' + indent + END, from);
    assert(to > from, game.id + ': missing aligned closing marker');
    const htmlRegion = html.slice(from, to);
    const expected = renderTopbar(game, indent);
    assert.equal(htmlRegion, expected, game.id + ': npm run gen must own the entire header');
    assert.equal(count(expected, '<header'), 1, game.id + ': exactly one generated header');
    assert.equal(count(expected, '</header>'), 1, game.id + ': header must close');
    assert.equal(count(expected, 'data-chrome="home"'), 1, game.id + ': exactly one Home');
    assert.equal(count(expected, 'data-chrome="sound"'), 1, game.id + ': exactly one Sound');
    assert.equal(count(expected, 'game-topbar-center'), 1, game.id + ': exactly one title group');
    assert.equal(count(expected, 'game-topbar-name'), 1, game.id + ': exactly one title');
    const outside = html.slice(0, first) + html.slice(to + 1 + indent.length + END.length);
    assert(!/<header\b[^>]*class="[^"]*\bgame-topbar\b/.test(outside),
        game.id + ': duplicate hand-written header outside registry region');
    const scaffold = renderGameShell(game);
    assert(scaffold.includes(BEGIN + '\n' + renderTopbar(game, '        ') + '\n        ' + END),
        game.id + ': new-game scaffold must reuse renderTopbar');
    passed++;
}

for (const file of ['index.html', 'math-rain.html', 'tank-battle.html']) {
    assert(!read(file).includes(BEGIN), file + ': explicitly out of scope');
}
// The convention template must represent real pages without verbatim button markup.
assert(games.some(game => !game.chrome.overrides),
    'at least one game must use only the default template');
for (const game of games) {
    assert(game.chrome.actions.every(role => typeof role === 'string'),
        game.id + ': actions must be compact role names');
}
const mutated = JSON.parse(JSON.stringify(games[0]));
mutated.chrome.overrides ||= {};
mutated.chrome.overrides.home ||= {};
mutated.chrome.overrides.home.attrs ||= {};
mutated.chrome.overrides.home.attrs['aria-label'] = 'NOT HOME';
assert.notEqual(renderTopbar(mutated), renderTopbar(games[0]),
    'an aria-label mutation must be detected by the generated-region check');
const unknownRole = JSON.parse(JSON.stringify(games[0]));
unknownRole.chrome.actions.unshift('unsupported');
assert.throws(() => renderTopbar(unknownRole), /invalid or duplicate topbar action role/);
const unusedOverride = JSON.parse(JSON.stringify(games[0]));
unusedOverride.chrome.overrides.unused = { attrs: { id: 'not-a-real-action' } };
assert.throws(() => renderTopbar(unusedOverride), /unused topbar override/);
console.log('verify-topbar-registry: ' + passed + '/' + games.length
    + ' generated headers exact; 3 exempt pages; default/override mutation gates passed');
