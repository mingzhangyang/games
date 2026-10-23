# 页面骨架与信息卡片的 registry 生成方案（Chrome 第 6 步）

> 状态：6a 已合并（PR #179）；6b、6c 分批实施；6d 为后续计划 · 原始盘点：2026-10-23 · 基线 main `fa2ad7d`
> Repository: `mingzhangyang/games`
> 范围：26 个 `topbar` 游戏页的样式表链接、页尾脚本、页脚、统计抽屉、侧栏信息卡片、结算 / 过关弹层与页内排行榜，以及关卡解谜十页 runtime 里的重复代码
> 不在范围：舞台内部（画布、状态行内容）、各游戏自有的开始菜单内容、`index.html`、`math-rain` / `tank-battle`（豁免页）

6a 已迁移样式表链接、页尾脚本、页脚和统计抽屉骨架，并让新游戏脚手架复用同一渲染源。后续侧栏卡片、榜单状态、结算模板与关卡网格按责任拆成独立 PR。

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
| 本地样式表 `<link>` 组合 | 26 | 5 | 将页面 CSS 文件名归一化后为五组；若计入 sword-flight 的外部字体样式表则是六组。顺序固定：`tokens → layout → [science-showcase] → 页面 CSS → [scoreboard-dialog] → [stage-status] → mobile-fit → more-games`（顺序由 `verify-architecture` 校验）；外部字体样式表与 preconnect 不属于这段连续区域 |
| 页尾脚本（入口模块 + analytics + sw-register） | 26 | 1 | 完全相同，只差入口路径（已在 registry 的 `entry`） |
| 页脚（`.game-footer`） | 26 | 7 | 3 行的块，差别只在有无 `id`、`data-i18n`、`data-i18n-touch`，minesweeper 的提示类名不同 |
| 信息卡片（`.game-side-card`） | 17 | 40 | 16 页有 `.game-sidebar`，另含 tower-defense 的战术面板卡片；不能把卡片页数当作侧栏页数。卡片约 6 类：玩法说明、记录、图例、操作键、规则、更多游戏（见 §4.2） |
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
| `renderLevelGrid` | 8 | 207 | 7（还涉及章节分组、星级显示、完成状态与事件绑定，见 §4.4） |
| `renderBoard` | 6 | 208 | 2 |
| `readLocalBoard` | 6 | 65 | 6 |
| `renderSideRecords` | 5 | 159 | 5 |
| `copyResult` | 10 | 213 | 10 |
| `finishDaily` | 10 | 189 | 10 |
| `applyLanguage` | 10 | 303 | 10 |

这是原始方法体盘点，不代表完整功能清单：例如 Lumen 的选关渲染已经位于 `ui/view.js`，榜单编排位于 `ui/daily-board.js`。实施前要沿调用关系检查这些模块，不能只按 runtime 内的方法名计数。

`copyResult` / `finishDaily` / `applyLanguage` 每页都不同，是因为分享文案、计分和 i18n 表各有游戏特点。可共享展示、剪贴板与榜单服务；完成条件、提交资格、游戏状态、存档和 analytics 仍由游戏自身负责，不合成一个接管游戏业务的通用结算控制器。

### 3.3 两套排行榜界面并存

- **结算层内嵌**（`game-lb-*`）：15 页（planet-merge / hoop-shot / minesweeper / reversi / tower-defense + 关卡解谜十页），提交后的处理、拉榜编排、本地兜底与渲染仍有重复。
- **共享原生对话框** `src/platform/scoreboard-dialog.js`：7 个顶栏页（`scores.ui: "dialog"`）。
- tetris、sword-flight 另有自有实现。

网络并非两套：`src/platform/leaderboard.js` 已是共享 POST / GET / 超时处理层；`scoreboard-pending.js` 已提供本地重试队列。dialog 已有请求序号保护、上传状态和先记队列再提交的能力。后续从这些现有实现提取共享逻辑，内嵌与 dialog 保留各自视图，不新增网络客户端或重试队列。

## 4. 各组件方案

### 4.1 页面布局：只生成连续的骨架区域

**做：**

- **样式表链接**：新增 `stylesheets` 生成区，仅管理上述连续的本地 CSS 链接，保持顺序及原属性。Science Showcase、舞台状态行的样式选择放在 `shell.styles`；`scoreboard-dialog` 由 `scores.ui` 推导；页面 CSS 默认 `css/<id>.css`，gravity-slingshot 通过一个路径覆盖继续引用 `css/gravity.css`，改名留待独立变更。外部字体样式表、preconnect 与区域外节点逐字保留，不能为连续替换而吞掉它们。
- **页尾脚本**：入口模块 + `analytics.js` + `sw-register.js` 进入 `tail-scripts` 生成区（入口已在 `entry` 字段），保留 `type`、`src`、`defer` 等属性和相对顺序，不扩大到其他页面脚本。
- **页脚**：用 `shell.footer` 的默认模板、语义字段与稀疏覆盖表达提示文案键、触屏文案键及既有 id / class / 属性；保留七种历史结构，不在 6a 顺手统一样式或 i18n 行为。
- **统计抽屉骨架**：16 个带 `drawer` cap 的页面生成 `stats-drawer` 区域；id 按 `${prefix}StatsDrawer` 约定，tetris 的无前缀 id 和 circuit 的 i18n 属性使用稀疏覆盖保留。只生成空抽屉，不复制或移动 `StatsPanels`。

**不做：** shell / main / stage / sidebar 外壳。舞台内部是各游戏自己的内容，外壳几何已由 `css/layout.css` 与 `verify-desktop-frame`、`verify-immersive`、`verify-mobile-viewport-fit` 锁住，生成它们收益很小。

**一个渲染源：** `src/platform/shell/render-shell-parts.js` 提供 `renderStylesheets`、`renderFooter`、`renderStatsDrawer`、`renderTailScripts`；生成器与 `render-game-shell.js` 共同调用，修掉脚手架抽屉的分叉。生成区分别为 `stylesheets`、`footer`、`stats-drawer`、`tail-scripts`，均只包住完整连续节点。

**两类独立保护：** 一类检查生成区与渲染器输出完全一致，发现手工漂移；另一类直接检查最终 HTML 的实际链接顺序、入口脚本、页脚位置、抽屉结构、id 唯一性及 ARIA 引用，不能仅调用同一渲染器重新计算期望值。迁移还须与旧版本逐页比较原 id 和解析后的 DOM；缺 id、重复 id、失效引用均拒绝写盘。生成器先完成所有页面的渲染和保护检查，再写入产物，避免后页失败时留下半次迁移。

### 4.2 信息卡片：按卡片类型声明

**6b 覆盖 15 个使用通用抽屉的页面**，即 `drawer` 页面集合排除 tetris。tetris 有专用抽屉与侧栏行为；没有通用抽屉的侧栏页也暂不迁入。页面集合和例外由 registry 派生并断言覆盖。实际侧栏集合是 16 个 `sidebar` 页面；17 个 `.game-side-card` 页面另计了 tower-defense 的战术面板，不能按卡片类名把它们视为同一种侧栏模板。

仿照 `chrome.actions`，声明通用卡片类型列表，并区分「随面板进抽屉」与「仅桌面侧栏」两组。下面是字段形状示例，具体卡片归属以页面实际内容与契约为准：

```json
"sidebar": {
  "panels": ["howto", "records"],
  "desktopOnly": ["legend", "more"]
}
```

- 每类一个共享模板，统一 id（`xx-side-howto-title` / `xx-side-records` / `xx-side-legend` …）、共享类（`game-side-title`、`game-side-records`、`game-side-legend`）和 i18n 绑定。
- 内容丰富的卡片（needle-awn / sword-flight 带 `<b>` 的规则卡与键位卡、bond-forge 可折叠的速查卡、lumen 的图例行）保留手写完整节点，或使用少数专用模板；不把任意 HTML 子树重新编码进 JSON。通用模板只接管已证明同构的连续区域，不能为了覆盖特例把起止标记拆到手写内容两侧。
- **侧栏与抽屉一起校验。** `#xxStatsPanels` 在手机上会被 `game-drawer.js` 整个搬进抽屉；「更多游戏」和科学类图例应在其外。6a 的空抽屉模板继续复用，6b 只增加卡片与面板声明，不生成第二份 `StatsPanels`。
- JS 侧共享 `renderSideRecords(container, rows, classes)`（`rows = [{ label, value }]`）只接管两列记录的 DOM 展示，已接入 11 页（包括 Lumen 的 `ui/view.js` 和命名不同的 Ripple `renderRecords`）；所有统计与存储计算仍在游戏内。PM / HS / GD / Lumen 记录标题的「🏅」从 JS 移到模板，原有手写标题仍保留自己的写入路径。

实施结果：13 页生成同构卡片，Needle Awn / Sword Flight 的完整专用卡片保留但纳入 15 页回归。Lumen 的 gloss 位于可搬移的 howto 内，不归入 desktopOnly；Carrot 的进度点 / 提示卡、Shadow 的三列记录 / 桌面 keys、Bond Forge 的折叠速查仍保持页面所有权。默认列表与少量覆盖的实际字段见 `docs/contracts/registry.md` §3.3。

原始漂移（只列几例）：planet-merge / hoop-shot / tower-defense 的记录列表缺 `game-side-records`；标题有的带 `data-i18n`、有的由 JS 写；circuit 在标题外多包一层 `<span>`。这一步补齐迁移范围内的共享类，并让通用标题统一由 i18n 绑定写入；tower-defense 的战术面板不在本批范围内。

验收不能仅列出现有校验器名字：`verify-sidebar-family` 已由九页家族扩到本批 15 页，并保留原九页计算样式断言；`verify-desktop-frame` 按 `frame-budget` 能力派生，不能代替卡片身份与归属检查。对迁移集合逐页验证中英文、明暗主题、手机抽屉开关与桌面布局，以及跨 1024px 后仍是同一个 `StatsPanels` 节点。保留 tetris 的专用回归检查。

### 4.3 结算 / 过关弹层与排行榜

每日结果弹层（标题、分数、副标题、复制 / 再来 / 主页三个按钮、排行榜标题、列表、状态、昵称输入）在关卡解谜十页上结构相同，但有漂移：

- bond-forge 缺 `game-over-score`、`game-over-sub`、`game-action-row`、`game-action-btn` 等共享类；
- 有的页标题和按钮文案写死英文占位（`Daily complete!`、`Again`），有的留空由 JS 填，有的用 `data-i18n`；
- 昵称输入有的带 `data-i18n-placeholder`，有的没有。

按责任分开推进，先统一榜单服务，再迁移展示模板：

1. **榜单状态与请求生命周期**：复用 `leaderboard.js` 和 `scoreboard-pending.js`，从现有 dialog 与内嵌适配器提取提交状态、请求序号、过期响应丢弃、本地兜底和重试编排。内嵌面板与 dialog 共用这套服务；行渲染也可以复用，不要求统一成一种界面。
2. **游戏结算业务**：游戏继续负责完成条件、计分、提交资格、状态切换、存档、每日完成标记和 analytics。共享榜单接收已确定的结果快照（本局身份、日期、榜单键、姓名、分数）；不能在异步回调中重新读取当前局分数或今天日期。一次性成绩的先记队列再 POST 沿用现有机制，远端确认才算上传成功。
3. **HTML 与小型展示函数**：同构的 `clear` / `over` 弹层再由模板生成，声明只保留差异；剪贴板、列表行和结果反馈可分别提炼，不将 `finishDaily` 与 `applyLanguage` 整体搬进一个控制器。

D1 已选择保留两种视图、共用一套服务。后续若要把内嵌榜单改成 dialog，单独评估结算后的操作路径、焦点、暂停归属与布局。6c-1 已提取 `scoreboard-submission.js`，共享 dialog 与 Echo Cave / Maxwell Demon 接入，修复两页忽略 `submitScore(false)` 的问题；每日结果与战役通关均展示提交状态，沿用已有网络客户端和持久队列。具体职责、状态与验收见 `docs/contracts/scoreboard.md`。

6c-2 再将同一服务扩到其余内嵌榜单，逐页保留提交资格、计分、旧存储协议与视图生命周期；6c-3 才生成同构 clear / over 节点及提取剪贴板等小型展示函数。6c-1 不改变这些页面的业务逻辑，也不提前生成结算模板。

6c 的行为验收必须包括：POST 返回 false 但 GET 成功时仍保留未上传状态；关闭或重开后旧响应不得覆盖新结果；重复结算不重复提交；跨日仍用本局日期；本地保存失败不提示已保存；剪贴板失败不提示复制成功。

### 4.4 开始菜单与关卡网格

开始菜单的内容（标题美术、模式说明）各游戏自有，**不生成 HTML**；W4a / W4b 已经统一了大部分 `game-start-*` 样式类，但不能据此假设所有选关网格行为相同。

实际差异包括 Circuit 的实验区分隔标题与 topic tooltip、Lumen 的章节标签与带星级的无障碍名称、不同页面的未完成星级显示、完成状态类和直接绑定 / 事件委托。先盘点这些可见行为，再提炼 Echo Cave / Maxwell Demon 等真正同构的子集，或只共享单个关卡按钮；章节分组和事件策略由游戏保留。不用仅有 `prefix` 与 `onPick` 的接口强行接管全部页面，也不为少量重复堆积配置开关。

### 4.5 暂停层

7–9 行、5 种写法、页数少，价值低。等 §4.3 的弹层模板落地后顺带处理。

## 5. 路线与验收

| 步骤 | 内容 | 是否零差异 | 验收 |
| --- | --- | --- | --- |
| **6a（已合并 #179）** | 26 页本地样式表、页尾脚本、页脚及其中 16 页空抽屉骨架由 registry 生成；脚手架同源 | 是 | 逐页旧 / 新 DOM 相同、外部字体与区域外内容保留；静态截图像素比对并检查抽屉打开状态；生成区一致性及独立结构 / id / ARIA 检查；`gen --check`；全量 `npm run verify` 与 `--dist` |
| **6b（侧栏卡片）** | 15 个通用抽屉页面的通用卡片声明与 `renderSideRecords`；特殊卡片保留 | 否（补齐共享类） | 先补齐校验器对迁移集合的覆盖，再验中英文 / 主题 / 手机抽屉 / 桌面布局；断言卡片归属与跨断点节点身份，并做反向验证 |
| **6c（分批）** | 先共享榜单状态 / 请求生命周期，再迁移同构弹层；两种视图共用服务 | 否 | 现有榜单、按钮与各页 smoke；增加 POST false / GET success、过期响应、跨日、重复提交、存储和复制失败回归 |
| **6d（后续，可选）** | 同构子集的选关渲染或关卡按钮 | 是（行为） | `verify-start-menus`、各页选关 smoke；保留章节分组、星级、无障碍名称与事件次数 |

每一步单独开 PR。新增的逐页浏览器校验器要接 `tests/lib/page-filter.mjs`（`keepPage` / `exitIfNoPages`），CI 上超过 30 秒的补进 `tests/verify-all.mjs` 的 `WEIGHTS`。

6a 的一次性迁移基线是 `71ac56e002c5ba76190c8dcf154e4036f02a1891`（在上述盘点基线上仅新增本提案）。
`node tools/checks/compare-shell-html.mjs <基线 SHA>` 比较 26 页完整解析结构，并要求首页与两张豁免页逐字节不变；
`node tools/checks/compare-topbar-screenshots.mjs <基线服务 URL> <当前服务 URL>` 比较手机和桌面的 52 对完整静态截图。
截图关闭两侧游戏 JavaScript、等待每侧画面稳定后按零像素容差比较；实际交互由全量浏览器门禁覆盖。

## 6. 已确定的边界

- **D1 排行榜界面**：保留结算层内嵌与原生 dialog，两者共用榜单服务和可复用的渲染函数。UI 合并不是删除业务重复的前置条件。
- **D2 gravity-slingshot 的页面 CSS**：6a 保留 `css/gravity.css`，用一个显式路径覆盖保持 DOM 与资源请求不变。改名如有必要，单独提交并验证所有引用。
- **D3 样式声明**：Science Showcase 与舞台状态行放在 `shell.styles.scienceShowcase` / `stageStatus`，不增加 cap；默认分别为 `false` / `true`，页面路径默认 `css/<id>.css`。已有 `scores.ui`、`entry`、`prefix` 等事实继续直接派生，避免在 `shell` 中重复登记。完整字段契约见 `docs/contracts/registry.md` §3.2。

## 7. 风险与沿用的教训

- **id 与引用一起保护。** `chrome.md` §3 记过迁移脚本替换原节点、让页面 JS 依赖的 id 消失的事故。写盘前检查旧 id 保留、最终 id 唯一、ARIA 引用仍能定位真实节点；不能只对比 id 集合后忽略重复或悬空引用。
- **只在部分状态出现的元素不能挤动别人。** 5b 的「⋯」按钮开局才出现、把左边按钮挤走（#178 修复）。弹层和卡片模板同样要检查状态切换前后已有控件的位置。
- **面板搬移。** `#xxStatsPanels` 是被移动的单个节点，绝不能为抽屉复制一份 DOM（`CLAUDE.md` 抽屉条目）。
- **脚手架要复用渲染函数。** 新游戏脚手架与现有页分叉，是这轮盘点里抽屉、页脚差异的来源之一。
- **生成区只能是连续区域。** 不要为了生成外壳而拆分起止标记包住手写内容。
- **一致性校验不能替代正确性校验。** 生成器与校验器共用同一模板时可能一起出错；原版本 DOM 对比、独立结构断言和真实状态的浏览器验证分别保留。
