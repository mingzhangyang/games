#!/usr/bin/env node
// Auto-discovered verification runner. Add tests under tests/ as verify-*.mjs or smoke-*.mjs.
// Browser/server requirements are inferred from imports; game ownership is inferred from the filename.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registry } from './lib/registry.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEST_ROOT = join(ROOT, 'tests');
const PORT = Number(process.env.VERIFY_PORT || 8930);
const argv = process.argv.slice(2);
const QUICK = argv.includes('--quick');
const CHANGED = argv.includes('--changed');
const flag = name => (argv.find(a => a.startsWith(`--${name}=`)) || '').split('=')[1];
const DIFF_BASE = flag('base') || '';
const JOBS = Math.max(1, Number(flag('jobs') || process.env.VERIFY_JOBS || Math.min(3, Math.floor(cpus().length / 2))) || 1);
const BASE_URL = argv.find(a => !a.startsWith('--')) || '';

const REGISTERED_GAMES = registry.all();
const PAGE_IDS = ['index', ...REGISTERED_GAMES.map(g => g.id)].sort((a, b) => b.length - a.length);
const GAME_ALIASES = REGISTERED_GAMES.map(game => ({
    id: game.id,
    aliases: [game.id, game.prefix].filter(Boolean).map(alias => alias.split('-')),
}));
const CORE = new Set([
    'verify-boot', 'verify-chunk-isolation', 'verify-daily', 'verify-i18n',
    'verify-index-cards', 'verify-leaderboard', 'verify-no-game-lang',
    'verify-registry', 'verify-sfx',
]);
const QUICK_BROWSER = new Set(['smoke-index', 'verify-chrome', 'verify-theme', 'verify-start-menus']);

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

function discover() {
    return readdirSync(TEST_ROOT)
        .filter(file => /^(verify-|smoke-|fg-audit|placeholder-leak-check).*\.mjs$/.test(file))
        .filter(file => file !== 'verify-all.mjs')
        .sort()
        .map(file => {
            const script = `tests/${file}`;
            const source = readFileSync(join(ROOT, script), 'utf8');
            const name = file.replace(/\.mjs$/, '');
            return {
                name,
                script,
                args: [],
                needsServer: /puppeteer-core|\.\/lib\/(?:browser|game-test)\.mjs/.test(source),
                pages: /\.\/lib\/page-filter\.mjs/.test(source),
                games: inferGames(name),
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

function selectSuite() {
    if (QUICK) {
        return allSteps.filter(step => !step.needsServer || QUICK_BROWSER.has(step.name));
    }
    if (!CHANGED) return allSteps;

    const { base, files } = changedFiles();
    console.log(`--changed: ${files.length} files vs ${base}`);
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

function startServer() {
    return spawn(process.execPath, [join(ROOT, 'tests', 'lib', 'serve-static.mjs'), String(PORT)], {
        cwd: ROOT,
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
                if (!settled) {
                    try { child.kill('SIGKILL'); } catch {}
                }
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

let suite = selectSuite().filter(step => existsSync(join(ROOT, step.script)));
const needsServer = suite.some(step => step.needsServer);
const server = !BASE_URL && needsServer ? startServer() : null;
const base = BASE_URL || `http://127.0.0.1:${PORT}`;
let ready = true;
if (server) ready = await waitForServer(base);

const started = Date.now();
let results = [];
if (!ready) {
    results = [{ name: 'server', ok: false, code: -1, ms: 0 }];
} else if (JOBS === 1) {
    for (const step of suite) results.push(await runStep(step, base, false));
} else {
    const offline = suite.filter(step => !step.needsServer);
    const online = suite.filter(step => step.needsServer);
    const [a, b] = await Promise.all([
        pool(offline, Math.max(1, Math.min(4, JOBS * 2)), step => runStep(step, base, true)),
        pool(online, JOBS, step => runStep(step, base, true)),
    ]);
    const byName = new Map([...a, ...b].map(result => [result.name, result]));
    results = suite.map(step => byName.get(step.name));
}
if (server) server.kill();

console.log('\n== verify summary ==');
let failed = 0;
for (const result of results) {
    if (!result.ok) failed++;
    console.log(`${result.ok ? '✓' : '✗'} ${result.name.padEnd(34)} ${String(result.code).padStart(4)}  ${(result.ms / 1000).toFixed(1)}s`);
}
console.log(`\nwall ${((Date.now() - started) / 1000).toFixed(1)}s · ${suite.length} steps`);
console.log(failed ? `\n${failed} failed ❌` : '\nall passed ✅');
process.exit(failed ? 1 : 0);
