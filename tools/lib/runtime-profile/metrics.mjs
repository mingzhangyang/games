/* global PerformanceObserver */
/** Browser/CDP performance statistics. Numeric limits are diagnostic, never CI thresholds. */
const finite = value => typeof value === 'number' && Number.isFinite(value);
export const percentile = (values, percent) => {
    if (!Array.isArray(values) || values.length === 0) return null;
    if (!finite(percent) || percent < 0 || percent > 100) throw new RangeError('invalid percentile');
    const sorted = values.filter(finite).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const idx = (sorted.length - 1) * percent / 100;
    const lo = Math.floor(idx);
    return sorted[lo] + (sorted[Math.ceil(idx)] - sorted[lo]) * (idx - lo);
};

export function metricMap(result) {
    return Object.fromEntries((result?.metrics || []).filter(m => finite(m.value)).map(m => [m.name, m.value]));
}

/** CDP performance timing counters use seconds; convert *deltas* to milliseconds. */
export function metricDelta(before, after, key) {
    const b = before?.[key], a = after?.[key];
    return finite(b) && finite(a) && a >= b ? (a - b) * 1000 : null;
}

export function summarizeWindow({ before = {}, after = {}, observation = null, domBefore = null, domAfter = null, sampleRaf = false } = {}) {
    const times = observation?.rafTimes;
    const gaps = Array.isArray(times) ? times.slice(1).map((t, i) => t - times[i]).filter(t => finite(t) && t >= 0) : [];
    const longTasks = Array.isArray(observation?.longTasks) ? observation.longTasks : null;
    const supported = observation?.longTaskSupported === true;
    const startHeap = finite(before.JSHeapUsedSize) ? before.JSHeapUsedSize : null;
    const endHeap = finite(after.JSHeapUsedSize) ? after.JSHeapUsedSize : null;
    return {
        durationMs: finite(observation?.durationMs) ? observation.durationMs : null,
        rafIntervalP50Ms: sampleRaf ? percentile(gaps, 50) : null,
        rafIntervalP95Ms: sampleRaf ? percentile(gaps, 95) : null,
        rafIntervalP99Ms: sampleRaf ? percentile(gaps, 99) : null,
        rafIntervalCount: sampleRaf ? gaps.length : null,
        rafOver33Ms: sampleRaf ? gaps.filter(x => x > 33.3).length : null,
        rafOver50Ms: sampleRaf ? gaps.filter(x => x > 50).length : null,
        rafOver100Ms: sampleRaf ? gaps.filter(x => x > 100).length : null,
        longTaskCount: supported && longTasks ? longTasks.length : null,
        longTaskTotalMs: supported && longTasks ? longTasks.reduce((sum, x) => sum + x, 0) : null,
        taskTimeMs: metricDelta(before, after, 'TaskDuration'),
        scriptTimeMs: metricDelta(before, after, 'ScriptDuration'),
        layoutTimeMs: metricDelta(before, after, 'LayoutDuration'),
        styleTimeMs: metricDelta(before, after, 'RecalcStyleDuration'),
        heapStartBytes: startHeap,
        heapEndBytes: endHeap,
        heapDeltaBytes: startHeap === null || endHeap === null ? null : endHeap - startHeap,
        domNodeStart: finite(domBefore?.nodes) ? domBefore.nodes : null,
        domNodeEnd: finite(domAfter?.nodes) ? domAfter.nodes : null,
        // RAF cadence is measured by a lightweight probe, not the game's render FPS.
        renderFps: null,
    };
}

/** Runs in the inspected page. Never intercepts/patches the game's global rAF. */
export async function observeInPage(options) {
    const { durationMs, sampleRaf } = options;
    const longTasks = [];
    const rafTimes = [];
    const longTaskSupported = typeof PerformanceObserver !== 'undefined'
        && PerformanceObserver.supportedEntryTypes?.includes('longtask');
    let observer = null;
    if (longTaskSupported) {
        observer = new PerformanceObserver(list => {
            for (const item of list.getEntries()) longTasks.push(item.duration);
        });
        observer.observe({ entryTypes: ['longtask'] });
    }
    const start = performance.now();
    let open = true;
    let rafId = null;
    const record = now => {
        if (!open) return;
        // Bound memory even if a browser runs at unusually high refresh rates.
        if (rafTimes.length < 20000) rafTimes.push(now);
        rafId = requestAnimationFrame(record);
    };
    if (sampleRaf) rafId = requestAnimationFrame(record);
    try {
        await new Promise(resolve => setTimeout(resolve, durationMs));
    } finally {
        open = false;
        if (rafId != null) cancelAnimationFrame(rafId);
        observer?.takeRecords().forEach(item => longTasks.push(item.duration));
        observer?.disconnect();
    }
    return { durationMs: performance.now() - start, rafTimes, longTasks, longTaskSupported };
}

export async function sampleWindow(page, client, durationMs, { sampleRaf = true } = {}) {
    const take = async () => {
        try { return metricMap(await client.send('Performance.getMetrics')); }
        catch { return {}; }
    };
    const dom = async () => {
        try { return await client.send('Memory.getDOMCounters'); }
        catch { return null; }
    };
    const before = await take();
    const domBefore = await dom();
    const observation = await page.evaluate(observeInPage, { durationMs, sampleRaf });
    const after = await take();
    const domAfter = await dom();
    return summarizeWindow({ before, after, observation, domBefore, domAfter, sampleRaf });
}
