// Screenshot focus contrast against the persistent surface, not an isolated
// 1-3px twinkling particle. Keep the worst of four outline sides and the
// caller's 3:1 minimum: broad low-contrast areas must still fail.
const lin = value => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

export function contrastRatio(a, b) {
    const aLum = luminance(a), bLum = luminance(b);
    return (Math.max(aLum, bLum) + 0.05) / (Math.min(aLum, bLum) + 0.05);
}

export function outlineBackdropContrast(pixel, outlineRgb, [x, y, w, h]) {
    // The 2px outline sits 2px off the control; sample its adjacent backdrop
    // 3px outside each side. Nine pixels *along* each side are enough to
    // reject a 3px decorative star, while detecting a persistent dim strip.
    const strips = [
        Array.from({ length: 9 }, (_, i) => [x - 3, y + h / 2 + i - 4]),
        Array.from({ length: 9 }, (_, i) => [x + w + 2, y + h / 2 + i - 4]),
        Array.from({ length: 9 }, (_, i) => [x + w / 2 + i - 4, y - 3]),
        Array.from({ length: 9 }, (_, i) => [x + w / 2 + i - 4, y + h + 2]),
    ];
    const medians = strips.map(points => {
        const ratios = points.map(([px, py]) => pixel(px, py))
            .filter(Boolean)
            .map(bg => contrastRatio(outlineRgb, bg))
            .sort((a, b) => a - b);
        // Allow a side to lie off-screen, but never pass when *all* sides do.
        return ratios.length >= 5 ? ratios[Math.floor(ratios.length / 2)] : NaN;
    }).filter(Number.isFinite);
    return medians.length ? Math.min(...medians) : NaN;
}
