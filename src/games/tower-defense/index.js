/**
 * Neon Tower Defense composition root.
 *
 * Gameplay state lives in runtime.js; rules, systems, renderer, input and UI
 * are imported as directed modules.  This file only publishes the QA surface
 * and assembles the game with the shared platform runtime.
 */
import { getLang } from '../../platform/site-settings.js';
import { onReady } from '../../platform/boot.js';
import { mountGameRuntime } from '../../platform/runtime/game-runtime.js';
import { LANGUAGES } from './i18n.js';
import { LEVELS } from './levels.js';
import { compileLevelMap } from './model/level-runtime.js';
import { buildWave } from './model/wave-runtime.js';
import {
    ENEMY_TYPES, STACK_GOLD_PER, STACK_HP_PER, STACK_MAX,
    TARGET_PRIORITIES, TOWER_TYPES, W
} from './config.js';
import { TowerDefenseGame } from './runtime.js';

export { TowerDefenseGame } from './runtime.js';

// These stable globals are part of the existing QA/debug contract.  They are
// intentionally published by the composition root rather than by individual
// systems so the browser sees one coherent game instance and one data source.
if (typeof window !== 'undefined') {
    window.__TD_LEVELS__ = LEVELS;
    window.__TD_BUILD_WAVE__ = buildWave;
    window.__TD_ENEMY_TYPES__ = ENEMY_TYPES;
    window.__TD_TOWER_TYPES__ = TOWER_TYPES;
    window.__TD_TARGET_PRIORITIES__ = TARGET_PRIORITIES;
    window.__TD_STACK_MAX__ = STACK_MAX;
    window.__TD_STACK_HP_PER__ = STACK_HP_PER;
    window.__TD_STACK_GOLD_PER__ = STACK_GOLD_PER;
    window.__TD_COMPILE_MAP__ = compileLevelMap;
}

onReady(() => {
    window.tdGame = new TowerDefenseGame();
    const getText = () => LANGUAGES[getLang()] || LANGUAGES.en;

    window.tdRuntime = mountGameRuntime({
        self: 'tower-defense.html',
        game: window.tdGame,
        frame: { logicalWidth: W, layout: 'immersive' },
        chrome: {
            owns: ['more'],
            getText,
            labels: { pause: () => (LANGUAGES[getLang()] || {}).pause },
        },
    });
});
