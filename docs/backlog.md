# 待办缺口登记

本文件只登记**已确认、已定位、但需独立改动**的缺陷。
校验器里每一处 `knownGaps` 降级都必须在这里有对应条目，否则就是偷偷关掉断言。

---

## tetris 桌面端棋盘发虚（≥1920 宽）

**现象**：1920×1080 下棋盘被放大到 464 CSS px、2560×1440 下 480 px，
而 `<canvas id="tetris">` 的后端缓冲区始终是 `400×800`，等于被浏览器拉伸，边缘发虚。

**定位**：tetris 的 CSS 早已接入桌面纵向预算
（`css/tetris.css:110-113` 的 `--frame-ratio/-stage-h/-shell-max/-stage-cap`
+ `js/tetris.js:1457` 的 `bindFrame({ logicalWidth: 400 })`），
但渲染代码整份是按 `this.canvas.width` 的**像素坐标**直接作画的
（约 12 处，如 `js/tetris.js:1081` 的整屏填充、`:1042-1050` 的网格线、
`:995/1026` 的星空随机坐标），后端缓冲区一旦变大，这些读数全部跟着变，
逻辑坐标系会整体错位。

**修法**：把逻辑尺寸从 `canvas.width` 里剥出来（`LOGICAL_W=400 / LOGICAL_H=800` 常量），
再按 `js/needle-awn.js` / `js/sword-flight.js` 的既有形态用
`ctx.setTransform(s, 0, 0, s, 0, 0)`（⚠ 不是 `ctx.scale`，它是累乘的）缩放。
必须一并处理：`Tetris.gridCanvas` 离屏网格缓存（`js/tetris.js:684-685`），
以及 `#particleCanvas` / `#lineClearCanvas` 两层绝对定位的兄弟画布——
CLAUDE.md 记过它们与棋盘错位的事故，三层必须同步缩放。

**当前状态**：`scripts/verify-desktop-frame.mjs` 对 tetris 的「不糊」这一条降级为
⚠ 告警（每次运行都会打印），其余 6 条断言照常生效。其他页仍是硬失败。

**为什么不顺手修**：改动面横跨三层画布 + 离屏缓存，且只能靠肉眼验收，
应当自成一个 commit，而不是夹在注册表一致性修复里。

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

**连带项（仍待做）**：minesweeper / reversi / gomoku 三页主体为平铺结构
（无 `.game-main` 单一容器），升级 main 需引入新包裹层，有布局风险，
应独立成 commit 并逐页截图验收。index.html（落地页）与 tank-battle
（豁免页）的 main 升级同批处理。迁移工具 `scripts/p3-main-tag.mjs`
（标签深度配对替换 + 幂等 + --dry）可扩展复用。
