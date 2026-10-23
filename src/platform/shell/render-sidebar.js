// Build-time card templates. Game-owned cards stay outside these regions;
// the existing drawer remains the sole owner of moving StatsPanels.
const PANEL_KINDS = ['howto', 'records'];
const DESKTOP_KINDS = ['legend', 'more'];
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function object(value, keys, label) {
    if (value === undefined) return {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(label + ' must be an object');
    for (const key of Object.keys(value)) {
        if (!keys.includes(key)) throw new Error('unknown ' + label + ' field: ' + key);
    }
    return value;
}

/** Omitted configuration uses the ordinary drawer card family; false is manual. */
export function sidebarOptions(game) {
    const caps = game.caps || [];
    const eligible = caps.includes('sidebar') && caps.includes('drawer');
    if (!eligible && game.sidebar !== undefined) throw new Error('sidebar cards require sidebar and drawer capabilities');
    if (!eligible || game.sidebar === false) return null;
    const options = object(game.sidebar, ['panels', 'desktopOnly', 'headingIcons', 'howto', 'records'], 'sidebar');
    const panels = options.panels === undefined ? PANEL_KINDS : options.panels;
    const desktopOnly = options.desktopOnly === undefined ? ['more'] : options.desktopOnly;
    for (const [key, values, allowed] of [['panels', panels, PANEL_KINDS], ['desktopOnly', desktopOnly, DESKTOP_KINDS]]) {
        if (!Array.isArray(values) || values.some(value => !allowed.includes(value)) || new Set(values).size !== values.length) {
            throw new Error('sidebar.' + key + ' must contain unique supported card roles');
        }
    }
    if (options.headingIcons !== undefined && typeof options.headingIcons !== 'boolean') {
        throw new Error('sidebar.headingIcons must be boolean');
    }
    const howto = object(options.howto, ['titleKey', 'textKey', 'touchKey', 'scienceKey', 'titleText', 'text'], 'sidebar.howto');
    const records = object(options.records, ['titleKey', 'titleText'], 'sidebar.records');
    for (const [kind, fields] of [['howto', howto], ['records', records]]) {
        if (options[kind] !== undefined && !panels.includes(kind)) throw new Error('sidebar.' + kind + ' requires that card role');
        for (const [key, value] of Object.entries(fields)) {
            if (typeof value !== 'string' || (key.endsWith('Key') && !/^[A-Za-z][\w.-]*$/.test(value))) {
                throw new Error('sidebar.' + kind + '.' + key + ' must be ' + (key.endsWith('Key') ? 'an i18n key' : 'plain text'));
            }
        }
    }
    return { panels, desktopOnly, headingIcons: options.headingIcons === true, howto, records };
}

export function sidebarCards(game) {
    const options = sidebarOptions(game);
    if (!options) return [];
    return ['panels', 'desktopOnly'].flatMap(area => options[area].map(kind => ({
        kind, area, region: 'sidebar-' + kind,
        targetId: kind === 'more' ? `${game.prefix}SideMore` : `${game.prefix}-side-${kind}`,
    })));
}

/** One complete card per region, never an opening/closing wrapper around custom HTML. */
export function renderSidebarCard(game, kind, indent = '    ') {
    const options = sidebarOptions(game);
    if (!options || !sidebarCards(game).some(card => card.kind === kind)) {
        throw new Error('undeclared sidebar card: ' + kind);
    }
    const p = esc(game.prefix);
    const title = (name, key, text = '', icon = '') => {
        const label = icon
            ? `${icon} <span data-i18n="${esc(key)}">${esc(text)}</span>`
            : esc(text);
        return `    <div class="${p}-side-title game-side-title" id="${p}-side-${name}-title"${icon ? '' : ` data-i18n="${esc(key)}"`}>${label}</div>`;
    };
    const lines = [`<div class="${p}-side-card game-side-card">`];
    if (kind === 'howto') {
        const copy = options.howto;
        lines.push(title(kind, copy.titleKey || 'sideHowTo', copy.titleText, options.headingIcons ? '📖' : ''));
        const steps = copy.scienceKey ? ' sci-howto-steps' : '';
        const touch = copy.touchKey ? ` data-i18n-touch="${esc(copy.touchKey)}"` : '';
        lines.push(`    <p class="${p}-side-text game-side-text${steps}" id="${p}-side-howto" data-i18n="${esc(copy.textKey || 'howto')}"${touch}>${esc(copy.text)}</p>`);
        if (copy.scienceKey) lines.push(`    <p class="${p}-side-text game-side-text sci-howto-science" id="${p}-side-science" data-i18n="${esc(copy.scienceKey)}"></p>`);
    } else if (kind === 'records') {
        lines.push(title(kind, options.records.titleKey || 'sideRecords', options.records.titleText, options.headingIcons ? '🏅' : ''));
        lines.push(`    <div class="${p}-side-records game-side-records" id="${p}-side-records"></div>`);
    } else if (kind === 'legend') {
        lines.push(title(kind, 'legendTitle'));
        lines.push(`    <div class="${p}-side-legend game-side-legend" id="${p}-side-legend"></div>`);
    } else {
        lines.push(`    <nav class="more-games" id="${p}SideMore"></nav>`);
    }
    lines.push('</div>');
    return lines.map(line => indent + line).join('\n');
}
