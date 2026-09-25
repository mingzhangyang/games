// 本地静态服务器（仅用于布局截图验证）：node scripts/serve-static.mjs [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = process.cwd();
const PORT = Number(process.argv[2] || 8899);
const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
    try {
        let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (p.endsWith('/')) p += 'index.html';
        const rel = normalize(p).replace(/^([/\\])+/, '');
        let file = join(ROOT, rel);
        let s = await stat(file).catch(() => null);
        // 与 Vite dev / dist 一致：根目录没有的文件回退到 public/（theme-boot.js、sw-register.js、
        // analytics.js、manifest.json、icons/ 都在那里）。此前这些在本服务器上一律 404 ——
        // theme-boot 首屏定主题因此在校验里根本不执行。
        // sw.js 刻意不回退：源码态校验不装 Service Worker，免得缓存让各校验器互相污染。
        if (!s && rel !== 'sw.js') {
            file = join(ROOT, 'public', rel);
            s = await stat(file).catch(() => null);
        }
        if (!s || !s.isFile()) throw new Error('not file');
        const buf = await readFile(file);
        res.writeHead(200, {
            'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-store',
        });
        res.end(buf);
    } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404');
    }
}).listen(PORT, '127.0.0.1', () => console.log(`serving ${ROOT} on http://127.0.0.1:${PORT}`));
