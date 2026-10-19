/**
 * 每日计分局的跨标签页互斥 + 进度检查点（设计 §16）。
 * ===========================================================================
 * 互斥用浏览器自带的 Web Locks（navigator.locks）：进入今天的计分局前独占锁
 * `sudoku-mist:daily:<YYYYMMDD>`，离开（回菜单 / 完成 / 开别的局）时释放；
 * 未落盘的检查点会保留锁直到重试成功；关页、崩溃时浏览器自动释放。拿不到锁 = 另一个标签页正在这局里，本页不进。
 * 所以任何时刻最多一个标签页在写这局的进度——不需要令牌、接手、让出。
 * 不支持 Web Locks 的环境拒绝计分局，不能用无锁降级破坏计分与存档唯一性。
 *
 * 检查点带递增的 rev。本页内存里留一份最近的检查点（存储写失败时它才是对的）；
 * 原 Web Lock 没释放时，内存检查点是权威数据：存储读取失败也不能丢掉它。
 * 释放后重新获得的是新租约，必须验证存储 rev 才能重用旧内存检查点，
 * 以免另一标签页的进度被旧数据覆盖。
 */
import { loadDailyRun, saveDailyRun, clearDailyRun } from './storage.js';

const lockName = dateKey => `sudoku-mist:daily:${dateKey}`;

export function createDailyRunGuard({ locks = globalThis.navigator?.locks, onLost = () => {} } = {}) {
    let generation = 0;
    const supported = typeof locks?.request === 'function';
    let held = null;       // { dateKey, release }
    let checkpoint = null; // { dateKey, seed, rev, baseRev, inputs, elapsed, notes }
    let checkpointLease = null; // Web Lock holder that created the in-memory checkpoint

    /** 独占今天这局；已经拿着就直接成功。拿不到（别的标签页拿着）返回 false */
    function acquire(dateKey) {
        if (held?.dateKey === dateKey) return Promise.resolve(true);
        if (!release()) return Promise.resolve(false);
        if (!supported) return Promise.resolve(false);
        const request = generation;
        return new Promise(resolve => {
            let owner = null;
            locks.request(lockName(dateKey), { ifAvailable: true }, lock => {
                if (!lock || request !== generation) { resolve(false); return undefined; }
                // 回调返回的 promise 不结束，锁就一直拿着；release() 让它结束
                return new Promise(done => {
                    owner = { dateKey, release: done };
                    held = owner;
                    resolve(true);
                });
            }).catch(() => {
                // WebKit can revoke a held lock when suspending the page/BFCache.
                // Never let the restored document keep its stale writable ownership.
                if (owner && held === owner) { held = null; onLost(); }
                resolve(false);
            });
        });
    }

    function release({ force = false } = {}) {
        generation++;
        // 未落盘的检查点仍属于本页。释放前重试；失败时保留锁，避免另一页
        // 接着旧存档游玩，撤销本页已经发生的失误 / 点灯 / 完成。
        if (held && checkpoint?.dateKey === held.dateKey && checkpoint.rev !== checkpoint.baseRev) {
            if (saveDailyRun(checkpoint.dateKey, checkpoint)) checkpoint = { ...checkpoint, baseRev: checkpoint.rev };
            else if (!force) return false;
        }
        const h = held;
        held = null;
        h?.release();
        return true;
    }

    /** 续玩用哪份进度：内存检查点（期间没人写过存储）或存储里的 */
    function resumeFor(dateKey) {
        const mem = checkpoint?.dateKey === dateKey ? checkpoint : null;
        // No other ranked writer can have touched this run while OUR original
        // lock remains held. A failed localStorage read looks like a missing
        // checkpoint; it must not discard newer, memory-only ranked inputs.
        if (mem && held?.dateKey === dateKey && checkpointLease === held) return mem;
        const stored = loadDailyRun(dateKey);
        // After releasing/reacquiring a lock, memory is no longer authoritative.
        // Require an actual stored revision match (null can mean a read error).
        if (mem && stored?.rev === mem.baseRev) return mem;
        return stored;
    }

    /** 开始 / 续上这局：记下起点 rev（之后每次存档 +1） */
    function start(dateKey, seed, resume) {
        const base = resume && resume === checkpoint ? checkpoint.baseRev : (loadDailyRun(dateKey)?.rev ?? 0);
        checkpoint = {
            dateKey, seed, baseRev: base, rev: resume?.rev ?? base,
            inputs: resume?.inputs ?? [], elapsed: resume?.elapsed ?? 0, notes: resume?.notes ?? null,
        };
        checkpointLease = held?.dateKey === dateKey ? held : null;
    }

    /** 存一次检查点（只有拿着锁的标签页写）；返回存储有没有写成，内存检查点总会更新 */
    function save(dateKey, { inputs, elapsed, notes }) {
        if (held?.dateKey !== dateKey || checkpoint?.dateKey !== dateKey) return false;
        const rev = checkpoint.rev + 1;
        const ok = saveDailyRun(dateKey, { seed: checkpoint.seed, rev, inputs, elapsed, notes });
        checkpoint = { ...checkpoint, rev, baseRev: ok ? rev : checkpoint.baseRev, inputs, elapsed, notes: Array.from(notes) };
        return ok;
    }

    function clear(dateKey) {
        clearDailyRun(dateKey);
        if (checkpoint?.dateKey === dateKey) {
            checkpoint = null;
            checkpointLease = null;
        }
    }

    return { supported, get unsaved() { return !!checkpoint && checkpoint.rev !== checkpoint.baseRev; },
        acquire, release, holds: dateKey => held?.dateKey === dateKey, resumeFor, start, save, clear };
}
