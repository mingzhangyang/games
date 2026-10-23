#!/usr/bin/env node
// Real network/journal modules with controlled transport and storage failures.
import assert from 'node:assert/strict';
import {
    createScoreboardReceiptLedger, createScoreboardResultSession, retryScoreResults, submitScoreResult,
} from '../src/platform/scoreboard-submission.js';
import {
    enqueuePendingScore, hasPendingScore, pendingScoreCount, retryPendingScores, subscribePendingScoreUploads,
} from '../src/platform/scoreboard-pending.js';
import { submitScore } from '../src/platform/leaderboard.js';

const realFetch = globalThis.fetch;
const realStorage = globalThis.localStorage;
const realNow = Date.now;
const storage = new Map();
let blockWrites = false;
let requests = [];
let respond;
globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => {
        if (blockWrites) throw new Error('Storage unavailable');
        storage.set(key, String(value));
    },
};
globalThis.fetch = async (url, options = {}) => {
    const request = {
        method: options.method || 'GET',
        entry: options.body ? JSON.parse(options.body) : null,
        game: new URL(url).searchParams.get('game'),
    };
    requests.push(request);
    return respond(request);
};
const response = (status = 200, rows = []) => ({ ok: status >= 200 && status < 300, status, json: async () => rows });
const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
};
const base = { runId: 1, date: '20261022', game: 'echo-cave-d20261022', name: 'Tester', score: 17 };
const sessions = [];
const session = changes => {
    const result = createScoreboardResultSession({ onChange: value => { changes.push(value); } });
    sessions.push(result);
    return result;
};
const reset = () => {
    for (const result of sessions) result.close();
    sessions.length = 0;
    storage.clear();
    requests = [];
    blockWrites = false;
};

try {
    // Exact acknowledgements outlive unrelated successes and journal cleanup.
    // Retried POST failure must not write a redundant entry into the bounded queue.
    reset();
    const ledger = createScoreboardReceiptLedger();
    const another = { ...base, score: 18 };
    respond = () => response(200);
    const sentA = await submitScoreResult(base);
    assert.equal(sentA.status, 'sent');
    ledger.acknowledge(sentA.entry);
    const sentB = await submitScoreResult(another);
    assert.equal(sentB.status, 'sent');
    ledger.acknowledge(sentB.entry);
    ledger.acknowledge(sentB.entry);
    assert.equal(ledger.has(base), true, 'B acknowledgement must not evict A');
    assert.equal(ledger.has(another), true);
    assert.equal(ledger.forBoard(base.game).length, 2, 'duplicate receipts do not consume memory');
    assert.equal(ledger.has({ ...base, score: 19 }), false, 'receipt matching is exact');

    respond = () => response(500);
    const resentA = await submitScoreResult(base, { previouslyConfirmed: ledger.has(base) });
    assert.equal(resentA.status, 'notSaved', 'new failed POST still reports that attempt honestly');
    assert.equal(ledger.has(base), true, 'new failure cannot revoke a prior remote receipt');
    assert.equal(pendingScoreCount(base.game), 0, 'known-confirmed score must not enter retry queue');

    enqueuePendingScore(base);
    blockWrites = true;
    await submitScoreResult(base, { previouslyConfirmed: ledger.has(base) });
    assert.equal(ledger.has(base), true, 'failed local cleanup cannot revoke confirmation');
    assert.equal(pendingScoreCount(base.game), 1, 'cleanup failure retains journal until next chance');
    blockWrites = false;
    await submitScoreResult(base, { previouslyConfirmed: ledger.has(base) });
    assert.equal(pendingScoreCount(base.game), 0, 'later attempt removes stale acknowledged journal entry');
    ledger.clear();
    assert.equal(ledger.forBoard(base.game).length, 0, 'destroyed view releases its receipt history');
    assert.equal(ledger.has(base), false);

    // Journal before the first byte is sent; caller mutations cannot retarget it.
    reset();
    const postGate = deferred();
    respond = () => postGate.promise;
    const mutable = { ...base };
    const publishing = submitScoreResult(mutable, { journal: true });
    assert.equal(pendingScoreCount(base.game), 1, 'journal precedes POST completion');
    mutable.game = 'echo-cave-d20261023';
    mutable.score = 999;
    postGate.resolve(response(500));
    const failed = await publishing;
    assert.equal(failed.status, 'queued');
    assert.equal(failed.entry.game, base.game);
    assert.equal(failed.entry.score, 17);
    assert.ok(Object.isFrozen(failed.entry));

    // A journal write can cease to be durable while the original request waits.
    for (const reason of ['capacity', 'expiry']) {
        reset();
        const gate = deferred();
        respond = () => gate.promise;
        const pending = submitScoreResult(base, { journal: true });
        assert.equal(hasPendingScore(base), true);
        if (reason === 'capacity') {
            for (let i = 0; i < 32; i++) {
                enqueuePendingScore({ game: base.game, name: 'Other', score: 100 + i });
            }
            assert.equal(pendingScoreCount(base.game), 32, 'board count cannot prove this exact result is saved');
        } else {
            const time = realNow();
            Date.now = () => time + 15 * 24 * 60 * 60 * 1000;
        }
        assert.equal(hasPendingScore(base), false);
        blockWrites = true;
        gate.resolve(response(500));
        assert.equal((await pending).status, 'notSaved', reason + ': failed rewrite cannot claim queued');
        Date.now = realNow;
    }

    reset();
    const evictedGate = deferred();
    respond = () => evictedGate.promise;
    const evictedPost = submitScoreResult(base, { journal: true });
    for (let i = 0; i < 32; i++) enqueuePendingScore({ game: base.game, name: 'Other', score: 100 + i });
    assert.equal(hasPendingScore(base), false);
    evictedGate.resolve(response(500));
    assert.equal((await evictedPost).status, 'queued');
    assert.equal(hasPendingScore(base), true, 'a writable journal restores an evicted failed result');

    // A separate retry owner may win while the original POST is still failing.
    // Observe resource lifetime without exposing test-only listener APIs.
    for (const matching of [true, false]) {
        reset();
        if (!matching) enqueuePendingScore({ ...base, score: 8 });
        const originalGate = deferred();
        let postCount = 0;
        respond = request => {
            if (++postCount === 1) return originalGate.promise;
            return response(matching || request.entry.score === 8 ? 200 : 500);
        };
        const subscriptions = [];
        const originalAdd = Set.prototype.add;
        Set.prototype.add = function (value) {
            if (typeof value === 'function') subscriptions.push({ set: this, listener: value });
            return originalAdd.call(this, value);
        };
        let firstPost;
        try {
            firstPost = submitScoreResult(base, { journal: true });
        } finally {
            Set.prototype.add = originalAdd;
        }
        assert.equal(subscriptions.length, 1, 'one temporary receipt subscription per submission');
        await retryPendingScores(submitScore);
        originalGate.resolve(response(500));
        assert.equal((await firstPost).status, matching ? 'sent' : 'queued');
        assert.equal(hasPendingScore(base), !matching,
            matching ? 'accepted result is not requeued by the old failure' : 'another score cannot acknowledge this one');
        assert.ok(subscriptions.every(({ set, listener }) => !set.has(listener)),
            'finally releases the temporary receipt listener on either outcome');
    }

    // No receipt can be invented from a successful GET or another score on this board.
    reset();
    const old = { ...base, score: 9 };
    enqueuePendingScore(old);
    respond = request => response(request.method === 'POST' && request.entry.score !== old.score ? 500 : 200,
        [{ name: 'Other', score: 2 }]);
    const mixedChanges = [];
    const mixed = session(mixedChanges);
    await mixed.publish(base);
    assert.equal(mixed.getState().board, 'ready');
    assert.equal(mixed.getState().submission, 'queued');
    assert.deepEqual(mixed.getState().rows, [{ name: 'Other', score: 2 }]);
    assert.equal(pendingScoreCount(base.game), 1);
    assert.ok(mixedChanges.every(state => state.submission !== 'sent'),
        'a different accepted score on the same board cannot acknowledge this result');

    // External retry owners (e.g. Sudoku startup) emit the same exact receipts.
    const retryGate = deferred();
    respond = () => retryGate.promise;
    const externalRetry = retryPendingScores(submitScore);
    blockWrites = true; // Remote accepts, but removing the journal now fails.
    retryGate.resolve(response(200));
    assert.deepEqual(await externalRetry, []);
    assert.equal(mixed.getState().submission, 'sent', 'acknowledgement survives local cleanup failure');
    assert.equal(pendingScoreCount(base.game), 1, 'cleanup failure leaves an idempotently retryable entry');

    // Queue expiry is not a receipt. A quiet empty queue cannot manufacture success.
    reset();
    respond = request => response(request.method === 'POST' ? 500 : 200);
    const expired = session([]);
    await expired.publish(base);
    const time = realNow();
    Date.now = () => time + 15 * 24 * 60 * 60 * 1000;
    assert.equal(pendingScoreCount(), 0);
    assert.equal(expired.getState().submission, 'notSaved', 'an expired journal is no longer advertised as saved');
    await expired.refresh();
    assert.notEqual(expired.getState().submission, 'sent');
    Date.now = realNow;

    // One completed run publishes once, even when its caller repeats settlement.
    reset();
    const duplicateGate = deferred();
    respond = request => request.method === 'POST' ? duplicateGate.promise : response(200);
    const once = session([]);
    const one = once.publish(base);
    const two = once.publish({ ...base, name: 'Changed after finishing', score: 999 });
    assert.equal(one, two, 'same run keeps the original promise and immutable identity');
    assert.equal(requests.filter(request => request.method === 'POST').length, 1);
    duplicateGate.resolve(response(200));
    await one;
    assert.equal(await once.publish(base), await one);
    assert.equal(requests.filter(request => request.method === 'POST').length, 1);
    assert.equal(once.getState().entry.name, base.name);
    assert.equal(once.getState().submission, 'sent');

    // Refreshing while the original journaled POST is outstanding shares that POST.
    reset();
    const sharedGate = deferred();
    respond = () => sharedGate.promise;
    const original = submitScoreResult(base, { journal: true });
    const simultaneousRetry = retryScoreResults();
    assert.equal(requests.length, 1);
    sharedGate.resolve(response(200));
    await Promise.all([original, simultaneousRetry]);
    assert.equal(requests.length, 1);
    assert.equal(pendingScoreCount(), 0);

    // An older startup retry snapshots the queue before a new result is queued.
    // Refresh must explicitly retry the current snapshot, not just join that old batch.
    reset();
    const oldEntry = { ...base, score: 99 };
    enqueuePendingScore(oldEntry);
    const startupGate = deferred();
    respond = request => request.method === 'POST' && request.entry.score === 99
        ? startupGate.promise : response(request.method === 'POST' ? 500 : 200);
    const startupRetry = retryScoreResults();
    const late = session([]);
    // publish() waits for loadBoard(), which joins the blocked startup batch.
    // Start it without awaiting that batch, then wait only for its failed POST.
    const publishing = late.publish(base);
    for (let i = 0; i < 20 && late.getState()?.submission !== 'queued'; i++) {
        await Promise.resolve();
    }
    assert.equal(late.getState().submission, 'queued');
    const lateAttempts = requests.filter(request => request.method === 'POST' && request.entry.score === 17).length;
    const onlineRefresh = late.refresh();
    startupGate.resolve(response(500));
    await Promise.all([publishing, startupRetry, onlineRefresh]);
    assert.ok(requests.filter(request => request.method === 'POST' && request.entry.score === 17).length > lateAttempts,
        'online refresh retries a result queued after startup retry snapshot');

    // Unsaved is honest; an explicit later refresh can recover the still-open result.
    reset();
    blockWrites = true;
    respond = request => response(request.method === 'POST' ? 500 : 200);
    const unsaved = session([]);
    await unsaved.publish(base);
    assert.equal(unsaved.getState().submission, 'notSaved');
    assert.equal(pendingScoreCount(), 0);
    blockWrites = false;
    respond = () => response(200);
    await unsaved.refresh();
    assert.equal(unsaved.getState().submission, 'sent');
    assert.equal(pendingScoreCount(), 0);
    assert.ok(requests.filter(request => request.method === 'POST').every(request =>
        request.entry.game === base.game && request.entry.name === base.name && request.entry.score === base.score),
    'recovery keeps the original date, player and score');

    // Closing a result drops its callbacks, while its POST still acknowledges storage.
    reset();
    const closeGate = deferred();
    respond = () => closeGate.promise;
    const closeChanges = [];
    const closing = session(closeChanges);
    const closingPost = closing.publish(base);
    closing.close();
    const countAtClose = closeChanges.length;
    assert.equal(closing.getState(), null);
    closeGate.resolve(response(200));
    await closingPost;
    assert.equal(pendingScoreCount(), 0);
    assert.equal(closeChanges.length, countAtClose);
    assert.equal(requests.length, 1, 'closed result never starts a stale GET');

    // A late GET for result A cannot overwrite the new result B on the same board.
    reset();
    const oldRead = deferred();
    const oldReadStarted = deferred();
    let reads = 0;
    respond = request => {
        if (request.method === 'POST') return response(200);
        if (++reads === 1) {
            oldReadStarted.resolve();
            return oldRead.promise;
        }
        return response(200, [{ name: 'New', score: 8 }]);
    };
    const raceChanges = [];
    const racing = session(raceChanges);
    const firstRun = racing.publish(base);
    await oldReadStarted.promise;
    racing.close();
    await racing.publish({ ...base, runId: 2, score: 8 });
    const afterNew = raceChanges.length;
    oldRead.resolve(response(200, [{ name: 'Old', score: 17 }]));
    await firstRun;
    assert.equal(racing.getState().entry.runId, 2);
    assert.deepEqual(racing.getState().rows, [{ name: 'New', score: 8 }]);
    assert.equal(raceChanges.length, afterNew);

    // Close also removes the pending receipt subscription, without blocking retries.
    reset();
    respond = request => response(request.method === 'POST' ? 500 : 200);
    const subscribedChanges = [];
    const subscribed = session(subscribedChanges);
    await subscribed.publish(base);
    subscribed.close();
    const closedChanges = subscribedChanges.length;
    const receipts = [];
    const unsubscribe = subscribePendingScoreUploads(entry => { receipts.push(entry); });
    respond = () => response(200);
    await retryScoreResults();
    unsubscribe();
    assert.equal(receipts.length, 1);
    assert.deepEqual(receipts[0], { game: base.game, name: base.name, score: base.score });
    assert.equal(subscribedChanges.length, closedChanges);
    assert.equal(subscribed.getState(), null);

    // Transport failure and unsupported reads remain independent from submission status.
    reset();
    respond = request => {
        if (request.method === 'POST') throw new Error('Network is down');
        return response(400);
    };
    const unsupported = session([]);
    await unsupported.publish(base);
    assert.equal(unsupported.getState().submission, 'queued');
    assert.equal(unsupported.getState().board, 'unsupported');
} finally {
    for (const result of sessions) result.close();
    globalThis.fetch = realFetch;
    globalThis.localStorage = realStorage;
    Date.now = realNow;
}
console.log('PASS scoreboard result receipts, immutable runs, retry recovery and stale-response isolation');
