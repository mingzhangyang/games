# 页面骨架统一契约（2026-09-18）

目标：13 个小游戏页面共用同一套页面骨架，只保留各自的视觉皮肤与游戏内容，
而不是每页自己写一套容器/顶栏/画布/侧栏几何。

- 契约文件：`css/layout.css`（骨架与 `--frame-*` 参数）、`css/tokens.css`（颜色/圆角/控件尺寸）
- 引入顺序（硬性）：`tokens.css → layout.css → <game>.css → more-games.css`
- 迁移工具：`scripts/apply-layout-unification.py`（幂等，可重复执行）
- 校验工具：`scripts/layout-metrics.mjs`、`scripts/shots.mjs`、`scripts/serve-static.mjs`

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
| `game-icon-btn--wide` | 文字型图标钮（宽度自适应） | 语言切换（如 “Idioms” 这类长标签） |
| `game-title-pill` / `game-hud-box` | 顶栏中部标题 / 数值块 | 模式标记、分数 |

引入顺序决定成败：`layout.css` 在前，各页仍可用自己的规则与变量覆盖。
但**几何**（宽度、内外边距、圆角、定位）应交给契约，页面只保留配色与动效。

### 1.2 参数（只覆盖变量，不重写几何）

```css
/* 默认值（css/layout.css 的 :root） */
--frame-max: 520px;        /* 移动端容器宽度 */
--frame-max-wide: 940px;   /* ≥1024px 容器宽度 */
--frame-stage: 460px;      /* 舞台最大宽度 */
--frame-side: 300px;       /* 桌面侧栏宽度 */
--frame-side-gap: 12px;    /* 侧栏卡片间距 */
--frame-radius: 18px;      /* 画布/覆盖层圆角 */
```

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
| sword-flight | 520 / 960 | 480 | 320 | 舞台尺寸由 `--frame-stage` 收敛（原为 `max-width:100%`，移动端曾溢出） |
| needle-awn | 520 / 960 | 480 | 320 | 同 sf |
| tower-defense | 520 / 940 | 460 | 300 | 舞台宽度保留按视口高度自适应的表达式 |
| reversi | 560 / 820 | 460 | — | DOM 棋盘 |
| minesweeper | 640 / 780 | — | — | 格子尺寸由 `layoutCells()` 决定 |
| word-daily | 520 / 600 | — | — | 单词方块宽度受限 |
| gomoku | 760 | 760 | — | 15×15 棋盘桌面约 700px，容器需比其他页宽 |
| tetris | 520 / 940 | 400（≤768px 340；≤480px 280） | 300 | 棋盘 1:2，舞台宽度跟随棋盘以保证格子正方形 |
| tank-battle | — | — | — | 横屏全屏 + 虚拟手柄，**有意不接入骨架** |
| math-rain | — | — | — | 全屏 HUD 街机布局（自带 `css/math-rain/`），**有意不接入骨架** |

---

## 3. 本次修复的具体不一致项

1. **画布圆角**：gd/hs/pm/sf/na/td 各写 12~20px → 统一 `var(--frame-radius)`（18px）；tetris 由 12px 改为同一变量。
2. **容器内外边距**：移动端统一 `6px 8px 4px`、桌面 `10px 12px 6px`。修复 sf 桌面多出的 `6px 14px`、
   td 移动端多出的 `26px` 顶栏让位、tetris 移动端 `60px` 顶部让位、gomoku `20px`。
3. **触控热区**：ms / wd 的图标钮此前没有热区扩展（`::after` 被删而通用类未注入）
   → 补注入 `game-icon-btn`，现全部为 48px（移动）/ 52px（桌面）。
4. **顶栏结构**：tetris 的 home/主题按钮原为 `position: fixed; right: 20px`（右上角），
   gomoku 的标题是常驻大标题（`h1` 2.5rem）→ 均改为行内 `game-topbar`（左 home / 中标题 / 右动作），与其它页一致。
5. **浮动榜单**：tetris 的 `Global Top 5` 原为 `position: fixed; top:175px; right:20px` 悬浮块
   → 归位为侧栏卡片。
6. **容器形态**：tetris 原为「900px 玻璃卡片」包住棋盘+信息栏 → 改为与其它页一致的透明 shell + 舞台/侧栏。
7. **字体/按钮**：gomoku 的 `.btn` 原为 16px + `text-transform: uppercase`（英文按钮被换行），
   统一到 14px / `11px 16px` 内距，与 tokens 的按钮基线一致。
8. **box-sizing**：gomoku 缺少全站通用的 `border-box` 重置（导致 shell 溢出 16px）→ 重置上移到 `layout.css`。
9. **tetris 整体缩放兜底**：`fitTetrisToViewport()` 在桌面用 `transform: scale()` 把整块界面压进视口，
   会让 940px 容器实际渲染成 719px、文字变小 → 移除，改为与其它页一致的页面滚动。
10. **tetris 叠加画布对齐**：`#particleCanvas/#lineClearCanvas` 原 `left: 0`，
    与居中的主画布在舞台上会错位 → 改为中轴锚定，主画布的 3px 描边改用 `box-shadow`，画布与叠加层像素级对齐。

## 4. 顺带修掉的非布局缺陷

- `js/reversi.js` 调用了不存在的 `this.initAiWorker()`（每次加载抛 `TypeError`）→ 删除该遗留调用。

## 5. 生产构建的样式顺序陷阱（重要）

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

## 6. 验证方式

```bash
# 几何表：13 页 × 移动(390)/桌面(1280)
node scripts/layout-metrics.mjs                       # 源码
node scripts/layout-metrics.mjs http://127.0.0.1:8900 # 构建产物

# 截图 + 控制台错误巡检（输出到 %TEMP%/shots）
node scripts/shots.mjs
PAGES=tetris,gomoku node scripts/shots.mjs C:/path/out

# 单页探针（含画布尺寸、容器宽度、transform 等）
node scripts/probe.mjs gomoku 1280 900 ".board-container"
```

期望值（统一后）：

- `shell` 移动端宽度 = 视口宽、内距 `6px 8px`；桌面内距 `10px 12px`
- `topbar` 宽度 = shell 宽 − 左右内距，移动端高 50~60px
- `btn` 36×36（移动）/ 40×40（桌面），`hit` 48×48 / 52×52（≥44px 达标）
- gd/hs/pm/sf/na/td/tetris 的画布圆角均为 18px
- 控制台无 `pageerror`；仅剩 dev 环境特有的 `analytics.js`/`sw-register.js` 404 与
  tetris 榜单接口的 localhost CORS 提示

## 7. 有意保留的例外

- **tank-battle**：横屏全屏画布 + 虚拟手柄（WASD/触屏 D-Pad），画布铺满视口，
  圆角 4px 是「满屏」语义；接入 shell 会破坏其横屏布局。
- **math-rain**：自成一体的全屏街机 HUD（`css/math-rain/`，未引用 tokens.css），
  画布满屏、圆角 0。若要统一，应先做一次独立的换肤改造，而不是套用页面骨架。
