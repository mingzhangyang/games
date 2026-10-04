# CSS Cascade Layers：P0/P1 基线与审计

> 日期：2026-10-03  
> 基线源码：`6bb0d80540707e09cfa41bde0d2384c86f6fedd6`（PR #74 合并后的 main）  
> 范围：只记录现状并启用 debt guard；此变更不改 CSS cascade 语义。  
> `shared-css-first` 继续作为生产构建契约。  
> 2026-10-04：whole-file P2 canary 因真实布局回归被否决并回滚；本文件下方记录修正后的规则级结论。

## 交接门槛

Architecture v2 Phase 0–9 已由 PR #74 完成。候选 CI #119（run `37133888429`）通过 production build、full verify、Tower Defense / Sword Flight 产物 smoke 和 Cloudflare Worker dry run。P0 的几何值从该轮 `verify-desktop-frame` 日志采集。

本 PR 新增静态 debt guard，并把代表性桌面舞台宽度冻结在 `verify-desktop-frame`。P2 只在本 PR 的 CI 和 review 通过后开始；届时仍保留 `shared-css-first`。

## P0：CSS 与 HTML 现状

当前共有 31 个 CSS 文件、2,912 条普通样式规则。66 条已分层（tokens 16、components 50），其余 2,846 条仍未分层，分布在 28 个文件。CSS 文件职责和当前状态如下。表中的“目标层”是 P1 当时的**文件级候选**，仅用于盘点；2026-10-04 canary 已证明它不能机械解释为“整个文件包进一个 layer”。

| 文件 | owner | 目标层 | 已分层 / 未分层规则 | `!important` | 自定义属性定义 | 当前层 |
| --- | --- | --- | ---: | ---: | ---: | --- |
| `css/bond-forge.css` | bond-forge | pages | 0 / 112 | 1 | 124 | — |
| `css/carrot-pull.css` | carrot-pull | pages | 0 / 126 | 1 | 173 | — |
| `css/circuit.css` | circuit | pages | 0 / 80 | 2 | 140 | — |
| `css/crystal-bloom.css` | crystal-bloom | pages | 0 / 104 | 2 | 150 | — |
| `css/echo-cave.css` | echo-cave | pages | 0 / 94 | 2 | 10 | — |
| `css/firefly-signal.css` | firefly-signal | pages | 0 / 65 | 1 | 13 | — |
| `css/flame-verse.css` | flame-verse | pages | 0 / 94 | 2 | 12 | — |
| `css/gomoku.css` | gomoku | pages | 0 / 26 | 4 | 36 | — |
| `css/gravity.css` | gravity-slingshot | pages | 0 / 73 | 2 | 8 | — |
| `css/hoop-shot.css` | hoop-shot | pages | 0 / 61 | 2 | 107 | — |
| `css/index.css` | index | pages | 0 / 114 | 0 | 166 | — |
| `css/layout.css` | shared | layout | 0 / 89 | 1 | 18 | — |
| `css/lumen.css` | lumen | pages | 0 / 75 | 2 | 10 | — |
| `css/math-rain/math-rain.css` | math-rain | pages | 0 / 182 | 7 | 18 | — |
| `css/math-rain/shop.css` | math-rain | pages | 0 / 22 | 0 | 0 | — |
| `css/maxwell-demon.css` | maxwell-demon | pages | 0 / 104 | 2 | 136 | — |
| `css/minesweeper.css` | minesweeper | pages | 0 / 102 | 2 | 118 | — |
| `css/more-games.css` | shared | components | 6 / 0 | 0 | 0 | components |
| `css/needle-awn.css` | needle-awn | pages | 0 / 111 | 3 | 22 | — |
| `css/planet-merge.css` | planet-merge | pages | 0 / 78 | 0 | 8 | — |
| `css/reversi.css` | reversi | pages | 0 / 92 | 2 | 104 | — |
| `css/ripple-duet.css` | ripple-duet | pages | 0 / 104 | 2 | 160 | — |
| `css/science-showcase.css` | shared | showcase | 44 / 0 | 60 | 61 | components |
| `css/shadow-loom.css` | shadow-loom | pages | 0 / 79 | 1 | 22 | — |
| `css/silk-dew.css` | silk-dew | pages | 0 / 87 | 2 | 144 | — |
| `css/sword-flight.css` | sword-flight | pages | 0 / 143 | 3 | 23 | — |
| `css/tank-battle.css` | tank-battle | pages | 0 / 90 | 5 | 8 | — |
| `css/tetris.css` | tetris | pages | 0 / 106 | 7 | 100 | — |
| `css/tokens.css` | shared | tokens | 16 / 0 | 0 | 59 | tokens |
| `css/tower-defense.css` | tower-defense | pages | 0 / 263 | 2 | 5 | — |
| `css/word-daily.css` | word-daily | pages | 0 / 170 | 3 | 213 | — |

另有 27 个活动 HTML 文件（26 个页面与 `public/404.html`）。当前内联样式基线：

- 1 个 `<style>` 块、6 条规则，位于 `public/404.html`；该页没有 CSS link。
- 14 个 `style=""` 属性，分布在 `math-rain.html`（1）、`needle-awn.html`（3）、`sword-flight.html`（5）、`tetris.html`（4）、`word-daily.html`（1）。
- baseline 保存每条未分层规则、keyframes、重要声明和内联例外的逐项签名；不只保存总数。

### 页面样式表顺序

源码页面的共享链接顺序是：

`tokens.css → layout.css → [science-showcase.css] → page CSS → [more-games.css]`

- Index 页没有 `more-games.css`。
- Tank Battle 没有 `more-games.css`。
- Math Rain 依次加载 `math-rain/math-rain.css`、`math-rain/shop.css`，然后加载 `more-games.css`。
- Sword Flight 的 Google Fonts 外链位于内部样式表之后。
- Showcase 页面将 `science-showcase.css` 放在页面 CSS 之前。

`verify-css-debt.mjs` 固定 27 页的精确 stylesheet link 顺序、CSS/HTML 文件清单、当前 layer 声明与包裹位置。它会在 `verify:changed` 中运行。P0 baseline 是不可变历史快照，不再随迁移下调；后续迁移进度只能记录在独立 migration state。新添/替换的未分层规则、keyframes、`!important` 或内联样式仍会失败。CSS 新文件必须显式登记 ownership，并在 P2 规则级审计中登记职责。

## P1：特殊规则和全局样式审计

| 类别 | 当前数量 | 迁移说明 |
| --- | ---: | --- |
| `@media` | 104 | 保留原上下文并随规则包裹。 |
| `@keyframes` / vendor keyframes | 85 | 逐项进入 baseline；名字 `fadeIn` 出现在 Tetris 与 Sword Flight，但两页不共载。包裹后仍需验证 animation-name 的层级行为。 |
| `@layer` 声明 | 1 | `tokens.css` 声明 `tokens, layout, components`。 |
| `@layer` block | 3 | `tokens.css` 的 `tokens`；`more-games.css` 和 `science-showcase.css` 的 `components`。 |
| `@charset` / `@import` / `@font-face` / `@property` / `@page` / `@namespace` | 0 | 当前无此类例外。 |

普通规则中有 2,168 次自定义属性声明。这里的指标与 `verify-css-debt.mjs` 完全一致：按 parser 解析到的 declaration occurrence 计数，同一 `--property` 在不同 selector、主题或 media context 中重复定义会逐次计入，不做属性名去重。P0 baseline 的逐文件 `customPropertyDefinitions` 字段由 verifier 逐项复核。共有 64 条选择器涉及 `html`、`body` 或 `canvas`；另有 18 条使用 `position: fixed` 或 `sticky`。这些全局、画布和固定定位规则在 P0/P1 均保持原样。

### 跨文件冲突矩阵

对每个实际共同加载的 stylesheet pair，以完全相同的 selector 文本和 property 做交集。共发现 28 个交集，其中 5 个是自定义属性；其余为普通属性。

| 共同加载文件 | 精确 selector/property 交集 | 内容 |
| --- | ---: | --- |
| tokens ↔ Gomoku | 6 | `:root --tok-accent-2`；`.btn` 的 5 项默认值。 |
| layout ↔ Gomoku | 3 | `:root` 的 `--frame-max`、`--frame-max-wide`、`--frame-stage`。 |
| layout ↔ Index | 3 | 全局 `box-sizing`；Index 对 `.game-footer` 的 `gap` 与 `padding` 覆盖。 |
| tokens ↔ Tank Battle | 1 | `:root --tok-accent-2`。 |
| tokens ↔ Tetris | 6 | `.btn` 的 6 项属性。 |
| layout ↔ Tetris | 9 | `.game-title-pill` 的 4 项、`.game-hud-box` 的 5 项。 |
| layout ↔ Showcase | 0 | 没有完全相同的 selector/property；另见下方不同 selector 的相同元素审计。 |
| Showcase ↔ 页面 CSS | 0 | 没有完全相同的 selector/property。 |
| more-games ↔ 页面 CSS | 0 | 没有完全相同的 selector/property。 |

这个矩阵按 selector 文本完全相同计算；不同文本的选择器仍可能命中同一个元素，因此它不单独证明所有 DOM 状态等价。P3 的 A–E 源码态和生产产物回归仍是行为验收。

### Layer 顺序结论（2026-10-04 修正）

P1 最初提出过五层文件级候选：

```css
@layer tokens, showcase, components, layout, pages;
```

它只分析了 link 顺序、完全相同 selector/property 交集和部分不同-selector 冲突，仍遗漏了一个关键事实：
**layer precedence 先于 selector specificity**。因此“页面样式表后加载”不能简单翻译成“整个页面文件放在
比 layout 更晚的 layer”。

P2 whole-file canary 给出了确定反例：Tetris 页面层的 `.info-panel { display:flex }` 在
`pages` 层后，压过了较早 `layout` 层的
`body.has-stats-drawer .game-sidebar { display:none }`。在旧的同层/未分层 cascade 中，后者依靠
更高 specificity 正确隐藏移动 sidebar；分层后 specificity 根本没有机会参与比较。同一 CI
还出现 desktop frame、immersive、start-menu、carrot-pull、needle-awn、Tetris drawer/topbar
等多组几何回归，证明这不是 Tetris 单点异常。

因此五层文件级候选被否决。修正后的**规则职责级**目标为：

```css
@layer tokens, showcase, components, layout, pages, contracts;
```

其中 `layout` 只承载页面可以覆盖的共享默认几何；`contracts` 最后承载 drawer/frame/immersive/
safe-area 等平台结构不变量。页面视觉与玩法专属组件进入 `pages`。同一个 `layout.css` 或游戏
CSS 文件都允许出现多个 layer block，文件路径不再决定 layer ownership。

P0 快照与迁移状态也必须分离：`tests/css-layer-p0-baseline.json` 是不可变证据；
`tests/css-layer-migration-state.json` 才是后续 rule-level ratchet。任何迁移都必须先让 verifier
能证明“某条 P0 debt 已在指定 layer 出现”，再允许它退出 active debt。

其他审计结果：

1. 普通声明的 28 个完全相同 selector/property 交集均出现在 tokens/layout 与 Gomoku、Index、Tank Battle、Tetris 之间；候选顺序使页面层高于这些共享层。
2. 123 条 `!important` 声明里，shared/page 两侧没有完全相同 selector/property 的 important 冲突。layout 的唯一 `height: auto !important` 没有页面侧的 `height` 或尺寸逻辑属性 important 声明。
3. `:root` 的 5 个重复自定义属性都来自 tokens/layout 与页面 CSS；`pages` 最后继续让页面值生效。
4. `science-showcase.css` 与 `more-games.css` 对共同加载页面 CSS 没有完全相同 selector/property；它们的非同名共享控件关系按上述 layer 顺序处理。

原五层结论不再冻结 P2。六层规则职责模型必须先通过 rule-level verifier，再由 P3 的 A–E 回归确认 DOM、响应式与交互行为，之后才能进入 P4 canary。

## P0 行为基线

### 桌面舞台宽度

数据来自 CI #119 的中文桌面档。新的 `verify-desktop-frame` 会对这 17 页的三个宽度逐一精确断言。

| 页面 | 1280×900 | 1920×1080 | 2560×1440 |
| --- | ---: | ---: | ---: |
| tetris | 379 | 469 | 480 |
| planet-merge | 481 | 599 | 630 |
| hoop-shot | 480 | 598 | 630 |
| gravity-slingshot | 568 | 703 | 720 |
| needle-awn | 566 | 701 | 718 |
| sword-flight | 568 | 703 | 720 |
| lumen | 757 | 937 | 960 |
| circuit | 928 | 1249 | 1280 |
| silk-dew | 568 | 703 | 720 |
| bond-forge | 579 | 717 | 734 |
| echo-cave | 560 | 695 | 720 |
| maxwell-demon | 654 | 811 | 840 |
| crystal-bloom | 654 | 811 | 840 |
| flame-verse | 654 | 811 | 840 |
| ripple-duet | 654 | 811 | 840 |
| carrot-pull | 654 | 665 | 665 |
| shadow-loom | 426 | 527 | 540 |

### 主题、侧栏与 drawer 契约

- 手机：sidebar 为 `display:none`；stats 按钮至少 36×36；drawer 关闭时隐藏。
- 桌面：sidebar 为 `display:flex`；drawer 隐藏；stats 按钮隐藏；panel 回到 sidebar。
- Drawer 打开：panel 最大高度为 `90dvh`；backdrop opacity 为 1；body 保持 `position: static`。
- 基线回归证据：theme 392 assertions、start menus 206 assertions、stats drawer 及 desktop frame 全部通过。

### 已知基线缺口

这些是迁移前已经存在的问题，不能计作新回归：

- Tetris canvas backing width 固定为 400px；CSS client width 在 1920×1080 达到 469px、2560×1440 达到 480px（中英文共四个告警）。
- Tetris 首屏在 360×640 时棋盘超出可视区域 52px，在 320×568 时超出 136px；滚动仍可用。

## 后续门槛

- P2 先启用独立 migration state 与 rule-level verifier；禁止修改 immutable P0，也禁止 whole-file wrapper。
- P2 按职责把共享默认值放 `layout`、页面专属规则放 `pages`、结构不变量放最后的 `contracts`；每批只迁移已审计规则。
- P3 按 A–E 批次跑源码态和 production 输出检查；任何行为失败先回滚当前批次并重新审计职责，不用 `!important` 打补丁。
- P4 加入仅用于 canary 的构建开关，对照正常构建与禁用 `shared-css-first` 的输出。
- P5 保留插件稳定运行，确认普通 CSS debt 清零或剩下书面例外，并完成候选 CI。
- P6 另开单独小 PR 移除 `shared-css-first`。
