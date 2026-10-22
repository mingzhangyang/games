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

function groupAttrs(chrome, key, fallback) {
    return chrome[key + 'Attrs'] || { class: fallback };
}

/**
 * Render the complete `<header>`, preserving each game-specific id, attribute, SVG,
 * initial disabled state and contextual-restart hidden class. Home always first;
 * right actions appear in the explicit registry order with Sound last.
 */
export function renderTopbar(game, indent = '        ') {
    const chrome = game.chrome;
    if (!chrome || !chrome.home || !chrome.name || !Array.isArray(chrome.actions)) {
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
