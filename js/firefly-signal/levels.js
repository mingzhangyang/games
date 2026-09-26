/**
 * 萤火信号 — 三个原型关卡（世界坐标 600 × 700，见 simulation.js 的 WORLD）
 * =====================================================================
 * y 小 = 远（湖岸 / 远草地），y 大 = 近（主要可玩草地）。渲染层把 y 映射进场景下部约 75%。
 *
 * 每关的可玩性质由 scripts/verify-firefly-signal-sim.mjs 锁住：
 *   ① 不干预、等 120 秒：永远达不到目标（等待不能赢）；
 *   ② 求解器（观察节奏 + 找能同时照到两群的个体）在干预上限内能赢；
 *   ③ 随机点击的胜率明显低于求解器（「随机快速点击」不是主要策略）。
 * 改坐标 / 相位 / 数量后必须重跑该校验器。
 */

export const LEVELS = [
    {
        id: 'first-light',
        seed: 20260926,
        target: 0.85,
        maxInterventions: 3,
        // 教学关：周期完全一致，两群的相对相位永远不漂 —— 屏幕上的变化全部来自玩家。
        // （有抖动时，吸收效应让每群跑成群里最快那只的节奏，两群会慢慢漂到一起：等着就能赢）
        jitter: 0,
        // 两小群各 4 只，彼此在自然半径之外、初始反相：各自很快局部同步，却永远不会自己合拍
        groups: [
            { phase: 0.02, spread: 0.2 },
            { phase: 0.52, spread: 0.2 },
        ],
        flies: [
            { x: 160, y: 430, group: 0 },
            { x: 212, y: 396, group: 0 },
            { x: 172, y: 492, group: 0 },
            { x: 226, y: 458, group: 0 },
            { x: 378, y: 462, group: 1 },
            { x: 430, y: 410, group: 1 },
            { x: 404, y: 520, group: 1 },
            { x: 456, y: 470, group: 1 },
        ],
    },
    {
        id: 'two-meadows',
        seed: 7340519,
        target: 0.88,
        maxInterventions: 5,
        groups: [
            { phase: 0.05, spread: 0.22 },
            { phase: 0.55, spread: 0.22 },
        ],
        flies: [
            // 近处草地（左下）：紧凑的一群，自己很快合拍
            { x: 180, y: 500, group: 0 },
            { x: 132, y: 470, group: 0 },
            { x: 150, y: 548, group: 0 },
            { x: 206, y: 552, group: 0 },
            { x: 226, y: 492, group: 0 },
            { x: 176, y: 446, group: 0 },
            { x: 110, y: 522, group: 0 },
            { x: 190, y: 600, group: 0 },
            // 湖岸草地（右上）
            { x: 420, y: 400, group: 1 },
            { x: 466, y: 426, group: 1 },
            { x: 446, y: 356, group: 1 },
            { x: 392, y: 350, group: 1 },
            { x: 480, y: 378, group: 1 },
            { x: 416, y: 452, group: 1 },
            { x: 372, y: 404, group: 1 },
            { x: 432, y: 306, group: 1 },
            // 桥接虫：夹在两群之间，自然半径同时够到两群的近侧 ——
            // 初始各随一群，反相时互不拉动；只有两群被拉近到捕获窗口内，它们才开始传递节奏
            { x: 288, y: 468, group: 0 },
            { x: 314, y: 432, group: 1 },
        ],
    },
    {
        id: 'midsummer',
        seed: 11235813,
        target: 0.9,
        maxInterventions: 8,
        groups: [
            { phase: 0.0, spread: 0.2 },
            { phase: 0.34, spread: 0.2 },
            { phase: 0.68, spread: 0.2 },
        ],
        flies: [
            // A：近处左草地
            { x: 66, y: 590, group: 0 },
            { x: 118, y: 540, group: 0 },
            { x: 130, y: 630, group: 0 },
            { x: 182, y: 580, group: 0 },
            { x: 76, y: 668, group: 0 },
            { x: 190, y: 660, group: 0 },
            { x: 150, y: 596, group: 0, type: 'fast' },
            // B：近处右草地
            { x: 420, y: 600, group: 1 },
            { x: 470, y: 548, group: 1 },
            { x: 486, y: 632, group: 1 },
            { x: 534, y: 586, group: 1 },
            { x: 432, y: 672, group: 1 },
            { x: 540, y: 668, group: 1 },
            { x: 500, y: 596, group: 1, type: 'fast' },
            // C：湖岸中草地
            { x: 250, y: 300, group: 2 },
            { x: 306, y: 262, group: 2 },
            { x: 358, y: 306, group: 2 },
            { x: 300, y: 346, group: 2 },
            { x: 212, y: 350, group: 2 },
            { x: 388, y: 360, group: 2 },
            { x: 296, y: 304, group: 2, type: 'fast' },
            // 桥：A↔C、B↔C、A↔B
            { x: 176, y: 440, group: 0 },
            { x: 214, y: 388, group: 2 },
            { x: 402, y: 450, group: 1 },
            { x: 382, y: 404, group: 2 },
            { x: 262, y: 612, group: 0 },
            { x: 340, y: 628, group: 1 },
            { x: 300, y: 560, group: 2 },
            // 独行者：离群、慢、耦合低
            { x: 60, y: 190, type: 'solitary', phase: 0.5 },
            { x: 566, y: 440, type: 'solitary', phase: 0.2 },
        ],
    },
];

/** 桥接虫的下标（渲染层不做区别对待；仅供测试 / 调参脚本引用） */
export const BRIDGES = {
    'two-meadows': [16, 17],
    midsummer: [21, 22, 23, 24, 25, 26, 27],
};
