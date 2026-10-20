/**
 * Lumen 画布：DPR 缓冲尺寸 + 每帧合成。只读当前对局（session 的 grid / trace），
 * 自己只持有纯视觉状态（星空、动画时钟、Effects），不参与任何判定。
 */
import { GRID_N } from '../model/beam.js';
import { H, W } from './geometry.js';
import { Effects } from './effects.js';
import {
    drawBackdrop, drawCrystal, drawEmitter, drawGridLines, drawLinkRing, drawLinkTethers,
    drawLitFloor, drawMirror, drawRays, drawShadow, drawSplitter, drawWall,
} from './pieces.js';

const EMITTERS = '><v^';

function buildStarfield() {
    const out = [];
    for (let i = 0; i < 70; i++) {
        out.push({
            x: Math.random() * W,
            y: Math.random() * H,
            r: 0.5 + Math.random() * 1.1,
            a: 0.15 + Math.random() * 0.5,
        });
    }
    return out;
}

export class BoardRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.renderScale = 1;
        this.time = 0;
        this.stars = buildStarfield();
        this.effects = new Effects();
        this.links = [];
        this.groupOf = new Map();   // 联动镜 idx → 组号
        this.split = new Set();     // 分光镜 idx
    }

    /** 换关：重建元件查表、清掉上一关的特效 */
    setLevel(level) {
        this.links = level.links || [];
        this.groupOf = new Map();
        this.links.forEach((group, gi) => group.forEach(idx => this.groupOf.set(idx, gi)));
        this.split = new Set(level.split || []);
        this.effects.clear();
    }

    /** 重开本关：盘面回到初盘，残留的补间 / 粒子一并清掉 */
    clearEffects() {
        this.effects.clear();
    }

    /** 一次点击的视觉反馈（转动补间 + 涟漪），由 session.tap() 的事件驱动 */
    animateTap(event, after) {
        this.effects.tap(event.cells, event.before, after, idx => this.groupOf.get(idx));
    }

    burst(cells, kind) {
        this.effects.burst(cells, kind);
    }

    /** 后端缓冲 = CSS 宽 × min(DPR, 2)；逻辑坐标始终是 560×560 */
    resize() {
        const cssW = this.canvas.clientWidth || 300;
        const renderScale = cssW / W * Math.min(window.devicePixelRatio || 1, 2);
        const pw = Math.round(W * renderScale);
        if (this.canvas.width !== pw) {
            this.canvas.width = pw;
            this.canvas.height = Math.round(H * renderScale);
        }
        this.renderScale = renderScale;
    }

    update(dt) {
        this.time += dt;
        this.effects.update(dt);
    }

    /** view = { grid, trace }（PlaySession） */
    draw(view) {
        const ctx = this.ctx;
        const s = this.renderScale;
        const time = this.time;
        ctx.setTransform(s, 0, 0, s, 0, 0);
        ctx.clearRect(0, 0, W, H);
        drawBackdrop(ctx, this.stars, time);
        if (!view) return;
        const { grid, trace } = view;

        drawGridLines(ctx);
        drawLitFloor(ctx, trace.lit);
        drawLinkTethers(ctx, this.links, time);
        drawRays(ctx, trace.rays, time);

        // 元件（墙 → 水晶 / 暗晶 → 镜面 → 发射器）
        const crystalLit = new Set(trace.crystalLit);
        const shadowLit = new Set(trace.shadowLit);
        const mirrorHit = new Set(trace.mirrorHits);
        for (let r = 0; r < GRID_N; r++) {
            for (let c = 0; c < GRID_N; c++) {
                if (grid[r][c] === '#') drawWall(ctx, r, c);
            }
        }
        for (let r = 0; r < GRID_N; r++) {
            for (let c = 0; c < GRID_N; c++) {
                const ch = grid[r][c];
                const idx = r * GRID_N + c;
                if (ch === '*') drawCrystal(ctx, r, c, crystalLit.has(idx), time);
                else if (ch === 'x') drawShadow(ctx, r, c, shadowLit.has(idx), time);
            }
        }
        for (let r = 0; r < GRID_N; r++) {
            for (let c = 0; c < GRID_N; c++) {
                const ch = grid[r][c];
                const idx = r * GRID_N + c;
                if (ch === '/' || ch === '\\') {
                    const angle = this.effects.angleAt(idx, ch);
                    if (this.split.has(idx)) drawSplitter(ctx, r, c, angle, mirrorHit.has(idx));
                    else drawMirror(ctx, r, c, angle, mirrorHit.has(idx));
                    const group = this.groupOf.get(idx);
                    if (group !== undefined) drawLinkRing(ctx, r, c, group);
                } else if (EMITTERS.includes(ch)) {
                    drawEmitter(ctx, r, c, ch);
                }
            }
        }

        this.effects.drawRipples(ctx);
        this.effects.drawParticles(ctx);
    }
}
