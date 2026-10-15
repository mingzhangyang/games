import { todayKey } from '../platform/daily.js';

// 「新」的有效期（docs/proposal-home-layout.md §8 D-3）。随日期变化，所以不进 gen（否则 gen --check
// 会随日期变红）：gen 只写 data-added="YYYY-MM-DD"，这里按 UTC+8 今天判定。
// 两边都转成 UTC 毫秒算天数，不拿 YYYYMMDD 与 YYYY-MM-DD 比字符串。
export const NEW_DAYS = 45;

export function isFresh(addedAt, now = Date.now()) {
    const k = todayKey(now);
    const today = Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8));
    const [y, m, d] = String(addedAt).split('-').map(Number);
    const age = (today - Date.UTC(y, m - 1, d)) / 864e5;
    return age >= 0 && age < NEW_DAYS;
}
