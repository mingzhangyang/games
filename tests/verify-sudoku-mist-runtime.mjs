#!/usr/bin/env node
// A ranked hint must never hide a failed-save warning behind its instruction.
import assert from 'node:assert/strict';
import { SudokuMistGame } from '../src/games/sudoku-mist/runtime.js';
import { LANGUAGES } from '../src/games/sudoku-mist/i18n.js';

for (const hint of [
    { cell: 0, digit: 5, tier: 1, via: 'nakedSingle', unit: 0 },
    { cell: 5, action: 'activate' },
]) {
    for (const saved of [false, true]) {
        let saves = 0;
        const game = Object.assign(Object.create(SudokuMistGame.prototype), {
            state: 'playing', isPaused: false, moves: 0,
            meta: { kind: 'daily', ranked: true, dateKey: '20261019' },
            session: { hint: () => hint, inputs: [{ type: 'hint' }] },
            notes: new Uint16Array(81),
            daily: { unsaved: false, save(date, data) {
                saves++;
                this.unsaved = !saved;
                assert.equal(date, '20261019');
                assert.deepEqual(data.inputs, [{ type: 'hint' }]);
                return saved;
            } },
            el: { message: { textContent: '' } },
            t: () => LANGUAGES.en,
            elapsedMs: () => 1000,
            announce() {}, render() {},
            audio: { hint() {} }, board: { focus() {} },
        });
        game.hint();
        assert.equal(saves, 1);
        assert.equal(game.moves, 1);
        if (!saved) {
            assert.equal(game.el.message.textContent, LANGUAGES.en.dailySaveFailed);
            game.setMessage(LANGUAGES.en.dailyResumed);
            assert.equal(game.el.message.textContent, LANGUAGES.en.dailySaveFailed,
                'resume messaging cannot conceal a memory-only checkpoint');
            game.setMessage('');
            assert.equal(game.el.message.textContent, LANGUAGES.en.dailySaveFailed,
                'clearing a transient hint cannot clear a storage warning');
            game.daily.unsaved = false;
            game.renderMessage();
            assert.equal(game.el.message.textContent, '', 'warning clears when the checkpoint is saved');
        }
        else {
            assert.notEqual(game.el.message.textContent, LANGUAGES.en.dailySaveFailed);
            assert.ok(game.el.message.textContent.length > 0);
        }
    }
}
console.log('PASS ranked digit/activation hints preserve save warnings across resume/clear; recovery clears the warning');
