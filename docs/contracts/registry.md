# Registry 契约：games.config.json 单一登记源

> 登记问题只有两个动作：**改 `games.config.json`，然后 `npm run gen`**。
> 永远不要手改任何派生文件。

- 真源：`games.config.json`（全站游戏元数据唯一真源）
- 读取器：`tools/lib/registry.mjs`（Node 侧唯一入口）
- 生成器：`tools/generators/gen-from-registry.mjs`（`npm run gen` / `npm run gen -- --check`）
- 校验：`tests/verify-registry.mjs`（按文件名自动发现，verify-all 校验项 `verify-registry`）

---

## 1. 读取器 API

```js
import { registry } from './lib/registry.mjs';
registry.all();                  // 全部游戏（按配置顺序）
registry.withCap('drawer');      // 具备某能力的游戏
registry.byId('sword-flight');   // 单个，找不到直接抛错（宁可红不可静默）
registry.site();                 // 站点级字段（含 home 首页 UI / 外链卡片配置）
registry.hrefs();                // href 文件名集合（校验器拼 URL 用）
registry.layoutOf(g);            // 'standard'（缺省）| 'immersive'，见 §2.1
registry.withLayout('immersive'); // 某布局类型的全部游戏
registry.assertCovered({ cap, covered, exempt, label });  // 手工表覆盖率守卫，见 §1.2
```

历史迁移脚本曾有 Python 侧同构；当前活动代码统一使用 `tools/lib/registry.mjs`，归档迁移脚本不属于日常运行路径。

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
| `drawer` | 接移动端统计抽屉（`src/platform/game-drawer.js`） |
| `frame-budget` | 桌面舞台纵向预算（`--frame-shell-max` 覆写 + `bindFrame`，`verify-desktop-frame` 检查） |
| `leaderboard` | 使用共享排行榜 Worker（入口的静态模块图可访问 `src/platform/leaderboard.js`；与 `scores` 块同进同出） |
| `daily` | 有每日挑战（判据：入口 import `src/platform/daily.js`）。带 `scores` 的另有每日榜键 `<dailyKeyPrefix>-d<YYYYMMDD>`；word-daily 有每日玩法但不用共享榜，故只有本 cap |
| `analytics` | 客户端调用 `hubTrack`（入口 import `src/platform/analytics.js`） |
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

`npm run gen` 从真源就地改写以下登记点（产物入库，非构建期注入）。首页运行时不再维护第二份游戏数组：JSON-LD 直接从生成卡片 DOM 派生，中文翻译通过动态 import 按需下载：

| 派生点 | 区域哨兵 | 内容 |
| --- | --- | --- |
| 各游戏 `<head>` | `head` | viewport / theme-support + theme-color（+`data-light`）+ `theme-boot.js` / description / keywords / canonical / OG / twitter / title；`title.i18nKey` 存在时同时输出对应的 `data-i18n` |
| 26 个 `topbar` 游戏页 | `topbar` | 由 `game.chrome` 与共享 `src/platform/shell/render-topbar.js` 生成整个 `<header>`，包含 Home、专属按钮、标题、Stats / Pause / Sound 的顺序和原有 id / class / ARIA / SVG / hidden / disabled；非顶栏页不生成 |
| 26 个 `topbar` 页的本地 CSS 链接 | `stylesheets` | 由 `shell.styles` 与既有 `scores.ui` 派生有序链接；外部字体样式表 / preconnect 留在区域外 |
| 26 个 `topbar` 页的操作提示 | `footer` | 默认页脚模板与 `shell.footer` 稀疏覆盖；原 id / class / i18n / 初始文案保持不变 |
| 其中带 `drawer` cap 的 16 页 | `stats-drawer` | 空统计抽屉骨架，由 `prefix` 与 `shell.drawer` 派生；不生成或复制 `StatsPanels` |
| 26 个 `topbar` 页的入口及共享脚本 | `tail-scripts` | `game.entry` 模块入口 + `/analytics.js` + `/sw-register.js`，保留顺序和 defer 语义 |
| 各游戏 SEO 脚本 | `seo-script` | canonical 纠正 + og:image/twitter:image + JSON-LD（VideoGame / BreadcrumbList）；分享图优先 `public/<ogImageDir>/og-<id>.jpg`（`tools/generators/game-covers.mjs` 用游戏美术生成），没有才用 `og-<id>.svg` |
| `public/sitemap.xml` | `games` | 全部 `<url>` 条目 |
| `public/manifest.json` | （JSON 感知） | `shortcuts` 数组 |
| `index.html` | `home-new` | 首页新上线横排：全部带 `home.addedAt` 的游戏（新者在前），45 天窗口由 `src/home/new-row.js` 运行时裁剪；图片是字面 URL：优先 `public/assets/home-covers/<id>.webp`（`tools/generators/game-covers.mjs` 用游戏美术生成），没有才用 `public/<ogImageDir>/og-<id>.svg`（卡片加 `new-card--og`），都没有就不输出 `<img>` |
| `index.html` | `home-filter` | 首页筛选条（全部 · 每日 · `site.home.categories` 中 `filter !== false` 的分类）；静态 `hidden`，`src/home/filter.js` 绑定后显现，状态只存 `#cat=<key>` |
| `index.html` | `home-cards` | 首页卡片，按 `site.home.categories` 分区输出（`<section class="games-cat">` + 自己的 `.games-grid`）；区内按 `home.rank` 升序、缺省按登记顺序（站内先、外站后）。名称/描述/标签来自 registry，图标引用外部 sprite。胶囊全部派生：「每日」= `daily` cap，「站外」= `externalGames`；「新」依赖日期，gen 只写 `data-added`（`home.addedAt`），由 `src/home/freshness.js` 按 UTC+8 今天在 45 天内判定——放进 gen 会让 `gen --check` 随日期变红 |
| `js/index-i18n-zh.js` | `home-i18n-zh` | 首页中文翻译懒加载块；英语直接使用静态 HTML，不重复下载 |
| `src/platform/more-games.js` | `more-games` | `export const MORE_GAMES = [...]`（各游戏页「更多游戏」运行时数据源） |
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

### 3.1 顶栏生成源（Chrome Step 5a）

`caps: ["topbar"]` 的游戏必须有 `chrome`，其余游戏不得添加这个字段（`games.schema.json` 通过条件约束）。`chrome` 是**声明式结构**，不是 HTML 模板：

- `actions`：只列角色，如 `["restart", "stats", "sound"]`；公共按钮的 DOM、内联 SVG、属性顺序和 id/class/ARIA 都由共享模板按 `game.prefix` 派生，Sound 唯一且最右。
- `overrides`：可选的稀疏对象，键为 `home`、`name` 或已声明 action 角色，**只写真正不同于默认值的字段**，例如 `{"home":{"attrs":{"id":"pm-home-btn"}}}`。
- `overrides.*.attrs` 默认合并，保持模板属性的插入顺序；`omitAttrs` 删除默认属性；`icon: null` 移除图标。只有历史属性顺序不同、精确 DOM 对比需要时才用 `replaceAttrs: true` 和完整 `attrs`。
- 复杂标题（sr-only H1、双语嵌套）使用 `overrides.name` 节点数组；少数无共享模板的页面专属动作（Theme、Help、Range、Speed）需在 `overrides` 明确 `tag` + `attrs`。
- 分组类名有真实差异时仍可用 `headerAttrs/leftAttrs/centerAttrs/rightAttrs/classPrefix`；禁止在配置中重新手抄一套正常按钮或改动派生 HTML。
`npm run gen` 自安装或更新 `<!-- registry:begin topbar -->` / `<!-- registry:end topbar -->`，不触碰区域外字节；`npm run gen -- --check` 漂移报错。新游戏脚手架 `render-game-shell.js` 同样使用 `renderTopbar()`，并写出哨兵。

`tests/verify-topbar-registry.mjs` 对 **全部带 topbar cap 的游戏** 检查登记字段、唯一哨兵、区域内容逐字匹配及 renderer 与脚手架同源。迁移时的一次性 `tools/checks/compare-topbar-html.mjs <baseline-sha>` 通过解析 HTML、移除纯格式空白与注释，逐元素比较原/新 header outerHTML（包含 SVG、初始 disabled/hidden），仅用于这次零变化证明；其结果记录在 PR。另须执行全站双语截图像素比对与 `npm run verify`。

`index.html`、`math-rain.html`、`tank-battle.html` **明确排除**，不得生成 topbar 标记。此变更不移动 Header 节点位置，也不改绑定器与 CSS。

### 3.2 页面骨架生成源（Chrome Step 6a）

上述 26 个顶栏页的四类连续区域由 `src/platform/shell/render-shell-parts.js` 生成。
它导出 `renderStylesheets(game, indent = '    ')`、`renderFooter(game, indent = '    ')`、
`renderStatsDrawer(game, indent = '    ')`、`renderTailScripts(game, indent = '    ')`；
返回值没有末尾换行，缩进和区域哨兵由调用方管理。无 `drawer` cap 时抽屉渲染返回空字符串。
生成器和新游戏脚手架 `render-game-shell.js` 复用这四个函数。

`game.shell` 可省略。配置只记录偏离默认模板的展示选择，不登记整份 HTML、脚本 URL 列表或可由既有字段推导的事实：

| 字段 | 默认值 / 行为 | 例外用途 |
| --- | --- | --- |
| `shell.styles.page` | `css/<game.id>.css` | gravity-slingshot 保留 `css/gravity.css` |
| `shell.styles.scienceShowcase` | `false` | 使用 Science Showcase 的五页为 `true` |
| `shell.styles.stageStatus` | `true` | 不加载舞台状态样式的四页为 `false` |
| `shell.footer.classPrefix` | `game.chrome.classPrefix` 或 `game.prefix` | `null` 只保留共享页脚 / 提示类；不改变独立的 id 默认值 |
| `shell.footer.hintClass` | `<classPrefix>-footer-hint` | minesweeper 的历史提示类；`null` 省略页面专属提示类 |
| `shell.footer.id` | `<chrome.classPrefix 或 prefix>-hint` | `null` 保留历史无 id 页脚 |
| `shell.footer.key` | `hint`，输出 `data-i18n` | `null` 保留由游戏 JS 写文案的页脚 |
| `shell.footer.touchKey` | `hintTouch`，输出 `data-i18n-touch` | `null` 保留没有此绑定的页脚 |
| `shell.footer.text` | 空文本 | 必要的初始占位文案，按纯文本转义 |
| `shell.drawer.idBase` | `<game.prefix>Stats` | tetris 为 `stats`，派生 Drawer / DrawerTitle / Close / DrawerBody |
| `shell.drawer.i18n` | `false` | tetris / circuit 为 `true`，保留标题与关闭按钮的静态 i18n 属性 |

本地 CSS 顺序固定为 `tokens → layout → [science-showcase] → 页面 CSS → [scoreboard-dialog] → [stage-status] → mobile-fit → more-games`。
`scoreboard-dialog` 是否出现直接读取 `scores.ui === 'dialog'`；入口直接读取 `entry`。
只给 `shell.drawer` 写选项而未声明 `drawer` cap、未知字段及非法字段类型都应报错。
现有外部字体链接、preconnect、其他脚本和舞台内容不进入这些生成区。

`shell.drawer.idBase` 用于保留既有页面的历史 ID；这些页面沿用自己的运行时适配器。
新游戏 CLI `tools/generators/new-game.mjs` 使用共享运行时的 `<prefix>Stats` 约定，因此拒绝与此不同的 `idBase` 覆盖，避免生成一个无法绑定的统计入口；这不影响现有 tetris 的特殊 ID。
CLI 按声明的页脚 `key` / `touchKey` 生成默认双语提示词，并保留已有的标题等基本词条；`key: null` 时必须提供非空静态 `text`，因为新脚手架没有游戏自有的文案写入者。

维护时修改 registry 或共享模板后运行 `npm run gen`，不要手改区域内产物。
首次安装哨兵与后续替换都只接管完整连续节点，不把手写内容夹在拆开的起止标签之间。
写盘前先完成所有页面的渲染和保护检查：原 id 保留、最终 id 唯一、ARIA 引用能定位实际节点；
任一页失败都停止本次产物写入。页脚仍是 shell 的直接子节点，固定定位的抽屉仍在 shell 外，
运行时的面板搬移、暂停和焦点所有权不变。

验收同时保留三类证据：生成区与渲染器逐字一致的防漂移检查；不依赖渲染器期望字符串的实际 DOM / CSS 链接 / 脚本 / id / ARIA 结构检查；迁移前后 DOM 与截图比对。
`gen --check`、已有结构 / 交互检查与构建产物门禁都继续执行，不能用模板自比替代行为验证。
侧栏卡片、结算弹层与榜单服务暂未纳入 6a，后续边界见 `docs/proposal-shell-generation.md`。

## 4. verify-registry.mjs：caps ⟺ 代码事实

防止「caps 写了代码没有 / 代码有了 caps 漏写」的双向断言：

1. **结构**：`id` / `prefix` / `href` 全局唯一；`href` 与 `entry` 在磁盘上真实存在。
2. **caps ⟺ 代码事实**（双向）：每条探针检查入口文件 / HTML 里是否真有该能力
   （`import leaderboard.js`、`game-sidebar`、`--frame-shell-max`……），与 caps 声明双向比对。
   ⚠ 探针用 `\.{1,2}\/` 匹配相对路径 —— math-rain 的入口位于 `src/games/math-rain/`，平台 import 使用 `'../../platform/analytics.js'`，探针需接受多层相对路径。
3. **scores 块 ⟺ leaderboard cap**：两者必须同进同出。
4. **themeColorLight ⟺ theme-light cap**：同上。
5. **layout 字段 ⟺ 页面骨架**（§2.1）。

背景教训：caps 曾实测漂移两处（tetris 缺 `leaderboard`、word-daily 缺 `analytics`），
当时碰巧无害，但只要哪天有校验器改用 `withCap()`，就会静默漏掉一整页 ——
正是 games-analytics 白名单漏掉 sword-flight 的同一类事故。

## 5. 派生文件不可 lint：gen 是唯一权威

⚠️ **`src/platform/more-games.js` 已加入 eslint `ignores`，不要移出来。**

派生文件由 gen 模板产出（双引号 JSON 风格格式化），而 eslint `quotes` 规则强制单引号 ——
任何 `eslint --fix` 都会破坏 gen 产物 → 下次 `gen --check` 报漂移 → 修复又改回单引号 → **死循环**。
规则：派生文件 gen 是唯一权威，人（和 linter）不应手改；样式不一致在 gen 模板里改。

Shadow Loom 的 `src/generated/shadow-loom/silhouettes.js`（小型按关 loader）和
`src/generated/shadow-loom/levels/*.js`（八关独立剪影缓存）也属于生成缓存：它们由
`assets/shadow-loom/layers/silhouettes/**/*.svg` 与 `manifest.json` 通过
`npm run build:shadow-loom-silhouettes` 生成，不能直接编辑。提交前运行
`npm run check:shadow-loom-silhouettes`；生成的剪影轮廓数据因 SVG 路径 JSON 的双引号格式被
eslint 忽略，源 SVG、生成器与同步检查才是权威。
生成器会先合并同一纸片内重叠的外轮廓，再输出 Path2D 与 judge 共用的轮廓缓存；不同纸片的拆分由 SVG 源文件负责，
应沿自然结构形成相邻边界，不得用包含式矩形裁切。


### Dialog leaderboard surface

Games with `scores.ui: "dialog"` use `src/platform/scoreboard-dialog.js` to mount a visible topbar/result entry, locale-aware native dialog, player nickname, leaderboard selection, loading/error/empty states, and read/submission through the shared leaderboard module. This ensures a submit-only implementation cannot masquerade as a functioning leaderboard. `verify-scoreboard-contract.mjs` validates this against the registry and Worker; `smoke-scoreboard-dialog.mjs` exercises the actual dialog. These dialog-hosted `game-lb-*` surfaces are deliberately outside the existing **page-local overlay** geometry fixture.

### Mobile topbar policy (Step 5b)

The generated action list includes `leaderboard` for every topbar page using the
shared scoreboard dialog. Its runtime trigger references the generated button by
`selector` instead of inserting another topbar control. Home/Sound are pinned;
Stats/Pause participate in the mobile two-action budget.

```json
"mobile": {
  "priority": { "speed": 100, "pause": 90, "stats": 60, "range": 30 }
}
```

This optional object belongs under `chrome`. Shared defaults cover other pages;
only real priority exceptions are declared. Keep the contextual `restart` visible
(it appears only during play, so overflowing it makes More pop in mid-run and shift
its neighbours) and overflow an always-available action such as `leaderboard`. `maxVisibleActions` defaults to 2,
with allowed integer values 0..2. Unknown/unused roles, Sound priorities, and
invalid priorities fail generation. The serializer emits both representations;
CSS switches at 480px and the shared controller mirrors availability, never game
state. See `chrome.md` section 5 for interaction and focus ownership.
