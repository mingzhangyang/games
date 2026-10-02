/** Word Daily composition root. */
import { getLang } from '../../platform/site-settings.js';
import { onReady } from '../../platform/boot.js';
import { mountGameRuntime } from '../../platform/runtime/game-runtime.js';
import { LANGUAGES } from './i18n.js';
import { WordDailyGame } from './runtime.js';

export { WordDailyGame } from './runtime.js';

onReady(() => {
    window.wordDailyGame = new WordDailyGame();
    const getText = () => LANGUAGES[getLang()] || LANGUAGES.en;
    window.wordDailyRuntime = mountGameRuntime({
        self: 'word-daily.html',
        frame: false,
        chrome: {
            owns: ['more'],
            getText,
            labels: { pause: () => (LANGUAGES[getLang()] || {}).pause },
        },
    });
});
