#!/usr/bin/env node
// Isolated, deterministic mobile keyboard/visualViewport regression contract.
import assert from 'node:assert/strict';
import { bindDialogToVisualViewport } from '../src/platform/visual-viewport-dialog.js';

function emitter() {
    const events = new Map();
    return {
        addEventListener(type, fn) {
            if (!events.has(type)) events.set(type, new Set());
            events.get(type).add(fn);
        },
        removeEventListener(type, fn) { events.get(type)?.delete(fn); },
        emit(type) { for (const fn of events.get(type) || []) fn(); },
        count(type) { return events.get(type)?.size || 0; },
    };
}

const previous = {
    window: globalThis.window,
    document: globalThis.document,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
};
const frames = new Map();
let nextFrame = 1;
globalThis.requestAnimationFrame = callback => {
    const id = nextFrame++;
    frames.set(id, callback);
    return id;
};
globalThis.cancelAnimationFrame = id => frames.delete(id);
function flush() {
    const callbacks = [...frames.values()];
    frames.clear();
    for (const callback of callbacks) callback();
}

const viewport = Object.assign(emitter(), {
    height: 844, width: 390, offsetTop: 0, offsetLeft: 0,
});
globalThis.window = Object.assign(emitter(), {
    innerHeight: 844, innerWidth: 390, visualViewport: viewport,
});
const input = {
    tagName: 'INPUT',
    scrolls: 0,
    scrollIntoView() { this.scrolls++; },
    getBoundingClientRect() { return { top: 360, bottom: 430 }; },
};
globalThis.document = { activeElement: input };
const styleValues = new Map([['margin', 'auto'], ['position', 'relative']]);
const priorities = new Map([['position', 'important']]);
const dialog = Object.assign(emitter(), {
    open: true,
    scrollTop: 0,
    contains(el) { return el === input; },
    getBoundingClientRect() { return { top: 200, bottom: 400 }; },
    style: {
        getPropertyValue(name) { return styleValues.get(name) || ''; },
        getPropertyPriority(name) { return priorities.get(name) || ''; },
        setProperty(name, value, priority = '') {
            styleValues.set(name, value);
            if (priority) priorities.set(name, priority);
            else priorities.delete(name);
        },
        removeProperty(name) { styleValues.delete(name); priorities.delete(name); },
    },
});
const css = key => dialog.style.getPropertyValue(key);

try {
    const binding = bindDialogToVisualViewport(dialog);
    binding.start();
    binding.start(); // repeated opens must not register duplicate handlers
    flush();
    assert.equal(css('top'), '');
    assert.equal(viewport.count('resize'), 1);

    // Normal browser chrome shortening is not the software keyboard.
    viewport.height = 785;
    viewport.emit('resize');
    flush();
    assert.equal(css('max-height'), '');

    // Safari keyboard occupies the visual viewport, not layout 100dvh.
    Object.assign(viewport, { height: 310, width: 370, offsetTop: 185, offsetLeft: 8 });
    viewport.emit('resize');
    flush();
    assert.equal(css('top'), '340px');
    assert.equal(css('left'), '193px');
    assert.equal(css('max-height'), '294px');
    assert.equal(css('max-width'), '346px');
    assert.equal(css('transform'), 'translate(-50%, -50%)');
    assert.equal(css('margin'), '0');
    assert.equal(dialog.scrollTop, 42, 'only modal content may scroll to reveal nickname');
    assert.equal(input.scrolls, 0, 'must not scroll the underlying page');

    viewport.emit('scroll');
    viewport.emit('resize');
    assert.equal(frames.size, 1, 'resize/scroll must coalesce per animation frame');
    flush();
    assert.equal(dialog.scrollTop, 42, 'unchanged geometry must not scroll again');

    viewport.offsetTop = 210;
    viewport.emit('scroll');
    flush();
    assert.equal(css('top'), '365px', 'visual viewport pan must recenter the dialog');

    // Keyboard dismissal restores native-dialog layout and prior inline values.
    globalThis.document.activeElement = { tagName: 'BUTTON' };
    dialog.emit('focusout');
    flush();
    assert.equal(css('max-height'), '');
    assert.equal(css('transform'), '');
    assert.equal(css('margin'), 'auto');
    assert.equal(css('position'), 'relative');
    assert.equal(dialog.style.getPropertyPriority('position'), 'important',
        'original CSS priority must survive modal teardown');

    globalThis.document.activeElement = input;
    viewport.emit('resize');
    binding.stop(); // close between scheduling and rAF must cancel it
    assert.equal(frames.size, 0);
    assert.equal(viewport.count('scroll'), 0);
    assert.equal(viewport.count('resize'), 0);
    assert.equal(dialog.count('focusin'), 0);
    assert.equal(css('margin'), 'auto');
    flush();
    assert.equal(css('max-height'), '');

    dialog.open = true;
    viewport.height = 300;
    binding.start();
    flush();
    assert.equal(css('max-height'), '284px', 'reopen must recalculate keyboard geometry');
    binding.stop();
    assert.equal(css('max-height'), '');
} finally {
    for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) delete globalThis[name];
        else globalThis[name] = value;
    }
}
console.log('PASS visual viewport dialog: keyboard occlusion, pan, cleanup and reopen');
