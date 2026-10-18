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
- **Sword Flight 顶栏印章「九天问道」英文下不翻译**：可能是有意的品牌印章，需产品确认后再定。
- **Tower Defense 竖屏顶栏 HUD 三行堆叠**：竖屏本就由旋转提示接管，仅视觉。

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
- **Shadow Loom 入口包 576 KB**：`src/generated/shadow-loom/silhouettes.js`（532 KB 采样数据）被静态
  import 进入口，手机首屏要先下载并解析整份八关数据。改为按关 `import()` 或作为 JSON 资源按需 fetch。
- **最慢的浏览器校验靠固定 sleep 串行跑页面**：`verify-stats-drawer`（≈190s，17 页 × 每页约 17 次固定
  等待）、`verify-theme`（≈145s）、`verify-button-icons`（≈135s）、`verify-chrome`（≈105s）。CI 已按分片
  并行，但这几项仍决定单个分片的下限；按页面开独立 BrowserContext 并发、把固定 sleep 换成显式条件，
  可把每项压到 1/3 左右。
- **排行榜 Worker 没有写入限流**：`Workers/game-scores.js` 的 POST 只校验 Origin、分数上限与名字，
  没有像 `games-analytics` 那样的 native rate limiter；任何脚本都能刷满 Top 50。纯静态站点无法真正防作弊，
  但加一个按 IP 的写入限流能挡住批量刷榜。
