#!/usr/bin/env node
// Functional record/reset regression without Chrome. Real runtime methods run
// against small DOM/storage fixtures; only audio initialization and fetch are mocked.
import assert from 'node:assert/strict';
import { SwordFlightGame } from '../src/games/sword-flight/runtime.js';
import { createPlayerState } from '../src/games/sword-flight/model/player-state.js';
import { getRealmIndex } from '../src/games/sword-flight/model/realm.js';
import { getDailyDateKey, getDailyLeaderboardKey } from '../src/games/sword-flight/model/daily.js';
import { STORAGE_KEYS, REALM_THRESHOLDS } from '../src/games/sword-flight/config.js';
import { I18N } from '../src/games/sword-flight/i18n.js';
import { SFX } from '../src/games/sword-flight/audio.js';
import { SWORD_FLIGHT_STORAGE, SWORD_FLIGHT_STORAGE_SLOTS } from '../src/games/sword-flight/storage.js';

const globals = ['document', 'localStorage', 'fetch', 'Date'];
const originals = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const originalInit = SFX.init;
const originalPlayUltimate = SFX.playUltimate;
const NativeDate = originals.get('Date')?.value ?? Date;
let nowIso = '2026-01-01T16:00:00.000Z';
const values = new Map();
const nodes = new Map();
const requests = [];
const canonicalKey = slot => SWORD_FLIGHT_STORAGE.key(slot);
const setCanonical = (slot, value) => values.set(canonicalKey(slot), JSON.stringify(value));
const getCanonical = slot => {
    const raw = values.get(canonicalKey(slot));
    return raw == null ? undefined : JSON.parse(raw);
};

function node(id) {
    if (!nodes.has(id)) {
        const classes = new Set();
        const attributes = new Map();
        nodes.set(id, {
            textContent: '', innerHTML: '', style: {}, disabled: false,
            classList: {
                add: (...names) => names.forEach(name => classes.add(name)),
                remove: (...names) => names.forEach(name => classes.delete(name)),
                contains: name => classes.has(name),
                toggle: (name, force) => {
                    const added = force ?? !classes.has(name);
                    if (added) classes.add(name); else classes.delete(name);
                    return added;
                },
            },
            setAttribute: (name, value) => attributes.set(name, value),
            getAttribute: name => attributes.get(name),
            contains: () => false,
        });
    }
    return nodes.get(id);
}

function game(mode = 'endless', score = 0) {
    const g = Object.assign(Object.create(SwordFlightGame.prototype), {
        player: createPlayerState(), mode, score,
        isPlaying: true, isPaused: false, currentStageIndex: 0,
        distanceSoared: 123, ringsThreaded: 1, totalRingsInStage: 1,
        maxComboThisRun: 2, showToast: () => {},
    });
    g.loadRecords();
    return g;
}

try {
    globalThis.localStorage = {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
    };
    globalThis.document = {
        getElementById: node,
        querySelectorAll: selector => selector === '.sf-star-slot' ? [node('star1'), node('star2'), node('star3')] : [],
        activeElement: null,
    };
    SFX.init = () => {};
    SFX.playUltimate = () => {};
    globalThis.Date = class extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [nowIso])); }
        static now() { return NativeDate.parse(nowIso); }
    };
    globalThis.fetch = async (url, options = {}) => {
        requests.push({ url, options });
        throw new Error('offline');
    };

    for (const storedLocale of ['zh', 'en']) {
        for (const activeLocale of ['zh', 'en']) {
            values.set('site_lang', activeLocale);
            for (let rank = 1; rank < REALM_THRESHOLDS.length; rank++) {
                const record = I18N[storedLocale].realms[rank];
                setCanonical(SWORD_FLIGHT_STORAGE_SLOTS.MAX_REALM, record);
                const g = game();
                g.score = REALM_THRESHOLDS[1];
                g.checkCultivationBreakthrough();
                g.saveRecords();
                assert.equal(g.player.realmIndex, 1);
                assert.equal(g.maxRealm, record);
                assert.equal(getCanonical(SWORD_FLIGHT_STORAGE_SLOTS.MAX_REALM), record);
                assert.equal(getRealmIndex(record), rank);
            }
            setCanonical(SWORD_FLIGHT_STORAGE_SLOTS.MAX_REALM, I18N[storedLocale].realms[1]);
            const g = game();
            g.player.realmIndex = 1;
            g.score = REALM_THRESHOLDS[2];
            g.checkCultivationBreakthrough();
            assert.equal(g.maxRealm, I18N[activeLocale].realms[2]);
            assert.equal(getCanonical(SWORD_FLIGHT_STORAGE_SLOTS.MAX_REALM), g.maxRealm);
        }
    }
    console.log('✓ highest realm never decreases across either stored/active locale; higher realms still persist');

    for (const storedLocale of ['zh', 'en']) {
        for (const activeLocale of ['zh', 'en']) {
            values.set('site_lang', activeLocale);
            setCanonical(SWORD_FLIGHT_STORAGE_SLOTS.MAX_REALM, I18N[storedLocale].realms[3]);
            game().updateSideRecords();
            assert.equal(node('sf-rec-realm').textContent, I18N[activeLocale].realms[3]);
        }
    }
    console.log('✓ sidebar shows the highest realm in the active language, whatever locale stored it');

    for (const mode of ['stages', 'endless', 'daily', 'zen']) {
        const g = game(mode);
        g.player.maxQi = 200;
        g.player.qi = 12;
        g.player.realmIndex = 5;
        g.player.swordCount = 11;
        g.startFlight(mode, 2);
        assert.equal(g.player.realmIndex, 0);
        assert.equal(g.player.swordCount, 1);
        assert.equal(g.player.maxQi, 100);
        assert.equal(g.player.qi, 100);
        assert.equal(node('sf-val-qi').textContent, '100%');
        assert.equal(g.score, 0);
        assert.equal(g.player.lives, mode === 'zen' ? 99 : 3);
        g.player.maxQi = 120;
        g.restartGame();
        assert.equal(g.player.maxQi, 100);
        assert.equal(g.player.qi, 100);
    }
    console.log('✓ start and restart reset realm, sword count, Qi capacity and HUD in all modes');

    for (const mode of ['stages', 'daily', 'zen', 'endless']) {
        setCanonical(SWORD_FLIGHT_STORAGE_SLOTS.ENDLESS_BEST, 900);
        const g = game(mode, 2000);
        g.handleGameOver();
        assert.equal(g.endlessBest, mode === 'endless' ? 2000 : 900);
        assert.equal(getCanonical(SWORD_FLIGHT_STORAGE_SLOTS.ENDLESS_BEST), mode === 'endless' ? 2000 : 900);
        assert.equal(g.isPlaying, false);
        assert.equal(node('sf-go-score').textContent, (2000).toLocaleString());
        const eligible = mode === 'endless' || mode === 'daily';
        assert.equal(node('sf-name-box').classList.contains('hidden'), !eligible);
    }
    game('endless', 100).handleGameOver();
    assert.equal(getCanonical(SWORD_FLIGHT_STORAGE_SLOTS.ENDLESS_BEST), 2000);
    values.set('site_lang', 'en');
    const localizedDistance = game('endless', 1);
    localizedDistance.distanceSoared = 12.6;
    localizedDistance.handleGameOver();
    assert.equal(node('sf-go-distance').textContent, '13 li');
    console.log('✓ only endless game-over can improve the endless record');

    // A fatal hit must end entity processing: later overlapping entities would
    // otherwise see the fresh invincibility timer and add hidden score.
    const fatalRun = (mode, fatal) => {
        const g = game(mode, 1000);
        Object.assign(g, {
            combo: 1, rings: [], spiritStones: [], hazards: [], thunders: [], fiendBirds: [],
            particles: [], clouds: [], petals: [], screenShakes: 0,
        });
        g.player.lives = 1;
        g.player.x = 240;
        g.player.y = 400;
        const at = { x: 240, y: 400 };
        const hazard = () => ({ ...at, width: 100, height: 50, broken: false, type: 'cliff' });
        const thunder = () => ({ ...at, radius: 50, chargeTime: 0, discharged: false });
        const bird = () => ({ ...at, vx: 0, vy: 0, wingAngle: 0, slain: false });
        // updateEntities walks hazards → thunders → birds, each array from its end.
        // The selected fatal entity must be the first collision, with an
        // overlapping scoring entity still left after it in the same pass.
        if (fatal === 'hazard') {
            g.hazards.push(hazard(), hazard()); // last = fatal, first = scoring leftover
            g.fiendBirds.push(bird());
        } else if (fatal === 'thunder') {
            g.thunders.push(thunder());
            g.fiendBirds.push(bird()); // birds run after thunders
        } else {
            g.fiendBirds.push(bird(), bird()); // last = fatal, first = scoring leftover
        }
        return g;
    };
    for (const fatal of ['hazard', 'thunder', 'bird']) {
        const g = fatalRun('endless', fatal);
        g.updateEntities(1 / 60, 0);
        assert.equal(g.isPlaying, false, `${fatal}: fatal hit ends the run`);
        assert.equal(g.score, 1000, `${fatal}: no score after the fatal hit`);
        const fatalEntity = { hazard: g.hazards.at(-1)?.broken, thunder: g.thunders.at(-1)?.discharged, bird: g.fiendBirds.at(-1)?.slain }[fatal];
        assert.equal(fatalEntity, true, `${fatal}: the selected entity delivered the fatal hit`);
        assert.equal(node('sf-go-score').textContent, (1000).toLocaleString());
    }
    const lastStep = fatalRun('stages', 'hazard');
    lastStep.player.realmIndex = 0;
    lastStep.score = REALM_THRESHOLDS[1];
    lastStep.distanceSoared = lastStep.stageTargetDistance = 1e9;
    Object.assign(lastStep, { keys: {}, worldSpeed: 0, scrollOffset: 0, swordArrayAngle: 0, satelliteSwords: [], updateSpawners: () => {} });
    lastStep.player.trailHistory = [];
    node('sf-overlay-victory').classList.add('hidden');
    lastStep.update(1 / 60);
    assert.equal(lastStep.isPlaying, false);
    assert(node('sf-overlay-victory').classList.contains('hidden'), 'dying on the goal step must not also win the stage');
    assert.equal(lastStep.player.realmIndex, 0, 'no breakthrough after the run ended');
    console.log('✓ a fatal hit stops entity scoring, stage victory and breakthroughs for that step');

    const thunderScore = game('endless', 100);
    Object.assign(thunderScore, {
        hazards: [], fiendBirds: [],
        thunders: [
            { discharged: true },
            { discharged: false },
        ],
        particles: [], petals: [], screenShakes: 0, hitStopFrames: 0,
    });
    thunderScore.player.ultEnergy = 100;
    thunderScore.triggerUltimate();
    assert.equal(thunderScore.score, 250);
    assert(thunderScore.thunders.every(th => th.discharged));
    console.log('✓ ultimate only awards thunder score once per entity');

    const petalRun = game('endless');
    Object.assign(petalRun, {
        rings: [], spiritStones: [], hazards: [], thunders: [], fiendBirds: [],
        particles: [], clouds: [],
        petals: [{ x: 10, y: 10, speedX: 0, speedY: 0, size: 2, angle: 0, rotSpeed: 0 }],
    });
    petalRun.spawnLotusAscension(20, 20);
    assert.equal(petalRun.petals.length, 25);
    petalRun.updateEntities(2, 0);
    assert.equal(petalRun.petals.length, 1);
    assert.equal(Number.isFinite(petalRun.petals[0].ttl), false);
    console.log('✓ ultimate petals expire while ambient petals remain bounded');

    const dailyKey = `${STORAGE_KEYS.DAILY_PREFIX}${getDailyDateKey()}`;
    assert.equal(dailyKey, 'sf_daily_20260102');
    values.delete(dailyKey);
    game('daily', 0).handleGameOver();
    assert.equal(values.get(dailyKey), '0');
    assert.equal(node('sf-rec-daily').textContent, 'Ascended Today');
    assert.equal(requests.length, 0);
    const daily = game('daily', 800);
    daily.handleGameOver();
    assert.equal(values.get(dailyKey), '800');
    game('daily', 200).handleGameOver();
    assert.equal(values.get(dailyKey), '800');
    console.log('✓ offline daily completion including 0 points is saved locally and refreshes the sidebar immediately');

    await daily.submitScoreToLeaderboard('MZ', 200);
    assert.equal(values.get(dailyKey), '800');
    assert.equal(JSON.parse(requests.at(-1).options.body).game, 'sword-flight-d20260102');
    globalThis.fetch = async (url, options = {}) => {
        requests.push({ url, options });
        return { ok: true, json: async () => [] };
    };
    await daily.submitScoreToLeaderboard('MZ', 200);
    assert.equal(values.get(dailyKey), '800');
    await daily.openLeaderboardModal('daily');
    assert.equal(new URL(requests.at(-1).url).searchParams.get('game'), getDailyLeaderboardKey());
    await game('endless').submitScoreToLeaderboard('MZ', 200);
    assert.equal(JSON.parse(requests.at(-1).options.body).game, 'sword-flight');

    const requestCount = requests.length;
    assert.equal(await game('stages').submitScoreToLeaderboard('MZ', 9999), false);
    assert.equal(await game('zen').submitScoreToLeaderboard('MZ', 9999), false);
    assert.equal(requests.length, requestCount);
    console.log('✓ leaderboard submission is restricted to endless and daily modes');

    nowIso = '2026-01-01T15:59:30.000Z';
    const crossingDaily = game('daily');
    crossingDaily.startFlight('daily');
    assert.equal(crossingDaily.dailyDateKey, '20260101');
    nowIso = '2026-01-01T16:00:30.000Z';
    crossingDaily.score = 900;
    crossingDaily.handleGameOver();
    assert.equal(values.get(`${STORAGE_KEYS.DAILY_PREFIX}20260101`), '900');
    assert.equal(values.get(dailyKey), '800');
    await crossingDaily.submitScoreToLeaderboard('MZ', 900);
    assert.equal(JSON.parse(requests.at(-1).options.body).game, 'sword-flight-d20260101');
    nowIso = '2026-01-01T16:00:00.000Z';
    console.log('✓ daily result and leaderboard attribution stay pinned to the run date across UTC+8 midnight');

    console.log('✓ failed/successful leaderboard submissions do not overwrite local daily best; board keys stay unchanged');

    const stages = game('stages', 5000);
    const endlessBefore = getCanonical(SWORD_FLIGHT_STORAGE_SLOTS.ENDLESS_BEST);
    stages.handleStageVictory();
    assert.equal(stages.stageStars[1], 3);
    assert.equal(stages.unlockedStage, 2);
    assert.deepEqual(getCanonical(SWORD_FLIGHT_STORAGE_SLOTS.STAGE_STARS), stages.stageStars);
    assert.equal(getCanonical(SWORD_FLIGHT_STORAGE_SLOTS.UNLOCKED_STAGE), 2);
    assert.equal(getCanonical(SWORD_FLIGHT_STORAGE_SLOTS.ENDLESS_BEST), endlessBefore);
    assert.equal(values.get(dailyKey), '800');
    console.log('✓ stage victory still saves stars/unlock without contaminating daily or endless records');
} finally {
    SFX.init = originalInit;
    SFX.playUltimate = originalPlayUltimate;
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
    }
}

console.log('\nverify-sword-flight-records 全部通过 ✅');
