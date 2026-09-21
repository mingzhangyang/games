// silk-dew-levels.js — 垂丝引露 Silkfall：关卡数据 + verlet 绳索物理核心（纯模块，零 DOM）
// 坐标：逻辑舞台 480×640，y 向下。所有关卡与物理参数集中于此，游戏入口只负责渲染/交互。
//
// 玩法机制（M1 修订版，基于实测数据确定的机制）：
//   玩家**拖拽锚结**（丝线的悬点）来牵引丝线，露珠被绳约束带动。
//   绳长固定 ⇒ 拖拽锚点即改变露珠可达域，形成「路径规划」谜题：
//   绕荆棘、穿气泡借浮力、顺气旋横渡、最终入玉壶。
//   - 锚点拖拽位移直接决定露珠位移（实测可达 300px+），远优于「剪断自由落体」的 47px 散布。
//   - 丝线仍是 verlet 链（重力 + 距离约束 + 松弛迭代），拖拽时自然下垂、甩动。
//   - 可拖拽对象：锚结（拖拽牵丝）、露珠（直接拖，但绳长限制其活动范围）。
//   - 计分：**拖拽次数**（离散量，asc 越少越好）——同一次按住拖动算 1 次。
//
// 物理口径（与引力弹弓同族）：
//   verlet  p += (p - prev) * damp + a * dt^2
//   固定 dt = 1/120s 子步；每子步 4 次距离约束松弛迭代。
//   确定性：同一「拖拽事件序列（时刻 + 目标位置）」在同一设备上必得同一结果。
import { hashStringFNV, mulberry32 } from './daily.js';

export const STAGE = { w: 480, h: 640 };

// ---- 物理常量 ----
export const PHYS = {
    dt: 1 / 120,          // 子步长（秒）
    maxSub: 4,            // 每帧最多子步数
    g: 1500,              // 重力加速度（px/s^2）
    ropeDamp: 0.996,      // 丝线粒点阻尼
    pearlDamp: 0.998,     // 露珠阻尼
    iters: 4,             // 距离约束松弛迭代
    pearlR: 9,            // 露珠半径
    anchorR: 14,          // 锚结可拖拽半径
    seg: 10,              // 丝线相邻粒点初距
    buoyancy: -1200,      // 气泡内净浮力（负 = 向上）
    grazeR: 16,           // 星芒感应半径
    outY: 680,            // 出界 y
    restFailSec: 4.0,     // 静止悬空判负时长（拖拽机制下给足思考时间）
    restFailDrift: 6,     // 静止判负的窗口漂移容差（px）：窗口内位移超过它即视为还在动
    vesselH: 44,          // 玉壶捕获区高度
    vesselInset: 2,       // 玉壶内收（捕获宽度 = w/2 - inset）
    // 拖拽约束：锚点跟手，但有最大跟随速度（否则瞬移会扯断数值稳定性）
    anchorFollow: 0.45,   // 锚点向指针插值系数（每子步）
    pearlDragFollow: 0.35,// 直接拖露珠时的插值系数
    dragMaxSpeed: 2400,   // 锚点每子步最大位移（px/s 上限）
};

const D2R = Math.PI / 180;

// ---- 关卡构造小工具 ----
function pt(x, y) { return { x, y }; }

// 一根丝：锚点(可拖) + count 段，末端系露珠。
// dir: 初始倾角（度，0=垂直向下，正=向右）；spread: 波浪形初态；kick: 初始切向位移
function rope(ax, ay, count, dirDeg, spread, kick) {
    return { ax, ay, count, dir: dirDeg, spread: spread || 0, kick: kick || 0 };
}

// 展开一根丝为粒点数组：以锚点为原点，按 dir 角逐段生成
function buildRopeParticles(r) {
    const arr = [];
    for (let i = 0; i <= r.count; i++) {
        const angle = (r.dir + (r.spread ? r.spread * Math.sin(i * 1.7) : 0)) * D2R;
        const px = r.ax + Math.sin(angle) * PHYS.seg * i;
        const py = r.ay + Math.cos(angle) * PHYS.seg * i;
        const k = (r.kick || 0) * i;
        arr.push(pt(px + Math.cos(angle) * k, py - Math.sin(angle) * k));
    }
    return arr;
}

// ---- 关卡表（20 关，逐关引入元素） ----
// 玩法：拖拽丝线顶端的「锚结」牵动整条丝，露珠被丝牵引移动，送入玉壶。
// 计分：完成所需「牵拉次数」越少越好（drags，升序榜）。
// 关卡字段：
//   ropes[]   丝线（索引 0 = 锚结，可拖拽）
//   pearl     露珠起始：{ rope: 0 } 表示系在第 0 根丝末端
//   stars[]   星芒 { x, y }
//   thorns[]  荆棘 { x, y, r }
//   winds[]   气旋区 { x, y, w, h, ax, ay }
//   bubbles[] 气泡 { x, y, r }（破泡后露珠获得浮力）
//   vessel    玉壶 { x, y, w }
//   par       设计师目标牵拉次数
export const LEVELS = [
    // ⚠️ 本表由 scripts/tmp-sd-final3.mjs 生成并逐关验证（拖拽机制，20/20 满星可解）。
    // 几何约束（实测）：绳 17–21 段（170–210px）+ 玉壶 y≈480 + 锚点起始 y≈100–150。
    // 星芒必须落在「渐进拖拽路径」上且两两间距 ≥70px；把指针瞬移到目标位会跳过路径，
    // 造成「赢了却没吃星」的假可解（早期 tmp-sd-redesign.mjs 就因此多报 5 关）。
    // 改任何元素位置后必须重跑 scripts/verify-silk-dew-levels.mjs 确认。
    {
        id: 'S1', par: 1, tipKey: 'tipCut',
        ropes: [rope(240, 110, 18, 0, 0, 0)],
        stars: [{ x: 240, y: 371 }],
        vessel: { x: 240, y: 480, w: 92 },
    },
    {
        id: 'S2', par: 1, tipKey: 'tipSwing',
        ropes: [rope(180, 110, 18, 0, 0, 0)],
        stars: [{ x: 182, y: 346 }, { x: 252, y: 365 }],
        vessel: { x: 340, y: 480, w: 90 },
    },
    {
        id: 'S3', par: 2, tipKey: 'tipTwoRopes',
        ropes: [rope(160, 110, 18, 0, 0, 0), rope(320, 110, 18, 0, 0, 0)],
        stars: [{ x: 162, y: 346 }, { x: 232, y: 365 }],
        vessel: { x: 320, y: 480, w: 90 },
    },
    {
        id: 'S4', par: 2, tipKey: 'tipThorn',
        ropes: [rope(150, 110, 19, 0, 0, 0)],
        stars: [{ x: 151, y: 344 }, { x: 226, y: 358 }],
        thorns: [{ x: 300, y: 300, r: 20 }],
        vessel: { x: 300, y: 480, w: 88 },
    },
    {
        id: 'S5', par: 2, tipKey: 'tipThread',
        ropes: [rope(360, 110, 19, 0, 0, 0)],
        stars: [{ x: 354, y: 371 }, { x: 285, y: 395 }],
        thorns: [{ x: 300, y: 260, r: 20 }, { x: 180, y: 300, r: 20 }],
        vessel: { x: 250, y: 480, w: 90 },
    },
    {
        id: 'S6', par: 2, tipKey: 'tipBreeze',
        ropes: [rope(200, 110, 18, 0, 0, 0)],
        stars: [{ x: 200, y: 429 }, { x: 377, y: 402 }],
        winds: [{ x: 280, y: 320, w: 170, h: 190, ax: 700, ay: 0 }],
        vessel: { x: 390, y: 480, w: 86 },
    },
    {
        id: 'S7', par: 3, tipKey: 'tipBreeze',
        ropes: [rope(180, 110, 19, 0, 0, 0)],
        stars: [{ x: 418, y: 443 }, { x: 332, y: 353 }],
        winds: [{ x: 270, y: 330, w: 160, h: 130, ax: 760, ay: 0 }, { x: 330, y: 440, w: 130, h: 110, ax: -700, ay: 0 }],
        vessel: { x: 340, y: 480, w: 86 },
    },
    {
        id: 'S8', par: 2, tipKey: 'tipTiming',
        ropes: [rope(120, 100, 21, 0, 0, 0)],
        stars: [{ x: 130, y: 365 }, { x: 198, y: 388 }],
        thorns: [{ x: 350, y: 350, r: 20 }],
        vessel: { x: 280, y: 480, w: 90 },
    },
    {
        id: 'S9', par: 3, tipKey: 'tipBubble',
        ropes: [rope(240, 130, 17, 0, 0, 0)],
        stars: [{ x: 254, y: 343 }, { x: 282, y: 409 }],
        thorns: [{ x: 110, y: 370, r: 22 }, { x: 372, y: 370, r: 22 }],
        bubbles: [{ x: 244, y: 236, r: 30 }],
        winds: [{ x: 160, y: 300, w: 160, h: 140, ax: 420, ay: 0 }],
        vessel: { x: 240, y: 480, w: 58 },
    },
    {
        id: 'S10', par: 3, tipKey: 'tipBubble',
        ropes: [rope(190, 140, 17, 0, 0, 0)],
        stars: [{ x: 190, y: 350 }, { x: 190, y: 420 }],
        thorns: [{ x: 130, y: 250, r: 20 }],
        bubbles: [{ x: 314, y: 346, r: 30 }],
        winds: [{ x: 260, y: 390, w: 150, h: 110, ax: 600, ay: 0 }],
        vessel: { x: 360, y: 480, w: 86 },
    },
    {
        id: 'S11', par: 2, tipKey: 'tipTwoRopes',
        ropes: [rope(150, 110, 18, 0, 0, 0), rope(260, 110, 18, 0, 0, 0), rope(360, 110, 18, 0, 0, 0)],
        pearl: { rope: 1 },
        stars: [{ x: 248, y: 334 }, { x: 219, y: 406 }],
        thorns: [{ x: 100, y: 380, r: 22 }, { x: 410, y: 340, r: 22 }],
        winds: [{ x: 180, y: 300, w: 150, h: 140, ax: -520, ay: 0 }],
        vessel: { x: 300, y: 480, w: 58 },
    },
    {
        id: 'S12', par: 3, tipKey: 'tipBreeze',
        ropes: [rope(240, 110, 18, 0, 0, 0)],
        stars: [{ x: 240, y: 355 }],
        winds: [{ x: 310, y: 300, w: 160, h: 180, ax: 720, ay: -260 }],
        vessel: { x: 400, y: 420, w: 86 },
    },
    {
        id: 'S13', par: 3, tipKey: 'tipSwing',
        ropes: [rope(110, 120, 20, 0, 0, 0)],
        stars: [{ x: 113, y: 359 }, { x: 184, y: 372 }],
        thorns: [{ x: 160, y: 500, r: 20 }],
        winds: [{ x: 240, y: 400, w: 230, h: 160, ax: 860, ay: 0 }],
        vessel: { x: 400, y: 480, w: 86 },
    },
    {
        id: 'S14', par: 4, tipKey: 'tipBubble',
        ropes: [rope(240, 150, 17, 0, 0, 0)],
        stars: [{ x: 261, y: 368 }, { x: 295, y: 430 }],
        thorns: [{ x: 130, y: 280, r: 20 }, { x: 310, y: 380, r: 20 }],
        bubbles: [{ x: 240, y: 254, r: 28 }, { x: 344, y: 234, r: 28 }],
        winds: [{ x: 150, y: 320, w: 160, h: 140, ax: 560, ay: 0 }],
        vessel: { x: 240, y: 480, w: 60 },
    },
    {
        id: 'S15', par: 4, tipKey: 'tipThread',
        ropes: [rope(120, 130, 20, 0, 0, 0)],
        stars: [{ x: 121, y: 361 }, { x: 194, y: 368 }],
        thorns: [{ x: 190, y: 300, r: 22 }, { x: 330, y: 400, r: 22 }],
        winds: [{ x: 210, y: 360, w: 150, h: 130, ax: 620, ay: 0 }],
        vessel: { x: 400, y: 480, w: 86 },
    },
    {
        id: 'S16', par: 4, tipKey: 'tipBubble',
        ropes: [rope(140, 150, 18, 0, 0, 0)],
        stars: [{ x: 140, y: 393 }],
        thorns: [{ x: 260, y: 220, r: 20 }],
        bubbles: [{ x: 236, y: 344, r: 28 }, { x: 136, y: 234, r: 28 }],
        winds: [{ x: 300, y: 340, w: 160, h: 140, ax: 740, ay: 0 }],
        vessel: { x: 400, y: 480, w: 86 },
    },
    {
        id: 'S17', par: 4, tipKey: 'tipAll',
        ropes: [rope(120, 120, 19, 0, 0, 0)],
        stars: [{ x: 120, y: 395 }],
        thorns: [{ x: 190, y: 500, r: 20 }],
        bubbles: [{ x: 366, y: 254, r: 28 }],
        winds: [{ x: 290, y: 300, w: 160, h: 150, ax: 760, ay: -220 }],
        vessel: { x: 210, y: 480, w: 90 },
    },
    {
        id: 'S18', par: 4, tipKey: 'tipTiming',
        ropes: [rope(120, 110, 19, 0, 0, 0), rope(360, 110, 19, 0, 0, 0)],
        stars: [{ x: 226, y: 410 }],
        thorns: [{ x: 240, y: 260, r: 22 }],
        vessel: { x: 240, y: 480, w: 90 },
    },
    {
        id: 'S19', par: 5, tipKey: 'tipAll',
        ropes: [rope(140, 130, 20, 0, 0, 0)],
        stars: [{ x: 140, y: 358 }],
        thorns: [{ x: 170, y: 520, r: 20 }, { x: 96, y: 300, r: 20 }],
        bubbles: [{ x: 300, y: 336, r: 28 }],
        winds: [{ x: 290, y: 340, w: 200, h: 150, ax: 820, ay: -180 }],
        vessel: { x: 410, y: 480, w: 86 },
    },
    {
        id: 'S20', par: 3, tipKey: 'tipFinal',
        ropes: [rope(240, 100, 20, 0, 0, 0)],
        stars: [{ x: 240, y: 389 }],
        thorns: [{ x: 230, y: 560, r: 20 }],
        winds: [{ x: 310, y: 350, w: 150, h: 170, ax: 640, ay: 0 }],
        vessel: { x: 350, y: 480, w: 88 },
    },
];

// ---- 世界构建 ----
// 每根 rope：粒点索引 0 = 锚结（可拖拽），索引 count = 末端（系露珠）
export function createWorld(spec) {
    const ropes = spec.ropes.map((r, i) => {
        const particles = buildRopeParticles(r);
        return {
            i,
            particles,
            prev: particles.map((p) => pt(p.x, p.y)),
            segLen: PHYS.seg,
            alive: true,
            linked: false,
        };
    });

    const linkIdx = (spec.pearl && spec.pearl.rope) || 0;
    const rope0 = ropes[linkIdx];
    const tail = rope0.particles[rope0.particles.length - 1];
    rope0.linked = true;

    const pearl = {
        x: tail.x, y: tail.y,
        px: tail.x, py: tail.y,
        inBubble: null,
        restTime: 0,
        restRef: null,
    };

    const world = {
        spec,
        ropes,
        pearl,
        pearlRope: linkIdx,
        dragging: null,          // { kind:'anchor'|'pearl', rope:i, x, y } —— 当前拖拽目标
        drags: 0,                // 拖拽次数（计分：离散，asc 越少越好）
        wasDragging: false,
        stars: (spec.stars || []).map((s, i) => ({ i, x: s.x, y: s.y, taken: false, pop: 0 })),
        thorns: (spec.thorns || []).map((t) => ({ x: t.x, y: t.y, r: t.r })),
        winds: (spec.winds || []).map((w) => ({ x: w.x, y: w.y, w: w.w, h: w.h, ax: w.ax, ay: w.ay })),
        bubbles: (spec.bubbles || []).map((b, i) => ({ i, x: b.x, y: b.y, r: b.r, alive: true })),
        vessel: spec.vessel ? { ...spec.vessel } : null,
        starsTaken: 0,
        state: 'playing',        // playing | won | failed
        time: 0,
        events: [],              // 表现层事件：{ star } / { graze } / { win } / { fail } / { pop }
    };
    return world;
}

// ---- 拖拽接口 ----
// 拖拽起点命中检测：优先锚结（大热区），其次露珠。返回是否抓住。
export function beginDrag(world, x, y) {
    if (world.state !== 'playing') return false;
    let hit = null;
    // 锚结优先（可拖拽 = 玩法核心）
    for (const rope of world.ropes) {
        const a = rope.particles[0];
        const dx = x - a.x, dy = y - a.y;
        if (dx * dx + dy * dy <= PHYS.anchorR * PHYS.anchorR) {
            hit = { kind: 'anchor', rope: rope.i, x, y };
            break;
        }
    }
    if (!hit) {
        const p = world.pearl;
        const dx = x - p.x, dy = y - p.y;
        const r = PHYS.pearlR + 14;
        if (dx * dx + dy * dy <= r * r) hit = { kind: 'pearl', rope: world.pearlRope, x, y };
    }
    if (!hit) return false;
    world.dragging = hit;
    world.drags++;
    world.events.push({ type: 'grab', kind: hit.kind, x, y, t: world.time });
    return true;
}

// 更新拖拽目标位置（指针移动）
export function moveDrag(world, x, y) {
    if (world.dragging) {
        world.dragging.x = x;
        world.dragging.y = y;
    }
}

// 松开
export function endDrag(world) {
    if (world.dragging) {
        world.events.push({ type: 'release', t: world.time });
        world.dragging = null;
    }
}

// 破泡：命中气泡即破；若露珠在泡内则脱出
export function popBubble(world, x, y, hitR) {
    const r = hitR || 20;
    for (const b of world.bubbles) {
        if (!b.alive) continue;
        const dx = x - b.x, dy = y - b.y;
        const rr = b.r + r;
        if (dx * dx + dy * dy > rr * rr) continue;
        b.alive = false;
        if (world.pearl.inBubble === b) world.pearl.inBubble = null;
        world.events.push({ type: 'pop', x: b.x, y: b.y, t: world.time });
        return true;
    }
    return false;
}

// 气泡命中检测（回退用：点空处若命中气泡也算，方便手机）
export function bubbleAt(world, x, y, hitR) {
    const r = hitR || 20;
    for (const b of world.bubbles) {
        if (!b.alive) continue;
        const dx = x - b.x, dy = y - b.y;
        if (dx * dx + dy * dy <= (b.r + r) * (b.r + r)) return b;
    }
    return null;
}

// ---- 距离约束 ----
// aFixed: a 端钉死；bIsPearl: b 是露珠（质量更大，位移更少）
function relax(a, b, rest, aFixed, bIsPearl) {
    let dx = b.x - a.x, dy = b.y - a.y;
    let d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1e-9) { dx = 0; dy = rest; d = rest; }
    const diff = (d - rest) / d;
    const bShare = bIsPearl ? 0.35 : 0.5;
    const aShare = aFixed ? 0 : (bIsPearl ? 0.65 : 0.5);
    if (!aFixed) { a.x += dx * diff * aShare; a.y += dy * diff * aShare; }
    b.x -= dx * diff * bShare;
    b.y -= dy * diff * bShare;
}

// ---- 露珠与场景碰撞 ----
function resolvePearl(world) {
    const p = world.pearl;
    const r = PHYS.pearlR;

    // 左右墙 + 顶（拖拽机制下墙是硬约束，不反弹，避免抖动）
    if (p.x < r) { p.x = r; p.px = p.x; }
    if (p.x > STAGE.w - r) { p.x = STAGE.w - r; p.px = p.x; }
    if (p.y < r) { p.y = r; p.py = p.y; }

    // 荆棘
    for (const t of world.thorns) {
        const dx = p.x - t.x, dy = p.y - t.y;
        const rr = t.r + r;
        if (dx * dx + dy * dy <= rr * rr) {
            world.state = 'failed';
            world.events.push({ type: 'fail', reason: 'thorn', x: p.x, y: p.y, t: world.time });
            return;
        }
    }

    // 玉壶：壶口漏斗把露珠导向壶中；落入捕获区即胜利
    const v = world.vessel;
    if (v) {
        const half = v.w / 2 - PHYS.vesselInset;
        const top = v.y;
        const bot = v.y + PHYS.vesselH;
        if (p.y >= top - 8 && p.y <= bot) {
            if (p.x < v.x - half) {
                const gap = (v.x - half) - p.x;
                if (gap < 24) { p.x = v.x - half; p.px = p.x; }
            } else if (p.x > v.x + half) {
                const gap = p.x - (v.x + half);
                if (gap < 24) { p.x = v.x + half; p.px = p.x; }
            }
        }
        if (p.y >= top && p.y <= bot && p.x >= v.x - half && p.x <= v.x + half) {
            world.state = 'won';
            world.events.push({ type: 'win', x: p.x, y: p.y, t: world.time });
            return;
        }
    }

    // 出界（拖拽机制下只有被甩出去才可能，仍保留判负）
    if (p.y > PHYS.outY) {
        world.state = 'failed';
        world.events.push({ type: 'fail', reason: 'out', x: p.x, y: p.y, t: world.time });
        return;
    }

    // 静止悬空判负：消灭「松开手干等」的僵局，逼玩家继续操作。
    //
    // ⚠️ 判据必须是「真正停住」而非「速度低于阈值」：露珠在绳上自然摆荡时会反复
    // 经过速度零点，单帧阈值判定会让它在摆荡途中被误判为静止。这里要求
    //   (a) 不在拖拽中；
    //   (b) 针对「位置」而非「瞬时速度」——用一个小窗口追踪位置漂移量；
    // 只有连续 restFailSec 内位置漂移都极小，才算停住。
    if (world.dragging) {
        world.pearl.restTime = 0;
        world.pearl.restRef = null;
    } else {
        const ref = world.pearl.restRef;
        if (!ref) {
            world.pearl.restRef = { x: p.x, y: p.y, t: world.time };
        } else {
            const drift = Math.abs(p.x - ref.x) + Math.abs(p.y - ref.y);
            if (drift > PHYS.restFailDrift) {
                // 位置明显变化 → 还在动，重置窗口
                world.pearl.restRef = { x: p.x, y: p.y, t: world.time };
                world.pearl.restTime = 0;
            } else {
                world.pearl.restTime = world.time - ref.t;
                if (world.pearl.restTime >= PHYS.restFailSec) {
                    world.state = 'failed';
                    world.events.push({ type: 'fail', reason: 'stall', x: p.x, y: p.y, t: world.time });
                }
            }
        }
    }
}

// 锚点与墙：锚结也不能拖出舞台
function clampAnchor(p) {
    const m = PHYS.anchorR;
    if (p.x < m) p.x = m;
    if (p.x > STAGE.w - m) p.x = STAGE.w - m;
    if (p.y < m) p.y = m;
    if (p.y > STAGE.h - m) p.y = STAGE.h - m;
}

// ---- 单子步积分 + 约束求解 ----
function substep(world, dt) {
    const { pearl: p } = world;

    // 1) 拖拽：把被拖对象拉向指针（限速插值，避免瞬移破坏稳定性）
    if (world.dragging) {
        const d = world.dragging;
        if (d.kind === 'anchor') {
            const a = world.ropes[d.rope].particles[0];
            const tx = Math.max(PHYS.anchorR, Math.min(STAGE.w - PHYS.anchorR, d.x));
            const ty = Math.max(PHYS.anchorR, Math.min(STAGE.h - PHYS.anchorR, d.y));
            const maxStep = PHYS.dragMaxSpeed * dt;
            let sx = (tx - a.x) * PHYS.anchorFollow;
            let sy = (ty - a.y) * PHYS.anchorFollow;
            const sd = Math.sqrt(sx * sx + sy * sy);
            if (sd > maxStep) { sx = sx / sd * maxStep; sy = sy / sd * maxStep; }
            a.x += sx; a.y += sy;
            clampAnchor(a);
        } else {
            // 直接拖露珠：给一个朝指针的强牵引
            const maxStep = PHYS.dragMaxSpeed * dt;
            let sx = (d.x - p.x) * PHYS.pearlDragFollow;
            let sy = (d.y - p.y) * PHYS.pearlDragFollow;
            const sd = Math.sqrt(sx * sx + sy * sy);
            if (sd > maxStep) { sx = sx / sd * maxStep; sy = sy / sd * maxStep; }
            p.x += sx; p.y += sy;
        }
    }

    // 2) 受力：重力 + 气泡浮力 + 气旋
    let ax = 0, ay = PHYS.g;
    p.inBubble = null;
    for (const b of world.bubbles) {
        if (!b.alive) continue;
        const dx = p.x - b.x, dy = p.y - b.y;
        if (dx * dx + dy * dy <= b.r * b.r) { p.inBubble = b; break; }
    }
    if (p.inBubble) { ay = PHYS.buoyancy; }
    for (const w of world.winds) {
        if (p.x >= w.x && p.x <= w.x + w.w && p.y >= w.y && p.y <= w.y + w.h) {
            ax += w.ax; ay += w.ay;
        }
    }

    // 3) 露珠 verlet
    const pvx = (p.x - p.px) * PHYS.pearlDamp;
    const pvy = (p.y - p.py) * PHYS.pearlDamp;
    const nx = p.x + pvx + ax * dt * dt;
    const ny = p.y + pvy + ay * dt * dt;
    p.px = p.x; p.py = p.y;
    p.x = nx; p.y = ny;

    // 4) 丝线粒点 verlet（锚点 = 索引 0，由拖拽驱动）
    for (const rope of world.ropes) {
        if (!rope.alive) continue;
        const ps = rope.particles, pv = rope.prev;
        for (let i = 1; i < ps.length; i++) {
            // 露珠驱动的末端粒点：跟随露珠位置（保持绳的真实连接感）
            const vx = (ps[i].x - pv[i].x) * PHYS.ropeDamp;
            const vy = (ps[i].y - pv[i].y) * PHYS.ropeDamp;
            const x0 = ps[i].x, y0 = ps[i].y;
            ps[i].x = x0 + vx + ax * dt * dt * 0.5;
            ps[i].y = y0 + vy + ay * dt * dt * 0.5;
            pv[i].x = x0; pv[i].y = y0;
        }
        pv[0].x = ps[0].x; pv[0].y = ps[0].y;
    }

    // 5) 距离约束松弛：锚点(0) 固定 → 末端与露珠连杆
    for (let it = 0; it < PHYS.iters; it++) {
        for (const rope of world.ropes) {
            if (!rope.alive) continue;
            const ps = rope.particles;
            for (let i = 0; i < ps.length - 1; i++) {
                relax(ps[i], ps[i + 1], rope.segLen, i === 0);
            }
            if (rope.linked) {
                relax(ps[ps.length - 1], p, rope.segLen, false, true);
            }
        }
        resolvePearl(world);
        if (world.state !== 'playing') return;
    }
}

// ---- 星芒收集 ----
function checkStars(world) {
    const p = world.pearl;
    for (const s of world.stars) {
        if (s.taken) continue;
        const dx = p.x - s.x, dy = p.y - s.y;
        const rr = PHYS.grazeR + PHYS.pearlR;
        if (dx * dx + dy * dy <= rr * rr) {
            s.taken = true;
            s.pop = 1;
            world.starsTaken++;
            world.events.push({ type: 'star', i: s.i, x: s.x, y: s.y, t: world.time });
        }
    }
}

// ---- 单帧推进 ----
export function stepWorld(world, frameDt) {
    if (world.state !== 'playing') return;
    world.acc = (world.acc || 0) + Math.min(frameDt, 0.1);
    let n = 0;
    while (world.acc >= PHYS.dt && n < PHYS.maxSub && world.state === 'playing') {
        world.acc -= PHYS.dt;
        n++;
        world.time += PHYS.dt;
        substep(world, PHYS.dt);
        if (world.state === 'playing') checkStars(world);
    }
}

// ---- 离线脚本模拟 ----
// script = [{ t, kind:'grab'|'move'|'release'|'pop', x, y }]
// opts: { maxSec, trace, fx }. fx 为可选变换函数（world 副作用后置钩子），
//       供需要额外诊断的调用方使用；不传时行为完全一致。
// 返回结局、拖拽次数、星芒数、露珠终位，供离线校验（可解性 + 每日确定性）。
export function simulate(spec, script, opts) {
    const o = opts || {};
    const maxSec = o.maxSec || 30;
    const world = createWorld(spec);
    const events = (script || []).slice().sort((a, b) => a.t - b.t);
    let ei = 0;
    const path = [];
    while (world.state === 'playing' && world.time < maxSec) {
        while (ei < events.length && events[ei].t <= world.time) {
            const e = events[ei++];
            if (e.kind === 'grab') beginDrag(world, e.x, e.y);
            else if (e.kind === 'move') moveDrag(world, e.x, e.y);
            else if (e.kind === 'release') endDrag(world);
            else if (e.kind === 'pop') popBubble(world, e.x, e.y);
        }
        if (typeof o.fx === 'function') o.fx(world);
        stepWorld(world, PHYS.dt);
        if (o.trace && path.length < 6000) {
            path.push({ t: +world.time.toFixed(2), x: +world.pearl.x.toFixed(1), y: +world.pearl.y.toFixed(1) });
        }
    }
    return {
        state: world.state,
        drags: world.drags,
        stars: world.starsTaken,
        starsTotal: (spec.stars || []).length,
        time: +world.time.toFixed(2),
        pearl: { x: +world.pearl.x.toFixed(1), y: +world.pearl.y.toFixed(1) },
        failReason: (world.events.find(e => e.type === 'fail') || {}).reason || null,
        path: o.trace ? path : null,
        events: world.events,
    };
}

// ---- 每日课程：以当天种子从 LEVELS 抽 5 关，按难度升序 ----
export const DAILY_COUNT = 5;

// 返回「关卡对象数组」（按 par 升序），调用方不需要再回表 LEVELS 取数。
export function dailyCourse(dateKey) {
    const seed = hashStringFNV('silk-dew-' + dateKey);
    const rng = mulberry32(seed);
    const pool = LEVELS.map((_, i) => i);
    for (let i = 0; i < DAILY_COUNT && i < pool.length; i++) {
        const j = i + Math.floor(rng() * (pool.length - i));
        const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    const picked = pool.slice(0, DAILY_COUNT);
    picked.sort((a, b) => (LEVELS[a].par || 0) - (LEVELS[b].par || 0));
    return picked.map(i => LEVELS[i]);
}
