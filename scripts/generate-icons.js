/**
 * PWA 图标生成器 — 无第三方依赖，纯 Node 生成 PNG
 * 运行：node scripts/generate-icons.js
 * 输出到 public/icons/：
 *   icon-192.png / icon-512.png        （任意用途，圆角卡通风）
 *   icon-maskable-512.png              （可遮罩用途，内容缩放在安全区内）
 *   apple-touch-icon.png               （180x180，iOS 全出血）
 *
 * 图案：靛紫渐变圆角底 + 四色圆角小方块（呼应"游戏合集"）+ 白色播放三角
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });

/* ── 最小 PNG 编码器（RGBA，filter 0）── */
const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 6;  // color type RGBA
    // 每行前置 filter 字节 0
    const raw = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (width * 4 + 1)] = 0;
        rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
    }
    const idat = deflateSync(raw, { level: 9 });
    return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* ── 画布与绘制 ── */

function makeCanvas(size) {
    return { size, data: Buffer.alloc(size * size * 4) };
}

function blendPx(canvas, x, y, r, g, b, a) {
    if (x < 0 || y < 0 || x >= canvas.size || y >= canvas.size || a <= 0) return;
    const i = (y * canvas.size + x) * 4;
    const na = a + canvas.data[i + 3] * (1 - a);
    if (na <= 0) return;
    canvas.data[i] = (r * a + canvas.data[i] * canvas.data[i + 3] * (1 - a)) / na;
    canvas.data[i + 1] = (g * a + canvas.data[i + 1] * canvas.data[i + 3] * (1 - a)) / na;
    canvas.data[i + 2] = (b * a + canvas.data[i + 2] * canvas.data[i + 3] * (1 - a)) / na;
    canvas.data[i + 3] = na;
}

function inRoundedRect(x, y, rx, ry, rw, rh, rad) {
    const cx = Math.max(rx, Math.min(x, rx + rw));
    const cy = Math.max(ry, Math.min(y, ry + rh));
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= rad * rad;
}

function hexToRgb(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/**
 * 画一枚图标
 * @param {number} size 输出尺寸
 * @param {object} opts maskable: 内容缩到 62% 并使用全出血背景；fullBleed: 背景不圆角（iOS）
 */
function drawIcon(size, { maskable = false, fullBleed = false } = {}) {
    const canvas = makeCanvas(size);
    const SS = 2; // 2x 超采样抗锯齿
    const contentScale = maskable ? 0.64 : 0.86;
    const s = (v) => (v / 512) * size * contentScale + (size - (512 / 512) * size * contentScale) / 2;

    // 背景尺寸与圆角
    const bgPad = maskable ? 0 : fullBleed ? 0 : (size * (1 - contentScale)) / 2;
    const bgSize = size - bgPad * 2;
    const bgRad = maskable || fullBleed ? 0 : bgSize * 0.22;

    const top = hexToRgb('#6366f1');
    const bottom = hexToRgb('#8b5cf6');

    const drawBase = (final) => {
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                // 2x2 超采样
                let cov = 0;
                for (let sy = 0; sy < SS; sy++) {
                    for (let sx = 0; sx < SS; sx++) {
                        const px = x + (sx + 0.5) / SS;
                        const py = y + (sy + 0.5) / SS;
                        if (bgRad === 0 || inRoundedRect(px, py, bgPad, bgPad, bgSize, bgSize, bgRad)) cov++;
                    }
                }
                if (cov === 0) continue;
                const a = (cov / (SS * SS)) * 255 * final;
                const t = y / size;
                const r = top[0] + (bottom[0] - top[0]) * t;
                const g = top[1] + (bottom[1] - top[1]) * t;
                const b = top[2] + (bottom[2] - top[2]) * t;
                blendPx(canvas, x, y, r, g, b, a / 255);
            }
        }
    };

    // 内容元素（坐标基于 512 设计稿再缩放）
    const u = (v) => (v / 512) * size * contentScale;
    const ox = (size - size * contentScale) / 2;
    const oy = (size - size * contentScale) / 2;
    const P = (v) => v / 512 * size * contentScale;

    const tiles = [
        { x: 128, y: 128, c: '#34d399' },
        { x: 288, y: 128, c: '#fcd34d' },
        { x: 128, y: 288, c: '#f87171' },
        { x: 288, y: 288, c: '#60a5fa' }
    ];
    const tileSize = 128;
    const tileRad = 30;

    const drawTiles = (final) => {
        for (const t of tiles) {
            const [r, g, b] = hexToRgb(t.c);
            const tx = ox + u(t.x);
            const ty = oy + u(t.y);
            const tw = u(tileSize);
            const tr = u(tileRad);
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    let cov = 0;
                    for (let sy = 0; sy < SS; sy++) {
                        for (let sx = 0; sx < SS; sx++) {
                            const px = x + (sx + 0.5) / SS;
                            const py = y + (sy + 0.5) / SS;
                            if (inRoundedRect(px, py, tx, ty, tw, tw, tr)) cov++;
                        }
                    }
                    if (cov === 0) continue;
                    blendPx(canvas, x, y, r, g, b, (cov / (SS * SS)) * 255 * final / 255);
                }
            }
        }
    };

    // 中心白色播放三角
    const drawTriangle = (final) => {
        // 三角顶点（512 设计稿坐标，居中偏右一点点）
        const cx = 256, cy = 256, rOut = 118;
        const pts = [
            [cx - rOut * 0.72, cy - rOut * 0.82],
            [cx - rOut * 0.72, cy + rOut * 0.82],
            [cx + rOut, cy]
        ];
        const [r, g, b] = [255, 255, 255];
        const minX = Math.min(...pts.map(p => p[0]));
        const maxX = Math.max(...pts.map(p => p[0]));
        const minY = Math.min(...pts.map(p => p[1]));
        const maxY = Math.max(...pts.map(p => p[1]));
        const sign = (x1, y1, x2, y2, x3, y3) => (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
        for (let y = Math.floor(oy + P(minY)); y < Math.ceil(oy + P(maxY)); y++) {
            for (let x = Math.floor(ox + P(minX)); x < Math.ceil(ox + P(maxX)); x++) {
                // 映射回设计稿坐标
                const px = (x + 0.5 - ox) / (size * contentScale) * 512;
                const py = (y + 0.5 - oy) / (size * contentScale) * 512;
                const d1 = sign(px, py, pts[0][0], pts[0][1], pts[1][0], pts[1][1]);
                const d2 = sign(px, py, pts[1][0], pts[1][1], pts[2][0], pts[2][1]);
                const d3 = sign(px, py, pts[2][0], pts[2][1], pts[0][0], pts[0][1]);
                const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
                const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
                if (!(hasNeg && hasPos)) {
                    blendPx(canvas, x, y, r, g, b, final);
                }
            }
        }
    };

    drawBase(1);
    drawTiles(1);
    drawTriangle(1);

    return encodePNG(size, size, canvas.data);
}

writeFileSync(join(outDir, 'icon-192.png'), drawIcon(192));
writeFileSync(join(outDir, 'icon-512.png'), drawIcon(512));
writeFileSync(join(outDir, 'icon-maskable-512.png'), drawIcon(512, { maskable: true }));
writeFileSync(join(outDir, 'apple-touch-icon.png'), drawIcon(180, { fullBleed: true }));
console.log('icons written to public/icons/');
