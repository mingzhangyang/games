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

const globals = ['document', 'localStorage', 'fetch', 'Date'];
const originals = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const originalInit = SFX.init;
const values = new Map();
const nodes = new Map();
const requests = [];

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
    globalThis.Date = class extends Date {
        constructor(...args) { super(...(args.length ? args : ['2026-01-01T16:00:00.000Z'])); }
        static now() { return 1767283200000; }
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
                values.set(STORAGE_KEYS.MAX_REALM, record);
                const g = game();
                g.score = REALM_THRESHOLDS[1];
                g.checkCultivationBreakthrough();
                g.saveRecords();
                assert.equal(g.player.realmIndex, 1);
                assert.equal(g.maxRealm, record);
                assert.equal(values.get(STORAGE_KEYS.MAX_REALM), record);
                assert.equal(getRealmIndex(record), rank);
            }
            values.set(STORAGE_KEYS.MAX_REALM, I18N[storedLocale].realms[1]);
            const g = game();
            g.player.realmIndex = 1;
            g.score = REALM_THRESHOLDS[2];
            g.checkCultivationBreakthrough();
            assert.equal(g.maxRealm, I18N[activeLocale].realms[2]);
            assert.equal(values.get(STORAGE_KEYS.MAX_REALM), g.maxRealm);
        }
    }
    console.log('✓ highest realm never decreases across either stored/active locale; higher realms still persist');

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
        values.set(STORAGE_KEYS.ENDLESS_BEST, '900');
        const g = game(mode, 2000);
        g.handleGameOver();
        assert.equal(g.endlessBest, mode === 'endless' ? 2000 : 900);
        assert.equal(values.get(STORAGE_KEYS.ENDLESS_BEST), mode === 'endless' ? '2000' : '900');
        assert.equal(g.isPlaying, false);
        assert.equal(node('sf-go-score').textContent, (2000).toLocaleString());
    }
    game('endless', 100).handleGameOver();
    assert.equal(values.get(STORAGE_KEYS.ENDLESS_BEST), '2000');
    values.set('site_lang', 'en');
    const localizedDistance = game('endless', 1);
    localizedDistance.distanceSoared = 12.6;
    localizedDistance.handleGameOver();
    assert.equal(node('sf-go-distance').textContent, '13 li');
    console.log('✓ only endless game-over can improve the endless record');

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
    console.log('✓ failed/successful leaderboard submissions do not overwrite local daily best; board keys stay unchanged');

    const stages = game('stages', 5000);
    const endlessBefore = values.get(STORAGE_KEYS.ENDLESS_BEST);
    stages.handleStageVictory();
    assert.equal(stages.stageStars[1], 3);
    assert.equal(stages.unlockedStage, 2);
    assert.equal(values.get(STORAGE_KEYS.ENDLESS_BEST), endlessBefore);
    assert.equal(values.get(dailyKey), '800');
    console.log('✓ stage victory still saves stars/unlock without contaminating daily or endless records');
} finally {
    SFX.init = originalInit;
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
    }
}

console.log('\nverify-sword-flight-records 全部通过 ✅');
