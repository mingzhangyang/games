import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCssText } from './lib/css/baseline-adapter.mjs';
import { parseStylesheet, normalizeFragment, hasImportantPriority } from './lib/css/model.mjs';
import { scanHtml, htmlJavaScriptInputs, htmlScriptKind, isStylesheetLink } from './lib/css/html-inputs.mjs';
import { htmlCascadeModel, fingerprint } from './lib/css/semantic-contract.mjs';
import {
    auditStyleIngress, auditHtmlStyleIngress, auditedJavaScriptFiles, readStyleRegistry, SOURCE_IDS, STYLE_REGISTRY,
} from './lib/css/runtime-sources.mjs';
import { pageActivation } from './lib/css/activation.mjs';

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
// Name-hiding is rejected by category: every syntactic way to make a capability
// name invisible at its use site (no aliasing/data flow involved) must fail.
for (const source of [
    'globalThis.document["create" + "Element"]("style");',
    'const k="sheet"; window.document.body[k];',
    'element.ownerDocument[key]("style");',
    'node.getRootNode()[key];',
    'document?.["create" + "Element"]?.("style");',
    'factories[key]("style");',
    'new registry[key]();',
    'registry[key]`style`;',
    'registry[key].call(document, "style");',
    '(registry?.[key])("style");',
    'const {[key]: make} = document;',
    'const {styleSheets} = document;',
    'Reflect.apply(document.createElement, document, ["style"]);',
    'Reflect.get(document, key);',
    'eval("document.styleSheets");',
    'new Function("return document.styleSheets")();',
    '(() => {}).constructor("return document.styleSheets")();',
    'setTimeout("document.styleSheets", 0);',
    'window.setInterval(`document.${key}`, 0);',
    'location.href = "java\tscript:void document.styleSheets";',
    'import(path);',
    'element.attachShadow({ mode: "open" });',
    'element.setHTMLUnsafe(markup);',
    'document.createElement("iframe");',
    'document.createElement("base");',
    'document.createElement("meta");',
    'const s=document.createElement("script"); s.src="/src/games/math-rain/mobile-adapter.js"; document.head.append(s);',
    'const s=document.createElement("script"); s.type="module"; s.textContent=code; document.head.append(s);',
    'const s=document.createElement("script"); s.textContent=code; s.type="application/ld+json"; document.head.append(s);',
    'const s=document.createElement("script"); s.type="application/ld+json"; const t=s; t.type="module";',
    'const s=document.createElement("script"); s.type="application/ld+json"; s.type="text/javascript";',
    'const s=document.createElement("script"); s.type="application/ld+json"; setTimeout(() => { s.src=u; });',
    'let s=document.createElement("script"); s.type="application/ld+json"; document.head.append(s);',
    // Every name position is checked against the same capability table.
    'window.eval("document.styleSheets");',
    'globalThis.Function("return document.styleSheets")();',
    'window.Reflect.get(document, key);',
    'new self.DOMParser();',
    'new window.CSSStyleSheet();',
    'const { eval: run } = window; run(code);',
    'const { Function: F } = globalThis;',
    'const { CSSStyleSheet: Sheet } = window;',
    'const { constructor: make } = () => {};',
    'const { setTimeout: later } = window; later("document.styleSheets", 0);',
]) assert.ok(auditStyleIngress(source).length, source);
assert.match(auditHtmlStyleIngress('<script>with (document) { createElement("style"); }</script>').join('\n'),
    /with statements hide/);
for (const body of ['createElement("style")', 'return styleSheets[0]', 'adoptedStyleSheets = []', 'write("x")']) {
    assert.ok(auditHtmlStyleIngress(`<button onclick='${body}'></button>`).length, 'handler scope: ' + body);
}
// Ordinary data lookups and statically named calls remain allowed.
for (const source of [
    'const text = window.LANGUAGES[window.currentLanguage];',
    'window[expose] = runtime.game;',
    'items[index].update(); grid[y][x] = 1; handlers[0]();',
    'const write = value => value; write(1);',
    'const s=document.createElement("script"); s.type="application/ld+json"; s.textContent=JSON.stringify(data);'
        + ' document.head.appendChild(s);',
]) assert.deepEqual(auditStyleIngress(source), [], source);

// Activation: which page executes a runtime stylesheet installer is part of
// the cascade model. A new page entry or import edge must change it.
const ROOT = new URL('..', import.meta.url).pathname;
const audited = auditedJavaScriptFiles(ROOT);
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const activation = html => pageActivation(ROOT, 'index.html', html, audited);
const withScript = script => indexHtml.replace('</body>', script + '\n</body>');
const allSources = Object.values(SOURCE_IDS).sort();
assert.deepEqual(activation(indexHtml).runtimeStyleSources, []);
assert.deepEqual(pageActivation(ROOT, 'math-rain.html',
    readFileSync(new URL('../math-rain.html', import.meta.url), 'utf8'), audited).runtimeStyleSources, allSources);
for (const script of [
    '<script type="module" src="src/games/math-rain/mobile-adapter.js"></script>',
    '<script type="module">import "./src/games/math-rain/shop-manager.js";</script>',
    '<script type="module">import("/src/games/math-rain/install-style.js");</script>',
    '<button onclick="import(\'./src/games/math-rain/core/UIController.js\')"></button>',
]) assert.deepEqual(activation(withScript(script)).runtimeStyleSources, allSources, script);
const reordered = activation(withScript('<script src="/analytics.js"></script>'));
assert.notDeepEqual(reordered.scripts, activation(indexHtml).scripts, 'script identity and order are recorded');
const deferred = indexHtml.replace('<script src="/theme-boot.js"></script>', '<script src="/theme-boot.js" defer></script>');
assert.notDeepEqual(activation(deferred).scripts, activation(indexHtml).scripts, 'activation attributes are recorded');
// Document directives: pragmas are rejected by the shared HTML boundary; the
// encoding/viewport/color-scheme directives are recorded per page.
for (const meta of ['<meta http-equiv="Content-Security-Policy" content="style-src \'none\'">',
    '<meta HTTP-EQUIV="default-style" content="alt">', '<meta http-equiv="content-type" content="text/html; charset=latin1">',
    '<meta http-equiv="refresh" content="0">', '<p><meta http-equiv="x-unknown" content=""></p>']) {
    const html = indexHtml.replace('<head>', '<head>' + meta);
    assert.throws(() => scanHtml('index.html', html), /http-equiv/, meta);
    assert.throws(() => htmlCascadeModel(html, 'index.html'), /http-equiv/, meta);
    assert.match(auditHtmlStyleIngress(html, 'index.html', audited).join('\n'), /http-equiv/, meta);
    assert.throws(() => activation(html), /http-equiv/, meta);
}
const directives = html => activation(html).directives;
// HTML whitespace is ASCII-only: NBSP is data, not a separator, everywhere.
assert.notDeepEqual(directives(indexHtml.replace('initial-scale', '\u00a0initial-scale')
    .replace(', \u00a0', ',\u00a0')), directives(indexHtml));
assert.equal(isStylesheetLink({ rel: 'stylesheet\u00a0preload' }), false);
assert.equal(isStylesheetLink({ rel: '\tSTYLESHEET\npreload ' }), true);
assert.equal(isStylesheetLink({ rel: 'ſtylesheet' }), false);
assert.notDeepEqual(scanHtml('nbsp.html', '<div style="color:\u00a0red"></div>').inlineAttributes,
    scanHtml('nbsp.html', '<div style="color: red"></div>').inlineAttributes);
assert.deepEqual(directives(indexHtml).map(([name]) => name), ['charset', 'viewport']);
for (const html of [
    indexHtml.replace('initial-scale=1.0', 'initial-scale=2.0'),
    indexHtml.replace('<meta charset="UTF-8">', '<meta charset="windows-1252">'),
    indexHtml.replace('<head>', '<head><meta name="Color-Scheme" content="light dark">'),
]) assert.notDeepEqual(directives(html), directives(indexHtml));
for (const [script, pattern] of [
    ['<script type="module">import(name);</script>', /string literal/],
    ['<script type="module">import "lodash";</script>', /outside the audited local/],
    ['<script type="module">import "https://elsewhere.invalid/x.js";</script>', /outside the audited local/],
    ['<script type="module">import "./css/index.css";</script>', /outside the audited local/],
    ['<script type="module" src="src/platform/shell/render-game-shell.js"></script>', /scaffold/],
]) assert.throws(() => activation(withScript(script)), pattern, script);
const registryText = readFileSync(new URL('../' + STYLE_REGISTRY, import.meta.url), 'utf8');
assert.equal(Object.keys(readStyleRegistry(registryText)).length, 5);
assert.throws(() => readStyleRegistry(registryText + '\nconsole.log("side effect");'));
assert.throws(() => readStyleRegistry('export const STYLE_SOURCES=Object.freeze({mobile: buildCss()});'));

const htmlModel = html => fingerprint(htmlCascadeModel(html, 'fixture.html'));
assert.notEqual(htmlModel('<style>.a{color:red}</style>'), htmlModel('<style media="print">.a{color:red}</style>'));
assert.notEqual(htmlModel('<div style="--x: \'a  b\'"></div>'), htmlModel('<div style="--x: \'a b\'"></div>'));
assert.notEqual(htmlModel('<link rel="stylesheet" href="x.css">'), htmlModel('<template><link rel="stylesheet" href="x.css"></template>'));
assert.notEqual(htmlModel('<base href="/a/"><link rel="stylesheet" href="x.css">'), htmlModel('<base href="/b/"><link rel="stylesheet" href="x.css">'));

// Browser-active inputs are classified once, before either cascade projection or
// JavaScript audit. Unsupported cascade scopes must fail in every consumer.
for (const mode of ['open', 'closed', 'OPEN', 'cl&#111;sed', 'unknown', '']) {
    const html = `<div><template shadowrootmode="${mode}"><style>.x{color:red}</style>
        <link rel="stylesheet" href="x.css"></template></div>`;
    assert.throws(() => scanHtml('shadow.html', html), /declarative Shadow DOM/);
    assert.throws(() => htmlCascadeModel(html, 'shadow.html'), /declarative Shadow DOM/);
    assert.match(auditHtmlStyleIngress(html).join('\n'), /declarative Shadow DOM/);
}
for (const html of [
    '<iframe srcdoc="&lt;style&gt;.x{}&lt;/style&gt;"></iframe>',
    '<iframe src="data:text/html,%3Cscript%3Ealert(1)%3C/script%3E"></iframe>',
    '<object data="new.html"></object>', '<embed src="new.svg">',
    '<svg><script>document.createElement("style")</script></svg>',
    '<svg><style>.x{fill:red}</style></svg>',
]) {
    assert.throws(() => scanHtml('unsupported.html', html), /explicit.*contract/);
    assert.throws(() => htmlCascadeModel(html, 'unsupported.html'), /explicit.*contract/);
    assert.ok(auditHtmlStyleIngress(html).length);
}
assert.deepEqual(auditHtmlStyleIngress(`<template><button onclick="document.createElement('style')"></button>
    <script>document.createElement("style")</script></template>`), []);

const scriptMimeTypes = [
    'application/ecmascript', 'application/javascript', 'application/x-ecmascript', 'application/x-javascript',
    'text/ecmascript', 'text/javascript', 'text/javascript1.0', 'text/javascript1.1', 'text/javascript1.2',
    'text/javascript1.3', 'text/javascript1.4', 'text/javascript1.5', 'text/jscript', 'text/livescript',
    'text/x-ecmascript', 'text/x-javascript',
];
for (const type of ['', ...scriptMimeTypes.flatMap(type => [type, '\t' + type.toUpperCase() + '\n'])]) {
    const html = `<script type="${type}">document.createElement("style")</script>`;
    assert.equal(htmlJavaScriptInputs(html)[0].grammar, 'script', type);
    assert.match(auditHtmlStyleIngress(html).join('\n'), /runtime <style> activates/, type);
}
assert.equal(htmlScriptKind({ type: '   ' }), 'data');
assert.equal(htmlScriptKind({ type: '\u00a0text/javascript\u00a0' }), 'data');
assert.equal(htmlScriptKind({ type: 'text/javascript;charset=utf-8' }), 'data');
assert.equal(htmlScriptKind({ language: 'JavaScript1.5' }), 'script');
assert.equal(htmlScriptKind({ language: ' javascript' }), 'data');
assert.equal(htmlScriptKind({ type: '', language: 'vbscript' }), 'script');
assert.equal(htmlScriptKind({ type: 'application/json', language: 'javascript' }), 'data');
assert.match(auditHtmlStyleIngress('<script language="JScript">document.styleSheets</script>').join('\n'), /styleSheets/);
assert.deepEqual(auditHtmlStyleIngress('<script type="application/ld+json">{"literal":"document.createElement(\'style\')"}</script>'), []);
assert.deepEqual(auditHtmlStyleIngress('<script><!-- classic HTML comment\nvoid 0;</script>'), []);
// Classic grammar parses `with`; the policy then rejects it (not a parse failure).
assert.match(auditHtmlStyleIngress('<script>with (document) { createElement("style"); }</script>').join('\n'),
    /with statements hide/);
assert.deepEqual(auditHtmlStyleIngress('<script type=" MoDuLe ">export const x = 1;</script>'), []);
assert.ok(auditHtmlStyleIngress('<script>export const x = 1;</script>').length);
assert.ok(auditHtmlStyleIngress('<script type="module">with (window) { void 0; }</script>').length);
for (const type of ['IMPORTMAP', ' speculationrules ']) {
    assert.match(auditHtmlStyleIngress(`<script type="${type}">{}</script>`).join('\n'), /explicit script-resolution contract/);
}

for (const [attribute, body] of [
    ['onclick', 'return document.createElement("style")'],
    ['ONERROR', 'const {createElement: make}=document; return make("style")'],
    ['onbeforeunload', 'return document.styleSheets[0].insertRule(".x{}")'],
    ['onload', 'document[&quot;createElement&quot;](&quot;style&quot;)'],
    ['onanimationend', 'document.adoptedStyleSheets=[]'],
]) {
    assert.ok(auditHtmlStyleIngress(`<body ${attribute}='${body}'></body>`).length, attribute);
}
assert.deepEqual(auditHtmlStyleIngress('<button onclick="return false;"></button>'), []);
assert.match(auditHtmlStyleIngress('<button onclick="with (window) { return false; }"></button>').join('\n'),
    /with statements hide/);
assert.deepEqual(auditHtmlStyleIngress('<button onclick="return new.target;"></button>'), []);
assert.deepEqual(auditHtmlStyleIngress('<button onclick="return false;" onclick="document.styleSheets"></button>'), []);
assert.match(auditHtmlStyleIngress('<button onclick="return @;"></button>').join('\n'), /cannot audit JavaScript/);
assert.throws(() => auditStyleIngress('} document.styleSheets; {', 'handler', 'handler'), /single function body/);
// Parser-created elements are live DOM too. A late <body> token can attach
// executable/style attributes to an implied body with no source location.
assert.match(auditHtmlStyleIngress('<div></div><body onclick="document.createElement(\'style\')">')
    .join('\n'), /runtime <style> activates/);
assert.equal(scanHtml('implied.html', '<div></div><body style="color:red">').inlineAttributes.length, 1);
assert.notEqual(htmlModel('<div></div>'), htmlModel('<div></div><body style="color:red">'));

for (const url of ['javascript:document.styleSheets', 'JaVaScRiPt:document.styleSheets',
    '  java&#x09;script:document.styleSheets', '&#x01;javascript:document.styleSheets']) {
    for (const attribute of ['href', 'action', 'formaction', 'xlink:href']) {
        assert.match(auditHtmlStyleIngress(`<a ${attribute}="${url}"></a>`).join('\n'), /javascript: URLs/);
    }
}
assert.deepEqual(auditHtmlStyleIngress('<a href="next.html" data-note="javascript:example"></a>'), []);
const localFiles = new Set(['public/theme-boot.js', 'src/game.js']);
assert.deepEqual(auditHtmlStyleIngress(`<script src="/theme-boot.js"></script>
    <script type="module" src="src/game.js"></script>`, 'index.html', localFiles), []);
for (const html of ['<script src="data:text/javascript,document.styleSheets"></script>',
    '<script src="https://elsewhere.invalid/new.js"></script>', '<script src="/unknown.js"></script>',
    '<base href="https://elsewhere.invalid/"><script src="src/game.js"></script>']) {
    assert.match(auditHtmlStyleIngress(html, 'index.html', localFiles).join('\n'), /outside the audited local/);
}

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
