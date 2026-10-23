// Step 6b: generated-card ownership and an independent HTML sidebar contract.
// Page filtering only limits repository page checks; mutation guards always run.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';
import { registry } from './lib/registry.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';
import { sidebarCards, renderSidebarCard } from '../src/platform/shell/render-sidebar.js';
import { transformSidebarRegions } from '../tools/lib/sidebar-regions.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFileSync(join(ROOT, name), 'utf8');
const attr = (node, key) => node?.attrs?.find(a => a.name === key)?.value;
const hasClass = (node, value) => (attr(node, 'class') || '').split(/\s+/).includes(value);
const contains = (parent, node) => {
    for (let at = node; at; at = at.parentNode) if (at === parent) return true;
    return false;
};
function inspect(source) {
    const nodes = [];
    const comments = [];
    function visit(node) {
        if (node.tagName) nodes.push(node);
        if (node.nodeName === '#comment') comments.push(node);
        for (const child of node.childNodes || []) visit(child);
    }
    visit(parse(source, { sourceCodeLocationInfo: true }));
    return { nodes, comments };
}

// This fixture records product content ownership, independently of the registry
// renderer. New drawer games must be added deliberately, not silently exempted.
const CONTENT = {
    'planet-merge': { panels: ['side-howto', 'side-records'], desktop: ['SideMore'] },
    'hoop-shot': { panels: ['side-howto', 'side-records'], desktop: ['SideMore'] },
    'gravity-slingshot': { panels: ['side-howto', 'side-records'], desktop: ['SideMore'] },
    'needle-awn': { panels: ['side-rules-text', 'side-records-title', 'side-controls-title'], desktop: [] },
    'sword-flight': { panels: ['side-rules-text', 'side-records-title', 'side-controls-title'], desktop: [] },
    lumen: { panels: ['side-howto', 'side-records', 'gloss'], desktop: ['SideMore'] },
    circuit: { panels: ['side-howto', 'side-records'], desktop: ['SideMore'] },
    'silk-dew': { panels: ['side-howto', 'side-records'], desktop: ['SideMore'] },
    'bond-forge': { panels: ['side-howto', 'side-records'], desktop: ['cheat-card', 'SideMore'] },
    'echo-cave': { panels: ['side-howto', 'side-records'], desktop: ['side-legend', 'SideMore'] },
    'crystal-bloom': { panels: ['side-howto', 'side-science', 'side-records'], desktop: ['side-legend', 'SideMore'] },
    'flame-verse': { panels: ['side-howto', 'side-science', 'side-records'], desktop: ['side-legend', 'SideMore'] },
    'ripple-duet': { panels: ['side-howto', 'side-science', 'side-records'], desktop: ['side-legend', 'SideMore'] },
    'carrot-pull': { panels: ['side-howto', 'progress-dots', 'side-score', 'side-best'], desktop: ['side-tip', 'SideMore'] },
    'shadow-loom': { panels: ['side-howto', 'side-records'], desktop: ['side-keys', 'SideMore'] },
};
const idFor = (prefix, suffix) => prefix + (suffix === 'SideMore' ? '' : '-') + suffix;
registry.assertCovered({ cap: 'drawer', covered: Object.keys(CONTENT), exempt: ['tetris'], label: 'sidebar content' });
const participants = registry.withCap('drawer').filter(game => game.id !== 'tetris');
const selected = participants.filter(game => keepPage(game.id));

function checkStructure(source, game) {
    const { nodes } = inspect(source);
    const ids = new Map();
    for (const node of nodes) {
        const id = attr(node, 'id');
        if (!id) continue;
        assert(!ids.has(id), game.id + ': duplicate id ' + id);
        ids.set(id, node);
    }
    for (const node of nodes) for (const key of ['aria-controls', 'aria-labelledby', 'aria-describedby']) {
        for (const id of (attr(node, key) || '').split(/\s+/).filter(Boolean)) {
            assert(ids.has(id), game.id + ': dangling ' + key + ' ' + id);
        }
    }
    const sidebars = nodes.filter(node => hasClass(node, 'game-sidebar'));
    assert.equal(sidebars.length, 1, game.id + ': one sidebar');
    const panels = ids.get(game.prefix + 'StatsPanels');
    assert(panels, game.id + ': one movable panel container');
    assert.equal(panels.parentNode, sidebars[0], game.id + ': initial panels are a direct sidebar child');
    const drawer = ids.get(game.prefix + 'StatsDrawerBody');
    assert(drawer && !contains(sidebars[0], drawer), game.id + ': drawer is separate from sidebar');
    assert(!nodes.some(node => hasClass(node, 'game-side-card') && contains(drawer, node)),
        game.id + ': no second set of cards in empty drawer');
    for (const [area, expected] of Object.entries(CONTENT[game.id])) for (const suffix of expected) {
        const id = idFor(game.prefix, suffix);
        const node = ids.get(id);
        assert(node, game.id + ': required ' + area + ' content ' + id);
        assert(contains(sidebars[0], node), game.id + ': content remains inside sidebar ' + id);
        assert.equal(contains(panels, node), area === 'panels', game.id + ': correct content ownership ' + id);
    }
    const record = ids.get(game.prefix + '-side-records');
    if (record) assert(hasClass(record, 'game-side-records'), game.id + ': generated record container shares layout');
    const more = ids.get(game.prefix + 'SideMore');
    if (more) assert(more.tagName === 'nav' && hasClass(more, 'more-games'), game.id + ': More keeps nav semantics');
    if (game.id === 'lumen') {
        const gloss = ids.get('lm-gloss');
        const rows = nodes.filter(node => contains(gloss, node) && hasClass(node, 'game-legend-row'));
        assert.equal(rows.length, 4, 'lumen: all four gloss rows stay in movable help');
        for (const key of ['glossCrystal', 'glossShadow', 'glossLink', 'glossSplit']) {
            assert(nodes.some(node => contains(gloss, node) && attr(node, 'data-i18n') === key), 'lumen: gloss copy ' + key);
        }
    }
    if (game.id === 'bond-forge') {
        assert.equal(attr(ids.get('bf-cheat-toggle'), 'aria-controls'), 'bf-cheat-body', 'bond-forge: cheat toggle keeps its target');
        assert.equal(attr(ids.get('bf-cheat-toggle'), 'aria-expanded'), 'true', 'bond-forge: cheat starts expanded');
        assert(contains(ids.get('bf-cheat-card'), ids.get('bf-cheat-body')), 'bond-forge: cheat content stays in its card');
    }
    if (game.id === 'carrot-pull') {
        assert.equal(attr(ids.get('cp-progress-dots'), 'data-i18n-label'), 'progressAria', 'carrot-pull: progress keeps accessible label');
        assert(hasClass(ids.get('cp-side-tip').parentNode, 'cp-tip-card'), 'carrot-pull: special desktop tip card survives');
    }
    if (game.id === 'needle-awn' || game.id === 'sword-flight') {
        const rules = ids.get(game.prefix + '-side-rules-text');
        assert(nodes.some(node => node.tagName === 'b' && contains(rules, node)), game.id + ': rules preserve rich text');
        assert(nodes.some(node => contains(panels, node) && hasClass(node, 'game-side-kbd-row')), game.id + ': keyboard rows survive');
        assert(nodes.filter(node => contains(panels, node) && hasClass(node, 'game-side-row')).length >= 4,
            game.id + ': static record rows retain independent value targets');
    }
    return { nodes, ids, panels };
}

function checkRegions(source, game) {
    const { nodes, comments } = inspect(source);
    const expected = sidebarCards(game);
    const marked = comments.filter(node => /^registry:(?:begin|end) sidebar-/.test(node.data.trim()));
    assert.equal(marked.length, expected.length * 2, game.id + ': only declared card regions');
    for (const card of expected) {
        const begin = marked.filter(node => node.data.trim() === 'registry:begin ' + card.region);
        const end = marked.filter(node => node.data.trim() === 'registry:end ' + card.region);
        assert.equal(begin.length, 1, game.id + ': unique ' + card.region + ' opening');
        assert.equal(end.length, 1, game.id + ': unique ' + card.region + ' closing');
        assert.equal(begin[0].parentNode, end[0].parentNode, game.id + ': region has one parent');
        const siblings = begin[0].parentNode.childNodes;
        const inner = siblings.slice(siblings.indexOf(begin[0]) + 1, siblings.indexOf(end[0]));
        assert.equal(inner.filter(node => node.tagName).length, 1, game.id + ': region owns exactly one whole card');
        const root = inner.find(node => node.tagName);
        assert(hasClass(root, 'game-side-card'), game.id + ': region does not own panel/aside wrappers');
        assert(nodes.some(node => attr(node, 'id') === card.targetId && contains(root, node)), game.id + ': region owns its real target');
        const start = begin[0].sourceCodeLocation.startOffset;
        const indent = source.slice(source.lastIndexOf('\n', start) + 1, start);
        assert(/^[ \t]*$/.test(indent), game.id + ': marker starts its own line');
        const from = source.indexOf('\n', begin[0].sourceCodeLocation.endOffset) + 1;
        const to = source.lastIndexOf('\n', end[0].sourceCodeLocation.startOffset);
        assert.equal(source.slice(from, to), renderSidebarCard(game, card.kind, indent), game.id + ': generated card matches renderer');
    }
    assert.equal(transformSidebarRegions(source, game).src, source, game.id + ': generated cards are idempotent');
}

// Counterexamples exercise the independent contract, not a renderer-derived
// expected tree. Moving a legend, dropping rich content, and cloning panels must
// remain observable even when the generated-region comparison is satisfied.
function mutate(source, id, replacement) {
    const node = inspect(source).nodes.find(n => attr(n, 'id') === id);
    assert(node?.sourceCodeLocation, 'mutation target exists: ' + id);
    const { startOffset, endOffset } = node.sourceCodeLocation;
    return source.slice(0, startOffset) + replacement(source.slice(startOffset, endOffset)) + source.slice(endOffset);
}
const sample = id => ({ game: registry.byId(id), source: read(registry.byId(id).href) });
const lumen = sample('lumen');
assert.throws(() => checkStructure(mutate(lumen.source, 'lm-gloss', () => ''), lumen.game), /required panels content/,
    'independent check rejects a swallowed hand-owned gloss');
const carrot = sample('carrot-pull');
assert.throws(() => checkStructure(mutate(carrot.source, 'cp-progress-dots', () => ''), carrot.game), /required panels content/,
    'independent check rejects removed custom progress');
const echo = sample('echo-cave');
const legend = inspect(echo.source).nodes.find(node => attr(node, 'id') === 'ec-side-legend');
const legendHtml = echo.source.slice(legend.sourceCodeLocation.startOffset, legend.sourceCodeLocation.endOffset);
const withoutLegend = mutate(echo.source, 'ec-side-legend', () => '');
const wrongHost = mutate(withoutLegend, 'ecStatsPanels', html => html.replace(/<div[^>]*>/, opening => opening + legendHtml));
assert.throws(() => checkStructure(wrongHost, echo.game), /correct content ownership/, 'independent check rejects moved desktop-only legend');
assert.throws(() => checkStructure(mutate(echo.source, 'ecStatsPanels', html => html + html), echo.game), /duplicate id/,
    'independent check rejects cloned panels');
const bond = sample('bond-forge');
assert.throws(() => checkStructure(bond.source.replace('aria-controls="bf-cheat-body"', 'aria-controls="missing-cheat"'), bond.game),
    /dangling aria-controls/, 'independent check rejects dangling cheat reference');
const needle = sample('needle-awn');
assert.throws(() => checkStructure(mutate(needle.source, 'na-side-rules-text', html => html.replace(/<\/?b>/g, '')), needle.game),
    /rich text/, 'independent check rejects flattened rules');

// The mutation guards below target the generator itself, including page-owned
// content without IDs (which an ID-set comparison alone would not notice).
const interrupted = mutate(echo.source, 'ec-side-howto', html => html.replace('</p>', '<em>Keep this help</em></p>'));
assert.throws(() => transformSidebarRegions(interrupted, echo.game), /custom content/,
    'generator rejects page-owned markup inside a generated text slot');
const howto = inspect(echo.source).nodes.find(node => attr(node, 'id') === 'ec-side-howto');
const cardEnd = howto.parentNode.sourceCodeLocation.endTag.startOffset;
const extraParagraph = echo.source.slice(0, cardEnd) + '<p>Unregistered help without an ID</p>' + echo.source.slice(cardEnd);
assert.throws(() => transformSidebarRegions(extraParagraph, echo.game), /unrelated content/,
    'generator cannot swallow an ID-less paragraph in its card');
const circuit = sample('circuit');
const unmark = source => source.replace(/^[ \t]*<!-- registry:(?:begin|end) sidebar-[\w-]+ -->\r?\n/gm, '');
const unmarkedCircuit = unmark(circuit.source);
const annotatedTitle = mutate(unmarkedCircuit, 'cc-side-howto-title', html => html.replace('</div>',
    '<span>Keep this title annotation</span></div>'));
assert.throws(() => transformSidebarRegions(annotatedTitle, circuit.game), /custom title content/,
    'first migration cannot swallow an extra ID-less title span');
const unboundTitle = mutate(unmarkedCircuit, 'cc-side-howto-title', html => html.replace(' data-i18n="sideHowTo"', ''));
assert.throws(() => transformSidebarRegions(unboundTitle, circuit.game), /custom title content/,
    'first migration accepts only a single known text-binding span');
const titleNote = mutate(unmarkedCircuit, 'cc-side-howto-title', html => html.replace('</span>', '</span>Keep my note'));
assert.throws(() => transformSidebarRegions(titleNote, circuit.game), /initial card text or binding/,
    'first migration cannot swallow a bare text note next to the title binding');
const gameInstructions = mutate(unmarkedCircuit, 'cc-side-howto', html =>
    html.replace(' data-i18n="howto"', '').replace('</p>', 'Keep my instructions</p>'));
assert.throws(() => transformSidebarRegions(gameInstructions, circuit.game), /initial card text or binding/,
    'first migration cannot replace unbound page-owned instructions');
const gameTitleKey = mutate(unmarkedCircuit, 'cc-side-howto-title', html => html.replace('data-i18n="sideHowTo"', 'data-i18n="specialHelp"'));
assert.throws(() => transformSidebarRegions(gameTitleKey, circuit.game), /initial card text or binding/,
    'first migration cannot replace an undeclared title binding');
const planet = sample('planet-merge');
let legacyTitles = unmark(planet.source);
for (const suffix of ['howto', 'records']) {
    legacyTitles = mutate(legacyTitles, `pm-side-${suffix}-title`, html => html.replace(/>.*<\/div>$/s, '></div>'));
}
assert.equal(transformSidebarRegions(legacyTitles, planet.game).src, planet.source,
    'first migration accepts known empty legacy title slots before adding bindings and icons');
const endHowto = '<!-- registry:end sidebar-howto -->';
const widened = echo.source.replace(endHowto, '').replace('<!-- registry:end sidebar-records -->',
    '<!-- registry:end sidebar-records -->\n' + endHowto);
assert.throws(() => transformSidebarRegions(widened, echo.game), /region|marker/i,
    'generator rejects a region widened over its neighboring card');
assert.throws(() => transformSidebarRegions(echo.source.replace(endHowto, ''), echo.game), /marker|pair/i,
    'generator rejects a half-open card region');
assert.throws(() => sidebarCards({ ...echo.game, sidebar: { panels: ['howto', 'howto'] } }), /unique/,
    'duplicate roles are rejected rather than generating repeated IDs');
assert.throws(() => sidebarCards({ ...echo.game, sidebar: { desktopOnly: ['rules'] } }), /supported/,
    'custom card trees cannot enter through unknown roles');
const reversedCards = { ...echo.game, sidebar: { ...echo.game.sidebar, panels: ['records', 'howto'] } };
assert.throws(() => transformSidebarRegions(echo.source, reversedCards), /order/i,
    'a changed declaration cannot silently keep a different existing card order');
const escapedGame = { ...echo.game, sidebar: { ...echo.game.sidebar,
    howto: { titleText: '<b>Literal title</b>', text: '<img src=x> & rules' } } };
const escaped = transformSidebarRegions(echo.source, escapedGame).src;
assert(escaped.includes('&lt;b&gt;Literal title&lt;/b&gt;') && escaped.includes('&lt;img src=x&gt; &amp; rules'),
    'plain card text remains escaped after a supported registry update');
checkStructure(escaped, escapedGame);
const updatedBindings = { ...echo.game, sidebar: { ...echo.game.sidebar,
    howto: { titleKey: 'guideTitle', textKey: 'guideText', touchKey: 'touchGuide' } } };
const rebound = transformSidebarRegions(echo.source, updatedBindings).src;
for (const key of ['guideTitle', 'guideText', 'touchGuide']) {
    assert(rebound.includes(`="${key}"`), 'marked cards accept registry-owned binding updates: ' + key);
}
const lumenGloss = inspect(lumen.source).nodes.find(node => attr(node, 'id') === 'lm-gloss').sourceCodeLocation;
const glossHtml = lumen.source.slice(lumenGloss.startOffset, lumenGloss.endOffset);
const updatedLumen = { ...lumen.game, sidebar: { ...lumen.game.sidebar, records: { titleText: 'Updated records' } } };
assert(transformSidebarRegions(lumen.source, updatedLumen).src.includes(glossHtml),
    'updating a generated sibling preserves the complete hand-owned gloss');

exitIfNoPages(selected, 'verify-sidebar-registry');
for (const game of selected) {
    const source = read(game.href);
    checkStructure(source, game);
    checkRegions(source, game);
    assert.equal(transformSidebarRegions(unmark(source), game).src, source,
        game.id + ': first migration accepts the declared bindings and initial copy');
}
for (const game of registry.all().filter(game => !participants.includes(game))) {
    assert.equal(sidebarCards(game).length, 0, game.id + ': no generated sidebar cards outside migration set');
    assert(!read(game.href).includes('registry:begin sidebar-'), game.id + ': no card markers outside migration set');
}
console.log('verify-sidebar-registry: ' + selected.length + '/' + participants.length
    + ' pages; independent ownership, special content, generated cards and mutation guards passed');
