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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SILHOUETTE_DIR = path.join(ROOT, 'assets/shadow-loom/layers/silhouettes');
const MANIFEST_FILE = path.join(SILHOUETTE_DIR, 'manifest.json');
const OUTPUT_FILE = path.join(ROOT, 'js/shadow-loom-silhouettes.js');
const VIEWBOX = '0 0 480 854';
const COORDINATE_SYSTEM = 'shadow-loom-stage-480x854';
const CHECK = process.argv.includes('--check');
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

function readSvg(family, file) {
    const full = path.join(SILHOUETTE_DIR, file);
    const src = fs.readFileSync(full, 'utf8');
    const match = src.match(/<path\b[^>]*\bd="([^"]+)"/);
    if (!match) throw new Error(full + ': no path d');
    return { d: match[1], rings: classifyRings(parsePath(match[1])) };
}

function build() {
    const table = {};
    for (const levelId of manifest.playableLevels) {
        const family = manifest.families.find(item => item.id === levelId);
        if (!family) throw new Error('manifest family missing: ' + levelId);
        table[levelId] = {};
        for (const piece of family.pieces) {
            if (!piece.anchor) throw new Error(levelId + '/' + piece.id + ': missing manifest anchor');
            const svg = readSvg(levelId, piece.file);
            table[levelId][piece.id] = {
                anchor: piece.anchor,
                outer: svg.rings.outer,
                holes: svg.rings.holes,
                d: svg.d,
            };
        }
    }
    return [
        '// Generated by scripts/shadow-loom-build-silhouettes.mjs; edit the SVG sources instead.',
        "export const SILHOUETTE_VIEWBOX = '" + VIEWBOX + "';",
        "export const SILHOUETTE_COORDINATE_SYSTEM = '" + COORDINATE_SYSTEM + "';",
        'export const SILHOUETTES = ' + JSON.stringify(table) + ';',
        'export function getSilhouette(levelId, pieceId) {',
        '    return SILHOUETTES[levelId]?.[pieceId] || null;',
        '}',
        '',
    ].join('\n');
}

const generated = build();
if (CHECK) {
    const current = fs.readFileSync(OUTPUT_FILE, 'utf8');
    if (current !== generated) {
        console.error('✗ js/shadow-loom-silhouettes.js 与 SVG 来源不一致，请运行 npm run build:shadow-loom-silhouettes');
        process.exit(1);
    }
    console.log('✓ shadow-loom silhouettes: SVG 与 runtime 同步');
} else {
    fs.writeFileSync(OUTPUT_FILE, generated);
    console.log('✓ wrote js/shadow-loom-silhouettes.js');
}
