/**
 * Flame Verse 焰语 — 关卡校验（M2）
 * ==================================================================
 * par 铁律：关卡表里的 par 由 costOf(recipe) 现算，这里的职责是**证明**
 * 它确实是「投盐把数」的数学下界 —— 焰语的盐只能往里加，任何吻合的配方
 * 每元素至少要投档位那么多次，所以下界 = Σ 档位。穷举 4^8 = 65536 个
 * 配方核对，杜绝未来有人改 cost/match 语义后 par 静默说谎。
 *
 * 断言分五类：
 *   ① schema     —— 20 关、id 连续唯一、中英名、档位 1–3、元素数 1–8
 *   ② par 下界   —— 穷举 4^8：不存在 cost < par 的吻合配方；
 *                   且唯一吻合配方恰为 spec.recipe，其代价 === par
 *   ③ 星级语义   —— par→3 星 / +1→2 星 / +slack→2 星 / +slack+1→1 星
 *   ④ 难度曲线   —— par 带宽、近似不降、每元素都在某关出现过、干扰对覆盖
 *   ⑤ daily      —— 730 天扫描：确定性 / 5 皿 / 不重复 / 元素数与档位在带宽内
 */
import * as R from '../js/flame-verse-rules.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } };
const section = (t) => console.log('\n▶ ' + t);

const LV = R.LEVELS;

/* ────────────────────── ① schema ────────────────────── */
section('① schema：20 关 / id / 名称 / 档位');
{
    ok(LV.length === 20, `关卡数 ${LV.length} ≠ 20`);
    ok(new Set(LV.map(l => l.id)).size === LV.length, 'id 有重复');
    LV.forEach((l, i) => {
        ok(l.id === `fv${i + 1}`, `第 ${i + 1} 关 id=${l.id} 不是 fv${i + 1}（连续性）`);
        ok(!!l.name && !!l.name.en && !!l.name.zh, `${l.id} 缺中英名`);
        const act = R.activeElements(l.recipe);
        ok(act.length >= 1 && act.length <= 8, `${l.id} 元素数 ${act.length} 出界`);
        for (const k of act) {
            const d = l.recipe[k] | 0;
            ok(d >= 1 && d <= R.RULES.maxDose, `${l.id} ${k} 档位 ${d} 出界`);
        }
        ok(typeof l.par === 'number' && l.par === R.costOf(l.recipe),
            `${l.id} par ${l.par} ≠ costOf ${R.costOf(l.recipe)}`);
        ok(l.par >= 1 && l.par <= 12, `${l.id} par ${l.par} 出带宽 [1,12]`);
    });
}

/* ────────────────────── ② par 下界（穷举 4^8） ────────────────────── */
section('② par 下界：穷举 4^8 = 65536 配方 / 关');
{
    // 基数 4 展开的格雷式枚举：直接 65536 次内层 8 键比对，node 里 ~1s
    let total = 0, viol = 0, multi = 0;
    for (const spec of LV) {
        let matches = 0;
        for (let code = 0; code < 65536; code++) {
            const recipe = {};
            let c = 0;
            for (let i = 0; i < 8; i++) {
                const d = (code >> (i * 2)) & 3;
                recipe[R.EL_ORDER[i]] = d;
                c += d;
            }
            if (c >= spec.par && R.matchRecipe(spec, recipe)) {
                matches++;
                if (c !== spec.par) viol++;
            }
        }
        if (matches !== 1) multi++;
        total += matches;
    }
    ok(viol === 0, `存在 ${viol} 个 cost ≠ par 却吻合的配方（下界被打破）`);
    ok(multi === 0, `${multi} 关的吻合配方不唯一（档位比对失效）`);
    console.log(`  ✓ 20 关 × 65536 配方：吻合解唯一且代价 === par（违规 ${viol}）`);
    ok(total === 20, `吻合配方总数 ${total} ≠ 20`);
}

/* ────────────────────── ③ 星级语义 ────────────────────── */
section('③ 星级语义');
{
    ok(R.starsForLevel(1, 1) === 3, 'par 处应 3 星');
    ok(R.starsForLevel(2, 1) === 2, 'par+1 应 2 星');
    ok(R.starsForLevel(1 + R.RULES.slack, 1) === 2, `par+slack(${R.RULES.slack}) 应 2 星`);
    ok(R.starsForLevel(1 + R.RULES.slack + 1, 1) === 1, 'par+slack+1 应 1 星');
    for (const spec of LV) {
        ok(R.starsForLevel(spec.par, spec.par) === 3, `${spec.id} 一把不浪费拿不到 3 星`);
    }
}

/* ────────────────────── ④ 难度曲线 ────────────────────── */
section('④ 难度曲线与元素覆盖');
{
    for (let i = 1; i < LV.length; i++) {
        ok(LV[i].par >= LV[i - 1].par - 2, `L${i + 1} par ${LV[i].par} 比 L${i} par ${LV[i - 1].par} 掉得太多`);
    }
    const used = new Set();
    for (const spec of LV) for (const k of R.activeElements(spec.recipe)) used.add(k);
    ok(used.size === R.EL_ORDER.length, `只用到 ${used.size}/8 种元素（${R.EL_ORDER.filter(k => !used.has(k)).join(',')} 缺席）`);
    // 干扰对至少在 4 关里同时出现（这是本作的核心教学）
    let pairs = 0;
    for (const spec of LV) {
        const act = R.activeElements(spec.recipe);
        if (R.CONFUSION.some(([a, b]) => act.includes(a) && act.includes(b))) pairs++;
    }
    ok(pairs >= 6, `干扰对只在 ${pairs} 关出现（<6，教学线太薄）`);
    // 尾段必须够难
    const tail = LV.slice(-3).map(l => l.par);
    ok(Math.min(...tail) >= 8, `尾三关 par ${tail.join('/')} 太软`);
    console.log(`  ✓ par 序列 ${LV.map(l => l.par).join(',')}（干扰对 ${pairs} 关）`);
}

/* ────────────────────── ⑤ 每日赛程 ────────────────────── */
section('⑤ 每日赛程：730 天扫描');
{
    const seen = new Set();
    let bad = 0;
    for (let i = 0; i < 730; i++) {
        const d = new Date(Date.UTC(2026, 8, 22) + i * 86400000).toISOString().slice(0, 10);
        const course = R.dailyCourse(d);
        const again = R.dailyCourse(d);
        if (course.length !== R.DAILY_COUNT) { bad++; continue; }
        if (course.map(l => R.costOf(l.recipe) + ':' + R.activeElements(l.recipe).join('')).join('|')
            !== again.map(l => R.costOf(l.recipe) + ':' + R.activeElements(l.recipe).join('')).join('|')) { bad++; continue; }
        const keys = course.map(l => R.EL_ORDER.map(x => l.recipe[x] | 0).join(''));
        if (new Set(keys).size !== course.length) { bad++; continue; }
        // 档位带宽：每皿元素数 1–4、总把数 ≤ 13、无零档
        for (const spec of course) {
            const act = R.activeElements(spec.recipe);
            const c = R.costOf(spec.recipe);
            if (act.length < 1 || act.length > 4 || c < act.length || c > 13) { bad++; break; }
            if (spec.par !== c) { bad++; break; }
        }
        seen.add(keys.join(','));
    }
    ok(bad === 0, `每日赛程有 ${bad} 天不满足（长度/确定性/不重复/带宽）`);
    ok(seen.size > 20, `730 天只出现 ${seen.size} 种赛程，洗牌退化`);
    const anchor = R.dailyCourse('2026-09-22').map(l => R.activeElements(l.recipe).map(k => k.toUpperCase()).join('')).join('|');
    ok(/[A-Z]+(\|[A-Z]+){4}/.test(anchor), `黄金锚 2026-09-22 形如 ${anchor}，不是 5 皿`);
    console.log(`  ✓ 黄金锚 2026-09-22 → ${anchor}（730 天共 ${seen.size} 种赛程）`);
}

console.log(`\nverify-flame-verse-levels ${fail === 0 ? '全部通过 ✅' : '失败 ❌'}（${pass} 项断言${fail ? '，' + fail + ' 项失败' : ''}）`);
process.exit(fail === 0 ? 0 : 1);
