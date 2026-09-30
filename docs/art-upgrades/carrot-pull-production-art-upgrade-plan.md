# 《拔萝卜 Carrot Pull》完整美术升级实施计划

> 目标执行者：Codex  
> 仓库：`mingzhangyang/games`  
> 状态：已实施（#27 / #28 / #30）；实际落地的运行时契约与本计划有偏差，见 §0.1。**冲突时以 `assets/carrot-pull/manifest.json` 为准**  
> 目标：把《拔萝卜》从当前大型内联 SVG 卡通场景升级为与《萤火信号》《影织》同一完成度等级的正式分层美术管线。

## 0. 任务目标

对现有《拔萝卜 Carrot Pull》进行一次**完整生产级美术升级**。

目标不是重新设计玩法，也不是简单换配色，而是把它从当前“程序绘制的大型 SVG 卡通场景”升级为：

- 有明确的美术原画作为视觉真源；
- 有正式分层 WebP / SVG 素材；
- 前景、中景、远景、角色、土地遮挡关系清晰；
- 美术素材真正参与游戏动画；
- UI 从“网页组件感”降低到“游戏场景附属界面”；
- 手机上第一眼看到的是一个完整、精致、可爱的菜园，而不是一块 UI 面板；
- 保留已有拔萝卜节奏玩法、得分、计时、音效、响应式结构、统计抽屉、主题和可访问性。

这次升级完成后，《拔萝卜》应成为旧游戏美术升级的范本。

## 0.1 实施后偏差（as-built，2026-09-27）

本文是实施前的计划，下文的锚点、挂点、图层清单与 SVG 骨架保留原样以便对照；**当前运行时契约是 `assets/carrot-pull/manifest.json`**，
由 `tests/verify-carrot-pull-art.mjs` 与 `tests/smoke-carrot-pull.mjs` 双向锁定（HTML 初始变换、`SCENE`、`PRODUCTION_ATTACH`、
拳头裁切框、绘制顺序都逐项与 manifest 比对）。与计划不同之处：

| 计划 | 实际落地 | 原因 |
| --- | --- | --- |
| §6 锚点 carrot `316,506` / girl `186,692` / mole `482,612 ×0.90` | carrot `352,506` / girl `250,664 ×0.94` / mole `466,632 ×0.54` | 女孩站到萝卜后方、手伸进叶丛；鼹鼠贴着萝卜并缩小 |
| §6 / §7.2 `girl.hands` 三点、`carrot.crown` 三点 | `girl.fists` 五点（带 `overlayClipLocalLogicalPx`）、`carrot.crown` 五点（橙色根体顶端） | 旧挂点落在萝卜精灵的叶尖，连线成了横穿女孩脸前的绿条 |
| §8 `girl-hands.webp` 独立盖住叶茎 | 删除；改为同一张女孩精灵裁到拳头重绘（`#cp-girl-fists` + `#cp-girl-fists-clip`） | 女孩精灵自带双臂和握拳，再叠一层就是两双胳膊 |
| §6 / §8 `mole.paws` / `mole-paws.webp` / 鼹鼠叶茎 | 不存在 | #27 上线过，#28 作为残留叠层删除；verifier 禁止其回到运行时契约 |
| §8 `clouds` / `hills-farm` / `garden-mid` / `soil-back` 参与绘制 | 仍在资源包与 manifest，但运行时不绘制也不预载 | 导出错位（挤在画布顶部 1/3），`sky.webp` 已是完整画作 |
| §7.2 `dynamicZ`：`moleStems 55` / `molePaws 65` / `girlStems 75` / `girlHands 80` | `leafStems 49` / `girlFists 80` / `tugLines 115`；鼹鼠 z `48` | 叶柄画在萝卜下面，只露出拳头到叶缘一段 |
| §9 SVG 骨架：carrot → stems-mole → mole → girl → stems-girl → girl-hands | sky → mole(48) → stems-girl(49) → carrot(50) → girl(70) → girl-fists(80) → soil-front(90) → foreground(100) → particles(110) → tug-lines(115) → hit(120) | 同上；顺序由 verifier 按 z 严格升序校验 |

事故经过见 `docs/traps.md`「拔萝卜手机版」条目。

## 1. 硬性范围

### 必须保留

当前玩法逻辑已经成立，不要借美术升级重写游戏。

下列值和规则默认不得改变：

```js
TOTAL_CARROTS = 6
ROUND_TIME = 45
TARGETS
PULLS_NEEDED
得分规则
连击规则
失误扣 1 秒
BEST_KEY = 'cp_best_score'
```

必须继续支持：

- 点击“用力拔”
- 点击萝卜本身
- Space / ↑
- 后台自动暂停和回来自动恢复
- Desktop sidebar
- Mobile stats drawer
- Light / Dark theme
- 中英文
- reduced motion
- 当前 analytics
- 当前 best score
- 当前 6 根萝卜完整流程

**不要修改游戏难度和玩法手感。**

## 2. 不做的事情

本 PR 不做以下改造：

- 不把 Carrot Pull 改成 `immersive` layout；
- 不删除 sidebar / drawer / frame-budget；
- 不加排行榜；
- 不加每日挑战；
- 不改计分机制；
- 不引入 Canvas 游戏引擎；
- 不把现有 DOM/SVG 动画整个推倒重写；
- 不为了“高级感”加入霓虹、玻璃发光或 3D 塑料质感；
- 不用 CSS 几何图形或大量手写 `<path>` 冒充正式美术资产。

继续使用当前 `standard` layout。

## 3. 美术方向

### 3.1 风格

定位：

**现代儿童绘本 × 手绘田园 × 清新轻卡通**

视觉关键词：

- gouache / 水粉质感
- 彩铅细节
- 柔和自然光
- 清新的空气感
- 温暖土壤
- 柔和但丰富的绿色
- 明亮胡萝卜橙
- 少量自然纹理
- 深棕色而不是纯黑描边
- 圆润、亲切、具有手绘不规则感

避免：

- AI 塑料光泽
- Pixar 式 3D
- 扁平企业插画
- emoji 质感
- 粗重黑描边
- 高饱和霓虹
- 大面积渐变发光
- UI 卡片覆盖整个场景

角色设定继续沿用现有版本：

- 左侧：戴草帽、穿青绿色背带裤和黄色雨靴的小女孩
- 中央：巨大胡萝卜
- 右侧：帮忙拔萝卜的小鼹鼠

不要改变人物身份和整体构图关系。

## 4. 首先制作一张“美术冻结稿”

不要一开始独立生成十几张图。

先制作：

```text
assets/carrot-pull/reference/concept-garden.webp
```

逻辑构图：

```text
天空
 ↓
云 / 阳光
 ↓
远山 / 农舍 / 树木
 ↓
草地 / 木栅栏
 ↓
菜畦 / 水壶 / 花草
 ↓
女孩 ← 大萝卜 → 鼹鼠
 ↓
土地
 ↓
前景叶片 / 花朵 / 土块
```

相机角度和现有游戏基本一致。

要求：

- 角色比例在 390px 手机宽度下仍清楚；
- 胡萝卜是绝对视觉焦点；
- 女孩、萝卜、鼹鼠形成清晰三角构图；
- 不把重要内容放在顶部 HUD 覆盖区；
- 不包含任何文字；
- 不生成 UI；
- 不生成假的按钮；
- 不出现额外人物；
- 手指数量、四肢、工具必须正常；
- 栅栏和角色不能错误穿插；
- 光源统一从右上 / 上方进入。

只有冻结稿成立后，再从同一视觉来源拆图。

**禁止分别用完全独立 prompt 生成各层。**

否则人物比例、光线、透视和颜色会漂移。

## 5. 新的素材目录

建立：

```text
assets/carrot-pull/
├── manifest.json
├── README.md
├── reference/
│   └── concept-garden.webp
├── layers/
│   ├── loading-preview.webp
│   ├── sky.webp
│   ├── clouds.webp
│   ├── hills-farm.webp
│   ├── garden-mid.webp
│   ├── soil-back.webp
│   ├── soil-front.webp
│   └── foreground.webp
├── sprites/
│   ├── carrot.webp
│   ├── girl-happy.webp
│   ├── girl-oops.webp
│   ├── girl-hands.webp
│   ├── mole-happy.webp
│   ├── mole-oops.webp
│   └── mole-paws.webp
└── ui/
    ├── carrot-mark.svg
    └── pull-arrow.svg
```

## 6. 场景坐标契约

> ⚠️ 本节的锚点与挂点已被 §0.1 取代（实施前数值，仅供对照）。

**不得改变现有逻辑坐标系。**

继续使用：

```text
logical scene = 560 × 720
production raster = 1120 × 1440
scale = 2
```

这样现有动画参数无需整体重标。

现有三个关键锚点必须保持：

```js
carrot = { x: 316, y: 506 }
girl   = { x: 186, y: 692, scale: 0.94 }
mole   = { x: 482, y: 612, scale: 0.90 }
```

现有握持连接点也必须继续成立：

```js
girlHands = [
  [38, -218],
  [32, -210],
  [26, -200]
]

molePaws = [
  [-70, -46],
  [-60, -22]
]

carrotCrown = [
  [-8, -22],
  [0, -24],
  [8, -22]
]
```

Codex 应根据现有 SVG 角色实际 bounding box 测量 sprite 的 local rectangle，并写入 `manifest.json`。

**不要凭感觉重新猜坐标。**

## 7. manifest.json

这份 manifest 是**运行时坐标契约**，不是仅供参考的素材清单。最终文件必须把单位、层级、裁切矩形、目标矩形、pivot 和 attachment 全部写清楚，禁止让 renderer 自己猜。

### 7.1 坐标与单位

统一规则：

- `logical-px`：游戏逻辑坐标，原点左上，x 向右，y 向下；场景固定 `560×720`。
- `raster-px`：源图片像素；production raster 按 `2×` 输出。
- `sourceRectRasterPx`：在源图片中的裁切框，格式 `[x, y, w, h]`。
- `destRectLogicalPx`：绘制到逻辑场景中的矩形，格式 `[x, y, w, h]`。
- `localRectLogicalPx`：sprite 相对其 legacy transform 原点的逻辑包围框，格式 `[minX, minY, w, h]`。
- `pivotLocalLogicalPx`：sprite 旋转/缩放原点；Carrot Pull 继续使用现有 SVG group 的 transform 原点，因此角色主体默认为 `[0, 0]`。
- `sceneAnchorLogicalPx`：把 pivot 放到场景中的位置。
- `z`：严格升序绘制；同 z 禁止依赖对象枚举顺序。
- attachment 的坐标空间固定写成 `sprite-local-logical-px`，不能混用 raster 坐标。

### 7.2 规范示例

> ⚠️ 示例里的 anchors / attachments / dynamicZ 是实施前的数值，现行值见 §0.1 与 `manifest.json`。

下面是最终 manifest 的**结构性规范**。其中 `MEASURED_*` 表示 Phase 1 必须从现有 SVG 实测后写入的数值；这些占位符不得出现在提交后的正式 `manifest.json`。

```jsonc
{
  "version": 1,
  "coordinateSystem": {
    "unit": "logical-px",
    "origin": "top-left",
    "xAxis": "right",
    "yAxis": "down",
    "width": 560,
    "height": 720,
    "rasterScale": 2
  },
  "anchors": {
    "carrot": [316, 506],
    "girl": [186, 692],
    "mole": [482, 612]
  },
  "layers": [
    {
      "id": "sky",
      "file": "layers/sky.webp",
      "z": 10,
      "sourceRectRasterPx": [0, 0, 1120, 1440],
      "destRectLogicalPx": [0, 0, 560, 720],
      "alphaRequired": false
    },
    {
      "id": "soil-front",
      "file": "layers/soil-front.webp",
      "z": 90,
      "sourceRectRasterPx": [0, 0, 1120, 1440],
      "destRectLogicalPx": [0, 0, 560, 720],
      "alphaRequired": true
    },
    {
      "id": "foreground",
      "file": "layers/foreground.webp",
      "z": 100,
      "sourceRectRasterPx": [0, 0, 1120, 1440],
      "destRectLogicalPx": [0, 0, 560, 720],
      "alphaRequired": true
    }
  ],
  "sprites": {
    "carrot": {
      "file": "sprites/carrot.webp",
      "z": 50,
      "rasterSizePx": ["MEASURED_W", "MEASURED_H"],
      "sourceRectRasterPx": [0, 0, "MEASURED_W", "MEASURED_H"],
      "localRectLogicalPx": ["MEASURED_MIN_X", "MEASURED_MIN_Y", "MEASURED_W_DIV_2", "MEASURED_H_DIV_2"],
      "pivotLocalLogicalPx": [0, 0],
      "sceneAnchorLogicalPx": [316, 506],
      "alphaRequired": true
    },
    "girl-happy": {
      "file": "sprites/girl-happy.webp",
      "z": 70,
      "rasterSizePx": ["MEASURED_W", "MEASURED_H"],
      "sourceRectRasterPx": [0, 0, "MEASURED_W", "MEASURED_H"],
      "localRectLogicalPx": ["MEASURED_MIN_X", "MEASURED_MIN_Y", "MEASURED_W_DIV_2", "MEASURED_H_DIV_2"],
      "pivotLocalLogicalPx": [0, 0],
      "sceneAnchorLogicalPx": [186, 692],
      "scale": 0.94,
      "alphaRequired": true
    },
    "mole-happy": {
      "file": "sprites/mole-happy.webp",
      "z": 60,
      "rasterSizePx": ["MEASURED_W", "MEASURED_H"],
      "sourceRectRasterPx": [0, 0, "MEASURED_W", "MEASURED_H"],
      "localRectLogicalPx": ["MEASURED_MIN_X", "MEASURED_MIN_Y", "MEASURED_W_DIV_2", "MEASURED_H_DIV_2"],
      "pivotLocalLogicalPx": [0, 0],
      "sceneAnchorLogicalPx": [482, 612],
      "scale": 0.9,
      "alphaRequired": true
    }
  },
  "attachments": {
    "carrot.crown": {
      "sprite": "carrot",
      "space": "sprite-local-logical-px",
      "points": [[-8, -22], [0, -24], [8, -22]]
    },
    "girl.hands": {
      "sprite": "girl-happy",
      "space": "sprite-local-logical-px",
      "points": [[38, -218], [32, -210], [26, -200]]
    },
    "mole.paws": {
      "sprite": "mole-happy",
      "space": "sprite-local-logical-px",
      "points": [[-70, -46], [-60, -22]]
    }
  },
  "dynamicZ": {
    "moleStems": 55,
    "molePaws": 65,
    "girlStems": 75,
    "girlHands": 80,
    "particles": 110,
    "hitTarget": 120
  }
}
```

### 7.3 测量规则

Phase 1 必须从现有 SVG 实测每个角色 group 的 local bounds，并把实际数字写入最终 manifest。严禁手工“目测”或通过导出图片尺寸反推。

Verifier 必须检查：

- 所有 `MEASURED_*` 占位符已经消失；
- `rasterSizePx = localRectLogicalPx.size × rasterScale`，允许因像素取整有 ±1 px；
- 所有 full-scene layer 的 source/dest 比例一致；
- `sceneAnchorLogicalPx` 与现有三个 anchor 完全相同；
- attachment points 与当前 `SCENE` 常量完全相同；
- z-order 无冲突且符合本节约定。

不要把任何这些坐标重新散落到 HTML。

## 8. 各美术层职责

> ⚠️ `girl-hands.webp` / `mole-paws.webp` 未采用；clouds / hills-farm / garden-mid / soil-back 当前不绘制。见 §0.1。

| 素材 | 内容 |
| --- | --- |
| `sky.webp` | 天空、柔和阳光和空气色 |
| `clouds.webp` | 独立透明云层，可极缓慢漂移 |
| `hills-farm.webp` | 山坡、树林、农舍远景 |
| `garden-mid.webp` | 栅栏、菜畦、水壶、远处花草 |
| `soil-back.webp` | 角色后方土地与萝卜洞 |
| `soil-front.webp` | 遮住萝卜根部、鼹鼠身体的前方土垄 |
| `foreground.webp` | 最靠近镜头的叶片、雏菊、草 |
| `carrot.webp` | 完整胡萝卜与叶冠 |
| `girl-*` | 女孩开心 / 失误状态 |
| `girl-hands.webp` | 必须独立，用于盖住实时叶茎 |
| `mole-*` | 鼹鼠开心 / 失误状态 |
| `mole-paws.webp` | 独立，用于盖住实时叶茎 |

透明图层必须：

- 真 RGBA；
- 清除黑边 / 白边；
- 无半透明矩形背景；
- 无 AI 生成的文字；
- 所有素材光源一致。

## 9. 保留 SVG 作为“场景合成器”

> ⚠️ 下方 SVG 骨架是实施前的层序；现行层序见 §0.1 最后一行。

不要切到 Canvas。

当前 SVG 有一个非常好的优势：

- 角色 transform 已经成熟；
- 手、爪、叶茎的遮挡关系已经实现；
- `cp-carrot-hit` 点击热区已经存在；
- 动态路径已经存在；
- CSS 动效和 SVG 坐标很好结合。

因此新的结构应当仍是：

```html
<svg id="cp-scene" viewBox="0 0 560 720">
  <!-- background -->
  <image ... sky />
  <image ... clouds />
  <image ... hills />
  <image ... garden />
  <image ... soil-back />

  <!-- carrot -->
  <g id="cp-carrot">
    <image ... />
  </g>

  <!-- stems behind characters -->
  <g id="cp-stems-mole">...</g>

  <!-- mole -->
  <g id="cp-mole">...</g>
  <g id="cp-mole-paws">...</g>

  <!-- girl -->
  <g id="cp-girl">...</g>
  <g id="cp-stems-girl">...</g>
  <g id="cp-girl-hands">...</g>

  <!-- foreground occlusion -->
  <image ... soil-front />
  <image ... foreground />

  <!-- particles / hit target -->
  ...
</svg>
```

把当前几百行描述背景、人物、胡萝卜的 path 删除。

最终 `carrot-pull.html` 不应该再是一份巨大的 SVG 插画源码。

## 10. 抽离场景模块

新增：

```text
js/carrot-pull-scene.js
```

把当前 `createScene()` 以及下面这些内容迁进去：

- `SCENE`
- `place()`
- `stemPath()`
- hit animation
- miss animation
- harvest animation
- particle burst
- `tick()`

保持 API：

```js
const scene = createCarrotScene(...);

scene.hit();
scene.miss();
scene.harvest(now);
scene.reset();
scene.tick(now, progress, playing);
```

`js/carrot-pull.js` 继续负责：

- 游戏状态
- 计时
- needle
- scoring
- round
- i18n
- drawer
- chrome
- analytics

**美术代码和玩法代码正式解耦。**

## 11. 素材加载方式

新增：

```text
js/carrot-pull-art.js
js/carrot-pull-fallback-scene.js
```

生产素材使用：

```js
new URL('../assets/carrot-pull/...', import.meta.url)
```

确保 Vite 正确打包并 hash；不要在 JS 里拼裸相对字符串。

### 11.1 正常加载

1. 页面初始只显示 `layers/loading-preview.webp`，它只是短暂 loading placeholder，**不是故障 fallback**；
2. 并行 preload 所有 critical production layers / sprites；
3. 全部 critical 资源成功后初始化 production scene；
4. production scene ready 后 150–200ms crossfade 掉 loading preview；
5. reduced motion 下直接切换；
6. 设置 `data-art-state="ready"`。

### 11.2 故障 fallback 必须仍可动画

如果任何 critical production asset 加载失败：

- **不能**只留下静态 `loading-preview.webp`；
- 切换到 `js/carrot-pull-fallback-scene.js`；
- 该模块保留当前 SVG renderer 的女孩、鼹鼠、萝卜、手/爪、叶茎和 harvest 动画；
- fallback scene 必须实现与 production scene 相同的：
  - `hit()`
  - `miss()`
  - `harvest(now)`
  - `reset()`
  - `tick(now, progress, playing)`
- 游戏输入、得分、计时和关卡逻辑不需要知道当前使用哪个 renderer；
- 不抛 uncaught error；
- 设置 `data-art-state="fallback"`。

这意味着“删除大型内联 SVG”是把旧 renderer 从 HTML **迁出并模块化为 fallback**，而不是彻底删除其动画能力。

暴露：

```text
data-art-state="loading"
data-art-state="ready"
data-art-state="fallback"
```

供 smoke test 使用。

## 12. 现有动画必须升级而不是丢掉

当前版本以下动画是优点：

- 每次正确拔动，萝卜逐渐上升；
- 女孩向后发力；
- 鼹鼠协同拉扯；
- 叶茎实时连接手 / 爪；
- miss 时角色出现 “oops”；
- 胡萝卜拔出后飞起来；
- 新萝卜从土里重新冒出来；
- 土块和火花飞散。

这些必须全部保留。

生产美术接入后：

### Hit

- 女孩身体后仰；
- 鼹鼠跟随发力；
- 萝卜上移；
- 土壤轻微松动；
- 小型土粒飞出。

### Perfect

除普通 hit 外：

- 胡萝卜顶部有短暂暖色高光；
- 前景叶片产生一次非常轻的响应；
- 不出现大型“PERFECT”文字。

### Miss

切换：

```text
girl-happy → girl-oops
mole-happy → mole-oops
```

同时保留轻微 shake。

### Harvest

必须继续看到：

1. 萝卜完整出土；
2. 飞过角色上方；
3. 女孩 / 鼹鼠受力跳动；
4. 土块大量飞出；
5. 新萝卜从土地中冒出来。

## 13. 环境微动

增加非常克制的环境生命感：

- clouds：极慢漂移；
- foreground：轻微风摆；
- 个别叶片偶尔摆动；
- 正确 pull 时前景植物轻微响应。

禁止：

- 整个画面不停晃；
- 大量循环粒子；
- 常驻发光；
- 过度 parallax。

`prefers-reduced-motion` 时全部环境循环动画停止。

## 14. UI 美术同步更新

这次不能只换场景。

### 顶栏

继续使用共享 `game-topbar`，但 Carrot Pull 局部视觉改成：

- 深墨绿 / 奶油白；
- 哑光；
- 细边框；
- 不发光。

### Controls

当前 meter + Pull button 保留交互结构。

重新视觉化为：

**“菜园木牌 / 种子包装”式控制区**

Meter：

- 柔和米色 / 木色轨道；
- sweet spot 用植物绿色；
- 同时有轮廓和文字，不只靠颜色；
- needle 改为小叶片 / 木夹式指针。

Pull button：

- 胡萝卜橙；
- 无玻璃质感；
- 按下产生真实压低感；
- hover 不发光。

### Start overlay

不要再像普通 web modal。

改成：

- 小面积奶油色纸张 / 种子袋卡片；
- 后面的菜园仍能明显看到；
- 保留三步玩法说明；
- 不覆盖整张美术。

### Result

继续使用结果层，但加入“丰收”的视觉感：

- 温暖纸张卡片；
- 胡萝卜 / 叶片小装饰；
- 不做 confetti；
- 不做夸张发光。

## 15. 删除 emoji 降级元素

当前：

```text
🥕 progress dots
🥕 start mini mark
↟ pull arrow
```

全部清理。

`cp-progress-dots` 改用：

```text
assets/carrot-pull/ui/carrot-mark.svg
```

状态：

```text
未收获：轮廓 / 低透明
已收获：橙色完整胡萝卜
```

保留每一项的 aria-label。

`pull arrow` 使用正式 SVG。

## 16. Light / Dark

场景本身保持同一个明亮田园版本。

不要制作“夜晚菜园”作为 dark theme。

Light / Dark 只影响：

- topbar
- controls
- overlay
- sidebar
- footer

即：

**主题控制 UI，不改变游戏世界的时间。**

这样不会出现两套昂贵的 production art。

## 17. 性能预算

运行时正式场景素材目标：

```text
≤ 2.0 MB 理想
≤ 2.5 MB 硬上限
```

`concept-garden.webp` 不进入运行时 bundle。

要求：

- WebP
- raster 2×
- DPR 不需要再制作 3×
- alpha 图层裁掉不必要的大量透明边缘时，必须在 manifest 保留定位
- 不加入第三方图片运行库
- 不加入大型 animation library

空闲菜单状态不能因为环境动效永久以 60fps 高负载运行。

## 18. 新增离线美术校验器

新增：

```text
tests/verify-carrot-pull-art.mjs
```

至少检查：

- manifest 可解析；
- 所有 manifest 文件存在；
- 所有 runtime 资产非空；
- full-scene layer 尺寸符合契约；
- sprite 尺寸与 manifest 一致；
- 所需透明层具备 alpha；
- happy/oops/hands/paws 齐全；
- manifest 中不存在 `MEASURED_*` 占位符；
- anchors / attachments / z-order 符合 §7；
- runtime art 总字节数不超过硬上限；
- HTML / JS 没有引用不存在的 asset；
- production HTML 不再包含大型旧插画 path；
- legacy SVG renderer 仅存在于明确的 fallback 模块。

### 18.1 必须注册到 verify-all

`tests/verify-all.mjs` 使用固定 `SUITE`，不会自动发现新脚本。实现时必须显式加入：

```js
{ name: 'carrot-pull-art', script: 'tests/verify-carrot-pull-art.mjs', args: [], needsServer: false },
{ name: 'smoke-carrot-pull', script: 'tests/smoke-carrot-pull.mjs', args: [], needsServer: true },
```

并把：

```text
carrot-pull-art
```

加入 `QUICK_NAMES`。Art verifier 是纯离线低成本检查，应进入 quick；浏览器 smoke 保留在 full suite，除非实测运行成本足够低后再单独决定是否进入 quick。

不要为此引入重量级 npm 图片依赖；必要时实现小型 WebP header reader。

## 19. 新增 Carrot Pull smoke test

当前仓库没有 Carrot Pull 专属 smoke。

新增：

```text
tests/smoke-carrot-pull.mjs
```

加入完整 verify suite。

至少测试：

### 资源

正常路径：

- `data-art-state === "ready"`
- 没有 404
- 没有 pageerror
- production layers 已加载

故障路径必须单独跑一次：

- 使用 Puppeteer request interception 主动 abort 一个 critical production asset；
- 断言 `data-art-state === "fallback"`；
- 没有 unhandled `pageerror`；
- Start 仍可点击；
- 正确 pull 仍能让萝卜上移；
- miss 仍能进入 oops；
- harvest 仍能完成“出土 → 飞起 → 下一根出现”；
- fallback renderer 与 production renderer 共用同一 gameplay state，不允许重新实现计分逻辑。

### Start

- 开始页可见
- Start 可点击
- 手机无裁切

### 正确 Pull

测试里把：

```js
cpGame.state.needle = cpGame.state.target
```

随后使用**真实 pointer input**点击 Pull。

断言：

- pulls +1
- score 增加
- carrot transform 上升
- scene 没有断裂

### Miss

把 needle 放在目标外后真实点击。

断言：

- streak 清零
- time -1
- oops 状态出现

### Harvest

连续完成本轮需要的正确点击。

断言：

- round +1
- harvest 动画启动
- carrot 明显向上飞出
- 下一根重新出现

### Win

完整完成 6 根萝卜。

断言：

- result 在最后一次 harvest 后显示
- final score 正确
- best score 写入
- analytics 不导致错误

### Input

验证：

- Pull button
- carrot hit area
- Space
- ArrowUp

### Responsive

至少：

```text
390×844
430×932
844×390
1280×800
1440×900
```

验证：

- 无水平滚动
- 场景没有变形
- 控件不遮住萝卜核心区域
- sidebar 在桌面可见
- drawer 在移动端可用

### Reduced motion

模拟：

```text
prefers-reduced-motion: reduce
```

必须：

- 可正常完成游戏；
- 无动画相关异常。

## 20. 截图验收状态

在提交 PR 前至少人工检查以下画面：

1. 手机开始页
2. 手机游戏中
3. 正确 Pull
4. Miss / oops
5. 胡萝卜飞出瞬间
6. 大丰收结果页
7. Desktop + sidebar
8. 手机横屏
9. Light UI
10. Dark UI

重点观察：

- 女孩手是否真的握住叶子；
- 鼹鼠爪子是否真的握住叶子；
- 萝卜飞出时有没有穿过土层错误；
- soil-front 是否正确遮挡根部；
- 人物是否漂浮；
- WebP 是否有透明白边；
- 角色和背景是否像来自同一幅画；
- 390px 屏幕上人物表情是否仍可辨认。

## 21. 推荐文件变化

预计主要改动：

```text
assets/carrot-pull/**
carrot-pull.html
css/carrot-pull.css
js/carrot-pull.js
js/carrot-pull-art.js
js/carrot-pull-scene.js
js/carrot-pull-fallback-scene.js
tests/verify-carrot-pull-art.mjs
tests/smoke-carrot-pull.mjs
tests/verify-all.mjs
```

非必要不要修改：

```text
css/layout.css
css/tokens.css
js/game-frame.js
js/game-drawer.js
js/game-chrome.js
```

如果为了 Carrot Pull 修改共享契约，必须说明为什么无法在页面层解决。

## 22. 实施顺序

### Phase 1 — 美术契约

先完成：

- concept
- manifest
- layer list
- sprite anchors
- composite preview

不要先改玩法代码。

### Phase 2 — Production assets

完成全部 WebP / SVG。

这一步完成之前，不允许用临时几何图形宣布“美术升级完成”。

### Phase 3 — Renderer migration

- 新建 `carrot-pull-art.js`
- 新建 `carrot-pull-scene.js`
- 把 production scene 的 SVG path 插画换成 image layer
- 把现有 SVG scene renderer 迁到 `carrot-pull-fallback-scene.js`
- production / fallback 两个 renderer 保持同一 scene animation API

### Phase 4 — UI polish

更新：

- stage frame
- controls
- meter
- start
- result
- progress carrot icons

### Phase 5 — Tests

增加：

- art verifier
- smoke test
- responsive regression

### Phase 6 — QA

全套截图检查 + 全量 verify。

## 23. Git 工作流

从最新 `main` 创建：

```text
art/carrot-pull-production-upgrade
```

不要依赖当前其他未合并 PR。

建议 commits：

```text
art(carrot-pull): add production storybook asset pack
refactor(carrot-pull): move scene rendering into layered art pipeline
style(carrot-pull): integrate storybook controls and overlays
test(carrot-pull): add art verifier and gameplay smoke coverage
```

PR：

```text
art(carrot-pull): production storybook scene and sprite pipeline
```

## 24. 提交前必须运行

源码态：

```bash
npm run gen -- --check
node tests/verify-carrot-pull-art.mjs
npm run verify
```

构建产物：

```bash
npm run build
node tests/lib/run-smoke-dist.mjs tests/smoke-carrot-pull.mjs
```

`run-smoke-dist.mjs` 会从 `dist/` 启动临时 HTTP server，并把 base URL 传给 Puppeteer smoke；不要在 build 后直接裸跑 `node tests/smoke-carrot-pull.mjs`，否则没有 server 时会得到假失败，也无法确认真正测试的是 dist 产物。

所有由本次 PR 新增或导致的失败必须修复。

不要以“main 本来有失败”为理由忽略新增回归；如发现 main 基线已有失败，应在 PR 描述中分别列出并证明与本 PR 无关。

## 25. Definition of Done

只有同时达到以下条件才能认为“完整美术升级”完成：

- 正式手绘原画已经进入游戏；
- 场景具备明确远景 / 中景 / 角色 / 前景层次；
- 女孩、鼹鼠、胡萝卜全部换成 production art；
- 人物动画仍正常；
- 叶茎仍正确连接手和爪；
- soil occlusion 正确；
- happy / oops 状态存在；
- harvest animation 保留；
- 开始页、控制区和结果页同步完成视觉升级；
- emoji 美术被移除；
- 手机 390px 下仍然精致清晰；
- Desktop 仍然利用 sidebar；
- Light / Dark 正常；
- reduced motion 正常；
- 新增 art verifier；
- 新增 Carrot Pull smoke；
- `npm run verify` 通过；
- `npm run build` 通过；
- 无 console pageerror；
- 不存在临时 placeholder；
- 不存在“为了赶进度又用程序几何图形代替原画”的退化方案。

最终判断标准不是“代码已经接上图片”，而是：

**第一次打开《拔萝卜》时，它在视觉完成度上应该和《萤火信号》《影织》属于同一代作品。**

## 26. Codex 执行注意事项

如果执行环境本身不能生成高质量位图，**禁止**用手写 SVG、Canvas 几何或临时程序图形替代 production art 并宣称任务完成。

此时应把实现拆成两部分：

1. 先准备并提交符合本计划的正式美术资产包；
2. 再由 Codex 完成分层接入、动画保留、UI 升级和测试。

美术资源质量是本任务的核心交付物之一，不是可选增强。
