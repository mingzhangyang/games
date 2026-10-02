import { H, MIN_DRAG, POWER_K, PREVIEW_STEPS, SPEED_CAP, W } from '../config.js';
import { simulate } from '../model/physics.js';

const clamp = (value, min, max) => value < min ? min : value > max ? max : value;

export function toLogical(game, event) {
    const rect = game.canvas.getBoundingClientRect();
    return {
        x: (event.clientX - rect.left) / rect.width * W,
        y: (event.clientY - rect.top) / rect.height * H,
    };
}

export function aimVector(game) {
    if (!game.drag) return null;
    const dx = game.drag.sx - game.drag.cx;
    const dy = game.drag.sy - game.drag.cy;
    const length = Math.hypot(dx, dy);
    if (length < MIN_DRAG) return null;
    const power = clamp(length * POWER_K, 60, SPEED_CAP);
    return { vx: dx / length * power, vy: dy / length * power, power: length };
}

export function bindGravityInput(game) {
    game.canvas.addEventListener('pointerdown', event => {
        if (game.phase !== 'aiming') return;
        event.preventDefault();
        const point = toLogical(game, event);
        game.drag = { sx: point.x, sy: point.y, cx: point.x, cy: point.y };
        game.canvas.setPointerCapture?.(event.pointerId);
    });
    game.canvas.addEventListener('pointermove', event => {
        if (!game.drag || game.phase !== 'aiming') return;
        const point = toLogical(game, event);
        game.drag.cx = point.x;
        game.drag.cy = point.y;
        const aim = aimVector(game);
        game.preview = aim
            ? simulate(game.level, game.level.pad.x, game.level.pad.y, aim.vx, aim.vy, PREVIEW_STEPS)
            : null;
    });
    const endDrag = () => {
        if (!game.drag) return;
        const aim = aimVector(game);
        game.drag = null;
        game.preview = null;
        if (aim && game.phase === 'aiming') game.fire(aim.vx, aim.vy);
    };
    game.canvas.addEventListener('pointerup', endDrag);
    game.canvas.addEventListener('pointercancel', () => {
        game.drag = null;
        game.preview = null;
    });
}
