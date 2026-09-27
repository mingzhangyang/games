# 《数字雨 Math Rain》完整美术升级实施计划

> 目标执行者：Codex  
> 状态：待实施  
> 目标：保留现有模块化算式生成、难度、商店、道具和点击玩法，把旧式“紫绿街机 UI + 浮动算式卡”统一成现代、清晰、有世界观的数学天文台。

## 0. 特殊约束

Math Rain 是仓库里的特殊全屏页面，不使用标准 `game-shell/topbar/sidebar` 几何。

当前：

- `main.mr-main`
- `#game-container`
- `#game-header`
- `#game-area`
- `#target-area`
- `#tool-bar`
- 多个全屏 screen overlay。

**不要强行迁移成标准页面布局。**

本次是视觉系统与 Canvas 场景升级，不是架构重构。

## 1. 新世界观

定位：

**数学天文台 / 数字观测舱**

目标：让“算式从上方落下”看起来像被观测仪器捕捉的数学信号，而不是随机网页卡片往下掉。

视觉关键词：

- 深石墨蓝；
- 夜空 / 星图 / 仪器；
- 细刻度；
- 纸张与黑板只作为局部材质；
- 蓝白数学符号；
- 正确绿色、错误珊瑚红；
- 黄铜 / 暖白作为少量强调。

避免：

- Matrix 黑绿代码雨；
- 亮紫霓虹；
- 卡通泡泡字体；
- 大面积 glow；
- 复杂背景降低算式阅读速度。

## 2. 冻结稿

制作：

`assets/math-rain/reference/concept-observatory.webp`

构图针对动态全屏，不限定固定 aspect。

必须设计成：

- 顶部 HUD 区；
- 中央宽阔“观测窗”；
- 底部 target console / tools；
- 背景可裁切扩展；
- 390px 手机和 1440px 桌面都成立。

建议视觉：

巨大的深色天文台窗口，远处星轨和抽象数学星图；落下的算式像带标签的观测目标。

## 3. 素材结构

```text
assets/math-rain/
├── manifest.json
├── README.md
├── reference/
│   └── concept-observatory.webp
├── backgrounds/
│   ├── fallback.webp
│   ├── observatory-wide.webp
│   └── observatory-mobile.webp
└── ui/
    ├── target-reticle.svg
    ├── freeze.svg
    ├── bomb.svg
    ├── shield.svg
    └── coin.svg
```

Math Rain 不需要很多透明层；重点是统一场景与 UI。

## 4. Canvas 表达式重设计

当前 expression：

- 半透明深色圆角牌；
- 微 glow；
- 浅灰文字。

升级为“观测标签”：

- 默认：暗蓝薄片 + 1px 边；
- 正确命中后：绿色短脉冲；
- 错误：珊瑚红短脉冲；
- 不要常驻 shadowBlur；
- 字体维持高可读系统 sans / tabular numbers；
- 数学符号 baseline 要稳定。

Hit box 继续由 `measureText` 和现有点击逻辑计算。

**不能为了美术让文字图形化成图片。**

## 5. 背景绘制

`getCanvasBackgroundColor()` 不再简单覆盖一层深色。

建议：

- DOM `#game-area` 挂背景图片；
- Canvas 使用透明或极低 alpha 清屏底；
- expression / particle 仍画在 Canvas；
- 背景可根据 mobile / desktop 选择不同资源。

这样不用每帧 draw 大图。

## 6. Target Area

把当前 “目标数字 + 提示” 升级成核心仪器：

**观测核心 / 目标环**

显示：

- 目标数字最大；
- label 次级；
- session target / warning 作为外围刻度；
- target change 前 2 秒有收缩环或轻微 warning。

禁止：

- 高强度 flashing；
- 只靠颜色提示。

## 7. Header

当前 header 信息很多：

- score；
- combo；
- level；
- time；
- lives；
- session time；
- session target；
- controls。

升级原则：

- 按重要性分组；
- 数字使用 tabular / monospace；
- 移动端必须允许二行紧凑 HUD；
- 控件统一共享 icon 语言；
- 不再每一项一个不同颜色的胶囊。

建议：

主行：score / combo / lives / pause  
次行：level / session time / target progress

## 8. Tool Bar

Freeze / Bomb / Shield：

设计成天文台控制模块：

- 三个等权按钮；
- icon + count；
- available / empty / active 三状态；
- active 才允许明显光效。

金币：

删除 emoji `🪙`，改正式 SVG。

Shop 也使用一致视觉。

## 9. Start / Pause / Result

Start：

- 观测台控制面板；
- 难度 1–6 做成刻度选择，不要老式大块按钮墙；
- title 不使用夸张 cartoon 字。

Pause / Game Over / Session Complete：

统一为同一 modal surface；
统计采用紧凑数据表；
去掉标题里的 emoji。

## 10. Light / Dark

Math Rain 的核心游戏世界建议 dark-only。

如果全站 theme 要求页面响应 light：

- 只调整 menu / dialog / chrome；
- game-area 仍保持暗天文台；
- 保证 contrast。

不要做白底数字雨。

## 11. 商店视觉

本次不改经济逻辑。

但所有 shop item：

- 使用统一卡片；
- 正式 icon；
- rarity / price 有明确层级；
- 不使用多种彩虹渐变。

## 12. 动效

正确：

- 标签收缩 / 脉冲；
- 小粒子向 target core 汇聚。

错误：

- 轻微横向偏移；
- 珊瑚色碎片。

Combo：

- HUD 数字短促 scale；
- 不满屏文字。

Bomb：

- 瞬时扫过观测区；
- 不用白屏。

Freeze：

- 背景星图速度停止 / 轻微冷色；
- 算式本身冻结。

## 13. 性能

- 背景走 CSS / DOM，不在每帧 Canvas 重绘大图；
- expression rendering 保持单 Canvas；
- 不新增动画库；
- mobile 目标稳定 60fps；
- 背景资源 ≤ 1.5 MB；
- 全部新增运行时 art ≤ 2.2 MB。

## 14. 测试

已有 `smoke-math-rain.mjs`，在其基础上扩展。

新增：

`scripts/verify-math-rain-art.mjs`

测试：

- start screen；
- 6 difficulty；
- start game；
- expression spawn；
- click correct / incorrect；
- freeze / bomb / shield；
- target change；
- pause/resume；
- session complete；
- game over；
- shop open/close；
- mobile；
- orientation；
- art assets；
- no horizontal overflow；
- source / dist。

特别断言：

- 背景不能拦截 Canvas pointer；
- expression hit boxes 与视觉牌一致；
- DOM overlay z-index 不盖住可点击算式；
- 不重新引入内联大块 style/script。

### verify-all 注册

现有 `smoke-math-rain` 已在 `scripts/verify-all.mjs` 中。新增 art verifier 时必须显式加入：

```js
{ name: 'math-rain-art', script: 'scripts/verify-math-rain-art.mjs', args: [], needsServer: false },
```

并把 `math-rain-art` 加入 `QUICK_NAMES`。继续保留现有 `smoke-math-rain` 的 `needsServer: true` 注册。

## 15. 推荐文件变化

```text
assets/math-rain/**
math-rain.html
css/math-rain/math-rain.css
css/math-rain/shop.css
js/math-rain/main.js
相关 UIController / screen style（仅必要）
scripts/verify-math-rain-art.mjs
scripts/smoke-math-rain.mjs
scripts/verify-all.mjs
```

不要在美术升级中重写 modular architecture。

## 16. 实施阶段

1. 冻结天文台设计；
2. 背景 + icon pack；
3. game-area / header / target / toolbar visual system；
4. expression cards + gameplay FX；
5. overlays / shop；
6. mobile + smoke + verify。

## 17. Definition of Done

- Math Rain 不再像旧时代独立小游戏页面；
- 视觉与全站现代规范一致；
- 又保留自己的“数学天文台”身份；
- 算式可读性比升级前更好而不是更差；
- mobile 一屏信息不拥挤；
- 所有 power-up / session / shop 功能不回归；
- emoji 关键 UI 被正式 icon 替换；
- smoke / verify / build 全通过。
