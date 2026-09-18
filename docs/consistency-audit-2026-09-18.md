# 全站一致性复查 — 2026-09-18

承接 `docs/layout-contract-2026-09-18.md`：13 款游戏页面骨架统一后，对**布局、图标、契约覆盖、构建产物**做一次横向复查，找漏网项。

复查基线：`cc71fa1`（布局统一）→ `48c4dac`（word-daily 顶栏图标）。

## 复查方法

| 手段 | 脚本 | 结论 |
| --- | --- | --- |
| 真实几何（390×844 / 1280×900） | `scripts/layout-metrics.mjs` | 通过 |
| 前景色/字体继承 | `scripts/fg-audit.mjs` | 13/13 通过 |
| 占位符泄漏 | `scripts/placeholder-leak-check.mjs` | 全站 0 |
| 按钮 emoji 政策 | `scripts/emoji-button-audit.py` | 结果/动作类已清零（剩 25 处为已登记的模式/能力砖） |
| 按钮图标实测 | `scripts/verify-button-icons.mjs` | 34/34 通过 |
| 骨架契约类覆盖 | 本文件表格 | 见 P1/P2 |
| 源码 vs `dist/` 新鲜度 | 时间戳 + 内容抽样 | 通过 |

## 已通过项

- **几何一致**：`--frame-*` 全站一致 —— 移动端 shell padding `6px 8px`、图标钮 `36×36`、热区 `48×48`、圆角 `18px`；桌面端 `10px 12px` / `40×40` / `52×52` / `18px`。13 个页面的 `--frame-*` 调参未出现分支。
- **触控热区**：全部 ≥44px（移动 48px、桌面 52px），无回归。
- **无重复 id**、无重复注入类名（`game-body game-body` 类残渣已清）。
- **`public/sitemap.xml`**：`index.html` 以根路径 `/` 表示，非缺失。
- **`dist/`**：构建产物晚于源码改动，`shared-css-first` 生效（共享 CSS 先于页面 CSS）。

## P0 — 已修

1. **9 个页面残留空 `class=""`**（gravity-slingshot / hoop-shot / minesweeper / needle-awn / planet-merge / reversi / sword-flight / tower-defense / word-daily）。
   来源：上一批删除 `game-body` 注入时只删了类名、留下空属性。无选择器依赖 `body` 类（仅 tetris 运行时会加 `rainbow-theme` / `game-locked`，与本次无关），已直接移除属性。
2. **`js/icons.js` 头注释与 `CLAUDE.md` 自相矛盾**。注释写"仅用于无文字的控件按钮；带文字的按钮保留 emoji"，而 `CLAUDE.md` 要求含文字的动作/结果按钮（Play/Again/Copy/Close/Home/Share）也用 SVG。已按 `CLAUDE.md` 改写注释，并点明 emoji 的三处豁免（游戏内容字形、装饰性 hero 图、more-games 导航条）。

## P1 — 图标政策执行不完整（已完成）

`CLAUDE.md` 第 54 行声明的政策原先只落实在 `index.html`、`minesweeper.html`、`tetris.html`、`word-daily.html` 的部分按钮上，**同语义按钮在不同页面外观不同**，正是"各自为政"的残留。

更关键的是：这些 emoji 多数由 **i18n 在切语言时重新写回**，例如 `js/planet-merge.js:501` `textContent = \`🔄 ${t.again}\``。因此只改 HTML 会被覆盖，必须同时改 JS 赋值点。

### P1-a 结果/动作类按钮 → inline SVG（已完成，32 处）

| 动作 | 页面（处数） | 原 emoji | 现图标 |
| --- | --- | --- | --- |
| Again | planet-merge, hoop-shot, gravity-slingshot, tower-defense, reversi（5） | 🔄 | `ICONS.retry` |
| Retry | gravity-slingshot（1） | ⟲ U+27F2 | `ICONS.retry` |
| Copy | 上述 5 页（5） | 📋 | `ICONS.copy` |
| Home | planet-merge×2, hoop-shot×2, gravity-slingshot×2, tower-defense×2, reversi, needle-awn×2, sword-flight×3（14） | 🏠 | `ICONS.home` |
| Share | planet-merge, hoop-shot, word-daily×2（4） | 📤 | `ICONS.share` |
| Stats | word-daily（1） | 📊 | `ICONS.stats` |
| Next | word-daily×2（2） | ➡️ | `ICONS.arrowRight` |
| 查看九天仙榜 | sword-flight（1） | 🏆 | `ICONS.trophy` |

**三层根因，缺一层就会回退：**

1. **静态 HTML** —— 首屏（`applyLanguage` 之前）可见的初始内容。
2. **JS i18n 赋值点** —— 切语言时用 `textContent` 覆盖，会把图标抹掉；已统一改成
   `innerHTML = \`${ICONS.x}<span>${t.x}</span>\``（文案均为本地 i18n 常量，非远端数据）。
3. **i18n 字符串本身** —— `needle-awn` / `sword-flight` 把 🏠 直接写进了 `home` 文案的
   **中英两版**（`'返回菜单 🏠'` / `'Menu 🏠'`），改前两层也没用。已去掉 4 处。

新增共享类 `.game-btn`（`css/layout.css`）：只负责 `inline-flex` + 居中对齐 + 图标 15×15，
按钮自身的配色/内距/圆角仍归各页 `.xx-btn`。不用它的话，inline SVG 的基线会让图标视觉上抬高。

### P1-b 模式/能力类按钮 —— 判定为可保留（已登记）

planet-merge `♾️/📅`、gravity-slingshot `🛰/📅`、reversi `🤖/👥`、needle-awn
`🔄转锋/🌟极意` 与 `⚔️🌊📅🥋` 模式瓷砖、sword-flight `⚔️/🌸/🌌☁️📅🧘`、math-rain
`❄️💣🛡️🚀`、tower-defense `🔥`，约 **25 处**。它们是有描述文字的模式砖 / 能力标识，
与 `CLAUDE.md` 的"游戏内容字形"豁免接近，**保留 emoji**。

同一判定下保留的还有**区块标题**（`🏆 Global Win Streaks`、`📖 操作说明`、`📜 法则`）
与 **toast/公告文案**里的 emoji。下次审计不要把这三类当漏项。

注：`needle-awn` 侧栏提示 `鼠标右键 / Q / 🔄按钮`、`sword-flight` 的 `… / ⚔️按钮`
仍在**引用这些保留 emoji 的按钮**，所以它们必须同步保留 —— 若将来改这些能力按钮，
提示文案要一起改。

### P1-c `.game-toast` 的 `white-space: nowrap`（已修）

共享层 `css/layout.css` 给 `.game-toast` 加过 `white-space: nowrap`，而迁移前**任何页面的
toast 都没有这个属性**：

| 页面 | 迁移前（`30a3a5d`） | 加 nowrap 后 | 现在 |
| --- | --- | --- | --- |
| `.pm-toast` | `max-width: min(90vw,360px)` + `text-align:center`，可换行 | `nowrap` 生效 → max-width 与居中失效，长文案横向溢出 | 已恢复（`white-space: normal`，max-width 实测 351px） |
| `.wd-toast` | `border-radius: 9px`，可换行 | 同样被 nowrap 压制换行 | 换行已恢复 |

处理：**把 `white-space: nowrap` 从共享层移除**（并加注释说明原因），没有反向补到页面层——
因为原本就没有任何页面需要它。`border-radius: 99px` 则**刻意保留**：7 个页面的 toast 统一
为胶囊是该共享层本来的设计意图，`.wd-toast` 的 `9px` 属迁移前漂移；若要页面独立圆角，
在页面层覆盖即可（页面 CSS 在 layout 之后加载，同优先级后者胜）。

验证：`node scripts/probe.mjs <page> 390 844 .<xx>-toast` 现在会打印 `whiteSpace: normal`
（`probe.mjs` 本轮新增了 `whiteSpace` / `borderRadius` 两个字段，正是这两个属性最容易让共享层压掉页面意图）。

## P2 — 次要

1. **`.game-overlay` 覆盖 7/11**：minesweeper（`ms-start` / `ms-result` / `ms-pause-overlay`）、gomoku（`.modal`）、tetris（`.game-over-overlay`）未挂契约类。三者都已挂 `game-shell`/`game-topbar` 等其它契约类，浮层却是唯一缺口 —— 但补 `position:absolute; inset:0; display:flex` 会改变其现有定位，**需逐页截图确认后再动**。
2. **word-daily 无 `.game-stage`**：`game-main` 下直接摆棋盘，是唯一缺 `stage` 的 shell 家族页面（其余例外 tank-battle / math-rain 为既定豁免）。
3. **`game-footer-hint` 覆盖 5/11**：仅 gravity-slingshot / hoop-shot / planet-merge / tower-defense / reversi 有；minesweeper 用自有 `.ms-hint`。
4. **toast 垂直锚点未收敛**：`top` 取 14 / 16 / 55 / 74px，planet-merge 用 `bottom: 32px`。契约未接管该属性，属显式自由度，但观感不齐。
5. **`<html lang>` 运行时不更新**：12 个页面静态写 `lang="en"`（needle-awn / sword-flight 为 `zh-CN`），切换语言后属性不跟随，影响读屏与 SEO。建议在 `js/site-settings.js` 的 `setLang()` 里同步 `document.documentElement.lang`。

## 既定豁免（非漏项）

- **tank-battle**：键盘向横屏游戏，不走 shell/topbar 契约。
- **math-rain**：canvas 全屏型，仅用 `game-canvas`。
- **more-games 导航条**：emoji 为既定设计（`js/more-games.js`），`CLAUDE.md` 明确保留。
- **扫雷格子/表情、星球合成链**：游戏内容字形，保留 emoji。

## 追记：五子棋「棋盘点不动」——绝对定位伪元素盖住画布（2026-09-18）

**现象**：五子棋棋盘只剩一块黄木色，没有网格也没有棋子，点哪儿都没反应。

**根因**：`566dd8f`（09-17 视觉打磨）为了给棋盘加一层深色外框，把木质底从 `.board-container`
**自身的 background** 挪到了 `.board-container::before`，并给它 `position: absolute; inset: var(--tb-frame)`。
绝对定位的伪元素按层叠顺序画在**非定位的 `<canvas>` 之上**，于是它同时造成两个后果：

1. 画布内容被完全遮住（canvas 位图里网格与棋子在，屏幕上不可见）；
2. 命中测试落在容器 DIV 上，`canvas` 的 `click` 监听器永远收不到事件，落子不可能发生。

`.game-stage { position: relative }` 只是提供了定位上下文，并不改变伪元素与画布的层叠关系，
所以 `cc71fa1` 的布局统一并没有引入这个 bug，也修不掉它。

**为什么现有检查器全部漏过**：`layout-metrics` 只量盒子几何（尺寸、内距、圆角、热区），
棋盘「看得见但点不动」在几何上完全正常；`shots.mjs` 只扫控制台错误，伪元素遮挡不报错。
**必须验证「画布位图 + 命中目标 + 真实点击落子」**，这正是 `scripts/verify-gomoku.mjs` 做的事。

**修复**（`css/gomoku.css`）：

```css
.board-container { position: relative; isolation: isolate; }
.board-container::before { z-index: -1; }   /* 木质底落到画布之下 */
```

`isolation: isolate` 让 `z-index: -1` 停在「本容器背景之上、画布之下」，
不会穿透到祖先层叠上下文去（那样会被容器自己的深色底盖住）。
配套：迁移脚本 `ROLE_SPECS["stage"]` 不再剪 `position`（`cc71fa1` 曾把
`.board-container` 的 `position: relative` 剪掉，所幸当时 `.game-stage` 顶上了）。

**顺带修掉的一处隐患**：`js/gomoku.js` 的 `resizeCanvas()` 在视口极矮时
（`innerHeight < 200`）会算出负的 `cssSize`，`CELL_SIZE` 随之为负，
`drawPiece()` 的 `ctx.arc()` 抛 `IndexSizeError` 并中断整个 `resize` 回调，
棋盘停在被清空的状态。已给尺寸加 200px 下限。

## 复现命令

```bash
node scripts/serve-static.mjs 8899 &          # 需与测量同轮执行，后台进程不跨轮存活
node scripts/layout-metrics.mjs http://127.0.0.1:8899
node scripts/fg-audit.mjs
node scripts/placeholder-leak-check.mjs
python scripts/emoji-button-audit.py
python scripts/apply-button-icons.py --dry    # 按钮图标迁移（幂等，--dry 只报告）
node scripts/verify-button-icons.mjs http://127.0.0.1:8899 /tmp/btn-icons
node scripts/verify-gomoku.mjs http://127.0.0.1:8899 /tmp   # 棋盘可见 + 能落子 + 五连判胜
node scripts/probe.mjs planet-merge 390 844 .pm-toast
```

`verify-button-icons.mjs` 会按 id 解开结果面板的 `hidden`，断言每个按钮
`display:inline-flex`、恰好 1 个 `<svg>`、图标计算宽度 15px、图标与文案**垂直中心偏差 ≤1px**、
内容不溢出，并给每页留一张整页截图供目视。注意结果面板可能有入场 `transform: scale()`，
所以断言读的是**计算样式**与未变换的 `offset/client` 宽度，而不是 `getBoundingClientRect()`。

---

## 追加（18:15）：五子棋结算面板的两处状态 / i18n 缺陷

起因是上一轮收尾时我口头断言「`modalTitle` 从未被赋值，标题恒为英文」。**该判断是错的** ——
`applyLanguage()`（`js/gomoku.js:534`）一直有 `modalTitle.textContent = t.gameOver`，
实测标题正常跟随语言（`Game Over` ↔ `对局结束`）。旧结论来自只看了 `endGame()` 的局部阅读。
写了个临时探针（按 id 落子到五连后 dump 面板各元素文案）实测，真正的问题在另外两处：

### 缺陷 1：胜局后状态栏停留在「该谁走棋」

`makeMove()` 判胜后 `endGame()` 直接 `return`，**跳过了 `updateStatus()`**，于是：

| 位置 | 修复前 |
| --- | --- |
| 结算面板 | 黑方获胜！ |
| 状态栏 | 黑方走棋（`Black's Turn`） |

两句自相矛盾：对局已经结束，状态栏还在说该谁走。平局同理。

### 缺陷 2：面板开着切语言，结果文案不跟着变

`applyLanguage()` 重写了 `modalTitle` 与两个按钮，但**没有**重写 `modalMessage`：

| 元素 | 切到中文后（修复前） |
| --- | --- |
| 标题 | 对局结束 ✓ |
| 按钮 | 再来一局 / 查看棋盘 ✓ |
| 结果文案 | `Black Wins!` ✗ 仍是英文 |

**为什么真实可达**：结算浮层铺满视口、盖住顶栏，坐标点击会被浮层吃掉（只把面板关掉），
但顶栏按钮仍是可聚焦的真实 `<button>`，**键盘 Tab + Enter 触发的是元素自身的 `click`，
不经过浮层的命中测试**。所以「面板开着时切语言」这条路径在真机上能走通。

### 修复

- 新增状态 `lastResult`（`null` / `0` 平局 / `1` 黑胜 / `2` 白胜），`resetGame()` 里清空
- 新增 `resultText(t)`，`endGame()` 与 `applyLanguage()` 共用同一个渲染入口
- `endGame()` 增加 `updateStatus()`；`updateStatus()` 增加结束态分支（显示 `t.gameOver`）
- `scripts/verify-gomoku.mjs` 增加 5 条断言（结束态状态栏、面板开着切语言、标题/文案/按钮同步、
  不误关面板、换语言后仍为结束态），并做**反向验证**：拿修复前的 `9a24631` 跑同一套断言，
  6 项失败（移动/桌面各 3 项），证明断言不是空转

### 一个被证伪的排查手段

试过用「HTML 里声明了但 JS 从未引用」的静态扫描找同类缺陷，结果**全是假阳性**：
`minesweeper` 用 `this.el['pause-title']` 这种**片段键查找表**，`sword-flight` 用 i18n 键
`rankTitle`，都不需要出现完整 id 字面量。这类扫描只能当线索，不能当结论。
（真正值得注意的余项：`sword-flight` 的 `rankTitle` 两个语言的值里**自带 🏆**，
而同一功能的入口按钮已改用 `ICONS.trophy` —— 同一图标一处 SVG 一处 emoji，属政策执行不一致，
待决定是否统一。）

---

## 追加（18:25）：Tetris 手机上「棋盘会被缩放」= `:active` 变换

用户报：手机浏览器里手指操作时棋盘会缩放，应该固定大小、没有交互动画。

根因在 `css/tetris.css`（`@media (max-width:480px)` 内）：

```css
#tetris:active { transform: scale(0.99); transition: transform 0.1s ease; }
```

一行规则造成三个问题：

1. **棋盘被缩放**：手指一碰棋盘，它就缩到 99% 再弹回，实测 `280×560 → 277.2×554.4`。
2. **有交互动画**：`transition: transform 0.1s ease` 让这个缩放变成可见的动效。
3. **叠加层错位**（这条是连带的，几何表也测不出）：`#particleCanvas` / `#lineClearCanvas`
   是 `position: absolute` 的**兄弟节点**，不会跟着 `#tetris` 缩放，于是动画那 0.1s 里
   棋盘与粒子/消行特效层差出 1.4px（x）/ 2.8px（y）。

### 修复

| 文件 | 改动 |
| --- | --- |
| `css/tetris.css` | 删掉 `#tetris:active` 整块；`#tetris` 补 `transition: none` 兜底；`html, body` 加 `touch-action: manipulation` |
| `scripts/verify-tetris-touch.mjs`（新） | 触屏回归：**按住**棋盘期间量 `transform`/rect/叠加层对齐，另验操作钮按下时棋盘不动、真实触摸后尺寸不变、`touch-action` 取值 |

关于第三项：键盘/触摸之外的空白区域快速连点会触发浏览器的**双击放大**，整页放大后棋盘看起来
也是"被缩放了"，且放大态会一直留着。用 `touch-action: manipulation` 只禁双击放大，
**保留双指捏合**（`user-scalable=no` 会违反 WCAG 1.4.4，不用）。

### 为什么必须「按住」才测得出来

旧规则只在 `:active` 生效，**量初始布局必然通过**。所以脚本用 `page.mouse.down()` 压住棋盘、
等 250ms（远长于 0.1s 过渡）再采样。反向验证（`git archive HEAD` 导出未修复版跑同一套断言）
5 项失败，数字与预期完全吻合：

```
✗ 按住棋盘时 transform 保持 none        (matrix(0.99, 0, 0, 0.99, 0, 0))
✗ 按住棋盘时也没有过渡动画              (transform / 0.1s)
✗ 按住棋盘时尺寸与位置逐像素不变          (280×560 → 277.2×554.4)
✗ 粒子层/消行层与棋盘始终对齐            (按住时: particleCanvas 280×560@55,56 ≠ board 277.2×554.4@56.4,58.8)
✗ 页面层禁双击放大                      (html=auto body=auto)
```

### 保留未动

`.mobile-controls .btn:active { transform: scale(0.95) }`——那是**按钮**的按压反馈，不是棋盘；
棋盘本身已 `transition: none`。同理其他游戏的 `:active` 缩放（`.gd-btn` / `.ms-face` / `.rv-btn` 等）
全部只作用于控件，全站**没有任何其他棋盘/画布**带 `:active` 变换（已全量 grep 确认）。
