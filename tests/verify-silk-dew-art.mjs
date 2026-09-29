#!/usr/bin/env node
// 垂丝引露生产美术契约校验：分层、预算、场景接线与降级钩子。
import { readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART_ROOT = join(ROOT, 'assets', 'silk-dew');
const manifest = JSON.parse(readFileSync(join(ART_ROOT, 'manifest.json'), 'utf8'));
const html = readFileSync(join(ROOT, 'silk-dew.html'), 'utf8');
const css = readFileSync(join(ROOT, 'css', 'silk-dew.css'), 'utf8');
const game = readFileSync(join(ROOT, 'js', 'silk-dew.js'), 'utf8');
const art = readFileSync(join(ROOT, 'js', 'silk-dew-art.js'), 'utf8');
const scene = readFileSync(join(ROOT, 'js', 'silk-dew-scene.js'), 'utf8');
const levels = readFileSync(join(ROOT, 'js', 'silk-dew-levels.js'), 'utf8');
const verifyAll = readFileSync(join(ROOT, 'tests', 'verify-all.mjs'), 'utf8');
const smoke = readFileSync(join(ROOT, 'tests', 'smoke-silk-dew.mjs'), 'utf8');
const { SILK_DEW_MANIFEST: runtimeManifest } = await import('../js/silk-dew-art.js');

const errors = [];
const checks = [];
const fail = message => errors.push(message);
const pass = message => checks.push(message);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

if (!same(manifest.coordinateSystem, { unit: 'logical-px', origin: 'top-left', width: 480, height: 640 })) {
    fail('coordinate system must remain 480×640 logical px');
} else {
    pass('480×640 logical scene contract');
}

const expectedLayers = ['sky', 'moon-mountains', 'garden-back', 'garden-mid', 'garden-mid-lit', 'foreground', 'foreground-lit'];
const layers = manifest.layers || [];
if (!same(layers.map(layer => layer.id), expectedLayers)) {
    fail(`layer order must be ${expectedLayers.join(' → ')}`);
}
const zValues = layers.map(layer => layer.z);
if (zValues.some(value => !Number.isFinite(value)) || zValues.some((value, i) => i > 0 && value <= zValues[i - 1])) {
    fail('scene z values must be numeric and strictly increasing');
} else {
    pass('scene layers have deterministic z order');
}

const runtimeExpected = {
    version: manifest.version,
    format: manifest.format,
    coordinateSystem: { width: manifest.coordinateSystem?.width, height: manifest.coordinateSystem?.height },
    layers: layers.map(({ id, file, z }) => ({ id, file, z })),
    props: {
        'jade-vessel': {
            file: manifest.props?.['jade-vessel']?.file,
            viewBox: manifest.props?.['jade-vessel']?.viewBox,
            mouthAnchor: manifest.props?.['jade-vessel']?.mouthAnchor,
            mouthUnits: manifest.props?.['jade-vessel']?.mouthUnits,
            logicalMouthWidth: manifest.props?.['jade-vessel']?.logicalMouthWidth,
            logicalBodyHeight: manifest.props?.['jade-vessel']?.logicalBodyHeight,
        },
    },
    support: manifest.support,
    runtimeBudgetBytes: manifest.runtimeBudgetBytes,
};
if (!same(runtimeManifest, runtimeExpected)) fail('js/silk-dew-art.js runtime manifest is out of sync with manifest.json');
else pass('runtime manifest matches source manifest');

let runtimeBytes = 0;
function inspectSvg(relative, expectedViewBox = '0 0 480 640', includeInBudget = true) {
    const absolute = join(ART_ROOT, relative);
    let stat;
    try { stat = statSync(absolute); } catch {
        fail(`missing art asset: ${relative}`);
        return;
    }
    if (!stat.isFile() || stat.size === 0) {
        fail(`empty art asset: ${relative}`);
        return;
    }
    const body = readFileSync(absolute, 'utf8');
    if (!body.includes('<svg') || !body.includes(`viewBox="${expectedViewBox}"`)) {
        fail(`${relative} is not a valid expected-viewBox SVG`);
    }
    if (includeInBudget) runtimeBytes += stat.size;
}

for (const layer of layers) inspectSvg(layer.file);
inspectSvg(manifest.props?.['jade-vessel']?.file, '0 0 128 100');
inspectSvg(manifest.support?.fallback);
inspectSvg(manifest.support?.reference, '0 0 480 640', false);

if (!manifest.layers?.find(layer => layer.id === 'garden-mid-lit')?.litDelta ||
    !manifest.layers?.find(layer => layer.id === 'foreground-lit')?.litDelta) {
    fail('lit delta layers must stay explicitly marked in manifest');
}
if (runtimeBytes > manifest.runtimeBudgetBytes?.hard) {
    fail(`runtime art pack is ${runtimeBytes} bytes; hard budget is ${manifest.runtimeBudgetBytes?.hard}`);
} else {
    pass(`runtime art pack is ${runtimeBytes} bytes`);
}

for (const needle of ['ART_URLS', 'loadSilkDewArt', 'onFallback', 'ART_LOAD_TIMEOUT_MS', 'setTimeout']) {
    if (!art.includes(needle)) fail(`art loader is missing ${needle}`);
}
const literalAssetUrls = [
    '../assets/silk-dew/layers/sky.svg',
    '../assets/silk-dew/layers/moon-mountains.svg',
    '../assets/silk-dew/layers/garden-back.svg',
    '../assets/silk-dew/layers/garden-mid.svg',
    '../assets/silk-dew/layers/garden-mid-lit.svg',
    '../assets/silk-dew/layers/foreground.svg',
    '../assets/silk-dew/layers/foreground-lit.svg',
    '../assets/silk-dew/props/jade-vessel.svg',
    '../assets/silk-dew/layers/fallback.svg',
];
for (const assetUrl of literalAssetUrls) {
    if (!art.includes(`new URL('${assetUrl}', import.meta.url)`)) {
        fail(`production art URL must stay statically analyzable: ${assetUrl}`);
    }
}
if (art.includes('new URL(layer.file') || art.includes('new URL(SILK_DEW_MANIFEST')) {
    fail('production art URLs must not be constructed from runtime manifest file values');
}
for (const needle of [
    'createSilkDewScene',
    'LIGHT_SCALE = 0.5',
    'buildStaticCaches',
    'backgroundFarCache',
    'backgroundMidCache',
    'foregroundCache',
    'midLitDeltaCache',
    'foregroundLitDeltaCache',
    'midOffset',
    'foregroundOffset',
    'drawBackground',
    'drawForeground',
    'drawLocalLight',
    'drawVessel',
]) {
    if (!scene.includes(needle)) fail(`scene compositor is missing ${needle}`);
}
if (scene.includes('litDeltaCache =')) fail('lit deltas must remain split so each follows its foliage drift');

for (const needle of [
    'createSilkDewScene',
    'collectLightSources',
    'usesProductionArt',
    "data-theme') !== 'light'",
    'windGradientCache',
    'visualTime = this.reducedMotion ? 0 : this.time',
    'for (let thornIndex = 0; thornIndex < this.world.thorns.length; thornIndex++)',
    'drawForeground',
    'drawLocalLight',
    'prefers-reduced-motion',
]) {
    if (!game.includes(needle)) fail(`game runtime is missing ${needle}`);
}
if (game.includes('this.time * (22 + speed * 0.015)')) {
    fail('wind flow must use reduced-motion-aware visualTime');
}
if (game.includes('this.time * 1.7 + t.i')) {
    fail('thorn pulse must not depend on missing runtime t.i');
}
const windGradientCreates = game.match(/createLinearGradient\(w\.x, w\.y, w\.x \+ w\.w, w\.y \+ w\.h\)/g) || [];
if (windGradientCreates.length !== 1 || !game.includes('this.windGradientCache.get(w)')) {
    fail('wind zone gradient must be cached instead of allocated per frame');
}
if (!html.includes('id="sd-stage" data-art-state="loading"')) fail('stage art-state loading hook is missing');
if (/[💧🧵📅🏆]/u.test(html)) fail('silk-dew.html still contains art emoji placeholders');
if (/[🧵📅]/u.test(game)) fail('localized Silkfall mode labels still contain emoji placeholders');
if (!css.includes('.sd-stage[data-art-state="loading"]::after')) fail('loading art state has no UI treatment');
if (!css.includes('@media (prefers-reduced-motion: reduce)')) fail('reduced-motion CSS contract is missing');
if (!verifyAll.includes("name: 'silk-dew-art'")) fail('verify-all is missing silk-dew-art');
for (const needle of [
    "attachDiagnostics(page, 'main')",
    "attachDiagnostics(mobile, 'mobile')",
    "attachDiagnostics(lightPage, 'light')",
    "attachDiagnostics(reducedPage, 'reduced-motion')",
    "target.on('requestfailed'",
    'isGardenMidProductionUrl',
]) {
    if (!smoke.includes(needle)) fail(`smoke diagnostics contract is missing ${needle}`);
}
const fallbackBlock = smoke.slice(
    smoke.indexOf('/* ── 11. 生产图层故障降级'),
    smoke.indexOf('/* ── 12. 噪声过滤后的页面错误')
);
for (const needle of [
    "attachDiagnostics(fallbackPage, 'fallback', { allowRequestFailure: isGardenMidProductionUrl })",
    "localStorage.setItem('site_theme', 'dark')",
    'interceptedGardenMid !== 1',
    'productionArt: g.usesProductionArt()',
    'fallbackReady: g.scene?.debug?.fallbackReady',
    'fallbackDrawCount: g.scene?.debug?.fallbackDrawCount || 0',
    'fallback 测试未在生产美术启用状态运行',
    'fallback 状态成立但 fallback 画板未实际绘制',
]) {
    if (!fallbackBlock.includes(needle)) fail(`fallback smoke contract is missing ${needle}`);
}
if (!scene.includes('fallbackDrawCount++') || !scene.includes('fallbackReady: !!art.fallback')) {
    fail('scene debug must prove that the fallback plate actually rendered');
}
if (!levels.includes('export const LEVELS') || !levels.includes('export function stepWorld')) fail('physics source contract unexpectedly changed shape');

if (errors.length) {
    console.error('\n垂丝引露美术契约校验失败：');
    errors.forEach(message => console.error(`✗ ${message}`));
    process.exit(1);
}
checks.forEach(message => console.log(`✓ ${message}`));
console.log('垂丝引露美术契约校验通过');
