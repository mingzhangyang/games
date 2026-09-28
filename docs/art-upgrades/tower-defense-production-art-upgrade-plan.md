# 《霓虹塔防 Neon Tower Defense》完整美术升级实施计划

> 目标执行者：Codex  
> 状态：待实施  
> 目标：保留当前成熟的塔防核心玩法、6 个战役关卡（分别为 15 / 20 / 25 / 30 / 35 / 40 波）、敌人机制与技能系统，同时把当前 480×640 竖向小战场升级为**800×600 横屏沉浸式未来都市防线**，让路径长度、部署空间和战术纵深真正扩大，而不是只把现有画布放大显示。

## 0. 升级原则

当前 `tower-defense` 已经拥有完整可玩的系统，包括：

- 路径与建造格逻辑；
- 4 类基础塔（Pulse / Cannon / Tesla / Frost）；
- 多种敌人机制（fast / tank / shield / flyer / splitter / healer / boss 等）；
- 波次、升级、出售、技能、暂停、结算、排行榜等；
- 适配过的 topbar / side panel / mobile 交互布局。

### 0.1 本次不改动的核心真源

以下内容仍以程序和现有数据结构为准，不因为美术升级而重构：

- 敌人沿路径移动、路径插值与到达核心的判定语义；
- 建造格 / 道路格的互斥规则与点击命中语义；
- 建塔、升级、出售、选中逻辑；
- 射程、伤害、攻速、减速、连锁、投射物等数值；
- 波次构成与关卡难度；当前 `js/tower-levels.js` 是战役波次数的真源：`outpost=15`、`vanguard=20`、`citadel=25`、`skyfall=30`、`juggernaut=35`、`singularity=40`，其中只有 `citadel` 是 25 波；
- 技能按钮、快捷键、暂停与速度切换；
- 现有 gameplay / difficulty smoke 的覆盖意图；涉及旧 480×640 尺寸、portrait shell、sidebar 几何的断言应随新战场契约更新，而不是继续锁死旧布局。

### 0.2 战场扩张属于本次升级范围

这次不把“战场尺寸”视为不可触碰的旧契约。现有 `480×640`、`12×16`、`CELL=40` 的竖向小战场，是当前视觉和战术空间受限的主要原因之一。

新的基线建议：

- **逻辑视口：800×600（4:3 横屏）**；
- **格子：20×15，CELL 继续为 40**；
- 每关拥有独立路径数据，不再让所有场景设计围绕旧小地图假设；
- 路径应更长、转折更多，并给塔留下真正的纵深部署区；
- 中后期关卡可以利用更大的横向空间安排双入口、汇流区、空中捷径或更复杂的火力覆盖关系；如果首轮实现暂不支持真正的多路寻路，至少也要通过更长的单一路径、折返和分区获得足够战术空间；
- **禁止“只把 480×640 Canvas 用 CSS 放大”作为完成方案**。验收应看实际可建格数量、路径长度和部署选择是否增加。

小屏策略参考 `tank-battle`：保证横屏战场是第一等体验；当竖屏会导致格子和塔过小时，提示旋转，而不是牺牲游戏空间。

### 0.3 本次重点升级

重点升级的是：

**核心塔防规则保持不变，但战场几何与页面布局允许为“大地图体验”重构。**

具体包括：

1. 战场背景与环境层次；
2. 塔、敌人、弹丸、爆炸、技能的正式视觉包装；
3. HUD / 面板 / overlay 的视觉系统统一；
4. 将“霓虹”从廉价 UI 光效升级为**能源、武器、护盾、战术投影**。

### 0.4 当前实现观察

当前视觉的主要特征是：

- `renderBackground()` 主要由深蓝渐变、程序网格、cyan 道路和虚线组成；
- 防御塔主体仍大量依赖 `fillRect / arc / stroke`；
- 敌人通过 `makeGlowSprite()` 生成多边形 + 辉光核心；
- CSS 明确采用 `Cyberpunk Neon Aesthetic & Glassmorphism UI`；
- HUD、面板、按钮、路径、弹丸和状态都在使用不同程度的 glow；
- 开始页仍使用 `🏰` 作为主视觉；
- 当前没有真正的 `assets/tower-defense/` 生产级美术资源包。

这些内容功能上成熟，但与仓库新一代“场景化、材质化、克制 UI、光效服务玩法”的美术标准已经出现代差。

---

## 1. 新世界观定位

### 1.1 新定位

**未来都市能源防线 × 夜间巨构设施 × 战术全息投影**

玩家不再像是在一张抽象蓝紫棋盘上摆几何图形，而是在守卫一处高价值设施，例如：

- 城市能源中枢；
- 轨道输送管线；
- 深夜工业园区；
- 核心反应堆外围平台；
- 天际线下的高科技防御节点。

### 1.2 视觉关键词

- 深石墨蓝 / 冷黑蓝；
- 都市夜景、工业平台、能源导管；
- 局部 cyan / teal 能源光；
- 少量紫、金、红作为兵种 / 危险强调；
- 硬边金属、磨砂材质、战术投影；
- 发光主要用于：
  - 路径能量脉冲；
  - 武器蓄能；
  - 护盾；
  - EMP / Tesla / Frost 等机制反馈。

### 1.3 明确避免

不要：

- 满屏玻璃拟态；
- 所有元素都在发光；
- 赛博夜店感；
- 过多虚线和几何轮廓堆满战场；
- UI 比塔和敌人更抢眼；
- emoji 充当主视觉；
- “抽象图标即角色”的低成本感；
- 大面积持续 `shadowBlur`；
- 紫蓝渐变覆盖所有层级。

---

## 2. 总体视觉改造目标

把当前体验从：

> “霓虹风网页 TD”

升级为：

> “可部署、可升级、可读性强的未来战术防线”

玩家第一眼应当感受到：

1. **这是有场景的战场，不是空白棋盘；**
2. **塔是有身份和制造风格的装备，不是简单几何；**
3. **敌人像一支分工明确的机械突袭部队；**
4. **不同机制能一眼识别，但又不凌乱；**
5. **UI 是辅助信息，不是主角。**

---

## 3. 技术约束与实现边界

### 3.1 当前核心文件

主要涉及：

- `tower-defense.html`
- `css/tower-defense.css`
- `css/layout.css`（共享 immersive 变量消费规则保持兼容；TD 使用页面级变量覆盖，不修改全站默认 640px）
- `js/tower-defense.js`
- `js/game-drawer.js`（仅用于确认 TD 迁移后不再依赖共享 stats drawer；不要求修改共享实现）
- `js/tower-levels.js`
- `games.config.json`
- `scripts/gen-from-registry.mjs`
- `scripts/verify-registry.mjs`
- `scripts/verify-immersive.mjs`
- `scripts/verify-all.mjs`
- `docs/contracts/layout.md`
- `docs/contracts/registry.md`
- `CLAUDE.md`

### 3.2 保留的技术路线

仍以 Canvas 为核心战斗渲染。

推荐采用：

- **静态战场层**：继续进入 `bgCanvas` / 离屏缓存，并与新的 800×600 战场、路径、建造格共享同一逻辑坐标；
- **环境中景层**：可静态或低频微动，但必须在 gameplay 实体之后/之前的顺序上明确，不得改变路径与命中几何；
- **gameplay 真源层**：塔、敌人、弹丸、特效继续程序 / sprite 绘制；
- **可选前景遮挡层**：仅允许出现在战场边缘的非交互区域，不得盖住可建格、敌人、塔、射程和状态提示；
- **DOM HUD / UI 层**：继续 HTML/CSS；DOM 背景最多用于页面壳体氛围，不作为战场路径或格子的视觉真源。

不建议为了美术重写现有画布架构。

### 3.3 建议新增目录

```text
assets/tower-defense/
  reference/
  production/
    environment/
    towers/
    enemies/
    fx/
    ui/
```

建议增加：

```text
assets/tower-defense/production/manifest.json
```

用于声明：

- 资源 key 与语义；
- 逻辑尺寸；
- alpha 需求；
- 加载分组；
- fallback；
- 运行时体积预算；
- 场景 variant。

**manifest 只做 metadata，不作为 Vite 运行时资源发现机制。**

必须新增类似 `js/tower-defense-art.js` 的字面量 URL 注册表，例如每个运行时资源都用静态可分析的：

```js
new URL('../assets/tower-defense/production/...', import.meta.url).href
```

要求：

- 不允许只从 `manifest.json` 读字符串后动态拼 `new URL(path, import.meta.url)`；
- `ASSET_URLS` / 等价常量必须逐项以字面路径注册所有运行时生产资源，使 Vite 能发现、hash、复制到 `dist`；
- `manifest.json` 与字面 URL map 使用同一资源 key，`verify-td-art.mjs` 双向检查 key 集合一致；
- build 后 verifier / smoke 必须确认生产资源实际能从 `dist` 加载，而不是只验证源目录存在；
- 若极少数资源选择放入 `public/`，必须在文档和 manifest 中显式标为 public asset；不要混用动态猜测路径。

### 3.4 性能原则

- 战场基线改为 **800×600 固定逻辑视口（4:3）**，参考 `tank-battle` 的横屏掌机 / 全屏战场思路；
- 建议继续保留 `CELL=40`，把当前 `12×16` 网格升级为 **20×15**，格子数由 192 增至 300；这样射程、塔体尺寸、敌人半径等既有像素尺度可以尽量保留，而部署空间显著扩大；
- desktop / tablet 优先以大尺寸 4:3 战场显示；小屏手机优先横屏，不允许为了兼容竖屏把 800×600 战场硬缩成一块很小的棋盘；
- 对短边不足以保证可点击格尺寸的手机竖屏，使用类似 `tank-battle` 的旋转提示，横屏后进入完整战场；
- 大背景不要每帧全尺寸复杂重绘；
- 优先：
  - 与现有 `bgCanvas` 同坐标系的预加载背景资源；
  - 预渲染 sprite；
  - 离屏缓存；
  - 低成本粒子；
- 高 DPR 下仍需保证移动端流畅；
- 保持 `drawFrame()` 结构稳定；
- 不在主循环中频繁创建大 gradient / canvas；
- 不将所有光效改成实时 blur。


### 3.5 页面布局与 registry 迁移：从 portrait shell 转为宽屏 immersive

当前 `tower-defense` 在 `games.config.json` 中是标准布局，并声明了 `sidebar` / `drawer` / `frame-budget`，`stage` 仍是 `480×640`。这些是生成器和校验器的真源，不能只改 CSS / HTML。

实施时必须先改 registry：

- `stage: { w: 800, h: 600 }`；
- `layout: "immersive"`；
- 从 `caps` 移除 `sidebar`、`drawer`、`frame-budget`；
- 保留 `leaderboard`、`analytics`、`topbar`；
- 同步把 registry 中仍写“25 waves / neon grid”的 SEO 描述改成准确的六关战役表述；
- 执行 `npm run gen`，提交所有生成结果；最后以 `npm run gen -- --check` 锁住无漂移状态。

由于现有 immersive 契约默认 `--frame-immersive-max: 640px`，仅修改 registry 不会让塔防真正显示到 800px。本轮采用**页面级变量覆盖**，不改变其它 immersive 页的全站默认值：

- 在 `css/tower-defense.css` 的 immersive shell 上显式声明：
  ```css
  .td-shell.game-shell--immersive {
      --frame-immersive-max: 800px;
  }
  ```
- 共享 `css/layout.css` 继续通过 `var(--frame-immersive-max)` 控制 immersive 的 topbar / stage / footer，因此该变量会从 `.td-shell` 继承到三个区域；**不要把 `:root` 默认 640px 直接改成 800px**，避免 Firefly Signal 等现有竖向 immersive 页面一起变宽；
- `docs/contracts/layout.md` 必须同时更新**旧 standard 参数表和 immersive 契约**，不能只补 §7：
  - 在 §2「各页参数现状」中删除当前这条旧记录：`tower-defense | 520 / 940 | 460 | 300 | ...`；
  - §2 不再把 tower-defense 列为 standard shell / sidebar 页面；
  - 在 §7 Immersive Stage 中新增“页面级参数 / 消费方”记录，明确 tower-defense：registry stage = `800×600`、`--frame-immersive-max: 800px`、无 sidebar / drawer / frame-budget、landscape-first；
  - 同时写明 immersive 默认上限仍为 640px，但页面可在 shell 上覆盖 `--frame-immersive-max`；当 registry 的 stage 宽度大于默认上限时，页面必须显式提供对应 override，并由 verifier 校验；
  - 文档验收时全文搜索 `tower-defense`，不得再出现把它描述为 `460px stage + 300px sidebar` 的现行契约；历史 archive 可以保留历史事实，但必须明确是 archive。
- `verify-immersive.mjs` 不再对所有 immersive 页硬编码 600–640px 宽；对 tower-defense 读取 registry `stage.w=800` 与计算后的 `--frame-immersive-max`，断言 desktop 可达 800px，同时保持其它 immersive 页原来的 640px 上限；
- 保持 Firefly Signal 等既有竖向 immersive 页面零回归；
- `verify-registry.mjs` 继续要求 `layout="immersive"` 与 `game-shell--immersive`、`game-stage--immersive`、`bindFrame({ layout: 'immersive' })` 双向一致；
- `tower-defense` 进入 immersive 后不得再残留标准布局专属 cap。

页面表现：

- 战场是视觉主体，优先获得视口面积；
- HUD 改为覆盖式或贴边式，不再靠 300px sidebar；
- 建造 / 升级面板使用 TD 自己的战术浮层 / 面板，不能永久占掉大块战场；
- desktop 以 800×600 为逻辑基线，在可用空间内等比显示；
- phone landscape 让 Canvas 尽可能吃满短边高度并遵守 safe-area；
- phone portrait 尺寸不足时显示旋转提示；
- 同步更新 `CLAUDE.md` 中把 tower-defense 归为 portrait-canvas game 的旧说明；并与 `docs/contracts/layout.md` §2 / §7 保持一致，不能一个说 standard/sidebar、另一个说 immersive。

#### Stats / Drawer 迁移决策

**不保留共享 stats drawer。** 既然 registry 移除 `drawer` cap，TD 也必须彻底退出 `game-drawer.js` 契约，避免出现“cap 已移除但旧 drawer 仍在运行”的半迁移状态。

实施要求：

- 从 `js/tower-defense.js` 移除 `createStatsDrawer` import、`window.tdDrawer = createStatsDrawer(...)` 和对应 `.init()`；
- 从 `tower-defense.html` 删除 `#tdStatsDrawer`、`.game-drawer-panel`、`#tdStatsDrawerBody` 等共享 drawer markup；
- `#tdStatsToggle` 可以保留为 Stats 入口，但改为控制 TD 自己的 immersive 战术信息面板（建议 `#tdTacticalPanel`），更新 `aria-controls` / `aria-expanded`；
- 现有 `#tdStatsPanels` 作为**唯一一份**统计内容节点迁入 `#tdTacticalPanel`，不要复制 DOM；
- 新面板由 tower-defense 自己的逻辑打开 / 关闭，并在 pause / overlay 状态下遵守现有暂停语义；
- TD 移除 `drawer` cap 后，registry 驱动的 `verify-stats-drawer.mjs` 应自动不再包含 TD；新的 `smoke-tower-defense.mjs` 负责验证 Stats 按钮、新战术面板、Esc / close、ARIA 状态与“页面中不存在 `#tdStatsDrawer` / 不初始化 `window.tdDrawer`”。

### 3.6 主题契约：继续保持 dark-only

根据 `docs/contracts/theme.md`，`tower-defense` 当前是**仅深色**游戏，霓虹 / 加色混合与暗场可读性属于主题本身。本轮美术升级必须保持这一契约：

- 不给 `tower-defense` 增加 `theme-light` cap；
- 不新增浅色战场变体；
- 不因为新版材质更克制就把页面迁移成 light / system 可切换；
- `site_theme=light` 或系统浅色时，该游戏仍应由现有 theme boot 解析为 `data-theme="dark"`；
- 新增 art verifier / smoke 时应保留对 dark-only 行为的验证，避免美术改造意外改变主题能力声明。


---

## 4. 战场场景升级方案

### 4.1 目标

把当前 `renderBackground()` 的纯程序化棋盘升级成：

**未来设施防御平台**

### 4.2 场景层次

建议拆成以下视觉层：

1. **远景层**
   - 夜空；
   - 远处城市轮廓；
   - 塔楼灯点；
   - 极轻大气雾；
   - 不能影响战场读数。

2. **中远景结构层**
   - 工业平台边缘；
   - 输能塔；
   - 管道；
   - 支撑梁；
   - 远处设备。

3. **主战场底面层**
   - 当前格子所在的平台地表；
   - 金属地坪、装甲板、嵌灯、能量沟槽；
   - 建造区域与路径区域材质区分明确。

4. **路径层**
   - 不再只是 cyan 线；
   - 表现为运载轨、悬浮通道或能源输送通路；
   - 仅在边缘灯条、中心脉冲、转角节点使用明显发光。

5. **前景装饰层**
   - 平台护栏；
   - 局部线缆；
   - 边缘设备；
   - 仅出现在不妨碍 gameplay 的区域。

中央主要 gameplay 区域必须保持清晰。

### 4.3 建造格表现

当前非路径格子是统一浅亮方格。升级后建议：

- 默认：深色金属地砖；
- 可建造格：轻微战术投影角标 / 细框；
- hover：弱 cyan 描边；
- selected：更稳定、更明确的亮框；
- 不可建造区：与路径材质区分；
- 不要让全地图始终像一张发光棋盘。

### 4.4 路径表现

建议：

- 路径底部变成实体运输轨 / 导能通道；
- 主体颜色以低亮度石墨蓝 + 金属灰为主；
- 只在边缘灯、节点、中心能量流使用 cyan；
- 现有路径脉冲可继续保留，但亮度降低、尺寸减小；
- 拐角 / 入口 / 核心出口可以提供局部机械结构。

### 4.5 飞行路线

飞行路线继续遵循当前契约：

- 仅在本关确实存在 flyer 时显示；
- 使用空中航线信标点 + 稀疏虚线；
- 不绘制成粗亮紫色带；
- 只作为机制提示，视觉权重低于地面主路。

---

## 5. 防御塔美术升级方案

当前塔的功能区分清楚，但形象过于抽象。

升级目标：

> 每种塔都应该一眼看出功能、材质和升级价值。

### 5.1 通用结构

每座塔建议拆成三层概念：

1. **底座**
   - 通用防御平台底座；
   - 共享同一工业体系语言；
   - 比当前统一方块更像部署设备。

2. **主机体**
   - 明确区分塔类型；
   - 负责轮廓识别。

3. **动态功能件**
   - 炮管；
   - 线圈；
   - 冰晶；
   - 脉冲环；
   - 能量芯。

底座可共用，主机体与功能件区分塔种。

### 5.2 Pulse 塔

定位：

**高速能量射击炮台**

造型方向：

- 紧凑自动炮塔；
- 双侧导轨；
- 前端发射环；
- 中央发光能量芯。

颜色：

- 主色：cyan / blue-white；
- 辅色：深金属灰。

升级表现：

- Lv1：单环炮口；
- Lv2：更粗导轨、更亮核心；
- Lv3：双层脉冲环或浮动副翼；
- Lv4：顶部小型高能阵列，不要直接画皇冠符号。

### 5.3 Cannon 塔

定位：

**重型实弹 / 爆破炮塔**

造型方向：

- 粗重装甲炮座；
- 长炮管；
- 后坐结构；
- 明显机械厚重感。

颜色：

- 主色：gunmetal；
- 强调：琥珀 / 橙黄。

升级表现：

- Lv1：短炮管；
- Lv2：装甲加厚；
- Lv3：炮口制退器 + 侧挂弹仓；
- Lv4：双层装甲炮管 + 底座警示灯。

### 5.4 Tesla 塔

定位：

**电弧连锁与 EMP 科技塔**

造型方向：

- 中央线圈塔；
- 环状感应框；
- 悬浮电容片；
- 立柱电极。

颜色：

- 主色：亮 cyan 偏白；
- 次色：少量电紫。

升级表现：

- Lv1：单线圈；
- Lv2：双环；
- Lv3：出现副电极；
- Lv4：顶部悬浮电容片 + 更复杂电弧路径。

注意：

Tesla 可以比其他塔更亮，但亮度应主要来自**放电瞬间**，不是永久大光圈。

### 5.5 Frost 塔

定位：

**减速 / 冻结控制塔**

造型方向：

- 低温发射核心；
- 冷凝喷口；
- 冰晶天线；
- “制冷科技”而不是“雪花 icon”。

颜色：

- 主色：冰蓝 / 青白；
- 辅色：银灰。

升级表现：

- Lv1：中央冷凝管；
- Lv2：三向喷口；
- Lv3：冰晶鳍片；
- Lv4：核心外圈低温雾环。

---

## 6. 敌人美术升级方案

当前敌人主要依赖不同颜色和边数的 glow polygon。

升级后应变成：

**同一敌方机械军团中的不同单位。**

### 6.1 通用设计原则

- 都属于无人机 / 机械兵 / 攻击平台体系；
- 共享统一工业语言；
- 通过轮廓、配件、推进器、装甲、灯色区别兵种；
- 机制提示继续存在，但作为辅助，而不是主识别来源。

### 6.2 normal

- 标准突袭无人机；
- 轮廓简洁；
- 作为整套敌军的视觉基准；
- 中性冷灰机体 + 小型红橙核心。

### 6.3 fast

- 更瘦、更尖、更流线；
- 推进尾焰更明显；
- 一眼能感到速度优势。

### 6.4 swarm

- 更小；
- 群体感强；
- 单体细节少；
- 不能退化成纯发光小圆点。

### 6.5 tank

- 大型厚甲平台；
- 装甲块更钝、更厚；
- 体量感强；
- 移动慢但威胁明显。

### 6.6 shield

- 本体外存在稳定护盾投影；
- 护盾应像能量罩，而不是简单虚线圈。

### 6.7 armor

- 装甲板分段明确；
- 可有外覆板或楔形前甲；
- 与 tank 的区别是“抗性 / 装甲结构”，不是单纯更大。

### 6.8 healer

- 支援无人机；
- 工具型轮廓；
- 治疗时连接光束清楚但柔和；
- 弱化字面“医疗十字”依赖，改用模块语言。

### 6.9 splitter

- 造型中预示可分裂结构；
- 例如中央双节核心或可脱离副舱。

### 6.10 flyer

- 明显空中单位；
- 轮廓与地面单位区别大；
- 可保留地面投影；
- 本体更轻、更高、更像飞行器。

### 6.11 attacker / siege

- 有前向火炮或突击装置；
- 让玩家直观看出“会反击防御塔”。

### 6.12 boss / overlord

必须真正具备压迫感：

- 更大；
- 更复杂；
- 多段甲板；
- 中央核心；
- 侧翼结构；
- 独立受击点 / 能源节点视觉；
- 不允许仅把普通敌人放大。

---

## 7. 投射物与特效升级方案

这是本次最重要的提质区之一。

目标：

> 让玩家感到战斗有能量、有冲击、有装备差异。

### 7.1 Pulse

- 细长能量弹或脉冲珠；
- 轻微尾迹；
- 命中出现短促脉冲火花。

### 7.2 Cannon

- 重型炮弹；
- 少量烟 / 热轨迹；
- 爆炸分为：
  - 高亮内核；
  - 外圈冲击波；
  - 少量碎屑。

### 7.3 Tesla

- 电弧粗细变化；
- 有分叉；
- 命中瞬间目标白蓝闪；
- 连锁路径关系清楚；
- 不使用持续大范围 glow。

### 7.4 Frost

- 低温粒子；
- 冷凝雾；
- 冰晶斑；
- 减速状态在目标边缘出现冻结感；
- 不仅依赖蓝圈。

### 7.5 EMP / 技能

EMP 应像真正的战术能量波：

- 中心短暂蓄能；
- 扩散波纹；
- 扫描条纹；
- 低频、短时高亮；
- 不要只是普通圆环放大。

### 7.6 爆炸与命中反馈层级

建立统一层级：

- 小命中：火花 / 电火 / 冷凝裂纹；
- 中爆炸：碎屑 + 冲击环；
- 大爆炸：亮核 + 扩散；
- Boss 受击：装甲闪 / 局部爆点。

---

## 8. HUD 与 UI 视觉升级方案

当前 UI 功能齐全，但“发光玻璃 UI”感偏重。

升级目标：

- 更专业；
- 更克制；
- 更清楚；
- 保留未来感，但减少廉价霓虹；
- 让信息有明确层级。

### 8.1 顶栏 HUD

改成：

**战术指挥 HUD**

建议：

- 深色磨砂底；
- 细边框；
- 图标与数字清楚；
- 数字继续保持 tabular；
- 低血量时才加强危险反馈；
- 金币增加只使用短促跳动；
- 不让三块状态胶囊一直发光。

### 8.2 建造 / 升级面板

目标：

像“战术部署终端”，而不是“漂浮玻璃卡片”。

结构建议：

- 塔名；
- 角色描述；
- 核心属性；
- 升级收益；
- 按钮区。

四种塔卡片需要：

- 独立正式小插图 / 图标；
- 功能标签；
- 成本清楚；
- active / disabled / affordable 状态明确。

### 8.3 按钮系统

涉及：

- 发波；
- 技能；
- Play / Retry / Home；
- Pause / Stats / Sound。

原则：

- 统一 SVG icon 语言；
- 减少大阴影和大光晕；
- 只有主操作和可释放技能允许明显强调；
- 不要让所有 hover 都变成 neon glow。

发波按钮应像“执行战术命令”的主按钮，可加入轻微扫描线 / 状态灯，但不要夜店感。

### 8.4 开始页

当前 `🏰` 主视觉必须移除。

开始页应变成：

**任务部署界面**

建议包含：

- 场景主视觉插图；
- 游戏标题；
- 关卡选择卡；
- 每关简短任务说明；
- 波数 / 金币 / 生命统计块；
- 塔种概览；
- 当前最高纪录。

### 8.5 结束页

Victory / Defeat 明确区分：

- Victory：成功守卫防线；
- Defeat：核心失守；
- 视觉反馈与场景状态关联；
- 不只是大数字 + 通用面板。

---

## 9. 关卡视觉差异化

当前关卡 gameplay 已经足够成熟，本次主要增加视觉辨识度。

建议同一世界观下分为不同战区，例如：

1. **外环防线**
   - 较开阔；
   - 基础教学氛围。

2. **城市输能节点**
   - 工业设备更多；
   - 能源管线更明显。

3. **高架运输平台**
   - 更强纵深；
   - 边缘灯带与轨道结构明显。

4. **反应堆中枢**
   - 环境能量更强；
   - 危险感上升。

5. **奇点核心 / 终局设施**
   - 最终战；
   - 压迫感最高；
   - 可增加异常能量、结构扭曲或更强远景灯光。

实现方式不要求每关一整套背景：

- 1 套主背景系统；
- 若干远景 / 中景 variant；
- 不同色温；
- 局部结构替换；
- 角落装饰；
- 战场材质差分。

这样成本可控，也不会影响现有路径真源。

---

## 10. 建议新增资源清单

### 10.1 环境资源

至少：

```text
environment/
  battlefield-base.webp
  far-skyline.webp
  mid-structures.webp
  foreground-edge.webp
  reactor-variant.webp
  platform-variant.webp
  singularity-variant.webp
```

以上战场资源全部以同一个 **800×600** 逻辑舞台为构图基准；若输出 2× 栅格资源，统一按 **1600×1200** 对齐。desktop / tablet / mobile landscape 共享同一战场几何，不因设备改变路径位置或可建区构图。

### 10.2 塔资源

```text
towers/
  base.webp
  pulse.webp
  cannon.webp
  tesla.webp
  frost.webp
```

如成本允许增加：

- 升级差分 overlay；
- 炮口光；
- 线圈光；
- 冰雾；
- 受损叠层。

### 10.3 敌人资源

建议包含：

```text
enemies/
  normal.webp
  fast.webp
  swarm.webp
  tank.webp
  shield.webp
  armor.webp
  healer.webp
  splitter.webp
  flyer.webp
  attacker.webp
  boss.webp
  overlord.webp
```

状态效果（护盾、治疗、冻结、受击）优先程序叠加，不为每个状态重复整套位图。`attacker.webp` 必须是独立生产资源，因为攻城兵有“拆塔”机制和独立轮廓；资源失败时回退到现有 `attacker` 程序 sprite，而不是借用 boss / tank 贴图。

### 10.4 特效资源

可选：

```text
fx/
  muzzle-flash.webp
  hit-spark.webp
  cannon-explosion.webp
  frost-burst.webp
  emp-core.webp
  energy-ring.webp
  smoke.webp
  debris.webp
```

### 10.5 UI 资源

```text
ui/
  start-hero.webp
  tower-pulse.svg
  tower-cannon.svg
  tower-tesla.svg
  tower-frost.svg
  stat-lives.svg
  stat-gold.svg
  stat-wave.svg
```

---

## 11. 实施步骤

### Phase 1：视觉系统定调

1. 明确配色体系；
2. 出一张整体概念图 / 冻结稿；
3. 确定塔、敌人、场景统一风格；
4. 建立资源目录和 metadata-only manifest；
5. 新增字面量 `new URL(..., import.meta.url)` 的运行时 URL map，确保 Vite 能收集生产资源；
6. 暂不修改 gameplay。

交付：

- 本计划文档；
- 参考概念图；
- 资源目录；
- manifest 草案。

### Phase 2：战场环境升级

1. 先迁移 registry：`stage=800×600`、`layout="immersive"`、移除标准布局专属 caps，执行 `npm run gen`；
2. 在 `.td-shell.game-shell--immersive` 上显式覆盖 `--frame-immersive-max: 800px`，并更新 immersive verifier；
3. 同步清理 `docs/contracts/layout.md`：从 §2 standard 参数表删除 tower-defense 的 `520/940 · 460 · 300 sidebar` 旧行，并在 §7 immersive 参数/消费方记录中新增 TD 的 `800×600 / 800px max / landscape-first / no sidebar-drawer-frame-budget`；
4. 移除 TD 对共享 stats drawer 的 markup / import / init，改用舞台内 `#tdTacticalPanel`，保留单一 `#tdStatsPanels` 内容节点；
5. 把逻辑战场从 480×640 迁移到 800×600；
6. 继续保留 `CELL=40` 时，将网格调整为 20×15；
7. 把地图数据正式下沉到每个 level：建议 `level.map = { cols, rows, cell, groundWaypoints, airWaypoints? }`；
8. 新增 `compileLevelMap(level.map)`（或等价函数），一次生成当前关卡的 `groundPath`、`airPath`、`pathGrid`、buildable cell 统计和尺寸信息；
9. **移除 module-global 的 `WAYPOINTS` / `AIR_WAYPOINTS`、`GROUND_PATH` / `AIR_PATH`、`pathGrid` 作为运行时真源**；切关 / `resetRun()` 时设置唯一的 active map；
10. 将所有消费者迁移到 active map：敌人 spawn/path、`pointAtDist`、renderBackground、buildability、towerGrid 尺寸、flyer 路径、攻击 / 治疗测试构造、debug / verifier hooks；
11. 重做 6 关独立的 ground waypoints，并按关卡需要提供 air waypoints；
12. 实装新背景、实体路径和可建造区域；
13. 加中 / 前景层；
14. 更新坐标相关 verifier，确保渲染、spawn、build、测试 hook 全部读取同一 active map，不能存在“UI 已切关但路径仍是上一关”的双真源。

重点验证：

- 800×600 desktop / tablet / mobile landscape 不糊；
- 手机横屏时战场尽可能占据可用视口，而不是被外围 UI 挤回小尺寸；
- flyer 路线不抢眼；
- 场景不遮挡塔与敌人；
- 大地图扩张必须满足下面的机器可验证阈值。

#### 旧地图基线与新地图最低阈值

当前 6 关实际上共用同一张 `12×16` 地图，因此旧基线对六关相同：

- 总格数：192；
- ground path 总长度：1520 logical px = 38 × CELL；
- ground path 占用地图内格：38；
- buildable cells：154。

新 `20×15` 地图的最低验收值：

| Level | 旧 ground length | 新 ground length 最低值 | 旧 buildable | 新 buildable 最低值 |
| --- | ---: | ---: | ---: | ---: |
| outpost | 1520 | **1840 px（46 CELL）** | 154 | **190** |
| vanguard | 1520 | **1840 px（46 CELL）** | 154 | **190** |
| citadel | 1520 | **1840 px（46 CELL）** | 154 | **190** |
| skyfall | 1520 | **1840 px（46 CELL）** | 154 | **190** |
| juggernaut | 1520 | **1840 px（46 CELL）** | 154 | **190** |
| singularity | 1520 | **1840 px（46 CELL）** | 154 | **190** |

Verifier 必须逐关编译 active map 后断言：

- `groundPath.total >= 1840`；
- `buildableCount >= 190`；
- 六关 ground waypoint 序列 / 标准化 path signature **六个全部唯一**，禁止“六个 level 指向同一 map”；
- 有 flyer 的关卡（至少 skyfall / juggernaut / singularity）必须拥有独立 `airPath`，并继续满足 `airPath.total < groundPath.total`；
- 所有 waypoint 在允许的入口 / 出口越界规则之外必须落在 `20×15` 地图有效范围；
- 路径不能自相矛盾地产生 diagonal segment，除非同时修改 pathGrid 编译算法并加入对应测试。

这组阈值让“不是只做 CSS 放大”变成自动化事实：ground route 至少比旧图长约 21%，可建格至少比旧图多约 23%。

### Phase 3：塔资源升级

1. 用正式 sprite 替换主要几何绘制；
2. 保留旋转；
3. 接入升级状态；
4. 保留 overdrive / hurt / range 等程序反馈。

重点验证：

- 四塔仍可快速识别；
- 旋转中心正确；
- 高等级不糊；
- 点击命中与格子坐标不变。

### Phase 4：敌人与弹丸升级

1. 替换敌人 sprite；
2. 升级投射物；
3. 升级命中与爆炸；
4. 改善 Boss；
5. 保留 healer / shield / armor / stun 等机制层。

重点验证：

- 大量敌人同屏时仍清楚；
- hitbox 理解不受影响；
- swarm 性能可接受。

### Phase 5：UI / Overlay 升级

1. 替换开始页主视觉；
2. 建造面板升级；
3. HUD 收敛；
4. Pause / Result 统一；
5. 清理 emoji 主视觉和残留过度 glow。

重点验证：

- i18n 正常；
- 触控热区不退化；
- 窄屏不挤压；
- 新的横屏 HUD / overlay 不遮挡战场核心区域，原 topbar 功能（生命、金币、波次、速度、暂停、声音、统计）必须完整迁移。

### Phase 6：收尾与验证

1. 亮度审计；
2. 前景可读性审计；
3. mobile smoke；
4. 性能回归；
5. 资源体积检查；
6. fallback 测试。

---

## 12. 代码与架构建议

### 12.1 不建议的大改

不要：

- 重写整个渲染系统；
- 把 Canvas 强行拆成大量 canvas；
- 改波次、敌人数值曲线和塔战斗语义；
- 继续套用当前“portrait canvas + 300px sidebar”的布局假设；
- 因美术引入复杂状态机；
- 将现有路径真源转移到贴图中。

### 12.2 建议的小改

允许：

- 在 `tower-defense.js` 中加入资源 loader；
- 背景从纯代码改成“资源图 + 程序叠加”；
- 塔 / 敌人改为 sprite-based draw；
- 将部分 glow 从永久状态改为事件触发；
- 增加离屏缓存；
- 增加环境 variant；
- 增加生产美术开关与 fallback 诊断。

### 12.3 gameplay 几何必须继续由代码定义

任何资源都不能成为碰撞 / 路径 / 建塔的真源。

例如：

- 路径仍来自代码 / 关卡数据中的 waypoint；每个 `LEVELS[i].map` 是地图真源，运行时只通过当前 active map 的 compiled paths / pathGrid 消费它，不保留第二套 module-global waypoint 真源；
- 塔仍落在现有 cell；
- enemy sprite 只围绕当前 `e.x / e.y / e.r` 绘制；
- tower sprite 只围绕现有塔中心和角度绘制；
- range / selection / hit 状态仍程序绘制。

---

## 13. Fallback 原则

必须保证：

> **即使生产美术资源失败，游戏仍可正常完成整局。**

要求：

- 新资源加载失败时回退到现有程序绘制或简化 fallback；
- 不允许因背景 / 塔 / 敌人 sprite 失败而卡死；
- fallback 路径必须明确、可测试；
- manifest / loader 应输出可诊断状态；
- 生产美术启用和 fallback 应同时纳入 smoke。

建议保留现有 `makeGlowSprite()`、程序塔或其简化版本作为可靠后备，而不是直接删除所有旧绘制逻辑。

---

## 14. 测试与验证

建议新增：

```text
scripts/verify-td-art.mjs
```

### 14.1 资源检查

检查：

- 关键背景存在；
- 四塔资源存在；
- 关键敌人资源存在；
- 尺寸合理；
- alpha 合法；
- manifest metadata 合法；
- manifest runtime keys 与 `tower-defense-art.js` 的字面 URL map 双向完全一致；
- 源资源文件全部存在、尺寸 / alpha / 体积符合预算；
- **offline `td-art` 不承担 dist 加载证明**；built asset 是否真正被 Vite hash、输出并由页面加载，放到 14.5 的 dist smoke；
- 运行时体积未超预算。

### 14.2 代码约束

检查：

- fallback 存在；
- 关键 DOM ID / class 未被破坏；
- HUD 数字继续使用 tabular；
- Canvas hit geometry 没有改成依赖图片；
- 6 个 level 都有独立 map 定义，active map 切换后 groundPath / airPath / pathGrid / towerGrid / renderBackground / spawn 全部同步；
- 大地图阈值：每关 groundPath ≥1840px、buildable ≥190、六个 ground path signature 唯一；
- production art 与 fallback 两条路径都可初始化；
- 背景装饰不会拦截 pointer。

### 14.3 smoke 扩展

现有 `td-topbar` 与独立的 `verify-td-difficulty.mjs` 继续保留；同时新增 `smoke-tower-defense.mjs` 覆盖完整生产美术 / fallback 流程：

- 开始页显示；
- 关卡选择；
- 开始战斗；
- 建造四种塔；
- 发波；
- 塔旋转；
- projectile 正常；
- healer；
- shield；
- flyer；
- boss；
- 技能；
- 暂停 / 恢复；
- 结算；
- Stats 按钮打开 / 关闭新的 `#tdTacticalPanel`，ARIA 状态正确；
- 页面不存在旧 `#tdStatsDrawer`，运行时不存在已初始化的 `window.tdDrawer`；
- 资源失败 fallback；
- 390×844 / 430×932 竖屏：验证旋转提示不会把小战场硬塞进页面；
- 844×390 / 932×430 横屏：验证完整 4:3 战场和触控命中；
- tablet landscape；
- desktop；
- DPR 2；
- reduced motion。

### 14.4 verify-all

必须显式注册进 `scripts/verify-all.mjs`，不要依赖自动发现：

- `td-art` → `scripts/verify-td-art.mjs`，offline，仅验证源资源 / manifest / 字面 URL map / 静态预算，不声称验证 dist；
- `td-difficulty` → 现有 `scripts/verify-td-difficulty.mjs`，`needsServer: true`、`games: ['tower-defense']`；
- `smoke-tower-defense` → 新增完整 runtime smoke，`needsServer: true`；
- 保留现有 `td-topbar`，但将其中锁定旧 portrait 几何的断言更新为新 landscape / rotation 契约；
- 评估 `verify-td-btn-hover.mjs`：若仍是有效 UI 契约则一并注册；若被新 UI 明确取代，则删除 / 重写并在 PR 说明原因，不能留下无人运行的旧测试。

同时把以上 TD 关键项加入 `QUICK_NAMES`（至少 `td-art`、`td-difficulty`、`smoke-tower-defense`、`td-topbar`），保证日常验证不会只跑到顶栏而漏掉难度和地图机制。

### 14.5 构建产物（dist）验证

Vite hashed asset 的实际可加载性必须单独在**构建产物**上验证，不能由 offline `td-art` 冒充。

实施要求：

1. 新增 `scripts/smoke-tower-defense.mjs`，其生产美术断言必须检查：
   - art loader 进入 `ready`；
   - 关键 environment / tower / enemy（包括 attacker）图片 `complete && naturalWidth > 0`；
   - 无关键资源 404 / decode error；
   - 页面没有偷偷落入 fallback；
2. 源码 smoke 仍由 `verify-all` 以普通静态服务器运行；
3. **dist smoke 使用仓库现有编排器：**
   ```bash
   npm run build
   node scripts/run-smoke-dist.mjs scripts/smoke-tower-defense.mjs
   ```
4. 为避免 CI / 人工验收漏跑，建议在 `package.json` 增加：
   ```json
   "verify:tower-defense-dist": "npm run build && node scripts/run-smoke-dist.mjs scripts/smoke-tower-defense.mjs"
   ```
5. 本轮实施 PR 的验收记录必须同时包含：
   - `npm run verify:quick`（或 full verify）；
   - `npm run verify:tower-defense-dist`；
6. 如果后续全站已有统一 build+dist smoke CI，再把这条接入统一入口；在此之前，不把需要 build 的 dist 检查硬塞进 `verify-all` 的 `needsServer:false` step。

这样分工明确：

- `verify-td-art.mjs`：源文件和注册关系；
- `smoke-tower-defense.mjs`（source server）：运行时 gameplay / production / fallback；
- 同一个 `smoke-tower-defense.mjs` 经 `run-smoke-dist.mjs`：真正验证 Vite 构建产物和 hashed asset URL。


---

## 15. 性能预算建议

建议生产美术运行时总包控制在：

- 软目标：**≤ 2.0 MB**
- 硬上限：**≤ 3.0 MB**

原则：

- 大背景优先 WebP；
- 小型 UI icon 优先 SVG；
- 敌人 / 塔尽量复用 sprite；
- 状态效果程序生成；
- 不为每个升级等级复制整套大图；
- 不在每帧重建背景；
- 高亮、护盾、冻结等动态状态优先程序 overlay。

---

## 16. 验收标准

### A. 战场

- 不再像抽象霓虹网格；
- 有真实未来设施感；
- 路径与建造区域一眼清楚；
- 实际可部署格与路径长度显著大于旧 480×640 / 12×16 战场；
- desktop 与横屏移动端都把战场作为页面主体，而不是缩在侧栏旁的小舞台；
- 场景有层次但不干扰玩法。

### B. 塔

- 四类塔功能识别度高；
- 造型成熟；
- 不再是基础几何；
- 升级感明确；
- 旋转与受损表现自然。

### C. 敌人

- 不再只是发光多边形；
- 同阵营、不同兵种统一且有差异；
- 特殊机制无需只靠虚线圈理解；
- Boss 有明显压迫感。

### D. 特效

- 命中、连锁、爆炸、冻结、EMP 更有冲击；
- 光效不泛滥；
- 高频战斗仍清楚；
- 粒子不会掩盖塔和敌人。

### E. UI

- 开始页、面板、HUD 更像战术指挥界面；
- 明显减少旧式玻璃拟态感；
- emoji 主视觉移除；
- 移动端操作不退化。

### F. 工程

- 不破坏现有 gameplay；
- 不改变路径和数值真源；
- 保留 fallback；
- art verifier 通过；
- smoke / verify 通过；
- 资源体积符合预算。

---

## 17. Definition of Done

以下全部满足才视为本轮美术升级完成：

- [ ] 有正式生产战场背景；
- [ ] 地面、路径、建造区形成统一场景；
- [ ] 四种防御塔完成正式视觉资源接入；
- [ ] 主要敌人完成正式视觉资源接入；
- [ ] Boss / Overlord 不再只是普通单位放大；
- [ ] Pulse / Cannon / Tesla / Frost 的攻击反馈明显区分；
- [ ] 护盾、治疗、冻结、眩晕机制视觉清晰；
- [ ] EMP / 技能特效升级；
- [ ] 开始页主视觉不再使用 emoji；
- [ ] HUD / build panel / result overlay 风格统一；
- [ ] 永久性大面积 glow 明显减少；
- [ ] production art 加载失败时游戏仍可完整游玩；
- [ ] mobile / desktop / landscape / DPR 2 验证通过；
- [ ] `verify-td-art.mjs` 加入 verify-all；
- [ ] 现有 tower-defense gameplay / difficulty 测试不退化；
- [ ] 生产美术包未超过硬预算。

---

## 18. 一句话设计总结

**不是去掉“霓虹”，而是把“霓虹”从廉价 UI 发光，升级成未来战场中合理存在的能源语言。**
