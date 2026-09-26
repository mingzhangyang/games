// 全量校验编排器：起一次静态服务器 → 顺序跑校验器 → 汇总表 → 非零退出码 → kill 服务器。
//
// 用法：
//   node scripts/verify-all.mjs                 # 全量（约 200+ 次页加载）
//   node scripts/verify-all.mjs --quick         # 日常档：gen --check + lint + 4 个关键校验器
//   node scripts/verify-all.mjs http://127.0.0.1:8900   # 复验已有服务（如 dist 产物）
//
// 注意：服务器用 spawn 返回的子进程句柄关闭（捕获 PID），绝不用 pgrep -f ——
// 那会匹配到调用本脚本的 shell 自身。
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.VERIFY_PORT || 8930);
const argv = process.argv.slice(2);
const QUICK = argv.includes('--quick');
const BASE_URL = argv.find(a => !a.startsWith('--')) || '';

// 校验器注册表：name → { script, needsServer }
// 新校验器（verify-daily / verify-leaderboard / verify-i18n）落地后加进对应档位即可。
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
    { name: 'fg-audit', script: 'scripts/fg-audit.mjs', args: [], needsServer: true },
    { name: 'theme', script: 'scripts/verify-theme.mjs', args: [], needsServer: true },
    { name: 'start-menus', script: 'scripts/verify-start-menus.mjs', args: [], needsServer: true },
    { name: 'placeholder-leak', script: 'scripts/placeholder-leak-check.mjs', args: [], needsServer: true },
    { name: 'chrome', script: 'scripts/verify-chrome.mjs', args: [], needsServer: true },
    { name: 'desktop-frame', script: 'scripts/verify-desktop-frame.mjs', args: [], needsServer: true },
    { name: 'stats-drawer', script: 'scripts/verify-stats-drawer.mjs', args: [], needsServer: true },
    { name: 'gomoku', script: 'scripts/verify-gomoku.mjs', args: [], needsServer: true },
    { name: 'button-icons', script: 'scripts/verify-button-icons.mjs', args: [], needsServer: true },
    { name: 'tetris-topbar-mobile', script: 'scripts/verify-tetris-topbar-mobile.mjs', args: [], needsServer: true },
    { name: 'tetris-touch', script: 'scripts/verify-tetris-touch.mjs', args: [], needsServer: true },
    { name: 'tetris-drawer', script: 'scripts/verify-tetris-drawer.mjs', args: [], needsServer: true },
    { name: 'td-topbar', script: 'scripts/verify-td-topbar.mjs', args: [], needsServer: true },
    { name: 'smoke-index', script: 'scripts/smoke-index.mjs', args: [], needsServer: true },
    { name: 'index-layout', script: 'scripts/verify-index-layout.mjs', args: [], needsServer: true },
    { name: 'smoke-tank-battle', script: 'scripts/smoke-tank-battle.mjs', args: [], needsServer: true },
    { name: 'smoke-math-rain', script: 'scripts/smoke-math-rain.mjs', args: [], needsServer: true },
    { name: 'lumen-levels', script: 'scripts/verify-lumen-levels.mjs', args: [], needsServer: false },
    { name: 'smoke-lumen', script: 'scripts/smoke-lumen.mjs', args: [], needsServer: true },
    { name: 'circuit-levels', script: 'scripts/verify-circuit-levels.mjs', args: [], needsServer: false },
    { name: 'smoke-circuit', script: 'scripts/smoke-circuit.mjs', args: [], needsServer: true },
    { name: 'silk-dew-levels', script: 'scripts/verify-silk-dew-levels.mjs', args: [], needsServer: false },
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
    { name: 'immersive', script: 'scripts/verify-immersive.mjs', args: [], needsServer: true },
    { name: 'smoke-firefly-signal', script: 'scripts/smoke-firefly-signal.mjs', args: [], needsServer: true },
];

const QUICK_NAMES = ['gen-check', 'lint', 'boot', 'chunk-isolation', 'daily', 'leaderboard', 'i18n', 'sfx', 'registry', 'index-cards', 'no-game-lang', 'lumen-levels', 'circuit-levels', 'silk-dew-levels', 'bond-forge-levels', 'echo-cave-levels', 'smoke-echo-cave', 'maxwell-demon-levels', 'smoke-maxwell-demon', 'fg-audit', 'theme', 'start-menus', 'placeholder-leak', 'chrome', 'smoke-index', 'index-layout', 'smoke-tank-battle', 'smoke-math-rain', 'smoke-lumen', 'smoke-circuit', 'smoke-silk-dew', 'smoke-bond-forge', 'crystal-bloom-levels', 'smoke-crystal-bloom', 'flame-verse-levels', 'smoke-flame-verse', 'ripple-duet-levels', 'smoke-ripple-duet', 'desktop-frame', 'firefly-signal-sim', 'immersive', 'smoke-firefly-signal'];

let suite = QUICK ? SUITE.filter(s => QUICK_NAMES.includes(s.name)) : SUITE;
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

function runStep(step, base) {
    return new Promise(resolve => {
        const t0 = Date.now();
        const args = [join(ROOT, step.script), ...step.args];
        if (step.needsServer) args.push(base);
        const child = spawn(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
        child.on('exit', code => resolve({ ...step, ok: code === 0, code, ms: Date.now() - t0 }));
        child.on('error', err => resolve({ ...step, ok: false, code: -1, ms: Date.now() - t0, error: err.message }));
    });
}

const server = BASE_URL ? null : startServer();
const base = BASE_URL || `http://127.0.0.1:${PORT}`;
let up = true;
if (!BASE_URL) {
    up = await waitForServer(base);
    if (!up) console.error(`静态服务器未能在 ${base} 就绪`);
}

const results = [];
if (up) {
    console.log(`\n== verify ${QUICK ? '(quick)' : '(full)'} @ ${base} ==`);
    for (const step of suite) {
        process.stdout.write(`\n▶ ${step.name}\n`);
        results.push(await runStep(step, base));
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
console.log(failed === 0 ? '\n全部通过 ✅' : `\n${failed} 个失败 ❌`);
process.exit(failed === 0 ? 0 : 1);
