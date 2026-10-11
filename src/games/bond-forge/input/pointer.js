import { STAGE } from '../model/molecules.js';

const { w: W, h: H } = STAGE;

export function bindBondForgePointer(game) {
    const canvas = game.canvas;
    if (!canvas || game._pointerBound) return;
    game._pointerBound = true;
    game._onDown = event => game.onDown(event);
    game._onMove = event => game.onMove(event);
    game._onUp = event => game.onUp(event);
    canvas.addEventListener('pointerdown', game._onDown);
    canvas.addEventListener('pointermove', game._onMove);
    canvas.addEventListener('pointerup', game._onUp);
    canvas.addEventListener('pointercancel', game._onUp);
    canvas.style.touchAction = 'none';
}

/**
 * Canceling an interrupted pointer gesture must roll back tentative model
 * mutations, not merely clear the active drag marker.
 */
export function cancelBondForgeDrag(game) {
    const drag = game.dragging;
    if (!drag) return;
    game.dragging = null;
    if (drag.fromTray) {
        game.atoms = game.atoms.filter(atom => atom.id !== drag.id);
        if (game.tray[drag.trayIndex]) game.tray[drag.trayIndex].used = false;
    } else if (drag.origin) {
        const atom = game.atoms.find(item => item.id === drag.id);
        if (atom) {
            atom.x = drag.origin.x;
            atom.y = drag.origin.y;
        }
        game.bonds.push(...drag.origin.bonds);
    }
    try {
        if (game.canvas.hasPointerCapture?.(drag.pointerId)) {
            game.canvas.releasePointerCapture(drag.pointerId);
        }
    } catch { /* Browser may have released capture on backgrounding. */ }
    game.updateHud();
}

export function unbindBondForgePointer(game) {
    const canvas = game.canvas;
    if (!canvas || !game._pointerBound) return;
    game._pointerBound = false;
    canvas.removeEventListener('pointerdown', game._onDown);
    canvas.removeEventListener('pointermove', game._onMove);
    canvas.removeEventListener('pointerup', game._onUp);
    canvas.removeEventListener('pointercancel', game._onUp);
}

export function toLogical(game, event) {
    const rect = game.canvas.getBoundingClientRect();
    return {
        x: ((event.clientX - rect.left) / (rect.width || 1)) * W,
        y: ((event.clientY - rect.top) / (rect.height || 1)) * H,
    };
}
