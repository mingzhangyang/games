/* Games Analytics V2 client. No PII, cookies or persistent identifier.
 * Before the manually deployed D1 Worker supports V2, preserve legacy play/finish
 * reporting. Once GET /stats?v=2 succeeds, track one game-page open and visible time.
 */
(function () {
    var ENDPOINT = 'https://games-analytics.orangely.workers.dev';
    var page = /\/([a-z0-9-]+)\.html$/.exec(window.location.pathname || '');
    var pageGame = page && page[1] !== 'index' ? page[1] : null;
    // The Worker only permits our published site origins. Local preview / CI and
    // third-party domains must not probe the live API: browsers log CORS failures
    // even when fetch errors are caught. Keep legacy play/finish on those origins.
    var canProbeV2 = window.location.origin === 'https://games.orangely.xyz'
        || window.location.origin === 'https://game.orangely.xyz';
    var uuid = window.crypto && typeof window.crypto.randomUUID === 'function'
        ? function () { return window.crypto.randomUUID(); } : null;
    var sessionId = uuid ? uuid() : null;
    var v2Ready = false;
    var visibleSince = null;
    var remainderMs = 0;

    function send(payload) {
        try {
            var body = JSON.stringify(payload);
            if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT + '/event', body)) return;
            fetch(ENDPOINT + '/event', { method: 'POST', body: body, keepalive: true })
                .catch(function () {});
        } catch (e) { /* Telemetry must never block the game. */ }
    }

    function sendV2(game, event, seconds) {
        var payload = { v: 2, game: game, event: event, eventId: uuid(), sessionId: sessionId };
        if (event === 'active') payload.seconds = seconds;
        send(payload);
    }

    function flushVisible() {
        if (visibleSince === null || !v2Ready || !pageGame) return;
        var now = performance.now();
        // Discard large unobservable gaps caused by browser sleep / timer throttling.
        remainderMs += Math.min(60000, Math.max(0, now - visibleSince));
        visibleSince = now;
        var wholeSeconds = Math.floor(remainderMs / 1000);
        remainderMs -= wholeSeconds * 1000;
        if (wholeSeconds > 0) sendV2(pageGame, 'active', wholeSeconds);
    }

    document.addEventListener('visibilitychange', function () {
        if (!v2Ready || !pageGame) return;
        if (document.visibilityState === 'hidden') {
            flushVisible();
            visibleSince = null;
        } else if (visibleSince === null) {
            visibleSince = performance.now();
        }
    });
    window.addEventListener('pagehide', function () {
        flushVisible();
        visibleSince = null;
    });
    window.addEventListener('pageshow', function () {
        if (v2Ready && pageGame && document.visibilityState === 'visible' && visibleSince === null) {
            visibleSince = performance.now();
        }
    });

    // A page opened against the old KV Worker must still be able to send play/finish.
    // A V2-only client would be rejected until the operator deploys the D1 Worker.
    if (uuid && canProbeV2) {
        try {
            fetch(ENDPOINT + '/stats?v=2', { cache: 'no-store' })
                .then(function (response) { return response.ok ? response.json() : null; })
                .then(function (stats) {
                    if (!stats || stats.scope !== 'day' || !stats.games || !stats.total) return;
                    v2Ready = true;
                    if (!pageGame) return;
                    sendV2(pageGame, 'open');
                    if (document.visibilityState === 'visible') visibleSince = performance.now();
                    setInterval(flushVisible, 15000);
                })
                .catch(function () { /* Remain on legacy play/finish during rollout or outage. */ });
        } catch (e) { /* Same fallback. */ }
    }

    window.hubTrack = function (game, event) {
        if (!game || (event !== 'play' && event !== 'finish')) return;
        if (v2Ready) sendV2(game, event);
        else send({ game: game, event: event });
    };
})();
