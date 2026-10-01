import { mulberry32, todayKey as todayCompact, hashStringFNV as hashStr } from '../../../platform/daily.js';
import { storageGet, storageKeys, storageRemove, storageSet } from '../../../platform/safe-storage.js';
import { CAPTURE_R, H, W } from '../config.js';
import { simulate } from './physics.js';

const clamp = (value, min, max) => value < min ? min : value > max ? max : value;

export const LEVELS = [
    { pad: { x: 90, y: 545 }, target: { x: 395, y: 110 }, par: 1, bodies: [] },
    { pad: { x: 85, y: 545 }, target: { x: 390, y: 120 }, par: 1, bodies: [{ x: 240, y: 330, r: 30, tone: 0 }] },
    { pad: { x: 80, y: 560 }, target: { x: 235, y: 85 }, par: 1, bodies: [{ x: 310, y: 370, r: 34, tone: 1 }] },
    { pad: { x: 70, y: 555 }, target: { x: 425, y: 95 }, par: 1, bodies: [{ x: 195, y: 420, r: 24, tone: 2 }, { x: 330, y: 300, r: 24, tone: 3 }] },
    { pad: { x: 75, y: 560 }, target: { x: 255, y: 85 }, par: 2, bodies: [{ x: 195, y: 350, r: 40, tone: 4 }, { x: 320, y: 470, r: 30, tone: 1 }] },
    { pad: { x: 80, y: 555 }, target: { x: 240, y: 195 }, par: 2, bodies: [{ x: 245, y: 345, r: 46, tone: 0 }] },
    { pad: { x: 405, y: 550 }, target: { x: 85, y: 110 }, par: 2, bodies: [{ x: 250, y: 330, r: 30, tone: 3, moon: { dist: 74, r: 10, speed: 1.15, phase: 0 } }] },
    { pad: { x: 65, y: 560 }, target: { x: 420, y: 115 }, par: 2, bodies: [{ x: 180, y: 300, r: 26, tone: 2 }, { x: 315, y: 430, r: 26, tone: 4 }] },
    { pad: { x: 80, y: 555 }, target: { x: 400, y: 320 }, par: 2, bodies: [{ x: 300, y: 480, r: 22, tone: 1 }, { x: 300, y: 330, r: 22, tone: 0 }, { x: 300, y: 180, r: 22, tone: 3 }] },
    { pad: { x: 70, y: 570 }, target: { x: 345, y: 240 }, par: 3, bodies: [{ x: 240, y: 340, r: 40, tone: 1, moon: { dist: 80, r: 11, speed: 1.0, phase: 0 } }, { x: 150, y: 220, r: 22, tone: 4 }] },
    { pad: { x: 95, y: 560 }, target: { x: 140, y: 110 }, par: 3, bodies: [{ x: 250, y: 470, r: 36, tone: 2 }, { x: 360, y: 300, r: 24, tone: 0 }] },
    { pad: { x: 70, y: 580 }, target: { x: 240, y: 75 }, par: 3, bodies: [{ x: 150, y: 430, r: 24, tone: 4 }, { x: 300, y: 330, r: 28, tone: 3, moon: { dist: 66, r: 10, speed: -1.25, phase: 2.1 } }, { x: 395, y: 190, r: 22, tone: 1 }] },
    { pad: { x: 150, y: 560 }, target: { x: 330, y: 90 }, par: 2, bodies: [{ x: 245, y: 390, r: 30, tone: 1 }, { x: 365, y: 225, r: 25, tone: 3 }] },
    { pad: { x: 80, y: 555 }, target: { x: 400, y: 185 }, par: 2, bodies: [{ x: 250, y: 330, r: 44, tone: 4, ring: true, moon: { dist: 88, r: 11, speed: -0.95, phase: 1.2 } }] },
    { pad: { x: 240, y: 575 }, target: { x: 240, y: 80 }, par: 2, bodies: [{ x: 118, y: 330, r: 27, tone: 2 }, { x: 362, y: 330, r: 27, tone: 2 }, { x: 240, y: 455, r: 17, tone: 0 }] },
    { pad: { x: 75, y: 555 }, target: { x: 400, y: 120 }, par: 2, bodies: [{ x: 175, y: 420, r: 32, tone: 1 }, { x: 320, y: 250, r: 50, tone: 4, ring: true }] },
    { pad: { x: 410, y: 560 }, target: { x: 70, y: 80 }, par: 2, bodies: [{ x: 300, y: 380, r: 36, tone: 3, moon: { dist: 74, r: 12, speed: 1.1, phase: 5.0 } }, { x: 150, y: 220, r: 30, tone: 0, moon: { dist: 64, r: 11, speed: -1.3, phase: 1.2 } }] },
    { pad: { x: 85, y: 570 }, target: { x: 400, y: 90 }, par: 2, bodies: [{ x: 140, y: 420, r: 28, tone: 4 }, { x: 300, y: 300, r: 34, tone: 2 }, { x: 160, y: 160, r: 24, tone: 1 }] },
    { pad: { x: 90, y: 560 }, target: { x: 390, y: 100 }, par: 2, bodies: [{ x: 250, y: 360, r: 54, tone: 0, ring: true, moon: { dist: 88, r: 12, speed: -0.85, phase: 2.4 } }] },
    { pad: { x: 80, y: 570 }, target: { x: 400, y: 80 }, par: 2, bodies: [{ x: 240, y: 480, r: 36, tone: 3, moon: { dist: 72, r: 12, speed: 1.1, phase: 0.4 } }, { x: 360, y: 280, r: 28, tone: 1 }, { x: 140, y: 200, r: 26, tone: 4 }] },
];

export function generateDailyLevel(rng, holeIdx) {
    const pad = { x: 50 + rng() * 130, y: 440 + rng() * 115 };
    const angle = rng() * Math.PI * 2;
    const distance = 270 + rng() * 150;
    const target = {
        x: clamp(pad.x + Math.cos(angle) * distance, 45, 435),
        y: clamp(pad.y + Math.sin(angle) * distance, 70, 590),
    };
    if (Math.hypot(target.x - pad.x, target.y - pad.y) < 240) return null;

    const bodies = [];
    const count = 1 + Math.floor(rng() * 2.3);
    for (let i = 0; i < count; i++) {
        let valid = false;
        let bx = 0;
        let by = 0;
        let radius = 0;
        for (let tries = 0; tries < 24 && !valid; tries++) {
            radius = 18 + rng() * 13;
            bx = 55 + rng() * (W - 110);
            by = 80 + rng() * (H - 220);
            valid = Math.hypot(bx - pad.x, by - pad.y) > 115
                && Math.hypot(bx - target.x, by - target.y) > 78
                && bodies.every(body => Math.hypot(bx - body.x, by - body.y) > body.r + radius + 42);
        }
        if (!valid) return null;
        const body = { x: bx, y: by, r: radius };
        if (holeIdx >= 2 && rng() < 0.28) {
            body.moon = {
                dist: radius + 30 + rng() * 16,
                r: 9 + rng() * 3,
                speed: (rng() < 0.5 ? -1 : 1) * (0.8 + rng() * 0.6),
                phase: rng() * Math.PI * 2,
            };
        }
        bodies.push(body);
    }
    return { pad, target, par: 1, bodies };
}

export function solvePar(level) {
    const samples = 720;
    const hitAngles = [];
    let bestDistance = Infinity;
    for (let i = 0; i < samples; i++) {
        const angle = (i / samples) * Math.PI * 2;
        const power = 150 + (i % 6) * 82;
        const result = simulate(level, level.pad.x, level.pad.y, Math.cos(angle) * power, Math.sin(angle) * power, 60 * 20);
        if (result.outcome === 'capture') hitAngles.push(i);
        for (let j = 0; j < result.pts.length; j += 4) {
            const distance = Math.hypot(result.pts[j].x - level.target.x, result.pts[j].y - level.target.y);
            if (distance < bestDistance) bestDistance = distance;
        }
    }
    if (hitAngles.length === 0 && bestDistance > CAPTURE_R * 3.2) return null;

    let run = 1;
    let bestRun = 0;
    for (let i = 1; i <= hitAngles.length; i++) {
        if (i < hitAngles.length && hitAngles[i] === hitAngles[i - 1] + 1) run++;
        else {
            bestRun = Math.max(bestRun, run);
            run = 1;
        }
    }
    if (hitAngles.length > 0 && bestRun >= 3) return 1;
    if (hitAngles.length > 0 || bestDistance < CAPTURE_R * 2.4) return 2;
    return 3;
}

function cachedDailyCourse(date) {
    try {
        const course = JSON.parse(storageGet(`gd_course_${date}`));
        if (!Array.isArray(course) || course.length !== 5) return null;
        for (const level of course) {
            if (!level || typeof level.par !== 'number' || !level.pad || !level.target
                || typeof level.pad.x !== 'number' || typeof level.pad.y !== 'number'
                || typeof level.target.x !== 'number' || typeof level.target.y !== 'number'
                || !Array.isArray(level.bodies)) return null;
            for (const body of level.bodies) {
                if (!body || typeof body.x !== 'number' || typeof body.y !== 'number' || typeof body.r !== 'number') return null;
            }
        }
        return course;
    } catch {
        return null;
    }
}

export function buildDailyCourse() {
    const date = todayCompact();
    const cached = cachedDailyCourse(date);
    if (cached) return cached;
    const rng = mulberry32(hashStr(`gravity-daily-${date}`));
    const holes = [];
    for (let index = 0; index < 5; index++) {
        let level = null;
        let par = null;
        for (let tries = 0; tries < 40 && !level; tries++) {
            const candidate = generateDailyLevel(rng, index);
            if (!candidate) continue;
            const solvedPar = solvePar(candidate);
            if (solvedPar) {
                level = candidate;
                par = solvedPar;
            }
        }
        if (!level) {
            level = { pad: { x: 80, y: 550 }, target: { x: 390, y: 110 }, par: 2, bodies: [{ x: 235, y: 330, r: 28 }] };
            par = 2;
        }
        level.par = par;
        holes.push(level);
    }
    storageSet(`gd_course_${date}`, JSON.stringify(holes));
    for (const key of storageKeys('gd_course_')) {
        if (key !== `gd_course_${date}`) storageRemove(key);
    }
    return holes;
}
