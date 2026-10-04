import assert from 'node:assert/strict';

import { parseCssText } from './lib/css/baseline-adapter.mjs';
import {
    analyzeExactConflicts, indexRuleOccurrences, verifyMonotonicState, verifyRuleMigrations,
} from './lib/css/migration-contract.mjs';

const LAYERS = ['tokens', 'showcase', 'components', 'layout', 'pages', 'contracts'];
const ALLOWED = new Set(LAYERS);

const parseMap = entries => new Map(entries.map(([path, css]) => [path, parseCssText(css, path)]));
const clone = value => JSON.parse(JSON.stringify(value));
const catalogMap = parsed => new Map([...parsed].map(([path, value]) => [path, indexRuleOccurrences(value, path)]));
const sourceRef = rule => ({
    path: rule.path,
    context: rule.context,
    selector: rule.selector,
    contextDigest: rule.contextDigest,
    selectorDigest: rule.selectorDigest,
    layer: rule.layer,
    declarationDigest: rule.declarationDigest,
    occurrence: rule.occurrence,
    declarations: rule.declarations,
});
const destinationRef = rule => ({
    path: rule.path,
    context: rule.context,
    selector: rule.selector,
    contextDigest: rule.contextDigest,
    selectorDigest: rule.selectorDigest,
    layer: rule.layer,
    declarationDigest: rule.declarationDigest,
    occurrence: rule.occurrence,
});

// Stable occurrence identity is semantic, not a source offset. Inserting an
// unrelated rule may change sourceIndex, but repeated identical rules remain #1/#2.
const duplicateA = indexRuleOccurrences(
    parseCssText('.same{color:red}.other{margin:0}.same{color:red}', 'css/dup.css'),
    'css/dup.css',
).filter(rule => rule.selector === '.same');
const duplicateB = indexRuleOccurrences(
    parseCssText('.other{margin:0}.same{color:red}.same{color:red}', 'css/dup.css'),
    'css/dup.css',
).filter(rule => rule.selector === '.same');
assert.deepEqual(duplicateA.map(rule => rule.occurrence), [1, 2]);
assert.deepEqual(duplicateB.map(rule => rule.occurrence), [1, 2]);
assert.equal(duplicateA[0].declarationDigest, duplicateB[0].declarationDigest);

// Legacy P0 formatting is intentionally lossy, but migration identity is not.
const quotedWhitespace = indexRuleOccurrences(
    parseCssText('[data-x="a  b"]{color:red}[data-x="a b"]{color:red}', 'css/quoted.css'),
    'css/quoted.css',
);
assert.equal(quotedWhitespace[0].selector, quotedWhitespace[1].selector);
assert.notEqual(quotedWhitespace[0].selectorDigest, quotedWhitespace[1].selectorDigest);

const base = parseMap([
    ['css/a.css', '.x{color:red;display:none!important}'],
    ['css/b.css', '.x{color:blue;display:block!important}'],
]);
const current = parseMap([
    ['css/a.css', '@layer layout{.x{color:red}}@layer contracts{.x{display:none!important}}'],
    ['css/b.css', '.x{color:blue;display:block!important}'],
]);
const baseCatalogs = catalogMap(base);
const currentCatalogs = catalogMap(current);
const source = baseCatalogs.get('css/a.css')[0];
const destinations = currentCatalogs.get('css/a.css');
const mapping = {
    id: 'fixture-split',
    source: sourceRef(source),
    destinations: destinations.map(destinationRef),
    conflicts: { normal: [], important: [] },
};
const stylesheetLinks = {
    'fixture.html': [
        ['css/a.css', [['href', 'css/a.css'], ['rel', 'stylesheet']]],
        ['css/b.css', [['href', 'css/b.css'], ['rel', 'stylesheet']]],
    ],
};
mapping.conflicts = analyzeExactConflicts(
    mapping, source, destinations, baseCatalogs, stylesheetLinks, LAYERS,
);
assert.equal(mapping.conflicts.normal.length, 1);
assert.equal(mapping.conflicts.important.length, 1);
assert.equal(mapping.conflicts.normal[0].layerPriority, 'peer-unlayered-wins');
assert.equal(mapping.conflicts.important[0].layerPriority, 'target-layer-wins');

const baseline = {
    debt: {
        unlayeredRules: [
            ['css/a.css', '', '.x'],
            ['css/b.css', '', '.x'],
        ],
    },
};
const emptyState = {
    migratedRules: [],
    migratedKeyframes: [],
    migratedRuntimeStyleSources: [],
};
const state = {
    migratedRules: [mapping],
    migratedKeyframes: [],
    migratedRuntimeStyleSources: [],
};
const errors = [];
const result = verifyRuleMigrations({
    baseline,
    state,
    currentParsedByPath: current,
    baseParsedByPath: base,
    stylesheetLinks,
    allowedLayers: ALLOWED,
    layerOrder: LAYERS,
    baseState: emptyState,
    errors,
});
assert.deepEqual(errors, []);
assert.equal(result.newMigrationCount, 1);
assert.ok(result.mappedCssPaths.has('css/a.css'));
assert.ok(result.mappedCssPaths.has('css/tokens.css'));

// A stale conflict review must fail independently for normal/important paths.
const stale = clone(state);
stale.migratedRules[0].conflicts = { normal: [], important: [] };
const staleErrors = [];
verifyRuleMigrations({
    baseline,
    state: stale,
    currentParsedByPath: current,
    baseParsedByPath: base,
    stylesheetLinks,
    allowedLayers: ALLOWED,
    layerOrder: LAYERS,
    baseState: emptyState,
    errors: staleErrors,
});
assert.ok(staleErrors.some(error => /normal exact selector\/property conflict/.test(error)));
assert.ok(staleErrors.some(error => /important exact selector\/property conflict/.test(error)));

// Conflict review is computed after projecting every new mapping in the batch.
// Otherwise two rules migrated together would incorrectly review each other as
// still unlayered in the PR base.
const batchBase = parseMap([
    ['css/a.css', '.x{color:red}'],
    ['css/b.css', '.x{color:blue}'],
]);
const batchCurrent = parseMap([
    ['css/a.css', '@layer layout{.x{color:red}}'],
    ['css/b.css', '@layer pages{.x{color:blue}}'],
]);
const batchBaseCatalogs = catalogMap(batchBase);
const batchCurrentCatalogs = catalogMap(batchCurrent);
const batchSourceA = batchBaseCatalogs.get('css/a.css')[0];
const batchSourceB = batchBaseCatalogs.get('css/b.css')[0];
const batchDestinationA = batchCurrentCatalogs.get('css/a.css')[0];
const batchDestinationB = batchCurrentCatalogs.get('css/b.css')[0];
const batchMappingA = {
    id: 'fixture-batch-a',
    source: sourceRef(batchSourceA),
    destinations: [destinationRef(batchDestinationA)],
    conflicts: {
        normal: [{
            property: 'color',
            targetLayer: 'layout',
            peerPath: 'css/b.css',
            peerContext: '',
            peerSourceLayer: null,
            peerLayer: 'pages',
            layerPriority: 'peer-layer-wins',
            pages: ['fixture.html'],
        }],
        important: [],
    },
};
const batchMappingB = {
    id: 'fixture-batch-b',
    source: sourceRef(batchSourceB),
    destinations: [destinationRef(batchDestinationB)],
    conflicts: {
        normal: [{
            property: 'color',
            targetLayer: 'pages',
            peerPath: 'css/a.css',
            peerContext: '',
            peerSourceLayer: null,
            peerLayer: 'layout',
            layerPriority: 'target-layer-wins',
            pages: ['fixture.html'],
        }],
        important: [],
    },
};
const batchErrors = [];
verifyRuleMigrations({
    baseline: { debt: { unlayeredRules: [['css/a.css', '', '.x'], ['css/b.css', '', '.x']] } },
    state: { ...emptyState, migratedRules: [batchMappingA, batchMappingB] },
    currentParsedByPath: batchCurrent,
    baseParsedByPath: batchBase,
    stylesheetLinks,
    allowedLayers: ALLOWED,
    layerOrder: LAYERS,
    baseState: emptyState,
    errors: batchErrors,
});
assert.deepEqual(batchErrors, []);

// Duplicate declarations of one property form an intra-rule fallback chain.
// Splitting that chain across layers would replace source-order fallback with
// layer precedence, so the contract rejects it.
const fallbackBase = parseMap([['css/fallback.css', '.d{color:red;color:blue}']]);
const fallbackCurrent = parseMap([[
    'css/fallback.css',
    '@layer layout{.d{color:red}}@layer pages{.d{color:blue}}',
]]);
const fallbackSource = catalogMap(fallbackBase).get('css/fallback.css')[0];
const fallbackDestinations = catalogMap(fallbackCurrent).get('css/fallback.css');
const fallbackMapping = {
    id: 'fixture-fallback',
    source: sourceRef(fallbackSource),
    destinations: fallbackDestinations.map(destinationRef),
    conflicts: { normal: [], important: [] },
};
const fallbackErrors = [];
verifyRuleMigrations({
    baseline: { debt: { unlayeredRules: [['css/fallback.css', '', '.d']] } },
    state: { ...emptyState, migratedRules: [fallbackMapping] },
    currentParsedByPath: fallbackCurrent,
    baseParsedByPath: fallbackBase,
    stylesheetLinks: { 'fallback.html': [['css/fallback.css', []]] },
    allowedLayers: ALLOWED,
    layerOrder: LAYERS,
    baseState: emptyState,
    errors: fallbackErrors,
});
assert.ok(fallbackErrors.some(error => /intra-rule fallback cascade/.test(error)));

// Existing layered rules can be explicitly re-layered (Showcase's P2 case)
// without pretending they were unlayered P0 debt.
const relayerBase = parseMap([['css/showcase.css', '@layer components{.s{color:red}}']]);
const relayerCurrent = parseMap([['css/showcase.css', '@layer showcase{.s{color:red}}']]);
const relayerSource = catalogMap(relayerBase).get('css/showcase.css')[0];
const relayerDestination = catalogMap(relayerCurrent).get('css/showcase.css')[0];
const relayerMapping = {
    id: 'fixture-relayer',
    source: sourceRef(relayerSource),
    destinations: [destinationRef(relayerDestination)],
    conflicts: { normal: [], important: [] },
};
const relayerErrors = [];
verifyRuleMigrations({
    baseline: { debt: { unlayeredRules: [] } },
    state: { ...emptyState, migratedRules: [relayerMapping] },
    currentParsedByPath: relayerCurrent,
    baseParsedByPath: relayerBase,
    stylesheetLinks: { 'showcase.html': [['css/showcase.css', []]] },
    allowedLayers: ALLOWED,
    layerOrder: LAYERS,
    baseState: emptyState,
    errors: relayerErrors,
});
assert.deepEqual(relayerErrors, []);

// The debt count alone is insufficient: an unrelated declaration rewrite in a
// mapped file must still be caught by the base->head residual comparison.
const mutationBase = parseMap([
    ['css/a.css', '.x{color:red;display:none!important}.other{margin:0}'],
    ['css/b.css', '.x{color:blue;display:block!important}'],
]);
const mutationCurrent = parseMap([
    ['css/a.css', '@layer layout{.x{color:red}}@layer contracts{.x{display:none!important}}.other{margin:1px}'],
    ['css/b.css', '.x{color:blue;display:block!important}'],
]);
const mutationBaseCatalogs = catalogMap(mutationBase);
const mutationCurrentCatalogs = catalogMap(mutationCurrent);
const mutationSource = mutationBaseCatalogs.get('css/a.css')[0];
const mutationDestinations = mutationCurrentCatalogs.get('css/a.css').filter(rule => rule.selector === '.x');
const mutationMapping = {
    id: 'fixture-residual',
    source: sourceRef(mutationSource),
    destinations: mutationDestinations.map(destinationRef),
    conflicts: { normal: [], important: [] },
};
mutationMapping.conflicts = analyzeExactConflicts(
    mutationMapping, mutationSource, mutationDestinations, mutationBaseCatalogs, stylesheetLinks, LAYERS,
);
const mutationErrors = [];
verifyRuleMigrations({
    baseline: {
        debt: {
            unlayeredRules: [
                ['css/a.css', '', '.x'],
                ['css/a.css', '', '.other'],
                ['css/b.css', '', '.x'],
            ],
        },
    },
    state: { ...emptyState, migratedRules: [mutationMapping] },
    currentParsedByPath: mutationCurrent,
    baseParsedByPath: mutationBase,
    stylesheetLinks,
    allowedLayers: ALLOWED,
    layerOrder: LAYERS,
    baseState: emptyState,
    errors: mutationErrors,
});
assert.ok(mutationErrors.some(error => /beyond the newly registered migrations/.test(error)));

// Merged mappings are append-only: deletion or in-place mutation is a ratchet violation.
const removedErrors = [];
verifyMonotonicState(state, emptyState, removedErrors);
assert.ok(removedErrors.some(error => /was removed/.test(error)));
const modifiedState = clone(state);
modifiedState.migratedRules[0].conflicts.normal = [];
const modifiedErrors = [];
verifyMonotonicState(state, modifiedState, modifiedErrors);
assert.ok(modifiedErrors.some(error => /was modified/.test(error)));

console.log('PASS CSS rule migration mapping, split, relayer, conflict and ratchet regressions');
