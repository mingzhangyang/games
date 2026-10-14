-- Phase 3: bounded delivery ledger only. analytics_daily and prior migrations stay untouched.
-- Report key contains both delivery kind and Monday date (YYYYMMDD).
CREATE TABLE analytics_weekly_delivery (
  report_key TEXT PRIMARY KEY,
  week_start TEXT NOT NULL CHECK (length(week_start) = 8),
  kind TEXT NOT NULL CHECK (kind IN ('weekly', 'test')),
  status TEXT NOT NULL CHECK (status IN ('preparing', 'sending', 'sent', 'failed', 'uncertain')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_token TEXT,
  lease_until TEXT,
  last_attempt_at TEXT NOT NULL,
  sent_at TEXT,
  last_error TEXT,
  message_id TEXT
) WITHOUT ROWID;

CREATE INDEX idx_analytics_weekly_retry
  ON analytics_weekly_delivery(kind, status, last_attempt_at, week_start);
