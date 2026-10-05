import assert from 'node:assert/strict';

import { parseCssText } from './lib/css/baseline-adapter.mjs';
import {
    analyzeExactConflicts, indexRuleOccurrences, verifyMonotonicState, verifyRuleMigrations,
} from './lib/css/migration-contract.mjs';
import { propertiesOverlap } from './lib/css/property-writes.mjs';

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

// Comma-separated names are valid only for statement-form @layer. PostCSS
// parses the invalid block form, so the adapter must reject it explicitly.
assert.throws(
    () => parseCssText('@layer pages, contracts{.x{color:red}}', 'css/invalid-layer.css'),
    /block @layer cannot declare multiple layer names/,
);

const base = parseMap([
    ['css/a.css', '.x{color:red;display:none!important}'],
    ['css/b.css', '.x{display:block!important}'],
    ['css/c.css', '.x{color:blue}'],
]);
const current = parseMap([
    ['css/a.css', '@layer layout{.x{color:red}}@layer contracts{.x{display:none!important}}'],
    ['css/b.css', '.x{display:block!important}'],
    ['css/c.css', '.x{color:blue}'],
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
        ['css/b.css', [['href', 'css/b.css'], ['rel', 'stylesheet']]],
        ['css/a.css', [['href', 'css/a.css'], ['rel', 'stylesheet']]],
        ['css/c.css', [['href', 'css/c.css'], ['rel', 'stylesheet']]],
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
            ['css/c.css', '', '.x'],
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
            peerProperty: 'color',
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
const batchStylesheetLinks = {
    'fixture.html': [
        ['css/a.css', [['href', 'css/a.css'], ['rel', 'stylesheet']]],
        ['css/b.css', [['href', 'css/b.css'], ['rel', 'stylesheet']]],
    ],
};
const batchMappingB = {
    id: 'fixture-batch-b',
    source: sourceRef(batchSourceB),
    destinations: [destinationRef(batchDestinationB)],
    conflicts: {
        normal: [{
            property: 'color',
            peerProperty: 'color',
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
    stylesheetLinks: batchStylesheetLinks,
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
assert.ok(fallbackErrors.some(error => /intra-rule cascade/.test(error)));

// Destination refs are declarations of intent, not ordering authority. Reversing
// the JSON refs cannot hide a physical same-layer reversal in the stylesheet.
const orderBase = parseMap([['css/order.css', '.d{color:red;color:blue}']]);
const orderCurrentBad = parseMap([[
    'css/order.css',
    '@layer pages{.d{color:blue}.d{color:red}}',
]]);
const orderSource = catalogMap(orderBase).get('css/order.css')[0];
const orderBadDestinations = catalogMap(orderCurrentBad).get('css/order.css');
const orderBadMapping = {
    id: 'fixture-physical-order',
    source: sourceRef(orderSource),
    destinations: [destinationRef(orderBadDestinations[1]), destinationRef(orderBadDestinations[0])],
    conflicts: { normal: [], important: [] },
};
const orderBadErrors = [];
verifyRuleMigrations({
    baseline: { debt: { unlayeredRules: [['css/order.css', '', '.d']] } },
    state: { ...emptyState, migratedRules: [orderBadMapping] },
    currentParsedByPath: orderCurrentBad,
    baseParsedByPath: orderBase,
    stylesheetLinks: {},
    allowedLayers: ALLOWED,
    layerOrder: LAYERS,
    baseState: emptyState,
    errors: orderBadErrors,
});
assert.ok(orderBadErrors.some(error => /physical destination order reverses/.test(error)));

const orderCurrentGood = parseMap([[
    'css/order.css',
    '@layer pages{.d{color:red}.d{color:blue}}',
]]);
const orderGoodDestinations = catalogMap(orderCurrentGood).get('css/order.css');
const orderGoodMapping = {
    id: 'fixture-json-order-is-not-authority',
    source: sourceRef(orderSource),
    destinations: [destinationRef(orderGoodDestinations[1]), destinationRef(orderGoodDestinations[0])],
    conflicts: { normal: [], important: [] },
};
const orderGoodErrors = [];
verifyRuleMigrations({
    baseline: { debt: { unlayeredRules: [['css/order.css', '', '.d']] } },
    state: { ...emptyState, migratedRules: [orderGoodMapping] },
    currentParsedByPath: orderCurrentGood,
    baseParsedByPath: orderBase,
    stylesheetLinks: {},
    allowedLayers: ALLOWED,
    layerOrder: LAYERS,
    baseState: emptyState,
    errors: orderGoodErrors,
});
assert.deepEqual(orderGoodErrors, []);

// One historical source occurrence has exactly one migration owner, even when
// it was already layered and therefore does not participate in P0 debt counts.
const duplicateSourceBase = parseMap([[
    'css/duplicate-source.css',
    '@layer components{.s{color:red}}',
]]);
const duplicateSourceCurrent = parseMap([[
    'css/duplicate-source.css',
    '@layer showcase{.s{color:red}.s{color:red}}',
]]);
const duplicateSourceRule = catalogMap(duplicateSourceBase).get('css/duplicate-source.css')[0];
const duplicateDestinations = catalogMap(duplicateSourceCurrent).get('css/duplicate-source.css');
const duplicateSourceErrors = [];
verifyRuleMigrations({
    baseline: { debt: { unlayeredRules: [] } },
    state: {
        ...emptyState,
        migratedRules: [
            {
                id: 'fixture-duplicate-source-a',
                source: sourceRef(duplicateSourceRule),
                destinations: [destinationRef(duplicateDestinations[0])],
                conflicts: { normal: [], important: [] },
            },
            {
                id: 'fixture-duplicate-source-b',
                source: sourceRef(duplicateSourceRule),
                destinations: [destinationRef(duplicateDestinations[1])],
                conflicts: { normal: [], important: [] },
            },
        ],
    },
    currentParsedByPath: duplicateSourceCurrent,
    baseParsedByPath: duplicateSourceBase,
    stylesheetLinks: {},
    allowedLayers: ALLOWED,
    layerOrder: LAYERS,
    baseState: emptyState,
    errors: duplicateSourceErrors,
});
assert.ok(duplicateSourceErrors.some(error => /source rule is claimed by more than one migration/.test(error)));

// The exact-selector static oracle also protects interactions outside one mapping.
// Here the mapped rule originally wins by source order, but layering it would let
// the still-unlayered peer win; that behavior change is rejected automatically.
const peerBase = parseMap([[
    'css/peer.css',
    '.x{color:blue}.x{color:red}',
]]);
const peerCurrent = parseMap([[
    'css/peer.css',
    '.x{color:blue}@layer pages{.x{color:red}}',
]]);
const peerBaseCatalog = catalogMap(peerBase).get('css/peer.css');
const peerCurrentCatalog = catalogMap(peerCurrent).get('css/peer.css');
const peerSource = peerBaseCatalog[1];
const peerDestination = peerCurrentCatalog[1];
const peerErrors = [];
verifyRuleMigrations({
    baseline: { debt: { unlayeredRules: [['css/peer.css', '', '.x'], ['css/peer.css', '', '.x']] } },
    state: {
        ...emptyState,
        migratedRules: [{
            id: 'fixture-peer-precedence',
            source: sourceRef(peerSource),
            destinations: [destinationRef(peerDestination)],
            conflicts: { normal: [], important: [] },
        }],
    },
    currentParsedByPath: peerCurrent,
    baseParsedByPath: peerBase,
    stylesheetLinks: {},
    allowedLayers: ALLOWED,
    layerOrder: LAYERS,
    baseState: emptyState,
    errors: peerErrors,
});
assert.ok(peerErrors.some(error => /exact-selector cascade precedence changes/.test(error)));

// CSS declaration overlap is modeled by the properties they can write, not by
// literal property-name equality. Shorthands, logical aliases and `all` are
// therefore unsafe to split from overlapping declarations.
assert.equal(propertiesOverlap('margin', 'margin-left'), true);
assert.equal(propertiesOverlap('margin-inline-start', 'margin-left'), true);
assert.equal(propertiesOverlap('margin-top', 'margin-left'), false);
assert.equal(propertiesOverlap('border', 'border-image-source'), true);
assert.equal(propertiesOverlap('all', 'color'), true);
assert.equal(propertiesOverlap('future-property', 'color'), true);
assert.equal(propertiesOverlap('--theme-gap', 'margin'), false);

const shorthandBase = parseMap([['css/shorthand.css', '.d{margin:1px;margin-left:2px}']]);
const shorthandCurrent = parseMap([[
    'css/shorthand.css',
    '@layer layout{.d{margin:1px}}@layer pages{.d{margin-left:2px}}',
]]);
const shorthandSource = catalogMap(shorthandBase).get('css/shorthand.css')[0];
const shorthandDestinations = catalogMap(shorthandCurrent).get('css/shorthand.css');
const shorthandMapping = {
    id: 'fixture-shorthand-longhand',
    source: sourceRef(shorthandSource),
    destinations: shorthandDestinations.map(destinationRef),
    conflicts: { normal: [], important: [] },
};
const shorthandErrors = [];
verifyRuleMigrations({
    baseline: { debt: { unlayeredRules: [['css/shorthand.css', '', '.d']] } },
    state: { ...emptyState, migratedRules: [shorthandMapping] },
    currentParsedByPath: shorthandCurrent,
    baseParsedByPath: shorthandBase,
    stylesheetLinks: { 'shorthand.html': [['css/shorthand.css', []]] },
    allowedLayers: ALLOWED,
    layerOrder: LAYERS,
    baseState: emptyState,
    errors: shorthandErrors,
});
assert.ok(shorthandErrors.some(error => /overlapping properties margin \/ margin-left/.test(error)));

const overlapBase = parseMap([
    ['css/a.css', '.x{margin:1px}'],
    ['css/b.css', '.x{margin-left:2px}'],
]);
const overlapCurrent = parseMap([
    ['css/a.css', '@layer layout{.x{margin:1px}}'],
    ['css/b.css', '.x{margin-left:2px}'],
]);
const overlapBaseCatalogs = catalogMap(overlapBase);
const overlapCurrentCatalogs = catalogMap(overlapCurrent);
const overlapSource = overlapBaseCatalogs.get('css/a.css')[0];
const overlapDestination = overlapCurrentCatalogs.get('css/a.css')[0];
const overlapMapping = {
    id: 'fixture-shorthand-peer',
    source: sourceRef(overlapSource),
    destinations: [destinationRef(overlapDestination)],
    conflicts: { normal: [], important: [] },
};
overlapMapping.conflicts = analyzeExactConflicts(
    overlapMapping,
    overlapSource,
    [overlapDestination],
    overlapBaseCatalogs,
    stylesheetLinks,
    LAYERS,
);
assert.equal(overlapMapping.conflicts.normal.length, 1);
assert.equal(overlapMapping.conflicts.normal[0].property, 'margin');
assert.equal(overlapMapping.conflicts.normal[0].peerProperty, 'margin-left');

// Mapped files must retain canonical non-rule at-rule semantics. The whole-file
// P0 digest is exempted only for mapped CSS, so declaration-style at-rule bodies
// and their effective layer remain part of the base->head residual contract.
const specialBase = parseMap([[
    'css/special.css',
    '.x{color:red}@font-face{font-family:X;src:url(x.woff2)}',
]]);
const specialSource = catalogMap(specialBase).get('css/special.css')[0];

const specialBodyCurrent = parseMap([[
    'css/special.css',
    '@layer pages{.x{color:red}}@font-face{font-family:X;src:url(y.woff2)}',
]]);
const specialBodyDestination = catalogMap(specialBodyCurrent).get('css/special.css')[0];
const specialBodyErrors = [];
verifyRuleMigrations({
    baseline: { debt: { unlayeredRules: [['css/special.css', '', '.x']] } },
    state: {
        ...emptyState,
        migratedRules: [{
            id: 'fixture-special-body',
            source: sourceRef(specialSource),
            destinations: [destinationRef(specialBodyDestination)],
            conflicts: { normal: [], important: [] },
        }],
    },
    currentParsedByPath: specialBodyCurrent,
    baseParsedByPath: specialBase,
    stylesheetLinks: {},
    allowedLayers: ALLOWED,
    layerOrder: LAYERS,
    baseState: emptyState,
    errors: specialBodyErrors,
});
assert.ok(specialBodyErrors.some(error => /non-rule at-rule semantics changed/.test(error)));

const specialLayerCurrent = parseMap([[
    'css/special.css',
    '@layer pages{.x{color:red}@font-face{font-family:X;src:url(x.woff2)}}',
]]);
const specialLayerDestination = catalogMap(specialLayerCurrent).get('css/special.css')[0];
const specialLayerErrors = [];
verifyRuleMigrations({
    baseline: { debt: { unlayeredRules: [['css/special.css', '', '.x']] } },
    state: {
        ...emptyState,
        migratedRules: [{
            id: 'fixture-special-layer',
            source: sourceRef(specialSource),
            destinations: [destinationRef(specialLayerDestination)],
            conflicts: { normal: [], important: [] },
        }],
    },
    currentParsedByPath: specialLayerCurrent,
    baseParsedByPath: specialBase,
    stylesheetLinks: {},
    allowedLayers: ALLOWED,
    layerOrder: LAYERS,
    baseState: emptyState,
    errors: specialLayerErrors,
});
assert.ok(specialLayerErrors.some(error => /non-rule at-rule semantics changed/.test(error)));

// Mapped files bypass the immutable whole-file semantic digest only after the
// migration contract verifies everything outside the mapped rule. Keyframe
// bodies are therefore canonical residual state even while keyframe migration
// itself remains disabled.
const keyframeBase = parseMap([[
    'css/keyframe.css',
    '.x{color:red}@keyframes pulse{from{opacity:0}to{opacity:1}}',
]]);
const keyframeCurrent = parseMap([[
    'css/keyframe.css',
    '@layer pages{.x{color:red}}@keyframes pulse{from{opacity:.5}to{opacity:1}}',
]]);
const keyframeSource = catalogMap(keyframeBase).get('css/keyframe.css')[0];
const keyframeDestination = catalogMap(keyframeCurrent).get('css/keyframe.css')[0];
const keyframeMapping = {
    id: 'fixture-keyframe-body',
    source: sourceRef(keyframeSource),
    destinations: [destinationRef(keyframeDestination)],
    conflicts: { normal: [], important: [] },
};
const keyframeErrors = [];
verifyRuleMigrations({
    baseline: { debt: { unlayeredRules: [['css/keyframe.css', '', '.x']] } },
    state: { ...emptyState, migratedRules: [keyframeMapping] },
    currentParsedByPath: keyframeCurrent,
    baseParsedByPath: keyframeBase,
    stylesheetLinks: { 'keyframe.html': [['css/keyframe.css', []]] },
    allowedLayers: ALLOWED,
    layerOrder: LAYERS,
    baseState: emptyState,
    errors: keyframeErrors,
});
assert.ok(keyframeErrors.some(error => /keyframes changed/.test(error)));

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

// Historical mappings are an immutable ledger, not a requirement that every old
// destination remain present forever. A later PR may consume the comparison-base
// terminal destination as the source of a new mapping.
const lineageP0 = parseMap([['css/lineage.css', '.s{color:red}']]);
const lineageBase = parseMap([['css/lineage.css', '@layer components{.s{color:red}}']]);
const lineageCurrent = parseMap([['css/lineage.css', '@layer showcase{.s{color:red}}']]);
const lineageP0Rule = catalogMap(lineageP0).get('css/lineage.css')[0];
const lineageBaseRule = catalogMap(lineageBase).get('css/lineage.css')[0];
const lineageCurrentRule = catalogMap(lineageCurrent).get('css/lineage.css')[0];
const historicalMapping = {
    id: 'fixture-lineage-first-pr',
    source: sourceRef(lineageP0Rule),
    destinations: [destinationRef(lineageBaseRule)],
    conflicts: { normal: [], important: [] },
};
const nextMapping = {
    id: 'fixture-lineage-second-pr',
    source: sourceRef(lineageBaseRule),
    destinations: [destinationRef(lineageCurrentRule)],
    conflicts: { normal: [], important: [] },
};
const lineageErrors = [];
verifyRuleMigrations({
    baseline: { debt: { unlayeredRules: [['css/lineage.css', '', '.s']] } },
    state: { ...emptyState, migratedRules: [historicalMapping, nextMapping] },
    currentParsedByPath: lineageCurrent,
    baseParsedByPath: lineageBase,
    stylesheetLinks: {},
    allowedLayers: ALLOWED,
    layerOrder: LAYERS,
    baseState: { ...emptyState, migratedRules: [historicalMapping] },
    errors: lineageErrors,
});
assert.deepEqual(lineageErrors, []);

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

// Rule retirement is an explicit append-only transaction: dead CSS may leave
// the active stylesheet without rewriting or deleting its historical migration.
const retireP0Base = parseMap([['css/retire-p0.css', '.dead{display:none}.keep{color:red}']]);
const retireP0Current = parseMap([['css/retire-p0.css', '.keep{color:red}']]);
const retireP0Source = catalogMap(retireP0Base).get('css/retire-p0.css')[0];
const retireP0Mapping = {
    id: 'fixture-retire-p0',
    kind: 'retire',
    source: sourceRef(retireP0Source),
    destinations: [],
    reason: 'fixture consumer was removed',
};
const retireP0Errors = [];
verifyRuleMigrations({
    baseline: { debt: { unlayeredRules: [['css/retire-p0.css', '', '.dead'], ['css/retire-p0.css', '', '.keep']] } },
    state: { ...emptyState, migratedRules: [retireP0Mapping] },
    currentParsedByPath: retireP0Current,
    baseParsedByPath: retireP0Base,
    stylesheetLinks: {},
    allowedLayers: ALLOWED,
    layerOrder: LAYERS,
    baseState: emptyState,
    errors: retireP0Errors,
});
assert.deepEqual(retireP0Errors, []);

// Layered retirement is only legal when the source is the terminal output of
// an already merged migration, preventing retirement from bypassing the ledger.
const retireLayeredP0 = parseMap([['css/retire-layered.css', '.dead{display:none}']]);
const retireLayeredBase = parseMap([['css/retire-layered.css', '@layer layout{.dead{display:none}}']]);
const retireLayeredCurrent = parseMap([['css/retire-layered.css', '']]);
const retireLayeredP0Rule = catalogMap(retireLayeredP0).get('css/retire-layered.css')[0];
const retireLayeredBaseRule = catalogMap(retireLayeredBase).get('css/retire-layered.css')[0];
const retireLayeredHistory = {
    id: 'fixture-retire-layered-history',
    source: sourceRef(retireLayeredP0Rule),
    destinations: [destinationRef(retireLayeredBaseRule)],
    conflicts: { normal: [], important: [] },
};
const retireLayeredMapping = {
    id: 'fixture-retire-layered',
    kind: 'retire',
    source: sourceRef(retireLayeredBaseRule),
    destinations: [],
    reason: 'fixture consumer was removed',
};
const retireLayeredErrors = [];
verifyRuleMigrations({
    baseline: { debt: { unlayeredRules: [['css/retire-layered.css', '', '.dead']] } },
    state: { ...emptyState, migratedRules: [retireLayeredHistory, retireLayeredMapping] },
    currentParsedByPath: retireLayeredCurrent,
    baseParsedByPath: retireLayeredBase,
    stylesheetLinks: {},
    allowedLayers: ALLOWED,
    layerOrder: LAYERS,
    baseState: { ...emptyState, migratedRules: [retireLayeredHistory] },
    errors: retireLayeredErrors,
});
assert.deepEqual(retireLayeredErrors, []);

const retireStillPresentErrors = [];
verifyRuleMigrations({
    baseline: { debt: { unlayeredRules: [['css/retire-p0.css', '', '.dead'], ['css/retire-p0.css', '', '.keep']] } },
    state: { ...emptyState, migratedRules: [retireP0Mapping] },
    currentParsedByPath: retireP0Base,
    baseParsedByPath: retireP0Base,
    stylesheetLinks: {},
    allowedLayers: ALLOWED,
    layerOrder: LAYERS,
    baseState: emptyState,
    errors: retireStillPresentErrors,
});
assert.ok(retireStillPresentErrors.some(error => /retired selector location is still present/.test(error)));

const retireWithoutHistoryErrors = [];
verifyRuleMigrations({
    baseline: { debt: { unlayeredRules: [] } },
    state: { ...emptyState, migratedRules: [retireLayeredMapping] },
    currentParsedByPath: retireLayeredCurrent,
    baseParsedByPath: retireLayeredBase,
    stylesheetLinks: {},
    allowedLayers: ALLOWED,
    layerOrder: LAYERS,
    baseState: emptyState,
    errors: retireWithoutHistoryErrors,
});
assert.ok(retireWithoutHistoryErrors.some(error => /layered retirement source must be a destination/.test(error)));

const retireMissingReasonErrors = [];
verifyRuleMigrations({
    baseline: { debt: { unlayeredRules: [['css/retire-p0.css', '', '.dead'], ['css/retire-p0.css', '', '.keep']] } },
    state: { ...emptyState, migratedRules: [{ ...retireP0Mapping, id: 'fixture-retire-no-reason', reason: '' }] },
    currentParsedByPath: retireP0Current,
    baseParsedByPath: retireP0Base,
    stylesheetLinks: {},
    allowedLayers: ALLOWED,
    layerOrder: LAYERS,
    baseState: emptyState,
    errors: retireMissingReasonErrors,
});
assert.ok(retireMissingReasonErrors.some(error => /require a non-empty reason/.test(error)));

// Malformed state must fail closed with diagnostics rather than crashing the verifier.
const malformedErrors = [];
verifyRuleMigrations({
    baseline: { debt: { unlayeredRules: [] } },
    state: {
        ...emptyState,
        migratedRules: [{
            id: 'fixture-malformed-source',
            destinations: [],
            conflicts: { normal: [], important: [] },
        }],
    },
    currentParsedByPath: new Map(),
    baseParsedByPath: new Map(),
    stylesheetLinks: {},
    allowedLayers: ALLOWED,
    layerOrder: LAYERS,
    baseState: emptyState,
    errors: malformedErrors,
});
assert.ok(malformedErrors.some(error => /source must be a complete stable rule reference/.test(error)));

// Merged mappings are append-only: deletion or in-place mutation is a ratchet violation.
const removedErrors = [];
verifyMonotonicState(state, emptyState, removedErrors);
assert.ok(removedErrors.some(error => /was removed/.test(error)));
const modifiedState = clone(state);
modifiedState.migratedRules[0].conflicts.normal = [];
const modifiedErrors = [];
verifyMonotonicState(state, modifiedState, modifiedErrors);
assert.ok(modifiedErrors.some(error => /was modified/.test(error)));

console.log('PASS CSS rule migration mapping, retirement, split, relayer, conflict and ratchet regressions');
