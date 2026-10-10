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

export function reviewFeatureStyles(root, cssPaths, htmlPaths, errors) {
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
    return {
        cssPaths: new Set([FEATURE_STYLESHEET]),
        stripHtml: (page, html) => stripFeatureLink(page, html, []),
    };
}
