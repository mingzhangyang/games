# Style 契约：设计令牌 / hex 收敛 / lint 基建

> 视觉与代码风格的单一规则集。令牌定义在 `css/tokens.css`，linter 入口 `node tools/checks/run-lint.mjs`
> （eslint + stylelint + 令牌残留检查一键，verify-all 基础校验项名为 `lint`）。

---

## 1. 令牌表（css/tokens.css）

### 1.1 深底与玻璃面板

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--tok-bg` | `#05060f` | 页面最深底色 |
| `--tok-bg-2` | `#0b0f26` | 渐变中段 |
| `--tok-panel` | `rgb(255 255 255 / 0.06)` | 玻璃面板填充 |
| `--tok-panel-strong` | `rgb(255 255 255 / 0.12)` | 玻璃面板填充（悬停） |
| `--tok-border` | `rgb(255 255 255 / 0.1)` | 玻璃描边 |
| `--tok-border-strong` | `rgb(255 255 255 / 0.14)` | 玻璃描边（悬停） |

### 1.2 文字

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--tok-text` | `#e8ecff` | 主文字 |
| `--tok-text-dim` | `#9aa6d8` | 次要文字 |
| `--tok-text-mute` | `#56618f` | 弱化文字 |
| `--tok-text-soft` | `#c3cdf2` | 次级标题文字（P3-1） |
| `--tok-text-faint` | `#7c89bf` | 弱化说明文字（P3-1） |

### 1.3 功能语义色（P3-1 扩表：跨 ≥4 页复用的高频色）

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--tok-cyan` | `#40d8ff` | 高亮 / 悬停 / 强调 |
| `--tok-gold` | `#ffd34d` | 金币 / 星星 / 奖励 |
| `--tok-success` | `#34d399` | 成功 / 胜势（兼 tank-battle 主色） |
| `--tok-danger` | `#ff6b7a` | 失败 / 炸弹 / 危险 |

### 1.4 主色与几何

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--tok-accent` / `--tok-accent-2` | `#667eea` / `#764ba2` | 各页覆盖即可换肤 |
| `--tok-radius-btn` / `--tok-radius-panel` | `12px` / `16px` | 圆角 |
| `--tok-btn-size` | `40px` | 图标按钮视觉尺寸 |
| `--tok-hit-pad` | `-6px` | 触控热区外扩（视觉不变，命中 ≥44px） |

tokens.css 还保留通用 `.icon-btn` 与 `.btn` / `.btn-primary` / `.btn-ghost`，主要服务历史独立页面（例如 Gomoku）。
采用共享 shell 的游戏页，标准文本动作统一使用 `layout.css` 的 `.game-action-btn` / `--primary` / `--ghost` 与 `.game-action-row`；页面不再复制 padding、圆角、字号和 hover/active 基线。特殊 mode / ability / gameplay controls 不属于这一 family。标准 action 没有页面级尺寸例外：Hoop Shot、Planet Merge、Reversi、Tower Defense 原先更大一号的按钮已收敛到共享 family（见 `layout.md` §1.1）。页面只保留语义上不同的修饰类（如 `.pm-btn-daily`）。

排行榜 `game-lb-*` family 同理：页面规则只允许调色板残余（`color` / `background` / `border` / `box-shadow` 等），**不允许任何几何或字体偏差**（宽度、圆角、内距、字号、字重、字距、行高、间距、高度）。2026-10 的 `leaderboard-v2` 已把 Bond Forge、Tower Defense、Planet Merge、Minesweeper、Hoop Shot、Reversi 的旧例外全部收敛，`tests/verify-leaderboard-layout.mjs` 对 15 页统一按标准表断言计算样式。

开始菜单 / 选关的稳定默认值由 `layout.css` 的 `game-start-*` family 唯一拥有（W4a）：
九个解谜页面统一 `par/subtitle/howto/mode-row/level-label/level-grid/chip-num/chip-stars/start-footer/card-line`，
包含 `@media (width <= 480px)` 下 `howto` 字号与 `level-grid` gap；
Gravity Slingshot 的 `howto` 最大宽度也统一为 350px，不保留单页几何例外。
科学展柜页面宽度 ≤680px 的专门 `howto` override 是另一条明确的展示材质规则，继续保留。
Chip 的页面残余仅允许原有颜色属性，其他视觉与主题结构留到 W4b；动态生成的 HTML fragment 也必须挂共享类。
见 `layout.md` §1.1.2。

全站默认值与状态也只有一个 owner：显式加入 `game-reset` root opt-in 的页面（包括非 shell 的 Math Rain、Tank Battle；`class="game-reset"` 位于 `<html>`），其顶层 `margin/padding/box-sizing` reset 由 `layout.css` 提供；首页、Gomoku、Firefly Signal 等未迁移消费者不会被这个新 reset 自动影响。通用的即时隐藏状态由 `html.game-hidden-contract .hidden { display: none !important }` 唯一拥有，只有显式标记 `game-hidden-contract` 的原 `.hidden` 源页面采用；不能把它作为 `layout.css` 所有消费者的隐式行为。Math Rain `.screen.hidden` 控制 `visibility/opacity` 的 180ms 弹层过渡，不等价于即时隐藏，因此保留为页面语义（不加 opt-in）。带 `game-icon-btn` 图标钮的共享 `:active` 缩放仍只有一个 owner；页面前缀类不得复制相同声明，玩法专属的 `*-action-row` / mode / ability 控件除外。

---

### 1.5 浅色主题（`:root[data-theme="light"]`，见 `theme.md`）

`tokens.css` 的浅色覆盖块重定义上面的深底 / 文字 / 语义色，另有一组共享层语义令牌
（`--tok-surface` / `--tok-fill-raised` / `--tok-scrim` / `--tok-sheet` / `--tok-chip-hover` …，深色值与收编前的字面量逐字相同）。
`--tok-on-accent`（亮色强调底上的文字）两套主题都是深色 —— **不要再用 `var(--tok-bg-2)` 当按钮文字色**，
浅色下它是浅底色。

浅色视觉规范（P1 落地时按截图 + 对比度审计校准）：

| 项 | 规则 |
| --- | --- |
| 页面底 | `#f3f5fa → #e8ecf5` 的浅灰蓝渐变，可叠一层 ≤0.1 透明度的主题色光晕 |
| 面板 / 卡片 | 白色 0.7–0.98 + `rgb(15 23 42 / 0.1–0.14)` 细边框；阴影用石板色低透明度（≤0.2），不用纯黑 |
| 文字 | 主 `#182033`、次 `#3f4a66`、弱 `#525c78`；正文对比度 ≥ 4.5:1，大字 ≥ 3:1（`verify-theme` 强制） |
| 强调色 | 渐变保留品牌色；**上面的文字**：亮底（青、金、浅绿）用深色，深饱和底（靛、深蓝、深绿）用白色。标准 `game-action-btn--primary` 不直接把浅色主题中“为浅底文字而加深”的 `--tok-success / --tok-cyan` 当 surface，而以 `color-mix(..., white)` 提亮后再生成按钮渐变；`verify-theme` 对每个实际渐变端点强制 ≥4.5:1。 |
| 发光 | 文字发光（带模糊的 `text-shadow`）一律去掉，按钮彩色光晕改为中性阴影 |
| 遮罩 / 浮层 | 遮罩 `rgb(15 23 42 / 0.32)`，浮层卡片白色 0.98 |
| 游戏实物 | 棋盘、棋子、牌面等「桌上的东西」两套主题一致（五子棋木盘、黑白棋的黑子白子、猜词的绿黄格）；棋盘可改为同一实物的另一种材质（黑白棋深色版的夜蓝盘 → 浅色版的绿色台呢） |

页面 CSS 迁移用 `node tools/generators/theme-varize.mjs css/<page>.css <prefix> [--dry]`：把字面色收编成
`--<prefix>-*` 变量（深色 = 原值，外观零变化），并生成浅色初稿区域；初稿**必须**截图校准，
重跑时已校准的浅色值原样保留。页面自己早已有的自定义属性调色板（如 word-daily 的 `--bg` / `--text`）
不在工具范围内，手写一个 `:root[data-theme="light"]` 覆盖块。

画布颜色：JS 里的字面色改为 `P.xxx`，`P = bindPalette(CANVAS_VARS, { onChange: () => game.draw() })`
在 `onReady` 里、创建游戏实例**之前**调用；变量 `--<prefix>-cv-*` 定义在页面 CSS 末尾的「画布调色板」块
（深色 = 原字面量）。只把**随主题变化**的颜色放进调色板；棋子、元素球、露珠这类游戏实物保留字面量。
整块「实物」画面（晶绽的结晶皿、麦克斯韦妖的气体容器、涟漪的海面）同理保持深色，只有画布上的
读数板 / 图表 / 背板随主题；这时 DOM 图例里镜像实物的色块也要保持实物的颜色。
科学展柜（`science-showcase.css`）的浅色在 `:root[data-theme="light"] body.science-showcase` 与
`body.science-theme-*` 覆盖块里；未开浅色的 echo-cave / flame-verse 进不到这些选择器。
需要动态透明度的颜色存成 RGB 三元组（`--cc-cv-amber-rgb: 255, 201, 77`，用法 `rgba(${P.amberRgb}, ${a})`）。

## 2. hex 收敛规则（P3-4）

**新代码禁止再写上表 11 个值的字面 hex，一律 `var(--tok-*)`。**

这条规则由 `node tools/checks/token-swap.mjs --check` 执行（已并入 `run-lint.mjs`，
即 `npm run verify` 的 `lint` 档）：发现残留即退出码 1 并列出文件。
`node tools/checks/run-lint.mjs --fix` 会真的替换掉。

⚠️ stylelint 的 `color-no-hex` **不适用** —— 它禁的是所有 hex，而本契约
只禁"已映射的 11 个值"，页面专属美术色仍然允许写字面量（见本节末例外）。
所以这条必须由上面那个值精确的脚本守，不能指望 stylelint。

背景：这条规则曾经整整一天只是文档里的一句话。`css/index.css` 带着 3 处
`#34d399` 进了仓库都没人发现 —— P3-4 收敛只扫 `css/`，那时这些颜色还在
`index.html` 的内联 `<style>` 里；P4-1 抽离后它们才落进 CSS 树，而没有任何
东西会复扫。**契约没有执行器就不是契约。**

一次性迁移脚本 `tools/checks/token-swap.mjs`（值精确映射，幂等）已完成全仓收敛：

- 11 个值精确映射（大小写不敏感，`\b` 边界防 `#e8ecffaa` 这类 8 位 hex 误伤）
- 跳过 custom property **定义行**（`/^\s*--[\w-]+\s*:/`）—— 定义收敛另行处理
- 递归扫 `css/`，**文件级豁免 `css/math-rain/math-rain.css`**（化外旧代色板；B 批次起 shop.css 已纳入扫描——其 hex 不在映射表内白过，误写映射 hex 会被抓）
- 产物 `var()` 不再匹配 → 第二遍 0 替换，天然幂等

对账口径（2026-09-19 收敛时点）：**182 处替换** + tokens.css 内 13 处定义 + math-rain 5 处豁免 = 200 处闭合。
**扩令牌表时同步改此脚本的 MAP**（或写新脚本），保持映射可复跑。

例外：页面专属的渐变美术色 / 单页专用色不强行收编 —— 收编判据是「跨 ≥4 页复用」。

---

## 3. ESLint（v10 flat config，`eslint.config.js`）

### 3.1 范围与豁免

- 覆盖：`js/**/*.js`（保留入口/兼容文件）、`src/platform/**/*.js`、`src/games/**/*.js` 与 `worker/**/*.js`，以及 `tests/**/*.mjs`、`tools/generators/**/*.mjs` 与 `tools/checks/**/*.mjs`（校验器/生成器；不含 tools/dev、tools/archive）、
  `src/games/reversi/reversi-worker.js`（Worker 环境单独块）。
- ignores：`dist/**`、`node_modules/**`、`Workers/**`（Cloudflare 独立域）、
  `src/games/math-rain/**`（专用架构）、`public/**`、`src/platform/more-games.js`
  （**派生文件，gen 唯一权威** —— 移出豁免会造成 gen↔lint 死循环，见 `registry.md` §5）。

### 3.2 规则要点

- 正确性 error：`no-undef` / `no-dupe-keys` / `no-redeclare` / `no-unreachable` / `no-fallthrough` 等。
- 风格 error 以项目现状为准：4 空格 + 单引号（`allowTemplateLiterals`）。
- `require-atomic-updates: 'off'` —— 各页榜单渲染的固定模式（`await fetch → list.textContent = …`）误报。
- `no-unused-vars` / `prefer-const` / `no-var` / `eqeqeq` 为 warn（观察档，不阻断）。
- scripts 块 globals 含校验器在 `page.evaluate` 回调里静态引用的浏览器 API
  （`MouseEvent` / `innerWidth` / `innerHeight` 等）—— **新增校验器用到未列的 API 会报 `no-undef`，去 config 补**。

---

## 4. Stylelint（v17 + config-standard，`.stylelintrc.json`）

### 4.1 ignoreFiles

```json
["dist/**", "node_modules/**", "css/math-rain/math-rain.css"]
```

⚠️ 路径必须与实际位置一致（曾误写 `js/math-rain/**`，实际 CSS 在 `css/math-rain/`，
豁免未生效 → parse error 直接红）。

### 4.2 规则要点

- 命名模式全 null：`selector-class-pattern` / `selector-id-pattern`（camelCase id 是项目契约）/
  `custom-property-pattern` / `keyframes-name-pattern`。
- `number-max-precision: 6` —— 保留 `--frame-ratio: 0.65625`（420/640 精确画幅比，不可舍入）。
- `no-descending-specificity` / `no-duplicate-selectors` / `import-notation` 等按现状 null。
- `declaration-block-no-duplicate-properties` 保留，但忽略「连续重复且值不同」
  （`box-shadow` 回退行 + `color-mix()` 前瞻行是合法模式）。

### 4.3 `--fix` 陷阱

⚠️ **不要对全仓跑 `stylelint --fix` 后直接提交。** 实测 `color-function-notation` 类规则的
机械转换把 `rgb(79, 70, 229, 0.1)` 改坏成 `rgb(79, 70, 229), 0.1)`（多值声明括号错位）。
修正法：`git checkout` 恢复该文件 + 修正豁免路径，而不是手工追着补。
对 `--fix` 产物逐文件 `node --check` / build 烟测后再提交。

---

## 5. 运行

```bash
node tools/checks/run-lint.mjs          # eslint + stylelint + 令牌残留检查 一键
node tools/checks/run-lint.mjs --fix    # 同上，且真的替换令牌字面量
node tools/checks/token-swap.mjs --check   # 只查令牌残留
npx eslint js src tests tools/generators tools/checks --fix    # 修 JS（勿碰 src/platform/more-games.js —— 已 ignores 保护）
npx stylelint "css/**/*.css" --fix # 修 CSS（避开 math-rain；产物要烟测）
```

## W4b Start-menu shared visual ownership

九个解谜游戏的 start-title/mode/level-chip/daily-best 结构由
`css/layout.css` 的 `game-start-*` 组件族持有；页面只能保留标题渐变、
Daily accent/shadow、关卡完成态调色板和成绩色。普通模式按钮与关卡按钮的
字体、padding、圆角、min-height (44px)、hover/active 和移动端值禁止复写。
标题页面残余只能保留 `background-image`，不得使用 `background` 简写重置共享 `background-clip:text`。
Science Showcase 现有 P0 冻结材质例外仍然适用；`game-start-mode` 的共享 hover
使用 `:where()`，不能遮盖页面 Daily primary 渐变。详情见
`docs/contracts/layout.md` §1.1.3。
