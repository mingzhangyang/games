/* 轻量自建统计 — 全站页面共用
 * 上报聚合计数（游戏 id + 事件类型），零个人信息。
 * 使用 sendBeacon（text/plain，免 CORS 预检），Worker 不可达时静默失败。
 * 用法：hubTrack('planet-merge', 'play') / hubTrack('planet-merge', 'finish')
 */
(function () {
    var ENDPOINT = 'https://games-analytics.orangely.workers.dev';

    function send(game, event) {
        try {
            var payload = JSON.stringify({ game: game, event: event });
            if (navigator.sendBeacon) {
                navigator.sendBeacon(ENDPOINT + '/event', payload);
            } else {
                fetch(ENDPOINT + '/event', {
                    method: 'POST',
                    body: payload,
                    keepalive: true
                }).catch(function () { /* 静默 */ });
            }
        } catch (e) {
            // 静默
        }
    }

    window.hubTrack = function (game, event) {
        if (!game || (event !== 'play' && event !== 'finish')) return;
        send(game, event);
    };
})();
