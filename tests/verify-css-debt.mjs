#!/usr/bin/env node
// CSS layer migration guard.
// Records exact unlayered rule identities and non-layer debt so wrappers can be
// migrated in reviewed batches without allowing new unlayered rules to slip in.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformCssFile } from '../tools/archive/migrations/apply-css-layers.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = join(ROOT, 'tests/css-layer-p0-baseline.json');
const BASELINE = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const ALLOWED_LAYERS = new Set(BASELINE.layerContractCandidate);
const SPECIAL_AT_RULES = new Set([
    'charset', 'import', 'font-face', 'property', 'keyframes', '-webkit-keyframes',
    '-moz-keyframes', '-o-keyframes', 'page', 'counter-style', 'namespace',
    'font-feature-values', 'font-palette-values', 'color-profile', 'viewport', 'document',
]);

function normalizeSelector(value) {
    return value.replace(/\s+/g, ' ').trim();
}

function normalizeValue(value) {
    return value.replace(/\s+/g, ' ').trim();
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
        if (parentheses === 0 && brackets === 0 && char === '!'
            && /^!\s*important\s*$/i.test(value.slice(index))) {
            return true;
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
                    const match = header.match(/^@([-\w]+)\s*([\s\S]*)$/);
                    if (match) {
                        const name = match[1].toLowerCase();
                        const params = normalizeAtRuleParams(match[2]);
                        result.atRules.push({ name, params, context: [...context], layer });
                        if (name === 'layer') {
                            result.layerStatements.push(params);
                            addLayerNames(params);
                        }
                        if (SPECIAL_AT_RULES.has(name)) {
                            result.specialAtRules ||= [];
                            result.specialAtRules.push([file, context.join(' / '), name, params]);
                        }
                    }
                }
                index = boundary.index + 1;
                continue;
            }

            if (boundary.char !== '{') throw new Error('Missing CSS block or semicolon in ' + file);
            const close = findClosingBrace(source, boundary.index, end);
            const body = source.slice(boundary.index + 1, close);
            const atRule = header.match(/^@([-\w]+)\s*([\s\S]*)$/);

            if (atRule) {
                const name = atRule[1].toLowerCase();
                const rawParams = atRule[2].trim();
                const params = normalizeAtRuleParams(atRule[2]);
                result.atRules.push({ name, params, context: [...context], layer });

                if (name === 'layer') {
                    result.layerBlocks.push(params);
                    addLayerNames(params);
                    const ownLayer = params.split(',')[0].trim() || '<anonymous>';
                    const fullLayer = layer ? layer + '.' + ownLayer : ownLayer;
                    walk(boundary.index + 1, close, context, fullLayer, inKeyframes);
                } else if (name === 'keyframes' || name === '-webkit-keyframes'
                    || name === '-moz-keyframes' || name === '-o-keyframes') {
                    result.keyframes.push({ name, params, context: [...context], layer });
                    walk(boundary.index + 1, close, context, layer, true);
                    if (SPECIAL_AT_RULES.has(name)) {
                        result.specialAtRules ||= [];
                        result.specialAtRules.push([file, context.join(' / '), name, params]);
                    }
                } else if (name === 'font-face' || name === 'property' || name === 'page'
                    || name === 'counter-style' || name === 'font-feature-values'
                    || name === 'font-palette-values' || name === 'color-profile' || name === 'viewport') {
                    if (SPECIAL_AT_RULES.has(name)) {
                        result.specialAtRules ||= [];
                        result.specialAtRules.push([file, context.join(' / '), name, params]);
                    }
                    result.declarations.push(...parseDeclarations(body).map(declaration => ({
                        ...declaration, selector: '', context: [...context], layer, atRule: name,
                    })));
                } else {
                    if (SPECIAL_AT_RULES.has(name)) {
                        result.specialAtRules ||= [];
                        result.specialAtRules.push([file, context.join(' / '), name, params]);
                    }
                    walk(boundary.index + 1, close, [...context, '@' + name + (rawParams ? ' ' + rawParams : '')], layer, inKeyframes);
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

function parseAttributes(tag) {
    const attributes = {};
    const matcher = /(?:^|\s)([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let match;
    while ((match = matcher.exec(tag))) {
        const name = match[1].toLowerCase();
        if (name === 'link' || name.startsWith('<')) continue;
        attributes[name] = match[2] ?? match[3] ?? match[4] ?? '';
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

function scanHtml(path, html) {
    const links = [];
    const linkTags = html.matchAll(/<link\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi);
    for (const match of linkTags) {
        const attributes = parseAttributes(match[0]);
        if ((attributes.rel || '').toLowerCase().split(/\s+/).includes('stylesheet') && attributes.href) {
            links.push(attributes.href);
        }
    }

    const styleBlocks = [];
    const inlineRules = [];
    const inlineAttributes = [];
    for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
        const source = match[1].replace(/\r\n/g, '\n').trim();
        const index = styleBlocks.length;
        styleBlocks.push([path, index, source]);
        const parsed = parseCssText(match[1], path + '#style[' + index + ']');
        for (const rule of parsed.rules) {
            inlineRules.push([path + '#style[' + index + ']', rule.context.join(' / '), rule.selector]);
        }
    }

    const htmlWithoutRawText = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
    for (const tag of htmlWithoutRawText.matchAll(/<[a-z][^<>]*>/gi)) {
        const attributes = parseAttributes(tag[0]);
        if (Object.hasOwn(attributes, 'style')) {
            inlineAttributes.push([path, inlineAttributes.length, normalizeValue(attributes.style)]);
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

    assert.equal(hasImportantPriority('red!important'), true);
    assert.equal(hasImportantPriority('red ! important'), true);
    assert.equal(hasImportantPriority('"!important"'), false);
    assert.equal(hasImportantPriority('url("x!important")'), false);
    assert.equal(hasImportantPriority('red\\!important'), false);
    assert.throws(
        () => parseCssText('.parent { color: red; & .child { color: blue; } }', 'nested.css'),
        /CSS nesting or brace-bearing values are unsupported/,
    );

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
        const links = [];
        for (const match of html.matchAll(/<link\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi)) {
            const attributes = parseAttributes(match[0]);
            if ((attributes.rel || '').toLowerCase().split(/\s+/).includes('stylesheet') && attributes.href) {
                links.push({ href: attributes.href, start: match.index, end: match.index + match[0].length });
            }
        }
        const ranks = links.map(link => stylesheetRank(link.href));
        if (ranks.some((rank, index) => index > 0 && rank < ranks[index - 1])) {
            errors.push(path + ': production stylesheet links violate shared-css-first rank order.');
        }
        const masked = html.replace(/<!--[\s\S]*?-->/g, match => ' '.repeat(match.length));
        const styleAt = masked.search(/<style[\s>]/i);
        if (styleAt >= 0 && links.some(link => link.start > styleAt)) {
            errors.push(path + ': production external stylesheet appears after inline <style>.');
        }
    }
}

function verifyProject() {
    runSelfChecks();

    const errors = [];
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
        const cssSource = readFileSync(join(ROOT, path), 'utf8');
        const parsed = parseCssText(cssSource, path);
        totalRules += parsed.rules.length;
        importantCount += parsed.declarations.filter(declaration => hasImportantPriority(declaration.value)).length;
        customPropertyDefinitions += parsed.declarations.filter(declaration => declaration.property.startsWith('--')).length;

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
        if (BASELINE.layerMigrationStatus === 'complete') {
            const targetLayer = baselineFile.targetLayer;
            if (!targetLayer || Object.keys(normalizedLayerCounts).length !== 1
                || Object.keys(normalizedLayerCounts)[0] !== targetLayer) {
                errors.push(path + ': all ordinary rules must be in the single registered target layer.');
            }
            if (parsed.rules.some(rule => rule.layer !== targetLayer)) {
                errors.push(path + ': ordinary CSS rule escaped its registered target layer.');
            }
            if (parsed.keyframes.some(keyframe => keyframe.layer !== targetLayer)) {
                errors.push(path + ': keyframes must be inside the registered target layer.');
            }
            try {
                if (transformCssFile(path, cssSource, targetLayer) !== cssSource) {
                    errors.push(path + ': CSS layer migration transform is not idempotent.');
                }
            } catch (error) {
                errors.push(path + ': CSS layer migration transform failed: ' + error.message);
            }
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
                key + ' differs from the reviewed CSS debt baseline (' + delta.added.length
                + ' added, ' + delta.removed.length + ' removed); update it only in the same reviewed CSS migration change.',
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
    console.log('  stylesheet source order, strict target layers, and migration idempotence match the reviewed baseline.');
}

verifyProject();
