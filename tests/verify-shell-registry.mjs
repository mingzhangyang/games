// Step 6a static ownership and independent shell contracts. Page filtering only
// limits the per-page checks; global coverage and mutation guards always run.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { parse as parseJavaScript } from 'acorn';
import { parse } from 'parse5';
import { registry } from './lib/registry.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';
import { makeText } from '../src/platform/i18n.js';
import { renderGameShell } from '../src/platform/shell/render-game-shell.js';
import { sidebarCards } from '../src/platform/shell/render-sidebar.js';
import {
    renderStylesheets, renderFooter, renderStatsDrawer, renderTailScripts,
} from '../src/platform/shell/render-shell-parts.js';
import { transformShellRegions, validatePageBindings } from '../tools/lib/shell-regions.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFileSync(join(ROOT, name), 'utf8');
const RENDERERS = {
    stylesheets: renderStylesheets,
    footer: renderFooter,
    'stats-drawer': renderStatsDrawer,
    'tail-scripts': renderTailScripts,
};
const count = (source, token) => source.split(token).length - 1;
const attr = (node, name) => node.attrs?.find(a => a.name === name)?.value;
const hasClass = (node, name) => (attr(node, 'class') || '').split(/\s+/).includes(name);
function elements(source) {
    const result = [];
    function visit(node) {
        if (node.tagName) result.push(node);
        for (const child of node.childNodes || []) visit(child);
        if (node.content) visit(node.content);
    }
    visit(parse(source));
    return result;
}

function region(source, name, game) {
    const begin = '<!-- registry:begin ' + name + ' -->';
    const end = '<!-- registry:end ' + name + ' -->';
    const applicable = name !== 'stats-drawer' || game.caps?.includes('drawer');
    assert.equal(count(source, begin), applicable ? 1 : 0, game.id + ': unique ' + name + ' begin marker');
    assert.equal(count(source, end), applicable ? 1 : 0, game.id + ': unique ' + name + ' end marker');
    if (!applicable) return '';
    const start = source.indexOf(begin);
    const indent = source.slice(source.lastIndexOf('\n', start) + 1, start);
    assert(/^[ \t]*$/.test(indent), game.id + ': ' + name + ' marker occupies its own line');
    const from = source.indexOf('\n', start) + 1;
    const to = source.indexOf('\n' + indent + end, from);
    assert(to > from, game.id + ': aligned closing ' + name + ' marker');
    const actual = source.slice(from, to);
    assert.equal(actual, RENDERERS[name](game, indent), game.id + ': exact generated ' + name + ' region');
    return actual;
}

function checkStructure(source, game, scaffold = false) {
    const nodes = elements(source);
    const styles = nodes.filter(n => n.tagName === 'link' && attr(n, 'rel') === 'stylesheet')
        .map(n => attr(n, 'href')).filter(href => href?.startsWith('css/'));
    assert.deepEqual(styles.slice(0, 2), ['css/tokens.css', 'css/layout.css'], game.id + ': base CSS first');
    assert.deepEqual(styles.slice(-2), ['css/mobile-fit.css', 'css/more-games.css'], game.id + ': fit/more CSS last');
    assert.equal(new Set(styles).size, styles.length, game.id + ': no duplicate stylesheets');
    const pageCss = game.shell?.styles?.page || 'css/' + game.id + '.css';
    assert.equal(styles.filter(href => href === pageCss).length, 1, game.id + ': one page stylesheet');
    const pageIndex = styles.indexOf(pageCss);
    const science = styles.indexOf('css/science-showcase.css');
    assert.equal(science >= 0, game.shell?.styles?.scienceShowcase === true, game.id + ': science CSS follows declaration');
    if (science >= 0) assert(science > 1 && science < pageIndex, game.id + ': science base precedes page styles');
    const tail = ['css/scoreboard-dialog.css', 'css/stage-status.css', 'css/mobile-fit.css', 'css/more-games.css'];
    const actualTail = styles.slice(pageIndex + 1);
    assert(actualTail.every(href => tail.includes(href)), game.id + ': only shared overrides follow page CSS');
    assert(actualTail.every((href, i) => i === 0 || tail.indexOf(href) > tail.indexOf(actualTail[i - 1])),
        game.id + ': shared overrides keep cascade order');
    assert.equal(styles.includes('css/scoreboard-dialog.css'), game.scores?.ui === 'dialog',
        game.id + ': scoreboard CSS derives from its UI');
    assert.equal(styles.includes('css/stage-status.css'), game.shell?.styles?.stageStatus !== false,
        game.id + ': stage CSS follows declaration');
    if (!scaffold) for (const href of styles) assert(existsSync(join(ROOT, href)), game.id + ': stylesheet exists: ' + href);

    const scripts = nodes.filter(n => n.tagName === 'script' && attr(n, 'src'));
    const tailScripts = [game.entry, '/analytics.js', '/sw-register.js'];
    assert.deepEqual(scripts.slice(-3).map(n => attr(n, 'src')), tailScripts, game.id + ': ordered page-tail scripts');
    for (const src of tailScripts) assert.equal(scripts.filter(n => attr(n, 'src') === src).length, 1,
        game.id + ': script runs once: ' + src);
    assert.equal(attr(scripts.at(-3), 'type'), 'module', game.id + ': entry is a module');
    assert.equal(attr(scripts.at(-2), 'defer'), '', game.id + ': analytics remains deferred');
    assert.equal(attr(scripts.at(-1), 'defer'), '', game.id + ': service-worker registration remains deferred');
    const footers = nodes.filter(n => hasClass(n, 'game-footer'));
    assert.equal(footers.length, 1, game.id + ': one footer');
    assert(hasClass(footers[0].parentNode, 'game-shell'), game.id + ': footer remains a direct shell child');
    const drawers = nodes.filter(n => hasClass(n, 'game-drawer'));
    assert.equal(drawers.length, game.caps?.includes('drawer') ? 1 : 0, game.id + ': drawer matches capability');
    if (drawers.length) {
        for (const cls of ['game-drawer-panel', 'game-drawer-handle', 'game-drawer-title', 'game-drawer-close', 'game-drawer-body']) {
            assert.equal(nodes.filter(n => hasClass(n, cls)).length, 1, game.id + ': complete ' + cls);
        }
        for (let host = drawers[0].parentNode; host; host = host.parentNode) {
            assert(!hasClass(host, 'game-shell'), game.id + ': fixed drawer remains outside shell');
        }
    }
    if (scaffold) assert.equal(nodes.filter(n => n.tagName === 'h1').length, 1, game.id + ': scaffold retains one semantic H1');
}

const games = registry.withCap('topbar');
assert(games.length, 'registered shell pages must not be empty');
registry.assertCovered({ cap: 'topbar', covered: games.map(g => g.id), label: 'shell-registry' });
const selected = games.filter(game => keepPage(game.id));
for (const game of registry.all().filter(g => !g.caps?.includes('topbar'))) {
    assert(!game.shell, game.id + ': exempt page has no generated shell configuration');
    for (const name of Object.keys(RENDERERS)) {
        assert(!read(game.href).includes('registry:begin ' + name), game.id + ': exempt page has no shell region');
    }
}
for (const name of Object.keys(RENDERERS)) {
    assert(!read('index.html').includes('registry:begin ' + name), 'index remains outside shell generation');
}

// Fresh scaffolds use the shared parts, including capability-based omissions.
const fixture = {
    id: 'shell-fixture', prefix: 'fx', entry: 'src/games/shell-fixture/index.js',
    name: { en: 'Shell <test> &copy;', zh: '骨架测试' },
    caps: ['topbar', 'sidebar', 'drawer'], chrome: { actions: ['stats', 'sound'] },
};
const customContent = '<p id="custom-help">Read <b>rules</b> &amp; play.</p>';
const scaffold = renderGameShell(fixture, { sidebarHtml: customContent });
for (const name of Object.keys(RENDERERS)) region(scaffold, name, fixture);
checkStructure(scaffold, fixture, true);
validatePageBindings(scaffold, scaffold, 'scaffold');
assert.equal(transformShellRegions(scaffold, fixture).src, scaffold, 'fresh scaffold is already generation-stable');
const noDrawer = { ...fixture, caps: ['topbar'], chrome: { actions: ['sound'] } };
const simple = renderGameShell(noDrawer);
checkStructure(simple, noDrawer, true);
assert(!elements(simple).some(n => hasClass(n, 'game-sidebar')), 'no sidebar capability means no empty sidebar');
assert.equal(renderStatsDrawer(noDrawer), '', 'drawer renderer omits unsupported capability');
assert.throws(() => renderStylesheets({ ...fixture, shell: { styles: { page: 'https://example.test/style.css' } } }),
    'page stylesheet overrides cannot take ownership of external resources');
assert.throws(() => renderStatsDrawer({ ...noDrawer, shell: { drawer: { idBase: 'unexpected' } } }),
    'drawer overrides cannot silently add an unsupported capability');
const literalFooter = renderFooter({ ...fixture, shell: { footer: { text: '<img> &copy; "hint"' } } });
assert(!elements(literalFooter).some(n => n.tagName === 'img'), 'footer text never becomes arbitrary markup');
assert(literalFooter.includes('&lt;img&gt; &amp;copy; &quot;hint&quot;'), 'literal footer text is preserved by escaping');

// Exercise the real CLI in isolation: valid HTML alone cannot prove that its
// generated entry parses or that the runtime binds the matching capabilities.
function checkScaffoldCli() {
    const temp = mkdtempSync(join(tmpdir(), 'games-shell-cli-'));
    const fresh = (id, options = {}) => ({ ...fixture, id, href: id + '.html', i18nVar: 'TEXT',
        entry: 'src/games/' + id + '/index.js', ...options });
    const plain = { caps: ['topbar'], chrome: { actions: ['sound'] } };
    const cases = [
        fresh('cli-default'), fresh('cli-simple', plain),
        fresh('cli-immersive', { ...plain, layout: 'immersive' }),
        fresh('cli-css', { ...plain, caps: ['topbar', 'sidebar'],
            shell: { styles: { page: 'css/custom-board.css' } } }),
        fresh('cli-custom-footer', { ...plain,
            shell: { footer: { key: 'instructions', touchKey: 'touchInstructions' } } }),
        fresh('cli-static-footer', { ...plain,
            shell: { footer: { key: null, touchKey: null, text: 'Read <rules> & play.' } } }),
        fresh('cli-sidebar-copy', { sidebar: {
            panels: ['howto', 'records'], desktopOnly: ['legend', 'more'],
            howto: { titleKey: 'guideTitle', textKey: 'guide', touchKey: 'touchGuide', scienceKey: 'whyItWorks' },
            records: { titleKey: 'resultsTitle' },
        } }),
        fresh('cli-manual-sidebar', { sidebar: false }),
    ];
    const invalid = fresh('cli-custom-drawer', { shell: { drawer: { idBase: 'legacyStats' } } });
    const emptyFooter = fresh('cli-empty-footer', { ...plain,
        shell: { footer: { key: null, touchKey: null, text: ' \n ' } } });
    const touchOnlyFooters = [
        fresh('cli-static-implicit-touch', { ...plain,
            shell: { footer: { key: null, text: 'Static help.' } } }),
        fresh('cli-static-explicit-touch', { ...plain,
            shell: { footer: { key: null, touchKey: 'touchHelp', text: 'Static help.' } } }),
    ];
    const invalidSidebars = [
        fresh('cli-misplaced-card', { sidebar: { panels: ['legend'] } }),
        fresh('cli-duplicate-card', { sidebar: { panels: ['howto', 'howto'] } }),
        fresh('cli-unknown-card', { sidebar: { desktopOnly: ['unexpected'] } }),
        fresh('cli-no-sidebar-cap', { ...plain, sidebar: { panels: ['howto'] } }),
    ];
    const invoke = game => execFileSync(process.execPath,
        [join(temp, 'tools/generators/new-game.mjs'), game.id], { stdio: 'pipe', timeout: 10000 });
    try {
        for (const name of ['tools/generators/new-game.mjs', 'src/platform/icons.js',
            'tests/verify-i18n.mjs', 'tests/lib/registry.mjs', 'tools/lib/registry.mjs',
            'tests/lib/static-module-graph.mjs', 'src/platform/i18n.js', 'src/platform/site-settings.js',
            ...['render-game-shell', 'render-shell-parts', 'render-topbar', 'render-sidebar'].map(n => 'src/platform/shell/' + n + '.js')]) {
            mkdirSync(dirname(join(temp, name)), { recursive: true });
            copyFileSync(join(ROOT, name), join(temp, name));
        }
        writeFileSync(join(temp, 'package.json'), '{"type":"module"}');
        writeFileSync(join(temp, 'games.config.json'),
            JSON.stringify({ games: [...cases, invalid, emptyFooter, ...touchOnlyFooters, ...invalidSidebars] }));
        for (const game of cases) {
            invoke(game);
            const source = readFileSync(join(temp, game.entry), 'utf8');
            const ast = parseJavaScript(source, { ecmaVersion: 'latest', sourceType: 'module' });
            let runtime, tables;
            const body = ast.body.filter(node => node.type !== 'ImportDeclaration')
                .map(node => source.slice(node.start, node.end)).join('\n');
            runInNewContext(body, {
                ICONS: {}, makeText, onReady: fn => fn(), getLang: () => 'en',
                createI18nBinder: options => { tables = options.tables; return { apply() {} }; },
                mountGameRuntime: options => { assert(!runtime, game.id + ': single runtime'); runtime = options; },
                window: { addEventListener() {} },
            });
            const html = readFileSync(join(temp, game.href), 'utf8');
            assert.equal(html, renderGameShell(game), game.id + ': CLI uses the shared shell');
            checkStructure(html, game, true);
            const nodes = elements(html);
            const hasDrawer = game.caps.includes('drawer');
            const hasSidebar = game.caps.includes('sidebar');
            assert.equal(!!runtime.drawer, hasDrawer, game.id + ': drawer runtime follows capability');
            assert.equal(!!runtime.more, hasSidebar, game.id + ': More runtime follows capability');
            assert.equal(nodes.some(n => hasClass(n, 'game-sidebar')), hasSidebar, game.id + ': sidebar capability');
            if (hasSidebar) assert(nodes.some(n => '#' + attr(n, 'id') === runtime.more), game.id + ': More target exists');
            const cards = sidebarCards(game);
            for (const card of cards) {
                assert(nodes.some(n => attr(n, 'id') === card.targetId), game.id + ': scaffold includes declared ' + card.kind + ' target');
                assert(html.includes('registry:begin ' + card.region), game.id + ': scaffold shares generated card ownership');
            }
            for (const node of nodes) {
                if (!cards.length) break;
                for (const attribute of ['data-i18n', 'data-i18n-touch']) {
                    const key = attr(node, attribute);
                    if (!key) continue;
                    for (const lang of ['en', 'zh']) assert(tables[lang][key], game.id + ': generated binding has ' + lang + ' copy: ' + key);
                }
            }
            if (hasDrawer) {
                assert.equal(tables.en.close, 'Close', game.id + ': drawer has an English close label');
                assert.equal(tables.zh.close, '关闭', game.id + ': drawer has a Chinese close label');
                assert(!Object.hasOwn(tables.en, 'close') && !Object.hasOwn(tables.zh, 'close'),
                    game.id + ': drawer inherits the shared close labels');
                for (const suffix of ['Toggle', 'Drawer', 'DrawerBody', 'Close', 'Panels', 'DrawerTitle']) {
                    assert(nodes.some(n => attr(n, 'id') === runtime.drawer.idPrefix + 'Stats' + suffix),
                        game.id + ': shared drawer adapter target ' + suffix);
                }
            }
            assert.equal(runtime.frame.layout === 'immersive', game.layout === 'immersive', game.id + ': runtime frame');
            assert.equal(nodes.some(n => hasClass(n, 'game-shell--immersive')), game.layout === 'immersive',
                game.id + ': immersive shell class');
            const footer = game.shell?.footer || {};
            const footerKey = footer.key === undefined ? 'hint' : footer.key;
            const touchKey = footer.touchKey === undefined ? 'hintTouch' : footer.touchKey;
            const hint = nodes.find(n => hasClass(n, 'game-footer-hint'));
            assert.equal(attr(hint, 'data-i18n'), footerKey === null ? undefined : footerKey,
                game.id + ': footer uses the declared hint key');
            assert.equal(attr(hint, 'data-i18n-touch'), touchKey === null ? undefined : touchKey,
                game.id + ': footer uses the declared touch hint key');
            for (const lang of ['en', 'zh']) {
                if (footerKey !== null) assert(tables[lang][footerKey], game.id + ': bound hint ' + lang);
                if (touchKey !== null) assert(tables[lang][touchKey], game.id + ': bound touch hint ' + lang);
                assert.equal(tables[lang].title, game.name[lang], game.id + ': title copy is preserved');
            }
            if (footerKey === null) {
                assert.equal(hint.childNodes.map(n => n.value || '').join(''), footer.text,
                    game.id + ': static unbound footer keeps its literal text');
            }
            const css = game.shell?.styles?.page || 'css/' + game.id + '.css';
            assert(existsSync(join(temp, css)), game.id + ': configured stylesheet is created');
            if (game.shell?.styles?.page) assert(!existsSync(join(temp, 'css/' + game.id + '.css')),
                game.id + ': stylesheet override does not create an unused default');
        }
        assert.throws(() => invoke(invalid), error => /default ID convention/.test(String(error.stderr)),
            'new games cannot silently choose IDs unsupported by the drawer adapter');
        assert.throws(() => invoke(emptyFooter), error => /non-empty static footer text/.test(String(error.stderr)),
            'new games cannot generate an empty footer without an i18n writer');
        for (const game of touchOnlyFooters) {
            assert.throws(() => invoke(game), error => /static footer requires touchKey: null/.test(String(error.stderr)),
                game.id + ': a touch-only key has no shared i18n binding');
        }
        for (const game of invalidSidebars) {
            assert.throws(() => invoke(game), error => /sidebar|card|role/i.test(String(error.stderr)),
                game.id + ': invalid sidebar declaration fails before writing');
        }
        for (const game of [invalid, emptyFooter, ...touchOnlyFooters, ...invalidSidebars]) {
            for (const name of [game.href, game.entry, 'css/' + game.id + '.css']) {
                assert(!existsSync(join(temp, name)), 'invalid scaffold is rejected before writing ' + name);
            }
        }
        // A parsed JS object alone cannot prove compatibility with the repo's
        // binding-key checker. Run its unchanged implementation on every output.
        writeFileSync(join(temp, 'games.config.json'), JSON.stringify({ games: cases }));
        execFileSync(process.execPath, [join(temp, 'tests/verify-i18n.mjs')],
            { stdio: 'pipe', timeout: 10000 });
    } finally {
        rmSync(temp, { recursive: true, force: true });
    }
}
checkScaffoldCli();

// Installing missing region pairs must preserve independent font/preconnect
// resources and game-owned markup byte for byte. Half a pair is corruption.
const fonts = '    <link rel="preconnect" href="https://fonts.example.test">\n'
    + '    <link rel="stylesheet" href="https://fonts.example.test/game.css">';
const withFonts = scaffold.replace('    <!-- registry:end stylesheets -->',
    '    <!-- registry:end stylesheets -->\n' + fonts);
const unmarked = withFonts.replace(/^[ \t]*<!-- registry:(?:begin|end) (?:stylesheets|footer|stats-drawer|tail-scripts) -->\n/gm, '');
const installed = transformShellRegions(unmarked, fixture).src;
assert(installed.includes(fonts), 'installing local CSS never consumes external font/preconnect links');
assert.equal(count(installed, fonts), 1, 'font resources are neither lost nor duplicated');
assert(installed.includes(customContent), 'game-owned markup survives installation byte for byte');
assert.equal(transformShellRegions(installed, fixture).src, installed, 'generation is idempotent after marker installation');
for (const name of Object.keys(RENDERERS)) region(installed, name, fixture);
const stylesEnd = '    <!-- registry:end stylesheets -->';
const swallowedFonts = withFonts.replace(stylesEnd + '\n' + fonts, fonts + '\n' + stylesEnd);
assert.throws(() => transformShellRegions(swallowedFonts, fixture), /unrelated content/,
    'moving a same-parent closing marker past external resources must not consume them');
for (const [name, extra] of [
    ['footer', '<p>Page-owned keyboard notes.</p>'],
    ['stats-drawer', '<section>Page-owned drawer notes.</section>'],
    ['tail-scripts', '<script src="/page-owned.js" defer></script>'],
]) {
    const end = '<!-- registry:end ' + name + ' -->';
    const offset = scaffold.indexOf(end);
    const indent = scaffold.slice(scaffold.lastIndexOf('\n', offset) + 1, offset);
    const corrupted = scaffold.replace(indent + end, indent + extra + '\n' + indent + end);
    assert.throws(() => transformShellRegions(corrupted, fixture), /unrelated content/,
        'marked ' + name + ' cannot consume a page-owned sibling without an ID');
}
const updatedFixture = { ...fixture, entry: 'src/games/shell-fixture/new-entry.js',
    scores: { ui: 'dialog' }, shell: {
        styles: { page: 'css/renamed-shell.css', scienceShowcase: true, stageStatus: false },
        footer: { text: 'Updated instructions.' },
    } };
const updated = transformShellRegions(installed, updatedFixture).src;
for (const name of Object.keys(RENDERERS)) region(updated, name, updatedFixture);
assert(updated.includes(fonts), 'valid registry updates preserve adjacent external resources');
assert(updated.includes(customContent), 'valid registry updates preserve game-owned markup');
assert(!updated.includes('src="' + fixture.entry + '"'), 'registry updates replace the previous module entry');
assert.equal(transformShellRegions(updated, updatedFixture).src, updated,
    'supported registry updates remain generation-stable');
for (const name of Object.keys(RENDERERS)) {
    const begin = '<!-- registry:begin ' + name + ' -->';
    const end = '<!-- registry:end ' + name + ' -->';
    assert.throws(() => transformShellRegions(scaffold.replace(end, ''), fixture),
        'missing end marker must fail: ' + name);
    assert.throws(() => transformShellRegions(scaffold.replace(begin, ''), fixture),
        'missing begin marker must fail: ' + name);
    assert.throws(() => transformShellRegions(scaffold.replace(begin, begin + '\n' + begin), fixture),
        'duplicate marker must fail: ' + name);
    const reversed = scaffold.replace(begin, '<!-- swap-marker -->').replace(end, begin)
        .replace('<!-- swap-marker -->', end);
    assert.throws(() => transformShellRegions(reversed, fixture), 'reversed markers must fail: ' + name);
}
const footerEnd = '        <!-- registry:end footer -->';
const misplacedEnd = scaffold.replace(footerEnd, '').replace('</body>', footerEnd + '\n</body>');
assert.throws(() => transformShellRegions(misplacedEnd, fixture),
    'moving a boundary across containers cannot consume handwritten page structure');
const outsideFooter = scaffold.replace('</body>', '<footer class="game-footer"></footer>\n</body>');
assert.throws(() => transformShellRegions(outsideFooter, fixture),
    'an unowned duplicate component outside the generated region is rejected');
const interruptedStyles = unmarked.replace('<link rel="stylesheet" href="css/layout.css">',
    '<link rel="preconnect" href="https://fonts.example.test">\n'
    + '    <link rel="stylesheet" href="css/layout.css">');
assert.throws(() => transformShellRegions(interruptedStyles, fixture),
    'initial installation cannot swallow unrelated nodes between local stylesheets');
assert.throws(() => transformShellRegions(unmarked, { ...fixture, shell: { styles: { stageStatus: false } } }),
    'initial migration rejects DOM changes even when every ID survives');
assert.throws(() => region(scaffold.replace('<footer class=', '<footer data-broken="1" class='), 'footer', fixture),
    'hand edits to generated markup are detected independently of the generator');
const nestedFooter = scaffold.replace('<footer class=', '<section><footer class=')
    .replace('</footer>', '</footer></section>');
assert.throws(() => checkStructure(nestedFooter, fixture, true),
    'independent structure checks reject a footer nested below its shell');

const valid = '<main><button id="open" aria-controls="panel">Open</button>'
    + '<section id="panel" aria-labelledby="label"><h2 id="label">Stats</h2></section></main>';
validatePageBindings(valid, valid, 'valid bindings');
for (const [label, mutated] of [
    ['lost ID', valid.replace(' id="open"', '')],
    ['duplicate ID', valid.replace('</main>', '<div id="panel"></div></main>')],
    ['missing control target', valid.replace('aria-controls="panel"', 'aria-controls="absent"')],
    ['missing label target', valid.replace('aria-labelledby="label"', 'aria-labelledby="absent"')],
]) assert.throws(() => validatePageBindings(valid, mutated, label), label + ' must stop generation');

exitIfNoPages(selected, 'verify-shell-registry');
for (const game of selected) {
    const html = read(game.href);
    for (const name of Object.keys(RENDERERS)) region(html, name, game);
    checkStructure(html, game);
    validatePageBindings(html, html, game.id);
    assert.equal(transformShellRegions(html, game).src, html, game.id + ': generation stays idempotent');
    const generated = renderGameShell(game);
    for (const name of Object.keys(RENDERERS)) region(generated, name, game);
    checkStructure(generated, game, true);
}
console.log('verify-shell-registry: ' + selected.length + '/' + games.length
    + ' pages selected; shared parts, independent shell contracts and negative guards passed');
