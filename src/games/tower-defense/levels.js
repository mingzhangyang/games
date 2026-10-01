// Neon Tower Defense level data.  This module is the single source of truth
// for operation difficulty and waypoint geometry; runtime code only consumes it.

// 关卡地图使用 20×15、40px 网格，路径端点可以落在地图外一格作为入口/出口。
// 路径仍然是玩法真源；美术层只能围绕这些 waypoint 绘制，不能从贴图推导碰撞。
const MAP = { cols: 20, rows: 15, cell: 40 };

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
        modifiers: {},
        map: {
            ...MAP, variant: 'outpost',
            groundWaypoints: [[2, -1], [2, 2], [17, 2], [17, 5], [4, 5], [4, 9], [15, 9], [15, 15]]
        }
    },
    {
        id: 'vanguard', waves: 20, gold: 230, lives: 18,
        hpBase: 0.19, hpExp: 1.20, speed: 1.03, bounty: 0.98,
        modifiers: { regen: true },
        map: {
            ...MAP, variant: 'vanguard',
            groundWaypoints: [[10, -1], [10, 3], [1, 3], [1, 6], [18, 6], [18, 10], [7, 10], [7, 15]]
        }
    },
    {
        id: 'citadel', waves: 25, gold: 220, lives: 15,
        hpBase: 0.21, hpExp: 1.24, speed: 1.06, bounty: 0.95,
        modifiers: { regen: true, armored: true },
        map: {
            ...MAP, variant: 'citadel',
            groundWaypoints: [[4, -1], [4, 4], [14, 4], [14, 7], [2, 7], [2, 11], [17, 11], [17, 15]]
        }
    },
    {
        id: 'skyfall', waves: 30, gold: 210, lives: 12,
        hpBase: 0.23, hpExp: 1.27, speed: 1.09, bounty: 0.92,
        modifiers: { regen: true, armored: true, flyers: true },
        map: {
            ...MAP, variant: 'skyfall',
            groundWaypoints: [[16, -1], [16, 2], [3, 2], [3, 5], [12, 5], [12, 8], [1, 8], [1, 12], [9, 12], [9, 15]],
            airWaypoints: [[18, -1], [18, 1], [10, 1], [10, 4], [3, 4], [3, 7], [15, 7], [15, 10], [8, 10], [8, 15]]
        }
    },
    {
        id: 'juggernaut', waves: 35, gold: 200, lives: 10,
        hpBase: 0.25, hpExp: 1.30, speed: 1.12, bounty: 0.89,
        modifiers: { regen: true, armored: true, flyers: true, splitters: true },
        map: {
            ...MAP, variant: 'juggernaut',
            groundWaypoints: [[6, -1], [6, 3], [18, 3], [18, 6], [5, 6], [5, 10], [14, 10], [14, 13], [2, 13], [2, 15]],
            airWaypoints: [[1, -1], [1, 1], [8, 1], [8, 4], [17, 4], [17, 8], [9, 8], [9, 12], [4, 12], [4, 15]]
        }
    },
    {
        id: 'singularity', waves: 40, gold: 190, lives: 8,
        hpBase: 0.27, hpExp: 1.34, speed: 1.15, bounty: 0.86,
        modifiers: { regen: true, armored: true, flyers: true, splitters: true, drain: 2 },
        map: {
            ...MAP, variant: 'singularity',
            groundWaypoints: [[13, -1], [13, 2], [2, 2], [2, 5], [18, 5], [18, 9], [6, 9], [6, 12], [16, 12], [16, 15]],
            airWaypoints: [[5, -1], [5, 1], [15, 1], [15, 4], [4, 4], [4, 7], [12, 7], [12, 10], [7, 10], [7, 15]]
        }
    }
];
