#!/usr/bin/env node
// One-time Step 5a static full-page visual diff, comparing the old and new
// worktrees served by the same Chrome. All 26 pages, mobile and desktop.
// Disable JavaScript on BOTH sides to eliminate canvas simulation randomness;
// running-game behavior is separately covered by the full browser verify suite.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { inflateSync } from 'node:zlib';
import { registry } from '../lib/registry.mjs';
import { CHROME_PATH, LAUNCH_ARGS } from '../lib/browser.mjs';

const [beforeUrl, afterUrl] = process.argv.slice(2);
if (!beforeUrl?.startsWith('http://') || !afterUrl?.startsWith('http://')) {
    console.error('usage: node tools/checks/compare-topbar-screenshots.mjs <before-url> <after-url>');
    process.exit(2);
}
const VIEWPORTS = [{ width: 390, height: 844 }, { width: 1280, height: 900 }];
const pages = registry.withCap('topbar');
assert.equal(pages.length, 26, 'Step 5a must compare exactly 26 topbar pages');
const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });

// Chrome produces noninterlaced, 8-bit RGB or RGBA PNGs. Decode PNG scanline
// filters with Node's built-in zlib, then compare actual RGBA pixels, not PNG
// metadata/compressed-byte encoding. Unsupported format is an explicit failure.
function pixelsFromPng(png) {
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'PNG signature');
    let pos = 8;
    let width, height, depth, color, interlace;
    const data = [];
    while (pos < png.length) {
        const n = png.readUInt32BE(pos);
        const type = png.toString('ascii', pos + 4, pos + 8);
        const chunk = png.subarray(pos + 8, pos + 8 + n);
        pos += n + 12;
        if (type === 'IHDR') {
            width = chunk.readUInt32BE(0);
            height = chunk.readUInt32BE(4);
            depth = chunk[8];
            color = chunk[9];
            interlace = chunk[12];
        } else if (type === 'IDAT') data.push(chunk);
        else if (type === 'IEND') break;
    }
    assert(depth === 8 && [2, 6].includes(color) && interlace === 0,
        'unsupported PNG color depth/type/interlacing: ' + depth + '/' + color + '/' + interlace);
    const channels = color === 6 ? 4 : 3;
    const stride = width * channels;
    const encoded = inflateSync(Buffer.concat(data));
    assert.equal(encoded.length, (stride + 1) * height, 'PNG scanline length');
    const pixels = Buffer.alloc(width * height * 4);
    let previous = Buffer.alloc(stride);
    for (let y = 0; y < height; y++) {
        const begin = y * (stride + 1);
        const filter = encoded[begin];
        const line = Buffer.from(encoded.subarray(begin + 1, begin + 1 + stride));
        for (let x = 0; x < line.length; x++) {
            const left = x >= channels ? line[x - channels] : 0;
            const above = previous[x];
            const upperLeft = x >= channels ? previous[x - channels] : 0;
            if (filter === 1) line[x] = (line[x] + left) & 255;
            else if (filter === 2) line[x] = (line[x] + above) & 255;
            else if (filter === 3) line[x] = (line[x] + ((left + above) >>> 1)) & 255;
            else if (filter === 4) {
                const p = left + above - upperLeft;
                const a = Math.abs(p - left), b = Math.abs(p - above), c = Math.abs(p - upperLeft);
                line[x] = (line[x] + (a <= b && a <= c ? left : b <= c ? above : upperLeft)) & 255;
            } else if (filter !== 0) throw new Error('unsupported PNG filter ' + filter);
        }
        for (let x = 0; x < width; x++) {
            const source = x * channels, target = (y * width + x) * 4;
            pixels[target] = line[source];
            pixels[target + 1] = line[source + 1];
            pixels[target + 2] = line[source + 2];
            pixels[target + 3] = channels === 4 ? line[source + 3] : 255;
        }
        previous = line;
    }
    return { width, height, pixels };
}

function samePixels(a, b) {
    return a.width === b.width && a.height === b.height && a.pixels.equals(b.pixels);
}

async function capture(url, game, viewport) {
    const page = await browser.newPage();
    try {
        await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
        await page.setJavaScriptEnabled(false);
        const response = await page.goto(url + '/' + game.href, {
            waitUntil: 'networkidle0', timeout: 20000,
        });
        assert.equal(response?.status(), 200, game.id + ': missing page at ' + url);
        // JS-disabled pages can still animate in pure CSS. Freeze these on both
        // sides to compare a single deterministic rendered layout frame.
        await page.addStyleTag({
            content: '*,*::before,*::after{animation:none!important;transition:none!important;'
                + 'scroll-behavior:auto!important;caret-color:transparent!important}',
        });
        // Ensure stylesheet insertion and glyph rasterization have reached a
        // settled frame before snapshotting the DOM-only visual baseline.
        await new Promise(resolve => setTimeout(resolve, 120));
        // Puppeteer 25 returns Uint8Array; PNG decoding requires Node Buffer methods.
        return pixelsFromPng(Buffer.from(await page.screenshot({ fullPage: true })));
    } finally {
        await page.close();
    }
}

let pass = 0, failures = 0;
try {
    for (const game of pages) {
        for (const viewport of VIEWPORTS) {
            const label = game.id + ' @' + viewport.width + 'x' + viewport.height;
            try {
                const a = await capture(beforeUrl, game, viewport);
                const b = await capture(afterUrl, game, viewport);
                let matches = samePixels(a, b);
                let settled = false;
                let finalBefore = a, finalAfter = b;
                if (!matches) {
                    // Identical HTML can briefly differ in font/GPU rasterization on
                    // the first frame. Recheck only if a side is itself unstable.
                    // A stable before/after difference is NEVER waived.
                    const a2 = await capture(beforeUrl, game, viewport);
                    const b2 = await capture(afterUrl, game, viewport);
                    finalBefore = a2;
                    finalAfter = b2;
                    if (!samePixels(a, a2) || !samePixels(b, b2)) {
                        const a3 = await capture(beforeUrl, game, viewport);
                        const b3 = await capture(afterUrl, game, viewport);
                        finalBefore = a3;
                        finalAfter = b3;
                        settled = samePixels(a2, b2) && samePixels(a2, a3)
                            && samePixels(b2, b3);
                        matches = settled;
                    }
                }
                if (!matches) {
                    const before = finalBefore, after = finalAfter;
                    let changed = 0, minX = Infinity, minY = Infinity;
                    let maxX = -1, maxY = -1;
                    const width = Math.min(before.width, after.width);
                    const height = Math.min(before.height, after.height);
                    for (let y = 0; y < height; y++) {
                        for (let x = 0; x < width; x++) {
                            const ai = (y * before.width + x) * 4;
                            const bi = (y * after.width + x) * 4;
                            if (!before.pixels.subarray(ai, ai + 4).equals(after.pixels.subarray(bi, bi + 4))) {
                                changed++;
                                minX = Math.min(minX, x);
                                minY = Math.min(minY, y);
                                maxX = Math.max(maxX, x);
                                maxY = Math.max(maxY, y);
                            }
                        }
                    }
                    console.error('FAIL ' + label + ': image sizes ' + before.width + 'x' + before.height
                        + ' / ' + after.width + 'x' + after.height + ', different pixels=' + changed
                        + ', bbox=' + [minX, minY, maxX, maxY].join(','));
                    failures++;
                } else {
                    console.log('PASS ' + label + ' — 0 different pixels'
                        + (settled ? ' (confirmed stable after transient first-frame variation)' : ''));
                    pass++;
                }
            } catch (error) {
                console.error('FAIL ' + label + ': ' + error.message);
                failures++;
            }
        }
    }
} finally {
    await browser.close();
}
console.log('Chrome Step 5a static screenshot parity: ' + pass + '/' + (pages.length * VIEWPORTS.length)
    + ' full-page screenshot pairs, ' + failures + ' failures.');
process.exit(failures ? 1 : 0);
