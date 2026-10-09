#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseCssText } from './lib/css/baseline-adapter.mjs';
import {
    applyReviewedSelectorNarrowingsToImportant, applyReviewedSelectorPrunesToDebt, expectedConvergedResidual,
    expectedResidual, resolveFamilyExtension, verifyCurrentRetiredCustomProperties,
    verifyExtractionAdoption, verifyExtractionShape, verifyRetiredCustomProperties,
    verifyReviewedDeclarationRetirements, verifyReviewedRuleRetirements,
} from './lib/css/family-extraction.mjs';
import { indexRuleOccurrences, verifyReviewedAtRuleAdditions } from './lib/css/migration-contract.mjs';

const clone = value => JSON.parse(JSON.stringify(value));

const root = mkdtempSync(join(tmpdir(), 'family-adoption-'));
mkdirSync(join(root, 'src/games/demo'), { recursive: true });

const extraction = {
    id: 'persisted-family',
    games: {
        dm: {
            css: 'css/demo.css',
            html: 'demo.html',
            runtime: 'src/games/demo/runtime.js',
        },
    },
    components: [
        {
            suffix: 'panel',
            sharedClass: 'game-panel',
            surface: 'html',
            participants: ['dm'],
            fullyRemoved: [],
        },
        {
            suffix: 'row',
            sharedClass: 'game-row',
            surface: 'runtime',
            participants: ['dm'],
            fullyRemoved: [],
        },
    ],
};

try {
    writeFileSync(join(root, 'demo.html'), '<div class="dm-panel game-panel"></div>\n');
    writeFileSync(
        join(root, 'src/games/demo/runtime.js'),
        "const row = document.createElement('div');\n"
            + "row.className = 'dm-row game-row';\n"
            + "const second = document.createElement('div');\n"
            + "second.className = 'dm-row game-row';\n",
    );

    const validErrors = [];
    verifyExtractionAdoption(root, extraction, validErrors);
    assert.deepEqual(validErrors, []);

    writeFileSync(join(root, 'demo.html'), '<div class="dm-panel"></div>\n');
    const missingHtmlErrors = [];
    verifyExtractionAdoption(root, extraction, missingHtmlErrors);
    assert.ok(missingHtmlErrors.some(error =>
        /demo\.html has 1 \.dm-panel element\(s\) without \.game-panel/.test(error)));

    writeFileSync(join(root, 'demo.html'), '<div class="dm-panel game-panel"></div>\n');
    writeFileSync(
        join(root, 'src/games/demo/runtime.js'),
        "const row = document.createElement('div');\n"
            + "row.className = 'dm-row game-row';\n"
            + "const second = document.createElement('div');\n"
            + "second.className = 'dm-row';\n",
    );
    const missingRuntimeErrors = [];
    verifyExtractionAdoption(root, extraction, missingRuntimeErrors);
    assert.ok(missingRuntimeErrors.some(error =>
        /runtime\.js has 1 className assignment\(s\) with \.dm-row but without \.game-row/.test(error)));

    // Runtime DOM strings (including template-literal innerHTML) are adoption surfaces too.
    // A className-only scan used to miss Ripple Duet's level-chip spans.
    writeFileSync(
        join(root, 'src/games/demo/runtime.js'),
        'const rendered = `<span class="dm-row">row</span>`;\n',
    );
    const unadoptedHtmlFragmentErrors = [];
    verifyExtractionAdoption(root, extraction, unadoptedHtmlFragmentErrors);
    assert.ok(unadoptedHtmlFragmentErrors.some(error =>
        /without \.game-row/.test(error)), 'unadopted runtime HTML fragment must fail');

    writeFileSync(
        join(root, 'src/games/demo/runtime.js'),
        'const rendered = `<span class="dm-row game-row">row</span>`;\n',
    );
    const adoptedHtmlFragmentErrors = [];
    verifyExtractionAdoption(root, extraction, adoptedHtmlFragmentErrors);
    assert.deepEqual(adoptedHtmlFragmentErrors, []);


    // W4b: a legacy class may use a different suffix on a subset of pages,
    // but a single shared family must still own every real runtime chip.
    const aliasedFamily = clone(extraction);
    aliasedFamily.components = [{
        suffix: 'chip',
        localSuffixByParticipant: { dm: 'level-chip' },
        sharedClass: 'game-start-level-chip',
        surface: 'runtime',
        participants: ['dm'],
        fullyRemoved: [],
    }];
    writeFileSync(
        join(root, 'src/games/demo/runtime.js'),
        "const chip = document.createElement('button');\n"
            + "chip.className = 'dm-level-chip game-start-level-chip';\n",
    );
    const aliasShapeErrors = [];
    assert.equal(verifyExtractionShape(aliasedFamily, aliasShapeErrors), true);
    assert.deepEqual(aliasShapeErrors, []);
    const aliasAdoptionErrors = [];
    verifyExtractionAdoption(root, aliasedFamily, aliasAdoptionErrors);
    assert.deepEqual(aliasAdoptionErrors, []);

    writeFileSync(
        join(root, 'src/games/demo/runtime.js'),
        "chip.className = 'dm-level-chip';\n",
    );
    const aliasMissingClassErrors = [];
    verifyExtractionAdoption(root, aliasedFamily, aliasMissingClassErrors);
    assert.ok(aliasMissingClassErrors.some(error => /without \.game-start-level-chip/.test(error)));

    const invalidAliasPage = clone(aliasedFamily);
    invalidAliasPage.components[0].localSuffixByParticipant = { other: 'level-chip' };
    const invalidAliasPageErrors = [];
    assert.equal(verifyExtractionShape(invalidAliasPage, invalidAliasPageErrors), false);
    assert.ok(invalidAliasPageErrors.some(error => /non-participant other/.test(error)));

    const invalidAliasName = clone(aliasedFamily);
    invalidAliasName.components[0].localSuffixByParticipant = { dm: 'LevelChip' };
    const invalidAliasNameErrors = [];
    assert.equal(verifyExtractionShape(invalidAliasName, invalidAliasNameErrors), false);
    assert.ok(invalidAliasNameErrors.some(error => /kebab-case/.test(error)));

    const aliasState = clone(aliasedFamily);
    aliasState.components.push({
        ...clone(aliasState.components[0]),
        localSelectorSuffix: ':active',
        sharedSelectorSuffix: ':active',
        requiresAdoption: false,
    });
    const aliasStateErrors = [];
    assert.equal(verifyExtractionShape(aliasState, aliasStateErrors), true);
    assert.deepEqual(aliasStateErrors, []);

    const mismatchedAliasState = clone(aliasState);
    mismatchedAliasState.components[1].localSuffixByParticipant = {};
    const mismatchedAliasErrors = [];
    assert.equal(verifyExtractionShape(mismatchedAliasState, mismatchedAliasErrors), false);
    assert.ok(mismatchedAliasErrors.some(error => /requires a validated unsuffixed component/.test(error)));

    const shapeCases = [
        {
            name: 'unsupported extraction media context',
            mutate(component) { component.context = '@media print'; },
            expected: /component context is not a reviewed extraction media query/,
        },
        {
            name: 'empty participants',
            mutate(component) { component.participants = []; },
            expected: /must declare at least one participant/,
        },
        {
            name: 'duplicate participant',
            mutate(component) { component.participants = ['dm', 'dm']; },
            expected: /repeats participant dm/,
        },
        {
            name: 'duplicate fullyRemoved',
            mutate(component) { component.fullyRemoved = ['dm', 'dm']; },
            expected: /repeats fullyRemoved participant dm/,
        },
        {
            name: 'fullyRemoved outside participants',
            mutate(component) { component.fullyRemoved = ['other']; },
            expected: /marks non-participant other as fullyRemoved/,
        },
        {
            name: 'missing participant metadata',
            mutate(component, candidate) {
                component.participants = ['missing'];
                candidate.games = {};
            },
            expected: /participant missing requires css\/html\/runtime metadata/,
        },
    ];
    for (const shapeCase of shapeCases) {
        const candidate = clone(extraction);
        shapeCase.mutate(candidate.components[0], candidate);
        const shapeErrors = [];
        assert.equal(verifyExtractionShape(candidate, shapeErrors), false, shapeCase.name);
        assert.ok(shapeErrors.some(error => shapeCase.expected.test(error)), shapeCase.name);
    }

    // Same shared selector is permitted in default and phone contexts, never twice in one context.
    const mobileContext = clone(extraction);
    mobileContext.components.push({
        ...clone(extraction.components[0]),
        context: '@media (width <= 480px)',
    });
    const validMobileContextErrors = [];
    assert.equal(verifyExtractionShape(mobileContext, validMobileContextErrors), true);
    assert.deepEqual(validMobileContextErrors, []);
    const registeredMedia = clone(mobileContext);
    registeredMedia.reviewedAtRuleAdditions = [{
        context: '@media (width <= 480px)',
        reason: 'Both shared mobile rules occupy the same reviewed media condition.',
    }];
    const registeredMediaShapeErrors = [];
    assert.equal(verifyExtractionShape(registeredMedia, registeredMediaShapeErrors), true);
    assert.deepEqual(registeredMediaShapeErrors, []);

    const unbackedMedia = clone(extraction);
    unbackedMedia.reviewedAtRuleAdditions = registeredMedia.reviewedAtRuleAdditions;
    const unbackedMediaErrors = [];
    assert.equal(verifyExtractionShape(unbackedMedia, unbackedMediaErrors), false);
    assert.ok(unbackedMediaErrors.some(error => /has no shared component/.test(error)));

    const duplicateMedia = clone(registeredMedia);
    duplicateMedia.reviewedAtRuleAdditions.push(clone(duplicateMedia.reviewedAtRuleAdditions[0]));
    const duplicateMediaErrors = [];
    assert.equal(verifyExtractionShape(duplicateMedia, duplicateMediaErrors), false);
    assert.ok(duplicateMediaErrors.some(error => /duplicate reviewed at-rule addition/.test(error)));

    const approvedAtRule = { path: 'css/layout.css', context: '@media (width <= 480px)' };
    const baseAtRules = parseCssText(
        '@media (width <= 480px) { .existing { color: red; } }', 'css/layout.css',
    ).migrationAtRules;
    const addedAtRules = parseCssText(
        '@media (width <= 480px) { .added { color: blue; } }'
            + '@media (width <= 480px) { .existing { color: red; } }',
        'css/layout.css',
    ).migrationAtRules;
    const validAdditionErrors = [];
    verifyReviewedAtRuleAdditions(baseAtRules, addedAtRules, [approvedAtRule], 'css/layout.css', validAdditionErrors);
    assert.deepEqual(validAdditionErrors, [], 'one registered wrapper preserves the original at-rule inventory');

    const checkBadMedia = (actual, reviews, pattern) => {
        const found = [];
        verifyReviewedAtRuleAdditions(baseAtRules, actual, reviews, 'css/layout.css', found);
        assert.ok(found.some(error => pattern.test(error)), JSON.stringify(found));
    };
    checkBadMedia(addedAtRules, [], /non-rule at-rule semantics changed/);
    checkBadMedia(addedAtRules, [
        { path: 'css/layout.css', context: '@media (width >= 480px)' },
    ], /unrecognized family at-rule addition/);
    checkBadMedia([...addedAtRules, ...addedAtRules.slice(0, 1)], [approvedAtRule],
        /non-rule at-rule semantics changed/);
    checkBadMedia(baseAtRules, [approvedAtRule], /does not preserve the complete base at-rule inventory/);
    checkBadMedia(
        parseCssText('@media (width >= 480px) { .existing { color: red; } }',
            'css/layout.css').migrationAtRules,
        [approvedAtRule],
        /non-rule at-rule semantics changed/,
    );

    const duplicateMobileContext = clone(mobileContext);
    duplicateMobileContext.components.push(clone(mobileContext.components[2]));
    const duplicateMobileErrors = [];
    assert.equal(verifyExtractionShape(duplicateMobileContext, duplicateMobileErrors), false);
    assert.ok(duplicateMobileErrors.some(error =>
        /duplicate component suffix/.test(error)));

    const pseudoState = clone(extraction);
    pseudoState.components = [
        clone(extraction.components[0]),
        {
            suffix: 'panel',
            sharedClass: 'game-panel',
            localSelectorSuffix: ':hover',
            sharedSelectorSuffix: ':hover',
            requiresAdoption: false,
            convergedThemeProperties: ['background'],
            surface: 'html',
            participants: ['dm'],
            fullyRemoved: ['dm'],
        },
    ];
    const pseudoShapeErrors = [];
    assert.equal(verifyExtractionShape(pseudoState, pseudoShapeErrors), true);
    assert.deepEqual(pseudoShapeErrors, []);
    writeFileSync(join(root, 'demo.html'), '<div class="dm-panel game-panel"></div>\n');
    const pseudoAdoptionErrors = [];
    verifyExtractionAdoption(root, pseudoState, pseudoAdoptionErrors);
    assert.deepEqual(pseudoAdoptionErrors, []);

    const zeroSpecificityState = clone(pseudoState);
    zeroSpecificityState.components[1].sharedClassSpecificity = 'zero';
    const zeroSpecificityErrors = [];
    assert.equal(verifyExtractionShape(zeroSpecificityState, zeroSpecificityErrors), true);
    assert.deepEqual(zeroSpecificityErrors, []);

    const invalidZeroSpecificity = clone(extraction);
    invalidZeroSpecificity.components[0].sharedClassSpecificity = 'zero';
    const invalidZeroSpecificityErrors = [];
    assert.equal(verifyExtractionShape(invalidZeroSpecificity, invalidZeroSpecificityErrors), false);
    assert.ok(invalidZeroSpecificityErrors.some(error =>
        /zero shared-class specificity is only valid for a state selector/.test(error)));

    const mismatchedState = clone(pseudoState);
    mismatchedState.components[1].sharedSelectorSuffix = ':disabled';
    const mismatchedStateErrors = [];
    assert.equal(verifyExtractionShape(mismatchedState, mismatchedStateErrors), false);
    assert.ok(mismatchedStateErrors.some(error =>
        /local and shared selector suffixes must match/.test(error)));

    const standaloneState = clone(pseudoState);
    standaloneState.components = [standaloneState.components[1]];
    const standaloneShapeErrors = [];
    assert.equal(verifyExtractionShape(standaloneState, standaloneShapeErrors), false);
    assert.ok(standaloneShapeErrors.some(error =>
        /requiresAdoption:false state requires a validated unsuffixed component/.test(error)));
    const standaloneAdoptionErrors = [];
    verifyExtractionAdoption(root, standaloneState, standaloneAdoptionErrors);
    assert.ok(standaloneAdoptionErrors.some(error =>
        /skipped adoption state requires a validated unsuffixed component/.test(error)));

    const invalidConvergence = clone(extraction);
    invalidConvergence.components[0].convergedThemeProperties = ['padding'];
    const invalidConvergenceErrors = [];
    assert.equal(verifyExtractionShape(invalidConvergence, invalidConvergenceErrors), false);
    assert.ok(invalidConvergenceErrors.some(error =>
        /unreviewed theme convergence property padding/.test(error)));

    const invalidSkippedAdoption = clone(extraction);
    invalidSkippedAdoption.components[0].requiresAdoption = false;
    const invalidSkippedAdoptionErrors = [];
    assert.equal(verifyExtractionShape(invalidSkippedAdoption, invalidSkippedAdoptionErrors), false);
    assert.ok(invalidSkippedAdoptionErrors.some(error =>
        /requiresAdoption:false is only valid for a state selector/.test(error)));

    const validRetirementShape = clone(extraction);
    validRetirementShape.retiredCustomProperties = {
        dm: {
            properties: ['--dm-panel-bg'],
            expectedRemovedDefinitions: 2,
        },
    };
    const validRetirementShapeErrors = [];
    assert.equal(verifyExtractionShape(validRetirementShape, validRetirementShapeErrors), true);
    assert.deepEqual(validRetirementShapeErrors, []);

    const invalidRetirementShape = clone(validRetirementShape);
    invalidRetirementShape.retiredCustomProperties.dm.properties.push('padding');
    const invalidRetirementShapeErrors = [];
    assert.equal(verifyExtractionShape(invalidRetirementShape, invalidRetirementShapeErrors), false);
    assert.ok(invalidRetirementShapeErrors.some(error =>
        /retired custom property for dm must start with --/.test(error)));

    const retirementBase = new Map([[
        'css/demo.css',
        parseCssText(
            ':root{--dm-panel-bg:red;color:black}'
                + ':root[data-theme="light"]{--dm-panel-bg:white;color:black}',
            'css/demo.css',
        ),
    ]]);
    const retirementCurrent = new Map([[
        'css/demo.css',
        parseCssText(
            ':root{color:black}:root[data-theme="light"]{color:black}',
            'css/demo.css',
        ),
    ]]);
    const catalogMap = parsed => new Map([...parsed]
        .map(([path, value]) => [path, indexRuleOccurrences(value, path)]));
    const retirementErrors = [];
    const retirementExternal = { base: [], current: [] };
    verifyRetiredCustomProperties(
        validRetirementShape, retirementCurrent, retirementBase,
        catalogMap(retirementCurrent), catalogMap(retirementBase),
        retirementExternal, retirementErrors,
    );
    assert.deepEqual(retirementErrors, []);
    assert.equal(retirementExternal.base.length, 2);
    assert.equal(retirementExternal.current.length, 2);

    const wrongRetirementCount = clone(validRetirementShape);
    wrongRetirementCount.retiredCustomProperties.dm.expectedRemovedDefinitions = 1;
    const wrongRetirementCountErrors = [];
    verifyRetiredCustomProperties(
        wrongRetirementCount, retirementCurrent, retirementBase,
        catalogMap(retirementCurrent), catalogMap(retirementBase),
        { base: [], current: [] }, wrongRetirementCountErrors,
    );
    assert.ok(wrongRetirementCountErrors.some(error =>
        /base contains 2 retired declaration occurrence\(s\), expected 1/.test(error)));

    const consumerCurrent = new Map(retirementCurrent);
    consumerCurrent.set(
        'css/consumer.css',
        parseCssText('.consumer{background:var(--dm-panel-bg)}', 'css/consumer.css'),
    );
    const consumerErrors = [];
    verifyCurrentRetiredCustomProperties(validRetirementShape, consumerCurrent, consumerErrors);
    assert.ok(consumerErrors.some(error => /still has a CSS consumer/.test(error)));

    const redefinedCurrent = new Map(retirementCurrent);
    redefinedCurrent.set(
        'css/reintroduced.css',
        parseCssText(':root{--dm-panel-bg:purple}', 'css/reintroduced.css'),
    );
    const redefinedErrors = [];
    verifyCurrentRetiredCustomProperties(validRetirementShape, redefinedCurrent, redefinedErrors);
    assert.ok(redefinedErrors.some(error => /was redefined in current CSS/.test(error)));

    const changedThemeCurrent = new Map([[
        'css/demo.css',
        parseCssText(
            ':root{color:blue}:root[data-theme="light"]{color:black}',
            'css/demo.css',
        ),
    ]]);
    const changedThemeErrors = [];
    verifyRetiredCustomProperties(
        validRetirementShape, changedThemeCurrent, retirementBase,
        catalogMap(changedThemeCurrent), catalogMap(retirementBase),
        { base: [], current: [] }, changedThemeErrors,
    );
    assert.ok(changedThemeErrors.some(error =>
        /theme rule changed beyond the declared custom-property retirements/.test(error)));

    const validSelectorPrune = clone(extraction);
    validSelectorPrune.reviewedSelectorPrunes = [{
        prefix: 'dm',
        baseSelector: '.dm-mode-daily, .dm-panel',
        currentSelector: '.dm-mode-daily',
        reason: 'panel moved to the shared family',
    }];
    const validSelectorPruneErrors = [];
    assert.equal(verifyExtractionShape(validSelectorPrune, validSelectorPruneErrors), true);
    assert.deepEqual(validSelectorPruneErrors, []);

    const invalidSelectorPrune = clone(validSelectorPrune);
    invalidSelectorPrune.reviewedSelectorPrunes[0].currentSelector = '.dm-other';
    const invalidSelectorPruneErrors = [];
    assert.equal(verifyExtractionShape(invalidSelectorPrune, invalidSelectorPruneErrors), false);
    assert.ok(invalidSelectorPruneErrors.some(error =>
        /must remove selectors without adding or rewriting survivors/.test(error)));

    const projectedDebtErrors = [];
    const projectedDebt = applyReviewedSelectorPrunesToDebt(
        [['css/demo.css', '', '.dm-mode-daily, .dm-panel']],
        [validSelectorPrune],
        projectedDebtErrors,
    );
    assert.deepEqual(projectedDebtErrors, []);
    assert.deepEqual(projectedDebt, [['css/demo.css', '', '.dm-mode-daily']]);

    const missingDebtErrors = [];
    applyReviewedSelectorPrunesToDebt(
        [['css/demo.css', '', '.dm-unrelated']],
        [validSelectorPrune],
        missingDebtErrors,
    );
    assert.ok(missingDebtErrors.some(error =>
        /immutable P0 debt must contain exactly one reviewed base selector tuple/.test(error)));

    const validNarrowing = clone(extraction);
    validNarrowing.reviewedSelectorNarrowings = [{
        path: 'css/showcase.css',
        layer: 'components',
        excludedClass: 'game-panel',
        baseSelector: '.showcase .game-icon:hover, .showcase .game-btn:hover',
        currentSelector: '.showcase .game-icon:hover, .showcase .game-btn:not(.game-panel):hover',
        reason: 'shared panel keeps its own hover surface',
    }];
    const validNarrowingErrors = [];
    assert.equal(verifyExtractionShape(validNarrowing, validNarrowingErrors), true);
    assert.deepEqual(validNarrowingErrors, []);

    for (const [currentSelector, why] of [
        ['.showcase .game-icon:hover, .showcase .game-btn:not(.game-row):hover', 'excludes another class'],
        ['.showcase .game-btn:not(.game-panel):hover', 'drops a selector'],
        ['.showcase .game-icon:hover, .showcase .game-btn:not(.game-panel):focus', 'rewrites the state'],
        ['.showcase .game-icon:hover, .showcase .game-btn:hover', 'narrows nothing'],
    ]) {
        const rewritten = clone(validNarrowing);
        rewritten.reviewedSelectorNarrowings[0].currentSelector = currentSelector;
        const rewrittenErrors = [];
        assert.equal(verifyExtractionShape(rewritten, rewrittenErrors), false, why);
        assert.ok(rewrittenErrors.some(error => /must only insert :not\(\.game-panel\)/.test(error)), why);
    }

    const foreignNarrowing = clone(validNarrowing);
    foreignNarrowing.reviewedSelectorNarrowings[0].excludedClass = 'game-foreign';
    foreignNarrowing.reviewedSelectorNarrowings[0].currentSelector =
        '.showcase .game-icon:hover, .showcase .game-btn:not(.game-foreign):hover';
    const foreignNarrowingErrors = [];
    assert.equal(verifyExtractionShape(foreignNarrowing, foreignNarrowingErrors), false);
    assert.ok(foreignNarrowingErrors.some(error =>
        /may only exclude a sharedClass owned by this extraction/.test(error)));

    const narrowedImportantErrors = [];
    const narrowedImportant = applyReviewedSelectorNarrowingsToImportant(
        [
            ['css/showcase.css', '', '.showcase .game-icon:hover, .showcase .game-btn:hover', 'background', 'red !important'],
            ['css/showcase.css', '', '.showcase .other', 'color', 'red !important'],
        ],
        [validNarrowing],
        narrowedImportantErrors,
    );
    assert.deepEqual(narrowedImportantErrors, []);
    assert.deepEqual(narrowedImportant, [
        ['css/showcase.css', '', '.showcase .game-icon:hover, .showcase .game-btn:not(.game-panel):hover', 'background', 'red !important'],
        ['css/showcase.css', '', '.showcase .other', 'color', 'red !important'],
    ]);

    const missingImportantErrors = [];
    applyReviewedSelectorNarrowingsToImportant(
        [['css/showcase.css', '', '.showcase .other', 'color', 'red !important']],
        [validNarrowing],
        missingImportantErrors,
    );
    assert.ok(missingImportantErrors.some(error =>
        /no declaration under the reviewed base selector/.test(error)));

    const decl = (property, value) => ({ property, value, important: false });
    const fallbackSource = { migrationDeclarations: [
        decl('color', 'white'),
        decl('background', 'red'),
        decl('background', 'linear-gradient(red, blue)'),
    ] };
    for (const converged of [[], ['background']]) {
        const partialChainErrors = [];
        const partialResidual = expectedResidual(
            fallbackSource,
            { migrationDeclarations: [decl('background', 'linear-gradient(red, blue)')] },
            partialChainErrors, 'fallback', [], converged,
        );
        assert.ok(partialChainErrors.some(error => /may not break the fallback chain for background/.test(error)),
            'exact match of one chain member must not pass (converged=' + converged + ')');
        assert.ok(partialResidual.some(item => item.value === 'red'));
    }
    // The reverse direction: a shared chain longer than the source would consume the
    // source value with its first member and then introduce a new winning value.
    const singleSource = { migrationDeclarations: [decl('color', 'white'), decl('background', 'red')] };
    for (const converged of [[], ['background']]) {
        const extendedChainErrors = [];
        expectedResidual(
            singleSource,
            { migrationDeclarations: [decl('background', 'red'), decl('background', 'blue')] },
            extendedChainErrors, 'fallback', [], converged,
        );
        assert.ok(extendedChainErrors.some(error => /may not break the fallback chain for background/.test(error)),
            'a shared chain the source does not carry must not pass (converged=' + converged + ')');
    }
    const wholeChainErrors = [];
    const wholeChainResidual = expectedResidual(
        fallbackSource,
        { migrationDeclarations: [decl('background', 'red'), decl('background', 'linear-gradient(red, blue)')] },
        wholeChainErrors, 'fallback',
    );
    assert.deepEqual(wholeChainErrors, []);
    assert.deepEqual(wholeChainResidual, [decl('color', 'white')]);

    const sizedSource = { migrationDeclarations: [
        decl('font-size', '15px'), decl('padding', '12px 20px'), decl('backdrop-filter', 'blur(8px)'),
    ] };
    const sizedShared = { migrationDeclarations: [decl('font-size', '14.5px'), decl('padding', '11px 18px')] };
    const keptSizeErrors = [];
    assert.deepEqual(expectedResidual(sizedSource, sizedShared, keptSizeErrors, 'size'),
        sizedSource.migrationDeclarations, 'without convergence the page size stays as a residual');
    const convergedSizeErrors = [];
    assert.deepEqual(expectedResidual(
        sizedSource, sizedShared, convergedSizeErrors, 'size', [], [],
        ['font-size', 'padding', 'backdrop-filter'],
    ), []);
    assert.deepEqual(convergedSizeErrors, []);
    const layoutConvergenceErrors = [];
    expectedResidual(
        { migrationDeclarations: [decl('width', '200px')] }, { migrationDeclarations: [] },
        layoutConvergenceErrors, 'layout', [], [], ['width'],
    );
    assert.ok(layoutConvergenceErrors.some(error => /participant convergence property width is not reviewed/.test(error)));
    const staleConvergenceErrors = [];
    expectedResidual(sizedSource, sizedShared, staleConvergenceErrors, 'stale', [], [], ['border-radius']);
    assert.ok(staleConvergenceErrors.some(error => /border-radius is stale/.test(error)));

    const convergenceShape = clone(extraction);
    convergenceShape.components[0].participantConvergedProperties = { dm: ['width'] };
    const convergenceShapeErrors = [];
    assert.equal(verifyExtractionShape(convergenceShape, convergenceShapeErrors), false);
    assert.ok(convergenceShapeErrors.some(error => /reviewed theme\/geometry properties/.test(error)));

    const validRetirement = clone(extraction);
    validRetirement.reviewedRuleRetirements = [{
        prefix: 'dm', context: '@media (width <= 480px)', selector: '.dm-btn', reason: 'shared size',
    }];
    const validRetirementErrors = [];
    assert.equal(verifyExtractionShape(validRetirement, validRetirementErrors), true);
    assert.deepEqual(validRetirementErrors, []);
    const foreignRetirement = clone(validRetirement);
    foreignRetirement.reviewedRuleRetirements[0].selector = '.dm-btn, .game-action-btn';
    const foreignRetirementErrors = [];
    assert.equal(verifyExtractionShape(foreignRetirement, foreignRetirementErrors), false);
    assert.ok(foreignRetirementErrors.some(error => /may only remove dm-prefixed page selectors/.test(error)));

    // ── leaderboard-v2: visual dimensions, adopting shared-only geometry, reviewed layout ──
    // W4b: no unlayered title background shorthand may reset a layered clip.
    const titleSource = { migrationDeclarations: [
        decl('font-size', '34px'), decl('background', 'linear-gradient(red, blue)'),
    ] };
    const titleShared = { migrationDeclarations: [decl('font-size', '34px')] };
    const approvedGradient = [{ from: 'background', to: 'background-image', reason: 'preserve clipping' }];
    const gradientErrors = [];
    assert.deepEqual(expectedResidual(
        titleSource, titleShared, gradientErrors, 'title', [], [], [], [], approvedGradient,
    ), [decl('background-image', 'linear-gradient(red, blue)')]);
    assert.deepEqual(gradientErrors, []);

    const tokenErrors = [];
    assert.deepEqual(expectedResidual(
        { migrationDeclarations: [decl('background', 'var(--cb-title-bg)')] },
        { migrationDeclarations: [] }, tokenErrors, 'title', [], [], [], [], approvedGradient,
    ), [decl('background-image', 'var(--cb-title-bg)')]);
    assert.deepEqual(tokenErrors, []);

    const unsafeErrors = [];
    expectedResidual(
        { migrationDeclarations: [decl('background', 'red')] },
        { migrationDeclarations: [] }, unsafeErrors, 'title', [], [], [], [], approvedGradient,
    );
    assert.ok(unsafeErrors.some(error => /requires a non-important gradient-only/.test(error)));

    const missingErrors = [];
    expectedResidual(
        { migrationDeclarations: [decl('color', 'red')] },
        { migrationDeclarations: [] }, missingErrors, 'title', [], [], [], [], approvedGradient,
    );
    assert.ok(missingErrors.some(error => /background is missing, ambiguous/.test(error)));

    const approvedShape = clone(extraction);
    approvedShape.components[0].suffix = 'title';
    approvedShape.components[0].sharedClass = 'game-start-title';
    approvedShape.components[0].participantResidualRewrites = {
        dm: [{ from: 'background', to: 'background-image', reason: 'preserve clipping' }],
    };
    const approvedShapeErrors = [];
    assert.equal(verifyExtractionShape(approvedShape, approvedShapeErrors), true);
    assert.deepEqual(approvedShapeErrors, []);

    const invalidTarget = clone(approvedShape);
    invalidTarget.components[0].participantResidualRewrites.dm[0].to = 'color';
    const invalidTargetErrors = [];
    assert.equal(verifyExtractionShape(invalidTarget, invalidTargetErrors), false);
    assert.ok(invalidTargetErrors.some(error => /reviewed background to background-image/.test(error)));

    const wrongFamily = clone(approvedShape);
    wrongFamily.components[0].sharedClass = 'game-other';
    const wrongFamilyErrors = [];
    assert.equal(verifyExtractionShape(wrongFamily, wrongFamilyErrors), false);
    assert.ok(wrongFamilyErrors.some(error => /only reviewed for default game-start-title/.test(error)));

    const foreignRewrite = clone(approvedShape);
    foreignRewrite.components[0].participantResidualRewrites = {
        other: [{ from: 'background', to: 'background-image', reason: 'foreign' }],
    };
    const foreignErrors = [];
    assert.equal(verifyExtractionShape(foreignRewrite, foreignErrors), false);
    assert.ok(foreignErrors.some(error => /residual rewrite references non-participant other/.test(error)));

    const dimensionSource = { migrationDeclarations: [decl('max-width', '340px'), decl('color', 'red')] };
    const dimensionShared = { migrationDeclarations: [decl('max-width', '330px'), decl('margin-bottom', '8px')] };
    const inventedErrors = [];
    expectedResidual(dimensionSource, dimensionShared, inventedErrors, 'dims', [], [], ['max-width']);
    assert.ok(inventedErrors.some(error => /shared property margin-bottom did not exist in the local source/.test(error)),
        'a shared-only property is still "invented geometry" unless the participant converges it');
    const adoptedErrors = [];
    assert.deepEqual(expectedResidual(
        dimensionSource, dimensionShared, adoptedErrors, 'dims', [], [], ['max-width', 'margin-bottom'],
    ), [decl('color', 'red')]);
    assert.deepEqual(adoptedErrors, []);
    const neitherErrors = [];
    expectedResidual(dimensionSource, dimensionShared, neitherErrors, 'dims', [], [], ['min-height']);
    assert.ok(neitherErrors.some(error => /min-height is stale because neither/.test(error)));

    const layoutSource = { migrationDeclarations: [decl('display', 'flex'), decl('gap', '6px')] };
    const layoutAsGeometryErrors = [];
    expectedResidual(layoutSource, { migrationDeclarations: [] }, layoutAsGeometryErrors, 'layout', [], [], ['display']);
    assert.ok(layoutAsGeometryErrors.some(error => /participant convergence property display is not reviewed/.test(error)),
        'display stays protected in the geometry whitelist');
    const layoutErrors = [];
    assert.deepEqual(expectedResidual(
        layoutSource, { migrationDeclarations: [] }, layoutErrors, 'layout', [], [], ['gap'], ['display'],
    ), []);
    assert.deepEqual(layoutErrors, []);
    const positionErrors = [];
    expectedResidual({ migrationDeclarations: [decl('position', 'absolute')] }, { migrationDeclarations: [] },
        positionErrors, 'layout', [], [], [], ['position']);
    assert.ok(positionErrors.some(error => /participant layout convergence property position is not reviewed/.test(error)));

    const layoutShape = clone(extraction);
    layoutShape.components[0].participantLayoutConvergence = { dm: { properties: ['display'], reason: 'standard flow' } };
    const layoutShapeErrors = [];
    assert.equal(verifyExtractionShape(layoutShape, layoutShapeErrors), true);
    assert.deepEqual(layoutShapeErrors, []);
    for (const [mutate, expected, why] of [
        [entry => { entry.dm.reason = ' '; }, /layout convergence for dm requires a reason/, 'missing reason'],
        [entry => { entry.dm.properties = ['position']; }, /list of reviewed layout properties/, 'unreviewed layout property'],
        [entry => { entry.dm.properties = ['display', 'display']; }, /list of reviewed layout properties/, 'duplicate property'],
        [entry => { entry.other = entry.dm; }, /layout convergence references non-participant other/, 'non-participant'],
    ]) {
        const candidate = clone(layoutShape);
        mutate(candidate.components[0].participantLayoutConvergence);
        const candidateErrors = [];
        assert.equal(verifyExtractionShape(candidate, candidateErrors), false, why);
        assert.ok(candidateErrors.some(error => expected.test(error)), why);
    }

    // Already-adopted participants: only residual declarations may be dropped.
    const residualRule = { migrationDeclarations: [decl('display', 'flex'), decl('padding', '13px'), decl('color', 'red')] };
    const convergedErrors = [];
    assert.deepEqual(expectedConvergedResidual(residualRule, convergedErrors, 'adopted', ['padding'], ['display']),
        [decl('color', 'red')]);
    assert.deepEqual(convergedErrors, []);
    const staleAdoptedErrors = [];
    expectedConvergedResidual(residualRule, staleAdoptedErrors, 'adopted', ['max-width']);
    assert.ok(staleAdoptedErrors.some(error => /max-width is stale because the already-adopted residual never wrote it/.test(error)));
    const noopErrors = [];
    expectedConvergedResidual(residualRule, noopErrors, 'adopted');
    assert.ok(noopErrors.some(error => /already-adopted participant converges nothing/.test(error)));
    const protectedErrors = [];
    expectedConvergedResidual(residualRule, protectedErrors, 'adopted', ['display']);
    assert.ok(protectedErrors.some(error => /participant convergence property display is not reviewed/.test(error)));

    // `extends`: reference an earlier family instead of creating shared rules.
    const rootFamily = { ...clone(extraction), id: 'family-v1', sharedStylesheet: 'css/layout.css', sharedLayer: 'components' };
    rootFamily.components[1].participants = ['dm'];
    const extension = {
        ...clone(extraction), id: 'family-v2', extends: 'family-v1',
        sharedStylesheet: 'css/layout.css', sharedLayer: 'components',
    };
    extension.games.dn = { css: 'css/dn.css', html: 'dn.html', runtime: 'src/games/dn/runtime.js' };
    extension.components = [clone(rootFamily.components[0])];
    extension.components[0].participants = ['dn'];
    const later = { ...clone(extension), id: 'family-v3' };
    later.components[0].participants = ['dm', 'dn'];
    const extensionErrors = [];
    const adopted = resolveFamilyExtension(later, [rootFamily, extension, later], extensionErrors);
    assert.deepEqual(extensionErrors, []);
    assert.deepEqual([...adopted.values()][0], new Set(['dm', 'dn']),
        'participants adopted by the root family or an earlier extension count as already adopted');
    assert.equal(resolveFamilyExtension(rootFamily, [rootFamily], []), null);
    const chained = { ...clone(later), extends: 'family-v2' };
    const relayered = { ...clone(extension), sharedLayer: 'pages' };
    for (const [ordered, candidate, expected, why] of [
        [[extension, rootFamily], extension, /must be an earlier ledger entry/, 'root after extension'],
        [[rootFamily, extension, chained], chained,
            /extend the root family family-v1, not another extension/, 'extension of an extension'],
        [[rootFamily, relayered], relayered, /shared stylesheet\/layer must match/, 'different layer'],
    ]) {
        const caseErrors = [];
        resolveFamilyExtension(candidate, ordered, caseErrors);
        assert.ok(caseErrors.some(error => expected.test(error)), why);
    }
    const foreignComponent = clone(extension);
    foreignComponent.components[0].sharedClass = 'game-other';
    const foreignComponentErrors = [];
    resolveFamilyExtension(foreignComponent, [rootFamily, foreignComponent], foreignComponentErrors);
    assert.ok(foreignComponentErrors.some(error => /extension components must match a component of family-v1/.test(error)));
    const selfExtension = { ...clone(extension), extends: 'family-v2' };
    const selfExtensionErrors = [];
    assert.equal(verifyExtractionShape(selfExtension, selfExtensionErrors), false);
    assert.ok(selfExtensionErrors.some(error => /extends must name another family extraction id/.test(error)));

    // Whole-rule retirement of a layout declaration needs reviewedLayoutProperties.
    const parsedMap = (path, css) => new Map([[path, parseCssText(css, path)]]);
    const scrollbarBase = parsedMap('css/demo.css', '.dm-list::-webkit-scrollbar{display:none}.dm-x{color:red}');
    const scrollbarCurrent = parsedMap('css/demo.css', '.dm-x{color:red}');
    const scrollbarRetirement = clone(extraction);
    scrollbarRetirement.reviewedRuleRetirements = [{
        prefix: 'dm', context: '', selector: '.dm-list::-webkit-scrollbar', reason: 'platform scrollbar',
    }];
    const unreviewedLayoutErrors = [];
    verifyReviewedRuleRetirements(scrollbarRetirement, scrollbarCurrent, scrollbarBase,
        catalogMap(scrollbarBase), { base: [], current: [] }, unreviewedLayoutErrors);
    assert.ok(unreviewedLayoutErrors.some(error => /retired rule carries non-theme\/geometry declarations \(display\)/.test(error)));
    scrollbarRetirement.reviewedRuleRetirements[0].reviewedLayoutProperties = ['display'];
    const reviewedLayoutShapeErrors = [];
    assert.equal(verifyExtractionShape(scrollbarRetirement, reviewedLayoutShapeErrors), true);
    const reviewedLayoutErrors = [];
    verifyReviewedRuleRetirements(scrollbarRetirement, scrollbarCurrent, scrollbarBase,
        catalogMap(scrollbarBase), { base: [], current: [] }, reviewedLayoutErrors);
    assert.deepEqual(reviewedLayoutErrors, []);
    const staleLayoutRetirement = clone(scrollbarRetirement);
    staleLayoutRetirement.reviewedRuleRetirements[0].reviewedLayoutProperties = ['display', 'outline'];
    const staleLayoutErrors = [];
    verifyReviewedRuleRetirements(staleLayoutRetirement, scrollbarCurrent, scrollbarBase,
        catalogMap(scrollbarBase), { base: [], current: [] }, staleLayoutErrors);
    assert.ok(staleLayoutErrors.some(error => /reviewed layout property outline is stale/.test(error)));
    const badLayoutShape = clone(scrollbarRetirement);
    badLayoutShape.reviewedRuleRetirements[0].reviewedLayoutProperties = ['position'];
    const badLayoutShapeErrors = [];
    assert.equal(verifyExtractionShape(badLayoutShape, badLayoutShapeErrors), false);
    assert.ok(badLayoutShapeErrors.some(error => /reviewedLayoutProperties must be a non-empty/.test(error)));

    // Declaration retirement: a surviving page rule sheds only the reviewed declarations.
    const headBase = parsedMap('css/demo.css', '.dm-head{display:flex;align-items:center;margin-bottom:8px}');
    const declarationRetirement = clone(extraction);
    declarationRetirement.reviewedDeclarationRetirements = [{
        prefix: 'dm', context: '', selector: '.dm-head', properties: ['margin-bottom'], reason: 'shared title margin',
    }];
    const declarationShapeErrors = [];
    assert.equal(verifyExtractionShape(declarationRetirement, declarationShapeErrors), true);
    assert.deepEqual(declarationShapeErrors, []);
    const runDeclarationRetirement = (candidate, currentCss) => {
        const current = parsedMap('css/demo.css', currentCss);
        const caseErrors = [];
        const external = { base: [], current: [] };
        verifyReviewedDeclarationRetirements(candidate, current, headBase,
            catalogMap(current), catalogMap(headBase), external, caseErrors);
        return { caseErrors, external };
    };
    const validDeclaration = runDeclarationRetirement(declarationRetirement, '.dm-head{display:flex;align-items:center}');
    assert.deepEqual(validDeclaration.caseErrors, []);
    assert.equal(validDeclaration.external.base.length, 1);
    assert.equal(validDeclaration.external.current.length, 1);
    assert.ok(runDeclarationRetirement(declarationRetirement, '.dm-head{display:flex}').caseErrors.some(error =>
        /not exactly the base rule minus the retired properties/.test(error)), 'an unlisted layout edit must fail');
    assert.ok(runDeclarationRetirement(declarationRetirement, '.dm-head{display:flex;align-items:center;margin-bottom:8px}')
        .caseErrors.some(error => /not exactly the base rule minus the retired properties/.test(error)),
    'restoring the retired declaration must fail');
    const staleDeclaration = clone(declarationRetirement);
    staleDeclaration.reviewedDeclarationRetirements[0].properties = ['margin-bottom', 'gap'];
    assert.ok(runDeclarationRetirement(staleDeclaration, '.dm-head{display:flex;align-items:center}')
        .caseErrors.some(error => /retired property gap is stale/.test(error)));
    const everythingDeclaration = clone(declarationRetirement);
    everythingDeclaration.reviewedDeclarationRetirements[0].selector = '.dm-only';
    everythingDeclaration.reviewedDeclarationRetirements[0].properties = ['margin-bottom'];
    {
        const base = parsedMap('css/demo.css', '.dm-only{margin-bottom:8px}');
        const current = parsedMap('css/demo.css', '.dm-only{}');
        const caseErrors = [];
        verifyReviewedDeclarationRetirements(everythingDeclaration, current, base,
            catalogMap(current), catalogMap(base), { base: [], current: [] }, caseErrors);
        assert.ok(caseErrors.some(error => /register a whole-rule retirement instead/.test(error)));
    }
    const layoutDeclaration = clone(declarationRetirement);
    Object.assign(layoutDeclaration.reviewedDeclarationRetirements[0], {
        selector: '.dm-input:focus', properties: ['outline'], reviewedLayoutProperties: ['outline'],
    });
    const layoutDeclarationShapeErrors = [];
    assert.equal(verifyExtractionShape(layoutDeclaration, layoutDeclarationShapeErrors), true);
    assert.deepEqual(layoutDeclarationShapeErrors, []);
    {
        const base = parsedMap('css/demo.css', '.dm-input:focus{outline:none;border-color:red}');
        const current = parsedMap('css/demo.css', '.dm-input:focus{border-color:red}');
        const caseErrors = [];
        verifyReviewedDeclarationRetirements(layoutDeclaration, current, base,
            catalogMap(current), catalogMap(base), { base: [], current: [] }, caseErrors);
        assert.deepEqual(caseErrors, []);
    }
    for (const [mutate, expected, why] of [
        [entry => { entry.selector = '.dm-head, .game-lb-title'; }, /may only edit dm-prefixed page selectors/, 'foreign selector'],
        [entry => { entry.properties = ['display']; }, /reviewed theme\/geometry properties/, 'layout property'],
        [entry => { entry.properties = ['margin-bottom']; entry.reviewedLayoutProperties = ['display']; },
            /also listed in properties/, 'reviewed layout property not retired'],
        [entry => { entry.properties = ['position']; entry.reviewedLayoutProperties = ['position']; },
            /reviewedLayoutProperties must be a non-empty/, 'unreviewed layout property'],
        [entry => { entry.reason = ''; }, /declaration retirement requires a reason/, 'missing reason'],
    ]) {
        const candidate = clone(declarationRetirement);
        mutate(candidate.reviewedDeclarationRetirements[0]);
        const candidateErrors = [];
        assert.equal(verifyExtractionShape(candidate, candidateErrors), false, why);
        assert.ok(candidateErrors.some(error => expected.test(error)), why);
    }

    const duplicateIdentity = clone(extraction);
    duplicateIdentity.components.push(clone(duplicateIdentity.components[0]));
    const duplicateIdentityErrors = [];
    assert.equal(verifyExtractionShape(duplicateIdentity, duplicateIdentityErrors), false);
    assert.ok(duplicateIdentityErrors.some(error => /duplicate component suffix panel/.test(error)));
    assert.ok(duplicateIdentityErrors.some(error =>
        /duplicate sharedClass selector \.game-panel/.test(error)));
} finally {
    rmSync(root, { recursive: true, force: true });
}

console.log('PASS persisted CSS family entries continuously enforce adoption and retired-token invariants');
