// echo-cave-caves.js — 回声洞窟 Echo Cave：关卡数据 + 声波回声核心（纯模块，零 DOM）
// 坐标：逻辑舞台 480×640，y 向下。洞穴是 24×32 格（cell 20px）的网格世界。
//
// 核心机制（本作的一切教学都长在机制上）：
//   洞穴全黑，岩壁不可见。玩家（萤）唯一的信息来源是**声波脉冲**：
//     1. 发射脉冲 → 波前从玩家格子按 4 向 BFS 在地板上扩散（声波绕角衍射）；
//     2. 波前半径 r = age × pulseSpeed，扫过某格岩壁的瞬间该格被「照亮」；
//        亮度 = 1 - 距离/maxR（越近越亮），随后按 holdTime 衰减；
//     3. 普通岩壁留下 memoryWall 的**记忆残光**（可以凭残光导航），
//        吸音苔藓不留残光（吸音材料：回波弱、无记忆）——这是关卡的核心谜题面。
//   声晶会周期性鸣响（琥珀涟漪）、洞口低频嗡鸣（紫涟漪）、荆棘间歇尖鸣（红涟漪）：
//   黑暗里唯一「活着」的东西都靠声音标位——声音即信息。
//
// 计分：**脉冲次数**（离散量，asc 越少越好），par 由校验器的 Dijkstra 求解器现算
// （状态 = (格, 声晶掩码, 上次脉冲格)，荆棘视为墙；SAFE_R 内移动免费、发射脉冲代价 1）。
// ⚠️ par 不是手填的估计值——scripts/verify-echo-cave-levels.mjs 会重算并断言一致。
import { hashStringFNV, mulberry32 } from './daily.js';

export const STAGE = { w: 480, h: 640 };
export const GRID = { cell: 20, cols: 24, rows: 32 };

export const RULES = {
    playerR: 7,          // 萤的碰撞半径
    speed: 132,          // 移动速度 px/s
    glowR: 30,           // 萤的微光可视半径（仅氛围，不揭示岩壁）
    pulseSpeed: 340,     // 波前扩散速度 px/s（约等于缩小版声速）
    pulseMaxR: 240,      // 单次脉冲最大揭示半径 px（= 12 格）
    holdTime: 2.2,       // 亮 → 灭的衰减时间 s
    ringLife: 3.1,       // 波纹圈总寿命 s
    memoryWall: 0.12,    // 普通岩壁的记忆残光
    mossPeak: 0.5,       // 苔藓回波亮度上限（吸音：回波弱）
    hearts: 3,           // 每关护心数
    crystalR: 15,        // 声晶拾取半径
    exitR: 19,           // 洞口触发半径
    thornR: 12,          // 荆棘判定半径
    knockDist: 30,       // 被刺后的击退距离
    invuln: 1.3,         // 受击无敌时间 s
    crystalSing: 3.6,    // 声晶鸣响周期 s
    exitHum: 4.6,        // 洞口嗡鸣周期 s
    thornWarn: 5.2,      // 荆棘尖鸣周期 s
    safeR: 9,            // 求解器「信息覆盖」半径（格）——必须 ≤ pulseMaxR/cell
};

const WALL = 1;
const MOSS = 2;

/* ────────────────────────── ASCII 解析 ────────────────────────── */
// 字符：'#'=岩壁  'M'=吸音苔藓  '.'=地板  'P'=萤的起点  'C'=声晶  'E'=洞口  'T'=荆棘

export function parseCave(lines) {
    const { cols, rows, cell } = GRID;
    if (!Array.isArray(lines) || lines.length !== rows) {
        throw new Error(`cave rows = ${Array.isArray(lines) ? lines.length : 'n/a'}, expect ${rows}`);
    }
    const grid = new Uint8Array(cols * rows);
    const cave = { grid, start: null, crystals: [], exit: null, thorns: [] };
    for (let cy = 0; cy < rows; cy++) {
        const line = lines[cy];
        if (typeof line !== 'string' || line.length !== cols) {
            throw new Error(`cave row ${cy} length = ${line ? line.length : 'n/a'}, expect ${cols}`);
        }
        for (let cx = 0; cx < cols; cx++) {
            const ch = line[cx];
            const idx = cy * cols + cx;
            const x = cx * cell + cell / 2;
            const y = cy * cell + cell / 2;
            if (ch === '#') { grid[idx] = WALL; continue; }
            if (ch === 'M') { grid[idx] = MOSS; continue; }
            if (ch === ' ') { grid[idx] = WALL; continue; }
            if (ch === '.') { continue; }
            if (ch === 'P') { cave.start = { cx, cy, x, y }; continue; }
            if (ch === 'C') { cave.crystals.push({ cx, cy, x, y }); continue; }
            if (ch === 'E') { cave.exit = { cx, cy, x, y }; continue; }
            if (ch === 'T') { cave.thorns.push({ cx, cy, x, y }); continue; }
            throw new Error(`cave row ${cy} col ${cx}: unknown char ${JSON.stringify(ch)}`);
        }
    }
    if (!cave.start) throw new Error('cave missing P');
    if (!cave.exit) throw new Error('cave missing E');
    return cave;
}

/* ────────────────────────── BFS 波场 ────────────────────────── */
// 4 向 BFS：声音沿地板衍射。返回 Int16Array（每格距脉冲源的格数，-1 = 不可达/实心）。

export function computeField(grid, cols, rows, scx, scy) {
    const n = cols * rows;
    const field = new Int16Array(n).fill(-1);
    if (grid[scy * cols + scx] > 0) return field;
    const queue = new Int32Array(n);
    let head = 0, tail = 0;
    const s = scy * cols + scx;
    field[s] = 0;
    queue[tail++] = s;
    while (head < tail) {
        const cur = queue[head++];
        const d = field[cur] + 1;
        const cx = cur % cols;
        const cy = (cur - cx) / cols;
        if (cx > 0 && field[cur - 1] < 0 && grid[cur - 1] === 0) { field[cur - 1] = d; queue[tail++] = cur - 1; }
        if (cx < cols - 1 && field[cur + 1] < 0 && grid[cur + 1] === 0) { field[cur + 1] = d; queue[tail++] = cur + 1; }
        if (cy > 0 && field[cur - cols] < 0 && grid[cur - cols] === 0) { field[cur - cols] = d; queue[tail++] = cur - cols; }
        if (cy < rows - 1 && field[cur + cols] < 0 && grid[cur + cols] === 0) { field[cur + cols] = d; queue[tail++] = cur + cols; }
    }
    return field;
}

/* ────────────────────────── 世界 ────────────────────────── */

export function createWorld(spec) {
    const { cols, rows, cell } = GRID;
    const cave = parseCave(spec.map);
    const n = cols * rows;
    const wallCells = [];
    for (let i = 0; i < n; i++) if (cave.grid[i] > 0) wallCells.push(i);
    return {
        spec,
        grid: cave.grid,
        cols, rows, cell,
        wallCells,
        player: { x: cave.start.x, y: cave.start.y },
        crystals: cave.crystals.map((c, i) => ({ ...c, i, taken: false, singT: (i * 0.9) % RULES.crystalSing })),
        exit: { ...cave.exit, humT: RULES.exitHum * 0.5, flash: 0 },
        thorns: cave.thorns.map((t, i) => ({ ...t, i, warnT: (i * 1.7) % RULES.thornWarn, flash: 0 })),
        pulses: [],           // { x, y, age, field, prevR }
        ripples: [],          // 纯视觉 { x, y, t, dur, maxR, color, lw }
        glow: new Float32Array(n),
        memory: new Float32Array(n),
        pulseCount: 0,
        hearts: RULES.hearts,
        invulnT: 0,
        knockX: 0, knockY: 0,
        got: 0,
        total: cave.crystals.length,
        state: 'playing',     // playing | won | dead
        deadT: 0, winT: 0,
        events: [],
    };
}

function solidAt(world, cx, cy) {
    if (cx < 0 || cy < 0 || cx >= world.cols || cy >= world.rows) return true;
    return world.grid[cy * world.cols + cx] > 0;
}

function circleHits(world, x, y, r) {
    const c = world.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
    for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
            if (!solidAt(world, cx, cy)) continue;
            const nx = Math.max(cx * c, Math.min(x, cx * c + c));
            const ny = Math.max(cy * c, Math.min(y, cy * c + c));
            const dx = x - nx, dy = y - ny;
            if (dx * dx + dy * dy < r * r) return true;
        }
    }
    return false;
}

export function emitPulse(world) {
    if (world.state !== 'playing') return;
    const { cols, rows, cell } = GRID;
    const pcx = Math.min(cols - 1, Math.max(0, Math.floor(world.player.x / cell)));
    const pcy = Math.min(rows - 1, Math.max(0, Math.floor(world.player.y / cell)));
    world.pulses.push({
        x: world.player.x, y: world.player.y, age: 0, prevR: 0,
        field: computeField(world.grid, cols, rows, pcx, pcy),
    });
    world.pulseCount++;
    world.events.push({ type: 'pulse', x: world.player.x, y: world.player.y });
}

/** 受击时的「惊叫」免费照亮：荆棘把周围一小圈喊亮（反馈诚实：伤害即信息） */
function screamReveal(world, cx, cy, radiusCells) {
    const { cols, rows, cell } = GRID;
    const field = computeField(world.grid, cols, rows, cx, cy);
    for (const idx of world.wallCells) {
        const wx = idx % cols, wy = (idx - wx) / cols;
        let best = -1;
        if (wx > 0 && field[idx - 1] >= 0) best = best < 0 ? field[idx - 1] : Math.min(best, field[idx - 1]);
        if (wx < cols - 1 && field[idx + 1] >= 0) best = best < 0 ? field[idx + 1] : Math.min(best, field[idx + 1]);
        if (wy > 0 && field[idx - cols] >= 0) best = best < 0 ? field[idx - cols] : Math.min(best, field[idx - cols]);
        if (wy < rows - 1 && field[idx + cols] >= 0) best = best < 0 ? field[idx + cols] : Math.min(best, field[idx + cols]);
        if (best < 0 || best > radiusCells) continue;
        const dpx = (best + 0.5) * cell;
        const c = Math.max(0.3, 1 - dpx / (RULES.pulseMaxR));
        world.glow[idx] = Math.max(world.glow[idx], world.grid[idx] === MOSS ? Math.min(RULES.mossPeak, c) : c);
        if (world.grid[idx] === WALL) world.memory[idx] = Math.max(world.memory[idx], RULES.memoryWall);
    }
}

function revealBand(world, pulse, rPrev, rCur) {
    // 波前扫过 (rPrev, rCur] 的岩壁格：距源取四邻地板的最小 BFS 距
    const { cols, rows, cell } = GRID;
    for (const idx of world.wallCells) {
        const wx = idx % cols, wy = (idx - wx) / cols;
        let best = -1;
        if (wx > 0 && pulse.field[idx - 1] >= 0) best = pulse.field[idx - 1];
        else if (wx < cols - 1 && pulse.field[idx + 1] >= 0) best = pulse.field[idx + 1];
        else if (wy > 0 && pulse.field[idx - cols] >= 0) best = pulse.field[idx - cols];
        else if (wy < rows - 1 && pulse.field[idx + cols] >= 0) best = pulse.field[idx + cols];
        if (best < 0) continue;
        const dpx = (best + 0.5) * cell;
        if (dpx <= rPrev || dpx > rCur) continue;
        let c = Math.max(0.3, 1 - dpx / RULES.pulseMaxR);
        const moss = world.grid[idx] === MOSS;
        if (moss) c = Math.min(RULES.mossPeak, c);
        if (c > world.glow[idx]) world.glow[idx] = c;
        if (!moss && RULES.memoryWall > world.memory[idx]) world.memory[idx] = RULES.memoryWall;
    }
}

export function stepWorld(world, dt, input) {
    if (world.state !== 'playing') {
        world.winT += dt;
        world.deadT += dt;
        return;
    }
    const p = world.player;
    const invulnBefore = world.invulnT;
    if (world.invulnT > 0) world.invulnT -= dt;

    // 击退衰减
    const kx = world.knockX, ky = world.knockY;
    world.knockX *= Math.max(0, 1 - dt * 8);
    world.knockY *= Math.max(0, 1 - dt * 8);

    // 移动（轴分离碰撞 → 自然滑墙）
    const sp = RULES.speed;
    const mx = (input.mx || 0) * sp + kx;
    const my = (input.my || 0) * sp + ky;
    const nx = p.x + mx * dt;
    if (!circleHits(world, nx, p.y, RULES.playerR)) p.x = nx;
    const ny = p.y + my * dt;
    if (!circleHits(world, p.x, ny, RULES.playerR)) p.y = ny;
    p.x = Math.max(RULES.playerR, Math.min(STAGE.w - RULES.playerR, p.x));
    p.y = Math.max(RULES.playerR, Math.min(STAGE.h - RULES.playerR, p.y));

    // 脉冲
    if (input.pulse) emitPulse(world);

    // 波前推进 + 揭示
    const decay = dt / RULES.holdTime;
    for (const idx of world.wallCells) {
        if (world.glow[idx] > 0) world.glow[idx] = Math.max(0, world.glow[idx] * (1 - decay));
    }
    for (const pulse of world.pulses) {
        pulse.age += dt;
        const r = Math.min(pulse.age * RULES.pulseSpeed, RULES.pulseMaxR);
        if (r > pulse.prevR) {
            revealBand(world, pulse, pulse.prevR, r);
            // 洞口 / 荆棘的「波前闪亮」
            const exitD = pulse.field[world.exit.cy * world.cols + world.exit.cx];
            if (exitD >= 0) {
                const dpx = (exitD + 0.5) * world.cell;
                if (dpx > pulse.prevR && dpx <= r) world.exit.flash = 1;
            }
            for (const t of world.thorns) {
                const td = pulse.field[t.cy * world.cols + t.cx];
                if (td >= 0) {
                    const dpx = (td + 0.5) * world.cell;
                    if (dpx > pulse.prevR && dpx <= r) t.flash = 1;
                }
            }
            pulse.prevR = r;
        }
    }
    world.pulses = world.pulses.filter(pu => pu.age < RULES.ringLife);

    // 涟漪（视觉）
    for (const r of world.ripples) r.t += dt;
    world.ripples = world.ripples.filter(r => r.t < r.dur);
    world.exit.flash = Math.max(0, world.exit.flash - dt * 2);
    for (const t of world.thorns) {
        t.flash = Math.max(0, t.flash - dt * 2);
        t.warnT += dt;
        if (t.warnT >= RULES.thornWarn) {
            t.warnT = 0;
            world.ripples.push({ x: t.x, y: t.y, t: 0, dur: 1.5, maxR: 58, color: '255,107,122', lw: 1.2 });
        }
    }
    for (const c of world.crystals) {
        if (c.taken) continue;
        c.singT += dt;
        if (c.singT >= RULES.crystalSing) {
            c.singT = 0;
            world.ripples.push({ x: c.x, y: c.y, t: 0, dur: 1.6, maxR: 84, color: '255,211,77', lw: 1.3 });
            world.events.push({ type: 'sing', x: c.x, y: c.y });
        }
    }
    world.exit.humT += dt;
    if (world.exit.humT >= RULES.exitHum) {
        world.exit.humT = 0;
        world.ripples.push({ x: world.exit.x, y: world.exit.y, t: 0, dur: 2.2, maxR: 130, color: '167,139,250', lw: 1.5 });
        world.events.push({ type: 'hum', x: world.exit.x, y: world.exit.y });
    }

    // 拾取声晶
    for (const c of world.crystals) {
        if (c.taken) continue;
        const dx = c.x - p.x, dy = c.y - p.y;
        if (dx * dx + dy * dy < RULES.crystalR * RULES.crystalR) {
            c.taken = true;
            world.got++;
            world.events.push({ type: 'crystal', x: c.x, y: c.y, n: world.got });
        }
    }

    // 荆棘
    if (invulnBefore <= 0 && world.invulnT <= 0) {
        for (const t of world.thorns) {
            const dx = p.x - t.x, dy = p.y - t.y;
            const rr = RULES.thornR + RULES.playerR;
            if (dx * dx + dy * dy < rr * rr) {
                world.hearts--;
                world.invulnT = RULES.invuln;
                const d = Math.max(1, Math.hypot(dx, dy));
                world.knockX = (dx / d) * RULES.knockDist / 0.12;
                world.knockY = (dy / d) * RULES.knockDist / 0.12;
                t.flash = 1;
                screamReveal(world, t.cx, t.cy, 5);
                world.events.push({ type: 'hit', x: t.x, y: t.y, hearts: world.hearts });
                if (world.hearts <= 0) {
                    world.state = 'dead';
                    world.events.push({ type: 'dead' });
                }
                break;
            }
        }
    }

    // 洞口
    const ex = world.exit.x - p.x, ey = world.exit.y - p.y;
    if (ex * ex + ey * ey < RULES.exitR * RULES.exitR) {
        world.state = 'won';
        world.events.push({ type: 'won', x: world.exit.x, y: world.exit.y });
    }
}

/* ────────────────────────── 关卡表 ────────────────────────── */
// 24 列 × 32 行。M1 先放 3 个教学洞（par 为暂定值，M2 换 20 关并全部过求解器）。

export const LEVELS = [
    {
        id: 'E1', par: 1, tipKey: 'tipFirst',
        map: [
            '########################',
            '#......................#',
            '#......................#',
            '#......................#',
            '#......................#',
            '#......................#',
            '#......................#',
            '#......................#',
            '#......................#',
            '#......................#',
            '#......................#',
            '#.......C..............#',
            '#.........###..........#',
            '#.........#.#..........#',
            '#.........###..........#',
            '#...........P..........#',
            '#......................#',
            '#......................#',
            '#......................#',
            '#..............E.......#',
            '#......................#',
            '#......................#',
            '#......................#',
            '#..........##..........#',
            '#..........##..........#',
            '#......................#',
            '#......................#',
            '#......................#',
            '#......................#',
            '#......................#',
            '#......................#',
            '########################',
        ],
    },
    {
        id: 'E2', par: 2, tipKey: 'tipMove',
        map: [
            '########################',
            '#...........#..........#',
            '#...........#..........#',
            '#...........#..........#',
            '#...........#..........#',
            '#...........#..........#',
            '#...........#..........#',
            '#...........#..........#',
            '#.....P.....#..........#',
            '#...........#..........#',
            '#...........#..........#',
            '#...........#..........#',
            '#...........#..........#',
            '#...........#...C......#',
            '#......................#',
            '#......................#',
            '#......................#',
            '#..................E...#',
            '#...........#..........#',
            '#...........#..........#',
            '#...........#..........#',
            '#...........#..........#',
            '#...........#..........#',
            '#...........#..........#',
            '#...........#..........#',
            '#...........#..........#',
            '#...........#..........#',
            '#...........#..........#',
            '#...........#..........#',
            '#...........#..........#',
            '#...........#..........#',
            '########################',
        ],
    },
    {
        id: 'E3', par: 3, tipKey: 'tipThorn',
        map: [
            '########################',
            '#......................#',
            '#...........C..........#',
            '#..............#.......#',
            '#..............#.......#',
            '#.....##.......#..E....#',
            '#.....##...............#',
            '#..............#.......#',
            '#..............#.......#',
            '#....T.........#.......#',
            '#..............#.......#',
            '#.......T......#.......#',
            '#..............#.......#',
            '#..............#....T..#',
            '#..............#.......#',
            '#.....##.......#.......#',
            '#.....##.......#.......#',
            '#..............#.......#',
            '#..............#.......#',
            '#....T.........#.......#',
            '#..............#.......#',
            '#..............#.......#',
            '#.....P........#.......#',
            '#..............#.......#',
            '#..............#.......#',
            '#..............#.......#',
            '#..............#.......#',
            '#..............#.......#',
            '#..............#.......#',
            '#..............#.......#',
            '#..............#.......#',
            '########################',
        ],
    },
];

export const DAILY_COUNT = 5;

/** 每日课程：FNV-1a 种子 + mulberry32 从 20 关池抽 5 关，按 par 升序（与键合工坊同族） */
export function dailyCourse(dateKey) {
    const seed = hashStringFNV('echo-cave-' + dateKey);
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
