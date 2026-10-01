/** Desktop pointer/keyboard controls and page visibility pause. */
import { SFX } from '../audio.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../config.js';

export function bindKeyboardInput(game) {
    const canvas = game.canvas;

    canvas.addEventListener('mousemove', (e) => {
        if (!game.isPlaying || game.isPaused) return;
        const rect = canvas.getBoundingClientRect();
        game.player.targetX = ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
        game.player.targetY = ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
    });

    canvas.addEventListener('mousedown', (e) => {
        if (!game.isPlaying || game.isPaused) return;
        SFX.init();
        if (e.button === 0) {
            game.triggerDash();
        } else if (e.button === 2) {
            game.triggerSwordArray();
        }
    });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        game.keys[e.code] = true;

        if (e.code === 'KeyP' || e.code === 'Escape') {
            game.togglePause();
            return;
        }

        if (e.code === 'KeyM') {
            document.getElementById('sf-btn-sound')?.click();
            e.preventDefault();
            return;
        }

        if (!game.isPlaying || game.isPaused) return;
        SFX.init();

        if (e.code === 'Space') {
            game.triggerDash();
            e.preventDefault();
        } else if (e.code === 'KeyQ') {
            game.triggerSwordArray();
            e.preventDefault();
        } else if (e.code === 'KeyE') {
            game.triggerUltimate();
            e.preventDefault();
        }
    });

    window.addEventListener('keyup', (e) => {
        game.keys[e.code] = false;
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden && game.isPlaying && !game.isPaused) {
            game.pauseGame();
        }
    });
}
