// Step 6d: exact DOM ownership, original stars and one click -> one level selection.
import assert from 'node:assert/strict';
import { renderStarLevelGrid } from '../src/platform/star-level-grid.js';

class FakeElement {
    constructor(tagName) {
        this.tagName = tagName.toUpperCase();
        this.children = [];
        this.dataset = {};
        this.className = '';
        this.textContent = '';
        this.listeners = new Map();
    }
    set innerHTML(value) {
        assert.equal(value, '', 'level grid must only clear existing nodes');
        this.children = [];
    }
    appendChild(node) { this.children.push(node); return node; }
    addEventListener(type, fn) {
        assert.equal(type, 'click');
        assert(!this.listeners.has(type), 'one listener per new chip');
        this.listeners.set(type, fn);
    }
    click() { this.listeners.get('click')?.(); }
}

const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: tag => new FakeElement(tag) },
});
const games = ['sd', 'ec', 'md', 'cb', 'fv'];
const levels = [{ id: 'zero' }, { id: 'one' }, { id: 'three' }];
let assertions = 0;
try {
    for (const prefix of games) {
        const grid = new FakeElement('div');
        const picked = [];
        renderStarLevelGrid(grid, levels, {
            one: { stars: 1 }, three: { stars: 3 },
        }, prefix, index => picked.push(index));
        assert.equal(grid.children.length, 3);
        for (const [index, chip] of grid.children.entries()) {
            const earned = [0, 1, 3][index];
            assert.equal(chip.tagName, 'BUTTON');
            assert.equal(chip.type, 'button');
            assert.equal(chip.dataset.level, String(index));
            assert.equal(chip.className, prefix + '-chip game-start-level-chip'
                + (earned ? ' is-done' : ''));
            assert.deepEqual(chip.children.map(node => node.tagName), ['SPAN', 'SPAN']);
            assert.equal(chip.children[0].className, prefix + '-chip-num game-start-chip-num');
            assert.equal(chip.children[0].textContent, String(index + 1));
            assert.equal(chip.children[1].className, prefix + '-chip-stars game-start-chip-stars');
            assert.equal(chip.children[1].textContent, '★'.repeat(earned) + '☆'.repeat(3 - earned));
            chip.click();
            assertions += 9;
        }
        assert.deepEqual(picked, [0, 1, 2], 'one click must select exactly one level');
        const originalNodes = grid.children;
        renderStarLevelGrid(grid, levels, {}, prefix, index => picked.push(index));
        assert.notEqual(grid.children, originalNodes, 'rerender replaces existing children');
        assert(grid.children.every(chip => !chip.className.includes('is-done')));
        assert(grid.children.every(chip => chip.children[1].textContent === '☆☆☆'));
        grid.children[1].click();
        assert.deepEqual(picked, [0, 1, 2, 1], 'rerender does not duplicate handlers');
        renderStarLevelGrid(null, levels, {}, prefix, () => {
            throw new Error('missing container must not trigger a selection');
        });
        assertions += 6;
    }
} finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
}
console.log('verify-star-level-grid: ' + assertions + ' DOM/star/click assertions across 5 games');
