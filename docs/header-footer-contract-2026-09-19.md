# Header / Footer 槽位契约（2026-09-19）

承接 `docs/layout-contract-2026-09-18.md`：那一轮统一了「盒子」（容器 / 顶栏几何 / 舞台 /
侧栏 / 抽屉），这一轮统一「盒子里放什么」—— 11 个 shell 家族页面的 header 与 footer。

- 契约文件：`css/layout.css`（`.game-topbar-center` / `.game-footer` 系列）
- 行为实现：`js/game-chrome.js`（`bindChrome`）
- 迁移工具：`scripts/apply-header-footer.py`、`scripts/add-chrome-i18n.py`（均幂等，支持 `--dry`）
- 校验工具：`scripts/verify-chrome.mjs`

---

## 1. 契约

### 1.1 Header：三槽位，右簇定序

```html
<header class="xx-topbar game-topbar">
  <div class="xx-topbar-lead game-topbar-group">      <!-- 左簇 -->
    <a|button data-chrome="home">                     Home 永远第一个
    …页面专属入口（如 wd 的 Help）
  </div>
  <div class="xx-topbar-center game-topbar-center">   <!-- 中槽：标题 / HUD，各页自由 -->
  <div class="xx-topbar-actions game-topbar-group">   <!-- 右簇：固定顺序 -->
    …页面专属（Retry / Range / Speed / Theme）
    <button data-chrome="stats">    <button data-chrome="pause">
    <button data-chrome="sound">    <button data-chrome="lang">
  </div>
</header>
```

**核心性质：Sound 与 Lang 永远是最右两颗。** 这两颗是 11 页全有的全站开关，
无论一页有没有 Stats / Pause，它们的屏幕位置都一致。页面专属钮一律排在右簇最左。

语言钮是**文字钮**（`game-icon-btn game-icon-btn--wide`），显示**目标语言的自称**
（界面英文时显示「中文」，界面中文时显示「English」）。

### 1.2 Footer：持久页脚，随流在底部

```html
<footer class="xx-footer game-footer">
  <p class="xx-footer-hint game-footer-hint" id="xx-hint">操作提示</p>
  <div class="xx-footer-actions game-footer-actions game-topbar-group">
    <a data-chrome="home" href="index.html">
    <button data-chrome="more" aria-expanded aria-controls="xxMoreNav">
  </div>
  <nav class="more-games game-footer-nav" id="xxMoreNav" hidden></nav>
</footer>
```

- **有状态的开关（Sound / Lang）只在 header**，页脚只放无状态导航 + 操作提示：
  每个开关只有一个真源，避开本仓库反复踩过的「同一标签多处写入」。
- **随流，不用 sticky / fixed**：否则会与 tetris 的 `.mobile-controls`（z-index 1000）、
  底部统计抽屉（1200）、各页结算浮层抢层级，还会吃掉竖版画布的可用高度。
- **手机上可见**：`.game-footer-hint` 此前在 `≤480px` 与 `≤720px 高`都是 `display:none`，
  等于手机上根本没有页脚。现在改为永不隐藏，窄屏 / 矮屏压成单行省略。
- 开始浮层里原有的 `.xx-start-footer` / `.na-footer-bar` 保留不动（首屏的跨游戏推荐位 +
  首次进入时的语言入口）。

### 1.3 行为：`bindChrome`

```js
bindChrome({
    self: 'planet-merge.html',          // 从「更多游戏」里排除自身
    owns: ['lang', 'more'],             // 本模块接管点击的角色
    getText: () => LANGUAGES[getLang()] || LANGUAGES.en,
    labels: { pause: () => (LANGUAGES[getLang()] || {}).pause },
});
```

职责边界（每个标签只有一个写入者）：

| 角色 | 文案 / 图标 | 点击 |
| --- | --- | --- |
| `home` | `bindChrome` | 各页自己（多为 `<a href>`；na 例外，交给 chrome） |
| `sound` | `bindChrome`（图标 + `aria-pressed`） | **各页自己**（见下方警告） |
| `lang` | `bindChrome` | `bindChrome` |
| `more` | `bindChrome` | `bindChrome` |
| `stats` | `js/game-drawer.js` | `js/game-drawer.js` |
| `pause` | 各页经 `labels.pause` 提供，`bindChrome` 落笔 | 各页自己 |

> ⚠️ **`owns` 默认不含 `sound`。** 9 个页面的顶栏静音钮早就有自己的 handler（而且各自还要
> 顺带做 `SFX.init()` / `updateMute()` 这类页面私事）。chrome 再挂一个，一次点击就会切换两次，
> **净效果为零** —— 按钮看起来"没反应"，而所有几何 / 标签断言依然全绿。
> 只有本来没有 handler 的新钮（gomoku / tetris）才显式传 `'sound'`。
> `scripts/verify-chrome.mjs` 的「点一次 `site_muted` 必须翻转」就是专门堵这个的。

---

## 2. 各页现状

| 页面 | 左簇 | 右簇（专属 → stats → pause → sound → lang） | 页脚 hint 来源 |
| --- | --- | --- | --- |
| gravity-slingshot | Home | Retry · Stats · Sound · Lang | `t.hint` |
| hoop-shot | Home | Stats · Pause · Sound · Lang | `t.hint`（原 `footerHint`） |
| planet-merge | Home | Stats · Pause · Sound · Lang | `t.hint` |
| sword-flight | Home | Stats · Pause · Sound · Lang | `t.hint`（新） |
| needle-awn | Home | Stats · Pause · Sound · Lang | `t.hint`（新） |
| tower-defense | Home | Range · Speed · Stats · Pause · Sound · Lang | `t.hint` |
| reversi | Home | Sound · Lang | `t.hint`（原 `muteHint`） |
| minesweeper | Home | Pause · Sound · Lang | `hintDefault` / `hintFlagMode` |
| word-daily | Home · Help | Stats · Sound · Lang | `t.hint`（新） |
| gomoku | Home | Sound · Lang | `t.hint`（新） |
| tetris | Home | Theme · Stats · Sound · Lang | `TEXT.hint`（新） |

本轮顺带补齐的能力：

- **gd / hs / pm / td / rv / ms / na / wd / tetris 现在都能在开局后切语言**（此前只有开始浮层里有）。
  tetris 与 word-daily 此前**根本没有 UI 语言入口**（tetris 甚至 import 了 `setLang` 却从未调用）。
- **gomoku 与 tetris 补上了静音钮**（两者一直有 `createSfx`，只缺开关）。
- `title` / `aria-label` 现在 11 页全部跟随语言（此前只有 gd / ms / tetris 会重写）。
- `setLang()` 同步 `document.documentElement.lang`；sword-flight 的 `applyLanguage()`
  也在加载时纠正静态写死的 `lang="zh-CN"`。

`tank-battle` / `math-rain` 维持既定豁免（横屏全屏画布 / 全屏街机 HUD）。

---

## 3. 迁移脚本踩过的坑（已加固，勿重犯）

1. **用 `new:` 模板替换页面原有的按钮 = 让 id 凭空消失。**
   上一版对 sf / na / wd / pm 等页用 `'new:sound'` 生成了 `{pre}-mute-btn`，
   原节点（`sf-btn-sound` / `na-btn-sound` / `wd-btn-mute`）不在任何槽位 spec 里，
   于是随旧容器一起被删。页面 JS 仍在 `getElementById` 它们：
   - `js/sword-flight.js:775` 立即 `soundBtn.innerHTML` → `initDOM()` 抛空指针 → **整页打不开**
   - `js/needle-awn.js:928` 同理 → `bindEvents()` 抛错 → **整页打不开**
   - `wd-btn-help` 在 `.wd-topbar-left` 里，随 `drop_wrappers` 一起消失 → 帮助弹窗**没有入口**

   加固：`right` 里**只有本页原本没有该钮时**才用 `new:`；新增 `left_extra` 保留左簇里
   Home 之外的节点；`drop_wrappers` 删容器前先探测里面有没有带 id 的节点；
   `main()` 加总守卫 —— **任何 id 会消失就拒绝写盘**。

2. **补尾逗号时用 `rstrip()` 吃掉了行尾换行。**
   `add-chrome-i18n.py` 的 `add_keys` 把上一条属性 `rstrip()` 后再拼逗号，换行符一并没了，
   新键被粘在上一行行尾（`confirmReplace: '…',         sound: 'Sound',`），
   偏移错位又让第一个键在块尾重复插一遍，11 个文件各 4 处。
   ES 模块允许重复键（后者胜），所以 `node --check` 全过、页面也不报错 —— 只能靠肉眼或
   「同一 key 出现 >2 次」的扫描发现。加固：只改行尾、保留换行；偏移按实际长度差修正。

3. **Windows 下改写文件把 LF 翻成 CRLF**，10 个文件制造约 11000 行假 diff。
   本轮修复时我自己的脚本又犯了一次（Python 的 `read_text`/`write_text` 会把 CRLF 读成 LF 再按 LF 写回）。
   规则：**改写文件前先读字节判断原有行尾，写回时照原样还原**；提交前用
   `git show HEAD:<file> | grep -cU $'\r'` 与工作区逐文件比对。
   `\.gitattributes`（`* text=auto eol=lf`）能一劳永逸，但它会在下一次 `git add -A` /
   `checkout` 时把仓库里所有 CRLF 文件一次性重写 —— 属全仓库改动，**应单独提交**，本次未纳入。

---

## 4. 验证

```bash
# ⚠️ WSL 里的 linux node 起不了 puppeteer（脚本写死的是 Windows 的 chrome.exe），
#    用 Windows 侧的 node 跑，或自备 linux chrome 并设 CHROME_BIN。
NODE="/mnt/c/Program Files/nodejs/node.exe"
W="C:\\Users\\mingz\\Codes\\games\\scripts"

# serve → measure → kill 必须串在一条命令里：serve-static.mjs 只活在启动它的那次 shell 调用中
("$NODE" "$W\\serve-static.mjs" 8899 &) ; sleep 3
"$NODE" "$W\\verify-chrome.mjs"        http://127.0.0.1:8899
"$NODE" "$W\\layout-metrics.mjs"       http://127.0.0.1:8899
"$NODE" "$W\\verify-stats-drawer.mjs"  http://127.0.0.1:8899
"$NODE" "$W\\verify-gomoku.mjs"        http://127.0.0.1:8899
"$NODE" "$W\\fg-audit.mjs"             http://127.0.0.1:8899

# 迁移脚本幂等性（两者都应报「无改动」）
python scripts/apply-header-footer.py --dry
python scripts/add-chrome-i18n.py --dry

# 构建产物复验（shared-css-first 的 CSS 顺序陷阱）
npm run build && cd dist && ("$NODE" "$W\\serve-static.mjs" 8901 &) ; sleep 3
"$NODE" "$W\\verify-chrome.mjs" http://127.0.0.1:8901
```

`verify-chrome.mjs` 的断言（11 页 × 移动 390 / 桌面 1280 × zh / en = 44 组）：

1. 顶栏三槽位齐全；右簇通用钮顺序符合契约
2. `home` / `sound` / `lang` / `more` / `pause` 的 `title` 与 `aria-label` 非空
3. 页脚在 390 宽下**可见**，hint 非空
4. 点一次语言钮：`site_lang` 变了、钮自身文案变了、且页脚提示或 `document.title` 跟着变
   （只改存储不刷界面会被抓出来）
5. 点一次静音钮：`site_muted` 必须翻转（双绑导致的「切两次 = 没切」会被抓出来）
6. 页脚「更多游戏」展开后 `aria-expanded=true`、列表非空、不含自链接
7. 全程无 `pageerror`

> 它已经抓到一个**与本次改动无关的历史 bug**：`js/minesweeper.js` 里写的是 `this.el.mute`，
> 而元素缓存的键是 `mute-btn`（id 去掉 `ms-` 前缀），所以扫雷顶栏的静音钮**自 HEAD 起就没绑上过**。
