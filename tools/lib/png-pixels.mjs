// Zero-tolerance PNG RGBA comparison shared by the baseline pixel gates.
// Decode actual pixels rather than comparing PNG compression or metadata.
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';

export function pixelsFromPng(png) {
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

export function samePixels(a, b) {
    return a.width === b.width && a.height === b.height && a.pixels.equals(b.pixels);
}

