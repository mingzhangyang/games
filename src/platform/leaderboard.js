// 全站唯一的榜单网络层（Workers game-scores 共享榜）。
//
// 边界约定：提交 / 拉取 / 转义收敛于此；渲染、本地榜兜底、玩家名获取归属各页面。
// 迁移自 9 份硬编码 URL + 各自的 AbortController fetch 样板
// （tetris / hoop-shot / minesweeper / planet-merge / reversi / gravity-slingshot /
//  sword-flight / needle-awn / tower-defense）。

export const SCORES_URL = 'https://game-scores.orangely.workers.dev';

/**
 * 提交分数。返回 true = Worker 接受（2xx）；false = 失败（网络/超时/非 2xx）。绝不抛出。
 * @param {object} o
 * @param {string} o.game  完整 game id（如 'tetris' 或 'sword-flight-d20260102'）
 * @param {string} o.name
 * @param {number} o.score
 * @param {number} [o.timeoutMs]
 * @param {object} [o.extra]  额外请求体字段（合并进 body）
 */
export async function submitScore({ game, name, score, timeoutMs = 3000, extra = null }) {
    const body = { game, name, score };
    if (extra) Object.assign(body, extra);
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(`${SCORES_URL}/scores`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal,
                mode: 'cors',
            });
            return res.ok;
        } finally {
            clearTimeout(timer);
        }
    } catch (e) {
        return false;
    }
}

/**
 * 拉取榜单。返回解析后的数组；失败（网络/超时/非 2xx）抛出——
 * 页面据此走各自的本地榜兜底 / 离线提示。
 * @param {string} game
 * @param {{ timeoutMs?: number }} [opts]
 */
export async function fetchBoard(game, { timeoutMs = 3500 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(`${SCORES_URL}/scores?game=${encodeURIComponent(game)}`, {
            signal: controller.signal,
            mode: 'cors',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
}

/** HTML 转义（榜单名单等 innerHTML 插值场景；textContent 不需要）。 */
export function escapeHTML(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
