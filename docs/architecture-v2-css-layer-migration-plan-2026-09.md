# CSS Cascade Layers 迁移方案

> 状态：P0/P1 基线与 P2 rule-mapping foundation 已完成；生产 CSS 迁移已从首个 dependency-closed `layout` canary（`.game-stage--fill`）开始
>
> 记录日期：2026-09-30
>
> 关联：`docs/contracts/layout.md`、`vite.config.js`、`css/tokens.css`、`docs/architecture-v2-followup-plan.md`
>
> 前置关系：本计划的 P0/P1 可提前进行只读盘点；**P2 及以后会改变 cascade 语义，只有 Architecture v2 follow-up 的 handoff gate 全部满足后才允许开始。**

## 1. 结论先行

当前项目继续采用 `shared-css-first` 作为生产环境的样式排序契约，暂不直接删除该插件，
也不再在 PR 描述中声称已经完成 `@layer` 迁移。

这不是放弃 cascade layers，而是把两件事分开：

1. 先保持已有页面的生产布局稳定；
2. 在一次独立、可回滚的架构改造中，把所有普通 CSS 规则迁移到明确的层级后，
   再移除 `shared-css-first`。

迁移完成前，`shared-css-first` 是有效的构建契约，不是临时的无效代码。

此外，迁移期间采用与 Architecture v2 相同的 **debt ratchet** 原则：

- 已有未分层 CSS 可以在 baseline 中暂时存在；
- 新增普通 CSS 默认必须进入明确 layer；
- 未分层文件/规则数量只能下降不能上升；
- 某一类别降到 0 后切换为 strict-zero；
- 禁止通过向上调整 baseline 来“修复”检查失败。

## 2. 为什么不能直接移除插件

### 2.1 当前仓库的真实状态

当前 CSS 并没有形成完整的层级系统：

| 文件类别 | 当前状态 |
| --- | --- |
| `css/tokens.css` | 声明 `tokens → layout → components`，自身内容位于 `tokens` 层 |
| `css/more-games.css` | 位于 `components` 层 |
| `css/science-showcase.css` | 位于 `components` 层，但语义上应独立成为 showcase 层 |
| `css/layout.css` | 仍是非分层 CSS |
| 各页面 CSS | 大多数仍是非分层 CSS |
| HTML 内联样式 | 历史上存在过，现有文档要求继续清理并检查 |

CSS 的普通非分层规则优先于普通分层规则。因此，如果只把 `layout.css` 放进
`@layer layout`，而页面 CSS 仍保持非分层，页面 CSS 会整体压过共享布局规则；这不是
原来的“页面 CSS 覆盖共享默认值”的精细关系，而是把整个共享层降到了页面 CSS 下面。

### 2.2 已经观察到的回归

上一轮曾尝试用 `@layer layout` 替代构建后排序，并移除 `shared-css-first`。生产式定向验证
出现了以下类型的失败：

- 移动端侧栏没有按契约隐藏；
- stats drawer 与 Tetris drawer 的移动端行为回归；
- 开始菜单出现内部溢出；
- 桌面 frame 和 immersive 舞台尺寸不再满足约束；
- carrot-pull、needle-awn 的响应式 smoke 失败。

恢复非分层的 `layout.css` 与 `shared-css-first` 后，这些回归消失，Architecture v2
candidate CI #19 和 #20 均通过。这说明当前页面仍依赖既有的生产 CSS 优先级，不能只改一层
或只删一个插件。

### 2.3 当前插件实际做了什么

`vite.config.js` 中的 `shared-css-first` 不只是简单地交换两个 link：

1. 将产物外链按 `tokens → layout → science-showcase → page → more-games` 排序；
2. 将外链样式移动到 HTML 内联 `<style>` 之前，避免内联样式反过来覆盖共享样式；
3. 保持源码约定与多页生产构建产物的实际优先级一致。

因此，删除它之前必须先证明样式优先级已经由层级声明完整接管。

## 3. 目标架构

最终目标是：所有普通 CSS 都进入显式 cascade layer，生产页面不再依赖 Vite 重排 stylesheet
link；同时保持现有页面的视觉、几何、响应式和交互行为不变。

P1 最初得到过一个**文件级**候选顺序：

```css
@layer tokens, showcase, components, layout, pages;
```

2026-10-04 的 P2 canary 证明这个抽象不成立。原因不是某几个 selector 写错，而是 cascade
layer 的优先级先于 specificity：一旦整个 `layout.css` 放进较早的 `layout` 层，较晚
`pages` 层中的低 specificity 页面规则也能压过共享结构契约。Tetris 中
`.info-panel { display:flex }` 压过 `body.has-stats-drawer .game-sidebar { display:none }`
就是这个问题的最小反例；同一轮 CI 还同时出现 frame、immersive、start-menu、carrot-pull
和 needle-awn 几何回归。

因此迁移单位从“CSS 文件”改为“**规则职责**”，并引入最后的结构契约层：

```css
@layer tokens, showcase, components, layout, pages, contracts;
```

当前生产 link 顺序仍保持：

```
tokens → layout → science-showcase → page → more-games
```

新的目标不是用 layer 顺序机械复制 link 顺序，而是显式表达两类过去靠 specificity 共存的关系：
共享默认值允许页面覆盖，共享结构不变量则不得被页面皮肤破坏。同一个 CSS 文件可以贡献多个
layer；文件路径不再等于 layer ownership。

P0 历史事实永久保存在 `tests/css-layer-p0-baseline.json`，不得随着迁移下调。后续进度只写入
独立的 `tests/css-layer-migration-state.json`；P2 必须先升级 verifier 支持 rule-level state，
之后才允许改生产 CSS。

层级职责：

| 层级 | 内容 | 优先级意图 |
| --- | --- | --- |
| `tokens` | 设计令牌、主题变量、基础控件变量 | 普通声明的最低共享层 |
| `showcase` | 科学展柜共享皮肤 | 保留 Showcase 的共享视觉语义；important 仍需单独审计 |
| `components` | `more-games` 等共享组件 | 高于 showcase 的普通共享组件 |
| `layout` | shell/topbar/stage/sidebar 等**可被页面定制的默认几何** | 页面仍可有意覆盖默认值 |
| `pages` | 页面视觉、玩法专属组件与经过审计的页面几何 | 高于共享默认值 |
| `contracts` | drawer 隐藏、frame budget、immersive 边界、固定安全区等结构不变量 | 普通声明最后，保护平台布局契约不被页面层意外覆盖 |

禁止再使用“给整个页面 CSS 包 `pages`、给整个 `layout.css` 包 `layout`”的机械迁移。
如果一条规则既像视觉又影响结构，先用行为测试确定职责，再决定 layer；不能靠加
`!important` 或提高 selector specificity 抵消错误的 layer 模型。

### 验证器前置改造（PR #75 后续）

CSS parser 已切换至 PostCSS + CSS Syntax tokenizer；HTML 保持 parse5。
规则和声明以有序模型独立校验，原 P0 tuple 仅保留作历史兼容适配。
五处运行时 stylesheet 已收敛到固定数据注册表及受控安装入口，保持原激活时机。
详见 `docs/architecture-v2-postcss-verifier-migration-plan.md`。

P2 的逐规则映射和单向 ratchet 已建立。首个生产 cutover 只迁移 `.game-stage--fill` 到 `layout`，用于验证真实 P2 路径；后续仍按 dependency-closed 小批继续。每条 mapping 都必须
从 PR base 中找到稳定 source occurrence，并在当前源码中找到同 stylesheet 的显式 layer
destination；1→N 拆分必须保持声明有序且无损。已合并 mapping 只能追加，不能删除或改写。
normal / important 冲突分开记录其相反的 layer precedence；不同 selector 命中关系仍由
geometry / interaction 浏览器测试负责。旧 P0 与 semantic addendum 继续保持不可变。
静态债务检查、迁移映射检查和浏览器行为验证仍是三个独立验收项。

## 4. 分阶段实施方案

### P0：冻结现状、建立行为基线和 CSS debt baseline

目标：在开始迁移前，把当前正确行为记录成可重复的基线，并从第一天起阻止新的未分层 CSS 债务。

工作项：

- 保留 `shared-css-first`，不改变当前生产路径；
- 建立 CSS debt baseline，至少记录：
  - 未进入明确 layer 的普通 CSS 文件/顶层规则；
  - HTML `<style>` 与 `style=""` 例外；
  - `!important` 与特殊 at-rule 例外；
  - 仍依赖 stylesheet link 顺序的页面；
- 新增迁移期静态检查：已有 debt 可保持，但**禁止新增未分层普通 CSS**；P2 开始后减少量记录在独立 migration state；
- P0 baseline 记录具体文件/规则并永久不可变；禁止通过修改 P0 快照来吸收迁移进度或检查失败；
- 记录所有 CSS 文件的入口、页面归属和当前层级；
- 记录关键页面的 computed style、frame 尺寸、侧栏显示状态和 drawer 挂载位置；
- 运行并保存基线结果：
  - `npm run gen -- --check`
  - `node tools/checks/run-lint.mjs`
  - `npm run build`
  - `node tests/verify-theme.mjs`
  - `node tests/verify-chrome.mjs`
  - `node tests/verify-start-menus.mjs`
  - `node tests/verify-stats-drawer.mjs`
  - `node tests/verify-tetris-topbar-mobile.mjs`
  - `node tests/verify-immersive.mjs`
  - `node tests/verify-desktop-frame.mjs`
  - carrot-pull / needle-awn smoke

验收门槛：

- 行为基线全部通过；
- CSS debt baseline 可复现；
- 新增未分层普通 CSS 会失败；
- 如果基线本身有已知缺口，必须在文档中列出并与迁移回归分开。

### P1：CSS 层级盘点和规则清理

目标：在不改变行为的前提下，识别所有不适合直接包进 layer 的结构。

盘点内容：

- 顶层普通规则是否都能放入 layer；
- `@charset`、`@import`、`@font-face`、`@property`、`@keyframes` 等特殊 at-rule；
- `!important` 规则，因为 important 声明的 layer 优先级方向与普通声明相反；
- `:root` 中的自定义属性覆盖关系；
- 页面 CSS 对 `layout.css`、`more-games.css`、`science-showcase.css` 的隐式覆盖；
- HTML `<style>` 和 `style="..."`，最终目标是把可迁移的内联 CSS 全部外置或显式分层；
- `body`、`html`、canvas、固定底栏等全局规则，避免改变包含块和滚动上下文。

交付物：

- 规则职责到目标 layer 的清单；同一文件允许同时包含 layout/pages/contracts 等多个职责层；
- 跨 `layout/showcase/page/components` 的 selector/custom-property 冲突矩阵；
- 对“当前 link 顺序”与“候选 layer 顺序”是否等价的书面结论；
- 若不等价，给出修正后的最终 layer order；
- `!important` 和内联 CSS 的例外清单；
- 每个例外的替代方案和回归测试；
- 已落地的“禁止新增非分层 CSS”迁移期检查，而不是只停留在草案。

### P2：先建立 rule-level migration state，再迁移生产 CSS

**前置：Architecture v2 follow-up handoff gate 必须全部满足。**

目标：先让机器能够表达“同一文件中的不同规则属于不同职责”，再做任何 cascade 语义切换。

实施顺序：

1. 保持 `tests/css-layer-p0-baseline.json` 不变；启用独立的
   `tests/css-layer-migration-state.json`，migration unit 固定为 rule/selector，而不是 file；
2. 先升级 `verify-css-debt.mjs`：只有 migration state 中逐项登记、且能在目标 layer 找到同一规则时，
   才允许对应 P0 unlayered debt 退出 active debt；已经迁移的规则不得重新变回 unlayered；
3. 将目标顺序冻结为 `tokens, showcase, components, layout, pages, contracts`，并针对
   normal/important 两套相反的 layer precedence 分别做冲突检查；
4. 先给 `layout.css` 做职责分类，但**不要把所有分类结果一次切换到 layer**：
   - 可定制的 shell/topbar/stage/sidebar 默认几何 → `layout`；
   - drawer 隐藏、frame budget、immersive 边界、安全区等平台不变量 → `contracts`；
   - 第一批生产 cutover 只选可独立证明无行为变化的低风险 `layout` 默认规则。
5. 页面 CSS 逐规则迁移到 `pages`；凡命中共享 shell/sidebar/drawer/frame selector 或同一 DOM 属性的规则，
   必须先经过冲突审计，不能因为“文件属于某游戏”就自动归入 `pages`。特别注意：未分层 normal
   声明优先于所有 named layer，因此任何 `contracts` 规则若可能与仍未分层的页面规则竞争，
   必须与这些页面 peer 组成 dependency-closed 批次同时迁移，不能先单独把 contract 放进 layer；
6. `science-showcase.css` 与 `more-games.css` 分别收敛到 `showcase` / `components`，
   但仍按规则验证 important 与跨 selector 命中关系；
7. 每一小批迁移都同时跑源码态和 production geometry/smoke；失败即回滚该批，不修改 P0；
8. 全程保留 `shared-css-first`，直到 P4 canary 证明构建 link 顺序已经不再影响行为。

**部分迁移不变量：** normal cascade 中，未分层声明高于所有 named layer；important
则方向相反。P2 的每个 cutover 批次必须对这两套关系分别闭包。静态 exact-selector/property
审计只负责可证明的交集，不同 selector 命中同一元素的关系继续由源码态 + production 浏览器
geometry/interaction evidence 决定。

**明确禁止：** whole-file wrapper、一次性给 28 个页面统一套 `pages`、给整个 `layout.css`
统一套 `layout`，以及用新增 `!important`/selector specificity 修补 layer 模型错误。

### P3：按风险分批恢复行为

目标：确认显式 layer 的优先级与当前生产行为等价。

建议验证批次：

| 批次 | 页面 / 内容 | 重点风险 |
| --- | --- | --- |
| A | index、word-daily、minesweeper、reversi、gomoku | DOM 布局、主题与页面变量覆盖 |
| B | planet-merge、hoop-shot、gravity-slingshot、sword-flight、needle-awn | 画布尺寸、frame budget、移动端高度 |
| C | crystal-bloom、echo-cave、maxwell-demon、flame-verse、ripple-duet | showcase 层与页面皮肤优先级 |
| D | tetris、tower-defense、carrot-pull、firefly-signal、shadow-loom | drawer、immersive、固定控件和生产美术 |
| E | math-rain、tank-battle | 化外页、全屏 HUD、独立 CSS 和内联/经典脚本交互 |

每个批次必须同时验证源码态和生产产物；不能只在 Vite dev server 上判断 layer 是否正确。
批次失败时只回滚当前批次，不改动已经通过的批次。

### P4：做插件无关性 canary

目标：证明 CSS 已经不再依赖 `shared-css-first`。

这一阶段仍然**不删除插件**。迁移后的 layer 架构应先在“插件仍存在”的正常生产路径下稳定，再用 canary 证明关闭插件也等价。这样可以把“layer 迁移问题”和“删除构建插件问题”拆开诊断。

建议临时加入一个仅供迁移期间使用的构建开关，例如 `CSS_LAYER_CANARY=1`，让构建可以
在不加载插件的情况下生成产物。此开关只用于验证，不作为永久运行模式。

对同一源码分别生成：

1. 正常模式：保留 `shared-css-first`；
2. canary 模式：禁用 `shared-css-first`。

两份产物都运行：

- `layout-metrics`；
- 所有 frame / drawer / immersive / start-menu 检查；
- carrot-pull、needle-awn、tower-defense smoke；
- theme / chrome / index 检查；
- 关键页面截图与 computed style 对账。

只有当两种模式在契约指标上等价，才允许进入插件删除阶段。

### P5：冻结 layer 架构并完成稳定性验证

目标：在插件仍存在的生产路径下确认 layer 架构已经稳定，且 P4 canary 等价。

工作项：

- 完成所有批次回归；
- CSS debt ratchet 中未分层普通规则清零或只剩文档化例外；
- 正常模式与 canary 模式契约指标等价；
- 至少一次完整 Architecture v2 candidate CI 通过；
- 在这一阶段**仍不删除** `shared-css-first`。

### P6：单独 PR 删除 `shared-css-first`

目标：把最后的构建契约切换做成一个极小、极易回滚的 PR。

建议分支：

`refactor/remove-shared-css-first`

工作项：

- 删除 `shared-css-first` 及其专属排序逻辑；
- 删除或改写依赖“构建后重排 link”的文档和注释；
- 保留源码中的 layer 顺序声明和文件归属规则；
- 将内联 CSS 例外清零，或把剩余例外写入明确的契约；
- 更新 `docs/contracts/layout.md` 的第 4 节；
- 更新 PR / architecture-v2 描述，说明迁移已真正完成；
- 运行一次完整 Architecture v2 candidate CI。

P6 PR 不应顺便迁移 CSS、改选择器、重做页面视觉或改变 shell；如果删除插件后出现回归，应优先回滚该 PR，而不是在同一个 PR 继续堆叠 `!important` 或 selector 修补。

## 5. 必须新增的自动守卫

自动守卫应分两个阶段启用，而不是等迁移完成后才开始。

### 5.1 迁移期 ratchet

P0 就启用：

- 禁止新增未分层普通 CSS；
- 未分层 debt 只能保持或下降；
- 已清零类别自动 strict-zero；
- P0 baseline 永久不可修改；迁移进度只能在 migration state 中单向前进；
- 输出当前 debt、相对 baseline delta 和 top offenders。

### 5.2 最终 strict verifier

随着批次迁移完成，把同一 verifier 逐步收紧为 strict contract。建议新增 `tools/checks/verify-css-layers.mjs`，至少检查：

1. P0 baseline blob fingerprint 与 immutable snapshot 完全一致；
2. migration state 只能前进，不能通过重新激活已迁移 debt 回退；
3. 每条 migrated rule/keyframe 都能在 state 指定的目标 layer 找到精确身份；
4. `contracts` 中只放经过书面审计的平台结构不变量；
5. 页面规则不得仅因文件归属而自动进入 `pages`；
6. `science-showcase.css` / shared components 的 important 与普通声明分别校验；
7. 未登记的新 unlayered CSS 仍然失败；
8. 不得重新引入依赖 link 重排的新构建逻辑；
9. 最终 layer order 为 `tokens, showcase, components, layout, pages, contracts`；
10. `shared-css-first` 删除后不得重新引入同类 link-reordering 构建逻辑。

该检查应加入日常 changed verification；完整浏览器回归仍只在 PR candidate / 手动运行时执行，
以符合项目的 CI 资源约束。

## 6. 完成标准和回滚条件

### 完成标准

- Architecture v2 follow-up handoff gate 已满足并保持；
- P0 CSS baseline 保持不可变，migration state 已收敛为 strict-zero 或明确 allowlist；
- rule-level 审计与 P3/P4 行为证据证明最终 layer order 与现有生产 cascade 等价；
- `vite.config.js` 中不再存在 `shared-css-first`；
- 所有普通 CSS 规则均属于明确 layer，例外有书面理由；
- 不依赖 HTML 中 link 的排列来决定跨层级优先级；
- dev / production / canary 三种验证口径一致；
- 所有现有 layout、theme、chrome、drawer、immersive、smoke 检查通过；
- 生产构建前后页面无新增 pageerror、溢出、不可点击控件或画布模糊；
- 文档、PR 描述和代码实现一致。

### 立即回滚条件

出现以下任一情况，停止当前批次并恢复插件，不继续堆叠修复：

- 移动端侧栏、drawer 或固定底栏行为改变；
- frame / immersive 的几何指标失败；
- 生产产物与 dev server 表现不一致；
- 主题、前景色、字体或画布清晰度回归；
- 需要大量新增 `!important` 才能恢复页面；
- 迁移工具产生大规模与 CSS 语义无关的换行或编码 diff。

## 7. 与 Architecture v2 follow-up 的正式交接

在 `docs/architecture-v2-followup-plan.md` 的 handoff gate 未满足前：

- 可以执行本计划 P0/P1：盘点、baseline、冲突审计、静态检查；
- 不执行 P2+ 的 layer 包裹、cascade 语义切换或插件 canary；
- 不把 CSS migration 与 shell/DOM 大改并行。

handoff 通过后进入临时 layout freeze：

- 不并行进行 shell redesign、共享 class 重命名、全站 layout 重构；
- 游戏逻辑/内容开发可以继续，只要不改变 shared cascade contract；
- 如必须修改共享 DOM/CSS contract，应单独排队或显式协调。

---

## 8. 当前待办清单

- [x] 建立 CSS debt baseline + migration ratchet
- [x] 完成全部 CSS 文件的 layer 归属盘点
- [x] 盘点 `!important`、内联样式、特殊 at-rule 和自定义属性覆盖
- [x] 审计当前 link 顺序与 selector/custom-property 冲突，并记录五层文件级候选
- [x] 用 P2 canary 证明 whole-file 单层模型不等价，并回滚生产 CSS 改动
- [x] 冻结 P0 immutable snapshot，建立独立 migration-state 骨架
- [x] 修正目标架构为 `tokens, showcase, components, layout, pages, contracts`
- [x] 升级 verifier，使 migration-state 支持稳定 occurrence、1→N/重新归层与单向 ratchet
- [x] 启动首个 dependency-closed production canary：`.game-stage--fill` → `layout`
- [x] P2-B：迁移 `.game-main` 顶层默认规则，并验证 desktop 同 selector peer 的 precedence 保持
- [x] P2-C：迁移 `.game-stage` 顶层默认规则；desktop `max-width` 与 page/immersive/start-menu 覆盖关系保持不变
- [ ] 完成 `layout.css` 的 layout/contracts 职责切片
- [ ] 分批迁移页面规则到 `pages`，逐批验证跨 selector 冲突
- [ ] 完成 `showcase` / `components` 的规则级归位
- [ ] 运行插件保留模式下的分批回归
- [ ] 运行禁用插件的 canary 对比
- [ ] 在插件仍存在的生产路径下完成稳定性验证
- [ ] 用独立小 PR 移除 `shared-css-first`
- [ ] 更新现行契约与 PR 描述
- [ ] 触发一次最终完整 CI

在上述清单全部完成前，项目应继续把 `shared-css-first` 视为生产必需契约。
