// Source of truth: games.config.json `chrome` field, not per-page HTML.
// Shared three-slot structure, built-in icons and action ordering. Pure HTML serialization:
// no runtime DOM injection and no changes to game event handlers.
const ICONS = Object.freeze({
    home: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.3V21h13V9.3"/></svg>',
    sound: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><path d="M4 9v6h4l5 4.5v-15L8 9H4z"/></svg><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M16.5 8.7a4.6 4.6 0 0 1 0 6.6"/><path d="M19 6.2a8.2 8.2 0 0 1 0 11.6"/></svg>',
    'sound-no-stroke': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 9v6h4l5 4.5v-15L8 9H4z"/></svg><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M16.5 8.7a4.6 4.6 0 0 1 0 6.6"/><path d="M19 6.2a8.2 8.2 0 0 1 0 11.6"/></svg>',
    'pause-rounded': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 5v14M15.5 5v14"/></svg>',
    pause: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M8.5 5v14M15.5 5v14"/></svg>',
    'pause-solid': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4.5" height="16" rx="1.2"/><rect x="13.5" y="4" width="4.5" height="16" rx="1.2"/></svg>',
    restart: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/><path d="M20.5 3.5v4h-4"/></svg>',
    help: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.2 9a2.8 2.8 0 0 1 5.4.9c0 1.8-2.6 2.1-2.6 3.6"/><path d="M12 17h.01"/></svg>',
    stats: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/></svg>',
    range: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
});

function attrs(map) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) {
        throw new Error('topbar attribute map is missing');
    }
    return Object.entries(map).map(([key, value]) => {
        if (!/^[a-zA-Z_:][\w:.-]*$/.test(key)) throw new Error('invalid topbar attribute ' + key);
        if (value !== null && (typeof value !== 'string' || /["<>]/.test(value))) {
            throw new Error('invalid topbar attribute value ' + key);
        }
        return ' ' + key + (value === null ? '' : '="' + value + '"');
    }).join('');
}

function nodeHtml(node, indent, game) {
    if (!node || !['a', 'button', 'div', 'h1', 'span'].includes(node.tag)) {
        throw new Error('invalid topbar node');
    }
    const contentKinds = [node.icon, node.text, node.textFrom, node.children]
        .filter(value => value !== undefined);
    if (contentKinds.length > 1) throw new Error('ambiguous topbar content in ' + game.id);
    const open = indent + '<' + node.tag + attrs(node.attrs) + '>';
    const close = '</' + node.tag + '>';
    if (node.icon) {
        if (!Object.hasOwn(ICONS, node.icon)) throw new Error('unknown topbar icon ' + node.icon);
        const icon = ICONS[node.icon];
        return node.multiline ? open + '\n' + indent + '    ' + icon
            + '\n' + indent + close : open + icon + close;
    }
    if (node.children) {
        return open + '\n' + node.children.map(n => nodeHtml(n, indent + '    ', game)).join('\n')
            + '\n' + indent + close;
    }
    let value = node.text || '';
    if (node.textFrom) {
        if (!['name.en', 'name.zh'].includes(node.textFrom)) {
            throw new Error('unknown topbar label source: ' + node.textFrom);
        }
        value = game.name[node.textFrom.slice(5)];
    }
    return open + value + close;
}

// Canonical defaults for the shared topbar. Page-level configuration stores
// only a role list and true historical exceptions, not repeated HTML tags.
function defaultNode(game, role) {
    const p = game.chrome.classPrefix || game.prefix;
    const cls = p + '-icon-btn game-icon-btn';
    switch (role) {
        case 'home':
            return { tag: 'button', attrs: {
                'data-chrome': 'home', class: cls, id: p + '-btn-home',
                title: 'Home', 'aria-label': 'Home',
            }, icon: 'home' };
        case 'name':
            return { tag: 'div', attrs: {
                class: p + '-brand game-topbar-name', 'data-i18n': 'title',
            }, textFrom: 'name.en' };
        case 'restart':
            return { tag: 'button', attrs: {
                type: 'button', 'data-contextual-restart': 'retry', class: cls + ' hidden',
                id: p + '-reset-btn', title: 'Reset', 'aria-label': 'Reset',
            }, icon: 'restart' };
        case 'stats':
            return { tag: 'button', attrs: {
                'data-chrome': 'stats', type: 'button',
                class: p + '-icon-btn game-icon-btn ' + p + '-stats-btn game-stats-btn',
                id: p + 'StatsToggle', 'aria-label': 'Stats',
                'aria-haspopup': 'dialog', 'aria-expanded': 'false',
                'aria-controls': p + 'StatsDrawer',
            } };
        case 'pause':
            return { tag: 'button', attrs: {
                'data-chrome': 'pause', class: cls, id: p + '-pause-btn',
                title: 'Pause', 'aria-label': 'Pause',
            }, icon: 'pause' };
        case 'sound':
            return { tag: 'button', attrs: {
                type: 'button', class: cls, id: p + '-mute-btn',
                'data-chrome': 'sound', title: 'Sound', 'aria-label': 'Sound',
            }, icon: 'sound' };
        default:
            return null; // The few page-only buttons declare an explicit node.
    }
}

const CONTENT_KEYS = ['icon', 'text', 'textFrom', 'children'];
const ACTION_ROLES = new Set([
    'restart', 'theme', 'help', 'range', 'speed', 'stats', 'pause', 'sound',
]);

function applyNodeOverride(base, patch, role) {
    if (Array.isArray(patch)) {
        if (role !== 'name') throw new Error('array override allowed only for the title');
        return patch;
    }
    if (!base && (!patch?.tag || !patch?.attrs)) {
        throw new Error('special topbar action requires tag + attrs: ' + role);
    }
    const node = base ? { ...base, attrs: { ...base.attrs } } : { tag: patch.tag, attrs: {} };
    if (!patch) return node;
    if (patch.tag !== undefined) node.tag = patch.tag;
    if (patch.replaceAttrs) {
        if (!patch.attrs) throw new Error('replaceAttrs requires attrs: ' + role);
        node.attrs = { ...patch.attrs }; // Keep historical attribute insertion order.
    } else {
        Object.assign(node.attrs, patch.attrs || {});
    }
    for (const key of patch.omitAttrs || []) {
        if (!Object.hasOwn(node.attrs, key)) {
            throw new Error('cannot omit missing topbar attribute ' + role + '.' + key);
        }
        delete node.attrs[key];
    }
    const added = CONTENT_KEYS.filter(k => Object.hasOwn(patch, k) && patch[k] !== null);
    if (added.length > 1) throw new Error('ambiguous topbar override: ' + role);
    if (added.length) for (const key of CONTENT_KEYS) delete node[key];
    for (const key of [...CONTENT_KEYS, 'multiline']) {
        if (Object.hasOwn(patch, key)) {
            if (patch[key] === null) delete node[key];
            else node[key] = patch[key];
        }
    }
    return node;
}

/** Expand role defaults and sparse overrides before every static render.
 * The generator and new-game scaffold share exactly this expansion.
 */
export function expandTopbarChrome(game) {
    const chrome = game.chrome;
    if (!chrome || !Array.isArray(chrome.actions)) {
        throw new Error('game ' + game.id + ' must declare chrome.actions');
    }
    const actions = chrome.actions;
    if (actions.some(role => !ACTION_ROLES.has(role))
        || new Set(actions).size !== actions.length) {
        throw new Error('invalid or duplicate topbar action role: ' + game.id);
    }
    const overrides = chrome.overrides || {};
    const active = ['home', 'name', ...actions];
    for (const role of Object.keys(overrides)) {
        if (!active.includes(role)) throw new Error('unused topbar override: ' + game.id + '.' + role);
    }
    const node = role => applyNodeOverride(defaultNode(game, role), overrides[role], role);
    return {
        ...chrome,
        home: node('home'),
        name: node('name'),
        actions: actions.map(role => ({ role, ...node(role) })),
    };
}

function groupAttrs(chrome, key, fallback) {
    return chrome[key + 'Attrs'] || { class: fallback };
}

/**
 * Render the complete `<header>`, preserving each game-specific id, attribute, SVG,
 * initial disabled state and contextual-restart hidden class. Home always first;
 * right actions appear in the explicit registry order with Sound last.
 */
export function renderTopbar(game, indent = '        ') {
    const chrome = expandTopbarChrome(game);
    if (!chrome.home || !chrome.name || !Array.isArray(chrome.actions)) {
        throw new Error('game ' + game.id + ' must define chrome in the registry');
    }
    if (chrome.home.attrs['data-chrome'] !== 'home') {
        throw new Error('topbar Home missing for ' + game.id);
    }
    const actions = chrome.actions;
    if (actions.at(-1)?.role !== 'sound'
        || actions.filter(a => a.role === 'sound').length !== 1) {
        throw new Error('topbar Sound must occur exactly once, last: ' + game.id);
    }
    const roles = actions.map(a => a.role);
    const positions = roles.filter(r => ['stats', 'pause', 'sound'].includes(r))
        .map(r => ['stats', 'pause', 'sound'].indexOf(r));
    if (positions.some((p, i) => i > 0 && p <= positions[i - 1])) {
        throw new Error('topbar actions out of order: ' + game.id);
    }
    const p = chrome.classPrefix || game.prefix;
    const header = groupAttrs(chrome, 'header', p + '-topbar game-topbar');
    const left = groupAttrs(chrome, 'left', p + '-topbar-lead game-topbar-group');
    const center = groupAttrs(chrome, 'center', p + '-topbar-center game-topbar-center');
    const right = groupAttrs(chrome, 'right', p + '-topbar-actions game-topbar-group');
    const mid = indent + '    ';
    const inner = mid + '    ';
    return [
        indent + '<header' + attrs(header) + '>',
        mid + '<div' + attrs(left) + '>',
        nodeHtml(chrome.home, inner, game),
        ...(chrome.leftExtra || []).map(n => nodeHtml(n, inner, game)),
        mid + '</div>',
        mid + '<div' + attrs(center) + '>',
        ...[chrome.name].flat().map(n => nodeHtml(n, inner, game)),
        mid + '</div>',
        mid + '<div' + attrs(right) + '>',
        ...actions.map(a => nodeHtml(a, inner, game)),
        mid + '</div>',
        indent + '</header>',
    ].join('\n');
}
