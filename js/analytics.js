// 全站唯一的播放统计上报入口（守卫在此唯一实现）。
// 迁移自 13 个入口 × 3 种守卫写法（typeof === 'function' / 真值判断 /
// 再查 window 存在）。服务端白名单见 Workers/games-analytics.js（由
// games.config.json 经 npm run gen 派生）。
export function track(gameId, event) {
    if (typeof window !== 'undefined' && typeof window.hubTrack === 'function') {
        window.hubTrack(gameId, event);
    }
}
