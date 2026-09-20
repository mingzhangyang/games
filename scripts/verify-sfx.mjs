#!/usr/bin/env node
/**
 * verify-sfx — P2-7 音效收敛校验器
 *
 * 断言：
 *  1. 8 个迁移页 import createSfxEngine，且自造 AudioContext 样板清零
 *  2. createSfx 表驱动页（tetris/gomoku/tank-battle）import createSfx
 *  3. 全 js/ 域（除豁免文件）无 createOscillator/createBufferSource/webkitAudioContext 残留
 *  4. 旧 toggleMuted 样板（this.muted = !this.muted）与旧参数名（endFreq）清零
 *  5. 引擎静音路径冒烟：Node 无 window → ensure() 返回 null，tone/noise 不抛
 *
 * 豁免（自治音频）：
 *  - js/game-sfx.js（引擎本体）
 *  - js/sword-flight.js（双振荡器和声/多段包络/持续风声，超出引擎表达域）
 *  - js/math-rain/**（化外页，P4 收编对象）
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS_DIR = join(ROOT, 'js');

let failures = 0;
function check(name, cond, detail = '') {
    if (cond) {
        console.log(`  ok  ${name}`);
    } else {
        failures++;
        console.error(`FAIL  ${name}${detail ? ' — ' + detail : ''}`);
    }
}

/** 递归收集 js/ 下所有 .js 文件 */
function collectJsFiles(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
            out.push(...collectJsFiles(p));
        } else if (name.endsWith('.js')) {
            out.push(p);
        }
    }
    return out;
}

const EXEMPT = (rel) => rel === 'game-sfx.js' || rel === 'sword-flight.js' || rel.startsWith('math-rain');

const allFiles = collectJsFiles(JS_DIR).map((p) => ({ abs: p, rel: relative(JS_DIR, p).replace(/\\/g, '/') }));

/* ── needle-awn 的 dashWhoosh（bandpass Q=3 双段频率包络）超出引擎表达域，保留自治——摘除后测 ── */
const DASH_WHOOSH = /\n    dashWhoosh\(\) \{[\s\S]*?\n    \},/;
function audibleBoilerplate(rel, src) {
    if (rel === 'needle-awn.js') src = src.replace(DASH_WHOOSH, '\n    dashWhoosh() { /* 自治：bandpass 双段包络 */ },');
    return /createOscillator|createBufferSource|webkitAudioContext/.test(src);
}

/* ── 1. 迁移页 import createSfxEngine ── */
const MIGRATED = [
    'gravity-slingshot.js', 'hoop-shot.js', 'minesweeper.js', 'needle-awn.js',
    'planet-merge.js', 'reversi.js', 'tower-defense.js', 'word-daily.js',
];
for (const rel of MIGRATED) {
    const src = readFileSync(join(JS_DIR, rel), 'utf8');
    check(`${rel}: import createSfxEngine`, src.includes("import { createSfxEngine } from './game-sfx.js'"));
    check(`${rel}: 无 createSfxEngine 之外的自造样板`, !audibleBoilerplate(rel, src));
}

/* ── 2. 表驱动页 import createSfx ── */
const TABLE_DRIVEN = ['tetris.js', 'gomoku.js', 'tank-battle.js'];
for (const rel of TABLE_DRIVEN) {
    const src = readFileSync(join(JS_DIR, rel), 'utf8');
    check(`${rel}: import createSfx`, /import\s*\{[^}]*createSfx[^}]*\}\s*from\s*'\.\/game-sfx\.js'/.test(src));
    check(`${rel}: 无自造音频样板`, !/createOscillator|createBufferSource|webkitAudioContext/.test(src));
}

/* ── 3. 全域扫描（豁免文件除外） ── */
const leakFiles = allFiles
    .filter((f) => !EXEMPT(f.rel))
    .filter((f) => audibleBoilerplate(f.rel, readFileSync(f.abs, 'utf8')));
check('js/ 无自造 AudioContext 样板残留（豁免：game-sfx/sword-flight/math-rain + needle-awn dashWhoosh）',
    leakFiles.length === 0, leakFiles.map((f) => f.rel).join(', '));
{
    const naSrc = readFileSync(join(JS_DIR, 'needle-awn.js'), 'utf8');
    check('needle-awn: dashWhoosh 保留 bandpass 自治（恰 1 处 createBufferSource）',
        (naSrc.match(/createBufferSource/g) || []).length === 1 && naSrc.includes("filter.type = 'bandpass'"));
}

/* ── 4. 旧样板/旧实参键清零 ── */
for (const rel of MIGRATED) {
    const src = readFileSync(join(JS_DIR, rel), 'utf8');
    check(`${rel}: 无旧 toggleMuted 样板（this.muted = !this.muted）`, !src.includes('this.muted = !this.muted'));
    // endFreq 作为形参名的桥接（needle-awn playTone 位置传参包装）允许；作为实参键传递禁止
    check(`${rel}: 无旧实参键 endFreq:`, !/endFreq\s*:/.test(src));
}

/* ── 5. 引擎静音路径冒烟（Node：window/localStorage 均未定义） ── */
{
    const sfxURL = pathToFileURL(join(JS_DIR, 'game-sfx.js')).href;
    const CHILD = `
        import { createSfxEngine, createSfx } from ${JSON.stringify(sfxURL)};
        const eng = createSfxEngine();
        const okEnsure = eng.ensure() === null;           // 无 window.AudioContext → null
        let okTone = true, okNoise = true;
        try { eng.tone({ freq: 440, dur: 0.05, vol: 0.1 }); } catch { okTone = false; }
        try { eng.noise({ dur: 0.05, vol: 0.1 }); } catch { okNoise = false; }
        const table = createSfx({ move: { freq: 440, dur: 0.05, vol: 0.1 } });
        let okPlay = true;
        try { table.play('move'); } catch { okPlay = false; }
        console.log(JSON.stringify({ okEnsure, okTone, okNoise, okPlay }));
    `;
    const { spawnSync } = await import('node:child_process');
    const node = process.execPath;
    const res = spawnSync(node, ['--input-type=module', '-e', CHILD], { encoding: 'utf8' });
    let smoke = null;
    try { smoke = JSON.parse(res.stdout.trim().split('\n').pop() || 'null'); } catch { /* parse fail */ }
    check('引擎冒烟：Node 静音路径 ensure()=null 且 tone/noise/play 不抛',
        !!smoke && smoke.okEnsure && smoke.okTone && smoke.okNoise && smoke.okPlay,
        res.stderr.slice(0, 400));
}

console.log(failures === 0 ? '\nverify-sfx: all green' : `\nverify-sfx: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
