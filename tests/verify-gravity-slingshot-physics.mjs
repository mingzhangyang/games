#!/usr/bin/env node
// Gravity Slingshot physics regression and preview/live parity.
//
// The browser preview and the live flight loop must produce the same fixed-step
// trajectory.  This test drives the live step function directly so it remains
// deterministic and does not require Chrome.
import assert from 'node:assert/strict';
import { LEVELS } from '../src/games/gravity-slingshot/model/course.js';
import { PREVIEW_STEPS } from '../src/games/gravity-slingshot/config.js';
import { simulate, stepProbe } from '../src/games/gravity-slingshot/model/physics.js';

const EPSILON = 1e-12;

function velocity(sample, power) {
    const angle = (sample / 720) * Math.PI * 2;
    return { vx: Math.cos(angle) * power, vy: Math.sin(angle) * power };
}

function driveLive(level, vx, vy, maxSteps) {
    const probe = { x: level.pad.x, y: level.pad.y, vx, vy };
    const pts = [];
    let t = 0;
    for (let i = 0; i < maxSteps; i++) {
        const result = stepProbe(level, probe, t);
        t = result.t;
        if (result.outcome) return { pts, outcome: result.outcome, steps: i, probe, t };
        pts.push({ x: probe.x, y: probe.y });
    }
    return { pts, outcome: 'timeout', steps: maxSteps, probe, t };
}

function assertTraceMatches(label, level, launch, maxSteps) {
    const preview = simulate(level, level.pad.x, level.pad.y, launch.vx, launch.vy, maxSteps);
    const live = driveLive(level, launch.vx, launch.vy, maxSteps);

    assert.equal(live.outcome, preview.outcome, `${label}: outcome`);
    assert.equal(live.steps, preview.steps, `${label}: step count`);
    assert.equal(live.pts.length, preview.pts.length, `${label}: sampled point count`);
    for (let i = 0; i < preview.pts.length; i++) {
        assert.ok(Math.abs(live.pts[i].x - preview.pts[i].x) <= EPSILON, `${label}: x at step ${i}`);
        assert.ok(Math.abs(live.pts[i].y - preview.pts[i].y) <= EPSILON, `${label}: y at step ${i}`);
    }
    return { preview, live };
}

// Level 3 has stable representatives for all four terminal paths.  These
// cases also cover the body collision and target capture checks, not merely
// the no-result timeout path.
const level = LEVELS[2];
const cases = [
    { name: 'crash', sample: 0, power: 60, outcome: 'crash' },
    { name: 'capture', sample: 0, power: 108, outcome: 'capture' },
    { name: 'lost', sample: 0, power: 132, outcome: 'lost' },
    { name: 'timeout', sample: 0, power: 84, outcome: 'timeout' },
];

for (const testCase of cases) {
    const launch = velocity(testCase.sample, testCase.power);
    const result = assertTraceMatches(testCase.name, level, launch, 2400);
    assert.equal(result.preview.outcome, testCase.outcome, `${testCase.name}: stable terminal outcome`);
}
console.log('✓ live fixed-step trajectories match the full preview solver');

// The actual drag preview is capped at PREVIEW_STEPS.  Compare exactly the
// visible preview window with the first live steps as well, so a later terminal
// result cannot hide an early divergence.
const previewLaunch = velocity(0, 108);
const preview = assertTraceMatches('preview-window', level, previewLaunch, PREVIEW_STEPS);
assert.equal(preview.preview.outcome, 'timeout', 'preview window remains non-terminal for the capture case');
console.log(`✓ ${PREVIEW_STEPS}-step drag preview matches the live flight prefix`);

console.log('\nverify-gravity-slingshot-physics 全部通过 ✅');
