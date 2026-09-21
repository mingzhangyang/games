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
<!-- registry:end game-list -->

全站只有一个排行榜 Worker（`Workers/game-scores.js`，KV 命名空间 `GAME_SCORES`，按 `top:<game>` 键区分；旧三榜 Tetris / Hoop Shot / Planet Merge 已并入，每日榜如 `top:planet-merge-d<日期>`、`top:gravity-d<日期>` 按天滚动），另有全站统计（`games-analytics`）与猜词战报（`word-daily-stats`）两个聚合 Worker。

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
