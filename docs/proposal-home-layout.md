# 首页游戏卡片：布局与分类优化方案

> 状态：P1 已合入（#146）· P2 已合入（#147）· P3 已实现（发现区，见 §7.2）· 2026-10-15
> Repository: `mingzhangyang/games`
> 范围：`index.html` 游戏卡片区、Daily Hub 入口、`games.config.json` 的 `home` 元数据、生成器 `home-cards` 区域
> 不在范围：各游戏页面本身、共享 `layout.css` 骨架、排行榜 / 统计 Worker 协议

## 1. 背景与目标

首页已有 26 款站内游戏 + 3 款外站游戏，共 29 张卡片。卡片区沿用早期只有几款游戏时的「单一网格平铺」形态，规模上来后找游戏、发现新游戏、进入每日玩法都不顺。

目标：

1. **可找**：玩家 5 秒内能定位到想玩的类型。
2. **可发现**：新游戏、每日玩法有清晰、可理解的入口。
3. **移动端可读**：卡片标题不断词，滚动长度显著下降。
4. **仍由 registry 单源驱动**：分类、徽章、排序全部来自 `games.config.json`，`npm run gen -- --check` 保持确定性。

## 2. 现状测量（2026-10-14，`main` @ `c24faa9`）

截图与几何均由本地 `tests/lib/serve-static.mjs` + puppeteer 实测。

| 指标 | 桌面 1440×900 | 手机 390×844 |
|---|---|---|
| 卡片区高度 | ≈1892px | ≈3062px |
| 整页高度 | 2676px | 4053px |
| 网格列数 | 3（`.games-section` 上限 1000px） | 2（`width <= 600px` 时 `1fr 1fr`） |
| 单卡高度 | 172px | 204px |

### 2.1 问题清单

| # | 问题 | 依据 |
|---|---|---|
| P-1 | **无分组**：29 张卡片按 registry 登记顺序平铺，顺序≈上线时间，对玩家无意义 | `homeCardsContent()` 直接 `GAMES.map` + 外站拼在末尾 |
| P-2 | **手机端标题断词**：381–600px 区间两列卡片过窄，单词被拆行 | 390px 下实测断词：Minesweeper / Gravity Slingshot / Pinpoint Clash / Maxwell's Demon / Shadow Loom；≤380px 又退化为单列 204px 高的大卡 |
| P-3 | **标签词表失控**：`home.tag` 英文 16 种、中文 25 种，同一字段混了玩法（Puzzle/Arcade）、学科（Chemistry/Spectroscopy/Interference）、模式（Daily/Multiplayer）、风格（Classic），无法用于筛选 | `games.config.json` 统计 |
| P-4 | **徽章不可读、不稀缺**：daily / new 都是同一个书签图标，只靠绿 / 黄区分，含义只在 hover tooltip 里（触屏不可见）；12 张 daily + 6 张 new，近 2/3 的卡带徽章 | `homeCardLine()` 的 `card-badge` |
| P-5 | **徽章与能力不一致**：14 款有 `daily` cap，但 needle-awn / sword-flight 的 `home.badge` 是 `new`，其每日玩法在首页不可见；`home.badge` 是手填字段，与 caps 无约束关系 | caps vs `home.badge` |
| P-6 | **Daily Hub 只覆盖 3/14**：Word Daily / Planet Merge / Gravity Slingshot 之外的 11 款每日玩法在首页无入口 | `updateDailyHub()` 硬编码三项 |
| P-7 | **桌面宽度浪费**：1440px 屏仍是 1000px、3 列 | `.games-section { max-width: 1000px }` |
| P-8 | **卡片交互不规范**：`<article onclick>` 内嵌两个 `<a>`（标题 + Play）；整卡不能中键 / 新标签打开，键盘 Tab 每卡停两次 | `homeCardLine()` |
| P-9 | **外站无标识**：3 款外站游戏混在末尾，看不出会离站，也不共享语言 / 昵称 / 排行榜 | `data-external="1"` 仅作数据属性 |
| P-10 | **Perks 区价值低**：三条卖点对回访玩家无信息量，却占一整行 | `<aside class="perks">` |

## 3. 分类方案

### 3.1 原则

- **一款游戏只有一个主分类**（`home.category`），决定它出现在哪个分区。
- **状态是标签，不是分类**：本方案只派生 §3.3 列出的四种标签（每日、新、外站、仅深色），来源分别是 `daily` cap、`home.addedAt`、`externalGames`、缺 `theme-light` cap；不再手填。其中只有「每日」参与筛选（§4.2）。
  - 排行榜、双人不在本方案范围：`caps` 枚举（`games.schema.json`）没有 multiplayer 能力，排行榜也不是玩家选游戏的维度。若以后要做，需先加 cap + schema + `verify-registry` 断言，再加标签与筛选。
- **原 `home.tag` 降级为副标签**，只做补充描述（如科学系列的「光谱」「干涉」），保留双语但不参与筛选。

### 3.2 分类表

| key | 名称 | 成员 | 数 |
|---|---|---|---|
| `action` | 🕹️ 动作街机 Action & Arcade | needle-awn, sword-flight, loop-jail, tank-battle, hoop-shot, carrot-pull, tetris, math-rain | 8 |
| `puzzle` | 🧩 益智解谜 Puzzle | planet-merge, word-daily, minesweeper, gravity-slingshot, firefly-signal, shadow-loom | 6 |
| `strategy` | ♟️ 棋盘策略 Board & Strategy | gomoku, reversi, tower-defense, dots ↗ | 4 |
| `science` | 🔬 科学实验室 Science Lab | lumen, circuit, silk-dew, bond-forge, echo-cave, maxwell-demon, crystal-bloom, flame-verse, ripple-duet | 9 |
| `external` | ↗ 站外作品 More from Orangely | minecraft, stack | 2 |

说明：

- **科学实验室**本就是同一批科学题材游戏（其中 crystal-bloom / echo-cave / flame-verse / maxwell-demon / ripple-duet 已共享 `css/science-showcase.css`），独立成区收益最大；其学科副标签（化学 / 光谱 / 干涉…）恰好作为区内区分。
- **gravity-slingshot** 题材是物理，但不属于科学系列、且是 Daily Hub 固定项，放 `puzzle`（见 §8 决策 D-2）。
- **dots（点格棋）** 归 `strategy` 并带 ↗ 外站标识，避免策略区只有 3 款（见 §8 决策 D-1）。
- 区内排序：registry 新增 `home.rank`（数字，小者在前）；缺省按登记顺序。不在运行时按热度重排，避免首屏布局跳动。

### 3.3 功能标签（由 caps 派生）

| 标签 | 来源 | 用途 |
|---|---|---|
| 每日 Daily | `caps` 含 `daily` | 卡片小标签 + 筛选「每日挑战」 |
| 新 New | `home.addedAt` 在 45 天内（运行时判断） | 卡片小标签 + 「新上线」横排 |
| 外站 ↗ | `externalGames` | 卡片小标签，标题后加 ↗ |
| 仅深色 | 无 `theme-light` cap（已有逻辑） | 浅色模式下显示；挂载点从页脚 Play 按钮前移到标题行（`markDarkOnlyCards()` 须同步改，否则删掉 Play 后它会提前 return，标记全部消失） |

`home.badge` 字段废弃：daily 由 cap 派生，new 由日期派生，彻底消除 P-5 这类手填不一致。删除 `home.badge` 与 `addedAt` 运行时判定必须在同一个 PR（P2）落地，否则两阶段之间「新」标签会整体消失（§7）。

## 4. 布局方案

### 4.1 页面结构（自上而下）

```
Hero（缩矮：去掉大 emoji，标题 + 副标题一行）
Daily Hub（3 个固定任务 + 「更多每日 (11) ›」链接 → #cat=daily）
最近玩过（仅有记录时出现，横向一行，最多 6 个小卡）
新上线（仅有 45 天内新游戏时出现，横向滑动大卡，背景用 og-*.svg）
筛选条（sticky）：全部 · 每日挑战 · 动作 · 解谜 · 策略 · 科学
分区 × 5（标题 + 数量 + 卡片网格）
页脚（Perks 压缩为一行文字 + 语言 / 主题开关）
```

### 4.2 分区与筛选

- **分区由 gen 静态输出**：`<section class="games-cat" data-cat="science"><h2>…</h2><div class="games-grid">…</div></section>`。无 JS 时完整可用，SEO / JSON-LD 不受影响。
- **筛选条是渐进增强**：
  - 「全部」= 显示所有分区；选某分类 = 只显示该分区；「每日挑战」= 跨分区只显示带 daily 标签的卡（分区标题保留，空分区隐藏）。
  - 状态写入 `location.hash`（`#cat=science` / `#cat=daily`），可分享、可后退；不写 localStorage，避免回访时「看不到游戏」。
  - 筛选条 `role="tablist"` 不合适（内容不是互斥面板），用一组 `aria-pressed` 按钮 + `aria-controls`。
- **最近玩过**：首页点击卡片时把 id 写入 `site_recent`（`safe-storage`，最多 6 个，去重置顶）。不改任何游戏页面；从其他入口（more-games 条、直链）进入的游戏不计入，属可接受误差。

### 4.3 卡片

| 视口 | 形态 | 预期单卡高度 |
|---|---|---|
| ≥1280px | 4 列网格，`.games-section` 上限放宽到 ≈1200px | ≈160px |
| 601–1279px | `auto-fill, minmax(240px, 1fr)`（现状） | ≈172px |
| ≤600px | **单列横条**：图标 · 标题 + 一行简介 · 标签 · › | ≈72px |

- 手机单列横条：标题 `white-space: nowrap; text-overflow: ellipsis`，简介 `-webkit-line-clamp: 1`。26 款站内游戏 × 72px + 分区标题 ≈ 2300px，对比现状 3062px 约降 25%；配合筛选，实际滚动更短。
- **整卡一个 `<a class="game-card">`**（替换 `article onclick`）：去掉内部两个 `<a>`；「Play ›」按钮删除，改为卡片右侧 › 箭头（hover 时位移）。修复 P-8。
- **徽章改为文字胶囊**：`<span class="card-chip card-chip--new">新</span>`，放在标题行尾；颜色 + 文字双编码，触屏可见。修复 P-4。
- 外站卡：标题行加可见文字胶囊「站外 ↗ / External ↗」。整卡用 `aria-labelledby="<标题 id> <胶囊 id>"` 作为可访问名（读屏读到「点格棋 站外 ↗」），`aria-describedby` 指向简介。修复 P-9。

### 4.4 新上线横排

- 数据：`home.addedAt`（`YYYY-MM-DD`），由 `index-page.js` 在运行时与 UTC+8 今天比较，45 天内为新。注意格式：`src/platform/daily.js` 的 `todayKey()` 返回紧凑 `YYYYMMDD`，与 `addedAt` 同格式的是 `todayKeyDisplay()`（`YYYY-MM-DD`）；比较前统一转成 UTC 毫秒（`Date.UTC(y, m - 1, d)`）再算天数差，不要直接拿两种字符串比大小。
- **为什么放运行时**：放在 gen 里会让 `gen --check` 的结果随日期变化（今天绿、45 天后红），违反「派生物只取决于 registry」的约束。
- 视觉：大卡用游戏的 OG 图作背景，缺图时退回图标 + 渐变。
- **资源路径必须构建可见，禁止运行时拼 `og-${id}.svg`**：Vite 发现不了动态拼出的路径，源码下能用、`dist` 里 404（同类约束见 `docs/art-upgrades/tower-defense-production-art-upgrade-plan.md` §3.3、`src/games/needle-awn/render/art.js` 的字面 URL map）。做法：
  - 只用 `public/assets/seo/`（原样复制进 `dist/`，不 hash）里的文件；
  - 由 gen 在生成区里为每个有图的游戏写出**字面** URL，使用真正的 `<img class="new-game-art" src="/assets/seo/og-实际游戏ID.svg" alt="" loading="lazy" decoding="async">` 元素；这里的「实际游戏ID」由生成器在生成时替换成明确值，不能把该占位写入输出 HTML。gen 时先检查文件是否存在，不存在就不输出 `<img>`，仅保留 CSS 渐变和游戏图标兜底。游戏名称已有可见文字，装饰性图片使用空 `alt`；运行时 JS 只负责显隐，不构造路径。
  - **禁止生成内联 `style` 或 CSS `background-image` 属性来插入图片**：`tests/verify-css-debt.mjs` 冻结了 `index.html` 的内联样式数量，新添 inline style 会导致 CSS debt 校验失败。背景式铺放完全由 `css/home-cards.css` 的 `@layer contracts` 处理（例如 `.new-game-art` 绝对定位、`inset: 0; width: 100%; height: 100%; object-fit: cover`，容器裁剪溢出，图片上方使用 CSS 渐变叠层，文字保持可读）。不要在 JS 中设置 `element.style` 绕过这一约束。
- **现状覆盖（以实际进 `dist` 的 `public/assets/seo/` 为准）**：26 款里只有 14 款有图；10 款（lumen、circuit、silk-dew、echo-cave、maxwell-demon、ripple-duet、carrot-pull、firefly-signal、shadow-loom、loop-jail）的图只在源目录 `assets/seo/`，不会进 `dist`；crystal-bloom、flame-verse 两处都没有。
- 附带发现（P3 已一并修复，见 §7.2）：gen 给每个游戏页写的 `og:image` / `twitter:image` 都指向 `assets/seo/og-<id>.svg`，所以上面 10 + 2 款的社交分享预览图在生产环境已经是 404。

### 4.5 Daily Hub

- 现有 3 个任务保持不变（完成判定依赖各页的存储键，扩展需逐页登记）。
- 新增「更多每日 (11) ›」→ `#cat=daily`，解决 P-6 的入口问题。
- 远期（P4）：registry 增加 `daily.doneKey` 模板（如 `gs_daily_{YYYYMMDD}`），Hub 改为 registry 驱动，玩家可自选置顶的每日任务。

## 5. Registry 变更

```jsonc
// site.home
"categories": [
  { "key": "action",   "icon": "🕹️", "name": { "en": "Action & Arcade",  "zh": "动作街机" } },
  { "key": "puzzle",   "icon": "🧩", "name": { "en": "Puzzle",           "zh": "益智解谜" } },
  { "key": "strategy", "icon": "♟️", "name": { "en": "Board & Strategy", "zh": "棋盘策略" } },
  { "key": "science",  "icon": "🔬", "name": { "en": "Science Lab",      "zh": "科学实验室" } },
  { "key": "external", "icon": "↗",  "name": { "en": "More from Orangely", "zh": "站外作品" } }
],
// 每款游戏的 home
"home": {
  "iconClass": "…",
  "category": "science",      // 新增，必填，取值 ∈ categories[].key
  "rank": 30,                 // 新增，可选，区内排序
  "addedAt": "2026-10-12",    // 新增，可选，「新」标签与新上线横排
  "desc": { … },
  "tag": { … }                // 保留，降级为副标签
  // "badge" 删除
}
// externalGames[] 同样新增 category（dots → strategy，其余 → external）
```

UI 文案（`site.home.ui`）：P1 删除 `play`，新增 `badgeExternal`，保留 `badgeDaily` / `badgeNew` 作为胶囊文案；P2 / P3 再新增 `filterAll`、`filterDaily`、`recentTitle`、`newTitle`、`moreDaily`。

**Schema**：`games.schema.json` 的 `$defs.home` 是 `additionalProperties: false`，且目前只允许 `iconClass` / `desc` / `tag` / `badge`。P2 必须同步修改：新增 `category`（枚举，与 `site.home.categories[].key` 一致）、`rank`（number）、`addedAt`（`pattern: ^\d{4}-\d{2}-\d{2}$`），删除 `badge`；同一 PR 里 `index-page.js` 就要按 `addedAt` 判定「新」胶囊（§4.4 的日期比较），不能留到 P3。`site.home` 在 schema 里只是 `"type": "object"`，`categories` 与 `ui` 新 key 不受约束；`categories` 以及 `externalGames[].category` 的合法性由 `verify-index-cards` 守住（§6）。

## 6. 文件改动清单

| 文件 | 改动 |
|---|---|
| `games.config.json` | §5 字段；删除 `home.badge` |
| `games.schema.json` | `$defs.home` 加 `category` / `rank` / `addedAt`，删 `badge`（§5） |
| `js/index-i18n-zh.js` | gen 派生，不手改：`site.home.ui` 文案（P1 删 `play`、加 `badgeExternal`）和分类名变化后由 `npm run gen` 重写，随对应 PR 一起提交 |
| `tools/generators/gen-from-registry.mjs` | `homeCardLine()` 输出整卡 `<a>` + 文字胶囊；`homeCardsContent()` 按 `categories` 分组输出分区；zh map 增加分类名；P3 为新上线横排写出 `public/assets/seo/` 里存在的 OG 图**字面** URL（不存在则不输出，§4.4） |
| `index.html` | 只改 gen 区域外的骨架：筛选条、最近玩过 / 新上线容器、Perks 压缩 |
| `js/index-page.js` | 筛选 + hash 同步、`site_recent` 记录与渲染、新上线判定、「更多每日」计数；`applyLanguage` 去掉 `.play-btn` / `.card-badge`，改为本地化 `.card-chip`，增加分类标题；`markDarkOnlyCards()` 改挂到 `.card-header`（原来依赖 `.play-btn` 定位）；`injectStructuredData` 改读 `a.game-card[href]` |
| `css/home-cards.css`（新） | 分区标题、筛选条、≥1280px 4 列、≤600px 单列横条、文字胶囊、横排；P3 在本表内为 `.new-game-art` 实现背景式定位、裁切和渐变遮罩，**不通过生成的内联 `style` 实现**。**`css/index.css` 不改**：它属于 CSS P0/P5 冻结页，`verify-css-debt` 禁止新增 / 删除 / 改写其中的 unlayered 规则（规则数必须等于 P0 + 已登记迁移）。做法同 `css/stage-status.css`：附加样式表全部写在 `@layer contracts`，只在要压过冻结声明时用 `!important`，链接放在 `index.css` 之后、`mobile-fit.css` 之前 |
| `tests/lib/css/feature-additions.mjs` | 登记 home-cards 附加样式表：`HOME_CARDS_SELECTORS` 精确选择器白名单、唯一规范 `<link>` 与顺序校验、并入 `reviewFeatureStyles` 的 `cssPaths` / `stripHtml`；`tests/verify-css-feature-additions.mjs` 补负例。P2 / P3 新增的选择器逐条追加 |
| `css/index.css` 里的死规则 | `.card-badge*`、`.play-btn*` 在 P1 后无 DOM 使用者。可另起 `kind: "retire"` 事务（`tests/css-layer-migrations/rules/`，见 `docs/architecture-v2-css-layer-migration-plan-2026-09.md` P2-K）清理，不和功能改动混在同一 PR。✅ 2026-10-16 已退休：10 条规则 → `home-retire-*`；`--ix-card-badge-*` / `--ix-play-btn-*` 自定义属性仍被 `home-cards.css` 的胶囊与新上线大卡引用，保留 |
| `public/icons/home-icons.svg` | P1 删除不再使用的 `bookmark` symbol（与 `verify-index-cards` 的「已删除」断言对应） |
| `public/assets/seo/` | P3 把 10 张只在 `assets/seo/` 的 OG 图同步进来，补画 crystal-bloom / flame-verse（§4.4） |
| `tests/verify-index-cards.mjs` | **替换**现有断言：标题链接 / Play 链接 → 整卡 `<a class="game-card" href>`；切卡片用 `</a>` 而非 `</article>`；「书签 symbol 存在」→「已删除」；新增卡片区无 `article` / `onclick` / 嵌套链接、可访问名接线。P2 再加：`home.category` 必填且 ∈ `categories[].key`，`site.home.externalGames[].category` 同样必填且 ∈ `categories[].key`（`site.home` 不受 schema 约束，只能靠这里守住，否则拼错会让外站卡掉出分区）、`addedAt` 合法、无空分区、caps 含 daily ⟺ daily 胶囊 |
| `tests/verify-index-layout.mjs` | 新增：各视口列数（1440→4、1024→3、768→2、≤600→1）；≤600px 卡高 ≤80px；**不断词**单独判定（每个单词宽度 ≤ 标题盒宽，所有视口）；**不截断**只在 ≥360px 要求（`scrollWidth ≤ clientWidth`），320px 允许 §4.3 的省略号；卡片与页面不横向溢出。P2 再加筛选后可见卡数 = registry 计数 |
| `tests/smoke-index.mjs` | **替换**现有「空文字 + 图标 + tooltip 的 `.card-badge`」断言为：胶囊可见、文案按语言切换、不压标题、不溢出卡片；卡片内无嵌套可聚焦元素。P3 再加点击筛选、hash 往返、`site_recent` 写入；新上线横排必须使用静态 `img.new-game-art[src]`（不可为内联背景样式），对每张图在 **`dist` 服务器**验证请求返回 200，并检查缺图回退、可读性与无新增 inline style（`npm run build` 后 `node tests/verify-all.mjs <dist base>` 复验）；`verify-css-debt` 原有内联样式基线须通过 |
| `tests/verify-theme.mjs` | 「仅深色」标记的游戏 href 改从 `a.game-card` 读（标题不再是链接） |
| `docs/traps.md` | 若踩坑再补 |

## 7. 分阶段落地

| 阶段 | 内容 | 解决 | 风险 |
|---|---|---|---|
| **P1 卡片修复** | 整卡 `<a>`、文字胶囊（先沿用 `home.badge` 数据）、手机单列横条、桌面 4 列、外站 ↗；样式进新附加表 `css/home-cards.css` | P-2 P-4 P-7 P-8 P-9 | 低：不改 schema、不迁移分类、不动冻结的 `index.css`；registry 只动两条 `site.home.ui` 文案（删 `play`、加 `badgeExternal`） |
| **P2 分类** | `home.category` + `categories`、分区输出、筛选条 + hash、daily 胶囊改由 caps 派生、new 胶囊改由 `addedAt` 运行时判定（与删除 `home.badge` 同一 PR）、`home.tag` 降级 | P-1 P-3 P-5 | 中：gen 与 i18n 同步改 |
| **P3 发现** | 最近玩过、新上线横排（复用 P2 的 `addedAt` 判定；gen 写字面 `<img>` URL，图片定位由 `home-cards.css` 负责，不新增内联 `style`）、「更多每日」、Perks 压缩；把 10 张只在 `assets/seo/` 的 OG 图同步进 `public/assets/seo/`，补画 crystal-bloom / flame-verse | P-6 P-10 | 低 |
| **P4 可选** | Daily Hub registry 化（`daily.doneKey`）、基于 Analytics V2 的「🔥 热门」标签 | P-6 完整版 | 中：依赖 Analytics V2 上线 |

每个阶段独立 PR，`npm run verify` 全绿后合入；P1 合入前后各截一组 390 / 1440 截图附在 PR 中。

### 7.1 P2 落地记录（2026-10-15）

- §8 决策全部取建议默认值：D-1 dots → `strategy`；D-2 gravity-slingshot → `puzzle`；D-3 45 天；D-5 不记忆（只用 hash）。
- `site.home.categories` 新增可选 `filter: false`（只用于 `external`），筛选条因此是「全部 · 每日挑战 · 动作 · 解谜 · 策略 · 科学」，与 §4.1 一致。
- `home.rank` 只给动作区写了（按 §3.2 表格顺序：needle-awn → … → math-rain）；其余分区的登记顺序本来就等于表格顺序，不写 rank。
- `home.addedAt` 只写给原先 `badge: "new"` 的 6 款（needle-awn / sword-flight 2026-09-15，carrot-pull / shadow-loom 2026-09-26，firefly-signal 2026-09-27，loop-jail 2026-10-13，取各自首个提交日）。没有写给全部游戏：除最早 4 款外都在 2026-09-12 之后上线，按 45 天窗口当前会有 22 款同时「新」，重新回到 P-4 的「不稀缺」。今天之后新上线的游戏都应写 `addedAt`。
- `index-page.js` 预算从 12 KiB 放到 14 KiB（筛选 + 「新」判定）。
- **胶囊位置改到简介行首**（修订 §4.3「放在标题行尾」）：P2 让 needle-awn / sword-flight 同时「每日 + 新」，浅色下再加「仅深色」共三枚；手机标题行不换行，中文 360px 时「针尖对麦芒」被挤成省略号，320px 只剩 19px（PR #147 review）。冻结的 `.card-header { display:flex }` 与本表已冻结的 `!important` 排除了纯 CSS 改栅格的路，于是改标记：`.card-desc` 里先是 `.card-chips`、再是 `.card-desc-text`（`aria-describedby` 指向后者，可访问描述不含胶囊文字）。标题独占标题行，被行数截断的只会是简介；隐藏的「仅深色」不占位。`verify-index-layout` 冻结时钟、加中文 + 浅色手机档（且断言确有三枚胶囊同卡），标题被挤到不足自身宽度一半即失败。
- 筛选后卡数 = registry 计数、hash 往返 / 后退 / 直链 / 非法 hash、「新」胶囊在冻结时钟下的期望集合与远期时钟下为空，都在 `tests/smoke-index.mjs`；registry 侧（分类合法、无空分区、区内顺序、daily ⟺ cap、`data-added` ⟺ `addedAt`、schema 枚举 = categories）在 `tests/verify-index-cards.mjs`。

### 7.2 P3 落地记录（2026-10-15）

- **OG 图单一来源 `public/assets/seo/`**：10 张只在根目录 `assets/seo/` 的图移进 `public/`，补画 crystal-bloom / flame-verse；根目录副本删除（13 张与 `public/` 逐字节相同，`og-tower-defense.svg` 是 #36 美术升级前的旧版，以 `public/` 的新版为准）。dev 与 `tests/lib/serve-static.mjs` 都在根目录缺文件时回退到 `public/`，所以 `og:image` 的相对路径不变，生产 404 一并消失。`verify-index-cards` 断言 26 款 + collection 全在 `public/`、根目录 `assets/seo/` 不存在。
- **新上线横排**：gen 区域 `home-new` 写出全部带 `addedAt` 的游戏（新者在前，同日按登记顺序），`<img class="new-game-art">` 为字面 URL、文件存在才输出；`index-page.js` 用与「新」胶囊同一个判定移除过期大卡，一张不剩就保持整行 `hidden`。图标用 `new-icon card-icon--<x>`：冻结的 `.card-icon` 只能靠 `!important` 改尺寸，而 home-cards 的 `!important` 数量在 main 上已冻结，配色类只有底色 / 前景色，可以直接复用。
- **封面用游戏自己的美术**（修订 §4.4「大卡用游戏的 OG 图作背景」）：OG 图里不少是早期占位 SVG（拔萝卜、影织的远不如原画），所以新上线优先用 `public/assets/home-covers/<id>.webp`（640×360），没有才退回 OG 图。封面由 `tools/generators/game-covers.mjs` 从游戏素材生成、产物入库：拔萝卜 / 针尖对麦芒裁概念原画；影织在真实游戏里把「兔」直接摆到内核解；萤火信号用测试求解器在 Node 里解「仲夏」、浏览器按同 seed 同输入回放到通关，取 25/30 只齐闪后的一帧（画布像素，不截 DOM）。画牢、御剑飞行没有手绘素材，仍用 OG 图，卡片带 `new-card--og` 压深底部（图里自带标题），美术封面只压一条浅渐变。`verify-index-cards` 断言这四款必须有素材封面。
- **分享图也换成美术**：同一个 `tools/generators/game-covers.mjs` 每个配方同时产出 1200×630 的 `public/assets/seo/og-<id>.jpg`（多数社交平台本来就不渲染 SVG 的 og:image），gen 的 `og:image` / JSON-LD 脚本优先用 JPEG、没有才用 SVG；这四款原来的占位 SVG（拔萝卜、影织、萤火信号、针尖对麦芒）已删除，`verify-index-cards` 断言有 JPEG 的游戏不得再留 SVG、且页面 og:image 指向实际存在的那一张。随后把其余有美术素材的四款也换掉：数字雨裁星空天文台原画；霓虹塔防在真实游戏里沿航线铺 8 座四种塔、发第一波后取战场画面；蛛丝引露取第一关夜园（露珠、星点、玉盏）；坦克大战的画布固定 800×600 且开局战场很空，改用它自己的 SVG 精灵（地块 / 砖墙 / 钢板 / 坦克 / 道具）在离屏画布上摆一幕放大的交火，矢量按目标分辨率光栅化不发糊。这四款的 SVG 也已删除（`verify-td-art` 改为：有 JPEG 时不再要求 SVG 卡片文案，退役文案守卫仍覆盖首页文案）。首页封面只给有 `addedAt` 的游戏生成，`verify-index-cards` 断言 `home-covers/` 里没有用不上的文件。其余 18 款没有手绘 / 矢量美术素材，仍用 SVG 分享图。
- **最近玩过**：`site_recent`（safe-storage，最多 6 个，去重置顶），只记 `.idx-main` 内带 `data-game-id` 的链接点击（含中键）；名字取自当前语言的卡片标题，换语言重渲染；未知 id 跳过。
- **「更多每日 (N)」**：Daily Hub 内的链接，N = 带「每日」胶囊的卡减去 Hub 已列出的三项（当前 11）；点击走与筛选按钮同一个 `setFilter('daily')` 并跳到分区开头。
- **D-6**：hero 大 emoji 删除；Perks 三卡删除、压成页脚一行 `perksLine`（删掉 6 条 `perk*` 文案）。都是删标记，没有用 CSS 隐藏冻结规则。
- 预算：`index.html` 38 → 44 KiB（新上线横排）。
- **首页运行时模块化**：原 `js/index-page.js`（P3 后约 17.7 KB，混着 i18n / 胶囊 / 筛选 / 最近玩过 / Hub / SEO / 主题开关）拆成 `src/home/` 包，组合根 `src/home/index.js`；`i18n.js` 提供 `onLanguage()`，胶囊文案与最近玩过各自挂钩子，不再由 `applyLanguage` 反向调用。`js/index-page.js` 只剩入口（注入 gen 产物 `js/index-i18n-zh.js` 的懒加载器）。Hub 改用 `platform/daily.js` 的 UTC+8 日期与 safe-storage（原先手写 `+8h` 与裸 `localStorage`）。预算改为入口 ≤1 KiB、单模块 ≤5 KiB、整包 ≤24 KiB；`verify-no-game-lang` 扫描范围加 `src/home/`，豁免从入口移到组合根。`smoke-index` 在拆分前后同样全绿（另补 Hub 完成态与昵称写回的断言）。
- 新上线 OG 图在 `dist` 服务器上逐张请求 200（`npm run build` 后用 `smoke-index` 跑 `dist/`）。

## 8. 待决策

| # | 问题 | 建议默认值 |
|---|---|---|
| D-1 | 点格棋（外站）归 `strategy` 还是 `external` | `strategy` + ↗ 标识 |
| D-2 | gravity-slingshot 归 `puzzle` 还是 `science` | `puzzle`（非科学系列、且是 Hub 固定项） |
| D-3 | 「新」的有效期 | 45 天 |
| D-4 | 手机端是否保留每卡一行简介 | 保留 1 行；若仍嫌长，再降为仅标题 + 胶囊 |
| D-5 | 筛选状态是否跨访问记忆 | 不记忆（仅 hash），回访默认「全部」 |
| D-6 | Hero 大 emoji 与 Perks 区是否删除 | Hero 缩矮保留标题；Perks 压成页脚一行 |

## 9. index.html 结构说明（2026-10-18 从页面注释移出）

这些说明原本是 `index.html` 里的 HTML 注释。Vite 不压缩 HTML，注释会原样发给每位访客；而且注释是不重复的文字，几乎压不动（13 段共 1.9 KB，gzip 后约 1.4 KB，占首页传输体积约 16%）。所以移到这里，页面里只保留 gen 的 `registry:begin/end` 哨兵。`tests/verify-index-cards.mjs` 断言首页没有哨兵以外的注释。

| 位置 | 说明 |
|---|---|
| `<head>` 主题三行（`theme-support` / `theme-color` / `theme-boot.js`） | 首页不在注册表里，手写；顺序与 gen 的 head 区域一致（`docs/contracts/theme.md` §3）。首页支持浅色（P1），所以页脚的主题开关会显现 |
| 样式表 `tokens.css → layout.css → index.css` | 共享骨架的 authoring 顺序。index 自己的 54 个类名与共享层的 38 个选择器零交集（已核对），只为页脚复用 `.game-footer` 与 `--tok-*` 配色。P6 后生产构建不再做 stylesheet link 重排，P4/P5 行为门禁已冻结该契约 |
| `css/home-cards.css` | 首页卡片附加样式表：P0 冻结后不改 `index.css`，见 `tests/lib/css/feature-additions.mjs` |
| `<header class="hero">` | Hero |
| `<main class="idx-main">` 开头 | Daily Hub |
| `#hub-more-daily` | 其余每日玩法的入口（§4.5）：跳到 `#cat=daily`；数量由 `src/home/daily-hub.js` 按卡片上的「每日」胶囊减去上面三项算出，绑定后才显现 |
| `<section class="games-section">` | Games |
| `#home-recent` | 最近玩过（§4.2）：首页点卡片时写 `site_recent`，有记录才由 `src/home/recent.js` 渲染显现 |
| `home-new` 区域 | 新上线横排由 `games.config.json` 的 `home.addedAt` 生成，45 天窗口在运行时裁剪（§4.4） |
| `home-filter` / `home-cards` 区域 | 筛选条与分区都由 `games.config.json` 生成（`site.home.categories` / `home.category`，P2）；筛选条渐进增强，`src/home/filter.js` 绑定后才显现 |
| 页脚 `.game-footer` | 接入共享 `.game-footer`（`css/layout.css`）：长页面滚到底也能切语言。index 是「更多游戏」页本身，故不放 More 钮；hero 右上角那颗语言钮保留 |
| `#perks-line` | 原 Perks 三张卡（对回访玩家没有信息量）压成页脚一行（§8 D-6） |
| `#theme-switch` | 主题三档（全站唯一写 `site_theme` 的地方，见 `docs/contracts/theme.md`）。首页声明支持浅色之前保持 `hidden`，由 `src/home/theme-switch.js` 按 `theme-support` 显现 |
