// Analytics V2 Phase 3: read-only reporting over the existing UTC+8 daily rollups.
// No raw-event scans, no new tracking identifiers and no public stats API changes.
const DAY_MS = 86400000;
const OFFSET_MS = 8 * 3600000;
const METRICS = ['opens', 'plays', 'finishes', 'activeSeconds', 'playingSeconds'];
const ZERO = () => ({ opens: 0, plays: 0, finishes: 0, activeSeconds: 0, playingSeconds: 0 });
const DAY_SQL = `SELECT day, game, opens, plays, finishes, active_seconds, playing_seconds
  FROM analytics_daily WHERE day >= ? AND day < ? ORDER BY day, game`;

function calendarDate(day) {
  if (!/^\d{8}$/.test(day || '')) throw new Error('Invalid UTC+8 day');
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(4, 6));
  const d = Number(day.slice(6));
  const ms = Date.UTC(y, m - 1, d);
  const parsed = new Date(ms);
  if (y < 2000 || parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== m - 1 || parsed.getUTCDate() !== d) {
    throw new Error('Invalid UTC+8 calendar date');
  }
  return ms;
}

function dayString(ms) {
  return new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');
}

function localDay(ms) {
  return dayString(ms + OFFSET_MS);
}

export function weekStartForInstant(timestamp) {
  const local = calendarDate(localDay(timestamp));
  const weekday = new Date(local).getUTCDay();
  return dayString(local - ((weekday + 6) % 7) * DAY_MS);
}

export function previousCompleteWeek(timestamp) {
  return dayString(calendarDate(weekStartForInstant(timestamp)) - 7 * DAY_MS);
}

export function weekBounds(start) {
  const ms = calendarDate(start);
  if (new Date(ms).getUTCDay() !== 1) throw new Error('Week must start on a UTC+8 Monday');
  return {
    start,
    end: dayString(ms + 7 * DAY_MS),
    previousStart: dayString(ms - 7 * DAY_MS),
    previousEnd: start,
    lastDay: dayString(ms + 6 * DAY_MS),
  };
}

function iso(day) {
  return `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)}`;
}

function add(target, values) {
  for (const key of METRICS) target[key] += values[key];
}

function numbers(row) {
  const result = {
    opens: Number(row.opens), plays: Number(row.plays), finishes: Number(row.finishes),
    activeSeconds: Number(row.active_seconds), playingSeconds: Number(row.playing_seconds),
  };
  if (METRICS.some(key => !Number.isSafeInteger(result[key]) || result[key] < 0)
    || result.playingSeconds > result.activeSeconds) {
    throw new Error('Invalid analytics_daily aggregate');
  }
  return result;
}

export function ratio(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

export function delta(current, previous, comparable) {
  if (!comparable) return null;
  if (previous === 0) return current === 0 ? { kind: 'none' } : { kind: 'new' };
  return { kind: 'percent', value: (current - previous) / previous };
}

export function formatSeconds(seconds) {
  if (!Number.isSafeInteger(seconds) || seconds < 0) throw new Error('Invalid duration');
  if (seconds < 60) return `${seconds} 秒`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours} 小时${minutes ? ` ${minutes} 分钟` : ''}` : `${minutes} 分钟`;
}

export function formatDelta(value) {
  if (value === null) return '基线不完整';
  if (value.kind === 'new') return '新增';
  if (value.kind === 'none') return 'N/A';
  const pct = Math.abs(value.value * 100).toFixed(1);
  return `${value.value > 0 ? '+' : value.value < 0 ? '−' : ''}${pct}%`;
}

function coverageDate(since) {
  if (!since) return null;
  calendarDate(since);
  return since;
}

export async function loadWeeklyReport(db, weekStart, gameNames, standaloneIds, completeSince, now = Date.now(), { allowEmpty = false } = {}) {
  const bounds = weekBounds(weekStart);
  if (calendarDate(bounds.end) > calendarDate(weekStartForInstant(now))) {
    throw new Error('Only completed natural weeks can be reported');
  }
  const coverage = coverageDate(completeSince);
  const currentComplete = coverage !== null && coverage <= bounds.start;
  const previousComplete = currentComplete && coverage <= bounds.previousStart;
  const query = await db.prepare(DAY_SQL).bind(bounds.previousStart, bounds.end).all();
  if (!Array.isArray(query?.results)) throw new Error('Weekly D1 query returned no rows');
  const rows = query.results;
  const activeRows = rows.filter(row => row.day >= bounds.start);
  if (!allowEmpty && activeRows.length === 0) throw new Error('No daily aggregates for the reporting week');

  const gameMap = new Map();
  for (const [id, name] of Object.entries(gameNames)) {
    gameMap.set(id, { id, name, external: standaloneIds.includes(id),
      current: ZERO(), previous: ZERO(), hasCurrent: false, hasPrevious: false });
  }
  const daily = Array.from({ length: 7 }, (_, i) => ({
    day: dayString(calendarDate(bounds.start) + i * DAY_MS), ...ZERO(),
  }));
  const total = ZERO();
  const previousTotal = ZERO();

  for (const row of rows) {
    if (typeof row.day !== 'string' || typeof row.game !== 'string'
      || row.day < bounds.previousStart || row.day >= bounds.end
      || !/^\d{8}$/.test(row.day)) throw new Error('Malformed analytics_daily row');
    if (!gameMap.has(row.game)) {
      gameMap.set(row.game, { id: row.game, name: row.game, external: true,
        current: ZERO(), previous: ZERO(), hasCurrent: false, hasPrevious: false });
    }
    const game = gameMap.get(row.game);
    const metric = numbers(row);
    if (row.day >= bounds.start) {
      add(game.current, metric);
      add(total, metric);
      game.hasCurrent = true;
      add(daily[Math.floor((calendarDate(row.day) - calendarDate(bounds.start)) / DAY_MS)], metric);
    } else {
      add(game.previous, metric);
      add(previousTotal, metric);
      game.hasPrevious = true;
    }
  }
  const games = [...gameMap.values()].sort((a, b) =>
    b.current.opens - a.current.opens || b.current.plays - a.current.plays || a.id.localeCompare(b.id));
  return {
    ...bounds, currentComplete, previousComplete, completeSince: coverage,
    games, total, previousTotal, daily, recordedRows: activeRows.length,
  };
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const nf = n => Number(n).toLocaleString('en-US');
const pct = value => value === null ? 'N/A' : `${(value * 100).toFixed(1)}%`;
const metricLine = m => `打开 ${nf(m.opens)} · 开始 ${nf(m.plays)} · 完成 ${nf(m.finishes)} · 活跃 ${formatSeconds(m.activeSeconds)} · 游玩 ${formatSeconds(m.playingSeconds)}`;

function findings(report) {
  if (!report.previousComplete) return ['前一周尚无完整采集基线，不展示游戏增减排名。'];
  const complete = report.games.filter(game => !game.external);
  const established = complete.filter(game => game.previous.opens > 0);
  const risingOpens = [...established].sort((a, b) =>
    (b.current.opens - b.previous.opens) - (a.current.opens - a.previous.opens))[0];
  const risingActive = [...established].sort((a, b) =>
    (b.current.activeSeconds - b.previous.activeSeconds) - (a.current.activeSeconds - a.previous.activeSeconds))[0];
  const newActive = complete.filter(game => game.current.opens > 0 && game.previous.opens === 0);
  const declining = complete.filter(game => game.previous.opens >= 5
    && game.current.opens <= Math.floor(game.previous.opens * 0.7))
    .sort((a, b) => (a.current.opens / a.previous.opens) - (b.current.opens / b.previous.opens));
  const lines = [];
  if (risingOpens && risingOpens.current.opens > risingOpens.previous.opens) {
    lines.push(`打开次数增长最多：${risingOpens.name}（+${nf(risingOpens.current.opens - risingOpens.previous.opens)}）`);
  }
  if (risingActive && risingActive.current.activeSeconds > risingActive.previous.activeSeconds) {
    lines.push(`活跃时长增长最多：${risingActive.name}（+${formatSeconds(risingActive.current.activeSeconds - risingActive.previous.activeSeconds)}）`);
  }
  if (newActive.length) lines.push(`本周首次记录到打开：${newActive.map(g => g.name).join('、')}`);
  if (declining.length) lines.push(`打开次数下降明显：${declining.slice(0, 5).map(g => g.name).join('、')}`);
  return lines.length ? lines : ['数据不足以得出明确的游戏增长或下降结论。'];
}

export function renderWeeklyReport(report) {
  const range = `${iso(report.start)} — ${iso(report.lastDay)}`;
  const subject = `Orangely Games — Weekly Analytics (${range})`;
  const deltaLine = `打开 ${formatDelta(delta(report.total.opens, report.previousTotal.opens, report.previousComplete))} · 活跃 ${formatDelta(delta(report.total.activeSeconds, report.previousTotal.activeSeconds, report.previousComplete))} · 游玩 ${formatDelta(delta(report.total.playingSeconds, report.previousTotal.playingSeconds, report.previousComplete))} · 开始 ${formatDelta(delta(report.total.plays, report.previousTotal.plays, report.previousComplete))}`;
  const notes = [
    '日期按 UTC+8 自然日统计；区间采用左闭右开。',
    '页面打开次数不是独立访客数，完成率和开始率不代表用户级转化漏斗。',
    '前台活跃时长仅计算可见且有近期交互的时间；实际游玩时长是其中正在游戏的子集。',
    '数据来自 Analytics V2；离线、浏览器限制与客户端接入状况可能导致低估。',
    '独立部署游戏的客户端接入尚未全面确认，其数据为不完整口径。',
  ];
  const findingsText = findings(report);
  const coverageMessage = !report.currentComplete
    ? '本周采集范围未获确认：此预览不适合正式发送。'
    : !report.previousComplete
      ? '上周基线不完整，环比暂不显示。'
      : '本周及上周均位于配置的采集覆盖期内（不代表逐事件的完整性保证）。';

  const ranking = report.games.map((game, index) => {
    const m = game.current;
    const coverageFlag = game.external ? '（独立游戏，采集可能不完整）' : '';
    return `${index + 1}. ${game.name} ${coverageFlag}\n   ${metricLine(m)}\n   平均活跃/打开 ${m.opens ? formatSeconds(Math.floor(m.activeSeconds / m.opens)) : 'N/A'}；平均游玩/开始 ${m.plays ? formatSeconds(Math.floor(m.playingSeconds / m.plays)) : 'N/A'}；开始率 ${pct(ratio(m.plays, m.opens))}；完成率 ${pct(ratio(m.finishes, m.plays))}`;
  }).join('\n');
  const text = [
    subject, `统计周期：${range} (UTC+8)`, '', '本周概览', metricLine(report.total),
    `与上周相比：${deltaLine}`, coverageMessage, '',
    '游戏排行（按打开次数）', ranking, '', '每日趋势',
    ...report.daily.map(d => `${iso(d.day)}  打开 ${nf(d.opens)}  活跃 ${formatSeconds(d.activeSeconds)}  游玩 ${formatSeconds(d.playingSeconds)}`),
    '', '周度变化', ...findingsText, '', '数据说明', ...notes,
  ].join('\n');

  const shell = 'font-family:Arial,Helvetica,sans-serif;background:#f4f6f8;color:#202d40;margin:0;padding:20px 10px';
  const cell = 'padding:9px 8px;border-bottom:1px solid #e4e8ee;text-align:left;font-size:12px';
  const headCell = `${cell};background:#f1f3f7;color:#526174;font-weight:700`;
  const chartRows = report.daily.map(d =>
    `<tr><td style="${cell}">${iso(d.day)}</td><td style="${cell}">${nf(d.opens)}</td><td style="${cell}">${formatSeconds(d.activeSeconds)}</td><td style="${cell}">${formatSeconds(d.playingSeconds)}</td></tr>`).join('');
  const gameCards = report.games.map((g, i) => {
    const m = g.current;
    return `<tr><td style="padding:12px 14px;border-bottom:1px solid #e4e8ee">
      <div style="font-size:14px;font-weight:700;color:#203049">${i + 1}. ${escapeHtml(g.name)}${g.external ? '<span style="font-size:11px;color:#8a6470"> · 独立游戏（待核验）</span>' : ''}</div>
      <div style="font-size:12px;line-height:1.8;color:#47566c">打开 <b>${nf(m.opens)}</b> · 开始 <b>${nf(m.plays)}</b> · 完成 <b>${nf(m.finishes)}</b></div>
      <div style="font-size:12px;line-height:1.8;color:#47566c">活跃 <b>${formatSeconds(m.activeSeconds)}</b> · 实际游玩 <b>${formatSeconds(m.playingSeconds)}</b></div>
      <div style="font-size:11px;line-height:1.7;color:#728196">平均活跃/打开 ${m.opens ? formatSeconds(Math.floor(m.activeSeconds / m.opens)) : 'N/A'} · 平均游玩/开始 ${m.plays ? formatSeconds(Math.floor(m.playingSeconds / m.plays)) : 'N/A'} · 开始率 ${pct(ratio(m.plays, m.opens))} · 完成率 ${pct(ratio(m.finishes, m.plays))}</div>
    </td></tr>`;
  }).join('');
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
    <body style="${shell}"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:650px;margin:0 auto;border-collapse:collapse;background:white">
    <tr><td style="padding:28px 20px;background:#172233;color:#fff;border-top:5px solid #f39c45">
      <div style="font-weight:700;font-size:22px">Orangely Games</div>
      <div style="font-size:14px;color:#f4ba7c;margin-top:6px">Weekly Analytics · ${escapeHtml(range)}</div>
      <div style="font-size:12px;color:#bdc8d7;margin-top:8px">UTC+8 · 周一至周日</div></td></tr>
    <tr><td style="padding:18px 20px">
      <div style="color:#607188;font-size:12px">页面打开</div><div style="font-size:26px;font-weight:700">${nf(report.total.opens)}</div>
      <div style="font-size:12px;color:#607188;margin-top:12px">前台活跃 <b>${formatSeconds(report.total.activeSeconds)}</b> · 实际游玩 <b>${formatSeconds(report.total.playingSeconds)}</b></div>
      <div style="font-size:12px;color:#607188;margin-top:8px">开始 ${nf(report.total.plays)} · 完成 ${nf(report.total.finishes)}</div>
      <div style="font-size:12px;color:#b0642d;margin-top:12px">${escapeHtml(deltaLine)}</div>
      <div style="font-size:11px;color:#7c8797;margin-top:8px">${escapeHtml(coverageMessage)}</div>
    </td></tr>
    <tr><td style="padding:14px 20px 8px;font-weight:700;font-size:16px">游戏排行榜</td></tr>
    <tr><td style="padding:0 12px"><table role="presentation" style="width:100%;border-collapse:collapse">${gameCards}</table></td></tr>
    <tr><td style="padding:20px 20px 8px;font-weight:700;font-size:16px">每日趋势</td></tr>
    <tr><td style="padding:0 12px"><table style="width:100%;border-collapse:collapse"><tr><th style="${headCell}">日期</th><th style="${headCell}">打开</th><th style="${headCell}">活跃</th><th style="${headCell}">游玩</th></tr>${chartRows}</table></td></tr>
    <tr><td style="padding:20px 20px 8px;font-weight:700;font-size:16px">周度变化</td></tr>
    <tr><td style="padding:0 20px 18px;color:#47566c;font-size:12px;line-height:1.9">${findingsText.map(s => `<div>• ${escapeHtml(s)}</div>`).join('')}</td></tr>
    <tr><td style="padding:16px 20px;background:#f4f6f9;font-size:11px;line-height:1.8;color:#6f7e90">
      <b>数据说明</b>${notes.map(s => `<div>• ${escapeHtml(s)}</div>`).join('')}
    </td></tr></table></body></html>`;
  return { subject, html, text };
}
