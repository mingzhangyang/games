#!/usr/bin/env node
/**
 * Re-cut a family's paper pieces from its smooth target silhouette.
 *
 * Piece SVGs that were split on a coarse raster carry stair-stepped edges, both
 * along the silhouette and along the cut lines between pieces. This tool keeps
 * the existing pieces only as a *partition hint*:
 *
 *   1. every piece mask is blurred (Gaussian, SIGMA px) and each point of the
 *      target is assigned to the piece with the strongest blurred field — the
 *      argmax boundary is a smooth curve that follows the old cut line;
 *   2. piece = target ∩ its label region, sampled at 1/FINE px so outer edges
 *      follow the target's Bézier outline, cut-outs included;
 *   3. the coverage field is traced with interpolated marching squares at
 *      GRID px, simplified, and written back as a cubic evenodd path.
 *
 * The result is a true partition of target.svg: pieces share their seams and
 * never contain one another. Run the silhouette build afterwards.
 *
 * Usage: node scripts/shadow-loom-recut-pieces.mjs <family> [--overlap=<px>] [--dry]
 *   --overlap  how far a piece reaches under later pieces (default 0.5px); lower it
 *              when a long seam trips the levels verifier's piece-overlap limit
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'assets/shadow-loom/layers/silhouettes');
const family = process.argv[2];
const DRY = process.argv.includes('--dry');
const FINE = 8; // target samples per px
const GRID = 0.5; // marching-squares cell (px)
const SIGMA = 3; // cut-line smoothing (px)
const EPS = 0.18; // simplification tolerance (px)
const OVERLAP = Number(process.argv.find(a => a.startsWith('--overlap='))?.slice(10) ?? 0.5); // pieces overlap this far across a shared cut (px)
const MARGIN = 4;

const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
const fam = manifest.families.find(f => f.id === family);
if (!fam) {
    console.error('usage: node scripts/shadow-loom-recut-pieces.mjs <family> [--dry]');
    process.exit(1);
}

const readD = file => fs.readFileSync(path.join(DIR, file), 'utf8').match(/<path\b[^>]*\bd="([^"]+)"/)[1];

/** SVG path (M/L/C/Z, absolute or relative) → flattened rings */
function flatten(d, steps = 16) {
    const t = d.match(/[A-Za-z]|-?(?:\d+(?:\.\d*)?|\.\d+)(?:e-?\d+)?/g) || [];
    const rings = [];
    let ring = [];
    let i = 0;
    let cmd = '';
    let x = 0;
    let y = 0;
    let sx = 0;
    let sy = 0;
    const n = () => Number(t[i++]);
    const close = () => { if (ring.length >= 3) rings.push(ring); ring = []; };
    while (i < t.length) {
        if (/^[A-Za-z]$/.test(t[i])) cmd = t[i++];
        const rel = cmd === cmd.toLowerCase();
        const ox = rel ? x : 0;
        const oy = rel ? y : 0;
        switch (cmd.toUpperCase()) {
            case 'Z': close(); x = sx; y = sy; cmd = ''; break;
            case 'M': close(); x = ox + n(); y = oy + n(); sx = x; sy = y; ring.push([x, y]); cmd = rel ? 'l' : 'L'; break;
            case 'L': x = ox + n(); y = oy + n(); ring.push([x, y]); break;
            case 'C': {
                const c1x = ox + n(); const c1y = oy + n();
                const c2x = ox + n(); const c2y = oy + n();
                const ex = ox + n(); const ey = oy + n();
                for (let s = 1; s <= steps; s++) {
                    const q = s / steps;
                    const u = 1 - q;
                    ring.push([
                        u * u * u * x + 3 * u * u * q * c1x + 3 * u * q * q * c2x + q * q * q * ex,
                        u * u * u * y + 3 * u * u * q * c1y + 3 * u * q * q * c2y + q * q * q * ey,
                    ]);
                }
                x = ex; y = ey;
                break;
            }
            default: throw new Error('unsupported path command ' + cmd);
        }
    }
    close();
    return rings;
}

const targetRings = flatten(readD(fam.targetFile));
const all = targetRings.flat();
const x0 = Math.floor(Math.min(...all.map(p => p[0]))) - MARGIN;
const y0 = Math.floor(Math.min(...all.map(p => p[1]))) - MARGIN;
const x1 = Math.ceil(Math.max(...all.map(p => p[0]))) + MARGIN;
const y1 = Math.ceil(Math.max(...all.map(p => p[1]))) + MARGIN;

/** evenodd scanline fill of rings on a grid of `res` samples per px over the bbox */
function fill(rings, res) {
    const w = (x1 - x0) * res;
    const h = (y1 - y0) * res;
    const m = new Uint8Array(w * h);
    for (let r = 0; r < h; r++) {
        const yy = y0 + (r + 0.5) / res;
        const xs = [];
        for (const ring of rings) {
            for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
                const [ax, ay] = ring[a];
                const [bx, by] = ring[b];
                if ((ay > yy) !== (by > yy)) xs.push(ax + ((yy - ay) * (bx - ax)) / (by - ay));
            }
        }
        xs.sort((p, q) => p - q);
        for (let k = 0; k + 1 < xs.length; k += 2) {
            const c0 = Math.max(0, Math.ceil((xs[k] - x0) * res - 0.5));
            const c1 = Math.min(w - 1, Math.floor((xs[k + 1] - x0) * res - 0.5));
            for (let c = c0; c <= c1; c++) m[r * w + c] = 1;
        }
    }
    return { m, w, h };
}

/** separable Gaussian blur of a 0/1 mask (sigma in cells) */
function blur(src, w, h, sigma) {
    const rad = Math.ceil(sigma * 3);
    const k = [];
    let sum = 0;
    for (let i = -rad; i <= rad; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(v); sum += v; }
    for (let i = 0; i < k.length; i++) k[i] /= sum;
    const tmp = new Float32Array(w * h);
    const out = new Float32Array(w * h);
    for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
            let v = 0;
            for (let i = -rad; i <= rad; i++) { const cc = c + i; if (cc >= 0 && cc < w) v += src[r * w + cc] * k[i + rad]; }
            tmp[r * w + c] = v;
        }
    }
    for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
            let v = 0;
            for (let i = -rad; i <= rad; i++) { const rr = r + i; if (rr >= 0 && rr < h) v += tmp[rr * w + c] * k[i + rad]; }
            out[r * w + c] = v;
        }
    }
    return out;
}

// 1. smooth label fields from the old pieces (1px grid is plenty for a 3px blur)
const pieces = fam.pieces;
const fields = pieces.map(p => {
    const { m, w, h } = fill(flatten(readD(p.file)), 1);
    return { f: blur(m, w, h, SIGMA), w, h };
});
const LW = fields[0].w;
const LH = fields[0].h;
const sampleField = (f, x, y) => {
    // bilinear on pixel centres
    const fx = Math.min(LW - 1.001, Math.max(0, x - x0 - 0.5));
    const fy = Math.min(LH - 1.001, Math.max(0, y - y0 - 0.5));
    const c = Math.floor(fx);
    const r = Math.floor(fy);
    const tx = fx - c;
    const ty = fy - r;
    const i = r * LW + c;
    return (f[i] * (1 - tx) + f[i + 1] * tx) * (1 - ty) + (f[i + LW] * (1 - tx) + f[i + LW + 1] * tx) * ty;
};

// 2. fine target ∩ label → coverage on the GRID lattice
const target = fill(targetRings, FINE);
const TW = target.w;
const TH = target.h;
const label = new Int8Array(TW * TH).fill(-1);
let unlabelled = 0;
for (let r = 0; r < TH; r++) {
    const y = y0 + (r + 0.5) / FINE;
    for (let c = 0; c < TW; c++) {
        if (!target.m[r * TW + c]) continue;
        const x = x0 + (c + 0.5) / FINE;
        let best = -1;
        let bestV = 1e-4;
        for (let k = 0; k < pieces.length; k++) {
            const v = sampleField(fields[k].f, x, y);
            if (v > bestV) { bestV = v; best = k; }
        }
        if (best < 0) unlabelled++;
        else label[r * TW + c] = best;
    }
}

/**
 * Grow each label region by OVERLAP px (still clipped to the target), so
 * neighbouring pieces overlap slightly along their cut lines. Two fills that
 * merely abut both anti-alias the shared edge and leave a light hairline.
 */
function region(k) {
    const rad = Math.round(OVERLAP * FINE);
    const own = new Uint8Array(TW * TH);
    for (let i = 0; i < own.length; i++) own[i] = label[i] === k ? 1 : 0;
    const grow = (src, stride, len, lines, step) => {
        const out = new Uint8Array(src.length);
        for (let l = 0; l < lines; l++) {
            const base = l * step;
            let last = -Infinity;
            for (let i = 0; i < len; i++) {
                if (src[base + i * stride]) last = i;
                if (i - last <= rad) out[base + i * stride] = 1;
            }
            last = Infinity;
            for (let i = len - 1; i >= 0; i--) {
                if (src[base + i * stride]) last = i;
                if (last - i <= rad) out[base + i * stride] = 1;
            }
        }
        return out;
    };
    const grown = grow(grow(own, 1, TW, TH, TW), TW, TH, TW, 1);
    // one-sided: a piece only reaches under later pieces, so each seam is
    // covered once and pairwise overlap stays a hairline band
    for (let i = 0; i < grown.length; i++) grown[i] &= target.m[i] && (label[i] === k || label[i] > k) ? 1 : 0;
    return grown;
}

const per = FINE * GRID; // fine samples per grid cell edge
const GW = Math.round((x1 - x0) / GRID);
const GH = Math.round((y1 - y0) / GRID);
const cover = pieces.map((p, k) => {
    const m = region(k);
    const cv = new Float32Array(GW * GH);
    for (let r = 0; r < TH; r++) {
        for (let c = 0; c < TW; c++) if (m[r * TW + c]) cv[Math.floor(r / per) * GW + Math.floor(c / per)] += 1 / (per * per);
    }
    return cv;
});

// 3. interpolated marching squares on cell centres, iso 0.5
function trace(cv) {
    const at = (c, r) => (c < 0 || r < 0 || c >= GW || r >= GH ? 0 : cv[r * GW + c]);
    const pos = (c, r) => [x0 + (c + 0.5) * GRID, y0 + (r + 0.5) * GRID];
    // edge point between lattice nodes a and b (ids encode the edge)
    const lerp = (ca, ra, cb, rb) => {
        const va = at(ca, ra);
        const vb = at(cb, rb);
        const t = (0.5 - va) / (vb - va);
        const [ax, ay] = pos(ca, ra);
        const [bx, by] = pos(cb, rb);
        return [ax + (bx - ax) * t, ay + (by - ay) * t];
    };
    const next = new Map(); // edge key → { to: edge key, p }
    const pts = new Map();
    const key = (ca, ra, cb, rb) => `${ca},${ra},${cb},${rb}`;
    const edge = (ca, ra, cb, rb) => {
        const k = key(ca, ra, cb, rb);
        if (!pts.has(k)) pts.set(k, lerp(ca, ra, cb, rb));
        return k;
    };
    for (let r = -1; r < GH; r++) {
        for (let c = -1; c < GW; c++) {
            // square nodes: tl(c,r) tr(c+1,r) br(c+1,r+1) bl(c,r+1)
            const tl = at(c, r) >= 0.5;
            const tr = at(c + 1, r) >= 0.5;
            const br = at(c + 1, r + 1) >= 0.5;
            const bl = at(c, r + 1) >= 0.5;
            const idx = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
            if (idx === 0 || idx === 15) continue;
            const T = () => edge(c, r, c + 1, r);
            const R = () => edge(c + 1, r, c + 1, r + 1);
            const B = () => edge(c, r + 1, c + 1, r + 1);
            const L = () => edge(c, r, c, r + 1);
            // segments oriented with the inside on the left (y down ⇒ outer rings clockwise on screen)
            const segs = {
                1: [[L, B]], 2: [[B, R]], 3: [[L, R]], 4: [[R, T]], 6: [[B, T]], 7: [[L, T]],
                8: [[T, L]], 9: [[T, B]], 11: [[T, R]], 12: [[R, L]], 13: [[R, B]], 14: [[B, L]],
            };
            let list = segs[idx];
            if (idx === 5 || idx === 10) {
                const centre = (at(c, r) + at(c + 1, r) + at(c + 1, r + 1) + at(c, r + 1)) / 4 >= 0.5;
                if (idx === 5) list = centre ? [[L, T], [R, B]] : [[L, B], [R, T]];
                else list = centre ? [[T, R], [B, L]] : [[T, L], [B, R]];
            }
            for (const [a, b] of list) next.set(a(), b());
        }
    }
    const loops = [];
    while (next.size) {
        const [start] = next.keys();
        const loop = [];
        let k = start;
        while (next.has(k)) {
            loop.push(pts.get(k));
            const n = next.get(k);
            next.delete(k);
            k = n;
        }
        if (loop.length >= 4) loops.push(loop);
    }
    return loops;
}

const area = ring => {
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    return a / 2;
};

function rdp(points, eps) {
    if (points.length < 3) return points;
    const [ax, ay] = points[0];
    const [bx, by] = points[points.length - 1];
    const len = Math.hypot(bx - ax, by - ay);
    let idx = 0;
    let dist = 0;
    for (let i = 1; i < points.length - 1; i++) {
        const [px, py] = points[i];
        const d = len === 0 ? Math.hypot(px - ax, py - ay) : Math.abs((bx - ax) * (py - ay) - (by - ay) * (px - ax)) / len;
        if (d > dist) { dist = d; idx = i; }
    }
    if (dist <= eps) return [points[0], points[points.length - 1]];
    return [...rdp(points.slice(0, idx + 1), eps).slice(0, -1), ...rdp(points.slice(idx), eps)];
}

function simplify(loop) {
    // split the closed loop at its two farthest-apart points so RDP has stable anchors
    let far = 0;
    let best = 0;
    for (let i = 0; i < loop.length; i++) {
        const d = Math.hypot(loop[i][0] - loop[0][0], loop[i][1] - loop[0][1]);
        if (d > best) { best = d; far = i; }
    }
    const a = rdp(loop.slice(0, far + 1), EPS);
    const b = rdp([...loop.slice(far), loop[0]], EPS);
    return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/** closed polyline → Catmull-Rom cubic subpath */
function cubic(ring) {
    const f = v => v.toFixed(2);
    const out = [`M ${f(ring[0][0])} ${f(ring[0][1])}`];
    for (let i = 0; i < ring.length; i++) {
        const p0 = ring[(i - 1 + ring.length) % ring.length];
        const p1 = ring[i];
        const p2 = ring[(i + 1) % ring.length];
        const p3 = ring[(i + 2) % ring.length];
        const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
        const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
        out.push(`C ${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`);
    }
    out.push('Z');
    return out.join(' ');
}

const totalTarget = target.m.reduce((s, v) => s + v, 0) / (FINE * FINE);
console.log(`${family}: target ${totalTarget.toFixed(0)} px², unlabelled ${(unlabelled / (FINE * FINE)).toFixed(1)} px²`);
pieces.forEach((p, k) => {
    const loops = trace(cover[k]).map(simplify).filter(l => l.length >= 3 && Math.abs(area(l)) >= 4) // same floor as the build script;
    // outer rings first (positive signed area in stage coordinates), then cut-outs
    loops.sort((a, b) => area(b) - area(a));
    const d = loops.map(cubic).join(' ');
    const pieceArea = cover[k].reduce((s, v) => s + v, 0) * GRID * GRID;
    const outers = loops.filter(l => area(l) > 0).length;
    console.log(`  ${p.id.padEnd(8)} ${pieceArea.toFixed(0).padStart(6)} px² · ${outers} outer · ${loops.length - outers} holes · ${d.length} chars`);
    if (DRY) return;
    const file = path.join(DIR, p.file);
    const src = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, src.replace(/(<path\b[^>]*\bd=")[^"]+(")/, `$1${d}$2`));
});
if (DRY) console.log('(dry run — nothing written)');
