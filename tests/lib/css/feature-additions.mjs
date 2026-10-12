/**
 * Explicit additive stylesheet ownership after the immutable CSS P0/P5 freeze.
 *
 * New components must not rewrite the historical snapshots or relax old-page
 * comparison. Projecting an approved new link away reproduces the historic
 * baseline; the added file and links are separately validated below.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCssText } from './baseline-adapter.mjs';
import {
    scanHtml, parseHtmlElements, htmlTagName, htmlElementAttributes, isStylesheetLink,
} from './html-inputs.mjs';
import { auditedJavaScriptFiles } from './runtime-sources.mjs';
import { pageActivation } from './activation.mjs';
import { registry } from '../registry.mjs';

export const FEATURE_STYLESHEET = 'css/scoreboard-dialog.css';
export const FEATURE_LINK = '<link rel="stylesheet" href="css/scoreboard-dialog.css">';
export const FEATURE_PAGES = new Set([
    'carrot-pull.html', 'tank-battle.html', 'needle-awn.html',
    'firefly-signal.html', 'shadow-loom.html', 'math-rain.html',
    'loop-jail.html',
]);

export function stripFeatureLink(page, html, errors) {
    const count = html.split(FEATURE_LINK).length - 1;
    const approved = FEATURE_PAGES.has(page);
    const possibleLinks = [...html.matchAll(/<link\b[^>]*scoreboard-dialog\.css[^>]*>/g)].map(m => m[0]);
    if (approved) {
        if (count !== 1 || possibleLinks.length !== 1 || possibleLinks[0] !== FEATURE_LINK) {
            errors.push(page + ': expected exactly one canonical approved scoreboard stylesheet link');
            return html; // Preserve original model on unexpected markup.
        }
        const prior = html.indexOf('href="css/layout.css"');
        const current = html.indexOf(FEATURE_LINK);
        const later = html.indexOf('href="css/more-games.css"');
        if (prior < 0 || current < prior || (later >= 0 && current > later)) {
            errors.push(page + ': scoreboard CSS must follow layout and precede more-games');
        }
        return html.replace(FEATURE_LINK, '');
    }
    if (count || possibleLinks.length) {
        errors.push(page + ': unauthorized scoreboard stylesheet link');
    }
    return html;
}

function reviewScoreboardStyles(root, cssPaths, htmlPaths, errors) {
    if (!cssPaths.includes(FEATURE_STYLESHEET)) {
        errors.push('Reviewed scoreboard component stylesheet is missing');
    } else {
        const css = readFileSync(join(root, FEATURE_STYLESHEET), 'utf8');
        const parsed = parseCssText(css, FEATURE_STYLESHEET);
        if (!parsed.rules.length || parsed.rules.some(rule => rule.layer !== 'components')) {
            errors.push('Scoreboard stylesheet must contain only rules owned by @layer components');
        }
        if ((parsed.specialAtRules || []).length || parsed.keyframes.length
            || (parsed.declarations || []).some(d => d.important)) {
            errors.push('Scoreboard feature CSS must not add special at-rules, keyframes, or !important');
        }
        if (parsed.rules.some(rule => !rule.selector.includes('scoreboard-'))) {
            errors.push('Scoreboard feature CSS must only target its owned scoreboard selectors');
        }
    }
    for (const page of htmlPaths) {
        stripFeatureLink(page, readFileSync(join(root, page), 'utf8'), errors);
    }
    for (const page of FEATURE_PAGES) {
        if (!htmlPaths.includes(page)) errors.push('Registered scoreboard game page missing: ' + page);
    }
}

/*
 * PR #135 mobile visible-viewport contract. Unlike the scoreboard component it
 * corrects existing page rules, so it lives in the last cascade layer and may use
 * !important (layered importants beat the frozen unlayered page rules regardless
 * of link order). It is bounded instead by an exact selector allowlist and by one
 * canonical link on every registry page plus the landing page.
 */
export const MOBILE_FIT_STYLESHEET = 'css/mobile-fit.css';
export const MOBILE_FIT_LINK = '<link rel="stylesheet" href="css/mobile-fit.css">';
export const MOBILE_FIT_SELECTORS = new Set([
    'html, body',
    '.game-lb-username',
    '#usernameInput, .wd-input, .na-name-input, .sf-name-input, .gomoku-select, .daily-profile input',
    '.game-container:has(#tetris)',
    '#tetris, #particleCanvas, #lineClearCanvas',
    '.rv-board',
    '.td-rotate-prompt',
    '.sl-shell',
    '.perks',
]);

export function stripMobileFitLink(page, html, errors) {
    const count = html.split(MOBILE_FIT_LINK).length - 1;
    const possibleLinks = [...html.matchAll(/<link\b[^>]*mobile-fit\.css[^>]*>/g)].map(m => m[0]);
    if (count !== 1 || possibleLinks.length !== 1 || possibleLinks[0] !== MOBILE_FIT_LINK) {
        errors.push(page + ': expected exactly one canonical mobile-fit stylesheet link');
        return html;
    }
    const prior = html.indexOf('href="css/layout.css"');
    const current = html.indexOf(MOBILE_FIT_LINK);
    const later = html.indexOf('href="css/more-games.css"');
    if (prior < 0 || current < prior || (later >= 0 && current > later)) {
        errors.push(page + ': mobile-fit CSS must follow layout and precede more-games');
    }
    // Canonical order is tokens → layout → <page CSS…> → mobile-fit → more-games: only
    // more-games may follow among local sheets, so page CSS cannot sit after the contract
    // layer's link. External sheets (Google Fonts @font-face) carry no page rules.
    const localSheets = [...html.matchAll(/<link\b[^>]*\bhref="(css\/[^"]+)"[^>]*>/g)]
        .filter(match => /\brel="stylesheet"/.test(match[0]))
        .map(match => ({ href: match[1], at: match.index }));
    const trailing = localSheets.filter(sheet => sheet.at > current && sheet.href !== 'css/more-games.css');
    if (trailing.length) {
        errors.push(page + ': only more-games.css may follow mobile-fit CSS; found '
            + trailing.map(sheet => sheet.href).join(', '));
    }
    return html.replace(MOBILE_FIT_LINK, '');
}

function reviewMobileFitStyles(root, cssPaths, htmlPaths, errors) {
    if (!cssPaths.includes(MOBILE_FIT_STYLESHEET)) {
        errors.push('Reviewed mobile-fit stylesheet is missing');
    } else {
        const css = readFileSync(join(root, MOBILE_FIT_STYLESHEET), 'utf8');
        const parsed = parseCssText(css, MOBILE_FIT_STYLESHEET);
        if (!parsed.rules.length || parsed.rules.some(rule => rule.layer !== 'contracts')) {
            errors.push('Mobile-fit stylesheet must contain only rules owned by @layer contracts');
        }
        if ((parsed.specialAtRules || []).length || parsed.keyframes.length) {
            errors.push('Mobile-fit feature CSS must not add special at-rules or keyframes');
        }
        const unknown = parsed.rules.map(rule => rule.selector).filter(selector => !MOBILE_FIT_SELECTORS.has(selector));
        if (unknown.length) {
            errors.push('Mobile-fit feature CSS targets unreviewed selectors: ' + JSON.stringify(unknown));
        }
    }
    const pages = registry.all().map(game => game.href).concat('index.html');
    for (const page of pages) {
        if (!htmlPaths.includes(page)) errors.push('Registered mobile-fit page missing: ' + page);
    }
    for (const page of htmlPaths) {
        const html = readFileSync(join(root, page), 'utf8');
        if (pages.includes(page)) stripMobileFitLink(page, html, errors);
        else if (/mobile-fit\.css/.test(html)) errors.push(page + ': unauthorized mobile-fit stylesheet link');
    }
}

/*
 * Games added after the immutable CSS P0/P5 freeze. They have no historical
 * snapshot to project back onto, so instead of being compared with P0 they are
 * admitted only as fully-layered, self-contained additive pages:
 *   - the page stylesheet owns every rule in @layer pages (zero new unlayered
 *     debt) and adds no !important, keyframes or other special at-rules;
 *   - every selector is scoped to the page prefix (.xx-* / #xx-* outside :not())
 *     or is one of the document hooks below, the hooks only define --xx-*
 *     custom properties (html may also paint the canvas behind the shell), so
 *     the page never restyles a shared game-* family or another page's tokens;
 *   - only its own page links it, in the canonical shared order, the page has no
 *     inline <style>/style="", and its execution graph never reaches the runtime
 *     stylesheet installer.
 * Every frozen P0 comparison projects exactly these pages away; nothing else may.
 */
export const POST_FREEZE_GAMES = Object.freeze([
    Object.freeze({ id: 'loop-jail', page: 'loop-jail.html', stylesheet: 'css/loop-jail.css', prefix: 'lj' }),
]);
export const POST_FREEZE_PAGES = new Set(POST_FREEZE_GAMES.map(game => game.page));
const POST_FREEZE_ROOT_HOOKS = new Set([':root', ':root[data-theme="light"]']);

/** Split on commas / combinators only outside (), so :is(a, b) stays one unit. */
function splitTopLevel(text, separator) {
    const out = [];
    let depth = 0;
    let current = '';
    for (const ch of text) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (depth === 0 && separator.test(ch)) {
            out.push(current);
            current = '';
        } else current += ch;
    }
    out.push(current);
    return out.map(part => part.trim()).filter(Boolean);
}

export function selectorArms(selector) {
    return splitTopLevel(selector, /,/);
}

export function postFreezeSelectorScoped(selector, prefix) {
    const owned = new RegExp('[.#]' + prefix + '-[A-Za-z0-9_-]');
    return selectorArms(selector).every(part => {
        if (POST_FREEZE_ROOT_HOOKS.has(part) || part === 'html') return true;
        // The element a rule actually styles is the last compound. Its own prefixed
        // class / id must scope it: an ancestor (`.lj-x .game-btn`) or a token only
        // inside a functional pseudo (`:not()`, `:has()`, `:is()`, `:where()`)
        // would still restyle shared families or document elements.
        const subject = splitTopLevel(part, /[\s>+~]/).pop() || '';
        let flat = '';
        let depth = 0;
        for (const ch of subject) {
            if (ch === '(') depth++;
            else if (ch === ')') depth--;
            else if (depth === 0) flat += ch;
        }
        return owned.test(flat);
    });
}

export function postFreezeLinkOrder(game) {
    return ['css/tokens.css', 'css/layout.css', game.stylesheet,
        ...(FEATURE_PAGES.has(game.page) ? [FEATURE_STYLESHEET] : []),
        MOBILE_FIT_STYLESHEET, 'css/more-games.css'];
}

export function reviewPostFreezeStylesheet(css, game, errors) {
    const parsed = parseCssText(css, game.stylesheet);
    const fail = message => errors.push(game.stylesheet + ': ' + message);
    if (!parsed.rules.length || parsed.rules.some(rule => rule.layer !== 'pages')) {
        fail('post-freeze page CSS must own every rule in @layer pages');
    }
    if ((parsed.specialAtRules || []).length || parsed.keyframes.length) {
        fail('post-freeze page CSS must not add keyframes or other special at-rules');
    }
    if ((parsed.declarations || []).some(d => /!\s*important/i.test(d.value) || d.important)) {
        fail('post-freeze page CSS must not use !important');
    }
    const unscoped = parsed.rules.map(rule => rule.selector)
        .filter(selector => !postFreezeSelectorScoped(selector, game.prefix));
    if (unscoped.length) fail('selectors outside the page prefix: ' + JSON.stringify(unscoped));
    for (const declaration of parsed.declarations || []) {
        const selector = declaration.selector || '';
        const hook = selectorArms(selector);
        if (declaration.property.startsWith('--') && !declaration.property.startsWith('--' + game.prefix + '-')) {
            fail('custom property ' + declaration.property + ' is outside the --' + game.prefix + '-* namespace');
        }
        // Any root-hook arm counts: `:root, .lj-x { color: red }` still paints :root.
        if (hook.some(part => POST_FREEZE_ROOT_HOOKS.has(part)) && !declaration.property.startsWith('--')) {
            fail(selector + ' may only define --' + game.prefix + '-* custom properties (found ' + declaration.property + ')');
        }
        if (hook.includes('html') && !/^(?:--|background)/.test(declaration.property)) {
            fail('html may only paint the page background (found ' + declaration.property + ')');
        }
    }
}

export function reviewPostFreezePage(root, game, html, errors) {
    const fail = message => errors.push(game.page + ': ' + message);
    const entry = registry.all().find(item => item.id === game.id);
    if (!entry || entry.href !== game.page) fail('post-freeze page must be the registry href of ' + game.id);
    // Parse links like the browser does (any quoting, any rel token, root-relative or
    // remote hrefs): every stylesheet-capable or .css link takes part in the order check.
    const links = parseHtmlElements(html, game.page)
        .filter(element => htmlTagName(element) === 'link')
        .map(element => htmlElementAttributes(element))
        .filter(attrs => isStylesheetLink(attrs) || /\.css(?:[?#]|$)/i.test(attrs.href || ''));
    if (links.some(attrs => attrs.rel !== 'stylesheet' || Object.keys(attrs).length !== 2)) {
        fail('stylesheet links must be plain <link rel="stylesheet" href="…"> with no other attributes');
    }
    const hrefs = links.map(attrs => attrs.href);
    const expected = postFreezeLinkOrder(game);
    if (JSON.stringify(hrefs) !== JSON.stringify(expected)) {
        fail('stylesheet order must be ' + expected.join(' → ') + ' (found ' + hrefs.join(' → ') + ')');
    }
    const scanned = scanHtml(game.page, html);
    if (scanned.styleBlocks.length || scanned.inlineAttributes.length) {
        fail('post-freeze pages must not carry inline <style> blocks or style attributes');
    }
    try {
        const activation = pageActivation(root, game.page, html, auditedJavaScriptFiles(root));
        if (activation.runtimeStyleSources.length) {
            fail('page execution reaches the runtime stylesheet installer');
        }
    } catch (error) {
        fail('activation graph: ' + error.message);
    }
}

function reviewPostFreezeGames(root, cssPaths, htmlPaths, errors) {
    for (const game of POST_FREEZE_GAMES) {
        if (!cssPaths.includes(game.stylesheet)) errors.push('Post-freeze stylesheet missing: ' + game.stylesheet);
        else reviewPostFreezeStylesheet(readFileSync(join(root, game.stylesheet), 'utf8'), game, errors);
        if (!htmlPaths.includes(game.page)) {
            errors.push('Post-freeze page missing: ' + game.page);
            continue;
        }
        reviewPostFreezePage(root, game, readFileSync(join(root, game.page), 'utf8'), errors);
    }
    for (const page of htmlPaths) {
        const html = readFileSync(join(root, page), 'utf8');
        for (const game of POST_FREEZE_GAMES) {
            if (page !== game.page && html.includes('href="' + game.stylesheet + '"')) {
                errors.push(page + ': only ' + game.page + ' may link ' + game.stylesheet);
            }
        }
    }
}

export function reviewFeatureStyles(root, cssPaths, htmlPaths, errors) {
    reviewScoreboardStyles(root, cssPaths, htmlPaths, errors);
    reviewMobileFitStyles(root, cssPaths, htmlPaths, errors);
    reviewPostFreezeGames(root, cssPaths, htmlPaths, errors);
    return {
        cssPaths: new Set([FEATURE_STYLESHEET, MOBILE_FIT_STYLESHEET,
            ...POST_FREEZE_GAMES.map(game => game.stylesheet)]),
        postFreezePages: POST_FREEZE_PAGES,
        stripHtml: (page, html) => {
            const withoutScoreboard = stripFeatureLink(page, html, []);
            return withoutScoreboard.includes(MOBILE_FIT_LINK)
                ? stripMobileFitLink(page, withoutScoreboard, [])
                : withoutScoreboard;
        },
    };
}
