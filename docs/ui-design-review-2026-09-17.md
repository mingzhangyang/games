# 游戏合集 UI（布局与美术）评审报告

> 日期：2026-09-17 · 范围：13 款游戏 + 合集首页
> 聚焦**视觉与布局**（交互/UX 问题见 09-16 报告，两者互补不重复）
> 方式：逐文件通读 HTML/CSS/JS 绘制代码，所有问题带 文件:行号 证据。

## 总览

| 游戏 | 视觉现状 | 完成度 |
|---|---|---|
| sword-flight 御剑飞行 | canvas 美术全场最佳（9 套天穹渐变/三层视差山/祥云流光/精绘飞剑），仅字体加载缺失 | ★★★★★ |
| tower-defense 霓虹塔防 | 霓虹主题执行到位（玻璃面板/发光路径/冷却环），但一处 CSS 笔误造成全局布局 bug | ★★★★☆ |
| planet-merge 星球合成 | 深空渐变+玻璃拟态统一，但精心绘制的渐变星球被 emoji 纹理盖住 | ★★★★☆ |
| reversi 黑白棋 | 新一代基准：3D 翻转棋子+玻璃顶栏，与首页卡片色精确呼应 | ★★★★☆ |
| minesweeper 扫雷 | 新一代基准：渐变底+蓝色主色+格子系统动画完整 | ★★★★☆ |
| word-daily 每日猜词 | 最干净的一款：变量体系完整、四档响应式精修 | ★★★★☆ |
| hoop-shot 街机投篮 | 与 pm 同模板，橙色主题贯穿，扣分在"星空上打球"场景感弱 | ★★★☆☆ |
| gravity-slingshot 引力弹弓 | canvas 优秀（行星光环分层/虫洞呼吸环），页面层小毛病多 | ★★★☆☆ |
| gomoku 五子棋 | 拟物木棋盘直接贴在暗黑页面上，两套材质语言无过渡 | ★★☆☆☆ |
| tetris 俄罗斯方块 | 霓虹特效堆密度过高，方块色板是 80 年代原色，与 UI 割裂 | ★★☆☆☆ |
| needle-awn 针尖对麦芒 | 骨架好但 canvas 背景极简到"空"，Boss 粗糙，cyber-ink 主题未落地 | ★★☆☆☆ |
| tank-battle 坦克大战 | 坦克绘制精细但一套页面三种主色，HUD 素材断层 | ★★☆☆☆ |
| math-rain 数字雨 | 体系外成员：亮紫+绿主色+卡通字，浅色主题半成品，CSS 补丁冲突 | ★☆☆☆☆ |
| index.html 首页 | 结构与信息层级良好，但素材全靠 emoji、无游戏画面预览，且有两处死代码 | ★★★☆☆ |

**核心发现**：合集存在明显的"两代作品断层"——minesweeper/reversi/word-daily 是新一代（统一玻璃质感、字号阶梯、变量体系），tetris/tank/gomoku/math-rain 是旧一代（发光动画、行内样式、emoji 导航、各写各的色板）。**最高性价比路径：以新一代三款为设计基准，抽公共 token 反哺旧页面**，而非 13 款各自零散美化。

---

## 一、系统性问题（跨游戏）

### 1. 主色各写各的，首页定义未落实【严重】

首页 index.html 已为每款游戏定了卡片主题色，但只有部分落实：

| 游戏 | 页面主色 | 首页卡片色 | 是否呼应 |
|---|---|---|---|
| tetris | #667eea 靛蓝 | 紫 rgba(139,92,246) | ✗ |
| tank-battle | #10b981/#3b82f6/#ef4444 三色混用 | 绿 rgba(16,185,129) | 部分 |
| gomoku | #4299e1 蓝 | 橙 rgba(249,115,22) | ✗ |
| minesweeper | #40b8ff 蓝青 | 蓝 rgba(56,132,255) | ≈ |
| reversi | #34d399 绿 | 绿 rgba(52,211,153) | ✓ |
| math-rain | #48bb78 绿 | 蓝 rgba(59,130,246) | ✗ |

建议：抽公共 `tokens.css`（背景渐变、主色、icon-btn、btn、字号阶梯），每款游戏只覆盖自己的强调色变量。

### 2. 顶栏/图标按钮三种体系【严重】

- tetris：固定定位胶囊钮串硬编码 top:20/70/120/175px（css/tetris.css:446-522）
- tank：画布内小方块钮，回首页按钮 right:148px 依赖小地图宽度（css/tank-battle.css:150-165）
- gomoku：纯文字行内链接 + 负边距补丁（gomoku.html:30-32）
- **范本**：minesweeper/reversi 的 `ms-icon-btn`/`rv-icon-btn` 40px 圆角玻璃按钮（css/minesweeper.css:48-66）——应抽成公共组件。

### 3. 按钮三代并存【一般】

tetris 渐变+ripple、gomoku 纯色方角 5px（css/gomoku.css:96-116）、ms/rv 玻璃+渐变主按钮；圆角 5/8/12/13/14px 混用。

### 4. 字体策略不统一【严重】

tetris 系统栈、tank 'Courier New'、gomoku 'Segoe UI, Tahoma'、ms/rv 'Segoe UI+system-ui'。
- **sword-flight 引用 'Noto Serif SC' 但全站无任何 @font-face/加载**（css/sword-flight.css:455）——Windows 退化为宋体、macOS 为 Songti，标题在不同平台观感割裂。需 preconnect+Google Fonts 引入 900 字重，或统一声明系统衬线栈。

### 5. 图标语言 emoji/SVG 混用【一般】

- 同栏混用：word-daily 左组 SVG 右组 ❓🎲📊（html:35-46）；tower-defense 数据胶囊 ❤️💰🌊（html:35-37）+ 按钮 SVG
- 纯 emoji：math-rain 控制栏 ⏸️⚙️🛒🎨（html:211-214）、sword-flight 生命 🗡️（html:65-67）、首页 hero 🎮 + 15 张卡片图标
- tank-battle 已有 js/icons.js SVG 基建未用上；首页 card-icon 的"渐变底"实际只是单色 15% 透明底（index.html:155-168）。

### 6. 模板复制漂移【一般】

pm/hs/td 共享 shell/顶栏/覆盖层/榜单模板但各自复制维护：
- 侧栏类名 `.pm-side-tower`（css/planet-merge.css:597）、`.hs-side-tower`（css/hoop-shot.css:440-452）系从塔防复制，命名误导
- icon-btn 尺寸漂移：pm/hs 42px、td 40px、wd 36px
- 榜单前三名高亮色：pm/hs 金/银/橙，td 金/银/青（css/tower-defense.css:853-864）

---

## 二、各游戏明细

### tetris
- [严重] 方块色板是 GB 原色 #00f0f0/#f00000 等（js/tetris.js:2613-2620），饱和度与 #667eea/#764ba2 主色完全脱节，画面像两个作品拼接。→ 重调为同明度低饱和色（I=#4fd1e0、Z=#e06c75 一类）
- [严重] 行内样式写死深色值（tetris.html:58-60 `#222`/`#aaa`），主题变量替换机制对这些不生效
- [一般] 容器三色霓虹描边 + neonPulse 常驻动画（css/tetris.css:115-132）+ glow 分数呼吸光（:226-229）+ 彩虹主题，特效密度过高
- [一般] next-piece 用行内 margin 覆盖（tetris.html:92-93），布局靠补丁

### tank-battle
- [严重] HUD hover 才出现 #667eea（css/tank-battle.css:166-169），虚拟手柄是 #10b981 绿+#3b82f6 蓝+FIRE 红球（:303-482）——一套页面三种主色
- [一般] HUD 字号 11px 过小无层级，emoji 图标（❤️🏆📊🎯）与复古终端风冲突（tank-battle.html:33-44）
- [一般] 坦克绘制（渐变/阴影/履带，js:1430-1460）远精于 HUD 纯文本框，画面内外质感断层

### gomoku
- [严重] 木色棋盘（#ecc94b/#d69e2e，css/gomoku.css:54-62）+ 深蓝灰背景（#1a202c→#2d3748）两套材质无过渡；边框窄屏从 8px 突变 4px（:153-157）
- [严重] 顶行按钮整段行内样式 + home 图标无背景（gomoku.html:30-32），与其他游戏 icon-btn 不同档
- [一般] 原生 `<select>` 未定制（gomoku.html:48-52），全合集唯一
- [一般] 标题 2.5rem 蓝色发光是唯一"发光"元素，与棋盘古典感冲突

### minesweeper（整体不建议大动）
- [一般] 顶栏 19px 计数器与 48px 笑脸同排，尺寸节奏略跳（css/minesweeper.css:68-110）
- [一般] 开始层遮住顶栏难度条，视觉上"叠了两层"（:297-307）
- [一般] 结算按钮 emoji 前缀（🔄📋✖，minesweeper.html:83-96）是精致 UI 里的降级元素；提示文字 #56618f 对比度偏低（:286-293）

### reversi
- [一般] 棋盘宽度公式缺最小宽度兜底（css/reversi.css:156），短窗口两侧大量留白
- [一般] 棋盘格 rgba(255,255,255,0.045) 对比极弱（:168-178），空格纹理几乎不可见；黑子 #525d86 起点偏蓝灰（:224-227），辨识度弱于白子

### planet-merge
- [一般] 精心绘制的径向渐变星球（js/planet-merge.js:1638-1651）随后被 r*1.05 的 emoji 纹理（🔴🔵🟢，:1654-1657）几乎完全盖住。→ emoji 缩到 r*0.75 或仅低级星球使用
- [一般] 开始/结算覆盖层滚动条被完全隐藏（css:179-181、545），矮屏下底部内容易被忽略
- [一般] 合并粒子是纯色小圆（:923-931），无光晕拖尾，与星球光晕精致度不匹配

### math-rain（最需要整体换肤）
- [严重] 体系外视觉：亮紫渐变底（css/math-rain/math-rain.css:15）+ 绿主色 #48bb78 + 3px 粗边框 + Fredoka One 卡通字，与合集深色靛蓝玻璃体系完全脱节
- [严重] 默认主题画布不透明纯黑 #000（js/math-rain/main.js:966-968）盖掉了 #game-area 三层径向渐变（css:333-337）
- [严重] #target-number 断点冲突：480px 设 34px（css:1195-1198），其后 768px 块又设 56px（:1301-1303），同特异性后者胜出，34px 死代码
- [严重] 浅色主题半成品：画布强制白底但 header/按钮无任何 light-theme 适配（css:2222-2224），成品是"黑框包白布"
- [严重] canvas 算式是裸发光文字（main.js:705-724）无底板，颜色按 index 轮换（:209）而非对/错语义；CSS 里现成的 `.expression-card` 样式（css:1500-1504）从未被使用
- [一般] 5 个控制按钮绝对定位叠在画布右上，压住算式下落通道（css:537-546、1021-1028）；#game-header 7 个数据块移动端横滚 + 直接隐藏"时间"（:979-989、1182-1184）

### word-daily
- [一般] 双绿并存：瓦片 --correct:#3aa655（css/word-daily.css:17）vs 按钮渐变 #10b981→#059669（:798）
- [一般] toast 固定 top:74px（:445）但 360px 断点顶栏压缩到约 45px（:877-893），悬空不贴顶栏

### hoop-shot
- [一般] 篮球场画在深空星空上，木纹地板仅 46px 微弱橙色带（js/hoop-shot.js:1111-1131），"球场感"很弱。→ 加罚球圈/三分弧球场线
- [一般] 开始覆盖层滚动条隐藏 + 10 个 more-games 链接占近半屏（css:156-158、388）

### tower-defense
- **[严重·布局 bug]** css/tower-defense.css:1038-1039 触控扩展规则漏写 `::after`：`.td-icon-btn, .td-skill-btn::after { position:absolute; inset:-6px }` 中 position:absolute 直接命中 `.td-icon-btn` 本体——顶栏/开始页全部图标按钮脱离文档流、叠到视口左上角。对比 planet-merge.css:613-614 可确认是笔误，**一行修复**。
- [一般] `.td-stage` 魔数公式 (100vh-185px)*0.72（css:141）；topbar 无 flex-wrap（:41-48），≤360px 有溢出风险
- [一般] 五种强调色同屏（金/青/红/紫/青绿，:74-76、477-480、584-587），有控制但略花

### sword-flight
- [严重] 顶栏 6 元素同排（sword-flight.html:34-54），≤480px 缩到 36px（css:1026）后 360px 屏会挤压标题与分数框
- [严重] 'Noto Serif SC' 未加载（见系统性问题 4）
- [一般] emoji（🗡️ 生命/触控按钮）与 canvas 精绘剑仙质感落差明显；金色出现频次过高弱化"金=极意"语义

### needle-awn
- [严重] canvas 背景仅纯色 + alpha 0.04 水平线（js/needle-awn.js:2111-2122），注释自称"水墨网格/八卦微光"实际只是一条 strokeRect——与 sword-flight 多层视差背景落差巨大
- [一般] Boss 仅纯色圆+白三角描边+血条（:2225-2255），关卡高潮缺乏视觉锚点
- [一般] HUD 分数框素黑底（css:115-123），兄弟作同位置是金框双辉光（css/sword-flight.css:120-130）；页面层无任何水墨/cyber 元素落地

### gravity-slingshot
- [严重] 覆盖层 position:fixed inset:0 盖住全视口（css/gravity.css:154-169），与另两款舞台内 absolute 不一致，桌面宽屏弹窗离舞台割裂
- [一般] 舞台宽度魔法数 (100vh-185px)*0.75（:108）；同屏两个 Home 按钮（html:34、81）；body 缺 user-select:none（:11-23）
- 亮点：行星光环前后分层+径向渐变（js:505-553）、虫洞多层呼吸环（:1539-1570）品质高，保留

### index.html 首页
- **[严重·死代码]** `.game-card:hover` 定义两次：index.html:116-120 的靛蓝辉光 hover 被 :124-128 的无辉光版本覆盖，品牌辉光实际不生效 → 删除后一块
- **[严重·缺样式]** card-icon--needle / --sword 类在使用（:701、:717）但 CSS 只定义到 --stack（:155-168），两张卡图标缺彩色底
- [一般] 素材全靠 emoji 无游戏画面预览，品牌感扁平；6 张卡同时挂 New 徽章失去稀缺性（:618-714）；theme-color #667eea 与 --color-primary #6366f1 不一致（:21 vs :28）

---

## 三、修复路线图

**P0 — bug 级，小改立竿见影**
1. tower-defense.css:1039 补 `.td-icon-btn::after`（全局布局 bug，一行）
2. index.html:124-128 删除覆盖辉光 hover 的重复规则
3. index.html 补 card-icon--needle/--sword 底色两条
4. math-rain 删除 css:1301-1303 的 56px 冲突规则；画布底色改半透明让渐变透出（main.js:966-968）
5. sword-flight 引入 Noto Serif SC 900 或统一系统衬线栈

**P1 — 系统性统一**
6. 抽公共 tokens.css + icon-btn/btn 组件（以 ms/rv 为基准），先反哺 tetris/tank/gomoku 三个旧页面
7. tetris 方块色板重调 + 删容器霓虹描边动画
8. tank-battle 确立 #10b981 唯一主色，HUD 统一染色，emoji 换 js/icons.js 已有 SVG
9. gomoku 棋盘边框改同系深色渐变框+金色细线，顶栏换 icon-btn
10. math-rain 换肤到共享深色玻璃模板；算式加底牌（复用 .expression-card）、按对/错着色；浅色主题要么补全要么砍掉
11. needle-awn 背景加低成本视差水墨层，Boss 改多层描边法相，HUD 复用 sword 辉光盒
12. planet-merge emoji 纹理缩到 r*0.75；hoop-shot 地板加球场线；gravity overlay 改舞台内 absolute

**P2 — 打磨**
13. emoji→SVG 全面替换（wd 右组、td 数据胶囊、ms 结算按钮、sword 生命）
14. word-daily 双绿统一；reversi 棋盘格描边+黑子提亮；gomoku select 定制
15. 首页 card-icon 换各游戏 canvas 截图缩略图（品牌感提升最大的一项）；New 徽章收敛；theme-color 对齐
16. 榜单高亮色、icon-btn 尺寸、侧栏类名等模板漂移统一清理
