# Chrome 契约：Header 三槽位 / Hint-only Footer / bindChrome

> 现行契约。底稿（2026-09-19 迁移轮的完整过程记录）见 `docs/archive/header-footer-contract-2026-09-19.md`；
> 盒子几何（容器 / 顶栏尺寸 / 舞台 / 侧栏）见 `docs/contracts/layout.md`。

- 契约文件：`css/layout.css`（`.game-topbar-center` / `.game-footer` 系列）
- 行为实现：`src/platform/game-chrome.js`（`bindChrome`）
- 历史参考：`tools/archive/migrations/apply-header-footer.py`、`tools/archive/migrations/add-chrome-i18n.py` 已归档，不用于日常开发。当前流程是按本文直接实现 markup、i18n 与 `bindChrome` 接入，再运行现行校验。
- 校验工具：`tests/verify-chrome.mjs`（按文件名自动发现，verify-all 校验项 `verify-chrome`）

---

## 1. 契约

### 1.1 Header：三槽位，右簇定序

```html
<header class="xx-topbar game-topbar">
  <div class="xx-topbar-lead game-topbar-group">      <!-- 左簇 -->
    <a|button data-chrome="home">                     <!-- Home 永远第一个 -->
    …页面专属入口（如 wd 的 Help）
  </div>
  <div class="xx-topbar-center game-topbar-center">   <!-- 中槽：标题 / HUD，各页自由 -->
  <div class="xx-topbar-actions game-topbar-group">   <!-- 右簇：固定顺序 -->
    …页面专属（Retry / Range / Speed / Theme）
    <button data-chrome="stats">    <button data-chrome="pause">
    <button data-chrome="sound">
  </div>
</header>
```

**核心性质：Sound 永远是最右一颗。** 它是 11 页全有的全站开关，无论一页有没有
Stats / Pause，它的屏幕位置都一致。页面专属钮一律排在右簇最左。

> **2026-09-21 变更：语言切换 UI 收敛到首页 index.html。** 游戏页不再有语言钮
> （顶栏 `data-chrome="lang"`、开始浮层语言钮、math-rain 的两处 language-selector
> 全部移除）。游戏页对 `site_lang` **只读不写**：boot 时的值决定初始语言，
> 跨标签页为「下次加载生效」。`verify-chrome.mjs` 对游戏页语言钮做**负向断言**
> （出现即失败）。历史上的「文字钮显示目标语言自称」规格随 UI 作废。

### 1.2 Footer：只保留操作提示

```html
<footer class="xx-footer game-footer">
  <p class="xx-footer-hint game-footer-hint" id="xx-hint">操作提示</p>
</footer>
```

- 游戏页 Footer 不再重复 Home，也不再放“更多游戏”展开按钮；Home 的唯一固定入口在 Header。
- 跨游戏推荐仍可存在于侧栏、开始菜单等内容区域，由 `more-games` 组件负责，不属于 Chrome。
- Footer 继续随流，不使用 sticky / fixed；手机上 `.game-footer-hint` 保持可见。
- 首页 `index.html` 的语言 / 主题 Footer 属于落地页自己的 UI，不受游戏页 Footer 契约约束。

### 1.3 行为：`bindChrome`

```js
bindChrome({
    owns: ['home'], // 仅无 href 的 Home <button> 需要交给 chrome；普通 <a href> 不需要
    getText: () => LANGUAGES[getLang()] || LANGUAGES.en,
    labels: { pause: () => (LANGUAGES[getLang()] || {}).pause },
});
```

职责边界：

| 角色 | 文案 / 图标 | 点击 |
| --- | --- | --- |
| `home` | `bindChrome` | 普通 `<a href>` 自带导航；无 href 的按钮可由 chrome 接管 |
| `sound` | `bindChrome`（图标 + `aria-pressed`） | 默认由各页自己；只有没有 handler 的页才把 `'sound'` 放进 `owns` |
| `stats` | `src/platform/game-drawer.js` | `src/platform/game-drawer.js` |
| `pause` | 页面经 `labels.pause` 提供，`bindChrome` 落笔 | 各页自己 |

`bindChrome` 不再处理 `more`。推荐列表由 `src/platform/more-games.js` 独立渲染，
避免导航控件与推荐内容再次耦合。

### 1.4 语义标签（P3-3 并入）

每个 shell 页必须有**恰好一个 `<h1>`**（可以是 `.sr-only` 视觉隐藏的页面标题），
`<header>/<main>/<footer>` 语义标签齐全。`verify-chrome.mjs` 断言 `h1Count >= 1`。
详见 `docs/contracts/layout.md` §1.2。

---

## 2. 各页现状

| 页面 | 左簇 | 右簇（专属 → stats → pause → sound） | 页脚 hint 来源 |
| --- | --- | --- | --- |
| gravity-slingshot | Home | Retry · Stats · Sound | `t.hint` |
| hoop-shot | Home | Stats · Pause · Sound | `t.hint`（原 `footerHint`） |
| planet-merge | Home | Stats · Pause · Sound | `t.hint` |
| sword-flight | Home | Stats · Pause · Sound | `t.hint`（新） |
| needle-awn | Home | Stats · Pause · Sound | `t.hint`（新） |
| tower-defense | Home | Range · Speed · Stats · Pause · Sound | `t.hint` |
| reversi | Home | Sound | `t.hint`（原 `muteHint`） |
| minesweeper | Home | Pause · Sound | `hintDefault` / `hintFlagMode` |
| word-daily | Home · Help | Stats · Sound | `t.hint`（新） |
| gomoku | Home | Sound | `t.hint`（新） |
| tetris | Home | Theme · Stats · Sound | `TEXT.hint`（新） |

（表为 2026-09-21 语言钮收敛后的现状；历史含 Lang 的版本见 git。）

**豁免**（维持既定豁免，P4 只做了最小语义对齐，不套三槽位）：

- `tank-battle`：横屏全屏画布 + 虚拟手柄，P4-2 仅加 `<main class="tb-main">`（`display: contents`）+ sr-only h1。
  自带 `#btnLang`（虚拟手柄 aux-row）+ `switchLanguage()` + `L` 快捷键，也于 2026-09-21 随收敛移除。
  ⚠️ 这类自带语言钮的页面**不在 `verify-chrome` 的覆盖内**（它只遍历带 topbar cap 的页面），
  本次就是这样漏了整整一轮 —— 现在由 `tests/verify-no-game-lang.mjs` 兜住。
- `math-rain`：全屏街机 HUD，P4-3 仅加 `<main class="mr-main">`（包 game-container）+ sr-only h1；
  其开始界面与设置面板的语言选择器也于 2026-09-21 随收敛一起移除（HTML-only，JS 空值守卫天然兼容）。
- `index.html`：落地页，P4-1 加 `<main class="idx-main">`，有自己的头部，不属于本契约；
  **全站唯一的语言切换 UI 在这里保留**（顶栏 + 页脚）。

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
   新键被粘在上一行行尾，偏移错位又让第一个键在块尾重复插一遍，11 个文件各 4 处。
   ES 模块允许重复键（后者胜），所以 `node --check` 全过、页面也不报错 —— 只能靠肉眼或
   「同一 key 出现 >2 次」的扫描发现。加固：只改行尾、保留换行；偏移按实际长度差修正。

3. **Windows 下改写文件把 LF 翻成 CRLF**，10 个文件制造约 11000 行假 diff。
   规则：**改写文件前先读字节判断原有行尾，写回时照原样还原**；提交前用
   `git show HEAD:<file> | grep -cU $'\r'` 与工作区逐文件比对。
   `.gitattributes`（`* text=auto eol=lf`）会全仓库重写行尾，**应单独提交**，未纳入。

---

## 4. 验证

`npm run verify`（或 `npm run verify:quick`）已编排 `verify-chrome.mjs`；单独跑：

```bash
npm run serve:static &        # 或 node tests/verify-chrome.mjs（verify-all 自动起服务）
node tests/verify-chrome.mjs http://127.0.0.1:8899

# 校验当前 markup / runtime 接入，不运行归档迁移器
node tests/verify-registry.mjs
```

> `tools/lib/browser.mjs` 会按「环境变量 → 系统 Chrome/Chromium → Puppeteer 缓存」解析路径，
> 不再依赖固定的 Puppeteer 版本目录。换机器时优先设置 `CHROME_BIN`；WSL 里的 Linux Node
> 若要使用 Windows Chrome，请用 Windows 侧 Node 运行校验，或在 WSL 安装 Linux Chrome 后设置 `CHROME_BIN`。

`verify-chrome.mjs` 的断言（11 页 × 移动 390 / 桌面 1280 × zh / en = 44 组）：

1. 顶栏三槽位齐全；右簇通用钮顺序符合契约
2. 页面至少一个 `<h1>`（`h1Count >= 1`，可为 `.sr-only`）—— P3-3 并入
3. `home` / `sound` / `pause` 的 `title` 与 `aria-label` 非空
4. 页脚在 390 宽下**可见**，hint 非空
5. 游戏页**不得出现语言钮**（负向断言；2026-09-21 语言 UI 收敛到首页后新增，
   取代历史上的「点一次语言钮 UI 必须换语言」）
6. 点一次静音钮：`site_muted` 必须翻转（双绑导致的「切两次 = 没切」会被抓出来）
7. 顶栏首页钮点击后真的导航回 `index.html`（行为断言，防死按钮）
8. Footer 不含 `data-chrome` 控件或 `.game-footer-nav`；全程无 `pageerror`

> ⚠️ **覆盖范围陷阱**：上面的 ①–⑨ 只遍历 `registry.withCap('topbar')` 的页面。
> tank-battle / math-rain 这类豁免页根本不进循环 —— 它们的语言钮回归**一条断言都抓不到**。
> 补齐手段是静态源扫描守卫 `tests/verify-no-game-lang.mjs`（无需起服务，1 秒内）：
> 扫全部 `*.html` + `js/**`，禁 `setLang(` / `selectLanguage(` / `switchLanguage(` /
> `langTitle` / `btnLang` / `langBtn` / `data-chrome="lang"` / `__pendingLanguageSelection =`，
> 外加「HTML 里名字带 lang 的按钮」结构检查；只豁免 `index.html`、`js/index-page.js`、
> `src/platform/site-settings.js`，以及 word-daily 的 `#wd-btn-lang`（单词/成语模式切换，非语言）。
> 已注册进 `verify-all` 全量档与 `--quick` 档。

> 它已经抓到一个**与迁移无关的历史 bug**：`src/games/minesweeper/index.js` 里写的是 `this.el.mute`，
> 而元素缓存的键是 `mute-btn`（id 去掉 `ms-` 前缀），所以扫雷顶栏的静音钮**自 HEAD 起就没绑上过**。
