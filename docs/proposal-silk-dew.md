# 新游戏提案：垂丝引露 Silkfall

> 状态：**已实现**（机制在 M1 实测后被替换，见 §2.1.1） · 2026-09-21
> 一句话：拖动丝线顶端的锚结，牵引一颗露珠穿过夜庭、借风借泡、坠入玉壶的绳索物理解谜。
> 英文名 **Silkfall**，中文名 **垂丝引露**，id `silk-dew`，prefix `sd`。

---

## 1. 为什么是它

| 维度 | 论证 |
| --- | --- |
| 物理谱系补位 | 全站物理已有：弹道（投篮）、引力（弹弓）、圆体碰撞合并（星球合成）、飞行气动（御剑）、光（折光）、电（电路）。**绳索-摆动（verlet 绳）是唯一空白**，与现有游戏零玩法重叠 |
| 主题延续 | 蚕丝 / 露珠 / 玉壶 / 星芒的东方夜庭意象，与「针尖对麦芒」「御剑飞行」一脉相承；dark neon 底上表现力强 |
| 技术已验证 | 引力弹弓的固定 substep 积分、折光/电路的「20 关 + 每日 + asc 榜」骨架、抽屉/顶栏/舞台预算三契约全部现成 |
| 交互契合 | 单指拖拽 = 触屏优先，正好落进移动端抽屉契约；桌面鼠标同样一套操作 |

备选概念（已否）：**磁引**（磁场滚珠，磁极摆放 UI 复杂、教学成本高）；**谐振**（波形匹配，过于抽象、反馈弱）。

---

## 2. 玩法设计

### 2.1 核心循环

观察丝线与露珠的相对位置 → 按住**锚结**做一次有限行程牵拉 → 在合适位置松手、重新抓取，逐段规划路线 → 途中收集星芒、避开荆棘并利用气泡/气旋 → 送入玉壶。**每一次按下—松开算 1 次牵拉**，三星要求收齐星芒且不超过 par。

### 2.1.1 ⚠️ 机制变更记录（M1 实测证伪 → 替换）

原设计为「剪断蚕丝，露珠荡起摆弧后飞入玉壶」。实现后在真实物理下实测：

| 指标 | 实测值 | 设计期望 |
| --- | --- | --- |
| 摆动弧最大横向跨度 | **53 px** | ≥ 200 px |
| 剪断后落点散布 | **47 px** | 覆盖壶口 ±44 px 的可控范围 |
| 玉壶壶口宽度 | 88 px | — |

露珠被绳的末端约束死，**根本没有可用的摆幅**——落点散布（47 px）小于壶口（88 px），意味着任何一刀都几乎必然命中，**没有解谜空间**。另经 4 轮调参（kick 0.15→1.9、壶口 88→96、风 ×0.5→×6、动量继承）仍无法救回；且 S5/S8/S12/S13/S15/S16/S19 在全部 4 轮参数下**均不可解**，风 ×6 甚至零效果（风区与轨迹完全不重叠）。

**结论**：改为拖动锚结「牵拉」机制。实测同一关卡下露珠横向可达 **x 40→471 = 431 px**（旧机制 47 px 的 **9 倍**），纵向亦完全可控，绳索长度直接决定下探深度。该机制下 20/20 关满星可解。

### 2.2 元素表（8 种）

| 元素 | 物理行为 | 视觉 | 首次出现 |
| --- | --- | --- | --- |
| 锚结 anchor | 绳端点，**唯一可拖对象**；视觉半径 14、触控热区 24；每次牵拉有 `pullMax` 行程 | 金色小环 + 牵拉半径提示 | 第 1 关 |
| 蚕丝 silk | verlet 绳，17–21 粒 × 10 px，索引 0 = 锚结 | 米白丝线，微光 | 第 1 关 |
| 露珠 pearl | 主角，重质粒子，半径 9，被绳末端约束 | 青白露珠 + 拖尾 | 第 1 关 |
| 星芒 star | 触碰收集，感应半径 16 | 金色四芒星，五声音阶音 | 第 1 关 |
| 玉壶 vessel | 目标；壶口漏斗形捕获区（高 44，内收 2） | 玉色壶，归壶涟漪 | 第 1 关 |
| 荆棘 thorn | 危险，触即败 | 锈红棘刺 | 第 4 关 |
| 气旋 breeze | 区域恒力场（方向/强度可配） | 青色虚线流纹 | 第 6 关 |
| 气泡 bubble | 区域浮力，露珠入泡上浮；点泡即破 | 半透明青泡 | 第 9 关 |

### 2.3 计分与榜单

- **每关**：星芒 1–2 + 本关**牵拉次数**。三星 = 收齐全部星芒且 `drags <= par`；收齐但超 par，或少 1 枚星但仍在 par 内 = 二星；其余成功入壶 = 一星。星芒因此是路线目标，不再只是装饰收集物。
- **战役榜**（all-time，asc）：全 20 关「最佳牵拉次数」之和，20 关全部通关后才提交。类比高尔夫——越少越好。
- **每日榜**（asc，键 `silk-dew-d<YYYYMMDD>`，`dailyTtlDays: 0`）：每日 5 关（`js/daily.js` UTC+8 种子，FNV-1a + mulberry32 洗牌从 20 关池抽 5 关，按 par 升序）。每日成绩按 **5 个关卡槽位**记录，每次重试只覆盖当前关槽位，`stars/totalDrags` 都从这 5 个槽位重新汇总，绝不按“通关事件”累加。**5 关当前结果必须全部三星才获得榜单资格**，合格者再按总牵拉次数升序比较；这样既不会奖励“跳过星芒换低牵拉”的捷径，也不会因同一关反复通关把星数叠到 15。计分仍是离散次数，与帧时序无关。
- 每关带**设计师 par**（目标牵拉次数），HUD 显示 `牵拉 2 / par 3` 作自我参照，不进榜。

### 2.4 模式

1. **闯关**：20 手工关，进度存 `sd_progress`（`safe-storage`，每关 `{stars, bestDrags}`）。 新评分上线时用 `sd_progress_version = 2` 迁移旧版成绩：已通关关卡保留为 1 星，旧 `bestDrags` 清零；2/3 星与最佳牵拉必须在新版有限行程规则下重新取得。所有 v2 保存都遵循“先写并读回确认 payload，再更新版本标记”的顺序，避免部分写失败留下错误版本状态。
2. **每日挑战**：当天 5 关，完成标记 `sd_daily_<YYYYMMDD>`。
3. **自由重玩**：已通关卡随时回放刷次数，不产生新榜单提交。

### 2.5 关卡设计纪律（硬约束）

关卡表以脚本生成初稿，再按真实求解日志人工调优，并由 verifier 逐关锁定。新版难度纪律：

1. **par 内满星可解**：验证器把最终路线拆成多次有限行程牵拉，必须能在本关 par 内收齐全部星芒并入壶。
2. **S5–S20 禁止一拉满星**：中后期必须至少松手再抓一次，`par` 不再只是显示数字；`pullMax` 随章节逐步收紧。
3. **星芒必须落在「渐进牵拉路径」上，两两间距 ≥ 70 px**。
   > 踩过的坑：早期验证脚本把指针**瞬移**到目标位，露珠因此跳过整条路径上所有星芒，
   > 造成「赢了却没吃星」的**假可解**——20 关里有 5 关（S3/S13/S17/S18/S19）是假绿的。
   > 真实玩家不可能瞬移指针，验证必须按帧渐进移动指针；新版每段牵拉约 0.65 s 走完全程。
4. **宽容度健康**：40 px 网格扫描中，S1–S4 至少保留 1 个、S5–S20 至少保留 **2 个 par 内满星目标位**。新版困难来自有限牵拉次数、路线顺序与场景力，而不是把唯一可行点缩到几像素。

验证器 `tests/verify-silk-dew-levels.mjs` 锁定：par 内满星可解、目标位宽容度、章节最低满星牵拉数（S1=1、S2–S8=2、S9–S13=3、S14=2 的窄容错气泡精度关、S15–S16=3、S17–S19=4、S20=5）、S5 起无一拉满星解、par 不回退、星级语义、禁止直接拖露珠、物理确定性、失败路径与 730 天每日确定性。`pullMax` 允许按具体风场/障碍局部回调，难度以真实最少满星牵拉数为准。

### 2.6 静止悬空判负

露珠停住不动且不在拖拽中，持续 `restFailSec = 4.0 s` 判负，消灭「松开手干等」的僵局。

> 判据用的是**位置漂移窗口**（`restFailDrift = 6 px`）而非瞬时速度阈值：
> 露珠在绳上自然摆荡时会反复经过速度零点，单帧速度阈值会让它在摆荡途中被误判为「静止」。
> 早期版本用速度阈值 + 2.5 s，导致长绳自然垂落也能被判负（实测在 y=417 处误杀）。

---

## 3. 物理规范

> 当前常量集中在 `src/games/silk-dew/model/levels.js` 的 `PHYS`，单一来源。

- **积分**：verlet `p += (p − prev) × damp + a × dt²`；固定 `dt = 1/120s` 子步 + 帧累积器（上限 `maxSub = 4` 子步/帧），与引力弹弓同一模式。
- **绳**：距离约束 + 每子步 `iters = 4` 次松弛迭代，粒距 `seg = 10 px`；索引 0 = 锚结（可拖拽），末端系露珠。`ropeDamp = 0.996`。
- **牵拉**：仅锚结可抓取；视觉半径 `anchorR = 14`，触控热区 `anchorHitR = 24`。每次抓取记录实时锚点为原点，指针目标被限制在本关 `pullMax` 半径内；松手后才能从新的锚点位置开始下一次牵拉。锚点以 `anchorFollow = 0.45` 追目标，单子步位移上限 `dragMaxSpeed = 2400 px/s`。露珠不可直接拖动。
- **露珠**：重力 `g = 1500`、阻尼 `pearlDamp = 0.998`、半径 `pearlR = 9`；气泡区浮力 `buoyancy = −1200`；气旋区叠加恒定加速度。
- **气旋**：矩形力场，字段 `{x, y, w, h, ax, ay}`；`ax/ay` 为方向分量（可为负），场上恒定叠加。
- **碰撞**：圆-圆（星芒 `grazeR = 16` / 荆棘 / 泡），圆-线段（壶口漏斗壁，壶口高 `vesselH = 44`、内收 `vesselInset = 2`），出界（`outY = 680`）判失败。
- **静止判负**：见 §2.6（位置漂移窗口，`restFailSec = 4.0` / `restFailDrift = 6`）。
- **确定性口径**：`simulate()` 对同一 `(spec, script)` 序列结果逐位一致（校验器锁定）；榜单公平性由「计分=牵拉次数」兜底，不承诺跨设备逐帧一致。

### 3.1 校验器口径（重要）

`tests/verify-silk-dew-levels.mjs` 用 **40 px 网格**扫描最终锚点目标，并把通往该目标的路径按本关 `pullMax` 自动拆成多次真实牵拉；每段指针按帧渐进移动。报告同时记录 par 内可解位、满星位、最少满星牵拉数与一拉满星位。

---

## 4. 样式设计（mockup 见对话内嵌图）

- **舞台**：480×640 逻辑坐标（与引力弹弓同规格，`frame-budget` 契约直接套用），全 Canvas 程序绘制、零贴图。
- **美术基调**：墨绿→藏青夜庭渐变 + 月晕 + 远山剪影；露珠青白、星芒金黄、荆棘锈红、玉壶玉青。
- **色板**：丝 `#e9e4d0` · 露 `#40d8ff→#dffcff` · 星 `#ffd34d` · 荆棘 `#ff6b7a` · 玉壶 `#58c9a0→#1f6f57`。CSS 里凡命中 11 个映射值一律 `var(--tok-*)`（p3-token-swap 扫 `css/`）；canvas 绘制层 JS 字面量不属扫描域，与现页口径一致。页面专属美术渐变按契约豁免收编。
- **UI 骨架**：`game-topbar` 中槽 = 关名 + `牵拉 n / par m` HUD；桌面 `.game-sidebar` 三卡（本关 / 每日 / 榜单），移动端换 `game-drawer` 底部抽屉；`themeColor #0a1712`。
- **音效**：星芒按宫商角徵羽五声音阶点音（与御剑飞行听觉血缘），归壶一记玉磬；走 `createSfxEngine`，尊重 `site_muted`。
- **动效**：锚结拖拽时的丝线张力微光、归壶涟漪、星芒点亮 pop。
- **按钮**：全部 `ICONS.*` + `game-btn`，零 emoji 按钮；开始菜单模式瓦片允许描述性 emoji（契约例外 d）。

> ⚠️ **选关芯片配色坑**：`.sd-level-chip` 初版写 `color: inherit`，从浅色开始覆盖层继承到黑色文字，芯片落在深色夜庭底上 ⇒ 关卡数字肉眼不可见，`fg-audit` 报「纯黑 20 处」。必须显式 `color: var(--tok-text, #e9f5ee)`，星芒行显式 `#ffd34d`。
> 教训：**继承来的文字色在跨背景复用组件里不可信**，凡组件会同时落在亮/暗两种表面上，颜色必须显式声明。

---

## 5. 架构与文件清单

### 5.1 新增文件

| 文件 | 职责 |
| --- | --- |
| `silk-dew.html` | 页面骨架：tokens→layout→silk-dew→more-games 引入序；`game-*` 类；三槽位顶栏；侧栏三卡；抽屉骨架置于 `.game-shell` 之外 |
| `css/silk-dew.css` | 页面样式：只覆盖 `--frame-*` 与页面美术 |
| `src/games/silk-dew/runtime.js` | 运行时：物理引擎、渲染、交互、模式编排 |
| `src/games/silk-dew/model/levels.js` | 20 关数据 + `PHYS` 常量 + 物理内核（`createWorld`/`stepWorld`/`beginDrag`/`moveDrag`/`endDrag`/`popBubble`/`simulate`/`dailyCourse`），与运行时和校验器共用 |
| `tests/verify-silk-dew-levels.mjs` | 离线校验：关卡 schema + 满星可解性（渐进拖拽口径）+ 物理确定性 + 失败路径 + 730 天每日确定性，**500 项断言** |
| `tests/smoke-silk-dew.mjs` | 在线校验：开始菜单→开局→**真实鼠标拖拽**→露珠位移→结算→20 关渲染回归→每日→抽屉 |

### 5.2 复用共享层（一个都不新写）

`css/tokens.css`+`layout.css`+`more-games.css`；`js/boot.js`(onReady) · `game-chrome.js`(bindChrome) · `game-drawer.js`(createStatsDrawer + `pauseQuiet/resumeQuiet/isRunning` 适配器) · `game-frame.js`(bindFrame) · `i18n.js`(makeText) · `daily.js`(todayKey/dailyKey/seed) · `leaderboard.js`(submitScore/fetchBoard/escapeHTML) · `safe-storage.js` · `analytics.js` · `game-sfx.js` · `icons.js`。

### 5.3 登记与派生（唯一动作：改 `games.config.json` → `npm run gen`）

```json
{
  "id": "silk-dew", "prefix": "sd", "href": "silk-dew.html", "entry": "src/games/silk-dew/index.js",
  "emoji": "💧",
  "title": { "doc": "垂丝引露 Silkfall — Rope Physics Puzzle", "seo": "垂丝引露 Silkfall — Rope Physics Puzzle" },
  "name": { "en": "Silkfall", "zh": "垂丝引露" },
  "desc": { "meta": "…", "og": "…", "twitter": "…" },
  "genre": ["PuzzleGame", "SimulationGame"],
  "caps": ["sidebar", "drawer", "frame-budget", "leaderboard", "daily", "analytics", "topbar"],
  "scores": { "order": "asc", "maxScore": 999, "maxEntries": 50,
              "daily": true, "dailyKeyPrefix": "silk-dew", "dailyTtlDays": 0 },
  "stage": { "w": 480, "h": 640 },
  "sitemap": { "changefreq": "daily", "priority": "0.8" },
  "themeColor": "#0a1712"
}
```

gen 自动改写 9 处派生点（vite inputs / sitemap / manifest / more-games / 两个 Workers 白名单 / README / head / seo）。**手工表兜底**：`verify-stats-drawer.mjs` 的 `AUGMENT` 必须补 `silk-dew` 条目（`assertCovered` 漏登记会硬失败，不会静默漏测）。

### 5.4 i18n

`LANGUAGES = makeText({ …own keys… })`；高频键（title/hint/gameOver）自持；`{n}` 类占位符单点展开（一个 helper），placeholder-leak 校验覆盖。

---

## 6. 开发里程碑（每里程碑一次提交，逐批审）

| 里程碑 | 内容 | 验收 | 状态 |
| --- | --- | --- | --- |
| **M0 骨架** | registry 条目 + `npm run gen`；html/css 骨架；bindChrome / createStatsDrawer / bindFrame / 侧栏三卡接入；AUGMENT 补条目 | `gen --check` 绿；`registry / chrome / fg-audit / stats-drawer / desktop-frame` 绿 | ✅ |
| **M1 物理核心** | verlet 绳 + **锚结拖拽**交互 + 8 元素 + 单关可玩 | dev 手测：60fps；拖拽牵引/落壶/触荆/出界判负全部正确 | ✅（机制替换） |
| **M2 内容** | 20 生成关（`silk-dew-levels.js`）+ 星级/进度存储 + 选关 + 结算面板（ICONS 按钮） | `verify-silk-dew-levels` 绿；进度刷新/重开计分正确 | ✅ |
| **M3 系统** | 每日 5 关采样器 + 榜单提交（战役/每日）+ i18n en/zh 全量 + 五声音阶 sfx + hubTrack | `daily / i18n / leaderboard / placeholder-leak` 绿 | ✅ |
| **M4 收口** | `smoke-silk-dew`（在线，按文件名自动发现）+ dist 复验 | **`npm run verify` 全绿**；`npm run build` 后 dist 复跑 | 进行中 |

## 7. 风险与规避

| 风险 | 规避 |
| --- | --- |
| 移动端性能 | 粒子上限 21 粒/绳；辉光用径向渐变而非大面积 shadowBlur；单 canvas |
| 牵拉误触 | 仅锚结可拖；视觉半径 `anchorR = 14`、独立触控热区 `anchorHitR = 24`，移动端更易抓取但不放大画面元素 |
| 拖拽瞬移穿墙 | 单子步位移上限 `dragMaxSpeed = 2400 px/s` |
| 露珠卡死悬空 | 位置漂移窗口判负（§2.6），出界亦判负；均不计分，诚实反馈 |
| 关卡假可解 | 校验器 **拒绝瞬移指针**，每段约 0.65 s 渐进牵拉，并分别扫描 `1..par` 操作预算；星芒两两间距 ≥ 70 px |
| 关卡像素级或过易 | 教学关至少 1 个、S5 起至少 2 个 40 px 网格满星目标位；主曲线按 1→2→3→4→5 拉上升，S14 作为仅 2 个满星目标位的精度/节奏缓冲 |
| 每日公平性 | 计分=牵拉次数（离散量），与帧时序无关 |
| dist 诊断失明 | terser `drop_console` ⇒ 新校验器一律 DOM/窗口探针断言，不依赖 console |
| 抽屉暂停差异 | 供 `pauseQuiet/resumeQuiet/isRunning` 三元组闭包，抽屉不戳页面内部 |
| 跨背景继承文字色 | 组件落在亮/暗两种表面时颜色必须显式声明（§4 选关芯片坑） |

## 8. 待拍板

1. **首页 Daily Hub 是否加第 4 任务**（垂丝引露）。Hub 是 index.html 手写区（非 gen 派生），加 = 一处手改 + smoke-index 断言扩展。默认：本期不加，进 backlog。
2. `dailyTtlDays: 0`（永久保留，同折光/弹弓）还是 14（同电路）。默认：0。
