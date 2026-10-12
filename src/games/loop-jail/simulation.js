/**
 * 画牢 Loop Jail — 纯模拟层（无 DOM、无 Canvas、无 Date / Math.random）
 * ======================================================================
 * 渲染层（renderer.js）与运行时（runtime.js）只读本模块的状态并消费 drainEvents()
 * 返回的事件；粒子、飘字、闪光、震屏这些纯视觉状态全在渲染层，不进模拟。
 * Node 端的 tests/verify-loop-jail-sim.mjs 直接 import 本文件做几何 / 计分 / 回放校验。
 *
 * 确定性契约：same seed + same input sequence (penDown / movePen / penUp / step(dt))
 *   = same result。随机只来自 mulberry32(seed)（src/platform/daily.js 的全站唯一实现）。
 *
 * 世界坐标（逻辑单位，下文的「px」都指它）：
 *   世界面积恒为 WORLD_AREA，宽高比跟随舞台（钳在 ASPECT_MIN..ASPECT_MAX），
 *   渲染层再整体等比缩放进画布 —— 手机竖屏、桌面、横屏的场地「一样大」，
 *   1500px² 最小闭环、0.045/px 墨水、120px 安全半径在每台设备上手感一致，排行榜也公平。
 *
 * 玩法要点（设计稿：《画牢 Loop Jail》完整制作提示词）：
 *   - 按下即画；墨线与自身相交形成闭环 → 闭环多边形内的小怪全部捕获，然后清掉这条墨线；
 *   - 未闭合的墨线是脆弱的：小怪碰到即整条咬断（护盾期间改为消灭咬线的小怪）；
 *   - 闭环面积 < MIN_LOOP_AREA 视为无意回环，不触发捕获；
 *   - 墨水按长度消耗、随时间回复、捕获返还；耗尽时停笔，已有墨线保留。
 */
import { mulberry32 } from '../../platform/daily.js';

export const WORLD_AREA = 420 * 720;
export const ASPECT_MIN = 0.42;
export const ASPECT_MAX = 2.1;
export const DT_MAX = 0.033;

export const INK_MAX = 100;
export const INK_PER_PX = 0.045;
export const INK_REGEN = 5;
export const INK_PER_CAPTURE = 6;
/** 画到墨水见底后仍按住：回复到这么多才会自动续笔（防止 0.1 墨水的抖动断续） */
export const INK_RESUME = 10;
/** 新起一笔所需的最少墨水 */
export const INK_START = 1;

export const MIN_LOOP_AREA = 1500;
export const MAX_LIVES = 3;
export const INVULN_TIME = 1.6;
export const SPAWN_SAFE_RADIUS = 120;
export const MAX_MONSTERS = 18;
export const WAVE_BREAK = 1.8;
export const SPAWN_TIME = 0.7;
/** 分裂出的小方块：出生保护期（不撞笔尖、不咬线、可被再次圈住） */
export const SPLIT_GRACE = 0.6;

export const PEN_RADIUS = 8;
export const LINE_HALF_WIDTH = 2.5;
/** 笔尖离上一个墨点超过这么远才落下新墨点 */
export const SEGMENT_MIN = 4;
/** 双线笔：第二条线沿行进方向左法线偏移 */
export const TWIN_OFFSET = 16;
/** 按下位置离一条已松开墨线的末端这么近，就接着那条线继续画 */
export const RESUME_RADIUS = 24;

export const POWERUP_INTERVAL = [14, 22];
export const POWERUP_MAX = 2;
export const POWERUP_RADIUS = 13;
export const DOUBLE_TIME = 12;
export const SHIELD_TIME = 10;
export const INK_BOTTLE = 40;
export const POWERUP_KINDS = ['double', 'shield', 'ink'];

export const MONSTERS = {
    circle: { score: 50, r: 11, speed: 76 },
    triangle: { score: 120, r: 13, speed: 38, dash: 430, charge: 0.35, lockMin: 1.5, lockMax: 3, dashMax: 0.75, recover: 0.4 },
    // 方块按尺寸分三级：0 = 大，1 = 中，2 = 小（最小不再分裂）
    square: { scores: [80, 40, 20], radii: [15, 11, 7.5], speed: 30 },
};

/* ── 纯函数：几何 / 计分 / 波次（测试直接覆盖） ── */

/** 第 n 波（从 1 起）的生成数；总数封顶 MAX_MONSTERS，超出部分从圆形里扣 */
export function waveComposition(n) {
    const wave = Math.max(1, Math.floor(n));
    let circles = 3 + wave;
    const triangles = Math.min(wave, 4);
    const squares = Math.min(1 + Math.floor(wave / 2), 4);
    const over = circles + triangles + squares - MAX_MONSTERS;
    if (over > 0) circles -= over;
    return { circles, triangles, squares };
}

/** 单次捕获得分 = (基础分总和 + 闭环面积 ÷ 80) × (1 + 0.5 × (只数 − 1)) */
export function captureScore(baseSum, area, count) {
    if (!(count > 0)) return 0;
    return Math.round((baseSum + area / 80) * (1 + 0.5 * (count - 1)));
}

export function monsterScore(m) {
    return m.type === 'square' ? MONSTERS.square.scores[m.level] : MONSTERS[m.type].score;
}

/** 多边形面积（鞋带公式取绝对值）；pts = [{x,y}, …]，不重复首点 */
export function polygonArea(pts) {
    let sum = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        sum += (pts[j].x * pts[i].y) - (pts[i].x * pts[j].y);
    }
    return Math.abs(sum) / 2;
}

/** 面积质心（退化时退回顶点平均） */
export function polygonCentroid(pts) {
    let a = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const cross = (pts[j].x * pts[i].y) - (pts[i].x * pts[j].y);
        a += cross;
        cx += (pts[j].x + pts[i].x) * cross;
        cy += (pts[j].y + pts[i].y) * cross;
    }
    if (Math.abs(a) < 1e-6) {
        const n = pts.length || 1;
        return {
            x: pts.reduce((s, p) => s + p.x, 0) / n,
            y: pts.reduce((s, p) => s + p.y, 0) / n,
        };
    }
    return { x: cx / (3 * a), y: cy / (3 * a) };
}

/** 奇偶规则点在多边形内（闭环里若夹着无意小回环，回环内部按「外」算，符合直觉） */
export function pointInPolygon(x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i];
        const b = pts[j];
        if ((a.y > y) !== (b.y > y)
            && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
            inside = !inside;
        }
    }
    return inside;
}

/**
 * 线段 ab 与 cd 的交点；共线 / 平行 / 不相交返回 null。
 * t ∈ (0, 1] 落在 ab 上（不含 a，避免新线段在起点处与上一段的端点重复判交），u ∈ [0, 1] 落在 cd 上。
 */
export function segmentIntersection(a, b, c, d) {
    const rx = b.x - a.x;
    const ry = b.y - a.y;
    const sx = d.x - c.x;
    const sy = d.y - c.y;
    const denom = rx * sy - ry * sx;
    if (Math.abs(denom) < 1e-9) return null;
    const qx = c.x - a.x;
    const qy = c.y - a.y;
    const t = (qx * sy - qy * sx) / denom;
    const u = (qx * ry - qy * rx) / denom;
    if (t <= 1e-9 || t > 1 || u < 0 || u > 1) return null;
    return { x: a.x + rx * t, y: a.y + ry * t, t, u };
}

export function distToSegmentSq(px, py, a, b) {
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const len = vx * vx + vy * vy;
    let t = len > 0 ? ((px - a.x) * vx + (py - a.y) * vy) / len : 0;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    const dx = a.x + vx * t - px;
    const dy = a.y + vy * t - py;
    return dx * dx + dy * dy;
}

/**
 * 新落下的线段（stroke 的最后一段）若与这条线更早的线段相交，找出闭环。
 * 从最近的线段往回找，取第一个面积达标的闭环（更早处的无意小回环被略过、但仍算进大环里）。
 * 返回 { poly, area } 或 null。
 */
export function findLoop(points) {
    const k = points.length - 1;
    if (k < 3) return null;
    const a = points[k - 1];
    const b = points[k];
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    for (let i = k - 3; i >= 0; i--) {
        const c = points[i];
        const d = points[i + 1];
        if (Math.max(c.x, d.x) < minX || Math.min(c.x, d.x) > maxX
            || Math.max(c.y, d.y) < minY || Math.min(c.y, d.y) > maxY) continue;
        const hit = segmentIntersection(a, b, c, d);
        if (!hit) continue;
        const poly = [{ x: hit.x, y: hit.y }];
        for (let j = i + 1; j <= k - 1; j++) poly.push(points[j]);
        const area = polygonArea(poly);
        if (area >= MIN_LOOP_AREA) return { poly, area };
    }
    return null;
}

const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));

export function worldSize(aspect) {
    const a = clamp(Number.isFinite(aspect) && aspect > 0 ? aspect : 420 / 720, ASPECT_MIN, ASPECT_MAX);
    const w = Math.sqrt(WORLD_AREA * a);
    return { w, h: WORLD_AREA / w };
}

/* ── 模拟 ── */

export class LoopJailSim {
    constructor({ seed = 1, aspect = 420 / 720 } = {}) {
        const { w, h } = worldSize(aspect);
        this.w = w;
        this.h = h;
        this.reset(seed);
    }

    reset(seed = 1) {
        this.seed = seed >>> 0;
        this.rng = mulberry32(this.seed);
        this.nextId = 1;
        this.time = 0;
        this.score = 0;
        this.wave = 0;
        this.lives = MAX_LIVES;
        this.ink = INK_MAX;
        this.over = false;
        this.phase = 'wave';
        this.phaseTimer = 0;
        this.monsters = [];
        this.strokes = [];
        this.powerups = [];
        this.effects = { double: 0, shield: 0 };
        // placed：玩家第一次按下 / 鼠标移入之前，笔尖还没上场 —— 不会被撞、三角不锁定、不拾取道具
        //（触屏玩家还没碰屏幕就被冲刺扣血是不公平的；一旦上场，停着不动照样会被猎杀）
        this.pen = { x: this.w / 2, y: this.h * 0.62, down: false, invuln: 0, dirX: 1, dirY: 0, dry: false, placed: false };
        this.active = { main: null, twin: null };
        this.nextPowerup = this.range(POWERUP_INTERVAL[0], POWERUP_INTERVAL[1]);
        this.stats = { captured: 0, loops: 0, bestCombo: 0, bites: 0, hits: 0, inkUsed: 0 };
        this.events = [];
        this.startWave(1);
    }

    range(lo, hi) { return lo + (hi - lo) * this.rng(); }

    emit(event) { this.events.push(event); }

    drainEvents() {
        const out = this.events;
        this.events = [];
        return out;
    }

    /** 舞台改变宽高比（转屏 / 窗口缩放）：保持世界面积，所有坐标按比例搬过去 */
    resize(aspect) {
        const { w, h } = worldSize(aspect);
        const sx = w / this.w;
        const sy = h / this.h;
        if (Math.abs(sx - 1) < 1e-6 && Math.abs(sy - 1) < 1e-6) return false;
        this.w = w;
        this.h = h;
        const move = p => { p.x *= sx; p.y *= sy; };
        for (const m of this.monsters) {
            move(m);
            if (m.target) move(m.target);
        }
        for (const s of this.strokes) s.points.forEach(move);
        this.powerups.forEach(move);
        move(this.pen);
        return true;
    }

    /* ── 输入（与 step 交错调用；坐标均为世界坐标） ── */

    penDown(x, y) {
        if (this.over) return;
        const pen = this.pen;
        pen.x = clamp(x, 0, this.w);
        pen.y = clamp(y, 0, this.h);
        pen.placed = true;
        pen.down = true;
        pen.dry = false;
        if (this.ink < INK_START) {
            pen.dry = true;
            return;
        }
        // 接着画：离按下点最近、且末端足够近的一条已松开主墨线
        let resume = null;
        let best = RESUME_RADIUS * RESUME_RADIUS;
        for (const s of this.strokes) {
            if (s.twin || s.live) continue;
            const tail = s.points[s.points.length - 1];
            const d = (tail.x - pen.x) ** 2 + (tail.y - pen.y) ** 2;
            if (d <= best) { best = d; resume = s; }
        }
        if (resume) {
            resume.live = true;
            this.active.main = resume;
            this.emit({ type: 'resume', id: resume.id });
            this.extendMain(pen.x, pen.y);
        } else {
            this.active.main = this.newStroke(pen.x, pen.y, false);
        }
    }

    movePen(x, y) {
        if (this.over) return;
        const pen = this.pen;
        const nx = clamp(x, 0, this.w);
        const ny = clamp(y, 0, this.h);
        pen.placed = true;
        if (!pen.down) {
            pen.x = nx;
            pen.y = ny;
            return;
        }
        // 按住时把长位移切成小段，保证闭环判定与墨水扣减逐段进行
        const dx = nx - pen.x;
        const dy = ny - pen.y;
        const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 12));
        const ox = pen.x;
        const oy = pen.y;
        for (let i = 1; i <= steps && !this.over; i++) {
            pen.x = ox + dx * (i / steps);
            pen.y = oy + dy * (i / steps);
            if (!this.active.main) {
                if (this.ink >= (pen.dry ? INK_RESUME : INK_START)) {
                    pen.dry = false;
                    this.active.main = this.newStroke(pen.x, pen.y, false);
                }
                continue;
            }
            this.extendMain(pen.x, pen.y);
        }
    }

    penUp() {
        const pen = this.pen;
        pen.down = false;
        pen.dry = false;
        this.release();
    }

    release() {
        for (const key of ['main', 'twin']) {
            const s = this.active[key];
            if (!s) continue;
            s.live = false;
            this.active[key] = null;
            // 只有一个点的笔触不留在场上
            if (s.points.length < 2) this.removeStroke(s);
        }
    }

    newStroke(x, y, twin) {
        const s = { id: this.nextId++, twin, live: true, points: [{ x, y }] };
        this.strokes.push(s);
        return s;
    }

    removeStroke(s) {
        const i = this.strokes.indexOf(s);
        if (i >= 0) this.strokes.splice(i, 1);
        if (this.active.main === s) this.active.main = null;
        if (this.active.twin === s) this.active.twin = null;
    }

    extendMain(x, y) {
        const s = this.active.main;
        const last = s.points[s.points.length - 1];
        let dx = x - last.x;
        let dy = y - last.y;
        let len = Math.hypot(dx, dy);
        if (len < SEGMENT_MIN) return;
        const cost = len * INK_PER_PX;
        let ranDry = false;
        if (cost > this.ink) {
            const allowed = this.ink / INK_PER_PX;
            dx *= allowed / len;
            dy *= allowed / len;
            len = allowed;
            ranDry = true;
        }
        this.ink = ranDry ? 0 : this.ink - cost;
        this.stats.inkUsed += len * INK_PER_PX;
        if (len > 1e-6) {
            // 平滑行进方向：双线笔的法线随它走，急转弯时第二条线不会来回乱跳
            const ux = dx / len;
            const uy = dy / len;
            const pen = this.pen;
            const mx = pen.dirX * 0.55 + ux * 0.45;
            const my = pen.dirY * 0.55 + uy * 0.45;
            const ml = Math.hypot(mx, my) || 1;
            pen.dirX = mx / ml;
            pen.dirY = my / ml;
            const pt = { x: last.x + dx, y: last.y + dy };
            s.points.push(pt);
            const twinFrom = this.effects.double > 0 ? last : null;
            const loop = findLoop(s.points);
            if (loop) this.capture(s, loop);
            if (twinFrom) this.extendTwin(twinFrom, pt);
        }
        if (ranDry) {
            this.pen.dry = true;
            this.emit({ type: 'inkEmpty', x: this.pen.x, y: this.pen.y });
            this.release();
        }
    }

    twinPoint(p) {
        // 屏幕坐标 y 向下：(dy, -dx) 是行进方向的左手边
        return {
            x: clamp(p.x + this.pen.dirY * TWIN_OFFSET, 0, this.w),
            y: clamp(p.y - this.pen.dirX * TWIN_OFFSET, 0, this.h),
        };
    }

    extendTwin(from, to) {
        let s = this.active.twin;
        if (!s) {
            const start = this.twinPoint(from);
            s = this.newStroke(start.x, start.y, true);
            this.active.twin = s;
        }
        const pt = this.twinPoint(to);
        const last = s.points[s.points.length - 1];
        if (Math.hypot(pt.x - last.x, pt.y - last.y) < 1) return;
        s.points.push(pt);
        const loop = findLoop(s.points);
        if (loop) this.capture(s, loop);
    }

    /** 闭环成立：捕获环内小怪 → 计分 / 返还墨水 / 方块分裂 → 清掉这条墨线；仍按住则从笔尖续一条新线 */
    capture(stroke, loop) {
        const caught = this.monsters.filter(m => pointInPolygon(m.x, m.y, loop.poly));
        const center = polygonCentroid(loop.poly);
        const baseSum = caught.reduce((sum, m) => sum + monsterScore(m), 0);
        const gained = captureScore(baseSum, loop.area, caught.length);
        this.stats.loops++;
        if (caught.length) {
            this.monsters = this.monsters.filter(m => !caught.includes(m));
            this.score += gained;
            this.ink = Math.min(INK_MAX, this.ink + INK_PER_CAPTURE * caught.length);
            this.stats.captured += caught.length;
            this.stats.bestCombo = Math.max(this.stats.bestCombo, caught.length);
            for (const m of caught) {
                if (m.type === 'square' && m.level < 2) this.splitSquare(m);
            }
        }
        this.emit({
            type: 'capture',
            poly: loop.poly.map(p => ({ x: p.x, y: p.y })),
            area: loop.area,
            x: center.x,
            y: center.y,
            count: caught.length,
            score: gained,
            caught: caught.map(m => ({ type: m.type, level: m.level, x: m.x, y: m.y, r: m.r })),
            twin: stroke.twin,
        });
        const wasLive = stroke.live;
        this.removeStroke(stroke);
        if (wasLive && this.pen.down && !stroke.twin) {
            this.active.main = this.newStroke(this.pen.x, this.pen.y, false);
        }
    }

    /* ── 小怪 ── */

    spawnPoint(r) {
        const margin = Math.max(24, r + 8);
        let best = null;
        let bestD = -1;
        for (let tries = 0; tries < 40; tries++) {
            const x = this.range(margin, this.w - margin);
            const y = this.range(margin, this.h - margin);
            const d = Math.hypot(x - this.pen.x, y - this.pen.y);
            if (d >= SPAWN_SAFE_RADIUS) return { x, y };
            if (d > bestD) { bestD = d; best = { x, y }; }
        }
        // 极端情况（笔尖在小场地正中）兜底：把最远的候选点推到安全半径之外
        const ang = Math.atan2(best.y - this.pen.y, best.x - this.pen.x);
        return {
            x: clamp(this.pen.x + Math.cos(ang) * SPAWN_SAFE_RADIUS, margin, this.w - margin),
            y: clamp(this.pen.y + Math.sin(ang) * SPAWN_SAFE_RADIUS, margin, this.h - margin),
        };
    }

    speedMul() {
        return 1 + Math.min(0.6, 0.05 * (this.wave - 1));
    }

    addMonster(type, level = 0, at = null) {
        const r = type === 'square' ? MONSTERS.square.radii[level] : MONSTERS[type].r;
        const p = at || this.spawnPoint(r);
        const ang = this.range(0, Math.PI * 2);
        const base = type === 'square' ? MONSTERS.square.speed : MONSTERS[type].speed;
        const speed = base * this.speedMul() * this.range(0.85, 1.15);
        const m = {
            id: this.nextId++,
            type,
            level,
            r,
            x: p.x,
            y: p.y,
            vx: Math.cos(ang) * speed,
            vy: Math.sin(ang) * speed,
            speed,
            boost: 1,
            angle: this.range(0, Math.PI * 2),
            spin: type === 'square' ? this.range(-0.9, 0.9) : 0,
            spawn: at ? SPLIT_GRACE : SPAWN_TIME,
            spawnMax: at ? SPLIT_GRACE : SPAWN_TIME,
            // 波次生成的小怪原地显形；分裂出的小方块边弹开边显形
            still: !at,
            state: 'wander',
            timer: type === 'triangle' ? this.range(MONSTERS.triangle.lockMin, MONSTERS.triangle.lockMax) : 0,
            target: null,
        };
        this.monsters.push(m);
        return m;
    }

    splitSquare(parent) {
        const level = parent.level + 1;
        // 随机弹开，但分裂轴不正对笔尖：笔尖刚画完闭环就在环边上，正对着弹会「抓完立刻被撞」
        let ang = this.range(0, Math.PI * 2);
        const toPen = Math.atan2(this.pen.y - parent.y, this.pen.x - parent.x);
        const off = Math.abs(Math.atan2(Math.sin(ang - toPen), Math.cos(ang - toPen)));
        if (off < Math.PI / 4 || off > (Math.PI * 3) / 4) ang = toPen + Math.PI / 2;
        for (let k = 0; k < 2; k++) {
            const a = ang + k * Math.PI;
            const off = MONSTERS.square.radii[level] + 2;
            const child = this.addMonster('square', level, {
                x: clamp(parent.x + Math.cos(a) * off, 8, this.w - 8),
                y: clamp(parent.y + Math.sin(a) * off, 8, this.h - 8),
            });
            child.vx = Math.cos(a) * child.speed;
            child.vy = Math.sin(a) * child.speed;
            child.boost = 3.2; // 随机弹开，再慢慢回到漂移速度
        }
        this.emit({ type: 'split', x: parent.x, y: parent.y, level });
    }

    startWave(n) {
        this.wave = n;
        this.phase = 'wave';
        this.phaseTimer = 0;
        const { circles, triangles, squares } = waveComposition(n);
        for (let i = 0; i < circles; i++) this.addMonster('circle');
        for (let i = 0; i < triangles; i++) this.addMonster('triangle');
        for (let i = 0; i < squares; i++) this.addMonster('square', 0);
        this.emit({ type: 'waveStart', wave: n });
    }

    bounce(m) {
        if (m.x < m.r) { m.x = m.r; m.vx = Math.abs(m.vx); return true; }
        if (m.x > this.w - m.r) { m.x = this.w - m.r; m.vx = -Math.abs(m.vx); return true; }
        if (m.y < m.r) { m.y = m.r; m.vy = Math.abs(m.vy); return true; }
        if (m.y > this.h - m.r) { m.y = this.h - m.r; m.vy = -Math.abs(m.vy); return true; }
        return false;
    }

    moveMonster(m, dt) {
        m.boost += (1 - m.boost) * Math.min(1, dt * 2.2);
        if (m.type === 'triangle') {
            this.moveTriangle(m, dt);
        } else {
            m.x += m.vx * m.boost * dt;
            m.y += m.vy * m.boost * dt;
            if (m.type === 'square') m.angle += m.spin * dt;
            else m.angle = Math.atan2(m.vy, m.vx);
            this.bounce(m);
            this.bounce(m);
        }
    }

    moveTriangle(m, dt) {
        const T = MONSTERS.triangle;
        if (m.state === 'wander') {
            // 缓慢游荡：方向随机缓转
            const turn = (this.rng() - 0.5) * 2.4 * dt;
            const c = Math.cos(turn);
            const s = Math.sin(turn);
            const vx = m.vx * c - m.vy * s;
            const vy = m.vx * s + m.vy * c;
            m.vx = vx;
            m.vy = vy;
            m.x += m.vx * m.boost * dt;
            m.y += m.vy * m.boost * dt;
            m.angle = Math.atan2(m.vy, m.vx);
            this.bounce(m);
            m.timer -= dt;
            if (m.timer <= 0 && !this.pen.placed) {
                m.timer = this.range(T.lockMin, T.lockMax); // 笔尖还没上场：没有可锁定的目标
            } else if (m.timer <= 0) {
                m.state = 'charge';
                m.timer = T.charge;
                m.target = { x: this.pen.x, y: this.pen.y };
                m.angle = Math.atan2(m.target.y - m.y, m.target.x - m.x);
                this.emit({ type: 'charge', id: m.id, x: m.x, y: m.y });
            }
        } else if (m.state === 'charge') {
            m.timer -= dt;
            if (m.timer <= 0) {
                const dx = m.target.x - m.x;
                const dy = m.target.y - m.y;
                const d = Math.hypot(dx, dy) || 1;
                const speed = T.dash * Math.min(1.25, this.speedMul());
                m.vx = (dx / d) * speed;
                m.vy = (dy / d) * speed;
                m.state = 'dash';
                m.timer = Math.min(T.dashMax, d / speed + 0.12);
            }
        } else if (m.state === 'dash') {
            m.x += m.vx * dt;
            m.y += m.vy * dt;
            m.timer -= dt;
            if (this.bounce(m) || m.timer <= 0) this.endDash(m);
        } else {
            // recover：刹车，然后回到游荡
            m.timer -= dt;
            const k = Math.max(0, 1 - dt * 6);
            m.vx *= k;
            m.vy *= k;
            m.x += m.vx * dt;
            m.y += m.vy * dt;
            this.bounce(m);
            if (m.timer <= 0) this.toWander(m);
        }
    }

    endDash(m) {
        m.state = 'recover';
        m.timer = MONSTERS.triangle.recover;
        m.target = null;
    }

    toWander(m) {
        const T = MONSTERS.triangle;
        const ang = Math.atan2(m.vy, m.vx) || this.range(0, Math.PI * 2);
        m.vx = Math.cos(ang) * m.speed;
        m.vy = Math.sin(ang) * m.speed;
        m.state = 'wander';
        m.timer = this.range(T.lockMin, T.lockMax);
        m.target = null;
    }

    /* ── 碰撞 ── */

    touchesStroke(m, s) {
        const reach = m.r + LINE_HALF_WIDTH;
        const reachSq = reach * reach;
        const pts = s.points;
        for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i];
            const b = pts[i + 1];
            if (Math.max(a.x, b.x) < m.x - reach || Math.min(a.x, b.x) > m.x + reach
                || Math.max(a.y, b.y) < m.y - reach || Math.min(a.y, b.y) > m.y + reach) continue;
            if (distToSegmentSq(m.x, m.y, a, b) <= reachSq) return true;
        }
        return false;
    }

    resolveBites() {
        for (const m of [...this.monsters]) {
            if (m.spawn > 0 || !this.monsters.includes(m)) continue;
            for (const s of [...this.strokes]) {
                if (s.points.length < 2 || !this.touchesStroke(m, s)) continue;
                if (this.effects.shield > 0) {
                    // 护盾：墨线不断，咬线的小怪直接被消灭（不分裂）
                    this.effects.shield = 0;
                    const gained = monsterScore(m);
                    this.score += gained;
                    this.monsters = this.monsters.filter(x => x !== m);
                    this.stats.captured++;
                    this.emit({ type: 'shieldBlock', x: m.x, y: m.y, score: gained, monster: { type: m.type, level: m.level, r: m.r } });
                    break;
                }
                const wasLive = s.live;
                this.stats.bites++;
                this.emit({ type: 'bite', x: m.x, y: m.y, points: s.points.map(p => ({ x: p.x, y: p.y })), twin: s.twin });
                this.removeStroke(s);
                if (wasLive && this.pen.down && !s.twin && this.ink >= INK_START) {
                    this.active.main = this.newStroke(this.pen.x, this.pen.y, false);
                }
            }
        }
    }

    resolvePen() {
        const pen = this.pen;
        if (pen.invuln > 0 || !pen.placed) return;
        for (const m of this.monsters) {
            if (m.spawn > 0) continue;
            const dx = m.x - pen.x;
            const dy = m.y - pen.y;
            const d = Math.hypot(dx, dy);
            if (d >= PEN_RADIUS + m.r) continue;
            this.lives--;
            this.stats.hits++;
            pen.invuln = INVULN_TIME;
            // 击退：沿笔尖 → 小怪方向推开
            const ux = d > 1e-6 ? dx / d : 1;
            const uy = d > 1e-6 ? dy / d : 0;
            m.x = clamp(pen.x + ux * (PEN_RADIUS + m.r + 4), m.r, this.w - m.r);
            m.y = clamp(pen.y + uy * (PEN_RADIUS + m.r + 4), m.r, this.h - m.r);
            m.vx = ux * m.speed;
            m.vy = uy * m.speed;
            m.boost = m.type === 'triangle' ? 4 : 2.6;
            if (m.type === 'triangle') this.toWander(m);
            this.emit({ type: 'hit', x: pen.x, y: pen.y, lives: this.lives });
            if (this.lives <= 0) {
                this.lives = 0;
                this.over = true;
                this.penUp();
                this.emit({ type: 'gameOver', score: this.score, wave: this.wave });
            }
            return;
        }
    }

    /* ── 道具 ── */

    spawnPowerup() {
        const margin = 36;
        let p = null;
        for (let tries = 0; tries < 30; tries++) {
            const x = this.range(margin, this.w - margin);
            const y = this.range(margin, this.h - margin);
            if (Math.hypot(x - this.pen.x, y - this.pen.y) < 90) continue;
            if (this.powerups.some(o => Math.hypot(o.x - x, o.y - y) < 48)) continue;
            p = { x, y };
            break;
        }
        if (!p) return;
        const kind = POWERUP_KINDS[Math.floor(this.rng() * POWERUP_KINDS.length) % POWERUP_KINDS.length];
        this.powerups.push({ id: this.nextId++, kind, x: p.x, y: p.y, age: 0 });
        this.emit({ type: 'powerupSpawn', kind, x: p.x, y: p.y });
    }

    applyPowerup(p) {
        if (p.kind === 'double') this.effects.double = DOUBLE_TIME;
        else if (p.kind === 'shield') this.effects.shield = SHIELD_TIME;
        else this.ink = Math.min(INK_MAX, this.ink + INK_BOTTLE);
        this.emit({ type: 'pickup', kind: p.kind, x: p.x, y: p.y });
    }

    /* ── 主步进 ── */

    step(rawDt) {
        if (this.over) return;
        const dt = Math.min(DT_MAX, Math.max(0, rawDt || 0));
        if (dt <= 0) return;
        this.time += dt;
        const pen = this.pen;
        this.ink = Math.min(INK_MAX, this.ink + INK_REGEN * dt);
        if (pen.down && !this.active.main && this.ink >= (pen.dry ? INK_RESUME : INK_START)) {
            pen.dry = false;
            this.active.main = this.newStroke(pen.x, pen.y, false);
        }
        pen.invuln = Math.max(0, pen.invuln - dt);
        if (this.effects.double > 0) {
            this.effects.double = Math.max(0, this.effects.double - dt);
            if (this.effects.double === 0 && this.active.twin) {
                this.active.twin.live = false;
                this.active.twin = null;
            }
        }
        if (this.effects.shield > 0) this.effects.shield = Math.max(0, this.effects.shield - dt);

        for (const m of this.monsters) {
            if (m.spawn > 0) {
                m.spawn = Math.max(0, m.spawn - dt);
                if (m.still) continue;
            }
            this.moveMonster(m, dt);
        }
        this.resolveBites();
        this.resolvePen();
        if (this.over) return;

        this.nextPowerup -= dt;
        if (this.nextPowerup <= 0) {
            if (this.powerups.length < POWERUP_MAX) this.spawnPowerup();
            this.nextPowerup = this.range(POWERUP_INTERVAL[0], POWERUP_INTERVAL[1]);
        }
        for (const p of [...this.powerups]) {
            p.age += dt;
            if (pen.placed && Math.hypot(p.x - pen.x, p.y - pen.y) < PEN_RADIUS + POWERUP_RADIUS) {
                this.powerups = this.powerups.filter(o => o !== p);
                this.applyPowerup(p);
            }
        }

        if (this.phase === 'wave' && this.monsters.length === 0) {
            this.phase = 'break';
            this.phaseTimer = WAVE_BREAK;
            const healed = this.lives < MAX_LIVES;
            this.lives = Math.min(MAX_LIVES, this.lives + 1);
            this.emit({ type: 'waveClear', wave: this.wave, healed, lives: this.lives });
        } else if (this.phase === 'break') {
            this.phaseTimer -= dt;
            if (this.phaseTimer <= 0) this.startWave(this.wave + 1);
        }
    }

    /** 回放指纹：确定性校验用（只取可比较的核心状态） */
    fingerprint() {
        const r = v => Math.round(v * 1000) / 1000;
        return JSON.stringify({
            t: r(this.time), s: this.score, w: this.wave, l: this.lives, i: r(this.ink),
            m: this.monsters.map(m => [m.type, m.level, r(m.x), r(m.y), m.state]),
            k: this.strokes.map(s => [s.twin ? 1 : 0, s.points.length]),
            p: this.powerups.map(p => [p.kind, r(p.x), r(p.y)]),
        });
    }
}
