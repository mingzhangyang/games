#!/usr/bin/env node
/**
 * Negative fixtures for additive CSS registration: historic P0 stays immutable.
 */
import assert from 'node:assert/strict';
import { stripFeatureLink, FEATURE_LINK } from './lib/css/feature-additions.mjs';

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
console.log('PASS additive scoreboard CSS review contract');
