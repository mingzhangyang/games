# 游戏合集 UI/UX 评审报告

> 日期：2026-09-16 · 范围：13 款本地游戏（首页 index.html 亦已审查）
> 方式：逐文件通读 HTML/CSS/JS，所有问题均在代码中核实，标注文件与位置。

## 总体评价

| 游戏 | 一句话总评 | 完成度 |
|---|---|---|
| planet-merge 星球合成 | 完成度最高的旗舰款，降级策略扎实；欠账是重开确认未接线和一处漏翻译 | ★★★★★ |
| math-rain 数字雨 | 引导、反馈与工程化的标杆；风险是悬浮按钮遮挡下落目标 | ★★★★★ |
| hoop-shot 街机投篮 | 手感与物理细节最好；扣分在几处中文化漏网 | ★★★★☆ |
| gravity-slingshot 引力弹弓 | "所见即所得"打磨最好；每日模式少累计杆数显示 | ★★★★☆ |
| tower-defense 霓虹塔防 | 反馈循环最完整；底部按钮遮挡核心 | ★★★★☆ |
| word-daily 每日猜词 | 规则反馈与状态持久化最严谨；败笔是首次引导缺失、加载即弹键盘 | ★★★★☆ |
| minesweeper 扫雷 | 还原度和插旗方案不错；无暂停 + contextmenu 双切换是隐患 | ★★★☆☆ |
| reversi 黑白棋 | 引擎与动画在线；同步搜索冻结 UI、连胜不持久 | ★★★☆☆ |
| sword-flight 御剑飞行 | 模式丰富、触控讲究；语言入口缺失、多处中英混排 | ★★★☆☆ |
| needle-awn 针尖对麦芒 | 桌面端手感佳；触屏缺移动操控是硬伤 | ★★☆☆☆ |
| gomoku 五子棋 | 功能完整；焦点样式缺失和难度误触清盘是硬伤 | ★★★☆☆ |
| tank-battle 坦克大战 | 移动端掌机化最用心；窄窗口误判竖屏 + 全程无声 | ★★★☆☆ |
| tetris 俄罗斯方块 | 玩法内核与手势扎实；完全无声、零引导 | ★★★☆☆ |

---

## 一、系统性问题（跨游戏，建议统一修）

### P0 — 直接影响可用性

1. **触控热区普遍低于 44px**。几乎所有游戏顶栏/悬浮图标按钮为 36–42px，≤480px 时进一步缩到 31–38px：
   - tetris（css:676-690 中间档 36px）、tank-battle `.v-aux-btn` 36px / 横屏 32px（css:393-407, 234-240）
   - planet-merge 42/38px（css:51-53, 530）、word-daily 36→31px（css:78-79, 844, 881）、hoop-shot 42/38px（css:47-49, 374）
   - minesweeper 40/36px（css:48-50, 535）、reversi 40/36px（css:48-50, 536）
   - tower-defense 40/36px（css:104-121, 917, 923）、gravity 36px（css:466）、sword-flight 36px（css:1017）
   - math-rain 道具按钮 34px（css:1067-1071）
   - 建议：全局约定 `min-width/height: 44px`（`touch-action` 目标区可大于视觉区），一处 lint/审查清单兜底。

2. **needle-awn 触屏无法移动身法**（高）：P1 只读 WASD/方向键（js:1671-1685），触摸仅改朝向（js:701-720），无虚拟摇杆——手机上只能站桩；"双人同屏"入口在触屏设备仍展示但 P2 完全依赖键盘（html:129-133）。移动端基本只能"半体验"。

3. **中英混排（i18n 漏网）**：
   - needle-awn：`Stage ${n}/10`、`Wave ${n}`、`Daily Run` 硬编码英文（js:970/973/976）
   - sword-flight：结算 `${distance} 里`、战绩 `${n} 环`、`'正在沟通天地灵脉...'`（js:1628, 3043, 3152）；每日卡修饰语固定 HTML 中文（html:178; js:904-913）
   - hoop-shot：连击栏写死 `ON FIRE ×2`（js:851）；分享文案 `t.score || 'Score'` 而 zh 语言包无 `score` 键（js:971）
   - planet-merge：结算面板按钮 id 为 `pm-btn-home2`（html:131），JS 更新的是不存在的 `pm-btn-home`（js:460, 500）——中文界面下恒为英文

4. **sword-flight 无语言切换入口**：页面无 lang 按钮，仅被动读 site_lang，且不更新 `documentElement.lang`。

### P1 — 体验明显受损

5. **音效缺失**：tetris（js/tetris.js 全文无音频）、tank-battle（2308 行无音频）、gomoku 均零听觉反馈，与首页"每款游戏精心优化"宣传不符。math-rain 有完整音效链可作参照。

6. **遮挡类布局问题**：
   - tetris：481–768px 视口下排行榜面板（css:699-706 `top:148px; width:200px`）与居中棋盘重叠
   - tower-defense：底部控制条（css:182-193）盖住路径终点核心与最底行（js:324-326, 1945）
   - math-rain：`#game-controls` 悬浮在算式下落路径上（css:537-544），移动端还压在 header 上（css:1014-1021）

7. **切后台/计时公平性**：
   - minesweeper：无暂停机制，切后台照常计秒（js:923-926 注释明确"不中断真实计时"）
   - gravity-slingshot：飞行中切后台直接 abort 且不退还该杆（js:688-693）

8. **reversi 两处核心问题**：AI 同步阻塞搜索，hard 残局最长 2.2s 主线程冻结（js:551-556, 321）；当前连胜 `this.streak` 载入即置 0，刷新即断档（js:945）。

9. **word-daily 加载即弹软键盘**：`updateInputUi` 自动 `input.focus()`（js:865），移动端一进页面键盘遮住棋盘；且无首次访问自动教程（帮助仅靠 ❓）。

10. **tank-battle 桌面窄窗口误判竖屏**：媒体条件 `(max-width:900px) and (orientation:portrait)` 缺 `pointer:coarse` 守卫（css:503-508），桌面窗口拉窄被强制遮罩且无法关闭。另：`aria-hidden` 容器内含可聚焦按钮（html:50-86），Tab 可进入隐藏区。

11. **gomoku**：`.btn { outline:none }` 无替代焦点样式（css:85）；对局中切难度立即清盘无确认（js:125-128）。

12. **横屏适配缺失**：needle-awn（css:150-160）与 sword-flight（css:154-159）画布固定 `aspect-ratio: 480/640` 无 vh 约束，手机横屏纵向溢出、边玩边滚。可参照 tower-defense.css:141 的 `calc((100vh - 185px) * 0.72)` 做法。

### P2 — 打磨项

13. **每日日期口径不统一**：word-daily/planet-merge/gravity/needle-awn 用 UTC+8，sword-flight 每日卡用 UTC、榜单提交用本地时区（js:911, 3046, 3155）——临近午夜时显示与实际上传 key 可能差一天。
14. **榜单提交失败静默**：planet-merge（js:1160-1162）等多款 POST 失败被 catch 吞掉，玩家不知成绩未进全球榜（拉取失败倒有 `lbOffline` 兜底）。
15. **进行中点击"返回首页"无确认**：各游戏顶栏 home 直接跳转，对局即丢（reversi、gomoku 等）。
16. **无障碍**：tetris/tank-battle/gomoku 无 `prefers-reduced-motion`；所有游戏均 `user-scalable=no` 禁缩放；全站缺 `:focus-visible` 样式。
17. **重开确认文案写好未接线**：planet-merge `confirmReplace`（js:131, 172）从未被引用，`pm-btn-again` 直接覆盖当日成绩（js:1336）。
18. **零散**：word-daily 结算后强制弹统计窗（js:1114）；hoop-shot 底部键盘提示被整体替换丢失（js:328）；hoop-shot 最长连击不持久化（js:243）；math-rain 按住 F/B 连发道具（UIController.js:749-763 缺 `e.repeat` 过滤）、`ui:key:r/s` 死按键；needle-awn 触控按钮桌面常驻（css:274-284）、子弹时间用真实时钟 setTimeout（js:1275）；gravity 每日 toast "📅 每日 · 杆 ↓" 语义不清；minesweeper 结算弹窗不支持遮罩关闭；极小字号（8.5px/7.5px，tower-defense.css:252、gravity.css:274）；tetris more-games 初始硬编码中文闪现。

---

## 二、各游戏值得保留的亮点（不要在重构中丢掉）

- **切后台自动暂停 + 暂停计时补偿**：合集的系统性优点，math-rain/tetris/tank/planet-merge/hoop/tower-defense/sword-flight 均落实。
- **i18n 体系**：`site_lang` + `site-settings:changed` 事件 + `updateMoreGames` 联动，全站统一，切语言即时生效。
- **全站昵称** `player_name`（js/player.js）+ 旧 key 自动迁移。
- **gravity-slingshot**：弹道预览与实际积分完全一致；失败 650ms 自动重试零点击；每日赛程可解性采样验证。
- **hoop-shot**：进球后才换筐（防"球在网里筐瞬移"）、暂停期重生软锁处理、防隧穿亚步进。
- **word-daily**：IME composition 正确处理、跨天轮询换题、防作弊锁存。
- **minesweeper**：安全首击、专用插旗模式开关 + 震动反馈、`layoutCells` 处理 fit-content 死循环。
- **sword-flight**：Zen 模式（99 命免伤）是优秀的低压力新手入口。
- **math-rain**：开始页规则 + 独立帮助屏 + 音效/粒子/飘分/连击完整反馈链——可作为其他游戏补齐的模板。

---

## 三、建议路线图

**第一批（P0，一周内）**
1. 统一触控热区 ≥44px（改各 CSS 一处常量即可批量解决）。
2. needle-awn 补虚拟摇杆；触屏设备隐藏或提示 2P 模式。
3. 修复 4 处 i18n 漏网 + sword-flight 补语言切换入口。
4. tank-battle 竖屏遮罩加 `pointer:coarse` 守卫；tetris 排行榜遮挡；tower-defense 底栏遮挡；math-rain 悬浮按钮改布局。

**第二批（P1）**
5. tetris/tank-battle/gomoku 补音效（参照 math-rain 的 sound-manager）。
6. reversi AI 改分片异步搜索（Web Worker 或 setTimeout 分片）；连胜持久化。
7. word-daily 移除自动 focus、加首次教程；minesweeper 加暂停。
8. gomoku 难度切换确认 + focus 样式。
9. needle-awn/sword-flight 横屏 vh 约束。

**第三批（P2）**
10. 统一每日日期为 UTC+8；榜单提交失败 toast；返回首页确认。
11. `prefers-reduced-motion`、`:focus-visible` 补齐；移除 `user-scalable=no`。
12. 各零散项按上表清理。
