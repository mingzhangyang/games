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

const HOME = { x: 240, y: 660 };

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
                sol: { x: 244.5, y: 347.5 },
                start: { x: 309.4, y: 230.5 },
            },
            {
                id: 'head', z: 0.6,
                sol: { x: 271, y: 311 },
                start: { x: 205, y: 333.7 },
            },
            {
                id: 'ears', z: 0.6,
                sol: { x: 230.5, y: 246 },
                start: { x: 304.1, y: 360.4 },
            },
            {
                id: 'grass', z: 0.72,
                sol: { x: 245, y: 405 },
                start: { x: 350, y: 470 },
            },
        ],
        life: {
            tracks: [
                { ids: ['ears'], pivot: [230.5, 246], amp: 14, freq: 3.2, t0: 0.15, t1: 0.75 },
            ],
            group: { kind: 'hop', t0: 0.8, hops: 2, dx: -39.2, height: 30.3, hopDur: 0.45 },
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
                        pts: [[96.1, -17.8], [81.9, -35.6], [58.7, -39.2], [32, -23.1], [-26.7, -14.2], [-71.2, -7.1], [-110.4, -5.3],
                            [-105, 14.2], [-65.9, 16], [-17.8, 24.9], [32, 19.6], [62.3, 5.3], [80.1, -7.1]],
                    },
                ],
                sol: { x: 276, y: 264.5 },
                start: { x: 259.6, y: 205.6 },
            },
            {
                id: 'wing', z: 0.55,
                shape: [
                    {
                        t: 'blob',
                        pts: [[30.3, 5.3], [26.7, -26.7], [5.3, -74.8], [-32, -121], [-51.6, -117.5], [-46.3, -92.6], [-67.6, -97.9],
                            [-62.3, -71.2], [-81.9, -71.2], [-64.1, -40.9], [-51.6, -16], [-23.1, 5.3]],
                    },
                ],
                sol: { x: 201, y: 275.5 },
                start: { x: 188, y: 413.8 },
            },
            {
                id: 'wing2', z: 0.7,
                shape: [
                    {
                        t: 'blob',
                        pts: [[16, 3.6], [30.3, -21.4], [58.7, -65.9], [78.3, -94.3], [62.3, -92.6], [64.1, -71.2], [46.3, -76.5],
                            [46.3, -53.4], [26.7, -51.6], [7.1, -21.4], [-12.5, 0]],
                    },
                ],
                sol: { x: 250, y: 367.5 },
                start: { x: 334.3, y: 397.8 },
            },
        ],
        life: {
            tracks: [
                { ids: ['wing'], pivot: [201, 275.5], amp: 26, freq: 2.6, t0: 0.1, t1: 3 },
                { ids: ['wing2'], pivot: [250, 367.5], amp: -20, freq: 2.6, t0: 0.1, t1: 3 },
            ],
            group: { kind: 'fly', t0: 0.9, vx: 53.4, vy: -30.3 },
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
                sol: { x: 224, y: 307 },
                start: { x: 218.6, y: 187.8 },
            },
            {
                id: 'tail', z: 0.62,
                sol: { x: 348.6, y: 301.7 },
                start: { x: 159.9, y: 396 },
            },
            {
                id: 'fin', z: 0.5,
                sol: { x: 183, y: 364 },
                start: { x: 284.5, y: 315.9 },
            },
        ],
        life: {
            tracks: [
                { ids: ['tail'], pivot: [343.2, 301.7], amp: 16, freq: 1.1, t0: 0.1, t1: 3.2 },
                { ids: ['fin'], pivot: [172.4, 351.5], amp: 10, freq: 1.1, t0: 0.3, t1: 3.2 },
            ],
            group: { kind: 'swim', t0: 0.2, vx: -23.1, amp: 7.1, freq: 0.55 },
        },
    },

    /* ── 第三章 灯行：开放移动灯源；钉住的纸片只能靠灯去对准 ── */
    {
        id: 'deer',
        seed: 11,
        chapter: 3,
        name: { en: 'Deer', zh: '鹿' },
        lamp: { start: { x: 320.1, y: 655.2 }, sol: { x: 209.7, y: 665.4 }, movable: true },
        rotate: false,
        pieces: [
            {
                id: 'body', z: 0.82,
                sol: { x: 266.7, y: 365.8 },
                start: { x: 224, y: 262.5 },
            },
            {
                id: 'neck', z: 0.66,
                sol: { x: 215.1, y: 344.4 },
                start: { x: 320.1, y: 333.7 },
            },
            {
                id: 'antlers', z: 0.56, pinned: true,
                sol: { x: 195.5, y: 257.2 },
            },
        ],
        life: {
            tracks: [
                { ids: ['neck', 'antlers'], pivot: [220.4, 355.1], amp: -9, freq: 0.35, t0: 0.2, t1: 3.4, hold: true },
            ],
            group: { kind: 'none' },
        },
    },

    {
        id: 'pagoda',
        seed: 19,
        chapter: 3,
        name: { en: 'Moon Pavilion', zh: '月下亭' },
        lamp: { start: { x: 160, y: 664 }, sol: { x: 262, y: 656 }, movable: true },
        rotate: false,
        pieces: [
            {
                // 月亮钉在幕前最靠灯的一层：只能靠移灯把它挂到亭角上方
                id: 'moon', z: 0.56, pinned: true,
                sol: { x: 286, y: 183 },
            },
            {
                id: 'pavilion', z: 0.7,
                sol: { x: 226.5, y: 228.5 },
                start: { x: 300, y: 380 },
            },
            {
                id: 'mountain-base', z: 0.86,
                sol: { x: 242.5, y: 360 },
                start: { x: 200, y: 200 },
            },
        ],
        life: {
            tracks: [
                { ids: ['moon'], pivot: [226.5, 330], amp: -3, freq: 0.25, t0: 0.2, t1: 3.4, hold: true },
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
        lamp: { start: { x: 159.9, y: 668.4 }, sol: { x: 254.2, y: 656.4 }, movable: true },
        rotate: true,
        pieces: [
            {
                id: 'trunk', z: 0.84, pinned: true,
                shape: [
                    {
                        t: 'blob',
                        pts: [[-35.6, 97.9], [-14.2, 85.4], [-10.7, 35.6], [-35.6, -8.9], [-51.6, -21.4], [-44.5, -26.7], [-23.1, -12.5],
                            [-7.1, 3.6], [-3.6, -35.6], [-8.9, -62.3], [3.6, -62.3], [7.1, -30.3], [12.5, 0], [32, -26.7], [46.3, -35.6],
                            [49.8, -28.5], [19.6, 8.9], [12.5, 40.9], [16, 85.4], [39.2, 97.9]],
                    },
                ],
                sol: { x: 278.5, y: 370 },
            },
            {
                id: 'crownL', z: 0.62,
                shape: [
                    {
                        t: 'blob',
                        pts: [[-58.7, 8.9], [-62.3, -16], [-44.5, -35.6], [-17.8, -39.2], [7.1, -26.7], [26.7, -30.3], [44.5, -12.5],
                            [39.2, 10.7], [17.8, 23.1], [-8.9, 19.6], [-35.6, 26.7]],
                    },
                ],
                sol: { x: 191, y: 333, rot: 0 },
                start: { x: 293.4, y: 262.5, rot: 48 },
            },
            {
                id: 'crownR', z: 0.7,
                shape: [
                    {
                        t: 'blob',
                        pts: [[-44.5, 12.5], [-49.8, -10.7], [-28.5, -32], [0, -35.6], [26.7, -26.7], [53.4, -30.3], [64.1, -8.9],
                            [53.4, 14.2], [26.7, 21.4], [0, 16], [-23.1, 24.9]],
                    },
                ],
                sol: { x: 283, y: 310.5, rot: 0 },
                start: { x: 177.7, y: 253.6, rot: -50 },
            },
            {
                id: 'crownTop', z: 0.55,
                shape: [
                    {
                        t: 'blob',
                        pts: [[-53.4, 17.8], [-57, -5.3], [-39.2, -30.3], [-12.5, -46.3], [17.8, -44.5], [42.7, -26.7], [55.2, 0],
                            [44.5, 23.1], [17.8, 30.3], [-17.8, 30.3]],
                    },
                ],
                sol: { x: 246, y: 230.5, rot: 0 },
                start: { x: 248.9, y: 378.2, rot: 70 },
            },
        ],
        life: {
            tracks: [
                { ids: ['crownL', 'crownR', 'crownTop'], pivot: [240, 360.4], amp: 3.5, freq: 0.7, t0: 0.1, t1: 3.4 },
                { ids: ['crownTop'], pivot: [201, 275.5], amp: 3, freq: 1.3, t0: 0.4, t1: 3.4 },
            ],
            group: { kind: 'none' },
            leaves: true,
        },
    },

    {
        id: 'koi',
        seed: 23,
        chapter: 4,
        name: { en: 'Koi', zh: '锦鲤' },
        lamp: { start: { x: 318, y: 668 }, sol: { x: 214, y: 658 }, movable: true },
        rotate: true,
        pieces: [
            {
                id: 'body', z: 0.82, pinned: true,
                sol: { x: 278.5, y: 244.5 },
            },
            {
                id: 'head', z: 0.58,
                sol: { x: 177.5, y: 204.5, rot: 0 },
                start: { x: 300, y: 380, rot: 42 },
            },
            {
                id: 'fins', z: 0.68,
                sol: { x: 207.5, y: 301.5, rot: 0 },
                start: { x: 160, y: 220, rot: -36 },
            },
            {
                id: 'tail', z: 0.76,
                sol: { x: 251, y: 363, rot: 0 },
                start: { x: 330, y: 240, rot: 30 },
            },
        ],
        life: {
            tracks: [
                { ids: ['tail'], pivot: [262, 318], amp: 12, freq: 1.4, t0: 0.1, t1: 3.4 },
                { ids: ['fins'], pivot: [214, 262], amp: -8, freq: 1.4, t0: 0.3, t1: 3.4 },
            ],
            group: { kind: 'swim', t0: 0.3, vx: -18, amp: 5, freq: 0.6 },
        },
    },

    /* ── 第五章 活影：目标只在开场与轻触图标时浮现 ── */
    {
        id: 'crane',
        seed: 17,
        chapter: 5,
        name: { en: 'Crane', zh: '鹤' },
        lamp: { start: { x: 311.2, y: 650.4 }, sol: { x: 215.1, y: 660.6 }, movable: true },
        rotate: true,
        hideTarget: 2600,
        pieces: [
            {
                id: 'body', z: 0.8, pinned: true,
                sol: { x: 244.5, y: 325.8 },
            },
            {
                id: 'neck', z: 0.62,
                sol: { x: 202.2, y: 321.3, rot: 0 },
                start: { x: 240, y: 350, rot: 34 },
            },
            {
                id: 'wingL', z: 0.5,
                sol: { x: 240, y: 315.2, rot: 0 },
                start: { x: 300, y: 400, rot: -30 },
            },
            {
                id: 'wingR', z: 0.68,
                sol: { x: 256.7, y: 313.7, rot: 0 },
                start: { x: 280, y: 350, rot: 28 },
            },
            {
                id: 'legs', z: 0.88,
                sol: { x: 256.7, y: 375.8, rot: 0 },
                start: { x: 250, y: 300, rot: -24 },
            },
        ],
        life: {
            tracks: [
                { ids: ['wingL'], pivot: [236.9, 316.8], amp: 24, freq: 1.8, t0: 0.2, t1: 3.4 },
                { ids: ['wingR'], pivot: [256.7, 315.2], amp: -18, freq: 1.8, t0: 0.2, t1: 3.4 },
                { ids: ['neck'], pivot: [206.7, 322.8], amp: 6, freq: 0.9, t0: 0.1, t1: 3.4 },
            ],
            group: { kind: 'rise', t0: 0.9, height: 39.2, amp: 4.5, freq: 1.8 },
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
