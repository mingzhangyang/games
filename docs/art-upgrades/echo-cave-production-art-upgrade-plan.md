# 《回声洞窟 Echo Cave》选择性生产美术升级实施计划

> 目标执行者：Codex  
> 仓库：`mingzhangyang/games`  
> 状态：待实施  
> 升级类型：**场景材质与声呐揭示升级，不重做玩法与科学展柜 UI**

## 0. 核心判断

《回声洞窟》最近已经完成过一轮场景与 UI 现代化，目前不是“旧页面推倒重来”的对象。

这次升级的正确目标是：

**把现在的程序岩层、矩形墙格、简单洞口/声晶/荆棘，升级成真正有岩洞材质、湿度、钟乳石、苔藓、晶体和声呐受光的洞窟；但任何正式美术都不能提前暴露关卡墙体布局。**

这是本方案最重要的约束。

游戏核心仍然是：

> 洞穴本来不可见，玩家发出声波后，回波才短暂揭示真实地形。

如果背景图直接把通道和墙画出来，美术越精致，玩法反而越失效。

---

## 1. 必须保持不变

以下全部是玩法真源，禁止为了贴图调整：

```text
逻辑舞台 480×640
24×32 grid
cell = 20px
17 张洞穴图
声波传播 / 反射 / 吸收
memory glow
pulse count
par
Dijkstra solver
crystal 收集
moss 吸音
thorn 危险
exit
hearts
daily 5 caves
leaderboard
BFS / smoke 可玩路径
```

特别禁止修改：

- `src/games/echo-cave/model/rules.js` 的地图；
- `GRID`；
- `RULES`；
- wall / moss / exit / crystal / thorn 坐标；
- pulse speed / max radius / memory；
- par；
- daily generation；
- 关卡求解器通过条件。

现有：

`tests/verify-echo-cave-levels.mjs`

必须视为不可降低标准的玩法验收真源。

---

## 2. 美术方向

定位：

**湿润石灰岩洞穴 × 极暗环境 × 生物荧光痕迹 × 声波瞬时揭示**

视觉关键词：

- 深青黑；
- 页岩 / 石灰岩层理；
- 湿润反光；
- 钟乳石；
- 石笋；
- 吸音苔藓；
- 琥珀声晶；
- 微弱月光洞口；
- 极少生物荧光尘；
- 回声扫过时出现“湿岩高光”。

避免：

- 霓虹洞穴；
- 蓝紫科技网格；
- 常亮墙壁；
- 背景提前透露通路；
- 大面积环境光；
- 每块墙都像独立方格砖。

---

## 3. 两类美术必须严格分开

### A. 永久可见的“无信息背景”

这部分可以一直显示，但**不能编码地图可通行信息**：

- 极暗岩石底色；
- 模糊大尺度地质层理；
- 洞顶极暗钟乳石影；
- 尘埃；
- 湿气；
- 很弱的洞穴色差。

### B. 只有声呐揭示时才能出现的“地图材质”

包括：

- 岩壁边缘；
- 墙体表面；
- 苔藓；
- 石缝；
- 洞口；
- 危险荆棘；
- crystal；
- 湿岩反光。

这些必须经过现有：

- current glow；
- memory；
- pulse；

控制后才绘制。

---

## 4. 视觉冻结稿

先制作两张概念稿，而不是一张：

```text
assets/echo-cave/reference/concept-dark.webp
assets/echo-cave/reference/concept-sonar-reveal.webp
```

两张必须是**同一场景、同一相机**。

### `concept-dark.webp`

表现：

- 玩家不发声时真正看到的内容；
- 几乎无法判断通道；
- 只能感到“身处洞穴”。

### `concept-sonar-reveal.webp`

表现同一帧被声波扫过后：

- 岩壁轮廓亮起；
- 湿润石面出现；
- 苔藓表现吸音；
- 声晶短暂回应；
- 远处出口有低频月白光。

验收时把两张叠放切换：

**如果只看 dark 版本就能猜出路线，方案失败。**

---

## 5. 资产目录

建立：

```text
assets/echo-cave/
├── manifest.json
├── README.md
├── reference/
│   ├── concept-dark.webp
│   └── concept-sonar-reveal.webp
├── ambience/
│   ├── cave-base.webp
│   ├── ceiling-shadow.webp
│   ├── mist.webp
│   └── dust.webp
├── materials/
│   ├── rock-a.webp
│   ├── rock-b.webp
│   ├── rock-wet.webp
│   ├── moss.webp
│   └── edge-highlight.webp
├── props/
│   ├── crystal.svg
│   ├── thorn.svg
│   └── exit.svg
└── masks/
    └── rock-noise.webp
```

注意：

- 不制作“整张关卡地图背景”；
- 不把 20 关分别烘焙成图片；
- 地图仍由关卡 grid 动态决定。

---

## 6. 岩壁材质管线

当前 `drawWalls()` 是对 wall cell：

- fillRect；
- stroke edge。

升级后仍按 cell 真源生成，但绘制结果不再像网格砖。

建议新增：

`js/echo-cave-art.js`  
`js/echo-cave-materials.js`

### 6.1 离屏 cave surface

根据当前关卡 grid，在开始关卡时生成一次离屏纹理：

`wallSurfaceCanvas`

流程：

1. 遍历 wall cells；
2. 使用 deterministic noise 选择 rock-a / rock-b；
3. 在相邻 wall cell 之间消除明显 tile seam；
4. moss cell 使用独立吸音材质；
5. 生成 wall edge mask；
6. 缓存。

**不要每帧重新拼墙纹理。**

### 6.2 reveal mask

当前 `world.glow[]` 与 `world.memory[]` 继续是真源。

建立低分辨率或同逻辑尺寸 reveal mask：

- current echo：亮；
- memory：暗；
- moss：不写 memory；
- 未探测：0。

最终：

```text
wallSurfaceCanvas
× revealMask
→ revealed wall material
```

这样可以得到真正的岩壁材质，同时不泄露地图。

---

## 7. 声呐表现升级

当前 pulse 是两条规则圆。

保留几何传播，但视觉升级：

### 发射波

- 圆环主体仍清晰；
- 增加极薄内外波纹；
- 接近墙时局部增强；
- 不做厚 neon ring。

### 回波

当 pulse 与岩壁交互时：

- 岩壁边缘短暂湿亮；
- 少量细碎回波点；
- 不直接把整个 cell 点亮成方块。

### memory

当前蓝绿边线记忆非常适合玩法。

升级成：

- 岩壁轮廓 + 极弱材质残留；
- 亮度继续单调衰减/保持现有规则；
- 不增加永久信息。

---

## 8. Moss 的视觉必须直接表达“吸音”

吸音苔藓是科学机制的一部分。

视觉：

- 深绿黑；
- 绒状；
- 表面没有湿岩高光；
- pulse 扫过时明显“暗下去”；
- 邻近普通岩壁有回波，moss 没有。

可在 pulse 到达 moss 的瞬间：

- 波环轻微断裂；
- 出现极短吸收暗晕。

但不要做解释文字。

玩家应从视觉上理解：

**声音在这里消失。**

---

## 9. Props

### Crystal

改为正式 authored SVG：

`props/crystal.svg`

要求：

- 小尺寸仍清楚；
- 琥珀 / 黄铜感；
- 正常状态不常亮；
- sing 时出现短暂圆形共振纹。

### Thorn

改为洞穴生物/矿物式危险：

- 暗红晶棘；
- 或带钙化质感的尖刺簇。

碰撞 radius 不变。

### Exit

现在是程序拱门。

升级为：

- 真实洞口轮廓；
- 极弱月白外光；
- 低频 hum 时亮度变化。

但 artwork 必须围绕现有 exit center / radius，不改变判定。

---

## 10. Player

当前玩家是一个小型发光生物。

不建议换成复杂角色 sprite。

保留程序形态，因为：

- 小；
- 需要精确坐标；
- glow 是玩法反馈；
- 移动速度快。

只做精修：

- 身体从圆点变成更明确的“小洞穴萤蛾 / 声蝠精灵”抽象轮廓；
- 翅膀振动更加清晰；
- 不扩大碰撞视觉尺寸；
- pulse 从角色中心发出位置严格不变。

不需要写实蝙蝠。

---

## 11. 暗场规则

《回声洞窟》继续保持 **dark-only**。

这是玩法需求，不是缺失功能。

Light theme：

- 可以改变外部 sidebar / drawer / overlay 的表面；
- Canvas 洞穴不能变亮；
- 不增加“白天洞穴”。

必须在 art verifier / smoke 中锁定这一点。

---

## 12. UI 调整范围

因为最近已经接入“现代科学展柜”，不要再整体改版。

只做与新美术衔接的局部优化：

- legend 使用新 rock / moss / crystal / exit 图标；
- start menu 的背景透明度降低，让洞穴暗场可见；
- level chip 保持现有结构；
- HUD 继续清晰显示 pulse / par；
- 不增加发光面板。

本次重点是 Canvas，不是重新设计 sidebar。

---

## 13. Fallback

现有程序渲染必须保留为 fallback。

状态：

```text
data-art-state="loading"
data-art-state="ready"
data-art-state="fallback"
```

如果贴图加载失败：

- 仍然可以玩；
- 仍然可以发 pulse；
- 墙体仍按当前程序方式显示；
- smoke 不应黑屏。

---

## 14. 性能预算

新增运行时 art：

```text
理想 ≤ 1.6 MB
硬上限 ≤ 2.2 MB
```

要求：

- rock texture 小尺寸可平铺；
- 无 20 套完整关卡位图；
- wall surface 每关只构建一次；
- reveal mask 增量更新；
- memory canvas 机制保留；
- 不引入 shader/WebGL；
- Canvas 2D 继续满足手机性能。

---

## 15. 新增校验

新增：

`tests/verify-echo-cave-art.mjs`

检查：

- manifest；
- 纹理尺寸；
- alpha；
- props SVG；
- 总字节；
- 没有 per-level baked map；
- dark/base layer 不引用关卡地图数据；
- source asset 引用完整。

现有：

`tests/verify-echo-cave-levels.mjs`

必须继续全绿。

---

## 16. Smoke 扩展

现有 `smoke-echo-cave.mjs` 已有真实 BFS 路径，这是优势。

增加：

### Art state

- production art ready；
- fallback 可玩。

### Anti-map-leak

关卡刚开始、未 pulse：

- 抽样 wall cell 与 floor cell 的视觉亮度差不能达到可识别路线的程度；
- 或通过内部 debug probe 验证 reveal mask 初值为 0。

### Pulse

发一次 pulse：

- reveal mask 增长；
- 普通岩壁出现；
- moss 不留下 memory。

### Memory

pulse 结束后：

- 已探索岩壁保留弱记忆；
- 未探索仍不可见。

### Gameplay

继续真实走：

- crystal；
- thorn；
- exit；
- level result；
- daily。

### verify-all 自动发现

`tests/verify-all.mjs` 按 `verify-*.mjs` / `smoke-*.mjs` 文件名自动发现校验器，并根据导入推断是否需要服务器。`verify-echo-cave-art.mjs` 是离线校验器，会自动进入 quick；现有 level verifier 和 browser smoke 无需手动登记，也不得降低或替换。

视口：

- 390×844；
- 430×932；
- 844×390；
- 1280×800；
- 1440×900。

---

## 17. 推荐文件变化

```text
assets/echo-cave/**
src/games/echo-cave/runtime.js
js/echo-cave-art.js
js/echo-cave-materials.js
css/echo-cave.css
tests/verify-echo-cave-art.mjs
tests/smoke-echo-cave.mjs
tests/verify-all.mjs
```

除非确有必要，不修改：

```text
src/games/echo-cave/model/rules.js
tests/verify-echo-cave-levels.mjs
css/science-showcase.css
css/layout.css
```

---

## 18. 实施阶段

### Phase 1 — dark / reveal 双概念稿
### Phase 2 — cave ambience + rock material pack
### Phase 3 — wall surface / reveal mask renderer
### Phase 4 — crystal / thorn / exit / player polish
### Phase 5 — legend / menu 小幅衔接
### Phase 6 — anti-map-leak test + smoke + verify

---

## 19. Definition of Done

只有同时满足以下条件才完成：

- 洞穴真正有岩石、湿气、苔藓和空间材质；
- 未发声时仍然无法提前识别路线；
- pulse 是唯一主要地图信息来源；
- moss 的吸音在视觉上成立；
- memory 机制完整；
- crystal / thorn / exit 不再只是简单几何；
- 20 关几何和 par 完全不变；
- level verifier 全绿；
- smoke 的真实可玩路径全绿；
- build / verify 全绿；
- art 失败时 fallback 仍可玩。

最终效果应是：

**玩家不是在黑底网格里走迷宫，而是在真正黑暗的洞窟里“用声音看见岩石”。**
