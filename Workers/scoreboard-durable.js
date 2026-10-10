import { DurableObject } from 'cloudflare:workers';
import { ScoreboardStore } from './scoreboard-store.js';

// One named object per board. RPC avoids any public bypass of Worker validation.
export class GameScoreBoard extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.store = new ScoreboardStore(ctx, env);
  }

  async list(game, config) {
    return this.store.list(game, config);
  }

  async submit(game, config, name, score) {
    await this.store.submit(game, config, name, score);
  }
}
