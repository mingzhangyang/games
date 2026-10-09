#!/usr/bin/env node
import assert from 'node:assert/strict';
import { verifyDedupeAdoption } from './lib/css/dedupe-adoption.mjs';

const sources = [
    { path: 'css/a.css', selector: '.a-btn:active' },
    { path: 'css/b.css', selector: '.b-btn:active' },
];
const destination = { path: 'css/layout.css', selector: '.shared-btn:active' };
const pages = new Map([
    ['css/a.css', new Set(['both.html'])],
    ['css/b.css', new Set(['both.html'])],
    ['css/layout.css', new Set(['both.html'])],
]);
const mapping = {
    id: 'adoption-equivalence', reuseExistingDestination: false,
    adoption: { surface: 'html-class', consumers: [
        { sourcePath: 'css/a.css', pages: ['both.html'], localClass: 'a-btn', sharedClass: 'shared-btn' },
        { sourcePath: 'css/b.css', pages: ['both.html'], localClass: 'b-btn', sharedClass: 'shared-btn' },
    ] },
};
const valid = '<button class="a-btn shared-btn"></button><button class="b-btn shared-btn"></button>';
const html = body => new Map([['both.html', '<html><body>' + body + '</body></html>']]);
const verify = (config = {}) => {
    const errors = [];
    verifyDedupeAdoption(config.mapping || mapping, config.sources || sources,
        config.destination || destination, config.pages || pages,
        config.html || html(valid), errors);
    return errors;
};

assert.deepEqual(verify(), []);
const widened = html(valid + '<button class="shared-btn"></button>');
assert.ok(verify({ html: widened }).some(e => /shared destination matches 1 extra element/.test(e)),
    'new destination must match exactly the union of source match sets');
assert.ok(verify({ html: widened }).some(e => /shared destination matches 1 extra element/.test(e)),
    'the same proof must remain effective when a ledger becomes historical');
assert.ok(verify({ html: html('<button class="a-btn"></button><button class="b-btn shared-btn"></button>') })
    .some(e => /a-btn element\(s\) without .shared-btn/.test(e)));
assert.deepEqual(verify({
    mapping: { ...mapping, reuseExistingDestination: true }, html: widened,
}), [], 'an existing destination already styled unrelated shared-class elements');
assert.ok(verify({
    mapping: { ...mapping, reuseExistingDestination: true },
    html: html('<button class="a-btn"></button><button class="b-btn shared-btn"></button>'),
}).some(e => /a-btn element\(s\) without .shared-btn/.test(e)));
assert.ok(verify({ sources: [{ ...sources[0], selector: '.a-btn:hover' }, sources[1]] })
    .some(e => /exact class-for-class selector substitution/.test(e)));
assert.ok(verify({ destination: { ...destination, selector: '.shared-btn:active, .other' } })
    .some(e => /exact class-for-class selector substitution/.test(e)));
assert.ok(verify({ sources: [{ ...sources[0], selector: '.outer .a-btn:active' }, sources[1]] })
    .some(e => /exact class-for-class selector substitution/.test(e)));

const splitPages = new Map([
    ['css/a.css', new Set(['a.html'])], ['css/b.css', new Set(['b.html'])],
    ['css/layout.css', new Set(['a.html', 'b.html'])],
]);
assert.deepEqual(verify({
    pages: splitPages,
    mapping: { ...mapping, adoption: { surface: 'html-class', consumers: [
        { ...mapping.adoption.consumers[0], pages: ['a.html'] },
        { ...mapping.adoption.consumers[1], pages: ['b.html'] },
    ] } },
    html: new Map([
        ['a.html', '<html><body><button class="a-btn shared-btn"></button></body></html>'],
        ['b.html', '<html><body><button class="b-btn shared-btn"></button></body></html>'],
    ]),
}), [], 'a destination is compared with the source union active on each page');


const rootRules = [
    { path: 'css/a.css', selector: '.hidden' },
    { path: 'css/b.css', selector: '.hidden' },
];
const rootTarget = { path: 'css/layout.css', selector: 'html.game-hidden-contract .hidden' };
const rootMapping = {
    ...mapping, adoption: { surface: 'root-class', consumers: [
        { sourcePath: 'css/a.css', pages: ['both.html'], rootClass: 'game-hidden-contract' },
        { sourcePath: 'css/b.css', pages: ['both.html'], rootClass: 'game-hidden-contract' },
    ] },
};
const scoped = html('<div class="hidden"></div>');
scoped.set('both.html', '<html class="game-hidden-contract"><body><div class="hidden"></div></body></html>');
assert.deepEqual(verify({ mapping: rootMapping, sources: rootRules, destination: rootTarget, html: scoped }), []);
assert.ok(verify({
    mapping: rootMapping, sources: rootRules, destination: { ...rootTarget, selector: '.other .hidden' },
    html: scoped,
}).some(e => /exact, reviewed document-root-scoped replacement/.test(e)));
const rootElementMatchesOld = new Map(scoped);
rootElementMatchesOld.set('both.html',
    '<html class="game-hidden-contract hidden"><body><div class="hidden"></div></body></html>');
assert.ok(verify({
    mapping: rootMapping, sources: rootRules, destination: rootTarget, html: rootElementMatchesOld,
}).some(e => /source selector matches the document root/.test(e)),
    'a root-scoped descendant selector must not silently omit a source match on the document element');

const withDestinationOnly = new Map(pages);
withDestinationOnly.set('css/layout.css', new Set(['both.html', 'math-rain.html']));
const exempt = new Map(scoped);
exempt.set('math-rain.html', '<html><body><div class="screen hidden"></div></body></html>');
assert.deepEqual(verify({
    mapping: rootMapping, sources: rootRules, destination: rootTarget,
    pages: withDestinationOnly, html: exempt,
}), []);
const accidentallyOptedIn = new Map(exempt);
accidentallyOptedIn.set('math-rain.html', '<html class="game-hidden-contract"><body></body></html>');
assert.ok(verify({
    mapping: rootMapping, sources: rootRules, destination: rootTarget,
    pages: withDestinationOnly, html: accidentallyOptedIn,
}).some(e => /destination-only consumer math-rain.html unexpectedly opts into/.test(e)));
assert.ok(verify({
    mapping: { ...mapping, adoption: { surface: 'body-class', consumers: [
        { sourcePath: 'css/a.css', pages: ['both.html'], bodyClass: 'enabled' },
        { sourcePath: 'css/b.css', pages: ['both.html'], bodyClass: 'enabled' },
    ] } },
}).some(e => /body-class dedupe selector rewrites require a separate/.test(e)));
assert.ok(verify({ html: html(
    '<button class="a-btn\u00a0shared-btn"></button><button class="b-btn shared-btn"></button>',
) }).some(e => /no .a-btn adoption anchor/.test(e)),
    'HTML class names must be tokenized using ASCII whitespace, not JavaScript Unicode splitting');

console.log('PASS dedupe two-way selector equivalence / root and destination-only checks');
