# Games — Q1 全站质量与玩家体验审计

**日期：** 2026-10-23  
**仓库：** `mingzhangyang/games`  
**基线：** `27b440739e8f1a11460411835a1a07bedec05042`（Step 6d / PR #186 已合并）  
**审计性质：** 代码与结构检查、历史实测复核、GitHub CI / 发布记录核查。**未进行**本轮真实手机操作、逐游戏新截图、Cloudflare D1 直接读数或最新构建的独立性能采样。

## 1. 执行摘要

- 当前 Registry 登记 **28 款站内游戏**，共 **29 个站点入口 HTML**（含首页），另有 **5 款独立部署游戏**接入 Analytics V2；不能把旧文档中 25/27 款的样本当作今天的全量覆盖。
- `tests/verify-all.mjs` 自动发现 **155 个验证/冒烟脚本**（130 `verify-*`、23 `smoke-*`、2 个额外验证），并按分片运行源码与部分构建产物测试。Step 6d PR #186 的 [Architecture v2 candidate run 40035009652](https://github.com/mingzhangyang/games/actions/runs/40035009652) **静态验证及四个浏览器分片全部成功**；该验收的代码内容已经合并为上述基线。自动化通过不等于 28 款游戏均已完成手动整局体验评估。
- 本轮**未发现经当前环境实测确认的新 P0**。最值得优先处理的是：Tetris 横屏、Shadow Loom 极小视口两个历史可玩性缺口的最新版本复现；排行榜 Worker 无写入限流（代码事实）；Analytics 生产数据验收与真正完整的触控/游戏体验覆盖。
- **已排除过时告警：** GitHub [Deploy Workers run 39963432120](https://github.com/mingzhangyang/games/actions/runs/39963432120) 在 2026-10-23 13:42–13:43 UTC 以 `TARGET=all` 成功发布 `scores`、`analytics`、`word-stats` 和站点。Analytics Worker 版本为 `e52da76d-4a1e-4436-b51b-96573a515561`。从部署用的提交 `7d7194bf` 到本次基线，没有 `Workers/**` / `public/analytics.js` 的源码差异。**不能再称 Analytics Worker 尚未部署**；但成功发布尚不能证明五款独立游戏的真实 V2 事件已进入 D1，也不能代替生产实际 HTTP/浏览器验收。

### 证据等级

- **A — 当前源码或 Actions 日志直接确认：** 如 Worker 无速率限制、CI 通过及耗时、现有脚本覆盖范围。
- **B — 历史真实测试确认且当前对应代码仍存在：** 如移动横屏/极小视口问题；本轮没有最新截图，不能声称已再次复现。
- **C — 待补的验证/产品门禁：** 如真实 Safari 操作、完整 28 游戏性能采样、生产 D1 事件；**不是已发现的运行时故障**。

## 2. 按优先级排序的发现

| ID | 优先级 | 等级 | 发现与证据 | 后续动作／验收 |
| --- | --- | --- | --- | --- |
| Q1-01 | **P1** | **B** | **Tetris 手机横屏不可玩**：PR #135 的 QA 在约 750×340 的横屏下确认棋盘被固定底栏遮住；当前 `css/tetris.css` 仍用 `position: fixed; bottom: 0` 的 `.mobile-controls`；`verify-tetris-topbar-mobile` 覆盖的固定视口没有 750×340。参考 [backlog](https://github.com/mingzhangyang/games/blob/27b440739e8f1a11460411835a1a07bedec05042/docs/backlog.md)、[CSS](https://github.com/mingzhangyang/games/blob/27b440739e8f1a11460411835a1a07bedec05042/css/tetris.css#L381-L398)、[测试视口](https://github.com/mingzhangyang/games/blob/27b440739e8f1a11460411835a1a07bedec05042/tests/verify-tetris-topbar-mobile.mjs#L32-L41)。 | 在横屏 750×340、839×360 与返回竖屏情况下实测；明确采用专属横屏布局**或**可操作的旋转提示；开局/暂停/重开不失效。加源码与 dist 浏览器断言。 |
| Q1-02 | **P1** | **B** | **Shadow Loom 320×454 灯的拖动区极限**：历史 QA 报逻辑 y=672 处仅首屏下移 2px；当前 `.sl-stage { min-width: 260px; }` 仍在 [CSS 第 139 行](https://github.com/mingzhangyang/games/blob/27b440739e8f1a11460411835a1a07bedec05042/css/shadow-loom.css#L139)。 | 不要仅降低 `min-width`；验证 320×454、375×553 下需要拖灯的关卡实际可达、画布逻辑坐标／手势精度及滚动入口，再做局部几何调整。 |
| Q1-03 | **P1** | **A** | **排行榜可批量刷榜／写入滥用**：当前 Worker 对 POST 校验 Origin、Content-Type、payload、姓名与分数上限，随后写入 DO，但没有每来源的提交速率限制。Origin 不等于鉴权。参考 [Worker POST](https://github.com/mingzhangyang/games/blob/27b440739e8f1a11460411835a1a07bedec05042/Workers/game-scores.js#L127-L173)、[长期缺口](https://github.com/mingzhangyang/games/blob/27b440739e8f1a11460411835a1a07bedec05042/docs/backlog.md)。 | 在 Worker 服务端增加有界、可测试的 IP/时间窗限流和明确 429 反馈；验证允许来源、误伤与并发、榜单只读可用性。不得声称限流能防止作弊。**需要单独授权／验收生产 Worker 部署**。 |
| Q1-04 | **P1（验收）** | **C** | **Analytics V2 真实数据闭环未获本次证据**。10/23 已成功重新部署全套 Worker；历史 [V2 runbook](https://github.com/mingzhangyang/games/blob/27b440739e8f1a11460411835a1a07bedec05042/docs/analytics-v2-weekly-runbook.md) 的 10/18 版本与“0 条 V2”快照不能代表当前。部署不证明生产 D1 接收。 | 只读核对当前 Worker 版本/实际来源、`GET /stats?v=2`、D1 同日期汇总及五外站普通真实游玩后的 `open`/`play`/`active`/`finish`（按游戏适用性）；不要注入伪造生产 POST，也不要凭 HTTP 200 断言成功。 |
| Q1-05 | **P1（覆盖）** | **C** | **28 游戏的新一轮全站手机巡检缺口**：PR #135 截图基线只覆盖当时的 25 游戏，今天是 28；现有 Chromium 回归覆盖多种视口，但不能代替真实 iOS 软键盘、Safari 音频解锁、PWA 刘海/底部安全区、低端机发热。参考 [移动 QA](https://github.com/mingzhangyang/games/blob/27b440739e8f1a11460411835a1a07bedec05042/docs/mobile-qa-pr135.md)。 | 固定 320×454、375×553、390×664、360×680、750×340、839×360、1280×900；从菜单→实际操作→暂停→结算→重试截取三类状态及真实可点击区域。在有设备时单列 Safari/Android/PWA/输入法验收。 |
| Q1-06 | **P1（回归覆盖）** | **A** | **8 款没有专属 `smoke-<id>.mjs`**：Tetris、Gomoku、Planet Merge、Word Daily、Hoop Shot、Minesweeper、Reversi、Gravity Slingshot；其中 Planet Merge、Hoop Shot、Minesweeper、Reversi 也没有以其游戏 ID 命名的 `verify-*`。**注意**这些游戏仍被全站/批量 leaderboard/抽屉等测试覆盖，不是“没有测试”。 | 为缺口最大的四款补最小完整游玩链（启动→一次有效动作→结算/失败→重新进入→记录状态）；再评估另四款是否已由特定既有回归充分覆盖，不为数量刻意复制测试。 |
| Q1-07 | **P2** | **B** | **Gomoku 横屏木纹底框拉伸**：历史截图确认、当前 `.board-container` 同时为 `.game-stage`，背景伪元素覆盖容器而非正方形棋盘，见 [CSS](https://github.com/mingzhangyang/games/blob/27b440739e8f1a11460411835a1a07bedec05042/css/gomoku.css#L103-L139)。 | 横屏 750×340、839×360 比对棋盘与底纹边界；不破坏 canvas 命中和宽高预算。 |
| Q1-08 | **P2** | **B** | **Loop Jail 英文触控说明 ≤390px 省略号截断**：旧 [backlog](https://github.com/mingzhangyang/games/blob/27b440739e8f1a11460411835a1a07bedec05042/docs/backlog.md) 明确登记。本轮未实测当前 DOM 的具体可见字符。 | 缩短文案、允许合理换行并在中文/英文、320/375/390px 下复查，保留提示语义。 |
| Q1-09 | **P2（性能）** | **A+B** | **Legacy 打包开销**：当前 [`vite.config.js`](https://github.com/mingzhangyang/games/blob/27b440739e8f1a11460411835a1a07bedec05042/vite.config.js) 仍启用 `@vitejs/plugin-legacy`；历史构建曾额外产生 55 个 `*-legacy-*` 文件。**尚未测量**现代浏览器真实下载字节和可删收益。 | 先明确最低浏览器支持范围，然后对比当前 `dist` 文件数、现代浏览器 Network transfer / Parse、Build 时间和 Safari 14 WebKit。确认兼容性后再决定是否删除插件；不能将“双产物”误读成浏览器“双下载”。 |
| Q1-10 | **P2（性能证据）** | **C** | **性能基线覆盖过时**： [PR #138](https://github.com/mingzhangyang/games/blob/27b440739e8f1a11460411835a1a07bedec05042/docs/runtime-performance-baseline-pr138.md) 有 25 游戏 × 2 视口 × 3 次的 150/150 历史 Chromium 采样（[Run 38265477759](https://github.com/mingzhangyang/games/actions/runs/38265477759)），但不覆盖目前新增的全部 28 游戏和最新产物。该 rAF 指标是探针调度，不是实际渲染 FPS。 | 利用**已有** opt-in `runtime-performance.yml` 跑 28×2×3=168 个采样，并根据 p95、long tasks、加载/堆变化做可复查的基线比较；真机再验证性能候选，不重新开发 profiler，不给 CI 强行设无依据 FPS 门槛。 |
| Q1-11 | **P2（CI 成本）** | **A** | **浏览器测试固定等待拖长分片**：#186 run 日志分别显示 `verify-stats-drawer` 189.2s、`verify-theme` 153.7s、`verify-button-icons` 114.3s、`verify-chrome` 111.9s，最长分片 wall 471.9s。 | 有选择地将固定 sleep 替换为可观察条件，保留跨状态测试完整性；在同等通过率下计时对照，而不是删掉测试或增加超时上限。 |
| Q1-12 | **P2（无障碍）** | **C** | **减少动态效果的专项测试仅列举六个代表页**：`verify-reduced-motion` 检查 Tetris、Math Rain、Circuit、Needle Awn、Word Daily、Crystal Bloom。其它游戏可有 CSS 支持，但不能由此宣称全站已手动验证键盘/VoiceOver/读屏。 | 抽样覆盖 28 页的焦点顺序、抽屉焦点回归、按钮可读名称、对比度及 `prefers-reduced-motion`；真实读屏单独留验收记录，不必建立第二套 UI 配置框架。 |
| Q1-13 | **P2（生产体验）** | **C** | **Service Worker 已有真实 Chromium 多版本和回滚测试**，不是当前待重构问题。但 [生命周期文档](https://github.com/mingzhangyang/games/blob/27b440739e8f1a11460411835a1a07bedec05042/docs/service-worker-cache.md) 要求真实 iOS/Android 的长驻旧标签、离线切换、空间驱逐及数据保留仍需验证。 | 生产或测试环境以真实 profile 检查版本更替、断网/恢复和已存进度/待提交成绩。绝不能通过“清站点数据”假装解决缓存问题。 |

**P0=0（当前未证实）；P1=6 项（其中包含覆盖/验收门禁，不全是已证实玩家故障）；P2=7 项。** P1 的移动端条目仍需最新版本实测才能认定为当前存在。

## 3. 各维度审计结论

| 维度 | 本次确认 | 尚缺的证明 |
| --- | --- | --- |
| 架构 | Shared platform / per-game packages / generated registry 边界，Step 6d 已合并；最新对应 PR CI 全绿 | 无需继续做 Step 6e 式抽象；只在确有重复机制时修改 |
| 导航与布局 | 共享顶栏、移动菜单、抽屉、主题、溢出、结果 UI 有真实 Chromium 回归，部分再跑 `dist` | 上述特殊横屏/极小屏修复前后的截图与实际可操作验收 |
| 核心玩法 | 20 款有专属 smoke，其余有不同程度的通用/专项测试 | 8 款是否具备真正的“至少一局”自动化路径及人工手感判断 |
| 存档/排行榜 | `verify-game-storage-*`、`verify-scoreboard-*` 覆盖迁移、失败、重试、幂等状态；Worker 已重新发布 | 生产端用户操作、真实榜单写入负载/滥用防护；限流尚缺 |
| Analytics | V2 代码同源派生，10/23 成功部署 Worker | D1 实收和每周邮件有效覆盖时点，不能据此启用 `REPORT_ENABLED` |
| 性能 | 可重复 opt-in profiler 和 150/150 的 25-game 历史数据 | 当前 28-game 同环境重测；物理机 GPU、真实浏览器帧体验、网络瀑布 |
| PWA | 版本指纹、延迟激活、只留当前代缓存、有真实 Chrome 回归 | iOS/Android 的长期标签/存档/无网络设备检查 |
| 可访问性 | 当前具备焦点、触控文字、主题、减少动画的部分自动验证 | 真实 VoiceOver/TalkBack 及全站关键路径人工审计 |

### 3.1 历史性能原始样本的实际复核（与当前 28-game 基线分开）

Q1 直接取得并检查了 [PR #138 的原始 GitHub Actions ZIP（Run 38265477759；Artifact 11758106843）](https://github.com/mingzhangyang/games/actions/runs/38265477759/artifacts/11758106843)：`results.json` 共 **150 条 `measured` 结果**，对应 `3d00a67f`、**25 游戏 × 2 视口 × 3 次**，Chromium 154、Linux 4 逻辑核心、`--disable-gpu`、服务端请求模拟。以下均是各次 15s 活跃窗口的**rAF 探针调度间隔 p95**，不是实际游戏渲染 FPS：

| 历史候选游戏（移动模拟） | 3 次 p95（ms） | 三次 `>33ms` 探针间隔数 | 同一测试桌面 p95（中位） | 判断 |
| --- | --- | --- | --- | --- |
| **Sword Flight**（较轻的 Zen 模式） | 33.4 / 33.4 / 33.4 | 90 / 92 / 102 | 16.7ms | **三次重复均存在调度延迟**；Q3 定向 trace 优先候选，非真实移动 GPU 结论 |
| **Shadow Loom** | 33.4 / 33.3 / 33.3 | 59 / 44 / 55 | 16.7ms | **边界附近反复出现延迟**；与 320×454 的几何缺口是**不同的问题**，不得混因 |
| **Firefly Signal** | 16.8 / 16.8 / 33.2 | 22 / 19 / 21 | 16.7ms | p95 中位并未超 33ms，但每次都有零散慢间隔，排在前两者之后 |
| Ripple Duet | 16.8 / 16.8 / 16.8 | 0 / 0 / 0 | 16.7ms | 此同一环境的三次基线未支持“游戏存在持续掉帧”的说法 |

上述四款在当前 `main` 的代码和美术可能已改变，**不能将 10/12 的测量写成 10/23 的现存性能缺陷**；当前 28-game 最新构建基线仍待新 opt-in 跑数。另有不同工作负载、自动化 start path、CPU task counter、无真实 GPU 加速等限制，不能跨游戏直接按 `taskTimeMs` 排名判定体验。Q3 先复跑 *Sword Flight → Shadow Loom → Firefly Signal*，保存 trace，并在真实手机检查触控延迟和画面，只有差异稳定再启动有针对性的优化。

## 4. 逐游戏自动化覆盖清单

当前 28 款已登记游戏，都受全站/共享验证器保护；下表的“独立 smoke”只表示 `tests/smoke-<id>.mjs` 是否存在，不表示没有其它测试。

| 站内游戏 | 独立 smoke | 需优先补的 Q1 路径 |
| --- | :---: | --- |
| Math Rain | 有 | 手机道具操作与性能采样 |
| Tetris | **无** | **P1 横屏真实操作**、开始至结算，验证固定底栏 |
| Tank Battle | 有 | 横屏触控、暂停、战场入口 |
| Gomoku | **无** | 横屏木框、下棋/重开、键盘焦点 |
| Planet Merge | **无** | 整局结束→存档→重开与每日模式 |
| Word Daily | **无** | 输入法、跨日恢复与结算 |
| Hoop Shot | **无** | 真实一局与结算/榜单回执 |
| Minesweeper | **无** | 开局、踩雷/胜利、重开与成绩回执 |
| Reversi | **无** | AI 对局关键交互、结算与重开 |
| Tower Defense | 有 | 竖屏旋转提示与横屏战术动作 |
| Gravity Slingshot | **无** | 拖动发射、失手和每日玩法 |
| Needle Awn | 有 | 横屏/触控操作与真实反馈 |
| Sword Flight | 有 | Zen 与普通玩法分别界定性能场景 |
| Lumen | 有 | 分章节选关与无障碍名称 |
| Circuit | 有 | 实验区分组与标题布局 |
| Silk Dew | 有 | 真实手势牵引、静止失效提示 |
| Bond Forge | 有 | 键合、价态与提示准确性 |
| Echo Cave | 有 | 走位/声波/失败与重试 |
| Maxwell Demon | 有 | 观测、闸门与温差反馈 |
| Crystal Bloom | 有 | 长短摘要/选关、触控操作 |
| Flame Verse | 有 | 燃烧结果与状态提示 |
| Ripple Duet | 有 | 波形叠加和反射解法 |
| Carrot Pull | 有 | 拖拽、下一关与重新开始 |
| Firefly Signal | 有 | 节奏同步的误触/节奏反馈 |
| Shadow Loom | 有 | **P1 极小屏灯与纸片交互** |
| Loop Jail | 有 | 英文触屏提示不截断 |
| Magnetic Garden | 有 | 磁极拖动、24 关及本地记录 |
| Sudoku Mist | 有 | 每日题、提示、回放、榜单回执 |

> 五款独立部署游戏（2D Minecraft、Dots and Boxes、The Stack、Seven Bridges、Fourfold Atlas）不属于站内 `games.config.json` 的游戏 HTML 冒烟覆盖，应按各自仓库验收玩法，并在本仓库完成统一 Analytics V2 生产数据核验。

## 5. 建议后续工作拆分（不是继续重构阶段）

1. **Q2-A：移动端高影响缺口**。先复现 Tetris 横屏与 Shadow Loom 320×454，若仍存在，按不同游戏所有权拆两个专注的 PR；另补 Loop Jail/Gomoku 的 P2 视觉和说明修复。不可只用 CSS 截图证明游戏能玩。
2. **Q2-B：排行榜 Worker 写入限流**。单独 PR，加限流单测、攻击负载测试、允许来源边界与部署说明。不得自动生产部署或更改成绩协议。
3. **Q2-C：整局 smoke 缺口闭合**。以 Planet Merge、Hoop Shot、Minesweeper、Reversi 为优先；先复用已有测试基础，避免重复机制与低价值测试。
4. **Q3-A：当前 28-game 性能基线**。利用现有 opt-in profiler；仅针对重复测量证实的热点优化。另开可控实验比较 `plugin-legacy` 的浏览器真实收益与兼容代价。
5. **Q4-A：生产验收 / 真实设备矩阵**。验证五外站实际 V2 D1 收据、真实榜单流程、网站更新与 PWA 离线/旧标签；iOS Safari/Android 触控、输入法/音频/读屏，记录截图与设备版本。生产信息仅使用只读检查，不注入伪事件。
6. **工程效率（独立低风险 PR）**。在已运行通过的脚本上用状态条件取代固定 `sleep`，报告分片时间前后差别；绝不能为了省 CI 而降测试覆盖。

## 6. 可复现的验证入口

在同一干净的 Node 22 checkout 中串行执行（**不要并发 npm install 与 vite build**）：

```sh
npm ci
npm run gen -- --check
npm run build
npm run verify -- --jobs=2
npm run verify:dist

# 可选的当前 28-game 性能诊断，仅在有可运行 Chrome 且预算允许时：
npm run profile:runtime -- --all --viewports=mobile,desktop \
  --preset=baseline --repeat=3 --out=.tmp-perf/q1-20261023
```

历史基线、CI 和源码**不能**替代当日完整 28 游戏新截图、真实手机系统、Cloudflare 当前 D1 读取或最新 168 份性能测量。当前工作环境无法克隆 GitHub 供本地浏览器运行，且直接访问 `games.orangely.xyz` 返回不可访问，因此这些门禁在本报告中**明确保持待验收**，不填虚构 FPS、视觉评分、用户满意度、线上 D1 数据或“全部真实设备通过”。

## 7. 关键证据链接

- [本次基线](https://github.com/mingzhangyang/games/commit/27b440739e8f1a11460411835a1a07bedec05042)
- [Step 6d 完整静态 + 浏览器 CI](https://github.com/mingzhangyang/games/actions/runs/40035009652)
- [2026-10-23 生产 Deploy Workers `all`](https://github.com/mingzhangyang/games/actions/runs/39963432120)
- [持续缺口登记](https://github.com/mingzhangyang/games/blob/27b440739e8f1a11460411835a1a07bedec05042/docs/backlog.md)
- [PR #135 移动截图与视口审计](https://github.com/mingzhangyang/games/blob/27b440739e8f1a11460411835a1a07bedec05042/docs/mobile-qa-pr135.md)
- [PR #138 25-game 实证性能基线](https://github.com/mingzhangyang/games/blob/27b440739e8f1a11460411835a1a07bedec05042/docs/runtime-performance-baseline-pr138.md)
- [Analytics V2 生产门禁与历史快照](https://github.com/mingzhangyang/games/blob/27b440739e8f1a11460411835a1a07bedec05042/docs/analytics-v2-weekly-runbook.md)
- [源码/生产端测试总入口](https://github.com/mingzhangyang/games/blob/27b440739e8f1a11460411835a1a07bedec05042/tests/verify-all.mjs)

**后续策略：** 不再做无意义的 Step 6e 架构抽象，按复现证据和玩家影响修复；测试失效要找根因，实际部署与代码合并分别验收。