import { STAGE } from '../model/molecules.js';

const { w: W, h: H } = STAGE;

export function drawBondForgeScene(game, ctx, palette) {
    if (!ctx) return;

    const background = ctx.createLinearGradient(0, 0, 0, H);
    background.addColorStop(0, palette.bgTop);
    background.addColorStop(1, palette.bgBottom);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, W, H);

    drawBenchGrid(ctx, palette);
    drawTopLight(ctx, palette);
    game.updateShake();
    game.drawBonds(ctx);
    game.drawTray(ctx);
    game.drawAtoms(ctx);
    game.drawDragPreview(ctx);
}

function drawBenchGrid(ctx, palette) {
    ctx.save();
    ctx.strokeStyle = palette.tint;
    ctx.lineWidth = 1;
    const step = 26;
    ctx.beginPath();
    for (let x = step; x < W; x += step) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, H);
    }
    for (let y = step; y < H; y += step) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(W, y + 0.5);
    }
    ctx.stroke();
    ctx.restore();
}

function drawTopLight(ctx, palette) {
    ctx.save();
    const glow = ctx.createRadialGradient(W / 2, -70, 20, W / 2, -70, W * 0.95);
    glow.addColorStop(0, palette.topLight);
    glow.addColorStop(1, palette.topLightOut);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H * 0.5);
    ctx.restore();
}
