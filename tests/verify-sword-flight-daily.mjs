#!/usr/bin/env node
// Daily-course determinism and modifier regression without Chrome.
import assert from 'node:assert/strict';
import { hashStringFNV, mulberry32 } from '../src/platform/daily.js';
import { createPlayerState } from '../src/games/sword-flight/model/player-state.js';
import { createDailyRandom, DAILY_MODIFIERS } from '../src/games/sword-flight/model/daily.js';
import { seedStageEntities, spawnRing, spawnSpiritStone, spawnHazard, spawnThunder, spawnFiendBird, updateSpawners } from '../src/games/sword-flight/systems/spawn.js';
import { gameLoop, update, SIM_STEP } from '../src/games/sword-flight/systems/movement.js';
import { handleRingThreaded } from '../src/games/sword-flight/systems/combat.js';

const sample = seed => {
    const random = createDailyRandom(seed);
    return Array.from({ length: 12 }, () => random());
};

assert.deepEqual(sample('20260102'), sample('20260102'));
assert.notDeepEqual(sample('20260102'), sample('20260103'));
const sharedRandom = mulberry32(hashStringFNV('20260102'));
assert.deepEqual(sample('20260102'), Array.from({ length: 12 }, () => sharedRandom()));
console.log('✓ same daily date produces the same gameplay random stream');

function seededCourse(seed) {
    const game = {
        mode: 'daily',
        currentStageIndex: 0,
        random: createDailyRandom(seed),
        rings: [],
        spiritStones: [],
        hazards: [],
        thunders: [],
        fiendBirds: [],
        totalRingsInStage: 0,
    };
    game.spawnRing = y => spawnRing(game, y);
    game.spawnSpiritStone = y => spawnSpiritStone(game, y);
    game.spawnHazard = y => spawnHazard(game, y);
    seedStageEntities(game);
    return {
        rings: game.rings,
        spiritStones: game.spiritStones,
        hazards: game.hazards,
    };
}

assert.deepEqual(seededCourse('20260102'), seededCourse('20260102'));
assert.notDeepEqual(seededCourse('20260102'), seededCourse('20260103'));
console.log('✓ daily entity placement is seeded from the UTC+8 date');

globalThis.requestAnimationFrame = () => 0; // gameLoop re-arms itself; tests drive frames by hand

/** Drive the real gameLoop at a display refresh rate for `seconds`. */
function runFrames(game, hz, seconds) {
    game.lastTime = 0;
    for (let frame = 1; frame <= Math.round(hz * seconds); frame++) gameLoop(game, (frame * 1000) / hz);
}

function spawnerCourse(hz, traveledPerStep = 2.5) {
    const game = {
        mode: 'daily',
        currentStageIndex: 3,
        random: createDailyRandom('20260102'),
        isPlaying: true,
        isPaused: false,
        hitStopFrames: 0,
        steps: 0,
        rings: [{ y: 0 }],
        spiritStones: [],
        hazards: [],
        thunders: [],
        fiendBirds: [],
        render: () => {},
    };
    game.spawnRing = y => spawnRing(game, y);
    game.spawnSpiritStone = y => spawnSpiritStone(game, y);
    game.spawnHazard = y => spawnHazard(game, y);
    game.spawnThunder = y => spawnThunder(game, y);
    game.spawnFiendBird = y => spawnFiendBird(game, y);
    game.update = dt => {
        assert.equal(dt, SIM_STEP, 'update must always advance one fixed step');
        game.steps++;
        updateSpawners(game, traveledPerStep);
    };
    runFrames(game, hz, 10);
    return {
        steps: game.steps,
        spiritStones: game.spiritStones,
        hazards: game.hazards,
        thunders: game.thunders,
        fiendBirds: game.fiendBirds,
    };
}

const course60 = spawnerCourse(60);
assert.equal(course60.steps, 600);
assert(course60.spiritStones.length > 0 && course60.hazards.length > 0);
for (const hz of [30, 75, 120, 144]) {
    assert.deepEqual(spawnerCourse(hz), course60, `${hz} Hz must simulate the same daily course as 60 Hz`);
}
console.log('✓ daily course (steps + seeded spawns) is identical at 30/60/75/120/144 Hz');

// Dashing covers ~3x the distance per step; spawn rates stay per-time as tuned.
assert.deepEqual(spawnerCourse(60, 7.6), course60);
console.log('✓ flight speed (dash/dive) no longer multiplies daily spawn density');

function movementGame(dailyModifiers = null) {
    const player = createPlayerState();
    player.x = 240;
    player.y = 480;
    player.targetX = player.x;
    player.targetY = player.y;
    player.trailHistory = [];
    return {
        mode: 'endless',
        keys: {},
        player,
        dailyModifiers,
        worldSpeed: 0,
        distanceSoared: 0,
        scrollOffset: 0,
        swordArrayAngle: 0,
        updateSatelliteSwords: () => {},
        updateSpawners: () => {},
        updateEntities: () => {},
        checkCultivationBreakthrough: () => {},
        updateHUD: () => {},
    };
}

const normalFlight = movementGame();
update(normalFlight, 1 / 60);
assert(normalFlight.distanceSoared > 0, 'sub-meter distance must accumulate between frames');

const dailyFlight = movementGame(DAILY_MODIFIERS);
update(dailyFlight, 1 / 60);
assert.equal(dailyFlight.worldSpeed / normalFlight.worldSpeed, DAILY_MODIFIERS.speedMultiplier);
assert(dailyFlight.distanceSoared > normalFlight.distanceSoared);

const stageFlight = movementGame();
stageFlight.mode = 'stages';
stageFlight.stageTargetDistance = 0.01;
stageFlight.won = false;
stageFlight.handleStageVictory = () => { stageFlight.won = true; };
update(stageFlight, 1 / 60);
assert(stageFlight.won, 'fractional distance must be able to complete a stage');
console.log('✓ distance keeps fractional progress and daily speed is increased by 30%');

function loopedFlight(hz, seconds, setup = () => {}) {
    const game = movementGame();
    Object.assign(game, { isPlaying: true, isPaused: false, hitStopFrames: 0, render: () => {} });
    game.update = dt => update(game, dt);
    game.keys.ArrowRight = true;
    game.keys.ArrowUp = true;
    setup(game);
    runFrames(game, hz, seconds);
    return game;
}

const steer60 = loopedFlight(60, 0.25);
for (const hz of [120, 144]) {
    const steer = loopedFlight(hz, 0.25);
    assert(Math.abs(steer.player.targetX - steer60.player.targetX) < 1e-9
        && Math.abs(steer.player.targetY - steer60.player.targetY) < 1e-9,
    `${hz} Hz keyboard steering must match 60 Hz`);
    assert(Math.abs(steer.player.x - steer60.player.x) < 1e-6 && Math.abs(steer.player.tilt - steer60.player.tilt) < 1e-9,
        `${hz} Hz velocity/tilt smoothing must match 60 Hz`);
    assert(Math.abs(steer.distanceSoared - steer60.distanceSoared) < 1e-9, `${hz} Hz distance must match 60 Hz`);
}
console.log('✓ keyboard steering, smoothing and distance are refresh-rate independent');

for (const hz of [60, 120, 144]) {
    const stopped = loopedFlight(hz, 0.19, g => { g.hitStopFrames = 12; });
    assert.equal(stopped.distanceSoared, 0, `${hz} Hz hit stop must still hold at 0.19s`);
    const resumed = loopedFlight(hz, 0.25, g => { g.hitStopFrames = 12; });
    assert(resumed.distanceSoared > 0, `${hz} Hz hit stop must release after 12 steps (0.2s)`);
}
console.log('✓ hit stop lasts 12 fixed steps (0.2s) at every refresh rate');

function ringGame(dailyModifiers = null) {
    return {
        dailyModifiers,
        ringsThreaded: 0,
        combo: 1,
        maxComboThisRun: 1,
        maxComboRecord: 99,
        score: 0,
        player: { qi: 0, maxQi: 100, ultEnergy: 0 },
        spawnRingBurst: () => {},
    };
}

const normalRing = ringGame();
handleRingThreaded(normalRing, { x: 0, y: 0 });
const dailyRing = ringGame(DAILY_MODIFIERS);
handleRingThreaded(dailyRing, { x: 0, y: 0 });
assert.equal(dailyRing.score, normalRing.score * DAILY_MODIFIERS.ringScoreMultiplier);
console.log('✓ daily ring reward is doubled');

console.log('\nverify-sword-flight-daily 全部通过 ✅');
