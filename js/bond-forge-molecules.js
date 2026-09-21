/**
 * 键合工坊 Bond Forge — 化学内核（纯模块，零 DOM 依赖）
 * ======================================================
 * 本文件是**运行时与校验器共用的唯一真源**：
 *   - js/bond-forge.js        → 渲染原子 / 判定成键 / 通关
 *   - js/bond-forge-levels.js → 组织关卡与每日赛程
 *   - scripts/verify-bond-forge-levels.mjs → 逐关验证（par 可达性、满星路径）
 *
 * ⚠️ 三条铁律（docs/proposal-bond-forge.md §2.5 / §3.3）：
 *   1. **分子判定绝不用字符串比较**。必须走 `canonicalize()` 的规范标号 ——
 *      否则同分异构体（乙醇 vs 二甲醚，都是 C₂H₆O）会被误判为「错」。
 *      运行时与校验器**共用同一份实现**，不允许各自实现一遍。
 *   2. **par 是推导出来的，不是手填的**。`solveBest()` 用 BFS 反推最优拖拽数，
 *      校验器断言 `bestDrags <= par`。手填估计值必然与真实可达解脱节。
 *   3. **价键与键角是查表，不是猜**。VSEPR 理想角随配位数固定（2→180°、
 *      3→120°、4→109.5°；孤对电子压缩 → H₂O 104.5°、NH₃ 107°）。
 *
 * 坐标口径：逻辑画布 520×680（与 games.config.json 的 stage 一致）。
 */

/* ────────────────────────── 画幅 ────────────────────────── */

export const STAGE = { w: 520, h: 680 };

/** 原子盘（底部原子托盘）的几何。原子从盘里拖出，盘本身不参与成键。 */
export const TRAY = {
    /** 盘的纵向位置 */
    y: 636,
    /** 每个槽位中心距 */
    slot: 58,
    /** 槽位视觉半径（比原子本体略大，示意「这里有个坑」） */
    slotR: 24,
    /** 最多放几个槽位（再多就换行/收缩间距） */
    maxSlots: 8,
};

/* ────────────────────────── 元素表 ──────────────────────────
 * 9 种元素。字段口径：
 *   symbol  元素符号（展示与 i18n 键）
 *   nameEn / nameZh  元素中文名（元素小抄卡用；zh 名必须准确）
 *   valence 价电子数（最外层电子数）
 *   maxBonds 常见最大成键数（H=1、C=4、N=3、O=2、Cl/Br=1、P=3|5、S=2|4|6）
 *            —— 数值型取最常用值；多价态元素把全部合法值放进 bondOrders
 *   bondOrders 该元素允许的键数集合（校验「能不能再成一根键」用的就是它）
 *   radius  逻辑像素半径（视觉 + 键长计算）
 *   en      电负性（Pauling）；|ΔEN| > 1.7 判离子键
 *   color   球体主色（**非** p3-token-swap MAP 里的 11 个值 —— 那些在 CSS 里
 *           必须写 var(--tok-*)，但这里是画在 canvas 上的，不受扫描域约束）
 *   label   符号文字颜色（按球体明度选深/浅，保证对比度）
 *
 * ⚠️ 数据来源：价电子数与电负性取教科书值。改动任何一个都会改变
 *    canonicalize 的判定与已发布关卡的解法，属**破坏性变更**。
 */
export const ELEMENTS = {
    H: { symbol: 'H', nameEn: 'Hydrogen', nameZh: '氢', valence: 1, maxBonds: 1, bondOrders: [1], radius: 14, en: 2.20, color: '#e8ecff', label: '#1b2138' },
    C: { symbol: 'C', nameEn: 'Carbon', nameZh: '碳', valence: 4, maxBonds: 4, bondOrders: [4], radius: 22, en: 2.55, color: '#4a5568', label: '#e8ecff' },
    N: { symbol: 'N', nameEn: 'Nitrogen', nameZh: '氮', valence: 5, maxBonds: 3, bondOrders: [3], radius: 20, en: 3.04, color: '#5b8dee', label: '#0b1020' },
    O: { symbol: 'O', nameEn: 'Oxygen', nameZh: '氧', valence: 6, maxBonds: 2, bondOrders: [2], radius: 19, en: 3.44, color: '#ff6b7a', label: '#3d0d13' },
    S: { symbol: 'S', nameEn: 'Sulfur', nameZh: '硫', valence: 6, maxBonds: 2, bondOrders: [2, 4, 6], radius: 24, en: 2.58, color: '#ffd34d', label: '#3a2c05' },
    P: { symbol: 'P', nameEn: 'Phosphorus', nameZh: '磷', valence: 5, maxBonds: 3, bondOrders: [3, 5], radius: 24, en: 2.19, color: '#ff9f43', label: '#3a2205' },
    Cl: { symbol: 'Cl', nameEn: 'Chlorine', nameZh: '氯', valence: 7, maxBonds: 1, bondOrders: [1], radius: 21, en: 3.16, color: '#34d399', label: '#03251a' },
    Br: { symbol: 'Br', nameEn: 'Bromine', nameZh: '溴', valence: 7, maxBonds: 1, bondOrders: [1], radius: 23, en: 2.96, color: '#c026d3', label: '#2b0430' },
    Na: { symbol: 'Na', nameEn: 'Sodium', nameZh: '钠', valence: 1, maxBonds: 0, bondOrders: [0], radius: 26, en: 0.93, color: '#a78bfa', label: '#1d1236' },
};

/* ────────────────────────── 成键几何常量 ────────────────────────── */

export const BOND = {
    /** 吸附半径：拖到对方这个距离内就尝试成键。
     *  ⚠️ 刻意宽松（提案 §7「判定过严」的对策）：宁可多吸一次、也不让玩家
     *  觉得「明明碰到了却没反应」。 */
    snapR: 26,
    /** 预览环半径：拖拽中在候选人身上画提示环 */
    previewR: 40,
    /** 键长 = rA + rB + gap（成键后几何松弛的目标长度） */
    gap: 16,
    /** 非法成键时的弹回动画时长（秒） */
    rejectMs: 0.22,
    /** 非法抖动：3 次 ±4px */
    shakeCount: 3,
    shakePx: 4,
    /** 离子键判据：|ΔEN| > ionicThreshold */
    ionicThreshold: 1.7,
    /** 离子键的「接触距离」（不画共价键线，画 ± 电荷徽记 + 虚接触） */
    ionicR: 60,
};

/** VSEPR 理想键角（度）。按**成键数 + 孤对数**查表，不靠猜。 */
export const VSEPR = {
    /** 成键 2、无孤对（直线形，如 CO₂、BeCl₂） */
    linear: 180,
    /** 成键 3、无孤对（平面三角，如 BF₃） */
    trigonal: 120,
    /** 成键 4、无孤对（正四面体，如 CH₄） */
    tetrahedral: 109.5,
    /** 成键 2、有孤对（角形，如水 H₂O） */
    bent: 104.5,
    /** 成键 3、有孤对（三角锥，如氨 NH₃） */
    pyramidal: 107,
};

/**
 * 角度的宽容度（度）。倾斜在这个范围内不提示 —— 提示本身是教学手段，
 * 不是处罚（提案 §2.6：不做扣分、不嘲讽）。
 */
export const ANGLE_TOLERANCE = 12;

/* ────────────────────────── 键数工具 ────────────────────────── */

/**
 * 某元素的**主**最大键数（用于「O 只能接 2 根键」这类规则文案）。
 * 多价态元素（S / P）取 bondOrders 的首项作为「常见值」。
 */
export function maxBondsOf(symbol) {
    const e = ELEMENTS[symbol];
    return e ? e.maxBonds : 0;
}

/**
 * 该元素是否允许总键数达到 n（多价态元素用 bondOrders 判定）。
 *
 * ⚠️ 离子物种不走共价价键规则。Na 的 bondOrders 是 [0] —— 它不共用电子，
 *    与 Cl 之间是**静电吸引**的离子键（|ΔEN| > 1.7，由 isIonic() 判）。
 *    若在这里用共价规则卡它，NaCl 会被自己的校验器判成「超价原子」，
 *    而它明明是白名单里合法的离子化合物。所以离子对放行。
 *
 *    运行时口径一致：拖动 Na 靠向 Cl 时，isIonic() 为真 → 走离子分支
 *    （画 ± 电荷徽记与虚接触，不画共价键线），也不该被价键数拦截。
 */
export function allowsBonds(symbol, n) {
    const e = ELEMENTS[symbol];
    if (!e) return false;
    if (isIonicSelf(symbol)) return true;
    return e.bondOrders.indexOf(n) !== -1 || n <= e.maxBonds;
}

/** 该元素在与**任何**伙伴成键时都可能表现为离子物种吗？
 *  判据：它是金属性/电正性很强的一侧（Na），即 maxBonds === 0。
 *  （当前元素表里只有 Na 命中；H 虽然 maxBonds 是 1，不在此列。） */
function isIonicSelf(symbol) {
    const e = ELEMENTS[symbol];
    return !!e && e.maxBonds === 0;
}

/**
 * 两个元素之间是否应按离子键处理（|ΔEN| > 1.7）。
 * 金属 + 非金属的典型组合（Na + Cl）会命中。
 */
export function isIonic(symA, symB) {
    const a = ELEMENTS[symA];
    const b = ELEMENTS[symB];
    if (!a || !b) return false;
    return Math.abs(a.en - b.en) > BOND.ionicThreshold;
}

/** 成键后的目标键长（几何松弛的静止长度） */
export function bondLength(symA, symB) {
    const a = ELEMENTS[symA];
    const b = ELEMENTS[symB];
    if (!a || !b) return BOND.snapR * 2;
    if (isIonic(symA, symB)) return BOND.ionicR;
    return a.radius + b.radius + BOND.gap;
}

/* ────────────────────────── 图结构 ──────────────────────────
 * 一个「原子实例」：{ id, sym, x, y }
 * 一根「键」：{ a, b, order }（a/b 是原子 id，order 默认 1）
 * 分子判定只看 (原子符号集合, 键拓扑)，与坐标无关。
 */

/** 邻接表：[atomId] → [{ to, order }] */
function buildAdjacency(atoms, bonds) {
    const adj = {};
    atoms.forEach(a => { adj[a.id] = []; });
    bonds.forEach(b => {
        if (!adj[b.a] || !adj[b.b]) return;
        const order = b.order || 1;
        adj[b.a].push({ to: b.b, order });
        adj[b.b].push({ to: b.a, order });
    });
    // 排序保证输出稳定（与输入顺序无关）
    Object.keys(adj).forEach(k => adj[k].sort((p, q) => (p.to - q.to) || (p.order - q.order)));
    return adj;
}

/**
 * 原子已用的**总键数**（双键算 2，三键算 3）。
 * 这是「能不能再成一根键」的判据来源。
 */
export function usedBonds(atom, bonds, extra = 0) {
    let n = extra;
    for (const b of bonds) {
        if (b.a === atom.id || b.b === atom.id) n += (b.order || 1);
    }
    return n;
}

/**
 * 某原子当前的成键**邻居数**（一根双键算 1 个邻居）。
 *
 * ⚠️ 命名歧义提醒：判断"能不能再成一根键"请用 `usedBonds()`（按**键级总计**，
 *    双键算 2）；本函数只数邻居，用于 VSEPR 的配位数查表。
 *    两者在全是单键时同值，一旦有多重键就会分叉 —— 用错会让 O₂（一个邻居、
 *    键级 2）被当成"还能再成键"。
 *    需要总计口径时优先用语义明确的名字 `bondOrderTotal()`。
 */
export function bondCount(atom, bonds) {
    let n = 0;
    for (const b of bonds) {
        if (b.a === atom.id || b.b === atom.id) n += 1;
    }
    return n;
}

/**
 * 某原子已用的**总键级**（双键算 2、三键算 3）。语义明确的别名，
 * 与 `usedBonds(atom, bonds)` 等价，供新代码优先使用。
 */
export function bondOrderTotal(atom, bonds, extra = 0) {
    return usedBonds(atom, bonds, extra);
}

/**
 * 两条键（共享一个原子）之间的夹角（度）。用于键角提示。
 * 返回 null = 两条键不共原子。
 */
export function bondAngle(atoms, bond1, bond2) {
    const shared = [bond1.a, bond1.b].filter(id => id === bond2.a || id === bond2.b);
    if (shared.length !== 1) return null;
    const cId = shared[0];
    const o1 = bond1.a === cId ? bond1.b : bond1.a;
    const o2 = bond2.a === cId ? bond2.b : bond2.a;
    const c = atoms.find(a => a.id === cId);
    const p1 = atoms.find(a => a.id === o1);
    const p2 = atoms.find(a => a.id === o2);
    if (!c || !p1 || !p2) return null;
    const v1x = p1.x - c.x, v1y = p1.y - c.y;
    const v2x = p2.x - c.x, v2y = p2.y - c.y;
    const d = Math.sqrt(v1x * v1x + v1y * v1y) * Math.sqrt(v2x * v2x + v2y * v2y);
    if (d < 1e-6) return null;
    const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / d));
    return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * 某原子在当前配位下的**理想键角**（取该原子所有成键两两夹角的最大值作为基准）。
 * 用于「试着把键角打开一些——理想角约 109.5°」这句提示。
 */
export function idealAngleFor(symbol, bondCountValue) {
    const e = ELEMENTS[symbol];
    if (!e) return null;
    // 孤对电子推测：价电子数 - 已用键数，再 /2 得孤对数
    const lonePairs = 0; // 见 lonePairsOf()，这里只按成键数给主表值
    void lonePairs;
    if (bondCountValue <= 2) return symbol === 'O' ? VSEPR.bent : VSEPR.linear;
    if (bondCountValue === 3) return symbol === 'N' ? VSEPR.pyramidal : VSEPR.trigonal;
    return VSEPR.tetrahedral;
}

/**
 * 孤对电子数：价电子数 − 已用键数，除以 2 向下取整。
 * 例：O 价电子 6、2 根单键 → 6−2 = 4 → 2 对孤对（正确）。
 *     N 价电子 5、3 根单键 → 5−3 = 2 → 1 对孤对（正确）。
 *     C 价电子 4、4 根单键 → 4−4 = 0 → 0 对（正确）。
 */
export function lonePairsOf(symbol, usedBondCount) {
    const e = ELEMENTS[symbol];
    if (!e) return 0;
    return Math.max(0, Math.floor((e.valence - usedBondCount) / 2));
}

/* ────────────────────────── 规范化判定 ────────────────────────── */

/**
 * Morgan 式规范标号：迭代地为每个原子算「邻居层哈希」，收敛后排序成稳定串。
 *
 * 用途：把「拓扑同构」的两种画法判为同一分子。同分异构体（乙醇
 * CH₃-CH₂-OH vs 二甲醚 CH₃-O-CH₃，都是 C₂H₆O）拓扑不同 ⇒ 规范串不同
 * ⇒ 被正确区分为两个分子。这正是提案 §2.1 要求的「异构体也算真化学」。
 *
 * 返回 `{ canon, degrees }`：canon 是比较用的字符串，degrees 是各原子连接度。
 * 运行时与校验器**共用此函数**，不得各写一份。
 */
export function canonicalize(atoms, bonds) {
    if (!atoms.length) return { canon: '', degrees: {} };
    const adj = buildAdjacency(atoms, bonds);

    // ── 第 1 步：求**公平划分**（equitable partition），即细化到稳定为止 ──
    //
    // 每个原子的签名 = 自己的元素符号 + 「邻居层的元素符号×键级」多重集。
    // 把「按邻居结构分组」这件事反复做，直到分组不再变细。
    //
    // ⚠️ 这里**不能**把签名本身累积起来（`next = 旧签名 + 新邻居签名`）——
    //    那会让签名串每轮翻倍、永远不收敛，循环被 `round < atoms.length`
    //    硬截断，于是**划分深度取决于原子数**。反例（真实踩过）：H₂O 两种写法
    //    [O,H,H] 与 [H,O,H] 在第 3 轮得到等价划分（O 一类、两个 H 一类），
    //    但 [O,H,H] 因为遍历顺序先一步把两个 H 合成一类、写法 B 慢一轮没合成，
    //    截断后两者类大小分别是 [1,2] 与 [1,1,1] ⇒ canon 不一致。
    //    正确做法：每轮只按「当前划分 + 邻居所处划分」**重算**新划分，
    //    只要还有类被劈开就继续；划分只可能变细、类数有上界，必然终止。
    let color = {};
    atoms.forEach(a => { color[a.id] = a.sym; });

    for (;;) {
        const sig = {};
        for (const a of atoms) {
            // 邻居签名按 (键级, 邻居当前类) 排序成多重集字符串
            const nb = adj[a.id]
                .map(e => `${e.order}:${color[e.to]}`)
                .sort()
                .join(',');
            // ⚠️ 分隔符两边的冒号不能省：`A:1|B` 与 `A|1:B` 必须不同，
            //    否则 "(O) 连着 (H,H)" 与 "(O,H) 连着 (H)" 会撞签名。
            sig[a.id] = `${color[a.id]}|${nb}`;
        }
        // 把签名去重 → 新的类号（排序保证类号与遍历顺序无关）
        const uniq = Array.from(new Set(atoms.map(a => sig[a.id]))).sort();
        const map = new Map(uniq.map((s, i) => [s, String(i)]));
        const next = {};
        atoms.forEach(a => { next[a.id] = map.get(sig[a.id]); });

        // 类号集合与上一轮相同 ⇒ 划分已稳定（类号是重新编号的，直接比多重集）
        const before = Array.from(new Set(atoms.map(a => color[a.id]))).sort().join(',');
        const after = Array.from(new Set(atoms.map(a => next[a.id]))).sort().join(',');
        color = next;
        // 类数不再增加即稳定：比较「类号的数量」而非具体值
        if (after.split(',').length === before.split(',').length) break;
    }

    // 收敛后的类划分：按类号升序取代表串，得到与输入顺序无关的类标志
    const classes = Array.from(new Set(atoms.map(a => color[a.id]))).sort();
    const idOf = new Map(classes.map((c, i) => [c, i]));
    const ints = atoms.map(a => idOf.get(color[a.id]));

    // 原子按元素符号分组统计（多重集），再叠加连接度直方图
    const symCount = {};
    const degCount = {};
    const degrees = {};
    atoms.forEach(a => {
        symCount[a.sym] = (symCount[a.sym] || 0) + 1;
        const d = adj[a.id].reduce((s, e) => s + e.order, 0);
        degrees[a.id] = d;
        degCount[d] = (degCount[d] || 0) + 1;
    });

    const bondSig = bonds
        .map(b => {
            const x = ints[atoms.findIndex(a => a.id === b.a)];
            const y = ints[atoms.findIndex(a => a.id === b.b)];
            const o = b.order || 1;
            return x <= y ? `${x}-${y}:${o}` : `${y}-${x}:${o}`;
        })
        .sort()
        .join(';');

    const symSig = Object.keys(symCount).sort()
        .map(k => `${k}${symCount[k]}`).join('');
    const degSig = Object.keys(degCount).map(Number).sort((p, q) => p - q)
        .map(d => `${d}x${degCount[d]}`).join(',');
    // 类大小直方图：等价类各含几个原子（水 = 1,2；甲烷 = 1,4）。
    // 它与 symSig / degSig 一起，把"元素组成 + 度数分布 + 等价类结构"三张
    // 独立的图不变量叠起来 —— 单靠任何一张都不足以区分复杂的同分异构体。
    const classSig = classes
        .map(c => atoms.filter(a => color[a.id] === c).length)
        .sort((p, q) => p - q)
        .join(',');

    const canon = `${symSig}#${classSig}#${degSig}#${bondSig}`;
    return { canon, degrees };
}

/** 键的多重集签名（含原子符号），用于 MOLECULES 白名单的快速匹配 */
export function bondSignature(atoms, bonds) {
    const byId = {};
    atoms.forEach(a => { byId[a.id] = a.sym; });
    return bonds
        .map(b => {
            const s1 = byId[b.a] || '?';
            const s2 = byId[b.b] || '?';
            const o = b.order || 1;
            return s1 <= s2 ? `${s1}${s2}:${o}` : `${s2}${s1}:${o}`;
        })
        .sort()
        .join(';');
}

/**
 * 判定当前搭建的分子是否等于目标分子。
 * 返回 `{ match, canon, sign }` —— match 为 true 才能通关。
 *
 * ⚠️ 必须先比原子多重集（元素组成），再比规范拓扑。
 *    只比组成会把「乙醇 = 二甲醚」判为相等；
 *    只比拓扑串会漏掉元素组成相同但连接度不同的情形。
 */
export function isTarget(atoms, bonds, target) {
    const { canon } = canonicalize(atoms, bonds);
    const sign = bondSignature(atoms, bonds);
    return {
        match: canon === target.canon && sign === target.sign,
        canon,
        sign,
    };
}

/* ────────────────────────── 分子白名单 ──────────────────────────
 * 每个分子给出**组成 + 拓扑**（用 bonds 的原子下标描述），canon/sign 在
 * 模块加载时由 canonicalize() 现算 —— **不手填规范串**，避免手抄出错。
 *
 * atoms: [{ sym }]，顺序即 bonds 里的下标
 * bonds: [{ a, b, order? }]（下标引用 atoms）
 * zh/en: 分子名（异构体话术要说出「这是二甲醚」，名字必须准）
 */
const MOLECULE_SPECS = [
    {
        id: 'H2O', formula: 'H₂O', zh: '水', en: 'Water',
        atoms: [{ sym: 'O' }, { sym: 'H' }, { sym: 'H' }],
        bonds: [{ a: 0, b: 1 }, { a: 0, b: 2 }],
    },
    {
        id: 'CH4', formula: 'CH₄', zh: '甲烷', en: 'Methane',
        atoms: [{ sym: 'C' }, { sym: 'H' }, { sym: 'H' }, { sym: 'H' }, { sym: 'H' }],
        bonds: [{ a: 0, b: 1 }, { a: 0, b: 2 }, { a: 0, b: 3 }, { a: 0, b: 4 }],
    },
    {
        id: 'NH3', formula: 'NH₃', zh: '氨', en: 'Ammonia',
        atoms: [{ sym: 'N' }, { sym: 'H' }, { sym: 'H' }, { sym: 'H' }],
        bonds: [{ a: 0, b: 1 }, { a: 0, b: 2 }, { a: 0, b: 3 }],
    },
    {
        id: 'CO2', formula: 'CO₂', zh: '二氧化碳', en: 'Carbon dioxide',
        atoms: [{ sym: 'C' }, { sym: 'O' }, { sym: 'O' }],
        bonds: [{ a: 0, b: 1, order: 2 }, { a: 0, b: 2, order: 2 }],
    },
    {
        id: 'O2', formula: 'O₂', zh: '氧气', en: 'Oxygen',
        atoms: [{ sym: 'O' }, { sym: 'O' }],
        bonds: [{ a: 0, b: 1, order: 2 }],
    },
    {
        id: 'N2', formula: 'N₂', zh: '氮气', en: 'Nitrogen',
        atoms: [{ sym: 'N' }, { sym: 'N' }],
        bonds: [{ a: 0, b: 1, order: 3 }],
    },
    {
        id: 'HCl', formula: 'HCl', zh: '氯化氢', en: 'Hydrogen chloride',
        atoms: [{ sym: 'H' }, { sym: 'Cl' }],
        bonds: [{ a: 0, b: 1 }],
    },
    {
        id: 'H2S', formula: 'H₂S', zh: '硫化氢', en: 'Hydrogen sulfide',
        atoms: [{ sym: 'S' }, { sym: 'H' }, { sym: 'H' }],
        bonds: [{ a: 0, b: 1 }, { a: 0, b: 2 }],
    },
    {
        id: 'PH3', formula: 'PH₃', zh: '磷化氢', en: 'Phosphine',
        atoms: [{ sym: 'P' }, { sym: 'H' }, { sym: 'H' }, { sym: 'H' }],
        bonds: [{ a: 0, b: 1 }, { a: 0, b: 2 }, { a: 0, b: 3 }],
    },
    {
        id: 'CH3OH', formula: 'CH₃OH', zh: '甲醇', en: 'Methanol',
        atoms: [{ sym: 'C' }, { sym: 'O' }, { sym: 'H' }, { sym: 'H' }, { sym: 'H' }, { sym: 'H' }],
        bonds: [{ a: 0, b: 1 }, { a: 0, b: 2 }, { a: 0, b: 3 }, { a: 0, b: 4 }, { a: 1, b: 5 }],
    },
    {
        id: 'C2H6O-ethanol', formula: 'C₂H₆O', zh: '乙醇', en: 'Ethanol',
        atoms: [{ sym: 'C' }, { sym: 'C' }, { sym: 'O' }, { sym: 'H' }, { sym: 'H' }, { sym: 'H' }, { sym: 'H' }, { sym: 'H' }, { sym: 'H' }],
        bonds: [
            { a: 0, b: 1 }, { a: 1, b: 2 },
            { a: 0, b: 3 }, { a: 0, b: 4 }, { a: 0, b: 5 },
            { a: 1, b: 6 }, { a: 1, b: 7 },
            { a: 2, b: 8 },
        ],
    },
    {
        id: 'C2H6O-dimethylether', formula: 'C₂H₆O', zh: '二甲醚', en: 'Dimethyl ether',
        atoms: [{ sym: 'C' }, { sym: 'C' }, { sym: 'O' }, { sym: 'H' }, { sym: 'H' }, { sym: 'H' }, { sym: 'H' }, { sym: 'H' }, { sym: 'H' }],
        bonds: [
            { a: 0, b: 2 }, { a: 1, b: 2 },
            { a: 0, b: 3 }, { a: 0, b: 4 }, { a: 0, b: 5 },
            { a: 1, b: 6 }, { a: 1, b: 7 }, { a: 1, b: 8 },
        ],
    },
    {
        id: 'NaCl', formula: 'NaCl', zh: '氯化钠', en: 'Sodium chloride',
        atoms: [{ sym: 'Na' }, { sym: 'Cl' }],
        bonds: [{ a: 0, b: 1 }],
        ionic: true,
    },
];

/**
 * 分子白名单（含 canon / sign 的现算结果）。
 * 关卡的目标分子**必须**来自这里（提案 §2.5 规则 1），否则校验器报错。
 */
export const MOLECULES = (() => {
    const out = {};
    for (const spec of MOLECULE_SPECS) {
        const atoms = spec.atoms.map((a, i) => ({ id: i, sym: a.sym, x: 0, y: 0 }));
        const bonds = spec.bonds.map(b => ({ a: b.a, b: b.b, order: b.order || 1 }));
        const { canon, degrees } = canonicalize(atoms, bonds);
        out[spec.id] = {
            id: spec.id,
            formula: spec.formula,
            zh: spec.zh,
            en: spec.en,
            ionic: !!spec.ionic,
            atoms: spec.atoms.map(a => a.sym),
            bonds: spec.bonds.map(b => ({ a: b.a, b: b.b, order: b.order || 1 })),
            canon,
            sign: bondSignature(atoms, bonds),
            degrees,
        };
    }
    return out;
})();

/** 按元素组成找所有白名单分子（用于异构体话术：「这是二甲醚」） */
export function findByComposition(symbols) {
    const key = symbols.slice().sort().join('');
    return Object.values(MOLECULES).filter(m => m.atoms.slice().sort().join('') === key);
}

/**
 * 把当前搭建结果识别成白名单里的哪个分子（按 canon+sign 精确匹配）。
 * 找不到返回 null —— 调用方据此走「合法但不在白名单」的兜底话术。
 */
export function identify(atoms, bonds) {
    const { canon } = canonicalize(atoms, bonds);
    const sign = bondSignature(atoms, bonds);
    for (const m of Object.values(MOLECULES)) {
        if (m.canon === canon && m.sign === sign) return m;
    }
    return null;
}

/* ────────────────────────── 最优解（BFS） ──────────────────────────
 * 反推 par：给定关卡（目标分子 + 原子盘里的可用原子），搜索**最少拖拽次数**。
 *
 * 状态空间：把「原子盘里的原子拖到画布上并成键」看成一步步操作。
 * 每拖一次 = 从盘里取一个原子放到一个空位 + 与已有原子自动成键（若能成）。
 * 这里简化成：每拖一次 = 「放置一个原子」（键由价键合法性自动决定）。
 * ⇒ 最少拖拽数 = 需要的原子数 − 起始已在画布上的原子数。
 *
 * 这是**可精确求解**的（不是启发式），所以 par 是推导值而非估计值。
 * 校验器断言：存在一条拖拽序列，其拖拽数 ≤ par。
 */
export function solveBest(level) {
    const trayCount = (level.tray || []).length;
    const placed = (level.placed || []).length;
    // 目标分子需要的原子总数
    const target = MOLECULES[level.target];
    const need = target ? target.atoms.length : 0;
    // 画布上已有的原子（placed）计入已放置，剩下的必须从盘里拖
    const toDrag = Math.max(0, need - placed);
    // 盘里必须够（提案 §2.5 规则 2「原子盘守恒」）
    return {
        par: toDrag,
        need,
        trayCount,
        placed,
        feasible: trayCount >= toDrag,
        targetAtoms: target ? target.atoms.slice() : [],
    };
}

/* ────────────────────────── 每日赛程 ──────────────────────────
 * 每日 5 关：由 dateKey 决定选哪 5 个分子。⚠️ 种子算法必须与
 * js/daily.js 的 hashStringFNV（FNV-1a）+ mulberry32 一致 —— 全站唯一口径。
 * 本模块**不** import daily.js（保持零依赖，校验器可直接跑），
 * 由调用方把已算好的随机数或 dateKey 传进来。
 */

/** 用外部注入的 rng（() => [0,1)）从候选里挑 count 个，按 par 升序排 */
export function dailyPicks(rng, ids, count) {
    const pool = ids.slice();
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    return pool.slice(0, count);
}

/* ────────────────────────── 校验辅助 ────────────────────────── */

/**
 * 校验一关的**结构**合法性（不跑物理）。返回错误数组，空数组合法。
 * 提案 §2.5 五条硬规则里可静态检查的部分：
 *   1. target 必须在 MOLECULES 白名单
 *   2. 原子守恒：**placed（开局已摆好）+ tray（可拖）** ⊇ 目标原子多集
 *   3. isomers 必须列出**所有**合法拓扑（避免欺骗性反馈）
 *   4. par 必须由 solveBest 推导（这里只查它存在且 >= 0）
 *   5. （满星路径存在性需运行时搜索，见 verify-bond-forge-levels.mjs）
 *
 * ⚠️ 第 2 条曾经只查 `tray ⊇ target`。这对「开局摆好中心原子」的教学关
 *    （如 L1 水：placed=[O]、tray=[H,H]）会**误报为死关** —— 而这类关恰恰是
 *    前五关的主要形态。判据必须按**合成供给**算：两处原子加一起够才行。
 *    （`solveBest().feasible` 用的是 `tray >= 需拖数`，与这里口径一致。）
 */
export function validateLevelSpec(level) {
    const errs = [];
    if (!level || typeof level !== 'object') return ['关卡不是对象'];
    if (!level.id) errs.push('缺 id');
    if (!level.target) errs.push('缺 target');

    const target = MOLECULES[level.target];
    if (level.target && !target) {
        errs.push(`target "${level.target}" 不在 MOLECULES 白名单`);
    }

    if (target) {
        // ── 合成供给：placed + tray ──
        const supply = {};
        [...(level.placed || []), ...(level.tray || [])]
            .forEach(s => { supply[s] = (supply[s] || 0) + 1; });
        const needCount = {};
        target.atoms.forEach(s => { needCount[s] = (needCount[s] || 0) + 1; });

        Object.keys(needCount).forEach(s => {
            if ((supply[s] || 0) < needCount[s]) {
                errs.push(`供给不足：${s} 需 ${needCount[s]} 个，placed+tray 只有 ${supply[s] || 0} 个`);
            }
        });

        // placed 里不该出现目标用不到的元素：既占着画布、又拼不出分子，纯属设计失误
        const needSet = new Set(Object.keys(needCount));
        (level.placed || []).forEach(s => {
            if (!needSet.has(s)) errs.push(`placed 含目标外元素：${s}`);
        });

        // isomers 必须列出该组成下的**所有**白名单分子（含目标自己不算）
        const sameComp = findByComposition(target.atoms).map(m => m.id);
        const declared = (level.isomers || []).slice().sort().join(',');
        const expected = sameComp.filter(id => id !== target.id).sort().join(',');
        if (declared !== expected) {
            errs.push(`isomers 不完整：应为 [${expected}]，实为 [${declared}]`);
        }
    }

    if (typeof level.par !== 'number' || level.par < 0) {
        errs.push('par 缺失或为负（应由 solveBest 推导）');
    }
    return errs;
}
