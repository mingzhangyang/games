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
import { registry } from '../registry.mjs';

export const FEATURE_STYLESHEET = 'css/scoreboard-dialog.css';
export const FEATURE_LINK = '<link rel="stylesheet" href="css/scoreboard-dialog.css">';
export const FEATURE_PAGES = new Set([
    'carrot-pull.html', 'tank-battle.html', 'needle-awn.html',
    'firefly-signal.html', 'shadow-loom.html', 'math-rain.html',
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

export function reviewFeatureStyles(root, cssPaths, htmlPaths, errors) {
    reviewScoreboardStyles(root, cssPaths, htmlPaths, errors);
    reviewMobileFitStyles(root, cssPaths, htmlPaths, errors);
    return {
        cssPaths: new Set([FEATURE_STYLESHEET, MOBILE_FIT_STYLESHEET]),
        stripHtml: (page, html) => {
            const withoutScoreboard = stripFeatureLink(page, html, []);
            return withoutScoreboard.includes(MOBILE_FIT_LINK)
                ? stripMobileFitLink(page, withoutScoreboard, [])
                : withoutScoreboard;
        },
    };
}
