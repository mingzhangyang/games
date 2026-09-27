import { readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART_ROOT = join(ROOT, 'assets', 'carrot-pull');
const manifestPath = join(ART_ROOT, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const html = readFileSync(join(ROOT, 'carrot-pull.html'), 'utf8');
const artModule = readFileSync(join(ROOT, 'js', 'carrot-pull-art.js'), 'utf8');
const sceneModule = readFileSync(join(ROOT, 'js', 'carrot-pull-scene.js'), 'utf8');
const fallbackModule = readFileSync(join(ROOT, 'js', 'carrot-pull-fallback-scene.js'), 'utf8');

const errors = [];
const checks = [];
const fail = message => errors.push(message);
const pass = message => checks.push(message);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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
        return;
    }
    if (!stat.isFile() || stat.size === 0) {
        fail(`empty asset: ${relative}`);
        return;
    }
    const parsed = parseWebp(readFileSync(absolute));
    if (!parsed) {
        fail(`not a readable WebP: ${relative}`);
        return;
    }
    if (expectedSize && !same([parsed.width, parsed.height], expectedSize)) {
        fail(`${relative} is ${parsed.width}×${parsed.height}; expected ${expectedSize[0]}×${expectedSize[1]}`);
    }
    if (alphaRequired && !parsed.alpha) fail(`${relative} requires an alpha channel (${parsed.codec})`);
}

if (manifest.coordinateSystem?.width !== 560 || manifest.coordinateSystem?.height !== 720) {
    fail('coordinate system must remain 560×720 logical px');
} else if (manifest.coordinateSystem?.rasterScale !== 2) {
    fail('raster scale must remain 2×');
} else {
    pass('560×720 logical scene / 2× raster contract');
}

const expectedAnchors = {
    carrot: [316, 506],
    girl: [186, 692],
    mole: [470, 620],
};
Object.entries(expectedAnchors).forEach(([name, point]) => {
    if (!same(manifest.anchors?.[name], point)) fail(`${name} anchor drifted from ${point.join(',')}`);
});
if (!errors.length) pass('carrot / girl / mole anchors match plan');

const layers = manifest.layers || [];
const layerIds = layers.map(layer => layer.id);
const expectedLayers = ['sky', 'clouds', 'hills-farm', 'garden-mid', 'soil-back', 'soil-front', 'foreground'];
if (!same(layerIds, expectedLayers)) fail(`layer order must be ${expectedLayers.join(' → ')}`);
const zValues = [
    ...layers.map(layer => layer.z),
    ...Object.values(manifest.sprites || {}).map(sprite => sprite.z),
];
if (zValues.some(value => !Number.isFinite(value))) fail('runtime art z values must be numeric');
if (!same(manifest.attachments?.['carrot.crown']?.points, [[-8, -22], [0, -24], [8, -22]])) fail('carrot crown attachment drifted');
if (!same(manifest.attachments?.['girl.hands']?.points, [[38, -218], [32, -210], [26, -200]])) fail('girl hand attachment drifted');
if (manifest.sprites?.['mole-paws'] || manifest.attachments?.['mole.paws']) fail('residual mole paws must not be part of the runtime art contract');

let runtimeBytes = 0;
layers.forEach((layer) => {
    inspectFile(layer.file, [1120, 1440], layer.alphaRequired);
    try { runtimeBytes += statSync(join(ART_ROOT, layer.file)).size; } catch { /* reported above */ }
    if (!same(layer.sourceRectRasterPx, [0, 0, 1120, 1440]) || !same(layer.destRectLogicalPx, [0, 0, 560, 720])) {
        fail(`${layer.id} must cover the complete 2× scene plate`);
    }
});
Object.values(manifest.sprites || {}).forEach((sprite) => {
    inspectFile(sprite.file, sprite.rasterSizePx, sprite.alphaRequired);
    try { runtimeBytes += statSync(join(ART_ROOT, sprite.file)).size; } catch { /* reported above */ }
});
if (runtimeBytes > manifest.runtimeBudgetBytes.hard) fail(`runtime art pack is ${runtimeBytes} bytes; hard budget is ${manifest.runtimeBudgetBytes.hard}`);
else pass(`runtime art pack is ${runtimeBytes} bytes`);

['reference/concept-garden.webp', 'layers/loading-preview.webp', 'ui/carrot-mark.svg', 'ui/pull-arrow.svg'].forEach((relative) => {
    try {
        if (statSync(join(ART_ROOT, relative)).size === 0) fail(`empty support asset: ${relative}`);
    } catch {
        fail(`missing support asset: ${relative}`);
    }
});

if (!html.includes('data-art-production') || !html.includes('data-art-layer="sky"') || !html.includes('id="cp-fallback-scene"')) {
    fail('carrot-pull.html is missing production/fallback scene hooks');
}
if (!html.includes('data-art-ui="carrot-mark"') || !html.includes('<svg class="cp-pull-arrow"') || !html.includes('M16 27V7')) {
    fail('carrot-pull.html is missing stable inline UI icons');
}
if (html.includes('cp-mole-paws') || html.includes('cp-stems-mole') || html.includes('data-art-sprite="mole-paws"')) {
    fail('carrot-pull.html still contains residual mole overlays');
}
if (fallbackModule.includes('cp-fallback-mole-paws') || fallbackModule.includes('cp-fallback-stems-mole')) {
    fail('fallback scene still contains residual mole overlays');
}
if (artModule.includes("'mole-paws'")) {
    fail('art loader still requests the residual mole paws sprite');
}
if (/[🥕↟]/u.test(html)) fail('carrot-pull.html still contains an emoji art placeholder');
const productionMarkup = html.split('id="cp-art-production"')[1]?.split('id="cp-fallback-scene"')[0] || '';
const inlinePathCount = (productionMarkup.match(/<path\b/g) || []).length;
if (inlinePathCount > 12) fail(`production scene has ${inlinePathCount} inline paths; storybook art should live in assets`);
else pass(`${inlinePathCount} inline paths remain for interaction scaffolding`);

['new URL', 'artState', 'onFallback', 'ART_UI'].forEach((needle) => {
    if (!artModule.includes(needle)) fail(`art loader is missing ${needle}`);
});
['createSceneAnimator', 'harvest', 'miss', 'tick'].forEach((needle) => {
    if (!sceneModule.includes(needle)) fail(`production animator is missing ${needle}`);
});
if (!fallbackModule.includes('createCarrotPullFallbackScene') || !fallbackModule.includes('createSceneAnimator')) {
    fail('fallback scene module is not wired to the shared animation API');
}
if (html.includes('data:image') && /🥕/u.test(html)) fail('emoji leaked into HTML data');

if (errors.length) {
    console.error('\n拔萝卜美术契约校验失败：');
    errors.forEach(message => console.error(`✗ ${message}`));
    process.exit(1);
}
checks.forEach(message => console.log(`✓ ${message}`));
console.log('拔萝卜美术契约校验通过');
