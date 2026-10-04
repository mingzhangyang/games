import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCssText } from './lib/css/baseline-adapter.mjs';
import { parseStylesheet, normalizeFragment, hasImportantPriority } from './lib/css/model.mjs';
import { scanHtml } from './lib/css/html-inputs.mjs';
import { htmlCascadeModel, fingerprint } from './lib/css/semantic-contract.mjs';
import { auditStyleIngress, readStyleRegistry, STYLE_REGISTRY } from './lib/css/runtime-sources.mjs';

const model = css => parseStylesheet(css, 'fixture.css').model;
const different = (a, b) => assert.notEqual(fingerprint(model(a)), fingerprint(model(b)));
different('[data-x="a  b"]{color:red}', '[data-x="a b"]{color:red}');
different('.a{content:"a  b"}', '.a{content:"a b"}');
different('.a{--X:red}', '.a{--x:red}');
different('.a/**/b{color:red}', '.ab{color:red}');
different('.a{color:red}.b{color:blue}', '.b{color:blue}.a{color:red}');
different('.a{color:red;color:blue}', '.a{color:blue;color:red}');
different('@layer tokens{.a{color:red}}@layer components{.b{color:blue}}',
    '@layer tokens{.b{color:blue}}@layer components{.a{color:red}}');
different('@keyframes a{to{opacity:1}}', '@keyframes a{to{opacity:0}}');
different('@media print{.a{color:red}}', '@media screen{.a{color:red}}');
assert.deepEqual(normalizeFragment('.a  > .b'), normalizeFragment('.a > .b'));
assert.equal(model(String.raw`.a{color:red !\69mportant}`).children[0].children[0].important, true);
assert.equal(model(String.raw`.a{--x:foo\;bar!important}`).children[0].children.length, 1);
assert.equal(model('.a{--x:{color:red};}').children[0].children[0].kind, 'declaration');
assert.throws(() => model('.a{color:"unterminated}'));

for (const source of [
    'const tag="style"; const s=document.createElement(tag); s.textContent=".x{}";',
    'const s=document.createElement("style"); s.textContent=".x{}"; const alias=s; alias.textContent=".y{}";',
    'const make=document.createElement; make.call(document,"style");',
    'const {createElement: make}=document; make("style");',
    'document["createElement"]("style");',
    'document.createElementNS("http://www.w3.org/2000/svg","style");',
    'const tag="style"; document.createElementNS("http://www.w3.org/2000/svg",tag);',
    'const link=document.createElement("link"); link.rel="stylesheet";',
    'new CSSStyleSheet();',
    'new window["CSSStyleSheet"]();',
    'document.adoptedStyleSheets=[];',
    'document.styleSheets[0].replace(".x{}");',
    'element.sheet.insertRule(".x{}");',
    'document.write("<style>.x{}</style>");',
    'element.innerHTML=`<style>.x{}</style>`;',
    'import "./new.css";',
]) assert.ok(auditStyleIngress(source).length, source);
assert.deepEqual(auditStyleIngress('const clean="a-b".replace("-", ""); document.createElement("div");'), []);
const registryText = readFileSync(new URL('../' + STYLE_REGISTRY, import.meta.url), 'utf8');
assert.equal(Object.keys(readStyleRegistry(registryText)).length, 5);
assert.throws(() => readStyleRegistry(registryText + '\nconsole.log("side effect");'));
assert.throws(() => readStyleRegistry('export const STYLE_SOURCES=Object.freeze({mobile: buildCss()});'));

const htmlModel = html => fingerprint(htmlCascadeModel(html, 'fixture.html'));
assert.notEqual(htmlModel('<style>.a{color:red}</style>'), htmlModel('<style media="print">.a{color:red}</style>'));
assert.notEqual(htmlModel('<div style="--x: \'a  b\'"></div>'), htmlModel('<div style="--x: \'a b\'"></div>'));
assert.notEqual(htmlModel('<link rel="stylesheet" href="x.css">'), htmlModel('<template><link rel="stylesheet" href="x.css"></template>'));
assert.notEqual(htmlModel('<base href="/a/"><link rel="stylesheet" href="x.css">'), htmlModel('<base href="/b/"><link rel="stylesheet" href="x.css">'));

const fixture = [
    '@layer components { .layered { color: red; } }',
    '@media (width < 600px) { .existing { display: none; } }',
    '@keyframes pulse { from { opacity: 0; } to { opacity: 1; } }',
].join('\n');
const parsed = parseCssText(fixture, 'fixture.css');
assert.equal(parsed.rules.length, 2);
assert.deepEqual(parsed.rules.filter(rule => !rule.layer).map(rule => rule.selector), ['.existing']);
assert.equal(parsed.keyframes.length, 1);
assert.deepEqual(parsed.specialAtRules.map(row => row[2]), ['keyframes']);

const layerOrder = parseCssText('@layer tokens, layout, components;', 'layer-order.css');
assert.deepEqual(layerOrder.layerStatements, ['tokens, layout, components']);
assert.deepEqual(layerOrder.specialAtRules || [], []);

// PostCSS rejects escaped at-keywords: explicit rejection is preferable to
// decoding source before parsing. No current P0 input needs this syntax.
assert.throws(() => parseCssText(String.raw`@\69mport url("/escaped.css");`, 'escaped.css'));
assert.throws(() => parseCssText(String.raw`@m\65 dia (width < 600px) {.x{color:red}}`, 'escaped.css'));

assert.equal(hasImportantPriority('red!important'), true);
assert.equal(hasImportantPriority('red ! important'), true);
assert.equal(hasImportantPriority('"!important"'), false);
assert.equal(hasImportantPriority('url("x!important")'), false);
assert.equal(hasImportantPriority('red\\!important'), false);
assert.equal(hasImportantPriority('red !\\69mportant'), true);
assert.equal(hasImportantPriority('red !\\000069 mportant'), true);
assert.equal(hasImportantPriority('red !\\notimportant'), false);
const escapedDeclaration = parseCssText(
    String.raw`.escaped { --x: foo\;bar!important; color: red; }`,
    'escaped-declaration.css',
);
assert.deepEqual(
    escapedDeclaration.declarations.map(({ property, value }) => [property, value]),
    [['--x', String.raw`foo\;bar!important`], ['color', 'red']],
);
assert.equal(hasImportantPriority(escapedDeclaration.declarations[0].value), true);
assert.throws(
    () => parseCssText('.parent { color: red; & .child { color: blue; } }', 'nested.css'),
    /nested declarations/,
);
const viewTransition = parseCssText('@view-transition { navigation: auto; }', 'view-transition.css');
assert.deepEqual(
    viewTransition.declarations.map(({ property, value, atRule }) => [property, value, atRule]),
    [['navigation', 'auto', 'view-transition']],
);
assert.deepEqual(viewTransition.specialAtRules.map(row => row[2]), ['view-transition']);
assert.throws(
    () => parseCssText('@future-rule { navigation: auto; }', 'future.css'),
    /unsupported block @future-rule/,
);
assert.throws(
    () => parseCssText('@future-rule foo;', 'future.css'),
    /unsupported statement @future-rule/,
);
assert.throws(
    () => parseCssText('@page { @top-left { content: "x"; } }', 'page.css'),
    /nested declarations/,
);

assert.throws(
    () => parseCssText('@layer tokens { @layer components, layout; }', 'nested-layer.css'),
    /nested or conditional @layer order/,
);
assert.throws(
    () => parseCssText('@media (width > 1px) { @layer components, layout; }', 'conditional-layer.css'),
    /nested or conditional @layer order/,
);

const duplicateAttributeScan = scanHtml('duplicates.html', [
    '<link rel="stylesheet" rel="alternate" href="/first.css" href="/second.css">',
    '<div style="color:red" style="display:none"></div>',
].join('\n'));
assert.deepEqual(duplicateAttributeScan.links, [
    ['/first.css', [['href', '/first.css'], ['rel', 'stylesheet']]],
]);
assert.deepEqual(duplicateAttributeScan.inlineAttributes, [
    ['duplicates.html', 'div@0', 'color:red'],
]);

const styleAttributeScan = scanHtml(
    'style-attrs.html',
    '<style media="print">.print-only { color: red; }</style>',
);
assert.deepEqual(styleAttributeScan.styleBlocks, [[
    'style-attrs.html',
    0,
    [['media', 'print']],
    '.print-only { color: red; }',
]]);

const htmlScan = scanHtml('fixture.html', [
    '<!-- <link rel="stylesheet" href="/commented.css"> -->',
    '<link rel="style&#x73;heet" href="/active.css">',
    '<link rel="style&#115heet" href="/active-decimal.css">',
    '<link rel="alternate stylesheet" href="/inactive.css" media="print" disabled>',
    '<div title=">" style="color:red"></div>',
    '<div title="<!-- not a comment -->" style="color:blue"></div>',
    '<script data-note=">">const fake = "<link rel=\\\"stylesheet\\\" href=\\\"/fake.css\\\">";</script>',
    '<template><link rel="stylesheet" href="/template.css"><style>.template { color:red; }</style><div style="display:none"></div></template>',
    '<div></div>',
    '<div style="color:red"></div>',
    '<!-- <style>.commented { display:none; }</style><div style="display:none"></div> -->',
].join('\n'));
assert.deepEqual(htmlScan.links, [
    ['/active.css', [['href', '/active.css'], ['rel', 'stylesheet']]],
    ['/active-decimal.css', [['href', '/active-decimal.css'], ['rel', 'stylesheet']]],
    ['/inactive.css', [
        ['disabled', ''],
        ['href', '/inactive.css'],
        ['media', 'print'],
        ['rel', 'alternate stylesheet'],
    ]],
]);
assert.equal(htmlScan.styleBlocks.length, 0);

assert.deepEqual(htmlScan.inlineAttributes, [
    ['fixture.html', 'div@0', 'color:red'],
    ['fixture.html', 'div@1', 'color:blue'],
    ['fixture.html', 'div@3', 'color:red'],
]);

console.log('PASS CSS parser, ordered model, HTML activation and stylesheet ingress regressions');
