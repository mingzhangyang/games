import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseStylesheet, normalizeFragment } from './model.mjs';
import { parseHtmlElements, htmlElementAttributes, htmlTagName, styleElementSource } from './html-inputs.mjs';

const SNAPSHOT_SHA256 = '8e95e837a3230b7e02653de9549cebe471a57b1936b0ab2e3abd09ca258df56d';
export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function htmlCascadeModel(html, file) {
    const inputs = [];
    const occurrences = new Map();
    for (const element of parseHtmlElements(html, file)) {
        const tag = htmlTagName(element);
        const attrs = htmlElementAttributes(element);
        const occurrence = occurrences.get(tag) || 0;
        occurrences.set(tag, occurrence + 1);
        const attributes = Object.entries(attrs).sort(([a], [b]) => a.localeCompare(b));
        if (tag === 'base' || (tag === 'link' && (attrs.rel || '').toLowerCase().split(/\s+/).includes('stylesheet'))) {
            inputs.push({ kind: tag, attributes });
        }
        if (tag === 'style') {
            inputs.push({ kind: 'style', attributes, model: parseStylesheet(styleElementSource(html, element, file), file).model });
        }
        if (Object.hasOwn(attrs, 'style')) {
            inputs.push({ kind: 'inline', identity: attrs.id ? tag + '#' + attrs.id : tag + '@' + occurrence,
                value: normalizeFragment(attrs.style) });
        }
    }
    return inputs;
}

// Ordered trees preserve declarations, duplicate rules, parent context and layer
// placement. They supplement P0's lossy tuples; they never replace or rewrite P0.
export function observeSemanticInputs(root, cssPaths, htmlPaths, runtimeStyles) {
    return {
        css: Object.fromEntries(cssPaths.map(file => [file,
            fingerprint(parseStylesheet(readFileSync(join(root, file), 'utf8'), file).model)])),
        html: Object.fromEntries(htmlPaths.map(file => [file,
            fingerprint(htmlCascadeModel(readFileSync(join(root, file), 'utf8'), file))])),
        runtime: Object.fromEntries(runtimeStyles.map(style => [style.id,
            fingerprint(parseStylesheet(style.css, style.id).model)])),
    };
}

export function verifySemanticSnapshot(root, cssPaths, htmlPaths, runtimeStyles, errors) {
    const text = readFileSync(join(root, 'tests/css-semantic-p0-baseline.json'), 'utf8');
    if (createHash('sha256').update(text).digest('hex') !== SNAPSHOT_SHA256) {
        errors.push('Ordered CSS P0 addendum changed; preserve history and review a separate correction.');
        return;
    }
    const baseline = JSON.parse(text);
    const actual = observeSemanticInputs(root, cssPaths, htmlPaths, runtimeStyles);
    for (const kind of ['css', 'html', 'runtime']) {
        for (const file of new Set([...Object.keys(baseline.inputs[kind]), ...Object.keys(actual[kind])])) {
            if (baseline.inputs[kind][file] !== actual[kind][file]) {
                errors.push(file + ': ordered CSS model changed (content, rule order, layer/context or activation inputs). '
                    + 'P2 must supply an explicit migration mapping before this can change.');
            }
        }
    }
}
