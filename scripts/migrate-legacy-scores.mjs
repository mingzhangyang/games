/**
 * 旧榜单迁移脚本：把三个旧 Worker 的历史成绩重放进共享排行榜 Worker。
 * 幂等：共享端按"每人保留最好成绩"合并，重复运行无副作用。
 *
 * 运行：node scripts/migrate-legacy-scores.mjs
 * 前置：共享 Worker 已部署包含 tetris / hoop-shot / planet-merge / planet-merge-d* 的版本
 *（npx wrangler deploy -c Workers/wrangler-game-scores.jsonc）
 */
const ORIGIN = 'https://games.orangely.xyz';
const SHARED = 'https://game-scores.orangely.workers.dev';
const OLD = {
  tetris: 'https://tetris-highest-scores.orangely.workers.dev/highscore',
  hoop: 'https://hoop-shot-scores.orangely.workers.dev/scores',
  planet: 'https://planet-merge-scores.orangely.workers.dev/scores'
};

async function fetchList(url) {
  const res = await fetch(url, { headers: { Origin: ORIGIN } });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function post(game, name, score) {
  const res = await fetch(`${SHARED}/scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ game, name, score })
  });
  if (!res.ok) throw new Error(`POST ${game} <- ${name}:${score} -> HTTP ${res.status}`);
}

// UTC+8 最近 n 天的 YYYYMMDD 键（今天在内）
function recentDays(n) {
  const days = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.now() + 8 * 3600 * 1000 - i * 24 * 3600 * 1000);
    days.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`);
  }
  return days;
}

async function migrateOne(label, entries, gameId) {
  let ok = 0;
  for (const e of entries) {
    if (!e || typeof e.score !== 'number' || !e.name) continue;
    await post(gameId, e.name, e.score);
    ok++;
  }
  console.log(`  ${label}: ${ok}/${entries.length} 条已迁入 "${gameId}"`);
}

try {
  console.log('迁移 Tetris 榜…');
  await migrateOne('总榜', await fetchList(OLD.tetris), 'tetris');

  console.log('迁移 Hoop Shot 榜…');
  await migrateOne('总榜', await fetchList(OLD.hoop), 'hoop-shot');

  console.log('迁移 Planet Merge 榜…');
  await migrateOne('总榜', await fetchList(`${OLD.planet}?mode=alltime`), 'planet-merge');
  for (const day of recentDays(14)) {
    const list = await fetchList(`${OLD.planet}?mode=daily&day=${day}`);
    if (list.length) {
      await migrateOne(`每日榜 ${day}`, list, `planet-merge-d${day}`);
    }
  }

  // 校验：读回共享端计数
  console.log('\n校验共享端榜单：');
  for (const game of ['tetris', 'hoop-shot', 'planet-merge']) {
    const list = await fetchList(`${SHARED}/scores?game=${game}`);
    console.log(`  ${game}: ${list.length} 条`);
  }
  console.log('\n✅ 迁移完成。确认无误后可删除三个旧 Worker：');
  console.log('   npx wrangler delete --name tetris-highest-scores');
  console.log('   npx wrangler delete --name planet-merge-scores');
  console.log('   npx wrangler delete --name hoop-shot-scores');
} catch (e) {
  console.error('❌ 迁移失败：', e.message);
  console.error('（若提示 HTTP 400，请先重新部署共享 Worker：npx wrangler deploy -c Workers/wrangler-game-scores.jsonc）');
  process.exit(1);
}
