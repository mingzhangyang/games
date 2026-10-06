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
@layer reset, tokens, showcase, components, accessibility, layout, pages, contracts;
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

迁移 ledger 采用模块化存储：`tests/css-layer-migration-state.json` 只保留共享元数据和
`migratedRuleModules` 有序清单，每条 rule mapping 独立存放在
`tests/css-layer-migrations/rules/<mapping-id>.json`。verifier 运行时 hydrate 成统一 state，
并兼容读取旧版 monolithic comparison base，因此拆文件不改变单向 ratchet 语义。后续新增
迁移只新增一个小 mapping module，不再让主状态文件无限增长。
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
3. 将目标顺序冻结为 `reset, tokens, showcase, components, accessibility, layout, pages, contracts`，并针对
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

### P2 职责切片（PR #79 后冻结）

后续不再把“位于 `layout.css`”等同于“属于 `layout` layer。当前职责边界冻结如下：

| 职责 | 典型规则 | 迁移要求 |
| --- | --- | --- |
| `layout` defaults | base shell / topbar / main / stage / canvas / footer / sidebar 几何，以及只压缩这些默认值的普通响应式 peer | 允许按 dependency-closed 小批迁移；页面 CSS 仍可有意覆盖；若属性被未分层 reset 触碰则必须先闭包或暂缓 |
| `contracts` | start-menu `:has(...)` 结构切换、drawer 显隐与滚动锁、`has-stats-drawer`、frame-budget、immersive 边界/安全区 | 不得单独先移；必须与仍未分层且会竞争的 page/shared peers 一起闭包迁移 |

其中 desktop `game-main` 的普通横排 peer 仍属于 `layout` 默认响应式行为；而消费
`--stage-w` / frame budget 的结构约束、drawer 与 immersive 规则统一留到 `contracts`
批次。任何难以明确归类的规则默认留在未分层状态，先补行为证据，不靠 specificity 或
`!important` 强行归类。

**Cross-selector reset boundary：** 迁移某条 shared default 前，不能只审 exact selector。
同页仍未分层的 `*`、`html`、`body` 或 type-selector reset 会在 normal cascade 中压过
任何 named layer，即使 specificity 更低。因此凡规则声明 `margin`、`padding`、
`box-sizing` 等 reset 常见属性，都必须审计所有共存 stylesheet；存在重叠时，要么与 reset
组成 dependency-closed 批次一起迁移，要么保持该 shared rule 未分层。PR #80 的
`.game-topbar { padding: 4px 0 10px }` 因 Tetris、Word Daily、Needle Awn、Tower Defense
等页面的 `* { padding: 0 }` 被暂缓，不能用 `!important` 或提高 specificity 绕过。

**部分迁移不变量：** normal cascade 中，未分层声明高于所有 named layer；important
则方向相反。P2 的每个 cutover 批次必须对这两套关系分别闭包。静态 exact-selector/property
审计只负责可证明的交集，不同 selector 命中同一元素的关系继续由源码态 + production 浏览器
geometry/interaction evidence 决定。

**P2-E 响应式 peer 闭包：** PR #80 后，`.game-main`、`.game-stage`、
`.game-topbar-group`、`.game-topbar-center` 的顶层 defaults 已在 `layout`，但它们的普通
desktop / narrow peers 仍未分层。P2-E 将这些 exact-selector peers 一并迁入同一个
`layout` layer，并保持原有物理顺序，所以 media 命中时仍由后声明 peer 覆盖 default。
`.game-footer-actions` 是 narrow `.game-topbar-group` 的 cross-selector 依赖：footer action row 同时带
`game-topbar-group`，因此它也必须进入同一 `layout` 闭包，才能继续保持默认 8px、≤480px 4px 的
原有顺序。这一步仍不碰 universal reset、page CSS 或任何 `contracts` 规则。`.game-topbar` 仍因
page-level `* { padding: 0 }` 等 cross-selector reset 依赖保持未分层。

**P2-F canvas default：** `.game-canvas` 明确属于冻结职责表中的 `layout` default。本批只将
这一个共享 canvas 默认规则迁入 `layout`；它没有同 selector 的 page peer，页面中仍未分层的
ID / type / game-specific canvas 规则继续按原有意图覆盖共享默认。该规则不声明
margin / padding / box-sizing 等 reset-sensitive 属性，也不触碰 start-menu、drawer、
frame-budget、immersive 或其它 `contracts` 规则。现有 desktop frame / game smoke 的 canvas
几何与画幅检查继续作为 cross-selector 行为证据。

**P2-G desktop sidebar default：** 桌面 `.game-sidebar` 的 display / direction / gap / width /
flex-shrink 是标准 shell 的可定制 `layout` 默认几何。本批只迁这一条 `@media (width >= 1024px)`
规则；页面 CSS 仍未分层，因此 game-specific sidebar 视觉或几何覆盖继续保持原优先级。
移动端 `body.has-stats-drawer .game-sidebar { display:none }` 与 desktop media 不共存；
`body.has-frame-budget .game-sidebar` 及其 scrollbar peers 只负责 max-height / overflow 等
结构约束，继续留在未分层 `contracts` 批次。现有 desktop-frame / stats-drawer 浏览器回归
继续证明侧栏可见性、纵向边界和生产几何不变。

**P2-H toast positioning default：** `.game-toast` 只提供舞台内提示条的共享定位、层级、
圆角与 pointer-event 默认值，不包含 margin / padding / box-sizing 等 reset-sensitive 属性。
页面继续通过各自的 `xx-toast` 规则控制 max-width、文本对齐、换行、背景和具体偏移；这些
page CSS 仍未分层，因此原有覆盖关系保持不变。本批不触碰 overlay、hidden state、
start-menu、drawer、frame-budget 或 immersive contracts。现有 probe / 页面 smoke 继续作为
cross-selector toast 行为证据，尤其守住 Planet Merge / Word Daily 的换行意图。

**P2-I title-pill default：** `.game-title-pill` 的 display / flex-direction / align-items /
text-align / min-width 是顶栏中槽的共享 `layout` 默认值，不含 reset-sensitive 属性。Tetris
存在同 selector 的 page peer：除 display / flex-direction / align-items / min-width 四项同名
交集外，保守的 property-write 模型还把 `flex-direction` 与 peer 的 `flex` / `flex-wrap`
视为 flex family 潜在重叠；这些冲突均在 mapping module 中显式登记。该 peer 继续未分层，
因此迁移前后仍由 Tetris 的 row/wrap 设计获胜。本批不触碰 `.game-hud-box`（含 padding）
或任何 contracts。

**P2-J shared frame variable defaults：** 顶层 `:root` 中的 `--frame-*`、
`--drawer-max` 与 scrollbar 变量是共享 shell 的可定制配置默认值，本批整体迁入 `layout`。
这不会把 drawer / frame-budget / immersive 的结构规则提前迁入 `contracts`；这里只改变变量默认值
所在 layer。Gomoku 在自己的未分层 `:root` 中覆盖 `--frame-max`、`--frame-max-wide`、
`--frame-stage`，三项 exact-selector 冲突均在 mapping module 中显式登记，因此仍由 Gomoku
页面值获胜。其它游戏主要在各自 shell selector 上覆盖 `--frame-*`，这些元素级声明本来就会
覆盖从 `:root` 继承的默认值。本批继续不触碰 `.game-topbar`、`.game-hud-box` 或任何
drawer / start-menu / frame-budget / immersive contracts。

**P2-K dead-rule retirement：** PR #89 将游戏页 Footer 收敛为 hint-only 后，
`.game-footer-nav` 与 `.game-footer-nav[hidden]` 已没有任何 DOM consumer；它们不应为了
immutable migration ledger 而永久留在生产 CSS。P2-K 将 mapping contract 升到 v2，但刻意只新增
一个**窄的** append-only `kind: "retire"` transaction：仅允许退休 immutable P0 中仍未分层、
且不含 `!important` 或 custom-property declaration 的普通规则。retirement 只声明
“comparison-base 中这条精确 P0 rule 已因产品/DOM contract 消失而删除”；历史 mapping module
仍不可修改/删除。

P2-K **不支持** layered-source retirement、跨 PR provenance、`!important` retirement、
custom-property retirement，亦不尝试为 legacy debt representation 增加新的规范化语义。
这些能力当前没有生产需求；若未来确实出现，应以独立 contract/PR 重新设计，而不是把本批
dead-CSS 清理扩展成通用 CSS lineage 系统。

`.game-footer-actions` **不在本批退休**：游戏页虽然已不再渲染 action row，但首页 Footer
仍复用该 class 来排列语言/主题控件。立即把它拆成首页专属 page-layer rule 会把后续 `pages`
迁移混进 P2-K，因此保持现有共享 `layout` rule，待 page CSS dependency closure 时再解耦。
本批不改变任何仍有 consumer 的 layout/contracts 规则，也继续保留 `shared-css-first`。

**P2-L shared text-button component：** `.game-btn` 与 `.game-btn > svg` 是共享的
“图标 + 文案”按钮排版组件，而不是 shell 几何。它们只负责 inline-flex 居中、7px 间距与
15px 图标尺寸，不声明 margin / padding / box-sizing，也不承载 drawer、frame-budget、
start-menu 或 immersive 结构语义，因此本批归入 `components`。各页 `.xx-btn` 仍保持
未分层并继续拥有配色、内距、圆角和页面专属 flex 行为；Science Showcase 当前同样位于
`components`，其更具体的 `.science-showcase .game-btn` 规则保持原有同层 specificity /
stylesheet 顺序。未来 Showcase 归位到 `showcase` 时，本批声明也不会与其现有 min-height、
颜色/皮肤属性产生 property overlap。

P2-L 只迁这两个相邻规则，并分别登记 immutable mapping；不顺带迁 `.game-icon-btn`、
side-card family 或任何 reset-sensitive shared component。

**P2-M shared sidebar text typography：** `.game-side-text` 与 `.game-side-text b` 只负责
侧栏说明文字的字号、行高和前景色，不声明 margin / padding / box-sizing，也不参与
drawer/frame/start-menu/immersive 结构。它们因此作为共享 UI component 迁入 `components`。
各游戏自己的 `.xx-side-text` 规则仍保持未分层并继续拥有页面专属字体/颜色覆盖；Science
Showcase 的 `.science-showcase .game-side-text` 仍在现有 `components` 中以更具体选择器和
`!important` 维持当前皮肤。带几何的 `.game-side-card` / `.game-side-title` /
`.game-side-row` 继续暂缓，避免把 universal reset 依赖混入本批。

**P2-N shared sidebar value leaves：** `.game-side-row b` 与 `.game-side-panel b` 是侧栏组件
中的叶子规则，只设置值文本的颜色、tabular numeral 与 nowrap；不写 margin / padding /
box-sizing，也不改变父级 flex/grid/overflow。页面专属 `.xx-side-row b` / `.xx-side-panel b`
继续未分层并保留原有覆盖优先级，因此这两条可以独立归入 `components`。父级
`.game-side-row` / `.game-side-panel` 仍含 padding / gap / alignment 等几何属性，本批不迁。

**P2-O drawer title typography：** `.game-drawer-title` 只是 drawer 标题的字号、字重、字距和
文字颜色；不负责 drawer 的 position、display、transform、overflow、尺寸或开合状态，因此可
作为叶子 UI component 独立迁入 `components`。Science Showcase 的
`.science-showcase .game-drawer-title` 仍以更具体选择器和 `!important` 保持当前主题颜色。
`.game-drawer`、panel/head/body/handle 与 open/hidden/scroll-lock 等结构规则继续留在未分层
contracts 路径，不与本批混合。

**P2-P icon-button active leaf：** 本批只迁 `.game-icon-btn:active` 的按压缩放到
`components`。原计划同时迁移 hover，但审查确认未分层基础 `.game-icon-btn` 仍声明
`background: var(--tok-panel)`；未分层 normal declaration 会压过 layered normal declaration，
因此单独迁移 `.game-icon-btn:hover` 会让共享 hover 背景失效。hover 保持未分层，待基础按钮
background 与其 dependency closure 一起迁入兼容 layer 时再处理。active 只写 transform，且没有
exact-selector 页面 peer，因此可独立迁移。本批仍不迁基础 `.game-icon-btn`、`::after`
触控热区、wide variant 或 reduced-motion contract。

**P2-Q reset / cascade foundation：** #95 证明 selector 级微迁移已经触及结构边界：未分层
normal reset/base declaration 会压过所有 named-layer normal declaration，因此后续迁移必须按
property dependency closure 进行。本批把 layer taxonomy 显式升级为
`reset → tokens → showcase → components → layout → pages → contracts`，并一次迁移 P0 中
25 条**顶层 normal universal reset**。其中 22 个游戏页是 `margin:0 / padding:0 /
box-sizing:border-box` 三件套，index 与 layout 是共享 box-sizing reset，Tetris 额外包含全局
touch/user-select reset。每条历史规则仍有独立 immutable mapping，但作为一个 foundation
transaction 集中提交和验证。

本批**刻意不迁** 4 条 `prefers-reduced-motion` 下的 universal `!important` rules：
important declaration 的 layer precedence 与 normal 相反，把它们放进最低 `reset` 反而会获得
最高 named-layer 优先级；它们必须在后续 accessibility/contracts closure 单独审计。P2-Q 也不
顺带迁普通 component/layout/page rules。reset 下沉后，named-layer 组件将首次不再被页面
universal reset 反压，因此 Architecture candidate 必须把 computed style / browser geometry
作为验收证据；若需要补偿性 `!important` 才能维持行为，则回滚本批重新划分 closure，而不是
继续叠补丁。

从 P2-Q 起，默认迁移单位从“单 selector”切换为**semantic/property dependency closure**；
同一 property chain（例如 base background + hover）必须同批迁移。默认每个 PR 处理约
5–20 条相关规则，只有跨职责边界或无法证明 cascade 等价时才进一步拆分。

**P2-R / #97 Components Closure A：** reset foundation 落地后，第一批中等规模迁移按完整
component family 收口，而不是继续拆成 selector 微批次。本批把共享 `.game-icon-btn` base、
`::after`、`:hover`、`--wide` 共 4 条规则迁入 `components`；既有 `:active` 保持在同层，
base background → page hover / shared hover 的 property chain 因而闭合。≤480px 的 `font-size` /
`padding` same-selector responsive peers 经 dependency audit 后保持未分层，因此 normal cascade
仍由窄屏 peer 覆盖 layered base，与迁移前“后出现的窄屏规则获胜”等价。同 selector 的
`prefers-reduced-motion` `transition:none` accessibility peer 也保持未分层，并以
`peer-unlayered-wins` 显式登记其与 base `transition` 的 shorthand conflict。另因 verifier 对未知 vendor property 采取 fail-closed 策略，`-webkit-tap-highlight-color` 会展开为 wildcard write-set，因此它与上述 `font-size` / `transition` peers 的两条保守冲突也一并登记；这是验证模型的保守审计记录，不表示浏览器实际存在属性覆盖。页面自己的
`.xx-icon-btn` 皮肤和交互规则继续未分层，仍按既有 cascade 覆盖共享默认；Science Showcase
的更具体规则已经位于同一 `components` 层，继续由 specificity 保持现有皮肤。

Sidebar 同批迁入 `.game-side-card`、`.game-side-title`、`.game-side-row`、
`.game-side-panel`、`.game-side-kbd-row`、`.game-side-kbd` 6 条基础规则；此前已迁移的
side text / value leaves 保持 `components`，并与本批整理为连续 family block。#96 已把 universal
reset 下沉到最低 `reset`，因此 padding / margin 不再构成本批的未分层反压。审计确认 Tetris、
Tower Defense、Carrot Pull、Shadow Loom 等页面的不同-selector card/row peers 仍按页面规则获胜，
且 `more-games.css` 无 property overlap。

`.game-hud-box` 本批**明确暂缓**：Tetris 仍有同 selector 的 display / align-items / gap /
padding / border-radius 五项 peer。它需要和 Tetris page-side peer 组成独立 dependency closure，不能
为了凑批次把 shared default 单边送入 named layer。本批不新增 `!important`、不提高 selector
specificity，也不触碰 drawer / start-menu / frame / immersive contracts。


**P2-S / #98 Layout Closure A：** #96 的 reset foundation 与 #97 的 component family 收口后，
共享 shell 的基础几何可以按完整 responsive family 迁移。本批把 `.game-shell`、
`.game-topbar`、`.game-footer`、`.game-footer-hint` 的 base 与现有窄屏/矮屏/desktop peers
共 12 条规则迁入 `layout`，并保持每条响应式 peer 在原物理位置，因此同层 source order
继续表达原有覆盖关系。首页 `css/index.css` 的 exact-selector `.game-footer` 仍保持未分层，
其 `gap` / `padding` 页面值继续通过 normal unlayered precedence 覆盖 shared layout default；
该冲突在 mapping ledger 中显式登记。

本批不触碰 `.game-hud-box`：它仍需与 Tetris 的五项 exact-selector peer 在首次
`pages` dependency closure 中一起迁移。drawer、start-menu、`has-stats-drawer`、
frame-budget、immersive safe-area 等结构规则也全部继续留给 `contracts` closure。
Science Showcase 对 topbar/footer/hint 的现有规则只写视觉属性或 `!important` 色彩，
与本批几何 property chain 不构成 exact-selector normal cutover；最终仍由浏览器
geometry/chrome 回归确认 cross-selector 行为等价。

**P2-T Pages Closure A：** 首次进入 `pages` 层时不做 whole-page wrapper，而是先闭合两个已经
被前序批次明确记录的 dependency chain。共享 `.game-hud-box` 进入 `layout`，同时将
Tetris 的 `.game-hud-box` 与 `.game-title-pill` exact-selector 页面覆盖迁入 `pages`；
这样 `pages > layout` 显式取代原先依赖未分层 page CSS 的优先级。Tetris HUD 的
display / align / gap / padding / border-radius，以及 verifier 对 border shorthand 的保守
overlap，均在同一 transaction 中登记，避免单边切层改变 cascade。

首页 `css/index.css .game-footer` 同批迁入 `pages`，关闭 #98 暂留的 landing-page footer
override：其 gap / padding 继续稳定覆盖 shared `layout` footer 的 base、窄屏与矮屏 peers。
`.game-footer-actions` 本批仍留在 `layout`，但它本身没有与 ≤480px
`.game-topbar-group` 共用 class，后者的 4px gap 不会作用到 footer actions row。这里继续
暂缓只是为了把首页专属 actions-row 归层留给后续 pages 批次，而不是因为存在必须联动的
responsive dependency。drawer、stats-drawer、
frame-budget、immersive/safe-area 与 reduced-motion `!important` 仍全部留给后续
`contracts` / accessibility closure。

**P2-U Contracts Closure A：** 首次迁入 `contracts` 层，按 drawer / stats-drawer 完整结构族闭合，
而不是单独迁一条隐藏规则。共享 `.game-drawer` 与 `.game-drawer-panel` 采用 1→N migration：
定位、层级、尺寸、display、open/hidden 状态、panel transform 等结构不变量进入 `contracts`；
scrim、blur、边框、阴影与 transition 等皮肤/动画声明进入 `components`。同时将
`body.drawer-locked`、窄屏 `body.has-stats-drawer .game-sidebar` 和桌面
`.game-drawer { display:none }` 归入 `contracts`。同时把已知会命中同一 Tetris sidebar 的
`.info-panel { display:flex; ... }` 迁入 `pages`：窄屏由 `contracts > pages` 保证 sidebar
真正隐藏，桌面则仍由 `pages > layout` 保留 Tetris 自己的列布局。对全部 drawer 页面复扫后，
只有 Tetris 还存在页面级 `body` overflow peer，因此其 base、≤768px、≤480px 三条 `body`
规则也在同一 transaction 迁入 `pages`，确保 `body.drawer-locked` 的 `contracts` overflow
不会被未分层页面规则反压。这样同时关闭了早期 whole-file canary 的 sidebar 最小反例和 lock-scroll
同类风险，而不是只依赖 exact-selector verifier。

桌面 `.game-stats-btn { display:none }` **本批明确暂缓**：Tower Defense immersive 在
`css/tower-defense.css` 中有 `.td-shell.game-shell--immersive .game-stats-btn { display:inline-flex }`
的合法页面例外。若把共享隐藏规则单边提升到 `contracts`，会反压该页面 override；它必须与
Tower Defense peer 在后续独立 dependency closure 中一起处理。frame-budget、immersive/safe-area
与 reduced-motion `!important` 仍不进入本批。

**P2-V / #101 Frame Budget Closure：** 桌面纵向预算按完整 sidebar dependency family 收口。
共享 `body.has-frame-budget .game-sidebar` 采用 1→N migration：`max-height`、`overflow-y`、
`overscroll-behavior` 是“页面不能突破可用视口高度”的结构不变量，进入 `contracts`；
Firefox 的 `scrollbar-width` / `scrollbar-color` 以及 WebKit scrollbar / track / thumb / hover
伪元素只负责滚动条皮肤，进入 `components`。这样不会为了“同一个 selector”把视觉声明误归为
平台结构契约，同时仍在一个 transaction 中关闭完整 frame-budget family。

依赖审计以 `registry.withCap('frame-budget')` 为唯一页面清单，而不是继续维护历史“六页”名单。
当前所有 frame-budget 页面都使用标准 sidebar contract；逐页检查到的 `max-height` / `overflow-y`
均属于排行榜、说明等 sidebar **内部子容器**，没有发现直接竞争
`body.has-frame-budget .game-sidebar` 的页面级 peer，因此不需要把 17 份页面 CSS 一起迁层。
`verify-desktop-frame.mjs` 同批升级为 computed-style contract：除既有几何/画幅/chrome 检查外，
还要求 body 真正带 `has-frame-budget`，并验证 sidebar 的 computed `max-height ≈ innerHeight -
--frame-chrome`、`overflow-y:auto`、`overscroll-behavior:contain` 与 scrollbar skin，避免只看
class 或 bottom 几何而漏掉 layer precedence 回归。

Tower Defense 的 immersive stats-button 例外、immersive/safe-area family 与 reduced-motion
`!important` 仍明确留给后续 closure；本批不修改玩法、页面几何变量或 `shared-css-first`。

**P2-W / #102 Immersive & Safe-Area Contracts Closure：** 收口最后一组大型 normal-cascade
平台结构边界。共享 `--frame-immersive-max` / `--frame-immersive-min-h` 仍是可覆盖配置默认值，
进入 `layout`；`.game-shell--immersive`、immersive topbar/main/stage/footer 的视口边界、
safe-area padding、手势与 overflow 则进入 `contracts`。原来只在 desktop media 中重复
`max-width` 的两条 declaration-identical immersive peer 也进入同一 `contracts` 层；
P2 的 non-rule at-rule 语义仍是冻结契约，因此本批保留原 `@media` 容器而不把“删除 group”
偷偷塞进普通 rule retirement。

Tower Defense 与共享 contract 组成同一个 dependency closure：TD 的主题变量和背景/边框/阴影
仍属于 `pages`，而 800px 场景边界、主舞台几何、sidebar 隐藏、desktop stats-button 可见例外、
手机横屏全视口战斗进入 `contracts`。同时退休已经被
`layout: immersive` 永久取代的旧 desktop standard-grid `.td-main` / `.td-stage` /
`.td-sidebar` 三条规则；否则这些未分层旧规则会反压 named-layer immersive contract。

本批**不**迁共享 start-menu `:has(...)` family，也不迁 TD 自己的菜单态
touch/overflow 恢复：TD 的 `.td-overlay` 等页面 peer 仍未分层，若只把菜单例外提升到
`contracts`，反而会被这些 unlayered normal declarations 压回去。它们应与多款游戏中尚未分层
的页面级尺寸/overflow peers 一起作为后续独立 dependency closure。reduced-motion `!important` 也继续
留给 accessibility closure；`shared-css-first` 保持不变。普通态 stage 的
`position:relative` 继续是可定制 `layout` default，不被误升格为 immersive-only contract；
只有 TD 横屏战斗的 fixed positioning 属于结构例外。浏览器验收在既有 registry-driven
`verify-immersive.mjs` 上增加 computed-style contract，并显式守住 TD 桌面 stats-button 例外、
safe-area padding、stage overflow/可配置 min-height 与横屏 fixed stage。

**P2-X / #103 Reduced-Motion Accessibility Closure：** reduced-motion 的 important cascade 不能沿用
normal declaration 的 layer 直觉：named-layer `!important` 优先级与 normal 相反。为此目标 taxonomy
扩展为 `reset → tokens → showcase → components → accessibility → layout → pages → contracts`。
`accessibility` 放在 `components` 之后。原因不是让一般组件动画压过无障碍规则——normal declaration
无论如何都会输给 `!important`——而是 `science-showcase.css` 的共享 reduced-motion clamp 当前仍归
`components`。important layer 优先级反转，因此让 `components` 先于 `accessibility` 可以保留既有
`0.001ms` duration clamp，同时 accessibility 仍稳定压过 layout/pages/contracts 与所有 normal motion；
`reset` 继续禁止 important declaration，避免最低 normal reset 反而变成最高 important 层。

本批只迁 P0 中 22 条 `@media (prefers-reduced-motion: reduce)` 下、且整条 rule 全为
`!important` 的 motion declaration，允许属性严格限制为 animation/animation-duration/
animation-iteration-count/transition/transition-duration/scroll-behavior。共享 `layout.css` 的
`.game-icon-btn` 与 drawer/panel 两条 normal `transition:none` 则进入最后的 `contracts`，
因为 normal cascade 需要高于 components；不通过新增 `!important` 强行塞进 accessibility。
其余页面级 normal reduced-motion 规则仍保持未分层：它们与尚未迁层的 page base transition/
animation peers 同属后续 dependency closure，单边迁移会让 unlayered normal base 反压无障碍规则。

contract v3 对 accessibility destination 做 fail-closed 校验：必须来自未分层 P0、必须位于
`prefers-reduced-motion: reduce`、必须全部为 reviewed motion `!important`，且整条 source rule
不得拆到其它 layer。浏览器回归同时验证 universal duration clamp、page animation/transition
suppression、shared icon/drawer normal override，以及仍由 components 持有的 Science Showcase
shared reduced-motion clamp precedence 没有被新层顺序改变。

**P2-Y / #104 Landing Page Ownership Closure：** #89 以后游戏页已经不再渲染
`.game-footer-actions`，当前唯一消费者是首页 footer 的语言/主题控件，因此它不再是共享
`layout` default，而是明确的 landing-page `pages` 规则。P2 的 migration contract 禁止
跨 stylesheet 搬迁，所以本批保留规则在 `css/layout.css` 的物理位置，只把 layer ownership
从 `layout` 重新归到 `pages`；这再次落实“文件路径不等于 layer ownership”，同时保持稳定的
rule identity 与 append-only lineage。

该 relayer 不减少 P0 unlayered debt，也不改 declaration、selector 或 DOM。首页现有
`verify-index-layout.mjs` 同批扩展为六档视口 computed-style contract，持续断言 actions row
为 flex、横纵居中且 gap 为 8px，避免以后把 landing-only rule 误迁回共享 layout 或因 responsive
peer 造成无声级联变化。完成本批后，再进入 P3 A–E 的插件保留模式全页面行为验证。

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

**P3-A 行为验收：** 首批使用统一浏览器 harness 覆盖 index、word-daily、minesweeper、
reversi、gomoku。每页在 1280×900 与 390×844 下检查关键 DOM 几何和横向溢出，在深/浅
主题下检查页面主题变量与实际背景切换，并冻结各页面现有 `--frame-*` 覆盖值；同时执行一个
最小真实交互，避免“几何正常但控件被层叠关系盖住”。同一个 `verify-css-p3a.mjs` 必须先由
`verify-all` 对源码态执行，再由 Architecture v2 candidate 对 `dist/` 产物执行。该批不修改
CSS ownership、selector 或 `shared-css-first`，只建立插件保留模式下的行为证据。

**P3-B 行为验收：** 第二批复用同一 harness 覆盖 planet-merge、hoop-shot、
gravity-slingshot、sword-flight、needle-awn。除基础 DOM 几何与真实交互外，本批冻结
registry `frame-budget` 激活、`--frame-chrome` 初始化和各页 `--frame-*` 参数；桌面态按
420×640 / 480×640 逻辑画幅校验 canvas 比例，所有视口都要求 backing buffer 不小于 CSS
显示尺寸。390×844 竖屏额外要求舞台留在视口高度内且不产生 document 纵向滚动。Sword
Flight 的竖屏舞台有意取消固定 aspect-ratio，因此逻辑画幅比例只在 desktop 冻结。仅
Hoop Shot 声明 `theme-light`，所以只有该页执行深/浅主题切换验收；其余四页不在本批
顺带引入新的浅色主题契约。同一 `verify-css-p3b.mjs` 必须覆盖源码态与 `dist/`。

**P3-C 行为验收：** 第三批复用同一浏览器 harness 覆盖 crystal-bloom、echo-cave、
maxwell-demon、flame-verse、ripple-duet，重点冻结 `science-showcase` 与各页未分层 skin
之间的双向优先级边界。共享 showcase 的重要表面规则必须继续控制 body 背景、topbar/footer/
side-card、标题、mode/primary 控件、HUD cut box 与 overlay；页面自己的 normal skin 则继续
保留 body typography、canvas border/radius/shadow/touch-action 等未被 showcase 接管的属性。
三款声明 `theme-light` 的页面（Crystal Bloom、Maxwell's Demon、Ripple Duet）同时验证深浅
主题 accent/material 切换，Echo Cave 与 Flame Verse 不新增浅色契约。每页在 1280×900 与
390×844 下继续验证无横向溢出、关键 shell 几何以及最小真实玩法进入；同一
`verify-css-p3c.mjs` 必须覆盖源码态与 `dist/`。本批只建立行为证据，不改变 CSS ownership、
selector、玩法、frame variables 或 `shared-css-first`。


**P3-D 行为验收：** 第四批复用同一浏览器 harness 覆盖 tetris、tower-defense、
carrot-pull、firefly-signal、shadow-loom，冻结 drawer / immersive / fixed-control 与生产美术
四类高风险边界。Tetris、Carrot Pull 与 Shadow Loom 在桌面继续由 sidebar 持有 stats 内容，
390×844 窄屏则保留共享 Stats 触发钮、fixed 底部抽屉、背景 scroll-lock 与单实例内容搬迁；
Tower Defense 明确维持页面自有 tactical panel，不退回共享 drawer。Tower Defense 与
Firefly Signal 继续验证 `has-immersive-stage`、scene overflow/touch contract 与高清 canvas
buffer；TD 在真实进入战斗后额外旋转到 844×390，冻结 stage/topbar 的 fixed 全视口状态、
隐藏 footer 与舞台内 bottom controls。Carrot Pull / Tower Defense 同时冻结 production art
ready 状态，Tetris 的移动端 fixed controls、Shadow Loom 的 page-owned canvas skin 以及五页
最小真实玩法入口都必须保持。Tetris 与 Carrot Pull 继续覆盖深/浅主题；其余三页维持 dark-only。
同一 `verify-css-p3d.mjs` 必须覆盖源码态与 `dist/`。本批仍只增加行为证据，不修改 CSS
ownership、selector、玩法、frame variables 或 `shared-css-first`。

**P3-E 行为验收：** 最后一批覆盖 math-rain 与 tank-battle 两个明确不参加 shared shell/topbar
骨架的化外页，重点冻结“独立页面所有权”而不是强行统一结构。Math Rain 保留 page-owned
`body { overflow:hidden }`、观测舱 responsive production background、装饰层 pointer passthrough，
并在 desktop / 390×844 下验证 game container / game area 几何、Canvas 可见性和真实开局；
Tank Battle 继续保持 800×600 逻辑画布与 4:3 战场、覆盖式 HUD、production art + terrain cache，
desktop 不出现手机控制层，390×844 触屏竖屏由 fixed rotation gate 独占，844×390 横屏则显示
virtual controller 且 D-pad / Fire 命中区域不缩水。两页都必须明确保持在 frame-budget /
immersive / stats-drawer shared markers 之外，并执行最小真实交互，防止未来 layer cutover 把
“化外页”误吸收到共享结构契约。两页均维持 dark-only，不在本批新增浅色主题。
同一 `verify-css-p3e.mjs` 必须由 `verify-all` 覆盖源码态，并由 Architecture v2 candidate
对 `dist/` 产物再次执行；本批不修改生产 CSS/JS ownership、selector、玩法或
`shared-css-first`。

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
9. 最终 layer order 为 `reset, tokens, showcase, components, accessibility, layout, pages, contracts`；
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
- [x] 修正目标架构为 `reset, tokens, showcase, components, accessibility, layout, pages, contracts`
- [x] 升级 verifier，使 migration-state 支持稳定 occurrence、1→N/重新归层与单向 ratchet
- [x] 启动首个 dependency-closed production canary：`.game-stage--fill` → `layout`
- [x] P2-B：迁移 `.game-main` 顶层默认规则，并验证 desktop 同 selector peer 的 precedence 保持
- [x] P2-C：迁移 `.game-stage` 顶层默认规则；desktop `max-width` 与 page/immersive/start-menu 覆盖关系保持不变
- [x] 冻结 `layout.css` 的 layout defaults / contracts 职责切片边界
- [x] P2-D：迁移 `.game-topbar-group` / `.game-topbar-center`；`.game-topbar` 因未分层 universal reset 的 padding 竞争暂缓
- [x] P2-E：将已迁移 defaults 的普通响应式 peer（desktop `.game-main` / `.game-stage`、≤480px `.game-topbar-group` / `.game-topbar-center`）及 narrow footer spacing 依赖 `.game-footer-actions` 闭包迁入 `layout`；保持同层物理顺序，`.game-topbar` 继续暂缓
- [x] P2-F：迁移 `.game-canvas` 共享默认规则到 `layout`；保留 page-specific canvas 规则未分层覆盖，不触碰 reset-sensitive 或 contracts 规则
- [x] P2-G：迁移 desktop `.game-sidebar` 默认几何到 `layout`；drawer 隐藏与 frame-budget overflow/scrollbar 继续保留给 contracts 闭包
- [x] P2-H：迁移 `.game-toast` 共享定位默认值到 `layout`；page-specific toast 规则继续未分层覆盖，不触碰 overlay/hidden/contracts
- [x] 将 CSS migration ledger 拆为 manifest + per-mapping modules；主状态文件不再承载不断增长的完整 mapping payload
- [x] P2-I：迁移 `.game-title-pill` 共享顶栏信息块默认值到 `layout`；Tetris exact-selector peer 保持未分层并显式登记冲突
- [x] P2-J：迁移共享 frame `:root` 变量默认值到 `layout`；Gomoku 的 3 个 exact-selector 自定义属性覆盖保持未分层优先
- [x] P2-K：以窄版 P0-only retirement transaction 清理 #89 后遗留的 Footer nav dead rules；明确拒绝 layered / `!important` / custom-property retirement，并保留首页仍使用的 `.game-footer-actions`
- [x] P2-L：迁移共享 `.game-btn` / `.game-btn > svg` 文案按钮排版到 `components`；页面按钮皮肤继续保持未分层优先，不触碰 reset-sensitive/shared contracts
- [x] P2-M：迁移共享 `.game-side-text` / `.game-side-text b` 侧栏文字默认值到 `components`；side-card/title/row 的 reset-sensitive 几何继续暂缓
- [x] P2-N：迁移共享 `.game-side-row b` / `.game-side-panel b` 值文本叶子规则到 `components`；父级 row/panel 几何继续暂缓
- [x] P2-O：迁移 `.game-drawer-title` 标题 typography 到 `components`；drawer 的 open/hidden/panel/body/scroll-lock 结构契约继续未分层
- [x] P2-P：仅迁移 `.game-icon-btn:active` 按压状态到 `components`；hover 因未分层基础 background 会反压 layered hover 而继续暂缓，待基础按钮 dependency closure 一起迁移
- [x] P2-Q：新增最低 `reset` layer，并将 25 条顶层 normal universal reset 作为一个 foundation closure 迁入；4 条 reduced-motion universal `!important` 继续暂缓
- [x] P2-R / #97：完成 Components Closure A；迁移 icon family 4 条 + Sidebar family 6 条到 `components`，保留既有 active/text/value leaves；两条窄屏 icon peers 经审计后保持未分层以维持既有 precedence；`game-hud-box` 因 Tetris 五项 exact-selector peer 暂缓
- [x] P2-S / #98：完成 Layout Closure A；迁移 shell/topbar/footer/footer-hint 四个 responsive family 共 12 条规则到 `layout`；首页 `.game-footer` 页面覆盖保持未分层优先，`game-hud-box` 与 contracts family 继续暂缓
- [x] P2-T：完成 Pages Closure A；共享 `.game-hud-box` → `layout`，Tetris HUD/title + 首页 `.game-footer` → `pages`，首次闭合 `layout → pages` exact-selector dependency chain；`.game-footer-actions` 与 contracts family 继续暂缓
- [x] P2-U：完成 Contracts Closure A；drawer / stats-drawer 结构族首次进入 `contracts`，`.game-drawer` / panel 以 1→N 拆分保留视觉到 `components`，Tetris `.info-panel` 与三条 body overflow peers 同步进入 `pages`，闭合 sidebar display + drawer-lock 跨-selector 依赖；Tower Defense 桌面 stats-button 例外、frame-budget 与 immersive family 继续暂缓
- [x] P2-V / #101：完成 Frame Budget Closure；sidebar 纵向预算进入 `contracts`，scrollbar skin 留在 `components`
- [x] P2-W / #102：完成 Immersive & Safe-Area Contracts Closure；共享 immersive 边界与 Tower Defense 结构例外组成 dependency closure
- [x] P2-X / #103：完成 Reduced-Motion Accessibility Closure；新增 `accessibility` layer 并关闭 reviewed `!important` motion debt
- [x] P2-Y / #104：完成 Landing Page Ownership Closure；将首页独占 `.game-footer-actions` 从 `layout` 重新归位到 `pages`，并补 computed-style 回归
- [x] P3-A / #105：验证 index / word-daily / minesweeper / reversi / gomoku 的源码态 + dist 行为等价
- [x] P3-B / #106：验证 planet-merge / hoop-shot / gravity-slingshot / sword-flight / needle-awn 的画布、frame-budget 与移动端高度契约
- [x] P3-C / #107：验证 crystal-bloom / echo-cave / maxwell-demon / flame-verse / ripple-duet 的 showcase / page-skin 优先级与源码态 + dist 行为等价
- [x] P3-D / #108：验证 tetris / tower-defense / carrot-pull / firefly-signal / shadow-loom 的 drawer、immersive、fixed controls 与生产美术契约
- [ ] P3-E / #109：验证 math-rain / tank-battle 两个化外页的独立 CSS、全屏/覆盖式 HUD、orientation 与真实交互，并覆盖源码态 + dist
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
