#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { verifyExtractionAdoption } from './lib/css/family-extraction.mjs';

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
        "const row = document.createElement('div');\nrow.className = 'dm-row game-row';\n",
    );

    const validErrors = [];
    verifyExtractionAdoption(root, extraction, validErrors);
    assert.deepEqual(validErrors, []);

    writeFileSync(join(root, 'demo.html'), '<div class="dm-panel"></div>\n');
    const missingHtmlErrors = [];
    verifyExtractionAdoption(root, extraction, missingHtmlErrors);
    assert.ok(missingHtmlErrors.some(error =>
        /demo\.html does not co-locate \.dm-panel with \.game-panel/.test(error)));

    writeFileSync(join(root, 'demo.html'), '<div class="dm-panel game-panel"></div>\n');
    writeFileSync(
        join(root, 'src/games/demo/runtime.js'),
        "const row = document.createElement('div');\nrow.className = 'dm-row';\n",
    );
    const missingRuntimeErrors = [];
    verifyExtractionAdoption(root, extraction, missingRuntimeErrors);
    assert.ok(missingRuntimeErrors.some(error =>
        /runtime\.js does not assign \.dm-row with \.game-row/.test(error)));
} finally {
    rmSync(root, { recursive: true, force: true });
}

console.log('PASS persisted CSS family entries continuously enforce HTML/runtime shared-class adoption');
