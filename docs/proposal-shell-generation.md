# 页面骨架与信息卡片的 registry 生成方案（Chrome 第 6 步）

> 状态：提案，未实施 · 2026-10-23 · 基线 main `fa2ad7d`
> Repository: `mingzhangyang/games`
> 范围：26 个 `topbar` 游戏页的样式表链接、页尾脚本、页脚、统计抽屉、侧栏信息卡片、结算 / 过关弹层与页内排行榜，以及关卡解谜十页 runtime 里的重复代码
> 不在范围：舞台内部（画布、状态行内容）、各游戏自有的开始菜单内容、`index.html`、`math-rain` / `tank-battle`（豁免页）

## 1. 背景：顶栏这一轮为什么做得成

顶栏第 1–5b 步（#170–#178）把 26 页手写的 `<header>` 改成由 `games.config.json` 生成，过程中验证了几条做法：

1. **声明的是角色，不是 HTML。** `chrome.actions` 只写 `['restart', 'stats', 'sound']` 这样的角色列表，通用属性、SVG、约定 id 由共享模板派生；历史特例用稀疏的 `chrome.overrides` 原样保留。
2. **一个渲染源。** `src/platform/shell/render-topbar.js` 同时供 `npm run gen`（静态写入 `registry:begin/end topbar` 区域）和新游戏脚手架 `render-game-shell.js` 使用，两边不会再分叉。
3. **先零差异，再改行为。** 5a 只换生成方式：逐页比对解析后的 header outerHTML（26/26 相同），再做全站静态截图像素比对（52/52 无差异）；5b 才引入手机溢出菜单这类行为变化。
4. **校验器锁住生成区。** `verify-topbar-registry` 断言生成区与渲染器逐字一致，`gen --check` 防漂移；行为由浏览器校验器（`verify-topbar-overflow` 等）锁定，新断言都做反向验证。
5. **运行时只有一个所有者。** 溢出菜单的代理项只调用原按钮一次，不复制游戏的处理函数。

本文盘点还有哪些组件适合同样处理。

## 2. 判断标准

适合改成 registry 生成的组件同时满足：

- **结构各页相同，内容由 i18n / JS 填。** 生成的是空壳与约定 id，文案和数据仍由页面运行时写入。
- **差异是无意的漂移，不是有意的设计。** 比如漏了共享类、有的用 `data-i18n` 有的靠 JS 写文案。
- **是一段连续区域。** 生成器用一对起止标记整块替换；要包住手写内容（如舞台）就得把标记拆到开、闭标签两侧，收益小、风险大。
- **最好已有可推导的 registry 事实**（cap、`scores.ui`、`layout`），否则需要新增字段，并说明为什么值得。

不适合的信号：每页内容本身不同（开始菜单的标题、模式说明）、只有一两页用、或与画布坐标耦合。

## 3. 现状盘点（main `fa2ad7d`）

### 3.1 HTML 结构

方法：用 parse5 解析 26 个 `topbar` 页，把页面前缀替换成占位符，去掉文本节点与 SVG 后比较结构，相同结构归为一组。

| 组件 | 出现页数 | 不同结构数 | 说明 |
| --- | ---: | ---: | --- |
| 统计抽屉骨架（`.game-drawer`） | 16 | 3 | 14 页完全相同；tetris（id 无前缀）、circuit 只多 i18n 属性。新游戏脚手架里的版本缺 `game-drawer-handle`、标题用 `<strong>`、关闭钮缺 `game-drawer-close`，已与现有页分叉 |
| 样式表 `<link>` 组合 | 26 | 6 | 顺序固定：`tokens → layout → [science-showcase] → 页面 CSS → [scoreboard-dialog] → [stage-status] → mobile-fit → more-games`（顺序由 `verify-architecture` 校验） |
| 页尾脚本（入口模块 + analytics + sw-register） | 26 | 1 | 完全相同，只差入口路径（已在 registry 的 `entry`） |
| 页脚（`.game-footer`） | 26 | 7 | 3 行的块，差别只在有无 `id`、`data-i18n`、`data-i18n-touch`，minesweeper 的提示类名不同 |
| 侧栏信息卡片（`.game-side-card`） | 17 | 40 | 实际只有约 6 类：玩法说明、记录、图例、操作键、规则、更多游戏（见 §4.2） |
| 每日结果弹层（`#xx-over`） | 15 | 11 | 关卡解谜十页各约 19 行，结构相同但有漂移（见 §4.3） |
| 过关弹层（`#xx-clear`） | 9 | 5 | 约 11 行，星级 + 下一关 / 重玩 / 菜单 |
| 开始菜单（`#xx-start`） | 20 | 16 | 内容各游戏自有 |
| 暂停层（`#xx-pause`） | 6（+2） | 5（+2） | 7–9 行；needle-awn / sword-flight 另有 `overlay-pause` |

样式表里的三个可选项：

- `scoreboard-dialog.css` 恰好等于 `scores.ui === "dialog"`（7 页），**可推导**。
- `science-showcase.css` 只有 9 个科学页中的 5 页（echo-cave / maxwell-demon / crystal-bloom / flame-verse / ripple-duet）引用，**没有对应的 registry 事实**，需新增声明。
- `stage-status.css` 26 页中 22 页引用（gomoku / loop-jail / magnetic-garden / sudoku-mist 不引用），**需新增声明**。
- 页面 CSS 文件名只有 gravity-slingshot 例外（`css/gravity.css`）。

### 3.2 关卡解谜十页的 runtime 重复

十页：gravity-slingshot / lumen / circuit / silk-dew / bond-forge / echo-cave / maxwell-demon / crystal-bloom / flame-verse / ripple-duet。它们的元素查找表几乎相同（`-clear`、`-clear-stars`、`-btn-next`、`-btn-replay`、`-over`、`-over-score`、`-btn-again`、`-btn-copy`、`-lb-list`、`-username` …）。

方法：从各页 `runtime.js` 取出同名方法体，替换页面前缀后比较。

| 方法 | 出现的 runtime 数 | 合计行数 | 去前缀后不同版本数 |
| --- | ---: | ---: | ---: |
| `renderLevelGrid` | 8 | 207 | 7（只差前缀与一个进度字段名） |
| `renderBoard` | 6 | 208 | 2 |
| `readLocalBoard` | 6 | 65 | 6 |
| `renderSideRecords` | 5 | 159 | 5 |
| `copyResult` | 10 | 213 | 10 |
| `finishDaily` | 10 | 189 | 10 |
| `applyLanguage` | 10 | 303 | 10 |

`copyResult` / `finishDaily` / `applyLanguage` 每页都不同，是因为分享文案、计分和 i18n 表各有游戏特点；它们适合抽成「共享骨架 + 游戏回调」，不适合直接合并。

### 3.3 两套排行榜界面并存

- **结算层内嵌**（`game-lb-*`）：15 页（planet-merge / hoop-shot / minesweeper / reversi / tower-defense + 关卡解谜十页），提交、拉取、本地兜底、渲染每页各写一遍。
- **共享原生对话框** `src/platform/scoreboard-dialog.js`：7 个顶栏页（`scores.ui: "dialog"`）。
- tetris、sword-flight 另有自有实现。

## 4. 各组件方案

### 4.1 页面布局：只生成连续的骨架区域

**做：**

- **样式表链接**：新增 `stylesheets` 生成区，按上面的固定顺序输出。新增两个声明（字段名待定，例如放在 `shell` 下）：是否引用 Science Showcase、是否有舞台状态行；`scoreboard-dialog` 由 `scores.ui` 推导；页面 CSS 默认 `css/<id>.css`，gravity-slingshot 用字段声明或改名（见 §6 D2）。好处：新页漏引 `stage-status.css`、顺序写错这类错误在生成时就不可能出现，`verify-architecture` 的链接顺序检查可以改为检查生成区。
- **页尾脚本**：入口模块 + `analytics.js` + `sw-register.js` 并入生成区（入口已在 `entry` 字段）。
- **页脚**：`chrome.footer`（或并入 `shell`）声明提示文案键与触屏文案键；默认取 11 页的多数写法，其余 15 页用稀疏覆盖保留现状，保证零差异。顶栏与页脚从此都由 registry 管，`verify-touch-hints` 也可以直接读声明。
- **统计抽屉骨架**：由现有 `drawer` cap 生成，id 按 `${prefix}StatsDrawer` 约定，tetris 的无前缀 id 用覆盖保留。

**不做：** shell / main / stage / sidebar 外壳。舞台内部是各游戏自己的内容，外壳几何已由 `css/layout.css` 与 `verify-desktop-frame`、`verify-immersive`、`verify-mobile-viewport-fit` 锁住，生成它们收益很小。

**同时：** `render-game-shell.js` 改为复用上述渲染函数，修掉脚手架抽屉的分叉（这与 5a 让它复用 `renderTopbar` 同理）。

### 4.2 信息卡片：按卡片类型声明

仿照 `chrome.actions`，声明卡片类型列表，并区分「随面板进抽屉」与「仅桌面侧栏」两组：

```json
"sidebar": {
  "panels": ["howto", "records", "legend"],
  "desktopOnly": ["more"]
}
```

- 每类一个共享模板，统一 id（`xx-side-howto-title` / `xx-side-records` / `xx-side-legend` …）、共享类（`game-side-title`、`game-side-records`、`game-side-legend`）和 i18n 绑定。
- 内容丰富的卡片（needle-awn / sword-flight 带 `<b>` 的规则卡与键位卡、bond-forge 可折叠的速查卡、lumen 的图例行）用逐页节点覆盖原样保留，与顶栏 overrides 的做法一致。
- **侧栏与抽屉一起生成。** `#xxStatsPanels` 在手机上会被 `game-drawer.js` 整个搬进抽屉，两条现在只写在注释和 CLAUDE.md 里的规则可以变成生成器的硬约束：「更多游戏」卡必须在 `#xxStatsPanels` 外面；科学类图例要放在外面。
- JS 侧新增共享的 `renderSideRecords(container, rows)`（`rows = [{ label, value }]`），替换 5 个各不相同的实现；「🏅」前缀从各页 JS 移到模板。

现有漂移（只列几例，实施时以校验器输出为准）：planet-merge / hoop-shot / tower-defense 的记录列表缺 `game-side-records`；标题有的带 `data-i18n`、有的由 JS 写；circuit 在标题外多包一层 `<span>`。这一步**不是**零差异，会补齐这些共享类，需要 `verify-sidebar-family`、`verify-stats-drawer`、`verify-desktop-frame` 兜住。

### 4.3 结算 / 过关弹层与排行榜

每日结果弹层（标题、分数、副标题、复制 / 再来 / 主页三个按钮、排行榜标题、列表、状态、昵称输入）在关卡解谜十页上结构相同，但有漂移：

- bond-forge 缺 `game-over-score`、`game-over-sub`、`game-action-row`、`game-action-btn` 等共享类；
- 有的页标题和按钮文案写死英文占位（`Daily complete!`、`Again`），有的留空由 JS 填，有的用 `data-i18n`；
- 昵称输入有的带 `data-i18n-placeholder`，有的没有。

方案分两层：

1. **HTML**：`clear` / `over` 弹层由模板生成，声明只保留差异（是否有每日、排行榜标题键、额外按钮）。
2. **运行时**：仿照 `createStatsDrawer({ … })` 的适配器方式，抽一个共享结算控制器，负责提交、拉取、本地兜底、渲染列表、复制结果；游戏只提供回调（分数格式化、分享文本、榜单键、本地记录读写）。先替换 `renderBoard`（已只剩 2 个版本）和 `readLocalBoard`，再处理 `copyResult` / `finishDaily`。

这一步要先做产品决定（§6 D1）。

### 4.4 开始菜单与关卡网格

开始菜单的内容（标题美术、模式说明）各游戏自有，**不生成 HTML**；W4a / W4b 已经统一了 `game-start-*` 的样式类。只把 `renderLevelGrid` 抽成共享函数，例如 `renderLevelGrid(grid, levels, progressOf, { prefix, onPick })`，替换 8 份几乎相同的实现。

### 4.5 暂停层

7–9 行、5 种写法、页数少，价值低。等 §4.3 的弹层模板落地后顺带处理。

## 5. 路线与验收

| 步骤 | 内容 | 是否零差异 | 验收 |
| --- | --- | --- | --- |
| **6a** | 抽屉骨架、样式表链接、页尾脚本、页脚改由 registry 生成；脚手架复用同一渲染函数 | 是 | 与 5a 相同：逐页比对生成前后解析出的 DOM（要求全部相同）+ 全站静态截图像素比对；新增「生成区 == 渲染器输出」校验（可把 `verify-topbar-registry` 推广为覆盖所有骨架生成区）；`gen --check`；全量 `npm run verify` 与 `--dist` |
| **6b** | 侧栏卡片类型 + 抽屉一起生成；共享 `renderSideRecords` | 否（补齐共享类） | `verify-sidebar-family`、`verify-stats-drawer`、`verify-desktop-frame`、`verify-theme`；新增断言：声明在 `panels` 的卡都在 `#xxStatsPanels` 内，`desktopOnly` 的卡（如「更多游戏」）都在外，并做反向验证 |
| **6c** | 结算 / 过关弹层模板 + 共享结算控制器（先定 D1） | 否 | `verify-button-icons`、`verify-leaderboard-layout`、`smoke-scoreboard-dialog`、各页 smoke；共享控制器的单元测试覆盖网络失败兜底与本地记录 |
| **6d**（可选） | 共享 `renderLevelGrid` | 是（行为） | `verify-start-menus`、各页 smoke 的选关路径 |

每一步单独开 PR。新增的逐页浏览器校验器要接 `tests/lib/page-filter.mjs`（`keepPage` / `exitIfNoPages`），CI 上超过 30 秒的补进 `tests/verify-all.mjs` 的 `WEIGHTS`。

## 6. 待决定

- **D1 排行榜界面**：结算层内嵌（15 页）与原生对话框（7 页）是都保留、各自统一，还是全部收敛到对话框？收敛到对话框改动大（需重做 15 页的结算层布局与校验），但能删掉的重复最多，且所有游戏的排行榜交互一致。
- **D2 gravity-slingshot 的页面 CSS**：把 `css/gravity.css` 改名为 `css/gravity-slingshot.css`（一次性改动，之后无特例），还是在 registry 里加文件名字段。
- **D3 两个新声明的字段名与位置**：Science Showcase 与舞台状态行，作为新的 cap 还是放进 `shell` 对象。cap 语义是「代码事实」（见 `registry.md`），这两项更像样式选择，倾向放进 `shell`。

## 7. 风险与沿用的教训

- **id 不能消失。** `chrome.md` §3 记过迁移脚本用模板替换原节点、让页面 JS 依赖的 id 消失、整页打不开的事故。生成器要像 5a 一样：任何现有 id 在生成后不存在就拒绝写盘。
- **只在部分状态出现的元素不能挤动别人。** 5b 的「⋯」按钮开局才出现、把左边按钮挤走（#178 修复）。弹层和卡片模板同样要检查状态切换前后已有控件的位置。
- **面板搬移。** `#xxStatsPanels` 是被移动的单个节点，绝不能为抽屉复制一份 DOM（`CLAUDE.md` 抽屉条目）。
- **脚手架要复用渲染函数。** 新游戏脚手架与现有页分叉，是这轮盘点里抽屉、页脚差异的来源之一。
- **生成区只能是连续区域。** 不要为了生成外壳而拆分起止标记包住手写内容。
