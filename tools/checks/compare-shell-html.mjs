#!/usr/bin/env node
// One-time Step 6a migration proof. Compare complete parsed pages with a pinned
// git baseline; do not retain a second copy of page markup as permanent fixtures.
// Usage: node tools/checks/compare-shell-html.mjs <pre-migration-commit-sha>
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';
import { registry } from '../lib/registry.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = process.argv[2];
if (!BASE || !/^[0-9a-f]{40}$/i.test(BASE)) {
    console.error('usage: node tools/checks/compare-shell-html.mjs <40-char-base-sha>');
    process.exit(2);
}
const oldFile = name => execFileSync('git', ['show', BASE + ':' + name], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
});
const newFile = name => readFileSync(join(ROOT, name), 'utf8');
const PRESERVE_SPACE = new Set(['pre', 'textarea', 'script', 'style', 'text', 'tspan']);

// Keep ordered attributes (including SVG namespaces), doctype, template content
// and meaningful text. Only comments and newline indentation are ignored; a
// literal space between inline elements and whitespace in pre/raw text survive.
function normalize(node, preserveSpace = false) {
    if (node.nodeName === '#comment') return null;
    if (node.nodeName === '#text') {
        if (!preserveSpace && !node.value.trim() && /[\r\n]/.test(node.value)) return null;
        return ['#text', node.value];
    }
    if (node.nodeName === '#documentType') {
        return ['#documentType', node.name, node.publicId, node.systemId];
    }
    const attributes = (node.attrs || []).map(a => [a.name, a.value, a.namespace || '', a.prefix || '']);
    const keepSpace = preserveSpace || PRESERVE_SPACE.has(node.tagName)
        || attributes.some(([name, value, , prefix]) => prefix === 'xml' && name === 'space' && value === 'preserve');
    const children = (node.content?.childNodes || node.childNodes || [])
        .map(child => normalize(child, keepSpace)).filter(child => child !== null);
    return [node.nodeName, node.namespaceURI || '', attributes, children];
}
const canonical = html => JSON.stringify(normalize(parse(html)));

// Counterexamples ensure that the comparison does not hide a lost caption,
// changed SVG attribute or meaningful whitespace while removing indentation.
assert.equal(canonical('<main>\n    <p>Hi</p>\n</main>'), canonical('<main><p>Hi</p></main>'));
for (const [before, after] of [
    ['<p>Help</p>', '<p>Stats</p>'],
    ['<svg><path d="M0 0"/></svg>', '<svg><path d="M1 1"/></svg>'],
    ['<span>A</span> <b>B</b>', '<span>A</span><b>B</b>'],
    ['<pre>\n </pre>', '<pre></pre>'],
    ['<template><button disabled>Play</button></template>', '<template><button>Play</button></template>'],
]) assert.notEqual(canonical(before), canonical(after), 'DOM comparison must detect meaningful changes');

const games = registry.withCap('topbar');
const baselineGames = JSON.parse(oldFile('games.config.json')).games;
assert.deepEqual(games.map(g => g.id), baselineGames.filter(g => g.caps?.includes('topbar')).map(g => g.id),
    'Step 6a must compare every baseline topbar page without adding or skipping games');
let failures = 0;
for (const game of games) {
    const before = canonical(oldFile(game.href));
    const after = canonical(newFile(game.href));
    if (before === after) {
        console.log('PASS ' + game.href + ' — complete parsed DOM identical');
        continue;
    }
    let at = 0;
    while (at < before.length && before[at] === after[at]) at++;
    console.error('FAIL ' + game.href + ': first DOM difference at ' + at);
    console.error('  before: ' + before.slice(Math.max(0, at - 60), at + 180));
    console.error('  after:  ' + after.slice(Math.max(0, at - 60), at + 180));
    failures++;
}
const exempt = ['index.html', ...baselineGames.filter(g => !g.caps?.includes('topbar')).map(g => g.href)];
for (const href of exempt) {
    assert.equal(newFile(href), oldFile(href), href + ' must remain byte-identical outside Step 6a');
}
console.log('Chrome Step 6a: ' + (games.length - failures) + '/' + games.length
    + ' complete parsed pages identical; ' + exempt.length + ' exempt pages byte-identical.');
process.exit(failures ? 1 : 0);
