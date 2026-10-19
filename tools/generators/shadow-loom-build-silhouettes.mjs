#!/usr/bin/env node
/**
 * Build the runtime silhouette table from the authored SVG files.
 *
 * The SVG remains the source of truth. The runtime table is only a sampled
 * polygon cache for the low-resolution judge; --check proves it has not drifted.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SILHOUETTE_DIR = path.join(ROOT, 'assets/shadow-loom/layers/silhouettes');
const MANIFEST_FILE = path.join(SILHOUETTE_DIR, 'manifest.json');
const GENERATED_DIR = path.join(ROOT, 'src/generated/shadow-loom');
const OUTPUT_FILE = path.join(GENERATED_DIR, 'silhouettes.js');
const LEVEL_DIR = path.join(GENERATED_DIR, 'levels');
const VIEWBOX = '0 0 480 854';
const COORDINATE_SYSTEM = 'shadow-loom-stage-480x854';
const CHECK = process.argv.includes('--check');
const MERGE_CELL = 0.5;
const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));

function tokens(d) {
    return d.match(/[A-Za-z]|-?(?:\d+(?:\.\d*)?|\.\d+)/g) || [];
}

function parsePath(d) {
    const t = tokens(d);
    let i = 0;
    let command = '';
    let x = 0;
    let y = 0;
    let sx = 0;
    let sy = 0;
    let ring = [];
    const rings = [];
    const pushRing = () => {
        if (ring.length >= 3) rings.push(ring);
        ring = [];
    };
    const number = () => Number(t[i++]);
    const point = (px, py) => [Number(px.toFixed(2)), Number(py.toFixed(2))];
    while (i < t.length) {
        if (/^[A-Za-z]$/.test(t[i])) command = t[i++];
        if (command === 'Z' || command === 'z') {
            pushRing();
            x = sx;
            y = sy;
            command = '';
            continue;
        }
        if (command === 'M' || command === 'm') {
            const nx = number();
            const ny = number();
            x = command === 'm' ? x + nx : nx;
            y = command === 'm' ? y + ny : ny;
            sx = x;
            sy = y;
            pushRing();
            ring.push(point(x, y));
            command = command === 'm' ? 'l' : 'L';
        } else if (command === 'L' || command === 'l') {
            const nx = number();
            const ny = number();
            x = command === 'l' ? x + nx : nx;
            y = command === 'l' ? y + ny : ny;
            ring.push(point(x, y));
        } else if (command === 'C' || command === 'c') {
            const x1 = number();
            const y1 = number();
            const x2 = number();
            const y2 = number();
            const x3 = number();
            const y3 = number();
            const ax = command === 'c' ? x : 0;
            const ay = command === 'c' ? y : 0;
            const p0x = x;
            const p0y = y;
            const c1x = x1 + ax;
            const c1y = y1 + ay;
            const c2x = x2 + ax;
            const c2y = y2 + ay;
            const p3x = x3 + ax;
            const p3y = y3 + ay;
            for (let step = 1; step <= 3; step++) {
                const q = step / 3;
                const u = 1 - q;
                ring.push(point(
                    u ** 3 * p0x + 3 * u ** 2 * q * c1x + 3 * u * q ** 2 * c2x + q ** 3 * p3x,
                    u ** 3 * p0y + 3 * u ** 2 * q * c1y + 3 * u * q ** 2 * c2y + q ** 3 * p3y,
                ));
            }
            x = p3x;
            y = p3y;
        } else {
            throw new Error('Unsupported SVG command ' + command);
        }
    }
    pushRing();
    return rings;
}

function signedArea(polygon) {
    let area = 0;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        area += polygon[j][0] * polygon[i][1] - polygon[i][0] * polygon[j][1];
    }
    return area / 2;
}

function classifyRings(rings) {
    const outer = [];
    const holes = [];
    for (const ring of rings) {
        // The traced contour builder emits foreground boundaries counter-clockwise
        // and cut-outs clockwise in stage coordinates. Use winding here instead of
        // a centroid containment test: a large outer contour can contain the
        // centroid of an unrelated decorative contour and be misclassified as a
        // hole by a nesting-only heuristic.
        if (Math.abs(signedArea(ring)) < 4) continue;
        (signedArea(ring) < 0 ? holes : outer).push(ring);
    }
    return { outer, holes };
}

function polygonArea(polygon) {
    let area = 0;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        area += polygon[j][0] * polygon[i][1] - polygon[i][0] * polygon[j][1];
    }
    return area / 2;
}

function scanlineFill(mask, polygon, value) {
    const minX = Math.max(0, Math.floor(Math.min(...polygon.map(point => point[0])) / MERGE_CELL));
    const maxX = Math.min(Math.ceil(480 / MERGE_CELL) - 1, Math.floor(Math.max(...polygon.map(point => point[0])) / MERGE_CELL));
    const minY = Math.max(0, Math.floor(Math.min(...polygon.map(point => point[1])) / MERGE_CELL));
    const maxY = Math.min(Math.ceil(854 / MERGE_CELL) - 1, Math.floor(Math.max(...polygon.map(point => point[1])) / MERGE_CELL));
    for (let row = minY; row <= maxY; row++) {
        const y = (row + 0.5) * MERGE_CELL;
        const intersections = [];
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const [x0, y0] = polygon[j];
            const [x1, y1] = polygon[i];
            if ((y0 > y) !== (y1 > y)) intersections.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
        }
        intersections.sort((a, b) => a - b);
        for (let i = 0; i + 1 < intersections.length; i += 2) {
            const start = Math.max(minX, Math.ceil(intersections[i] / MERGE_CELL - 0.5));
            const end = Math.min(maxX, Math.floor(intersections[i + 1] / MERGE_CELL - 0.5));
            for (let col = start; col <= end; col++) mask[row * (480 / MERGE_CELL) + col] = value;
        }
    }
}

function rasterizeOuterRings(rings) {
    const cols = 480 / MERGE_CELL;
    const rows = 854 / MERGE_CELL;
    const outer = new Uint8Array(cols * rows);
    for (const polygon of rings.outer) scanlineFill(outer, polygon, 1);
    return outer;
}

function rasterizeRings(rings) {
    const outer = rasterizeOuterRings(rings);
    const cols = 480 / MERGE_CELL;
    const rows = 854 / MERGE_CELL;
    const holes = new Uint8Array(cols * rows);
    for (const polygon of rings.holes) scanlineFill(holes, polygon, 1);
    for (let i = 0; i < outer.length; i++) if (holes[i]) outer[i] = 0;
    return outer;
}

function traceRasterMask(mask) {
    const cols = 480 / MERGE_CELL;
    const edges = new Map();
    const add = (a, b) => {
        const key = `${a[0]},${a[1]}`;
        const list = edges.get(key) || [];
        list.push(b);
        edges.set(key, list);
    };
    const at = (row, col) => mask[row * cols + col] === 1;
    for (let row = 0; row < 854 / MERGE_CELL; row++) {
        for (let col = 0; col < cols; col++) {
            if (!at(row, col)) continue;
            if (row === 0 || !at(row - 1, col)) add([col, row], [col + 1, row]);
            if (col === cols - 1 || !at(row, col + 1)) add([col + 1, row], [col + 1, row + 1]);
            if (row === 854 / MERGE_CELL - 1 || !at(row + 1, col)) add([col + 1, row + 1], [col, row + 1]);
            if (col === 0 || !at(row, col - 1)) add([col, row + 1], [col, row]);
        }
    }
    const loops = [];
    while (edges.size) {
        const [startKey] = edges.entries().next().value;
        const [sx, sy] = startKey.split(',').map(Number);
        let current = [sx, sy];
        const loop = [current];
        while (true) {
            const key = `${current[0]},${current[1]}`;
            const outgoing = edges.get(key);
            if (!outgoing?.length) break;
            current = outgoing.pop();
            if (!outgoing.length) edges.delete(key);
            if (current[0] === sx && current[1] === sy) break;
            loop.push(current);
            if (loop.length > 100000) break;
        }
        if (loop.length >= 8 && current[0] === sx && current[1] === sy) {
            loops.push(simplifyClosed(loop.map(([x, y]) => [x * MERGE_CELL, y * MERGE_CELL])));
        }
    }
    return classifyRings(loops);
}

function rdp(points, epsilon) {
    if (points.length < 3) return points;
    const [ax, ay] = points[0];
    const [bx, by] = points[points.length - 1];
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.hypot(dx, dy);
    let index = 0;
    let distance = 0;
    for (let i = 1; i < points.length - 1; i++) {
        const [x, y] = points[i];
        const current = length === 0
            ? Math.hypot(x - ax, y - ay)
            : Math.abs(dx * (y - ay) - dy * (x - ax)) / length;
        if (current > distance) {
            distance = current;
            index = i;
        }
    }
    if (distance > epsilon) return [...rdp(points.slice(0, index + 1), epsilon).slice(0, -1), ...rdp(points.slice(index), epsilon)];
    return [points[0], points[points.length - 1]];
}

function simplifyClosed(points, epsilon = 0.65) {
    const seam = points.reduce((best, point, index) => {
        const candidate = points[best];
        return point[1] < candidate[1] || (point[1] === candidate[1] && point[0] < candidate[0]) ? index : best;
    }, 0);
    const rotated = points.slice(seam).concat(points.slice(0, seam));
    rotated.push(rotated[0]);
    return rdp(rotated, epsilon).slice(0, -1);
}

function ringsPath(rings) {
    const cubicRing = ring => {
        const point = ([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`;
        const commands = [`M ${point(ring[0])}`];
        for (let i = 0; i < ring.length; i++) {
            const p0 = ring[(i - 1 + ring.length) % ring.length];
            const p1 = ring[i];
            const p2 = ring[(i + 1) % ring.length];
            const p3 = ring[(i + 2) % ring.length];
            const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
            const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
            commands.push(`C ${point(c1)} ${point(c2)} ${point(p2)}`);
        }
        commands.push('Z');
        return commands.join(' ');
    };
    return [...rings.outer, ...rings.holes].map(cubicRing).join(' ');
}

function mergeOuterContours(rings) {
    const sourceArea = rings.outer.reduce((sum, polygon) => sum + Math.abs(polygonArea(polygon)), 0);
    const mergedOuterMask = rasterizeOuterRings(rings);
    const mergedOuterArea = mergedOuterMask.reduce((sum, value) => sum + value * MERGE_CELL * MERGE_CELL, 0);
    const mergedMask = rasterizeRings(rings);
    // Multiple same-winding outer contours are visually XORed by evenodd but
    // judged as a union. Raster-union them once so Path2D and the judge share
    // the same geometry. Disjoint contours keep their authored cubic path.
    if (sourceArea <= mergedOuterArea + MERGE_CELL * MERGE_CELL * 2) return { ...rings, changed: false };
    const merged = traceRasterMask(mergedMask);
    return { ...merged, changed: true };
}

function readSvg(family, file) {
    const full = path.join(SILHOUETTE_DIR, file);
    const src = fs.readFileSync(full, 'utf8');
    const match = src.match(/<path\b[^>]*\bd="([^"]+)"/);
    if (!match) throw new Error(full + ': no path d');
    const rings = mergeOuterContours(classifyRings(parsePath(match[1])));
    return { d: rings.changed ? ringsPath(rings) : match[1], rings };
}


function build() {
    const files = new Map();
    const levelIds = new Set();
    for (const levelId of manifest.playableLevels) {
        if (!/^[a-z0-9-]+$/.test(levelId) || levelIds.has(levelId)) {
            throw new Error('invalid/duplicate silhouette level: ' + levelId);
        }
        levelIds.add(levelId);
        const family = manifest.families.find(item => item.id === levelId);
        if (!family) throw new Error('manifest family missing: ' + levelId);
        const pieces = {};
        for (const piece of family.pieces) {
            if (!piece.anchor) throw new Error(levelId + '/' + piece.id + ': missing manifest anchor');
            const svg = readSvg(levelId, piece.file);
            pieces[piece.id] = {
                anchor: piece.anchor,
                outer: svg.rings.outer,
                holes: svg.rings.holes,
                d: svg.d,
            };
        }
        files.set(path.join(LEVEL_DIR, levelId + '.js'), [
            '// Generated by tools/generators/shadow-loom-build-silhouettes.mjs; edit the SVG sources instead.',
            'export const SILHOUETTES = ' + JSON.stringify(pieces) + ';',
            '',
        ].join('\n'));
    }

    const loader = [
        '// Generated by tools/generators/shadow-loom-build-silhouettes.mjs; edit the SVG sources instead.',
        "export const SILHOUETTE_VIEWBOX = '" + VIEWBOX + "';",
        "export const SILHOUETTE_COORDINATE_SYSTEM = '" + COORDINATE_SYSTEM + "';",
        '',
        "// Only the requested level's generated geometry enters the module graph.",
        'const importers = Object.freeze({',
        ...[...levelIds].map(levelId => "    '" + levelId + "': () => import('./levels/" + levelId + ".js'),"),
        '});',
        'const loaded = new Map();',
        'const inFlight = new Map();',
        '',
        'export function hasSilhouettes(levelId) {',
        '    return loaded.has(levelId);',
        '}',
        '',
        'export function loadSilhouettes(levelId) {',
        '    if (loaded.has(levelId)) return Promise.resolve(loaded.get(levelId));',
        '    const importer = importers[levelId];',
        '    if (!importer) return Promise.reject(new Error(`unknown Shadow Loom level: ${levelId}`));',
        '    let request = inFlight.get(levelId);',
        '    if (!request) {',
        '        request = importer().then(module => {',
        '            const pieces = module.SILHOUETTES;',
        "            if (!pieces || typeof pieces !== 'object' || !Object.keys(pieces).length) {",
        '                throw new Error(`missing Shadow Loom geometry: ${levelId}`);',
        '            }',
        '            loaded.set(levelId, pieces);',
        '            return pieces;',
        '        }).finally(() => inFlight.delete(levelId));',
        '        inFlight.set(levelId, request);',
        '    }',
        '    return request;',
        '}',
        '',
        'export function getSilhouette(levelId, pieceId) {',
        '    return loaded.get(levelId)?.[pieceId] || null;',
        '}',
        '',
    ].join('\n');
    files.set(OUTPUT_FILE, loader);
    return files;
}

const generatedFiles = build();
const existingLevels = fs.existsSync(LEVEL_DIR) ? fs.readdirSync(LEVEL_DIR).filter(name => name.endsWith('.js')) : [];
const expectedLevels = [...generatedFiles.keys()].filter(file => file.startsWith(LEVEL_DIR + path.sep)).map(file => path.basename(file));
const stale = existingLevels.filter(name => !expectedLevels.includes(name));
if (CHECK) {
    const mismatches = [];
    for (const [file, content] of generatedFiles) {
        if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) mismatches.push(path.relative(ROOT, file));
    }
    for (const name of stale) mismatches.push(path.relative(ROOT, path.join(LEVEL_DIR, name)));
    if (mismatches.length) {
        console.error('✗ shadow-loom generated files drifted from SVG: ' + mismatches.join(', '));
        process.exit(1);
    }
    console.log('✓ shadow-loom silhouettes: all ' + expectedLevels.length + ' levels match the SVG sources');
} else {
    fs.mkdirSync(LEVEL_DIR, { recursive: true });
    for (const name of stale) fs.unlinkSync(path.join(LEVEL_DIR, name));
    for (const [file, content] of generatedFiles) fs.writeFileSync(file, content);
    console.log('✓ wrote Shadow Loom loader and ' + expectedLevels.length + ' per-level modules');
}
