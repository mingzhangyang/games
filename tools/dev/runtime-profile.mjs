#!/usr/bin/env node
/* global AbortSignal */
/**
 * PR #136 — opt-in local/browser runtime profile.
 * No production instrumentation, real Worker writes, or CI performance thresholds.
 * npm run build && npm run profile:runtime -- --all --preset=baseline --repeat=3
 */
import puppeteer from 'puppeteer-core';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROME_PATH, LAUNCH_ARGS } from '../lib/browser.mjs';
import { registry } from '../lib/registry.mjs';
import { checkSceneState, SCENARIOS } from '../lib/runtime-profile/scenarios.mjs';
import { parseArgs, PRESETS, VIEWPORTS } from '../lib/runtime-profile/options.mjs';
import { sampleWindow } from '../lib/runtime-profile/metrics.mjs';
import { sampleWithInput } from '../lib/runtime-profile/interaction.mjs';
import { renderMarkdown, reportSummary } from '../lib/runtime-profile/report.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

function usage() {
    console.log('npm run profile:runtime -- --all|--games=id,id [--viewports=mobile,desktop] [--preset=quick|baseline|deep] [--repeat=3] [--out=.tmp-perf/pr136] [--source=dist|source]');
}

function gitSha() {
    try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); }
    catch { return 'unavailable'; }
}

async function startServer(root, port) {
    const server = spawn(process.execPath, [join(ROOT, 'tests/lib/serve-static.mjs'), String(port)], {
        cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    server.stderr.on('data', b => { output += b.toString(); });
    server.stdout.on('data', b => { output += b.toString(); });
    const url = `http://127.0.0.1:${port}`;
    // Only trust the port once *our* child reports it is listening: an unrelated
    // process on the same port would otherwise answer the probe (child: EADDRINUSE).
    const listening = `on ${url}`;
    for (let i = 0; i < 70; i++) {
        if (server.exitCode !== null) break;
        if (!output.includes(listening)) {
            await new Promise(done => setTimeout(done, 150));
            continue;
        }
        try {
            const response = await fetch(url + '/index.html', { signal: AbortSignal.timeout(800) });
            if (response.ok) return { server, url };
        } catch { /* server not ready */ }
        await new Promise(done => setTimeout(done, 150));
    }
    server.kill();
    throw new Error(`static server was not ready: ${output.trim().slice(0, 400)}`);
}

/** Mock only external services. Production scoreboard & analytics are never written to. */
async function isolateNetwork(page, base) {
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    page.on('request', request => {
        const url = request.url();
        if (url.startsWith(base + '/')) { void request.continue(); return; }
        if (/^https:\/\/[^/]+\.workers\.dev\//.test(url)) {
            void request.respond({ status: 200, contentType: 'application/json',
                headers: { 'access-control-allow-origin': '*' }, body: '[]' });
            return;
        }
        // Also makes metrics reproducible without Google Fonts/network reachability.
        void request.abort('blockedbyclient');
    });
    await page.evaluateOnNewDocument(() => {
        try {
            localStorage.clear();
            localStorage.setItem('site_lang', 'en');
            localStorage.setItem('site_muted', '1');
        } catch { /* private browsing */ }
    });
}

// Visible *and* enabled: a disabled button (e.g. Carrot Pull's Start before its
// art is ready) swallows the click and the run would later time out falsely.
function actionable(selector) {
    const el = document.querySelector(selector);
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
}

async function act(page, scene, action) {
    if (action.kind === 'already-active') return 'auto (already active)';
    if (action.kind === 'visible-choice') {
        await page.waitForFunction(`${JSON.stringify(action.selectors)}.some(${actionable})`, { timeout: 12000 });
        const selector = await page.evaluate(`${JSON.stringify(action.selectors)}.find(${actionable})`);
        await page.click(selector);
        return `UI click ${selector}`;
    }
    if (action.kind === 'sequence') {
        const descriptions = [];
        for (const part of action.actions) descriptions.push(await act(page, scene, part));
        return descriptions.join(' -> ');
    }
    if (action.kind === 'canvas-click') {
        const canvas = await page.waitForSelector(action.selector, { visible: true, timeout: 12000 });
        const previous = await canvas.evaluate(el => el.toDataURL());
        const rect = await canvas.boundingBox();
        if (!rect || rect.width <= 0 || rect.height <= 0) throw new Error('canvas not visible');
        await page.mouse.click(rect.x + rect.width * action.x, rect.y + rect.height * action.y);
        await page.waitForFunction(({ selector, previous }) =>
            document.querySelector(selector)?.toDataURL() !== previous,
        { timeout: 5000 }, { selector: action.selector, previous });
        return `UI canvas click ${action.selector}`;
    }
    if (action.kind === 'click') {
        await page.waitForFunction(actionable, { timeout: 12000 }, action.selector);
        await page.click(action.selector);
        return `UI click ${action.selector}`;
    }
    if (action.kind === 'test-hook') {
        await page.evaluate(({ owner, method, args }) => {
            const instance = window[owner];
            if (!instance || typeof instance[method] !== 'function') throw new Error(`missing test hook: ${owner}.${method}`);
            instance[method](...args);
        }, { owner: scene.owner, method: action.method, args: action.args });
        return `test-hook ${scene.owner}.${action.method}`;
    }
    throw new Error(`unsupported action kind: ${action.kind}`);
}

async function waitScene(page, condition, label) {
    try {
        await page.waitForFunction(checkSceneState, { timeout: 16000, polling: 100 }, condition);
    } catch {
        throw new Error(`${label} never satisfied: ${JSON.stringify(condition)}`);
    }
}

// A window only counts as active if the run is still active when it closes:
// games can win or lose on their own mid-sample (e.g. Needle Awn, Sword Flight).
async function assertStillActive(page, condition, label) {
    if (!await page.evaluate(checkSceneState, condition)) {
        throw new Error(`${label} ended during sampling: ${JSON.stringify(condition)}`);
    }
}

async function runOne(browser, base, game, scene, viewportTag, repeat, preset) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const result = { game: game.id, viewport: viewportTag, repeat, status: 'incomplete',
        workload: scene.workload || 'default game scenario',
        startPath: null, phases: {}, limitations: [], error: null };
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.message || e).split('\n')[0]));
    let client = null;
    try {
        await page.setViewport(VIEWPORTS[viewportTag](game));
        if (viewportTag !== 'desktop') await page.setUserAgent(ANDROID_UA);
        await isolateNetwork(page, base);
        await page.goto(`${base}/${game.href}`, { waitUntil: 'domcontentloaded', timeout: 35000 });
        await page.bringToFront();
        await waitScene(page, scene.ready, 'ready');
        result.navigation = await page.evaluate(() => {
            const navigation = performance.getEntriesByType('navigation')[0];
            const fcp = performance.getEntriesByName('first-contentful-paint')[0];
            return { domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? null,
                firstContentfulPaintMs: fcp?.startTime ?? null,
                readyObservedByMs: performance.now(),
                interpretation: 'readyObservedByMs is an upper bound including browser automation delay' };
        });
        client = await page.createCDPSession();
        await client.send('Performance.enable');
        await new Promise(resolveWait => setTimeout(resolveWait, preset.warmup));
        if (scene.noMenu) {
            // A loop that already runs at boot (Tank Battle) is gameplay, not idle.
            result.phases.idle = scene.start.kind === 'already-active' && scene.activity !== 'discrete'
                ? { status: 'not-applicable', reason: 'Game loop already running at boot; sampled as active' }
                : { status: 'measured',
                    metrics: await sampleWindow(page, client, preset.menu, { sampleRaf: false }) };
            result.phases.menu = { status: 'not-applicable', reason: 'No distinct menu state' };
        } else {
            result.phases.menu = { status: 'measured',
                metrics: await sampleWindow(page, client, preset.menu, { sampleRaf: false }) };
        }
        const startWall = Date.now();
        result.startPath = await act(page, scene, scene.start);
        await waitScene(page, scene.active, 'active');
        result.startTransitionAutomationMs = scene.start.kind === 'already-active'
            ? null : Date.now() - startWall;
        result.limitations.push('Automation transition times include Puppeteer round-trips; not native input-to-paint latency');
        const active = await sampleWithInput(page, client, scene, viewportTag,
            () => sampleWindow(page, client, preset.active, { sampleRaf: scene.activity !== 'discrete' }));
        result.phases.active = { status: 'measured', ...active };
        await assertStillActive(page, scene.active, 'active');
        if (scene.activity !== 'discrete' && (result.phases.active.metrics.rafIntervalCount || 0) < 2) {
            throw new Error('foreground active rAF probe collected fewer than two intervals');
        }
        if (scene.interaction) {
            const started = Date.now();
            if (scene.interaction.kind === 'type') {
                await page.waitForSelector(scene.interaction.selector, { visible: true, timeout: 5000 });
                await page.type(scene.interaction.selector, scene.interaction.text);
            } else {
                await act(page, scene, scene.interaction);
            }
            await waitScene(page, scene.interaction.verify, 'interaction observable effect');
            result.interaction = { status: 'observed', automationRoundTripMs: Date.now() - started,
                limitation: 'Includes automation and state observation; not true input-to-next-paint latency' };
        } else {
            result.interaction = { status: 'not-supported', reason: 'No safe independently verified representative interaction' };
        }
        // Stats-drawer lifecycle pause has a reviewed owner in #133/#134; don't
        // invent generic pause controls for games without that capability.
        if (viewportTag !== 'desktop' && game.caps?.includes('drawer') && game.id !== 'tetris') {
            const toggle = `#${game.prefix}StatsToggle`;
            const close = `#${game.prefix}StatsClose`;
            await page.waitForSelector(toggle, { visible: true, timeout: 5000 });
            await page.click(toggle);
            const pausedState = { owner: scene.owner, path: 'pauseOwnership.isHeld()', equals: true };
            await waitScene(page, pausedState, 'drawer pause lease');
            result.phases.paused = { status: 'measured',
                metrics: await sampleWindow(page, client, preset.paused, { sampleRaf: false }) };
            await page.waitForSelector(close, { visible: true, timeout: 5000 });
            await page.click(close);
            await waitScene(page, { owner: scene.owner, path: 'pauseOwnership.isHeld()', equals: false }, 'drawer release');
            await waitScene(page, scene.active, 'resume');
            const resumed = await sampleWithInput(page, client, scene, viewportTag,
                () => sampleWindow(page, client, preset.resume, { sampleRaf: scene.activity !== 'discrete' }));
            result.phases.resume = { status: 'measured', ...resumed };
            await assertStillActive(page, scene.active, 'resume');
        } else {
            result.phases.paused = { status: 'not-supported', reason: viewportTag === 'desktop' ? 'Drawer not measured on desktop: topbar control may be hidden' : 'No validated shared-drawer pause hook' };
            result.phases.resume = { status: 'not-supported', reason: viewportTag === 'desktop' ? 'Drawer not measured on desktop: topbar control may be hidden' : 'No validated shared-drawer resume hook' };
        }
        if (preset.memoryCycles > 0 && scene.restart) {
            const cycle = [];
            for (let i = 0; i < preset.memoryCycles; i++) {
                // Every restart is a test-hook today; record it like the start path.
                const restartPath = await act(page, scene, scene.restart);
                await waitScene(page, scene.active, 'restart active');
                try {
                    await client.send('HeapProfiler.collectGarbage');
                    const cdp = await client.send('Performance.getMetrics');
                    cycle.push({ restartPath, ...Object.fromEntries(cdp.metrics.filter(x => ['JSHeapUsedSize', 'Nodes'].includes(x.name))
                        .map(x => [x.name, x.value])) });
                } catch (e) { cycle.push({ restartPath, unavailable: String(e.message || e) }); }
            }
            result.phases.memoryCycles = { status: 'measured', data: cycle,
                interpretation: 'post-GC trend only; not proof of a leak' };
        } else {
            result.phases.memoryCycles = { status: 'not-supported', reason: 'Deep preset and a validated in-page restart required' };
        }
        if (preset.memoryCycles > 0) {
            let otherPage = null;
            try {
                otherPage = await context.newPage();
                await otherPage.goto('about:blank');
                await otherPage.bringToFront();
                const hidden = await page.evaluate(() => document.hidden);
                await otherPage.close();
                otherPage = null;
                await page.bringToFront();
                result.phases.background = hidden
                    ? { status: 'observed', afterForeground: await page.evaluate(() => document.visibilityState),
                        interpretation: 'Browser tab visibility, not physical device background' }
                    : { status: 'not-supported', reason: 'Chromium did not actually mark page hidden' };
            } finally { await otherPage?.close().catch(() => {}); }
        } else {
            result.phases.background = { status: 'not-sampled', reason: 'Deep preset required' };
        }
        if (errors.length) throw new Error(`pageerror: ${errors.join(' | ')}`);
        if (result.phases.active.metrics.taskTimeMs == null) {
            throw new Error('CDP TaskDuration absent: active metrics invalid');
        }
        result.status = 'measured';
    } catch (error) {
        result.error = String(error?.message || error);
    } finally {
        await client?.detach().catch(() => {});
        await context.close().catch(() => {});
    }
    return result;
}

export async function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    if (options.help) { usage(); return; }
    const root = options.source === 'dist' ? join(ROOT, 'dist') : ROOT;
    if (!existsSync(join(root, 'index.html'))) throw new Error(`missing ${options.source}/index.html; run npm run build first`);
    await mkdir(options.out, { recursive: true });
    const expected = options.games.flatMap(game => options.viewports.flatMap(viewport =>
        Array.from({ length: options.repeat }, (_, i) => ({ game, viewport, repeat: i + 1 }))));
    const { server, url } = await startServer(root, options.port);
    let browser;
    const results = [];
    const meta = {
        commit: gitSha(), source: options.source, sourceRoot: root, os: platform(),
        cpu: cpus()[0]?.model || 'unavailable', cpuCount: cpus().length,
        browserVersion: 'unavailable', browserFlags: LAUNCH_ARGS,
        gpuMode: LAUNCH_ARGS.includes('--disable-gpu') ? 'disabled' : 'environment-dependent',
        preset: options.preset, repeat: options.repeat,
        startedAt: new Date().toISOString(),
    };
    try {
        browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });
        meta.browserVersion = await browser.version();
        for (const item of expected) {
            const game = registry.byId(item.game);
            console.log(`[profile] ${game.id} ${item.viewport} ${item.repeat}/${options.repeat}`);
            const row = await runOne(browser, url, game, SCENARIOS[game.id], item.viewport,
                item.repeat, PRESETS[options.preset]);
            if (row.status !== 'measured') console.error(`  INCOMPLETE: ${row.error}`);
            results.push(row);
            // Checkpoint every run, so a killed long profile never loses all evidence.
            await writeFile(join(options.out, 'runs.json'), JSON.stringify({ meta, results }, null, 2));
        }
    } finally {
        await browser?.close().catch(() => {});
        server.kill();
    }
    meta.finishedAt = new Date().toISOString();
    const summary = reportSummary(results, expected);
    const report = { schemaVersion: 1, meta, summary, results };
    await writeFile(join(options.out, 'results.json'), JSON.stringify(report, null, 2));
    await writeFile(join(options.out, 'summary.md'), renderMarkdown(report));
    console.log(`Profile ${summary.complete ? 'complete' : 'INCOMPLETE'}: ${summary.measuredRuns}/${summary.expectedRuns}; ${options.out}`);
    if (!summary.complete) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main().catch(error => { console.error(String(error?.stack || error)); process.exitCode = 1; });
}
