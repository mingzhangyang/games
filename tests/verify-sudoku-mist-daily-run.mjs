#!/usr/bin/env node
// verify-sudoku-mist-daily-run.mjs — 每日计分局的跨标签页互斥与检查点（离线，无需浏览器）
//
//   ① 互斥：同名锁 ifAvailable，一个守卫拿着时另一个拿不到；释放后能拿到；同一守卫重复 acquire 直接成功
//   ② 不支持 Web Locks 的环境拒绝计分局；取消中的请求不能迟到拿锁
//   ③ 只有拿着锁才写存档；rev 每写一次 +1
//   ④ 续玩选哪份：持有原锁期间，即使存储读写同时失败，也用内存检查点；
//      放锁后被别人写过或新租约无法核对 rev 时，不采用旧检查点
//   ⑤ clear 同时清掉存储与内存检查点
//   ⑥ 强制失锁后另一标签页推进进度：旧 dirty 检查点不得通过新锁写回
//   ⑦ 强制失锁后存储没推进：dirty 检查点要校验 baseRev 并重新绑定锁（含 rev 0）
// 浏览器里的真实 Web Locks 由 smoke-sudoku-mist ⑰–⑲ 覆盖。
import { createDailyRunGuard } from '../src/games/sudoku-mist/daily-run.js';

let failed = 0;
const ok = (cond, label, extra) => {
    if (cond) { console.log(`✓ ${label}`); return; }
    failed++;
    console.error(`✗ ${label}${extra !== undefined ? ' —— ' + JSON.stringify(extra) : ''}`);
};

// 内存 localStorage（可让指定键写失败）
const store = new Map();
let failKey = null;
let failReadKey = null;
globalThis.localStorage = {
    getItem: k => {
        if (k === failReadKey) throw new Error('SecurityError');
        return store.has(k) ? store.get(k) : null;
    },
    setItem: (k, v) => { if (k === failKey) throw new Error('QuotaExceededError'); store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
};

// 最小的 Web Locks（只实现 ifAvailable 独占）
function fakeLocks() {
    const held = new Set();
    return {
        held,
        request(name, opts, cb) {
            if (held.has(name)) return Promise.resolve(cb(null));
            held.add(name);
            return Promise.resolve(cb({ name })).finally(() => held.delete(name));
        },
    };
}

const DATE = '20261019';
const RUN_KEY = `game:sudoku-mist:v1:daily-run:${DATE}`;
const stored = () => JSON.parse(store.get(RUN_KEY) || 'null');
const notes = new Uint16Array(81);
const tick = () => new Promise(r => setTimeout(r, 0));

/* ── ① 互斥 ── */
const locks = fakeLocks();
const a = createDailyRunGuard({ locks });
const b = createDailyRunGuard({ locks });
ok(await a.acquire(DATE) === true && a.holds(DATE), '① A 拿到今天的锁');
ok(await a.acquire(DATE) === true, '① A 重复 acquire 直接成功');
ok(await b.acquire(DATE) === false && !b.holds(DATE), '① A 拿着时 B 拿不到');
a.release();
await tick();
ok(!a.holds(DATE) && !locks.held.size, '① A 释放后锁空出', [...locks.held]);
ok(await b.acquire(DATE) === true, '① A 释放后 B 拿得到');
ok(await b.acquire('20261020') === true && !b.holds(DATE) && b.holds('20261020'), '① 换一天会先放开前一天的锁');
b.release();
await tick();

/* ── ② 不支持 Web Locks ── */
const bare = createDailyRunGuard({ locks: null });
ok(await bare.acquire(DATE) === false && !bare.holds(DATE) && !bare.supported, '② 没有 navigator.locks 时拒绝无锁计分');
bare.release();
let deliver;
const delayed = createDailyRunGuard({ locks: { request: (name, opts, cb) => new Promise(resolve => {
    deliver = () => resolve(cb({ name }));
}) } });
const acquiring = delayed.acquire(DATE);
delayed.release();
deliver();
ok(await acquiring === false && !delayed.holds(DATE), '② 取消后迟到的锁回调不能重新取得所有权');

// Safari can revoke a held lock on page suspension, rejecting the request promise.
let revoke;
let lost = 0;
const suspended = createDailyRunGuard({ onLost: () => lost++, locks: {
    request: (name, opts, cb) => new Promise((resolve, reject) => { revoke = reject; cb({ name }); }),
} });
await suspended.acquire(DATE);
revoke(new Error('AbortError'));
await tick();
ok(!suspended.holds(DATE) && lost === 1, '② 浏览器挂起撤销锁时立即清除所有权并通知运行时');

/* ── ③ 只有拿着锁才写 ── */
store.clear();
await a.acquire(DATE);
a.start(DATE, 42, null);
ok(a.save(DATE, { inputs: [{ type: 'hint' }], elapsed: 1000, notes }) && stored()?.rev === 1 && stored().seed === 42, '③ 拿着锁：写成 rev 1', stored());
a.save(DATE, { inputs: [{ type: 'hint' }, { type: 'hint' }], elapsed: 2000, notes });
ok(stored()?.rev === 2 && stored().inputs.length === 2, '③ 再写一次 rev 2');
ok(b.save(DATE, { inputs: [], elapsed: 0, notes }) === false && stored().rev === 2, '③ 没拿锁的守卫写不了');

/* ── ④ 续玩选哪份 ── */
failKey = RUN_KEY;
failReadKey = RUN_KEY;
ok(a.save(DATE, { inputs: [1, 2, 3].map(() => ({ type: 'hint' })), elapsed: 3000, notes }) === false, '④ 成功保存 rev 2 后，存储读写均失败');
ok(a.release() === false && a.holds(DATE), '④ 写失败时离开仍保留原锁，保护未落盘检查点');
await tick();
ok(await b.acquire(DATE) === false, '④ 另一个标签页不能接着旧存档撤销未保存输入');
const memResult = a.resumeFor(DATE);
const mem = memResult.value;
ok(memResult.ok && mem?.inputs.length === 3 && mem?.baseRev === 2 && mem?.rev === 3 && stored().inputs.length === 2,
    '④ 读写同时失败、baseRev 非零时，同一租约必须恢复 3 步内存进度',
    { steps: mem?.inputs.length, baseRev: mem?.baseRev, rev: mem?.rev });
a.start(DATE, 42, mem);
ok(a.save(DATE, { inputs: [1, 2, 3, 4].map(() => ({ type: 'hint' })), elapsed: 4000, notes }) === false && a.unsaved,
    '④ 同一租约下重新进入后还能继续累积到 4 步，不会清空未保存状态');
ok(a.release() === false && a.holds(DATE), '④ 读写未恢复前继续持锁');
// 存储恢复后先落盘再释放，另一页必须从完整的 4 步继续。
failKey = null;
failReadKey = null;
ok(a.release() === true && stored().inputs.length === 4 && stored().rev === 4,
    '④ 恢复后释放锁先补写 4 步完整检查点');
await tick();
await b.acquire(DATE);
const fromStore = b.resumeFor(DATE).value;
b.start(DATE, 42, fromStore);
b.save(DATE, { inputs: Array.from({ length: 6 }, () => ({ type: 'hint' })), elapsed: 6000, notes });
b.release();
await tick();
// A's old memory belongs to the released lease, not the newly acquired lock.
await a.acquire(DATE);
failReadKey = RUN_KEY;
const unreadable = a.resumeFor(DATE);
ok(!unreadable.ok && unreadable.value === null && stored().inputs.length === 6,
    '④ 新租约读失败必须显式拒绝，不可把旧 4 步当空存档从头开始');
failReadKey = null;
const after = a.resumeFor(DATE).value;
ok(fromStore?.inputs.length === 4 && stored().rev === 5 && after?.inputs.length === 6,
    '④ 其他标签页写过后，新租约以存储的 6 步为准，不再采用 4 步旧内存',
    { from: fromStore?.inputs.length, rev: stored().rev, after: after?.inputs.length });
// 本页续上存储那份，再写就是 rev 6
a.start(DATE, 42, after);
a.save(DATE, { inputs: Array.from({ length: 7 }, () => ({ type: 'hint' })), elapsed: 7000, notes });
ok(stored().rev === 6 && stored().inputs.length === 7, '④ 续上后接着递增 rev', stored());

/* ── ⑤ clear ── */
a.clear(DATE);
ok(stored() === null && a.resumeFor(DATE).ok && a.resumeFor(DATE).value === null,
    '⑤ clear 清掉存储与内存检查点（可读的空存档）');
a.release();


/* ── ⑥ 旧租约不能在新锁下回写过期的 dirty 检查点 ── */
const takeoverDate = '20261022';
const takeoverKey = `game:sudoku-mist:v1:daily-run:${takeoverDate}`;
store.clear();
await tick();
await a.acquire(takeoverDate);
a.start(takeoverDate, 88, null);
ok(a.save(takeoverDate, { inputs: [{ type: 'hint' }], elapsed: 1000, notes }),
    '⑥ A 的第 1 步已正常落盘');
failKey = takeoverKey;
ok(!a.save(takeoverDate, { inputs: [{ type: 'hint' }, { type: 'hint' }], elapsed: 2000, notes }),
    '⑥ A 的第 2 步未能保存，检查点处于 dirty 状态');
ok(a.release({ force: true }) && !a.holds(takeoverDate),
    '⑥ 模拟页面挂起/锁失效：即使写入失败也放开原锁');
failKey = null;
await tick();
await b.acquire(takeoverDate);
const takeoverBase = b.resumeFor(takeoverDate);
ok(takeoverBase.ok && takeoverBase.value?.inputs.length === 1, '⑥ B 在新锁下接手存储中原有的 1 步');
b.start(takeoverDate, 88, takeoverBase.value);
const bInputs = [{ type: 'hint' }, { type: 'place', cell: 12, digit: 8 }, { type: 'hint' }];
b.save(takeoverDate, { inputs: bInputs, elapsed: 5000, notes });
const winner = stored();
const beforeTakeover = JSON.stringify(store.get(takeoverKey));
b.release();
await tick();
await a.acquire(takeoverDate);
failReadKey = takeoverKey;
const rejected = a.resumeFor(takeoverDate);
const blockedStaleSave = a.save(takeoverDate, { inputs: [{ type: 'hint' }], elapsed: 9000, notes });
const releasedOld = a.release();
ok(!rejected.ok && blockedStaleSave === false && releasedOld
    && store.get(takeoverKey) === beforeTakeover && winner.rev === 2,
'⑥ 新锁读失败不能授权旧检查点：save/release 均不覆盖 B 的 3 步进度');
failReadKey = null;
await tick();
await a.acquire(takeoverDate);
const newer = a.resumeFor(takeoverDate);
ok(newer.ok && newer.value?.inputs.length === 3 && newer.value.rev === 2,
    '⑥ 存储恢复后 A 采用 B 的新版进度，舍弃自己的过期 dirty 数据');
a.start(takeoverDate, 88, newer.value);
a.save(takeoverDate, { inputs: [...bInputs, { type: 'hint' }], elapsed: 6000, notes });
ok(JSON.parse(store.get(takeoverKey)).rev === 3, '⑥ 重新绑定当前锁后才允许正常写入');
a.release();
await tick();

/* ── ⑦ 旧 dirty 内存版本未过期时必须能够恢复并重新授权 ── */
const recoveryDate = '20261023';
const recoveryKey = `game:sudoku-mist:v1:daily-run:${recoveryDate}`;
store.clear();
await a.acquire(recoveryDate);
a.start(recoveryDate, 99, null);
a.save(recoveryDate, { inputs: [{ type: 'hint' }], elapsed: 1000, notes });
failKey = recoveryKey;
const recoveryNotes = new Uint16Array(81);
recoveryNotes[4] = 1 << 5;
const dirtyInputs = [{ type: 'hint' }, { type: 'place', cell: 4, digit: 9 }, { type: 'hint' }];
a.save(recoveryDate, { inputs: dirtyInputs, elapsed: 4400, notes: recoveryNotes });
ok(a.unsaved && JSON.parse(store.get(recoveryKey)).rev === 1,
    '⑦ 失败写入后磁盘仍是 rev 1，内存比磁盘更新');
a.release({ force: true });
await tick();
failKey = null;
await a.acquire(recoveryDate);
const recovered = a.resumeFor(recoveryDate);
ok(recovered.ok && recovered.value?.rev === 2 && recovered.value?.baseRev === 1
    && recovered.value.inputs.length === 3 && recovered.value.notes[4] === 32,
    '⑦ 新锁与已保存 rev 1 一致：恢复未落盘的 3 步和笔记（rev 2）');
a.start(recoveryDate, 99, recovered.value);
ok(a.unsaved, '⑦ 重新绑定新锁后保持 dirty 标记，绝不把输入当成已保存');
a.release();
ok(JSON.parse(store.get(recoveryKey)).rev === 2
    && JSON.parse(store.get(recoveryKey)).inputs.length === 3
    && JSON.parse(store.get(recoveryKey)).notes[4] === 32,
    '⑦ 释放新锁时补写原有 3 步和笔记，保持分数所需的完整输入');
await tick();

// 从 rev 0 开始的失败首存也能恢复：磁盘确实没有旧进度才允许复用内存。
const firstSaveDate = '20261024';
const firstSaveKey = `game:sudoku-mist:v1:daily-run:${firstSaveDate}`;
await a.acquire(firstSaveDate);
a.start(firstSaveDate, 123, null);
failKey = firstSaveKey;
a.save(firstSaveDate, { inputs: [{ type: 'hint' }], elapsed: 1000, notes });
a.release({ force: true });
await tick();
failKey = null;
await a.acquire(firstSaveDate);
const recoveredZero = a.resumeFor(firstSaveDate);
ok(recoveredZero.ok && recoveredZero.value?.inputs.length === 1
    && recoveredZero.value.baseRev === 0 && store.get(firstSaveKey) === undefined,
    '⑦ 新锁确认磁盘为空 rev 0：保留第一次写入失败时的那一步');
a.start(firstSaveDate, 123, recoveredZero.value);
a.release();
ok(JSON.parse(store.get(firstSaveKey)).inputs.length === 1,
    '⑦ rev 0 的内存检查点重新绑定后可以补存');
await tick();


console.log(failed === 0 ? '\nverify-sudoku-mist-daily-run 全部通过 ✅' : `\n${failed} 个失败 ❌`);
process.exit(failed === 0 ? 0 : 1);
