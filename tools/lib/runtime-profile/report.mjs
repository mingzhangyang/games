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


/**
 * Group only comparable game/viewport/workload/input recipes. A median across
 * differing modes or input APIs is meaningless. Keep all individual samples.
 */
export function summarizeRepeatRows(results) {
    const groups = new Map();
    for (const row of results) {
        if (row.status !== 'measured') continue;
        const input = row.phases?.active?.input;
        const workload = row.workload || 'default game scenario';
        const recipe = input ? input.kind + ' via ' + input.api : 'unattended';
        const key = [row.game, row.viewport, workload, recipe].join('|');
        if (!groups.has(key)) groups.set(key, {
            game: row.game, viewport: row.viewport, workload, recipe, rows: [],
        });
        groups.get(key).rows.push(row);
    }
    const stats = (rows, key) => {
        const values = rows.map(row => row.phases?.active?.metrics?.[key])
            .filter(value => typeof value === 'number' && Number.isFinite(value));
        return { n: values.length, median: percentile(values, 50),
            min: values.length ? Math.min(...values) : null,
            max: values.length ? Math.max(...values) : null };
    };
    return [...groups.values()].map(group => ({
        game: group.game, viewport: group.viewport,
        workload: group.workload, recipe: group.recipe, runs: group.rows.length,
        rafP95: stats(group.rows, 'rafIntervalP95Ms'),
        tasks: stats(group.rows, 'longTaskCount'),
        taskTime: stats(group.rows, 'taskTimeMs'),
    })).sort((a, b) => (a.game + a.viewport).localeCompare(b.game + b.viewport));
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
        '| Game / viewport | Run | Workload | Input | Active rAF probe p95 (ms) | Long tasks | Task counter delta (ms) | Status |',
        '|---|---:|---|---|---:|---:|---:|---|',
    ];
    for (const row of results) {
        const active = row.phases?.active?.metrics;
        const recipe = row.phases?.active?.input;
        const origin = recipe ? recipe.kind + ' via ' + recipe.api + ' (' + recipe.steps + ' ticks)' : (row.startPath || 'unattended');
        lines.push('| ' + row.game + ' / ' + row.viewport + ' | ' + row.repeat
            + ' | ' + (row.workload || 'default game scenario') + ' | ' + origin
            + ' | ' + fmt(active?.rafIntervalP95Ms)
            + ' | ' + (active?.longTaskCount ?? 'N/A')
            + ' | ' + fmt(active?.taskTimeMs) + ' | ' + row.status + ' |');
    }
    if (summary.missing.length || summary.extra.length || summary.duplicates.length || summary.incomplete.length) {
        lines.push('', '## Incomplete runs / coverage errors', '');
        for (const missing of summary.missing) lines.push(`- Missing: ${missing}`);
        for (const extra of summary.extra) lines.push(`- Extra: ${extra}`);
        for (const duplicate of summary.duplicates) lines.push(`- Duplicate: ${duplicate}`);
        for (const item of summary.incomplete) {
            lines.push(`- Incomplete: ${item.id}: ${item.reason}`);
            const row = results.find(r => `${r.game}|${r.viewport}|${r.repeat}` === item.id
                && r.status !== 'measured');
            for (const phaseName of ['active', 'resume']) {
                const phase = row?.phases?.[phaseName];
                if (phase?.status !== 'incomplete' || !phase.input) continue;
                const { input } = phase;
                lines.push(`  - Failed ${phaseName} input: ${input.kind} via ${input.api}, `
                    + `stage=${input.failedStage}, attempted ticks=${input.steps}, `
                    + `sample metrics ${phase.metrics == null ? 'unavailable' : 'retained in results.json'}.`);
                if (input.evidence != null) {
                    lines.push(`  - Inspection evidence: \`${JSON.stringify(input.evidence)}\``);
                }
                if (input.cleanupError) lines.push(`  - Cleanup error: ${input.cleanupError}`);
                if (input.tickError) lines.push(`  - Input tick error: ${input.tickError}`);
            }
        }
    }
    const repeated = summarizeRepeatRows(results);
    lines.push('', '## Repeated baseline: per-scenario medians and observed ranges', '',
        'These are medians of individual run measurements, NOT pooled frame percentiles. ' +
        'Three comparable measured repetitions are required to mark a diagnostic candidate.', '',
        '| Game / viewport | Workload / input | Runs | rAF p95 median (min–max ms) | Long tasks median | Main-thread task median (ms) |',
        '|---|---|---:|---:|---:|---:|');
    for (const group of repeated) {
        const p95 = group.rafP95;
        const range = p95.n ? fmt(p95.median) + ' (' + fmt(p95.min) + '–' + fmt(p95.max) + ')' : 'N/A';
        lines.push('| ' + group.game + ' / ' + group.viewport + ' | ' + group.workload
            + ' / ' + group.recipe + ' | ' + group.runs
            + ' | ' + range + ' | ' + fmt(group.tasks.median)
            + ' | ' + fmt(group.taskTime.median) + ' |');
    }
    lines.push('', '## Diagnostic candidates (repeat-confirmed; not automatic severity rankings)', '');
    const candidates = repeated.filter(group => group.runs >= 3 && group.rafP95.n >= 3
        && group.rafP95.median > 33.3);
    for (const group of candidates) {
        lines.push('- ' + group.game + ' / ' + group.viewport + ': repeated median rAF-probe p95 '
            + fmt(group.rafP95.median) + ' ms (' + group.runs + ' measurements); trace and physical-device validation required.');
    }
    if (!candidates.length) lines.push('No repeat-confirmed candidates; this is not proof of 60 FPS or the absence of regressions.');
    if (meta.repeat < 3) {
        lines.push('WARNING: ' + meta.repeat + ' repetition(s) requested; these results are exploratory, not a confirmed baseline.');
    }
    const comparableCounts = new Map();
    for (const group of repeated) {
        const id = group.game + '|' + group.viewport;
        comparableCounts.set(id, (comparableCounts.get(id) || 0) + 1);
    }
    for (const [id, count] of comparableCounts) {
        if (count > 1) lines.push('WARNING: multiple workload or input recipes for ' + id + '; do not aggregate them.');
    }

    lines.push('', '## Interpretation limits', '',
        'The lightweight rAF observer adds its own callbacks. Its cadence is **not** the actual game rendering FPS.',
        'The Needle Awn endless survival lane is a controlled movement workload, not a representative combat performance claim.',
        'Silk Dew S1: desktop uses a Puppeteer mouse hold; emulated mobile uses an untrusted, test-only synthetic DOM PointerEvent through the existing canvas input handler, not native touch. Neither is a full puzzle-solving trace.',
        'CDP timing counters represent measured main-thread activity during this exact sampling window, not whole-device CPU utilization.',
        'Memory before/after without heap-retention analysis is not proof of a memory leak.',
        'One machine and one Chromium browser cannot certify iOS Safari, Android hardware or 60 FPS on low-end phones.',
        'The scenario adapter reports every test-hook start explicitly; it must never be represented as a physical UI click.',
        'Menu samples are not taken for already-active games, since calling them a start-menu baseline would be dishonest.',
        '',
    );
    return lines.join('\n');
}
