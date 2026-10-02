import { mulberry32 } from '../../../platform/daily.js';
import { H, W } from '../config.js';

export const PLANET_TONES = [
    ['#5a7bff', '#1b2a6b'],
    ['#ff8a5c', '#6b2a1b'],
    ['#8a5cff', '#331b6b'],
    ['#3fd9a4', '#14503a'],
    ['#ffcf5c', '#6b551b'],
];
const spriteCache = new Map();

export function planetSprite(r, toneIdx, ring) {
    const key = `${r | 0}|${toneIdx % PLANET_TONES.length}|${ring ? 1 : 0}`;
    let canvas = spriteCache.get(key);
    if (canvas) return canvas;
    const ringR = ring ? r * 1.85 : 0;
    const lineW = ring ? Math.max(3, r * 0.3) : 0;
    const rot = 0.5;
    const rx = ringR;
    const ry = ringR * 0.34;
    const extX = Math.abs(rx * Math.cos(rot)) + Math.abs(ry * Math.sin(rot));
    const extY = Math.abs(rx * Math.sin(rot)) + Math.abs(ry * Math.cos(rot));
    const pad = ring ? 4 : 12;
    const size = Math.ceil((Math.max(r, extX, extY) + lineW / 2 + pad) * 2);
    canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cx = size / 2;
    const cy = size / 2;
    const [c1, c2] = PLANET_TONES[toneIdx % PLANET_TONES.length];

    const ringHalf = back => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-0.5);
        ctx.scale(1, 0.34);
        ctx.beginPath();
        if (back) ctx.arc(0, 0, ringR, Math.PI, Math.PI * 2);
        else ctx.arc(0, 0, ringR, 0, Math.PI);
        ctx.strokeStyle = back ? c1 + '59' : c1 + 'd9';
        ctx.lineWidth = lineW;
        ctx.stroke();
        ctx.restore();
    };
    if (ring) ringHalf(true);

    const glow = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r + pad * 0.9);
    glow.addColorStop(0, c1 + '3a');
    glow.addColorStop(1, c1 + '00');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r + pad * 0.9, 0, Math.PI * 2);
    ctx.fill();

    const body = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    body.addColorStop(0, c1);
    body.addColorStop(0.55, c2);
    body.addColorStop(1, '#0a0e20');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = c1 + '88';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    if (ring) ringHalf(false);

    spriteCache.set(key, canvas);
    return canvas;
}

export const bgCanvas = document.createElement('canvas');
export const starLayer = document.createElement('canvas');

export function buildStarLayer(scale) {
    starLayer.width = Math.round(W * scale);
    starLayer.height = Math.round(H * scale);
    const ctx = starLayer.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const rng = mulberry32(77123);
    const tints = ['#dfe7ff', '#bfe9ff', '#ffe9c9', '#e9d8ff'];
    for (let i = 0; i < 42; i++) {
        const x = rng() * W;
        const y = rng() * H;
        const r = 0.8 + rng() * 1.2;
        ctx.globalAlpha = 0.25 + rng() * 0.5;
        ctx.fillStyle = tints[Math.floor(rng() * tints.length)];
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        if (rng() < 0.18) {
            ctx.globalAlpha *= 0.6;
            ctx.strokeStyle = ctx.fillStyle;
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(x - r * 3, y);
            ctx.lineTo(x + r * 3, y);
            ctx.moveTo(x, y - r * 3);
            ctx.lineTo(x, y + r * 3);
            ctx.stroke();
        }
    }
    ctx.globalAlpha = 1;
}

export function renderBackground(scale) {
    bgCanvas.width = Math.round(W * scale);
    bgCanvas.height = Math.round(H * scale);
    const ctx = bgCanvas.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const background = ctx.createLinearGradient(0, 0, W, H);
    background.addColorStop(0, '#070a1c');
    background.addColorStop(0.55, '#0b1028');
    background.addColorStop(1, '#101336');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, W, H);

    const nebulae = [
        [110, 150, 150, 'rgba(99,102,241,0.10)'],
        [380, 460, 170, 'rgba(52,211,153,0.07)'],
        [240, 90, 120, 'rgba(168,85,247,0.08)'],
    ];
    for (const [x, y, r, color] of nebulae) {
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    const rng = mulberry32(20260912);
    ctx.fillStyle = '#dfe7ff';
    for (let i = 0; i < 110; i++) {
        const x = rng() * W;
        const y = rng() * H;
        const r = 0.5 + rng() * 1.1;
        ctx.globalAlpha = 0.18 + rng() * 0.4;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}
