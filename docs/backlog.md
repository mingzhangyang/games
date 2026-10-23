# 待办缺口登记

本文件只登记**已确认、已定位、但需独立改动**的缺陷。
校验器里每一处 `knownGaps` 降级都必须在这里有对应条目，否则就是偷偷关掉断言。

---

## vite build 与 npm install 并发会间歇性失败（html-inline-proxy）

**现象**：P3-2/P3-3 期间（2026-09-20），后台跑 `npm install stylelint eslint` 的同时
执行 `vite build`，构建间歇性失败于
`[vite:html-inline-proxy] Could not load …?html-proxy&inline-css&index=0.css:
No matching HTML proxy module found`，失败入口在 index.html / math-rain.html
之间随机漂移，与被改动的页面无关。

**定位**：npm install 的下载/解包/树重算全程会移动、替换 `node_modules/` 下的文件，
vite 构建并发读取同一目录时模块解析与插件状态出现竞态窗口。
所有失败样本均发生在 npm install 运行期间；npm 进程结束（node_modules 静止）后，
同一内容连续构建 2 次全部成功。此前的「`<main>` 标签触发构建失败」二分结论
是**采样假象**（所有实验都在 npm 并发期执行），main 标签迁移本身完全无害，
已在 P3-3 完整落地。

**规约**：构建前确保没有 npm install 在跑；构建偶发此错时先检查是否有
npm 进程并发，重跑即可。CI/脚本编排中 install 与 build 必须串行。

✅ 已完成：index.html main 升级（P4-2 批次补齐，hero/footer 保持在外）、
tank-battle main 升级（P4-2 最小接骨架：layout.css 引入 + `<main class="tb-main">`
display:contents 透传 + sr-only h1，横屏掌机形态保持覆盖式 HUD 不变）。

---

---

## 移动端 QA（PR #135）确认但未在本 PR 修复的缺口

以下均在 Chromium 手机可见视口（375×553 / 390×664 / 360×680 / 320×454 / 横屏 750×340、839×360）
截图巡检中确认，详见 `docs/mobile-qa-pr135.md`。均不影响竖屏主流程，按需独立改动。

- **Tetris 手机横屏不可玩**：≤768px 固定底栏 + 竖版棋盘，横屏 340px 高时棋盘被底栏遮住大半。
  需要「横屏提示」或横屏布局（类似塔防的旋转提示），不是调一个高度预算能解决的。
- **Gomoku 横屏木质底拉伸**：棋盘画布按高度/触控下限取 320px 正方形，但 `.board-container`
  同时是 `.game-stage`、宽度铺满舞台，木纹 `::before` 随容器变成宽矩形。纯视觉；修需要让外框
  贴合画布，要动 stage 几何契约。
- **Shadow Loom 320×454（SE 一代 Safari）**：`.sl-stage { min-width: 260px }` 高于本次纵向预算，
  灯可拖区（逻辑 y 672）落在首屏下 2px。降低 min-width 需要另验 260px 以下的纸片拖拽精度。
- ✅ 已修（2026-10-18）：**触屏上的键盘 / 鼠标文案**。页脚提示列键鼠操作的 10 页（gomoku / hoop-shot /
  minesweeper / needle-awn / planet-merge / sword-flight / tetris / tower-defense / word-daily / firefly-signal）
  加了 `hintTouch`，`(pointer: coarse)` 时由共享 binder 的 `data-i18n-touch` 或 `touchCopy()` 切换；
  `tests/verify-touch-hints.mjs` 对全部页面断言触屏提示不含键鼠字样。仍有：loop-jail 英文触屏提示在 ≤390px
  被省略号截断（原有文案，未改）。
- ✅ 已修（2026-10-13，局内状态归舞台，#140）：**Sword Flight「九天问道」印章英文下不翻译**。印章移到舞台状态行 `#sf-mode-badge`，按当前玩法与语言显示（`render/hud.js` `refreshModeBadge`）。
- ✅ 已修（2026-10-22，顶栏第 2 步 B 批 + 第 5 步 b）：**Tower Defense 竖屏顶栏 HUD 三行堆叠**。HUD 并进底部战术条，竖屏顶栏单行显示游戏名、Speed / Pause / 「⋯」/ Sound。

---

## 架构评审（2026-10-18）确认、待独立改动的缺口

- ✅ **Service Worker 缓存长期累积（PR #163）**：构建产物注入内容指纹，SW 更新不再
  `skipWaiting` 抢占旧页面；新 SW 激活时立即清除**所有旧版 Games 缓存**（包括
  `games-cache-v2`），只保留当前版本。首页关键资源安装期预缓存，失败不切换；
  离线只使用当前缓存，不回退到旧版。新增真实 SW Chromium 多版本/断网/回退测试，
  详见 `docs/service-worker-cache.md`。长期打开的旧标签页会延迟激活与清理。
- **`@vitejs/plugin-legacy` 让 JS 产物翻倍**：`targets: ['defaults', 'not IE 11']` 覆盖的浏览器全都支持
  ES module + 动态 import，但构建仍为每个入口额外输出一份 SystemJS legacy 包（`dist/assets/js` 105 个文件里
  55 个是 `*-legacy-*`）。去掉插件需要显式设置 `build.target`（例如 `['es2020', 'safari14']`）以保持现有
  现代包的语法降级；属于浏览器支持范围的产品决定，需确认是否还要照顾无 ESM 的老内核 WebView。
- ✅ **Shadow Loom 首屏剪影分包（2026-10-18）**：SVG 生成缓存拆成八个按关动态 `import()` 模块，入口只保留 loader；切换关卡会等待加载成功后才编译渲染与判定。需要在真实移动设备上补测网络瀑布和解析时长。
- **最慢的浏览器校验靠固定 sleep 串行跑页面**：`verify-stats-drawer`（≈190s，17 页 × 每页约 17 次固定
  等待）、`verify-theme`（≈145s）、`verify-button-icons`（≈135s）、`verify-chrome`（≈105s）。CI 已按分片
  并行，但这几项仍决定单个分片的下限；按页面开独立 BrowserContext 并发、把固定 sleep 换成显式条件，
  可把每项压到 1/3 左右。
- **排行榜 Worker 没有写入限流**：`Workers/game-scores.js` 的 POST 只校验 Origin、分数上限与名字，
  没有像 `games-analytics` 那样的 native rate limiter；任何脚本都能刷满 Top 50。纯静态站点无法真正防作弊，
  但加一个按 IP 的写入限流能挡住批量刷榜。

---

## 页面骨架提案审查确认、留待 6c 的榜单提交缺口

**Echo Cave / Maxwell Demon 忽略提交失败返回值**：
`src/games/echo-cave/runtime.js` 与 `src/games/maxwell-demon/runtime.js` 的 `submit()`
使用 `submitScore(...).then(() => fetchBoard(game))`，没有读取 POST 结果。
`src/platform/leaderboard.js` 的契约是失败返回 `false`、不抛异常，因此 POST 失败后仍会拉榜；
若 GET 成功，`renderBoard()` 清空状态提示，页面未告知本次成绩上传失败。

控制流已由静态阅读确认；本条不声称已完成浏览器故障注入。Chrome 6a 仅迁移静态生成源，
不修改这两页 runtime。后续 6c 应复用既有 `leaderboard.js` / `scoreboard-pending.js`，
明确区分远端确认、本地待重试和未保存状态；GET 成功不能覆盖当前成绩未上传的事实。

**验收**：注入 POST 网络失败 / 非 2xx、同时让 GET 返回有效榜单，断言仍显示未上传或已入队状态；
再覆盖重试成功后的状态更新，以及旧请求在关闭、重开结算后不会覆盖新结果。
