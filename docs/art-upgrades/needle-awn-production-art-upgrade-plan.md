# 《针尖对麦芒 Pinpoint Clash》完整美术升级实施计划

> 目标执行者：Codex  
> 仓库：`mingzhangyang/games`  
> 状态：待实施  
> 目标：把当前“深色网格 + 程序几何武器/法相”的赛博水墨概念，升级为真正成立的东方赛博水墨对决世界，同时保持全部精确碰撞、关卡、Boss 与双姿态玩法不变。

## 0. 当前实现与升级原则

当前核心场地是固定逻辑坐标 `480 × 640` 的 Canvas。玩法依赖尖端碰撞、角色朝向、`tipDistance`、Boss 半径、弹幕与实时变换，因此**不可把碰撞实体直接替换成不透明位图盒子**。

本次升级采用：

**正式分层场景美术 + 程序化精确战斗几何 + 精绘视觉外壳**

必须保留：

- 10 关 Trial 与所有 Boss 行为；
- Endless / Daily / 1v1；
- Silver Needle / Golden Awn 双姿态；
- tip-to-tip clash 判定；
- bullet-time / solar nova / ultimate；
- 当前移动、瞄准、触控摇杆、键盘操控；
- 现有坐标系、物理、碰撞和计分；
- `game-frame` / sidebar / drawer / leaderboard / daily 契约。

禁止为了“更好看”修改判定半径、尖端位置或攻击节奏。

## 1. 美术方向

定位：

**东方水墨 × 冷兵器精密感 × 克制赛博界面**

不是霓虹赛博朋克，也不是传统国风卷轴。

视觉关键词：

- 宣纸纤维、墨晕、飞白；
- 远山、雾、竹影、残月、演武台；
- 银针 = 月白 / 冷青 / 金属寒芒；
- 麦芒 = 麦金 / 暖琥珀 / 日光；
- 战斗信息用现代精密 HUD；
- 光效只服务 clash、dash、ultimate；
- Boss 是“法相”，不是简单圆环。

避免：

- 大面积网格常驻；
- 80s neon；
- 塑料发光按钮；
- 背景粒子太多影响弹幕读取；
- 写实武侠人物；
- 复杂人物 sprite 导致碰撞语义模糊。

## 2. 先制作视觉冻结稿

先制作一张：

`assets/needle-awn/reference/concept-arena.webp`

构图固定为当前竖向 `480×640` 逻辑场：

- 上部：Boss / 敌方入场区；
- 中部：主要碰撞空间；
- 下部：玩家活动区；
- 四周不可用过亮装饰；
- 中央必须保留高对比留白，方便读弹幕和尖端。

主题建议：

**悬空演武台 · 雾夜山门**

层次：

1. 深青黑天幕；
2. 远山和云海；
3. 半透明墨雾；
4. 竞技台石纹 / 水墨圆阵；
5. 近景竹叶 / 檐角 / 飘带少量遮边；
6. 战斗光效。

## 3. 素材目录

建立：

```text
assets/needle-awn/
├── manifest.json
├── README.md
├── reference/
│   └── concept-arena.webp
├── layers/
│   ├── fallback.webp
│   ├── sky-ink.webp
│   ├── mountains.webp
│   ├── mist.webp
│   ├── arena-floor.webp
│   └── foreground.webp
├── bosses/
│   ├── needle-sovereign.webp
│   ├── awn-emperor.webp
│   └── grandmaster.webp
└── ui/
    ├── stance-needle.svg
    ├── stance-awn.svg
    └── lotus-mark.svg
```

场景图建议 production raster：`960×1280`（逻辑 ×2）。

## 4. 渲染结构

保留单 Canvas。

新增：

- `js/needle-awn-art.js`：资源加载、manifest、fallback；
- `js/needle-awn-scene.js`：静态/半静态场景渲染缓存。

建议绘制顺序：

```text
background painted layers
→ arena floor / fog
→ bullets & ricochets
→ enemies
→ boss visual shell
→ player / player2
→ particles / clash FX
→ restrained foreground edge layer
```

背景层应缓存到离屏 Canvas，不能每帧重复做昂贵滤镜。

## 5. 战斗实体升级

### 5.1 玩家与普通敌人

碰撞真源继续是现有几何。

视觉可以升级，但必须围绕现有：

- `x / y`
- `angle`
- `radius`
- `tipDistance`

绘制。

Silver Needle：

- 中央细长银白针体；
- 冷青锋线；
- dash 时出现极窄速度残影；
- 尖端仍清晰可见，不用巨大 glow 模糊判定点。

Golden Awn：

- 麦芒形主刃；
- 两侧短芒；
- 暖金飞白纹；
- sweep 时出现扇形墨金拖尾。

尖端判定点必须始终有 1 个小而明确的视觉锚点。

### 5.2 Boss

Boss 不再是“实心圆 + 两个旋转环”。

三套正式法相：

- Needle Sovereign：银针莲座 / 月轮 / 细针阵；
- Awn Emperor：金色麦冠 / 日轮 / 放射芒；
- Grandmaster：阴阳双相 / 银金交替 / 双层法轮。

**Boss artwork 只能是外观，碰撞仍使用现有 radius / tipDistance。**

建议把 Boss artwork 绘制在其碰撞核心外侧，并在 debug 模式可显示碰撞圆与尖端。

## 6. 场景随关卡变化

不需要 10 套全新背景。

建议 3 个章节：

- Trial 1–4：雾夜山门；
- Trial 5–7：针林月台；
- Trial 8–10：金芒天坛。

通过：

- 背景层替换；
- 色温；
- 雾密度；
- foreground；
- Boss 法相

建立进度感。

Daily / Endless 从 3 套中确定性选取，不影响玩法 seed。

## 7. UI 升级

保留 shared topbar / sidebar / drawer。

页面视觉：

- 深墨青哑光；
- 银针 / 金芒两种状态色；
- 不再大面积 cyan glow；
- 关卡卡片像“演武签”而不是网页卡片；
- stance 控件使用正式 SVG；
- ultimate meter 做成莲瓣或环形刻度，但数值区域必须清楚。

开始菜单：

- 保留模式选择；
- 背景 arena 可见；
- 模式块用半透明宣纸/乌金牌；
- 删除不必要 emoji；
- 中文标题可保留书法气质，但正文仍用高可读系统字体。

## 8. 光效规则

光效强度分三级：

1. idle：基本无 glow；
2. dash / stance：局部锋线；
3. clash / ultimate：允许瞬时高亮。

Clash 必须拥有最强视觉事件：

- 1–2 帧白色核心；
- 银 / 金碎芒；
- 极短墨爆；
- hit-stop；
- 周围环境轻微受光。

禁止常驻满屏 bloom。

## 9. 性能预算

运行时新增 art：

- 理想 ≤ 2.0 MB；
- 硬上限 ≤ 2.8 MB。

要求：

- WebP；
- 背景层静态缓存；
- foreground 不做高频滤镜；
- 不引入第三方渲染库；
- 粒子上限维持现有量级；
- 移动端 60fps 为目标。

## 10. 测试与验证

新增：

`tests/verify-needle-awn-art.mjs`

检查：

- manifest；
- 资产尺寸；
- alpha；
- 运行时总字节；
- Boss 三套资源齐全；
- 不存在缺失引用。

扩展 smoke / gameplay 验证：

- 480×640 逻辑坐标不变；
- player tip 位置升级前后相同；
- enemy / Boss tip 位置相同；
- 关卡 1 / 5 / 8 / 10 可启动；
- clash 可以真实触发；
- Boss HP / stun / death 正常；
- 1v1 player2 正常；
- touch joystick 和 action buttons 正常；
- reduced motion 不破坏可玩性；
- 手机 / 桌面无裁切。

增加可选 debug：

`?debug-hitbox=1`

显示 radius / tip point，用于人工确认 artwork 没有欺骗判定。

### verify-all 自动发现

`tests/verify-all.mjs` 按 `verify-*.mjs` / `smoke-*.mjs` 文件名自动发现校验器，并根据导入推断服务器需求。`verify-needle-awn-art.mjs` 是离线校验器，会自动进入 quick；browser smoke 默认只进入 full suite。

## 11. 推荐文件变化

```text
assets/needle-awn/**
js/needle-awn.js
js/needle-awn-art.js
js/needle-awn-scene.js
css/needle-awn.css
tests/verify-needle-awn-art.mjs
tests/smoke-needle-awn.mjs
tests/verify-all.mjs
```

非必要不要动 shared layout。

## 12. 实施阶段

1. Phase 1：冻结稿 + manifest；
2. Phase 2：三章节背景 + 三 Boss 法相；
3. Phase 3：接入 art loader / scene cache；
4. Phase 4：玩家/敌人程序视觉精修；
5. Phase 5：UI / menu / stance；
6. Phase 6：hitbox 对照 + smoke + 全量 verify。

## 13. Definition of Done

- “cyber-ink” 从概念变成实际画面；
- 背景不再是漂移网格与弱 radial blob；
- 三个 Boss 拥有可辨识正式法相；
- 银针 / 金芒一眼可区分；
- tip-to-tip 判定完全未变；
- 弹幕在任何场景上都清晰；
- 手机操作不回归；
- `npm run verify` 与 build 通过；
- 无临时 placeholder；
- 最终视觉完成度与《萤火信号》《影织》属于同一代。
