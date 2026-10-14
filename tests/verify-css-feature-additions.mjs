#!/usr/bin/env node
/**
 * Negative fixtures for additive CSS registration: historic P0 stays immutable.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import {
    stripFeatureLink, FEATURE_LINK, stripMobileFitLink, MOBILE_FIT_LINK, reviewFeatureStyles,
    stripStageStatusLink, STAGE_STATUS_LINK, stripHomeCardsLink, HOME_CARDS_LINK,
    POST_FREEZE_GAMES, postFreezeSelectorScoped, reviewPostFreezeStylesheet, reviewPostFreezePage,
    postFreezePageLinksStylesheet,
} from './lib/css/feature-additions.mjs';

const page = 'carrot-pull.html';
const valid = '<link rel="stylesheet" href="css/layout.css">\n'
    + FEATURE_LINK + '\n<link rel="stylesheet" href="css/more-games.css">';
let errors = [];
assert.equal(stripFeatureLink(page, valid, errors), valid.replace(FEATURE_LINK, ''));
assert.deepEqual(errors, []);
errors = [];
stripFeatureLink(page, valid + FEATURE_LINK, errors);
assert.ok(errors.some(e => e.includes('exactly one')), 'duplicate feature link must fail');
errors = [];
stripFeatureLink(page, valid.replace(FEATURE_LINK, ''), errors);
assert.ok(errors.some(e => e.includes('exactly one')), 'missing feature link must fail');
errors = [];
stripFeatureLink('gomoku.html', valid, errors);
assert.ok(errors.some(e => e.includes('unauthorized')), 'unregistered page must fail');
errors = [];
stripFeatureLink(page, valid.replace(FEATURE_LINK,
    '<link rel="alternate stylesheet" href="css/scoreboard-dialog.css">'), errors);
assert.ok(errors.some(e => e.includes('canonical')), 'stylesheet link variants cannot bypass review');
errors = [];
stripFeatureLink(page,
    FEATURE_LINK + '\n<link rel="stylesheet" href="css/layout.css">', errors);
assert.ok(errors.some(e => e.includes('must follow layout')), 'cascade link position is guarded');

// PR #135 mobile-fit contract: one canonical link between layout and more-games.
const fit = '<link rel="stylesheet" href="css/layout.css">\n'
    + MOBILE_FIT_LINK + '\n<link rel="stylesheet" href="css/more-games.css">';
errors = [];
assert.equal(stripMobileFitLink('tetris.html', fit, errors), fit.replace(MOBILE_FIT_LINK, ''));
assert.deepEqual(errors, []);
errors = [];
stripMobileFitLink('tetris.html', fit + MOBILE_FIT_LINK, errors);
assert.ok(errors.some(e => e.includes('exactly one')), 'duplicate mobile-fit link must fail');
errors = [];
stripMobileFitLink('tetris.html', fit.replace(MOBILE_FIT_LINK, ''), errors);
assert.ok(errors.some(e => e.includes('exactly one')), 'missing mobile-fit link must fail');
errors = [];
stripMobileFitLink('tetris.html', '<link rel="stylesheet" href="css/more-games.css">\n' + MOBILE_FIT_LINK
    + '\n<link rel="stylesheet" href="css/layout.css">', errors);
assert.ok(errors.some(e => e.includes('must follow layout')), 'mobile-fit cascade position is guarded');
errors = [];
stripMobileFitLink('tetris.html', '<link rel="stylesheet" href="css/layout.css">\n' + MOBILE_FIT_LINK
    + '\n<link rel="stylesheet" href="css/tetris.css">\n<link rel="stylesheet" href="css/more-games.css">', errors);
assert.ok(errors.some(e => e.includes('only more-games.css may follow')),
    'page CSS placed after mobile-fit must fail (layout → mobile-fit → <game> → more-games)');
errors = [];
stripMobileFitLink('sword-flight.html', fit
    + '\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC">', errors);
assert.deepEqual(errors, [], 'an external font stylesheet after more-games stays allowed');

// Stage-status contract: one canonical link after page + scoreboard CSS, before mobile-fit.
const status = '<link rel="stylesheet" href="css/layout.css">\n<link rel="stylesheet" href="css/carrot-pull.css">\n'
    + FEATURE_LINK + '\n' + STAGE_STATUS_LINK + '\n' + MOBILE_FIT_LINK + '\n<link rel="stylesheet" href="css/more-games.css">';
errors = [];
assert.equal(stripStageStatusLink('carrot-pull.html', status, errors), status.replace(STAGE_STATUS_LINK, ''));
assert.deepEqual(errors, []);
errors = [];
stripStageStatusLink('carrot-pull.html', status + STAGE_STATUS_LINK, errors);
assert.ok(errors.some(e => e.includes('exactly one')), 'duplicate stage-status link must fail');
errors = [];
stripStageStatusLink('carrot-pull.html', status.replace(STAGE_STATUS_LINK, ''), errors);
assert.ok(errors.some(e => e.includes('exactly one')), 'missing stage-status link on a reviewed page must fail');
errors = [];
stripStageStatusLink('gomoku.html', status.replace('carrot-pull.css', 'gomoku.css'), errors);
assert.ok(errors.some(e => e.includes('unauthorized')), 'unreviewed page cannot link stage-status');
errors = [];
stripStageStatusLink('carrot-pull.html', status.replace(FEATURE_LINK + '\n' + STAGE_STATUS_LINK,
    STAGE_STATUS_LINK + '\n' + FEATURE_LINK), errors);
assert.ok(errors.some(e => e.includes('must follow')), 'stage-status before scoreboard CSS must fail');
errors = [];
stripStageStatusLink('carrot-pull.html', status.replace(STAGE_STATUS_LINK + '\n' + MOBILE_FIT_LINK,
    MOBILE_FIT_LINK + '\n' + STAGE_STATUS_LINK), errors);
assert.ok(errors.some(e => e.includes('precede mobile-fit')), 'stage-status after mobile-fit must fail');
errors = [];
stripStageStatusLink('carrot-pull.html', status.replace(STAGE_STATUS_LINK,
    '<link rel="alternate stylesheet" href="css/stage-status.css">'), errors);
assert.ok(errors.some(e => e.includes('canonical')), 'stage-status link variants cannot bypass review');

// Stylesheet review: unlayered rules or unreviewed selectors cannot ride along.
function reviewWith(css) {
    const root = mkdtempSync(join(tmpdir(), 'mobile-fit-'));
    mkdirSync(join(root, 'css'));
    writeFileSync(join(root, 'css/scoreboard-dialog.css'), '@layer components { .scoreboard-dialog { color: red; } }');
    writeFileSync(join(root, 'css/mobile-fit.css'), css);
    const found = [];
    reviewFeatureStyles(root, ['css/scoreboard-dialog.css', 'css/mobile-fit.css'], [], found);
    return found;
}
function reviewStatusWith(css) {
    const root = mkdtempSync(join(tmpdir(), 'stage-status-'));
    mkdirSync(join(root, 'css'));
    writeFileSync(join(root, 'css/stage-status.css'), css);
    const found = [];
    reviewFeatureStyles(root, ['css/stage-status.css'], [], found);
    return found.filter(e => e.startsWith('Stage-status'));
}
assert.deepEqual(reviewStatusWith('@layer contracts { .sl-progress { top: 10px; } }'), [],
    'reviewed stage-status selector inside contracts passes');
assert.ok(reviewStatusWith('.sl-progress { top: 10px; }').some(e => e.includes('@layer contracts')),
    'unlayered stage-status rule must fail');
assert.ok(reviewStatusWith('@layer contracts { .game-topbar { display: none; } }').some(e => e.includes('unreviewed selectors')),
    'stage-status cannot restyle an unreviewed selector');

// Home-cards contract: index.html only, one canonical link after index.css, before mobile-fit.
const home = '<link rel="stylesheet" href="css/layout.css">\n<link rel="stylesheet" href="css/index.css">\n'
    + HOME_CARDS_LINK + '\n' + MOBILE_FIT_LINK;
errors = [];
assert.equal(stripHomeCardsLink('index.html', home, errors), home.replace(HOME_CARDS_LINK, ''));
assert.deepEqual(errors, []);
errors = [];
stripHomeCardsLink('index.html', home + HOME_CARDS_LINK, errors);
assert.ok(errors.some(e => e.includes('exactly one')), 'duplicate home-cards link must fail');
errors = [];
stripHomeCardsLink('index.html', home.replace(HOME_CARDS_LINK, ''), errors);
assert.ok(errors.some(e => e.includes('exactly one')), 'missing home-cards link on index.html must fail');
errors = [];
stripHomeCardsLink('gomoku.html', home, errors);
assert.ok(errors.some(e => e.includes('unauthorized')), 'a game page cannot link home-cards');
errors = [];
stripHomeCardsLink('index.html', home.replace('<link rel="stylesheet" href="css/index.css">\n' + HOME_CARDS_LINK,
    HOME_CARDS_LINK + '\n<link rel="stylesheet" href="css/index.css">'), errors);
assert.ok(errors.some(e => e.includes('must follow index.css')), 'home-cards before index.css must fail');
errors = [];
stripHomeCardsLink('index.html', home.replace(HOME_CARDS_LINK + '\n' + MOBILE_FIT_LINK,
    MOBILE_FIT_LINK + '\n' + HOME_CARDS_LINK), errors);
assert.ok(errors.some(e => e.includes('precede mobile-fit')), 'home-cards after mobile-fit must fail');
function reviewHomeWith(css) {
    const root = mkdtempSync(join(tmpdir(), 'home-cards-'));
    mkdirSync(join(root, 'css'));
    writeFileSync(join(root, 'css/home-cards.css'), css);
    const found = [];
    reviewFeatureStyles(root, ['css/home-cards.css'], [], found);
    return found.filter(e => e.startsWith('Home-cards'));
}
assert.deepEqual(reviewHomeWith('@layer contracts { .card-chip { color: red; } }'), [],
    'reviewed home-cards selector inside contracts passes');
assert.ok(reviewHomeWith('.card-chip { color: red; }').some(e => e.includes('@layer contracts')),
    'unlayered home-cards rule must fail');
assert.ok(reviewHomeWith('@layer contracts { .daily-hub { display: none; } }').some(e => e.includes('unreviewed selectors')),
    'home-cards cannot restyle an unreviewed selector');

assert.ok(!reviewWith('@layer contracts { .rv-board { width: 1px !important; } }')
    .some(e => e.startsWith('Mobile-fit')), 'reviewed selector inside contracts passes');
assert.ok(reviewWith('.rv-board { width: 1px; }').some(e => e.includes('@layer contracts')),
    'unlayered mobile-fit rule must fail');
assert.ok(reviewWith('@layer contracts { .ms-cell { width: 1px; } }').some(e => e.includes('unreviewed selectors')),
    'unreviewed mobile-fit selector must fail');
// Post-freeze game pages: self-contained, fully layered, prefix-scoped additions.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = POST_FREEZE_GAMES.find(item => item.id === 'loop-jail');
assert.ok(game, 'loop-jail is registered as a post-freeze game');
for (const [selector, scoped] of [
    ['.lj-hud', true], ['#lj-stage .lj-canvas', true], ['body.lj-body', true], [':root', true],
    [':root[data-theme="light"]', true], ['html', true], ['.lj-a, .lj-b:hover', true],
    ['.game-overlay', false], ['.lj-a, body', false], ['div:not(.lj-x)', false], ['.ljx-a', false],
    ['.lj-a:hover', true], ['.lj-ink.is-low .lj-ink-fill', true], ['.lj-a > .lj-b + .lj-c', true],
    ['.lj-a:is(.x, .y)', true], ['.lj-a::before', true],
    ['[data-owner=".lj-page"]', false], ['[data-owner="#lj-page"]', false],
    ['.game-overlay[data-owner=".lj-page"]', false],
    ['.game-overlay:has(.lj-x)', false], ['body:has(.lj-x)', false], [':is(.lj-a, div)', false],
    [':where(.lj-a)', false], ['.lj-x .game-action-btn', false], ['.lj-x > div', false], ['.lj-x svg', false],
]) {
    assert.equal(postFreezeSelectorScoped(selector, 'lj'), scoped, 'selector scope: ' + selector);
}
const sheet = rules => {
    const found = [];
    reviewPostFreezeStylesheet(rules, game, found);
    return found;
};
assert.deepEqual(sheet(readFileSync(join(ROOT, game.stylesheet), 'utf8')), [], 'real post-freeze stylesheet passes');
assert.deepEqual(sheet('@layer pages { :root { --lj-a: 1px; } .lj-x { color: red; } html { background: #000; } }'), []);
assert.ok(sheet('.lj-x { color: red; }').some(e => e.includes('@layer pages')), 'unlayered rule must fail');
assert.ok(sheet('@layer components { .lj-x { color: red; } }').some(e => e.includes('@layer pages')), 'other layer must fail');
assert.ok(sheet('@layer pages { .lj-x { color: red !important; } }').some(e => e.includes('!important')), '!important must fail');
assert.ok(sheet('@layer pages { @keyframes lj-a { to { opacity: 0; } } .lj-x { color: red; } }')
    .some(e => e.includes('keyframes')), 'keyframes must fail');
assert.ok(sheet('@layer pages { html.lj-root { color: red; } }').some(e => e.includes('html may only')),
    'qualified html hooks cannot restyle the document');
assert.ok(sheet('@layer pages { :root.lj-root { color: red; } }').some(e => e.includes('may only define')),
    'qualified root hooks cannot restyle the document');
assert.ok(sheet('@layer pages { .game-action-btn { padding: 0; } }').some(e => e.includes('outside the page prefix')),
    'restyling a shared family must fail');
assert.ok(sheet('@layer pages { :root { --tok-text: red; } }').some(e => e.includes('namespace')),
    'overriding shared tokens must fail');
assert.ok(sheet('@layer pages { :root { color: red; } }').some(e => e.includes('may only define')),
    'document hooks only define page custom properties');
assert.ok(sheet('@layer pages { html { font-size: 20px; } }').some(e => e.includes('background')),
    'html hook only paints the background');
assert.ok(sheet('@layer pages { :root, .lj-x { color: red; } }').some(e => e.includes('may only define')),
    'a mixed root-hook selector cannot paint :root');
assert.ok(sheet('@layer pages { .lj-x, html { font-size: 20px; } }').some(e => e.includes('background')),
    'a mixed html selector cannot restyle html');
const pageHtml = readFileSync(join(ROOT, game.page), 'utf8');
const pageReview = html => {
    const found = [];
    reviewPostFreezePage(ROOT, game, html, found);
    return found;
};
assert.deepEqual(pageReview(pageHtml), [], 'real post-freeze page passes');
assert.ok(pageReview(pageHtml.replace('<link rel="stylesheet" href="css/loop-jail.css">\n', ''))
    .some(e => e.includes('stylesheet order')), 'missing page stylesheet must fail');
assert.ok(pageReview(pageHtml.replace('<link rel="stylesheet" href="css/more-games.css">',
    '<link rel="stylesheet" href="css/more-games.css">\n    <link rel="stylesheet" href="css/tetris.css">'))
    .some(e => e.includes('stylesheet order')), 'extra stylesheet must fail');
for (const extra of [
    "<link rel='stylesheet' href='css/tetris.css'>",
    '<link rel="stylesheet" href="/css/tetris.css">',
    '<link rel=stylesheet href=css/tetris.css>',
    '<link rel="alternate stylesheet" href="css/tetris.css">',
    '<link rel="preload" href="css/tetris.css" as="style">',
    '<link rel="stylesheet" href="https://example.com/x.css">',
]) {
    assert.ok(pageReview(pageHtml.replace('</head>', extra + '</head>')).length > 0,
        'extra stylesheet link must fail: ' + extra);
}
assert.ok(pageReview(pageHtml.replace('<link rel="stylesheet" href="css/loop-jail.css">',
    '<link rel="stylesheet" href="css/loop-jail.css" media="print">'))
    .some(e => e.includes('no other attributes')), 'link attributes cannot change activation');
assert.ok(pageReview(pageHtml.replace('<body class="lj-body">', '<body class="lj-body" style="color:red">'))
    .some(e => e.includes('inline')), 'inline style attribute must fail');
assert.ok(pageReview(pageHtml.replace('</head>', '<style>.lj-x{color:red}</style></head>'))
    .some(e => e.includes('inline')), 'inline style block must fail');
for (const href of [
    'css/loop-jail.css', '/css/loop-jail.css', './css/loop-jail.css?v=42',
    '/css/loop-jail.css#theme', 'css/loop-jail.css?version=2#hash',
]) {
    for (const link of [
        `<link rel='stylesheet' href='${href}'>`,
        `<link rel=stylesheet href=${href}>`,
        `<link rel="preload" as="style" href="${href}">`,
    ]) {
        assert.equal(postFreezePageLinksStylesheet('shadow-loom.html', link, game), true,
            'all local links to another game stylesheet must be rejected: ' + link);
    }
}
assert.equal(postFreezePageLinksStylesheet('shadow-loom.html',
    '<link rel="stylesheet" href="https://example.com/css/loop-jail.css">', game), false,
'third-party URL must not be confused with a local stylesheet');
assert.equal(postFreezePageLinksStylesheet('shadow-loom.html',
    '<link rel="stylesheet" href="css/shadow-loom.css">', game), false,
'own stylesheet must not trigger cross-page ownership');

console.log('PASS additive scoreboard + mobile-fit + stage-status + home-cards + post-freeze game CSS review contract');
