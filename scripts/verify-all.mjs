// 全量校验编排器：起一次静态服务器 → 并发跑校验器 → 汇总表 → 非零退出码 → kill 服务器。
//
// 用法：
//   node scripts/verify-all.mjs                 # 全量
//   node scripts/verify-all.mjs --quick         # 日常档（QUICK_NAMES）
//   node scripts/verify-all.mjs --changed       # 按改动选：相对 origin/main 的 diff + 未跟踪文件
//   node scripts/verify-all.mjs --changed --base=HEAD~3
//   node scripts/verify-all.mjs --jobs=1        # 退回串行、输出实时直通（排查时用）
//   node scripts/verify-all.mjs http://127.0.0.1:8900   # 复验已有服务（如 dist 产物）
//
// 并发：离线项（needsServer: false）全部并发；浏览器项同时最多 --jobs 个（默认 VERIFY_JOBS
// 或 min(3, CPU 核数/2)，至少 1）。并发时每项输出先缓冲，跑完整块打印，不会交错。
//
// --changed 的选择规则（selectChanged）：
//   - 改了「页面自有文件」（<id>.html、css/<id>*.css、js/<id>*.js、js/<id>/、assets/<id>/…）
//     → 核心离线项 + 名字里带该页 id 的专项 + 跨页校验器（pages: true）以 VERIFY_PAGES=<ids> 只跑这些页
//   - 改了某个校验器脚本本身 → 该项全页跑
//   - 只改文档（*.md、docs/）→ 只跑核心离线项
//   - 改了任何共享文件（css/layout.css、js/game-*.js、games.config.json、scripts/lib/…）→ 退回全量
//
// 注意：服务器用 spawn 返回的子进程句柄关闭（捕获 PID），绝不用 pgrep -f ——
// 那会匹配到调用本脚本的 shell 自身。
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cpus } from 'node:os';
import { Buffer } from 'node:buffer';
import { registry } from './lib/registry.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.VERIFY_PORT || 8930);
const argv = process.argv.slice(2);
const QUICK = argv.includes('--quick');
const CHANGED = argv.includes('--changed');
const flag = name => (argv.find(a => a.startsWith(`--${name}=`)) || '').split('=')[1];
const DIFF_BASE = flag('base') || '';
const JOBS = Math.max(1, Number(flag('jobs') || process.env.VERIFY_JOBS || Math.min(3, Math.floor(cpus().length / 2))) || 1);
const BASE_URL = argv.find(a => !a.startsWith('--')) || '';

// 校验器注册表：name → { script, needsServer, pages?, games? }
//   pages: true  跨页校验器，认 VERIFY_PAGES 按页过滤（scripts/lib/page-filter.mjs）
//   games: [...] 专项所属页；省略时从名字推断（名字含注册表 id 或 'index' 的分段，见 stepGames）
// 新校验器加进来即可；跨页的记得接 page-filter 并标 pages: true。
const SUITE = [
    { name: 'gen-check', script: 'scripts/gen-from-registry.mjs', args: ['--check'], needsServer: false },
    { name: 'lint', script: 'scripts/run-lint.mjs', args: [], needsServer: false },
    { name: 'boot', script: 'scripts/verify-boot.mjs', args: [], needsServer: false },
    { name: 'chunk-isolation', script: 'scripts/verify-chunk-isolation.mjs', args: [], needsServer: false },
    { name: 'daily', script: 'scripts/verify-daily.mjs', args: [], needsServer: false },
    { name: 'leaderboard', script: 'scripts/verify-leaderboard.mjs', args: [], needsServer: false },
    { name: 'i18n', script: 'scripts/verify-i18n.mjs', args: [], needsServer: false },
    { name: 'sfx', script: 'scripts/verify-sfx.mjs', args: [], needsServer: false },
    { name: 'registry', script: 'scripts/verify-registry.mjs', args: [], needsServer: false },
    { name: 'index-cards', script: 'scripts/verify-index-cards.mjs', args: [], needsServer: false },
    { name: 'no-game-lang', script: 'scripts/verify-no-game-lang.mjs', args: [], needsServer: false },
    { name: 'fg-audit', script: 'scripts/fg-audit.mjs', args: [], needsServer: true, pages: true },
    { name: 'theme', script: 'scripts/verify-theme.mjs', args: [], needsServer: true, pages: true },
    { name: 'start-menus', script: 'scripts/verify-start-menus.mjs', args: [], needsServer: true, pages: true },
    { name: 'placeholder-leak', script: 'scripts/placeholder-leak-check.mjs', args: [], needsServer: true, pages: true },
    { name: 'chrome', script: 'scripts/verify-chrome.mjs', args: [], needsServer: true, pages: true },
    { name: 'desktop-frame', script: 'scripts/verify-desktop-frame.mjs', args: [], needsServer: true, pages: true },
    { name: 'stats-drawer', script: 'scripts/verify-stats-drawer.mjs', args: [], needsServer: true, pages: true },
    { name: 'gomoku', script: 'scripts/verify-gomoku.mjs', args: [], needsServer: true },
    { name: 'button-icons', script: 'scripts/verify-button-icons.mjs', args: [], needsServer: true, pages: true },
    { name: 'tetris-topbar-mobile', script: 'scripts/verify-tetris-topbar-mobile.mjs', args: [], needsServer: true },
    { name: 'tetris-touch', script: 'scripts/verify-tetris-touch.mjs', args: [], needsServer: true },
    { name: 'tetris-drawer', script: 'scripts/verify-tetris-drawer.mjs', args: [], needsServer: true },
    { name: 'td-topbar', script: 'scripts/verify-td-topbar.mjs', args: [], needsServer: true, games: ['tower-defense'] },
    { name: 'smoke-index', script: 'scripts/smoke-index.mjs', args: [], needsServer: true },
    { name: 'index-layout', script: 'scripts/verify-index-layout.mjs', args: [], needsServer: true },
    { name: 'smoke-tank-battle', script: 'scripts/smoke-tank-battle.mjs', args: [], needsServer: true },
    { name: 'smoke-math-rain', script: 'scripts/smoke-math-rain.mjs', args: [], needsServer: true },
    { name: 'carrot-pull-art', script: 'scripts/verify-carrot-pull-art.mjs', args: [], needsServer: false },
    { name: 'smoke-carrot-pull', script: 'scripts/smoke-carrot-pull.mjs', args: [], needsServer: true },
    { name: 'needle-awn-art', script: 'scripts/verify-needle-awn-art.mjs', args: [], needsServer: false },
    { name: 'smoke-needle-awn', script: 'scripts/smoke-needle-awn.mjs', args: [], needsServer: true },
    { name: 'lumen-levels', script: 'scripts/verify-lumen-levels.mjs', args: [], needsServer: false },
    { name: 'smoke-lumen', script: 'scripts/smoke-lumen.mjs', args: [], needsServer: true },
    { name: 'circuit-levels', script: 'scripts/verify-circuit-levels.mjs', args: [], needsServer: false },
    { name: 'smoke-circuit', script: 'scripts/smoke-circuit.mjs', args: [], needsServer: true },
    { name: 'silk-dew-levels', script: 'scripts/verify-silk-dew-levels.mjs', args: [], needsServer: false },
    { name: 'silk-dew-art', script: 'scripts/verify-silk-dew-art.mjs', args: [], needsServer: false },
    { name: 'smoke-silk-dew', script: 'scripts/smoke-silk-dew.mjs', args: [], needsServer: true },
    { name: 'echo-cave-levels', script: 'scripts/verify-echo-cave-levels.mjs', args: [], needsServer: false },
    { name: 'smoke-echo-cave', script: 'scripts/smoke-echo-cave.mjs', args: [], needsServer: true },
    { name: 'bond-forge-levels', script: 'scripts/verify-bond-forge-levels.mjs', args: [], needsServer: false },
    { name: 'smoke-bond-forge', script: 'scripts/smoke-bond-forge.mjs', args: [], needsServer: true },
    { name: 'maxwell-demon-levels', script: 'scripts/verify-maxwell-demon-levels.mjs', args: [], needsServer: false },
    { name: 'smoke-maxwell-demon', script: 'scripts/smoke-maxwell-demon.mjs', args: [], needsServer: true },
    { name: 'crystal-bloom-levels', script: 'scripts/verify-crystal-bloom-levels.mjs', args: [], needsServer: false },
    { name: 'smoke-crystal-bloom', script: 'scripts/smoke-crystal-bloom.mjs', args: [], needsServer: true },
    { name: 'flame-verse-levels', script: 'scripts/verify-flame-verse-levels.mjs', args: [], needsServer: false },
    { name: 'smoke-flame-verse', script: 'scripts/smoke-flame-verse.mjs', args: [], needsServer: true },
    { name: 'ripple-duet-levels', script: 'scripts/verify-ripple-duet-levels.mjs', args: [], needsServer: false },
    { name: 'smoke-ripple-duet', script: 'scripts/smoke-ripple-duet.mjs', args: [], needsServer: true },
    { name: 'firefly-signal-sim', script: 'scripts/verify-firefly-signal-sim.mjs', args: [], needsServer: false },
    { name: 'immersive', script: 'scripts/verify-immersive.mjs', args: [], needsServer: true, pages: true },
    { name: 'smoke-firefly-signal', script: 'scripts/smoke-firefly-signal.mjs', args: [], needsServer: true },
    { name: 'shadow-loom-silhouettes', script: 'scripts/verify-shadow-loom-silhouettes.mjs', args: [], needsServer: false },
    { name: 'shadow-loom-silhouette-build', script: 'scripts/shadow-loom-build-silhouettes.mjs', args: ['--check'], needsServer: false },
    { name: 'shadow-loom-levels', script: 'scripts/verify-shadow-loom-levels.mjs', args: [], needsServer: false },
    { name: 'smoke-shadow-loom', script: 'scripts/smoke-shadow-loom.mjs', args: [], needsServer: true },
];

const QUICK_NAMES = ['gen-check', 'lint', 'boot', 'chunk-isolation', 'daily', 'leaderboard', 'i18n', 'sfx', 'registry', 'index-cards', 'no-game-lang', 'lumen-levels', 'circuit-levels', 'silk-dew-levels', 'silk-dew-art', 'bond-forge-levels', 'echo-cave-levels', 'smoke-echo-cave', 'maxwell-demon-levels', 'smoke-maxwell-demon', 'fg-audit', 'theme', 'start-menus', 'placeholder-leak', 'chrome', 'smoke-index', 'index-layout', 'smoke-tank-battle', 'smoke-math-rain', 'carrot-pull-art', 'needle-awn-art', 'smoke-lumen', 'smoke-circuit', 'smoke-silk-dew', 'smoke-bond-forge', 'crystal-bloom-levels', 'smoke-crystal-bloom', 'flame-verse-levels', 'smoke-flame-verse', 'ripple-duet-levels', 'smoke-ripple-duet', 'shadow-loom-silhouettes', 'shadow-loom-silhouette-build', 'shadow-loom-levels', 'smoke-shadow-loom', 'desktop-frame', 'firefly-signal-sim', 'immersive', 'smoke-firefly-signal'];

// ── --changed：按 git diff 选择要跑的项 ──
// 核心离线项：秒级、覆盖全站共享事实（codegen / lint / 注册表 / i18n …），--changed 下永远跑
const CORE = ['gen-check', 'lint', 'boot', 'chunk-isolation', 'daily', 'leaderboard', 'i18n', 'sfx', 'registry', 'index-cards', 'no-game-lang'];
const PAGE_IDS = ['index', ...registry.all().map(g => g.id)].sort((a, b) => b.length - a.length); // 长 id 优先匹配

function stepGames(step) {
    if (step.games) return step.games;
    if (step.pages) return [];
    const parts = step.name.split('-');
    return PAGE_IDS.filter(id => {
        const n = id.split('-').length;
        for (let i = 0; i + n <= parts.length; i++) if (parts.slice(i, i + n).join('-') === id) return true;
        return false;
    });
}

// 文件 → 所属页 id；null = 共享文件（改了就退回全量）；'' = 与校验无关（文档）
function ownerOf(file) {
    if (/\.md$/i.test(file) || file.startsWith('docs/')) return '';
    const base = file.split('/').pop();
    const stem = base.replace(/\.[^.]+$/, '');
    for (const id of PAGE_IDS) {
        if (file === `${id}.html`) return id;
        if (/^(css|js)\/[^/]+$/.test(file) && (stem === id || stem.startsWith(`${id}-`))) return id;
        if (file.startsWith(`js/${id}/`) || file.startsWith(`assets/${id}/`) || file.startsWith(`public/assets/${id}/`)) return id;
        // 某页专属的离线工具脚本（不在 SUITE 里的 build / recut / solver 等）
        if (/^scripts\/[^/]+$/.test(file) && stem.includes(id) && !SUITE.some(st => st.script === file)) return id;
    }
    return null;
}

function changedFiles() {
    const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
    let base = DIFF_BASE;
    if (!base) {
        for (const ref of ['origin/main', 'main']) {
            try { git('rev-parse', '--verify', '--quiet', ref); base = ref; break; } catch { /* try next */ }
        }
    }
    const since = base ? git('merge-base', 'HEAD', base) : 'HEAD';
    const tracked = git('diff', '--name-only', since);
    const untracked = git('ls-files', '--others', '--exclude-standard');
    return { base: base || 'HEAD', files: [...new Set(`${tracked}\n${untracked}`.split('\n').filter(Boolean))] };
}

function selectChanged() {
    const { base, files } = changedFiles();
    console.log(`--changed：相对 ${base} 共 ${files.length} 个改动文件`);
    const pages = new Set();
    const shared = [];
    const touchedSteps = new Set();
    for (const f of files) {
        const step = SUITE.find(st => st.script === f);
        if (step) { touchedSteps.add(step.name); continue; }
        const owner = ownerOf(f);
        if (owner === null) shared.push(f);
        else if (owner) pages.add(owner);
    }
    if (shared.length) {
        console.log(`  共享文件有改动 → 退回全量：${shared.slice(0, 8).join(', ')}${shared.length > 8 ? ' …' : ''}`);
        return { steps: SUITE, env: {} };
    }
    const ids = [...pages].sort();
    console.log(`  涉及页面：${ids.join(', ') || '（无）'}${touchedSteps.size ? `；改动的校验器：${[...touchedSteps].join(', ')}` : ''}`);
    const steps = SUITE.filter(st => CORE.includes(st.name)
        || touchedSteps.has(st.name)
        || (st.pages && ids.length)
        || stepGames(st).some(id => pages.has(id)));
    // 跨页校验器只跑改动页；自身被改的校验器全页跑（不设 VERIFY_PAGES）
    for (const st of steps) {
        if (st.pages && !touchedSteps.has(st.name)) st.env = { VERIFY_PAGES: ids.join(',') };
    }
    return { steps };
}

let suite = CHANGED ? selectChanged().steps : QUICK ? SUITE.filter(s => QUICK_NAMES.includes(s.name)) : SUITE;
// 还没落地的校验器（后续阶段补）先跳过并提示，不让整个 verify 假红/假绿
suite = suite.filter(s => {
    if (existsSync(join(ROOT, s.script))) return true;
    console.log(`⊘ 跳过 ${s.name}（${s.script} 尚不存在，后续阶段补）`);
    return false;
});

function startServer() {
    const child = spawn(process.execPath, [join(ROOT, 'scripts', 'serve-static.mjs'), String(PORT)], {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let started = false;
    child.stdout.on('data', d => {
        if (String(d).includes('serving')) started = true;
    });
    child.on('exit', code => {
        if (!started && code !== null) console.error(`静态服务器异常退出（code=${code}）`);
    });
    return child;
}

async function waitForServer(base, timeoutMs = 8000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
        try {
            const res = await fetch(base);
            if (res.status === 404 || res.ok) return true; // 服务器在响应即可
        } catch { /* not yet */ }
        await new Promise(r => setTimeout(r, 150));
    }
    return false;
}

function runStep(step, base, buffered) {
    return new Promise(resolve => {
        const t0 = Date.now();
        const args = [join(ROOT, step.script), ...step.args];
        if (step.needsServer) args.push(base);
        const child = spawn(process.execPath, args, {
            cwd: ROOT,
            env: { ...process.env, ...step.env },
            stdio: buffered ? ['ignore', 'pipe', 'pipe'] : 'inherit',
        });
        const chunks = [];
        if (buffered) {
            child.stdout.on('data', d => chunks.push(d));
            child.stderr.on('data', d => chunks.push(d));
        }
        const done = extra => {
            const r = { ...step, ms: Date.now() - t0, ...extra };
            if (buffered) {
                const tag = step.env?.VERIFY_PAGES ? ` [VERIFY_PAGES=${step.env.VERIFY_PAGES}]` : '';
                process.stdout.write(`\n▶ ${step.name}${tag}  (${(r.ms / 1000).toFixed(1)}s)\n${Buffer.concat(chunks).toString()}`);
            }
            resolve(r);
        };
        child.on('exit', code => done({ ok: code === 0, code }));
        child.on('error', err => done({ ok: false, code: -1, error: err.message }));
    });
}

// 简单的并发池：按给定顺序领任务，同时最多 limit 个
async function pool(steps, limit, run) {
    const out = [];
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(limit, steps.length) }, async () => {
        while (next < steps.length) {
            const i = next++;
            out[i] = await run(steps[i]);
        }
    }));
    return out;
}

const server = BASE_URL ? null : startServer();
const base = BASE_URL || `http://127.0.0.1:${PORT}`;
let up = true;
if (!BASE_URL) {
    up = await waitForServer(base);
    if (!up) console.error(`静态服务器未能在 ${base} 就绪`);
}

const T0 = Date.now();
let results = [];
if (up) {
    const mode = CHANGED ? '(changed)' : QUICK ? '(quick)' : '(full)';
    console.log(`\n== verify ${mode} @ ${base} · ${suite.length} 项 · 浏览器并发 ${JOBS} ==`);
    if (JOBS === 1) {
        // 串行 + 输出直通：与旧行为一致，排查单项时用 --jobs=1
        for (const step of suite) {
            process.stdout.write(`\n▶ ${step.name}\n`);
            results.push(await runStep(step, base, false));
        }
    } else {
        const offline = suite.filter(st => !st.needsServer);
        const online = suite.filter(st => st.needsServer);
        const [a, b] = await Promise.all([
            pool(offline, Math.max(2, cpus().length), st => runStep(st, base, true)),
            pool(online, JOBS, st => runStep(st, base, true)),
        ]);
        // 汇总表仍按注册表顺序
        const byName = new Map([...a, ...b].map(r => [r.name, r]));
        results = suite.map(st => byName.get(st.name));
    }
} else {
    results.push({ name: 'server', ok: false, code: -1, ms: 0 });
}

if (server) server.kill();

console.log('\n== 汇总 ==');
let failed = 0;
for (const r of results) {
    const mark = r.ok ? '✓' : '✗';
    if (!r.ok) failed++;
    console.log(`${mark} ${r.name.padEnd(22)} ${String(r.code).padStart(4)}  ${(r.ms / 1000).toFixed(1)}s`);
}
console.log(`\n墙钟 ${((Date.now() - T0) / 1000).toFixed(1)}s（各项合计 ${(results.reduce((t, r) => t + r.ms, 0) / 1000).toFixed(1)}s）`);
console.log(failed === 0 ? '\n全部通过 ✅' : `\n${failed} 个失败 ❌`);
process.exit(failed === 0 ? 0 : 1);
