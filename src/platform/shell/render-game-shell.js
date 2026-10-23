import { renderTopbar } from './render-topbar.js';
import { renderStylesheets, renderFooter, renderStatsDrawer, renderTailScripts } from './render-shell-parts.js';

function esc(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function region(name, html, indent) {
    return `${indent}<!-- registry:begin ${name} -->\n${html}\n${indent}<!-- registry:end ${name} -->`;
}

/**
 * Render the standard platform shell for a registry game.
 * Shared regions use the same renderers as all shipped games.
 */
export function renderGameShell(game, {
    stageHtml = '<canvas class="game-canvas" aria-label="Game canvas"></canvas>',
    sidebarHtml = '',
    startHtml = '',
} = {}) {
    const prefix = game.prefix || game.id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const title = game.name?.en || game.id;
    const caps = game.caps || [];
    const light = caps.includes('theme-light');
    const hasSidebar = caps.includes('sidebar');
    const hasDrawer = caps.includes('drawer');
    if (hasDrawer && !hasSidebar) throw new Error('drawer requires a sidebar: ' + game.id);
    if (sidebarHtml && !hasSidebar) throw new Error('sidebar content requires the sidebar capability: ' + game.id);
    const immersive = game.layout === 'immersive';
    const themeSupport = light ? 'dark light' : 'dark';
    const themeColor = game.themeColor || '#0b0f26';
    const themeColorLight = game.themeColorLight || themeColor;
    const topbarHtml = renderTopbar(game, '        ');
    // The default title is a div. Give new scaffolds a semantic H1 without
    // modifying the registry-generated header or duplicating a custom heading.
    const supplied = [topbarHtml, stageHtml, startHtml, sidebarHtml].join('\n');
    const headingCount = (supplied.match(/<h1(?:\s|>)/gi) || []).length;
    if (headingCount > 1) throw new Error('multiple H1 headings in game shell: ' + game.id);
    const heading = headingCount ? '' :
        `            <h1 class="sr-only" data-i18n="title">${esc(title)}</h1>\n`;
    const drawerBase = game.shell?.drawer?.idBase || `${prefix}Stats`;
    const sidebar = hasSidebar ? `            <aside class="game-sidebar">\n`
        + (hasDrawer ? `                <div id="${esc(drawerBase)}Panels">${sidebarHtml}</div>\n`
            : `                ${sidebarHtml}\n`)
        + `                <div class="game-side-card" id="${esc(prefix)}SideMore"></div>\n`
        + '            </aside>\n' : '';
    const drawer = hasDrawer
        ? region('stats-drawer', renderStatsDrawer(game, '    '), '    ') + '\n' : '';
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-support" content="${themeSupport}">
    <meta name="theme-color" content="${esc(themeColor)}"${light ? ` data-light="${esc(themeColorLight)}"` : ''}>
    <script src="/theme-boot.js"></script>
${region('stylesheets', renderStylesheets(game, '    '), '    ')}
    <title>${esc(title)}</title>
</head>
<body>
    <div class="game-shell${immersive ? ' game-shell--immersive' : ''}" data-game="${esc(game.id)}">
        <!-- registry:begin topbar -->
${topbarHtml}
        <!-- registry:end topbar -->
        <main class="game-main">
${heading}            <section class="game-stage${immersive ? ' game-stage--immersive' : ''}" id="${esc(prefix)}Stage">
                ${stageHtml}
                ${startHtml}
            </section>
${sidebar}        </main>
${region('footer', renderFooter(game, '        '), '        ')}
    </div>
${drawer}    <!-- registry:begin seo-script -->
    <!-- registry:end seo-script -->
${region('tail-scripts', renderTailScripts(game, '    '), '    ')}
</body>
</html>
`;
}
