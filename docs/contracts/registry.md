# Registry 契约：games.config.json 单一登记源

> 登记问题只有两个动作：**改 `games.config.json`，然后 `npm run gen`**。
> 永远不要手改任何派生文件。

- 真源：`games.config.json`（全站游戏元数据唯一真源）
- 读取器：`scripts/lib/registry.mjs`（Node 侧唯一入口）
- 生成器：`scripts/gen-from-registry.mjs`（`npm run gen` / `npm run gen -- --check`）
- 校验：`scripts/verify-registry.mjs`（已并入 `npm run verify`，SUITE 名 `registry`）

---

## 1. 读取器 API

```js
import { registry } from './lib/registry.mjs';
registry.all();                  // 全部游戏（按配置顺序）
registry.withCap('drawer');      // 具备某能力的游戏
registry.byId('sword-flight');   // 单个，找不到直接抛错（宁可红不可静默）
registry.site();                 // 站点级字段（origin / scoresWorker / siteName / publisher / ogImageDir）
registry.hrefs();                // href 文件名集合（校验器拼 URL 用）
```

**校验器 / 迁移脚本一律从这里拿页面清单，禁止再各自维护一份字符串数组。**

## 2. caps 语义

caps 是校验器与迁移脚本的唯一判据：

| cap | 含义 |
| --- | --- |
| `sidebar` | 有 `.game-sidebar`（桌面信息侧栏） |
| `drawer` | 接移动端统计抽屉（`js/game-drawer.js`） |
| `frame-budget` | 桌面舞台纵向预算（`--frame-shell-max` 覆写 + `bindFrame`，`verify-desktop-frame` 检查） |
| `leaderboard` | 使用共享排行榜 Worker（入口 import `js/leaderboard.js`；与 `scores` 块同进同出） |
| `daily` | 有每日挑战（判据：入口 import `js/daily.js`）。带 `scores` 的另有每日榜键 `<dailyKeyPrefix>-d<YYYYMMDD>`；word-daily 有每日玩法但不用共享榜，故只有本 cap |
| `analytics` | 客户端调用 `hubTrack`（入口 import `js/analytics.js`） |
| `topbar` | 有 `.game-topbar-center`（Header 三槽位契约，见 `chrome.md`） |

## 3. gen 派生清单

`npm run gen` 从真源就地改写以下登记点（产物入库，非构建期注入）：

| 派生点 | 区域哨兵 | 内容 |
| --- | --- | --- |
| 各游戏 `<head>` | `head` | viewport / theme-color / description / keywords / canonical / OG / twitter / title |
| 各游戏 SEO 脚本 | `seo-script` | canonical 纠正 + og:image/twitter:image + JSON-LD（VideoGame / BreadcrumbList） |
| `public/sitemap.xml` | `games` | 全部 `<url>` 条目 |
| `public/manifest.json` | （JSON 感知） | `shortcuts` 数组 |
| `js/more-games.js` | `more-games` | `export const MORE_GAMES = [...]`（index 卡片与各页「更多游戏」的运行时数据源） |
| `vite.config.js` | `inputs` | 多页构建入口 `input: { main, tetris, ... }` |
| `Workers/game-scores.js` | `games-scores` | `GAMES` 白名单 + `DAILY_PATTERNS` 正则 |
| `Workers/games-analytics.js` | `games-analytics` | `GAMES = [...]` 白名单 |
| `README.md` | `game-list` | 游戏列表 |

哨兵格式（幂等，可反复跑）：

```
<!-- registry:begin <name> --> …generated… <!-- registry:end <name> -->   (HTML/XML)
// registry:begin <name>      …generated… // registry:end <name>          (JS / README 用 HTML 注释)
```

- 已有哨兵时只重写区域内部，**区域外字节零触碰**。
- 无哨兵时自安装：定位旧内容（如旧行内 SEO 块）整体替换为哨兵区域。
- 加新游戏：在 `games` 数组加条目 → `npm run gen` → 各文件区域自动更新。
  无 `scores` 字段（每日-only 榜）只进 `DAILY_PATTERNS`。

## 4. verify-registry.mjs：caps ⟺ 代码事实

防止「caps 写了代码没有 / 代码有了 caps 漏写」的双向断言：

1. **结构**：`id` / `prefix` / `href` 全局唯一；`href` 与 `entry` 在磁盘上真实存在。
2. **caps ⟺ 代码事实**（双向）：每条探针检查入口文件 / HTML 里是否真有该能力
   （`import leaderboard.js`、`game-sidebar`、`--frame-shell-max`……），与 caps 声明双向比对。
   ⚠ 探针用 `\.{1,2}\/` 匹配相对路径 —— math-rain 的入口在 `js/math-rain/` 子目录，import 写成 `'../analytics.js'`，只认 `'./'` 会误判。
3. **scores 块 ⟺ leaderboard cap**：两者必须同进同出。

背景教训：caps 曾实测漂移两处（tetris 缺 `leaderboard`、word-daily 缺 `analytics`），
当时碰巧无害，但只要哪天有校验器改用 `withCap()`，就会静默漏掉一整页 ——
正是 games-analytics 白名单漏掉 sword-flight 的同一类事故。

## 5. 派生文件不可 lint：gen 是唯一权威

⚠️ **`js/more-games.js` 已加入 eslint `ignores`，不要移出来。**

派生文件由 gen 模板产出（双引号 JSON 风格格式化），而 eslint `quotes` 规则强制单引号 ——
任何 `eslint --fix` 都会破坏 gen 产物 → 下次 `gen --check` 报漂移 → 修复又改回单引号 → **死循环**。
规则：派生文件 gen 是唯一权威，人（和 linter）不应手改；样式不一致在 gen 模板里改。
