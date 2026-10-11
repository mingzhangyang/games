#!/usr/bin/env node
/**
 * Negative fixtures for additive CSS registration: historic P0 stays immutable.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    stripFeatureLink, FEATURE_LINK, stripMobileFitLink, MOBILE_FIT_LINK, reviewFeatureStyles,
} from './lib/css/feature-additions.mjs';

const page = 'carrot-pull.html';
const valid = '<link rel="stylesheet" href="css/layout.css">\n'
    + FEATURE_LINK + '\n<link rel="stylesheet" href="css/more-games.css">';
let errors = [];
assert.equal(stripFeatureLink(page, valid, errors), valid.replace(FEATURE_LINK, ''));
assert.deepEqual(errors, []);
errors = [];
stripFeatureLink(page, valid + FEATURE_LINK, errors);
assert.ok(errors.some(e => e.includes('exactly one')), 'duplicate feature link must fail');
errors = [];
stripFeatureLink(page, valid.replace(FEATURE_LINK, ''), errors);
assert.ok(errors.some(e => e.includes('exactly one')), 'missing feature link must fail');
errors = [];
stripFeatureLink('gomoku.html', valid, errors);
assert.ok(errors.some(e => e.includes('unauthorized')), 'unregistered page must fail');
errors = [];
stripFeatureLink(page, valid.replace(FEATURE_LINK,
    '<link rel="alternate stylesheet" href="css/scoreboard-dialog.css">'), errors);
assert.ok(errors.some(e => e.includes('canonical')), 'stylesheet link variants cannot bypass review');
errors = [];
stripFeatureLink(page,
    FEATURE_LINK + '\n<link rel="stylesheet" href="css/layout.css">', errors);
assert.ok(errors.some(e => e.includes('must follow layout')), 'cascade link position is guarded');

// PR #135 mobile-fit contract: one canonical link between layout and more-games.
const fit = '<link rel="stylesheet" href="css/layout.css">\n'
    + MOBILE_FIT_LINK + '\n<link rel="stylesheet" href="css/more-games.css">';
errors = [];
assert.equal(stripMobileFitLink('tetris.html', fit, errors), fit.replace(MOBILE_FIT_LINK, ''));
assert.deepEqual(errors, []);
errors = [];
stripMobileFitLink('tetris.html', fit + MOBILE_FIT_LINK, errors);
assert.ok(errors.some(e => e.includes('exactly one')), 'duplicate mobile-fit link must fail');
errors = [];
stripMobileFitLink('tetris.html', fit.replace(MOBILE_FIT_LINK, ''), errors);
assert.ok(errors.some(e => e.includes('exactly one')), 'missing mobile-fit link must fail');
errors = [];
stripMobileFitLink('tetris.html', '<link rel="stylesheet" href="css/more-games.css">\n' + MOBILE_FIT_LINK
    + '\n<link rel="stylesheet" href="css/layout.css">', errors);
assert.ok(errors.some(e => e.includes('must follow layout')), 'mobile-fit cascade position is guarded');

// Stylesheet review: unlayered rules or unreviewed selectors cannot ride along.
function reviewWith(css) {
    const root = mkdtempSync(join(tmpdir(), 'mobile-fit-'));
    mkdirSync(join(root, 'css'));
    writeFileSync(join(root, 'css/scoreboard-dialog.css'), '@layer components { .scoreboard-dialog { color: red; } }');
    writeFileSync(join(root, 'css/mobile-fit.css'), css);
    const found = [];
    reviewFeatureStyles(root, ['css/scoreboard-dialog.css', 'css/mobile-fit.css'], [], found);
    return found;
}
assert.ok(!reviewWith('@layer contracts { .rv-board { width: 1px !important; } }')
    .some(e => e.startsWith('Mobile-fit')), 'reviewed selector inside contracts passes');
assert.ok(reviewWith('.rv-board { width: 1px; }').some(e => e.includes('@layer contracts')),
    'unlayered mobile-fit rule must fail');
assert.ok(reviewWith('@layer contracts { .ms-cell { width: 1px; } }').some(e => e.includes('unreviewed selectors')),
    'unreviewed mobile-fit selector must fail');
console.log('PASS additive scoreboard + mobile-fit CSS review contract');
