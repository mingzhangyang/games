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
registry.layoutOf(g);            // 'standard'（缺省）| 'immersive'，见 §2.1
registry.withLayout('immersive'); // 某布局类型的全部游戏
registry.assertCovered({ cap, covered, exempt, label });  // 手工表覆盖率守卫，见 §1.2
```

Python 侧同构（`scripts/lib/registry.py`，迁移脚本用）：

```python
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from lib.registry import REGISTRY
REGISTRY.all() / .with_cap(cap) / .by_id(id) / .site() / .hrefs()
REGISTRY.i18n_var(game)                       # i18n 表变量名，缺省 LANGUAGES
REGISTRY.assert_covered(cap, covered, exempt, label)      # 硬失败，见 §1.2
REGISTRY.report_coverage(cap, covered, label, checker)    # 提示 + 陈旧硬失败
```

**校验器 / 迁移脚本一律从这里拿页面清单，禁止再各自维护一份字符串数组。**

### 1.1 派生 vs 手工：判据

能从注册表推出来的，**必须**推：页面集合（`with_cap`）、前缀（`prefix`）、
入口文件（`entry`）、i18n 表名（`i18nVar`）。
推不出来的留在脚本本地：测试数据（`gameVar` / 按钮 id）、迁移参数
（顶栏选择器顺序、`--frame-*` 值、字面替换片段）。这些是脚本自己的事，
塞进 `games.config.json` 会把登记源变成垃圾场 —— 迁移参数在迁移跑完那刻就死了。

第三类是**源文件的事实**（语言块 en/zh 谁在前）：既不派生也不手写，**现读源码**。
`add-drawer-i18n.py` 的 `detect_order()` 是范例。

### 1.2 手工表必须有覆盖率守卫

只要一张手工表是按页面 id 索引的，它就会悄悄收窄注册表：新游戏没进表，
脚本／校验器当它不存在，全绿。两种守卫按表的性质选：

| 表的性质 | 守卫 | 漏页 | 陈旧条目 |
|---|---|---|---|
| 校验器的覆盖面（AUGMENT / TARGETS） | `assertCovered` | **红** | **红** |
| 一次性迁移器的参数（PAGES / EDITS） | `report_coverage` | 提示 | **红** |

分界线：迁移器的表是**历史**迁移的参数，新页是直接照契约写的（lumen 就是），
硬拦只会逼人往永不执行的分支里补条目；而校验器的表就是覆盖面本身，漏一页
就是少测一页。豁免（`exempt`）必须在调用处写明理由，并在 `docs/backlog.md`
留条目 —— `assertCovered` 会在豁免失效时主动提醒「可以删了」。

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
| `theme-light` | 支持浅色模式（页面 CSS 写了 `[data-theme="light"]` 覆盖；与 `themeColorLight` 字段同进同出）。不带即仅深色，见 `theme.md` |

### 2.1 `layout` 字段（不是 cap）

| 值 | 含义 |
| --- | --- |
| 缺省 / `standard` | 标准骨架：shell / topbar / main(stage + sidebar) / footer（`layout.md` §1–§6） |
| `immersive` | Immersive Stage：顶栏以下整块视口归场景，HUD 为浮层（`layout.md` §7） |

布局是**互斥类型**，所以是独立字段而不是 cap（cap 可叠加，会允许 `immersive + sidebar` 这类无意义组合）。
`verify-registry` §2b 断言：取值合法；`immersive` ⟺ HTML 同时带 `game-shell--immersive` 与
`game-stage--immersive`（双向）；immersive 页不挂 `sidebar` / `drawer` / `frame-budget`；
入口里有 `bindFrame({ layout: 'immersive' })`。校验器取页面清单用 `registry.withLayout()`。

## 3. gen 派生清单

`npm run gen` 从真源就地改写以下登记点（产物入库，非构建期注入）：

| 派生点 | 区域哨兵 | 内容 |
| --- | --- | --- |
| 各游戏 `<head>` | `head` | viewport / theme-support + theme-color（+`data-light`）+ `theme-boot.js` / description / keywords / canonical / OG / twitter / title |
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
4. **themeColorLight ⟺ theme-light cap**：同上。
5. **layout 字段 ⟺ 页面骨架**（§2.1）。

背景教训：caps 曾实测漂移两处（tetris 缺 `leaderboard`、word-daily 缺 `analytics`），
当时碰巧无害，但只要哪天有校验器改用 `withCap()`，就会静默漏掉一整页 ——
正是 games-analytics 白名单漏掉 sword-flight 的同一类事故。

## 5. 派生文件不可 lint：gen 是唯一权威

⚠️ **`js/more-games.js` 已加入 eslint `ignores`，不要移出来。**

派生文件由 gen 模板产出（双引号 JSON 风格格式化），而 eslint `quotes` 规则强制单引号 ——
任何 `eslint --fix` 都会破坏 gen 产物 → 下次 `gen --check` 报漂移 → 修复又改回单引号 → **死循环**。
规则：派生文件 gen 是唯一权威，人（和 linter）不应手改；样式不一致在 gen 模板里改。
