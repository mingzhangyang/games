import {
    ACCEL_CAP,
    BOUNDS,
    CAPTURE_R,
    DT,
    G,
    PROBE_R,
    SOFT2,
    SPEED_CAP,
    W,
    H,
} from '../config.js';

// Reused scratch objects keep the preview solver allocation-free while preserving
// the exact integrator used by the live flight loop.
export const bodyScratch = Array.from({ length: 12 }, () => ({ x: 0, y: 0, r: 0, m: 0 }));

export function bodiesAt(level, t) {
    let n = 0;
    for (const body of level.bodies) {
        bodyScratch[n].x = body.x;
        bodyScratch[n].y = body.y;
        bodyScratch[n].r = body.r;
        bodyScratch[n].m = body.r * body.r * 0.5;
        bodyScratch[n].tone = body.tone;
        bodyScratch[n].ring = !!body.ring;
        n++;
        if (body.moon) {
            const angle = body.moon.speed * t + body.moon.phase;
            bodyScratch[n].x = body.x + Math.cos(angle) * body.moon.dist;
            bodyScratch[n].y = body.y + Math.sin(angle) * body.moon.dist;
            bodyScratch[n].r = body.moon.r;
            bodyScratch[n].m = body.moon.r * body.moon.r * 0.5;
            bodyScratch[n].tone = undefined;
            bodyScratch[n].ring = false;
            n++;
        }
    }
    return n;
}

export function accelAt(x, y, count) {
    let ax = 0;
    let ay = 0;
    for (let i = 0; i < count; i++) {
        const body = bodyScratch[i];
        const dx = body.x - x;
        const dy = body.y - y;
        const d2 = dx * dx + dy * dy + SOFT2;
        const d = Math.sqrt(d2);
        const acceleration = Math.min(ACCEL_CAP, G * body.m / d2);
        ax += acceleration * dx / d;
        ay += acceleration * dy / d;
    }
    return { ax, ay };
}

export function collisionAt(x, y, count) {
    for (let i = 0; i < count; i++) {
        const body = bodyScratch[i];
        const dx = x - body.x;
        const dy = y - body.y;
        const radius = body.r + PROBE_R;
        if (dx * dx + dy * dy < radius * radius) return true;
    }
    return false;
}

/**
 * Simulate the same fixed-step trajectory used by the live game.
 * Returns capture|crash|lost|timeout and sampled points for rendering.
 */
export function simulate(level, x, y, vx, vy, maxSteps) {
    const pts = [];
    let t = 0;
    for (let i = 0; i < maxSteps; i++) {
        const count = bodiesAt(level, t);
        const acceleration = accelAt(x, y, count);
        vx += acceleration.ax * DT;
        vy += acceleration.ay * DT;
        const speed = Math.hypot(vx, vy);
        if (speed > SPEED_CAP) {
            vx *= SPEED_CAP / speed;
            vy *= SPEED_CAP / speed;
        }
        x += vx * DT;
        y += vy * DT;
        t += DT;
        if (collisionAt(x, y, count)) return { pts, outcome: 'crash', steps: i };
        const dx = x - level.target.x;
        const dy = y - level.target.y;
        if (dx * dx + dy * dy < CAPTURE_R * CAPTURE_R) {
            return { pts, outcome: 'capture', steps: i };
        }
        if (x < -BOUNDS || x > W + BOUNDS || y < -BOUNDS || y > H + BOUNDS) {
            return { pts, outcome: 'lost', steps: i };
        }
        pts.push({ x, y });
    }
    return { pts, outcome: 'timeout', steps: maxSteps };
}

export { DT, SPEED_CAP };
