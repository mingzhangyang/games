/** Mobile canvas steering and action-button controls. */
import { SFX } from '../audio.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../config.js';

const TAP_MAX_DURATION = 250;
const TAP_MAX_DISTANCE = 24;
const DOUBLE_TAP_MAX_DELAY = 350;
const DOUBLE_TAP_MAX_DISTANCE = 64;

export function bindTouchInput(game) {
    const canvas = game.canvas;
    let touchStart = null;
    let lastTap = null;

    const steer = touch => {
        const rect = canvas.getBoundingClientRect();
        game.player.targetX = Math.max(20, Math.min(CANVAS_WIDTH - 20, ((touch.clientX - rect.left) / rect.width) * CANVAS_WIDTH));
        game.player.targetY = Math.max(40, Math.min(CANVAS_HEIGHT - 60, ((touch.clientY - rect.top) / rect.height) * CANVAS_HEIGHT));
    };

    const handleTouchStart = (e) => {
        if (!game.isPlaying || game.isPaused) return;
        SFX.init();
        const touch = e.touches[0];
        if (!touch) return;
        touchStart = { time: Date.now(), x: touch.clientX, y: touch.clientY, moved: false };
        steer(touch);
        e.preventDefault();
    };

    const handleTouchMove = (e) => {
        if (!game.isPlaying || game.isPaused) return;
        const touch = e.touches[0];
        if (!touch) return;
        if (touchStart && Math.hypot(touch.clientX - touchStart.x, touch.clientY - touchStart.y) > TAP_MAX_DISTANCE) {
            touchStart.moved = true;
        }
        steer(touch);
        e.preventDefault();
    };

    const handleTouchEnd = (e) => {
        const touch = e.changedTouches[0];
        const started = touchStart;
        touchStart = null;
        if (!touch || !started || !game.isPlaying || game.isPaused) {
            lastTap = null;
            return;
        }

        const now = Date.now();
        const duration = now - started.time;
        const distance = Math.hypot(touch.clientX - started.x, touch.clientY - started.y);
        if (started.moved || duration > TAP_MAX_DURATION || distance > TAP_MAX_DISTANCE) {
            lastTap = null;
            return;
        }

        const tapDistance = lastTap
            ? Math.hypot(touch.clientX - lastTap.x, touch.clientY - lastTap.y)
            : Infinity;
        if (lastTap && now - lastTap.time <= DOUBLE_TAP_MAX_DELAY && tapDistance <= DOUBLE_TAP_MAX_DISTANCE) {
            SFX.init();
            game.triggerUltimate();
            lastTap = null;
            e.preventDefault();
            return;
        }
        lastTap = { time: now, x: touch.clientX, y: touch.clientY };
    };

    // Bind to the canvas only. Action buttons are siblings inside the stage;
    // listening on the stage would prevent their synthesized click.
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

    document.getElementById('sf-touch-dash').addEventListener('click', () => {
        if (!game.isPlaying || game.isPaused) return;
        SFX.init();
        game.triggerDash();
    });

    document.getElementById('sf-touch-array').addEventListener('click', () => {
        if (!game.isPlaying || game.isPaused) return;
        SFX.init();
        game.triggerSwordArray();
    });

    document.getElementById('sf-touch-ult').addEventListener('click', () => {
        if (!game.isPlaying || game.isPaused) return;
        SFX.init();
        game.triggerUltimate();
    });
}
