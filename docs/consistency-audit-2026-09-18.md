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

## 复现命令

```bash
node scripts/serve-static.mjs 8899 &          # 需与测量同轮执行，后台进程不跨轮存活
node scripts/layout-metrics.mjs http://127.0.0.1:8899
node scripts/fg-audit.mjs
node scripts/placeholder-leak-check.mjs
python scripts/emoji-button-audit.py
python scripts/apply-button-icons.py --dry    # 按钮图标迁移（幂等，--dry 只报告）
node scripts/verify-button-icons.mjs http://127.0.0.1:8899 /tmp/btn-icons
node scripts/probe.mjs planet-merge 390 844 .pm-toast
```

`verify-button-icons.mjs` 会按 id 解开结果面板的 `hidden`，断言每个按钮
`display:inline-flex`、恰好 1 个 `<svg>`、图标计算宽度 15px、图标与文案**垂直中心偏差 ≤1px**、
内容不溢出，并给每页留一张整页截图供目视。注意结果面板可能有入场 `transform: scale()`，
所以断言读的是**计算样式**与未变换的 `offset/client` 宽度，而不是 `getBoundingClientRect()`。
