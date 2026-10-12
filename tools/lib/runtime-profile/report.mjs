/** Local reports, not production telemetry. Never publish a result as measured when incomplete. */
import { percentile } from './metrics.mjs';

const fmt = n => typeof n === 'number' && Number.isFinite(n) ? n.toFixed(1) : 'N/A';

export function reportSummary(results, expected) {
    const wanted = new Set(expected.map(x => `${x.game}|${x.viewport}|${x.repeat}`));
    const seen = new Set();
    const duplicates = [];
    const incomplete = [];
    for (const row of results) {
        const id = `${row.game}|${row.viewport}|${row.repeat}`;
        if (seen.has(id)) duplicates.push(id);
        seen.add(id);
        if (row.status !== 'measured') incomplete.push({ id, reason: row.error || 'unknown' });
    }
    const missing = [...wanted].filter(id => !seen.has(id));
    const extra = [...seen].filter(id => !wanted.has(id));
    return {
        expectedRuns: wanted.size,
        measuredRuns: results.filter(row => row.status === 'measured').length,
        missing, extra, duplicates, incomplete,
        complete: !missing.length && !extra.length && !duplicates.length && !incomplete.length
            && results.length === wanted.size,
    };
}

export function renderMarkdown(report) {
    const { meta, results, summary } = report;
    const lines = [
        '# Runtime Performance Audit — captured browser results',
        '',
        `- Commit: \`${meta.commit}\``,
        `- Source: \`${meta.source}\` (\`${meta.sourceRoot}\`)`,
        `- Chromium: ${meta.browserVersion}`,
        `- OS/CPU: ${meta.os} / ${meta.cpu} (${meta.cpuCount} logical cores)`,
        `- Browser flags: \`${meta.browserFlags.join(' ')}\``,
        `- GPU mode: ${meta.gpuMode}; this is NOT real mobile-device/GPU testing.`,
        `- Network: Worker requests mocked; third-party requests blocked; no real score submissions.`,
        `- Sampling: ${meta.preset}, ${meta.repeat} run(s) per game/viewport, sequential, no CPU throttling.`,
        `- Completeness: **${summary.complete ? 'complete' : 'INCOMPLETE'}** — ${summary.measuredRuns}/${summary.expectedRuns} measured runs.`,
        '',
        '## Results',
        '',
        '| Game / viewport | Run | Start path | Active RAF p95 (ms) | Long tasks | Task CPU time (ms) | Status |',
        '|---|---:|---|---:|---:|---:|---|',
    ];
    for (const row of results) {
        const active = row.phases?.active?.metrics;
        lines.push(`| ${row.game} / ${row.viewport} | ${row.repeat} | ${row.startPath || '-'} | ${fmt(active?.rafIntervalP95Ms)} | ${active?.longTaskCount ?? 'N/A'} | ${fmt(active?.taskTimeMs)} | ${row.status} |`);
    }
    if (summary.missing.length || summary.extra.length || summary.duplicates.length || summary.incomplete.length) {
        lines.push('', '## Incomplete runs / coverage errors', '');
        for (const missing of summary.missing) lines.push(`- Missing: ${missing}`);
        for (const extra of summary.extra) lines.push(`- Extra: ${extra}`);
        for (const duplicate of summary.duplicates) lines.push(`- Duplicate: ${duplicate}`);
        for (const item of summary.incomplete) lines.push(`- Incomplete: ${item.id}: ${item.reason}`);
    }
    const measured = results.filter(row => row.status === 'measured');
    const grouped = new Map();
    for (const row of measured) {
        const key = `${row.game}|${row.viewport}`;
        if (!grouped.has(key)) grouped.set(key, []);
        const p95 = row.phases?.active?.metrics?.rafIntervalP95Ms;
        if (Number.isFinite(p95)) grouped.get(key).push(p95);
    }
    lines.push('', '## Diagnostic candidates (not automatic severity rankings)', '');
    for (const [key, values] of grouped) {
        if (!values.length) continue;
        const medianP95 = percentile(values, 50);
        if (medianP95 > 33.3) {
            lines.push(`- ${key}: median across runs of probe RAF p95 ${fmt(medianP95)} ms. Inspect traces on comparable machines before proposing a fix.`);
        }
    }
    if (!lines.at(-1).startsWith('- ')) lines.push('No threshold-based investigation candidates; this does not certify the absence of performance issues.');
    lines.push('', '## Interpretation limits', '',
        'The lightweight rAF observer adds its own callbacks. Its cadence is **not** the actual game rendering FPS.',
        'CDP timing counters represent measured main-thread activity during this exact sampling window, not whole-device CPU utilization.',
        'Memory before/after without heap-retention analysis is not proof of a memory leak.',
        'One machine and one Chromium browser cannot certify iOS Safari, Android hardware or 60 FPS on low-end phones.',
        'The scenario adapter reports every test-hook start explicitly; it must never be represented as a physical UI click.',
        'Menu samples are not taken for already-active games, since calling them a start-menu baseline would be dishonest.',
        '',
    );
    return lines.join('\n');
}
