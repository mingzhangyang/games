#!/usr/bin/env node
/**
 * math-rain art contract verifier.
 *
 * This verifier is intentionally server-free so it can run before a browser
 * is available. Runtime interaction coverage remains in smoke-math-rain.
 */
import { readFileSync, statSync, existsSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const fails = [];
const fail = message => fails.push(message);

const read = path => readFileSync(path, 'utf8');
const exists = path => existsSync(path);
const assert = (condition, message) => {
    if (!condition) fail(message);
};

function listFiles(dir) {
    if (!exists(dir)) return [];
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const path = join(dir, entry.name);
        return entry.isDirectory() ? listFiles(path) : [path];
    });
}

function readWebpSize(path) {
    const buffer = readFileSync(path);
    assert(buffer.subarray(0, 4).toString('ascii') === 'RIFF', `${relative(ROOT, path)} 不是 RIFF WebP`);
    assert(buffer.subarray(8, 12).toString('ascii') === 'WEBP', `${relative(ROOT, path)} 不是 WEBP`);

    const chunk = buffer.subarray(12, 16).toString('ascii');
    if (chunk === 'VP8X') {
        const width = 1 + buffer[24] + (buffer[25] << 8) + (buffer[26] << 16);
        const height = 1 + buffer[27] + (buffer[28] << 8) + (buffer[29] << 16);
        return { width, height, bytes: buffer.byteLength };
    }
    if (chunk === 'VP8 ') {
        const frame = 20;
        const width = buffer.readUInt16LE(frame + 6) & 0x3fff;
        const height = buffer.readUInt16LE(frame + 8) & 0x3fff;
        return { width, height, bytes: buffer.byteLength };
    }
    return null;
}

const manifestPath = join(ROOT, 'assets/math-rain/manifest.json');
const manifest = JSON.parse(read(manifestPath));
assert(manifest.darkOnly === true, '美术 manifest 必须保持 darkOnly=true');
assert(manifest.theme === 'mathematical observatory', '美术 manifest 的主题标识不正确');

const requiredAssets = [
    'assets/math-rain/backgrounds/fallback.webp',
    'assets/math-rain/backgrounds/observatory-wide.webp',
    'assets/math-rain/backgrounds/observatory-mobile.webp',
    'assets/math-rain/reference/concept-observatory.webp',
    'assets/math-rain/ui/target-reticle.svg',
    'assets/math-rain/ui/freeze.svg',
    'assets/math-rain/ui/bomb.svg',
    'assets/math-rain/ui/shield.svg',
    'assets/math-rain/ui/coin.svg',
    'assets/math-rain/README.md',
];
for (const asset of requiredAssets) assert(exists(join(ROOT, asset)), `缺少美术资产：${asset}`);

const backgroundSizes = {};
for (const name of ['fallback', 'observatory-wide', 'observatory-mobile']) {
    const path = join(ROOT, `assets/math-rain/backgrounds/${name}.webp`);
    if (!exists(path)) continue;
    const size = readWebpSize(path);
    backgroundSizes[name] = size;
    assert(statSync(path).size > 1024, `${name}.webp 文件过小，疑似空占位图`);
}
assert(backgroundSizes['observatory-wide']?.width >= 1200, 'wide 背景分辨率不足');
assert(backgroundSizes['observatory-mobile']?.height >= 1000, 'mobile 背景分辨率不足');

const runtimeArtBytes = [
    ...listFiles(join(ROOT, 'assets/math-rain/backgrounds')),
    ...listFiles(join(ROOT, 'assets/math-rain/ui')),
].reduce((total, path) => total + statSync(path).size, 0);
assert(runtimeArtBytes <= 2_000_000, `运行时美术资产超过 2MB：${runtimeArtBytes} bytes`);

const html = read(join(ROOT, 'math-rain.html'));
const css = read(join(ROOT, 'css/math-rain/math-rain.css'));
const shopCss = read(join(ROOT, 'css/math-rain/shop.css'));
const mainJs = read(join(ROOT, 'js/math-rain/main.js'));

for (const id of ['game-area', 'game-canvas', 'target-area', 'target-number', 'tool-bar', 'shop-screen']) {
    assert(html.includes(`id="${id}"`), `math-rain.html 缺少 #${id}`);
}
for (const url of ['observatory-wide.webp', 'observatory-mobile.webp', 'fallback.webp']) {
    assert(css.includes(url), `math-rain.css 未声明 ${url}`);
}
assert(css.includes('pointer-events: none'), '背景装饰层必须 pointer-events:none，不能遮住 Canvas 命中');
assert(/#game-canvas[\s\S]*?background:\s*transparent/.test(css), 'Canvas 必须保持透明，让观测舱背景可见');
assert(css.includes('font-variant-numeric: tabular-nums'), 'HUD 数字必须使用等宽数字，避免跳动');
assert(css.includes('prefers-reduced-motion'), '美术动效必须提供 reduced-motion 降级');
assert(shopCss.includes('.shop-item') && shopCss.includes('.current-coins'), '商店样式未接入观测舱面板体系');

assert(mainJs.includes('getExpressionCardMetrics'), '表达式渲染缺少共享卡片几何');
assert(mainJs.includes('getExpressionBounds'), '表达式命中检测未复用共享几何');
assert(mainJs.includes('getExpressionHitBounds'), '表达式触控命中缺少独立热区几何');
assert(mainJs.includes('MIN_EXPRESSION_TOUCH_TARGET = 44'), '表达式触控热区下限必须为 44px');
assert(mainJs.includes('Math.max(visualBounds.width, MIN_EXPRESSION_TOUCH_TARGET)'), '表达式触控宽度未设置最小值');
assert(mainJs.includes('Math.max(visualBounds.height, MIN_EXPRESSION_TOUCH_TARGET)'), '表达式触控高度未设置最小值');
assert(mainJs.includes('rgba(4, 12, 24, 0.035)'), 'Canvas 背景填充必须保持低透明度');
assert(!/shadowBlur\s*=\s*(?!0\b)[1-9]/.test(mainJs), '数字雨表达式禁止使用持续性 shadowBlur');
assert(mainJs.includes('feedbackAt'), '正确/错误点击反馈没有绑定到表达式状态');

const forbiddenLightTokens = `${html}\n${css}\n${shopCss}`;
assert(!forbiddenLightTokens.includes('theme-light'), '数字雨不能添加 light theme');
assert(!forbiddenLightTokens.includes('themeColorLight'), '数字雨不能添加 light theme registry');

const manifestBackgrounds = Object.values(manifest.backgrounds);
for (const path of manifestBackgrounds) {
    assert(exists(join(ROOT, 'assets/math-rain', path)), `manifest 背景路径失效：${path}`);
}
for (const path of Object.values(manifest.icons)) {
    assert(exists(join(ROOT, 'assets/math-rain', path)), `manifest 图标路径失效：${path}`);
}

const distDir = join(ROOT, 'dist');
if (exists(distDir)) {
    const distFiles = listFiles(distDir);
    const distNames = distFiles.map(path => relative(distDir, path));
    for (const token of ['observatory-wide', 'observatory-mobile', 'fallback']) {
        assert(distNames.some(name => name.includes(token)), `dist 缺少构建后的 ${token} 背景`);
    }
    assert(distNames.some(name => extname(name) === '.css' && name.includes('math-rain')), 'dist 缺少 math-rain CSS 产物');
} else {
    console.log('⊘ dist 尚不存在，跳过构建产物资产检查');
}

if (fails.length) {
    console.error('✗ verify-math-rain-art');
    for (const message of fails) console.error(`  - ${message}`);
    process.exit(1);
}

console.log('verify-math-rain-art：观测舱资产 / dark-only / Canvas 透明层 / 构建引用全部通过 ✅');
