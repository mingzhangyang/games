/* Games Analytics V2. Best-effort, anonymous, one instance per document.
 * The Worker contract and registry own validation; gameplay state stays in each game.
 * No cookies, storage, identifying data, or blocking requests.
 */
(function () {
    'use strict';
    if (window.__gamesAnalyticsClient) return;
    window.__gamesAnalyticsClient = true;

    var script = document.currentScript;
    // registry:begin analytics-client-games
    var VALID_GAMES = new Set(["math-rain","tetris","tank-battle","gomoku","planet-merge","word-daily","hoop-shot","minesweeper","reversi","tower-defense","gravity-slingshot","needle-awn","sword-flight","lumen","circuit","silk-dew","bond-forge","echo-cave","maxwell-demon","crystal-bloom","flame-verse","ripple-duet","carrot-pull","firefly-signal","shadow-loom","loop-jail","magnetic-garden","minecraft","dots","stack","bridges","four-colors"]);
    var EXTERNAL_ORIGINS = {"minecraft":"https://2d-minecraft.orangely.xyz","dots":"https://dots-and-boxes.orangely.xyz","stack":"https://steady-hand.orangely.xyz","bridges":"https://bridges.orangely.xyz","four-colors":"https://four-colors.orangely.xyz"};
    // registry:end analytics-client-games
    var explicitGame = script && script.getAttribute('data-analytics-game');
    var match = /^\/([a-z0-9-]+)\.html$/.exec(location.pathname);
    var gameId = explicitGame || (match && match[1] !== 'index' ? match[1] : null);
    if (!VALID_GAMES.has(gameId)) gameId = null;

    // A local browser test may opt into a LOCAL mock, never the production Worker.
    var localTest = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(location.origin)
        && window.__ANALYTICS_V2_TEST__ === true;
    var endpoint = localTest ? location.origin + '/__analytics'
        : 'https://games-analytics.orangely.workers.dev';
    var allowedSite = location.origin === 'https://games.orangely.xyz'
        || location.origin === 'https://game.orangely.xyz';
    var externalOptIn = script && script.getAttribute('data-analytics-external') === 'true';
    var canReport = localTest || allowedSite
        || (externalOptIn && !!explicitGame && EXTERNAL_ORIGINS[explicitGame] === location.origin);

    function uuid() {
        if (!window.crypto) return null;
        if (typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
        if (typeof window.crypto.getRandomValues !== 'function') return null;
        var bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 15) | 64;
        bytes[8] = (bytes[8] & 63) | 128;
        var parts = Array.from(bytes, function (n) { return n.toString(16).padStart(2, '0'); }).join('');
        return parts.slice(0, 8) + '-' + parts.slice(8, 12) + '-' + parts.slice(12, 16)
            + '-' + parts.slice(16, 20) + '-' + parts.slice(20);
    }

    var sessionId = uuid();
    // V2 only. Do not probe Worker capabilities or downgrade to legacy events.
    var enabled = !!(gameId && sessionId && canReport);
    var inferredPlaying = false;
    var getter = null;
    var queue = [];
    var sending = false;
    var timer = null;
    var lastTick = performance.now();
    var lastWallTime = Date.now();
    var lastInteraction = lastTick;
    var activeMs = 0;
    var playingMs = 0;
    var lastFlush = lastTick;
    var IDLE_MS = 60000;
    var MAX_SAMPLE_MS = 2500;
    var CHECKPOINT_MS = 30000;
    var MAX_PENDING = 16;

    function isForeground() {
        return document.visibilityState === 'visible'
            && (typeof document.hasFocus !== 'function' || document.hasFocus());
    }

    function isPlaying() {
        try {
            var registry = window.__gamesAnalyticsPlaying;
            var fn = getter || (registry && registry.get(gameId));
            return typeof fn === 'function' ? !!fn() : inferredPlaying;
        } catch (error) {
            return false; // broken telemetry hooks must not affect gameplay
        }
    }

    // Sample every second rather than infer 30 seconds of gameplay from the
    // state observed at the next network checkpoint. Huge throttled gaps count 0.
    function dayUTC8(timestamp) {
        var d = new Date(timestamp + 8 * 3600000);
        return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
    }

    function sample() {
        var wall = Date.now();
        // Flush the previous day's bucket *before* sampling the new day.
        // Large clock/sleep gaps are rejected by the monotonic MAX_SAMPLE_MS guard.
        if (enabled && dayUTC8(wall) !== dayUTC8(lastWallTime)) flush(lastWallTime);
        lastWallTime = wall;
        var now = performance.now();
        var gap = now - lastTick;
        var start = lastTick;
        lastTick = now;
        if (!enabled || !isForeground() || gap <= 0 || gap > MAX_SAMPLE_MS) return;
        var observed = Math.min(gap, Math.max(0, lastInteraction + IDLE_MS - start));
        if (observed <= 0) return;
        activeMs += observed;
        if (isPlaying()) playingMs += observed;
    }

    function pump() {
        if (sending || !queue.length) return;
        var item = queue[0];
        if (performance.now() < item.retryAt) return;
        sending = true;
        item.tries += 1;
        var controller = typeof AbortController === 'function' ? new AbortController() : null;
        var timeout = controller ? setTimeout(function () { controller.abort(); }, 8000) : null;
        try {
            fetch(endpoint + '/event', {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
                body: item.body,
                keepalive: true,
                ...(controller ? { signal: controller.signal } : {})
            }).then(function (response) {
                if (queue[0] !== item) return;
                if (response.ok || response.status < 500 && response.status !== 429 || item.tries >= 3) {
                    queue.shift();
                } else {
                    item.retryAt = performance.now() + item.tries * 5000;
                }
            }).catch(function () {
                if (queue[0] !== item) return;
                if (item.tries >= 3) queue.shift();
                else item.retryAt = performance.now() + item.tries * 5000;
            }).then(function () {
                if (timeout !== null) clearTimeout(timeout);
                sending = false;
                pump();
            });
        } catch (error) {
            if (timeout !== null) clearTimeout(timeout);
            sending = false;
            if (item.tries >= 3) queue.shift();
            else item.retryAt = performance.now() + item.tries * 5000;
        }
    }

    function enqueue(payload) {
        try {
            var body = JSON.stringify(payload);
            if (queue.length >= MAX_PENDING) {
                // Prioritize open/play/finish; never accumulate an infinite offline backlog.
                var index = queue.findIndex(function (x, i) { return i > 0 && x.kind === 'active'; });
                if (index < 0) return; // bounded loss under extended outage
                queue.splice(index, 1);
            }
            queue.push({ kind: payload.event, body: body, tries: 0, retryAt: 0 });
            pump();
        } catch (error) { /* telemetry is optional */ }
    }

    function sendV2(kind, seconds, playSeconds, occurredAt) {
        if (!sessionId || !gameId) return;
        var id = uuid();
        if (!id) return;
        var event = { v: 2, game: gameId, event: kind, eventId: id, sessionId: sessionId };
        event.occurredAt = occurredAt === undefined ? Date.now() : occurredAt;
        if (kind === 'active') {
            event.seconds = seconds;
            event.playingSeconds = playSeconds;
        }
        enqueue(event);
    }

    function flush(occurredAt) {
        if (!enabled) return;
        var seconds = Math.min(60, Math.floor(activeMs / 1000));
        if (seconds <= 0) return;
        var played = Math.min(seconds, Math.floor(playingMs / 1000));
        activeMs -= seconds * 1000;
        playingMs -= played * 1000;
        sendV2('active', seconds, played, occurredAt);
        lastFlush = performance.now();
    }

    function tick() {
        sample();
        if (enabled && performance.now() - lastFlush >= CHECKPOINT_MS) {
            flush();
            lastFlush = performance.now();
        }
        pump();
    }

    function sendPendingBeacons() {
        // The same immutable event IDs may race with an in-flight fetch. D1
        // deduplicates them; do not create replacement IDs for retries.
        for (var i = 0; i < queue.length; i++) {
            try {
                if (navigator.sendBeacon
                    && navigator.sendBeacon(endpoint + '/event', queue[i].body)) continue;
                // Safari/private modes without beacon: keepalive is still best-effort.
                fetch(endpoint + '/event', { method: 'POST', body: queue[i].body,
                    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
                    keepalive: true }).catch(function () {});
            } catch (error) { /* game remains independent of analytics */ }
        }
    }

    function interrupt() {
        sample();
        flush();
        sendPendingBeacons();
        lastTick = performance.now(); // no background/sleep catch-up
    }

    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') interrupt();
        else lastTick = performance.now();
    });
    window.addEventListener('blur', interrupt);
    window.addEventListener('focus', function () { lastTick = performance.now(); });
    window.addEventListener('pagehide', interrupt);
    window.addEventListener('pageshow', function () { lastTick = performance.now(); });
    // Movement-based games may steer continuously without clicking. Every real
    // control gesture refreshes the local idle clock; none sends a network event.
    ['pointerdown', 'pointermove', 'mousemove', 'keydown', 'touchstart', 'touchmove', 'wheel'].forEach(function (name) {
        document.addEventListener(name, function () { lastInteraction = performance.now(); }, { passive: true });
    });

    window.hubAnalytics = {
        bindPlaying: function (game, callback) {
            if (game === gameId && typeof callback === 'function') getter = callback;
        },
        flush: function () { sample(); flush(); }
    };
    window.hubTrack = function (game, event) {
        if (!enabled || game !== gameId || (event !== 'play' && event !== 'finish')) return;
        sample();
        inferredPlaying = event === 'play';
        sendV2(event);
    };

    if (enabled) {
        // Emit immediately; an unavailable Worker only triggers bounded V2 retries.
        sendV2('open');
        timer = setInterval(tick, 1000);
    }
})();
