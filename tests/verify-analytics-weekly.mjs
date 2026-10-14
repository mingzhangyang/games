// End-to-end phase 3 checks: genuine SQLite migrations, Worker handlers and
// simulated emails. Never contact real Cloudflare/Resend services.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../Workers/games-analytics.js';
import {
    weekStartForInstant, previousCompleteWeek, weekBounds, loadWeeklyReport,
    renderWeeklyReport, formatSeconds, ratio, delta,
} from '../Workers/analytics-weekly.js';
import { sendWeek } from '../Workers/analytics-weekly-delivery.js';

const Request = globalThis.Request;

const migration = name => readFileSync(new URL(`../Workers/migrations/analytics/${name}`, import.meta.url), 'utf8');
const names = { tetris: '俄罗斯方块', gomoku: 'Five & <script>alert("x")</script>',
    dots: 'Dots and Boxes' };
const external = ['dots'];
const NOW = Date.parse('2026-10-12T01:00:00.000Z');
const originalNow = Date.now;
Date.now = () => NOW;
const dbs = [];

function makeDB() {
    const raw = new DatabaseSync(':memory:');
    dbs.push(raw);
    for (const file of ['0001_analytics_v2.sql', '0002_playing_seconds.sql',
        '0003_event_occurred_at.sql', '0004_weekly_delivery.sql']) raw.exec(migration(file));
    const binding = {
        prepare(query) {
            const s = raw.prepare(query);
            return {
                bind(...params) {
                    return {
                        async first() { return s.get(...params) ?? null; },
                        async all() { return { results: s.all(...params) }; },
                        async run() { return { meta: { changes: s.run(...params).changes } }; },
                    };
                },
                async first() { return s.get() ?? null; },
                async all() { return { results: s.all() }; },
                async run() { return { meta: { changes: s.run().changes } }; },
            };
        },
    };
    const insert = (day, game, opens, plays, finishes, active, playing) =>
        raw.prepare(`INSERT INTO analytics_daily
            (day, game, opens, plays, finishes, active_seconds, playing_seconds)
            VALUES (?, ?, ?, ?, ?, ?, ?)`).run(day, game, opens, plays, finishes, active, playing);
    return { raw, binding, insert };
}

const seed = db => {
    db.insert('20260928', 'tetris', 3, 3, 2, 120, 60);
    db.insert('20261005', 'tetris', 10, 12, 9, 600, 480);
    db.insert('20261006', 'tetris', 5, 6, 1, 120, 100);
    db.insert('20261007', 'gomoku', 2, 1, 1, 140, 110);
    db.insert('20261008', 'dots', 3, 1, 0, 40, 15);
};
const envFor = (db, sender) => ({
    ANALYTICS_DB: db.binding,
    REPORT_ENABLED: 'true', REPORT_COMPLETE_SINCE: '20260928',
    REPORT_FROM: 'reports@example.org', REPORT_TO: 'admin@example.net',
    REPORT_ADMIN_TOKEN: 'a-secure-operator-token-for-tests-1234567890',
    ANALYTICS_RATE_LIMITER: { limit: async () => ({ success: true }) },
    EMAIL: { send: sender },
});
const record = (db, key) => db.raw.prepare(
    'SELECT * FROM analytics_weekly_delivery WHERE report_key = ?',
).get(key);
const request = (path, method = 'GET', token = null, body = null) =>
    new Request(`https://games-analytics.orangely.workers.dev${path}`, {
        method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
const secret = 'a-secure-operator-token-for-tests-1234567890';

try {
    assert.equal(weekStartForInstant(Date.parse('2026-10-11T15:59:59Z')), '20261005');
    assert.equal(weekStartForInstant(Date.parse('2026-10-11T16:00:00Z')), '20261012');
    assert.equal(previousCompleteWeek(NOW), '20261005');
    assert.equal(previousCompleteWeek(Date.parse('2027-01-03T16:00:00Z')), '20261228');
    assert.equal(previousCompleteWeek(Date.parse('2026-03-01T16:00:00Z')), '20260223');
    assert.equal(weekBounds('20261005').end, '20261012');
    assert.equal(weekBounds('20261228').lastDay, '20270103');
    for (const invalid of ['20261006', '20260230', '2026105', 'a20261005']) {
        assert.throws(() => weekBounds(invalid));
    }
    assert.equal(formatSeconds(0), '0 秒');
    assert.equal(formatSeconds(59), '59 秒');
    assert.equal(formatSeconds(3661), '1 小时 1 分钟');
    assert.equal(ratio(100, 0), null);
    assert.equal(ratio(12, 10), 1.2);
    assert.equal(delta(5, 0, true).kind, 'new');
    assert.equal(delta(0, 0, true).kind, 'none');
    assert.equal(delta(10, 5, false), null);

    const db = makeDB();
    seed(db);
    const report = await loadWeeklyReport(db.binding, '20261005', names, external, '20260928', NOW);
    assert.deepEqual(report.total, {
        opens: 20, plays: 20, finishes: 11, activeSeconds: 900, playingSeconds: 705,
    });
    assert.equal(report.previousTotal.opens, 3);
    assert.equal(report.daily.length, 7);
    assert.equal(report.daily[0].opens, 10);
    assert.equal(report.daily[1].activeSeconds, 120);
    assert.equal(report.daily[2].playingSeconds, 110);
    assert.equal(report.daily[4].opens, 0);
    assert.equal(report.games[0].name, '俄罗斯方块');
    assert.equal(report.games.find(game => game.id === 'dots').external, true);
    assert.equal(report.games.find(game => game.id === 'tetris').current.plays, 18);
    assert(report.currentComplete && report.previousComplete);
    const one = renderWeeklyReport(report);
    assert(one.subject.includes('2026-10-05 — 2026-10-11'));
    assert(one.html.includes('俄罗斯方块') && one.text.includes('俄罗斯方块'));
    assert(one.html.includes('Five &amp; &lt;script&gt;'));
    assert(!one.html.includes('<script'));
    assert(!one.html.includes('<canvas'));
    assert(one.html.includes('每日趋势') && one.text.includes('2026-10-11'));
    assert(!one.html.includes('a-secure-operator-token-for-tests'));
    assert(one.text.includes('120.0%'), 'multi-start rate is not capped at 100%');

    const nonComparable = await loadWeeklyReport(db.binding, '20261005', names, external, '20261005', NOW);
    assert(!nonComparable.previousComplete);
    assert(renderWeeklyReport(nonComparable).text.includes('基线不完整'));
    const empty = makeDB();
    await assert.rejects(loadWeeklyReport(empty.binding, '20261005', names, external, '20260928', NOW));
    const previewEmpty = await loadWeeklyReport(empty.binding, '20261005', names, external, null,
        NOW, { allowEmpty: true });
    assert.equal(previewEmpty.total.opens, 0);
    const corrupt = {
        prepare() {
            return {
                bind() {
                    return {
                        async all() {
                            return { results: [{
                                day: '20261005', game: 'tetris', opens: -1,
                                plays: 0, finishes: 0, active_seconds: 0, playing_seconds: 0,
                            }] };
                        },
                    };
                },
            };
        },
    };
    await assert.rejects(loadWeeklyReport(corrupt, '20261005', names, external, '20260928', NOW));

    const sent = [];
    const env = envFor(db, async message => {
        sent.push(message);
        return { messageId: `cf-${sent.length}` };
    });
    assert.equal((await worker.fetch(request('/admin/weekly/preview?week=20261005'), env)).status, 401);
    assert.equal((await worker.fetch(request('/admin/weekly/status', 'GET', 'wrong'), env)).status, 401);
    assert.equal((await worker.fetch(request('/admin/weekly/retry?week=20261005', 'POST'), env)).status, 401);
    assert.equal((await worker.fetch(request('/admin/weekly/preview?week=20261006', 'GET', secret), env)).status, 400);
    const preview = await worker.fetch(request('/admin/weekly/preview?week=20261005&format=html', 'GET', secret), env);
    assert.equal(preview.status, 200);
    assert.equal(preview.headers.get('access-control-allow-origin'), null);
    assert((await preview.text()).includes('Orangely Games'));
    const plain = await worker.fetch(request('/admin/weekly/preview?week=20261005&format=text', 'GET', secret), env);
    assert.equal(plain.status, 200);
    assert((await plain.text()).includes('每日趋势'));

    // Daily cleanup at Monday 03:17 Beijing must not send before weekly Monday 09:00.
    await worker.scheduled({ cron: '17 19 * * *', scheduledTime: Date.parse('2026-10-11T19:17:00Z') }, env);
    assert.equal(sent.length, 0);
    await worker.scheduled({ cron: '0 1 * * MON', scheduledTime: NOW }, env);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'admin@example.net');
    assert(sent[0].html.includes('<html') && sent[0].text.includes('游戏排行'));
    assert.equal(record(db, 'weekly:20261005').message_id, 'cf-1');
    assert.equal(record(db, 'weekly:20261005').status, 'sent');
    await worker.scheduled({ cron: '0 1 * * MON', scheduledTime: NOW }, env);
    assert.equal(sent.length, 1, 'repeated Cron is idempotent');
    assert.equal((await worker.fetch(request('/admin/weekly/retry?week=20261005', 'POST', secret), env)).status, 409);
    assert.equal(sent.length, 1, 'manual duplicate is blocked');
    const status = await worker.fetch(request('/admin/weekly/status', 'GET', secret), env);
    assert.equal(status.status, 200);
    assert((await status.json()).records.some(row => row.message_id === 'cf-1'));

    const testSend = await worker.fetch(request('/admin/weekly/test?week=20261005', 'POST', secret), env);
    assert.equal(testSend.status, 200);
    assert.equal(sent.length, 2);
    assert(sent[1].subject.startsWith('[TEST / NOT LIVE]'));
    assert.equal(record(db, 'test:20261005').status, 'sent');
    assert.equal((await worker.fetch(request('/admin/weekly/test?week=20261005', 'POST', secret), env)).status, 409);

    // A true data query failure must not send blank mail or mark success.
    const failed = makeDB();
    seed(failed);
    let failQuery = true;
    const brokenBinding = {
        prepare(sql) {
            if (failQuery && sql.includes('FROM analytics_daily WHERE day >=')) throw new Error('D1 read failed');
            return failed.binding.prepare(sql);
        },
    };
    const recovered = [];
    const failedEnv = { ...envFor(failed, async email => {
        recovered.push(email);
        return { messageId: 'recovered-1' };
    }), ANALYTICS_DB: brokenBinding };
    await assert.rejects(sendWeek(failedEnv, '20261005', names, external, NOW));
    assert.equal(record(failed, 'weekly:20261005').status, 'failed');
    assert.equal(recovered.length, 0);
    failQuery = false;
    // An authorized manual retry is immediate; regular retry observes six-hour cool-down.
    assert.equal((await sendWeek(failedEnv, '20261005', names, external, NOW)).status, 'already_handled');
    assert.equal((await sendWeek(failedEnv, '20261005', names, external, NOW, { manual: true })).status, 'sent');
    assert.equal(recovered.length, 1);
    assert.equal(record(failed, 'weekly:20261005').attempts, 2);

    // Provider exception has ambiguous acceptance; NEVER blindly retry it.
    const unknown = makeDB();
    seed(unknown);
    let failProvider = true;
    const uncertainMail = [];
    const unknownEnv = envFor(unknown, async email => {
        uncertainMail.push(email);
        if (failProvider) throw new Error('connection dropped after potential acceptance');
        return { messageId: 'confirmed-new-send' };
    });
    await assert.rejects(sendWeek(unknownEnv, '20261005', names, external, NOW));
    assert.equal(record(unknown, 'weekly:20261005').status, 'uncertain');
    assert.equal((await sendWeek(unknownEnv, '20261005', names, external, NOW, { manual: true })).status, 'already_handled');
    failProvider = false;
    const retry = await worker.fetch(request('/admin/weekly/retry?week=20261005', 'POST', secret), unknownEnv);
    assert.equal(retry.status, 409);
    assert.equal(uncertainMail.length, 1);
    assert.equal((await worker.fetch(request('/admin/weekly/reconcile?week=20261005', 'POST', secret,
        { decision: 'not_delivered', confirmed: false }), unknownEnv)).status, 400);
    const reconcile = await worker.fetch(request('/admin/weekly/reconcile?week=20261005', 'POST', secret,
        { decision: 'not_delivered', confirmed: true }), unknownEnv);
    assert.equal(reconcile.status, 200);
    assert.equal(record(unknown, 'weekly:20261005').status, 'failed');
    const manual = await worker.fetch(request('/admin/weekly/retry?week=20261005', 'POST', secret), unknownEnv);
    assert.equal(manual.status, 200);
    assert.equal(uncertainMail.length, 2);
    assert.equal(record(unknown, 'weekly:20261005').status, 'sent');

    // Racing scheduled/manual sends share a single D1 idempotency key.
    const parallel = makeDB();
    seed(parallel);
    const parallelSends = [];
    const parallelEnv = envFor(parallel, async message => {
        parallelSends.push(message);
        return { messageId: 'parallel-1' };
    });
    const results = await Promise.all(Array.from({ length: 8 }, () =>
        sendWeek(parallelEnv, '20261005', names, external, NOW)));
    assert.equal(parallelSends.length, 1, 'atomic claim prevents parallel duplicate emails');
    assert.equal(results.filter(x => x.status === 'sent').length, 1);

    // A crash after provider handoff must not be replayed by daily recovery.
    const interrupted = makeDB();
    seed(interrupted);
    interrupted.raw.prepare(`INSERT INTO analytics_weekly_delivery
      (report_key, week_start, kind, status, attempts, lease_token, lease_until, last_attempt_at)
      VALUES ('weekly:20261005', '20261005', 'weekly', 'sending', 1, 'old-token',
        '2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00.000Z')`).run();
    const neverSends = [];
    const interruptedEnv = envFor(interrupted, async message => {
        neverSends.push(message);
        return { messageId: 'unexpected' };
    });
    await worker.scheduled({
        cron: '17 19 * * *', scheduledTime: Date.parse('2026-10-13T19:17:00Z'),
    }, interruptedEnv);
    assert.equal(neverSends.length, 0);
    assert.equal(record(interrupted, 'weekly:20261005').status, 'uncertain');

    // A crash before provider handoff leaves a safely re-claimable preparing
    // lease; the daily recovery cron must resume it without manual action.
    const preparing = makeDB();
    seed(preparing);
    preparing.raw.prepare(`INSERT INTO analytics_weekly_delivery
      (report_key, week_start, kind, status, attempts, lease_token, lease_until, last_attempt_at)
      VALUES ('weekly:20261005', '20261005', 'weekly', 'preparing', 1, 'expired-token',
        '2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00.000Z')`).run();
    const resumed = [];
    const preparingEnv = envFor(preparing, async message => {
        resumed.push(message);
        return { messageId: 'resumed-after-preparing' };
    });
    await worker.scheduled({
        cron: '17 19 * * *', scheduledTime: Date.parse('2026-10-12T19:17:00Z'),
    }, preparingEnv);
    assert.equal(resumed.length, 1, 'expired preparing lease gets a daily retry');
    assert.equal(record(preparing, 'weekly:20261005').status, 'sent');
    assert.equal(record(preparing, 'weekly:20261005').attempts, 2);

    // Coverage misconfiguration is an explicit failed job, not silent absence.
    const coverage = makeDB();
    seed(coverage);
    const coverageEnv = { ...envFor(coverage, () => { throw new Error('must not send'); }),
        REPORT_COMPLETE_SINCE: '20261012' };
    await assert.rejects(sendWeek(coverageEnv, '20261005', names, external, NOW));
    assert.equal(record(coverage, 'weekly:20261005').status, 'failed');

    const disabled = makeDB();
    seed(disabled);
    const disabledEnv = { ...envFor(disabled, () => { throw new Error('should not send'); }),
        REPORT_ENABLED: 'false' };
    assert.equal((await sendWeek(disabledEnv, '20261005', names, external, NOW)).status, 'disabled');
    assert.equal(record(disabled, 'weekly:20261005'), undefined);
    assert.equal((await worker.fetch(request('/stats?v=2&from=20261005&to=20261011'), env)).status, 200);
    assert.equal((await worker.fetch(request('/event', 'POST'), env)).status, 400);

    console.log('Analytics Phase 3: UTC+8 weeks, reporting, templates, admin security, cron, idempotency, recovery: PASS');
} finally {
    Date.now = originalNow;
    for (const db of dbs) db.close();
}
