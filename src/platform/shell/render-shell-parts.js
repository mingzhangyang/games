// Static shell regions shared by registry generation and the new-game scaffold.
// Configuration describes component choices and sparse historical exceptions;
// it never contains HTML nodes, event handlers or a second list of script URLs.

function escape(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function object(value, allowed, label) {
    if (value === undefined) return {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(label + ' must be an object');
    }
    for (const key of Object.keys(value)) {
        if (!allowed.includes(key)) throw new Error('unknown ' + label + ' field: ' + key);
    }
    return value;
}

function options(game) {
    const shell = object(game.shell, ['styles', 'footer', 'drawer', 'results'], 'shell');
    const styles = object(shell.styles, ['page', 'scienceShowcase', 'stageStatus'], 'shell.styles');
    if (shell.results !== undefined && !['over', 'both'].includes(shell.results)) {
        throw new Error('shell.results must be over or both');
    }
    const footer = object(shell.footer,
        ['classPrefix', 'hintClass', 'id', 'key', 'touchKey', 'text'], 'shell.footer');
    const drawer = object(shell.drawer, ['idBase', 'i18n'], 'shell.drawer');
    for (const key of ['scienceShowcase', 'stageStatus']) {
        if (styles[key] !== undefined && typeof styles[key] !== 'boolean') {
            throw new Error('shell.styles.' + key + ' must be boolean');
        }
    }
    if (styles.page !== undefined && (typeof styles.page !== 'string'
        || !/^css\/[a-z0-9][a-z0-9-]*\.css$/i.test(styles.page))) {
        throw new Error('shell.styles.page must name a local page stylesheet');
    }
    for (const key of ['classPrefix', 'hintClass', 'id', 'key', 'touchKey']) {
        const value = footer[key];
        if (value !== undefined && value !== null
            && (typeof value !== 'string' || !/^[A-Za-z][\w:.-]*$/.test(value))) {
            throw new Error('shell.footer.' + key + ' must be a name or null');
        }
    }
    if (footer.text !== undefined && typeof footer.text !== 'string') {
        throw new Error('shell.footer.text must be plain text');
    }
    if (drawer.idBase !== undefined && (typeof drawer.idBase !== 'string'
        || !/^[A-Za-z][\w-]*$/.test(drawer.idBase))) {
        throw new Error('shell.drawer.idBase must be an ID prefix');
    }
    if (drawer.i18n !== undefined && typeof drawer.i18n !== 'boolean') {
        throw new Error('shell.drawer.i18n must be boolean');
    }
    if (shell.drawer !== undefined && !(game.caps || []).includes('drawer')) {
        throw new Error('shell.drawer requires the drawer capability');
    }
    return { styles, footer, drawer };
}

/** Local stylesheet links only. Page-owned font/preconnect links stay outside. */
export function renderStylesheets(game, indent = '    ') {
    const { styles } = options(game);
    const sheets = ['css/tokens.css', 'css/layout.css'];
    if (styles.scienceShowcase) sheets.push('css/science-showcase.css');
    sheets.push(styles.page || `css/${game.id}.css`);
    if (game.scores?.ui === 'dialog') sheets.push('css/scoreboard-dialog.css');
    if (styles.stageStatus !== false) sheets.push('css/stage-status.css');
    sheets.push('css/mobile-fit.css', 'css/more-games.css');
    return sheets.map(href => `${indent}<link rel="stylesheet" href="${escape(href)}">`).join('\n');
}

/** Hint-only footer; null omits a historical attribute instead of inventing one. */
export function renderFooter(game, indent = '    ') {
    const { footer } = options(game);
    const prefix = game.chrome?.classPrefix || game.prefix;
    const classPrefix = footer.classPrefix === undefined ? prefix : footer.classPrefix;
    const hintClass = footer.hintClass === undefined
        ? (classPrefix ? `${classPrefix}-footer-hint` : null) : footer.hintClass;
    const id = footer.id === undefined ? `${prefix}-hint` : footer.id;
    const key = footer.key === undefined ? 'hint' : footer.key;
    const touchKey = footer.touchKey === undefined ? 'hintTouch' : footer.touchKey;
    const footerClasses = (classPrefix ? `${classPrefix}-footer ` : '') + 'game-footer';
    const hintClasses = (hintClass ? hintClass + ' ' : '') + 'game-footer-hint';
    const attrs = ` class="${escape(hintClasses)}"`
        + (id === null ? '' : ` id="${escape(id)}"`)
        + (key === null ? '' : ` data-i18n="${escape(key)}"`)
        + (touchKey === null ? '' : ` data-i18n-touch="${escape(touchKey)}"`);
    return `${indent}<footer class="${escape(footerClasses)}">\n`
        + `${indent}    <p${attrs}>${escape(footer.text)}</p>\n`
        + `${indent}</footer>`;
}

/** Drawer structure only; existing game adapters keep all interaction ownership. */
export function renderStatsDrawer(game, indent = '    ') {
    const { drawer } = options(game);
    if (!(game.caps || []).includes('drawer')) return '';
    const base = drawer.idBase || `${game.prefix}Stats`;
    const i18n = drawer.i18n === true;
    const titleBinding = i18n ? ' data-i18n="stats"' : '';
    const closeBinding = i18n ? ' data-i18n-title="close" data-i18n-label="close"' : '';
    const lines = [
        `<div class="game-drawer" id="${escape(base)}Drawer" hidden>`,
        `    <div class="game-drawer-panel" role="dialog" aria-modal="true" aria-labelledby="${escape(base)}DrawerTitle">`,
        '        <div class="game-drawer-handle"></div>',
        '        <div class="game-drawer-head">',
        `            <span class="game-drawer-title" id="${escape(base)}DrawerTitle"${titleBinding}>${i18n ? 'Stats' : ''}</span>`,
        `            <button type="button" class="icon-btn game-icon-btn game-drawer-close" id="${escape(base)}Close"${closeBinding} aria-label="Close"></button>`,
        '        </div>',
        `        <div class="game-drawer-body" id="${escape(base)}DrawerBody"></div>`,
        '    </div>',
        '</div>',
    ];
    return lines.map(line => indent + line).join('\n');
}

/** The module entry remains before the two deferred platform scripts. */
export function renderTailScripts(game, indent = '    ') {
    return [
        `<script type="module" src="${escape(game.entry)}"></script>`,
        '<script src="/analytics.js" defer></script>',
        '<script src="/sw-register.js" defer></script>',
    ].map(line => indent + line).join('\n');
}
