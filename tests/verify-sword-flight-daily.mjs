#!/usr/bin/env node
// Daily-course determinism and modifier regression without Chrome.
import assert from 'node:assert/strict';
import { createPlayerState } from '../src/games/sword-flight/model/player-state.js';
import { createDailyRandom, DAILY_MODIFIERS } from '../src/games/sword-flight/model/daily.js';
import { seedStageEntities, spawnRing, spawnSpiritStone, spawnHazard } from '../src/games/sword-flight/systems/spawn.js';
import { update } from '../src/games/sword-flight/systems/movement.js';
import { handleRingThreaded } from '../src/games/sword-flight/systems/combat.js';

const sample = seed => {
    const random = createDailyRandom(seed);
    return Array.from({ length: 12 }, () => random());
};

assert.deepEqual(sample('20260102'), sample('20260102'));
assert.notDeepEqual(sample('20260102'), sample('20260103'));
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
