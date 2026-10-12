/**
 * 画牢 Loop Jail — Canvas 渲染（只读模拟状态；粒子 / 飘字 / 闪光 / 震屏是本层自己的视觉状态）
 * ===================================================================================
 * 坐标：模拟在「世界坐标」里跑（面积恒定、宽高比跟舞台），这里把世界等比缩放进画布并居中，
 * 画布后备缓冲 = CSS 尺寸 × min(dpr, 2)。命中换算 worldFromClient() 与绘制共用同一个变换。
 *
 * 调色板：颜色只在 css/loop-jail.css 里定义一次（--lj-cv-*），bindPalette 主题切换时就地刷新。
 * 深色是霓虹：发光层走 'lighter' 加色混合；浅色是「白纸蓝墨」：调色板把混合改成 source-over、
 * 降低发光强度 —— 绘制代码里不散落 if (light)。
 */
import { bindPalette } from '../../platform/theme.js';
import { PEN_RADIUS, POWERUP_RADIUS, SPAWN_TIME, TWIN_OFFSET } from './simulation.js';

const PALETTE = {
    bg: '--lj-cv-bg',
    bgEdge: '--lj-cv-bg-edge',
    grid: '--lj-cv-grid',
    gridStrong: '--lj-cv-grid-strong',
    border: '--lj-cv-border',
    ink: '--lj-cv-ink',
    inkCore: '--lj-cv-ink-core',
    twin: '--lj-cv-twin',
    dry: '--lj-cv-dry',
    circle: '--lj-cv-circle',
    triangle: '--lj-cv-triangle',
    square: '--lj-cv-square',
    eye: '--lj-cv-eye',
    pen: '--lj-cv-pen',
    penRing: '--lj-cv-pen-ring',
    flash: '--lj-cv-flash',
    bite: '--lj-cv-bite',
    text: '--lj-cv-text',
    double: '--lj-cv-double',
    shield: '--lj-cv-shield',
    inkdrop: '--lj-cv-inkdrop',
    blend: '--lj-cv-blend',
    glow: '--lj-cv-glow',
    vignette: '--lj-cv-vignette',
};
const GRID = 30;
const MAX_PARTICLES = 420;

export function createRenderer(canvas, { getSim, reducedMotion = () => false } = {}) {
    const ctx = canvas.getContext('2d');
    const bgCanvas = document.createElement('canvas');
    const bgCtx = bgCanvas.getContext('2d');
    let bgDirty = true;
    const P = bindPalette(PALETTE, { onChange: () => { bgDirty = true; draw(); } });
    const view = { cssW: 1, cssH: 1, dpr: 1, scale: 1, ox: 0, oy: 0 };
    const fx = { particles: [], flashes: [], bites: [], rings: [], floaters: [], shake: 0, shakeT: 0 };
    let clock = 0;
    // 主题切换回调里的重画不知道当前是否在游玩，沿用上一次的状态（菜单里不画笔尖）
    let lastPlaying = false;

    const glow = () => Math.max(0, Number.parseFloat(P.glow) || 0);
    const blend = () => (P.blend === 'lighter' ? 'lighter' : 'source-over');
    const colorFor = type => (type === 'circle' ? P.circle : type === 'triangle' ? P.triangle : P.square);
    const kindColor = kind => (kind === 'double' ? P.double : kind === 'shield' ? P.shield : P.inkdrop);

    function resize() {
        const cssW = Math.max(1, canvas.clientWidth);
        const cssH = Math.max(1, canvas.clientHeight);
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const bw = Math.round(cssW * dpr);
        const bh = Math.round(cssH * dpr);
        if (canvas.width !== bw || canvas.height !== bh) {
            canvas.width = bw;
            canvas.height = bh;
        }
        Object.assign(view, { cssW, cssH, dpr });
        layout();
        bgDirty = true;
        return { cssW, cssH };
    }

    function layout() {
        const sim = getSim();
        const scale = Math.min(view.cssW / sim.w, view.cssH / sim.h);
        view.scale = scale;
        view.ox = (view.cssW - sim.w * scale) / 2;
        view.oy = (view.cssH - sim.h * scale) / 2;
    }

    function worldFromClient(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (clientX - rect.left - view.ox) / view.scale,
            y: (clientY - rect.top - view.oy) / view.scale,
        };
    }

    /** worldFromClient 的逆变换（冒烟测试用真实指针坐标画环；两者共用同一份 view） */
    function clientFromWorld(x, y) {
        const rect = canvas.getBoundingClientRect();
        return { x: rect.left + view.ox + x * view.scale, y: rect.top + view.oy + y * view.scale };
    }

    /* ── 背景缓存：底色 + 细网格 + 场地边框（尺寸 / 主题变了才重画） ── */
    function paintBackground() {
        const sim = getSim();
        if (bgCanvas.width !== canvas.width || bgCanvas.height !== canvas.height) {
            bgCanvas.width = canvas.width;
            bgCanvas.height = canvas.height;
        }
        const g = bgCtx;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalAlpha = 1;
        g.fillStyle = P.bgEdge;
        g.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
        const k = view.dpr * view.scale;
        g.setTransform(k, 0, 0, k, view.dpr * view.ox, view.dpr * view.oy);
        g.fillStyle = P.bg;
        g.fillRect(0, 0, sim.w, sim.h);
        g.lineWidth = 1 / view.scale;
        const cols = Math.ceil(sim.w / GRID);
        const rows = Math.ceil(sim.h / GRID);
        const cx = (sim.w - cols * GRID) / 2;
        const cy = (sim.h - rows * GRID) / 2;
        for (let pass = 0; pass < 2; pass++) {
            g.strokeStyle = pass ? P.gridStrong : P.grid;
            g.beginPath();
            for (let i = 0; i <= cols; i++) {
                if ((i % 4 === 0) !== (pass === 1)) continue;
                const x = cx + i * GRID;
                g.moveTo(x, 0);
                g.lineTo(x, sim.h);
            }
            for (let j = 0; j <= rows; j++) {
                if ((j % 4 === 0) !== (pass === 1)) continue;
                const y = cy + j * GRID;
                g.moveTo(0, y);
                g.lineTo(sim.w, y);
            }
            g.stroke();
        }
        // 四周压暗一点，把视线收向场地中心（颜色取自底边色，浅色下自然变淡）
        const vign = g.createRadialGradient(sim.w / 2, sim.h / 2, Math.min(sim.w, sim.h) * 0.35,
            sim.w / 2, sim.h / 2, Math.hypot(sim.w, sim.h) * 0.62);
        vign.addColorStop(0, 'rgba(0,0,0,0)');
        vign.addColorStop(1, P.bgEdge);
        g.globalAlpha = Math.max(0, Math.min(1, Number.parseFloat(P.vignette) || 0));
        g.fillStyle = vign;
        g.fillRect(0, 0, sim.w, sim.h);
        g.globalAlpha = 1;
        g.strokeStyle = P.border;
        g.lineWidth = 2 / view.scale;
        g.strokeRect(1 / view.scale, 1 / view.scale, sim.w - 2 / view.scale, sim.h - 2 / view.scale);
        bgDirty = false;
    }

    /* ── 事件 → 视觉效果 ── */
    function burst(x, y, color, n, speed = 160, life = 0.7, size = 2.6) {
        for (let i = 0; i < n && fx.particles.length < MAX_PARTICLES; i++) {
            const a = Math.random() * Math.PI * 2;
            const v = speed * (0.35 + Math.random() * 0.75);
            fx.particles.push({
                x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
                life: life * (0.6 + Math.random() * 0.5), max: life, color,
                size: size * (0.6 + Math.random() * 0.7),
            });
        }
    }

    function shake(amount) {
        if (reducedMotion()) return;
        fx.shake = Math.max(fx.shake, amount);
        fx.shakeT = 0.28;
    }

    function floater(x, y, text, color, size = 18, life = 1) {
        fx.floaters.push({ x, y, text, color, size, life, max: life });
    }

    function ring(x, y, color, r0, r1, life = 0.45, width = 3) {
        fx.rings.push({ x, y, color, r0, r1, life, max: life, width });
    }

    function handle(events, text) {
        const sim = getSim();
        for (const e of events) {
            if (e.type === 'capture') {
                fx.flashes.push({ poly: e.poly, life: 0.5, max: 0.5, twin: e.twin });
                if (e.count > 0) {
                    for (const m of e.caught) burst(m.x, m.y, colorFor(m.type), 16, 190, 0.8, 3);
                    floater(e.x, e.y, '+' + e.score, P.text, 20 + Math.min(10, e.count * 2), 1.1);
                    if (e.count > 1) floater(e.x, e.y + 22, text.combo.replace('{n}', e.count), P.inkdrop, 13, 1.1);
                } else {
                    burst(e.x, e.y, P.ink, 10, 70, 0.5, 2);
                }
            } else if (e.type === 'bite') {
                fx.bites.push({ points: e.points, life: 0.38, max: 0.38 });
                burst(e.x, e.y, P.bite, 12, 150, 0.5, 2.4);
                shake(5);
            } else if (e.type === 'shieldBlock') {
                ring(e.x, e.y, P.shield, 6, 34, 0.45, 3);
                burst(e.x, e.y, colorFor(e.monster.type), 14, 170, 0.7, 2.8);
                floater(e.x, e.y - 8, '+' + e.score, P.shield, 16, 0.9);
            } else if (e.type === 'hit') {
                ring(e.x, e.y, P.bite, PEN_RADIUS, 46, 0.5, 4);
                burst(e.x, e.y, P.bite, 18, 200, 0.6, 2.6);
                shake(8);
            } else if (e.type === 'pickup') {
                ring(e.x, e.y, kindColor(e.kind), 8, 40, 0.5, 3);
                burst(e.x, e.y, kindColor(e.kind), 12, 140, 0.6, 2.4);
                floater(e.x, e.y - 18, text.powerups[e.kind], kindColor(e.kind), 14, 1.2);
            } else if (e.type === 'split') {
                ring(e.x, e.y, P.square, 4, 22, 0.35, 2);
            } else if (e.type === 'inkEmpty') {
                floater(sim.pen.x, sim.pen.y - 22, text.inkEmpty, P.dry, 13, 1);
            } else if (e.type === 'powerupSpawn') {
                ring(e.x, e.y, kindColor(e.kind), 30, 10, 0.5, 2);
            }
        }
    }

    function updateFx(dt) {
        clock += dt;
        const decay = (list) => {
            for (let i = list.length - 1; i >= 0; i--) {
                list[i].life -= dt;
                if (list[i].life <= 0) list.splice(i, 1);
            }
        };
        for (const p of fx.particles) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            const drag = Math.max(0, 1 - dt * 3.2);
            p.vx *= drag;
            p.vy *= drag;
        }
        for (const f of fx.floaters) f.y -= 38 * dt;
        decay(fx.particles);
        decay(fx.flashes);
        decay(fx.bites);
        decay(fx.rings);
        decay(fx.floaters);
        if (fx.shakeT > 0) {
            fx.shakeT = Math.max(0, fx.shakeT - dt);
            if (fx.shakeT === 0) fx.shake = 0;
        }
    }

    function isAnimating() {
        return fx.particles.length + fx.flashes.length + fx.bites.length
            + fx.rings.length + fx.floaters.length > 0 || fx.shakeT > 0;
    }

    function clearFx() {
        fx.particles.length = 0;
        fx.flashes.length = 0;
        fx.bites.length = 0;
        fx.rings.length = 0;
        fx.floaters.length = 0;
        fx.shake = 0;
        fx.shakeT = 0;
    }

    /* ── 绘制 ── */
    function tracePath(points, tail) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        if (tail) ctx.lineTo(tail.x, tail.y);
    }

    function neonStroke(color, core, width, alpha = 1) {
        const gl = glow();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (gl > 0) {
            ctx.globalCompositeOperation = blend();
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.13 * gl * alpha;
            ctx.lineWidth = width * 4.2;
            ctx.stroke();
            ctx.globalAlpha = 0.3 * gl * alpha;
            ctx.lineWidth = width * 2.2;
            ctx.stroke();
            ctx.globalCompositeOperation = 'source-over';
        }
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.stroke();
        if (core) {
            ctx.strokeStyle = core;
            ctx.globalAlpha = 0.85 * alpha;
            ctx.lineWidth = width * 0.42;
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    function drawStrokes(sim) {
        for (const s of sim.strokes) {
            const live = s.live && !s.twin && sim.active.main === s && sim.pen.down;
            if (s.points.length < 2 && !live) continue;
            tracePath(s.points, live ? sim.pen : null);
            neonStroke(s.twin ? P.twin : P.ink, P.inkCore, 2.6, s.live ? 1 : 0.86);
        }
    }

    function drawEyes(m, size) {
        // 方块自转，眼睛却看向前进方向；圆 / 三角的 angle 本来就是朝向
        const dir = m.type === 'square' ? Math.atan2(m.vy, m.vx) : m.angle;
        const ex = Math.cos(dir) * size * 0.28;
        const ey = Math.sin(dir) * size * 0.28;
        const px = -Math.sin(dir) * size * 0.32;
        const py = Math.cos(dir) * size * 0.32;
        ctx.fillStyle = P.eye;
        ctx.globalAlpha = 0.95;
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.arc(m.x + ex + px * side, m.y + ey + py * side, Math.max(1.2, size * 0.13), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function shapePath(m, size) {
        ctx.beginPath();
        if (m.type === 'circle') {
            ctx.arc(m.x, m.y, size, 0, Math.PI * 2);
        } else if (m.type === 'triangle') {
            for (let i = 0; i < 3; i++) {
                const a = m.angle + (i * Math.PI * 2) / 3;
                const x = m.x + Math.cos(a) * size * 1.12;
                const y = m.y + Math.sin(a) * size * 1.12;
                if (i) ctx.lineTo(x, y);
                else ctx.moveTo(x, y);
            }
            ctx.closePath();
        } else {
            const h = size * 0.8;
            const c = Math.cos(m.angle);
            const s = Math.sin(m.angle);
            const corners = [[-h, -h], [h, -h], [h, h], [-h, h]];
            corners.forEach(([x, y], i) => {
                const px = m.x + x * c - y * s;
                const py = m.y + x * s + y * c;
                if (i) ctx.lineTo(px, py);
                else ctx.moveTo(px, py);
            });
            ctx.closePath();
        }
    }

    function drawMonster(m) {
        const color = colorFor(m.type);
        const appear = m.spawn > 0 ? 1 - m.spawn / (m.spawnMax || SPAWN_TIME) : 1;
        const ease = 1 - (1 - appear) ** 3;
        let size = m.r * (0.3 + 0.7 * ease);
        const alpha = 0.25 + 0.75 * ease;
        if (m.type === 'triangle' && m.state === 'charge') {
            // 蓄力：抖动 + 发白 + 指向锁定点的虚线
            size *= 1 + 0.12 * Math.sin(clock * 60);
            ctx.save();
            ctx.setLineDash([5, 6]);
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.45;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(m.x, m.y);
            ctx.lineTo(m.target.x, m.target.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(m.target.x, m.target.y, 7, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
        if (m.type === 'triangle' && m.state === 'dash') {
            for (let k = 3; k >= 1; k--) {
                const ghost = { ...m, x: m.x - m.vx * 0.018 * k, y: m.y - m.vy * 0.018 * k };
                shapePath(ghost, size);
                ctx.globalAlpha = 0.12 * (4 - k) * glow() + 0.05;
                ctx.fillStyle = color;
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }
        shapePath(m, size);
        const gl = glow();
        if (gl > 0) {
            ctx.globalCompositeOperation = blend();
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.2 * gl * alpha;
            ctx.lineWidth = 9;
            ctx.stroke();
            ctx.globalCompositeOperation = 'source-over';
        }
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.28 * alpha;
        ctx.fill();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = m.type === 'triangle' && m.state === 'charge' && Math.sin(clock * 40) > 0 ? P.flash : color;
        ctx.lineWidth = 2.4;
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (appear >= 1) drawEyes(m, size);
    }

    function drawPowerup(p) {
        const color = kindColor(p.kind);
        const bob = 1 + 0.07 * Math.sin(p.age * 4);
        const size = POWERUP_RADIUS * bob;
        const spin = p.age * 1.6;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.save();
        ctx.rotate(Math.PI / 4 + Math.sin(spin) * 0.35);
        ctx.beginPath();
        ctx.rect(-size * 0.78, -size * 0.78, size * 1.56, size * 1.56);
        const gl = glow();
        if (gl > 0) {
            ctx.globalCompositeOperation = blend();
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.24 * gl;
            ctx.lineWidth = 9;
            ctx.stroke();
            ctx.globalCompositeOperation = 'source-over';
        }
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.2;
        ctx.stroke();
        ctx.restore();
        // 图标：双线 = 两道平行线；护盾 = 盾形弧；墨水瓶 = 水滴
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        if (p.kind === 'double') {
            ctx.moveTo(-5, 3.5); ctx.lineTo(3.5, -5);
            ctx.moveTo(-3.5, 5); ctx.lineTo(5, -3.5);
            ctx.stroke();
        } else if (p.kind === 'shield') {
            ctx.moveTo(0, -6); ctx.lineTo(5.2, -3.6); ctx.lineTo(4.4, 2); ctx.lineTo(0, 6);
            ctx.lineTo(-4.4, 2); ctx.lineTo(-5.2, -3.6); ctx.closePath();
            ctx.stroke();
        } else {
            ctx.moveTo(0, -6.5);
            ctx.bezierCurveTo(4.5, -1, 5, 1.5, 5, 2.4);
            ctx.arc(0, 2.4, 5, 0, Math.PI);
            ctx.bezierCurveTo(-5, 1.5, -4.5, -1, 0, -6.5);
            ctx.fill();
        }
        ctx.restore();
    }

    function drawPen(sim, playing) {
        const pen = sim.pen;
        if (!pen.placed || (!playing && !pen.down)) return;
        const blink = pen.invuln > 0 && Math.floor(pen.invuln * 10) % 2 === 0;
        const alpha = blink ? 0.3 : 1;
        if (sim.effects.shield > 0) {
            ctx.save();
            ctx.translate(pen.x, pen.y);
            ctx.rotate(clock * 1.4);
            ctx.setLineDash([6, 5]);
            ctx.strokeStyle = P.shield;
            ctx.globalAlpha = 0.85 * (sim.effects.shield < 2 ? 0.5 + 0.5 * Math.sin(clock * 18) : 1);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, PEN_RADIUS + 9, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
        if (sim.effects.double > 0) {
            const tx = pen.x + pen.dirY * TWIN_OFFSET;
            const ty = pen.y - pen.dirX * TWIN_OFFSET;
            ctx.globalAlpha = 0.8 * alpha;
            ctx.fillStyle = P.twin;
            ctx.beginPath();
            ctx.arc(tx, ty, 3, 0, Math.PI * 2);
            ctx.fill();
        }
        const ringColor = pen.down && pen.dry ? P.dry : P.penRing;
        ctx.beginPath();
        ctx.arc(pen.x, pen.y, PEN_RADIUS + (pen.down ? 1.5 + Math.sin(clock * 12) * 0.8 : 0), 0, Math.PI * 2);
        neonStroke(ringColor, null, 2, 0.9 * alpha);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = P.pen;
        ctx.beginPath();
        ctx.arc(pen.x, pen.y, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    function drawFx() {
        for (const f of fx.flashes) {
            const t = f.life / f.max;
            tracePath(f.poly);
            ctx.closePath();
            ctx.globalAlpha = 0.55 * t;
            ctx.fillStyle = P.flash;
            ctx.fill();
            neonStroke(f.twin ? P.twin : P.ink, P.inkCore, 2.6, t);
        }
        for (const b of fx.bites) {
            if (b.points.length < 2) continue;
            tracePath(b.points);
            neonStroke(P.bite, null, 3, b.life / b.max);
        }
        for (const r of fx.rings) {
            const t = 1 - r.life / r.max;
            ctx.beginPath();
            ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * t, 0, Math.PI * 2);
            ctx.globalAlpha = 1 - t;
            ctx.strokeStyle = r.color;
            ctx.lineWidth = r.width;
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = blend();
        for (const p of fx.particles) {
            ctx.globalAlpha = Math.max(0, p.life / p.max);
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const f of fx.floaters) {
            const t = f.life / f.max;
            ctx.globalAlpha = Math.min(1, t * 1.6);
            ctx.font = `800 ${f.size}px system-ui, -apple-system, "Segoe UI", "PingFang SC", sans-serif`;
            ctx.fillStyle = f.color;
            ctx.fillText(f.text, f.x, f.y);
        }
        ctx.globalAlpha = 1;
    }

    function draw({ playing = lastPlaying } = {}) {
        lastPlaying = playing;
        const sim = getSim();
        layout();
        if (bgDirty) paintBackground();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(bgCanvas, 0, 0);
        let sx = 0;
        let sy = 0;
        if (fx.shakeT > 0) {
            const k = fx.shake * (fx.shakeT / 0.28);
            sx = (Math.random() * 2 - 1) * k;
            sy = (Math.random() * 2 - 1) * k;
        }
        const k = view.dpr * view.scale;
        ctx.setTransform(k, 0, 0, k, view.dpr * (view.ox + sx), view.dpr * (view.oy + sy));
        drawStrokes(sim);
        for (const p of sim.powerups) drawPowerup(p);
        for (const m of sim.monsters) drawMonster(m);
        drawFx();
        drawPen(sim, playing);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    return {
        palette: P,
        resize,
        worldFromClient,
        clientFromWorld,
        handle,
        update: updateFx,
        draw,
        isAnimating,
        clearFx,
        invalidate() { bgDirty = true; },
    };
}
