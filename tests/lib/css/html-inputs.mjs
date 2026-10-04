import { parse } from 'parse5';
import { parseCssText } from './baseline-adapter.mjs';
const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const asciiLower = value => value.replace(/[A-Z]/g, character => character.toLowerCase());
const stripAsciiWhitespace = value => value.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '');
// HTML microsyntaxes split, trim and collapse ASCII whitespace only. JavaScript
// \s would also fold NBSP and other Unicode spaces, which HTML keeps as data.
const ASCII_WHITESPACE = /[\t\n\f\r ]+/g;
const normalizeValue = value => stripAsciiWhitespace(value).replace(ASCII_WHITESPACE, ' ');
export const htmlTokens = value => stripAsciiWhitespace(value).split(ASCII_WHITESPACE).filter(Boolean);
// The one stylesheet-link classifier for every consumer (rel is an ASCII
// case-insensitive token set).
export const isStylesheetLink = attributes => htmlTokens(asciiLower(attributes.rel ?? '')).includes('stylesheet');
// https://mimesniff.spec.whatwg.org/#javascript-mime-type
// HTML uses an essence *string match*, not MIME parsing: parameters do not match.
const JAVASCRIPT_TYPES = new Set([
    'application/ecmascript', 'application/javascript', 'application/x-ecmascript', 'application/x-javascript',
    'text/ecmascript', 'text/javascript', 'text/javascript1.0', 'text/javascript1.1', 'text/javascript1.2',
    'text/javascript1.3', 'text/javascript1.4', 'text/javascript1.5', 'text/jscript', 'text/livescript',
    'text/x-ecmascript', 'text/x-javascript',
]);

export function htmlScriptKind(attributes) {
    // https://html.spec.whatwg.org/multipage/scripting.html#prepare-the-script-element
    const hasType = Object.hasOwn(attributes, 'type');
    const type = hasType ? attributes.type === '' ? 'text/javascript' : stripAsciiWhitespace(attributes.type)
        : attributes.language ? 'text/' + attributes.language : 'text/javascript';
    const normalized = asciiLower(type);
    if (JAVASCRIPT_TYPES.has(normalized)) return 'script';
    if (['module', 'importmap', 'speculationrules'].includes(normalized)) return normalized;
    return 'data';
}

export function parseHtmlElements(html, file = 'fixture.html') {
    const document = parse(html, {
        sourceCodeLocationInfo: true,
        scriptingEnabled: true,
    });
    const elements = [];

    function visit(node) {
        if (node?.tagName) {
            const tag = htmlTagName(node);
            const attributes = htmlElementAttributes(node);
            // Our model has one light-DOM cascade scope. Reject mechanisms that
            // create another scope/document instead of treating them as inert.
            if (tag === 'template' && Object.hasOwn(attributes, 'shadowrootmode')) {
                throw new Error(file + ': declarative Shadow DOM requires an explicit scoped stylesheet contract');
            }
            if (['iframe', 'frame', 'object', 'embed'].includes(tag)) {
                throw new Error(file + ': embedded documents require an explicit stylesheet/source contract');
            }
            // Pragmas (CSP, default-style, content-type, refresh, ...) change which
            // stylesheets/scripts activate or how they decode. None is modeled yet.
            if (tag === 'meta' && Object.hasOwn(attributes, 'http-equiv')) {
                throw new Error(file + ': <meta http-equiv> pragmas require an explicit activation contract');
            }
            if (node.namespaceURI !== HTML_NAMESPACE && ['script', 'style', 'link'].includes(tag)) {
                throw new Error(file + ': foreign-namespace scripting/styles require an explicit source contract');
            }
            // HTML recovery can merge attributes from a later <body> token onto
            // an implied body with no source location. Such attributes still run.
            elements.push(node);
        }
        for (const child of node?.childNodes || []) visit(child);
        // Ordinary template.content is inert. Declarative roots were rejected above.
    }

    visit(document);
    return elements;
}

// Document-level directives that change how the page's stylesheets decode or
// evaluate: the encoding is the fallback for linked CSS, the viewport sizes
// media queries, color-scheme sets the used scheme. (Pragmas are rejected above;
// <base> is part of the ordered HTML model.) Selector-matched DOM state such as
// class/lang/dir attributes is outside the stylesheet-input model.
const META_DIRECTIVES = new Set(['viewport', 'color-scheme', 'supported-color-schemes']);
export function htmlDocumentDirectives(html, file = 'fixture.html') {
    const directives = [];
    for (const element of parseHtmlElements(html, file)) {
        if (htmlTagName(element) !== 'meta') continue;
        const attrs = htmlElementAttributes(element);
        if (Object.hasOwn(attrs, 'charset')) directives.push(['charset', asciiLower(stripAsciiWhitespace(attrs.charset))]);
        const name = asciiLower(stripAsciiWhitespace(attrs.name ?? ''));
        if (META_DIRECTIVES.has(name)) directives.push([name, normalizeValue(attrs.content ?? '')]);
    }
    return directives;
}

// Every audited page and module is addressed by its served URL on one
// synthetic origin. public/ files are served from the site root.
export const AUDIT_ORIGIN = 'https://css-audit.invalid';
export const servedUrl = file => new URL(file.replace(/^public\//, ''), AUDIT_ORIGIN + '/');

// Map an executable URL back to an audited repository file, or null when it is
// outside the local inventory (another origin, data:, unknown path, non-JS).
export function resolveLocalScript(href, auditedFiles) {
    const url = new URL(href);
    if (url.origin !== AUDIT_ORIGIN) return null;
    const path = decodeURIComponent(url.pathname).slice(1);
    return [path, 'public/' + path].find(candidate => auditedFiles.has(candidate)) ?? null;
}

// One HTML execution inventory for the runtime audit and the activation model.
// Attribute values and script child text come from the parser's DOM, not raw
// HTML/entity spellings. Script inputs carry their activation attributes; every
// input carries the base URL its import specifiers resolve against.
export function htmlJavaScriptInputs(html, file = 'fixture.html') {
    const inputs = [];
    const elements = parseHtmlElements(html, file);
    const documentUrl = servedUrl(file);
    let baseUrl = documentUrl;
    const base = elements.find(element => htmlTagName(element) === 'base'
        && Object.hasOwn(htmlElementAttributes(element), 'href'));
    if (base) {
        try { baseUrl = new URL(htmlElementAttributes(base).href, documentUrl); }
        catch { /* Invalid first base URL falls back to the document URL. */ }
    }
    for (const element of elements) {
        const tag = htmlTagName(element);
        const attrs = htmlElementAttributes(element);
        const label = file + ':' + (element.sourceCodeLocation?.startLine ?? 'implied') + ':' + tag;
        for (const [name, value] of Object.entries(attrs)) {
            // Conservatively include every unnamespaced on* attribute, including
            // new browser event names. Function-body grammar allows return/with.
            if (/^on/i.test(name)) {
                inputs.push({ kind: 'handler', file: label + '[' + name + ']', source: value, grammar: 'handler',
                    baseUrl: baseUrl.href });
            }
            if (['href', 'xlink:href', 'src', 'action', 'formaction', 'data', 'codebase'].includes(name)) {
                let url;
                try { url = new URL(value, baseUrl); } catch { continue; }
                if (url.protocol === 'javascript:') {
                    throw new Error(label + '[' + name + ']: javascript: URLs require an explicit source contract');
                }
            }
        }
        if (tag !== 'script') continue;
        const grammar = htmlScriptKind(attrs);
        if (grammar === 'data') continue;
        if (['importmap', 'speculationrules'].includes(grammar)) {
            throw new Error(label + ': ' + grammar + ' requires an explicit script-resolution contract');
        }
        const script = { kind: 'script', file: label, grammar, attributes: normalizeLinkAttributes(attrs),
            baseUrl: baseUrl.href };
        if (Object.hasOwn(attrs, 'src')) {
            inputs.push({ ...script, url: new URL(attrs.src, baseUrl).href });
        } else {
            const source = (element.childNodes || []).filter(child => child.nodeName === '#text')
                .map(child => child.value).join('');
            inputs.push({ ...script, source });
        }
    }
    return inputs;
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
                ? htmlTokens(asciiLower(value)).sort().join(' ')
                : normalizeValue(value),
        ])
        .sort(([left], [right]) => left.localeCompare(right));
}

function stylesheetLinkSignature(attributes) {
    return [attributes.href, normalizeLinkAttributes(attributes)];
}

export function scanHtml(path, html) {
    const elements = parseHtmlElements(html, path);
    const links = [];
    const styleBlocks = [];
    const inlineRules = [];
    const inlineAttributes = [];
    const tagOccurrences = new Map();

    for (const element of elements) {
        const tagName = htmlTagName(element);
        const attributes = htmlElementAttributes(element);

        if (tagName === 'link'
            && isStylesheetLink(attributes)
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
