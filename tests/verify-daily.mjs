#!/usr/bin/env node
// verify-daily.mjs — js/daily.js 唯一日期/哈希口径回归防线（P2-3）
//
// 三层断言：
//   1) 矩阵真实性：三时区（America/New_York / Asia/Shanghai / Pacific/Auckland）
//      子进程内本地时间串互不相同——若 TZ 环境变量未生效，报环境错误而非静默假绿。
//   2) 行为：冻结 Date 后调无参 todayKey/todayKeyDisplay/dailyKey，跨时区结果一致；
//      显式时刻断言 UTC 16:00 跨日翻转点；黄金哈希值防算法漂移（FNV-1a / 自研
//      hashString / mulberry32 任一改动都会让已发布的每日序列变脸）。
//   3) 收敛：5 个游戏文件均 import ./daily.js，且 js/ 下除 daily.js 外不再存在
//      哈希常数、getTimezoneOffset( 调用（防复制粘贴复活）。
//
// 用法：node scripts/verify-daily.mjs

import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;

// 时区矩阵：UTC-5 / UTC+8 / UTC+13（覆盖西半球、本地口径、最东断日线）
const TIMEZONES = ['America/New_York', 'Asia/Shanghai', 'Pacific/Auckland'];

// 冻结时刻：2026-01-01T16:00:00Z = UTC+8 的 2026-01-02 00:00:00（纽约 11:00 / 奥克兰 05:00）
const FROZEN_MS = Date.UTC(2026, 0, 1, 16, 0, 0);

const DAILY_JS = join(ROOT, 'js', 'daily.js');
const DAILY_SRC = readFileSync(DAILY_JS, 'utf8');
if (!DAILY_SRC.includes('export function todayKey')) {
    console.error('✗ js/daily.js 缺少 todayKey 导出——文件被改名/移动？');
    process.exit(1);
}

/* ─────────────── 子进程：冻结 Date + 行为断言 ─────────────── */

const CHILD_SRC = String.raw`
import { todayKey, todayKeyDisplay, dailyKey, hashString, hashStringFNV, mulberry32, msUntilNextDay } from ${JSON.stringify(pathToFileURL(DAILY_JS).href)};

const FROZEN = ${FROZEN_MS};
// 冻结 Date：无参构造/now() 返回 FROZEN，显式参数原样放行（防实现偷用 new Date() 绕过口径）
const RealDate = Date;
class FrozenDate extends RealDate {
    constructor(...args) { args.length === 0 ? super(FROZEN) : super(...args); }
    static now() { return FROZEN; }
}
globalThis.Date = FrozenDate;

let failed = 0;
function ok(cond, label, extra) {
    if (cond) { console.log('  ✓ ' + label); return; }
    failed++;
    console.error('  ✗ ' + label + (extra ? ' —— got: ' + extra : ''));
}

// 0) 环境真实性：本进程本地时区与冻结时刻的本地表示（父进程比对矩阵）
const localStr = new Date(FROZEN).toString();
console.log('LOCAL\t' + process.env.TZ + '\t' + localStr);

// 1) 无参调用（冻结时刻）——若实现误用本地时区，非 UTC+8 时区下必炸
ok(todayKey() === '20260102', 'todayKey() 冻结时刻 = 20260102', todayKey());
ok(todayKeyDisplay() === '2026-01-02', 'todayKeyDisplay() = 2026-01-02', todayKeyDisplay());
ok(dailyKey('sword-flight') === 'sword-flight-d20260102',
    "dailyKey('sword-flight') = sword-flight-d20260102", dailyKey('sword-flight'));
ok(dailyKey('gravity') === 'gravity-d20260102',
    "dailyKey('gravity') = gravity-d20260102", dailyKey('gravity'));

// 2) 显式时刻：UTC 16:00 跨日翻转点（不依赖冻结）
ok(todayKey(${Date.UTC(2026, 0, 1, 15, 59, 59, 999)}) === '20260101',
    'UTC 15:59:59.999 → 20260101', todayKey(${Date.UTC(2026, 0, 1, 15, 59, 59, 999)}));
ok(todayKey(${Date.UTC(2026, 0, 1, 16, 0, 0, 0)}) === '20260102',
    'UTC 16:00:00.000 → 20260102', todayKey(${Date.UTC(2026, 0, 1, 16, 0, 0, 0)}));
ok(todayKeyDisplay(${Date.UTC(2026, 0, 1, 16, 0, 0)}) === '2026-01-02',
    'todayKeyDisplay 翻转点 = 2026-01-02');

// 2.5) 倒计时：距下一个 UTC+8 午夜。
//      历史 bug：调用方写成 todayKeyDisplay(now + 8h + 24h)，而该函数内部本来就加 8h，
//      实际取的是 now+40h 的日期 —— UTC+8 16:00 之后整整多报 24 小时
//      （实测 18:00 显示 30:00:00、23:00 显示 25:00:00）。下面这些时刻正是当年翻车的区间。
//      ⚠ 本段处在 String.raw 子进程源码里：反引号与模板插值占位符都会被父进程吃掉，
//        所以这里一律用字符串拼接（父进程有意注入的常量除外）。
const H = 3600000;
const DAY0 = ${Date.UTC(2026, 5, 10)};
const CASES = [[0, 24], [8, 16], [12, 12], [15, 9], [16, 8], [18, 6], [23, 1]];
for (const pair of CASES) {
    const hh = pair[0], wantH = pair[1];
    // 构造 UTC+8 当日 hh:00 —— UTC 小时 = hh - 8
    const got = msUntilNextDay(DAY0 + (hh - 8) * H);
    ok(got === wantH * H,
        'msUntilNextDay @UTC+8 ' + String(hh).padStart(2, '0') + ':00 = ' + wantH + 'h',
        (got / H).toFixed(2) + 'h');
}
// 跨日瞬间
ok(msUntilNextDay(${Date.UTC(2026, 5, 9, 16, 0, 0)} + 1) === 24 * H - 1, '午夜后 1ms -> 24h-1ms');
ok(msUntilNextDay(${Date.UTC(2026, 5, 10, 16, 0, 0)} - 1) === 1, '午夜前 1ms -> 1ms');

// 3) 黄金哈希值（算法漂移即断言失败——已发布每日内容序列不容改变）
ok(hashStringFNV('20260102') === 2449071838,
    "hashStringFNV('20260102') = 2449071838", hashStringFNV('20260102'));
ok(hashString('20260102') === 1122987212,
    "hashString('20260102') = 1122987212", hashString('20260102'));
const rFNV = mulberry32(hashStringFNV('20260102'));
const seqFNV = [rFNV(), rFNV(), rFNV()].map(x => x.toFixed(10)).join(',');
ok(seqFNV === '0.7481171531,0.5107306649,0.1503341298',
    'mulberry32(FNV(20260102)) 序列黄金值', seqFNV);
const rSeed = mulberry32(20260102);
const seqSeed = [rSeed(), rSeed(), rSeed()].map(x => x.toFixed(10)).join(',');
ok(seqSeed === '0.1574699767,0.8108199819,0.0986320470',
    'mulberry32(20260102) 序列黄金值', seqSeed);

process.exit(failed === 0 ? 0 : 1);
`;

function runChild(tz) {
    const res = spawnSync(node, ['--input-type=module', '-e', CHILD_SRC], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, TZ: tz },
        timeout: 30000,
    });
    return res;
}

/* ─────────────── 父进程：时区矩阵 + 静态收敛断言 ─────────────── */

let failed = 0;
const okp = (cond, label, extra) => {
    if (cond) { console.log(`✓ ${label}`); return; }
    failed++;
    console.error(`✗ ${label}${extra ? ' —— ' + extra : ''}`);
};

const localRows = [];
for (const tz of TIMEZONES) {
    process.stdout.write(`\n▶ TZ=${tz}\n`);
    const res = runChild(tz);
    if (res.status !== 0) {
        failed++;
        console.error(`  ✗ 子进程失败（code=${res.status}）`);
        if (res.stderr) console.error(res.stderr.trim());
        if (res.stdout) console.log(res.stdout.trim());
        continue;
    }
    const m = String(res.stdout).match(/^LOCAL\t(.*)\t(.*)$/m);
    localRows.push({ tz, str: m ? m[2] : '' });
    console.log(String(res.stdout).replace(/^LOCAL.*$/m, '').trim());
}

console.log('\n▶ 时区矩阵真实性');
const distinct = new Set(localRows.map(r => r.str));
okp(localRows.length === TIMEZONES.length, '三个时区子进程全部通过');
okp(distinct.size === TIMEZONES.length,
    '三时区本地时间串互不相同（TZ 矩阵真实生效）',
    distinct.size === 1 ? '全部相同——TZ 环境变量未生效，测试环境问题' : [...distinct].join(' | '));

console.log('\n▶ 源码收敛（防复制粘贴复活）');
const GAME_FILES = ['planet-merge', 'word-daily', 'gravity-slingshot', 'sword-flight', 'needle-awn'];
okp(!/function msUntilNextDay/.test(readFileSync(join(ROOT, 'js', 'word-daily.js'), 'utf8')),
    'word-daily.js 不再自带 msUntilNextDay（收敛到 daily.js）');
for (const g of GAME_FILES) {
    const p = join(ROOT, 'js', `${g}.js`);
    const src = readFileSync(p, 'utf8');
    okp(src.includes("from './daily.js'"), `${g}.js import ./daily.js`);
}
for (const f of readdirSync(join(ROOT, 'js')).filter(f => f.endsWith('.js'))) {
    if (f === 'daily.js') continue;
    const src = readFileSync(join(ROOT, 'js', f), 'utf8');
    okp(!/3432918353|16777619/.test(src), `${f} 无哈希常数（收敛到 daily.js）`);
    okp(!/getTimezoneOffset\(/.test(src), `${f} 无 getTimezoneOffset 调用`);
}

console.log(failed === 0 ? '\nverify-daily 全部通过 ✅' : `\n${failed} 个失败 ❌`);
process.exit(failed === 0 ? 0 : 1);
