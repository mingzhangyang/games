/** 画布点击 → 格。只做坐标换算与门控，点到什么由 runtime / session 决定。 */
import { H, W, cellAt } from '../render/geometry.js';

export function bindBoardPointer(canvas, { isActive, onCell }) {
    canvas.addEventListener('pointerdown', (e) => {
        if (!isActive()) return;
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const cell = cellAt(
            (e.clientX - rect.left) / rect.width * W,
            (e.clientY - rect.top) / rect.height * H,
        );
        if (cell) onCell(cell.r, cell.c);
    });
}
