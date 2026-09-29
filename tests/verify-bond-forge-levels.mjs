// verify-bond-forge-levels.mjs — bond-forge 数据层黄金断言（node 直跑，无需浏览器）
//
// 这一层是本作最容易「静默坏掉」的地方：关卡表是数据，坏一个字段不会报错，
// 只会让玩家拼出正确分子却被判错、或者永远拿不到三星。所以断言必须咬住
// **语义**而不是形状：
//
//   ① par 必须等于 solveBest 的现算值（而不是「是个数字」）
//   ② 供给必须守恒：placed + tray ⊇ 目标原子多集
//   ③ isomers 必须等于 findByComposition 的全量结果（漏列 = 欺骗性反馈）
//   ④ 每个目标分子必须能被 identify() 反查回自己
//   ⑤ ⭐ 同分异构体绝不能被判为同一分子（乙醇 vs 二甲醚）—— 本作的教学核心
//   ⑥ 每日赛程 731 天确定性 + 每关可解
import {
    LEVELS, LEVEL_COUNT, DAILY_POOL, SANDBOX_MOLECULES, levelById, levelByNo,
    DAILY_SEED_PREFIX, dailyPicks,
} from '../js/bond-forge-levels.js';
import {
    MOLECULES, ELEMENTS, validateLevelSpec, solveBest, identify,
    canonicalize, bondSignature, findByComposition,
    allowsBonds, isIonic, maxBondsOf, lonePairsOf,
} from '../js/bond-forge-molecules.js';
import { hashStringFNV, mulberry32 } from '../js/daily.js';

let passed = 0, failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; } else { failed++; console.error('  ✗ ' + msg); }
}

const inst = (symList) => symList.map((sym, i) => ({ id: i, sym, x: 0, y: 0 }));
const bondList = (bs) => bs.map(b => ({ a: b.a, b: b.b, order: b.order || 1 }));

console.log('== bond-forge-levels ==');

/* ───────── ① 关卡表形状 ───────── */
assert(LEVEL_COUNT === 20, `应为 20 关，实际 ${LEVEL_COUNT}`);
assert(new Set(LEVELS.map(l => l.id)).size === LEVEL_COUNT, '关卡 id 不得重复');
assert(LEVELS.every((l, i) => l.no === i + 1), '关卡 no 必须与顺序一致（1 起）');

/* ───────── ② 逐关语义断言 ───────── */
for (const lv of LEVELS) {
    const errs = validateLevelSpec(lv);
    assert(errs.length === 0, `${lv.id} validateLevelSpec: ${errs.join(' / ')}`);

    const t = MOLECULES[lv.target];
    assert(!!t, `${lv.id} target "${lv.target}" 必须在 MOLECULES 白名单`);
    if (!t) continue;

    // par 必须是推导值，不是手填值
    const solved = solveBest(lv);
    assert(solved.par === lv.par, `${lv.id} par=${lv.par} 应等于 solveBest 推导的 ${solved.par}`);
    assert(solved.feasible, `${lv.id} 不可解：托盘 ${solved.trayCount} 个原子，需拖 ${solved.par} 次`);
    assert(lv.par >= 1, `${lv.id} par 至少为 1（否则开局即通关）`);

    // 合成供给守恒：placed + tray ⊇ 目标原子多集
    const supply = {};
    [...(lv.placed || []), ...(lv.tray || [])].forEach(s => { supply[s] = (supply[s] || 0) + 1; });
    const need = {};
    t.atoms.forEach(s => { need[s] = (need[s] || 0) + 1; });
    const short = Object.keys(need).filter(s => (supply[s] || 0) < need[s]);
    assert(short.length === 0, `${lv.id} 供给不足：${short.map(s => `${s} ${supply[s] || 0}/${need[s]}`).join(', ')}`);

    // placed 不得含目标外元素（占画布又拼不出）
    const needSet = new Set(Object.keys(need));
    assert((lv.placed || []).every(s => needSet.has(s)), `${lv.id} placed 含目标外元素`);

    // isomers 必须是全量（漏列一个就是「拼对了却说你错」）
    const expectIso = findByComposition(t.atoms).map(m => m.id).filter(id => id !== t.id).sort();
    assert(lv.isomers.slice().sort().join(',') === expectIso.join(','),
        `${lv.id} isomers 应为 [${expectIso.join(',')}]，实为 [${lv.isomers.join(',')}]`);

    // 目标必须能被 identify 反查回自己（否则通关判定根本不成立）
    const back = identify(inst(t.atoms), bondList(t.bonds));
    assert(back && back.id === t.id, `${lv.id} identify 反查失败：期望 ${t.id}，得到 ${back ? back.id : 'null'}`);

    // 每个元素都不能超价（白名单自洽性）
    const deg = {};
    t.bonds.forEach(b => {
        const o = b.order || 1;
        deg[b.a] = (deg[b.a] || 0) + o;
        deg[b.b] = (deg[b.b] || 0) + o;
    });
    const over = Object.keys(deg).filter(i => !allowsBonds(t.atoms[i], deg[i]));
    assert(over.length === 0, `${lv.id}(${t.formula}) 超价原子：${over.map(i => `${t.atoms[i]}×${deg[i]}`).join(', ')}`);
}

/* ───────── ③ 同分异构体必须被区分 ───────── */
{
    const eth = MOLECULES['C2H6O-ethanol'];
    const ether = MOLECULES['C2H6O-dimethylether'];
    assert(!!eth && !!ether, '乙醇 / 二甲醚 都必须注册');
    if (eth && ether) {
        // 组成相同
        assert(eth.atoms.slice().sort().join('') === ether.atoms.slice().sort().join(''),
            '乙醇 / 二甲醚 组成应相同（否则测不到异构体判定）');
        // 拓扑不同 —— 这是本作最要紧的一条断言
        const sameCanon = eth.canon === ether.canon;
        const sameSign = eth.sign === ether.sign;
        assert(!(sameCanon && sameSign),
            `乙醇 / 二甲醚 被判为同一分子（canon ${sameCanon ? '相同' : '不同'} / sign ${sameSign ? '相同' : '不同'}）`);

        // 互相不能认出对方
        const asEther = identify(inst(ether.atoms), bondList(ether.bonds));
        assert(asEther && asEther.id === ether.id, `二甲醚应认出自己，得到 ${asEther ? asEther.id : 'null'}`);
        const asEth = identify(inst(eth.atoms), bondList(eth.bonds));
        assert(asEth && asEth.id === eth.id, `乙醇应认出自己，得到 ${asEth ? asEth.id : 'null'}`);
    }

    // 同分异构体的教学关：盘里原子必须一样多（否则「两种拼法」是假的）
    const pair = LEVELS.filter(l => l.id === 'bf-17-ethanol-vs-ether' || l.id === 'bf-18-dimethyl-ether');
    assert(pair.length === 2, '异构体教学关 bf-17 / bf-18 都应存在');
    if (pair.length === 2) {
        const [a, b] = pair;
        assert(JSON.stringify(a.tray.slice().sort()) === JSON.stringify(b.tray.slice().sort()),
            'bf-17 / bf-18 的托盘原子应完全相同（同盘双解才算教学）');
        assert(a.target !== b.target, 'bf-17 / bf-18 目标应不同');
    }
}

/* ───────── ④ 规范标号的**同构不变性**（穷举排列） ─────────
 *
 * ⚠️ 这条断言曾经写错，值得记下来：原版是「把 H₂O 的原子顺序重排成 [H,O,H]，
 *    断言 canon 不变」——**断言本身是错的**。重排了原子序列却把 bonds 的
 *    下标原样复用，等于换了张分子式：原来 O 连两个 H，重排后就变成
 *    id0=H 同时连 id1=O 与 id2=H，那是另一个（不存在的）分子，canon 本来
 *    就该不同。所以它一直是红的，而我一度去"修" canonicalize 里那个
 *    累积签名的真 bug（那个 bug 是真的、也修了），却没能让这条断言变绿。
 *
 *    判据必须是「**同构图 ⇒ 同 canon**」：原子重排时，键端点也要跟着重映射。
 *    下面直接把每个分子的**全部**排列都跑一遍（原子多的抽样 400 个），
 *    这比人工挑两个写法强得多：它把"同构不变性"当成一整类性质打掉，
 *    而不是逐例赌。
 */
{
    const permutations = (arr) => {
        if (arr.length <= 1) return [arr];
        const out = [];
        arr.forEach((v, i) => {
            const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
            for (const p of permutations(rest)) out.push([v, ...p]);
        });
        return out;
    };

    let canonStable = true, signStable = true, badDetail = '';

    for (const m of Object.values(MOLECULES)) {
        const n = m.atoms.length;
        const asInst = (seq) => seq.map(s => ({ id: s, sym: m.atoms[s] }));
        const asBonds = (oldToNew) => m.bonds.map(b => ({
            a: oldToNew[b.a], b: oldToNew[b.b], order: b.order || 1,
        }));

        const baseCanon = canonicalize(
            asInst([...Array(n).keys()]),
            asBonds(Object.fromEntries([...Array(n).keys()].map(i => [i, i]))),
        ).canon;

        // 原子数 ≤6 全排列；更多的抽样 400 个（9! = 362880 会跑很久）
        let perms;
        if (n <= 6) {
            perms = permutations([...Array(n).keys()]);
        } else {
            let seed = 42;
            const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
            perms = [];
            for (let t = 0; t < 400; t++) {
                const p = [...Array(n).keys()];
                for (let i = n - 1; i > 0; i--) {
                    const j = Math.floor(rnd() * (i + 1));
                    const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
                }
                perms.push(p);
            }
        }

        for (const order of perms) {
            // order[newIdx] = oldIdx
            const oldToNew = {};
            order.forEach((oldIdx, newIdx) => { oldToNew[oldIdx] = newIdx; });
            const atoms = order.map(oldIdx => ({ id: oldToNew[oldIdx], sym: m.atoms[oldIdx] }));
            const bonds = asBonds(oldToNew);

            if (canonicalize(atoms, bonds).canon !== baseCanon) {
                canonStable = false;
                badDetail = `${m.id} 排列 ${order.join(',')} 的 canon 不同`;
                break;
            }
            if (bondSignature(atoms, bonds) !== bondSignature(asInst([...Array(n).keys()]), asBonds(Object.fromEntries([...Array(n).keys()].map(i => [i, i]))))) {
                signStable = false;
                badDetail = `${m.id} 排列 ${order.join(',')} 的 sign 不同`;
                break;
            }
        }
        if (!canonStable || !signStable) break;
    }

    assert(canonStable, `同构图必须同 canon（穷举/抽样全排列）${badDetail ? ' — ' + badDetail : ''}`);
    assert(signStable, `同构图必须同 sign${badDetail ? ' — ' + badDetail : ''}`);

    // 反向：不同分子必须不同串（否则通关判定会把他们混为一谈）
    const byKey = new Map();
    let collision = '';
    for (const m of Object.values(MOLECULES)) {
        const key = m.canon + '|' + m.sign;
        if (byKey.has(key)) { collision = `${m.id} 与 ${byKey.get(key)}`; break; }
        byKey.set(key, m.id);
    }
    assert(!collision, `不同分子必须得不同 (canon,sign) 对${collision ? ' — 冲突：' + collision : ''}`);
}

/* ───────── ⑤ 元素化学自洽性 ───────── */
{
    // 价电子数与常见键数的对应（教科书值，改动即破坏性变更）
    const EXPECT = {
        H: { valence: 1, maxBonds: 1 }, C: { valence: 4, maxBonds: 4 },
        N: { valence: 5, maxBonds: 3 }, O: { valence: 6, maxBonds: 2 },
        S: { valence: 6, maxBonds: 2 }, P: { valence: 5, maxBonds: 3 },
        Cl: { valence: 7, maxBonds: 1 }, Br: { valence: 7, maxBonds: 1 },
        Na: { valence: 1, maxBonds: 0 },
    };
    for (const [sym, e] of Object.entries(EXPECT)) {
        assert(ELEMENTS[sym].valence === e.valence, `${sym} 价电子数应为 ${e.valence}`);
        assert(ELEMENTS[sym].maxBonds === e.maxBonds, `${sym} 常见键数应为 ${e.maxBonds}`);
        assert(maxBondsOf(sym) === e.maxBonds, `${sym} maxBondsOf() 应为 ${e.maxBonds}`);
    }

    // 离子键判据：NaCl 应为离子键，CH4 不是
    assert(isIonic('Na', 'Cl'), 'Na–Cl 应判为离子键（|ΔEN| > 1.7）');
    assert(!isIonic('C', 'H'), 'C–H 不应判为离子键');
    assert(!isIonic('H', 'Cl'), 'H–Cl 不应判为离子键');
    assert(MOLECULES['NaCl'].ionic, 'NaCl 白名单条目应标记 ionic');

    // 孤对电子：水 2 对、氨 1 对、甲烷 0 对
    assert(lonePairsOf('O', 2) === 2, 'O 用 2 根键 → 2 对孤对');
    assert(lonePairsOf('N', 3) === 1, 'N 用 3 根键 → 1 对孤对');
    assert(lonePairsOf('C', 4) === 0, 'C 用 4 根键 → 0 对孤对');

    // 多价态元素：S 允许 2/4/6，P 允许 3/5
    assert(allowsBonds('S', 2) && allowsBonds('S', 6), 'S 应允许 2 与 6 根键');
    assert(!allowsBonds('H', 2), 'H 不允许 2 根键');
    assert(allowsBonds('P', 5), 'P 应允许 5 根键');
}

/* ───────── ⑥ 每日赛程：731 天确定性 + 可解 ───────── */
{
    const DAY_MS = 86400000;
    const baseDay = Date.UTC(2026, 0, 1);
    const fmt = (t) => new Date(t).toISOString().slice(0, 10);

    const pool = DAILY_POOL.map(levelById).filter(Boolean);
    assert(pool.length === DAILY_POOL.length, `DAILY_POOL 有 ${DAILY_POOL.length - pool.length} 个 id 解析不到关卡`);
    assert(pool.every(l => l && l.feasible), '每日候选池里的关必须都可解');

    let dailyOk = true, why = '';
    for (let i = 0; i < 731; i++) {
        const key = fmt(baseDay + i * DAY_MS);
        // 与运行时同一口径：FNV-1a 哈希 → mulberry32 → dailyPicks，
        // 前缀也从 levels 模块 import（不允许此处手写字面量）
        const rng = mulberry32(hashStringFNV(DAILY_SEED_PREFIX + key));
        const picksA = dailyPicks(rng, DAILY_POOL, 5);
        const rng2 = mulberry32(hashStringFNV(DAILY_SEED_PREFIX + key));
        const picksB = dailyPicks(rng2, DAILY_POOL, 5);

        if (JSON.stringify(picksA) !== JSON.stringify(picksB)) {
            dailyOk = false; why = `${key} 每日选题不确定`; break;
        }
        if (picksA.length !== 5) { dailyOk = false; why = `${key} 选出 ${picksA.length} 关（应为 5）`; break; }
        if (new Set(picksA).size !== 5) { dailyOk = false; why = `${key} 选出重复关卡`; break; }

        const resolved = picksA.map(levelById);
        if (resolved.some(l => !l)) { dailyOk = false; why = `${key} 选到不存在的关卡`; break; }
        if (resolved.some(l => !l.feasible)) { dailyOk = false; why = `${key} 选到不可解的关卡`; break; }
    }
    assert(dailyOk, `每日赛程 731 天全部通过（确定性/5 关/无重复/可解）${why ? ' — ' + why : ''}`);

    // 选题确实会随日期变化（否则每天都是同 5 关）
    const distinct = new Set();
    for (let i = 0; i < 60; i++) {
        const key = fmt(baseDay + i * DAY_MS);
        distinct.add(dailyPicks(mulberry32(hashStringFNV(DAILY_SEED_PREFIX + key)), DAILY_POOL, 5).join(','));
    }
    assert(distinct.size > 1, '每日选题应随日期变化（60 天内至少两种组合）');
}

/* ───────── ⑦ 沙盒 / 取关工具 ───────── */
{
    assert(SANDBOX_MOLECULES.length >= 15, `沙盒分子应有 15 个以上，实际 ${SANDBOX_MOLECULES.length}`);
    assert(SANDBOX_MOLECULES.every(id => !!MOLECULES[id]), '沙盒分子必须全部在白名单里');
    assert(new Set(SANDBOX_MOLECULES).size === SANDBOX_MOLECULES.length, '沙盒分子不得重复');
    assert(levelById('bf-01-water') === LEVELS[0], 'levelById 应取到第一关');
    assert(levelByNo(1) === LEVELS[0], 'levelByNo(1) 应取到第一关');
    assert(levelByNo(999) === null, 'levelByNo 越界应返回 null');
    assert(levelById('nope') === null, 'levelById 未知 id 应返回 null');

    // 每个白名单分子都必须能在沙盒里独立搭出来（供给检查）
    for (const id of SANDBOX_MOLECULES) {
        const m = MOLECULES[id];
        const solved = solveBest({ target: id, tray: m.atoms, placed: [] });
        assert(solved.feasible, `沙盒分子 ${id} 用自身原子应可解（par=${solved.par}）`);
    }
}

/* ───────── 结果 ───────── */
console.log(`bond-forge-levels: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
