// Install/update whole, contiguous shell regions using parser source locations.
// Never reconstruct surrounding HTML or match nested elements with a regex.
import { parse, parseFragment } from 'parse5';
import {
    renderStylesheets, renderFooter, renderStatsDrawer, renderTailScripts,
} from '../../src/platform/shell/render-shell-parts.js';

const RENDERERS = {
    stylesheets: renderStylesheets,
    footer: renderFooter,
    'stats-drawer': renderStatsDrawer,
    'tail-scripts': renderTailScripts,
};
const attr = (node, name) => node.attrs?.find(a => a.name === name)?.value;
const hasClass = (node, name) => (attr(node, 'class') || '').split(/\s+/).includes(name);

function nodesOf(document) {
    const nodes = [];
    function visit(node) {
        nodes.push(node);
        for (const child of node.childNodes || []) visit(child);
        if (node.content) visit(node.content);
    }
    visit(document);
    return nodes;
}

/** Check the whole resulting document, independently of the renderer templates. */
export function validatePageBindings(before, after, label = 'page') {
    const oldNodes = nodesOf(parse(before));
    const nodes = nodesOf(parse(after));
    const oldIds = new Set(oldNodes.map(node => attr(node, 'id')).filter(Boolean));
    const ids = new Set();
    for (const node of nodes) {
        const id = attr(node, 'id');
        if (!id) continue;
        if (ids.has(id)) throw new Error(`${label}: duplicate id ${id}`);
        ids.add(id);
    }
    for (const id of oldIds) {
        if (!ids.has(id)) throw new Error(`${label}: existing id would disappear: ${id}`);
    }
    for (const node of nodes) {
        for (const name of ['aria-controls', 'aria-labelledby', 'aria-describedby']) {
            const value = attr(node, name);
            if (!value) continue;
            for (const id of value.trim().split(/\s+/)) {
                if (!ids.has(id)) throw new Error(`${label}: ${name} references missing id ${id}`);
            }
        }
    }
}

function semanticNodes(nodes) {
    return nodes.flatMap(node => {
        if (node.nodeName === '#comment') return [];
        if (node.nodeName === '#text') return node.value.trim() ? [['text', node.value]] : [];
        return [[node.tagName, node.namespaceURI,
            (node.attrs || []).map(a => [a.name, a.value, a.namespace, a.prefix]),
            semanticNodes(node.childNodes || [])]];
    });
}

function targetsFor(nodes, name, game) {
    if (name === 'stylesheets') {
        return nodes.filter(node => node.tagName === 'link'
            && attr(node, 'rel') === 'stylesheet' && /^css\//.test(attr(node, 'href') || ''));
    }
    if (name === 'footer') return nodes.filter(node => hasClass(node, 'game-footer'));
    if (name === 'stats-drawer') return nodes.filter(node => hasClass(node, 'game-drawer'));
    const sources = new Set([game.entry, '/analytics.js', '/sw-register.js']);
    return nodes.filter(node => node.tagName === 'script' && sources.has(attr(node, 'src')));
}

function lineIndent(source, offset, label) {
    const start = source.lastIndexOf('\n', offset - 1) + 1;
    const indent = source.slice(start, offset);
    if (!/^[ \t]*$/.test(indent)) throw new Error(`${label}: region must start on its own line`);
    return { start, indent };
}

function markerRange(source, nodes, name, label) {
    const markers = kind => nodes.filter(node => node.nodeName === '#comment'
        && node.data.trim() === `registry:${kind} ${name}`);
    const begins = markers('begin'), ends = markers('end');
    if (!begins.length && !ends.length) return null;
    if (begins.length !== 1 || ends.length !== 1) {
        throw new Error(`${label}: expected one begin and end marker`);
    }
    const begin = begins[0].sourceCodeLocation, end = ends[0].sourceCodeLocation;
    if (end.startOffset <= begin.endOffset) throw new Error(`${label}: reversed region markers`);
    if (begins[0].parentNode !== ends[0].parentNode) {
        throw new Error(`${label}: region markers must be siblings`);
    }
    const line = lineIndent(source, begin.startOffset, label);
    const closing = lineIndent(source, end.startOffset, label);
    if (closing.indent !== line.indent) throw new Error(`${label}: region marker indentation differs`);
    return { ...line, end: end.endOffset, innerStart: begin.endOffset, innerEnd: end.startOffset };
}

function legacyRange(source, targets, name, label) {
    const expected = name === 'tail-scripts' ? 3 : 1;
    if (!targets.length || (name !== 'stylesheets' && targets.length !== expected)) {
        throw new Error(`${label}: expected ${expected} ${name === 'tail-scripts' ? 'tail scripts' : 'shell block'}`);
    }
    const first = targets[0], last = targets.at(-1);
    const parent = first.parentNode;
    if (targets.some(node => node.parentNode !== parent || !node.sourceCodeLocation)) {
        throw new Error(`${label}: shell region must contain contiguous sibling nodes`);
    }
    const siblings = parent.childNodes.slice(parent.childNodes.indexOf(first), parent.childNodes.indexOf(last) + 1);
    if (siblings.some(node => !targets.includes(node) && node.nodeName !== '#comment'
        && !(node.nodeName === '#text' && !node.value.trim()))) {
        throw new Error(`${label}: unrelated content interrupts the shell region`);
    }
    if (targets.some(node => !['link'].includes(node.tagName) && !node.sourceCodeLocation.endTag)) {
        throw new Error(`${label}: shell block has no explicit closing tag`);
    }
    return { ...lineIndent(source, first.sourceCodeLocation.startOffset, label),
        end: last.sourceCodeLocation.endOffset };
}

/** Return a validated candidate; caller decides when to write the whole batch. */
export function transformShellRegions(source, game) {
    const nodes = nodesOf(parse(source, { sourceCodeLocationInfo: true }));
    const enabled = (game.caps || []).includes('topbar');
    if (!enabled && game.shell !== undefined) throw new Error(`${game.id}: shell configuration requires topbar capability`);
    const edits = [];
    const newline = source.includes('\r\n') ? '\r\n' : '\n';
    for (const [name, render] of Object.entries(RENDERERS)) {
        const label = `${game.id}/${name}`;
        const marker = markerRange(source, nodes, name, label);
        const targets = targetsFor(nodes, name, game);
        if (!enabled || (name === 'stats-drawer' && !(game.caps || []).includes('drawer'))) {
            if (marker || (enabled && targets.length)) throw new Error(`${label}: unexpected shell region without capability`);
            continue;
        }
        if (marker && targets.some(node => {
            const loc = node.sourceCodeLocation;
            return !loc || loc.startOffset < marker.innerStart || loc.endOffset > marker.innerEnd;
        })) throw new Error(`${label}: shell content exists outside its generated region`);
        const range = marker || legacyRange(source, targets, name, label);
        const content = render(game, range.indent).replace(/\r?\n/g, newline);
        if (!marker) {
            const oldDom = semanticNodes(targets);
            const newDom = semanticNodes(parseFragment(content).childNodes);
            if (JSON.stringify(oldDom) !== JSON.stringify(newDom)) {
                throw new Error(`${label}: initial shell migration would change DOM`);
            }
        }
        edits.push({ ...range, content: range.indent + `<!-- registry:begin ${name} -->` + newline
            + content + newline + range.indent + `<!-- registry:end ${name} -->` });
    }
    edits.sort((a, b) => b.start - a.start);
    let result = source, previousStart = source.length;
    for (const edit of edits) {
        if (edit.end > previousStart) throw new Error(`${game.id}: overlapping shell regions`);
        result = result.slice(0, edit.start) + edit.content + result.slice(edit.end);
        previousStart = edit.start;
    }
    if (enabled) validatePageBindings(source, result, game.id);
    return { src: result, state: result === source ? 'clean' : 'written' };
}
