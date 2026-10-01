import { CELL, ENEMY_TYPES } from '../config.js';

function makeGlowSprite(radius, color, sides) {
    const pad = 10;
    const size = (radius + pad) * 2;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cx = size / 2, cy = size / 2;

    const grad = ctx.createRadialGradient(cx, cy, radius * 0.3, cx, cy, radius + pad * 0.8);
    grad.addColorStop(0, color + '66');
    grad.addColorStop(1, color + '00');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + pad * 0.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i <= sides; i++) {
        const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
        const px = cx + Math.cos(angle) * radius;
        const py = cy + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = '#0d1230';
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = color;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    return canvas;
}

export const enemySprites = Object.fromEntries(
    Object.entries(ENEMY_TYPES).map(([type, cfg]) => [type, makeGlowSprite(cfg.r, cfg.color, cfg.sides)])
);

export const towerBaseSprite = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = CELL;
    canvas.height = CELL;
    const ctx = canvas.getContext('2d');
    const center = CELL / 2;
    ctx.beginPath();
    ctx.roundRect(4, 4, CELL - 8, CELL - 8, 9);
    ctx.fillStyle = '#141b3f';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(center, center, 11, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fill();
    return canvas;
})();
