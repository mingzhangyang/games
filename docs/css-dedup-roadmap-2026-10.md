# CSS 精简路线图（2026-10）

> 用途：PR #117（标准动作按钮 family）之后，继续"打通全站、去除冗余与重复 CSS"的执行底稿。
> 每个工作项都可以在新 session 里独立领取执行；做完一项就在本文件里更新状态。
> 数据快照：PR #117 分支头（`refactor/css-action-button-family`，2026-10-08）。**开工前先按 §5 重跑审计**，数字以重跑结果为准。

## 0. 原则

1. **能统一就统一，个例服从原则。** 各游戏共通的功能元素（按钮、榜单、开始菜单、结算浮层、侧栏卡片……）在全站保持一致，现有样式可以改。
2. 只有**语义上确实不同**的东西才保留页面级修饰（例如 `.pm-btn-daily` 标记的是不同模式），而且要在 PR 里写明理由。
3. **只改配色**的页面残余（color / background / border / box-shadow 等页面调色板）按 `docs/contracts/style.md` 允许保留；**几何 / 字体偏差**（尺寸、圆角、内距、字号、字重、间距）一律收敛到共享值。
4. 一个 PR 只做一个簇，或者一种类型（精确重复 / 结构重复），评审时才分得清这次是"删冗余"还是"统一视觉"。#117 一次覆盖 13 页，走了 6 轮评审，就是范围太大的教训。
5. 改共享值会影响已经合规的页面，这种情况**先问**；其余收敛直接做。

## 1. 现状快照

| 指标 | 数值 |
|---|---|
| 普通 CSS 规则 | 2727 |
| 精确重复 / 结构重复 / 本地 | 471 / 65 / 2191 |
| 重复族 | 119 个（精确 100 + 结构 19） |
| 理论可删 | 约 **433 条规则 / 1421 条声明** |

按簇分布（可删数 = 规则副本 / 声明副本）：

| 簇 | 精确重复 | 结构重复 | 主要重复族 | 涉及页面 |
|---|---|---|---|---|
| **A 开始菜单 / 选关** | 145 / 412 | 32 / 276 | `level-grid`、`level-label`、`subtitle`、`par`、`howto`、`card-line`、`start-footer`、`chip-stars`、`chip-num`、`mode-row`；结构类：`chip`、`mode`、`title`、`daily-best`、`level-chip` | 9 个解谜页：circuit、crystal-bloom、echo-cave、flame-verse、gravity-slingshot、lumen、maxwell-demon、ripple-duet、silk-dew |
| **B 侧栏卡片** | 44 / 168 | 0 | `side-row`、`legend-row/dot/text`、`side-records`、`card-title`、`side-legend` | 同上 + bond-forge |
| **C 结算浮层** | 28 / 80 | 13 / 75 | `over-sub`、`cut-value`、`over-score`（含手机 @media）；结构类：`over-score`、`cut-box` | 同上 |
| **D 全站零散** | 57 / 99 | 0 | `*`（22 份）、`.hidden`（19 份）、`.xx-icon-btn:active`（17 份） | 几乎所有页 |
| **其他** | 97 / 195 | 17 / 116 | `game-shell`、`lb-empty`、`lang-btn`、`action-row/btn @media ≤480`、reduced-motion 选择器列表、`toast.*`、`lb-row.top1-3` 等 | 分散 |

⚠️ 审计会把页面前缀归一成 `.game-*`，所以 cb/ec 等页的**玩法按钮** `.xx-action-btn`（`.is-broke` / `.is-dimmed`）会显示成 `.game-action-btn.*`。它们**不属于**标准动作按钮 family，别误收编。

## 2. 例外清单（2026-10-08 盘点）

### 2.1 应该统一的一致性例外

| 例外 | 现状登记 | 对应工作项 |
|---|---|---|
| 排行榜 bond-forge：12 个组件里 9 个没接入，自带整套榜单几何 | `verify-leaderboard-layout` 里写成 `bond-forge-exception` | W1 |
| 排行榜 tower-defense：容器/标题/列表/行/rank/score/用户名行/输入框共 9 处几何偏差 | `tower-defense-exception` | W1 |
| 排行榜 planet-merge：容器 max-width、标题没接入、列表 min/max-height、空态 padding | `planet-merge-exception` | W1 |
| 排行榜 minesweeper：容器 `.ms-lb` 没接入（width/radius/padding） | `minesweeper-exception` | W1 |
| 排行榜 hoop-shot：容器 max-width | 没登记，只是残余规则 | W1 |
| `game-lb-empty`：cb/ec/fv/md/rd/sd 六页写的是同一份样式，但没接入 | 没登记 | W1 |
| 动作按钮 family 的手机端残余：`.xx-action-row` / `.xx-btn` 在 `@media (width <= 480px)` 下的重复 | 没登记 | W2 |

### 2.2 真缺口（bug / 覆盖缺失，单独修）

| 缺口 | 登记 | 工作项 |
|---|---|---|
| `verify-button-icons` 没覆盖 tetris、minesweeper 的结果按钮 | `docs/backlog.md`，校验器 `exempt` | W6 |
| tetris 桌面宽屏棋盘发虚（画布后端缓冲固定 400×800） | `docs/backlog.md`，`verify-desktop-frame` knownGaps | W6 |

### 2.3 保留的例外（有充分理由，不在本路线图内）

- **页面骨架**：index（落地页）、tank-battle（横屏掌机）、math-rain（全屏街机 HUD）不套 shell / 三槽顶栏。见 `layout.md` §6、`chrome.md`、`tests/architecture-v2-debt-baseline.json`。
- **Immersive**：TD 手机横屏战斗时舞台铺满全屏、顶栏悬浮；TD 桌面显示 stats 按钮。见 `layout.md` §7。TD 菜单态的结构规则还没分层，随 W3 的 start-menu 收口一起处理。
- **仅深色主题**：11 页（`theme.md` 有逐页理由）。math-rain 浅色暂缓。
- **校验器里合理的豁免**：`verify-stats-drawer` 豁免 tetris（有专门校验器）；`verify-sfx` 豁免共享音效模块本身和 sword-flight / needle-awn / math-rain 自带的音频引擎；`verify-no-game-lang` 放行 word-daily 的词库切换钮；emoji 审计放行扫雷笑脸；`verify-button-icons` 豁免 gomoku（它没有图标按钮）。
- **math-rain** 免 eslint / stylelint / token-swap 检查（老式架构）。

### 2.4 待拍板

- planet-merge 的 "Daily Challenge" 按钮仍是蓝底白字，和旁边 Endless 的共享渐变不一致。要统一就得新增一个共享的"次要强调"按钮变体。
- planet-merge、gravity-slingshot 被定为仅深色，理由只有"太空题材"。要不要支持浅色？

## 3. 工作项（建议顺序）

前置：**PR #117 合并到 `main`**。下面每一项都从最新 `main` 开新分支，单独一个 PR。

### W1 排行榜例外收编（优先，规模中等）
- 范围：§2.1 里的排行榜各项。
- 关键障碍：账本是 append-only 的，`leaderboard-v1` 已经在 `main` 上，不能修改，只能追加新事务（例如 `leaderboard-v2`）。可是 `verifyNewExtraction` 要求共享选择器"在 base 中不存在"，`expectedRuleDelta` 又按"组件数 − 删除数"计算。所以要先扩展契约，支持"引用已有共享规则"的组件（或 `extends: 'leaderboard-v1'`）：这类组件不计入新增规则，同时校验共享规则保持不变。
- 排行榜可能还要收敛 max-width、max-height、min-height、gap、letter-spacing、margin-top。可以扩展 `participantConvergedProperties` 的白名单，但只加视觉尺寸类属性；display、position、flex 继续保护。
- `game-lb-empty`：六页一致而共享值不同时，判断是收敛到共享值还是改共享值；改共享值要先问。
- 收尾：删掉 `verify-leaderboard-layout` 里的 4 个 `*-exception` 用例，改为标准断言，并做反向验证。
- 完整执行提示词见附录 A。

### W2 收尾动作按钮 family（小）
- 动作按钮 family 在手机端（`@media (width <= 480px)`）的 `.xx-action-row` / `.xx-btn` 重复，用 `reviewedRuleRetirements` 退役。如果确实需要手机尺寸，就在 `layout.css` 里加一条共享的 `@media` 规则（需要契约支持带上下文的共享规则，先评估）。
- 顺手确认还有没有页面在标准动作上写 `.xx-btn` 几何（`grep -n "\-btn {" css/*.css` 并人工判断）。

### W3 簇 D：全站零散精确重复（小，低风险）
- `.hidden`（19 份）：在 `layout.css` 里建共享规则，删除页面副本。注意有的页面靠 `.hidden` 驱动 `:has(> .game-overlay--menu:not(.hidden))`，语义必须保持一致。
- `.xx-icon-btn:active`（17 份）：`layout.css` 第 368 行已有 `.game-icon-btn:active { transform: scale(0.92); }`。确认各页都挂了 `game-icon-btn` 后，页面副本直接退役。
- `*`（22 份）：审计把它和 reset 层的 `*, *::before, *::after` 算成两个选择器族。先比对声明（可能带 margin/padding:0），再决定是并入 reset 层还是统一写法。
- 预计删约 57 条规则。

### W4 簇 A：开始菜单 / 选关（最大，拆两个 PR）
- **A1（精确重复）**：`level-grid`、`level-label`、`subtitle`、`par`、`howto`、`card-line`、`start-footer`、`chip-stars`、`chip-num`、`mode-row`，以及它们的手机 `@media` 副本。约 145 条规则 / 412 条声明。不涉及主题收敛。
- **A2（结构重复）**：`chip`、`mode`、`title`、`daily-best`、`level-chip` 及其 `:hover` / `:active`。各页配色不同，需要逐项审主题收敛。约 32 条规则 / 276 条声明。
- 先动手前置检查：这些规则有没有被 `css/science-showcase.css` 里 P0 冻结的 `!important` 规则覆盖（五个科学页的 `.xx-mode` / `.xx-chip` 都在它的选择器列表里），有就提前规划 narrowing / prune。
- TD 菜单态那条未分层的结构例外，评估能否在这里一起收口。

### W5 簇 C 结算浮层 + 簇 B 侧栏卡片（中等，可各开一个 PR）
- C：`over-score`、`over-sub`、`cut-box`、`cut-value`（含手机 @media）。
- B：`side-row`、`side-records`、`side-legend`、`legend-*`、`card-title`。
- 涉及页面和 A 是同一批，复用 W4 建立的模式。

### W6 真缺口（独立的 bug 修复）
- tetris / minesweeper 结果按钮补进 `verify-button-icons` 的 `TARGETS`，删掉 `exempt`（见 backlog）。
- tetris 桌面画布发虚：把逻辑坐标从 `canvas.width` 里剥出来，不再是 knownGap 后删掉降级（见 backlog）。

## 4. 可用的契约机制（#117 起）

都在 `tests/lib/css/family-extraction.mjs`，登记在 `tests/css-family-extraction-state.json`：

| 机制 | 用途 | 限制 |
|---|---|---|
| `components[].participants / fullyRemoved` | 页面规则并入共享规则 | 残余必须恰好等于"源规则减共享规则" |
| `convergedThemeProperties` | 组件级主题收敛 | 只限 color、background(-color)、border(-color)、box-shadow、filter、opacity |
| `participantConvergedProperties` | 按页收敛（页面值让位给共享值，或删掉页面独有的声明） | 主题属性 + font-size、font-weight、padding、border-radius、transition、backdrop-filter；需要更多属性就扩展白名单，只加视觉类 |
| `inheritedEquivalentProperties` | 共享规则写了、页面靠继承得到的同等属性 | 目前只审了 `text-align` |
| `reviewedRuleRetirements` | 整条删除页面规则（可以在 `@media` 里） | 选择器必须全部带该页前缀；声明只能是主题 / 几何属性 |
| `reviewedSelectorPrunes` | 从页面规则的选择器列表里删掉若干选择器 | 只能删除，不能改写；只限页面 CSS |
| `reviewedSelectorNarrowings` | 给共享文件（如 `science-showcase.css`）的选择器插入 `:not(.<本事务的共享类>)` | 声明必须逐字不变；改动会映射到 P0 的 `!important` 账本 |
| `retiredCustomProperties` | 删掉不再被消费的页面变量 | 每次运行都会检查当前代码里有没有重新定义或重新使用 |
| `requiresAdoption:false` 状态组件 | `:hover` / `:active` 等状态规则 | 参与页必须是锚点组件参与页的子集 |
| fallback 链 | 同一属性重复出现，作为一条有序回退链 | 必须整链搬迁，或者完全不动 |

## 5. 每个 PR 的执行清单

1. **重跑审计**：`node tests/verify-css-duplication.mjs --json`，按目标簇列出逐页"现有值 → 共享值"对照表，写进 PR 描述。
2. **读前置文档**：`CLAUDE.md`、`docs/contracts/layout.md`、`docs/contracts/style.md`、`docs/traps.md`，以及账本里已有的事务。
3. **追加账本**：已经在 `main` 上的事务不能改，只能追加新事务。新事务的 `baseDuplicationDigest` 等于 `main` 上的 digest。
4. **改代码**：
   - HTML 和 runtime（`className` 字面量）两边都要挂共享类；
   - 删除页面规则，连同手机 @media 副本、自带的状态规则和不再被消费的变量；
   - 文档（`CLAUDE.md`、`layout.md`、`style.md`）里写清楚新的共享归属，不留过时的例外描述。
5. **重算基线**：`tests/css-duplication-audit-contract.json` 里的 expectedOrdinaryRuleCount、categoryCounts、digest、family 数。
6. **校验**：
   - 离线：`verify-css-family-extraction`、`verify-css-debt`、`verify-css-duplication`、`npm run lint`。
   - 全量：`npm run verify`。本容器有两个已知的环境性失败：`verify-theme` 会被编排器的 180s 超时杀掉，要单独跑 `node tests/verify-theme.mjs <base>`（serve → 跑 → kill 写在同一条命令里）；`verify-tetris-drawer` 会因为代理拦截 analytics 请求而失败。
   - 截图：受影响页 × {390×844, 1280×900} × {深色, 浅色（支持的页）}，自己看一遍。
   - 反向验证：恢复任意一条被删的规则，debt guard 必须变红；契约的新机制都要有单测和反向用例。
7. **PR**：订阅 PR 动态，处理 CI 和 Copilot review。review 摘要里的 "Previously missed" 不在评论线程里，也要逐条处理或说明理由。

## 6. 已知陷阱（来自 #115–#117）

- **P0 冻结**：`css/science-showcase.css` 等文件里的 `!important` 规则在 P0 快照中冻结，直接改选择器会让 `verify-css-debt` 报错。只能走 narrowing / prune 登记。
- **规则数冻结**：在 `layout.css` 里额外加规则或自定义属性，都会打破"P5 + 事务增量"的规则数校验，必须作为事务的一部分登记。
- **hover 优先级**：通用 hover 要用 `:where()` 降到零特异度，否则会盖掉 `--primary` 的渐变（见 `tests/verify-td-btn-hover.mjs` 的背景说明）。
- **对比度**：浅色主题下主按钮渐变的端点对比度要 ≥4.5:1。`verify-theme` 会强制 hover 态并审计，结果浮层默认隐藏，审计会自己暴露它们。
- **页面修饰类的优先级**：页面修饰类（如 `.pm-btn-daily`）不分层、特异度 (0,1,0)，会天然压过分层的共享规则。这是有意保留的语义修饰，不要误删。
- **重复审计的命名归一**：见 §1 末尾的提醒。

## 附录 A：W1 排行榜收编的执行提示词

```markdown
# 任务：单开一个 PR，把排行榜 family 的页面级例外收编进共享 `game-lb-*`

先完整阅读 docs/css-dedup-roadmap-2026-10.md（尤其 §0 原则、§4 契约机制、§5 执行清单、§6 陷阱），按其中 W1 执行。

前置：确认 PR #117 已合并到 main，否则停下来告诉我。从最新 main 开分支 `refactor/css-leaderboard-convergence`。

范围（动手前用代码复核）：
- bond-forge：12 个组件里 9 个没接入，`.bf-lb` 残余 display/flex-direction/gap/padding/text-align，`.bf-lb-score` 残余 flex/font-weight
- tower-defense：`.td-lb` max-width/border-radius/padding；title font-weight/letter-spacing；list max-height；row font-size/padding/border-radius/transition；rank、score font-weight；username-row margin-top；username border-radius/padding/transition
- planet-merge：`.pm-lb` max-width；`.pm-lb-title` 没接入；list min/max-height；empty padding
- minesweeper：`.ms-lb` 没接入（width/border-radius/padding）
- hoop-shot：`.hs-lb` max-width
- `game-lb-empty`：cb/ec/fv/md/rd/sd 六页写的是同一份样式，但没接入

要求：
1. 所有 `.xx-lb-*` 元素（HTML 和 runtime 的 className 字面量）都挂上对应的 `game-lb-*`；几何残余删除，只改配色的残余保留；不再被消费的变量退役。
2. leaderboard-v1 不能修改，追加新事务。先扩展契约，支持"引用已有共享规则"的组件：不计入新增规则，同时校验共享规则保持不变。新机制要严格、带单测和反向用例。
3. 需要收敛白名单以外的属性时，只加视觉尺寸类（max-width、max-height、min-height、gap、letter-spacing、margin-top 等），布局 / 行为属性继续保护。
4. `game-lb-empty` 的共享值如果需要改，先问我；其余收敛直接做。
5. 删掉 `verify-leaderboard-layout` 里的 4 个 `*-exception` 用例，改为标准断言，并做反向验证。
6. 重算 duplication 基线；在 CLAUDE.md / layout.md / style.md 里写成"排行榜无页面级几何例外"。
7. 按 §5 完成验证后开 PR（描述里放逐页"现有值 → 共享值"对照表、契约扩展说明、规则数变化、验证结果），订阅 PR 动态，直到 CI 全绿、Copilot review 处理完。
```
