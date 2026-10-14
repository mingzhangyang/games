-- Phase 2 additive migration; 0001 stays immutable.
-- Existing active events retain 0 gameplay seconds, since history cannot be inferred.
ALTER TABLE analytics_events ADD COLUMN playing_seconds INTEGER NOT NULL DEFAULT 0
  CHECK (playing_seconds >= 0 AND playing_seconds <= active_seconds);
ALTER TABLE analytics_daily ADD COLUMN playing_seconds INTEGER NOT NULL DEFAULT 0 CHECK (playing_seconds >= 0);
DROP TRIGGER analytics_event_rollup;
CREATE TRIGGER analytics_event_rollup AFTER INSERT ON analytics_events BEGIN
  INSERT INTO analytics_daily (day, game, plays, finishes, opens, active_seconds, playing_seconds)
  VALUES (NEW.day, NEW.game,
    CASE WHEN NEW.kind = 'play' THEN 1 ELSE 0 END,
    CASE WHEN NEW.kind = 'finish' THEN 1 ELSE 0 END,
    CASE WHEN NEW.kind = 'open' THEN 1 ELSE 0 END,
    NEW.active_seconds, NEW.playing_seconds)
  ON CONFLICT(day, game) DO UPDATE SET
    plays = plays + excluded.plays,
    finishes = finishes + excluded.finishes,
    opens = opens + excluded.opens,
    active_seconds = active_seconds + excluded.active_seconds,
    playing_seconds = playing_seconds + excluded.playing_seconds;
END;
