/**
 * Lumen 纯视觉的瞬态效果：粒子、点击涟漪、镜面转动补间。
 * 判定早已在 model/session.js 即时生效，这里只负责「看起来」的那 0.1–0.8 秒。
 */
import { GRID_N } from '../model/beam.js';
import { CELL, idxCenter } from './geometry.js';
import { MIRROR_COLOR, linkColor, mirrorAngle } from './pieces.js';

const FLIP_DUR = 0.16;
const RIPPLE_DUR = 0.42;
const MAX_PARTICLES = 130;
const BURSTS = {
    crystal: { color: '#7dfad0', count: 14 },
    shadow: { color: '#ff4d6d', count: 16 },
};

export class Effects {
    constructor() {
        this.particles = [];
        this.ripples = [];        // { x, y, color, age }
        this.flips = new Map();   // idx → { from, to, age }
    }

    clear() {
        this.particles.length = 0;
        this.ripples.length = 0;
        this.flips.clear();
    }

    /** 镜面从 before 的朝向转到 after 的朝向，并在每格放一圈涟漪（联动组用组色） */
    tap(cells, before, after, groupOf) {
        for (const idx of cells) {
            const r = Math.floor(idx / GRID_N), c = idx % GRID_N;
            const prev = this.flips.get(idx);
            const from = prev ? angleOf(prev) : mirrorAngle(before[r][c]);
            this.flips.set(idx, { from, to: mirrorAngle(after[r][c]), age: 0 });
            const group = groupOf(idx);
            const { x, y } = idxCenter(idx);
            this.ripples.push({ x, y, color: group === undefined ? MIRROR_COLOR : linkColor(group), age: 0 });
        }
    }

    /** kind ∈ crystal | shadow：在每个 idx 上炸一团粒子 */
    burst(cells, kind) {
        const { color, count } = BURSTS[kind];
        for (const idx of cells) {
            const { x, y } = idxCenter(idx);
            for (let i = 0; i < count; i++) {
                if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
                const ang = Math.random() * Math.PI * 2;
                const spd = 30 + Math.random() * 130;
                this.particles.push({
                    x, y,
                    vx: Math.cos(ang) * spd,
                    vy: Math.sin(ang) * spd,
                    life: 0.4 + Math.random() * 0.4,
                    age: 0,
                    size: 1.3 + Math.random() * 2.2,
                    color,
                });
            }
        }
    }

    update(dt) {
        let w = 0;
        for (const p of this.particles) {
            p.age += dt;
            if (p.age >= p.life) continue;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vx *= 0.93;
            p.vy *= 0.93;
            this.particles[w++] = p;
        }
        this.particles.length = w;
        for (const [idx, a] of this.flips) {
            a.age += dt;
            if (a.age >= FLIP_DUR) this.flips.delete(idx);
        }
        let rw = 0;
        for (const rp of this.ripples) {
            rp.age += dt;
            if (rp.age < RIPPLE_DUR) this.ripples[rw++] = rp;
        }
        this.ripples.length = rw;
    }

    /** 当前绘制角度：转动补间中取插值，否则按字符朝向 */
    angleAt(idx, ch) {
        const a = this.flips.get(idx);
        return a ? angleOf(a) : mirrorAngle(ch);
    }

    drawRipples(ctx) {
        ctx.save();
        for (const rp of this.ripples) {
            const k = rp.age / RIPPLE_DUR;
            ctx.globalAlpha = (1 - k) * 0.8;
            ctx.strokeStyle = rp.color;
            ctx.lineWidth = 2.2 * (1 - k) + 0.6;
            ctx.beginPath();
            ctx.arc(rp.x, rp.y, CELL * (0.22 + 0.36 * k), 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }

    drawParticles(ctx) {
        for (const p of this.particles) {
            ctx.globalAlpha = 1 - p.age / p.life;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }
}

/** ease-out 二次补间 */
function angleOf(a) {
    const k = Math.min(1, Math.max(0, a.age / FLIP_DUR));
    const e = 1 - (1 - k) * (1 - k);
    return a.from + (a.to - a.from) * e;
}
