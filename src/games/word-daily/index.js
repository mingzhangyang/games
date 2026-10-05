import { createI18nBinder } from '../../platform/i18n/bindings.js';
/** Word Daily composition root. */
import { getLang } from '../../platform/site-settings.js';
import { onReady } from '../../platform/boot.js';
import { mountGameRuntime } from '../../platform/runtime/game-runtime.js';
import { LANGUAGES } from './i18n.js';
import { WordDailyGame } from './runtime.js';

export { WordDailyGame } from './runtime.js';

onReady(() => {
    const phase6I18n = createI18nBinder({ getLang, tables: LANGUAGES });
    phase6I18n.apply();
    window.addEventListener('site-settings:changed', () => phase6I18n.apply());
    window.wordDailyGame = new WordDailyGame();
    const getText = () => LANGUAGES[getLang()] || LANGUAGES.en;
    window.wordDailyRuntime = mountGameRuntime({
        self: 'word-daily.html',
        frame: false,
        chrome: {
            getText,
            labels: { pause: () => (LANGUAGES[getLang()] || {}).pause },
        },
    });
});
