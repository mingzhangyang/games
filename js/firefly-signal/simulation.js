/**
 * 萤火信号 Firefly Signal — 纯模拟层（无 DOM、无 Canvas、无 Date / Math.random）
 * ===========================================================================
 * 与 renderer.js 完全解耦：渲染层只读 `sim.flies` / `sim.tick` / `sim.harmony`，
 * 从不写回。Node 端的 scripts/verify-firefly-signal-sim.mjs 直接 import 本文件跑测试。
 *
 * 确定性契约：same seed + same (tick, fireflyId) 输入序列 = same simulation result
 *   - 固定步长 DT = 1/60 s，所有状态只在 step() / intervene() 里变化；
 *   - 随机只在建关时用一次 mulberry32(seed)（js/daily.js 的全站唯一实现）；
 *   - 位置是 tick 的纯函数（漫游 = 两个正弦），不累积浮点误差；
 *   - 同一 tick 内的闪光按数组下标顺序处理（级联也是），顺序固定即结果固定。
 *
 * 相位模型（不是完整 Kuramoto，可调性优先）：
 *   phase ∈ [0,1)，每 tick 前进 DT/period，到 1 即闪光并回到 0。
 *   闪光向半径内的同伴发 pulse：
 *       phase_j += coupling_j × falloff(d / radius_i) × response(phase_j)
 *   response 把 phase 往「此刻闪光」（0 ≡ 1）拉：落后的（phase 接近 1）推前、
 *   领先的（刚闪过）拉后，幅度 = 与 0 的有符号相位差 × 捕获窗口。
 *   捕获窗口是关键：只有相位本来就相近的同伴才会被自然 pulse 拉动 ——
 *   于是局部群体会各自同步，而两片反相的群体即使连通也不会自己合并；
 *   玩家的干预 pulse 不受窗口限制（有意的、明亮的信号），负责把群体拉进彼此的窗口，
 *   之后由自然耦合经桥接虫「逐渐合并」。
 */
import { mulberry32 } from '../daily.js';

export const DT = 1 / 60;

/** 世界坐标（逻辑单位）：渲染层等比缩放进场景下部的可玩区域 */
export const WORLD = { w: 600, h: 700 };

/**
 * 三种萤火虫。period 秒；coupling = 接收灵敏度（0..1）；radius = 自然 pulse 半径（世界单位）；
 * size / wander / wingRate 只给渲染与漫游用，不影响相位。
 */
export const TYPES = {
    normal: { period: 1.3, coupling: 0.28, radius: 96, size: 1, wander: 7, wanderSpeed: 1, wingRate: 1 },
    // 周期短约 6%、更敏感：被群体捕获后领着整群略微提速（真实萤火虫里「急性子」的个体）
    fast: { period: 1.22, coupling: 0.4, radius: 88, size: 0.82, wander: 10, wanderSpeed: 1.6, wingRate: 1.7 },
    // 耦合很低、周期略慢：会慢慢漂离群体节奏，同步度随之起伏 —— 需要亲手去「接」它
    solitary: { period: 1.34, coupling: 0.06, radius: 76, size: 1.22, wander: 5, wanderSpeed: 0.6, wingRate: 0.7 },
};

export const TUNING = {
    /** 自然 pulse 的捕获窗口：|相位差| ≤ full 全额，≥ edge 为 0，之间线性 */
    windowFull: 0.16,
    windowEdge: 0.3,
    /** 干预 pulse 半径 = 被点虫自然半径 × range */
    interventionRange: 2.1,
    /** 干预 pulse 的接收灵敏度 = min(1, coupling × boost)：普通虫约 0.55 ——
     *  一次干预只把圈内同伴往「此刻」拉过一半多，而不是一键对齐；
     *  所以一只圈能同时罩住两群的桥接虫，价值约是群内任一只的两倍 */
    interventionBoost: 2,
    /** 干预圈的平台：u = d/R < plateau 全额，之后平滑落到圈边为 0（扩散圆 = 真实影响范围） */
    interventionPlateau: 0.55,
    /** 两次干预的最短间隔（秒）：扩散圆还在走，新信号发不出去。
     *  同时挡住「连点同一只，把 55% 叠成 80%」这种捷径与误触双击 */
    interventionCooldown: 0.6,
    /** 被推到离 1 不足 absorb 的同伴当 tick 直接闪光（级联） */
    absorb: 0.03,
    /** 同步度判定：达到 target 后持续 holdSeconds；跌破 target - hysteresis 才清零 */
    holdSeconds: 2,
    hysteresis: 0.02,
};

const TAU = Math.PI * 2;

/** 距离衰减：u = d / R ∈ [0,1)，平滑地从 1 落到 0 */
export function falloff(u) {
    if (u >= 1) return 0;
    const k = 1 - u * u;
    return k * k;
}

/** 干预圈的衰减：圈内大半全额，靠近圈边才平滑衰减 */
export function ringFalloff(u, plateau = TUNING.interventionPlateau) {
    if (u >= 1) return 0;
    if (u <= plateau) return 1;
    return falloff((u - plateau) / (1 - plateau));
}

/** 有符号相位差：把 phase 拉向 0（≡1）的方向与幅度，∈ [-0.5, 0.5] */
export function signedGap(phase) {
    return phase < 0.5 ? -phase : 1 - phase;
}

/** 自然 pulse 的响应曲线：有符号相位差 × 捕获窗口 */
export function responseCurve(phase, tuning = TUNING) {
    const g = signedGap(phase);
    const a = Math.abs(g);
    if (a >= tuning.windowEdge) return 0;
    if (a <= tuning.windowFull) return g;
    return g * (tuning.windowEdge - a) / (tuning.windowEdge - tuning.windowFull);
}

/** 圆周序参量：相位 → 角度 → 单位向量 → 平均向量的模，∈ [0,1] */
export function orderParameter(phases) {
    const n = phases.length;
    if (!n) return 0;
    let cx = 0, sy = 0;
    for (let i = 0; i < n; i++) {
        cx += Math.cos(TAU * phases[i]);
        sy += Math.sin(TAU * phases[i]);
    }
    return Math.hypot(cx, sy) / n;
}

function wrap01(x) {
    x %= 1;
    return x < 0 ? x + 1 : x;
}

/**
 * 由关卡定义 + seed 建一局。level 形如：
 *   { target, maxInterventions, jitter?, groups: [{ phase, spread }],
 *     flies: [{ x, y, type?, group?, phase? }] }
 */
export function createSimulation(level, opts = {}) {
    const seed = (opts.seed ?? level.seed ?? 1) >>> 0;
    const tuning = { ...TUNING, ...(level.tuning || {}), ...(opts.tuning || {}) };
    const rng = mulberry32(seed);
    const jitter = level.jitter ?? 0.004;
    const groups = level.groups || [{ phase: 0, spread: 1 }];

    const flies = level.flies.map((f, id) => {
        const typeName = f.type || 'normal';
        const T = TYPES[typeName];
        if (!T) throw new Error(`unknown firefly type: ${typeName}`);
        const g = groups[f.group || 0] || groups[0];
        // 随机数的消耗顺序固定（每只 6 个），与是否指定 phase 无关 —— 改一只不会挪动其它只的随机流
        const rPhase = rng(), rPeriod = rng(), rWx = rng(), rWy = rng(), rPx = rng(), rPy = rng();
        const phase = f.phase ?? wrap01(g.phase + (rPhase - 0.5) * g.spread);
        return {
            id,
            type: typeName,
            hx: f.x,
            hy: f.y,
            x: f.x,
            y: f.y,
            phase,
            period: T.period * (1 + (rPeriod * 2 - 1) * jitter),
            coupling: T.coupling,
            radius: T.radius,
            size: T.size,
            wingRate: T.wingRate,
            wander: T.wander,
            // 漫游：两个互质频率的正弦，位置是 tick 的纯函数
            wx: (0.35 + rWx * 0.35) * T.wanderSpeed,
            wy: (0.45 + rWy * 0.4) * T.wanderSpeed,
            px: rPx * TAU,
            py: rPy * TAU,
            lastFlash: -1e9,
            flashes: 0,
        };
    });

    const sim = {
        seed,
        level,
        tuning,
        flies,
        tick: 0,
        target: level.target,
        maxInterventions: level.maxInterventions,
        interventions: [],
        harmony: 0,
        holdTicks: 0,
        holdNeeded: Math.round(tuning.holdSeconds / DT),
        won: false,
        wonTick: -1,
        /** 本 tick 闪光的 id（渲染 / 音频读）；每次 step 清空 */
        flashed: [],
        /** 本 tick 的干预（渲染画扩散圆用） */
        pulses: [],
    };

    function placeAll() {
        const t = sim.tick * DT;
        for (const f of flies) {
            f.x = f.hx + f.wander * Math.sin(f.wx * t + f.px);
            f.y = f.hy + f.wander * 0.6 * Math.sin(f.wy * t + f.py);
        }
    }

    /** 处理一串闪光（含级联）。queue 里的虫已经 phase=0 / 已计入 flashed */
    function propagate(queue, done) {
        for (let q = 0; q < queue.length; q++) {
            const src = flies[queue[q]];
            const R = src.radius;
            for (const f of flies) {
                if (done[f.id]) continue;
                const d = Math.hypot(f.x - src.x, f.y - src.y);
                if (d >= R) continue;
                const k = f.coupling * falloff(d / R) * responseCurve(f.phase, tuning);
                if (k === 0) continue;
                f.phase += k;
                if (f.phase >= 1 - tuning.absorb) fire(f, queue, done);
            }
        }
    }

    function fire(f, queue, done) {
        f.phase = 0;
        f.lastFlash = sim.tick;
        f.flashes++;
        done[f.id] = true;
        queue.push(f.id);
        sim.flashed.push(f.id);
    }

    function updateHarmony() {
        let cx = 0, sy = 0;
        for (const f of flies) {
            cx += Math.cos(TAU * f.phase);
            sy += Math.sin(TAU * f.phase);
        }
        sim.harmony = Math.hypot(cx, sy) / flies.length;
    }

    function updateHold() {
        if (sim.won) return;
        if (sim.harmony >= sim.target) sim.holdTicks++;
        else if (sim.harmony < sim.target - tuning.hysteresis) sim.holdTicks = 0;
        if (sim.holdTicks >= sim.holdNeeded) {
            sim.won = true;
            sim.wonTick = sim.tick;
        }
    }

    sim.step = function step() {
        sim.tick++;
        sim.flashed = [];
        sim.pulses = [];
        placeAll();
        const queue = [];
        const done = new Uint8Array(flies.length);
        for (const f of flies) f.phase += DT / f.period;
        for (const f of flies) {
            if (f.phase >= 1) {
                fire(f, queue, done);
            }
        }
        if (queue.length) propagate(queue, done);
        updateHarmony();
        updateHold();
    };

    /** 玩家干预：被点的虫立即闪光、相位归零，半径内同伴获得强 pulse。超出次数返回 false */
    sim.intervene = function intervene(id) {
        if (!sim.canIntervene()) return false;
        const src = flies[id];
        if (!src) return false;
        sim.interventions.push({ tick: sim.tick, id });
        const queue = [];
        const done = new Uint8Array(flies.length);
        fire(src, queue, done);
        const R = src.radius * tuning.interventionRange;
        sim.pulses.push({ id, x: src.x, y: src.y, r: R });
        for (const f of flies) {
            if (done[f.id]) continue;
            const d = Math.hypot(f.x - src.x, f.y - src.y);
            if (d >= R) continue;
            const k = Math.min(1, f.coupling * tuning.interventionBoost) * ringFalloff(d / R, tuning.interventionPlateau) * signedGap(f.phase);
            f.phase += k;
            if (f.phase >= 1 - tuning.absorb) fire(f, queue, done);
        }
        // 被干预 pulse 推到阈值的同伴按自然规则继续级联（queue 里第 0 个是被点的虫本身，已处理）
        if (queue.length > 1) propagate(queue.slice(1), done);
        updateHarmony();
        return true;
    };

    /** 同一 tick 内的深拷贝（求解器 / 回放测试用）。漫游参数只读，可共享 */
    sim.clone = function clone() {
        const c = createSimulation(level, { seed, tuning: opts.tuning });
        c.tick = sim.tick;
        c.harmony = sim.harmony;
        c.holdTicks = sim.holdTicks;
        c.won = sim.won;
        c.wonTick = sim.wonTick;
        c.interventions = sim.interventions.slice();
        for (let i = 0; i < flies.length; i++) {
            const a = flies[i], b = c.flies[i];
            b.phase = a.phase;
            b.x = a.x;
            b.y = a.y;
            b.lastFlash = a.lastFlash;
            b.flashes = a.flashes;
        }
        return c;
    };

    /** 状态指纹：相位用精确的 double 文本，任何一位不同都会变 */
    sim.fingerprint = function fingerprint() {
        return sim.tick + '|' + sim.interventions.map(i => i.tick + ':' + i.id).join(',') + '|'
            + flies.map(f => f.phase.toString() + '@' + f.x.toString() + ',' + f.y.toString()).join(';');
    };

    /**
     * 成功序列专用：把所有相位往圆周平均相位拉 amount（0..1）。
     * 只在 won 之后由游戏层调用，属于「谢幕演出」而不是玩法；同样是确定性的。
     */
    sim.gather = function gather(amount) {
        let cx = 0, sy = 0;
        for (const f of flies) {
            cx += Math.cos(TAU * f.phase);
            sy += Math.sin(TAU * f.phase);
        }
        const mean = wrap01(Math.atan2(sy, cx) / TAU);
        for (const f of flies) {
            let d = mean - f.phase;
            d -= Math.round(d);
            f.phase = wrap01(f.phase + d * amount);
        }
        updateHarmony();
    };

    sim.remaining = () => sim.maxInterventions - sim.interventions.length;

    /** 冷却剩余 tick（0 = 可以干预） */
    sim.cooldown = function cooldown() {
        const last = sim.interventions[sim.interventions.length - 1];
        if (!last) return 0;
        return Math.max(0, last.tick + Math.round(tuning.interventionCooldown / DT) - sim.tick);
    };

    sim.canIntervene = () => !sim.won && sim.remaining() > 0 && sim.cooldown() === 0;

    placeAll();
    updateHarmony();
    return sim;
}

/** 回放：按 (tick, id) 输入序列把一局推进到 ticks。输入必须按 tick 升序 */
export function replay(level, seed, inputs, ticks) {
    const sim = createSimulation(level, { seed });
    let k = 0;
    for (;;) {
        // 输入落在「第 tick 次 step 之后、第 tick+1 次之前」，与游戏层点击的时序一致；
        // 所以停在 ticks 时，恰好属于 ticks 的输入也要先应用
        while (k < inputs.length && inputs[k].tick === sim.tick) {
            sim.intervene(inputs[k].id);
            k++;
        }
        if (sim.tick >= ticks) break;
        sim.step();
    }
    return sim;
}
