/**
 * Ranking codec for Firefly Signal. Fewer interventions win; harmony is a
 * secondary tie breaker. Every value comes from one successful simulation.
 */
const STRIDE = 1001;
export function encodeFireflyScore(used, harmony) {
    if (!Number.isInteger(used) || used < 0 || used > 99
        || !Number.isFinite(harmony) || harmony < 0 || harmony > 1) return null;
    return used * STRIDE + (1000 - Math.round(harmony * 1000));
}
export function formatFireflyScore(score, lang = 'en') {
    if (!Number.isFinite(score) || score < 0) return '';
    const encoded = Math.round(score);
    const used = Math.floor(encoded / STRIDE);
    const harmony = ((1000 - encoded % STRIDE) / 10).toFixed(1);
    return lang === 'zh' ? String(used) + ' 次 · ' + harmony + '%'
        : String(used) + ' signals · ' + harmony + '%';
}
