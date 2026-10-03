# Architecture v2 收尾与 Legacy 清退执行计划

> 面向 Codex 的实施手册。  
> 基线：PR #43 `refactor: establish platform architecture v2` 的 head。  
> 本文描述 **Architecture v2 平台落地之后仍未完成的历史代码迁移**，不是重新设计平台。
>
> 核心原则：**先建立边界守卫，再迁移；用 architecture debt ratchet 保证历史债务只能下降不能反弹；小 PR、可回滚；默认跑 changed/targeted tests，只有候选 PR 才跑 full verify。**
>
> 与 CSS Cascade Layers 的关系：本计划优先执行。`docs/architecture-v2-css-layer-migration-plan-2026-09.md` 的 P0/P1 可提前做只读盘点，但在本文第 13 节 handoff gate 满足前，不进入会改变 cascade 语义的 CSS P2+。

---

## 0. 目标与完成定义

Architecture v2 的平台基础已经建立：

- `src/platform/`：共享运行时能力；
- `src/games/`：游戏专属模块；
- `src/generated/`：生成代码；
- `worker/`：Cloudflare Worker；
- `tests/`：自动发现的 contract / smoke tests；
- `tools/`：生成器、检查器、开发工具、归档迁移；
- `GameRuntime`、`GameStorage`、declarative i18n、标准 shell、registry schema 已可用于新游戏；
- 大多数现代游戏已使用 `GameRuntime`。

本计划完成时，应满足以下 **最终状态**：

1. **注册游戏入口默认全部位于 `src/games/<id>/index.js`**。
   - 只有明确记录的特殊架构可以例外。
   - 例外必须写在本文“长期例外”表中，并有对应测试/契约理由。
2. **游戏代码不得再通过 `js/analytics.js`、`js/game-chrome.js` 等兼容 shim 引入平台能力**。
   - 统一直接从 `src/platform/` 导入。
   - shim 在无调用者后删除。
3. **大型游戏入口只做 composition / bootstrap**。
   - 规则、状态、渲染、输入、UI、音频、数据分别进入模块。
   - 非数据/生成文件原则上不再出现 80 KB 以上单文件。
4. **GameStorage 成为游戏私有持久化的默认入口**。
   - 全局站点设置、玩家名、排行榜/每日服务数据不强行塞进 GameStorage。
5. **旧页面达到标准 shell 的结构契约**。
   - 不要求为了“统一”把 SEO/可访问性需要的静态 HTML 改成运行时字符串。
   - 标准页必须符合 shell/topbar/main/stage/sidebar/footer contract。
6. **i18n 新写法成为默认，旧 makeText 逐步收口**。
   - DOM 静态文案优先 declarative binder；
   - 大型动态文本表可保留表驱动，但不得复制平台公共文案。
7. **`scripts/` 不再承担“所有工具都往这里扔”的角色**。
   - 生成器 → `tools/generators/`
   - 静态检查 → `tools/checks/`
   - 开发诊断 → `tools/dev/`
   - 测试 runner/helper → `tests/lib/`
   - 一次性迁移 → `tools/archive/migrations/`
8. **Architecture v2 边界由机器检查锁定**，防止新代码退回旧结构。

---

## 1. 当前基线与优先级

PR #43 基线中，平台能力已经可用，但历史入口仍然偏大。

### 1.1 Architecture debt ratchet（迁移期必须启用）

Architecture v2 的最终规则不能等到“所有历史代码都迁完”才开始生效。迁移期间应建立一个
**只降不升的技术债务基线**：已有 legacy 可以暂时存在，但任何 PR 都不得新增同类债务。

建议新增机器可读基线，例如：

- `tests/architecture-v2-debt-baseline.json`
- `tests/verify-architecture-debt.mjs`（也可与 boundary verifier 合并）
- package script：`npm run architecture:report`

至少统计并输出：

| 指标 | 说明 | Gate |
|---|---|---|
| registry entry 仍位于 `js/` 的数量 | 尚未迁入 `src/games/<id>/index.js` | 只能下降 |
| platform shim consumer 数量 | JS import、HTML script、registry/generated/build/test 引用都计入 | 只能下降 |
| 游戏代码直接 `localStorage.*` 数量 | 不含明确的 global/protocol allowlist | 只能下降 |
| legacy shell 页面数量 | 尚未满足 standard/immersive/special contract | 只能下降 |
| active `scripts/` 工具引用数量 | package scripts / runtime / tests 仍使用旧工具路径 | 只能下降 |
| oversized composition entry 数量 | 用于发现拆分候选，不作为单独失败条件 | warning |

执行规则：

1. 第一次落地时记录**精确路径/调用点**，不要只记录一个总数；
2. 后续 PR 可以保持或减少既有债务，但不得新增新的 violation；
3. 某一类别降到 0 后立即切换为 strict-zero，不允许“重新抬高 baseline”；
4. 只有本文“长期例外”中的明确架构例外才能进入 allowlist，并写明原因与测试；
5. `architecture:report` 应同时输出“当前值 / 基线值 / 本 PR delta / top offenders”，让每个迁移 PR 都能说明自己消除了多少债务；
6. baseline 只允许**向下更新**；消除债务的同一个 PR 必须从基线删除对应条目，使基线与当前债务精确一致。保留已消除条目会导致检查失败，避免后续恢复旧债务时沿用豁免。若确需增加例外，必须单独 PR 并在 review 中解释，不能把 rebaseline 当作修测试的方法。

> 这套 ratchet 是迁移期的保护网；最终 Phase 9 结束后应切换为 strict architecture contract，而不是永久保留高额 baseline。

当前大文件优先级（约值，仅用于确定实施顺序）：

| 优先级 | 文件 | 当前规模 | 处理策略 |
|---|---|---:|---|
| P0 | `js/tower-defense.js` | ~135 KB | 首批拆分 |
| P0 | `js/sword-flight.js` | ~110 KB | 首批拆分 |
| P1 | `js/gravity-slingshot.js` | ~73 KB | 第二批拆分 |
| P1 | `js/bond-forge.js` | ~72 KB | 第二批拆分 |
| P1 | `js/needle-awn.js` | ~72 KB | 第二批拆分 |
| P2 | `src/games/silk-dew/runtime.js` | ~67 KB | Phase 3B 已迁；后续按需拆 renderer |
| P2 | `src/games/planet-merge/runtime.js` | ~66 KB | Phase 3B 已迁；后续按需拆 physics |
| P2 | `src/games/word-daily/runtime.js` | ~64 KB | Phase 3B 已迁；词库已独立 |
| P2 | `src/games/shadow-loom/runtime.js` | ~61 KB | Phase 3B 已迁；几何/渲染已独立 |
| P2 | `src/games/maxwell-demon/runtime.js` 等 | ~55–59 KB | 批量轻拆 |

目前已有 `src/games/` 包：

- `bond-forge`
- `needle-awn`
- `sword-flight`
- `tetris`
- `tower-defense`

但多数游戏的主入口仍位于 `js/`。

### 长期允许的架构例外

| 游戏 | 允许例外 | 原因 |
|---|---|---|
| Math Rain | 可保留自己内部的多模块系统组织方式 | 已有独立 core/systems/i18n 架构，强制改成普通单游戏模板收益低、风险高 |
| Tank Battle | 可保留专用横屏/全屏架构 | 控件、画布和布局与标准 shell 差异大 |

**注意：例外只表示“不强制采用同一内部模块形状”，不表示可以继续依赖旧平台 shim。**
只要使用平台服务，仍应直接导入 `src/platform/`。

---

# 2. Codex 执行总规则

Codex 每次开始一个阶段，都必须遵守以下规则。

## 2.1 禁止事项

- 不要一次重写多个游戏的玩法状态机。
- 不要把“重构”与“玩法调整 / 数值平衡 / 美术升级”混在同一个 PR。
- 不要为了减少文件数量，把平台代码复制回游戏目录。
- 不要新建第二套 storage / i18n / chrome / frame helper。
- 不要手改 `src/generated/`。
- 不要为了迁目录顺便改变 URL、DOM id、localStorage key、排行榜 key。
- 不要把现有静态 HTML 全部改成 JS 动态生成；SEO 与 accessibility 结构优先保持静态。
- 不要在普通开发 push 上增加新的 full-CI workflow。

## 2.2 兼容性要求

以下均视为公共兼容面：

- 游戏 URL（`*.html`）；
- registry `id/prefix/href`；
- 既有 leaderboard / daily key；
- 用户已有 localStorage 数据；
- smoke tests 使用的 `window.*Game` / debug hook；
- 现有 DOM id（除非单独 PR 明确迁移）；
- analytics game id；
- Service Worker / Worker 路径。

迁移过程中必须保持上述行为。

## 2.3 每个 PR 的最小验证

普通开发 PR / push：

```bash
npm run gen -- --check
npm run verify:changed
```

若只改一个游戏，优先再跑定向 smoke：

```bash
node tests/lib/run-smoke-one.mjs tests/smoke-<game>.mjs
```

涉及 build graph / registry entry / Vite input：

```bash
npm run build
npm run verify:changed
```

只有阶段候选 / 合并前：

```bash
npm run build
npm run verify
npx wrangler deploy --dry-run
```

CI 资源原则见 `docs/architecture-v2.md#ci-resource-policy`。

---

# 3. Phase 0 — 先锁死 Architecture v2 边界

**目标：在大规模迁移前，先让“退回旧结构”变成测试失败。**

建议 PR：

`refactor/architecture-v2-boundary-guards`

## 3.1 新增 architecture boundary verifier

新增：

`tests/verify-architecture-boundaries.mjs`

至少检查：

1. 新增的注册游戏 entry 必须满足：
   - 默认：`src/games/<id>/index.js`
   - 或出现在明确的 exception 表中。
2. `src/games/**` 不得 import：
   - `/js/game-chrome.js`
   - `/js/game-frame.js`
   - `/js/game-drawer.js`
   - `/js/site-settings.js`
   - `/js/safe-storage.js`
   - `/js/i18n.js`
   - `/js/analytics.js`
   - 以及其它已被 `src/platform` 接管的 shared shim。
3. 新代码不得在游戏模块里直接调用 `localStorage.*`。
   - 白名单：测试、首页用户 profile、平台 storage implementation。
4. `src/generated/**` 不应被普通源码直接编辑/重新导出到错误目录。
5. `worker/**` 不得 import 浏览器平台代码。
6. `tools/archive/**` 不得被 package scripts / runtime / tests 调用。
7. 新增 verify/smoke 文件无需手动登记，确保 auto-discovery 生效。
8. 对尚未迁完的历史 violation 使用第 1.1 节 debt baseline 做 ratchet；**新文件/新调用点不享受 grandfathering**。
9. verifier 必须能区分：
   - 既有 debt（允许保持或减少）；
   - 新增 debt（立即失败）；
   - documented exception（长期允许）。

## 3.2 更新过期文档路径

PR #43 后，部分文档仍可能引用旧路径，例如：

- `scripts/lib/registry.mjs`
- `scripts/gen-from-registry.mjs`
- `scripts/verify-*.mjs`
- 旧迁移脚本位置

统一更新为当前：

- `tools/lib/registry.mjs`
- `tools/generators/gen-from-registry.mjs`
- `tests/verify-*.mjs`
- `tools/archive/migrations/`

重点检查：

- `docs/contracts/registry.md`
- `docs/contracts/chrome.md`
- `docs/contracts/theme.md`
- `docs/contracts/layout.md`
- `docs/contracts/style.md`
- `CLAUDE.md`
- `README.md`

## 3.3 Architecture report

Phase 0 同时新增只读报告入口，例如：

```bash
npm run architecture:report
```

报告至少展示：

- 当前 debt counters；
- 相对 baseline 的 delta；
- 仍未迁移的 top offenders；
- strict-zero 已锁定的类别；
- allowlist/exception 及理由。

报告本身不替代 verifier；CI 由 verifier 判定“是否反弹”，report 用于 review 和阶段追踪。

## Phase 0 验收

- architecture verifier 被 auto-discovery 自动发现；
- debt ratchet 已生效，新增 legacy violation 会失败；
- `architecture:report` 可复现地输出当前债务与 delta；
- 不新增 workflow；
- `npm run verify:changed` 通过；
- 文档不再把 archived migration 写成日常操作。

---

# 4. Phase 1 — Tower Defense 大文件拆分

建议 **单独一个 PR**，不要与 Sword Flight 同 PR。

分支：

`refactor/tower-defense-modules`

目标目录：

```
src/games/tower-defense/
  index.js
  i18n.js                 # 已有
  config.js               # 常量 / shared configuration
  model/
    level-runtime.js
    entities.js
    wave-runtime.js
  systems/
    combat.js
    targeting.js
    economy.js
  render/
    scene-renderer.js
    hud-renderer.js
  input/
    pointer.js
    keyboard.js
  ui/
    overlays.js
    controls.js
  audio.js                # 如值得拆
```

**不要机械照目录名拆。按真实依赖图调整，但必须做到职责单向。**

## 4.1 拆分顺序

1. 先抽纯常量 / pure helpers；
2. 再抽无 DOM 的规则与计算；
3. 再抽 renderer；
4. 再抽输入；
5. 最后让 `index.js` 负责 composition / GameRuntime / debug hooks。

不要第一步就拆 class state，因为容易产生循环依赖。

## 4.2 必须保留

- `window.tdGame`
- 所有 `window.__TD_*` QA hooks
- existing `LEVELS`
- target priority / stack 语义
- immersive layout
- mobile landscape behavior
- existing smoke selectors

## 4.3 结构目标

- `src/games/tower-defense/index.js`：**目标** < 30 KB；超过目标只触发 warning，不单独判定重构失败；
- 单个非数据模块建议 < 45 KB，同样作为 review signal，不是机械 hard gate；
- 真正的 hard gate 是：entry 只负责 bootstrap/composition、规则/渲染/输入职责清晰、无循环依赖；
- 禁止出现 renderer → UI → model → renderer 循环依赖；
- `games.config.json.entry` 改为 `src/games/tower-defense/index.js`；
- `npm run gen` 更新 Vite input；
- 原 `js/tower-defense.js`：
  - 第一 PR 可保留一行 compatibility import；
  - 确认无消费者后在 Phase 5 删除。

## 4.4 测试

必须跑：

- `tests/smoke-tower-defense.mjs`
- TD level/difficulty/art 相关 verify
- `npm run verify:tower-defense-dist`
- `npm run build`
- `npm run verify:changed`

## Phase 1 退出条件

- build/smoke 行为不变；
- TD entry 已在 `src/games`；
- 主文件显著缩小；
- 无新 global mutable singleton；
- 无兼容 key 变化。

---

# 5. Phase 2 — Sword Flight 大文件拆分

分支：

`refactor/sword-flight-modules`

建议目录：

```
src/games/sword-flight/
  index.js
  i18n.js                 # 已有
  audio.js                # 已有
  config.js
  model/
    run-state.js
    realm.js
    daily.js
  systems/
    movement.js
    combat.js
    spawn.js
    scoring.js
  render/
    world.js
    effects.js
    hud.js
  input/
    keyboard.js
    touch.js
  ui/
    menus.js
    stage-select.js
```

## 5.1 特别注意

Sword Flight 当前类很大，但不要为了“类变小”把所有字段塞进一个巨型 `state.js`。

优先拆：

- stateless computation；
- spawn / collision helpers；
- rendering；
- input mapping；
- DOM-heavy menus。

保留：

- `window.game`
- `swordFlightChrome` 等现有测试/运行句柄需要的行为
- daily key 与 score semantics
- realm progression
- SFX public surface

## 5.2 目标

- registry entry → `src/games/sword-flight/index.js`
- 主 entry < 30 KB 为目标；超过目标只作为 warning，不能为了“达标”制造无意义文件切分
- hard gate：entry 只做 composition/bootstrap，模块依赖方向清楚，无循环依赖
- 已有 `i18n.js`、`audio.js` 不复制
- 任何新 shared helper 必须先判断是否属于 platform；游戏专属则留 game package

## 5.3 测试

- Sword Flight smoke / verify
- mobile touch regression
- desktop frame regression
- daily / score regression
- build + changed verify

---

# 6. Phase 3 — 第二梯队模块化

这一阶段拆成 **两个 PR**，不要一次迁十个游戏。

## PR 3A

`refactor/game-packages-wave-1`

优先：

- gravity-slingshot
- bond-forge
- needle-awn

目标：

- entry → `src/games/<id>/index.js`
- 复用已有 `bond-forge/i18n.js`、`needle-awn/{i18n,audio,effects}.js`
- 将纯规则 / renderer / input 从 root entry 中抽出
- GameRuntime 初始化留在 package index

特别要求：

- Gravity 的 solver / daily course 纯函数要单独模块化，保留 `window.__gravityDebug`
- Bond Forge 分子数据与运行时逻辑分离
- Needle Awn 不重复实现已有 audio/effects

## PR 3B–3E — remaining standard packages 分小批迁移

原先把十几款游戏放进一个 PR 的做法与“小 PR、可独立回滚”原则冲突。改为每个 PR **2–4 款游戏**；
如果其中某款在迁移时暴露出高耦合或需要玩法状态机调整，则立刻把它拆成单独 PR。

### PR 3B

`refactor/game-packages-wave-2a`

当前实现已完成四款的包边界迁移；合并前仍需完成候选分支的 review / build / browser smoke gate。

- silk-dew
- planet-merge
- word-daily
- shadow-loom

### PR 3C

`refactor/game-packages-wave-2b`

- maxwell-demon
- crystal-bloom
- flame-verse
- echo-cave

### PR 3D

`refactor/game-packages-wave-2c`

- ripple-duet
- hoop-shot
- carrot-pull
- lumen

### PR 3E

`refactor/game-packages-wave-2d`

- circuit
- tetris
- 执行时 inventory 新发现、且风险较低的剩余 standard package（最多补到 4 款）

这些批次以 **迁目录 + 轻拆** 为主，不要求每款都重新设计内部架构。

每款至少做到：

```
src/games/<id>/
  index.js
  ...existing special modules
```

若单文件仍 > 60–80 KB，将其列为拆分候选并优先抽 renderer/rules/input；文件大小本身只触发 warning。
**不要为了压缩 KB 数量而制造人工分片，依赖方向与职责边界优先。**

### 数据文件例外

大数据表可以大：

- word daily dictionary
- level tables
- generated assets

**数据文件大小不作为模块化失败。**

---

# 7. Phase 4 — 平台 shim 清退

分支：

`refactor/remove-platform-shims`

当前 `js/` 下若存在类似：

```js
export * from '../src/platform/foo.js';
```

它们只是 Architecture v2 过渡兼容层。

## 7.1 第一步：更新所有 import

把游戏代码中的：

```js
import { bindChrome } from './game-chrome.js';
```

改成对应的：

```js
import { bindChrome } from '../../platform/game-chrome.js';
```

或通过 package 内正确的相对路径 / alias。

建议原则：

- runtime browser source：直接相对 import；
- Vite-only authoring 如使用 alias，先确认测试静态服务器与浏览器原生 module path 能处理；
- **不要只为了好看引入依赖 Vite resolver、但源码静态服务器无法运行的 import。**

## 7.2 第二步：静态检查 0 consumer

删除 shim 前，不能只依赖人工 `git grep`。Architecture verifier 必须覆盖：

- ESM/static/dynamic import；
- HTML `<script src>`；
- registry 与 generated runtime references；
- package scripts / Vite / Worker build graph；
- tests / smoke / tooling 中仍会执行的引用。

`git grep` 仍可作为人工复核：

```bash
git grep "js/game-chrome"
git grep "./game-chrome.js"
...
```

只有 verifier 证明对应 shim **effective consumer = 0** 才允许删除。

## 7.3 第三步：删除 shim

候选删除：

- `js/analytics.js`
- `js/boot.js`
- `js/daily.js`
- `js/game-chrome.js`
- `js/game-drawer.js`
- `js/game-frame.js`
- `js/game-sfx.js`
- `js/i18n.js`
- `js/icons.js`
- `js/leaderboard.js`
- `js/more-games.js`（注意这是 registry generated data，需要先决定 canonical output）
- `js/player.js`
- `js/safe-storage.js`
- `js/site-settings.js`
- `js/theme.js`

### more-games 特例

如果 `src/platform/more-games.js` 已是 canonical generated output：

- gen 只写 `src/platform/more-games.js`
- 不再生成 `js/more-games.js`
- 所有 runtime import 指向 platform

## Phase 4 退出条件

- 平台 shim consumer = 0
- shims 删除
- architecture verifier 禁止重新引入
- build / quick / changed verify 全绿

---

# 8. Phase 5 — GameStorage 全面收敛

不要把所有游戏的持久化迁移塞进一个巨型 PR。先做 inventory，然后按 **2–4 款游戏/PR** 迁移；
任何包含复杂 legacy migration 或跨版本兼容的游戏应单独 PR。

Phase 5 的基线盘点与第一批迁移映射记录在
[`docs/architecture-v2-game-storage-inventory.md`](./architecture-v2-game-storage-inventory.md)。
第一批使用 `refactor/game-storage-migration-a`，包含 Carrot Pull、Hoop Shot、Bond Forge；
其 legacy key → GameStorage 回归测试与用法 guard 先于后续批次落地。
第二批使用 `refactor/game-storage-migration-b`，包含 Shadow Loom、Echo Cave、Maxwell Demon；
只迁游戏私有 progress / seen 状态，`ec_lb_*` / `md_lb_*` 等 leaderboard/Daily compatibility key 保持原协议。
第三批使用 `refactor/game-storage-migration-c`，包含 Crystal Bloom、Flame Verse、Ripple Duet；
继续只迁私有 progress，`cb_lb_*` / `fv_lb_*` / `rd_lb_*` 保持兼容协议。
第四批使用 `refactor/game-storage-migration-d`，包含 Circuit、Lumen；
只迁 `cc_stars` / `lm_stars`，Daily 与 local board compatibility key 保持原协议。
第五批使用 `refactor/game-storage-migration-e`，包含 Needle Awn、Sword Flight；
迁各自私有 progression/record slots，`zj_daily_*` / `sf_daily_*` 保持原协议。
第六批使用 `refactor/game-storage-migration-f`，单独迁 Planet Merge 的 skin / best / private local scores；
`pm_muted` 全局静音镜像与 `pm_daily_*` Daily key 保持原协议。
第七批使用 `refactor/game-storage-migration-g`，单独迁 Silk Dew progress；先保留并完成其既有
`sd_progress_version=2` 评分迁移事务，再写入 canonical GameStorage slot，`sd_lb_*` 保持原协议。
第八批使用 `refactor/game-storage-migration-h`，单独迁 Gravity Slingshot 的 `gd_stars`；
`gd_daily_*`、`gs_daily_*`、`gd_local_*` 与 `gd_course_*` 保持原协议。
Phase 9 包迁移后的复扫发现早期 inventory 漏掉了一批原先仍在 legacy 入口中的私有状态；
第九批使用 `refactor/game-storage-migration-i`，迁 Reversi、Minesweeper、Firefly Signal
的偏好/纪录/本地成绩。
第十批使用 `refactor/game-storage-migration-j`，单独迁 Tower Defense 的六关 clear/best、
全局 best 与 private local scores；远端 `tower-defense-<level>` leaderboard 协议保持不变。
Math Rain、Word Daily 的混合或跨模块状态继续拆成后续独立小批。

建议分支按批次命名：

- `refactor/game-storage-migration-a`
- `refactor/game-storage-migration-b`
- `refactor/game-storage-migration-c`
- `refactor/game-storage-migration-d`
- `refactor/game-storage-migration-e`
- ...

每批都必须有旧数据 fixture / migration regression，不允许等最后一批才补兼容测试。

## 8.1 先做 inventory

扫描所有游戏代码：

```
localStorage.
storageGet(
storageSet(
storageRemove(
```

分类：

### A. 必须继续走全局 platform setting

不要迁到 GameStorage：

- `site_lang`
- `site_theme`
- `site_muted`
- `player_name`
- 全局 profile

### B. 服务协议 key

谨慎处理，不直接改 key：

- leaderboard
- daily leaderboard
- analytics
- server/API contract

### C. 游戏私有状态

应迁到 GameStorage：

- best score cache
- stars/progression
- tutorial seen
- mode preference
- unlocked content
- per-game local settings

## 8.2 迁移策略

使用：

`createGameStorage({ id, version, legacy, migrations })`

要求：

1. 旧用户数据无损读取；
2. migration 幂等；
3. legacy key 不要第一版就删除；
4. 先读新 key；无新 key 时 migrate；
5. 至少跨一个版本 migration 有单测。

## 8.3 新增 verifier

建议：

`tests/verify-game-storage-usage.mjs`

规则：

- `src/games/**` 禁止 `localStorage.*`
- 游戏私有持久化不得直接使用 platform `storageSet('随机旧key')`
- global keys / protocol keys whitelist 写在 verifier 内并说明原因

## Phase 5 退出条件

- 游戏私有状态统一 GameStorage
- 旧存档 regression tests 通过
- 不改变 leaderboard/daily/global keys

---

# 9. Phase 6 — i18n 收敛

分支：

`refactor/declarative-i18n-migration`

这不是把所有翻译表重写一遍。

## 9.1 适合 declarative binder 的内容

优先迁：

- 静态按钮 label
- title
- aria-label
- placeholder
- tooltip
- 固定菜单文字
- 固定 overlay 文案

HTML 使用：

```html
data-i18n="..."
data-i18n-title="..."
data-i18n-label="..."
data-i18n-placeholder="..."
data-i18n-tooltip="..."
```

JS 使用 `createI18nBinder`。

## 9.2 暂时可保留 table-driven 的内容

- 动态复数 / 参数插值
- 运行时生成的大段说明
- 关卡数据中的双语名称
- canvas 文本
- 复杂状态文案

目标是消除 **重复 DOM 赋值和公共键复制**，不是为了追求一种语法。

## 9.3 迁移批次

先选择 3–5 个简单页面验证模式：

- minesweeper
- reversi
- tetris
- carrot-pull
- circuit

模式稳定后再推广。

## 9.4 验收

- language behavior 不变
- accessibility label 有覆盖
- verify-i18n 同时支持 legacy 与 declarative 的过渡期
- 最后一批 legacy 页面迁完后，再考虑删除 legacy-only verifier 分支

---

# 10. Phase 7 — HTML Shell 收敛

分支：

`refactor/legacy-shell-convergence`

**不要把所有静态 HTML 改成 JS 动态 render。**

目标是让旧页面满足标准结构，而不是让文件长得逐字一样。

## 10.1 Standard 页面

应具备：

- `.game-shell`
- `.game-topbar`
- `.game-main`
- `.game-stage`
- 可选 `.game-sidebar`
- `.game-footer`

并由现有 contract tests 验证。

## 10.2 Immersive 页面

继续使用 immersive contract：

- Tower Defense
- Firefly Signal
- 其它 registry layout=immersive 页面

## 10.3 特殊页

Math Rain / Tank Battle 可以保留专用 shell，但必须：

- 有语义主区域；
- 有可访问标题；
- 不引入第二套全站 navigation / settings 实现；
- architecture verifier 中明确 exception。

## 10.4 render-game-shell.js 的定位

`render-game-shell.js`：

- **新游戏 scaffold 默认使用**
- 测试 fixture 可使用
- 不强制 retroactively runtime-render 所有旧页面

这样避免 SEO / 首屏 / accessibility 回归。

---

# 11. Phase 8 — scripts/ 与 tools/ 最终清理

分支：

`chore/tooling-layout-cleanup`

目标目录：

```
tools/
  generators/
  checks/
  dev/
  lib/
  archive/
tests/
  lib/
```

## 11.1 迁移

将剩余：

- layout-metrics
- shots
- probe-*
- css dump
- icon generation
- theme-varize
- shadow-loom recut
- echo/ripple level builders

按用途迁到 `tools/dev` / `tools/generators` / `tools/checks`。

## 11.2 Python helpers

检查 `scripts/lib/*.py`：

- 如果只服务 archived migrations → 一起移入 archive；
- 如果仍被 active generator 使用 → 移入 `tools/lib/`。

## 11.3 删除重复 helper

目标：

- browser helper 单一 canonical implementation；
- registry helper 单一 canonical implementation；
- tests 可保留一行 re-export shim，但不要复制实现。

## 11.4 文档 / package scripts 同步

任何路径迁移必须同 commit 更新：

- package.json
- docs
- tests
- workflow
- comments 中的命令示例

---

# 12. Phase 9 — Legacy `js/` 清退完成

最终目标不是“删除整个 js 目录”，而是 **删除历史职责混杂**。

理想最终形态：

```
src/
  platform/
  games/
  generated/
worker/
tests/
tools/
public/
css/
```

`js/` 若仍存在，只允许明确的兼容/特殊内容，并应很小。

### 最终 registry entry 规则

- 默认：`src/games/<id>/index.js`
- Math Rain 可根据其最终结构使用 `src/games/math-rain/index.js`，内部继续保留 core/systems
- Tank Battle 同理可迁 package，但保留其专用 runtime/layout

**“特殊架构”不等于“永远留在 js 目录”。**

---

# 13. Architecture → CSS Cascade Layers handoff gate

`docs/architecture-v2-css-layer-migration-plan-2026-09.md` 的 P0/P1 盘点可以提前做，但只有以下条件全部满足，
才允许进入会改变 CSS cascade 语义的 P2+：

- [ ] Architecture boundary verifier + debt ratchet 已稳定运行；
- [ ] registry/game package 的主要 legacy 迁移完成，剩余项只有明确例外；
- [ ] platform shim consumer 为 0，或只剩有删除 issue/理由的临时例外；
- [ ] GameStorage/i18n/shell 的结构性迁移已完成到不会再大规模改 DOM/class contract 的状态；
- [ ] HTML shell convergence 已完成；
- [ ] 没有正在进行的大规模 shared DOM / class / layout 重构 PR；
- [ ] `shared-css-first` 仍被视为当前生产契约，并有 build/contract 测试保护；
- [ ] `npm run build`、Architecture v2 candidate CI、关键 smoke 全绿；
- [ ] CSS 方案 P0 的 computed-style / geometry baseline 已记录。

handoff 通过后，CSS layer 迁移期间进入一个临时 **layout freeze**：

- 可以继续做独立游戏逻辑、内容和不触及 shared cascade 的工作；
- 不并行进行 shell redesign、全站 class 重命名、共享布局重构；
- 必须修改共享 DOM/CSS contract 的工作单独排队，等 CSS migration 完成或显式协调。

这样可确保 CSS 回归出现时，原因集中在 cascade migration，而不是 DOM 与 cascade 同时变化。

---

# 14. 推荐 PR 顺序

Codex 不要做一个 200-file 超大 PR。按以下顺序：

1. **PR A — architecture boundary guards + debt ratchet + stale docs**
2. **PR B — Tower Defense modules**
3. **PR C — Sword Flight modules**
4. **PR D — Gravity / Bond Forge / Needle Awn packages**
5. **PR E — standard packages wave 2A（最多 4 款）**
6. **PR F — standard packages wave 2B（最多 4 款）**
7. **PR G — standard packages wave 2C（最多 4 款）**
8. **PR H — standard packages wave 2D（最多 4 款）**
9. **PR I — platform shim removal**
10. **PR J1/J2/... — GameStorage migration（每批 2–4 款；复杂迁移单独 PR）**
11. **PR K1/K2/... — declarative i18n migration（小批推广）**
12. **PR L — shell convergence**
13. **PR M — tooling layout cleanup**
14. **PR N — final legacy js cleanup / strict architecture lock**
15. **Handoff — 满足第 13 节 gate 后，再进入 CSS layer P2+**

每个 PR 都必须可独立回滚。

### 不要同时开启太多 PR

推荐最多：

- 1 个 active implementation PR
- 1 个等待 review 的 PR

避免 Codex 在多个分支重复碰同一入口造成 merge conflict。

---

# 15. Codex 每个 PR 的工作模板

Codex 开始工作前，先输出：

```
Scope
- ...

Files expected to move/change
- ...

Compatibility surfaces
- ...

Tests to run
- ...

Out of scope
- ...
```

完成后必须给：

```
Implemented
- ...

Compatibility preserved
- ...

Verification
- command: result

Remaining risks
- ...

Next recommended PR
- ...
```

---

# 16. Codex 任务提示词（可直接交接）

下面这段可直接作为 Codex 的总任务说明：

> 你正在完成 games 仓库的 Architecture v2 收尾迁移。  
> 先阅读 `docs/architecture-v2.md`、本文件、`docs/contracts/*` 和当前 `games.config.json`。  
> 不要重新设计 Architecture v2，也不要修改玩法/美术/数值。你的任务是把历史代码迁入已经建立的平台结构。
>
> 按本文 Phase 0 → Phase 9 顺序工作，每次只做一个明确 PR。先建立 architecture boundary guards，再迁移大文件和游戏 package，之后清退 platform shim，最后收敛 GameStorage/i18n/shell/tooling。
>
> 所有迁移必须保持 URL、DOM id、localStorage legacy data、leaderboard/daily key、debug hook 和已有 smoke tests 的兼容。  
> 任何一个游戏迁移时，先画出它的 import/dependency 边界；优先抽 pure helpers、rules、renderer、input，避免循环依赖。
>
> CI 资源有限。普通开发只跑 `npm run verify:changed` 和目标 smoke；不要新增 always-on full workflow。Full `npm run verify` 只在候选 PR/合并前运行。
>
> 如果发现本文计划与仓库真实代码冲突，以“保持现有行为 + Architecture v2 边界”为最高优先级；在 PR 描述中记录偏差，不要擅自扩大范围。

---

# 17. 最终验收清单

Architecture v2 legacy migration 只有在以下全部成立时才算真正完成：

- [ ] 所有非例外 registry entry 指向 `src/games/<id>/index.js`
- [ ] Math Rain / Tank Battle 的特殊结构有明确 contract 与测试
- [ ] 无游戏代码从旧 platform shim 导入
- [ ] platform shim 删除或只剩明确、临时且有删除日期/issue 的例外
- [ ] 游戏私有 persistence 不直接使用 localStorage
- [ ] GameStorage legacy migrations 有测试
- [ ] 大型入口已拆，composition entry 保持轻量
- [ ] standard 页面符合 shell contract
- [ ] i18n 静态 DOM 文案默认 declarative binding
- [ ] `scripts/` 不再是 active tooling 杂物目录
- [ ] docs 不再引用已移动/归档的脚本路径
- [ ] architecture boundary verifier 全绿
- [ ] architecture debt counters 已清零，或只剩文档化长期例外；无类别通过向上 rebaseline “解决”
- [ ] `architecture:report` 显示最终 strict-zero/allowlist 状态，且本阶段无 debt 反弹
- [ ] 第 13 节 Architecture → CSS handoff gate 满足
- [ ] `npm run gen -- --check` 通过
- [ ] `npm run build` 通过
- [ ] `npm run verify` 通过
- [ ] Tower Defense dist smoke 通过
- [ ] `wrangler deploy --dry-run` 通过
- [ ] 无 unresolved Copilot review comments
- [ ] main 合并后 Workers build 通过

完成这些后，Architecture v2 才从“平台已经建立”进入“历史代码也完成迁移”的最终状态。
