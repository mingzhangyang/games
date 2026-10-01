# 《街机投篮 Hoop Shot》完整美术升级实施计划

> 目标执行者：Codex  
> 状态：待实施  
> 目标：保留当前优秀的 flick physics、移动篮筐、球网前后遮挡与 ON FIRE 机制，把“星空上打球”升级为真实、有氛围、有纵深的夜间城市球场。

## 0. 当前实现与原则

当前逻辑坐标：

`420 × 640`

核心程序元素必须保留：

- 篮球物理；
- flick 输入；
- trajectory preview；
- rim / backboard 碰撞；
- hoop flip / horizontal motion；
- ball rotation；
- net front/back layering；
- one miss ends run；
- ON FIRE。

本次采用：

**手绘环境层 + 程序化篮球/篮筐/球网**

篮筐不能直接整块位图化，因为当前篮筐会移动、翻边，并且球需要正确穿过后半网与前半网。

## 1. 新场景：城市屋顶夜场

删除“星空宇宙球场”概念。

新世界：

**傍晚到入夜的城市屋顶篮球场**

视觉层次：

1. 深蓝晚霞天空；
2. 远城市 skyline；
3. 楼顶水塔 / 天线；
4. 铁丝网围栏；
5. 球场远端墙面；
6. 木地板 / 塑胶地面；
7. 前景边缘球袋 / 毛巾等极少装饰。

篮筐仍是游戏核心，背景不要复杂到吃掉橙球。

## 2. 冻结稿

`assets/hoop-shot/reference/concept-rooftop-court.webp`

必须提供：

- 竖屏 420:640 对应构图；
- 球起点在底部中央有清晰空间；
- 篮筐可在左右横向移动而不撞视觉障碍；
- 目标高度范围内 skyline 对比适中；
- 篮筐附近背景尽量暗 / 平。

## 3. 素材结构

```text
assets/hoop-shot/
├── manifest.json
├── README.md
├── reference/
│   └── concept-rooftop-court.webp
├── layers/
│   ├── fallback.webp
│   ├── sky.webp
│   ├── skyline.webp
│   ├── fence.webp
│   ├── court.webp
│   └── foreground.webp
└── textures/
    ├── backboard.webp
    └── ball.webp
```

场景 full raster：`840×1280`。

## 4. 渲染架构

新增：

- `js/hoop-shot-art.js`
- `js/hoop-shot-scene.js`

替换当前 `buildStarfield()`。

绘制：

```text
painted rooftop background
→ procedural court registration lines if needed
→ hoop back
→ aim preview
→ ball
→ hoop front
→ score particles
→ light foreground
```

背景可以静态缓存。

## 5. 球场地面

当前程序地板只是简化 court line。

升级后 authored court layer 应负责：

- 材质；
- 地板接缝；
- 轻微磨损；
- 场边线；
- 光影。

但是和玩法相关的辅助线若需动态随 hoop 取景，可以继续程序绘制，降低 alpha。

不要让三分线看起来跟着移动篮筐“物理移动”。

## 6. 篮筐视觉升级

仍采用程序分层：

- backboard；
- rim back arc；
- net back；
- ball；
- net front；
- rim front。

Backboard 可使用纹理图：

`textures/backboard.webp`

但必须按当前 `BB_W / BB_H` 几何贴图。

Rim 继续程序线条，保证 collision lip 与视觉完全一致。

Net 继续程序绘制，但：

- 线更细；
- 透视更自然；
- 进球 net squash 更明显；
- 前后半透明度更真实。

## 7. 篮球

优先继续程序旋转，但可加入球皮纹理。

方案：

- 预加载无缝球皮纹理；
- clip 到圆形；
- 随 `rot` 旋转；
- 缝线仍程序绘制，以保持清晰。

如果纹理方案产生性能/旋转问题，则保留当前程序球，提升表面颗粒与高光即可。

## 8. ON FIRE

现在的 fire glow 不要扩大。

升级：

- 球后方短焰 / 热色拖尾；
- rim 短暂暖光；
- 场地局部反射轻微变暖；
- 只在 3 streak 以上出现。

不要把整个背景变橙。

## 9. UI

配色：

- 深海军蓝；
- 篮球橙；
- 球场米白；
- 少量城市灯黄。

Start / game over overlay：

- 像场边记分牌 / 比赛海报；
- 不要大玻璃卡；
- background court 仍可见。

Sidebar：

- 保持共享结构；
- 数据视觉像简洁 box score；
- 不引入 NBA 品牌、球队 logo 或受版权保护的标识。

## 10. 响应式

保持现有 frame-budget。

重点复验：

- 390×844；
- 430×932；
- 844×390；
- 1280×800；
- 1440×900。

球起点、篮筐、drag trail 必须在所有尺寸完全对齐。

## 11. 性能

运行时 art：

- 理想 ≤ 1.8 MB；
- 硬上限 ≤ 2.5 MB。

背景静态缓存，移动部分不使用大面积 blur。

## 12. 测试

新增：

`tests/verify-hoop-shot-art.mjs`

扩展 smoke：

- start；
- flick；
- trajectory；
- backboard collision；
- rim make；
- net squash；
- hoop motion；
- ON FIRE；
- miss → game over；
- theme；
- mobile pointer；
- art fallback。

关键回归：

**视觉 rim 前沿必须和实际 collision lip 重合。**

建议 debug：

`?debug-collision=1`

显示 rim collision circles / board rect。

### verify-all 自动发现

新增的 `verify-hoop-shot-art.mjs` 与 `smoke-hoop-shot.mjs` 会由 `tests/verify-all.mjs` 按文件名自动发现，并根据导入推断是否需要服务器。art verifier 自动进入 quick；浏览器 smoke 默认只进入 full suite。

## 13. 推荐文件变化

```text
assets/hoop-shot/**
js/hoop-shot.js
js/hoop-shot-art.js
js/hoop-shot-scene.js
css/hoop-shot.css
tests/verify-hoop-shot-art.mjs
tests/smoke-hoop-shot.mjs
tests/verify-all.mjs
```

## 14. 实施顺序

1. 冻结屋顶球场概念；
2. 输出场景 layers；
3. 替换 starfield；
4. 篮板 / 网 / 球精修；
5. UI 记分牌化；
6. collision debug + smoke；
7. verify / build。

## 15. Definition of Done

- 不再有“星空上打篮球”的违和感；
- 场景一眼看出是屋顶夜场；
- 篮球、篮筐仍完全服从原 physics；
- moving hoop 和 flip 正常；
- 球穿网层级正确；
- ON FIRE 克制但明显；
- 移动端手势零回归；
- verify / build 全绿；
- 达到新一代生产美术完成度。
