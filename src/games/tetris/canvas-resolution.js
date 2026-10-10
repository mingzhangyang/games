/**
 * Tetris raster-resolution contract. The board stays in logical 400x800 units,
 * while width/height canvas attributes describe physical backing pixels.
 */
export const LOGICAL_W = 400;
export const LOGICAL_H = 800;
export const MAX_DPR = 2;

export function calculateCanvasResolution(cssWidth, requestedDpr = 1) {
    if (!Number.isFinite(cssWidth) || cssWidth <= 0) return null;
    const dpr = Number.isFinite(requestedDpr)
        ? Math.max(1, Math.min(requestedDpr, MAX_DPR)) : 1;
    // Ceil prevents fractional CSS sizes or DPR from undersampling.
    const width = Math.max(1, Math.ceil(cssWidth * dpr));
    const height = width * (LOGICAL_H / LOGICAL_W);
    return { width, height, scale: width / LOGICAL_W, dpr };
}

export function applyCanvasResolution(canvases, resolution) {
    let changed = false;
    for (const canvas of canvases) {
        if (canvas.width === resolution.width && canvas.height === resolution.height) continue;
        // Updating backing dimensions resets pixels and the context transform.
        canvas.width = resolution.width;
        canvas.height = resolution.height;
        changed = true;
    }
    return changed;
}
