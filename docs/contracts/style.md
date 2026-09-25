# Style 契约：设计令牌 / hex 收敛 / lint 基建

> 视觉与代码风格的单一规则集。令牌定义在 `css/tokens.css`，linter 入口 `node scripts/run-lint.mjs`
> （eslint + stylelint + 令牌残留检查 一键，已并入 `npm run verify`，SUITE 名 `lint`）。

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

tokens.css 还内置通用组件类：`.icon-btn`（玻璃图标钮）、`.btn-primary` / `.btn-ghost`
（玻璃 + 渐变主色）、`.btn`（无背景排版基线）。各页另需主色时**只覆盖 `--tok-accent`**。

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
| 强调色 | 渐变保留品牌色；**上面的文字**：亮底（青、金、浅绿）用深色，深饱和底（靛、深蓝、深绿）用白色 |
| 发光 | 文字发光（带模糊的 `text-shadow`）一律去掉，按钮彩色光晕改为中性阴影 |
| 遮罩 / 浮层 | 遮罩 `rgb(15 23 42 / 0.32)`，浮层卡片白色 0.98 |
| 游戏实物 | 棋盘、棋子、牌面等「桌上的东西」两套主题一致（五子棋木盘、黑白棋的黑子白子、猜词的绿黄格）；棋盘可改为同一实物的另一种材质（黑白棋深色版的夜蓝盘 → 浅色版的绿色台呢） |

页面 CSS 迁移用 `node scripts/theme-varize.mjs css/<page>.css <prefix> [--dry]`：把字面色收编成
`--<prefix>-*` 变量（深色 = 原值，外观零变化），并生成浅色初稿区域；初稿**必须**截图校准，
重跑时已校准的浅色值原样保留。页面自己早已有的自定义属性调色板（如 word-daily 的 `--bg` / `--text`）
不在工具范围内，手写一个 `:root[data-theme="light"]` 覆盖块。

画布颜色：JS 里的字面色改为 `P.xxx`，`P = bindPalette(CANVAS_VARS, { onChange: () => game.draw() })`
在 `onReady` 里、创建游戏实例**之前**调用；变量 `--<prefix>-cv-*` 定义在页面 CSS 末尾的「画布调色板」块
（深色 = 原字面量）。只把**随主题变化**的颜色放进调色板；棋子、元素球、露珠这类游戏实物保留字面量。
需要动态透明度的颜色存成 RGB 三元组（`--cc-cv-amber-rgb: 255, 201, 77`，用法 `rgba(${P.amberRgb}, ${a})`）。

## 2. hex 收敛规则（P3-4）

**新代码禁止再写上表 11 个值的字面 hex，一律 `var(--tok-*)`。**

这条规则由 `node scripts/p3-token-swap.mjs --check` 执行（已并入 `run-lint.mjs`，
即 `npm run verify` 的 `lint` 档）：发现残留即退出码 1 并列出文件。
`node scripts/run-lint.mjs --fix` 会真的替换掉。

⚠️ stylelint 的 `color-no-hex` **不适用** —— 它禁的是所有 hex，而本契约
只禁"已映射的 11 个值"，页面专属美术色仍然允许写字面量（见本节末例外）。
所以这条必须由上面那个值精确的脚本守，不能指望 stylelint。

背景：这条规则曾经整整一天只是文档里的一句话。`css/index.css` 带着 3 处
`#34d399` 进了仓库都没人发现 —— P3-4 收敛只扫 `css/`，那时这些颜色还在
`index.html` 的内联 `<style>` 里；P4-1 抽离后它们才落进 CSS 树，而没有任何
东西会复扫。**契约没有执行器就不是契约。**

一次性迁移脚本 `scripts/p3-token-swap.mjs`（值精确映射，幂等）已完成全仓收敛：

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

- 覆盖：`js/**/*.js`（运行时共享模块 + 各游戏页）、`scripts/**/*.mjs`（校验器）、
  `js/reversi-worker.js`（Worker 环境单独块）。
- ignores：`dist/**`、`node_modules/**`、`Workers/**`（Cloudflare 独立域）、
  `js/math-rain/**`（化外页）、`public/**`、`js/more-games.js`
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
node scripts/run-lint.mjs          # eslint + stylelint + 令牌残留检查 一键
node scripts/run-lint.mjs --fix    # 同上，且真的替换令牌字面量
node scripts/p3-token-swap.mjs --check   # 只查令牌残留
npx eslint js scripts --fix        # 修 JS（勿碰 js/more-games.js —— 已 ignores 保护）
npx stylelint "css/**/*.css" --fix # 修 CSS（避开 math-rain；产物要烟测）
```
