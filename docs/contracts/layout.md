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
  - 五个科学实验室游戏（crystal-bloom / echo-cave / maxwell-demon / flame-verse / ripple-duet）在 layout 与页面 CSS 之间多一层 `science-showcase.css`；`shared-css-first` 给它 rank 2，保证产物与源码同序
- 迁移工具：`scripts/apply-layout-unification.py`（幂等，可重复执行）
- 校验工具：`scripts/layout-metrics.mjs`、`scripts/shots.mjs`、`scripts/serve-static.mjs`、
  `scripts/verify-desktop-frame.mjs`、`scripts/verify-stats-drawer.mjs`

---

## 1. 契约内容

### 1.1 通用类（追加在原有类名之后，不改任何原有类名）

| 通用类 | 用途 | 典型位置 |
| --- | --- | --- |
| `game-shell` | 页面容器：单列居中、`max-width` 由参数决定 | `<div class="gd-shell game-shell">` |
| `game-topbar` | 顶栏：左 home / 中信息 / 右动作 | `<header class="gd-topbar game-topbar">` |
| `game-topbar-group` | 顶栏左右动作簇 | `<div class="gd-topbar-actions game-topbar-group">` |
| `game-main` | 舞台 + 侧栏的横向容器（移动端纵向） | `<div class="gd-main game-main">` |
| `game-stage` | 舞台：承载画布与覆盖层的定位盒（`position: relative`） | `<div class="gd-stage game-stage">` |
| `game-stage--fill` | 需要吃掉剩余高度的舞台 | 纵向 100vh 布局的游戏 |
| `game-canvas` | 画布外框：`width:100%` + 统一圆角 | `<canvas class="game-canvas">` |
| `game-sidebar` | 桌面侧栏（≥1024px 生效，宽度 `--frame-side`） | `<aside class="gd-sidebar game-sidebar">` |
| `game-side-card` / `-title` / `-text` / `-row` / `-panel` | 侧栏卡片族 | 记录卡、玩法说明 |
| `game-side-kbd-row` / `game-side-kbd` | 快捷键行 / 键帽 | 操作说明 |
| `game-overlay` | 舞台内覆盖层（`absolute` 铺满 + 玻璃模糊 + 可滚动） | 开始/结算界面 |
| `game-toast` | 舞台内提示条 | 居中胶囊 |
| `game-footer-hint` | 底部操作提示 | `<p class="xx-footer-hint game-footer-hint">` |
| `game-icon-btn` | 顶栏图标钮（40px 视觉 / ≥44px 触控热区） | home、暂停、静音… |
| `game-icon-btn--wide` | 文字型图标钮（宽度自适应） | 语言切换（如 "Idioms" 这类长标签） |
| `game-title-pill` / `game-hud-box` | 顶栏中部标题 / 数值块 | 模式标记、分数 |
| `sr-only` | 语义标题视觉隐藏（P3-3） | `<h1 class="sr-only">` |

引入顺序决定成败：`layout.css` 在前，各页仍可用自己的规则与变量覆盖。
但**几何**（宽度、内外边距、圆角、定位）应交给契约，页面只保留配色与动效。

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
--frame-chrome: 150px;     /* 顶栏+页脚+shell 内距；js/game-frame.js 实测覆盖，此值仅首帧兜底 */
--frame-main-gap: 28px;    /* 桌面 .game-main 的 gap */
```

**桌面纵向预算（2026-09-19，选择加入）**：六个画布游戏（gd/hs/pm/td/na/sf）的
舞台宽度在桌面端由「视口可用高度 × 画幅比」推导，
`--stage-w = min(--frame-stage-h, 100dvh - --frame-chrome) × --frame-ratio`，
替换掉旧的固定 `--frame-max-wide` 上限——1920×1080 下 480×640 逻辑场从 460px
放大到 ~700px，整页恒等于一屏。`--frame-chrome` 由 `js/game-frame.js` 的
`bindFrame()` 实测写入 `.game-shell`（ResizeObserver + resize + 自派发的
`game-frame:changed`；1px 死区 + 500ms 振荡锁定两个反馈环护栏），页面监听
`game-frame:changed` 调用自己的 `resize()` 重算画布后端缓冲区。

接入方式：页面 shell 上覆盖两个**消费**变量，未覆盖的页面回落旧契约、几何不变：

```css
.xx-shell {
    --frame-ratio: 0.75;            /* 或 0.65625 */
    --frame-stage-h: 960px;
    --frame-shell-max: calc(var(--stage-w) + var(--frame-main-gap) + var(--frame-side) + 24px);
    --frame-stage-cap: min(var(--stage-w), calc(100% - var(--frame-main-gap) - var(--frame-side)));
}
```

配套规则（同在 layout.css 桌面 media）：`.game-main` 的 gap 提为 `--frame-main-gap`；
侧栏限高写作 `body.has-frame-budget .game-sidebar { max-height: calc(100dvh - var(--frame-chrome));
overflow-y: auto; overscroll-behavior: contain }`，body 类由 `bindFrame()` 打上。
⚠️ 这条**必须**跟着选择加入，不能写成无条件规则：它是本段里唯一同时改
`max-height` 与 `overflow-y` 的规则，没法靠 `var()` 回退自行失效。写成无条件时
它越界命中了未接入的 tetris —— 侧栏（488×930）变成带 `overscroll-behavior: contain`
的滚动容器，鼠标落在侧栏上滚轮就再也传不到主文档，`verify-tetris-topbar-mobile`
的「滚轮下滚能滚起来」因此变红（实测 scrollTop=0 / 上限 53）。判据取
「本页接没接纵向预算」这种不随视口变化的事实，与 `game-drawer.js` 的
`has-stats-drawer` 同模式。tower-defense 另有桌面两列网格
（`.td-main` grid，技能条回画布列下方，`extraChrome` 把技能条高度并入 chrome）。
校验：`node scripts/verify-desktop-frame.mjs`（六页 × 五档视口 × 双语，
断言整页不滚 / 画幅 / 不糊 / 随视口长大 / 侧栏屏内 / chrome 收敛 / 无 pageerror）。

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
| tower-defense | 520 / 940 | 460 | 300 | 舞台宽度保留按视口高度自适应的表达式 |
| reversi | 560 / 820 | 460 | — | DOM 棋盘 |
| minesweeper | 640 / 780 | — | — | 格子尺寸由 `layoutCells()` 决定 |
| word-daily | 520 / 600 | — | — | 单词方块宽度受限 |
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
   误剪后 9 页图标变纯黑、全页退回衬线字体。守卫：`scripts/fg-audit.mjs`。
2. **HTML 类名注入必须判重**：`game-body` 死类曾累积 5 层、`game-canvas` 累积 3 层。
   迁移脚本的注入逻辑必须幂等。

## 4. 生产构建的样式顺序陷阱（重要）

Vite 会把**页面自己的 CSS chunk 排在共享 CSS 之前**，构建后 HTML 形如
`gomoku.css → tokens.css → layout.css`，于是 `layout.css` 的默认值反而覆盖页面覆盖值
（实测 gomoku 的 `--frame-stage: 760px` 失效，棋盘缩到 444px）。

- 已在 `vite.config.js` 加入 `shared-css-first` 插件，在 `transformIndexHtml` 阶段把产物里的
  `<link rel="stylesheet">` 重排为 `tokens → layout → 页面 → more-games`。**不要删除该插件。**
- 修改布局后需在实际产物上复验，而不只是 dev 服务器：
  ```bash
  npm run build
  node scripts/serve-static.mjs 8900   # 需在 dist/ 目录下运行
  node scripts/layout-metrics.mjs http://127.0.0.1:8900
  ```
- ⚠️ `vite build` 与 `npm install` 并发会间歇性失败（`No matching HTML proxy module
  found`，失败入口随机漂移）——构建前确保 npm 空闲，CI 串行（见 `docs/backlog.md`）。
- ⚠️ 内联 `<style>` / 内联 `<script type="module">` 是 html-inline-proxy 竞态的风险源。
  2026-09-20（P4）已把 index/tank-battle/math-rain 三页的内联块抽离为外链文件，
  2026-09-20（B 批次）补齐 math-rain 最后残留：内联 `<style>`（商店/语言皮肤）→
  `css/math-rain/shop.css`、compatibility globals 内联 script → `js/math-rain/page-boot.js`
  （globals 挂载先于 languageManager 初始化，`__pendingLanguageSelection` 顺序约定见该文件头注释；
  死代码 `window.updateShopInterface` 顺手删除）。
  至此仅保留 gen 契约的 seo-script 内联块（全站模式，gen 管理）。

## 5. 验证方式

```bash
# 几何表：13 页 × 移动(390)/桌面(1280)
node scripts/layout-metrics.mjs                       # 源码
node scripts/layout-metrics.mjs http://127.0.0.1:8900 # 构建产物

# 截图 + 控制台错误巡检（输出到 %TEMP%/shots）
node scripts/shots.mjs
PAGES=tetris,gomoku node scripts/shots.mjs C:/path/out

# 单页探针（含画布尺寸、容器宽度、transform 等）
node scripts/probe.mjs gomoku 1280 900 ".board-container"

# 前景色 / 字体审计：报「纯黑前景 = 深色底上不可见」与「退回浏览器默认衬线字体」
node scripts/fg-audit.mjs

# 全量回归（quick 档日常跑，详见 docs/contracts/registry.md 的校验器清单）
node scripts/verify-all.mjs --quick
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
  `shop.css` 商店/语言皮肤，B 批次自内联 style 抽离）。`eslint` 对 `js/math-rain/**`、
  `stylelint`/token-swap 对 `math-rain.css` 主皮肤仍豁免（老式类架构，收编成本高，见 backlog）；
  `shop.css` 已纳入 stylelint/token-swap（B 批次收窄）。

## 开始菜单（手机 / 平板 < 1024px）

舞台内的浮层（`.game-overlay`）默认 `position:absolute; inset:0`，高度被画布卡死。**带关卡网格或较长
说明的开始菜单**要加 `.game-overlay--menu`（与 `game-overlay` 并列）：< 1024px 时，菜单显示期间舞台变成
单格网格，画布与菜单叠在同一格，格高取两者较高者 —— 菜单完整铺开、页面整体滚动，顶栏 Home / 声音
始终可用；菜单一加 `.hidden` 舞台就回到原 flex 布局（游戏中的几何与之前逐像素一致）。
菜单期间舞台 `aspect-ratio:auto`、画布 `height:auto !important`（否则定了宽高比的舞台不长高、
`height:100%` 的画布会被拉成菜单那么高）。≥ 1024px 不生效（桌面舞台够高，且有舞台预算契约）。

- 页面的菜单须用 `.hidden` 类隐藏（`:has(> .game-overlay--menu:not(.hidden))` 依赖它）
- 当前使用者：gravity-slingshot、needle-awn、lumen、circuit、silk-dew、bond-forge、echo-cave、
  maxwell-demon、crystal-bloom、flame-verse、ripple-duet
- 校验：`node scripts/verify-start-menus.mjs`（SUITE 名 `start-menus`）—— 加载时可见、非全屏的舞台内浮层
  一旦内部溢出即红（新游戏漏加 class 会被抓），菜单里每个数字关卡按钮都必须能滚到并点中

