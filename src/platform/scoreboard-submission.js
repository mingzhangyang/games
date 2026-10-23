/**
 * Shared score receipts and result sessions. Games own eligibility and the frozen
 * run/date/score; views own DOM, language, focus and their open/close lifecycle.
 */
import { fetchBoard, submitScore, UnsupportedLeaderboardError } from './leaderboard.js';
import {
    enqueuePendingScore, dequeuePendingScore, hasPendingScore, retryPendingScores, subscribePendingScoreUploads,
} from './scoreboard-pending.js';

export const sameScoreEntry = (a, b) => a.game === b.game && a.name === b.name && a.score === b.score;
const entryKey = entry => JSON.stringify([entry.game, entry.name, entry.score]);
const posts = new Map();

/**
 * A remote acknowledgement is a durable fact for this mounted view, not an
 * entry in the expiring retry journal. Keep exact, deduplicated identities for
 * the view's lifetime; its owner clears the ledger on destroy. Nothing here is
 * persisted or evicted when another score succeeds.
 */
export function createScoreboardReceiptLedger() {
    const byGame = new Map();
    return {
        acknowledge(entry) {
            let entries = byGame.get(entry.game);
            if (!entries) {
                entries = new Map();
                byGame.set(entry.game, entries);
            }
            const key = entryKey(entry);
            if (!entries.has(key)) {
                entries.set(key, Object.freeze({ game: entry.game, name: entry.name, score: entry.score }));
            }
        },
        has(entry) {
            return byGame.get(entry.game)?.has(entryKey(entry)) ?? false;
        },
        forBoard(game) {
            return [...(byGame.get(game)?.values() || [])];
        },
        clear() { byGame.clear(); },
    };
}

function snapshot(entry) {
    if (!entry || typeof entry.game !== 'string' || !entry.game || entry.game.length > 80
        || typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > 20
        || !Number.isFinite(entry.score) || entry.score < 0) {
        throw new TypeError('Invalid scoreboard result');
    }
    return Object.freeze({
        runId: entry.runId, date: entry.date,
        game: entry.game, name: entry.name, score: entry.score,
    });
}

// A refresh can retry a journal entry while its original POST is still pending.
// Share only that in-flight request; a later, distinct run may submit again.
function post(entry) {
    const key = entryKey(entry);
    if (posts.has(key)) return posts.get(key);
    const request = submitScore(entry).finally(() => { posts.delete(key); });
    posts.set(key, request);
    return request;
}

// A failed repeat of an exactly acknowledged score is still a failed POST,
// but cannot become a new pending upload or evict a genuinely unsent score.
export async function submitScoreResult(entry, { journal = false, previouslyConfirmed = false } = {}) {
    const frozen = snapshot(entry);
    if (journal && !previouslyConfirmed) enqueuePendingScore(frozen);
    let acknowledged = false;
    const stopUploads = subscribePendingScoreUploads(uploaded => {
        if (sameScoreEntry(uploaded, frozen)) acknowledged = true;
    });
    try {
        // Another retry owner can acknowledge this exact entry before our first
        // request fails. Preserve that receipt instead of journaling it again.
        const accepted = await post(frozen) || acknowledged;
        // A known remote receipt also permits cleanup of an old local entry,
        // even when this particular redundant POST failed.
        if (accepted || previouslyConfirmed) dequeuePendingScore(frozen);
        // The bounded/expiring journal may change while the POST is outstanding.
        // An earlier successful write is not proof this entry is still retryable.
        const saved = !accepted && !previouslyConfirmed
            && (hasPendingScore(frozen) || enqueuePendingScore(frozen));
        return { entry: frozen, status: accepted ? 'sent' : (saved ? 'queued' : 'notSaved') };
    } finally {
        stopUploads();
    }
}

/** Also safe at startup/online without an open result or leaderboard. */
export function retryScoreResults() {
    return retryPendingScores(post);
}

/**
 * One visible result at a time. Re-publishing its runId returns the original
 * promise. Closing invalidates view work, never the durable POST/acknowledgement.
 * A successful GET changes board state only; an exact POST receipt changes upload
 * state. refresh() may explicitly retry an unsaved current result from memory.
 */
export function createScoreboardResultSession({ onChange }) {
    let current = null;
    let active = false;
    let requestId = 0;
    let stopUploads = () => {};
    const submissionState = result => result.submission === 'queued' && !hasPendingScore(result.entry)
        ? 'notSaved' : result.submission;

    function getState() {
        if (!active || !current) return null;
        return Object.freeze({
            entry: current.entry,
            submission: submissionState(current),
            board: current.board,
            rows: current.rows,
        });
    }

    const notify = () => {
        const state = getState();
        if (state) onChange(state);
    };
    const isCurrent = (result, seq) => active && current === result && requestId === seq;

    async function loadBoard(result) {
        if (!active || current !== result) return;
        const seq = ++requestId;
        result.board = 'loading';
        notify();
        try {
            const read = async () => {
                const rows = await fetchBoard(result.entry.game);
                if (!Array.isArray(rows)) throw new Error('Invalid leaderboard response');
                if (!isCurrent(result, seq)) return false;
                result.rows = Object.freeze(rows.slice());
                result.board = 'ready';
                notify();
                return true;
            };
            if (!await read()) return;
            const uploaded = await retryScoreResults();
            if (!isCurrent(result, seq)) return;
            // At most one follow-up GET. A cleanup failure must never create a
            // retry/refetch loop, even though the remote receipt is still valid.
            if (uploaded.includes(result.entry.game)) await read();
        } catch (error) {
            if (!isCurrent(result, seq)) return;
            result.board = error instanceof UnsupportedLeaderboardError ? 'unsupported' : 'offline';
            notify();
        }
    }

    function close() {
        active = false;
        ++requestId;
        stopUploads();
        stopUploads = () => {};
    }

    function publish(entry) {
        if (entry?.runId === undefined || entry.runId === null) throw new TypeError('A result needs its runId');
        if (current?.entry.runId === entry.runId) return current.promise;
        const frozen = snapshot(entry);
        close();
        active = true;
        const result = {
            entry: frozen, submission: 'submitting', board: 'idle',
            rows: Object.freeze([]), promise: null, retry: null,
        };
        current = result;
        stopUploads = subscribePendingScoreUploads(uploaded => {
            if (!sameScoreEntry(uploaded, frozen)) return;
            result.submission = 'sent';
            notify();
        });
        notify();
        result.promise = submitScoreResult(frozen, { journal: true }).then(async receipt => {
            // A concurrent retry may already have remotely acknowledged it.
            if (result.submission !== 'sent') result.submission = receipt.status;
            if (active && current === result) {
                notify();
                await loadBoard(result);
            }
            return { entry: frozen, status: submissionState(result) };
        });
        return result.promise;
    }

    async function refresh() {
        const result = current;
        if (!active || !result) return;
        if (['queued', 'notSaved'].includes(submissionState(result)) || result.retry) {
            if (!result.retry) {
                result.submission = 'submitting';
                notify();
                result.retry = submitScoreResult(result.entry, { journal: true }).then(receipt => {
                    if (result.submission !== 'sent') result.submission = receipt.status;
                    if (active && current === result) notify();
                }).finally(() => { result.retry = null; });
            }
            await result.retry;
        }
        await loadBoard(result);
    }

    return { publish, refresh, close, getState };
}
