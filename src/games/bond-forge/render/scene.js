import { BOND, maxBondsOf, STAGE } from '../model/molecules.js';

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
    drawDragPreview(game, ctx, palette);
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

/** Read-only drag overlay; legality is supplied by the paid action's own query. */
function drawDragPreview(game, ctx, palette) {
    const d = game.dragging;
    if (!d) return;

    // 候选目标提示环
    if (d.hoverId != null) {
        const t = game.atoms.find(a => a.id === d.hoverId);
        if (t) {
            const self = game.atoms.find(atom => atom.id === d.id);
            const preview = self && game.bondPreview(self, t);
            if (!preview) return;
            ctx.save();
            ctx.beginPath();
            ctx.arc(t.x, t.y, BOND.previewR, 0, Math.PI * 2);
            ctx.strokeStyle = preview.legal ? palette.snap : palette.reject;
            ctx.lineWidth = 3;
            ctx.setLineDash([6, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
            const scale = W / (game.canvas.clientWidth || W);
            ctx.font = `600 ${11 * scale}px ui-monospace, monospace`;
            ctx.fillStyle = palette.previewBg;
            const label = `${preview.legal ? '✓' : '×'} ${self.sym} ${maxBondsOf(self.sym) - game.usedOf(self)} · ${t.sym} ${maxBondsOf(t.sym) - game.usedOf(t)}`;
            const width = ctx.measureText(label).width + 12 * scale;
            const x = Math.max(width / 2 + 4, Math.min(W - width / 2 - 4, t.x));
            const y = Math.max(24 * scale, t.y - BOND.previewR - 12 * scale);
            ctx.beginPath();
            ctx.roundRect(x - width / 2, y - 11 * scale, width, 22 * scale, 4 * scale);
            ctx.fill();
            ctx.fillStyle = palette.previewText;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, x, y);
            if (!preview.legal) {
                ctx.strokeStyle = palette.reject;
                ctx.lineWidth = 2.4;
                ctx.beginPath();
                ctx.moveTo(t.x - 8, t.y - 8); ctx.lineTo(t.x + 8, t.y + 8);
                ctx.moveTo(t.x + 8, t.y - 8); ctx.lineTo(t.x - 8, t.y + 8);
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    game.drawAtom(ctx, { id: -1, sym: d.sym, x: d.x, y: d.y },
        { scale: 1.06, alpha: 0.94, showValence: false });
}
