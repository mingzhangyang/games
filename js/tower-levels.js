// tower-levels.js — 霓虹塔防关卡数据层（自 tower-defense.js 抽出，纯数据零逻辑）。
// 模式对齐 circuit-levels.js；主文件 import { LEVELS } 后自行派生 LEVEL_BY_ID 索引。

/*
 * 关卡配置。
 * waves       —— 本关波次总数
 * gold/lives  —— 本关起始资源（后面的关卡给得更少，逼玩家精打细算）
 * hpBase      —— 血量曲线基数，决定本关"体感难度"
 * hpExp       —— 血量指数，把线性曲线改成前松后紧
 * speed       —— 敌人速度整体倍率
 * bounty      —— 金币收益倍率（越低越穷，越难滚雪球）
 * modifiers   —— 本关专属规则
 */
export const LEVELS = [
    {
        id: 'outpost', waves: 15, gold: 240, lives: 20,
        hpBase: 0.16, hpExp: 1.16, speed: 1.0, bounty: 1.0,
        modifiers: {}
    },
    {
        id: 'vanguard', waves: 20, gold: 230, lives: 18,
        hpBase: 0.19, hpExp: 1.20, speed: 1.03, bounty: 0.98,
        modifiers: { regen: true }
    },
    {
        id: 'citadel', waves: 25, gold: 220, lives: 15,
        hpBase: 0.21, hpExp: 1.24, speed: 1.06, bounty: 0.95,
        modifiers: { regen: true, armored: true }
    },
    {
        id: 'skyfall', waves: 30, gold: 210, lives: 12,
        hpBase: 0.23, hpExp: 1.27, speed: 1.09, bounty: 0.92,
        modifiers: { regen: true, armored: true, flyers: true }
    },
    {
        id: 'juggernaut', waves: 35, gold: 200, lives: 10,
        hpBase: 0.25, hpExp: 1.30, speed: 1.12, bounty: 0.89,
        modifiers: { regen: true, armored: true, flyers: true, splitters: true }
    },
    {
        id: 'singularity', waves: 40, gold: 190, lives: 8,
        hpBase: 0.27, hpExp: 1.34, speed: 1.15, bounty: 0.86,
        modifiers: { regen: true, armored: true, flyers: true, splitters: true, drain: 2 }
    }
];
