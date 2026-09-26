# Theme 契约：浅色 / 深色模式

> 现行契约（2026-09-25 立项）。实施分 P0–P3 四期，本文随每期落地更新「状态」列。
> 相关：设计令牌与 hex 规则见 `style.md`；登记源与 caps 见 `registry.md`；页面骨架见 `layout.md`。

- 设置读写：`js/site-settings.js`（`getThemePref` / `setThemePref`，键 `site_theme`）
- 首屏定主题：`public/theme-boot.js`（同步经典脚本，由 gen 注入每页 `<head>`）
- 运行时：`js/theme.js`（`getTheme` / `onThemeChange` / `readPalette`）
- 令牌：`css/tokens.css` 的 `:root[data-theme="light"]` 覆盖块
- 登记：`games.config.json` 的 cap `theme-light` 与字段 `themeColorLight`
- 校验：`scripts/verify-theme.mjs`（SUITE 名 `theme`）

---

## 1. 已拍板的决策

| 决策 | 结论 |
| --- | --- |
| 默认主题 | **深色**。未设置过的用户看到的站点与今天完全一致 |
| 可选项 | 深色 / 浅色 / 跟随系统，三档 |
| 切换入口 | **只在首页**（与语言切换同一处）。游戏页对 `site_theme` **只读不写**，不在顶栏加按钮 |
| 例外 | 不适合浅色的游戏声明为仅深色（不带 `theme-light` cap），任何偏好下都显示深色 |
| 浅色的定位 | 单独设计，不是反色：霓虹发光、`lighter` 叠加、半透明白面板在白底上都会失效，必须换写法 |

## 2. 运行时契约

### 2.1 偏好与生效主题

- 偏好键 `site_theme` ∈ `'dark' | 'light' | 'system'`；缺失或非法值 = `'dark'`。
- **生效主题**只有 `'dark' | 'light'` 两值：
  - 页面不支持浅色 → 恒为 `'dark'`；
  - 否则 `'system'` 按 `prefers-color-scheme` 解析，其余照偏好。
- 页面是否支持浅色由 `<meta name="theme-support" content="light dark">`（支持）或
  `content="dark"`（仅深色）声明。游戏页由 gen 按 cap 写入，首页手写。

### 2.2 首屏：`public/theme-boot.js`

- **同步经典脚本**，紧跟在 `theme-support` meta 之后、任何样式表之前加载，保证首帧就是正确主题，
  不闪屏。不能改成 `defer` / `type="module"`。
- 它写 `<html data-theme="dark|light">`。支持浅色的页面还会写 `style.colorScheme`，并把
  `theme-color` meta 改成对应值（浅色值取 `data-light` 属性）；仅深色页面**不碰** `color-scheme`，
  原生控件与滚动条保持现状（P0 的「零变化」包括这一点）。
- 之后它继续监听：跨标签页的 `storage` 事件（首页改了偏好）、同页的 `site-settings:changed`、
  系统 `prefers-color-scheme` 变化；主题真的变了才派发 `theme:changed`（`detail.theme`）。
- 仅深色页面上它什么都不监听 —— 恒为深色。

### 2.3 CSS

- `data-theme` 是**唯一**选择器入口：`:root[data-theme="light"] { … }`。
  **禁止**在页面 CSS 里直接写 `@media (prefers-color-scheme)` —— 那会绕过「默认深色」与仅深色例外。
- 共享层（`tokens.css` / `layout.css` / `more-games.css`）只用令牌，浅色值集中在
  `tokens.css` 的覆盖块里。页面 CSS 迁移时把字面色换成页面本地变量 `--xx-*`，
  再在同一文件里写 `:root[data-theme="light"] .xx-shell { --xx-*: … }` 覆盖。

### 2.4 画布：`js/theme.js`

- 画布颜色**不再写字面量**，而是读 CSS 变量：`readPalette(el, { bg: '--xx-canvas-bg', … })`
  返回 `{ bg: '…', … }`。这样图例（DOM）与画布共用一份颜色，不会再出现
  「图例黄点、画面琥珀色」这类漂移。
- `onThemeChange(cb)`：主题切换时重读调色板。持续 rAF 的游戏下一帧自动生效；
  按需重绘的游戏（gomoku、reversi 等）在回调里主动重绘；**离屏缓存必须作废**
  （ripple-duet 的 `fieldCanvas`、各类精灵缓存）。
- `lighter` / `screen` 等加色混合在白底上会消失，浅色下改为 `source-over` 或
  `multiply`，由调色板里的一个开关决定，不要在绘制代码里散落 `if (light)`。

## 3. 登记与生成

- cap `theme-light`：页面支持浅色。判据（`verify-registry` 双向探针）：页面自己的 CSS 含
  `[data-theme="light"]`。`js/theme.js` 只在画布颜色随主题变化时才需要 import
  （gomoku 的木质棋盘与棋子是「实物」，两套主题一致，所以不 import）。
- 字段 `themeColorLight`：浅色下的浏览器顶栏色，带 `theme-light` cap 时必填。
- gen 的 `head` 区域输出：`theme-support` meta → `theme-color` meta（`data-light`）→
  `<script src="/theme-boot.js">`，三者顺序固定。首页不在注册表里，手写同样三行。

## 4. 校验：`scripts/verify-theme.mjs`

| 对象 | 断言 |
| --- | --- |
| 全部页面 | 首帧前 `<html>` 已有 `data-theme`；`theme-boot.js` 在第一个样式表之前；无 pageerror |
| 默认（未设偏好） | 所有页面均为深色 —— 「默认深色」不能被悄悄改掉 |
| 仅深色页面 | 在 `site_theme=light` 与 `system`+系统浅色下仍为 `data-theme="dark"`，`color-scheme` 不被改写 |
| `theme-light` 页面 | 偏好浅色 / 跟随系统时为浅色；{浅色, 深色} × {390, 1280}：页面底色取真实截图四角像素（浅色亮度 > 0.6、深色 < 0.3）；文字对比度浅色下正文 ≥ 4.5:1、大字 ≥ 3:1（深色只统计不判红——既有设计另行治理）；同页改偏好不刷新即变浅；**画布底色**直接读最大画布的位图四角（`getImageData`，浅色 > 0.55、深色 < 0.3；角上近乎透明则跳过；四角是「实物」的画布在 `CANVAS_KEEP` 豁免：gomoku 木棋盘、crystal-bloom 结晶皿、ripple-duet 海面、tetris 棋盘屏幕）。图例色块与画布是否一致**不做自动断言**（图例 → 画布的映射只能逐页手写，维护成本高于收益），靠截图复核：P2b 修正过 ripple 图例里「暗带 / 风暴 / 防波堤」三块被调浅的色块 |
| 首页 | 三档切换写入 `site_theme` 并独占按下态；首页不支持浅色时开关隐藏；「仅深色」小标只在浅色下出现，且恰好标在不带 `theme-light` 的注册表游戏上 |
| 夹具页（校验器内置） | boot + `theme.js` 本身：默认 / 非法值 / 浅色 / 跟随系统、同页与跨标签页即时切换、theme-color 切换、`readPalette` 读到浅色值、`--tok-*` 浅色层生效 |

## 5. 游戏分类

| 批次 | 页面 | 理由 | 状态 |
| --- | --- | --- | --- |
| P1 | 首页、word-daily、minesweeper、reversi、gomoku | DOM / 棋盘为主，改动量小，收益最明显 | **已完成**（2026-09-25） |
| P2a | bond-forge、circuit、silk-dew | 实验台 / 蓝图纸 / 晨光庭院 | **已完成**（2026-09-25） |
| P2b | crystal-bloom、maxwell-demon、ripple-duet | 科学展柜的浅色版：冷白实验台；结晶皿、气体容器、海面是「实物」保持深色（涟漪的「暗带」文案因此仍成立） | **已完成**（2026-09-26） |
| P3a | carrot-pull | 场景本来就是白天花园（内联 SVG，不用画布），场景作「实物」两套主题一致；只换外壳：暖奶油纸底 + 深青墨字，橙色主按钮浅色下加深为焦橙 `#bf531b`（奶油字 ≥ 4.5:1），节拍针改深墨压浅轨道 | **已完成**（2026-09-26） |
| P3b | tetris、hoop-shot | tetris：棋盘与 Next 预览是「屏幕」保持深色（进 `CANVAS_KEEP`），只换外壳 / 侧栏 / 结算面板，页面语义色（`--primary-color` 等）浅色下加深；彩虹主题（`tetris_rainbow`）与明暗正交，浅色 × 彩虹另有一套加深值，星点浅色下隐藏。hoop-shot：「白天球馆」—— 画布背景、球场线、篮板、球网、瞄准、飘字走 `bindPalette`（背景离屏缓存在 `onChange` 里重建），篮球与篮筐是实物不变；主按钮加深为焦橙配白字 | **已完成**（2026-09-26） |
| 暂缓 | math-rain | CSS + JS 约 335 处字面色，且在 hex 规则豁免内；先做令牌收敛（`style.md` §2），再评估浅色。未带 `theme-light` = 目前按仅深色处理 | 暂缓，先收敛 |
| 仅深色 | echo-cave | 「黑暗中靠回声照亮」就是玩法 | 例外 |
|  | flame-verse | 发射光谱靠加色混合，白底上消失 | 例外 |
|  | gravity-slingshot、planet-merge | 太空题材 | 例外 |
|  | tower-defense | 霓虹美术即主题 | 例外 |
|  | needle-awn、sword-flight | 电影感夜景，画布色 100–200 处 | 例外 |
|  | lumen | 光束折射，暗背景是可读性前提 | 例外 |
|  | firefly-signal | 夜色与生物荧光本身就是玩法可读性：同步的奖励是「环境被虫群一起照亮」，白底上不成立（2026-09-26 方案 §15） | 例外 |
|  | tank-battle | 战术雷达 / 绿色荧光描边就是美术方向，页面几乎整屏是画布，浅色等于重画（2026-09-26 拍板） | 例外 |

仅深色的游戏在首页卡片上带一个「仅深色」小标：数据来自 gen 派生的 `MORE_GAMES[].light`，
只在首页处于浅色时显示（深色下所有游戏看上去都一样，小标就是噪音）。

## 6. 分期

1. **P0 基础设施**：本文、`site_theme`、`theme-boot.js`、`theme.js`、令牌浅色层、
   注册表字段与 gen 注入、首页三档开关（首页尚不支持浅色，开关隐藏）、`verify-theme.mjs`。
   **不给任何页面加 `theme-light`，站点外观零变化。**
2. **P1**：首页 + 4 个 DOM 游戏；首页开关随首页支持浅色自动显现；浅色视觉规范写进 `style.md`。
3. **P2**：实验台 6 款，落地画布调色板模式。
4. **P3**：街机类逐个评估，也可以决定留在深色。P3a（carrot-pull）、P3b（tetris、hoop-shot）已落地；tank-battle 定为仅深色，math-rain 暂缓到 hex 收敛之后（§5）。

## 7. 已知陷阱

- **不要用 `prefers-color-scheme` 媒体查询写主题色**（见 2.3）：默认深色和仅深色例外都会被它绕过。
- **`theme-boot.js` 不能 defer**：晚一帧就是一次白闪 / 黑闪。
- **Vite 不处理 `public/` 下的经典脚本**：`/theme-boot.js` 原样拷进 `dist/`，与 `sw-register.js` 同理；
  `public/sw.js` 对它走「缓存优先 + 后台刷新」，所以改了它要到用户**下一次**加载才生效。
  它的逻辑要能容忍新旧 CSS 混搭一次（只读写 `data-theme`，不依赖具体样式）。
- **`scripts/serve-static.mjs` 曾不回退 `public/`**：`/theme-boot.js`（以及 `sw-register.js`、`analytics.js`）
  在校验服务器上一律 404，boot 根本不执行而校验照样能「通过」其它项。P0 给它加了与 Vite 一致的
  `public/` 回退（`sw.js` 除外）；`verify-theme` 的真实页面断言会在它失效时变红。
- **`var(--tok-bg-2)` 曾被当作「亮色按钮上的深色文字」用了 15 处**：浅色下 bg-2 是浅底色，按钮字全变白。
  P1 收编为 `--tok-on-accent`（两套主题都深色）；需要白字的深色按钮在页面浅色块里覆盖它（gomoku）。
- **启发式初稿会把「实物」也调浅**：`theme-varize` 第一版把黑白棋的黑子变成了灰蓝色。棋子、棋盘、
  牌面这类游戏内容要在浅色块里显式写回（见 `style.md` §1.5「游戏实物」）。
- **跨选择器共用一个变量是陷阱**：同值（都是 `#fff`）不代表同语义 —— word-daily「图标钮按下态文字」
  和「绿色格子上的字母」深色时同为白，浅色时一个要深一个要白。`theme-varize` 因此只在同一选择器内复用。
- **画布底色不能从截图取样**：开始菜单是盖在画布上的 DOM 浮层，截图四角取到的是浮层 —— 把 circuit
  的浅色画布底改回深色，截图版检查照样全绿（2026-09-25 实测）。改为直接读画布位图（`getImageData`）。
- **很暗的高饱和色（夜蓝 `#080d24`）曾被 `theme-varize` 当成「强调色」原样保留**，circuit 的浅色页底因此
  四周发黑。启发式已改为亮度 < 0.2 一律调浅；未校准的文件可用 `--reset-light` 重出初稿。
- **页面 CSS 里 `body { background: … !important }`**（science-showcase 就有）会盖掉令牌，
  迁移时必须改成变量。
- **`theme-varize` 把变量定义在 `:root` 上**：若某个值里引用了会在更深元素上被覆盖的变量（tetris 的
  `body.rainbow-theme` 覆盖 `--primary-color`），收编后它会在 `:root` 就被求值、冻结成非彩虹色。
  tetris 这次收编的 33 处都不含 `var(--primary-color)`，所以没踩到；以后收编前先 grep 一下这类引用，
  有的话留在原选择器里，或把变量块挪到覆盖发生的同一元素上。
