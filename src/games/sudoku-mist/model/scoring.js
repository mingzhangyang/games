/**
 * 推理即得分（设计 §5.2 / §5.3）。单步分 = round(基础分 × 穿雾 × 连推)。
 */
export const BASE_POINTS = Object.freeze({ 1: 10, 2: 20, 3: 40, 4: 80 });
export const FOG_MULTIPLIER = 1.5;
export const STREAK_STEP = 0.1;
export const STREAK_CAP = 10;
export const WRONG_PENALTY = 20;

/** 第 n 次连续推理落子的乘数（n ≥ 1）：1 + 0.1 × min(n − 1, 10)，上限 ×2.0 */
export function streakMultiplier(n) {
    return 1 + STREAK_STEP * Math.min(Math.max(n, 1) - 1, STREAK_CAP);
}

/** tier 0 = 侥幸（推不出），hinted = 照着点灯落子；两者都是 0 分 */
export function placementPoints({ tier, intoFog, streak, hinted = false }) {
    if (hinted || !tier) return 0;
    return Math.round(BASE_POINTS[tier] * (intoFog ? FOG_MULTIPLIER : 1) * streakMultiplier(streak));
}

/**
 * 关卡星级（设计 §8.1）：通关 ★1；分数 ≥ stars[0] ★2；≥ stars[1] ★3。
 * 阈值由 tools/generators/sudoku-mist-levels.mjs 按测试玩家的得分算出并写进 levels.js；
 * 没有阈值（自由局 / 每日题）或没通关时返回 0。
 */
export function starsFor(score, thresholds) {
    if (!Array.isArray(thresholds) || score === null || score === undefined || !Number.isFinite(score)) return 0;
    return 1 + (score >= thresholds[0] ? 1 : 0) + (score >= thresholds[1] ? 1 : 0);
}
