# Mini Games Collection

🎮 多合一小游戏平台，支持模块化构建和现代化开发流程。

当前包含游戏：
<!-- registry:begin game-list -->
- Math Rain（数字雨）
- Tetris（俄罗斯方块）
- Tank Battle（坦克大战）
- Gomoku（五子棋）
- Planet Merge（星球合成）
- Word Daily（每日猜词）
- Hoop Shot（街机投篮）
- Minesweeper（扫雷）
- Reversi（黑白棋）
- Neon TD（霓虹塔防）
- Gravity Slingshot（引力弹弓）
- Pinpoint Clash（针尖对麦芒）
- Sword Flight（御剑飞行）
- Lumen（折光）
- Circuit（电路谜题）
- Silkfall（垂丝引露）
- Bond Forge（键合工坊）
- Echo Cave（回声洞窟）
- Maxwell's Demon（麦克斯韦妖）
- Crystal Bloom（晶绽）
- Flame Verse（焰语）
- Ripple Duet（涟漪双生）
- Carrot Pull（拔萝卜）
- Firefly Signal（萤火信号）
- Shadow Loom（影织）
<!-- registry:end game-list -->

全站只有一个排行榜 Worker（`Workers/game-scores.js`，KV 命名空间 `GAME_SCORES`，按 `top:<game>` 键区分；旧三榜 Tetris / Hoop Shot / Planet Merge 已并入，每日榜如 `top:planet-merge-d<日期>`、`top:gravity-d<日期>` 按天滚动），另有全站统计（`games-analytics`）与猜词战报（`word-daily-stats`）两个聚合 Worker。

## 新游戏设计方案

- [四色图志 Fourfold Atlas](docs/proposal-fourfold-atlas-design.md)：地图着色、双色交换与地图册收藏。
- [七桥漫游 Seven Bridges](docs/proposal-seven-bridges-design.md)：过桥路线、城市图景切换与修桥挑战。
- [共同方向与交付计划](docs/proposal-graph-puzzles-delivery.md)：平台集成、实施批次和验收标准。

两款计划各自独立仓库开发、独立部署，正式上线后通过 games 外链卡片接入。以上为待实现的设计方案，尚未创建独立项目或加入可玩游戏列表。

## 🚀 快速开始

### 安装依赖
```bash
npm install
```

### 开发模式
```bash
# 启动开发服务器（支持热重载）
npm run dev

# 或者直接打开 index.html
```

### 构建生产版本
```bash
# 构建所有游戏
npm run build

# 预览构建结果
npm run serve
```

构建产物位于 `dist/`，包含 `index.html`、`math-rain.html`、`tetris.html`、`tank-battle.html`、`gomoku.html`。
