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

/**
 * Observe monitor-DPR changes without polling or mutating CSS sizing.
 *
 * The media query stops matching after a DPR switch. Re-arm it at the new DPR
 * before notifying the owner, so a second monitor switch is also observed.
 * The injected adapters keep this lifecycle testable without a browser.
 */
export function watchDevicePixelRatio(matchMedia, readDpr, notify) {
    if (typeof matchMedia !== 'function') return () => {};
    let active = true;
    let unlisten = () => {};

    const changed = () => {
        if (!active) return;
        unlisten();
        subscribe();
        notify();
    };

    function subscribe() {
        const rawDpr = readDpr();
        const dpr = Number.isFinite(rawDpr) && rawDpr > 0 ? rawDpr : 1;
        const query = matchMedia(`(resolution: ${dpr}dppx)`);
        if (typeof query?.addEventListener === 'function') {
            query.addEventListener('change', changed);
            unlisten = () => query.removeEventListener('change', changed);
        } else if (typeof query?.addListener === 'function') {
            // Safari's older MediaQueryList exposes addListener/removeListener.
            query.addListener(changed);
            unlisten = () => query.removeListener(changed);
        } else {
            unlisten = () => {};
        }
    }

    subscribe();
    return () => {
        if (!active) return;
        active = false;
        unlisten();
    };
}
