// tests/lib/loop-jail-bot.mjs — 画牢 Loop Jail 的测试专用玩家模型（只给 verify-loop-jail-sim 用）
//
// 不是 AI 对手，只是可玩性的下限 / 上限探针：
//   - idle：笔尖停在原地什么也不做（三角会锁定并冲刺 → 必然掉命）；
//   - circler：像触屏玩家一样「按下 → 绕最近的小怪画一个小圈 → 越过起点闭合 → 抬起」，
//     画圈速度 ~1400 px/s（真实手指快速画圈的量级），不预判冲刺、不躲避。
// 两者都只通过模拟的公开输入（penDown / movePen / penUp / step）操作，和真实玩家同一入口。
import { LoopJailSim, PEN_RADIUS } from '../../src/games/loop-jail/simulation.js';

export const DT = 1 / 60;

export function idle({ seed = 1, aspect = 420 / 720, maxSeconds = 600 } = {}) {
    const sim = new LoopJailSim({ seed, aspect });
    sim.movePen(sim.pen.x, sim.pen.y); // 鼠标停在场地中央：笔尖上场，然后什么也不做
    const steps = Math.round(maxSeconds / DT);
    for (let i = 0; i < steps && !sim.over; i++) sim.step(DT);
    return { sim, seconds: sim.time };
}

function pickTarget(sim) {
    let best = null;
    let bestD = Infinity;
    for (const m of sim.monsters) {
        if (m.spawn > 0 || m.boost > 1.4) continue; // 刚弹开 / 刚被击退的高速目标不追
        if (m.type === 'triangle' && m.state !== 'wander') continue;
        const d = Math.hypot(m.x - sim.pen.x, m.y - sim.pen.y);
        if (d < bestD) { bestD = d; best = m; }
    }
    return best;
}

/**
 * 绕目标画圈：在几个半径 × 12 个起点里，选「圈上离其他小怪最远」的一种；
 * 返回 { pts, clear }，clear = 路径到其他小怪边缘的最近距离（越大越安全）。
 */
function planCircle(sim, m) {
    const lead = 0.12;
    const cx = m.x + (m.vx || 0) * lead;
    const cy = m.y + (m.vy || 0) * lead;
    let best = null;
    for (const R of [m.r + 24, m.r + 34, m.r + 46]) {
        const ringClear = sim.monsters.reduce((min, o) => {
            if (o === m) return min;
            return Math.min(min, Math.abs(Math.hypot(o.x - cx, o.y - cy) - R) - o.r);
        }, Infinity);
        for (let k = 0; k < 12; k++) {
            const a = (k / 12) * Math.PI * 2;
            const sx = cx + Math.cos(a) * R;
            const sy = cy + Math.sin(a) * R;
            if (sx < 4 || sy < 4 || sx > sim.w - 4 || sy > sim.h - 4) continue;
            let clear = ringClear;
            for (const o of sim.monsters) clear = Math.min(clear, Math.hypot(o.x - sx, o.y - sy) - o.r);
            if (!best || clear > best.clear) best = { R, a, clear };
        }
    }
    if (!best) return { pts: [], clear: -1 };
    const pts = [];
    const total = Math.PI * 2 * 1.1; // 多画 10% 保证越过起点
    const n = 48;
    for (let i = 0; i <= n; i++) {
        const a = best.a + (i / n) * total;
        // 与模拟同样夹进场地（笔尖本来就出不了场地，路径点在场外会永远「走不到」）
        pts.push({
            x: Math.min(sim.w, Math.max(0, cx + Math.cos(a) * best.R)),
            y: Math.min(sim.h, Math.max(0, cy + Math.sin(a) * best.R)),
        });
    }
    return { pts, clear: best.clear };
}

/** 有三角正锁定 / 冲向笔尖附近：悬停移开（不画线），返回是否移动了 */
function dodge(sim) {
    const pen = sim.pen;
    for (const m of sim.monsters) {
        if (m.type !== 'triangle' || !m.target || (m.state !== 'charge' && m.state !== 'dash')) continue;
        if (Math.hypot(m.target.x - pen.x, m.target.y - pen.y) > 40) continue;
        const ax = m.target.x - m.x;
        const ay = m.target.y - m.y;
        const d = Math.hypot(ax, ay) || 1;
        // 垂直于冲刺方向挪 70px，选离墙远的一侧
        let nx = -ay / d;
        let ny = ax / d;
        const tx = pen.x + nx * 70;
        const ty = pen.y + ny * 70;
        if (tx < 20 || ty < 20 || tx > sim.w - 20 || ty > sim.h - 20) { nx = -nx; ny = -ny; }
        sim.movePen(pen.x + nx * 70, pen.y + ny * 70);
        return true;
    }
    return false;
}

export function circler({ seed = 1, aspect = 420 / 720, maxSeconds = 600, speed = 1400, rest = 0.25 } = {}) {
    const sim = new LoopJailSim({ seed, aspect });
    const steps = Math.round(maxSeconds / DT);
    let plan = null;
    let idx = 0;
    let cooldown = 0.4;
    for (let i = 0; i < steps && !sim.over; i++) {
        if (!plan && dodge(sim)) {
            // 桌面玩家的做法：不按键，把笔尖从三角锁定的位置挪开
        } else if (!plan) {
            cooldown -= DT;
            const target = cooldown <= 0 && sim.ink > 22 ? pickTarget(sim) : null;
            if (target) {
                const p = planCircle(sim, target);
                if (p.clear > PEN_RADIUS + 18) {
                    plan = p.pts;
                    idx = 1;
                    sim.penDown(plan[0].x, plan[0].y);
                }
            }
        } else {
            // 本帧沿路径前进 speed × DT
            let budget = speed * DT;
            while (budget > 0 && idx < plan.length) {
                const p = plan[idx];
                const d = Math.hypot(p.x - sim.pen.x, p.y - sim.pen.y);
                if (d <= budget) {
                    sim.movePen(p.x, p.y);
                    budget -= d;
                    idx++;
                } else {
                    const k = budget / d;
                    sim.movePen(sim.pen.x + (p.x - sim.pen.x) * k, sim.pen.y + (p.y - sim.pen.y) * k);
                    budget = 0;
                }
            }
            if (idx >= plan.length) {
                sim.penUp();
                plan = null;
                cooldown = rest;
            }
        }
        sim.step(DT);
        sim.drainEvents();
    }
    return { sim, seconds: sim.time };
}
