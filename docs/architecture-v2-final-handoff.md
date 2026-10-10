# Architecture v2 / CSS Layers 最终验收与维护交接

验收日期：2026-10-07。Architecture v2 Phase 0–9 与 CSS P0–P6 的本轮工作已完成，进入日常维护。
完成范围包含模块边界、旧入口/shim 清退、GameStorage/i18n/shell 收敛、CSS 行为契约和构建插件退役；
**不表示全部 CSS 已分层，也不表示所有游戏的主题、玩法或体验待办已完成。**

2026-10 后续 CSS 重复治理 W1–W6 已于 #128 完成，W7 收官审计由 [W7 报告](css-w7-final-closure-2026-10.md) 承接；原 #112 验收数据仍是历史快照，不得冒充当前普通规则数。

## 1. 可追溯的验收证据

| 项目 | 证据与结果 |
| --- | --- |
| P6 PR | [#112](https://github.com/mingzhangyang/games/pull/112)，2026-10-07 合并 |
| 最终受测 head | `f5a5a912dd4f143bd52c3556a24c9055546864e2` |
| main 合并提交 | `8b69adee46cc71216ddb1828f2c138f862a47cce` |
| 内容一致性 | 两个提交的 Git tree 均为 `3421e7533454dec4bfcef38686741e3bc8b9b888`，最终 CI 对应的代码与合并内容一致 |
| 完整 candidate | [Architecture v2 #341](https://github.com/mingzhangyang/games/actions/runs/37583907407)，success；生产 build、完整 verify、P6 dist gates、Worker dry-run 全部通过 |
| 最后一轮 review | [Copilot review](https://github.com/mingzhangyang/games/pull/112#pullrequestreview-5438818931)：Findings: None；当时仍等待 CI，随后 #341 成功 |
| 合并后构建 | [Workers Builds: games](https://github.com/mingzhangyang/games/runs/112676991553)，success；构建版本 `e3a0e70f-5091-4f14-bda2-fd3d452f3a1a` |

构建成功与线上交互是两种证据，不能相互替代。2026-10-07 的线上抽查通过云端 Chrome 完成，
桌面视口宽 1363 CSS px；首页已加载的 9 个 `script[src]` / `link[href]` 资源路径均匹配从合并提交生成的本地 dist。
这证明抽查资源与受测构建一致；站点没有暴露 commit/version 标记，不能仅凭页面宣布所有边缘节点均已部署该 SHA。

| 线上页面 | 实际操作与观察 |
| --- | --- |
| 首页 | 英文→中文切换；深色→浅色，根主题为 light、背景为 `rgb(236, 238, 243)`；无横向溢出 |
| Word Daily | 难度菜单真实点击展开并显示 4/5/6 字母选项；浅色主题生效，无横向溢出 |
| Tetris | 真实点击开始、暂停，暂停按钮变为“继续”；主画布比例 1:2，无横向溢出 |
| Tower Defense | 真实点击“出击”；战术统计面板打开/关闭，`aria-expanded` 随之切换；画布 800×600，无横向溢出 |

抽查后恢复首页英文与深色。线上抽查不是全游戏通关或移动端实机验收；移动视口、drawer、
frame-budget、immersive、主题与其他游戏的系统性回归证据来自 #341 的源码态和 dist 门禁。
本次容器本地 Chrome 启动被 socket 权限限制，未把本地 browser gate 记为通过。

## 2. 保留下来的边界和兼容债务

在合并提交重新运行 `npm run architecture:report`：11 类 strict-zero 均为 0，
`oversized-composition-entries` 为 0。Math Rain 与 Tank Battle 保留已登记的专用 shell，
继续受 architecture verifier、游戏专项测试和 CSS P3-E 约束。

重新运行 CSS debt/P6 config 检查得到：

| P5 历史冻结项 | 数量 |
| --- | ---: |
| 静态 ordinary rules / 其中未分层 | 2912 / 2703 |
| runtime ordinary rules / 其中未分层 | 15 / 15 |
| 未分层 runtime keyframes | 3 |
| inline style blocks / rules / attributes | 1 / 6 / 14 |

P5 数值是插件退役前的**历史证据**，不是阻止后续合法分层减债的固定当前值。精确身份始终以
immutable P0 减 append-only migration ledger 为准；`verify-css-debt.mjs` 只允许
`staticUnlayeredRules` 保持或下降，并继续逐条验证当前 debt 恰好等于“P0 − 已登记 migrations”。
`staticOrdinaryRules` 总数仍精确锁定 2912，避免误删已分层规则或静默新增规则；未来如需 P5 后
retirement，必须另行扩展并审查守卫。runtime stylesheet 与 inline style 尚无减债 contract，
对应 P5 数量同样保持精确锁定。

2026-10-07 的 focused priority closure 在只读审计后迁移 24 条 dependency-closed 静态规则：
共享 start-menu / overlay contract、移动 icon-button 响应式 peer，以及为保持结构优先级必须
同步进入 `pages` / `contracts` 的 Needle Awn、Science Showcase 三页、Firefly Signal 与
Tower Defense peers。静态 ordinary rules 仍为 2912，未分层降为 **2679**；`layout.css`
共享未分层规则由 16 条降为 **5 条**（`.sr-only` + drawer handle/head/body/scrollbar）。
后五条没有发现跨组件几何竞争，本轮明确保留；Theme token 与页面独有 skin 也不为清零而迁移。

未来批次仍须列出 source→destination、完整 selector/property 依赖、预期计数变化及行为证据；
P0、P5 历史快照与已合并 ledger 均不得重写，不得通过上调 baseline 掩盖新增 debt。
keyframe/runtime-style ownership 迁移仍需先建立专门契约，不能套用普通静态 rule 的迁移事务。

## 3. 日常开发入口

迁移期间的临时 layout freeze 在 P6 验收后结束。游戏功能/内容/体验开发可以继续；
共享 DOM/CSS 改动保持独立 PR，避免把多个无关依赖族与玩法变化混在一起。

| 改动 | 维护要求 |
| --- | --- |
| 游戏逻辑和内容 | 在 `src/games/<id>/` 内开发，先跑 changed 与专项 smoke；保留 URL、DOM id、存储/每日/排行榜协议与 debug hooks |
| 平台能力 | 复用 `src/platform/` 的 Runtime、Storage、i18n、chrome/frame/drawer；守住 strict-zero，不复活旧 shim |
| registry 与生成文件 | 编辑 `games.config.json` 后运行 gen；禁止手改生成段 |
| shared CSS / DOM / layer ownership | 先查 layout/chrome/theme 契约，按完整依赖族评审，并验证源码态与真实 dist 的几何和交互 |
| Vite/Rollup 构建图 | P6 守卫锁定顶层 legacy plugin graph，并要求 Rollup input/output 插件为空；合法新增插件也必须显式评审契约，不能改名绕过 |
| 剩余未分层 CSS | 只在明确收益和完整行为证据下开独立 migration transaction；本轮不要求继续逐 selector 拆 PR |

日常验证：

```bash
npm run gen -- --check
npm run verify:changed
npm run architecture:report
```

CSS 改动的定向验证：

```bash
node tests/verify-css-debt.mjs
node tests/verify-css-p6-config.mjs
# 源码态服务器运行后，选择受影响批次；不要以零页面 skip 充当通过。
VERIFY_PAGES=index,word-daily node tests/verify-css-p3a.mjs http://127.0.0.1:8899
```

PR candidate 的权威完整流程保留在 `.github/workflows/architecture-v2.yml`：

```bash
npm run build
npm run verify -- --jobs=2
node tests/lib/run-css-p4-dist-gates.mjs
npx wrangler deploy --dry-run --outdir .wrangler-dry-run
```

`run-css-p4-dist-gates.mjs` 的历史文件名保持不变；P6 后它验证单次真实生产构建，
不是重新启用 canary。开发阶段集中修改、定向验证、集中推送；候选 PR 复用现有完整 workflow，
不增加 always-on CI。最终通过证据必须对应最新受审提交。

## 4. 回归与回滚

若出现新增溢出、不可点击控件、drawer 锁定/恢复异常、画布比例或清晰度回归、主题失效，
先在源码态与 dist 复现并定位引入提交，再回滚该批次。不要用新增 `!important`、link sorter
或绕过 verifier 的 baseline 修改掩盖问题。

仅当确认是 #112 的插件退役引入回归时，才通过独立 PR 整体回滚 #112；历史插件与验证路径
随该回滚恢复，而不是在当前 P6 构建上局部接回插件或建立永久双路径。重新上线前重跑受影响行为
和完整 candidate。未来的普通 CSS 回归应回滚实际引入它的后续改动。

## 5. 本次交接验证范围

本交接 PR 只更新文档。已本地通过：gen check、architecture report、architecture v2 / boundaries、
CSS debt、P6 config、production build；#341 提供相同代码树的完整 browser/Worker 验收。
本 PR 自己的 CI 状态以 PR checks 为准，不把 #341 冒充为新文档提交的 CI。
