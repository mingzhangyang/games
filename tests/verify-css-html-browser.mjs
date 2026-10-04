import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { htmlJavaScriptInputs, scanHtml } from './lib/css/html-inputs.mjs';
import { auditHtmlStyleIngress } from './lib/css/runtime-sources.mjs';

// Compare the static HTML execution inventory with the browser as an independent
// oracle. No application server or external network is needed for these fixtures.
const types = [
    'application/ecmascript', 'application/javascript', 'application/x-ecmascript', 'application/x-javascript',
    'text/ecmascript', 'text/javascript', 'text/javascript1.0', 'text/javascript1.1', 'text/javascript1.2',
    'text/javascript1.3', 'text/javascript1.4', 'text/javascript1.5', 'text/jscript', 'text/livescript',
    'text/x-ecmascript', 'text/x-javascript',
];
const attributes = ['', 'type=""', ...types.flatMap(type => [`type="${type}"`, `type=" ${type.toUpperCase()} "`]),
    'type="module"', 'language="JavaScript1.5"', 'language="JScript"',
    'type="" language="vbscript"', 'type="text/javascript" language="vbscript"',
    'type="   "', 'type="text/javascript;charset=utf-8"', 'type="application/ld+json"',
    'type="text/plain" language="javascript"', 'type="&#xA0;text/javascript&#xA0;"',
    'language=" javascript"'];
const scripts = attributes.map((attrs, index) => `<script ${attrs}>window.__execution.push(${index});</script>`);
const expected = scripts.flatMap((html, index) => htmlJavaScriptInputs(html).length ? [index] : []);
const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });
try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent('<!doctype html><script>window.__execution=[];</script>' + scripts.join('\n'));
    await page.waitForFunction(count => window.__execution.length >= count, { timeout: 5000 }, expected.length);
    assert.deepEqual((await page.evaluate(() => window.__execution)).sort((a, b) => a - b), expected,
        'HTML script type/language classification must agree with actual execution');

    const handler = `<button id="handler" onclick="with (window) { __handled=true; return false; }">probe</button>`;
    assert.deepEqual(auditHtmlStyleIngress(handler), []);
    await page.setContent(handler);
    assert.deepEqual(await page.evaluate(() => ({
        result: document.getElementById('handler').onclick(new window.Event('click')),
        handled: window.__handled,
    })), { result: false, handled: true });
    const injection = `<button id="inject" onclick="const s=document.createElement('style');
        s.textContent='body{--handler-sheet:installed}'; document.head.append(s); return false;">probe</button>`;
    assert.ok(auditHtmlStyleIngress(injection).length, 'event stylesheet injection must be rejected');
    await page.setContent(injection);
    await page.click('#inject');
    assert.equal(await page.evaluate(() => window.getComputedStyle(document.body)
        .getPropertyValue('--handler-sheet').trim()), 'installed');
    const recovered = '<div></div><body onclick="document.body.dataset.recovered=\'yes\'; return false;">';
    assert.equal(htmlJavaScriptInputs(recovered).filter(input => input.grammar === 'handler').length, 1);
    await page.setContent(recovered);
    await page.evaluate(() => document.body.onclick(new window.Event('click')));
    assert.equal(await page.evaluate(() => document.body.dataset.recovered), 'yes');

    for (const mode of ['open', 'closed']) {
        const shadow = `<div id="host"><template shadowrootmode="${mode}">
            <style>:host{color:rgb(17,34,51)}</style>
            <link rel="stylesheet" href="data:text/css,:host%7B--shadow-link:installed%7D">
            <slot></slot></template><span>probe</span></div>`;
        assert.throws(() => scanHtml('shadow.html', shadow), /declarative Shadow DOM/);
        assert.ok(auditHtmlStyleIngress(shadow).length);
        await page.setContent(shadow);
        await page.waitForFunction(() => window.getComputedStyle(document.getElementById('host'))
            .getPropertyValue('--shadow-link').trim() === 'installed');
        assert.equal(await page.evaluate(() => window.getComputedStyle(document.getElementById('host')).color),
            'rgb(17, 34, 51)', 'declarative ' + mode + ' root activates its stylesheet');
    }
    assert.deepEqual(errors, []);
    await page.close();
    console.log('PASS HTML execution inventory agrees with browser script types, handlers and shadow-root activation');
} finally {
    await browser.close();
}
