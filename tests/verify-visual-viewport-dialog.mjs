#!/usr/bin/env node
// Deterministic mobile software-keyboard/VisualViewport lifecycle contract.
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
        emit(type, event) { for (const fn of events.get(type) || []) fn(event); },
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
    binding.start();
    flush();
    assert.equal(css('top'), '', 'idle editor should preserve native dialog position');
    assert.equal(viewport.count('resize'), 1, 'listeners attached once for focused editor');

    viewport.height = 785; // address bar collapse, not keyboard
    viewport.emit('resize');
    flush();
    assert.equal(css('max-height'), '');
    assert.equal(viewport.count('resize'), 1,
        'await real keyboard animation even if focus precedes shrink');

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
    assert.equal(input.scrolls, 0, 'must not scroll the underlying game');

    viewport.emit('scroll');
    viewport.emit('resize');
    assert.equal(frames.size, 1, 'viewport events must coalesce into one frame');
    flush();
    assert.equal(dialog.scrollTop, 42, 'unchanged geometry must not re-scroll');

    viewport.offsetTop = 210;
    viewport.emit('scroll');
    flush();
    assert.equal(css('top'), '365px', 'visual viewport pan recenters dialog');

    // A dismissed keyboard may leave the editor focused. Observers must still
    // detach when the viewport returns to normal, while dialog intent remains.
    viewport.height = 844;
    viewport.emit('resize');
    flush();
    assert.equal(css('top'), '');
    assert.equal(css('max-height'), '');
    assert.equal(css('transform'), '');
    assert.equal(css('margin'), 'auto');
    assert.equal(css('position'), 'relative');
    assert.equal(dialog.style.getPropertyPriority('position'), 'important');
    assert.equal(viewport.count('resize'), 0, 'keyboard dismissal tears down viewport listener');
    assert.equal(viewport.count('scroll'), 0, 'keyboard dismissal tears down scroll listener');
    assert.equal(globalThis.window.count('resize'), 0, 'keyboard dismissal tears down window listener');
    assert.equal(dialog.count('focusin'), 1, 'retain refocus handler during open dialog');

    viewport.height = 300;
    viewport.emit('resize');
    flush();
    assert.equal(css('top'), '', 'dismissed editor must not keep reacting');
    dialog.emit('pointerdown', { target: input });
    flush();
    assert.equal(css('top'), '360px', 'a re-tap rearms already-focused editor');
    assert.equal(css('max-height'), '284px');
    assert.equal(viewport.count('resize'), 1);

    globalThis.document.activeElement = { tagName: 'BUTTON' };
    dialog.emit('focusout', { target: input });
    assert.equal(viewport.count('resize'), 0, 'focusout disarms viewport immediately');
    assert.equal(viewport.count('scroll'), 0);
    flush();
    assert.equal(css('max-height'), '');
    assert.equal(css('margin'), 'auto');

    globalThis.document.activeElement = input;
    dialog.emit('focusin', { target: input });
    viewport.emit('resize');
    assert.equal(frames.size, 1);
    binding.stop();
    assert.equal(frames.size, 0, 'close cancels pending frame');
    assert.equal(viewport.count('resize'), 0);
    assert.equal(viewport.count('scroll'), 0);
    assert.equal(dialog.count('focusin'), 0);
    assert.equal(dialog.count('focusout'), 0);
    assert.equal(dialog.count('pointerdown'), 0);
    assert.equal(css('position'), 'relative');
    assert.equal(dialog.style.getPropertyPriority('position'), 'important');
    flush();

    dialog.open = true;
    binding.start();
    flush();
    assert.equal(css('max-height'), '284px', 'reopen recalculates keyboard geometry');
    binding.stop();
    assert.equal(css('max-height'), '');
} finally {
    for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) delete globalThis[name];
        else globalThis[name] = value;
    }
}
console.log('PASS visual viewport dialog: keyboard, focus, teardown, pan and reopen');
