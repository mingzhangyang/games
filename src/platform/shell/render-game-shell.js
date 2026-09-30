function esc(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Render the standard platform shell for a registry game.
 * Existing hand-authored games remain valid; new games should start here.
 */
export function renderGameShell(game, {
    cssHref = `css/${game.id}.css`,
    stageHtml = '<canvas class="game-canvas" aria-label="Game canvas"></canvas>',
    sidebarHtml = '',
    startHtml = '',
} = {}) {
    const prefix = game.prefix || game.id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const title = game.name?.en || game.id;
    const zh = game.name?.zh || title;
    const light = (game.caps || []).includes('theme-light');
    const themeSupport = light ? 'dark light' : 'dark';
    const themeColor = game.themeColor || '#0b0f26';
    const themeColorLight = game.themeColorLight || themeColor;
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
    <link rel="stylesheet" href="css/more-games.css">
    <title>${esc(title)}</title>
</head>
<body>
    <div class="game-shell" data-game="${esc(game.id)}">
        <header class="game-topbar">
            <div class="game-topbar-group">
                <a class="game-icon-btn" data-chrome="home" href="index.html" aria-label="Home"></a>
            </div>
            <div class="game-topbar-center">
                <h1 data-i18n="title">${esc(title)}</h1>
                <span class="sr-only" data-i18n="titleZh">${esc(zh)}</span>
            </div>
            <div class="game-topbar-actions game-topbar-group">
                <button class="game-icon-btn game-stats-btn" id="${prefix}StatsToggle" data-chrome="stats" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="${prefix}StatsDrawer"></button>
                <button class="game-icon-btn" data-chrome="sound" type="button"></button>
            </div>
        </header>
        <main class="game-main">
            <section class="game-stage" id="${prefix}Stage">
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
            <div class="game-topbar-group">
                <a class="game-icon-btn" data-chrome="home" href="index.html" aria-label="Home"></a>
                <button class="game-icon-btn" data-chrome="more" aria-controls="${prefix}MoreNav" aria-expanded="false" type="button"></button>
            </div>
            <nav class="more-games game-footer-nav" id="${prefix}MoreNav" hidden></nav>
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
