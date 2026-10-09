# 页面骨架统一契约（现行版）

> 历史：2026-09-18 建立骨架统一，2026-09-19 并入桌面纵向预算与 stats drawer，
> 2026-09-20（P3-3/P4）并入语义标签契约与化外页收编。上一版底稿见
> `docs/archive/layout-contract-2026-09-18.md`。
>
> 目标：13 个小游戏页面共用同一套页面骨架，只保留各自的视觉皮肤与游戏内容，
> 而不是每页自己写一套容器/顶栏/画布/侧栏几何。

- 契约文件：`css/layout.css`（骨架与 `--frame-*` 参数）、`css/tokens.css`（颜色/圆角/控件尺寸）
- 引入顺序（硬性）：`tokens.css → layout.css → <game>.css → more-games.css`
  - 在这之前：gen 的 `head` 区域输出同步脚本 `/theme-boot.js`，必须先于任何样式表（首屏主题，见 `theme.md`）
  - 五个科学实验室游戏（crystal-bloom / echo-cave / maxwell-demon / flame-verse / ripple-duet）在 layout 与页面 CSS 之间多一层 `science-showcase.css`；这是源码/生成器的 authoring 顺序，不再依赖构建后 link 重排
- 历史参考：`tools/archive/migrations/apply-layout-unification.py` 已归档，不用于日常开发。当前直接按本文接入共享 `game-*` 骨架与 `--frame-*` 配置，并运行现行布局校验。
- 校验工具：`tools/dev/layout-metrics.mjs`、`tools/dev/shots.mjs`、`tests/lib/serve-static.mjs`、
  `tests/verify-desktop-frame.mjs`、`tests/verify-stats-drawer.mjs`

---

## 1. 契约内容

### 1.1 通用类（追加在原有类名之后，不改任何原有类名）

| 通用类 | 用途 | 典型位置 |
| --- | --- | --- |
| `game-shell` | 页面容器：单列居中、`max-width` 由参数决定 | `<div class="gd-shell game-shell">` |
| `game-topbar` | 顶栏：左 home / 中信息 / 右动作 | `<header class="gd-topbar game-topbar">` |
| `game-topbar-group` | 顶栏左右动作簇 | `<div class="gd-topbar-actions game-topbar-group">` |
| `game-main` | 舞台 + 侧栏的横向容器（移动端纵向） | `<main class="gd-main game-main">` |
| `game-stage` | 舞台：承载画布与覆盖层的定位盒（`position: relative`） | `<div class="gd-stage game-stage">` |
| `game-stage--fill` | 需要吃掉剩余高度的舞台 | 纵向 100vh 布局的游戏 |
| `game-canvas` | 画布外框：`width:100%` + 统一圆角 | `<canvas class="game-canvas">` |
| `game-sidebar` | 桌面侧栏（≥1024px 生效，宽度 `--frame-side`） | `<aside class="gd-sidebar game-sidebar">` |
| `game-side-card` / `-title` / `-text` / `-row` / `-panel` | 侧栏卡片族 | 记录卡、玩法说明 |
| `game-side-kbd-row` / `game-side-kbd` | 快捷键行 / 键帽 | 操作说明 |
| `game-lb` / `game-lb-title` / `game-lb-list` / `game-lb-row` / `game-lb-rank` / `game-lb-name` / `game-lb-score` / `game-lb-empty` / `game-lb-status` | 排行榜稳定骨架 | 几何/排版全部共享，**无页面级几何例外**；页面只留调色板（背景、边框、阴影、文字色、前三名底色） |
| `game-lb-username-row` / `game-lb-username-label` / `game-lb-username` | 排行榜用户名编辑行 | 输入布局与尺寸共享；背景、边框、focus 色留在页面 |
| `game-overlay` | 舞台内覆盖层（`absolute` 铺满 + 玻璃模糊 + 可滚动） | 开始/结算界面 |
| `game-toast` | 舞台内提示条 | 居中胶囊 |
| `game-footer-hint` | 底部操作提示 | `<p class="xx-footer-hint game-footer-hint">` |
| `game-icon-btn` | 顶栏图标钮（40px 视觉 / ≥44px 触控热区） | home、暂停、静音… |
| `game-icon-btn--wide` | 文字型图标钮（宽度自适应） | 语言切换（如 "Idioms" 这类长标签） |
| `game-btn` | 图标 + 文案 composition primitive：只负责 inline-flex、对齐、gap 与 SVG 尺寸 | 特殊 mode/玩法控件也可复用 |
| `game-action-btn` / `--primary` / `--ghost` | 标准文本 action surface：字号、内距、圆角、基础皮肤与 hover/active | Play / Again / Retry / Copy / Home 等标准动作 |
| `game-action-row` | 标准 action button 横向布局 | 结算/通关按钮组 |
| `game-title-pill` / `game-hud-box` | 顶栏中部标题 / 数值块 | 模式标记、分数 |
| `sr-only` | 语义标题视觉隐藏（P3-3） | `<h1 class="sr-only">` |

引入顺序决定成败：`layout.css` 在前，各页仍可用自己的规则与变量覆盖。
但**稳定组件几何与交互状态**应交给契约，页面前缀类只保留业务选择器和确有必要的视觉/行为例外。排行榜与标准 action button 都是 family-sized 例子：`game-lb-*` 拥有稳定榜单骨架；`game-action-btn*` / `game-action-row` 拥有标准 action surface。不要因为历史页面 CSS 已存在就复制一套 `.xx-btn` 几何。历史上更大一号的个例（Hoop Shot、Planet Merge、Reversi、Tower Defense 的 15px / 14px 圆角按钮、手机端尺寸覆盖、页面自带的 primary hover 和 TD 沉浸式按钮皮肤）已一并收编进同一 family：标准 action 不设页面级尺寸例外。需要完全不同语义的 mode、技能或玩法按钮继续用自己的组件，不要强塞进 action family。

排行榜同样**没有页面级几何例外**（`leaderboard-v2`）：15 个带结算榜单的页面里，容器、标题、列表、行、rank/score、空态、状态行与用户名行的宽度、圆角、内距、字号、字重、间距、高度全部来自 `game-lb-*`。Bond Forge 的 flex 栈 / 大写标题 / 隐藏滚动条、Tower Defense 的 340px / 16px 圆角 / 175px 列表、Planet Merge 的 340px 与 60–148px 列表、Hoop Shot 的 340px、Reversi 桌面 440px、Minesweeper 自带容器几何都已收编。空态统一由 runtime 在列表里渲染 `.xx-lb-empty.game-lb-empty`（不再写进状态行）。页面只保留调色板；语义上不同的结构（Planet Merge 的 Today / All-Time 标签行 `.pm-lb-head`）只拥有自身的布局，不重复共享间距——标题行本身挂 `game-lb-title`，所以共享 `margin-bottom` 落在行外，标签与标题保持居中对齐。

标准 action 的状态优先级也是 shared ownership：通用 hover 只提供普通按钮反馈，不能盖过 `--primary` / `--ghost` modifier。实现上应让 modifier 保持同级或更高 cascade authority，而不是依赖页面级 `:hover` 兜底。

### 1.1.1 全站默认值与状态归属（W3，2026-10-08）

- `layout.css` 的 `@layer reset` 是已接入页面的顶层默认 reset owner：带有 `game-reset` root opt-in（`class="game-reset"` 位于 `<html>`）的页面由 `html.game-reset, html.game-reset *` 统一 `margin: 0`、`padding: 0`、`box-sizing: border-box`，因此 document element 也与原通配符 reset 等价；旁边的 `*, *::before, *::after` 继续负责全站既有的伪元素 `box-sizing`。未迁移的消费者（例如首页、Gomoku、Firefly Signal）不自动获得新的元素级 margin/padding reset；页面 CSS 不得再复制这条 opt-in 规则；Tetris 的额外触控禁选行为仍属于它自己的 reset 例外。
- `layout.css` 的 `@layer contracts` 是**已 opt-in 页面**的标准 `.hidden` 唯一 owner：选择器为 `html.game-hidden-contract .hidden`，声明固定为 `display: none !important`。仅 20 个原有 `display:none` 的游戏页面在文档 `<html>` 上带 `game-hidden-contract`；共享 layout 的其他消费者不能自动继承这项状态。Math Rain 的 `.screen.hidden` 是 `visibility/opacity` 淡入淡出（180ms），属于有意保留的**不同语义**，不参与这个 opt-in。菜单和结果层仍通过原有 `.hidden` / `:has(...:not(.hidden))` 语义工作。
- 带有 `game-icon-btn` 的页面图标钮统一使用共享 `.game-icon-btn:active` 缩放；页面前缀的 `*.icon-btn:active` 不得重新出现。玩法按钮（如 `*-action-row`）不是这个语义 family，不能因为选择器形似就并入。
- 这些跨文件精确重复由 `tests/css-layer-migration-state.json` 的 `w3-*` `kind: "dedupe"` 事务登记。事务必须列出所有源 occurrence、目标是新建还是复用；只要目标选择器不同，就必须附带逐源、逐 stylesheet consumer 的 adoption evidence（图标钮检查 HTML 是否同时带 shared class；reset 检查文档 `<html>` 根元素是否显式 opt-in），并通过 `verify-css-debt` 的声明与规则数 delta 校验；不能直接改 P0 快照来隐藏删除。

### 1.1.2 开始菜单 / 选关共享默认值（W4a，2026-10-09）

九个解谜页（cc/cb/ec/fv/gd/lm/md/rd/sd）共用 `css/layout.css` `@layer components` 中的
`game-start-*` family：`par`、`subtitle`、`howto`、`mode-row`、`level-label`、
`level-grid`、`chip-num`、`chip-stars`、`start-footer`、`card-line`。
每一个 HTML 元素、runtime 创建的 chip 节点须同时保留原 `xx-*` 语义类和 `game-start-*` 共享类。
包括 Ripple Duet 的模板字面量 `innerHTML`，不能只审计 `className = ...` 赋值。

`@media (width <= 480px)` 统一将 `howto` 字号变为 12px、`level-grid` 的间隙变为 5px；
宽屏分别为 13px 和 6px。全站九页的 `howto` 默认 `max-width: 350px`，
Gravity Slingshot 不再保留原 340px 特例；所有选关网格均复用同一组 5 列。
五个科学展柜页面专属的 `@media (width <= 680px)` `howto` 材质/宽度规则仍保留，
不能把它误认作这两条共享手机规则的重复。

`chip-num`、`chip-stars` 在 cb/ec/fv/md/rd/sd 六个页面的本地 CSS 只剩原有 `color` 声明
（`inherit` / `var(--tok-gold)`），其余基础排版属于共享层；cc/gd/lm 完全无本地副本。
`chip` / `mode` / `title` / `daily-best` / `level-chip` 的材质、状态和主题差异属于 W4b，
本批不碰。追加的 `start-menu-exact-w4a` family extraction
对十二条共享规则分别声明 source、媒体 context、完全退役名单；以后不得原地编辑历史事务。
`verify-start-menus.mjs` 以三种视口检查九页 computed styles 与真实 runtime 节点。
新引入的 `@media (width <= 480px)` 容器在 `start-menu-exact-w4a` 中以 `reviewedAtRuleAdditions` 单独登记。验证器只允许恰好一个已批准的 media grouping 插入，要求历史 non-rule at-rule 列表完整、顺序不变；其内部的两个普通 CSS 规则仍须通过 family extraction 逐项对账。

### 1.1.3 开始菜单结构组件族（W4b，2026-10-09）

W4a 抽取精确重复的文本/网格默认值；W4b 将相同语义的九个解谜页
`mode`、`mode-daily`、`chip/level-chip`、`title`、`daily-best`
归入一组真正共享的组件 surface。

- `game-start-title`：标题共享 34px/800，≤480px 为 27px；页面只保留渐变材质。历史上 Gravity 的 32px 和 Silk Dew 的书法字体/35px 不构成额外标准。
- `game-start-mode`：相同的 inline-flex 对齐、13px 圆角、11px×20px 内距、≥44px 高度和 hover/active；手机统一 13px、11px×15px。`game-start-mode--daily` 是语义修饰，负责去除边框，页面背景渐变/阴影仍可以主题化。
- `game-start-level-chip`：六页 legacy `*-chip` 与三页 `*-level-chip` 采用相同的选关控件（10px 圆角、≥44px 高度、hover/active）；旧业务类与 `is-done` 语义必须保留，完成态只允许页面自有的 palette。
- `game-start-daily-best`：12.5px/600、15px 最小高度、等宽数字；记录颜色属于页面主题。
- 五个 Science Showcase 页 `science-showcase.css` 的 9px 圆角、统一强调面板与 44px 触控外观继续保持 P0 冻结；迁移不得通过削弱 `!important` 账本来制造“统一”。
- 家族历史类映射由 append-only `start-menu-structural-w4b` 的 `localSuffixByParticipant` 明确登记，动态 runtime 节点必须使用真实页面类 + 通用类；不能通过重命名 JS 内部选择器假装采用。
- Desktop/phone/tablet/landscape 的真实 computed-style/touch 校验由 `verify-start-menus.mjs` 持续执行，任意一页重引入旧组件几何将违反 CSS debt 契约。

### 1.2 语义标签契约（P3-3，2026-09-20）

每个页面必须提供：

1. **单一 `<main>`**：页面主体内容包在 `<main>` 内（可以带页面自己的类，如
   `<main class="pm-main game-main">`）。
2. **一个 `<h1>`**：顶栏中槽放可见标题，或 HUD 型页面放 `<h1 class="sr-only">`
   （`clip-path: inset(50%)` + 1px 尺寸，`layout.css` 提供 `.sr-only`）。
   ⚠️ 不要写已弃用的 `clip: rect(0 0 0 0)` fallback，stylelint 会报
   `property-no-deprecated`。
3. 校验：`verify-chrome.mjs` 断言每页 `h1Count ≥ 1`。

### 1.3 参数（只覆盖变量，不重写几何）

```css
/* 默认值（css/layout.css 的 :root） */
--frame-max: 520px;        /* 移动端容器宽度 */
--frame-max-wide: 940px;   /* ≥1024px 容器宽度 */
--frame-stage: 460px;      /* 舞台最大宽度 */
--frame-side: 300px;       /* 桌面侧栏宽度 */
--frame-side-gap: 12px;    /* 侧栏卡片间距 */
--frame-radius: 18px;      /* 画布/覆盖层圆角 */
--frame-ratio: 0.75;       /* 桌面画幅比 w/h（420×640 页面覆盖 0.65625） */
--frame-stage-h: 960px;    /* 桌面舞台高度封顶 */
--frame-chrome: 150px;     /* 顶栏+页脚+shell 内距；src/platform/game-frame.js 实测覆盖，此值仅首帧兜底 */
--frame-main-gap: 28px;    /* 桌面 .game-main 的 gap */
```

**桌面纵向预算（2026-09-19，选择加入）**：资格只由 registry 的
`frame-budget` cap 决定；验证器使用 `registry.withCap('frame-budget')` 动态读取页面清单，
不再维护历史手写“六页”名单。共享层提供
`--stage-w = min(--frame-stage-h, 100dvh - --frame-chrome) × --frame-ratio`；
页面是否覆盖 `--frame-shell-max` / `--frame-stage-cap` 决定舞台宽度是否消费该值，
未覆盖消费变量的页面继续回落 `--frame-max-wide` / `--frame-stage`，所以不同游戏可以在
同一 frame-budget eligibility 下保留各自几何策略。`--frame-chrome` 由
`src/platform/game-frame.js` 的 `bindFrame()` 实测写入 `.game-shell`
（ResizeObserver + resize + 自派发的 `game-frame:changed`；1px 死区 + 500ms 振荡锁定两个
反馈环护栏），页面需要时监听 `game-frame:changed` 重算后端缓冲区。

接入方式：需要消费动态舞台宽度的页面在 shell 上覆盖两个**消费**变量；只带
`frame-budget` cap 而未覆盖这些变量的页面仍可使用共享默认几何：

```css
.xx-shell {
    --frame-ratio: 0.75;            /* 或 0.65625 */
    --frame-stage-h: 960px;
    --frame-shell-max: calc(var(--stage-w) + var(--frame-main-gap) + var(--frame-side) + 24px);
    --frame-stage-cap: min(var(--stage-w), calc(100% - var(--frame-main-gap) - var(--frame-side)));
}
```

配套规则（同在 layout.css 桌面 media）：`.game-main` 的 gap 使用
`--frame-main-gap`；`bindFrame()` 给符合资格的页面 body 打
`has-frame-budget`，由 `contracts` 层强制
`body.has-frame-budget .game-sidebar { max-height: calc(100dvh - var(--frame-chrome));
overflow-y: auto; overscroll-behavior: contain }`。Firefox / WebKit 的 scrollbar 宽度与配色
属于 `components` 皮肤，不属于结构契约。

⚠️ sidebar cap **必须**由 `has-frame-budget` 选择加入，不能写成无条件规则。历史上在
Tetris 尚未接入 frame-budget 时，共享规则曾越界把它的 488×930 侧栏变成
`overscroll-behavior: contain` 的嵌套滚动容器，鼠标滚轮因此无法继续传到主文档；
后来 Tetris 正式接入 frame-budget，但这次事故仍说明 eligibility 不能靠 viewport 或 DOM
偶然结构推断。当前非 frame-budget / immersive 页面不会获得该 body 标记；tower-defense
属于 §7 immersive 舞台，也不接桌面纵向预算。

校验：`node tests/verify-desktop-frame.mjs` 的页面集合直接来自 registry，逐页跑五档视口 ×
双语；除整页不滚、画幅、不糊、随视口长大、侧栏屏内、chrome 收敛与 pageerror 外，还直接检查
computed sidebar `max-height` / `overflow-y` / `overscroll-behavior` 与 scrollbar skin，
确保 cascade layer 迁移后真正命中，而不是只看到 `has-frame-budget` class。

**第二批接入（2026-09-19 晚）**：gomoku 与 tetris 也收进「桌面端一屏放下」。
两者的接法与六个画布游戏不同，各自有一条必须记住的前提：

- **gomoku** 只借 `--frame-chrome`，棋盘边长仍由 `resizeCanvas()` 自己算
  （原本写死 `innerHeight - 200`，实际 chrome 是 334）。它的 shell 是五段式
  （顶栏 · 状态条 · 棋盘 · 控制条 · 页脚）+ 18px `gap` + 舞台自带 12px 内距，
  `bindFrame` 只认其中 166px，其余经 `extraChrome` 补齐。
  ⚠️ 补齐时**只加高度与 gap，不加页脚的 margin** —— `.game-footer` 带
  `margin-top: auto`，其计算值是「剩余空白」，算进去会让棋盘越缩越小。
- **tetris** 走完整契约（`--frame-ratio: 0.5`，棋盘 400×800）。三张画布的后端
  缓冲区固定 400×800、靠 CSS 等比缩放，三者共用同一组宽度来源才不会错位，
  所以 `#tetris` 与 `#particleCanvas,#lineClearCanvas` 的 `max-width: 400px`
  必须一起删掉。`.info-panel` 原本的 `width:100%` 会压过 `.game-sidebar` 的
  300px（实测被撑到 488px，比棋盘还宽），一并移除。
  ⚠️ 侧栏限高后 `.info-box.controls` 必须排在 `#statsPanels` **之前**，
  否则 1280×900 下 Pause / Restart 正好落到滚动区之外 —— 参考内容可以滚，
  对局按钮不能滚。

每页在**自己 CSS 末尾**追加同名变量覆盖，例如：

```css
/* ── 统一骨架参数（默认值与公共骨架见 css/layout.css） ── */
.gd-shell { --frame-max-wide: 940px; --frame-stage: 460px; --frame-side: 300px; }
```

`tokens.css` 另提供 `--tok-btn-size`（图标钮视觉尺寸，≤480px 自动降为 36px）
与 `--tok-hit-pad`（触控热区外扩 −6px），所以移动端热区为 48px、桌面 52px。

---

## 2. 各页参数现状

| 页面 | 容器（移动 / 桌面） | 舞台 | 侧栏 | 备注 |
| --- | --- | --- | --- | --- |
| gravity-slingshot | 520 / 940 | 460 | 300 | 竖版画布 480×640 |
| hoop-shot | 520 / 940 | 440 | 300 | `game-stage--fill` |
| planet-merge | 520 / 940 | 440 | 300 | `game-stage--fill` |
| sword-flight | 520 / 960 | 480 | 320 | `game-stage--fill`；竖屏移动端填充顶栏与页脚之间的剩余高度 |
| needle-awn | 520 / 960 | 480 | 320 | 同 sf |
| reversi | 560 / 820 | 460 | — | DOM 棋盘 |
| minesweeper | 640 / 780 | 网格自适应 | — | 棋盘容器使用 `.game-stage`；格子尺寸仍由 `layoutCells()` 决定 |
| word-daily | 520 / 600 | 内容自适应 | — | 棋盘容器使用 `.game-stage`；单词方块宽度仍受棋盘规则限制 |
| gomoku | 760 | 760 | — | 15×15 棋盘桌面约 700px，容器需比其他页宽 |
| tetris | 520 / 940 | 400（≤768px 340；≤480px 280） | 300 | 棋盘 1:2，舞台宽度跟随棋盘以保证格子正方形 |
| tank-battle | — | — | — | 横屏全屏 + 虚拟手柄；**最小对齐已完成**（P4-2）：`layout.css` 已引入、`<main class="tb-main">`（`display: contents` 透传）+ sr-only h1；覆盖式 HUD 保留 |
| math-rain | — | — | — | 全屏 HUD 街机布局；**最小对齐已完成**（P4-3）：`tokens.css`/`layout.css` 已引入、`<main class="mr-main">` 包住 game-container；皮肤自持于 `css/math-rain/` |
| index.html | — | — | — | 落地门户页；`<main class="idx-main">` 包住 daily-hub + games-section + perks（P4-2） |

---

## 3. 历史修复记录（摘要）

首轮统一修复的具体不一致项（画布圆角、容器内外边距、触控热区、顶栏结构、
浮动榜单、容器形态、字体/按钮、box-sizing、tetris 缩放兜底、叠加画布对齐）
详见 `docs/archive/layout-contract-2026-09-18.md` §3-4。

两份必须记住的迁移事故教训：

1. **剪共享层重复声明前，确认共享层真有替代品**：`color` / `font-family` /
   `backdrop-filter` 是页面自己的调色板/字体/材质，`layout.css` 只有 `inherit`。
   误剪后 9 页图标变纯黑、全页退回衬线字体。守卫：`tests/fg-audit.mjs`。
2. **HTML 类名注入必须判重**：`game-body` 死类曾累积 5 层、`game-canvas` 累积 3 层。
   迁移脚本的注入逻辑必须幂等。

## 4. 生产构建的 cascade 契约（P6 后）

历史上 Vite 曾把页面 CSS chunk 排在共享 CSS 之前，导致 `layout.css` 的默认值反向覆盖页面覆盖值；
`shared-css-first` 因此曾在 `transformIndexHtml` 阶段重排 stylesheet links。P4 已用同一套产物行为门禁证明
“插件开启 / 插件关闭”在当前架构上等价，P5 又把剩余未分层规则精确冻结为 compatibility allowlist。

P6 已在 #112 验收；生产证据、后续变更流程与回滚边界见[最终交接](../architecture-v2-final-handoff.md)。

从 P6 起：

- `shared-css-first` 已删除，`CSS_LAYER_CANARY` 也已删除；
- **物理 `<link>` 顺序不再是生产正确性的独立契约**，不得重新引入 post-build link sorting；
- 源码/生成器仍按 `tokens → layout → [science-showcase] → 页面 → more-games` 组织，便于审阅和静态分析；
- 当前仍存在的未分层规则继续受 immutable P0、append-only migration ledger 与 P5 frozen counts 约束，不能借 P6
  名义重新基线或静默增长；
- 任何未来 shared cascade 改动都必须通过源码态 + `dist/` 的 P3/P4 行为门禁，而不是依赖人工猜测 link 顺序。

修改布局后仍需在实际产物上复验，而不只是 dev server：

```bash
npm run build
(cd dist && node ../tests/lib/serve-static.mjs 8900)
```

保持服务器运行，在另一个终端从仓库根目录执行：

```bash
node tools/dev/layout-metrics.mjs http://127.0.0.1:8900
```

- ⚠️ `vite build` 与 `npm install` 并发会间歇性失败（`No matching HTML proxy module
  found`，失败入口随机漂移）——构建前确保 npm 空闲，CI 串行（见 `docs/backlog.md`）。
- ⚠️ 内联 `<style>` / 内联 `<script type="module">` 是 html-inline-proxy 竞态的风险源。
  2026-09-20（P4）已把 index/tank-battle/math-rain 三页的内联块抽离为外链文件，
  2026-09-20（B 批次）补齐 math-rain 最后残留：内联 `<style>`（商店/语言皮肤）→
  `css/math-rain/shop.css`、compatibility globals 内联 script → `src/games/math-rain/page-boot.js`
  （globals 挂载先于 languageManager 初始化，`__pendingLanguageSelection` 顺序约定见该文件头注释；
  死代码 `window.updateShopInterface` 顺手删除）。
  至此仅保留 gen 契约的 seo-script 内联块（全站模式，gen 管理）。
## 5. 验证方式

```bash
# 几何表：13 页 × 移动(390)/桌面(1280)
node tools/dev/layout-metrics.mjs                       # 源码
node tools/dev/layout-metrics.mjs http://127.0.0.1:8900 # 构建产物

# 截图 + 控制台错误巡检（输出到 %TEMP%/shots）
node tools/dev/shots.mjs
PAGES=tetris,gomoku node tools/dev/shots.mjs C:/path/out

# 单页探针（含画布尺寸、容器宽度、transform 等）
node tools/dev/probe.mjs gomoku 1280 900 ".board-container"

# 前景色 / 字体审计：报「纯黑前景 = 深色底上不可见」与「退回浏览器默认衬线字体」
node tests/fg-audit.mjs

# 全量回归（quick 档日常跑，详见 docs/contracts/registry.md 的校验器清单）
node tests/verify-all.mjs --quick
```

期望值（统一后）：

- `shell` 移动端宽度 = 视口宽、内距 `6px 8px`；桌面内距 `10px 12px`
- `topbar` 宽度 = shell 宽 − 左右内距，移动端高 50~60px
- `btn` 36×36（移动）/ 40×40（桌面），`hit` 48×48 / 52×52（≥44px 达标）
- gd/hs/pm/sf/na/td/tetris 的画布圆角均为 18px
- 控制台无 `pageerror`；仅剩 dev 环境特有的 `analytics.js`/`sw-register.js` 404 与
  tetris 榜单接口的 localhost CORS 提示

## 6. 有意保留的例外（2026-09-20 更新）

三个化外页（index / tank-battle / math-rain）已完成 P4 收编，均为**最小对齐**：
CSS 契约顺序 + `<main>` 语义 + h1，**不套** shell/topbar/sidebar 几何：

- **index**：落地门户页，自有布局，`css/index.css`（P4-1 自内联 style 抽离）。
- **tank-battle**：横屏掌机（强制横屏 + 虚拟手柄），画布铺满、HUD 覆盖四角。
  接入 shell 会破坏横屏布局——`<main class="tb-main">` 用 `display: contents`
  透传 body flex 居中，JS 引用的 DOM id 全部未动。
- **math-rain**：全屏街机 HUD，皮肤自持于 `css/math-rain/`（`math-rain.css` 主皮肤 +
  `shop.css` 商店/语言皮肤，B 批次自内联 style 抽离）。`eslint` 对 `src/games/math-rain/**`、
  `stylelint`/token-swap 对 `math-rain.css` 主皮肤仍豁免（老式类架构，收编成本高，见 backlog）；
  `shop.css` 已纳入 stylelint/token-swap（B 批次收窄）。

## 开始菜单（手机 / 平板 < 1024px）

舞台内的浮层（`.game-overlay`）默认 `position:absolute; inset:0`，高度被画布卡死。**带关卡网格或较长
说明的开始菜单**要加 `.game-overlay--menu`（与 `game-overlay` 并列）：< 1024px 时，菜单显示期间舞台变成
单格网格，画布与菜单叠在同一格，格高取两者较高者 —— 菜单完整铺开、页面整体滚动，顶栏 Home / 声音
始终可用；菜单一加 `.hidden` 舞台就回到原 flex 布局（游戏中的几何与之前逐像素一致）。
菜单期间舞台 `aspect-ratio:auto; height:auto; overflow:visible`、画布 `height:auto !important`（否则定了宽高比 /
固定高度 / `overflow:hidden` 的舞台不长高或把菜单裁掉 —— needle-awn 竖屏与横屏各中一种；`height:100%` 的画布
会被拉成菜单那么高）。≥ 1024px 不生效（桌面舞台够高，且有舞台预算契约）。

- 页面的菜单须用 `.hidden` 类隐藏（`:has(> .game-overlay--menu:not(.hidden))` 依赖它）
- 当前使用者：gravity-slingshot、needle-awn、lumen、circuit、silk-dew、bond-forge、echo-cave、
  maxwell-demon、crystal-bloom、flame-verse、ripple-duet，以及 planet-merge、hoop-shot（只在横屏手机上溢出）
- 校验：`node tests/verify-start-menus.mjs`（verify-all 校验项 `verify-start-menus`，390×844 / 768×1024 / 844×390 横屏）——
  加载时可见、非全屏的舞台内浮层一旦内部溢出即红（新游戏漏加 class 会被抓）；菜单里**每个可见按钮**都必须能
  滚到并点中；菜单不得被 `overflow≠visible` 的舞台截断


## 7. Immersive Stage（2026-09-26，`games.config.json` 的 `"layout": "immersive"`）

与标准骨架（§1–§6）**互斥**的第二种页面布局，给「场景就是游戏」的重场景游戏用（消费方包括
firefly-signal 与 tower-defense；未来《影织》等可复用）。**保留共享顶栏**，顶栏以下的整块视口都属于游戏场景；
HUD 是舞台里的浮层而不是面板；没有侧栏 / 抽屉 / 桌面纵向预算。

**为什么是字段不是 cap**：caps 是可以叠加的能力（sidebar + drawer + leaderboard…），布局类型是互斥的
（一页不可能既是标准骨架又是沉浸舞台）。用 cap 表示会允许 `immersive + sidebar` 这种无意义组合。
缺省 `standard`；未声明 `layout` 的页面行为完全不变（见下方「零回归」）。

### 7.1 结构

```html
<div class="xx-shell game-shell game-shell--immersive">
  <header class="xx-topbar game-topbar"> …三槽位照旧（chrome.md）… </header>
  <main class="xx-main game-main">
    <div class="xx-stage game-stage game-stage--immersive"> 场景（canvas 包在一层 div 里）+ HUD + 浮层 </div>
  </main>
  <footer class="game-footer"> 随流在首屏之下，滚动可达 </footer>
</div>
```

入口：`bindFrame({ layout: 'immersive' })`（`verify-registry` 断言入口里有这一句）。

### 7.2 几何

| 量 | 取值 |
| --- | --- |
| 舞台高度 | 默认：`calc(100dvh − var(--frame-chrome) − env(safe-area-inset-bottom))`，下限 `--frame-immersive-min-h`（300px，极矮横屏兜底）。**tower-defense 手机横屏进入战斗后例外：舞台固定为整个 `100vw × 100dvh`，顶栏悬浮覆盖，不再扣除 chrome** |
| `--frame-chrome` | `bindFrame({ layout: 'immersive' })` **实测** = shell 上内距（= 顶部安全区）+ 顶栏高；**不含页脚**（页脚在首屏之下）。不是魔数 |
| 宽度 | 默认视口 ≤ `--frame-immersive-max`（640px）时贴边铺满；tower-defense 在 shell 上覆盖为 800px；更宽时按页面上限居中 |
| 顶栏 | 默认最大宽度同舞台；左右内距 `max(10px, 安全区)`。tower-defense 手机横屏战斗时改为 fixed 悬浮 HUD，避免占用战场高度 |
| 页面级参数 | tower-defense：registry stage = `800×600`、`--frame-immersive-max: 800px`、landscape-first、无 sidebar / drawer / frame-budget；手机横屏战斗隐藏随流页脚并把 4:3 canvas 等比放大到完整视口高度；默认 immersive 页仍为 640px |
| 两侧延展 | 舞台窄于视口时，页面自己负责把夜色 / 场景横向延展（firefly-signal：背景层列平均成 1px 竖条铺在 fixed 背景层上；tower-defense：深石墨蓝场外延展） |
| 手势 | 舞台 `touch-action:none` + `user-select:none` + 禁长按菜单 / 点击高亮：不滚页、不双击缩放、不选字 |
| body 标记 | `has-immersive-stage`（**不打** `has-frame-budget`，因此不会命中侧栏限高规则） |

开始菜单照旧用 `.game-overlay--menu`（§「开始菜单」）：< 1024px 菜单显示期间舞台让位给菜单高度，
那条规则把舞台的**直接子 canvas** 设为 `height:auto` —— 所以画布要包一层 div（`.fs-scene`），否则
绝对定位的画布会按后备缓冲像素撑开。

### 7.3 零回归

P2-W 起不再用“`layout.css` 放在文件末尾 + 同特异度后声明者胜”表达 immersive 不变量：
`--frame-immersive-max` / `--frame-immersive-min-h` 是可覆盖配置默认值，位于 `layout`；
shell/topbar/main/stage/footer 的视口几何、safe-area、overflow 与手势边界位于 `contracts`。
因此 shared layout defaults 无论物理 source order 如何都不能突破 immersive contract。

Tower Defense 的页面调色板、背景、边框与阴影仍属于 `pages`；800px 场景边界、sidebar 隐藏、
desktop stats-button 可见例外与手机横屏 full-viewport battle 都与共享 immersive
规则处于同一个 `contracts` closure。普通态 stage 的 `position:relative` 仍属于可定制的
shared `layout` default，而不是 immersive-only 不变量；只有 TD 横屏战斗的 `position:fixed`
是显式 `contracts` 例外。菜单态结构例外继续未分层，等待 shared start-menu
dependency closure 与仍未分层的 overlay/overflow peers 一次收口。旧 standard-layout desktop grid 的
`.td-main` / `.td-stage` / `.td-sidebar` 已退休，避免未分层历史 peer 反压 named layer。
标准页仍不会获得 immersive 类或 `has-immersive-stage` body 标记；`verify-immersive.mjs` ⑨
继续逐页抽查这一点。

### 7.4 校验

`node tests/verify-immersive.mjs`（verify-all 校验项 `verify-immersive`）：页面清单 = `registry.withLayout('immersive')`；
视口 390×844 / 393×852 / 430×932 / 844×390 / 1280×800 / 1440×900；默认 immersive 页断言舞台贴顶栏且到视口底、
`--frame-chrome` 为实测值、窄屏贴边 / 宽屏 600–640 居中、无横向滚动、页脚在首屏之下且可滚到。
tower-defense 在 <1024px 手机横屏战斗态采用显式例外：舞台四边贴合整个视口、顶栏 fixed 悬浮、页脚隐藏；
其余仍校验 4:3 canvas 后备缓冲 = CSS × min(dpr, 2)、手势属性、转屏后几何恢复及无 pageerror。
P2-W 以后同一校验器还读取 computed style，直接断言 shell `max-width:none` / `100dvh`、
stage `display:block` / `overflow:hidden` / `--frame-immersive-min-h`、topbar/footer 的
`--frame-immersive-max` 与 safe-area padding，并守住 Tower Defense 桌面 stats-button
“非 `display:none`”的合法 contract 例外（`inline-flex` 在布局参与时允许被浏览器 blockify 为 `flex`）。
