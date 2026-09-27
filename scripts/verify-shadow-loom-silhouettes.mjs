#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEVELS } from '../js/shadow-loom-levels.js';
import { getSilhouette, SILHOUETTE_VIEWBOX } from '../js/shadow-loom-silhouettes.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'assets/shadow-loom/layers/silhouettes');
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const generatedReferenceFamilies = new Set(manifest.referenceSource?.generatedReferenceFamilies || []);
let failed = 0;
let passed = 0;
function ok(condition, label) {
    if (condition) { passed++; return; }
    failed++;
    console.error('✗ ' + label);
}
ok(manifest.coordinateSystem?.viewBox === SILHOUETTE_VIEWBOX, 'manifest 与运行时 viewBox 一致');
ok(SILHOUETTE_VIEWBOX === '0 0 480 854', '统一使用 480×854 舞台坐标');
for (const [family, reference] of Object.entries(manifest.referenceSource?.sourceReferences || {})) {
    ok(fs.existsSync(path.join(dir, reference)), `${family}: 原画参考文件存在`);
}
const svgFiles = [];
function walk(folder) {
    for (const name of fs.readdirSync(folder)) {
        const full = path.join(folder, name);
        if (fs.statSync(full).isDirectory()) walk(full);
        else if (name.endsWith('.svg')) svgFiles.push(full);
    }
}
walk(dir);
for (const full of svgFiles) {
    const src = fs.readFileSync(full, 'utf8');
    const rel = path.relative(dir, full);
    ok(/viewBox="0 0 480 854"/.test(src), rel + ': viewBox');
    ok(/<path\b/.test(src) && /fill-rule="evenodd"/.test(src), rel + ': 路径与 evenodd 镂空');
    ok(!/<(rect|image|foreignObject)\b/.test(src), rel + ': 没有烘焙背景');
    if (generatedReferenceFamilies.has(rel.split('/')[0])) {
        ok(/[CQ]\s/.test(src), rel + ': 使用曲线路径');
    }
}
for (const level of LEVELS) {
    for (const piece of level.pieces) {
        const data = getSilhouette(level.id, piece.id);
        ok(!!data, level.id + '/' + piece.id + ': 有 authored SVG 数据');
        if (!data) continue;
        ok(data.anchor?.length === 2 && data.outer?.length, level.id + '/' + piece.id + ': 有共用坐标轮廓');
        ok(data.outer.every(poly => poly.length >= 3), level.id + '/' + piece.id + ': 过滤掉退化轮廓');
        ok(data.anchor[0] === piece.sol.x && data.anchor[1] === piece.sol.y, level.id + '/' + piece.id + ': SVG 锚点等于关卡 sol');
        ok(data.d.includes('M '), level.id + '/' + piece.id + ': 有 Path2D 路径');
        if (generatedReferenceFamilies.has(level.id)) {
            ok(/[CQ]\s/.test(data.d), level.id + '/' + piece.id + ': authored data 使用曲线路径');
        }
        const file = path.join(dir, level.id, piece.id + '.svg');
        ok(fs.existsSync(file), level.id + '/' + piece.id + ': SVG 文件存在');
    }
}
console.log('\n' + (failed ? '✗' : '✓') + ' shadow-loom silhouettes：' + passed + ' 通过，' + failed + ' 失败');
process.exit(failed ? 1 : 0);
