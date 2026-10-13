-- Analytics V2 starts empty. No KV import, legacy baseline, or dual write.
CREATE TABLE analytics_events (
  id INTEGER PRIMARY KEY,
  version INTEGER NOT NULL CHECK (version IN (1, 2)),
  event_id TEXT,
  session_id TEXT,
  day TEXT NOT NULL CHECK (length(day) = 8),
  game TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('play', 'finish', 'open', 'active')),
  active_seconds INTEGER NOT NULL DEFAULT 0 CHECK (active_seconds BETWEEN 0 AND 60),
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (version = 1 AND event_id IS NULL AND session_id IS NULL AND kind IN ('play', 'finish') AND active_seconds = 0)
    OR (version = 2 AND event_id IS NOT NULL AND session_id IS NOT NULL
      AND ((kind = 'active' AND active_seconds BETWEEN 1 AND 60)
        OR (kind != 'active' AND active_seconds = 0)))
  )
);

CREATE UNIQUE INDEX idx_analytics_event_id ON analytics_events(event_id) WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX idx_analytics_open_session ON analytics_events(session_id)
  WHERE version = 2 AND kind = 'open';

-- Hourly bounded cleanup uses the day key while retaining all aggregate history.
CREATE INDEX idx_analytics_event_retention ON analytics_events(day, id);

CREATE TABLE analytics_daily (
  day TEXT NOT NULL,
  game TEXT NOT NULL,
  plays INTEGER NOT NULL DEFAULT 0 CHECK (plays >= 0),
  finishes INTEGER NOT NULL DEFAULT 0 CHECK (finishes >= 0),
  opens INTEGER NOT NULL DEFAULT 0 CHECK (opens >= 0),
  active_seconds INTEGER NOT NULL DEFAULT 0 CHECK (active_seconds >= 0),
  PRIMARY KEY (day, game)
) WITHOUT ROWID;

-- SQLite runs this trigger atomically with the accepted event insert. Ignored
-- duplicates cannot increment summaries, even under concurrent Worker requests.
CREATE TRIGGER analytics_event_rollup AFTER INSERT ON analytics_events BEGIN
  INSERT INTO analytics_daily (day, game, plays, finishes, opens, active_seconds)
  VALUES (
    NEW.day, NEW.game,
    CASE WHEN NEW.kind = 'play' THEN 1 ELSE 0 END,
    CASE WHEN NEW.kind = 'finish' THEN 1 ELSE 0 END,
    CASE WHEN NEW.kind = 'open' THEN 1 ELSE 0 END,
    NEW.active_seconds
  )
  ON CONFLICT(day, game) DO UPDATE SET
    plays = plays + excluded.plays,
    finishes = finishes + excluded.finishes,
    opens = opens + excluded.opens,
    active_seconds = active_seconds + excluded.active_seconds;
END;
