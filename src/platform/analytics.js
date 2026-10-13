// Shared game telemetry facade. Gameplay owns its states; this module only
// registers read-only observers for the one per-document Analytics V2 client.
export function track(gameId, event) {
    if (typeof window !== 'undefined' && typeof window.hubTrack === 'function') {
        window.hubTrack(gameId, event);
    }
}

export function bindAnalyticsPlaying(gameId, isPlaying) {
    if (typeof window === 'undefined' || typeof isPlaying !== 'function' || !gameId) return;
    const observers = window.__gamesAnalyticsPlaying ||= new Map();
    observers.set(gameId, isPlaying);
    window.hubAnalytics?.bindPlaying(gameId, isPlaying);
}
