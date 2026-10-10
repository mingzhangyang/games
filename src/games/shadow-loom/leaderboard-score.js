/**
 * Single-run ranking codec for Shadow Loom.
 * Fastest completion time wins; move count is a tiebreaker. A displayed local
 * fastest time and independent fewest-moves record must never be combined.
 */
const STRIDE = 1000;
export function encodeShadowLoomScore(timeMs, moves) {
    if (!Number.isFinite(timeMs) || timeMs < 0
        || !Number.isInteger(moves) || moves < 0 || moves >= STRIDE) return null;
    const seconds = Math.ceil(timeMs / 1000);
    const score = seconds * STRIDE + moves;
    return score <= 2000000000 ? score : null;
}
export function formatShadowLoomScore(value, lang = 'en') {
    if (!Number.isFinite(value) || value < 0) return '';
    const score = Math.round(value);
    const seconds = Math.floor(score / STRIDE);
    const moves = score % STRIDE;
    return lang === 'zh' ? seconds + ' 秒 · ' + moves + ' 步'
        : seconds + 's · ' + moves + ' moves';
}
