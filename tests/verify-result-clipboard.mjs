// A rejected clipboard write must never be displayed as a successful copy.
import assert from 'node:assert/strict';
import { copyResultText } from '../src/platform/result-clipboard.js';

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
let checks = 0;
function install(navigatorValue, documentValue) {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: navigatorValue });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: documentValue });
}
function legacy(copyResult) {
    const area = {
        value: '', style: {}, selected: false, removed: false,
        select() { this.selected = true; },
        remove() { this.removed = true; },
    };
    const doc = {
        area,
        body: { appendChild(node) { assert.equal(node, area); } },
        createElement(tag) { assert.equal(tag, 'textarea'); return area; },
        execCommand(command) {
            assert.equal(command, 'copy');
            assert.equal(area.value, 'Test result');
            assert(area.selected);
            if (copyResult instanceof Error) throw copyResult;
            return copyResult;
        },
    };
    return doc;
}
try {
    let writes = 0;
    install({ clipboard: { writeText: async text => {
        assert.equal(text, 'Test result');
        writes++;
    } } }, legacy(false));
    assert.equal(await copyResultText('Test result'), true);
    assert.equal(writes, 1);
    checks++;

    const fallbacks = [true, false, new Error('copy denied')];
    for (const success of fallbacks) {
        const document = legacy(success);
        install({ clipboard: { writeText: async () => { throw new Error('permission denied'); } } }, document);
        assert.equal(await copyResultText('Test result'), success === true);
        assert(document.area.removed, 'fallback textarea must always be removed');
        checks++;
    }
    const fallback = legacy(false);
    install({}, fallback);
    assert.equal(await copyResultText('Test result'), false, 'execCommand(false) must not count as success');
    checks++;
    install({ clipboard: { writeText: async () => { throw new Error('permission denied'); } } }, undefined);
    assert.equal(await copyResultText('Test result'), false, 'no document means copy failed');
    checks++;
} finally {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete globalThis.navigator;
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else delete globalThis.document;
}
console.log('verify-result-clipboard: ' + checks + ' success/failure/fallback cases passed');
