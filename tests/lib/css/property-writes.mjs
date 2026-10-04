import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PROPERTIES = require('mdn-data/css/properties.json');
const SHORTHAND_FIELDS = ['initial', 'computed', 'animationType', 'percentages'];
const CACHE = new Map();
const WILDCARD = '*';
let SHORTHANDS = null;
const EDGES = ['top', 'right', 'bottom', 'left'];
const CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];

const ALIASES = new Map([
    ['word-wrap', 'overflow-wrap'],
    ['grid-gap', 'gap'],
    ['grid-row-gap', 'row-gap'],
    ['grid-column-gap', 'column-gap'],
    ['page-break-before', 'break-before'],
    ['page-break-after', 'break-after'],
    ['page-break-inside', 'break-inside'],
]);

function shorthandChildren(property) {
    const entry = PROPERTIES[property];
    if (!entry) return [];
    const children = new Set();
    for (const field of SHORTHAND_FIELDS) {
        const value = entry[field];
        if (!Array.isArray(value)) continue;
        for (const item of value) {
            if (typeof item === 'string' && item !== property && PROPERTIES[item]) children.add(item);
        }
    }
    return [...children];
}

function shorthandFamilies(property) {
    if (!SHORTHANDS) {
        SHORTHANDS = Object.keys(PROPERTIES)
            .filter(name => shorthandChildren(name).length)
            .sort((a, b) => b.length - a.length);
    }
    return new Set(SHORTHANDS
        .filter(shorthand => property.startsWith(shorthand + '-'))
        .map(shorthand => 'shorthand:' + shorthand));
}

function withFamilies(property, slots) {
    for (const family of shorthandFamilies(property)) slots.add(family);
    return slots;
}

const edgeSlots = family => new Set(EDGES.map(edge => family + ':' + edge));
const cornerSlots = family => new Set(CORNERS.map(corner => family + ':' + corner));

function leafSlots(property) {
    const alias = ALIASES.get(property);
    if (alias) return expandProperty(alias);

    const vendor = property.match(/^-(?:webkit|moz|ms|o)-(.+)$/);
    if (vendor) {
        if (PROPERTIES[vendor[1]]) return expandProperty(vendor[1]);
        return new Set([WILDCARD]);
    }

    let match = property.match(/^(margin|padding|scroll-margin|scroll-padding)-(top|right|bottom|left)$/);
    if (match) return new Set([match[1] + ':' + match[2]]);

    match = property.match(/^(margin|padding|scroll-margin|scroll-padding)-(?:block|inline)-(?:start|end)$/);
    if (match) return edgeSlots(match[1]);

    match = property.match(/^border-(top|right|bottom|left)-(width|style|color)$/);
    if (match) return new Set(['border:' + match[2] + ':' + match[1]]);

    match = property.match(/^border-(?:block|inline)-(?:start|end)-(width|style|color)$/);
    if (match) return edgeSlots('border:' + match[1]);

    match = property.match(/^border-(top|right|bottom|left)-(?:left|right|top|bottom)-radius$/);
    if (match) {
        const corner = property.slice('border-'.length, -'-radius'.length);
        return new Set(['border:radius:' + corner]);
    }
    if (/^border-(?:start|end)-(?:start|end)-radius$/.test(property)) {
        return cornerSlots('border:radius');
    }

    if (/^(?:top|right|bottom|left)$/.test(property)) return new Set(['inset:' + property]);
    if (/^inset-(?:block|inline)-(?:start|end)$/.test(property)) return edgeSlots('inset');

    const physicalSize = {
        width: 'size:width',
        height: 'size:height',
        'min-width': 'min-size:width',
        'min-height': 'min-size:height',
        'max-width': 'max-size:width',
        'max-height': 'max-size:height',
        'contain-intrinsic-width': 'contain-intrinsic:size:width',
        'contain-intrinsic-height': 'contain-intrinsic:size:height',
    }[property];
    if (physicalSize) return new Set([physicalSize]);

    const logicalSize = {
        'inline-size': ['size:width', 'size:height'],
        'block-size': ['size:width', 'size:height'],
        'min-inline-size': ['min-size:width', 'min-size:height'],
        'min-block-size': ['min-size:width', 'min-size:height'],
        'max-inline-size': ['max-size:width', 'max-size:height'],
        'max-block-size': ['max-size:width', 'max-size:height'],
        'contain-intrinsic-inline-size': ['contain-intrinsic:size:width', 'contain-intrinsic:size:height'],
        'contain-intrinsic-block-size': ['contain-intrinsic:size:width', 'contain-intrinsic:size:height'],
    }[property];
    if (logicalSize) return new Set(logicalSize);

    if (/^overflow-[xy]$/.test(property)) return new Set(['overflow:' + property.at(-1)]);
    if (/^overflow-(?:block|inline)$/.test(property)) return new Set(['overflow:x', 'overflow:y']);

    if (/^overscroll-behavior-[xy]$/.test(property)) {
        return new Set(['overscroll-behavior:' + property.at(-1)]);
    }
    if (/^overscroll-behavior-(?:block|inline)$/.test(property)) {
        return new Set(['overscroll-behavior:x', 'overscroll-behavior:y']);
    }

    // New logical families that MDN knows about but this model has not explicitly
    // mapped are unsafe to split. This is intentionally fail-closed.
    if (/(?:^|-)(?:block|inline)(?:-|$)/.test(property)) return new Set([WILDCARD]);
    return new Set([property]);
}

function expandProperty(property, stack = new Set()) {
    if (property.startsWith('--')) return new Set(['custom:' + property]);
    if (property === 'all') return new Set([WILDCARD]);
    if (!PROPERTIES[property] && !ALIASES.has(property)) return new Set([WILDCARD]);
    if (stack.has(property)) return new Set([WILDCARD]);

    const children = shorthandChildren(property);
    if (!children.length) return withFamilies(property, leafSlots(property));

    const next = new Set(stack);
    next.add(property);
    const out = new Set(['shorthand:' + property]);
    for (const child of children) {
        for (const slot of expandProperty(child, next)) out.add(slot);
    }
    return out.size ? out : new Set([WILDCARD]);
}

export function propertyWriteSet(property) {
    if (!CACHE.has(property)) CACHE.set(property, expandProperty(property));
    return new Set(CACHE.get(property));
}

export function propertiesOverlap(left, right) {
    if (left === right) return true;
    const leftCustom = left.startsWith('--');
    const rightCustom = right.startsWith('--');
    if (leftCustom || rightCustom) return leftCustom && rightCustom && left === right;

    const a = propertyWriteSet(left);
    const b = propertyWriteSet(right);
    if (a.has(WILDCARD) || b.has(WILDCARD)) return true;
    for (const slot of a) if (b.has(slot)) return true;
    return false;
}
