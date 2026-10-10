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
