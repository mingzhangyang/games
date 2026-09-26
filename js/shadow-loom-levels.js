/**
 * 影织 Shadow Loom — 关卡表（设计方案 §10 / §16）
 * ====================================================
 * 每关以「目标剪影」为出发点设计：纸片的解写成影子中心 sol（幕布坐标），
 * 纸片的正确摆位由 js/shadow-loom-rules.js 的投影公式反推，所以每关构造即可解。
 * scripts/verify-shadow-loom-levels.mjs 校验：解的相似度 ≈ 1、初始远离目标、
 * 解的纸片摆位都在可拖动范围内、固定纸片确实要求移动灯源、旋转关的初始角度确实错开。
 *
 * 字段：
 *   z        深度（灯 = 0，纸幕 = 1）；越小越靠灯，影子对拖动越敏感
 *   shape    子形状列表（本地坐标 = 影子尺度，原点即旋转中心）
 *   sol      影子中心 + 角度（解）；start 纸片本体的初始位置 + 角度
 *   pinned   固定纸片（铜钉钉在幕前，只能靠移动灯源对准）
 *   lamp     start / sol（视觉托盘坐标）；movable = 可拖灯
 *   rotate   本关开放旋转
 *   hideTarget  目标轮廓只在开场与轻触目标图标时浮现（ms）
 *   life     完成后的「活影」动作：tracks 为局部转动，group 为整体位移
 */

const HOME = { x: 240, y: 612 };

export const LEVELS = [
    /* ── 第一章 初影：两个深度，灯固定，不能旋转 ── */
    {
        id: 'rabbit',
        seed: 3,
        chapter: 1,
        name: { en: 'Rabbit', zh: '兔' },
        lamp: { start: HOME, movable: false },
        rotate: false,
        pieces: [
            {
                id: 'body', z: 0.8,
                shape: [
                    { t: 'ellipse', cx: 0, cy: 0, rx: 88, ry: 68, rot: -10 },
                    { t: 'circle', cx: 88, cy: 24, r: 17 },
                    { t: 'ellipse', cx: -60, cy: 62, rx: 28, ry: 10, rot: 4 },
                ],
                sol: { x: 274, y: 352 },
                start: { x: 318, y: 214 },
            },
            {
                id: 'head', z: 0.6,
                shape: [
                    { t: 'circle', cx: 0, cy: 0, r: 40 },
                    { t: 'ellipse', cx: -33, cy: 12, rx: 20, ry: 16, rot: 10 },
                ],
                sol: { x: 194, y: 272 },
                start: { x: 150, y: 330 },
            },
            {
                id: 'ears', z: 0.6,
                shape: [
                    { t: 'leaf', cx: 4, cy: -54, len: 112, w: 30, rot: -76, bend: 4 },
                    { t: 'leaf', cx: 28, cy: -46, len: 100, w: 26, rot: -58, bend: 4 },
                ],
                sol: { x: 206, y: 244 },
                start: { x: 312, y: 360 },
            },
        ],
        life: {
            tracks: [
                { ids: ['ears'], pivot: [206, 244], amp: 14, freq: 3.2, t0: 0.15, t1: 0.75 },
            ],
            group: { kind: 'hop', t0: 0.8, hops: 2, dx: -44, height: 34, hopDur: 0.45 },
        },
    },

    /* ── 第二章 错层：三个深度，同样的拖动距离影子走得不一样远 ── */
    {
        id: 'bird',
        seed: 5,
        chapter: 2,
        name: { en: 'Dove', zh: '飞鸟' },
        lamp: { start: HOME, movable: false },
        rotate: false,
        pieces: [
            {
                id: 'body', z: 0.84,
                shape: [
                    {
                        t: 'blob',
                        pts: [[108, -20], [92, -40], [66, -44], [36, -26], [-30, -16], [-80, -8], [-124, -6],
                            [-118, 16], [-74, 18], [-20, 28], [36, 22], [70, 6], [90, -8]],
                    },
                ],
                sol: { x: 236, y: 318 },
                start: { x: 262, y: 186 },
            },
            {
                id: 'wing', z: 0.55,
                shape: [
                    {
                        t: 'blob',
                        pts: [[34, 6], [30, -30], [6, -84], [-36, -136], [-58, -132], [-52, -104], [-76, -110],
                            [-70, -80], [-92, -80], [-72, -46], [-58, -18], [-26, 6]],
                    },
                ],
                sol: { x: 250, y: 300 },
                start: { x: 170, y: 420 },
            },
            {
                id: 'wing2', z: 0.7,
                shape: [
                    {
                        t: 'blob',
                        pts: [[18, 4], [34, -24], [66, -74], [88, -106], [70, -104], [72, -80], [52, -86],
                            [52, -60], [30, -58], [8, -24], [-14, 0]],
                    },
                ],
                sol: { x: 262, y: 300 },
                start: { x: 346, y: 402 },
            },
        ],
        life: {
            tracks: [
                { ids: ['wing'], pivot: [240, 300], amp: 26, freq: 2.6, t0: 0.1, t1: 3 },
                { ids: ['wing2'], pivot: [262, 302], amp: -20, freq: 2.6, t0: 0.1, t1: 3 },
            ],
            group: { kind: 'fly', t0: 0.9, vx: 60, vy: -34 },
        },
    },
    {
        id: 'whale',
        seed: 7,
        chapter: 2,
        name: { en: 'Whale', zh: '鲸' },
        lamp: { start: HOME, movable: false },
        rotate: false,
        pieces: [
            {
                id: 'body', z: 0.86,
                shape: [
                    {
                        t: 'blob',
                        pts: [[-132, 6], [-122, -30], [-88, -52], [-30, -58], [40, -42], [98, -20], [140, -8],
                            [140, 10], [96, 20], [30, 40], [-40, 50], [-100, 40], [-128, 26]],
                    },
                ],
                sol: { x: 222, y: 300 },
                start: { x: 216, y: 166 },
            },
            {
                id: 'tail', z: 0.62,
                shape: [
                    {
                        t: 'blob',
                        pts: [[-6, -6], [16, -18], [34, -46], [52, -64], [60, -56], [44, -20], [40, 0],
                            [60, 30], [58, 44], [36, 26], [14, 12], [-6, 6]],
                    },
                ],
                sol: { x: 362, y: 294 },
                start: { x: 150, y: 400 },
            },
            {
                id: 'fin', z: 0.5,
                shape: [
                    { t: 'leaf', cx: 0, cy: 0, len: 64, w: 22, rot: 38, bend: -6 },
                ],
                sol: { x: 176, y: 364 },
                start: { x: 290, y: 310 },
            },
        ],
        life: {
            tracks: [
                { ids: ['tail'], pivot: [356, 294], amp: 16, freq: 1.1, t0: 0.1, t1: 3.2 },
                { ids: ['fin'], pivot: [164, 350], amp: 10, freq: 1.1, t0: 0.3, t1: 3.2 },
            ],
            group: { kind: 'swim', t0: 0.2, vx: -26, amp: 8, freq: 0.55 },
        },
    },

    /* ── 第三章 灯行：开放移动灯源；钉住的纸片只能靠灯去对准 ── */
    {
        id: 'deer',
        seed: 11,
        chapter: 3,
        name: { en: 'Deer', zh: '鹿' },
        lamp: { start: { x: 330, y: 596 }, sol: { x: 206, y: 630 }, movable: true },
        rotate: false,
        pieces: [
            {
                id: 'body', z: 0.82,
                shape: [
                    {
                        t: 'blob',
                        pts: [[-72, -22], [-40, -40], [40, -38], [82, -26], [96, -38], [100, -18], [86, 2],
                            [82, 40], [88, 96], [76, 98], [66, 44], [52, 18], [-40, 16], [-50, 44],
                            [-46, 98], [-58, 98], [-64, 44], [-80, 8]],
                    },
                ],
                sol: { x: 270, y: 366 },
                start: { x: 222, y: 250 },
            },
            {
                id: 'neck', z: 0.66,
                shape: [
                    {
                        t: 'blob',
                        pts: [[14, 14], [-8, -14], [-20, -52], [-22, -78], [-40, -92], [-68, -88], [-86, -76],
                            [-80, -66], [-54, -60], [-40, -50], [-28, -20], [-12, 16]],
                    },
                    { t: 'leaf', cx: -18, cy: -96, len: 34, w: 13, rot: -40 },
                ],
                sol: { x: 212, y: 342 },
                start: { x: 330, y: 330 },
            },
            {
                id: 'antlers', z: 0.56, pinned: true,
                shape: [
                    { t: 'leaf', cx: 4, cy: -34, len: 74, w: 10, rot: -104, bend: 8 },
                    { t: 'leaf', cx: -18, cy: -40, len: 40, w: 8, rot: -150 },
                    { t: 'leaf', cx: 16, cy: -52, len: 36, w: 8, rot: -60 },
                    { t: 'leaf', cx: 26, cy: -24, len: 60, w: 9, rot: -72, bend: -6 },
                    { t: 'leaf', cx: 44, cy: -38, len: 30, w: 7, rot: -30 },
                ],
                sol: { x: 190, y: 244 },
            },
        ],
        life: {
            tracks: [
                { ids: ['neck', 'antlers'], pivot: [218, 354], amp: -9, freq: 0.35, t0: 0.2, t1: 3.4, hold: true },
            ],
            group: { kind: 'none' },
        },
    },

    /* ── 第四章 回旋：开放旋转 ── */
    {
        id: 'tree',
        seed: 13,
        chapter: 4,
        name: { en: 'Tree', zh: '树' },
        lamp: { start: { x: 150, y: 640 }, sol: { x: 256, y: 600 }, movable: true },
        rotate: true,
        pieces: [
            {
                id: 'trunk', z: 0.84, pinned: true,
                shape: [
                    {
                        t: 'blob',
                        pts: [[-40, 110], [-16, 96], [-12, 40], [-40, -10], [-58, -24], [-50, -30], [-26, -14],
                            [-8, 4], [-4, -40], [-10, -70], [4, -70], [8, -34], [14, 0], [36, -30], [52, -40],
                            [56, -32], [22, 10], [14, 46], [18, 96], [44, 110]],
                    },
                ],
                sol: { x: 240, y: 360 },
            },
            {
                id: 'crownL', z: 0.62,
                shape: [
                    {
                        t: 'blob',
                        pts: [[-66, 10], [-70, -18], [-50, -40], [-20, -44], [8, -30], [30, -34], [50, -14],
                            [44, 12], [20, 26], [-10, 22], [-40, 30]],
                    },
                ],
                sol: { x: 178, y: 314, rot: -12 },
                start: { x: 300, y: 250, rot: 48 },
            },
            {
                id: 'crownR', z: 0.7,
                shape: [
                    {
                        t: 'blob',
                        pts: [[-50, 14], [-56, -12], [-32, -36], [0, -40], [30, -30], [60, -34], [72, -10],
                            [60, 16], [30, 24], [0, 18], [-26, 28]],
                    },
                ],
                sol: { x: 304, y: 316, rot: 10 },
                start: { x: 170, y: 240, rot: -50 },
            },
            {
                id: 'crownTop', z: 0.55,
                shape: [
                    {
                        t: 'blob',
                        pts: [[-60, 20], [-64, -6], [-44, -34], [-14, -52], [20, -50], [48, -30], [62, 0],
                            [50, 26], [20, 34], [-20, 34]],
                    },
                ],
                sol: { x: 240, y: 258, rot: 0 },
                start: { x: 250, y: 380, rot: 70 },
            },
        ],
        life: {
            tracks: [
                { ids: ['crownL', 'crownR', 'crownTop'], pivot: [240, 360], amp: 3.5, freq: 0.7, t0: 0.1, t1: 3.4 },
                { ids: ['crownTop'], pivot: [240, 300], amp: 3, freq: 1.3, t0: 0.4, t1: 3.4 },
            ],
            group: { kind: 'none' },
            leaves: true,
        },
    },

    /* ── 第五章 活影：目标只在开场与轻触图标时浮现 ── */
    {
        id: 'crane',
        seed: 17,
        chapter: 5,
        name: { en: 'Crane', zh: '鹤' },
        lamp: { start: { x: 320, y: 580 }, sol: { x: 212, y: 614 }, movable: true },
        rotate: true,
        hideTarget: 2600,
        pieces: [
            {
                id: 'body', z: 0.8, pinned: true,
                shape: [
                    {
                        t: 'blob',
                        pts: [[-60, -6], [-30, -26], [20, -28], [60, -12], [96, 6], [110, 22], [80, 20],
                            [40, 24], [-10, 22], [-50, 14]],
                    },
                ],
                sol: { x: 246, y: 330 },
            },
            {
                id: 'neck', z: 0.62,
                shape: [
                    {
                        t: 'blob',
                        pts: [[10, 8], [-10, -10], [-20, -46], [-12, -84], [-18, -104], [-32, -112], [-48, -104],
                            [-96, -96], [-50, -94], [-36, -92], [-28, -78], [-34, -44], [-22, -8], [-4, 14]],
                    },
                ],
                sol: { x: 190, y: 324, rot: 0 },
                start: { x: 330, y: 300, rot: 34 },
            },
            {
                id: 'wingL', z: 0.5,
                shape: [
                    {
                        t: 'blob',
                        pts: [[20, 8], [10, -30], [-20, -80], [-60, -118], [-78, -114], [-66, -92], [-88, -92],
                            [-74, -66], [-94, -60], [-62, -30], [-30, -4]],
                    },
                ],
                sol: { x: 240, y: 316, rot: 0 },
                start: { x: 226, y: 318, rot: -30 },
            },
            {
                id: 'wingR', z: 0.68,
                shape: [
                    {
                        t: 'blob',
                        pts: [[-6, 6], [14, -30], [44, -74], [80, -104], [96, -96], [80, -76], [100, -70],
                            [80, -48], [96, -38], [60, -18], [26, 4]],
                    },
                ],
                sol: { x: 262, y: 314, rot: 0 },
                start: { x: 348, y: 430, rot: 28 },
            },
            {
                id: 'legs', z: 0.88,
                shape: [
                    { t: 'poly', pts: [[-3, -52], [3, -52], [10, 0], [-10, 46], [-16, 46], [4, 0]] },
                    { t: 'poly', pts: [[14, -52], [20, -52], [22, -4], [44, 40], [38, 43], [16, -4]] },
                    { t: 'ellipse', cx: -16, cy: 48, rx: 15, ry: 4.5 },
                    { t: 'ellipse', cx: 44, cy: 44, rx: 15, ry: 4.5, rot: 12 },
                ],
                sol: { x: 262, y: 396, rot: 0 },
                start: { x: 100, y: 300, rot: -24 },
            },
        ],
        life: {
            tracks: [
                { ids: ['wingL'], pivot: [236, 318], amp: 24, freq: 1.8, t0: 0.2, t1: 3.4 },
                { ids: ['wingR'], pivot: [262, 316], amp: -18, freq: 1.8, t0: 0.2, t1: 3.4 },
                { ids: ['neck'], pivot: [196, 326], amp: 6, freq: 0.9, t0: 0.1, t1: 3.4 },
            ],
            group: { kind: 'rise', t0: 0.9, vy: -22, amp: 6, freq: 1.8 },
        },
    },
];

export const CHAPTERS = {
    1: { en: 'First Shadows', zh: '初影' },
    2: { en: 'Layers', zh: '错层' },
    3: { en: 'Lamp Walk', zh: '灯行' },
    4: { en: 'Turning', zh: '回旋' },
    5: { en: 'Living Shadow', zh: '活影' },
};
