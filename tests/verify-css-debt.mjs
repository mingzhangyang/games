#!/usr/bin/env node
// CSS layer migration guard.
// P0 is an immutable factual snapshot. Migration progress lives in a separate
// rule-level state file so production CSS cannot be rebaselined into silence.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCssText } from './lib/css/baseline-adapter.mjs';
import { hasImportantPriority } from './lib/css/model.mjs';
import { scanHtml } from './lib/css/html-inputs.mjs';
import { auditedJavaScriptFiles, scanRuntimeStyleSources } from './lib/css/runtime-sources.mjs';
import { verifySemanticSnapshot } from './lib/css/semantic-contract.mjs';
import { verifyActivationSnapshot } from './lib/css/activation.mjs';
import {
    readGitFile, resolveComparisonBase, verifyRuleMigrations,
} from './lib/css/migration-contract.mjs';
import { readMigrationState, readMigrationStateAtGit } from './lib/css/migration-state.mjs';
import { verifyFamilyExtractions } from './lib/css/family-extraction.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = join(ROOT, 'tests/css-layer-p0-baseline.json');
const RUNTIME_STYLE_BASELINE_PATH = join(ROOT, 'tests/css-runtime-style-p0-baseline.json');
const BASELINE_TEXT = readFileSync(BASELINE_PATH, 'utf8');
const BASELINE = JSON.parse(BASELINE_TEXT);
const MIGRATION_STATE = readMigrationState(ROOT);
const RUNTIME_STYLE_BASELINE_TEXT = readFileSync(RUNTIME_STYLE_BASELINE_PATH, 'utf8');
const RUNTIME_STYLE_BASELINE = JSON.parse(RUNTIME_STYLE_BASELINE_TEXT);
const BASELINE_BLOB_SHA = createHash('sha1')
    .update(`blob ${Buffer.byteLength(BASELINE_TEXT, 'utf8')}\0`)
    .update(BASELINE_TEXT)
    .digest('hex');
const RUNTIME_STYLE_BASELINE_BLOB_SHA = createHash('sha1')
    .update(`blob ${Buffer.byteLength(RUNTIME_STYLE_BASELINE_TEXT, 'utf8')}\0`)
    .update(RUNTIME_STYLE_BASELINE_TEXT)
    .digest('hex');
const REVIEWED_P0_BASELINE_BLOB_SHA = '9c4541b4a447bff3dbecb0bc6cd02e09f3850922';
const REVIEWED_RUNTIME_STYLE_P0_BLOB_SHA = 'e766d5873cf551fb46cda56dd0df861c08f2780f';
const REVIEWED_LAYER_ORDER = Object.freeze(['reset', 'tokens', 'showcase', 'components', 'accessibility', 'layout', 'pages', 'contracts']);
const ALLOWED_LAYERS = new Set(REVIEWED_LAYER_ORDER);
const REVIEWED_P5_STABILITY_FREEZE = Object.freeze({
    policy: 'freeze-current-compatibility-tier',
    remainingUnlayeredPolicy: 'immutable-p0-minus-registered-migrations',
    allowNewUnlayeredRules: false,
    p4Evidence: {
        workflow: 'Architecture v2 candidate',
        runNumber: 335,
        runId: 37567729830,
        headCommit: '49e54480be18605b08c21c3e32c9a20a43cb8360',
        conclusion: 'success',
        normalAndCanaryUseSameBuiltOutputGates: true,
    },
    frozenCounts: {
        staticOrdinaryRules: 2912,
        staticUnlayeredRules: 2703,
        runtimeOrdinaryRules: 15,
        runtimeUnlayeredRules: 15,
        runtimeUnlayeredKeyframes: 3,
        inlineStyleBlocks: 1,
        inlineStyleRules: 6,
        inlineStyleAttributes: 14,
    },
    note: 'P5 freezes the post-P4 compatibility tier before plugin removal. Remaining unlayered CSS is not declared fully migrated; its exact membership is still derived from immutable P0 minus append-only registered migrations, so it cannot grow silently. Further ownership migration is a separate future transaction rather than a prerequisite for removing the proven-independent link-order plugin.',
});
function listFiles(directory, root, predicate) {
    if (!existsSync(directory)) return [];
    const output = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const fullPath = join(directory, entry.name);
        if (entry.isDirectory()) output.push(...listFiles(fullPath, root, predicate));
        else if (entry.isFile()) {
            const path = relative(root, fullPath).split(sep).join('/');
            if (predicate(path)) output.push(path);
        }
    }
    return output.sort();
}

function sortTuples(rows) {
    return [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function multisetDelta(actual, expected) {
    const actualCounts = new Map();
    const expectedCounts = new Map();
    for (const row of actual) {
        const key = JSON.stringify(row);
        actualCounts.set(key, (actualCounts.get(key) || 0) + 1);
    }
    for (const row of expected) {
        const key = JSON.stringify(row);
        expectedCounts.set(key, (expectedCounts.get(key) || 0) + 1);
    }
    const added = [];
    const removed = [];
    for (const [key, count] of actualCounts) {
        const extra = count - (expectedCounts.get(key) || 0);
        for (let index = 0; index < extra; index++) added.push(JSON.parse(key));
    }
    for (const [key, count] of expectedCounts) {
        const extra = count - (actualCounts.get(key) || 0);
        for (let index = 0; index < extra; index++) removed.push(JSON.parse(key));
    }
    return { added, removed };
}

function sameJson(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function verifyPluginRetirementContract(errors) {
    const viteConfig = readFileSync(join(ROOT, 'vite.config.js'), 'utf8');
    const sharedCssFirstPath = join(ROOT, 'tools/lib/shared-css-first.mjs');
    if (existsSync(sharedCssFirstPath)) {
        errors.push('P6 retirement contract: tools/lib/shared-css-first.mjs must stay deleted.');
    }

    for (const fragment of ['shared-css-first', 'createSharedCssFirstPlugin', 'CSS_LAYER_CANARY']) {
        if (viteConfig.includes(fragment)) {
            errors.push('P6 retirement contract: vite.config.js reintroduced retired CSS ordering plumbing: ' + fragment);
        }
    }

    const workflowPath = join(ROOT, '.github/workflows/architecture-v2.yml');
    if (existsSync(workflowPath)) {
        const workflow = readFileSync(workflowPath, 'utf8');
        if (workflow.includes('CSS_LAYER_CANARY')) {
            errors.push('P6 retirement contract: Architecture v2 workflow must not restore the temporary CSS_LAYER_CANARY path.');
        }
    }
}

function verifyProject() {
    const errors = [];
    if (BASELINE.snapshotKind !== 'immutable-p0') {
        errors.push('tests/css-layer-p0-baseline.json must remain the immutable P0 snapshot.');
    }
    if (BASELINE_BLOB_SHA !== REVIEWED_P0_BASELINE_BLOB_SHA) {
        errors.push('Immutable P0 baseline content differs from the independently reviewed digest.');
    }
    if (RUNTIME_STYLE_BASELINE.snapshotKind !== 'immutable-p0-runtime-styles') {
        errors.push('tests/css-runtime-style-p0-baseline.json must remain the immutable runtime-style P0 addendum.');
    }
    if (RUNTIME_STYLE_BASELINE_BLOB_SHA !== REVIEWED_RUNTIME_STYLE_P0_BLOB_SHA) {
        errors.push('Immutable runtime-style P0 addendum differs from the independently reviewed digest.');
    }
    if (MIGRATION_STATE.p0BaselineBlobSha !== REVIEWED_P0_BASELINE_BLOB_SHA) {
        errors.push('Migration state must reference the independently pinned immutable P0 digest.');
    }
    if (MIGRATION_STATE.runtimeStyleP0BaselineBlobSha !== REVIEWED_RUNTIME_STYLE_P0_BLOB_SHA) {
        errors.push('Migration state must reference the independently pinned runtime-style P0 addendum digest.');
    }
    if (!sameJson(MIGRATION_STATE.targetLayerOrder, REVIEWED_LAYER_ORDER)) {
        errors.push('targetLayerOrder must exactly match the reviewed layer taxonomy: '
            + REVIEWED_LAYER_ORDER.join(', ') + '.');
    }
    if (!sameJson(MIGRATION_STATE.allowedLayers, REVIEWED_LAYER_ORDER)) {
        errors.push('allowedLayers must exactly match the reviewed layer taxonomy; migration state cannot authorize new layers.');
    }
    if (MIGRATION_STATE.migrationUnit !== 'rule' || MIGRATION_STATE.rejectedStrategy !== 'whole-file-single-layer') {
        errors.push('CSS migration must remain rule-granular; whole-file single-layer migration is rejected.');
    }
    if (MIGRATION_STATE.runtimeMigrationUnit !== 'style-source') {
        errors.push('Runtime stylesheet migration must remain source-granular until P2 explicitly models it.');
    }
    if (MIGRATION_STATE.schemaVersion !== 2 || MIGRATION_STATE.mappingContractVersion !== 3
        || MIGRATION_STATE.status !== 'rule-mapping-enabled') {
        errors.push('CSS migration state must use the reviewed P2 rule-mapping contract (schema 2 / contract 3).');
    }
    if ((MIGRATION_STATE.migratedKeyframes || []).length) {
        errors.push('Keyframe migrations remain disabled until their own P2 mapping contract is implemented.');
    }
    if ((MIGRATION_STATE.migratedRuntimeStyleSources || []).length) {
        errors.push('Runtime stylesheet migrations remain disabled until their own P2 mapping contract is implemented.');
    }
    if (!sameJson(MIGRATION_STATE.p5StabilityFreeze, REVIEWED_P5_STABILITY_FREEZE)) {
        errors.push('P5 stability freeze metadata differs from the reviewed post-canary contract.');
    }
    const cssPaths = listFiles(join(ROOT, 'css'), ROOT, path => path.endsWith('.css'));
    const htmlPaths = [
        ...readdirSync(ROOT, { withFileTypes: true })
            .filter(entry => entry.isFile() && entry.name.endsWith('.html'))
            .map(entry => entry.name),
        ...listFiles(join(ROOT, 'public'), ROOT, path => path.endsWith('.html')),
    ].sort();
    const expectedCssPaths = BASELINE.cssFiles.map(file => file.path).sort();
    const expectedHtmlPaths = BASELINE.htmlFiles.map(file => file.path).sort();

    if (!sameJson(cssPaths, expectedCssPaths)) {
        errors.push('CSS source inventory changed; review source ownership in P2 without editing immutable P0.');
    }
    if (!sameJson(htmlPaths, expectedHtmlPaths)) {
        errors.push('Active HTML inventory changed; review page/stylesheet ownership without editing immutable P0.');
    }

    const declaredMappedPaths = new Set((MIGRATION_STATE.migratedRules || []).flatMap(mapping => [
        mapping.source?.path,
        ...(mapping.destinations || []).map(destination => destination.path),
    ]).filter(Boolean));
    const migrationStarted = (MIGRATION_STATE.migratedRules || []).length > 0;
    const currentParsedByPath = new Map();
    const stylesheetLinks = {};
    const actualDebt = {
        unlayeredRules: [],
        unlayeredKeyframes: [],
        importantDeclarations: [],
        inlineStyleRules: [],
        inlineStyleBlocks: [],
        inlineStyleAttributes: [],
        specialAtRules: [],
    };
    let totalRules = 0;
    let importantCount = 0;
    let customPropertyDefinitions = 0;

    for (const path of cssPaths) {
        const parsed = parseCssText(readFileSync(join(ROOT, path), 'utf8'), path);
        currentParsedByPath.set(path, parsed);
        totalRules += parsed.rules.length;
        importantCount += parsed.declarations.filter(declaration => hasImportantPriority(declaration.value)).length;
        const fileCustomPropertyDefinitions = parsed.declarations
            .filter(declaration => declaration.property.startsWith('--')).length;
        customPropertyDefinitions += fileCustomPropertyDefinitions;

        const layerCounts = {};
        for (const rule of parsed.rules) {
            if (rule.layer) layerCounts[rule.layer] = (layerCounts[rule.layer] || 0) + 1;
            else actualDebt.unlayeredRules.push([path, rule.context.join(' / '), rule.selector]);
        }
        for (const name of parsed.layerNames) {
            if (!ALLOWED_LAYERS.has(name)) errors.push(path + ': unregistered layer "' + name + '"');
        }
        for (const keyframe of parsed.keyframes) {
            if (!keyframe.layer) {
                actualDebt.unlayeredKeyframes.push([
                    path, keyframe.context.join(' / '), keyframe.name, keyframe.params,
                ]);
            }
        }
        for (const declaration of parsed.declarations) {
            if (declaration.selector && hasImportantPriority(declaration.value)) {
                actualDebt.importantDeclarations.push([
                    path, declaration.context.join(' / '), declaration.selector,
                    declaration.property, declaration.value,
                ]);
            }
        }
        actualDebt.specialAtRules.push(...(parsed.specialAtRules || []));

        const baselineFile = BASELINE.cssFiles.find(file => file.path === path);
        if (!baselineFile) continue;
        if (fileCustomPropertyDefinitions !== baselineFile.customPropertyDefinitions) {
            errors.push(path + ': custom-property declaration occurrences differ from the P0 inventory ('
                + fileCustomPropertyDefinitions + ' current vs ' + baselineFile.customPropertyDefinitions + ' P0).');
        }
        const layerStatements = [...parsed.layerStatements];
        const layerBlocks = [...parsed.layerBlocks];
        const normalizedLayerCounts = Object.fromEntries(Object.entries(layerCounts).sort(([a], [b]) => a.localeCompare(b)));
        const expectedLayerCounts = Object.fromEntries(Object.entries(baselineFile.currentLayers).sort(([a], [b]) => a.localeCompare(b)));
        if (!declaredMappedPaths.has(path) && !sameJson(normalizedLayerCounts, expectedLayerCounts)) {
            errors.push(path + ': current layer map differs from the reviewed P0 baseline without a registered rule mapping.');
        }
        if (path === 'css/tokens.css' && migrationStarted) {
            const reviewedOrder = REVIEWED_LAYER_ORDER.join(', ');
            if (!sameJson(layerStatements, [reviewedOrder])) {
                errors.push(path + ': active P2 migration requires the canonical @layer order "' + reviewedOrder + '".');
            }
        } else if (!sameJson(layerStatements, baselineFile.layerStatements)) {
            errors.push(path + ': @layer order declaration differs from the reviewed P0 baseline.');
        }
        if (!declaredMappedPaths.has(path) && !sameJson(layerBlocks, baselineFile.layerBlocks)) {
            errors.push(path + ': current @layer blocks differ from the reviewed P0 baseline without a registered rule mapping.');
        }
    }

    for (const path of htmlPaths) {
        const html = readFileSync(join(ROOT, path), 'utf8');
        const scanned = scanHtml(path, html);
        stylesheetLinks[path] = scanned.links;
        actualDebt.inlineStyleRules.push(...scanned.inlineRules);
        actualDebt.inlineStyleBlocks.push(...scanned.styleBlocks);
        actualDebt.inlineStyleAttributes.push(...scanned.inlineAttributes);
        const baselineHtml = BASELINE.htmlFiles.find(file => file.path === path);
        if (baselineHtml && scanned.styleBlocks.length !== baselineHtml.styleBlockCount) {
            errors.push(path + ': inline <style> block count differs from the P0 baseline.');
        }
    }

    const runtimeStyles = scanRuntimeStyleSources(ROOT, errors);
    const expectedRuntimeStyles = [...(RUNTIME_STYLE_BASELINE.styles || [])]
        .sort((left, right) => left.id.localeCompare(right.id));
    if (!sameJson(runtimeStyles, expectedRuntimeStyles)) {
        const actualIds = runtimeStyles.map(style => [style.id, style.css]);
        const expectedIds = expectedRuntimeStyles.map(style => [style.id, style.css]);
        const delta = multisetDelta(actualIds, expectedIds);
        errors.push('Runtime stylesheet source inventory differs from the immutable P0 addendum ('
            + delta.added.length + ' added/changed, ' + delta.removed.length + ' removed/changed).');
        if (delta.added.length) errors.push('  runtime new: ' + JSON.stringify(delta.added.slice(0, 3)));
        if (delta.removed.length) errors.push('  runtime gone: ' + JSON.stringify(delta.removed.slice(0, 3)));
    }

    let runtimeRules = 0;
    let runtimeUnlayeredRules = 0;
    let runtimeKeyframes = 0;
    let runtimeUnlayeredKeyframes = 0;
    let runtimeImportant = 0;
    for (const style of runtimeStyles) {
        const parsed = parseCssText(style.css, style.id);
        runtimeRules += parsed.rules.length;
        runtimeUnlayeredRules += parsed.rules.filter(rule => !rule.layer).length;
        runtimeKeyframes += parsed.keyframes.length;
        runtimeUnlayeredKeyframes += parsed.keyframes.filter(keyframe => !keyframe.layer).length;
        runtimeImportant += parsed.declarations
            .filter(declaration => declaration.selector && hasImportantPriority(declaration.value)).length;
    }

    const currentCompatibilityCounts = {
        staticOrdinaryRules: totalRules,
        staticUnlayeredRules: actualDebt.unlayeredRules.length,
        runtimeOrdinaryRules: runtimeRules,
        runtimeUnlayeredRules,
        runtimeUnlayeredKeyframes,
        inlineStyleBlocks: actualDebt.inlineStyleBlocks.length,
        inlineStyleRules: actualDebt.inlineStyleRules.length,
        inlineStyleAttributes: actualDebt.inlineStyleAttributes.length,
    };
    const p5FrozenCounts = MIGRATION_STATE.p5StabilityFreeze?.frozenCounts || {};
    // P5 remains immutable historical evidence. Reviewed family extractions may later reduce
    // the static rule population; that exact delta is checked after the comparison-base CSS is loaded.
    if (currentCompatibilityCounts.staticUnlayeredRules > p5FrozenCounts.staticUnlayeredRules) {
        errors.push('Static unlayered CSS debt grew above the P5 frozen ceiling: '
            + currentCompatibilityCounts.staticUnlayeredRules + ' > '
            + p5FrozenCounts.staticUnlayeredRules + '.');
    }
    // Runtime stylesheet and inline-style migrations still have no reviewed reduction contract.
    // Keep those historical counts exact until such a contract exists.
    for (const key of [
        'runtimeOrdinaryRules', 'runtimeUnlayeredRules', 'runtimeUnlayeredKeyframes',
        'inlineStyleBlocks', 'inlineStyleRules', 'inlineStyleAttributes',
    ]) {
        if (currentCompatibilityCounts[key] !== p5FrozenCounts[key]) {
            errors.push('Unreviewed non-static CSS compatibility count changed for ' + key + ': '
                + currentCompatibilityCounts[key] + ' !== ' + p5FrozenCounts[key] + '.');
        }
    }

    const comparisonBase = resolveComparisonBase(ROOT);
    let baseState = MIGRATION_STATE;
    try {
        const comparisonState = readMigrationStateAtGit(ROOT, comparisonBase);
        if (comparisonState) baseState = comparisonState;
        else if (migrationStarted) {
            errors.push('Active P2 migration requires an accessible git comparison base.');
        }
    } catch (error) {
        errors.push('Comparison-base migration state could not be loaded: ' + error.message);
    }

    const baseParsedByPath = new Map();
    for (const path of cssPaths) {
        const baseSource = readGitFile(ROOT, comparisonBase, path);
        if (baseSource === null) {
            if (migrationStarted) errors.push(path + ': cannot read comparison-base CSS for P2 mapping verification.');
            baseParsedByPath.set(path, currentParsedByPath.get(path));
        } else {
            baseParsedByPath.set(path, parseCssText(baseSource, path));
        }
    }

    const familyResult = verifyFamilyExtractions({
        root: ROOT,
        comparisonBase,
        currentParsedByPath,
        baseParsedByPath,
        baselineUnlayeredRules: BASELINE.debt?.unlayeredRules || [],
        errors,
    });
    const expectedStaticOrdinaryRules = p5FrozenCounts.staticOrdinaryRules + familyResult.totalRuleDelta;
    if (currentCompatibilityCounts.staticOrdinaryRules !== expectedStaticOrdinaryRules) {
        errors.push('Static ordinary rule population differs from P5 plus reviewed family extractions: '
            + currentCompatibilityCounts.staticOrdinaryRules + ' !== ' + expectedStaticOrdinaryRules + '.');
    }
    const familyAdjustedBaseline = {
        ...BASELINE,
        debt: {
            ...BASELINE.debt,
            unlayeredRules: familyResult.remainingUnlayeredRules,
        },
    };

    const migrationResult = verifyRuleMigrations({
        baseline: familyAdjustedBaseline,
        state: MIGRATION_STATE,
        currentParsedByPath,
        baseParsedByPath,
        stylesheetLinks: BASELINE.stylesheetLinks,
        allowedLayers: ALLOWED_LAYERS,
        layerOrder: REVIEWED_LAYER_ORDER,
        baseState,
        externalRuleChanges: familyResult.externalRuleChanges,
        errors,
    });

    verifySemanticSnapshot(ROOT, cssPaths, htmlPaths, runtimeStyles, errors, {
        allowedCssChanges: new Set([...migrationResult.mappedCssPaths, ...familyResult.cssPaths]),
    });
    verifyActivationSnapshot(ROOT, htmlPaths, auditedJavaScriptFiles(ROOT), errors);
    verifyPluginRetirementContract(errors);

    for (const key of Object.keys(actualDebt)) {
        actualDebt[key] = sortTuples(actualDebt[key]);
        if (key === 'unlayeredRules') continue;
        const expected = sortTuples(BASELINE.debt[key] || []);
        const delta = multisetDelta(actualDebt[key], expected);
        if (delta.added.length || delta.removed.length) {
            errors.push(
                key + ' differs from the immutable P0 CSS snapshot (' + delta.added.length
                + ' added, ' + delta.removed.length + ' removed); do not edit the P0 snapshot to hide migration progress.',
            );
            if (delta.added.length) errors.push('  new: ' + JSON.stringify(delta.added.slice(0, 3)));
            if (delta.removed.length) errors.push('  gone: ' + JSON.stringify(delta.removed.slice(0, 3)));
        }
    }

    if (!sameJson(stylesheetLinks, BASELINE.stylesheetLinks)) {
        errors.push('Stylesheet link membership/order differs from the reviewed P0 baseline.');
    }

    if (errors.length) {
        console.error('FAIL CSS layer debt guard');
        errors.forEach(error => console.error('  ' + error));
        process.exitCode = 1;
        return;
    }

    const unlayeredCount = actualDebt.unlayeredRules.length;
    console.log('PASS CSS layer debt guard');
    console.log('  CSS files: ' + cssPaths.length + ' · HTML files: ' + htmlPaths.length);
    console.log('  ordinary CSS rules: ' + totalRules + ' static + ' + runtimeRules
        + ' runtime · unlayered: ' + unlayeredCount + ' static + ' + runtimeUnlayeredRules + ' runtime');
    console.log('  !important declarations: ' + importantCount + ' static + ' + runtimeImportant
        + ' runtime · custom-property definitions: ' + customPropertyDefinitions);
    console.log('  runtime stylesheet sources/keyframes: ' + runtimeStyles.length + '/'
        + runtimeKeyframes + ' · unlayered runtime keyframes: ' + runtimeUnlayeredKeyframes);
    console.log('  inline style blocks/rules/attributes: ' + actualDebt.inlineStyleBlocks.length + '/'
        + actualDebt.inlineStyleRules.length + '/' + actualDebt.inlineStyleAttributes.length);
    console.log('  static ordinary rule count matches P5 plus reviewed family-extraction deltas; unlayered debt matches both append-only ledgers.');
    console.log('  reviewed family extractions: ' + (familyResult.newExtractionIds.length
        ? familyResult.newExtractionIds.join(', ') : 'no new transaction in this diff'));
    console.log('  immutable P0/P5 evidence, script activation, stylesheet source order, and current layer map all match.');
}

verifyProject();
