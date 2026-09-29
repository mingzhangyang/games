#!/usr/bin/env node
// 针尖对麦芒生产美术契约校验：尺寸、透明度、层序、预算与运行时接线。
import { readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART_ROOT = join(ROOT, 'assets', 'needle-awn');
const manifest = JSON.parse(readFileSync(join(ART_ROOT, 'manifest.json'), 'utf8'));
const html = readFileSync(join(ROOT, 'needle-awn.html'), 'utf8');
const gameModule = readFileSync(join(ROOT, 'js', 'needle-awn.js'), 'utf8');
const artModule = readFileSync(join(ROOT, 'js', 'needle-awn-art.js'), 'utf8');
const sceneModule = readFileSync(join(ROOT, 'js', 'needle-awn-scene.js'), 'utf8');
const verifyAll = readFileSync(join(ROOT, 'tests', 'verify-all.mjs'), 'utf8');
const { NEEDLE_AWN_MANIFEST: runtimeManifest } = await import('../js/needle-awn-art.js');

const errors = [];
const checks = [];
const fail = message => errors.push(message);
const pass = message => checks.push(message);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const expectedRuntimeManifest = {
    version: manifest.version,
    coordinateSystem: {
        width: manifest.coordinateSystem?.width,
        height: manifest.coordinateSystem?.height,
        rasterScale: manifest.coordinateSystem?.rasterScale,
    },
    layers: (manifest.layers || []).map(({ id, file, z, alphaRequired }) => ({ id, file, z, alphaRequired })),
    bosses: Object.fromEntries(Object.entries(manifest.bosses || {}).map(([id, boss]) => [id, {
        file: boss.file,
        localRectLogicalPx: boss.localRectLogicalPx,
        pivotLocalLogicalPx: boss.pivotLocalLogicalPx,
    }])),
    support: {
        reference: manifest.support?.reference,
        fallback: manifest.support?.fallback,
    },
    dynamicZ: manifest.dynamicZ,
    runtimeBudgetBytes: manifest.runtimeBudgetBytes,
};

if (!same(runtimeManifest, expectedRuntimeManifest)) {
    fail('js/needle-awn-art.js runtime manifest is out of sync with assets/needle-awn/manifest.json');
} else {
    pass('runtime manifest matches the source manifest');
}

function readAscii(buffer, offset, length) {
    return buffer.toString('ascii', offset, offset + length);
}

function u24(buffer, offset) {
    return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function parseWebp(buffer) {
    if (readAscii(buffer, 0, 4) !== 'RIFF' || readAscii(buffer, 8, 4) !== 'WEBP') return null;
    let offset = 12;
    let result = null;
    while (offset + 8 <= buffer.length) {
        const type = readAscii(buffer, offset, 4);
        const size = buffer.readUInt32LE(offset + 4);
        const payload = offset + 8;
        if (payload + size > buffer.length) break;
        if (type === 'VP8X' && size >= 10) {
            result = {
                width: 1 + u24(buffer, payload + 4),
                height: 1 + u24(buffer, payload + 7),
                alpha: Boolean(buffer[payload] & 0x10),
                codec: 'VP8X',
            };
        } else if (!result && type === 'VP8L' && size >= 5 && buffer[payload] === 0x2f) {
            const width = 1 + ((buffer[payload + 1] | ((buffer[payload + 2] & 0x3f) << 8)) & 0x3fff);
            const height = 1 + (((buffer[payload + 2] >> 6) | (buffer[payload + 3] << 2) | ((buffer[payload + 4] & 0x0f) << 10)) & 0x3fff);
            result = { width, height, alpha: true, codec: 'VP8L' };
        } else if (!result && type === 'VP8 ' && size >= 12 && buffer[payload + 3] === 0x9d && buffer[payload + 4] === 0x01 && buffer[payload + 5] === 0x2a) {
            result = {
                width: buffer.readUInt16LE(payload + 6) & 0x3fff,
                height: buffer.readUInt16LE(payload + 8) & 0x3fff,
                alpha: false,
                codec: 'VP8 ',
            };
        }
        offset = payload + size + (size % 2);
    }
    return result;
}

function inspectFile(relative, expectedSize, alphaRequired) {
    const absolute = join(ART_ROOT, relative);
    let stat;
    try {
        stat = statSync(absolute);
    } catch {
        fail(`missing asset: ${relative}`);
        return 0;
    }
    if (!stat.isFile() || stat.size === 0) {
        fail(`empty asset: ${relative}`);
        return 0;
    }
    const parsed = parseWebp(readFileSync(absolute));
    if (!parsed) {
        fail(`not a readable WebP: ${relative}`);
        return stat.size;
    }
    if (expectedSize && !same([parsed.width, parsed.height], expectedSize)) {
        fail(`${relative} is ${parsed.width}×${parsed.height}; expected ${expectedSize[0]}×${expectedSize[1]}`);
    }
    if (alphaRequired && !parsed.alpha) fail(`${relative} requires an alpha channel (${parsed.codec})`);
    return stat.size;
}

function inspectSupportFile(relative) {
    if (!relative) {
        fail('support asset path is missing');
        return 0;
    }
    const absolute = join(ART_ROOT, relative);
    try {
        const stat = statSync(absolute);
        if (!stat.isFile() || stat.size === 0) fail(`empty support asset: ${relative}`);
        return stat.size;
    } catch {
        fail(`missing support asset: ${relative}`);
        return 0;
    }
}

if (!same([manifest.coordinateSystem?.width, manifest.coordinateSystem?.height], [480, 640])) {
    fail('coordinate system must remain 480×640 logical px');
} else if (manifest.coordinateSystem?.rasterScale !== 2) {
    fail('raster scale must remain 2×');
} else {
    pass('480×640 logical scene / 2× raster contract');
}

const layers = manifest.layers || [];
const expectedLayers = ['sky-ink', 'mountains', 'mist', 'arena-floor', 'foreground'];
if (!same(layers.map(layer => layer.id), expectedLayers)) {
    fail(`layer order must be ${expectedLayers.join(' → ')}`);
}
const zValues = layers.map(layer => layer.z);
if (zValues.some(value => !Number.isFinite(value)) || zValues.some((value, index) => index > 0 && value <= zValues[index - 1])) {
    fail('scene layer z values must be numeric and strictly increasing');
} else {
    pass('scene layers have deterministic z order');
}

let runtimeBytes = 0;
for (const layer of layers) {
    runtimeBytes += inspectFile(layer.file, [960, 1280], layer.alphaRequired);
    if (!same(layer.sourceRectRasterPx, [0, 0, 960, 1280]) || !same(layer.destRectLogicalPx, [0, 0, 480, 640])) {
        fail(`${layer.id} must cover the complete 2× scene plate`);
    }
}

const expectedBosses = ['needle_sovereign', 'awn_emperor', 'grandmaster'];
if (!same(Object.keys(manifest.bosses || {}), expectedBosses)) fail('Boss manifest must include all three formal 法相');
for (const [id, boss] of Object.entries(manifest.bosses || {})) {
    runtimeBytes += inspectFile(boss.file, [384, 384], boss.alphaRequired);
    if (!same(boss.localRectLogicalPx, [-48, -48, 96, 96]) || !same(boss.pivotLocalLogicalPx, [0, 0])) {
        fail(`${id} visual shell pivot/local rect drifted from the collision contract`);
    }
}

// These files are loaded by loadNeedleAwnArt at runtime as well. The reference
// image is documentation-only and must stay outside the runtime budget.
runtimeBytes += inspectSupportFile(manifest.support?.fallback);
for (const relative of [
    'ui/stance-needle.svg',
    'ui/stance-awn.svg',
    'ui/lotus-mark.svg',
]) {
    runtimeBytes += inspectSupportFile(relative);
}
inspectSupportFile(manifest.support?.reference);

if (runtimeBytes > manifest.runtimeBudgetBytes?.hard) {
    fail(`runtime art pack is ${runtimeBytes} bytes; hard budget is ${manifest.runtimeBudgetBytes?.hard}`);
} else {
    pass(`runtime art pack is ${runtimeBytes} bytes`);
}
if (runtimeBytes > manifest.runtimeBudgetBytes?.ideal) pass('runtime art pack stays below the hard cap; ideal budget note recorded');

if (!html.includes('id="na-stage"') || !html.includes('data-art-state="loading"') || !html.includes('id="na-canvas"')) {
    fail('needle-awn.html is missing stage/canvas art hooks');
}
for (const ui of ['stance-needle', 'stance-awn', 'lotus-mark']) {
    if (!html.includes(`data-art-ui="${ui}"`)) fail(`needle-awn.html is missing formal UI hook: ${ui}`);
}
if (/⚡|🌾|🔄|🌟|🥕|🗡️|⭐|🔒/u.test(html)) fail('needle-awn.html still contains an art emoji placeholder');

for (const needle of ['ART_UI', 'ART_URLS', 'loadNeedleAwnArt', 'onFallback', 'ART_LOAD_TIMEOUT_MS']) {
    if (!artModule.includes(needle)) fail(`art loader is missing ${needle}`);
}
if (/import\s+manifest\s+from\s+['"].*\.json/u.test(artModule)) fail('art loader must remain directly loadable by the static browser smoke');
for (const needle of ['createNeedleAwnScene', 'drawBackground', 'drawForeground', 'drawBoss', 'drawHitbox', 'cache']) {
    if (!sceneModule.includes(needle)) fail(`scene module is missing ${needle}`);
}
for (const needle of ['createNeedleAwnScene', 'loadNeedleAwnArt', 'debug-hitbox', 'checkTipClash', 'tipDistance']) {
    if (!gameModule.includes(needle)) fail(`game runtime is missing ${needle}`);
}
if (gameModule.includes('gridDrift') || gameModule.includes('bgBlobs') || gameModule.includes('strokeRect(16, 16')) {
    fail('legacy drifting grid background remains in the game render path');
}
if (!same(Object.keys(manifest.dynamicZ || {}), ['bullets', 'enemies', 'boss', 'players', 'particles', 'foreground', 'debugHitbox'])) {
    fail('dynamic z contract must keep foreground/debugHitbox after gameplay entities');
}
if (!verifyAll.includes("name: 'needle-awn-art'") || !verifyAll.includes("name: 'smoke-needle-awn'")) {
    fail('verify-all is missing the needle-awn art and smoke suites');
}

if (errors.length) {
    console.error('\n针尖对麦芒美术契约校验失败：');
    errors.forEach(message => console.error(`✗ ${message}`));
    process.exit(1);
}
checks.forEach(message => console.log(`✓ ${message}`));
console.log('针尖对麦芒美术契约校验通过');
