/** Cultivation thresholds and realm naming. */
import { getLang } from '../../../platform/site-settings.js';
import { I18N } from '../i18n.js';
import { SFX } from '../audio.js';
import { REALM_THRESHOLDS } from '../config.js';
import { SWORD_FLIGHT_STORAGE, SWORD_FLIGHT_STORAGE_SLOTS } from '../storage.js';

// Records keep their legacy localized strings; recognize either locale without
// changing the storage schema when the site language changes.
export function getRealmIndex(name) {
    return Math.max(0, I18N.zh.realms.indexOf(name), I18N.en.realms.indexOf(name));
}

export function checkCultivationBreakthrough(game) {
    const realmThresholds = REALM_THRESHOLDS;
    const nextRealm = game.player.realmIndex + 1;
    if (nextRealm < realmThresholds.length && game.score >= realmThresholds[nextRealm]) {
        game.player.realmIndex = nextRealm;
        game.player.swordCount = 1 + nextRealm * 2; // 1, 3, 5, 7, 9
        game.player.maxQi = 100 + nextRealm * 20;
        game.player.qi = game.player.maxQi;

        SFX.playRingChime(5);
        game.screenShakes = 10;
        game.showToast(`${I18N[getLang() === 'zh' ? 'zh' : 'en'].toastBreakthrough}：${game.getRealmName(nextRealm)}！`);
        game.updateRealmDisplay();

        // 升级记录
        const rName = game.getRealmName(nextRealm);
        if (nextRealm > getRealmIndex(game.maxRealm)) {
            game.maxRealm = rName;
            SWORD_FLIGHT_STORAGE.set(SWORD_FLIGHT_STORAGE_SLOTS.MAX_REALM, rName);
        }
    }

}

export function getRealmName(game, idx) {
    const lang = getLang() === 'zh' ? 'zh' : 'en';
    const realms = I18N[lang].realms;
    return realms[Math.min(idx, realms.length - 1)];

}
