#!/usr/bin/env node
// Auto-discovered verification runner. Add tests under tests/ as verify-*.mjs or smoke-*.mjs.
// Browser/server requirements are inferred from imports; game ownership is inferred from the filename.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { registry } from './lib/registry.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEST_ROOT = join(ROOT, 'tests');
const argv = process.argv.slice(2);
const QUICK = argv.includes('--quick');
const CHANGED = argv.includes('--changed');
// CI splits one full run across parallel jobs: --offline (no browser) and
// --browser --with-dist --shard=k/n. --dist runs only the built-output gate set (served from
// dist/); --with-dist appends that set to the selected suite as `dist:<name>` steps.
const OFFLINE = argv.includes('--offline');
const BROWSER = argv.includes('--browser');
const DIST = argv.includes('--dist');
const WITH_DIST = argv.includes('--with-dist');
const flag = name => (argv.find(a => a.startsWith(`--${name}=`)) || '').split('=')[1];
const DIFF_BASE = flag('base') || '';
const SHARD = flag('shard') || '';
const JOBS = Math.max(1, Number(flag('jobs') || process.env.VERIFY_JOBS || Math.min(3, Math.floor(cpus().length / 2))) || 1);
const BASE_URL = argv.find(a => !a.startsWith('--')) || '';
const PORT = Number(process.env.VERIFY_PORT || 8930);
const DIST_PORT = PORT + 1;

const REGISTERED_GAMES = registry.all();
const PAGE_IDS = ['index', ...REGISTERED_GAMES.map(g => g.id)].sort((a, b) => b.length - a.length);
// 首页不在 registry 里，但 index.html / js/index-page.js / src/home/ 都归 index 页：
// 不加这一项，smoke-index / verify-index-layout 推不出 games，首页改动时会被 --changed 漏掉
const GAME_ALIASES = [{ id: 'index' }, ...REGISTERED_GAMES].map(game => ({
    id: game.id,
    aliases: [game.id, game.prefix].filter(Boolean).map(alias => alias.split('-')),
}));
const CORE = new Set([
    'verify-architecture', 'verify-boot', 'verify-chunk-isolation', 'verify-daily', 'verify-i18n',
    'verify-index-cards', 'verify-leaderboard', 'verify-no-game-lang',
    'verify-registry', 'verify-sfx',
]);
const QUICK_BROWSER = new Set(['smoke-index', 'verify-chrome', 'verify-theme', 'verify-start-menus']);
// Re-run against the production build: every page's chrome/theme, the shared layout contracts
// whose cascade depends on Vite's CSS chunk order, and the smokes that load production art.
const DIST_SUITE = new Set([
    'verify-chrome', 'verify-theme', 'verify-desktop-frame', 'verify-stats-drawer', 'verify-immersive',
    'verify-start-menus', 'smoke-index', 'smoke-carrot-pull', 'smoke-needle-awn', 'smoke-tower-defense',
    'smoke-sword-flight', 'verify-topbar-overflow', 'verify-contextual-restart', 'verify-scoreboard-results',
    'smoke-scoreboard-dialog',
]);
// Approximate CI seconds of the slowest browser steps. Only used to balance --shard; a stale or
// missing entry costs balance, never coverage. Unlisted browser steps count as DEFAULT_WEIGHT.
const WEIGHTS = {
    'verify-stats-drawer': 190, 'verify-theme': 145, 'verify-button-icons': 135, 'verify-chrome': 105,
    'verify-desktop-frame': 100, 'placeholder-leak-check': 95, 'verify-overlay-corners': 75,
    'verify-start-menus': 70, 'fg-audit': 65, 'verify-immersive': 60, 'verify-touch-hints': 45, 'verify-topbar-row': 35, 'verify-topbar-states': 40,
    'verify-tetris-drawer': 35, 'verify-stage-status': 30, 'smoke-magnetic-garden': 30, 'verify-science-howto': 55,
    'verify-tetris-topbar-mobile': 30, 'smoke-silk-dew': 25, 'smoke-crystal-bloom': 25,
    'verify-mobile-viewport-fit': 25, 'verify-service-worker': 35, 'smoke-shadow-loom': 20, 'smoke-ripple-duet': 20,
    'verify-topbar-overflow': 100,
    'verify-topbar-desktop': 145, 'verify-topbar-grid': 145,
    'verify-sidebar-family': 20, 'smoke-index': 15, 'smoke-carrot-pull': 15, 'smoke-maxwell-demon': 15,
};
const DEFAULT_WEIGHT = 10;
const weightOf = step => WEIGHTS[step.name.replace(/^dist:/, '')] ?? (step.needsServer ? DEFAULT_WEIGHT : 1);

function inferGames(name) {
    const parts = name.replace(/^(verify|smoke)-/, '').split('-');
    const contains = aliasParts => {
        for (let i = 0; i + aliasParts.length <= parts.length; i++) {
            if (parts.slice(i, i + aliasParts.length).join('-') === aliasParts.join('-')) return true;
        }
        return false;
    };
    return GAME_ALIASES.filter(game => game.aliases.some(contains)).map(game => game.id);
}

export function discover() {
    return readdirSync(TEST_ROOT)
        .filter(file => /^(verify-|smoke-|fg-audit|placeholder-leak-check).*\.mjs$/.test(file))
        .filter(file => file !== 'verify-all.mjs')
        .sort()
        .map(file => {
            const script = `tests/${file}`;
            const source = readFileSync(join(ROOT, script), 'utf8');
            const name = file.replace(/\.mjs$/, '');
            // A checker whose cost scales with the registry can declare its own budget with
            // `// verify-all: timeout=<ms>` instead of riding the generic 180s default.
            const budget = /^\/\/ verify-all: timeout=(\d+)$/m.exec(source);
            return {
                name,
                script,
                args: [],
                needsServer: /puppeteer-core|\.\/lib\/(?:browser|game-test)\.mjs/.test(source),
                pages: /\.\/lib\/page-filter\.mjs/.test(source),
                games: inferGames(name),
                ...(budget ? { timeoutMs: Number(budget[1]) } : {}),
            };
        });
}

const INFRA = [
    { name: 'gen-check', script: 'tools/generators/gen-from-registry.mjs', args: ['--check'], needsServer: false, games: [] },
    { name: 'lint', script: 'tools/checks/run-lint.mjs', args: [], needsServer: false, games: [] },
    { name: 'shadow-generated', script: 'tools/generators/shadow-loom-build-silhouettes.mjs', args: ['--check'], needsServer: false, games: ['shadow-loom'] },
];

const discovered = discover();
const allSteps = [...INFRA, ...discovered];

function changedFiles() {
    const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
    let base = DIFF_BASE;
    if (!base) {
        for (const ref of ['origin/main', 'main']) {
            try { git('rev-parse', '--verify', '--quiet', ref); base = ref; break; } catch {}
        }
    }
    const since = base ? git('merge-base', 'HEAD', base) : 'HEAD';
    const tracked = git('diff', '--name-only', since);
    const untracked = git('ls-files', '--others', '--exclude-standard');
    return { base: base || 'HEAD', files: [...new Set(`${tracked}\n${untracked}`.split('\n').filter(Boolean))] };
}

function ownerOf(file) {
    if (/\.md$/i.test(file) || file.startsWith('docs/')) return '';
    if (file.startsWith('tests/')) {
        const stem = file.split('/').pop().replace(/\.mjs$/, '');
        const owned = inferGames(stem);
        return owned.length === 1 ? owned[0] : null;
    }
    if (file.startsWith('src/platform/') || file === 'games.config.json' || file === 'games.schema.json'
        || file === 'vite.config.js' || file.startsWith('css/tokens') || file.startsWith('css/layout')
        || file.startsWith('css/science-showcase') || file.startsWith('css/more-games')) return null;
    // 首页运行时包（组合根 src/home/index.js）归 index 页，与 src/games/<id>/ 归各自游戏同理
    if (file.startsWith('src/home/')) return 'index';
    for (const id of PAGE_IDS) {
        if (file === `${id}.html`) return id;
        if (file.startsWith(`js/${id}/`) || file.startsWith(`assets/${id}/`)
            || file.startsWith(`public/assets/${id}/`) || file.startsWith(`src/games/${id}/`)) return id;
        const stem = file.split('/').pop().replace(/\.[^.]+$/, '');
        if (/^(js|css)\//.test(file) && (stem === id || stem.startsWith(`${id}-`))) return id;
        if (file.startsWith(`src/generated/${id}/`)) return id;
    }
    return null;
}

function distSteps() {
    return allSteps.filter(step => DIST_SUITE.has(step.name)).map(step => ({
        ...step,
        name: `dist:${step.name}`,
        served: 'dist',
        env: { ...step.env, VERIFY_BUILT_OUTPUT: '1' },
    }));
}

function selectSuite() {
    if (DIST) return distSteps();
    if (QUICK) {
        return allSteps.filter(step => !step.needsServer || QUICK_BROWSER.has(step.name));
    }
    if (!CHANGED) return allSteps;

    const { base, files } = changedFiles();
    console.log(`--changed: ${files.length} files vs ${base}`);
    return selectChangedSuite(files);
}

// Longest-processing-time-first: deterministic, and every step lands in exactly one shard.
export function shardSuite(steps, index, count) {
    const loads = Array.from({ length: count }, () => 0);
    const owner = new Map();
    for (const step of [...steps].sort((a, b) => weightOf(b) - weightOf(a) || a.name.localeCompare(b.name))) {
        const target = loads.indexOf(Math.min(...loads));
        loads[target] += weightOf(step);
        owner.set(step.name, target);
    }
    return steps.filter(step => owner.get(step.name) === index - 1);
}

function parseShard(value) {
    const match = /^(\d+)\/(\d+)$/.exec(value);
    const index = Number(match?.[1]);
    const count = Number(match?.[2]);
    if (!match || count < 1 || index < 1 || index > count) {
        console.error(`--shard expects k/n with 1 <= k <= n, got "${value}"`);
        process.exit(2);
    }
    return { index, count };
}

export function selectChangedSuite(files) {
    const pages = new Set();
    let shared = false;
    const touchedTests = new Set();
    for (const file of files) {
        if (file.startsWith('tests/') && file.endsWith('.mjs')) touchedTests.add(file.replace(/^tests\//, '').replace(/\.mjs$/, ''));
        const owner = ownerOf(file);
        if (owner === null) shared = true;
        else if (owner) pages.add(owner);
    }
    if (shared) return allSteps;

    return allSteps.filter(step => {
        if (INFRA.some(i => i.name === step.name)) return true;
        if (CORE.has(step.name) || touchedTests.has(step.name)) return true;
        if (step.pages && pages.size) return true;
        return step.games.some(id => pages.has(id));
    }).map(step => step.pages && pages.size && !touchedTests.has(step.name)
        ? { ...step, env: { VERIFY_PAGES: [...pages].join(',') } }
        : step);
}

function startServer(port, cwd) {
    return spawn(process.execPath, [join(ROOT, 'tests', 'lib', 'serve-static.mjs'), String(port)], {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
}

async function waitForServer(base, timeoutMs = 8000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        try {
            const res = await fetch(base);
            if (res.ok || res.status === 404) return true;
        } catch {}
        await new Promise(resolve => setTimeout(resolve, 150));
    }
    return false;
}

function runStep(step, base, buffered) {
    return new Promise(resolve => {
        const started = Date.now();
        const timeoutMs = Number(step.timeoutMs
            || process.env.VERIFY_STEP_TIMEOUT
            || (step.needsServer ? 180000 : 120000));
        const args = [join(ROOT, step.script), ...(step.args || [])];
        if (step.needsServer) args.push(base);
        const child = spawn(process.execPath, args, {
            cwd: ROOT,
            env: { ...process.env, VERIFY_JOBS: String(JOBS), ...(step.env || {}) },
            stdio: buffered ? ['ignore', 'pipe', 'pipe'] : 'inherit',
        });
        const chunks = [];
        if (buffered) {
            child.stdout.on('data', d => chunks.push(d));
            child.stderr.on('data', d => chunks.push(d));
        }
        const finish = (ok, code, error = '') => {
            const ms = Date.now() - started;
            if (buffered) {
                process.stdout.write(`\n▶ ${step.name} (${(ms / 1000).toFixed(1)}s)\n${Buffer.concat(chunks).toString()}`);
            }
            resolve({ ...step, ok, code, error, ms });
        };
        let settled = false;
        const done = (ok, code, error = '') => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            finish(ok, code, error);
        };
        const timer = setTimeout(() => {
            try { child.kill('SIGTERM'); } catch {}
            setTimeout(() => {
                // `done()` marks the step settled immediately, but a child may
                // ignore SIGTERM.  The hard kill must therefore not depend on
                // the parent promise still being unsettled.
                try { child.kill('SIGKILL'); } catch {}
            }, 3000).unref?.();
            done(false, 124, `timeout after ${timeoutMs}ms`);
        }, timeoutMs);
        timer.unref?.();

        child.on('exit', code => done(code === 0, code));
        child.on('error', error => done(false, -1, error.message));
    });
}

async function pool(steps, limit, run) {
    const out = new Array(steps.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(limit, steps.length) }, async () => {
        while (next < steps.length) {
            const i = next++;
            out[i] = await run(steps[i]);
        }
    }));
    return out;
}

const IS_MAIN = process.argv[1]
    && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (IS_MAIN) {
    let suite = selectSuite();
    if (WITH_DIST && !DIST) suite = [...suite, ...distSteps()];
    suite = suite.filter(step => existsSync(join(ROOT, step.script)));
    if (OFFLINE) suite = suite.filter(step => !step.needsServer);
    if (BROWSER) suite = suite.filter(step => step.needsServer);
    if (SHARD) {
        const { index, count } = parseShard(SHARD);
        suite = shardSuite(suite, index, count);
        console.log(`--shard=${index}/${count}: ${suite.length} steps`);
    }
    const needsSource = suite.some(step => step.needsServer && step.served !== 'dist');
    const needsDist = suite.some(step => step.served === 'dist');
    if (needsDist && !existsSync(join(ROOT, 'dist', 'index.html'))) {
        console.error('built-output steps need a production build: run `npm run build` first');
        process.exit(2);
    }
    const servers = [];
    const sourceBase = BASE_URL || `http://127.0.0.1:${PORT}`;
    const distBase = `http://127.0.0.1:${DIST_PORT}`;
    if (needsSource && !BASE_URL) servers.push([startServer(PORT, ROOT), sourceBase]);
    if (needsDist) servers.push([startServer(DIST_PORT, join(ROOT, 'dist')), distBase]);
    let ready = true;
    for (const [, url] of servers) ready = ready && await waitForServer(url);
    const baseFor = step => (step.served === 'dist' ? distBase : sourceBase);

    const started = Date.now();
    let results = [];
    if (!ready) {
        results = [{ name: 'server', ok: false, code: -1, ms: 0 }];
    } else if (JOBS === 1) {
        for (const step of suite) results.push(await runStep(step, baseFor(step), false));
    } else {
        const offline = suite.filter(step => !step.needsServer);
        // Start the slowest browser steps first so the pool's tail is short.
        const online = suite.filter(step => step.needsServer)
            .sort((a, b) => weightOf(b) - weightOf(a) || a.name.localeCompare(b.name));
        const [a, b] = await Promise.all([
            pool(offline, Math.max(1, Math.min(4, JOBS * 2)), step => runStep(step, baseFor(step), true)),
            pool(online, JOBS, step => runStep(step, baseFor(step), true)),
        ]);
        const byName = new Map([...a, ...b].map(result => [result.name, result]));
        results = suite.map(step => byName.get(step.name));
    }
    for (const [server] of servers) server.kill();

    console.log('\n== verify summary ==');
    let failed = 0;
    for (const result of results) {
        if (!result.ok) failed++;
        console.log(`${result.ok ? '✓' : '✗'} ${result.name.padEnd(34)} ${String(result.code).padStart(4)}  ${(result.ms / 1000).toFixed(1)}s`);
    }
    console.log(`\nwall ${((Date.now() - started) / 1000).toFixed(1)}s · ${suite.length} steps`);
    console.log(failed ? `\n${failed} failed ❌` : '\nall passed ✅');
    process.exit(failed ? 1 : 0);
}
