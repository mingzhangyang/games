import { parse } from 'parse5';
import { parseCssText } from './baseline-adapter.mjs';
const normalizeValue = value => value.replace(/\s+/g, ' ').trim();

export function parseHtmlElements(html) {
    const document = parse(html, {
        sourceCodeLocationInfo: true,
        scriptingEnabled: true,
    });
    const elements = [];

    function visit(node) {
        if (node?.tagName && node.sourceCodeLocation) elements.push(node);
        for (const child of node?.childNodes || []) visit(child);
        // Do not walk template.content: CSS there is inert until instantiated.
    }

    visit(document);
    return elements;
}

export function htmlElementAttributes(element) {
    const attributes = {};
    for (const attribute of element.attrs || []) {
        const name = attribute.prefix
            ? attribute.prefix + ':' + attribute.name
            : attribute.name;
        // parse5 already applies HTML tokenizer semantics here: character
        // references are decoded and later duplicate attributes are discarded.
        if (!Object.hasOwn(attributes, name)) attributes[name] = attribute.value;
    }
    return attributes;
}

export function htmlTagName(element) {
    return String(element.tagName || element.nodeName || '').toLowerCase();
}

export function styleElementSource(html, element, file) {
    const location = element.sourceCodeLocation;
    const start = location?.startTag?.endOffset;
    const end = location?.endTag?.startOffset ?? location?.endOffset;
    if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) {
        throw new Error('Unable to determine <style> source range in ' + file);
    }
    return html.slice(start, end);
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

export function scanHtml(path, html) {
    const elements = parseHtmlElements(html);
    const links = [];
    const styleBlocks = [];
    const inlineRules = [];
    const inlineAttributes = [];
    const tagOccurrences = new Map();

    for (const element of elements) {
        const tagName = htmlTagName(element);
        const attributes = htmlElementAttributes(element);

        if (tagName === 'link'
            && (attributes.rel || '').toLowerCase().split(/\s+/).includes('stylesheet')
            && attributes.href) {
            links.push(stylesheetLinkSignature(attributes));
        }

        if (tagName === 'style') {
            const styleSource = styleElementSource(html, element, path);
            const source = styleSource.replace(/\r\n/g, '\n').trim();
            const index = styleBlocks.length;
            const styleAttributes = normalizeLinkAttributes(attributes);
            styleBlocks.push(styleAttributes.length
                ? [path, index, styleAttributes, source]
                : [path, index, source]);
            const parsed = parseCssText(styleSource, path + '#style[' + index + ']');
            for (const rule of parsed.rules) {
                inlineRules.push([path + '#style[' + index + ']', rule.context.join(' / '), rule.selector]);
            }
        }

        const occurrence = tagOccurrences.get(tagName) || 0;
        tagOccurrences.set(tagName, occurrence + 1);
        if (Object.hasOwn(attributes, 'style')) {
            const identity = attributes.id ? tagName + '#' + attributes.id : tagName + '@' + occurrence;
            inlineAttributes.push([path, identity, normalizeValue(attributes.style)]);
        }
    }

    return { links, styleBlocks, inlineRules, inlineAttributes };
}
