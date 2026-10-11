# PR #135 — Mobile QA & Release Closure

## 方法与边界

真机测试改为 **Chromium 手机模拟 + 截图人工复核**（产品负责人决定，2026-10-11）。
与 #132–#134 的关键差异：视口取 **浏览器可见区域**，而不是整块屏幕 ——
iPhone Safari 工具栏展开时页面实际只拿到 375×553（SE）/ 390×664（14），旧校验器一律用
390×844，正好把下面几个问题藏了起来。

| 档 | 视口 (CSS px) | DPR | UA | 代表 |
| --- | --- | --- | --- | --- |
| se | 375×553 | 2 | iOS Safari | iPhone SE 2/3，工具栏展开 |
| i14 | 390×664 | 3 | iOS Safari | iPhone 14/15，工具栏展开 |
| a360 | 360×680 | 3 | Android Chrome | 主流 360 宽安卓 |
| px7 | 412×839 | 2.625 | Android Chrome | Pixel 7 |
| n320 | 320×454 | 2 | iOS Safari | 320 宽极限 |
| land / aland | 750×340、839×360 | 3 / 2.625 | iOS / Android | 横屏 |

覆盖：首页 + 25 个游戏 × 上述档位的**开始菜单**、**开局后对局画面**、**统计抽屉**三种状态
（共 ~330 张截图），外加自动量测：横向溢出、可点区域、主操作面是否在首屏且未被遮挡、
表单控件字号、`touch-action` 有效值、`console`/`pageerror`。排行榜 / 统计 Worker 请求一律本地应答。

**不在本次结论内**（Chromium 无法模拟，仍需真机时再看）：真实 iOS 软键盘与输入法、
双击缩放的 WebKit 实际行为（本次按 WebKit 规范预防）、静音键下的 WebAudio 解锁、
主屏幕 PWA 独立模式的刘海 / Home 条安全区、低端机帧率与发热。

## 发现与处理

| # | 级别 | 问题 | 受影响 | 处理 |
| --- | --- | --- | --- | --- |
| M1 | P1 | 输入框 / select 字号 <16px，iOS Safari 聚焦即整页放大且不复原 | 首页昵称、18 页排行榜昵称（`.game-lb-username` 13px 等）、Word Daily 猜词框（矮屏 15px）、Gomoku 难度 select | 触屏 / 移动布局 16px（`(width < 1024px), (pointer: coarse)`），桌面保留原密度 |
| M2 | P0 | Tetris 棋盘 280×560 固定，SE Safari 下底部 139px（~5 行）压在固定底栏下；对局中 `body.game-locked` 禁止滚动，整局看不到 | Tetris，所有可见高度 <~720 的手机 | ≤768px 棋盘宽 = `min(280/340px, (100dvh − 140px − 安全区) / 2)`，≤340px 预留 154px |
| M3 | P1 | 棋盘按「视口高 − chrome」取尺寸、没有触控下限：Gomoku SE 每格 11.9px、横屏 11.4px；Reversi 横屏 150px 棋盘 | Gomoku、Reversi | Gomoku 移动端下限 `min(可用宽, 320px)`（每格 20px），Reversi 下限 288px；放不下的按钮行让页面滚动 |
| M4 | P1 | Tower Defense 竖屏「请旋转」遮罩铺满 ~1300px 高的菜单舞台，文案居中在 y≈720，SE 首屏只看到一片暗色 | Tower Defense 竖屏 | 文案从舞台顶部按 `50dvh` 下移，始终在第一屏 |
| M5 | P1 | Shadow Loom 480×854 舞台按宽铺满，SE 上灯（逻辑 y 648–672，Lamp Walk 关卡要拖）在 y≈589，视口 553；画布 `touch-action:none` 几乎满宽，只剩两侧 8px 可起手滚动 | Shadow Loom 第 4、5 关等 | 移动端舞台宽同时受 `(100dvh − 100px) / 1.52` 约束，逻辑 y≤730 完整可见 |
| M6 | P2 | 仅 Tetris / Tank / Math Rain / Word Daily 有页面级 `touch-action: manipulation`，其余页快速连点可能触发 iOS 双击缩放 | 21 个游戏页 | `html, body` 统一 `manipulation`（双指缩放仍可用） |
| M7 | P2 | Sword Flight HUD「真气 / 青莲极意 / 登仙之路」及能量槽 title 是静态中文，英文下不翻译 | Sword Flight 英文 | 接入已有 `data-i18n` 绑定，补 zh/en 文案 |

### 实现位置

CSS P0/P5 冻结后，页面样式表不能直接改（`verify-css-debt` / `verify-css-duplication` /
`verify-css-w7-closure` 会拒绝任何未登记的规则变化）。仿照 #130 的 `scoreboard-dialog.css`，
所有 CSS 修正集中在新的附加特性样式表 **`css/mobile-fit.css`**：

- 全部规则在 `@layer contracts`；被修正的页面规则多为冻结的 unlayered 债务，因此用分层
  `!important`（压过 unlayered 声明，且与 `<link>` 顺序无关）；
- 选择器白名单与「首页 + 全部注册页各一条、位于 layout 之后 more-games 之前」的链接规则由
  `tests/lib/css/feature-additions.mjs` 审核，负例在 `tests/verify-css-feature-additions.mjs`；
  新页脚手架 `src/platform/shell/render-game-shell.js` 已带上这条链接。
- Gomoku 触控下限在 `src/games/gomoku/index.js`（画布尺寸由运行时决定）；Sword Flight HUD
  走已有的 `data-i18n` 绑定。

已确认但留待独立改动的条目见 `docs/backlog.md`「移动端 QA（PR #135）」。

巡检中**没有**发现：横向滚动、topbar 图标钮可点区域 <44px（视觉 36px + `::after` 扩展热区）、
统计抽屉开合 / 遮挡问题（18 个抽屉页截图逐一复核）、Tank Battle / Tower Defense 横屏战场遮挡、
运行时 `pageerror`。

## 回归与证据

- 新增 `tests/verify-mobile-viewport-fit.mjs`（M1、M3–M7，跨页、接 `page-filter`）。
  **反向验证**：在 `main`（42aed17）上运行同一脚本 52 项失败（含首页 touch-action），覆盖全部断言类别；本分支全部通过。
- `tests/verify-tetris-topbar-mobile.mjs`：原「棋盘被底栏压住」只打印的提示改为硬断言，
  并加入 Safari 可见视口 375×553、390×664。旧 CSS 下 4 个视口失败，新 CSS 7 个视口通过。
- `verify-leaderboard-layout` 标准表：<1024px 时昵称框期望 16px（桌面仍 13px）。
- 新页脚手架带上 mobile-fit 链接后，`tests/lib/css/runtime-sources.mjs` 的脚手架复核摘要随之更新（注明本次新增的唯一样式表输入）。
- 全量 `npm run verify -- --jobs=2`：132 步中 129 步通过；`verify-css-debt` 报的脚手架摘要已在随后提交中复核更新并单独复验通过。其余两步与本改动无关：
  `verify-tetris-drawer` 只因外部统计端点 `games-analytics.orangely.workers.dev` 在容器内
  `ERR_TUNNEL_CONNECTION_FAILED`（`docs/browser-testing-environment.md` 记录过的同类情况）；
  `verify-stats-drawer` 撞上 runner 180s 单步上限 —— 单独运行本分支 176s 全部通过，`main` 上同一脚本 177s，
  属既有耗时，不是回归；PR #134 的 CI 上它已是 179.6s。CI 同样只在这一步超时，因此给 verify-all 加了
  `// verify-all: timeout=<ms>` 声明，本项预算 300s（见 `docs/traps.md`「校验基础设施」）。`smoke-carrot-pull` / `smoke-sword-flight` 在第一次 `--jobs=3` 全量里因 CPU 争用
  出现过节奏 / 双击时窗失败，单独重跑均通过，`--jobs=2` 全量中也通过。
- `npm run build`、`gen --check`、lint 通过；`verify-mobile-viewport-fit` 在 `dist/` 产物上同样通过。

不改动：游戏规则、计分与排行榜协议、Worker、存储键、URL / DOM id、桌面布局（≥1024px 鼠标场景）。
