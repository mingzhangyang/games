# 《御剑飞行 Sword Flight》选择性美术升级实施计划

> 目标执行者：Codex  
> 仓库：`mingzhangyang/games`  
> 状态：待实施  
> 升级类型：**高质量程序美术保留 + 环境纹理与材质增强**

## 0. 核心判断：不要重做《御剑飞行》

《御剑飞行》是旧游戏中现有程序美术完成度最高的一款。

当前已经具备：

- 9 套关卡天穹色板；
- 三层视差山；
- 祥云；
- 太阳 / 月晕 / 丁达尔光；
- 悬浮仙岛；
- 瀑布；
- 仙环；
- 灵石；
- 悬崖 / 巨剑残骸；
- 雷劫；
- 魔禽；
- 精细飞剑；
- 剑仙角色；
- 衣袂 / 发带；
- verlet/segment 式飘带；
- 伴生剑阵；
- Thousand Swords 等大量动态特效。

因此本次升级**不是**把它改造成《萤火信号》式全图片场景。

正确策略是：

> 保留所有动态程序美术，只给“天空、山、云、岩石、仙岛、材质纹理”增加手绘生产美术底层，让程序效果从“高级 Canvas”升级成“程序动画运行在正式概念美术世界中”。

---

## 1. 绝对不能破坏的内容

必须保留：

```text
逻辑舞台 480×640
9 handcrafted stages
Endless
Daily
Zen
player flight physics
bank / tilt
dash
ring threading
ring combo
spirit stones
hazards
thunder
fiend birds
cultivation realms
satellite swords
Thousand Swords
leaderboard
daily seed
touch steering
touch action buttons
frame-budget
sidebar / drawer / topbar
```

尤其不要修改：

- 玩家碰撞；
- ring 几何；
- hazard 几何；
- stage spawn；
- scroll speed；
- par / scoring；
- cultivation thresholds；
- action cooldown；
- 现有角色和剑的动态姿态。

---

## 2. 哪些现有美术明确保留

以下代码不应被位图替代：

### 玩家飞剑与剑仙

`renderPlayer()`

继续程序绘制。

原因：

- 角度实时变化；
- bank / dash；
- 衣摆；
- 发带；
- 剑诀；
- realm visual；
- trail；
- 碰撞语义。

这部分本身就是游戏的视觉资产。

### 伴生飞剑

`renderSatelliteSwords()`

继续程序绘制。

### 仙环

`renderRings()`

继续程序绘制，以保证：

- 命中空间准确；
- combo；
- 动态发光；
- 音阶节奏。

### 雷、魔禽、灵石、粒子

继续动态 Canvas。

### 悬浮仙岛 / hazard 的位置与碰撞

仍由程序控制。

允许给它们加 texture/material，但不能烘成固定背景。

---

## 3. 本次真正要升级的部分

优先级：

1. 天空材质；
2. 远山；
3. 云海；
4. 仙岛岩石材质；
5. 光照统一；
6. 关卡之间的视觉叙事；
7. UI 字体与少量材质。

也就是说：

**做环境，不重做人。**

---

## 4. 九关环境美术架构

现有 9 关已经有明确色板和名字，不要丢掉。

建议继续保留 9 个视觉身份，但不需要每关几十张图。

建立：

```text
assets/sword-flight/
├── manifest.json
├── README.md
├── reference/
│   ├── chapter-dawn.webp
│   ├── chapter-void.webp
│   └── chapter-ascension.webp
├── skies/
│   ├── stage-01.webp
│   ├── stage-02.webp
│   ├── stage-03.webp
│   ├── stage-04.webp
│   ├── stage-05.webp
│   ├── stage-06.webp
│   ├── stage-07.webp
│   ├── stage-08.webp
│   └── stage-09.webp
├── mountains/
│   ├── ink-a.webp
│   ├── ink-b.webp
│   ├── ink-c.webp
│   └── ridge-highlight.webp
├── clouds/
│   ├── cloud-soft.webp
│   ├── cloud-storm.webp
│   └── cloud-gold.webp
└── textures/
    ├── crag.webp
    ├── ancient-stone.webp
    ├── giant-sword-metal.webp
    └── waterfall.webp
```

---

## 5. 为什么仍然保留 9 张 sky

现有九关的色彩叙事本身很好：

1. 青峦破晓；
2. 暮霞落日；
3. 剑冢古道；
4. 极光碧霄；
5. 星河浩瀚；
6. 劫雷云海；
7. 炽焰焚天；
8. 九幽罡风；
9. 登仙九霄。

如果只做一张手绘天空再 tint 九次，会把原本的关卡身份削弱。

因此制作 9 张轻量 sky plate。

但 sky plate 只负责：

- 云层大形；
- 天光；
- 远处色彩；
- 非交互氛围。

星辰、太阳/月、雷、电、近云仍可程序绘制。

建议每张：

`960×1280 WebP`

但压缩程度较高，单张目标 120–220 KB。

---

## 6. 三层视差山：保留程序运动，替换山体材质

当前 `generateMountainLayer()` 和三层 parallax 是优点。

不要直接改成三张固定 full-screen 山图。

方案：

### 6.1 继续由程序生成山体轮廓

山的：

- point set；
- parallax speed；
- scroll；
- vertical deformation

继续现有逻辑。

### 6.2 使用 authored mountain texture 填充轮廓

将：

- `ink-a.webp`
- `ink-b.webp`
- `ink-c.webp`

作为 pattern / clipped texture。

这样仍有实时山形和视差，但不再只是纯色 polygon。

材质方向：

- 水墨皴法；
- 青绿山水颗粒；
- 远山更平；
- 近山更有岩纹。

金线 ridge highlight 可以继续程序 stroke，但明显收敛。

---

## 7. 云升级：不要替换运动，只替换“云瓣几何感”

当前祥云由多个圆形径向渐变组成，视觉上容易看出“程序圆”。

保留：

- cloud x/y；
- speed；
- radius；
- opacity；
- movement。

渲染改为：

```text
cloud sprite / soft texture
+ procedural opacity
+ optional gold crest
```

三类云：

- soft：普通云海；
- storm：雷劫；
- gold：登仙 / 朝霞。

Cloud sprite 必须边缘自然，可随机镜像 / scale，避免重复感。

---

## 8. 悬浮仙岛与绝壁

现有位置和形状仍由程序生成。

升级方法：

### 岩体

在当前 polygon path 内 clip：

`textures/crag.webp`

叠加：

- 程序阴影；
- 少量边缘高光；
- moss / snow / fire 根据 stage tint。

### 瀑布

继续程序运动。

可用 `waterfall.webp` 作为细纹 noise，而不是整条动画图。

### 巨剑残骸

增加：

`giant-sword-metal.webp`

作为表面材质。

几何和碰撞保持。

---

## 9. 光照统一

现在不同元素各自有 glow，整体容易显得“每个东西都自己发光”。

本次做一次统一规则：

### 环境光

由 stage sky 决定一个：

```js
ambientLight = {
  warm,
  cool,
  rim,
  fog
}
```

程序绘制对象在 stage render 时引用它。

### 发光等级

仅允许强 glow：

- dash；
- ring threaded；
- lightning；
- Thousand Swords；
- breakthrough。

普通：

- 云；
- 山；
-角色衣服；
- 岩石；

不应常驻发光。

---

## 10. 三张视觉冻结稿

不需要画 9 张概念稿。

先冻结 3 个代表章节：

### A. Stage 1 — 青峦破晓

`reference/chapter-dawn.webp`

检验：

- 远山；
- 云；
- 飞剑；
- 朝光；
- 空间纵深。

### B. Stage 6 — 劫雷云海

`reference/chapter-void.webp`

检验：

- 暗紫风暴；
- 雷；
- storm cloud；
- silhouette。

### C. Stage 9 — 登仙九霄

`reference/chapter-ascension.webp`

检验：

- 高空；
- 金白光；
- 更开阔；
- 神圣但不白屏。

这 3 张确定画风后，再制作其余 sky plates。

---

## 11. Player 只做精修，不换 sprite

`renderPlayer()` 目前非常详细。

只建议调整：

- 减少常驻 shadowBlur；
- 飞剑钢刃加入更自然的金属渐变；
- 道袍颜色受 ambient light 微调；
- 皮肤 / 白衣不要过亮发白；
- 赤霞流苏降低 glow；
- realm 3+ 法轮降低常驻存在感；
- dash 时再提升高光。

不要：

- 生成一个固定“剑仙 PNG”替代；
- 改角色轮廓；
- 改剑尖位置；
- 改 ribbon nodes。

---

## 12. 关卡美术与玩法对象对应

各 stage 至少明确一个环境 signature：

| Stage | Signature |
| --- | --- |
| 1 | 青山晨雾 |
| 2 | 金橙落日绝壁 |
| 3 | 古剑冢 / 冷石 |
| 4 | 碧青极光云海 |
| 5 | 星河深空 |
| 6 | 紫电劫云 |
| 7 | 赤焰火云 |
| 8 | 九幽灰黑罡风 |
| 9 | 金白登仙云门 |

这些 signature 由 sky + mountain texture tint + cloud family + hazard material组合实现。

不需要新增玩法机制。

---

## 13. UI 小幅升级

《御剑飞行》不需要 UI 大改。

只处理：

### 字体

历史评审指出 `Noto Serif SC` 没有可靠加载。

不要依赖网络字体。

选择：

- 明确的系统中文衬线 fallback；
- 或仓库已经允许的本地/系统字体栈。

重点是跨平台一致性，不新增外部 CDN 依赖。

### 模式菜单

- 去掉不必要 emoji；
- 使用正式 ring / sword / daily SVG；
- 背景更透明，让 stage preview 可见；
- 不改菜单信息结构。

### Sidebar

只调整材质和 hierarchy，不重构。

---

## 14. Theme

游戏世界继续保持其自身天境色彩。

Light / Dark 主要控制：

- topbar；
- sidebar；
- drawer；
- overlay。

不要为 9 个 stage 再做 9 个 light 版本。

---

## 15. Art loader 与模块拆分

建议新增：

```text
js/sword-flight-art.js
js/sword-flight-scene.js
```

### `sword-flight-art.js`

负责：

- manifest；
- sky lazy load；
- cloud textures；
- mountain textures；
- fallback；
- preload next stage。

### `sword-flight-scene.js`

负责：

- sky plate；
- mountain patterned fill；
- cloud sprite draw；
- crag texture helpers；
- ambient light。

主 `sword-flight.js` 继续负责：

- physics；
- gameplay；
- stage state；
- dynamic objects；
- player；
- FX。

---

## 16. 加载策略

不要一次加载 9 套 sky。

开始菜单：

- preload Stage 1；
- 当前已选择 stage 对应 sky；
- 游戏进行时后台 preload 下一 stage；
- Endless / Daily 根据确定性选用的 stage family 加载。

素材失败：

- 回落当前程序 `renderSkyDome/renderMountains/renderClouds`；
- 游戏不黑屏。

状态：

```text
data-art-state="loading"
data-art-state="ready"
data-art-state="fallback"
```

---

## 17. 性能预算

这是选择性升级，不应把包体做大。

目标：

```text
首关新增首屏资源 ≤ 900 KB
单个 stage sky ≤ 220 KB
全部 sword-flight 新增 art ≤ 3.5 MB
同时 decode 的新增 raster ≤ 1.8 MB
```

要求：

- lazy stage sky；
- cloud texture 小图；
- mountain texture 可平铺；
- 不常驻 9 张大图；
- 不引入 WebGL；
- 不使用 CSS filter 替代 Canvas 合成。

---

## 18. 新增校验

新增：

`scripts/verify-sword-flight-art.mjs`

检查：

- 9 sky plate 齐全；
- 3 mountain texture；
- cloud family；
- manifest；
- 图片尺寸；
- 资源预算；
- lazy-load mapping；
- stage id 1–9 一一对应。

---

## 19. Smoke / 回归

如果当前没有专属 `smoke-sword-flight.mjs`，本次应新增；如果已有其他综合覆盖，则拆出专属 smoke。

至少测试：

### Modes

- Stage 1；
- Stage 6；
- Stage 9；
- Endless；
- Daily；
- Zen。

### Gameplay

- steering；
- ring thread；
- dash；
- spirit stone；
- hazard；
- lightning；
- realm breakthrough；
- sword array；
- Thousand Swords。

### Art

- current sky ready；
- stage change 后 sky 正确；
- next-stage lazy preload；
- fallback；
- mountain parallax 仍移动；
- clouds 仍移动；
- artwork 不改变 hitboxes。

### Responsive

- 390×844；
- 430×932；
- 844×390；
- 1280×800；
- 1440×900。

特别复验历史坑：

**stage aspect-ratio 不得因固定 height 再次失真。**

---

## 20. 截图验收

至少输出：

1. Stage 1 青峦破晓
2. Stage 2 暮霞
3. Stage 3 剑冢
4. Stage 4 碧霄
5. Stage 5 星河
6. Stage 6 雷劫
7. Stage 7 焚天
8. Stage 8 九幽
9. Stage 9 登仙
10. dash
11. ring harmony
12. realm breakthrough
13. sword array
14. Thousand Swords
15. mobile landscape
16. desktop

对比重点：

- 新环境是否有“手绘世界”质感；
- 动态程序元素是否仍然是主角；
- 飞剑和剑仙是否没有被背景吞掉；
- 每关身份是否比原来的纯 palette 更明确；
- 不能出现“背景图很高级，但角色像另一款游戏”的割裂。

---

## 21. 推荐文件变化

```text
assets/sword-flight/**
js/sword-flight.js
js/sword-flight-art.js
js/sword-flight-scene.js
css/sword-flight.css
scripts/verify-sword-flight-art.mjs
scripts/smoke-sword-flight.mjs
```

非必要不要改：

```text
游戏 physics
关卡生成
leaderboard
daily
shared layout
```

---

## 22. 实施阶段

### Phase 1 — 三张章节冻结稿
### Phase 2 — 9 sky plates + mountain/cloud texture pack
### Phase 3 — scene helper / lazy loader
### Phase 4 — mountains/clouds/crags 材质接入
### Phase 5 — ambient light + player 小幅精修
### Phase 6 — UI 小改 + smoke + art verifier + 全量回归

---

## 23. Definition of Done

升级完成时：

- 9 个 stage 的身份比现在更鲜明；
- 天空不再只是程序渐变；
- 山不再只是纯色 polygon；
- 云不再明显由径向圆瓣组成；
- 仙岛与绝壁有真实材质；
- 玩家、飞剑、仙环、雷、剑阵仍保持现有动态程序优势；
- 所有碰撞和玩法参数完全不变；
- 首屏新增资源控制在预算内；
- stage 资源按需加载；
- art 失败时现有程序美术可完整 fallback；
- verify / build / smoke 全绿。

最终目标：

**不是把《御剑飞行》重做成一款“图片游戏”，而是让它现有优秀的动态 Canvas 美术真正站在一套高质量东方幻想世界里。**
