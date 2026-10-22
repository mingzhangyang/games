#!/usr/bin/env node
// One-time Chrome Step 5a audit. Compare the pre-migration HTML at a supplied
// commit SHA against the generated working tree, without preserving old markup
// in fixtures or adding a permanent second source of truth.
//
// Usage: node tools/checks/compare-topbar-html.mjs <pre-migration-commit-sha>
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';
import { registry } from '../lib/registry.mjs';
import { renderTopbar } from '../../src/platform/shell/render-topbar.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = process.argv[2];
if (!BASE || !/^[0-9a-f]{40}$/i.test(BASE)) {
    console.error('usage: node tools/checks/compare-topbar-html.mjs <40-char-base-sha>');
    process.exit(2);
}
const oldFile = name => execFileSync('git', ['show', BASE + ':' + name], {
    cwd: ROOT, encoding: 'utf8',
});
const newFile = name => readFileSync(join(ROOT, name), 'utf8');

function headerFromFile(html, name) {
    const document = parse(html);
    const headers = [];
    function visit(node) {
        if (node.tagName === 'header'
            && (node.attrs || []).some(a => a.name === 'class'
                && a.value.split(/\s+/).includes('game-topbar'))) headers.push(node);
        for (const child of node.childNodes || []) visit(child);
    }
    visit(document);
    assert.equal(headers.length, 1, name + ': expected exactly one .game-topbar header');
    return headers[0];
}

// Canonicalized DOM outerHTML: ignore formatting-only text nodes and comments,
// preserve every element, ordered attribute name/value and nonempty text. The
// parser also normalizes equivalent HTML entities and foreign SVG markup.
function normalizedOuterHTML(node) {
    if (node.nodeName === '#comment') return '';
    if (node.nodeName === '#text') {
        return node.value.trim() ? JSON.stringify(node.value) : '';
    }
    const attributes = (node.attrs || []).map(a => a.name + '=' + JSON.stringify(a.value));
    return '<' + node.tagName + ' ' + attributes.join(' ') + '>'
        + (node.childNodes || []).map(normalizedOuterHTML).join('')
        + '</' + node.tagName + '>';
}

const games = registry.withCap('topbar');
assert.equal(games.length, 26, 'Step 5a baseline must contain exactly 26 topbar games');
let failures = 0;
for (const game of games) {
    const before = normalizedOuterHTML(headerFromFile(oldFile(game.href), game.id + '/before'));
    const after = normalizedOuterHTML(headerFromFile(newFile(game.href), game.id + '/after'));
    const output = normalizedOuterHTML(headerFromFile(renderTopbar(game), game.id + '/renderer'));
    if (before !== after || after !== output) {
        console.error('FAIL ' + game.href + ': baseline/generated/renderer DOM differ');
        failures++;
    } else {
        console.log('PASS ' + game.href + ' — normalized header outerHTML identical');
    }
}
for (const href of ['index.html', 'math-rain.html', 'tank-battle.html']) {
    assert.equal(newFile(href), oldFile(href), href + ' must remain untouched by Step 5a');
}
console.log('Chrome Step 5a: ' + (games.length - failures) + '/' + games.length
    + ' identical normalized header outerHTML; 3 exemptions unchanged.');
process.exit(failures ? 1 : 0);
