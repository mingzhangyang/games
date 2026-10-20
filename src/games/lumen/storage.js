import { createGameStorage } from '../../platform/storage/game-storage.js';

// v1 / lm_stars 按下标存旧版 25 关的星级。2026-10 难度重做把 25 关全部换成了新谜题，
// 旧星级对应的关卡已不存在，不迁移（迁成空对象）；旧键原样保留，不删除。
// v2 起按关卡 id 存：{ 'refract-1': 3, … }，以后增删 / 调序关卡都不会错位。
const retireIndexStars = value => (Array.isArray(value) ? {} : value);

export const LUMEN_STORAGE_SLOTS = Object.freeze({
    STARS: 'stars',
});

export const LUMEN_STORAGE = createGameStorage('lumen', {
    version: 2,
    migrations: {
        1: (value, ctx) => (ctx.slot === LUMEN_STORAGE_SLOTS.STARS ? retireIndexStars(value) : value),
    },
    legacy: {
        [LUMEN_STORAGE_SLOTS.STARS]: 'lm_stars',
    },
    legacyMigrations: {
        [LUMEN_STORAGE_SLOTS.STARS]: retireIndexStars,
    },
});
