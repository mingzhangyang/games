import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PROPERTIES = require('mdn-data/css/properties.json');
const SHORTHAND_FIELDS = ['initial', 'computed', 'animationType', 'percentages'];
const CACHE = new Map();
const WILDCARD = '*';

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

function canonicalLogicalSlot(property) {
    if (/^-(?:webkit|moz|ms|o)-/.test(property)) return WILDCARD;

    const edge = property.match(
        /^(margin|padding|scroll-margin|scroll-padding)-(?:top|right|bottom|left|block(?:-(?:start|end))?|inline(?:-(?:start|end))?)$/,
    );
    if (edge) return edge[1] + ':edge';

    if (/^(?:top|right|bottom|left)$/.test(property)
        || /^inset-(?:block|inline)(?:-(?:start|end))?$/.test(property)) {
        return 'inset:edge';
    }

    const border = property.match(
        /^border-(?:(?:top|right|bottom|left)|(?:block|inline)(?:-(?:start|end))?)-(width|style|color)$/,
    );
    if (border) return 'border:' + border[1] + ':edge';

    if (/^border-(?:(?:top|bottom)-(?:left|right)|(?:start|end)-(?:start|end))-radius$/.test(property)) {
        return 'border:radius:corner';
    }

    if (/^(?:width|height|block-size|inline-size)$/.test(property)) return 'size';
    if (/^(?:min-width|min-height|min-block-size|min-inline-size)$/.test(property)) return 'min-size';
    if (/^(?:max-width|max-height|max-block-size|max-inline-size)$/.test(property)) return 'max-size';

    if (/^(?:overflow-x|overflow-y|overflow-block|overflow-inline)$/.test(property)) return 'overflow:axis';
    if (/^overscroll-behavior-(?:x|y|block|inline)$/.test(property)) return 'overscroll-behavior:axis';
    if (/^contain-intrinsic-(?:width|height|block-size|inline-size)$/.test(property)) {
        return 'contain-intrinsic:size';
    }

    const legacyBreak = {
        'page-break-before': 'break-before',
        'page-break-after': 'break-after',
        'page-break-inside': 'break-inside',
    }[property];
    if (legacyBreak) return legacyBreak;

    // A logical property family not explicitly modeled above is unsafe to split.
    // Failing closed is preferable to silently inventing a physical mapping.
    if (/(?:^|-)(?:block|inline)(?:-|$)/.test(property)) return WILDCARD;
    return property;
}

function expandProperty(property, stack = new Set()) {
    if (property.startsWith('--')) return new Set(['custom:' + property]);
    if (property === 'all') return new Set([WILDCARD]);
    if (!PROPERTIES[property]) return new Set([WILDCARD]);
    if (stack.has(property)) return new Set([WILDCARD]);

    const children = shorthandChildren(property);
    if (!children.length) return new Set([canonicalLogicalSlot(property)]);

    const next = new Set(stack);
    next.add(property);
    const out = new Set();
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
