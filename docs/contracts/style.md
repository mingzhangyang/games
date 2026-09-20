# Style 契约：设计令牌 / hex 收敛 / lint 基建

> 视觉与代码风格的单一规则集。令牌定义在 `css/tokens.css`，linter 入口 `node scripts/run-lint.mjs`
> （eslint + stylelint 一键，已并入 `npm run verify`，SUITE 名 `lint`）。

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

## 2. hex 收敛规则（P3-4）

**新代码禁止再写上表 11 个值的字面 hex，一律 `var(--tok-*)`。**

一次性迁移脚本 `scripts/p3-token-swap.mjs`（值精确映射，幂等）已完成全仓收敛：

- 11 个值精确映射（大小写不敏感，`\b` 边界防 `#e8ecffaa` 这类 8 位 hex 误伤）
- 跳过 custom property **定义行**（`/^\s*--[\w-]+\s*:/`）—— 定义收敛另行处理
- 递归扫 `css/`，**豁免 `css/math-rain/`**（化外页，P4 收编前不动）
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
["dist/**", "node_modules/**", "css/math-rain/**"]
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
node scripts/run-lint.mjs          # eslint + stylelint 一键
npx eslint js scripts --fix        # 修 JS（勿碰 js/more-games.js —— 已 ignores 保护）
npx stylelint "css/**/*.css" --fix # 修 CSS（避开 math-rain；产物要烟测）
```
