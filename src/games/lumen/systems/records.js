/**
 * Lumen 战绩持久化：本页唯一碰存储的模块。
 *   - 星级：GameStorage v2（./storage.js），按关卡 id 存 { 'refract-1': 3, … }，运行时展开成按下标的数组
 *   - 每日协议键（与首页 / 旧版本兼容，⚠️ 勿改名）：
 *       lm_daily_<YYYYMMDD>  当日最好点击数
 *       lm_local_<YYYYMMDD>  离线时的本地榜单（前 10）
 */

import { storageGet, storageSet } from '../../../platform/safe-storage.js';
import { todayKey } from '../../../platform/daily.js';
import { LUMEN_STORAGE, LUMEN_STORAGE_SLOTS } from '../storage.js';
import { LUMEN_LEVELS } from '../model/levels.js';

const clampStars = n => Math.max(0, Math.min(3, Number(n) || 0));

export function loadStars() {
    try {
        const byId = LUMEN_STORAGE.get(LUMEN_STORAGE_SLOTS.STARS, {});
        const map = byId && typeof byId === 'object' && !Array.isArray(byId) ? byId : {};
        return LUMEN_LEVELS.map(lv => clampStars(map[lv.id]));
    } catch (e) {
        return new Array(LUMEN_LEVELS.length).fill(0);
    }
}

export function saveStars(stars) {
    const byId = {};
    LUMEN_LEVELS.forEach((lv, i) => { if (stars[i]) byId[lv.id] = stars[i]; });
    LUMEN_STORAGE.set(LUMEN_STORAGE_SLOTS.STARS, byId);
}

/** 今天的最好点击数（0 = 今天还没通关） */
export function todayBest() {
    return Number(storageGet('lm_daily_' + todayKey())) || 0;
}

/** 记一次每日通关：更少才覆盖。返回 { prev, isBest, best } */
export function recordDailyScore(date, score) {
    const prev = Number(storageGet('lm_daily_' + date)) || 0;
    const isBest = !prev || score < prev;
    if (isBest) storageSet('lm_daily_' + date, String(score));
    return { prev, isBest, best: isBest ? score : prev };
}

export function readLocalBoard(date) {
    try {
        const list = JSON.parse(storageGet(`lm_local_${date}`)) || [];
        return Array.isArray(list) ? list : [];
    } catch (e) {
        return [];
    }
}

export function pushLocalScore(date, entry) {
    const local = readLocalBoard(date);
    local.push(entry);
    local.sort((a, b) => a.score - b.score);
    storageSet(`lm_local_${date}`, JSON.stringify(local.slice(0, 10)));
}
