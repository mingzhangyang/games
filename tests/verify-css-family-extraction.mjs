#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseCssText } from './lib/css/baseline-adapter.mjs';
import {
    verifyExtractionAdoption, verifyExtractionShape, verifyRetiredCustomProperties,
} from './lib/css/family-extraction.mjs';
import { indexRuleOccurrences } from './lib/css/migration-contract.mjs';

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


    const shapeCases = [
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
    verifyRetiredCustomProperties(
        validRetirementShape, consumerCurrent, retirementBase,
        catalogMap(consumerCurrent), catalogMap(retirementBase),
        { base: [], current: [] }, consumerErrors,
    );
    assert.ok(consumerErrors.some(error => /still has a CSS consumer/.test(error)));

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

    const duplicateIdentity = clone(extraction);
    duplicateIdentity.components.push(clone(duplicateIdentity.components[0]));
    const duplicateIdentityErrors = [];
    assert.equal(verifyExtractionShape(duplicateIdentity, duplicateIdentityErrors), false);
    assert.ok(duplicateIdentityErrors.some(error => /duplicate component suffix panel/.test(error)));
    assert.ok(duplicateIdentityErrors.some(error => /duplicate sharedClass game-panel/.test(error)));
} finally {
    rmSync(root, { recursive: true, force: true });
}

console.log('PASS persisted CSS family entries continuously enforce HTML/runtime shared-class adoption');
