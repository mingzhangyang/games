// Stamp public/sw.js after Vite + plugin-legacy finish writing dist/.
// Never hand-edit the copied/generated Service Worker in dist/.
import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const STAMP = "'__GAMES_BUILD_ID__'";
const PRELOAD = "/* __GAMES_PRECACHE__ */ ['/']";
const ASSET_LIST = "/* __GAMES_ASSETS__ */ []";

export function renderServiceWorker(source, { buildId, precache, assets = [] }) {
    if (!source.includes(STAMP) || !source.includes(PRELOAD) || !source.includes(ASSET_LIST)) {
        throw new Error('Service Worker injection markers are missing');
    }
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(buildId)) throw new Error('Invalid Service Worker build ID');
    return source.replace(STAMP, JSON.stringify(buildId))
        .replace(PRELOAD, JSON.stringify(precache))
        .replace(ASSET_LIST, JSON.stringify(assets));
}

async function outputFiles(dir) {
    const found = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) found.push(...await outputFiles(path));
        else if (entry.isFile()) found.push(path);
    }
    return found.sort();
}

export async function stampServiceWorker(distDir, sourceFile = join(ROOT, 'public/sw.js')) {
    const files = (await outputFiles(distDir)).filter(path => relative(distDir, path).replaceAll(sep, '/') !== 'sw.js');
    const source = await readFile(sourceFile, 'utf8');
    const digest = createHash('sha256');
    digest.update(source);
    digest.update('\0');
    for (const path of files) {
        // Hash content as well as filename: un-hashed public/ assets must also
        // trigger a new generation when their content changes.
        digest.update(relative(distDir, path).replaceAll(sep, '/'));
        digest.update('\0');
        digest.update(await readFile(path));
        digest.update('\0');
    }
    const buildId = digest.digest('hex').slice(0, 16);
    const html = await readFile(join(distDir, 'index.html'), 'utf8');
    const precache = new Set(['/', '/index.html']);
    for (const tag of html.match(/<(?:script|link)\b[^>]*>/gi) || []) {
        const attr = /\b(?:href|src)\s*=\s*(["'])(.*?)\1/i.exec(tag);
        if (!attr) continue;
        const pathname = attr[2].split(/[?#]/)[0];
        if (!/\.(?:js|mjs|css)$/i.test(pathname)) continue;
        const url = new URL(pathname, 'https://games.example/');
        if (url.origin !== 'https://games.example') continue;
        const path = url.pathname;
        // Broken HTML link should fail the build instead of blocking SW installs.
        if (!(await stat(join(distDir, path.slice(1))).catch(() => null))?.isFile()) {
            throw new Error(`Missing homepage precache dependency: ${path}`);
        }
        precache.add(path);
    }
    // The SVG <use> sprite is requested by the homepage at runtime, not by a
    // script/link tag. Keep it available during an offline first install.
    if ((await stat(join(distDir, 'icons/home-icons.svg')).catch(() => null))?.isFile()) {
        precache.add('/icons/home-icons.svg');
    }
    await writeFile(join(distDir, 'sw.js'), renderServiceWorker(source, {
        buildId, precache: [...precache].sort(),
        assets: files.map(path => '/' + relative(distDir, path).replaceAll(sep, '/'))
            .filter(path => /\.(css|js|mjs|png|svg|jpg|jpeg|webp|ico|json|woff2?)$/i.test(path)),
    }));
    return { buildId, precache: [...precache].sort() };
}

export function serviceWorkerCachePlugin() {
    return {
        name: 'games-service-worker-build-cache',
        apply: 'build',
        // closeBundle sees the FINAL files produced by Vite and plugin-legacy.
        async closeBundle() {
            const result = await stampServiceWorker(join(ROOT, 'dist'));
            console.log(`Service Worker cache: ${result.buildId}, ${result.precache.length} shell URLs`);
        },
    };
}
