#!/usr/bin/env node
// One-time, idempotent CSS cascade-layer migration. The reviewed target mapping lives in the P0 baseline.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const BASELINE_PATH = join(ROOT, 'tests/css-layer-p0-baseline.json');


const TARGET_LAYER_ORDER = 'tokens, showcase, components, layout, pages';

function skipTrivia(source, start) {
    let index = start;
    while (index < source.length) {
        if (/\s/.test(source[index])) {
            index++;
            continue;
        }
        if (source[index] === '/' && source[index + 1] === '*') {
            const close = source.indexOf('*/', index + 2);
            if (close < 0) throw new Error('Unclosed CSS comment');
            index = close + 2;
            continue;
        }
        break;
    }
    return index;
}

function stripComments(value) {
    let result = '';
    let quote = '';
    let escaped = false;
    for (let index = 0; index < value.length; index++) {
        const char = value[index];
        const next = value[index + 1];
        if (quote) {
            result += char;
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = '';
            continue;
        }
        if (char === '/' && next === '*') {
            const close = value.indexOf('*/', index + 2);
            if (close < 0) throw new Error('Unclosed CSS comment');
            result += ' ';
            index = close + 1;
            continue;
        }
        if (char === '"' || char === "'") quote = char;
        result += char;
    }
    return result;
}

function assertBalancedDelimiters(source) {
    const stack = [];
    const expected = { '(': ')', '[': ']', '{': '}' };
    let quote = '';
    let escaped = false;
    for (let index = 0; index < source.length; index++) {
        const char = source[index];
        const next = source[index + 1];
        if (quote) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = '';
            continue;
        }
        if (char === '/' && next === '*') {
            const close = source.indexOf('*/', index + 2);
            if (close < 0) throw new Error('Unclosed CSS comment');
            index = close + 1;
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            continue;
        }
        if (char === '\\') {
            index++;
            continue;
        }
        if (Object.hasOwn(expected, char)) {
            stack.push(expected[char]);
            continue;
        }
        if (char === ')' || char === ']' || char === '}') {
            if (stack.pop() !== char) throw new Error('Unbalanced CSS delimiters');
        }
    }
    if (quote) throw new Error('Unclosed CSS string');
    if (stack.length) throw new Error('Unbalanced CSS delimiters');
}

function findHeaderDelimiter(source, start) {
    let quote = '';
    let escaped = false;
    let parentheses = 0;
    let brackets = 0;
    for (let index = start; index < source.length; index++) {
        const char = source[index];
        const next = source[index + 1];
        if (quote) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = '';
            continue;
        }
        if (char === '/' && next === '*') {
            const close = source.indexOf('*/', index + 2);
            if (close < 0) throw new Error('Unclosed CSS comment');
            index = close + 1;
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            continue;
        }
        if (char === '\\') {
            index++;
            continue;
        }
        if (char === '(') parentheses++;
        else if (char === ')') parentheses--;
        else if (char === '[') brackets++;
        else if (char === ']') brackets--;
        else if (parentheses === 0 && brackets === 0
            && (char === '{' || char === ';' || char === '}')) {
            return { index, char };
        }
    }
    if (quote || parentheses !== 0 || brackets !== 0) {
        throw new Error('Unbalanced CSS header');
    }
    return { index: source.length, char: '' };
}

function findClosingBrace(source, open) {
    let depth = 1;
    let quote = '';
    let escaped = false;
    for (let index = open + 1; index < source.length; index++) {
        const char = source[index];
        const next = source[index + 1];
        if (quote) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = '';
            continue;
        }
        if (char === '/' && next === '*') {
            const close = source.indexOf('*/', index + 2);
            if (close < 0) throw new Error('Unclosed CSS comment');
            index = close + 1;
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            continue;
        }
        if (char === '\\') {
            index++;
            continue;
        }
        if (char === '{') depth++;
        else if (char === '}' && --depth === 0) return index;
    }
    throw new Error('Unclosed CSS block');
}

function scanTopLevel(source) {
    assertBalancedDelimiters(source);
    const entries = [];
    let index = source.charCodeAt(0) === 0xfeff ? 1 : 0;
    while (index < source.length) {
        index = skipTrivia(source, index);
        if (index >= source.length) break;
        const boundary = findHeaderDelimiter(source, index);
        if (boundary.char === '}') throw new Error('Unexpected closing CSS brace');
        if (!boundary.char) {
            if (source.slice(index).trim()) throw new Error('Top-level CSS rule lacks a block or semicolon');
            break;
        }
        const header = source.slice(index, boundary.index);
        if (boundary.char === ';') {
            entries.push({ kind: 'statement', start: index, headerEnd: boundary.index, end: boundary.index + 1, header });
            index = boundary.index + 1;
        } else {
            const close = findClosingBrace(source, boundary.index);
            entries.push({
                kind: 'block', start: index, headerEnd: boundary.index, open: boundary.index,
                close, end: close + 1, header,
            });
            index = close + 1;
        }
    }
    return entries;
}

function normalizedHeader(header) {
    return stripComments(header).replace(/\s+/g, ' ').trim();
}

function preludeEnd(entries) {
    let end = 0;
    for (const entry of entries) {
        if (entry.kind !== 'statement') break;
        const header = normalizedHeader(entry.header);
        if (/^@(charset|import|namespace)\b/i.test(header) || /^@layer\b/i.test(header)) {
            end = entry.end;
            continue;
        }
        break;
    }
    return end;
}

function singleOuterLayer(source) {
    const entries = scanTopLevel(source);
    const firstBodyIndex = entries.findIndex(entry => entry.start >= preludeEnd(entries));
    const bodyEntries = firstBodyIndex < 0 ? [] : entries.slice(firstBodyIndex);
    if (bodyEntries.length !== 1 || bodyEntries[0].kind !== 'block') return null;
    const match = normalizedHeader(bodyEntries[0].header).match(/^@layer\s+([a-z][a-z0-9_-]*)$/i);
    if (!match) return null;
    return { name: match[1], entry: bodyEntries[0] };
}

function wrapCssInLayerImpl(source, layer) {
    if (!/^[a-z][a-z0-9_-]*$/i.test(layer)) throw new Error('Invalid CSS layer name: ' + layer);
    const entries = scanTopLevel(source);
    const outer = singleOuterLayer(source);
    if (outer) {
        if (outer.name !== layer) throw new Error('CSS already has outer layer ' + outer.name + ', expected ' + layer);
        return source;
    }
    const prefixEnd = preludeEnd(entries);
    for (const entry of entries) {
        if (entry.start < prefixEnd) continue;
        if (entry.kind === 'block' && /^@layer\b/i.test(normalizedHeader(entry.header))) {
            throw new Error('Unexpected top-level @layer block; refuse to change its nesting');
        }
    }
    const bomEnd = source.charCodeAt(0) === 0xfeff ? 1 : 0;
    const actualPrefixEnd = Math.max(prefixEnd, bomEnd);
    const prefix = source.slice(0, actualPrefixEnd);
    const body = source.slice(actualPrefixEnd);
    const eol = source.includes('\r\n') ? '\r\n' : '\n';
    const prefixSeparator = prefix && !/(?:\r\n|\n|\r)$/.test(prefix) ? eol : '';
    const trailingEol = /(?:\r\n|\n|\r)$/.test(source) ? eol : '';
    const wrapped = prefix + prefixSeparator + '@layer ' + layer + ' {' + eol + body
        + (/(?:\r\n|\n|\r)$/.test(body) ? '' : eol) + '}'+ trailingEol;
    return wrapped;
}

function renameOuterLayerImpl(source, from, to) {
    const outer = singleOuterLayer(source);
    if (!outer) throw new Error('Expected one outer @layer ' + from + ' block');
    if (outer.name === to) return source;
    if (outer.name !== from) throw new Error('Expected outer @layer ' + from + ', found ' + outer.name);
    const rawHeader = source.slice(outer.entry.start, outer.entry.headerEnd);
    const match = rawHeader.match(/^(@layer\s+)([a-z][a-z0-9_-]*)(\s*)$/i);
    if (!match) throw new Error('Cannot safely rename a commented or unusual @layer header');
    return source.slice(0, outer.entry.start) + match[1] + to + match[3]
        + source.slice(outer.entry.headerEnd);
}

function replaceLayerOrder(source, oldOrder) {
    const entries = scanTopLevel(source);
    const statements = entries.filter(entry => entry.kind === 'statement'
        && /^@layer\b/i.test(normalizedHeader(entry.header)));
    if (statements.length !== 1) throw new Error('Expected exactly one top-level @layer order statement');
    const statement = statements[0];
    const clean = normalizedHeader(statement.header);
    const match = clean.match(/^@layer\s+(.+)$/i);
    if (!match) throw new Error('Malformed @layer order statement');
    const order = match[1];
    if (order !== oldOrder && order !== TARGET_LAYER_ORDER) {
        throw new Error('Unexpected @layer order: ' + order);
    }
    if (order === TARGET_LAYER_ORDER) return source;
    const rawHeader = source.slice(statement.start, statement.headerEnd);
    const rawMatch = rawHeader.match(/^(@layer\s+)([\s\S]+)$/i);
    if (!rawMatch) throw new Error('Cannot safely rewrite a commented @layer order statement');
    return source.slice(0, statement.start) + rawMatch[1] + TARGET_LAYER_ORDER
        + source.slice(statement.headerEnd);
}

function transformCssFileImpl(path, source, targetLayer) {
    scanTopLevel(source);
    if (path === 'css/tokens.css') {
        if (targetLayer !== 'tokens') throw new Error('tokens.css must target tokens');
        const ordered = replaceLayerOrder(source, 'tokens, layout, components');
        const outer = singleOuterLayer(ordered);
        if (!outer || outer.name !== 'tokens') throw new Error('tokens.css must retain its outer tokens layer');
        return ordered;
    }
    if (path === 'css/more-games.css') {
        if (targetLayer !== 'components') throw new Error('more-games.css must target components');
        const outer = singleOuterLayer(source);
        if (!outer || outer.name !== 'components') throw new Error('more-games.css must remain in components');
        return source;
    }
    if (path === 'css/science-showcase.css') {
        if (targetLayer !== 'showcase') throw new Error('science-showcase.css must target showcase');
        return renameOuterLayerImpl(source, 'components', 'showcase');
    }
    return wrapCssInLayerImpl(source, targetLayer);
}


export function wrapCssInLayer(source, layer) {
    return wrapCssInLayerImpl(source, layer);
}
export function renameOuterLayer(source, from, to) {
    return renameOuterLayerImpl(source, from, to);
}
export function transformCssFile(path, source, targetLayer) {
    return transformCssFileImpl(path, source, targetLayer);
}

function run() {
    const check = process.argv.includes('--check');
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
    if (baseline.layerMigrationStatus !== 'complete') {
        throw new Error('CSS layer baseline must declare layerMigrationStatus: complete');
    }
    const differences = [];
    const pendingWrites = [];
    for (const file of baseline.cssFiles) {
        const source = readFileSync(join(ROOT, file.path), 'utf8');
        const transformed = transformCssFile(file.path, source, file.targetLayer);
        if (source !== transformed) {
            differences.push(file.path);
            pendingWrites.push([file.path, transformed]);
        }
    }
    if (!check) {
        for (const [path, content] of pendingWrites) {
            writeFileSync(join(ROOT, path), content, 'utf8');
        }
    }
    if (check && differences.length) {
        console.error('FAIL CSS layer migration is not idempotent: ' + differences.join(', '));
        process.exitCode = 1;
        return;
    }
    console.log((check ? 'PASS' : 'APPLIED') + ' CSS layer migration tool · '
        + baseline.cssFiles.length + ' files · ' + differences.length + ' change(s)');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
