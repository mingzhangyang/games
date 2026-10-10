#!/usr/bin/env node
// Independent website/score Worker releases need a bounded local retry journal.
import assert from 'node:assert/strict';
import {
    SCORE_PENDING_KEY, enqueuePendingScore, pendingScoreCount, retryPendingScores,
} from '../src/platform/scoreboard-pending.js';

const storage = new Map();
const realStorage = globalThis.localStorage;
const realNow = Date.now;
globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => { storage.set(key, String(value)); },
    removeItem: key => { storage.delete(key); },
};
try {
    const first = { game: 'math-rain-1', name: 'Tester', score: 42 };
    const previousDay = { game: 'needle-awn-d20261010', name: 'Tester', score: 17 };
    assert.equal(enqueuePendingScore(first), true);
    assert.equal(enqueuePendingScore(first), true, 'duplicate POST failure is idempotent');
    assert.equal(pendingScoreCount(first.game), 1);
    assert.equal(enqueuePendingScore(previousDay), true);
    assert.equal(pendingScoreCount(), 2);
    assert.equal(enqueuePendingScore({ game: '', name: 'A', score: 1 }), false);
    assert.equal(enqueuePendingScore({ game: 'invalid', name: 'A', score: NaN }), false);

    // Old Worker returns 400; the retry journal must never mark it submitted.
    const failedGames = [];
    assert.deepEqual(await retryPendingScores(async item => {
        failedGames.push(item.game);
        return false;
    }), []);
    assert.deepEqual(failedGames.sort(), [first.game, previousDay.game].sort());
    assert.equal(pendingScoreCount(), 2, 'a failed upload stays pending');

    // A successful read of any new board can later flush a previous day's
    // frozen Daily key after the scores Worker is manually published.
    const uploaded = await retryPendingScores(async () => true);
    assert.deepEqual(uploaded.sort(), [first.game, previousDay.game].sort());
    assert.equal(pendingScoreCount(), 0, 'successful uploads clear the retry journal');
    assert.deepEqual(await retryPendingScores(async () => {
        throw new Error('should not post empty queue');
    }), []);

    // Same-flight refresh/open calls may not upload the same score twice.
    enqueuePendingScore(first);
    let unblock;
    let calls = 0;
    const gate = new Promise(resolve => { unblock = resolve; });
    const a = retryPendingScores(async () => { calls++; await gate; return true; });
    const b = retryPendingScores(async () => { calls++; return true; });
    unblock();
    await Promise.all([a, b]);
    assert.equal(calls, 1, 'simultaneous refreshes share the same retry attempt');
    assert.equal(pendingScoreCount(), 0);

    // A bounded journal must never grow indefinitely during a long outage.
    for (let i = 0; i < 40; i++) {
        assert.equal(enqueuePendingScore({ game: 'math-rain-2', name: 'T' + i, score: i }), true);
    }
    assert.equal(pendingScoreCount(), 32, 'only the latest 32 failures are retained');

    const time = realNow();
    Date.now = () => time + 15 * 24 * 60 * 60 * 1000;
    assert.equal(pendingScoreCount(), 0, 'outdated scores do not reappear after expiry');
    Date.now = realNow;

    storage.set(SCORE_PENDING_KEY, '{malformed');
    assert.equal(pendingScoreCount(), 0, 'invalid local data is handled without throwing');
    storage.delete(SCORE_PENDING_KEY);
    globalThis.localStorage = {
        getItem: () => null,
        setItem: () => { throw new Error('private browsing blocks storage'); },
    };
    assert.equal(enqueuePendingScore(first), false,
        'the UI must not claim a failed upload was saved when storage is blocked');
} finally {
    globalThis.localStorage = realStorage;
    Date.now = realNow;
}
console.log('PASS independent score deployment: durable local journal, retry and expiry');
