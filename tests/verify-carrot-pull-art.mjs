import { readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART_ROOT = join(ROOT, 'assets', 'carrot-pull');
const manifestPath = join(ART_ROOT, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const html = readFileSync(join(ROOT, 'carrot-pull.html'), 'utf8');
const artModule = readFileSync(join(ROOT, 'src', 'games', 'carrot-pull', 'render', 'art.js'), 'utf8');
const sceneModule = readFileSync(join(ROOT, 'src', 'games', 'carrot-pull', 'render', 'scene.js'), 'utf8');
const fallbackModule = readFileSync(join(ROOT, 'src', 'games', 'carrot-pull', 'render', 'fallback-scene.js'), 'utf8');

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

// 角色锚点只认 manifest.anchors：精灵的 sceneAnchorLogicalPx / scale、运行时 SCENE（动画每帧据此重写变换）
// 与 HTML 初始变换都要与它一致，否则只改 manifest 时角色仍画在旧位置而校验全绿。
const { SCENE, PRODUCTION_ATTACH } = await import('../src/games/carrot-pull/render/scene.js');
const groupTransform = id => html.match(new RegExp(`<g id="${id}" transform="([^"]+)"`))?.[1];
const svgNumber = value => String(value).replace(/^0\./, '.');
const CHARACTERS = {
    carrot: { sprites: ['carrot'], group: 'cp-carrot' },
    girl: { sprites: ['girl-happy', 'girl-oops'], group: 'cp-girl' },
    mole: { sprites: ['mole-happy', 'mole-oops'], group: 'cp-mole' },
};
Object.entries(CHARACTERS).forEach(([name, { sprites, group }]) => {
    const anchor = manifest.anchors?.[name];
    if (!Array.isArray(anchor) || anchor.length !== 2 || !anchor.every(Number.isFinite)) {
        fail(`manifest anchors.${name} must be [x, y]`);
        return;
    }
    const scale = manifest.sprites?.[sprites[0]]?.scale;
    sprites.forEach((id) => {
        const sprite = manifest.sprites?.[id];
        if (!sprite) fail(`manifest is missing required sprite ${id}`);
        else if (!same(sprite.sceneAnchorLogicalPx, anchor) || sprite.scale !== scale) {
            fail(`sprite ${id} anchor/scale drifted from manifest anchors.${name} / ${sprites[0]}`);
        }
        if (!html.includes(`data-art-sprite="${id}"`)) fail(`carrot-pull.html does not draw required sprite ${id}`);
        if (!artModule.includes(`'${id}'`) && !artModule.includes(`${id}:`)) fail(`art loader does not preload required sprite ${id}`);
    });
    const runtime = SCENE[name];
    if (!runtime || runtime.x !== anchor[0] || runtime.y !== anchor[1] || runtime.s !== scale) {
        fail(`SCENE.${name} in carrot-pull-scene.js drifted from manifest anchors.${name}${scale ? ` / scale ${scale}` : ''}`);
    }
    const transform = groupTransform(group) || '';
    if (!transform.startsWith(`translate(${anchor.join(' ')})`)
        || (scale ? !transform.includes(`scale(${svgNumber(scale)})`) : /scale\(/.test(transform))) {
        fail(`#${group} transform "${transform}" drifted from manifest anchors.${name}${scale ? ` / scale ${scale}` : ''}`);
    }
});
if (!errors.length) pass('carrot / girl / mole anchors: manifest = sprites = SCENE = markup');

const layers = manifest.layers || [];
const layerIds = layers.map(layer => layer.id);
const expectedLayers = ['sky', 'clouds', 'hills-farm', 'garden-mid', 'soil-back', 'soil-front', 'foreground'];
if (!same(layerIds, expectedLayers)) fail(`layer order must be ${expectedLayers.join(' → ')}`);
const zValues = [
    ...layers.map(layer => layer.z),
    ...Object.values(manifest.sprites || {}).map(sprite => sprite.z),
];
if (zValues.some(value => !Number.isFinite(value))) fail('runtime art z values must be numeric');
// 挂点坐标只在 manifest 里写一次；这里只校验结构，运行时 / 标记里的副本在下面逐项与 manifest 比对。
const isPointList = points => Array.isArray(points) && points.length > 0
    && points.every(pt => Array.isArray(pt) && pt.length === 2 && pt.every(Number.isFinite));
const crownAttach = manifest.attachments?.['carrot.crown'];
const fistAttach = manifest.attachments?.['girl.fists'];
if (crownAttach?.sprite !== 'carrot' || !isPointList(crownAttach?.points)) fail('manifest carrot.crown must be a point list on the carrot sprite');
if (fistAttach?.sprite !== 'girl-happy' || !isPointList(fistAttach?.points)) fail('manifest girl.fists must be a point list on the girl-happy sprite');
if (crownAttach?.points?.length !== fistAttach?.points?.length) fail('carrot.crown and girl.fists must pair up one stem per point');
const fistClip = fistAttach?.overlayClipLocalLogicalPx;
if (!Array.isArray(fistClip) || fistClip.length !== 4 || !fistClip.every(Number.isFinite) || fistClip[2] <= 0 || fistClip[3] <= 0) {
    fail('manifest girl.fists.overlayClipLocalLogicalPx must be [x, y, width, height]');
}
// 女孩精灵自带双臂；再叠 girl-hands 精灵就是「上下两层、多出两只更粗的胳膊」
if (manifest.sprites?.['girl-hands'] || manifest.attachments?.['girl.hands']) fail('girl-hands sprite would draw a second pair of arms');
if (html.includes('data-art-sprite="girl-hands"') || artModule.includes("'girl-hands'")) fail('girl-hands sprite is still drawn or preloaded');
// 拳头挂点、拳头裁切框、拳头重绘层的变换在 HTML / 运行时各写了一份；全部以 manifest 为准逐项比对，
// 否则日后改美术坐标时拳头层会与叶柄末端错位（盖不住叶柄），而校验仍然全绿。
if (!same(PRODUCTION_ATTACH.crown, crownAttach?.points)) {
    fail('PRODUCTION_ATTACH.crown in carrot-pull-scene.js drifted from manifest carrot.crown');
}
if (!same(PRODUCTION_ATTACH.hands, fistAttach?.points)) {
    fail('PRODUCTION_ATTACH.hands in carrot-pull-scene.js drifted from manifest girl.fists');
}
const clipRect = html.match(/<clipPath id="cp-girl-fists-clip"[^>]*>\s*<rect ([^>]*)\/>/)?.[1] || '';
const clipBox = ['x', 'y', 'width', 'height'].map(key => Number(clipRect.match(new RegExp(`\\b${key}="([^"]+)"`))?.[1]));
if (!same(clipBox, fistClip)) {
    fail(`#cp-girl-fists-clip rect ${clipBox.join(',')} drifted from manifest girl.fists.overlayClipLocalLogicalPx`);
}
const fistsInsideClip = Array.isArray(fistClip) && isPointList(fistAttach?.points) && fistAttach.points.every(([x, y]) => (
    x >= fistClip[0] && x <= fistClip[0] + fistClip[2] && y >= fistClip[1] && y <= fistClip[1] + fistClip[3]
));
if (!fistsInsideClip) fail('girl.fists points must lie inside overlayClipLocalLogicalPx, or the fist overlay cannot cover the stem ends');
const girlTransform = groupTransform('cp-girl');
if (!girlTransform || groupTransform('cp-girl-fists') !== girlTransform) {
    fail('#cp-girl-fists must share #cp-girl\'s transform so the clipped fists sit on her own hands');
}
if (!errors.length) pass('runtime attach points, fist clip and fist overlay transform match manifest');
if (manifest.sprites?.['mole-paws'] || manifest.attachments?.['mole.paws']) fail('residual mole paws must not be part of the runtime art contract');

layers.forEach((layer) => {
    inspectFile(layer.file, [1120, 1440], layer.alphaRequired);
    if (!same(layer.sourceRectRasterPx, [0, 0, 1120, 1440]) || !same(layer.destRectLogicalPx, [0, 0, 560, 720])) {
        fail(`${layer.id} must cover the complete 2× scene plate`);
    }
});
Object.values(manifest.sprites || {}).forEach(sprite => inspectFile(sprite.file, sprite.rasterSizePx, sprite.alphaRequired));

// 预算只统计运行时真正下载的文件（加载器的 ART_URLS：预览 + 已接入的图层 + 精灵），
// 而不是 manifest 里登记的全部 —— 不绘制的错位图层不该占预算，加载器多拉的文件也不能漏算。
const { ART_URLS } = await import('../src/games/carrot-pull/render/art.js');
const drawnLayers = [...html.matchAll(/data-art-layer="([^"]+)"/g)].map(match => match[1]).sort();
if (!same(Object.keys(ART_URLS.layers).sort(), drawnLayers)) {
    fail(`art loader layers (${Object.keys(ART_URLS.layers).join(', ')}) must match the layers the page draws (${drawnLayers.join(', ')})`);
}
const artFile = href => fileURLToPath(href).slice(ART_ROOT.length + 1).split('\\').join('/');
Object.entries(ART_URLS.layers).forEach(([id, href]) => {
    if (layers.find(layer => layer.id === id)?.file !== artFile(href)) fail(`art loader layer ${id} is not the manifest's ${id} layer file`);
});
Object.entries(ART_URLS.sprites).forEach(([id, href]) => {
    if (manifest.sprites?.[id]?.file !== artFile(href)) fail(`art loader sprite ${id} is not the manifest's ${id} sprite file`);
});
const runtimeFiles = [ART_URLS.preview, ...Object.values(ART_URLS.layers), ...Object.values(ART_URLS.sprites)].map(fileURLToPath);
let runtimeBytes = 0;
runtimeFiles.forEach((file) => {
    try { runtimeBytes += statSync(file).size; } catch { fail(`art loader requests a missing file: ${file}`); }
});
if (runtimeBytes > manifest.runtimeBudgetBytes.hard) fail(`runtime art download is ${runtimeBytes} bytes; hard budget is ${manifest.runtimeBudgetBytes.hard}`);
else pass(`runtime art download is ${runtimeBytes} bytes across ${runtimeFiles.length} loader files`);

['reference/concept-garden.webp', 'layers/loading-preview.webp', 'ui/carrot-mark.svg'].forEach((relative) => {
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
// 生产场景的绘制顺序（SVG 文档序）必须严格按 manifest 的 z 升序（计划 §7.1「严格升序绘制」）：
// 手改 HTML 把鼹鼠挪到萝卜前、或把叶柄挪到女孩身上时，这里直接变红。
// 逐个检查 <g data-art-render> 的每个直接子元素：要么是 manifest 图层，要么是登记了 z 的组；
// 其余一律报错（不静默跳过）。只有不参与绘制的注释与 <clipPath> 事先剔除。
const layerZ = Object.fromEntries(layers.map(layer => [layer.id, layer.z]));
const GROUP_Z = {
    'cp-mole': manifest.sprites?.['mole-happy']?.z,
    'cp-stems-girl': manifest.dynamicZ?.leafStems,
    'cp-carrot': manifest.sprites?.carrot?.z,
    'cp-girl': manifest.sprites?.['girl-happy']?.z,
    'cp-girl-fists': manifest.dynamicZ?.girlFists,
    'cp-particles': manifest.dynamicZ?.particles,
    'cp-tug-lines': manifest.dynamicZ?.tugLines,
};
const RENDER_OPEN = '<g data-art-render>';
const renderBody = productionMarkup.includes(RENDER_OPEN)
    ? productionMarkup.slice(productionMarkup.indexOf(RENDER_OPEN) + RENDER_OPEN.length)
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<clipPath\b[\s\S]*?<\/clipPath>/g, '')
    : '';
if (!renderBody) fail('production scene is missing <g data-art-render>');
const drawOrder = [];
let depth = 0;
for (const [, closing, tag, attrs, selfClosing] of renderBody.matchAll(/<(\/)?([a-zA-Z]+)\b([^>]*?)(\/)?>/g)) {
    if (closing) {
        if (depth === 0) break; // </g> of data-art-render itself
        depth -= 1;
        continue;
    }
    if (depth === 0) {
        const layer = attrs.match(/\bdata-art-layer="([^"]+)"/)?.[1];
        const id = attrs.match(/\bid="([^"]+)"/)?.[1];
        if (tag === 'image' && layer) drawOrder.push({ name: layer, z: layerZ[layer] });
        else if (tag === 'g' && id && id in GROUP_Z) drawOrder.push({ name: `#${id}`, z: GROUP_Z[id] });
        else drawOrder.push({ name: `<${tag}${id ? ` id="${id}"` : ''}>`, z: undefined });
    }
    if (!selfClosing) depth += 1;
}
const unregistered = drawOrder.filter(entry => !Number.isFinite(entry.z));
unregistered.forEach(entry => fail(`production scene draws ${entry.name}, which has no z in manifest.json`));
Object.keys(GROUP_Z).forEach((group) => {
    if (!drawOrder.some(entry => entry.name === `#${group}`)) fail(`production scene is missing #${group}`);
});
const registered = drawOrder.filter(entry => Number.isFinite(entry.z));
const outOfOrder = registered.findIndex((entry, i) => i > 0 && !(entry.z > registered[i - 1].z));
if (outOfOrder > 0) {
    fail(`production draw order breaks manifest z: ${registered[outOfOrder - 1].name} (z ${registered[outOfOrder - 1].z}) → ${registered[outOfOrder].name} (z ${registered[outOfOrder].z})`);
}
if (!(manifest.dynamicZ?.hitTarget > Math.max(...registered.map(entry => entry.z)))) {
    fail('manifest dynamicZ.hitTarget must sit above everything the production scene draws');
}
if (html.indexOf('id="cp-carrot-hit"') < html.indexOf('id="cp-fallback-scene"')) {
    fail(`#cp-carrot-hit (z ${manifest.dynamicZ?.hitTarget}) must be drawn after both scenes`);
}
if (drawOrder.length && !unregistered.length && outOfOrder <= 0) pass(`production draw order follows manifest z: ${drawOrder.map(entry => `${entry.name}(${entry.z})`).join(' → ')}`);
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
