-- Preserve the exact optional occurrence timestamp for immutable V2 event-ID deduplication.
-- NULL means the original request omitted occurredAt; old rows remain NULL.
-- Apply after 0002. No existing event timestamps can be inferred retroactively.
ALTER TABLE analytics_events ADD COLUMN occurred_at INTEGER;
