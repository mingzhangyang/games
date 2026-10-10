/** Run/result boards keep the seeded date; menu boards use today's date. */
export function resolveNeedleAwnDailyDate(mode, runDate, todayDate) {
    return mode === 'daily' && runDate ? runDate : todayDate;
}
