/** Pointer and keyboard bindings for Tower Defense. */
import { Sfx } from '../audio.js';
import { CELL, H, W } from '../config.js';
import { isBuildable } from '../model/level-runtime.js';

export function toLogical(game, e) {
    const rect = game.canvas.getBoundingClientRect();
    return {
        x: (e.clientX - rect.left) / rect.width * W,
        y: (e.clientY - rect.top) / rect.height * H
    };
}
export function bindInput(game) {
    game.canvas.addEventListener('pointerdown', (e) => {
        if (game.state !== 'playing') return;
        const p = game.toLogical(e);
        const c = Math.floor(p.x / CELL);
        const r = Math.floor(p.y / CELL);
        if (!isBuildable(game.map, c, r) && !game.towerAt(c, r)) {
            game.closePanel();
            return;
        }
        const towerIdx = game.towerAt(c, r);
        if (game.selectedTowerIdx !== towerIdx) {
            if (game.sellTimer) clearTimeout(game.sellTimer);
            game.sellConfirming = false;
        }
        game.selectedCell = { c, r };
        game.selectedTowerIdx = towerIdx;
        Sfx.click();
        game.renderPanel();
    });

    game.canvas.addEventListener('pointermove', (e) => {
        if (game.state !== 'playing') return;
        const p = game.toLogical(e);
        const c = Math.floor(p.x / CELL), r = Math.floor(p.y / CELL);
        game.hoverCell = (c >= 0 && c < game.map.cols && r >= 0 && r < game.map.rows) ? { c, r } : null;
    });
    game.canvas.addEventListener('pointerleave', () => { game.hoverCell = null; });

    // 全局键盘快捷键
    window.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
        if (game.state === 'menu' && e.code === 'Space') {
            e.preventDefault();
            game.startGame();
            return;
        }
        if (game.state !== 'playing') {
            if (game.state === 'paused' && (e.code === 'Space' || e.key === 'p' || e.key === 'P')) {
                e.preventDefault();
                game.resume();
            }
            return;
        }

        if (e.code === 'Space') {
            e.preventDefault();
            game.startWave();
        } else if (e.key === '1') {
            game.tryBuild('pulse');
        } else if (e.key === '2') {
            game.tryBuild('frost');
        } else if (e.key === '3') {
            game.tryBuild('cannon');
        } else if (e.key === '4') {
            game.tryBuild('tesla');
        } else if (e.key === 'u' || e.key === 'U') {
            game.tryUpgrade();
        } else if (e.key === 's' || e.key === 'S') {
            game.trySell();
        } else if (e.key === 't' || e.key === 'T') {
            game.cycleTargetPriority();
        } else if (e.key === 'q' || e.key === 'Q') {
            game.castEmp();
        } else if (e.key === 'e' || e.key === 'E') {
            game.castOverdrive();
        } else if (e.key === 'r' || e.key === 'R') {
            game.toggleShowAllRanges();
        } else if (e.code === 'Escape') {
            if (game.el.tacticalPanel && !game.el.tacticalPanel.classList.contains('hidden')) game.closeTacticalPanel();
            else game.closePanel();
        } else if (e.key === 'p' || e.key === 'P') {
            game.pause();
        }
    });
}
