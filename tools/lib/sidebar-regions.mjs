// Card-sized siblings reuse the shell parser/marker guards and batch writer.
import { parse } from 'parse5';
import { sidebarOptions, sidebarCards, renderSidebarCard } from '../../src/platform/shell/render-sidebar.js';
import { nodesOf, markerRange, lineIndent, validatePageBindings } from './shell-regions.mjs';

const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const classes = node => (attr(node, 'class') || '').split(/\s+/).filter(Boolean);
const hasClass = (node, name) => classes(node).includes(name);
const elements = node => (node.childNodes || []).filter(child => child.tagName);
const content = nodes => nodes.filter(node => node.nodeName !== '#comment'
    && !(node.nodeName === '#text' && !node.value.trim()));
const textContent = node => node.nodeName === '#text' ? node.value
    : (node.childNodes || []).map(textContent).join('');

function requireAttrs(node, allowed, classNames, label) {
    if ((node.attrs || []).some(item => !allowed.includes(item.name))
        || classes(node).some(name => !classNames.includes(name))) {
        throw new Error(label + ': card contains page-owned attributes');
    }
}

// Recognize the old family independently of the new template. A stray rich
// card, extra ID-less paragraph, controls or custom legend must never be erased.
function validateOwnership(node, card, game, label) {
    const p = game.prefix;
    if (node.tagName !== 'div' || !hasClass(node, 'game-side-card')) throw new Error(label + ': expected one complete card');
    requireAttrs(node, ['class'], [`${p}-side-card`, 'game-side-card'], label);
    const slots = card.kind === 'more' ? [`${p}SideMore`]
        : [`${p}-side-${card.kind}-title`, `${p}-side-${card.kind}`];
    if (card.kind === 'howto') slots.push(`${p}-side-science`);
    const children = content(node.childNodes || []);
    if (children.length < (card.kind === 'more' ? 1 : 2)
        || children.some(child => !child.tagName || !slots.includes(attr(child, 'id')))
        || new Set(children.map(child => attr(child, 'id'))).size !== children.length) {
        throw new Error(label + ': unrelated content interrupts the sidebar card');
    }
    for (const child of children) {
        const id = attr(child, 'id');
        const title = id.endsWith('-title');
        const howto = id === `${p}-side-howto` || id === `${p}-side-science`;
        const expectedTag = title ? 'div' : howto ? 'p' : card.kind === 'more' ? 'nav' : 'div';
        const allowedClasses = title ? [`${p}-side-title`, 'game-side-title']
            : howto ? [`${p}-side-text`, 'game-side-text', 'sci-howto-steps', 'sci-howto-science']
                : card.kind === 'more' ? ['more-games']
                    : [`${p}-side-${card.kind}`, `game-side-${card.kind}`];
        if (child.tagName !== expectedTag) throw new Error(label + ': unexpected card slot element');
        requireAttrs(child, ['class', 'id', 'data-i18n', 'data-i18n-touch'], allowedClasses, label);
        const inner = elements(child);
        if (title) {
            if (inner.length > 1 || inner.some(item => item.tagName !== 'span' || elements(item).length
                || !/^[A-Za-z][\w.-]*$/.test(attr(item, 'data-i18n') || ''))) {
                throw new Error(label + ': custom title content');
            }
            for (const span of inner) requireAttrs(span, ['data-i18n'], [], label);
        } else if (inner.length || (!howto && content(child.childNodes || []).length)) {
            throw new Error(label + ': custom content in generated card slot');
        }
    }
}

// First installation has no ownership marker yet. Only adopt the declared
// bindings/copy, so ID-less notes and a game's own text binding cannot vanish.
// Marked cards remain registry-owned and can receive later copy/key changes.
function validateInitialCopy(node, card, game, label) {
    const options = sidebarOptions(game);
    const copy = options[card.kind] || {};
    const p = game.prefix;
    const fail = () => { throw new Error(label + ': initial card text or binding differs from declaration'); };
    const checkSlot = (slot, key, touchKey, text = '') => {
        if (attr(slot, 'data-i18n') !== key || attr(slot, 'data-i18n-touch') !== touchKey
            || textContent(slot) !== text) fail();
    };
    for (const child of elements(node)) {
        const id = attr(child, 'id');
        if (id.endsWith('-title')) {
            const key = copy.titleKey || (card.kind === 'legend' ? 'legendTitle'
                : card.kind === 'howto' ? 'sideHowTo' : 'sideRecords');
            const text = copy.titleText || '';
            const icon = options.headingIcons && card.kind !== 'legend' ? (card.kind === 'howto' ? '📖' : '🏅') : '';
            const span = elements(child)[0];
            // PM / HS / GD and Lumen historically let JS fill an empty title.
            if (!span && !text && !textContent(child).trim()
                && attr(child, 'data-i18n') === undefined && attr(child, 'data-i18n-touch') === undefined) continue;
            if (span) {
                const index = child.childNodes.indexOf(span);
                const before = child.childNodes.slice(0, index).map(textContent).join('').trim();
                const after = child.childNodes.slice(index + 1).map(textContent).join('').trim();
                if (before !== icon || after || attr(child, 'data-i18n') !== undefined
                    || attr(child, 'data-i18n-touch') !== undefined) fail();
                checkSlot(span, key, undefined, text);
            } else {
                if (icon) fail();
                checkSlot(child, key, undefined, text);
            }
        } else if (id === `${p}-side-howto`) {
            checkSlot(child, copy.textKey || 'howto', copy.touchKey, copy.text || '');
        } else if (id === `${p}-side-science`) {
            checkSlot(child, copy.scienceKey, undefined);
        } else {
            checkSlot(child, undefined, undefined);
        }
    }
}

/** Returns a candidate only; gen-from-registry validates every page before writing. */
export function transformSidebarRegions(source, game) {
    const cards = sidebarCards(game);
    const nodes = nodesOf(parse(source, { sourceCodeLocationInfo: true }));
    const regions = new Set(cards.map(card => card.region));
    for (const node of nodes) {
        if (node.nodeName === '#comment' && /^registry:(?:begin|end) sidebar-/.test(node.data.trim())
            && !regions.has(node.data.trim().split(/\s+/)[1])) {
            throw new Error(game.id + ': unexpected or undeclared sidebar region');
        }
    }
    const newline = source.includes('\r\n') ? '\r\n' : '\n';
    const edits = [];
    const panels = nodes.find(node => attr(node, 'id') === `${game.prefix}StatsPanels`);
    const sidebar = nodes.find(node => hasClass(node, 'game-sidebar'));
    const lastOffset = new Map();
    for (const card of cards) {
        const label = `${game.id}/${card.region}`;
        const targets = nodes.filter(node => attr(node, 'id') === card.targetId);
        if (targets.length !== 1) throw new Error(label + ': expected one card target');
        let node = targets[0];
        while (node && !hasClass(node, 'game-side-card')) node = node.parentNode;
        const host = card.area === 'panels' ? panels : sidebar;
        if (!node || !host || node.parentNode !== host) throw new Error(label + ': card is in the wrong host');
        validateOwnership(node, card, game, label);
        const marker = markerRange(source, nodes, card.region, label);
        if (!marker) validateInitialCopy(node, card, game, label);
        const loc = node.sourceCodeLocation;
        if (!loc?.endTag) throw new Error(label + ': card has no explicit closing tag');
        if (loc.startOffset < (lastOffset.get(card.area) ?? -1)) {
            throw new Error(label + ': declared card order differs from the page-owned container');
        }
        lastOffset.set(card.area, loc.startOffset);
        if (marker && (content(marker.nodes).length !== 1 || content(marker.nodes)[0] !== node)) {
            throw new Error(label + ': region must own only its declared card');
        }
        const range = marker || { ...lineIndent(source, loc.startOffset, label), end: loc.endOffset };
        const html = renderSidebarCard(game, card.kind, range.indent).replace(/\n/g, newline);
        edits.push({ ...range, content: range.indent + `<!-- registry:begin ${card.region} -->` + newline
            + html + newline + range.indent + `<!-- registry:end ${card.region} -->` });
    }
    edits.sort((a, b) => b.start - a.start);
    let result = source, last = source.length;
    for (const edit of edits) {
        if (edit.end > last) throw new Error(game.id + ': overlapping sidebar regions');
        result = result.slice(0, edit.start) + edit.content + result.slice(edit.end);
        last = edit.start;
    }
    if (cards.length) validatePageBindings(source, result, game.id);
    return { src: result, state: result === source ? 'clean' : 'written' };
}
