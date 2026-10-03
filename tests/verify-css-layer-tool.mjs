#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    renameOuterLayer,
    transformCssFile,
    wrapCssInLayer,
} from '../tools/archive/migrations/apply-css-layers.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baseline = JSON.parse(readFileSync(join(ROOT, 'tests/css-layer-p0-baseline.json'), 'utf8'));
const original = '\uFEFF/* encoding stays */\r\n@charset "UTF-8";\r\n@import url("theme.css");\r\n@namespace svg url("urn:svg");\r\n.rule { content: "}"; color: red; }\r\n';
const wrapped = wrapCssInLayer(original, 'pages');
assert.ok(wrapped.startsWith(
    '\uFEFF/* encoding stays */\r\n@charset "UTF-8";\r\n@import url("theme.css");\r\n@namespace svg url("urn:svg");\r\n@layer pages {\r\n',
));
assert.ok(wrapped.includes('.rule { content: "}"; color: red; }\r\n'));
assert.equal(wrapCssInLayer(wrapped, 'pages'), wrapped);
assert.throws(() => wrapCssInLayer(wrapped, 'layout'), /already has outer layer pages/);

const escaped = '.icon::before { content: "\\{safe\\}"; background: url("data:image/svg+xml,{path}"); }';
const escapedWrapped = wrapCssInLayer(escaped, 'pages');
assert.ok(escapedWrapped.includes(escaped));
assert.equal(wrapCssInLayer(escapedWrapped, 'pages'), escapedWrapped);

const renamed = renameOuterLayer('@layer components {\n.a { color: red; }\n}', 'components', 'showcase');
assert.equal(renamed, '@layer showcase {\n.a { color: red; }\n}');
assert.equal(renameOuterLayer(renamed, 'components', 'showcase'), renamed);

const tokens = '@layer tokens, layout, components;\n\n@layer tokens {\n:root { color: red; }\n}\n';
const tokensFinal = transformCssFile('css/tokens.css', tokens, 'tokens');
assert.ok(tokensFinal.startsWith('@layer tokens, showcase, components, layout, pages;'));
assert.equal(transformCssFile('css/tokens.css', tokensFinal, 'tokens'), tokensFinal);

for (const [fixture, pattern] of [
    ['.broken { color: red;', /Unbalanced CSS delimiters|Unclosed CSS block/],
    ['.broken { color: var(--x;', /Unbalanced CSS delimiters|Unbalanced CSS header/],
    ['.broken { content: "oops; }', /Unclosed CSS string|Unbalanced CSS delimiters/],
    ['/* unclosed', /Unclosed CSS comment/],
]) {
    assert.throws(() => wrapCssInLayer(fixture, 'pages'), pattern);
}

assert.equal(baseline.layerMigrationStatus, 'complete');
for (const file of baseline.cssFiles) {
    const source = readFileSync(join(ROOT, file.path), 'utf8');
    assert.equal(transformCssFile(file.path, source, file.targetLayer), source, file.path + ' should already be migrated');
}
console.log('PASS CSS layer migration utility fixtures and repository idempotence · ' + baseline.cssFiles.length + ' files');
