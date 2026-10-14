// Refuse live analytics deployment before the operator configures a real new D1.
// This guard is intentionally NOT part of dry-run or the ordinary build.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = new URL('../../Workers/wrangler-games-analytics.jsonc', import.meta.url);
const config = readFileSync(fileURLToPath(path), 'utf8')
    .replace(/^\s*\/\/.*$/gm, '');
const data = JSON.parse(config);
const db = data.d1_databases;
const uuid = db?.[0]?.database_id;
if (!Array.isArray(db) || db.length !== 1
    || db[0].binding !== 'ANALYTICS_DB' || db[0].database_name !== 'games'
    || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(uuid || '')
    || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(uuid)
    || data.kv_namespaces?.length
    || data.ratelimits?.length !== 1
    || data.ratelimits[0].name !== 'ANALYTICS_RATE_LIMITER'
    || data.triggers?.crons?.join(',') !== '17 * * * *') {
    console.error('Analytics deploy blocked: configure the NEW D1 database UUID, without KV; read docs/analytics-v2-d1-runbook.md');
    process.exitCode = 1;
} else {
    console.log('Analytics D1 binding configured; operator must have applied remote migrations.');
}
