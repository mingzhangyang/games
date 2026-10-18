#!/usr/bin/env node
/**
 * 雾隐九宫：生成关卡候选并写入 src/games/sudoku-mist/model/levels.js。
 *
 * 每章用对应的出题 profile 从固定种子区间出 CANDIDATES 道题，按难度指标排序，
 * 取 PICK_QUANTILES 分位上的几道作为该章关卡（章内由易到难）。关卡写成字符串存进 levels.js，
 * 之后与生成器解耦：改生成器不会悄悄改掉已发布的关卡，要换关就重跑本工具并过一遍
 * tests/verify-sudoku-mist-levels.mjs。
 *
 * 难度指标 = 卡点数 + 只能穿雾的状态数 + 2 × 最高档位 − 平均可推格数（都来自出题器的逐格路径）。
 *
 * 用法：node tools/generators/sudoku-mist-levels.mjs [--write]
 *   不带 --write 只打印候选统计
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate } from '../../src/games/sudoku-mist/model/generator.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'src/games/sudoku-mist/model/levels.js');
const WRITE = process.argv.includes('--write');

const CANDIDATES = 24;
const PICK_QUANTILES = [0.1, 0.4, 0.65, 0.9];

const CHAPTERS = [
    {
        id: 'thin', profile: 'first', seedBase: 1000,
        name: { en: 'Thin Mist', zh: '初雾' },
        levels: [
            { en: 'Bamboo Path', zh: '竹径' },
            { en: 'Stone Bridge', zh: '石桥' },
            { en: 'Tea Terraces', zh: '茶田' },
            { en: 'Mountain Temple', zh: '山寺' },
        ],
    },
    {
        id: 'through', profile: 'through', seedBase: 2000,
        name: { en: 'Through the Mist', zh: '穿雾' },
        levels: [
            { en: 'Ferry Crossing', zh: '渡口' },
            { en: 'Pine Cliff', zh: '松崖' },
            { en: 'Cloud Walkway', zh: '云栈' },
            { en: 'Sea of Mist', zh: '雾海' },
        ],
    },
];

const difficulty = st => st.bottlenecks + st.fogOnly + 2 * st.maxTier - st.options;

const levels = [];
for (const ch of CHAPTERS) {
    const pool = [];
    for (let k = 0; k < CANDIDATES; k++) {
        const res = generate(ch.seedBase + k, ch.profile);
        if (!res.relaxed) pool.push({ ...res, difficulty: difficulty(res.stats) });
    }
    pool.sort((a, b) => a.difficulty - b.difficulty || a.seed - b.seed);
    console.log(`\n${ch.id} (${ch.profile}): ${pool.length}/${CANDIDATES} candidates`);
    for (const p of pool) {
        const s = p.stats;
        console.log(`  seed ${String(p.seed).padStart(10)}  diff ${p.difficulty.toFixed(1).padStart(5)}  steps ${s.steps}  opt ${s.options}  bott ${s.bottlenecks}  fogOnly ${s.fogOnly}  fogPl ${s.fogPlacements}  maxTier ${s.maxTier}`);
    }
    const picked = PICK_QUANTILES.map(q => pool[Math.min(pool.length - 1, Math.round(q * (pool.length - 1)))]);
    picked.forEach((p, n) => levels.push({
        id: `${ch.id}-${n + 1}`,
        chapter: ch.id,
        name: ch.levels[n],
        cap: p.cap,
        reveal: p.reveal,
        seed: p.seed,
        givens: p.givens,
        window: p.window,
    }));
}

if (WRITE) {
    const q = v => JSON.stringify(v).replace(/"/g, '\'');
    const chapters = CHAPTERS.map(ch => `    { id: ${q(ch.id)}, name: { en: ${q(ch.name.en)}, zh: ${q(ch.name.zh)} } },`).join('\n');
    const body = levels.map(l => [
        '    {',
        `        id: ${q(l.id)}, chapter: ${q(l.chapter)}, name: { en: ${q(l.name.en)}, zh: ${q(l.name.zh)} },`,
        `        cap: ${l.cap}, reveal: ${q(l.reveal)}, seed: ${l.seed},`,
        `        givens: ${q(l.givens)},`,
        `        window: ${q(l.window)},`,
        '    },',
    ].join('\n')).join('\n');
    const src = `/**
 * 雾隐九宫的关卡（由 tools/generators/sudoku-mist-levels.mjs --write 生成，勿手改）。
 * givens：题面（'.' = 空格）；window：开局视野（'1' = 可见）；cap：通关所需的最高档位；
 * reveal：揭雾核。seed 只用于追溯出处——运行时不再调用生成器，关卡以这里的字符串为准。
 * 可解性、唯一解、永不卡死由 tests/verify-sudoku-mist-levels.mjs 锁住。
 */
export const CHAPTERS = Object.freeze([
${chapters}
].map(Object.freeze));

export const LEVELS = Object.freeze([
${body}
].map(Object.freeze));

export const levelById = id => LEVELS.find(l => l.id === id) || null;
`;
    fs.writeFileSync(OUT, src);
    console.log(`\nwrote ${path.relative(ROOT, OUT)} (${levels.length} levels)`);
}
