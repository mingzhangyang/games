#!/usr/bin/env node
// Echo Cave progress is tracked by authoritative world state, not HUD mirrors.
import assert from 'node:assert/strict';
import { createWorld, hasWorldProgress, LEVELS, RULES, stepWorld } from '../src/games/echo-cave/model/rules.js';

const fresh = () => createWorld(LEVELS[0]);
assert.equal(hasWorldProgress(fresh()), false, 'untouched run has no progress');

const explored = fresh();
stepWorld(explored, 0.01, { mx: 1, my: 0, pulse: false });
assert.equal(explored.pulseCount, 0, 'movement does not emit a sonar pulse');
assert.equal(explored.hasMoved, true, 'the engine records real exploration');
assert.equal(hasWorldProgress(explored), true, 'movement alone requires confirmation');
stepWorld(explored, 0.01, { mx: -1, my: 0, pulse: false });
assert.equal(hasWorldProgress(explored), true, 'backtracking cannot discard progress history');

const sounded = fresh();
stepWorld(sounded, 0.01, { mx: 0, my: 0, pulse: true });
assert.equal(sounded.pulseCount, 1, 'the engine records a sonar pulse');
assert.equal(hasWorldProgress(sounded), true, 'sonar use requires confirmation');

const collected = fresh();
collected.got = 1;
assert.equal(hasWorldProgress(collected), true, 'collected crystals are progress');

const hurt = fresh();
hurt.hearts = RULES.hearts - 1;
assert.equal(hasWorldProgress(hurt), true, 'lost health is progress');

assert.equal(hasWorldProgress(fresh()), false, 'new level resets progress');
assert.equal(hasWorldProgress(null), false, 'no world means no progress');
console.log('PASS Echo Cave world-progress contract: movement, pulse, crystals, damage, reset');
