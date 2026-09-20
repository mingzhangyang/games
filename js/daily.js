// 全站唯一的每日日期 / 种子工具（UTC+8 唯一口径）。
// 迁移自 5 份日期实现（word-daily / planet-merge / gravity-slingshot /
// sword-flight / needle-awn）+ 3 份 mulberry32 + 2 种哈希。
//
// ⚠ 兼容性铁律：
// - planet-merge / word-daily 的每日种子用 hashString（自研 3432918353 系数），
//   gravity-slingshot 的每日关卡种子用 hashStringFNV（FNV-1a）——
//   两个算法都必须原样保留，改任何一个都会改变已发布每日内容的序列。
// - 所有键一律走 UTC+8：全球玩家同一天、同一谜题 / 同一关卡 / 同一榜单键。
//   过去 sword-flight 榜单页签用本地时区算键、提交用 UTC+8，导致 UTC+8 以外
//   的玩家写 A 键读 B 键、每日榜恒空——这就是本模块存在的原因。

/** UTC+8 紧凑日期键：YYYYMMDD（planet-merge.todayKey / gravity.todayCompact /
 *  sword-flight.dailyDateKey / needle-awn.getTodayDateString 的唯一实现） */
export function todayKey(now = Date.now()) {
    const d = new Date(now + 8 * 3600 * 1000);
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** UTC+8 展示日期：YYYY-MM-DD（sword-flight.dailyDateStr） */
export function todayKeyDisplay(now = Date.now()) {
    const k = todayKey(now);
    return `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`;
}

/** 每日榜单键：`<prefix>-d<YYYYMMDD>`（与 Workers/game-scores.js 的
 *  DAILY_PATTERNS 一一对应，prefix 来自 games.config.json 的 dailyKeyPrefix） */
export function dailyKey(prefix, now = Date.now()) {
    return `${prefix}-d${todayKey(now)}`;
}

/** planet-merge / word-daily 的每日种子哈希（⚠ 原样迁移，勿改系数） */
export function hashString(str) {
    let h = 1779033703;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
}

/** gravity-slingshot 的每日关卡种子哈希（FNV-1a，⚠ 原样迁移，勿改） */
export function hashStringFNV(str) {
    let h = 2166136261; // 0x811c9dc5
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/** 确定性 PRNG（三份逐字/等价实现收敛于此） */
export function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
