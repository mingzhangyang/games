import { ARENA_HEIGHT, ARENA_WIDTH } from '../config.js';

/** Bind keyboard, pointer and touch controls without owning game rules. */
export function bindNeedleAwnInput(game) {
    const isEditableTarget = target => !!(target && target.closest && target.closest(
        'input, textarea, select, [contenteditable="true"]',
    ));
    const isInteractiveTarget = target => !!(target && target.closest && target.closest(
        'button, a, input, textarea, select, [contenteditable="true"], [role="button"], [role="link"]',
    ));

    window.addEventListener('keydown', event => {
        const isPauseShortcut = event.code === 'KeyP' || event.code === 'Escape';
        if (isPauseShortcut
            && !event.repeat
            && !isEditableTarget(event.target)
            && (game.state === 'playing' || game.state === 'paused')) {
            event.preventDefault();
            game.togglePause();
            return;
        }

        // Preserve native keyboard activation/editing when focus is on UI controls.
        // Gameplay action shortcuts only own keys while focus is outside those controls.
        if (isInteractiveTarget(event.target)) return;

        if (game.state === 'playing') {
            game.keys[event.code] = true;
            if (event.code === 'KeyQ' || event.code === 'ShiftLeft' || event.code === 'ShiftRight') game.toggleStance(game.player);
            if (event.code === 'Space') {
                event.preventDefault();
                game.triggerDash(game.player);
            }
            if (event.code === 'KeyE') game.triggerUltimate(game.player);
            if (game.mode === 'duel' && game.duelMode === '2p' && game.player2) {
                if (event.code === 'Enter') game.triggerDash(game.player2);
                if (event.code === 'Slash' || event.code === 'Numpad0') game.toggleStance(game.player2);
            }
        }
    });
    window.addEventListener('keyup', event => { game.keys[event.code] = false; });

    game.canvas.addEventListener('mousemove', event => {
        const rect = game.canvas.getBoundingClientRect();
        game.pointer.x = (event.clientX - rect.left) * (ARENA_WIDTH / rect.width);
        game.pointer.y = (event.clientY - rect.top) * (ARENA_HEIGHT / rect.height);
    });
    game.canvas.addEventListener('mousedown', event => {
        if (game.state !== 'playing') return;
        if (event.button === 0) game.triggerDash(game.player);
        else if (event.button === 2) {
            event.preventDefault();
            game.toggleStance(game.player);
        }
    });
    game.canvas.addEventListener('contextmenu', event => event.preventDefault());

    const JOY_RADIUS = 56;
    const setPointerFromTouch = (touch, rect) => {
        game.pointer.x = (touch.clientX - rect.left) * (ARENA_WIDTH / rect.width);
        game.pointer.y = (touch.clientY - rect.top) * (ARENA_HEIGHT / rect.height);
    };
    const moveJoyKnob = () => {
        game.dom.joyKnob.style.left = `${50 + (game.joy.dx / JOY_RADIUS) * 38}%`;
        game.dom.joyKnob.style.top = `${50 + (game.joy.dy / JOY_RADIUS) * 38}%`;
    };
    const updateJoyVector = touch => {
        let dx = touch.clientX - game.joy.ox;
        let dy = touch.clientY - game.joy.oy;
        const distance = Math.hypot(dx, dy);
        if (distance > JOY_RADIUS) {
            dx = (dx / distance) * JOY_RADIUS;
            dy = (dy / distance) * JOY_RADIUS;
        }
        game.joy.dx = dx;
        game.joy.dy = dy;
        game.joy.x = dx / JOY_RADIUS;
        game.joy.y = dy / JOY_RADIUS;
        moveJoyKnob();
    };

    game.canvas.addEventListener('touchstart', event => {
        const rect = game.canvas.getBoundingClientRect();
        const stageRect = game.dom.joy.parentElement.getBoundingClientRect();
        for (const touch of event.changedTouches) {
            const isLeftZone = !game.joy.active && (touch.clientX - rect.left) < rect.width * 0.45;
            if (isLeftZone) {
                game.joy.active = true;
                game.joy.id = touch.identifier;
                game.joy.ox = touch.clientX;
                game.joy.oy = touch.clientY;
                game.joy.dx = 0;
                game.joy.dy = 0;
                game.joy.x = 0;
                game.joy.y = 0;
                game.dom.joy.style.left = `${touch.clientX - stageRect.left}px`;
                game.dom.joy.style.top = `${touch.clientY - stageRect.top}px`;
                game.dom.joy.classList.remove('hidden');
                moveJoyKnob();
            } else {
                game.aimTouchId = touch.identifier;
                setPointerFromTouch(touch, rect);
                const now = performance.now();
                if (now - game.lastTouchTime < 300) game.triggerUltimate(game.player);
                game.lastTouchTime = now;
            }
        }
    }, { passive: true });
    game.canvas.addEventListener('touchmove', event => {
        const rect = game.canvas.getBoundingClientRect();
        for (const touch of event.changedTouches) {
            if (game.joy.active && touch.identifier === game.joy.id) updateJoyVector(touch);
            else if (touch.identifier === game.aimTouchId) setPointerFromTouch(touch, rect);
        }
    }, { passive: true });

    const endCanvasTouch = event => {
        for (const touch of event.changedTouches) {
            if (game.joy.active && touch.identifier === game.joy.id) {
                game.joy.active = false;
                game.joy.id = null;
                game.joy.x = 0;
                game.joy.y = 0;
                game.dom.joy.classList.add('hidden');
            } else if (touch.identifier === game.aimTouchId) game.aimTouchId = null;
        }
    };
    game.canvas.addEventListener('touchend', endCanvasTouch);
    game.canvas.addEventListener('touchcancel', endCanvasTouch);

    game.dom.touchDash.addEventListener('touchstart', event => {
        event.preventDefault();
        game.triggerDash(game.player);
    });
    game.dom.touchDash.addEventListener('click', () => game.triggerDash(game.player));
    game.dom.touchStance.addEventListener('touchstart', event => {
        event.preventDefault();
        game.toggleStance(game.player);
    });
    game.dom.touchStance.addEventListener('click', () => game.toggleStance(game.player));
    game.dom.touchUlt.addEventListener('touchstart', event => {
        event.preventDefault();
        game.triggerUltimate(game.player);
    });
    game.dom.touchUlt.addEventListener('click', () => game.triggerUltimate(game.player));
    game.dom.stanceChip.addEventListener('click', () => game.toggleStance(game.player));
}
