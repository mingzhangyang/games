// 截图像素：最小 PNG 解码（Chrome 截图为 8 位 RGB/RGBA、非隔行）。
// 返回 { w, h, bpp, px }，px 为逐行紧排的 RGB(A) 字节。verify-theme / verify-topbar-states 共用。
import { Buffer } from 'node:buffer';
import { inflateSync } from 'node:zlib';

export function decodePng(buf) {
    let off = 8, w = 0, h = 0, ct = 0;
    const idat = [];
    while (off < buf.length) {
        const len = buf.readUInt32BE(off);
        const type = buf.toString('ascii', off + 4, off + 8);
        const data = buf.subarray(off + 8, off + 8 + len);
        if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; }
        if (type === 'IDAT') idat.push(data);
        off += 12 + len;
    }
    const bpp = ct === 6 ? 4 : 3;
    const raw = inflateSync(Buffer.concat(idat));
    const stride = w * bpp;
    const px = Buffer.alloc(h * stride);
    for (let y = 0; y < h; y++) {
        const f = raw[y * (stride + 1)];
        for (let x = 0; x < stride; x++) {
            const cur = raw[y * (stride + 1) + 1 + x];
            const a = x >= bpp ? px[y * stride + x - bpp] : 0;
            const b = y > 0 ? px[(y - 1) * stride + x] : 0;
            const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0;
            const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
            const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
            px[y * stride + x] = (cur + pred) & 255;
        }
    }
    return { w, h, bpp, px };
}
