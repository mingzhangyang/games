import {
  loadWeeklyReport, previousCompleteWeek, renderWeeklyReport, weekBounds,
} from './analytics-weekly.js';

// Cloudflare Email Service (structured send API) is the default. Resend is a
// small optional fallback for accounts without the native sending capability.
const SIX_HOURS = 6 * 3600000;
const LEASE_MS = 15 * 60000;
const MAX_ATTEMPTS = 3;

function checkEmail(value, label) {
  if (typeof value !== 'string' || !/^[^\s@,<>]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)) {
    throw new Error(`${label} must be one configured email address`);
  }
  return value;
}

function mailConfig(env) {
  return {
    from: checkEmail(env.REPORT_FROM, 'REPORT_FROM'),
    to: checkEmail(env.REPORT_TO, 'REPORT_TO'),
  };
}

function errorSummary(err) {
  // Do not put provider response bodies, credentials or addresses in D1/logs.
  if (err instanceof RejectedEmailError) return `Email provider rejected HTTP ${err.status}`;
  if (err?.message?.includes('No daily aggregates')) return 'No daily aggregates for week';
  if (err?.message?.includes('incomplete coverage')) return 'Report coverage baseline incomplete';
  if (err?.message?.includes('Invalid analytics_daily')) return 'Invalid analytics data';
  if (err?.message?.includes('REPORT_')) return 'Report configuration incomplete';
  return 'Report processing or provider failure; inspect Worker logs';
}

class RejectedEmailError extends Error {
  constructor(status) {
    super(`Email provider rejected HTTP ${status}`);
    this.status = status;
  }
}

async function sendEmail(env, content) {
  const { from, to } = mailConfig(env);
  const message = { from, to, ...content };
  if (env.EMAIL?.send) {
    const result = await env.EMAIL.send(message);
    return { provider: 'cloudflare', messageId: result?.messageId ?? null };
  }
  if (!env.RESEND_API_KEY) throw new Error('REPORT_EMAIL_PROVIDER unavailable (EMAIL binding or RESEND_API_KEY)');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });
  if (!response.ok) {
    if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
      throw new RejectedEmailError(response.status);
    }
    throw new Error('Email provider response uncertain');
  }
  const result = await response.json();
  if (!result?.id) throw new Error('Email provider returned no message ID');
  return { provider: 'resend', messageId: result.id };
}

function iso(ms) {
  return new Date(ms).toISOString();
}

async function claimDelivery(db, key, weekStart, kind, now, manual) {
  const token = crypto.randomUUID();
  const current = iso(now);
  const retryCutoff = iso(manual ? now : now - SIX_HOURS);
  const claimed = await db.prepare(`
    INSERT INTO analytics_weekly_delivery
      (report_key, week_start, kind, status, attempts, lease_token, lease_until, last_attempt_at)
    VALUES (?, ?, ?, 'preparing', 1, ?, ?, ?)
    ON CONFLICT(report_key) DO UPDATE SET
      status = 'preparing', attempts = analytics_weekly_delivery.attempts + 1,
      lease_token = excluded.lease_token, lease_until = excluded.lease_until,
      last_attempt_at = excluded.last_attempt_at, last_error = NULL
    WHERE (analytics_weekly_delivery.status = 'failed'
        AND (? = 1 OR analytics_weekly_delivery.attempts < ?)
        AND (? = 1 OR analytics_weekly_delivery.last_attempt_at <= ?))
       OR (analytics_weekly_delivery.status = 'preparing'
        AND analytics_weekly_delivery.lease_until <= ?)
    RETURNING report_key, attempts
  `).bind(key, weekStart, kind, token, iso(now + LEASE_MS), current,
    Number(manual), MAX_ATTEMPTS, Number(manual), retryCutoff, current).first();
  return claimed ? token : null;
}

async function setStatus(db, key, token, from, to, error = null, messageId = null) {
  const result = await db.prepare(`
    UPDATE analytics_weekly_delivery SET status = ?, lease_token = NULL,
      lease_until = NULL, last_error = ?, message_id = COALESCE(?, message_id),
      sent_at = CASE WHEN ? = 'sent' THEN ? ELSE sent_at END
    WHERE report_key = ? AND lease_token = ? AND status = ?
  `).bind(to, error, messageId, to, iso(Date.now()), key, token, from).run();
  if (Number(result.meta?.changes) !== 1) throw new Error('Report lease lost during transition');
}

async function readyToSend(db, key, token) {
  const result = await db.prepare(`
    UPDATE analytics_weekly_delivery SET status = 'sending'
    WHERE report_key = ? AND lease_token = ? AND status = 'preparing'
  `).bind(key, token).run();
  if (Number(result.meta?.changes) !== 1) throw new Error('Report lease lost before provider call');
}

// Explicit states: preparing can be re-acquired after lease expiry (no provider
// call yet). Once "sending" is recorded, any crash/timeout becomes uncertain:
// never blindly replay an externally accepted email.
export async function sendWeek(env, weekStart, names, externalIds, now = Date.now(),
  { test = false, manual = false } = {}) {
  const bounds = weekBounds(weekStart);
  if (!test && env.REPORT_ENABLED !== 'true') return { status: 'disabled' };
  const db = env.ANALYTICS_DB;
  if (!db) throw new Error('Analytics D1 binding unavailable');
  const key = `${test ? 'test' : 'weekly'}:${bounds.start}`;
  const token = await claimDelivery(db, key, bounds.start, test ? 'test' : 'weekly', now, manual);
  if (!token) return { status: 'already_handled', weekStart };

  let contents;
  try {
    // Coverage/config errors are tracked as "failed", not silently omitted from
    // the delivery ledger; an operator can fix the baseline and retry.
    if (!test && (!env.REPORT_COMPLETE_SINCE || env.REPORT_COMPLETE_SINCE > bounds.start)) {
      throw new Error('Report week has incomplete coverage');
    }
    // Query + rendering happen while only "preparing"; failures are safe to retry.
    const report = await loadWeeklyReport(db, bounds.start, names, externalIds,
      env.REPORT_COMPLETE_SINCE, now, { allowEmpty: test });
    if (!test && !report.currentComplete) throw new Error('Report week has incomplete coverage');
    contents = renderWeeklyReport(report);
    if (test) {
      contents.subject = `[TEST / NOT LIVE] ${contents.subject}`;
      contents.html = contents.html.replace('<body ', '<body data-test="true" ');
      contents.text = `[TEST / NOT LIVE]\n${contents.text}`;
    }
    mailConfig(env);
    if (!env.EMAIL?.send && !env.RESEND_API_KEY) throw new Error('REPORT_EMAIL_PROVIDER unavailable');
    await readyToSend(db, key, token);
  } catch (err) {
    // A readyToSend database error might mean the status already transitioned.
    // Only change an actual "preparing" row; never overwrite "sending".
    try { await setStatus(db, key, token, 'preparing', 'failed', errorSummary(err)); } catch {}
    throw err;
  }

  let accepted;
  try {
    accepted = await sendEmail(env, contents);
  } catch (err) {
    const knownRejected = err instanceof RejectedEmailError;
    try {
      await setStatus(db, key, token, 'sending', knownRejected ? 'failed' : 'uncertain', errorSummary(err));
    } catch (statusError) {
      console.error('Weekly mail state update failed after provider error', statusError);
    }
    throw err;
  }
  // Failure here must never fall back to "failed": the provider already
  // accepted the message. The sending lease will age into "uncertain".
  await setStatus(db, key, token, 'sending', 'sent', null, accepted.messageId);
  console.log('Analytics weekly mail accepted', { weekStart, test, provider: accepted.provider });
  return { status: 'sent', weekStart, provider: accepted.provider };
}

export async function recoverWeekly(env, names, externalIds, now = Date.now(), { includeCurrent = false } = {}) {
  if (!env.ANALYTICS_DB) throw new Error('Analytics D1 binding unavailable');
  const db = env.ANALYTICS_DB;
  const changed = await db.prepare(`
    UPDATE analytics_weekly_delivery SET status = 'uncertain',
      lease_token = NULL, lease_until = NULL,
      last_error = 'Delivery interrupted after provider handoff; reconcile before retry'
    WHERE status = 'sending' AND lease_until <= ?
  `).bind(iso(now)).run();
  if (Number(changed.meta?.changes ?? 0) > 0) {
    console.warn('Analytics weekly delivery requires manual reconciliation', changed.meta.changes);
  }
  if (env.REPORT_ENABLED !== 'true') return;
  const cutoff = iso(now - SIX_HOURS);
  const stale = await db.prepare(`
    SELECT week_start FROM analytics_weekly_delivery
    WHERE kind = 'weekly' AND (
      (status = 'failed' AND attempts < ? AND last_attempt_at <= ?)
      OR (status = 'preparing' AND lease_until <= ?)
    )
    ORDER BY week_start ASC LIMIT 2
  `).bind(MAX_ATTEMPTS, cutoff, iso(now)).all();
  if (!Array.isArray(stale?.results)) throw new Error('Cannot inspect weekly retry queue');
  const weeks = [...new Set([...(stale.results.map(row => row.week_start)),
    ...(includeCurrent ? [previousCompleteWeek(now)] : [])])];
  const failures = [];
  for (const week of weeks) {
    try {
      await sendWeek(env, week, names, externalIds, now);
    } catch (error) {
      console.error('Analytics weekly retry failed', { week, reason: errorSummary(error) });
      failures.push(week);
    }
  }
  if (failures.length) throw new Error(`Analytics weekly retry failures: ${failures.join(', ')}`);
}

async function authorized(request, env) {
  const token = env.REPORT_ADMIN_TOKEN;
  if (typeof token !== 'string' || token.length < 32) return false;
  const presented = request.headers.get('Authorization') || '';
  if (!presented.startsWith('Bearer ')) return false;
  const provided = presented.slice(7);
  // Constant-time compare of fixed-size digests. No token ever enters a URL.
  const encode = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encode.encode(token)),
    crypto.subtle.digest('SHA-256', encode.encode(provided)),
  ]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let mismatch = provided.length === token.length ? 0 : 1;
  for (let i = 0; i < left.length; i++) mismatch |= left[i] ^ right[i];
  return mismatch === 0;
}

function adminReply(data, status = 200, contentType = 'application/json; charset=utf-8') {
  return new Response(typeof data === 'string' ? data : JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': contentType, 'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}

export async function adminWeekly(request, env, names, externalIds) {
  if (typeof env.REPORT_ADMIN_TOKEN !== 'string' || env.REPORT_ADMIN_TOKEN.length < 32) {
    return adminReply({ error: 'Admin API disabled' }, 503);
  }
  if (!(await authorized(request, env))) return adminReply({ error: 'Unauthorized' }, 401);
  if (!env.ANALYTICS_DB) return adminReply({ error: 'Database unavailable' }, 503);
  const url = new URL(request.url);
  const operation = url.pathname.slice('/admin/weekly/'.length);
  const methods = { preview: 'GET', status: 'GET', test: 'POST', retry: 'POST', reconcile: 'POST' };
  if (!Object.hasOwn(methods, operation)) return adminReply({ error: 'Not Found' }, 404);
  if (request.method !== methods[operation]) return adminReply({ error: 'Method Not Allowed' }, 405);
  if (operation === 'status') {
    const data = await env.ANALYTICS_DB.prepare(`
      SELECT report_key, week_start, kind, status, attempts, last_attempt_at, sent_at, message_id, last_error
      FROM analytics_weekly_delivery ORDER BY last_attempt_at DESC LIMIT 20
    `).all();
    return adminReply({ records: data.results || [] });
  }
  const weeks = url.searchParams.getAll('week');
  if (weeks.length !== 1) return adminReply({ error: 'Provide exactly one week=YYYYMMDD' }, 400);
  let bounds;
  try {
    bounds = weekBounds(weeks[0]);
  } catch {
    return adminReply({ error: 'week must be the Monday of a natural week, YYYYMMDD' }, 400);
  }
  if (operation === 'reconcile') {
    // Operator must first inspect provider logs. The API intentionally never
    // automatically retries "sending" or "uncertain" delivery outcomes.
    let payload;
    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > 512) throw new Error('Oversize');
      payload = JSON.parse(raw);
    } catch {
      return adminReply({ error: 'Invalid reconciliation body' }, 400);
    }
    const decision = payload?.decision;
    if (!['delivered', 'not_delivered'].includes(decision)
      || typeof payload?.confirmed !== 'boolean' || !payload.confirmed
      || (payload.messageId !== undefined && (typeof payload.messageId !== 'string'
        || payload.messageId.length > 200))) {
      return adminReply({ error: 'Confirm provider verification and decision' }, 400);
    }
    const key = `weekly:${bounds.start}`;
    const result = await env.ANALYTICS_DB.prepare(`
      UPDATE analytics_weekly_delivery SET status = ?,
        lease_token = NULL, lease_until = NULL,
        last_error = ?, message_id = ?,
        sent_at = CASE WHEN ? = 'sent' THEN ? ELSE NULL END
      WHERE report_key = ? AND status IN ('sending', 'uncertain')
        AND (lease_until IS NULL OR lease_until < ?)
    `).bind(decision === 'delivered' ? 'sent' : 'failed',
      decision === 'delivered' ? null : 'Operator confirmed no provider acceptance',
      decision === 'delivered' ? payload.messageId ?? null : null,
      decision === 'delivered' ? 'sent' : 'failed', iso(Date.now()), key, iso(Date.now())).run();
    if (Number(result.meta?.changes ?? 0) !== 1) {
      return adminReply({ error: 'No expired/uncertain delivery to reconcile' }, 409);
    }
    return adminReply({ status: decision === 'delivered' ? 'sent' : 'failed', weekStart: bounds.start });
  }
  if (operation === 'preview') {
    const report = await loadWeeklyReport(env.ANALYTICS_DB, bounds.start, names, externalIds,
      env.REPORT_COMPLETE_SINCE, Date.now(), { allowEmpty: true });
    const rendered = renderWeeklyReport(report);
    const format = url.searchParams.get('format') || 'html';
    if (format === 'html') return adminReply(rendered.html, 200, 'text/html; charset=utf-8');
    if (format === 'text') return adminReply(rendered.text, 200, 'text/plain; charset=utf-8');
    if (format === 'json') return adminReply({ report, ...rendered });
    return adminReply({ error: 'Invalid preview format' }, 400);
  }
  try {
    const result = await sendWeek(env, bounds.start, names, externalIds, Date.now(),
      { test: operation === 'test', manual: operation === 'retry' });
    return adminReply(result, result.status === 'already_handled' ? 409
      : result.status === 'coverage_pending' || result.status === 'disabled' ? 409 : 200);
  } catch (err) {
    console.error('Analytics weekly admin operation failed', { operation, reason: errorSummary(err) });
    return adminReply({ error: errorSummary(err) }, 503);
  }
}
