#!/usr/bin/env node
// CSS layer migration guard.
// P0 is an immutable factual snapshot. Migration progress lives in a separate
// rule-level state file so production CSS cannot be rebaselined into silence.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = join(ROOT, 'tests/css-layer-p0-baseline.json');
const MIGRATION_STATE_PATH = join(ROOT, 'tests/css-layer-migration-state.json');
const BASELINE_TEXT = readFileSync(BASELINE_PATH, 'utf8');
const BASELINE = JSON.parse(BASELINE_TEXT);
const MIGRATION_STATE = JSON.parse(readFileSync(MIGRATION_STATE_PATH, 'utf8'));
const BASELINE_BLOB_SHA = createHash('sha1')
    .update(`blob ${Buffer.byteLength(BASELINE_TEXT, 'utf8')}\0`)
    .update(BASELINE_TEXT)
    .digest('hex');
const REVIEWED_P0_BASELINE_BLOB_SHA = '9c4541b4a447bff3dbecb0bc6cd02e09f3850922';
const REVIEWED_LAYER_ORDER = Object.freeze(['tokens', 'showcase', 'components', 'layout', 'pages', 'contracts']);
const ALLOWED_LAYERS = new Set(REVIEWED_LAYER_ORDER);
const STATEMENT_AT_RULES = new Set(['charset', 'import', 'namespace', 'layer']);
const GROUPING_AT_RULES = new Set(['media', 'supports', 'container', 'scope', 'starting-style', 'document']);
const DECLARATION_AT_RULES = new Set([
    'font-face', 'property', 'page', 'counter-style', 'font-feature-values',
    'font-palette-values', 'color-profile', 'viewport', 'view-transition',
]);
const KEYFRAME_AT_RULES = new Set(['keyframes', '-webkit-keyframes', '-moz-keyframes', '-o-keyframes']);
const SPECIAL_AT_RULES = new Set([
    ...STATEMENT_AT_RULES,
    ...DECLARATION_AT_RULES,
    ...KEYFRAME_AT_RULES,
    'document',
]);

function normalizeSelector(value) {
    return value.replace(/\s+/g, ' ').trim();
}

function normalizeValue(value) {
    return value.replace(/\s+/g, ' ').trim();
}

function decodeCssIdentifierEscapes(value) {
    let output = '';
    for (let index = 0; index < value.length; index++) {
        const char = value[index];
        if (char !== '\\') {
            output += char;
            continue;
        }

        const next = value[index + 1];
        if (next == null || next === '\n' || next === '\r' || next === '\f') return null;

        const hex = value.slice(index + 1).match(/^[0-9a-f]{1,6}/i);
        if (hex) {
            const codePoint = Number.parseInt(hex[0], 16);
            if (codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
                output += '\uFFFD';
            } else {
                output += String.fromCodePoint(codePoint);
            }
            index += hex[0].length;
            if (/\s/.test(value[index + 1] || '')) index++;
            continue;
        }

        output += next;
        index++;
    }
    return output;
}

function hasImportantPriority(value) {
    let quote = '';
    let escaped = false;
    let parentheses = 0;
    let brackets = 0;

    for (let index = 0; index < value.length; index++) {
        const char = value[index];

        if (quote) {
            if (escaped) escaped = false;
            else if (char.charCodeAt(0) === 92) escaped = true;
            else if (char === quote) quote = '';
            continue;
        }
        if (escaped) {
            escaped = false;
            continue;
        }
        if (char.charCodeAt(0) === 92) {
            escaped = true;
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            continue;
        }
        if (parentheses === 0 && brackets === 0 && char === '!') {
            const decoded = decodeCssIdentifierEscapes(value.slice(index + 1).trim());
            if (decoded != null && /^important$/i.test(decoded.trim())) return true;
        }
        if (char === '(') parentheses++;
        else if (char === ')') parentheses--;
        else if (char === '[') brackets++;
        else if (char === ']') brackets--;
    }

    return false;
}

function normalizeAtRuleParams(value) {
    return value.replace(/\s+/g, ' ').trim();
}

function parseAtRuleHeader(header, file) {
    if (!header.startsWith('@')) return null;

    let index = 1;
    let rawName = '';
    while (index < header.length) {
        const char = header[index];
        if (char === '\\') {
            const escapeStart = index;
            const next = header[index + 1];
            if (next == null || next === '\n' || next === '\r' || next === '\f') {
                throw new Error('Invalid CSS at-keyword escape in ' + file + ': ' + header);
            }

            const hex = header.slice(index + 1).match(/^[0-9a-f]{1,6}/i);
            if (hex) {
                index += 1 + hex[0].length;
                if (/[ \t\r\n\f]/.test(header[index] || '')) index++;
            } else {
                index += 2;
            }
            rawName += header.slice(escapeStart, index);
            continue;
        }

        const codePoint = char.codePointAt(0);
        if (/[-_a-z0-9]/i.test(char) || codePoint >= 0x80) {
            rawName += char;
            index += char.length;
            continue;
        }
        break;
    }

    if (!rawName) {
        throw new Error('Invalid CSS at-keyword in ' + file + ': ' + header);
    }

    const decodedName = decodeCssIdentifierEscapes(rawName);
    if (decodedName == null || !decodedName) {
        throw new Error('Invalid CSS at-keyword escape in ' + file + ': ' + header);
    }

    const rawParams = header.slice(index).trim();
    return {
        name: decodedName.toLowerCase(),
        rawParams,
        params: normalizeAtRuleParams(rawParams),
    };
}

function skipSpaceAndComments(source, start, end) {
    let index = start;
    while (index < end) {
        if (/\s/.test(source[index])) {
            index++;
            continue;
        }
        if (source[index] === '/' && source[index + 1] === '*') {
            const close = source.indexOf('*/', index + 2);
            if (close < 0 || close + 2 > end) throw new Error('Unclosed CSS comment');
            index = close + 2;
            continue;
        }
        break;
    }
    return index;
}

function findCssDelimiter(source, start, end) {
    let quote = '';
    let escaped = false;
    let parentheses = 0;
    let brackets = 0;

    for (let index = start; index < end; index++) {
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
            if (close < 0 || close + 2 > end) throw new Error('Unclosed CSS comment');
            index = close + 1;
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            continue;
        }
        if (char === '(') parentheses++;
        else if (char === ')') parentheses--;
        else if (char === '[') brackets++;
        else if (char === ']') brackets--;
        else if (parentheses === 0 && brackets === 0 && (char === '{' || char === ';')) {
            return { index, char };
        } else if (parentheses === 0 && brackets === 0 && char === '}') {
            return { index, char };
        }
        if (parentheses < 0 || brackets < 0) throw new Error('Unbalanced CSS selector or at-rule');
    }

    if (quote || parentheses !== 0 || brackets !== 0) throw new Error('Unclosed CSS string, function, or attribute selector');
    return { index: end, char: '' };
}

function assertNoNestedBlocks(body, file, selector) {
    let start = 0;
    while (start < body.length) {
        const boundary = findCssDelimiter(body, start, body.length);
        if (boundary.char === '{' || boundary.char === '}') {
            throw new Error('CSS nesting or brace-bearing values are unsupported by the CSS debt scanner in '
                + file + ' (' + selector + ')');
        }
        if (boundary.char === ';') {
            start = boundary.index + 1;
            continue;
        }
        break;
    }
}

function findClosingBrace(source, open, end) {
    let depth = 1;
    let quote = '';
    let escaped = false;

    for (let index = open + 1; index < end; index++) {
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
            if (close < 0 || close + 2 > end) throw new Error('Unclosed CSS comment');
            index = close + 1;
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            continue;
        }
        if (char === '{') depth++;
        else if (char === '}' && --depth === 0) return index;
    }

    throw new Error('Unclosed CSS block');
}

function removeComments(value) {
    let output = '';
    let quote = '';
    let escaped = false;

    for (let index = 0; index < value.length; index++) {
        const char = value[index];
        const next = value[index + 1];

        if (quote) {
            output += char;
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = '';
            continue;
        }
        if (char === '/' && next === '*') {
            const close = value.indexOf('*/', index + 2);
            if (close < 0) throw new Error('Unclosed CSS comment');
            output += ' ';
            index = close + 1;
            continue;
        }
        if (char === '"' || char === "'") quote = char;
        output += char;
    }

    return output;
}

function findDeclarationColon(value) {
    let quote = '';
    let escaped = false;
    let parentheses = 0;
    let brackets = 0;

    for (let index = 0; index < value.length; index++) {
        const char = value[index];
        if (quote) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = '';
            continue;
        }
        if (char === '"' || char === "'") quote = char;
        else if (char === '(') parentheses++;
        else if (char === ')') parentheses--;
        else if (char === '[') brackets++;
        else if (char === ']') brackets--;
        else if (char === ':' && parentheses === 0 && brackets === 0) return index;
    }

    return -1;
}

function parseDeclarations(body) {
    const segments = [];
    let start = 0;
    let quote = '';
    let escaped = false;
    let parentheses = 0;
    let brackets = 0;

    for (let index = 0; index <= body.length; index++) {
        const char = body[index];
        const next = body[index + 1];

        if (index === body.length || (!quote && parentheses === 0 && brackets === 0 && char === ';')) {
            const segment = removeComments(body.slice(start, index)).trim();
            if (segment) segments.push(segment);
            start = index + 1;
            continue;
        }
        if (quote) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = '';
            continue;
        }
        if (char === '/' && next === '*') {
            const close = body.indexOf('*/', index + 2);
            if (close < 0) throw new Error('Unclosed CSS comment');
            index = close + 1;
            continue;
        }
        if (char === '"' || char === "'") quote = char;
        else if (char === '(') parentheses++;
        else if (char === ')') parentheses--;
        else if (char === '[') brackets++;
        else if (char === ']') brackets--;
    }
    if (quote || parentheses !== 0 || brackets !== 0) throw new Error('Unclosed CSS declaration value');

    return segments.map(segment => {
        const colon = findDeclarationColon(segment);
        if (colon < 0) return null;
        return {
            property: segment.slice(0, colon).trim().toLowerCase(),
            value: normalizeValue(segment.slice(colon + 1)),
        };
    }).filter(declaration => declaration && declaration.property);
}

function parseCssText(source, file) {
    const result = {
        file,
        rules: [],
        declarations: [],
        atRules: [],
        layerStatements: [],
        layerBlocks: [],
        layerNames: new Set(),
        keyframes: [],
    };

    function addLayerNames(params) {
        for (const item of params.split(',')) {
            const name = item.trim();
            if (name) result.layerNames.add(name.split('.')[0]);
        }
    }

    function walk(start, end, context = [], layer = null, inKeyframes = false) {
        let index = start;
        while (index < end) {
            index = skipSpaceAndComments(source, index, end);
            if (index >= end) break;

            const boundary = findCssDelimiter(source, index, end);
            const header = source.slice(index, boundary.index).trim();
            if (boundary.char === '}') throw new Error('Unexpected closing CSS brace in ' + file);
            if (!header) {
                if (boundary.char === '{') {
                    const close = findClosingBrace(source, boundary.index, end);
                    index = close + 1;
                    continue;
                }
                if (!boundary.char) break;
                index = boundary.index + 1;
                continue;
            }

            if (boundary.char === ';') {
                if (header.startsWith('@')) {
                    const { name, params } = parseAtRuleHeader(header, file);
                    result.atRules.push({ name, params, context: [...context], layer });
                    if (!STATEMENT_AT_RULES.has(name)) {
                        throw new Error('Unsupported CSS statement at-rule @' + name + ' in ' + file);
                    }
                    if (name === 'layer') {
                        result.layerStatements.push(params);
                        addLayerNames(params);
                    }
                    if (SPECIAL_AT_RULES.has(name)) {
                        result.specialAtRules ||= [];
                        result.specialAtRules.push([file, context.join(' / '), name, params]);
                    }
                }
                index = boundary.index + 1;
                continue;
            }

            if (boundary.char !== '{') throw new Error('Missing CSS block or semicolon in ' + file);
            const close = findClosingBrace(source, boundary.index, end);
            const body = source.slice(boundary.index + 1, close);
            const atRule = header.startsWith('@') ? parseAtRuleHeader(header, file) : null;

            if (atRule) {
                const { name, rawParams, params } = atRule;
                result.atRules.push({ name, params, context: [...context], layer });

                if (name === 'layer') {
                    result.layerBlocks.push(params);
                    addLayerNames(params);
                    const ownLayer = params.split(',')[0].trim() || '<anonymous>';
                    const fullLayer = layer ? layer + '.' + ownLayer : ownLayer;
                    walk(boundary.index + 1, close, context, fullLayer, inKeyframes);
                } else if (KEYFRAME_AT_RULES.has(name)) {
                    result.keyframes.push({ name, params, context: [...context], layer });
                    walk(boundary.index + 1, close, context, layer, true);
                    result.specialAtRules ||= [];
                    result.specialAtRules.push([file, context.join(' / '), name, params]);
                } else if (DECLARATION_AT_RULES.has(name)) {
                    result.specialAtRules ||= [];
                    result.specialAtRules.push([file, context.join(' / '), name, params]);
                    assertNoNestedBlocks(body, file, '@' + name + (rawParams ? ' ' + rawParams : ''));
                    result.declarations.push(...parseDeclarations(body).map(declaration => ({
                        ...declaration, selector: '', context: [...context], layer, atRule: name,
                    })));
                } else if (GROUPING_AT_RULES.has(name)) {
                    if (SPECIAL_AT_RULES.has(name)) {
                        result.specialAtRules ||= [];
                        result.specialAtRules.push([file, context.join(' / '), name, params]);
                    }
                    walk(boundary.index + 1, close, [...context, '@' + name + (rawParams ? ' ' + rawParams : '')], layer, inKeyframes);
                } else {
                    throw new Error('Unsupported CSS block at-rule @' + name + ' in ' + file);
                }
            } else if (!inKeyframes) {
                const selector = normalizeSelector(header);
                assertNoNestedBlocks(body, file, selector);
                const declarations = parseDeclarations(body).map(declaration => ({
                    ...declaration, selector, context: [...context], layer, atRule: '',
                }));
                result.rules.push({ selector, context: [...context], layer, declarations });
                result.declarations.push(...declarations);
            }

            index = close + 1;
        }
    }

    walk(0, source.length);
    return result;
}

function decodeHtmlCharacterReferences(value) {
    const named = new Map([
        ['amp', '&'],
        ['lt', '<'],
        ['gt', '>'],
        ['quot', '"'],
        ['apos', "'"],
    ]);

    let decoded = value.replace(/&#(x[0-9a-f]+|[0-9]+);?/gi, (match, body) => {
        const hex = body[0]?.toLowerCase() === 'x';
        const digits = body.slice(hex ? 1 : 0);
        const codePoint = Number.parseInt(digits, hex ? 16 : 10);
        if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 0x10ffff
            || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
            return '\uFFFD';
        }
        return String.fromCodePoint(codePoint);
    });

    decoded = decoded.replace(/&([a-z][a-z0-9]+);/gi, (match, body) => {
        const replacement = named.get(body.toLowerCase());
        if (replacement == null) {
            throw new Error('Unsupported named HTML character reference &' + body + '; in scanned attribute');
        }
        return replacement;
    });

    return decoded;
}

function parseAttributes(tag) {
    const attributes = {};
    const matcher = /(?:^|\s)([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let match;
    while ((match = matcher.exec(tag))) {
        const name = match[1].toLowerCase();
        if (name === 'link' || name.startsWith('<')) continue;
        // The HTML tokenizer drops later duplicate attributes. Preserve the first
        // occurrence so stylesheet classification matches browser semantics.
        if (!Object.hasOwn(attributes, name)) {
            attributes[name] = decodeHtmlCharacterReferences(match[2] ?? match[3] ?? match[4] ?? '');
        }
    }
    return attributes;
}

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

function maskHtmlComments(html) {
    const output = html.split('');
    let inTag = false;
    let quote = '';
    let pendingRawTextTag = '';
    let rawTextTag = '';

    function maskRange(start, end) {
        for (let index = start; index < end; index++) {
            if (html[index] !== '\n' && html[index] !== '\r') output[index] = ' ';
        }
    }

    for (let index = 0; index < html.length; index++) {
        const char = html[index];

        if (rawTextTag) {
            if (char === '<' && html[index + 1] === '/') {
                const candidate = html.slice(index + 2, index + 2 + rawTextTag.length);
                const boundary = html[index + 2 + rawTextTag.length] || '';
                if (candidate.toLowerCase() === rawTextTag && /[\s/>]/.test(boundary)) {
                    rawTextTag = '';
                    inTag = true;
                    quote = '';
                }
            }
            continue;
        }

        if (inTag) {
            if (quote) {
                if (char === quote) quote = '';
                continue;
            }
            if (char === '"' || char === "'") {
                quote = char;
                continue;
            }
            if (char === '>') {
                inTag = false;
                if (pendingRawTextTag) {
                    rawTextTag = pendingRawTextTag;
                    pendingRawTextTag = '';
                }
            }
            continue;
        }

        if (html.startsWith('<!--', index)) {
            const close = html.indexOf('-->', index + 4);
            const end = close < 0 ? html.length : close + 3;
            maskRange(index, end);
            index = end - 1;
            continue;
        }

        if (char === '<') {
            const match = html.slice(index).match(/^<\/?([a-z][^\s/>]*)/i);
            if (match) {
                const isEndTag = html[index + 1] === '/';
                const tagName = match[1].toLowerCase();
                inTag = true;
                quote = '';
                if (!isEndTag && (tagName === 'script' || tagName === 'style')) {
                    pendingRawTextTag = tagName;
                }
            }
        }
    }

    return output.join('');
}

function normalizeLinkAttributes(attributes) {
    return Object.entries(attributes)
        .map(([name, value]) => [
            name,
            name === 'rel'
                ? value.toLowerCase().split(/\s+/).filter(Boolean).sort().join(' ')
                : normalizeValue(value),
        ])
        .sort(([left], [right]) => left.localeCompare(right));
}

function stylesheetLinkSignature(attributes) {
    return [attributes.href, normalizeLinkAttributes(attributes)];
}

function scanHtml(path, html) {
    // HTML comments are inert browser content. Mask them before every HTML-level
    // scan so commented links/styles cannot impersonate active cascade inputs.
    const activeHtml = maskHtmlComments(html);
    const links = [];
    const linkTags = activeHtml.matchAll(/<link\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi);
    for (const match of linkTags) {
        const attributes = parseAttributes(match[0]);
        if ((attributes.rel || '').toLowerCase().split(/\s+/).includes('stylesheet') && attributes.href) {
            links.push(stylesheetLinkSignature(attributes));
        }
    }

    const styleBlocks = [];
    const inlineRules = [];
    const inlineAttributes = [];
    for (const match of activeHtml.matchAll(/<style\b(?:"[^"]*"|'[^']*'|[^'">])*>([\s\S]*?)<\/style\s*>/gi)) {
        const source = match[1].replace(/\r\n/g, '\n').trim();
        const index = styleBlocks.length;
        styleBlocks.push([path, index, source]);
        const parsed = parseCssText(match[1], path + '#style[' + index + ']');
        for (const rule of parsed.rules) {
            inlineRules.push([path + '#style[' + index + ']', rule.context.join(' / '), rule.selector]);
        }
    }

    const htmlWithoutRawText = activeHtml.replace(/<(script|style)\b(?:"[^"]*"|'[^']*'|[^'">])*>[\s\S]*?<\/\1\s*>/gi, '');
    const tagOccurrences = new Map();
    for (const tag of htmlWithoutRawText.matchAll(/<[a-z](?:"[^"]*"|'[^']*'|[^'">])*>/gi)) {
        const tagName = (tag[0].match(/^<([a-z][^\s/>]*)/i) || [])[1]?.toLowerCase() || 'unknown';
        const occurrence = tagOccurrences.get(tagName) || 0;
        tagOccurrences.set(tagName, occurrence + 1);
        const attributes = parseAttributes(tag[0]);
        if (Object.hasOwn(attributes, 'style')) {
            const identity = attributes.id ? tagName + '#' + attributes.id : tagName + '@' + occurrence;
            inlineAttributes.push([path, identity, normalizeValue(attributes.style)]);
        }
    }

    return { links, styleBlocks, inlineRules, inlineAttributes };
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

function runSelfChecks() {
    const fixture = [
        '@layer components { .layered { color: red; } }',
        '@media (width < 600px) { .existing { display: none; } }',
        '@keyframes pulse { from { opacity: 0; } to { opacity: 1; } }',
    ].join('\n');
    const parsed = parseCssText(fixture, 'fixture.css');
    assert.equal(parsed.rules.length, 2);
    assert.deepEqual(parsed.rules.filter(rule => !rule.layer).map(rule => rule.selector), ['.existing']);
    assert.equal(parsed.keyframes.length, 1);
    assert.deepEqual(parsed.specialAtRules.map(row => row[2]), ['keyframes']);

    const escapedAtRules = parseCssText([
        '@\\69mport url("/escaped.css");',
        '@m\\65 dia (width < 600px) { .escaped-media { display: none; } }',
    ].join('\n'), 'escaped-at-rules.css');
    assert.deepEqual(escapedAtRules.atRules.map(({ name }) => name), ['import', 'media']);
    assert.deepEqual(escapedAtRules.rules.map(rule => rule.selector), ['.escaped-media']);
    assert.deepEqual(escapedAtRules.specialAtRules.map(row => row[2]), ['import']);

    assert.equal(hasImportantPriority('red!important'), true);
    assert.equal(hasImportantPriority('red ! important'), true);
    assert.equal(hasImportantPriority('"!important"'), false);
    assert.equal(hasImportantPriority('url("x!important")'), false);
    assert.equal(hasImportantPriority('red\\!important'), false);
    assert.equal(hasImportantPriority('red !\\69mportant'), true);
    assert.equal(hasImportantPriority('red !\\000069 mportant'), true);
    assert.equal(hasImportantPriority('red !\\notimportant'), false);
    assert.throws(
        () => parseCssText('.parent { color: red; & .child { color: blue; } }', 'nested.css'),
        /CSS nesting or brace-bearing values are unsupported/,
    );
    const viewTransition = parseCssText('@view-transition { navigation: auto; }', 'view-transition.css');
    assert.deepEqual(
        viewTransition.declarations.map(({ property, value, atRule }) => [property, value, atRule]),
        [['navigation', 'auto', 'view-transition']],
    );
    assert.deepEqual(viewTransition.specialAtRules.map(row => row[2]), ['view-transition']);
    assert.throws(
        () => parseCssText('@future-rule { navigation: auto; }', 'future.css'),
        /Unsupported CSS block at-rule @future-rule/,
    );
    assert.throws(
        () => parseCssText('@future-rule foo;', 'future.css'),
        /Unsupported CSS statement at-rule @future-rule/,
    );
    assert.throws(
        () => parseCssText('@page { @top-left { content: "x"; } }', 'page.css'),
        /CSS nesting or brace-bearing values are unsupported/,
    );

    assert.deepEqual(
        parseAttributes('<link rel="stylesheet" rel="alternate" href="/first.css" href="/second.css">'),
        { rel: 'stylesheet', href: '/first.css' },
    );
    assert.deepEqual(
        parseAttributes('<div style="color:red" style="display:none">'),
        { style: 'color:red' },
    );

    const htmlScan = scanHtml('fixture.html', [
        '<!-- <link rel="stylesheet" href="/commented.css"> -->',
        '<link rel="style&#x73;heet" href="/active.css">',
        '<link rel="style&#115heet" href="/active-decimal.css">',
        '<link rel="alternate stylesheet" href="/inactive.css" media="print" disabled>',
        '<div title=">" style="color:red"></div>',
        '<div title="<!-- not a comment -->" style="color:blue"></div>',
        '<script data-note=">">const fake = "<link rel=\\\"stylesheet\\\" href=\\\"/fake.css\\\">";</script>',
        '<div></div>',
        '<div style="color:red"></div>',
        '<!-- <style>.commented { display:none; }</style><div style="display:none"></div> -->',
    ].join('\n'));
    assert.deepEqual(htmlScan.links, [
        ['/active.css', [['href', '/active.css'], ['rel', 'stylesheet']]],
        ['/active-decimal.css', [['href', '/active-decimal.css'], ['rel', 'stylesheet']]],
        ['/inactive.css', [
            ['disabled', ''],
            ['href', '/inactive.css'],
            ['media', 'print'],
            ['rel', 'alternate stylesheet'],
        ]],
    ]);
    assert.equal(htmlScan.styleBlocks.length, 0);
    assert.deepEqual(htmlScan.inlineAttributes, [
        ['fixture.html', 'div@0', 'color:red'],
        ['fixture.html', 'div@1', 'color:blue'],
        ['fixture.html', 'div@3', 'color:red'],
    ]);

    assert.deepEqual([
        '/assets/tokens-test.css',
        '/assets/layout-test.css',
        '/assets/science-showcase-test.css',
        '/assets/page-test.css',
        '/assets/more-games-test.css',
    ].map(stylesheetRank), [0, 1, 2, 5, 9]);

    const baseline = [['fixture.css', '', '.existing']];
    assert.deepEqual(multisetDelta(baseline, baseline), { added: [], removed: [] });
    assert.deepEqual(multisetDelta([...baseline, ['fixture.css', '', '.new']], baseline).added, [
        ['fixture.css', '', '.new'],
    ]);
    assert.deepEqual(multisetDelta([], baseline).removed, baseline);
}

function stylesheetRank(href) {
    if (/\/tokens-/.test(href)) return 0;
    if (/\/layout-/.test(href)) return 1;
    if (/\/science-showcase-/.test(href)) return 2;
    if (/\/more-games-/.test(href)) return 9;
    return 5;
}

function verifyBuildOrderingContract(errors) {
    const viteConfig = readFileSync(join(ROOT, 'vite.config.js'), 'utf8');
    const pluginIndex = viteConfig.indexOf("name: 'shared-css-first'");
    const plugin = pluginIndex < 0 ? '' : viteConfig.slice(pluginIndex, pluginIndex + 5000);
    if (pluginIndex < 0 || !plugin.includes('transformIndexHtml')
        || !plugin.includes("order: 'post'") || !plugin.includes('tokens-')
        || !plugin.includes('layout-') || !plugin.includes('science-showcase-')
        || !plugin.includes('more-games-')) {
        errors.push('vite.config.js must retain the shared-css-first stylesheet ordering contract until P6.');
    }

    const distRoot = join(ROOT, 'dist');
    if (!existsSync(distRoot)) return;
    const distHtmlPaths = listFiles(distRoot, ROOT, path => path.endsWith('.html'));
    if (!distHtmlPaths.length) {
        errors.push('Production CSS ordering contract: dist contains no HTML files to verify.');
        return;
    }
    for (const path of distHtmlPaths) {
        const html = readFileSync(join(ROOT, path), 'utf8');
        const activeHtml = maskHtmlComments(html);
        const links = [];
        for (const match of activeHtml.matchAll(/<link\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi)) {
            const attributes = parseAttributes(match[0]);
            if ((attributes.rel || '').toLowerCase().split(/\s+/).includes('stylesheet') && attributes.href) {
                links.push({ href: attributes.href, start: match.index, end: match.index + match[0].length });
            }
        }
        const ranks = links.map(link => stylesheetRank(link.href));
        if (ranks.some((rank, index) => index > 0 && rank < ranks[index - 1])) {
            errors.push(path + ': production stylesheet links violate shared-css-first rank order.');
        }
        const styleAt = activeHtml.search(/<style[\s>]/i);
        if (styleAt >= 0 && links.some(link => link.start > styleAt)) {
            errors.push(path + ': production external stylesheet appears after inline <style>.');
        }
    }
}

function verifyProject() {
    runSelfChecks();

    const errors = [];
    if (BASELINE.snapshotKind !== 'immutable-p0') {
        errors.push('tests/css-layer-p0-baseline.json must remain the immutable P0 snapshot.');
    }
    if (BASELINE_BLOB_SHA !== REVIEWED_P0_BASELINE_BLOB_SHA) {
        errors.push('Immutable P0 baseline content differs from the independently reviewed digest.');
    }
    if (MIGRATION_STATE.p0BaselineBlobSha !== REVIEWED_P0_BASELINE_BLOB_SHA) {
        errors.push('Migration state must reference the independently pinned immutable P0 digest.');
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
    if (MIGRATION_STATE.status !== 'not-started') {
        errors.push('CSS migration state changed before the rule-level P2 verifier was enabled.');
    }
    if ((MIGRATION_STATE.migratedRules || []).length || (MIGRATION_STATE.migratedKeyframes || []).length) {
        errors.push('Rule-level migration entries require the P2 verifier upgrade before production CSS can change.');
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
        errors.push('CSS file inventory changed; register ownership and target layer in the baseline.');
    }
    if (!sameJson(htmlPaths, expectedHtmlPaths)) {
        errors.push('Active HTML inventory changed; register page and stylesheet ownership in the baseline.');
    }

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
        if (!sameJson(normalizedLayerCounts, expectedLayerCounts)) {
            errors.push(path + ': current layer map differs from the reviewed P0 baseline.');
        }
        if (!sameJson(layerStatements, baselineFile.layerStatements)) {
            errors.push(path + ': @layer order declaration differs from the reviewed P0 baseline.');
        }
        if (!sameJson(layerBlocks, baselineFile.layerBlocks)) {
            errors.push(path + ': current @layer blocks differ from the reviewed P0 baseline.');
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

    verifyBuildOrderingContract(errors);

    for (const key of Object.keys(actualDebt)) {
        actualDebt[key] = sortTuples(actualDebt[key]);
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
    console.log('  ordinary CSS rules: ' + totalRules + ' · unlayered: ' + unlayeredCount);
    console.log('  !important declarations: ' + importantCount + ' · custom-property definitions: ' + customPropertyDefinitions);
    console.log('  inline style blocks/rules/attributes: ' + actualDebt.inlineStyleBlocks.length + '/'
        + actualDebt.inlineStyleRules.length + '/' + actualDebt.inlineStyleAttributes.length);
    console.log('  immutable P0 snapshot, stylesheet source order, and current layer map all match.');
}

verifyProject();
