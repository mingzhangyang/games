# 《垂丝引露 Silkfall》完整美术升级实施计划

> 目标执行者：Codex  
> 状态：待实施  
> 目标：保留当前成熟的 verlet 绳索物理与 20 关设计，把“全 Canvas 零贴图”的夜庭升级为真正具有层次、材质和环境受光的东方夜园。

## 0. 升级原则

当前 `480×640` Canvas 里的以下内容已经是玩法真源，必须继续程序绘制：

- 锚结；
- verlet 蚕丝；
- 露珠；
- 星芒；
- 荆棘碰撞；
- breeze 力场提示；
- bubble；
- 玉壶的目标判定区域。

本次重点升级的是：

**世界美术，而不是物理。**

最适合参考《萤火信号》的技术：

- 手绘分层背景；
- 远近遮挡；
- 低成本环境微动；
- 局部受光；
- 程序 gameplay 元素叠在生产美术之上。

## 1. 美术方向

定位：

**月下东方庭园 × 水墨设色 × 露水与丝的微观诗意**

视觉关键词：

- 墨绿、藏青、月白；
- 远山、月、竹、芭蕉、石、苔；
- 玉壶；
- 蚕丝和露珠作为最亮的动态主体；
- 湿润空气；
- 极少量萤光植物；
- 细腻纸本/水粉材质。

不要：

- 赛博网格；
- 霓虹夜店；
- 大片 cyan glow；
- 背景比丝线更亮；
- 写实照片感。

## 2. 冻结稿

先制作：

`assets/silk-dew/reference/concept-night-garden.webp`

构图必须尊重现有关卡自由布局。

背景不可有固定在某个关卡才合理的核心障碍。

分层：

1. 夜空；
2. 月与远山；
3. 远竹 / 亭影；
4. 中景石景 / 植被；
5. 可放 gameplay 的暗色开放区域；
6. 前景叶片 / 石栏。

中央 70% 空间必须保持克制，不能让复杂叶片干扰绳索。

## 3. 素材结构

```text
assets/silk-dew/
├── manifest.json
├── README.md
├── reference/
│   └── concept-night-garden.webp
├── layers/
│   ├── fallback.webp
│   ├── sky.webp
│   ├── moon-mountains.webp
│   ├── garden-back.webp
│   ├── garden-mid.webp
│   ├── garden-mid-lit.webp
│   ├── foreground.webp
│   └── foreground-lit.webp
└── props/
    └── jade-vessel.webp
```

建议 full-canvas raster：`960×1280`。

`*-lit.webp` 不是整张重新绘制，而是只包含“受到露珠/星芒照亮后的增量”。

## 4. 渲染管线

新增：

- `js/silk-dew-art.js`
- `js/silk-dew-scene.js`

绘制顺序：

```text
sky
→ moon-mountains
→ garden-back
→ garden-mid
→ winds / vessel / bubbles / thorns / stars
→ ropes
→ pearl
→ dynamic particles
→ foreground
→ lit deltas masked by local light buffer
```

需要注意 foreground 遮挡：

- 丝线不能莫名穿过前景叶片后又显示在其前面；
- foreground 可以遮一小部分 scene 边缘，但不可遮核心操作区。

## 5. 局部环境受光

建立低分辨率 light buffer。

光源：

- pearl；
- collected-star burst；
- vessel success；
- bubble highlight（非常弱）。

不要让整个夜庭都跟着亮。

只让：

- 中景叶片边缘；
- 前景叶片；
- 石头湿边；
- 玉壶

得到轻微 additive delta。

性能策略可直接参考 Firefly Signal 的 lit-layer 思路。

## 6. 玉壶升级

当前玉壶是简单渐变路径。

升级为正式透明 WebP：

`props/jade-vessel.webp`

但**捕获区域和物理仍由现有 vessel geometry 决定**。

manifest 记录：

- artwork rect；
- mouth anchor；
- logical mouth width；
- logical body height。

保证 artwork 与真实判定一致。

可在 debug 模式画出 vessel capture area。

## 7. Gameplay 元素视觉精修

### 丝线

继续程序曲线。

升级：

- 外层 glow 更细；
- 高张力时亮度略增；
- held anchor 附近有轻微“丝线绷紧”高光；
- 不要变粗到遮住障碍。

### 露珠

继续程序绘制，避免 sprite 与实时形变脱节。

增加：

- 更真实的折射高光；
- 微弱环境反射色；
- 快速移动时短拖尾；
- 光照 buffer 的主要光源。

### 荆棘

碰撞 geometry 不变。

视觉从“8 向刺球”升级为：

- 小段真实枝刺；
- 暗红枝干；
- 锈红尖端；
- 必须清楚看出危险边界。

### 气旋

不能再只是矩形虚线框。

改为：

- 细丝状风纹；
- 2–4 条定向流线；
- 边界仍需可读；
- 可在首次出现关保留弱矩形提示，后续淡化。

### 气泡 / 星芒

保持高可读性，不要与背景亮点混淆。

## 8. Light / Dark

游戏世界建议**固定为夜庭**。

Light / Dark 只改变页面 chrome、sidebar、overlay。

不要为 light theme 做白天庭院；会破坏整套光效和素材预算。

## 9. 开始菜单 / 关卡菜单

当前开始覆盖层保留功能。

视觉升级为：

- 月下书签 / 小幅宣纸；
- 关卡芯片更像刻印标签；
- 已完成星数使用正式 SVG，而非 emoji；
- 背后的庭院仍可见。

## 10. 性能

运行时新增 raster：

- 理想 ≤ 2.2 MB；
- 硬上限 ≤ 3.0 MB。

要求：

- 背景缓存；
- lit buffer 低分辨率；
- 每帧不创建 gradient 大对象；
- 物理 1/120 substep 完全不动；
- mobile 高 DPR 仍按现有 `renderScale` 逻辑正确。

## 11. 测试

新增：

`tests/verify-silk-dew-art.mjs`

检查资源尺寸 / alpha / manifest / 总大小。

现有 `verify-silk-dew-levels.mjs` 是玩法真源，不允许为了美术修改其通过条件。

扩展 smoke：

- 真实拖 anchor；
- pearl 位移；
- thorn fail；
- bubble；
- vessel success；
- 20 level menu；
- daily；
- light buffer 不抛错；
- fallback 资源路径；
- 390×844 / 430×932 / 844×390 / desktop；
- DPR 2 不裁切；
- reduced motion。

### verify-all 注册

现有 `smoke-silk-dew` 已在 `tests/verify-all.mjs` 的 `SUITE` 中，继续保留。新增 art verifier 时必须显式加入：

```js
{ name: 'silk-dew-art', script: 'tests/verify-silk-dew-art.mjs', args: [], needsServer: false },
```

并把 `silk-dew-art` 加入 `QUICK_NAMES`。不要依赖脚本自动发现。

## 12. 推荐文件变化

```text
assets/silk-dew/**
js/silk-dew.js
js/silk-dew-art.js
js/silk-dew-scene.js
css/silk-dew.css
tests/verify-silk-dew-art.mjs
tests/smoke-silk-dew.mjs
tests/verify-all.mjs
```

## 13. 实施阶段

1. 冻结夜庭概念；
2. 输出分层 WebP 与 lit delta；
3. 接入 scene loader；
4. 玉壶 / 荆棘 / 风场视觉升级；
5. UI 与关卡菜单收口；
6. smoke + level verifier + build。

## 14. Definition of Done

- 夜庭真正有远中近三层空间；
- 月、山、竹、石和前景材质成立；
- 露珠可真实“照亮”局部环境；
- 丝线始终比背景清楚；
- 20 关和每日玩法零回归；
- 不再是“渐变底 + 山影 + 几何障碍”的 prototype 观感；
- 全量 verify / build 通过；
- 完成度达到《萤火信号》级别。
