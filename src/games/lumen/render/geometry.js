/** Lumen 逻辑场：560×560 正方形、9×9 格。绘制与点击判定共用这一套坐标。 */
import { GRID_N } from '../model/beam.js';

export const W = 560;
export const H = 560;
export const CELL = W / GRID_N;

export function cellCenter(r, c) {
    return { x: (c + 0.5) * CELL, y: (r + 0.5) * CELL };
}

export function idxCenter(idx) {
    return cellCenter(Math.floor(idx / GRID_N), idx % GRID_N);
}

/** 逻辑坐标 → 格；场外返回 null */
export function cellAt(x, y) {
    const r = Math.floor(y / CELL);
    const c = Math.floor(x / CELL);
    return r >= 0 && r < GRID_N && c >= 0 && c < GRID_N ? { r, c } : null;
}
