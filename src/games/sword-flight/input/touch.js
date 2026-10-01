/** Mobile canvas steering and action-button controls. */
import { SFX } from '../audio.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../config.js';

export function bindTouchInput(game) {
    const canvas = game.canvas;
    const handleTouch = (e) => {
        if (!game.isPlaying || game.isPaused) return;
        SFX.init();
        const touch = e.touches[0];
        if (!touch) return;
        const rect = canvas.getBoundingClientRect();
        game.player.targetX = Math.max(20, Math.min(CANVAS_WIDTH - 20, ((touch.clientX - rect.left) / rect.width) * CANVAS_WIDTH));
        game.player.targetY = Math.max(40, Math.min(CANVAS_HEIGHT - 60, ((touch.clientY - rect.top) / rect.height) * CANVAS_HEIGHT));
        e.preventDefault();
    };

    // Bind to the canvas only. Action buttons are siblings inside the stage;
    // listening on the stage would prevent their synthesized click.
    canvas.addEventListener('touchstart', handleTouch, { passive: false });
    canvas.addEventListener('touchmove', handleTouch, { passive: false });

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
