/**
 * Rank single completed runs: millisecond time is primary, moves break ties.
 * Independent local best-time and fewest-moves records must never be merged.
 */
const STRIDE = 1_000_000;
export function encodeShadowLoomScore(timeMs, moves) {
    if (!Number.isFinite(timeMs) || timeMs < 0
        || !Number.isInteger(moves) || moves < 0 || moves >= STRIDE) return null;
    const score = Math.ceil(timeMs) * STRIDE + moves;
    return Number.isSafeInteger(score) ? score : null;
}
export function formatShadowLoomScore(value, lang = 'en') {
    if (!Number.isSafeInteger(value) || value < 0) return '';
    const millis = Math.floor(value / STRIDE);
    const moves = value % STRIDE;
    const minutes = Math.floor(millis / 60000);
    const secs = String(Math.floor((millis % 60000) / 1000)).padStart(2, '0');
    const frac = String(millis % 1000).padStart(3, '0');
    const elapsed = minutes + ':' + secs + '.' + frac;
    return lang === 'zh' ? elapsed + ' · ' + moves + ' 步'
        : elapsed + ' · ' + moves + ' moves';
}
