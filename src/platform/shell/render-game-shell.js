import { renderTopbar } from './render-topbar.js';

function esc(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Render the standard platform shell for a registry game.
 * The topbar is rendered from the same registry chrome description as all shipped games.
 */
export function renderGameShell(game, {
    cssHref = `css/${game.id}.css`,
    stageHtml = '<canvas class="game-canvas" aria-label="Game canvas"></canvas>',
    sidebarHtml = '',
    startHtml = '',
} = {}) {
    const prefix = game.prefix || game.id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const title = game.name?.en || game.id;
    const light = (game.caps || []).includes('theme-light');
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
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-support" content="${themeSupport}">
    <meta name="theme-color" content="${esc(themeColor)}"${light ? ` data-light="${esc(themeColorLight)}"` : ''}>
    <script src="/theme-boot.js"></script>
    <link rel="stylesheet" href="css/tokens.css">
    <link rel="stylesheet" href="css/layout.css">
    <link rel="stylesheet" href="${esc(cssHref)}">
    <link rel="stylesheet" href="css/mobile-fit.css">
    <link rel="stylesheet" href="css/more-games.css">
    <title>${esc(title)}</title>
</head>
<body>
    <div class="game-shell" data-game="${esc(game.id)}">
        <!-- registry:begin topbar -->
${topbarHtml}
        <!-- registry:end topbar -->
        <main class="game-main">
${heading}            <section class="game-stage" id="${prefix}Stage">
                ${stageHtml}
                ${startHtml}
            </section>
            <aside class="game-sidebar">
                <div id="${prefix}StatsPanels">${sidebarHtml}</div>
                <div class="game-side-card" id="${prefix}SideMore"></div>
            </aside>
        </main>
        <footer class="game-footer">
            <p class="game-footer-hint" data-i18n="hint"></p>
        </footer>
    </div>
    <div class="game-drawer" id="${prefix}StatsDrawer" hidden>
        <div class="game-drawer-panel" role="dialog" aria-modal="true" aria-labelledby="${prefix}StatsDrawerTitle">
            <div class="game-drawer-head">
                <strong id="${prefix}StatsDrawerTitle">Stats</strong>
                <button class="game-icon-btn" id="${prefix}StatsClose" type="button" aria-label="Close"></button>
            </div>
            <div class="game-drawer-body" id="${prefix}StatsDrawerBody"></div>
        </div>
    </div>
    <!-- registry:begin seo-script -->
    <!-- registry:end seo-script -->
    <script type="module" src="${esc(game.entry)}"></script>
    <script src="/analytics.js" defer></script>
    <script src="/sw-register.js" defer></script>
</body>
</html>
`;
}
