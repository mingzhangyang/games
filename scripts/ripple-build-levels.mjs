#!/usr/bin/env node
/**
 * 涟漪双生关卡生成器 —— par 一律 solvePar() 现算，绝不手填。
 *
 * 默认 dry-run（只打印），加 --write 才落盘 js/ripple-duet-levels.js。
 * 固定种子 ⇒ 幂等：复跑内容无变化。
 *
 * 出题法是**构造式**的：先抽一个「解摆位」，再按这个摆位下的场去安放目标
 * （平静点取包络极小处、点亮处取极大处、航道取穿过暗带的一段），所以每关
 * 必定有解；par 再由 solvePar 按成本分层穷举算出真值（可能比构造解更省）。
 * 关卡难度靠 parBand 拒绝采样来卡。
 */

import * as R from '../js/ripple-duet-rules.js';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'js', 'ripple-duet-levels.js');
const WRITE = process.argv.includes('--write');

function mulberry32(a) {
    return function rnd() {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const NAMES = [
    ['First Cancellation', '第一次对消'],
    ['Against the Storm', '逆着风来'],
    ['Half a Wave', '半波之差'],
    ['Light in the Dark', '暗处点灯'],
    ['Two Tasks, One Sea', '一海两事'],
    ['Storm and Beacon', '风口与灯'],
    ['Twins', '双生'],
    ['Mirror Distance', '等距之静'],
    ['The Phase Key', '相位之钥'],
    ['Still and Bright', '静与亮'],
    ['Beware the Echo', '提防回波'],
    ['Calm Behind the Wall', '堤内之静'],
    ['Reflected Light', '折返的波'],
    ['Opening the Channel', '航道初开'],
    ['Corridor of Still Water', '静水走廊'],
    ['Between the Walls', '双堤之间'],
    ['Trio', '三重奏'],
    ['Eye of the Storm', '风暴之眼'],
    ['A Sea of Pattern', '满海文章'],
    ['Duet Finale', '双生终章'],
];

/* 教学线：单源对冲风暴 → 单源兼点亮 → 双源互消 → 加堤（镜像）→ 航道 → 综合 */
const PLAN = [
    { ctrl: 1, storms: 1, walls: 0, kinds: ['calm'], band: [1, 3] },
    { ctrl: 1, storms: 1, walls: 0, kinds: ['calm'], band: [2, 4] },
    { ctrl: 1, storms: 1, walls: 0, kinds: ['calm'], band: [2, 4] },
    { ctrl: 1, storms: 1, walls: 0, kinds: ['calm', 'blaze'], band: [2, 4] },
    { ctrl: 1, storms: 1, walls: 0, kinds: ['calm', 'blaze'], band: [3, 5] },
    { ctrl: 1, storms: 1, walls: 0, kinds: ['calm', 'blaze'], band: [3, 5] },
    { ctrl: 2, storms: 0, walls: 0, kinds: ['calm'], band: [1, 3] },
    { ctrl: 2, storms: 0, walls: 0, kinds: ['calm'], band: [2, 4] },
    { ctrl: 2, storms: 1, walls: 0, kinds: ['calm'], band: [2, 4] },
    { ctrl: 2, storms: 1, walls: 0, kinds: ['calm', 'blaze'], band: [3, 5] },
    { ctrl: 2, storms: 1, walls: 1, kinds: ['calm'], band: [2, 4] },
    { ctrl: 2, storms: 1, walls: 1, kinds: ['calm', 'blaze'], band: [3, 5] },
    { ctrl: 2, storms: 1, walls: 1, kinds: ['calm', 'blaze'], band: [2, 6] },
    { ctrl: 2, storms: 1, walls: 0, kinds: ['lane'], band: [2, 5] },
    { ctrl: 2, storms: 1, walls: 0, kinds: ['lane'], band: [2, 5] },
    { ctrl: 2, storms: 2, walls: 1, kinds: ['calm', 'blaze'], band: [3, 6], hard: true },
    { ctrl: 2, storms: 1, walls: 0, kinds: ['lane', 'blaze'], band: [2, 6] },
    { ctrl: 2, storms: 2, walls: 1, kinds: ['lane', 'calm'], band: [3, 7], hard: true },
    { ctrl: 2, storms: 1, walls: 2, kinds: ['calm', 'blaze'], band: [4, 7], hard: true },
    { ctrl: 2, storms: 2, walls: 1, kinds: ['calm', 'lane'], band: [3, 8], hard: true },
];

const LAMBDAS = [64, 72, 80, 96];

function scanPoint(level, place, wantMax, k, avoid) {
    const list = R.emitters(level, place, k);
    let best = null;
    for (let y = R.SEA.y + 26; y < R.SEA.y + R.SEA.h - 26; y += 7) {
        for (let x = R.SEA.x + 26; x < R.SEA.x + R.SEA.w - 26; x += 7) {
            let near = false;
            for (const s of list) {
                if (Math.abs(s.x - x) < 48 && Math.abs(s.y - y) < 48) { near = true; break; }
            }
            if (near) continue;
            if (avoid) {
                let clash = false;
                for (const p of avoid) {
                    if (Math.hypot(p.x - x, p.y - y) < 90) { clash = true; break; }
                }
                if (clash) continue;
            }
            const m = R.fieldAt(list, x, y, k).mag;
            if (!best) best = { x, y, m };
            else if (wantMax ? m > best.m : m < best.m) best = { x, y, m };
        }
    }
    return best;
}

/**
 * 航道要铺在**节线**上：节线是曲线，拿直线硬穿暗带必然两端翘起来。
 * 所以在暗点处数值求 |A| 的梯度，沿「垂直梯度」= 等振幅线方向铺，
 * 这个方向上包络变化最慢 —— 物理上就是驻波的节线方向。
 */
function tryLane(level, place, k, rnd, avoid) {
    const dark = scanPoint(level, place, false, k, avoid);
    if (!dark || dark.m > 0.06) return null;
    const list = R.emitters(level, place, k);
    const mag = (x, y) => R.fieldAt(list, x, y, k).mag;
    const gx = mag(dark.x + 3, dark.y) - mag(dark.x - 3, dark.y);
    const gy = mag(dark.x, dark.y + 3) - mag(dark.x, dark.y - 3);
    if (Math.hypot(gx, gy) < 1e-9) return null;
    const base = Math.atan2(gy, gx) + Math.PI / 2;

    // 顺/逆两个方向 + 小幅角度微扰（节线是曲线，直铺时微扰能把两端拉回暗带）
    const SPINS = [0, Math.PI, 0.16, -0.16, Math.PI + 0.16, Math.PI - 0.16];
    for (const spin of SPINS) {
        const ang = base + spin;
        for (const L of [140, 116, 92, 74]) {
            const x1 = dark.x - Math.cos(ang) * L * 0.5;
            const y1 = dark.y - Math.sin(ang) * L * 0.5;
            const x2 = dark.x + Math.cos(ang) * L * 0.5;
            const y2 = dark.y + Math.sin(ang) * L * 0.5;
            if (x1 < R.SEA.x + 18 || x2 > R.SEA.x + R.SEA.w - 18) continue;
            if (y1 < R.SEA.y + 18 || y2 > R.SEA.y + R.SEA.h - 18) continue;
            // 判定用 5 个采样点，铺线时按 9 个密采样检查，避免两采样点之间的峰漏过去
            // （9 个密采样点把 5 个判定点全部包含在内：s=0/2/4/6/8 即 u=0/.25/.5/.75/1）
            let worst = 0;
            let tooClose = false;
            for (let s = 0; s < 9 && !tooClose; s++) {
                const u = s / 8;
                const px = x1 + (x2 - x1) * u;
                const py = y1 + (y2 - y1) * u;
                worst = Math.max(worst, mag(px, py));
                // 航道不许压在初始源头上：校验器要求判定采样点离源 ≥30px，这里留 36px 余量
                for (const c of level.ctrl || []) {
                    if (Math.hypot(px - R.gridX(c.i), py - R.gridY(c.j)) < 36) { tooClose = true; break; }
                }
            }
            if (tooClose || worst > 0.08) continue;
            const lane = { kind: 'lane', x1, y1, x2, y2, n: 5 };
            lane.tol = Math.max(0.08, worst * 1.3);
            return lane;
        }
    }
    return null;
}

/** 上一次 buildOne 的拒绝原因统计（生成失败时打印，用来判断该放宽哪一项约束） */
let LAST = { noTarget: 0, noPar: 0, band: 0, pars: [] };

function buildOne(step, idx, rnd) {
    LAST = { noTarget: 0, noPar: 0, band: 0, pars: [] };
    // 含航道的关约束多（暗带 + 包络 + 离源 ≥36px），需要更大的拒绝采样预算
    const budget = step.kinds.includes('lane') ? 900 : (step.walls >= 2 ? 700 : 260);
    for (let attempt = 0; attempt < budget; attempt++) {
        const lambda = LAMBDAS[Math.floor(rnd() * LAMBDAS.length) % LAMBDAS.length];
        const k = R.K(lambda);
        const ctrl = [];
        for (let s = 0; s < step.ctrl; s++) {
            ctrl.push({
                i: Math.floor(rnd() * R.GRID.cols),
                j: Math.floor(rnd() * R.GRID.rows),
                ph: Math.floor(rnd() * R.PHASES),
            });
        }
        // 解摆位：至少一个源与初始不同（否则 par=0 白送）
        // hard 关（末段）逼**所有**源都挪远 —— 只挪一个源时，构造出的目标位
        // 往往被「某个源走一步」的便宜摆位顺手满足，par 永远停在 1~2（rd19 实测）。
        const solvePlace = ctrl.map((c) => ({ i: c.i, j: c.j, ph: c.ph }));
        const movers = step.hard ? solvePlace.length : 1;
        const picked = [];
        while (picked.length < movers) {
            const s = Math.floor(rnd() * solvePlace.length);
            if (picked.includes(s)) continue;
            picked.push(s);
        }
        for (const s of picked) {
            const far = step.hard ? 3 : 0;
            let cand = null;
            for (let t = 0; t < 40; t++) {
                const i = Math.floor(rnd() * R.GRID.cols);
                const j = Math.floor(rnd() * R.GRID.rows);
                const ph = Math.floor(rnd() * R.PHASES);
                const moved = i !== ctrl[s].i || j !== ctrl[s].j;
                if (!moved && ph === ctrl[s].ph) continue;
                if (Math.abs(i - ctrl[s].i) + Math.abs(j - ctrl[s].j) < far) continue;
                cand = { i, j, ph };
                break;
            }
            if (cand) solvePlace[s] = cand;
            else if (solvePlace[s].ph === ctrl[s].ph) solvePlace[s].ph = (solvePlace[s].ph + 3) % R.PHASES;
        }

        const storms = [];
        for (let s = 0; s < step.storms; s++) {
            storms.push({
                x: R.SEA.x + 50 + rnd() * (R.SEA.w - 100),
                y: R.SEA.y + 50 + rnd() * (R.SEA.h - 100),
                ph: Math.floor(rnd() * R.PHASES),
                amp: 0.85 + rnd() * 0.35,
            });
        }

        const walls = [];
        for (let w = 0; w < step.walls; w++) {
            const cx = R.SEA.x + R.SEA.w * (0.3 + rnd() * 0.4);
            const cy = R.SEA.y + R.SEA.h * (0.3 + rnd() * 0.4);
            const ang = rnd() * Math.PI;
            walls.push({
                x1: cx - Math.cos(ang) * 260,
                y1: cy - Math.sin(ang) * 260,
                x2: cx + Math.cos(ang) * 260,
                y2: cy + Math.sin(ang) * 260,
                r: rnd() < 0.5 ? 0.7 : -0.7,
            });
        }

        const draft = { lambda, ctrl, storms, walls, targets: [] };
        const targets = [];
        const placed = [];
        let ok = true;
        for (const kind of step.kinds) {
            if (kind === 'calm') {
                const p = scanPoint(draft, solvePlace, false, k, placed);
                if (!p || p.m > R.RULES.calmTol * 0.8) { ok = false; break; }
                targets.push({ kind: 'calm', x: p.x, y: p.y, tol: Math.max(R.RULES.calmTol, p.m * 1.35) });
                placed.push({ x: p.x, y: p.y });
            } else if (kind === 'blaze') {
                const p = scanPoint(draft, solvePlace, true, k, placed);
                if (!p) { ok = false; break; }
                targets.push({ kind: 'blaze', x: p.x, y: p.y, need: Math.max(0.62, p.m * 0.72) });
                placed.push({ x: p.x, y: p.y });
            } else if (kind === 'lane') {
                const lane = tryLane(draft, solvePlace, k, rnd, placed);
                if (!lane) { ok = false; break; }
                targets.push(lane);
                placed.push({ x: (lane.x1 + lane.x2) / 2, y: (lane.y1 + lane.y2) / 2 });
            }
        }
        if (!ok) { LAST.noTarget++; continue; }

        const level = {
            id: `rd${idx + 1}`,
            name: { en: NAMES[idx][0], zh: NAMES[idx][1] },
            lambda,
            ctrl,
            storms,
            walls,
            targets,
            par: 0,
        };
        const solved = R.solvePar(level);
        if (!Number.isFinite(solved.par) || solved.par <= 0) { LAST.noPar++; continue; }
        LAST.pars.push(solved.par);
        if (solved.par < step.band[0] || solved.par > step.band[1]) { LAST.band++; continue; }
        level.par = solved.par;
        return level;
    }
    return null;
}

const rnd = mulberry32(0x5eed1234);
const levels = [];
let failed = 0;
for (let i = 0; i < PLAN.length; i++) {
    const lv = buildOne(PLAN[i], i, rnd);
    if (!lv) {
        failed++;
        const hist = {};
        LAST.pars.forEach((p) => { hist[p] = (hist[p] || 0) + 1; });
        console.log(`✗ rd${i + 1} 生成失败  无目标位 ${LAST.noTarget} / 无解 ${LAST.noPar} / par 出界 ${LAST.band}   par 分布 ${JSON.stringify(hist)}`);
        continue;
    }
    levels.push(lv);
}

console.log(`生成 ${levels.length}/${PLAN.length} 关，失败 ${failed}`);
console.log('id    par  λ   源 风暴 堤  目标');
levels.forEach((l) => {
    const tg = l.targets.map((t) => t.kind).join('+');
    console.log(`${l.id.padEnd(5)} ${String(l.par).padStart(2)}   ${String(l.lambda).padStart(3)}  ${l.ctrl.length}    ${l.storms.length}    ${l.walls.length}   ${tg}`);
});

if (!WRITE) {
    console.log('\n(dry-run：加 --write 才落盘)');
    process.exit(failed ? 1 : 0);
}

/**
 * 序列化成**符合项目 lint 契约**的 JS 字面量（eslint.config.js 要求 js/** 用
 * 4 空格缩进 + 单引号）。JSON.stringify 给的是 2 空格 + 双引号，直接落盘会被
 * run-lint.mjs 判红（几百条 indent/quotes），所以自己写序列化器。
 */
function emit(v, ind) {
    const pad = '    '.repeat(ind);
    const padIn = '    '.repeat(ind + 1);
    if (Array.isArray(v)) {
        if (!v.length) return '[]';
        return '[\n' + v.map((x) => padIn + emit(x, ind + 1)).join(',\n') + '\n' + pad + ']';
    }
    if (v && typeof v === 'object') {
        const keys = Object.keys(v);
        if (!keys.length) return '{}';
        const rows = keys.map((k) => {
            const key = /^[A-Za-z_$][\w$]*$/.test(k) ? k : `'${k}'`;
            return `${padIn}${key}: ${emit(v[k], ind + 1)}`;
        });
        return '{\n' + rows.join(',\n') + '\n' + pad + '}';
    }
    if (typeof v === 'string') return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    return String(v);
}

const body = `/**
 * 涟漪双生 — 20 关（由 scripts/ripple-build-levels.mjs 生成，勿手改）
 *
 * par 全部由 solvePar() 按成本分层穷举现算（构造式出题保证有解，par 取真最小值）。
 * 复核：scripts/verify-ripple-duet-levels.mjs
 */

export const LEVELS = ${emit(levels, 0)};

export default LEVELS;
`;

if (existsSync(OUT)) {
    const prev = readFileSync(OUT, 'utf8');
    if (prev === body) {
        console.log('内容无变化，未重写');
        process.exit(0);
    }
}
writeFileSync(OUT, body, 'utf8');
console.log(`\n已写入 ${OUT}（${levels.length} 关）`);
