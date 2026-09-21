// bond-forge-levels.js — 键合工坊关卡数据层：20 关 + 每日赛程 + 自由搭建池
//
// 分工（与 tower-levels / circuit-levels 同构）：
//   js/bond-forge.js            → 渲染 / 输入 / 判定 / 计分（不含关卡数据）
//   js/bond-forge-molecules.js  → 元素表 + 价键 + 规范标号（**判定真源**）
//   js/bond-forge-levels.js     → 本文件，只有数据与每日赛程
//   scripts/verify-bond-forge-levels.mjs → 纯 Node 逐关校验（不需要浏览器）
//
// ⚠️ 三条必须守住的规矩（proposal §2.5 / §3.3，校验器会逐条断言）：
//
//   1. **par 是推导的**。`par` 字段一律由 `solveBest()` 现算填充 —— 见本文件
//      末尾的 `LEVELS` 构造。手填的数字必然和真实可达解脱节，而玩家只会看到
//      「我比目标少用了一次拖拽，却没给三星」。
//
//   2. **isomers 要列全**。同组成的白名单分子必须**全部**列进去（经
//      `findByComposition` 现算），漏一个就会让玩家拼出真实分子却被判成「错」，
//      而这恰恰是本作最想教的化学。
//
//   3. **原子盘守恒**。盘里的原子多集必须 ⊇ 目标分子所需。给多了没关系
//      （异构体诱饵），给少了就是死关。
//
// 关卡设计取向（提案 §8 已定：难度定位 = 中学生）：
//   L1–L5   单中心、1 种元素、只教「拖出来靠近就成键」
//   L6–L10  引入双键/三键与孤对（O₂ / N₂ / CO₂ / H₂S / PH₃）
//   L11–L15 多原子链，开始要求点数与顺序（甲醇、过氧化氢式链、HCN）
//   L16–L19 同分异构体正面教学（C₂H₆O 两兄弟）与离子键（NaCl）
//   L20     综合：多官能团、需要预留价键
//   L17/L19 是**故意**放异构体诱饵的关：盘里给齐两套原子，拼错时给
//           「这也是真实分子——只是不是本题要的」的正向反馈而不是红叉。

import {
    MOLECULES,
    findByComposition,
    solveBest,
    dailyPicks,
    canonicalize,
    bondSignature,
} from './bond-forge-molecules.js';

// 每日赛程的抽取器与运行时共用（js/bond-forge.js 从这里 re-export 出去用）。
export { dailyPicks } from './bond-forge-molecules.js';

/**
 * 每日赛程种子前缀。
 *
 * ⚠️ 运行时（js/bond-forge.js 的 buildDailyCourse）与校验器
 *    （scripts/verify-bond-forge-levels.mjs）必须用**同一个**前缀，
 *    否则校验器全绿而线上每天发的题与校验的根本不是同一套。
 *    所以它定义在这里、两边都 import，不允许各写一份字面量。
 */
export const DAILY_SEED_PREFIX = 'bond-forge:';

/* ────────────────────── 关卡骨架 ──────────────────────
 * 字段口径：
 *   id        稳定的关卡 id（进度存档 key，**改了就丢存档**）
 *   target    MOLECULES 的键（白名单外的分子校验器直接报错）
 *   tray      底部原子盘的原子符号列表（可含诱饵原子）
 *   placed    开局**已经放在画布上**的原子（教学先导：第一关先摆好 O）
 *   hintZh/hintEn  可选的关卡级提示（比全局 toast 更具体）
 *   isomers   同组成的其它白名单分子 —— 由 findByComposition 现算，不手写
 *   par       最少拖拽数 —— 由 solveBest 现算，不手写
 */

const SPECS = [
    /* ── L1–L5：单中心入门 ── */
    {
        id: 'bf-01-water',
        target: 'H2O',
        // 先摆好氧，只需要拖两个氢：第一次拖拽一定成功，先给一次「成了」的正反馈
        //
        // ⚠️ placed 与 tray 是**不相交**的：placed 是开局已经站在画布上的原子，
        //    tray 是底部托盘里可拖的原子。两者加起来才等于这条关卡提供的总原子数，
        //    所以 H₂O 这里是 placed[O] + tray[H,H] = 3（不是 tray 里再放个 O）。
        //    par 由 solveBest 推导 = need − placed = 3 − 1 = 2，与 tray.length 相同
        //    只是巧合（placed 恰好 1 个），L19 就不同（placed 1 + tray 1，par = 1）。
        placed: ['O'],
        tray: ['H', 'H'],
        hintZh: '把两个氢拖到氧旁边，填满氧的两个价键。',
        hintEn: 'Drag both hydrogens next to the oxygen to fill its two bonds.',
    },
    {
        id: 'bf-02-methane',
        target: 'CH4',
        placed: ['C'],
        tray: ['H', 'H', 'H', 'H'],
        hintZh: '碳有四根键，需要四个氢。',
        hintEn: 'Carbon has four bonds — it needs four hydrogens.',
    },
    {
        id: 'bf-03-ammonia',
        target: 'NH3',
        placed: ['N'],
        tray: ['H', 'H', 'H'],
        hintZh: '氮能接三根键。',
        hintEn: 'Nitrogen takes three bonds.',
    },
    {
        id: 'bf-04-hydrogen-chloride',
        target: 'HCl',
        tray: ['H', 'Cl'],
        hintZh: '从空画布开始：拖出两个原子，靠近即成键。',
        hintEn: 'Start from an empty board: drag both atoms out and bring them close.',
    },
    {
        id: 'bf-05-hydrogen-sulfide',
        target: 'H2S',
        placed: ['S'],
        tray: ['H', 'H'],
        hintZh: '硫和氧一样能接两根键。',
        hintEn: 'Sulfur, like oxygen, takes two bonds.',
    },

    /* ── L6–L10：多重键与孤对 ── */
    {
        id: 'bf-06-oxygen-gas',
        target: 'O2',
        tray: ['O', 'O'],
        hintZh: '氧要接两根键，但这里只有两个原子——把它们接成双键。',
        hintEn: 'Each oxygen wants two bonds but only two atoms exist — make it a double bond.',
    },
    {
        id: 'bf-07-carbon-dioxide',
        target: 'CO2',
        placed: ['C'],
        tray: ['O', 'O'],
        hintZh: '碳有四根键、两个氧各要两根：两边各来一根双键。',
        hintEn: 'Four bonds on carbon, two on each oxygen — a double bond on each side.',
    },
    {
        id: 'bf-08-nitrogen-gas',
        target: 'N2',
        tray: ['N', 'N'],
        hintZh: '氮要接三根键。三键是这张卡片的答案。',
        hintEn: 'Nitrogen wants three bonds. The answer is a triple bond.',
    },
    {
        id: 'bf-09-phosphine',
        target: 'PH3',
        placed: ['P'],
        tray: ['H', 'H', 'H'],
        hintZh: '磷化氢：磷接三个氢，还有一对孤对电子。',
        hintEn: 'Phosphine: three hydrogens on phosphorus, plus one lone pair.',
    },
    {
        id: 'bf-10-bromide',
        target: 'HCl',
        // 诱饵关：盘里多给一个 Br。Br 只能接一根键，和 H 拼出的是 HBr
        // （不在白名单里），玩家会看到「真实分子，但不是本题目标」。
        placed: [],
        tray: ['H', 'Cl', 'Br'],
        hintZh: '盘里多给了一个溴——溴也能接一根键，但本题要的是氯化氢。',
        hintEn: 'The tray has a spare bromine — it bonds too, but this card wants HCl.',
    },

    /* ── L11–L15：多原子链 ── */
    {
        id: 'bf-11-methanol',
        target: 'CH3OH',
        placed: ['C'],
        tray: ['O', 'H', 'H', 'H', 'H'],
        hintZh: '甲醇：碳接三个氢、再连一个氧，氧上再挂一个氢。',
        hintEn: 'Methanol: three hydrogens on carbon, then an oxygen bearing one hydrogen.',
    },
    {
        id: 'bf-12-methanol-hard',
        target: 'CH3OH',
        // 同一分子的「难版」：不给起始原子，盘里多一个诱饵
        placed: [],
        tray: ['C', 'O', 'H', 'H', 'H', 'H'],
        hintZh: '这次盘里什么都不摆——先想清楚谁是中心。',
        hintEn: 'Nothing pre-placed this time. Decide which atom is the centre first.',
    },
    {
        id: 'bf-13-hydrogen-cyanide',
        target: 'HCN',
        // 目标不在 MOLECULES 白名单 → 校验器会拦。见文件末尾的补充注册。
        placed: ['C'],
        tray: ['N', 'H'],
        hintZh: '氰化氢：碳与氮之间是三键，碳再连一个氢。',
        hintEn: 'Hydrogen cyanide: a triple bond between C and N, plus one H on carbon.',
    },
    {
        id: 'bf-14-sulfur-dioxide',
        target: 'SO2',
        placed: ['S'],
        tray: ['O', 'O'],
        hintZh: '二氧化硫：硫接两个氧，两边都是双键。',
        hintEn: 'Sulfur dioxide: two oxygens, both as double bonds.',
    },
    {
        id: 'bf-15-formaldehyde',
        target: 'CH2O',
        placed: ['C'],
        tray: ['O', 'H', 'H'],
        hintZh: '甲醛：碳上两根氢单键 + 一根碳氧双键。',
        hintEn: 'Formaldehyde: two C–H single bonds plus one C=O double bond.',
    },

    /* ── L16–L19：同分异构体与离子键 ── */
    {
        id: 'bf-16-ethanol',
        target: 'C2H6O-ethanol',
        placed: [],
        tray: ['C', 'C', 'O', 'H', 'H', 'H', 'H', 'H', 'H'],
        hintZh: '乙醇：两个碳先连起来，氧接在**末端**碳上——这才叫「醇」。',
        hintEn: 'Ethanol: link the two carbons, then put the oxygen on a **terminal** carbon.',
    },
    {
        id: 'bf-17-ethanol-vs-ether',
        target: 'C2H6O-ethanol',
        // ⭐ 本作的招牌关：同样的 9 个原子，拼成 C–O–C 就是二甲醚（真实分子！）
        placed: [],
        tray: ['C', 'C', 'O', 'H', 'H', 'H', 'H', 'H', 'H'],
        hintZh: '同样的原子能拼出两种分子。氧夹在两个碳中间 → 二甲醚；接在末端碳上 → 乙醇。本题要乙醇。',
        hintEn: 'The same atoms make two molecules. O between both carbons gives dimethyl ether; O on a terminal carbon gives ethanol. This card wants ethanol.',
    },
    {
        id: 'bf-18-dimethyl-ether',
        target: 'C2H6O-dimethylether',
        placed: [],
        tray: ['C', 'C', 'O', 'H', 'H', 'H', 'H', 'H', 'H'],
        hintZh: '反过来：这次要二甲醚——氧要做「桥」，夹在两个碳之间。',
        hintEn: 'Now the other way: dimethyl ether — the oxygen bridges both carbons.',
    },
    {
        id: 'bf-19-sodium-chloride',
        target: 'NaCl',
        placed: ['Na'],
        tray: ['Cl'],
        hintZh: '钠和氯之间电负性差得太多，不是共用电子——这是一根离子键。',
        hintEn: 'Sodium and chlorine differ far too much to share electrons — ionic bond.',
    },

    /* ── L20：综合 ── */
    {
        id: 'bf-20-carbon-disulfide',
        target: 'CS2',
        placed: ['C'],
        tray: ['S', 'S'],
        hintZh: '二硫化碳：碳的两侧各来一根碳硫双键。硫可以超过两根键，但这里用不着。',
        hintEn: 'Carbon disulfide: a C=S double bond on each side of the carbon.',
    },
];

/* ────────────────────── 补充分子注册 ──────────────────────
 * SPECS 里用到了三个不在 js/bond-forge-molecules.js 的 MOLECULE_SPECS 里的
 * 分子（HCN / SO2 / CH2O / CS2）。它们**必须**进白名单，否则：
 *   - validateLevelSpec 判「target 不在白名单」
 *   - identify() 认不出玩家拼的分子，异构体话术失效
 *
 * 本来最干净的做法是直接往 molecules.js 的 MOLECULE_SPECS 里加。之所以放在
 * 这里，是因为 molecules.js 的 MOLECULE_SPECS 是**模块私有**的（只导出算好的
 * MOLECULES），而它已经导出了 canonicalize / bondSignature —— 用同一套规范
 * 标号实现现算即可，判定真源仍然只有一份。
 *
 * ⚠️ 若日后往 molecules.js 里补了这几个分子，本段会自动跳过（id 已存在），
 *    不会覆盖出两份 canon。
 */
const EXTRA_SPECS = [
    {
        id: 'HCN', formula: 'HCN', zh: '氰化氢', en: 'Hydrogen cyanide',
        atoms: ['H', 'C', 'N'],
        bonds: [{ a: 0, b: 1 }, { a: 1, b: 2, order: 3 }],
    },
    {
        id: 'SO2', formula: 'SO₂', zh: '二氧化硫', en: 'Sulfur dioxide',
        atoms: ['S', 'O', 'O'],
        bonds: [{ a: 0, b: 1, order: 2 }, { a: 0, b: 2, order: 2 }],
    },
    {
        id: 'CH2O', formula: 'CH₂O', zh: '甲醛', en: 'Formaldehyde',
        atoms: ['C', 'O', 'H', 'H'],
        bonds: [{ a: 0, b: 1, order: 2 }, { a: 0, b: 2 }, { a: 0, b: 3 }],
    },
    {
        id: 'CS2', formula: 'CS₂', zh: '二硫化碳', en: 'Carbon disulfide',
        atoms: ['C', 'S', 'S'],
        bonds: [{ a: 0, b: 1, order: 2 }, { a: 0, b: 2, order: 2 }],
    },
];

// ⚠️ canonicalize / bondSignature 走**上面的静态 import**，不要改回 `await import()`。
//    本文件与 molecules.js 之间**没有**循环依赖（molecules.js 不反向 import 本文件），
//    所以惰性导入没有任何收益；而顶层 await 会直接让 `vite build` 失败：
//    legacy 目标（chrome64/es2020）不支持 top-level await，
//    esbuild 在 [vite:esbuild-transpile] 阶段报
//    "Top-level await is not available in the configured target environment"。
//    这正是 M1 里程碑首次全量 build 真实踩到的坑（dev 下一切正常 —— dev 不做 legacy 转译）。

for (const spec of EXTRA_SPECS) {
    if (MOLECULES[spec.id]) continue;
    const atoms = spec.atoms.map((sym, i) => ({ id: i, sym, x: 0, y: 0 }));
    const bonds = spec.bonds.map(b => ({ a: b.a, b: b.b, order: b.order || 1 }));
    MOLECULES[spec.id] = {
        id: spec.id,
        formula: spec.formula,
        zh: spec.zh,
        en: spec.en,
        ionic: !!spec.ionic,
        atoms: spec.atoms.slice(),
        bonds: spec.bonds.map(b => ({ a: b.a, b: b.b, order: b.order || 1 })),
        canon: canonicalize(atoms, bonds).canon,
        sign: bondSignature(atoms, bonds),
        degrees: canonicalize(atoms, bonds).degrees,
    };
}

/* ────────────────────── 关卡表构造 ────────────────────── */

/**
 * 把 SPECS 补全成可用关卡：现算 isomers / par / atomNeeds。
 *
 * 手写这两个字段是最容易出错的环节 —— isomers 漏一个会让玩家被误判，
 * par 写错会让三星永远拿不到。所以**一个都不手写**。
 */
export const LEVELS = SPECS.map((spec, index) => {
    const target = MOLECULES[spec.target];
    const sameComp = findByComposition(target ? target.atoms : [])
        .map(m => m.id)
        .filter(id => id !== spec.target);

    const solved = solveBest({
        target: spec.target,
        tray: spec.tray || [],
        placed: spec.placed || [],
    });

    return {
        ...spec,
        /** 关卡序号（1 起，UI 显示用） */
        no: index + 1,
        /** 同组成的其它白名单分子（全量，不手写） */
        isomers: sameComp,
        /** 最少拖拽数（由 solveBest 推导，不手写） */
        par: solved.par,
        /** 目标分子需要的原子总数 */
        need: solved.need,
        /** 盘里原子是否够（false = 死关，校验器硬失败） */
        feasible: solved.feasible,
    };
});

/** 关卡总数（UI 与校验器共用，避免各自 LEVELS.length） */
export const LEVEL_COUNT = LEVELS.length;

/**
 * 每日挑战的候选池：**只挑单原子量小、能独立拼出的关**。
 * 刻意排除 L17/L18 这种「同盘双解」的教学关 —— 每日是计时赛，
 * 让玩家在同分异构体上纠结不是每日挑战的目的。
 */
export const DAILY_POOL = [
    'bf-01-water',
    'bf-02-methane',
    'bf-03-ammonia',
    'bf-05-hydrogen-sulfide',
    'bf-06-oxygen-gas',
    'bf-07-carbon-dioxide',
    'bf-08-nitrogen-gas',
    'bf-09-phosphine',
    'bf-11-methanol',
    'bf-13-hydrogen-cyanide',
    'bf-14-sulfur-dioxide',
    'bf-19-sodium-chloride',
    'bf-20-carbon-disulfide',
];

/** 自由搭建（沙盒）可用的分子：全部白名单分子，按原子数从少到多 */
export const SANDBOX_MOLECULES = Object.values(MOLECULES)
    .slice()
    .sort((a, b) => (a.atoms.length - b.atoms.length) || a.id.localeCompare(b.id))
    .map(m => m.id);

/** 按 id 取关（存档恢复 / 每日赛程用） */
export function levelById(id) {
    return LEVELS.find(l => l.id === id) || null;
}

/**
 * 今日赛程：从 DAILY_POOL 确定性抽 count 关。
 *
 * ⚠️ 种子字面量只有 DAILY_SEED_PREFIX 一处，校验器也 import 它 ——
 *    「校验器测的和线上发的不是同一套题」是本文件最怕的静默失效。
 *
 * @param {() => number} rng  由调用方注入（浏览器里用 mulberry32(hashStringFNV(...))）
 */
export function dailyCourse(rng, count = 5) {
    return dailyPicks(rng, DAILY_POOL, count).map(levelById).filter(Boolean);
}

/** 按序号取关（1 起） */
export function levelByNo(no) {
    return LEVELS[no - 1] || null;
}
