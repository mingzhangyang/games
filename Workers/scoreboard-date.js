/**
 * A client-controlled daily key must never allocate an unbounded Durable Object
 * namespace. Calendar-valid dates are accepted for the last 30 UTC days plus
 * one day ahead (for games whose challenge day changes at UTC+8 midnight).
 *
 * This is a routing guard, not proof that a submitted score was earned.
 */
const DAY_MS = 86_400_000;
export const DAILY_PAST_DAYS = 30;
export const DAILY_FUTURE_DAYS = 1;

export function validDailyDateKey(key, now = Date.now()) {
  const match = /-d(\d{4})(\d{2})(\d{2})$/.exec(key);
  if (!match || !Number.isFinite(now)) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2000 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const midnight = Date.UTC(year, month - 1, day);
  const parsed = new Date(midnight);
  // Date.UTC normalizes nonexistent days; reject them instead of routing.
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1
      || parsed.getUTCDate() !== day) return false;

  const today = Math.floor(now / DAY_MS) * DAY_MS;
  return midnight >= today - DAILY_PAST_DAYS * DAY_MS
      && midnight <= today + DAILY_FUTURE_DAYS * DAY_MS;
}
