// Per-board synchronous SQLite-backed Durable Object storage.
// Legacy Workers KV is a READ-ONLY one-time migration source.
const SNAPSHOT_KEY = 'snapshot';

function sortAndLimit(entries, config) {
  const best = new Map();
  for (const entry of entries) {
    if (!entry || typeof entry.name !== 'string' || !entry.name.trim() ||
        !Number.isFinite(entry.score) || entry.score < 0 || entry.score > config.maxScore) continue;
    const name = entry.name.slice(0, 20);
    const previous = best.get(name);
    if (previous === undefined ||
        (config.order === 'asc' ? entry.score < previous : entry.score > previous)) {
      best.set(name, entry.score);
    }
  }
  return [...best].map(([name, score]) => ({ name, score }))
    .sort((a, b) => config.order === 'asc' ? a.score - b.score : b.score - a.score)
    .slice(0, config.maxEntries);
}

export class ScoreboardStore {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async ensureReady(game, config) {
    if (this.ctx.storage.kv.get(SNAPSHOT_KEY) !== undefined) return;
    // The only external I/O is first-time import. Serialize it to prevent
    // multiple initializers overwriting scores submitted during migration.
    await this.ctx.blockConcurrencyWhile(async () => {
      if (this.ctx.storage.kv.get(SNAPSHOT_KEY) !== undefined) return;
      const raw = await this.env.GAME_SCORES.get('top:' + game);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) throw new Error('Invalid legacy leaderboard');
      this.ctx.storage.kv.put(SNAPSHOT_KEY, {
        entries: sortAndLimit(parsed, config),
        expiresAt: raw && config.ttl ? Date.now() + config.ttl * 1000 : null,
      });
    });
  }

  snapshot() {
    const stored = this.ctx.storage.kv.get(SNAPSHOT_KEY);
    if (!stored || !Array.isArray(stored.entries)) {
      throw new Error('Leaderboard state unavailable');
    }
    if (stored.expiresAt != null && Date.now() >= stored.expiresAt) {
      const empty = { entries: [], expiresAt: null };
      this.ctx.storage.kv.put(SNAPSHOT_KEY, empty);
      return empty;
    }
    return stored;
  }

  async list(game, config) {
    await this.ensureReady(game, config);
    return this.snapshot().entries;
  }

  async submit(game, config, name, score) {
    await this.ensureReady(game, config);
    // No await or network I/O between read and write: concurrent DO
    // requests cannot interleave the synchronous SQLite KV operations.
    const next = sortAndLimit([...this.snapshot().entries, { name, score }], config);
    this.ctx.storage.kv.put(SNAPSHOT_KEY, {
      entries: next,
      expiresAt: config.ttl ? Date.now() + config.ttl * 1000 : null,
    });
  }
}
