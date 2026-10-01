/** Cultivation thresholds and realm naming. */
import { getLang } from '../../../platform/site-settings.js';
import { storageSet } from '../../../platform/safe-storage.js';
import { I18N } from '../i18n.js';
import { SFX } from '../audio.js';
import { REALM_THRESHOLDS, STORAGE_KEYS } from '../config.js';

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
        game.maxRealm = rName;
        storageSet(STORAGE_KEYS.MAX_REALM, rName);
    }

}

export function getRealmName(game, idx) {
    const lang = getLang() === 'zh' ? 'zh' : 'en';
    const realms = I18N[lang].realms;
    return realms[Math.min(idx, realms.length - 1)];

}
