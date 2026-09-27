# 《坦克大战 Tank Battle》完整美术升级实施计划

> 目标执行者：Codex  
> 状态：待实施  
> 目标：保留当前横屏掌机结构、800×600 战场、坦克 AI / 武器 / Boss / 虚拟手柄，把黑底网格战场升级为精致、清楚、具有实体材质的俯视微缩战场。

## 0. 特殊约束

Tank Battle 是特殊横屏全屏页面：

- 不使用标准 topbar / sidebar；
- `main.tb-main` 仅语义透传；
- 800×600 固定逻辑战场；
- 有 120×90 minimap；
- 手机依赖横屏 + virtual controller。

**不要把它迁移成标准竖屏游戏骨架。**

本次升级不能破坏横屏掌机体验。

## 1. 美术方向

定位：

**俯视微缩战场 × 现代军事桌游 × 清晰街机反馈**

不是写实战争模拟，也不是霓虹网格。

视觉关键词：

- 草地 / 泥土 / 砂石；
- 低矮砖墙；
- 钢板掩体；
- 炮痕；
- 少量沙袋 / 箱体；
- matte military materials；
- 玩家使用清晰友军色；
- 敌人使用暖红 / 铁锈色；
- Boss 有金属重装感。

避免：

- 真实国家旗帜；
- 真实军队标识；
- 血腥；
- 写实战争照片；
- 过度迷彩导致单位不可读。

## 2. 冻结稿

`assets/tank-battle/reference/concept-miniature-battlefield.webp`

必须基于 `800×600` top-down。

构图要求：

- 地面可平铺；
- 地图任何位置都适合生成 enemy / power-up；
- 墙体 tile 轮廓明确；
- 坦克颜色和地面高对比；
- 四周边界自然但清楚；
- 不出现固定障碍，因为实际墙体由游戏逻辑动态生成。

## 3. 素材结构

```text
assets/tank-battle/
├── manifest.json
├── README.md
├── reference/
│   └── concept-miniature-battlefield.webp
├── terrain/
│   ├── ground.webp
│   ├── ground-detail.webp
│   └── border.webp
├── tiles/
│   ├── brick.webp
│   ├── steel.webp
│   └── boundary.webp
├── tanks/
│   ├── player.webp
│   ├── enemy.webp
│   └── boss.webp
├── powerups/
│   ├── health.svg
│   ├── weapon.svg
│   ├── shield.svg
│   └── speed.svg
└── ui/
    ├── minimap-frame.svg
    └── weapon-icons.svg
```

## 4. 关键原则：逻辑矩形仍是真源

现有：

- tank width/height；
- wall rect；
- bullet rect；
- collision；
- spawn；
- Boss size

必须完全不变。

sprite 必须围绕逻辑矩形绘制：

- player sprite visual bounds 不能严重超出 collision；
- turret 可以略超出，但 body 必须和 collision box 对齐；
- wall texture 必须严格填充 tile。

建议提供 debug：

`?debug-hitbox=1`

显示所有 rect。

## 5. 地形渲染

替换：

- `#1a1a1a` fill；
- 40px 网格。

新地面：

- authored seamless grass / earth texture；
- very subtle tile variation；
- 几条轻微车辙 / 炮痕可通过 deterministic decals 叠加；
- 不影响 gameplay seed。

地面建议预渲染为一次 offscreen cache。

## 6. 墙体

当前 brick / steel 程序矩形升级为 tile texture。

### Brick

- 暖灰红砖；
- 破损边缘；
- destructible 状态可在 HP/破坏时加裂纹（若当前无 wall HP，不新增复杂系统）。

### Steel

- 冷灰装甲板；
- 铆钉；
- 明确不可破坏感。

### Boundary

- 混凝土 / 深色装甲墙；
- 与场地边缘一体。

**wall collision rect 不变。**

## 7. 坦克

当前 tank drawing 已经比场景成熟，升级要谨慎。

Player：

- 绿色 / 青绿色友军；
- 车体、履带、炮塔分层；
- turret direction 必须和真实 fire direction 一致。

Enemy：

- 锈红 / 暗红；
- silhouette 与 player 明显不同。

Boss：

- 体型 1.5×；
- 重装甲；
- 双层炮塔或额外装甲，但不能误导 collision。

实现选择：

- 若当前坦克角度绘制逻辑适合，使用 sprite rotated by `angle`；
- 炮塔若独立朝向，则必须 body/turret 分 sprite；
- 如果逻辑只有一个整体 angle，则不可凭视觉增加独立 turret 朝向。

## 8. 子弹 / 爆炸

子弹继续程序绘制。

三类武器用形状 + 色彩双编码：

- normal：小圆弹；
- rapid：短曳光；
- heavy：大炮弹 + 更强 recoil。

爆炸：

- 2–3 段程序粒子；
- 烟尘；
- 短火光；
- 不使用大 GIF / sprite sheet。

## 9. Power-up

删除 emoji 图标：

- ❤ 可替换正式 medical cross / repair icon；
- 🔫 → weapon crate；
- 🛡 → shield；
- ⚡ → speed.

地图上用统一圆形/六角 pickup base + SVG icon。

HUD 也用同一套 icon。

## 10. HUD

当前问题是三种主色和多块悬浮素材断层。

统一：

- military matte dark panel；
- 主强调色：友军绿；
- danger：敌军红；
- boss / rare：暖金；
- 不使用蓝绿红同时作为同等主色。

HUD 分区：

- 左上：lives / score / level / enemies；
- 右上：minimap；
- 下方：weapon / ammo；
- desktop controls 弱化。

Minimap frame 使用统一边框。

## 11. Mobile virtual controller

保留现有布局和热区。

只换材质：

- D-pad：哑光橡胶 / 金属；
- Fire：明确主按钮；
- Pause / Weapon：小型辅助键；
- 横屏时不得遮住 gameplay 关键区域。

不能减小 hit target。

## 12. Orientation Overlay

改成正式“横置掌机”插图，而不是简陋 CSS phone。

可以用 SVG：

`assets/tank-battle/ui/rotate-device.svg`

保持轻量。

## 13. Minimap

视觉同步升级：

- 背景不是纯黑；
- terrain 深绿灰；
- steel / brick 使用简化颜色；
- player / enemy / boss 颜色与主画面一致；
- minimap 不加载完整纹理，仍用 flat color 保性能。

## 14. 性能

运行时新增 art：

- 理想 ≤ 1.8 MB；
- 硬上限 ≤ 2.5 MB。

要求：

- terrain cache；
- wall texture cache；
- tank sprite decode 一次；
- 不每帧创建 gradients；
- 800×600 desktop 和 mobile landscape 稳定；
- minimap 保持程序绘制。

## 15. 测试

现有 `smoke-tank-battle.mjs` 必须扩展。

新增：

`scripts/verify-tank-battle-art.mjs`

测试：

- terrain ready；
- player sprite 与 hitbox；
- wall tile rect；
- bullet collision；
- destructible wall；
- steel wall；
- power-up；
- enemy；
- Boss；
- game over；
- victory；
- pause；
- weapon switch；
- virtual controller；
- orientation overlay；
- minimap；
- no pageerror；
- 844×390 / 932×430 / desktop。

特别要求：

- visual barrel direction = bullet initial direction；
- sprite 不能改变 collision；
- virtual controller hit-area 不能缩水。

## 16. 推荐文件变化

```text
assets/tank-battle/**
js/tank-battle.js
js/tank-entities.js
js/tank-battle-art.js
css/tank-battle.css
scripts/verify-tank-battle-art.mjs
scripts/smoke-tank-battle.mjs
```

## 17. 实施阶段

1. 冻结俯视微缩战场；
2. terrain / wall / tank / pickup asset pack；
3. terrain cache；
4. wall + tank sprite integration；
5. HUD / controller / minimap polish；
6. debug hitbox；
7. smoke / verify / build。

## 18. Definition of Done

- 黑底网格完全退出主视觉；
- 战场具有真实材质与空间感；
- brick / steel 一眼可区分；
- 玩家 / 敌人 / Boss silhouette 一眼可辨；
- 炮管视觉和发射方向严格一致；
- power-up 无 emoji；
- HUD 和掌机控制器属于同一视觉系统；
- 横屏手机仍是第一等体验；
- collision / AI / weapon / Boss 零回归；
- verify / build 全绿；
- 完成度进入新一代游戏标准。
