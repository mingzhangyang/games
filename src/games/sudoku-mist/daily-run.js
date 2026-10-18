/**
 * 每日计分局的跨标签页互斥 + 进度检查点（设计 §16）。
 * ===========================================================================
 * 互斥用浏览器自带的 Web Locks（navigator.locks）：进入今天的计分局前独占锁
 * `sudoku-mist:daily:<YYYYMMDD>`，离开（回菜单 / 完成 / 开别的局）时释放；
 * 关页、崩溃时浏览器自动释放。拿不到锁 = 另一个标签页正在这局里，本页不进。
 * 所以任何时刻最多一个标签页在写这局的进度——不需要令牌、接手、让出。
 * 不支持 Web Locks 的环境（极老的浏览器）退化为不加锁，即单标签页行为。
 *
 * 检查点带递增的 rev。本页内存里留一份最近的检查点（存储写失败时它才是对的）；
 * 再进这局时，只有存储的 rev 还等于本页最后一次读到 / 写成的 rev（期间没有别的标签页写过），
 * 才用内存这份，否则以存储为准。
 */
import { loadDailyRun, saveDailyRun, clearDailyRun } from './storage.js';

const lockName = dateKey => `sudoku-mist:daily:${dateKey}`;

export function createDailyRunGuard({ locks = globalThis.navigator?.locks } = {}) {
    let held = null;       // { dateKey, release }
    let checkpoint = null; // { dateKey, seed, rev, baseRev, inputs, elapsed, notes }

    /** 独占今天这局；已经拿着就直接成功。拿不到（别的标签页拿着）返回 false */
    function acquire(dateKey) {
        if (held?.dateKey === dateKey) return Promise.resolve(true);
        release();
        if (typeof locks?.request !== 'function') {
            held = { dateKey, release() {} };
            return Promise.resolve(true);
        }
        return new Promise(resolve => {
            locks.request(lockName(dateKey), { ifAvailable: true }, lock => {
                if (!lock) { resolve(false); return undefined; }
                // 回调返回的 promise 不结束，锁就一直拿着；release() 让它结束
                return new Promise(done => { held = { dateKey, release: done }; resolve(true); });
            }).catch(() => resolve(false));
        });
    }

    function release() {
        const h = held;
        held = null;
        h?.release();
    }

    /** 续玩用哪份进度：内存检查点（期间没人写过存储）或存储里的 */
    function resumeFor(dateKey) {
        const stored = loadDailyRun(dateKey);
        const mem = checkpoint?.dateKey === dateKey ? checkpoint : null;
        if (mem && (stored?.rev ?? 0) === mem.baseRev) return mem;
        return stored;
    }

    /** 开始 / 续上这局：记下起点 rev（之后每次存档 +1） */
    function start(dateKey, seed, resume) {
        const base = resume && resume === checkpoint ? checkpoint.baseRev : (loadDailyRun(dateKey)?.rev ?? 0);
        checkpoint = {
            dateKey, seed, baseRev: base, rev: resume?.rev ?? base,
            inputs: resume?.inputs ?? [], elapsed: resume?.elapsed ?? 0, notes: resume?.notes ?? null,
        };
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
        if (checkpoint?.dateKey === dateKey) checkpoint = null;
    }

    return { acquire, release, holds: dateKey => held?.dateKey === dateKey, resumeFor, start, save, clear };
}
