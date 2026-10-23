/**
 * Browser-local retry journal for the independently deployed leaderboard Worker.
 * This is not a remote success signal: entries remain pending until POST succeeds.
 */
import { storageGet, storageSet } from './safe-storage.js';

export const SCORE_PENDING_KEY = 'scoreboard:pending:v1';
const MAX_ENTRIES = 32;
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const valid = item => item && typeof item.game === 'string'
    && item.game.length > 0 && item.game.length <= 80
    && typeof item.name === 'string' && item.name.trim() && item.name.length <= 20
    && typeof item.score === 'number' && Number.isFinite(item.score) && item.score >= 0
    && Number.isFinite(item.at);
const identity = item => JSON.stringify([item.game, item.name, item.score]);

function readPending() {
    let items;
    try { items = JSON.parse(storageGet(SCORE_PENDING_KEY) || '[]'); }
    catch { return []; }
    if (!Array.isArray(items)) return [];
    const now = Date.now();
    return items.filter(item => valid(item) && item.at <= now && now - item.at < MAX_AGE_MS)
        .slice(-MAX_ENTRIES);
}

export function pendingScoreCount(game = null) {
    return readPending().filter(item => !game || item.game === game).length;
}

export function hasPendingScore(entry) {
    const key = identity(entry);
    return readPending().some(item => identity(item) === key);
}

export function enqueuePendingScore({ game, name, score }) {
    const item = { game, name, score, at: Date.now() };
    if (!valid(item)) return false;
    const queue = readPending().filter(old => identity(old) !== identity(item));
    queue.push(item);
    // A full storage quota is reported as failure rather than pretending to
    // have preserved the score. The cap limits both space and retry requests.
    return storageSet(SCORE_PENDING_KEY, JSON.stringify(queue.slice(-MAX_ENTRIES)));
}

/** Drop an entry once the Worker acknowledged it (journal-before-POST callers). */
export function dequeuePendingScore(item) {
    const queue = readPending();
    return storageSet(SCORE_PENDING_KEY, JSON.stringify(queue.filter(old => identity(old) !== identity(item))));
}

let retryInFlight = null;
const uploadListeners = new Set();

/** Exact remote receipts, including acknowledgements whose local cleanup failed. */
export function subscribePendingScoreUploads(listener) {
    uploadListeners.add(listener);
    return () => { uploadListeners.delete(listener); };
}

/**
 * Called after any successful leaderboard GET, so yesterday's Daily entries
 * can be retried even when their board is no longer visible in the selector.
 * A failed POST keeps its entry. No silent fire-and-forget removal.
 */
export function retryPendingScores(submit) {
    if (retryInFlight) return retryInFlight;
    retryInFlight = (async () => {
        const uploadedGames = new Set();
        for (const item of readPending()) {
            let accepted = false;
            try { accepted = await submit(item); } catch { /* Remain pending. */ }
            if (accepted) {
                if (dequeuePendingScore(item)) uploadedGames.add(item.game);
                const receipt = Object.freeze({ game: item.game, name: item.name, score: item.score });
                for (const listener of uploadListeners) {
                    try { listener(receipt); } catch { /* View work cannot undo a remote acknowledgement. */ }
                }
            }
        }
        return [...uploadedGames];
    })();
    return retryInFlight.finally(() => { retryInFlight = null; });
}
