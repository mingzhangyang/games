/**
 * Maxwell's Demon 麦克斯韦妖 — 热与熵内核（纯模块，页面与校验器共用）
 * ==================================================================
 * 机制即教学：一个密封容器被隔板分成左右两腔，隔板中央只有一扇小门。
 * 分子默认是「看不见的灰点」——你不知道它是快是慢。守门的妖有两件事可做：
 *
 *   1) 开门：把门「武装」起来等 0.5 秒——**第一个**抵达门洞的分子被放行，门随即关上。
 *      （不是双向自由通道：那会让两腔瞬间均化，分拣的净收益≈0，实测过。）
 *      武装期间再按一次 = 取消，钱照花。
 *   2) 观测：花预算「看清」门附近分子的真实速度（红=快，蓝=慢）。
 *
 * 两件事都要花钱。信息不是免费的——这就是兰道尔原理的游戏化表述：
 * 你每获得一个比特，都要在别处付账。预算耗尽仍没拉开温差 = 失败。
 *
 * 判定：固定物理步长 1/120s + 种子化确定性模拟（mulberry32），
 *       逻辑与渲染完全分离；同一种子同一操作序列 ⇒ 同一结果。
 * 温度：T = 分子平均动能（v² 均值 / 2v0²），初始两腔均 ≈ 1.0。
 *      完全分拣的理论极差 ≈ 1.386（Rayleigh 分布上下半区条件均值之差）。
 */

import { hashStringFNV, mulberry32 } from './daily.js';

export const STAGE = { w: 560, h: 640 };

/** 容器 / 隔板 / 门的几何 */
export const VESSEL = {
    pad: 34,        // 容器壁厚（顶部 34px 留给预算条与温差条）
    wallX: 280,     // 隔板中心 x
    wallHalf: 7,    // 隔板半厚
    doorY: 320,     // 门中心 y
};

export const RULES = {
    molR: 4.2,
    v0: 185,              // Rayleigh 尺度参数（速率分布）；越大气体越活、撞门机会越密
    fastK: 1.18,          // 快/慢阈值 = v0 × 1.18（≈ Rayleigh 中位数 1.177 v0）
    costGate: 2,          // 武装一次放行（或取消，钱照花）
    costScan: 2,          // 观测一次
    gateWindow: 0.6,      // 武装等待时长（秒）；超时无人抵达即作废
    scanTime: 1.6,        // 观测显色时长（秒）
    scanR: 132,           // 观测半径（以门为中心）
    holdTime: 1.6,        // 温差达标需保持的时长
    graceTime: 3.0,       // 预算耗尽后的宽限（期内达标仍算赢）
    vMaxK: 2.2,           // 速率上限（× v0）：T ∝ v²，放开长尾会出现「一发入魂」的极端分子
    tempTau: 0.35,        // 温度读数的时间常数（秒）：瞬时值在少分子时抖得太厉害
    fixedDt: 1 / 120,     // 固定物理步长
    maxFrame: 0.05,       // 单帧最大推进（防后台切回后大跳）
    maxSubSteps: 8,
};

export const DAILY_COUNT = 5;

function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
}

/** Rayleigh 分布的速率：2D Maxwell-Boltzmann 速率分布 */
function rayleighSpeed(rng) {
    let u = rng();
    if (u < 1e-9) u = 1e-9;
    return RULES.v0 * Math.sqrt(-2 * Math.log(u));
}

export function isFast(m) {
    return Math.hypot(m.vx, m.vy) >= RULES.v0 * RULES.fastK;
}

/* ────────────────────────── 世界 ────────────────────────── */

export function createWorld(spec, seedKey) {
    const rng = mulberry32(hashStringFNV('maxwell-demon-' + (seedKey || spec.id)));
    const pad = VESSEL.pad;
    const r = RULES.molR;
    const xL0 = pad + r + 6;
    const xL1 = VESSEL.wallX - VESSEL.wallHalf - r - 6;
    const xR0 = VESSEL.wallX + VESSEL.wallHalf + r + 6;
    const xR1 = STAGE.w - pad - r - 6;
    const y0 = pad + r + 6;
    const y1 = STAGE.h - pad - r - 6;

    const molecules = [];
    const n = spec.molecules;
    // ⚠️ 速率必须先排序再**成对交替**分配：直接各抽各的话，n=8 的 Rayleigh 采样
    // 噪声足以让开局温差天然偏到 -0.65（实测），玩家一进场就背着一笔随机债。
    // 做法：排序后每两个一组 (s2k, s2k+1)，组内一左一右，且**哪边拿大号逐组交替**——
    // 于是两腔的 Σv² 之差变成一串正负交替的小量相加，开局 ΔT ≈ 0。
    const speeds = [];
    for (let i = 0; i < n; i++) speeds.push(clamp(rayleighSpeed(rng), RULES.v0 * 0.35, RULES.v0 * RULES.vMaxK));
    speeds.sort((a, b) => a - b);
    const sideOf = new Array(n);
    for (let k = 0; k * 2 + 1 < n; k++) {
        const bigLeft = k % 2 === 0;
        sideOf[2 * k] = bigLeft;       // 小组内较小的 → 拿小的那侧
        sideOf[2 * k + 1] = !bigLeft;
    }

    for (let i = 0; i < n; i++) {
        const left = sideOf[i];
        const x = left ? xL0 + (xL1 - xL0) * rng() : xR0 + (xR1 - xR0) * rng();
        const y = y0 + (y1 - y0) * rng();
        const ang = rng() * Math.PI * 2;
        const sp = speeds[i];
        molecules.push({
            i,
            x, y,
            vx: Math.cos(ang) * sp,
            vy: Math.sin(ang) * sp,
            r,
            side: left ? -1 : 1,
            flash: 0,
        });
    }

    const world = {
        spec,
        rng,
        time: 0,
        molecules,
        total: spec.budget,
        spent: 0,
        gateOpen: false,   // 门洞视觉是开的（武装中）
        gateArmed: false,  // 武装：等待第一个抵达门洞的分子
        gateT: 0,
        revealT: 0,
        doorHalf: spec.doorHalf,
        gateCount: 0,
        scanCount: 0,
        tempL: 0,
        tempR: 0,
        countL: 0,
        countR: 0,
        gap: 0,
        holding: 0,
        grace: 0,
        acc: 0,
        // playing | won | dead
        state: 'playing',
        events: [],
    };
    // 开局就把温度算出来：HUD 第一帧不该显示 0.00 / ΔT 0.00
    updateTemps(world);
    return world;
}

/**
 * 武装一次放行（或撤回）。立刻扣预算，无论成败。
 * 已武装时再按 = 取消：门关上、不再放行，但钱已经花了——
 * 这正是「看错了就付学费」的代价，也是唯一来得及止损的手段。
 */
export function openGate(world) {
    if (world.state !== 'playing') return false;
    if (world.spent + RULES.costGate > world.total) {
        world.events.push({ type: 'broke' });
        return false;
    }
    world.spent += RULES.costGate;
    world.gateCount++;
    if (world.gateArmed) {
        world.gateArmed = false;
        world.gateOpen = false;
        world.gateT = 0;
        world.events.push({ type: 'gateCancel' });
        return true;
    }
    world.gateArmed = true;
    world.gateOpen = true;
    world.gateT = RULES.gateWindow;
    world.events.push({ type: 'gate' });
    return true;
}

/** 观测一次（离散动作，立刻扣预算） */
export function scan(world) {
    if (world.state !== 'playing') return false;
    if (world.spent + RULES.costScan > world.total) {
        world.events.push({ type: 'broke' });
        return false;
    }
    world.spent += RULES.costScan;
    world.scanCount++;
    world.revealT = RULES.scanTime;
    world.events.push({ type: 'scan' });
    return true;
}

/* ────────────────────────── 物理 ────────────────────────── */

function substep(world, dt) {
    const pad = VESSEL.pad;
    const wxL = VESSEL.wallX - VESSEL.wallHalf;
    const wxR = VESSEL.wallX + VESSEL.wallHalf;

    const doorTop = VESSEL.doorY - world.doorHalf + RULES.molR;
    const doorBot = VESSEL.doorY + world.doorHalf - RULES.molR;

    for (const m of world.molecules) {
        const oldSide = m.x < VESSEL.wallX ? -1 : 1;
        m.x += m.vx * dt;
        m.y += m.vy * dt;

        // 外壁：弹性反射
        if (m.x < pad + m.r) { m.x = pad + m.r; m.vx = Math.abs(m.vx); }
        else if (m.x > STAGE.w - pad - m.r) { m.x = STAGE.w - pad - m.r; m.vx = -Math.abs(m.vx); }
        if (m.y < pad + m.r) { m.y = pad + m.r; m.vy = Math.abs(m.vy); }
        else if (m.y > STAGE.h - pad - m.r) { m.y = STAGE.h - pad - m.r; m.vy = -Math.abs(m.vy); }

        const atDoor = m.y > doorTop && m.y < doorBot;
        const inBand = m.x > wxL - m.r && m.x < wxR + m.r;
        if (inBand) {
            // 只有**正对着门洞**且门已武装的分子才被放行；其余一律当墙反弹
            if (atDoor && world.gateArmed) {
                // 放行 = 不干预它的运动，等它自己走出隔板带（见下方穿越检测）
            } else {
                // 撞隔板：从哪边来就弹回哪边（用移动前的 side，避免穿模后被推错侧）
                if (oldSide < 0) { m.x = wxL - m.r; m.vx = -Math.abs(m.vx); }
                else { m.x = wxR + m.r; m.vx = Math.abs(m.vx); }
            }
        }
        const nowSide = m.x < VESSEL.wallX ? -1 : 1;
        // 穿越完成检测 ⚠️ 必须在 inBand 判定**之外**：
        // 分子单步位移（v≈190px/s × 1/120s ≈ 1.6px）足以一步跨出 24px 宽的隔板带，
        // 放在带内判定里就会永远轮不到执行——实测 pass 事件恒为 0、
        // 分子却已经换腔（因为它们是在门关闭那一帧被"推"到新侧的）。
        //
        // ⚠️⚠️ 这里**不能**再加 `atDoor` 判定：是否被放行已经由「进带那一刻」的
        // atDoor 决定了（上面的 else 分支会把它弹回去）。若穿越时二次校验 y，
        // 那些「对准进带、却在带内漂移出 y 窗口」的分子会**静默溜过去**——
        // 不放行事件、门也不关，玩家看到的是「钱花了、门白开、分子还换了腔」。
        // 实测窄门关里这种静默溜走占武装次数的 1/3（arms 27 / pass 4 / expire 23）。
        if (world.gateArmed && nowSide !== oldSide) {
            world.gateArmed = false;
            world.gateOpen = false;
            world.gateT = 0;
            world.events.push({ type: 'pass', hot: isFast(m), toLeft: oldSide > 0, y: m.y });
        }
        m.side = nowSide;
    }
}

/**
 * alpha = 1 表示直接取值（开局）；< 1 表示向瞬时值做指数平滑。
 * ⚠️ 为什么必须平滑：温度∝v²，单分子权重极大，分子少时瞬时 ΔT 会以几赫兹
 * 上下抖 ±0.1——玩家眼看着达标环走满又归零，而「保持 1.6 秒」在抖动下几乎不可能。
 */
function updateTemps(world, alpha) {
    const a = alpha === undefined ? 1 : alpha;
    let sl = 0, nl = 0, sr = 0, nr = 0;
    for (const m of world.molecules) {
        const v2 = m.vx * m.vx + m.vy * m.vy;
        if (m.x < VESSEL.wallX) { sl += v2; nl++; } else { sr += v2; nr++; }
    }
    // T = 平均动能 = mean(v²) / (2 v0²) —— 初始两侧均 ≈ 1.0
    const norm = 2 * RULES.v0 * RULES.v0;
    world.countL = nl;
    world.countR = nr;
    const instL = nl ? (sl / nl) / norm : 0;
    const instR = nr ? (sr / nr) / norm : 0;
    world.tempL += (instL - world.tempL) * a;
    world.tempR += (instR - world.tempR) * a;
    world.gap = world.tempL - world.tempR;
}

/**
 * 推进世界一帧。
 * input: { gate:boolean, scan:boolean } —— 都是**边沿触发**的离散动作。
 */
export function stepWorld(world, dt, input) {
    if (world.state !== 'playing') return;
    world.time += dt;

    if (input && input.gate) openGate(world);
    if (input && input.scan) scan(world);

    // 武装窗口倒计时：超时没人抵达门洞 ⇒ 这次开门作废（钱已经花了）
    if (world.gateArmed) {
        world.gateT -= dt;
        if (world.gateT <= 0) {
            world.gateT = 0;
            world.gateArmed = false;
            world.gateOpen = false;
            world.events.push({ type: 'gateExpire' });
        }
    }
    // 观测残影
    if (world.revealT > 0) world.revealT = Math.max(0, world.revealT - dt);

    // 固定步长物理
    world.acc += Math.min(dt, RULES.maxFrame);
    let guard = 0;
    while (world.acc >= RULES.fixedDt && guard < RULES.maxSubSteps) {
        substep(world, RULES.fixedDt);
        world.acc -= RULES.fixedDt;
        guard++;
    }
    if (guard >= RULES.maxSubSteps) world.acc = 0;

    updateTemps(world, 1 - Math.exp(-Math.min(dt, RULES.maxFrame) / RULES.tempTau));

    // 达标保持
    if (world.gap >= world.spec.target) {
        world.holding += dt;
        if (world.holding >= RULES.holdTime) {
            world.state = 'won';
            world.events.push({ type: 'won' });
            return;
        }
    } else {
        world.holding = Math.max(0, world.holding - dt * 1.5);
    }

    // 破产 → 宽限
    // ⚠️ 判据是「连最便宜的动作都付不起」，不是 spent >= total：
    // 成本是 2 / 3 两种，剩余 1 时两个动作都买不动，若只看 spent>=total
    // 会永远卡在 playing（宽限计时器根本不启动）——玩家看着满屏分子却动不了。
    if (world.total - world.spent < Math.min(RULES.costGate, RULES.costScan)) {
        world.grace += dt;
        if (world.grace > RULES.graceTime) {
            world.state = 'dead';
            world.events.push({ type: 'dead' });
        }
    }
}

/** 剩余预算（HUD 用；分数用的是 spent，asc 越小越好） */
export function budgetLeft(world) {
    return Math.max(0, world.total - world.spent);
}

export function starsForLevel(spent, par, gap, stretch) {
    let stars = 1;
    if (spent <= par) stars++;
    if (gap >= stretch) stars++;
    return stars;
}

/* ────────────────────────── 关卡 ────────────────────────── */
/**
 * 20 关。par / budget / doorHalf / molecules 全部由
 * scripts/verify-maxwell-demon-levels.mjs 用「诚实机器人」现算并断言，
 * **不许手填**（手填 = 校验器立刻红）。
 *
 * 诚实机器人的定义：位置永远可见，快慢只能靠花钱观测才知道
 * （revealT > 0 且分子在 scanR 圈内才记账），速率大小恒定 ⇒ 记住即永久有效。
 * 它怎么打，par 就是多少 —— 玩家只要比它更会用信息，就能省下预算拿星。
 *
 * 难度曲线的两条硬约束（都是实测出来的，别改）：
 *  ① 门宽 doorHalf **下限 21**：< 20 时机会密度崩塌（最窄关 150s 内 0 次成交）。
 *     后期难度交给「分子数 + 预算余量」，不再收窄门。
 *  ② target 单调非降（0.30 → 0.46），每关都留 0.18 的天花板余量；
 *     天花板容不下就换分子数重抽世界，而不是去压 target 或放宽门。
 */
export const LEVELS = [
    {
        id: 'md1',
        name: { en: 'The First Gate', zh: '第一道门' },
        molecules: 22, budget: 26, target: 0.30, stretch: 0.44, par: 10, doorHalf: 34,
        tipKey: 'tipFirst',
    },
    {
        id: 'md2',
        name: { en: 'Narrower Door', zh: '更窄的门' },
        molecules: 23, budget: 40, target: 0.31, stretch: 0.45, par: 16, doorHalf: 33,
        tipKey: 'tipNarrow',
    },
    {
        id: 'md3',
        name: { en: 'Cold Shoulder', zh: '冷肩' },
        molecules: 24, budget: 50, target: 0.32, stretch: 0.46, par: 20, doorHalf: 33,
        tipKey: 'tipCrowd',
    },
    {
        id: 'md4',
        name: { en: 'The Reckoning', zh: '清算' },
        molecules: 25, budget: 35, target: 0.33, stretch: 0.47, par: 14, doorHalf: 32,
        tipKey: 'tipScan',
    },
    {
        id: 'md5',
        name: { en: 'Price of a Bit', zh: '一比特的价钱' },
        molecules: 26, budget: 26, target: 0.33, stretch: 0.47, par: 10, doorHalf: 31,
        tipKey: 'tipHold',
    },
    {
        id: 'md6',
        name: { en: 'Thin Passage', zh: '细缝' },
        molecules: 27, budget: 45, target: 0.34, stretch: 0.48, par: 20, doorHalf: 31,
        tipKey: null,
    },
    {
        id: 'md7',
        name: { en: 'Double Check', zh: '再看一眼' },
        molecules: 28, budget: 30, target: 0.35, stretch: 0.49, par: 14, doorHalf: 30,
        tipKey: null,
    },
    {
        id: 'md8',
        name: { en: 'Slow Burn', zh: '慢火' },
        molecules: 29, budget: 45, target: 0.36, stretch: 0.50, par: 20, doorHalf: 29,
        tipKey: 'tipSave',
    },
    {
        id: 'md9',
        name: { en: 'Tight Ledger', zh: '吃紧的账' },
        molecules: 30, budget: 30, target: 0.37, stretch: 0.51, par: 14, doorHalf: 29,
        tipKey: null,
    },
    {
        id: 'md10',
        name: { en: 'The Waiting', zh: '久候' },
        molecules: 31, budget: 50, target: 0.38, stretch: 0.52, par: 24, doorHalf: 28,
        tipKey: null,
    },
    {
        id: 'md11',
        name: { en: 'Dense Air', zh: '稠气' },
        molecules: 31, budget: 55, target: 0.38, stretch: 0.52, par: 26, doorHalf: 27,
        tipKey: null,
    },
    {
        id: 'md12',
        name: { en: 'Counting Cost', zh: '数着花' },
        molecules: 32, budget: 30, target: 0.39, stretch: 0.53, par: 14, doorHalf: 26,
        tipKey: 'tipSave',
    },
    {
        id: 'md13',
        name: { en: 'The Long Hold', zh: '长久的稳' },
        molecules: 33, budget: 45, target: 0.40, stretch: 0.54, par: 22, doorHalf: 26,
        tipKey: null,
    },
    {
        id: 'md14',
        name: { en: 'Half Chance', zh: '一半的机会' },
        molecules: 34, budget: 32, target: 0.41, stretch: 0.55, par: 16, doorHalf: 25,
        tipKey: null,
    },
    {
        id: 'md15',
        name: { en: 'Pressure', zh: '压强' },
        molecules: 37, budget: 35, target: 0.42, stretch: 0.56, par: 18, doorHalf: 24,
        tipKey: null,
    },
    {
        id: 'md16',
        name: { en: 'The Ledger', zh: '账簿' },
        molecules: 36, budget: 45, target: 0.43, stretch: 0.57, par: 24, doorHalf: 24,
        tipKey: 'tipCrowd',
    },
    {
        id: 'md17',
        name: { en: 'Thin Margin', zh: '薄利' },
        molecules: 39, budget: 40, target: 0.43, stretch: 0.57, par: 24, doorHalf: 23,
        tipKey: null,
    },
    {
        id: 'md18',
        name: { en: 'Last Ember', zh: '余烬' },
        molecules: 42, budget: 36, target: 0.44, stretch: 0.58, par: 20, doorHalf: 22,
        tipKey: null,
    },
    {
        id: 'md19',
        name: { en: 'Entropy Due', zh: '熵债' },
        molecules: 39, budget: 36, target: 0.45, stretch: 0.59, par: 20, doorHalf: 22,
        tipKey: null,
    },
    {
        id: 'md20',
        name: { en: "The Demon's Bill", zh: '妖的账单' },
        molecules: 40, budget: 32, target: 0.46, stretch: 0.60, par: 16, doorHalf: 21,
        tipKey: 'tipCrowd',
    },
];

export function dailyCourse(dateKey) {
    const rng = mulberry32(hashStringFNV('maxwell-demon-' + dateKey));
    const idx = LEVELS.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
    }
    const n = Math.min(DAILY_COUNT, idx.length);
    return idx.slice(0, n)
        .sort((a, b) => LEVELS[a].target - LEVELS[b].target)
        .map(i => LEVELS[i]);
}
