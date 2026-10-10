# W7 — CSS 治理收官审计与视觉契约验收

> PR #129（从 2026-10-10 合并后的 `main@544e2b5a` 开始）。本轮为**只读 CSS 审计 + 机器收官守卫 + 验收证据整理**；没有修改生产 CSS、游戏逻辑、P0/P5 快照或历史迁移事务。PR #129 自身 CI、Copilot 与人工截图核验以实际结果为准，不能用 #128 的通过代替。

## 1. 可信基线与完成范围

- 已完成：Architecture v2 Phase 0–9、CSS P0–P6、CSS 去重路线图 W1–W6；W6a = PR #127，W6b = PR #128。
- 初始 2,912 条 static ordinary CSS rules → **2,417**（净 −495，约 −17%）。这不等于未分层 CSS 全部清零。
- 当前 2,417 条分类互斥：**174 exact / 30 structural / 2,213 intentional-local**；族数为 **56 exact / 11 structural**。审计 digest：`41255179af1590af2d6dbde645eece5d354b8c3d4100a7c70b23375f5401c977`。
- #128 CI 的 CSS debt guard 报告：**2,151 条静态普通规则仍未分层**（另有 15 条 runtime ordinary rules 未分层），这是已记录/受守卫保护的现状，不是新出现的回归。
- 注册表当前有 **25 个游戏**；P0 HTML 激活清单为 **27 个文件**（含首页与 `public/404.html`）。`tests/verify-css-w7-closure.mjs` 以注册表动态对账，禁止漏页被当成通过。
- 上述统计来自 #128 的完整 CI 运行日志及当时 `tests/css-duplication-audit-contract.json`；[#128 成功运行记录](https://github.com/mingzhangyang/games/actions/runs/38035365466)。这证明被继承的基线通过过，并非 #129 的新验收。

## 2. 剩余重复的有证据裁决

“重复规则”是**审计候选**，不等于“安全可删除副本”。下面是当前全部达到**至少 15 个潜在可删声明副本**门槛的跨文件族（机器输出中 `removableDeclarationCopies` 为静态估计，结构族可能与 exact 族重叠；不能简单求和）。

| 审计族 | 影响 | 潜在收益 | W7 决议 |
| --- | --- | --- | --- |
| `.game-hud-level`（structural） | cc/cb/ec/fv/lm/md/rd/sd，8 页 | 7 条规则 / 42 个声明副本 | **下一批候选**：字号、字重、字距、等宽数字可共享；文字主题色仍本地 |
| `.game-toast`（structural） | cb/ec/fv/md/rd，5 页 | 4 条规则 / 36 个声明副本 | **下一批候选**：只能审查 opt-in toast 子族；动画、淡入淡出、颜色和换行仍按语义分别处理 |
| `.game-shell`（exact） | cb/fv/md/rd，4 页 | 3 条规则 / 24 个声明副本 | **保留**：实际是每个页面的 `--frame-*` 参数块，当前相同不代表共享默认应改变 |
| `.game-lang-btn`（exact） | cc/gd/lm/ms/rv/sd，6 页 | 5 条规则 / 15 个声明副本 | **暂缓**：已有 `game-icon-btn--wide` 拥有宽度/不换行；统一字号之前需要核对所有语言钮的使用语义 |

对应准确 group id、成员 CSS 路径及理由见 `tests/css-w7-reviewed-families.json`，新守卫会校验身份、页面覆盖和裁决是否漂移。

其他重点残余（未过高收益门槛）：

- `.game-action-row` 手机样式：3 页、12 声明副本；须先辨别玩法操作行 vs 标准 `game-action-row`，不可因归一化名字相同直接替换。
- `.game-username` / `.game-lb`：各 5 页、8 声明副本；现有 `leaderboard-v2` 已规定**共享几何、页面保留 palette**，不能为减少重复颜色而破坏归属。
- `.game-chip-stars` / `.game-card-title`：6 页、5 声明副本，几乎只是相同主题色；现有 W4/W5 结构迁移后保持局部配色是有意的。
- Reduced-motion 的 `*, *::before, *::after` 重复：3 页、8 声明副本，但作用域与各页架构、动效范围有关，应保留现行可访问性覆盖，不按名字合并。
- `.game-action-btn.is-broke` / `.is-dimmed` 是科学游戏**玩法专用按钮状态**，不是全站标准 action surface；归一化误判不产生迁移权。

## 3. 全站回归覆盖：继承证据与 #129 闸门

遵守“动态 registry 为唯一覆盖清单；遇到不支持的能力写明例外，不制造全量笛卡尔积”：

| 现有自动校验 | 验收点 |
| --- | --- |
| `verify-css-live-activation` | 27 个 HTML × 2 profiles 的真实样式来源、DOM/CSSOM 动态激活 |
| `verify-chrome`、`verify-immersive` | Header / Footer、标准及沉浸布局、页面错误与交互 |
| `verify-desktop-frame` | 17 个 `frame-budget` 页面 × 5 个桌面视口 × 2 语言；桌面滚动、画幅与 Canvas 像素采样变成硬失败 |
| `verify-theme` | 首页与全部注册游戏的主题能力、启动脚本顺序、实际明暗对比度/画布主题 |
| `verify-start-menus` / `verify-sidebar-family` | 九页菜单与十页侧栏四档视口的计算样式和动态节点 |
| `verify-leaderboard-layout` | 15 页两档视口的同一 `game-lb-*` 几何契约 |
| `verify-button-icons`、`verify-stats-drawer` | 结果按钮（包括 Tetris/Minesweeper）及抽屉真实 DOM/行为，特殊游戏按专项用例覆盖 |
| `verify-tetris-canvas-resolution` | 320/390、1280/1920/2560、DPR 1/2，四层 Canvas 同步、暂停和 resize/DPR 状态不变 |
| `run-css-p4-dist-gates` / Worker dry-run | 生产打包后源码/产物 CSS 行为契约与部署构建一致 |

**证据范围**：上表测试在 #128 候选 CI 成功执行；#129 要再次以**最新 head** 完成 build、full verify、生产 dist gates、Worker dry-run。人工视觉检查至少抽样移动 390×844、桌面 1280×900、宽屏 1920×1080，以及支持的明暗/中英组合；对开始/结算/抽屉/可点击控件进行真实状态截图复核。**现有自动化不能冒充已进行人工截图审阅。**

## 4. W7 新增防回归守卫

`tests/verify-css-w7-closure.mjs` 是一个离线、自动发现的 verify step：

1. 根据实时 PostCSS duplication audit **重新计算**所有达到 15 声明副本的候选；`tests/css-w7-reviewed-families.json` 必须恰好覆盖它们，路径、族 ID、类别、收益和审计 digest 都不得漂移。
2. 用 `games.config.json` 与完整 P0 HTML 清单做双向登记检查。新增游戏如果没有进入样式激活清单，必须失败，而不是被忽略。
3. **复用 `verify-all.mjs` 的 `discover()`** 遍历全部活动 verifier（包括 `fg-audit.mjs`、`placeholder-leak-check.mjs`）；扫描 `knownGaps` / `knownGap` 赋值，对每个自动发现条目进行反向注入。若以后确实需要降级，须先独立审查、登记 backlog 并明确修改守卫。
4. **复用 CSS 契约的 PostCSS 解析器**检查 `layout.css` 所有包含 `.game-toast` 的规则，包括媒体/层、组合选择器与状态规则；不准设置 `white-space`。反向测试覆盖后续覆盖规则、selector list 与近似类名。过去共享 toast 曾强制不换行、破坏 Planet Merge/Word Daily 等提示。
5. 对遗漏族、伪造路径、错误 digest 运行反向变异断言，保证护栏确实会失败。

这份 W7 决议表属于**可审查的后续维护登记**，不属于 immutable P0/P5/历史 migration ledger；未来合法 CSS 事务如改变候选族，必须在同一 PR 重新审计、解释决议变化，不能通过抬高阈值掩盖。

## 5. 结束条件与后续

- W1–W6 的任务已结清；#128 的 Tetris 已从 `knownGap` 升为硬校验，没有需要 W7 继续修复的已登记视觉缺口。
- **W7 不修改生产 CSS。** 不再以 CSS 总条数、未分层计数或零重复为目标。仅当经计算样式、页面语义与回归验证证明收益显著时，才考虑可选 PR #130，首选完整 `hud-level` 家族，其次是 toast opt-in 家族；各家族按完整依赖闭合，不混入玩法、存档、主题设计。
- 若评估不足以证明收益，就在 #129 合并及必要人工复核完成后**结束 CSS 专项治理**，返回 Mobile UX、运行时性能及游戏体验开发。
- Planet Merge Daily Challenge 按钮形态、部分仅深色游戏是否新增浅色主题是**产品设计决策**，不是 CSS contract 未完成的缺陷。
- `docs/backlog.md` 原本记录的 npm install 与 Vite build 并发竞态及禁止并发的规约继续有效；本次没有安装/构建重叠，也不为其增加 CSS 例外。

复核命令：

~~~sh
node tests/verify-css-duplication.mjs --json
node tests/verify-css-w7-closure.mjs
node tests/verify-css-debt.mjs
npm run build
npm run verify -- --jobs=2
node tests/lib/run-css-p4-dist-gates.mjs
npx wrangler deploy --dry-run --outdir .wrangler-dry-run
~~~

