import { onReady } from '../../platform/boot.js';
import { mountGameRuntime } from '../../platform/runtime/game-runtime.js';
import { createI18nBinder } from '../../platform/i18n/bindings.js';
import { getLang } from '../../platform/site-settings.js';
import { track } from '../../platform/analytics.js';
import { mountScoreboardDialog } from '../../platform/scoreboard-dialog.js';
import { LANGUAGES } from './i18n.js';
import { CHAPTERS } from './model/levels.js';
import { MagneticGardenGame } from './runtime.js';
onReady(() => {
    const getText = () => LANGUAGES[getLang()] || LANGUAGES.en;
    const i18n = createI18nBinder({ getLang, tables: LANGUAGES }); i18n.apply();
    window.addEventListener('site-settings:changed', () => i18n.apply());
    const game = new MagneticGardenGame({ track, onChapter: ({ chapter, score }) => { void scoreboard.submit({ boardId: chapter, score }); } });
    window.mgGame = game;
    window.mgRuntime = mountGameRuntime({ self: 'magnetic-garden.html', game, frame: { layout: 'immersive' }, more: '#mgMore', chrome: { getText, owns: ['home', 'sound'], labels: { pause: () => game.isPaused ? getText().resumeLabel : getText().pause } } });
    const scoreboard = mountScoreboardDialog({
        boards: CHAPTERS.map(chapter => ({ id: chapter.id, key: `magnetic-garden-${chapter.id}`, label: chapter.title, description: { en: LANGUAGES.en.chapterScore, zh: LANGUAGES.zh.chapterScore } })),
        triggers: [{ selector: '#mg-leaderboard-btn', icon: true }, { before: '#mg-help-btn' }],
        onOpen: () => game.pauseOwnership.acquire('ranking'), onClose: () => game.pauseOwnership.release('ranking'),
    });
    window.mgScoreboard = scoreboard;
    game.init();
});
