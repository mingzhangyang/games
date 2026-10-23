# Chrome 契约：Header 三槽位 / Hint-only Footer / bindChrome

> 现行契约。底稿（2026-09-19 迁移轮的完整过程记录）见 `docs/archive/header-footer-contract-2026-09-19.md`；
> 盒子几何（容器 / 顶栏尺寸 / 舞台 / 侧栏）见 `docs/contracts/layout.md`。

- 契约文件：`css/layout.css`（`.game-topbar-center` / `.game-footer` 系列）
- 行为实现：`src/platform/game-chrome.js`（`bindChrome`）
- 游戏顶栏 markup 由 registry 生成，按 `registry.md` §3.1 通过 `chrome.actions` 角色列表及稀疏 `chrome.overrides` 编辑并运行 `npm run gen`；i18n 与 `bindChrome` 行为仍按本文接入。
- 校验工具：`tests/verify-chrome.mjs`（按文件名自动发现，verify-all 校验项 `verify-chrome`）

---

## 1. 契约

### 1.1 Header：三槽位，右簇定序

```html
<!-- registry:begin topbar -->  由 npm run gen 从 games.config.json 生成，勿手改
<header class="xx-topbar game-topbar">
  <div class="xx-topbar-lead game-topbar-group">      <!-- 左簇：只有 Home -->
    <a|button data-chrome="home">
  </div>
  <div class="xx-topbar-center game-topbar-center">   <!-- 中槽：只放当前语言的游戏名 -->
    <div class="xx-brand game-topbar-name" data-i18n="title">
  </div>
  <div class="xx-topbar-actions game-topbar-group">   <!-- 右簇：chrome.actions 顺序 -->
    …页面专属（Restart / Range / Speed / Theme / Help / Leaderboard）
    <button data-chrome="stats">    <button data-chrome="pause">
    <div popover="auto" role="menu">  <button data-topbar-more>   <!-- 仅有手机溢出动作的页，§5 -->
    <button data-chrome="sound">
  </div>
</header>
<!-- registry:end topbar -->
```

**第 3 步：** 三槽 `grid-template-columns: auto minmax(0,1fr) auto`，中槽游戏名 `.game-topbar-name` 从 Home 右侧 12px 起、左对齐，手机 16px / 桌面 17px、700 字重，颜色 `--game-title-color`，可选字体 `--game-title-font`。标题是唯一允许单行省略号的顶栏文字；390px 下中文标题必须完整。塔防竖屏原先隐藏游戏名的例外已在第 5 步 b 删除，现在与其他页一样显示游戏名。每日猜词的 Help 已从左簇移到右簇。

**第 4 步（桌面 ≥1024px）：** 顶栏仍是 shell 直接子元素，不改变 DOM 或 `bindFrame` 的选择器；`css/layout.css` 用 `width: min(1200px, 100vw - 80px)` 与 `align-self:center` 使顶栏相对视口居中，统一 12px 水平内距。仅在 `html:has(.game-shell > .game-topbar)` 的游戏页启用 `scrollbar-gutter: stable both-edges`，消除不同页面纵向滚动条造成的横向锚点漂移；根元素使用 `--tok-bg` 填充预留区域，避免 body 渐变背景外出现白色滚动条侧边，同时不影响无共享顶栏的全屏游戏。桌面 Home / 标题起点 / Sound 的屏幕 x 在全部 26 个顶栏页、中文英文和 1280×900 / 1440×900 / 1920×1080 下严格一致，见 `tests/verify-topbar-desktop.mjs`；原 640/800px immersive 上限仅约束舞台与页脚，不再约束桌面顶栏。小于 1024px 保留原布局。

**第 5 步 a（顶栏声明式生成，纯重构）：** 上面的三槽 DOM 由 `games.config.json` 的紧凑 `chrome.actions` 与 `chrome.overrides` 生成，通用属性、SVG、约定 ID 均由共享模板派生，不再在 26 个 HTML 页面中手写。共享渲染源：`src/platform/shell/render-topbar.js`；`tools/generators/gen-from-registry.mjs` 负责静态就地生成 `registry:begin/end topbar`；`src/platform/shell/render-game-shell.js` 复用同一渲染函数。所有既有节点、class、id、data-chrome、aria-label/title、SVG、初始 disabled/hidden、按钮顺序严格保留。左簇 Home 永远先出现，中槽只放游戏名，右簇页面专属动作依 registry 顺序；不要把个别历史特例强改成新的视觉形态。维护时只改 `game.chrome` 然后 `npm run gen`，严禁手改 HTML 的 topbar 哨兵区域。静态防漂移：`verify-topbar-registry`、`gen --check`；本轮一次性 DOM 比对详见 `tools/checks/compare-topbar-html.mjs` 与 PR 报告。

**新游戏脚手架：** `chrome.actions` 仅声明角色时，默认 Home 为 `button`，`tools/generators/new-game.mjs` 生成的 `mountGameRuntime` 必须通过 `chrome.owns: ['home', 'sound']` 接管导航和静音点击。默认标题为 `div`；`renderGameShell()` 仅在顶栏及自定义内容都不含 H1 时，于 `<main>` 添加可本地化的 `.sr-only` H1；检测到多个 H1 则直接报错。现有 26 页的顶栏及生成区域不受影响。

**第 5 步 b（手机 ≤480px 动作预算）：** Home 与 Sound 固定，其余动作最多直接显示 2 个，多出的进「⋯」原生弹出菜单，详见 §5。

**核心性质：Sound 永远是最右一颗。** 它是全部 26 个顶栏页都有的全站开关，无论一页有没有
Stats / Pause / 「⋯」，它的屏幕位置都一致。页面专属钮一律排在右簇最左。

**唯一性：** 全页只有顶栏这一个声音开关。开始菜单 / 结算层 / 暂停层不得再放第二颗（如历史上的
`xx-start-mute` / `na-start-sound`，2026-10-20 已从 15 页移除）；`tests/verify-chrome.mjs` ⑨ 按运行时 DOM 计数。
唯一的这颗必须**指针可达**：视口级全屏开始层（reversi / minesweeper）不得盖住顶栏，顶栏抬到其上、
开始层内容按 `--game-topbar-bottom`（`src/platform/topbar-clearance.js`）让位，开局前的局内 HUD 用 `visibility` 隐藏；
`verify-chrome` ⑤ 做命中测试 + 真实指针点击，`tests/verify-topbar-row.mjs` 锁窄屏单行 / 无截断 / HUD 显隐。

> **2026-09-21 变更：语言切换 UI 收敛到首页 index.html。** 游戏页不再有语言钮
> （顶栏 `data-chrome="lang"`、开始浮层语言钮、math-rain 的两处 language-selector
> 全部移除）。游戏页对 `site_lang` **只读不写**：boot 时的值决定初始语言，
> 跨标签页为「下次加载生效」。`verify-chrome.mjs` 对游戏页语言钮做**负向断言**
> （出现即失败）。历史上的「文字钮显示目标语言自称」规格随 UI 作废。

> **2026-10-12 变更：局内状态归舞台。** 中槽只放**游戏名**（只按当前语言显示一种），回合 / 分数 /
> 关卡 / 进度这类局内状态不再排在游戏名下方，而是挂在舞台顶部 —— 与画牢（loop-jail）的沉浸式 HUD
> 同一做法。原因：手机上两行顶栏把状态字号压到 9–11px，且离玩家正在看的画面最远。已迁移拔萝卜、
> 针尖对麦芒、御剑飞行、影织：状态标记在各页 HTML 里移进 `.game-stage`，定位与底色由附加样式表
> `css/stage-status.css`（`@layer contracts`，引入位置由 `tests/verify-architecture.mjs` 校验）
> 提供；断言见 `tests/verify-stage-status.mjs`。新页面直接在舞台里写状态，不要再往中槽放。
>
> **2026-10-21 收尾（第 2 步）：中槽最终只放游戏名。** 原先「单行计数器可以留在中槽」的例外取消，
> 分三批迁完：
> - **A 批 · 关卡计数十页**（bond-forge / circuit / crystal-bloom / echo-cave / flame-verse /
>   gravity-slingshot / lumen / maxwell-demon / ripple-duet / silk-dew）：中槽换成
>   `<div class="xx-brand game-topbar-name" data-i18n="title">`；原中槽 HUD（关卡号 + 计数框，元素 id 不变）
>   整块包进 `.game-stage` 的第一个子元素 `<div class="xx-stage-status game-stage-status" id="xx-stage-status">`，
>   **随流排在画布上方**，不浮在画布上 —— 这些页的棋盘 / 洞窟铺满画布，悬浮胶囊会盖住第一行格子。
>   `bindFrame` 把这一行（高度 + 上下外边距，见 `measureStageStatusReserve`）计入 `--frame-chrome`，
>   桌面舞台按「可用高度 × 画幅比」相应缩小，仍然一屏放下；行高与舞台宽无关，不进反馈环。
>   沉浸式的麦克斯韦妖例外：状态行绝对定位贴舞台顶边，`.md-scene` 从它下面开始，`fitScene()` 自动让位。
>   手机上画布下方还有操作区的三页（echo-cave / flame-verse / crystal-bloom）操作区因此下移约 38px，
>   这是确认过的取舍（方案 A：所有页状态都在画布上方，不为个别页挪到操作区旁）。
>   `verify-stage-status` 另断言状态行整体落在画布上方。
> - **B 批 · 分数 HUD**（tetris / planet-merge / hoop-shot / tower-defense），按画面里哪里有留白分三种放法：
>   - **俄罗斯方块、星球合成：随流排在画布上方**（`.game-stage-status`，同 A 批）。俄罗斯方块的新块在棋盘
>     最上两行出现，星球合成待投放的星球沿画布整条顶边左右移动，悬浮胶囊放在哪都会挡住它们。
>     俄罗斯方块的棋盘改成「状态行 / 画布」两行网格，三张画布（棋盘 + 粒子 + 消行）放进第二行同一格，
>     绝对定位的特效层以网格区域为包含块、天然与棋盘对齐；手机棋盘预算（mobile-fit.css ③
>     `--tt-board-reserve`）计入状态行。状态行不折行（长高会把棋盘推到固定底栏下面）。
>     星球合成同样改成两行网格，右上角「下一个」放进画布那一格；状态行可按需折行长高
>     （320px 宽、七位数分数），`bindFrame` 的 ResizeObserver 实测高度。
>   - 塔防战术条在 ≤700px 横屏用紧凑胶囊；仍放不下（堆叠徽章 + 大数字）时折行，状态胶囊换到按钮上方，
>     不会被 `overflow: hidden` 的舞台裁掉。`verify-stage-status` 的大数字复查锁住这两条。
>   - **投篮：悬浮在画布顶部**（`.game-stage-status--float`）。篮筐与球在中下部，顶部是夜空留白；
>     不占舞台纵向预算（`bindFrame` 跳过绝对定位的状态行）。
>   - **塔防：并进底部战术条**（`.game-stage-status--dock`，在 `.td-bottom-controls` 里、技能与发波钮左侧）。
>     战场铺满舞台、顶部第一排就是敌人入口路径；战术条本来就浮在舞台下沿，即时战略式 HUD 集中在拇指区。
>     顶栏因此只剩游戏名，不再是两行。
> - **C 批 · 特殊页（2026-10-21，第 2 步收尾）**：扫雷雷数 / 笑脸重开 / 计时在棋盘上方经典状态行，
  暂停遮罩只覆盖棋盘、笑脸触控目标 ≥44px；黑白棋双方的子数与名字在棋盘上方两张卡；
  每日猜词期号 #N 与单词 / 成语模式标签进入棋盘舞台顶部；影织可点击的目标按钮
  `#sl-target-btn` 放到舞台右上角，菜单时隐藏；萤火信号的 `#fs-level-pill` 作为关卡状态进入天空，
  游戏中显示「1 · First Light」等，菜单时隐藏，顶栏固定显示游戏名。
  所有 id、JS 元素查找和交互不变。扫雷 / 黑白棋视口级全屏开始层继续利用
  `--game-topbar-bottom` 为顶栏让位；中槽名字在菜单时不再隐藏，只有扫雷暂停钮保持隐藏。
  手机棋盘格子尺寸下限依旧由 `mobile-fit.css` 保证。
>
> **第 2 步完成（A / B / C 三批）**：顶栏中槽仅保留当前语言的游戏名；
> 局内状态与游戏控件均归舞台。由 `verify-stage-status`、`verify-topbar-row`、
> `verify-chrome`、`verify-mobile-viewport-fit` 和特殊页浏览器回归锁定。

### 1.2 Footer：只保留操作提示

```html
<footer class="xx-footer game-footer">
  <p class="xx-footer-hint game-footer-hint" id="xx-hint">操作提示</p>
</footer>
```

- 游戏页 Footer 不再重复 Home，也不再放“更多游戏”展开按钮；Home 的唯一固定入口在 Header。
- 跨游戏推荐仍可存在于侧栏、开始菜单等内容区域，由 `more-games` 组件负责，不属于 Chrome。
- Footer 继续随流，不使用 sticky / fixed；手机上 `.game-footer-hint` 保持可见。
- 首页 `index.html` 的语言 / 主题 Footer 属于落地页自己的 UI，不受游戏页 Footer 契约约束。

### 1.3 行为：`bindChrome`

```js
bindChrome({
    owns: ['home'], // 仅无 href 的 Home <button> 需要交给 chrome；普通 <a href> 不需要
    getText: () => LANGUAGES[getLang()] || LANGUAGES.en,
    labels: { pause: () => (LANGUAGES[getLang()] || {}).pause },
});
```

职责边界：

| 角色 | 文案 / 图标 | 点击 |
| --- | --- | --- |
| `home` | `bindChrome` | 普通 `<a href>` 自带导航；无 href 的按钮可由 chrome 接管 |
| `sound` | `bindChrome`（图标 + `aria-pressed`） | 默认由各页自己；只有没有 handler 的页才把 `'sound'` 放进 `owns` |
| `stats` | `src/platform/game-drawer.js` | `src/platform/game-drawer.js` |
| `pause` | 页面经 `labels.pause` 提供，`bindChrome` 落笔 | 各页自己 |

`bindChrome` 不再处理 `more`。推荐列表由 `src/platform/more-games.js` 独立渲染，
避免导航控件与推荐内容再次耦合。

### 1.4 语义标签（P3-3 并入）

每个 shell 页必须有**恰好一个 `<h1>`**（可以是 `.sr-only` 视觉隐藏的页面标题），
`<header>/<main>/<footer>` 语义标签齐全。`verify-chrome.mjs` 断言 `h1Count >= 1`。
详见 `docs/contracts/layout.md` §1.2。

---

### 1.5 顶栏重置按游玩状态呈现（2026-10-10）

13 个顶栏重开入口（lm/cc/sd/ec/bf/fv/rd/cp/cb/md/sl/gd/lj）由共享模块
src/platform/contextual-restart.js 统一管理，既不常驻，也不新建一套游戏状态。

- HTML 保留原有 DOM id / game-icon-btn，初始添加 hidden class，避免加载前出现无效按钮；
  只有游戏进入有效游玩状态，且开始/结算浮层已收起，按钮才显示并可点击。
- 各游戏通过 active/hasProgress/restart 回调显式提供事实，控制器只观察既有浮层
  hidden 属性和 class 的变化；所有游戏 state/phase/paused 的真实变更点也显式
  调用 `contextualRestart.sync()`（构造早期通过可选链调用）。不可只依靠结算浮层通知：
  影织 solving、键合工坊 clear、拔萝卜 over 与暂停状态都可能先于浮层变化。
  不轮询、不注入 CSS、不再绑定第二次点击事件。
- 存在实质操作进度时，顶栏点击重开必须先确认；取消时保持状态。结算页继续由
  原有 Retry/Again 操作接管，不增加重复的顶栏重开。
- Carrot Pull 的原重置实际是退出当前游戏，本轮用关闭图标和“结束本局并返回菜单”说明。
  计时器 `time < ROUND_TIME` 即已有不可恢复的时间消耗，哪怕只失误一次、仍零分零次拔取，
  也必须确认；不能用 5 秒容差掩盖进度。
- Crystal Bloom 一旦开始生长就有进度；`phase !== 'draw'` 必须与锚点及搅动一起参与
  `hasProgress`，而不是只看可计数操作。
- Gravity Slingshot 的“重试”只重置当前发射，不清除累计发射次数；其文案改为
  “重置本次发射”，不加误导性的进度损失确认。未发射的 `aiming` 没有可重置的当前发射，
  按钮必须隐藏且 R 不能执行空操作；仅 `flying`/`resolved` 暴露操作。
- Echo Cave 的重开判断以 `model/rules.js` 的模拟世界为准，包含探索移动（返回起点仍保留）、
  声波次数、已收集声晶及损失的生命。不得用每帧从 world 同步的 `pulseUsed` 显示缓存
  作为进度依据。
- 8 个游戏的 `R` 快捷键（sd/ec/fv/rd/cb/md/sl/gd）和可见顶栏动作统一调用
  `contextualRestart.requestRestart()`，不能直达 `restartLevel()` 或 `resetHole()`：
  包括有进度时的本地化确认、取消保护、无进度时立即重开、暂停/结算时禁止重开。
  `gd` 为不丢累计发射次数的例外，仍通过同一生命周期守卫。
  验证器应从实际运行时代码识别 R 绑定并对照测试清单，避免新增快捷键遗漏。
- 测试：tests/verify-contextual-restart.mjs 覆盖 13 个游戏的菜单、游戏中、结算态，
  对全部 12 个可能丢失进度的游戏分别执行中/英确认、取消保留与确认后重置；
  `gravity-slingshot` 验证仅复位发射、累计次数不丢；状态变更静态钩子和
  solving/clear/over 等结果浮层之前的状态也覆盖。
  所有 R 重开快捷键执行取消与静默暂停断言；另覆盖拔萝卜仅消耗时间、
  Crystal Bloom 仅开始生长、`gd` 空闲瞄准隐藏及复位保留累计发射次数；
  smoke-shadow-loom.mjs 对带移动的重开显式接受确认，并对缺失确认设置有界超时。
- 不更改其他 Home、Stats、Pause、Sound 顶栏职责；若新游戏不需要游戏内重置，
  不应为了图标整齐而机械添加循环箭头。

### 1.6 顶栏控件的交互状态（2026-10-21）

悬停、焦点、禁用三种状态由共享层统一提供（`css/layout.css` 的 `.game-icon-btn` 一节），页面只能改配色：

- **悬停只给可悬停的指针。** 所有作用于顶栏控件的 `:hover` 规则（共享层和页面层）都必须写在
  `@media (hover: hover)` 里。否则在触屏上点一下就会留下「粘住的 :hover」，按钮一直高亮，直到点别处。
  页面悬停配色和共享默认值（`--tok-panel-strong`）相同时就不要再写；只有真正不同的配色
  （拔萝卜、针尖对麦芒、塔防……）才保留，并且同样放进媒体查询。
- **焦点环全站一种。** `.game-icon-btn` 和顶栏内的所有 `a` / `button` 在 `:focus-visible` 时显示
  `2px solid var(--tok-focus)`，`outline-offset: 2px`。颜色刻意不跟 `--tok-accent`：主色是品牌色，
  在浅底上可能只有 1.2:1（circuit 的金黄）。`--tok-focus` 的深浅两档在全站顶栏背景上 ≥ 3:1。
  共享规则在 `@layer components`，会输给页面未分层的规则和 `!important`。所以页面自己的
  `:focus-visible` 规则必须用 `:where(:not(.game-topbar *))` 把顶栏排除在外（tetris 的全局规则、
  gomoku 的 `button` 规则、科学展柜的 `!important` 都这样处理过），`:where()` 保证排除不改变原优先级。
- **禁用即隐藏。** `.game-topbar .game-icon-btn:disabled` 为 `visibility: hidden`，保留槽位，
  按钮恢复可用时左右的钮不会跳动。页面不要再给顶栏按钮写 `:disabled { opacity }`。
  只在游玩中才有意义的按钮（暂停、重开）直接在 JS 里设 `disabled`，样式不必另写。
- **图标钮是正方形。** 44px 热区由 `::after` 外扩提供，页面（包括科学展柜）不得给
  `.game-icon-btn` 加 `min-height` / `min-width` 来凑触控尺寸。

校验：`tests/verify-topbar-states.mjs`。它对每页 × 深浅色 × 桌面 / 触屏，用 DevTools 强制伪类，
断言上面四条、焦点环颜色等于该处解析出的 `--tok-focus`，以及焦点环的截图取样对比度。⚠️ 无头 Chrome 不报告指针设备，`(hover: hover)` 永不匹配，
CDP 和 `--blink-settings` 都改不了；所以桌面轮在 CSSOM 里把这类媒体规则改写成 `all` 来模拟鼠标。

## 2. 各页现状

26 个顶栏页的右簇动作以 `games.config.json` 的 `chrome.actions` 为唯一出处，本文不再维护逐页副本
（旧表停在 2026-09-21 的 11 页，已删除）。手机端哪些动作直接显示、哪些进「⋯」，用生成器同一个函数查看：

```bash
node --input-type=module -e "import c from './games.config.json' with { type: 'json' };
import { planMobileTopbar } from './src/platform/shell/render-topbar.js';
for (const g of c.games.filter(g => g.chrome)) console.log(g.id, g.chrome.actions.join(' · '), planMobileTopbar(g));"
```

页脚 hint 由各页自己的 i18n 提供（§1.2）。

**豁免**（维持既定豁免，P4 只做了最小语义对齐，不套三槽位）：

- `tank-battle`：横屏全屏画布 + 虚拟手柄，P4-2 仅加 `<main class="tb-main">`（`display: contents`）+ sr-only h1。
  自带 `#btnLang`（虚拟手柄 aux-row）+ `switchLanguage()` + `L` 快捷键，也于 2026-09-21 随收敛移除。
  ⚠️ 这类自带语言钮的页面**不在 `verify-chrome` 的覆盖内**（它只遍历带 topbar cap 的页面），
  本次就是这样漏了整整一轮 —— 现在由 `tests/verify-no-game-lang.mjs` 兜住。
- `math-rain`：全屏街机 HUD，P4-3 仅加 `<main class="mr-main">`（包 game-container）+ sr-only h1；
  其开始界面与设置面板的语言选择器也于 2026-09-21 随收敛一起移除（HTML-only，JS 空值守卫天然兼容）。
- `index.html`：落地页，P4-1 加 `<main class="idx-main">`，有自己的头部，不属于本契约；
  **全站唯一的语言切换 UI 在这里保留**（顶栏 + 页脚）。

---

## 3. 迁移脚本踩过的坑（已加固，勿重犯）

1. **用 `new:` 模板替换页面原有的按钮 = 让 id 凭空消失。**
   上一版对 sf / na / wd / pm 等页用 `'new:sound'` 生成了 `{pre}-mute-btn`，
   原节点（`sf-btn-sound` / `na-btn-sound` / `wd-btn-mute`）不在任何槽位 spec 里，
   于是随旧容器一起被删。页面 JS 仍在 `getElementById` 它们：
   - `js/sword-flight.js:775` 立即 `soundBtn.innerHTML` → `initDOM()` 抛空指针 → **整页打不开**
   - `js/needle-awn.js:928` 同理 → `bindEvents()` 抛错 → **整页打不开**
   - `wd-btn-help` 在 `.wd-topbar-left` 里，随 `drop_wrappers` 一起消失 → 帮助弹窗**没有入口**

   加固：`right` 里**只有本页原本没有该钮时**才用 `new:`；新增 `left_extra` 保留左簇里
   Home 之外的节点；`drop_wrappers` 删容器前先探测里面有没有带 id 的节点；
   `main()` 加总守卫 —— **任何 id 会消失就拒绝写盘**。

2. **补尾逗号时用 `rstrip()` 吃掉了行尾换行。**
   `add-chrome-i18n.py` 的 `add_keys` 把上一条属性 `rstrip()` 后再拼逗号，换行符一并没了，
   新键被粘在上一行行尾，偏移错位又让第一个键在块尾重复插一遍，11 个文件各 4 处。
   ES 模块允许重复键（后者胜），所以 `node --check` 全过、页面也不报错 —— 只能靠肉眼或
   「同一 key 出现 >2 次」的扫描发现。加固：只改行尾、保留换行；偏移按实际长度差修正。

3. **Windows 下改写文件把 LF 翻成 CRLF**，10 个文件制造约 11000 行假 diff。
   规则：**改写文件前先读字节判断原有行尾，写回时照原样还原**；提交前用
   `git show HEAD:<file> | grep -cU $'\r'` 与工作区逐文件比对。
   `.gitattributes`（`* text=auto eol=lf`）会全仓库重写行尾，**应单独提交**，未纳入。

---

## 4. 验证

`npm run verify`（或 `npm run verify:quick`）已编排 `verify-chrome.mjs`；顶栏控件的悬停 / 焦点 / 禁用状态另由 `verify-topbar-states.mjs`（§1.6，仅全量档）锁住。单独跑：

```bash
npm run serve:static &        # 或 node tests/verify-chrome.mjs（verify-all 自动起服务）
node tests/verify-chrome.mjs http://127.0.0.1:8899

# 校验当前 markup / runtime 接入，不运行归档迁移器
node tests/verify-registry.mjs
```

> `tools/lib/browser.mjs` 会按「环境变量 → 系统 Chrome/Chromium → Puppeteer 缓存」解析路径，
> 不再依赖固定的 Puppeteer 版本目录。换机器时优先设置 `CHROME_BIN`；WSL 里的 Linux Node
> 若要使用 Windows Chrome，请用 Windows 侧 Node 运行校验，或在 WSL 安装 Linux Chrome 后设置 `CHROME_BIN`。

`verify-chrome.mjs` 的断言（26 个顶栏页 × 移动 390 / 桌面 1280 × zh / en = 104 组）：

1. 顶栏三槽位齐全；右簇通用钮顺序符合契约
2. 页面至少一个 `<h1>`（`h1Count >= 1`，可为 `.sr-only`）—— P3-3 并入
3. `home` / `sound` / `pause` 的 `title` 与 `aria-label` 非空
4. 页脚在 390 宽下**可见**，hint 非空
5. 游戏页**不得出现语言钮**（负向断言；2026-09-21 语言 UI 收敛到首页后新增，
   取代历史上的「点一次语言钮 UI 必须换语言」）
6. 点一次静音钮：`site_muted` 必须翻转（双绑导致的「切两次 = 没切」会被抓出来）
7. 顶栏首页钮点击后真的导航回 `index.html`（行为断言，防死按钮）
8. Footer 不含 `data-chrome` 控件或 `.game-footer-nav`；全程无 `pageerror`
9. 运行时 DOM 里恰好一个声音开关（顶栏那颗，§1.1「唯一性」）

> ⚠️ **覆盖范围陷阱**：上面的 ①–⑧ 只遍历 `registry.withCap('topbar')` 的页面。
> tank-battle / math-rain 这类豁免页根本不进循环 —— 它们的语言钮回归**一条断言都抓不到**。
> 补齐手段是静态源扫描守卫 `tests/verify-no-game-lang.mjs`（无需起服务，1 秒内）：
> 扫全部 `*.html` + `js/**`，禁 `setLang(` / `selectLanguage(` / `switchLanguage(` /
> `langTitle` / `btnLang` / `langBtn` / `data-chrome="lang"` / `__pendingLanguageSelection =`，
> 外加「HTML 里名字带 lang 的按钮」结构检查；只豁免 `index.html`、`src/home/index.js`（首页组合根；`js/index-page.js` 只是入口）、
> `src/platform/site-settings.js`，以及 word-daily 的 `#wd-btn-lang`（单词/成语模式切换，非语言）。
> 已注册进 `verify-all` 全量档与 `--quick` 档。

> 它已经抓到一个**与迁移无关的历史 bug**：`src/games/minesweeper/index.js` 里写的是 `this.el.mute`，
> 而元素缓存的键是 `mute-btn`（id 去掉 `ms-` 前缀），所以扫雷顶栏的静音钮**自 HEAD 起就没绑上过**。

## 5. Mobile action budget and native overflow (Step 5b)

At widths <=480px, Home and Sound are pinned and at most **two other actions**
occupy the row. Stats and Pause count toward this budget. The More invoker is
outside the budget and precedes Sound. Priorities select membership only:
canonical system order remains Stats -> Pause -> Sound. No two-row/title-hidden
Tower Defense exception remains. Above 480px all original actions are restored.

`chrome.actions` stays a compact role list. Optional `chrome.mobile.priority`
overrides the shared role priorities; `maxVisibleActions` defaults to 2 and cannot
exceed 2. Equal priorities retain registry order. Slot membership is decided at
build time, not reassigned as a game starts/pauses, so buttons never shuffle under
a finger. An empty/unavailable overflow hides More entirely.

That is why an action that only exists during play (the contextual Restart, §1.5)
must stay in the row, never be the only thing behind More: More would then be hidden
on the start menu, appear when the run starts, and push every action to its left by
one slot (fixed 2026-10-23 on carrot-pull / shadow-loom / loop-jail / sudoku-mist,
whose Restart was overflowed). Overflow an always-available action instead. Current
overflow pages: tower-defense (Range, Stats); needle-awn, carrot-pull, shadow-loom,
loop-jail, sudoku-mist (Leaderboard). `verify-topbar-overflow-model` pins this list,
and `verify-topbar-overflow` asserts that starting a run moves no existing control.

`render-topbar.js` generates canonical buttons and command proxies, including the
seven topbar trophies formerly inserted by `scoreboard-dialog.js`. The scoreboard
controller binds explicit `selector` entries and retains its existing non-topbar
result entries, board selection, network, and pause ownership. Statistics and
leaderboard surfaces remain separate; no duplicated panels or data state.

`game-topbar-overflow.js`, mounted once by `bindChrome`, enhances the generated
`popover="auto"` with named menu/menuitem semantics, arrow/Home/End navigation,
Enter/Space activation, Tab exit, Escape, and native light dismissal. A proxy
closes the menu and focuses its visible invoker **before** clicking the canonical
button once. A resulting drawer/dialog therefore remembers a visible return
anchor; a delayed popover toggle must never steal that new surface's focus.
Clicking a separate focusable control dismisses the menu without stealing its
focus. Closing an empty menu or crossing 480px resolves a visible fallback.

The original button remains the only game-handler and lifecycle owner. Proxies
observe its label, disabled/hidden state and `aria-pressed`, using menuitemcheckbox
for toggles. Restart guards and native confirmation are not reimplemented.
Observers and listeners are idempotent and disconnectable. Unsupported native
popovers leave original controls in place rather than hiding access.

Gates: `verify-topbar-overflow-model`, `verify-topbar-overflow` (source and dist),
`verify-contextual-restart` (source and dist), and existing chrome, topbar-grid,
topbar-row, TD topbar, stats-drawer, and scoreboard dialog tests. Pointer tests use
`tests/lib/topbar-actions.mjs` to operate the real visible command, not click an
invisible original programmatically. Atomic model/progress invariants retain
intentional direct clicks separately.
