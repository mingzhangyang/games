/**
 * 共享底部统计抽屉控制器
 * =====================
 * 把「移动端侧栏 → 顶栏 Stats 图标钮 + 底部抽屉」这套交互抽成一份，供各页复用。
 * 结构（HTML）由 `scripts/apply-stats-drawer.py` 生成，本模块只负责行为。
 *
 * 约定（每个页面必须满足，否则 createStatsDrawer 会直接 return null）：
 *   - 抽屉：  `<div class="game-drawer" id="<idPrefix>StatsDrawer" hidden>`
 *   - 内容区：`<div class="game-drawer-body" id="<idPrefix>StatsDrawerBody">`
 *   - 触发钮：`<button id="<idPrefix>StatsToggle">`
 *   - 关闭钮：`<button id="<idPrefix>StatsClose">`
 *   - 搬迁节点：`<div id="<idPrefix>StatsPanels">`（桌面时待在侧栏里）
 *   - 侧栏：  `<aside class="game-sidebar">`（用 `sidebarSelector` 指定，默认按类找）
 *
 * ⚠️ 为什么暂停用「适配器」而不是直接调 `game.togglePause()`
 *   六款游戏的暂停实现各不相同：pm/hs/na/td 用 `this.state = 'paused'` 字符串状态，
 *   sf 用 `this.isPaused` 布尔，gd **根本没有暂停**。所以调用方传 `onPause/onResume`
 *   进来，本模块只管"何时该暂停/恢复"，不猜各页的内部表示。
 *
 * ⚠️ 「只恢复因抽屉而暂停的那一次」是硬要求
 *   玩家自己按了暂停再打开抽屉，关抽屉时**不能**把对局偷偷继续。
 *   所以本模块自己记 `pausedByDrawer`，只看自己有没有主动暂停过。
 */

/**
 * @param {object} opts
 * @param {string} opts.idPrefix      页面 id 前缀（'pm' / 'hs' / 'na' / 'td' / 'gd' / 'sf'）
 * @param {string} [opts.sidebarSelector]  侧栏选择器，默认 `.game-sidebar`
 * @param {() => any} [opts.getGame]  返回当前游戏实例（可为 null）
 * @param {(g:any) => void} [opts.onPause]   请求暂停（仅在进行中时会被调用）
 * @param {(g:any) => void} [opts.onResume]  请求恢复
 * @param {() => boolean} [opts.isBusy]  "对局进行中"判据，默认自动推断
 * @param {object} [opts.ICONS]  图标表；给了就由本模块在 init / 语言切换时自动渲染
 * @param {() => object} [opts.getText]  返回当前语言的文案对象（需含 stats / close）
 */
export function createStatsDrawer(opts) {
    const {
        idPrefix,
        sidebarSelector = '.game-sidebar',
        getGame = () => null,
        onPause = null,
        onResume = null,
        isBusy = null,
        ICONS = null,
        getText = null,
    } = opts || {};

    const el = document.getElementById(`${idPrefix}StatsDrawer`);
    const body = document.getElementById(`${idPrefix}StatsDrawerBody`);
    const panels = document.getElementById(`${idPrefix}StatsPanels`);
    const btn = document.getElementById(`${idPrefix}StatsToggle`);
    const closeBtn = document.getElementById(`${idPrefix}StatsClose`);
    const sidebar = document.querySelector(sidebarSelector);

    // 页面没迁完（缺抽屉骨架）就静默退出，不报错、不影响游戏本体
    if (!el || !body || !btn) return null;

    const panel = el.querySelector('.game-drawer-panel');
    const desktopQuery = window.matchMedia('(min-width: 1024px)');

    const api = {
        el,
        panel,
        body,
        panels,
        sidebar,
        open: false,
        pausedByDrawer: false,
        lastFocus: null,

        isDesktop() {
            return desktopQuery.matches;
        },

        /** 面板 DOM 只有一个实例：桌面进侧栏、移动进抽屉 */
        place() {
            if (!panels || !sidebar) return;
            const target = this.isDesktop() ? sidebar : body;
            if (panels.parentElement !== target) target.appendChild(panels);
        },

        /** 当前是否"正在进行、值得暂停" */
        busy() {
            if (typeof isBusy === 'function') return !!isBusy();
            const g = getGame();
            if (!g) return false;
            // 通用兜底：依次识别各页"结束/暂停"标记，任一命中就不算进行中
            if (g.gameOver || g.isGameOver || g.over) return false;
            if (g.state === 'paused' || g.state === 'menu' ||
                g.state === 'gameover' || g.state === 'over') return false;
            if (g.isPaused) return false;
            return true;
        },

        openDrawer() {
            if (this.open || this.isDesktop()) return;
            this.open = true;
            this.lastFocus = document.activeElement;

            // 强制暂停：先判断忙，再把暂停交给页面适配器
            if (this.busy()) {
                const g = getGame();
                if (typeof onPause === 'function') {
                    onPause(g);
                    this.pausedByDrawer = true;
                }
            }

            el.hidden = false;
            // 先摘 [hidden] 再加类，否则过渡不触发
            requestAnimationFrame(() => {
                el.classList.add('is-open');
                document.body.classList.add('drawer-locked');
            });
            btn.setAttribute('aria-expanded', 'true');
            if (closeBtn) closeBtn.focus();
        },

        close() {
            if (!this.open) return;
            this.open = false;
            el.classList.remove('is-open');
            document.body.classList.remove('drawer-locked');
            btn.setAttribute('aria-expanded', 'false');

            const finish = () => {
                if (!this.open) el.hidden = true;
            };
            el.addEventListener('transitionend', finish, { once: true });
            setTimeout(finish, 320);      // 兜底：reduced-motion 下没有过渡事件

            // 只恢复「因打开抽屉而暂停」的那一次
            if (this.pausedByDrawer) {
                this.pausedByDrawer = false;
                if (typeof onResume === 'function') onResume(getGame());
            }
            if (this.lastFocus && typeof this.lastFocus.focus === 'function') {
                this.lastFocus.focus();
            }
        },

        toggle() {
            this.open ? this.close() : this.openDrawer();
        },

        /** 渲染按钮/抽屉的图标与无障碍文案（i18n 切换后自动重调） */
        renderIcons() {
            const txt = (typeof getText === 'function' ? getText() : null) || {};
            const statsLabel = txt.stats || 'Stats';
            const closeLabel = txt.close || 'Close';
            if (ICONS) {
                if (ICONS.stats) btn.innerHTML = ICONS.stats;
                if (closeBtn && ICONS.close) closeBtn.innerHTML = ICONS.close;
            }
            btn.setAttribute('title', statsLabel);
            btn.setAttribute('aria-label', statsLabel);
            if (closeBtn) {
                closeBtn.setAttribute('title', closeLabel);
                closeBtn.setAttribute('aria-label', closeLabel);
            }
            const titleEl = document.getElementById(`${idPrefix}StatsDrawerTitle`);
            if (titleEl) titleEl.textContent = statsLabel;
        },

        init() {
            // 标记"本页已接入抽屉"：layout.css 靠它决定窄屏是否隐藏侧栏。
            // ⚠️ 必须在 JS 而不是 CSS 里判断 —— 搬迁节点在窄屏下已被移进抽屉，
            // CSS 里任何「侧栏是否含有节点」的判据都会失效（见 layout.css 注释）。
            document.body.classList.add('has-stats-drawer');

            btn.addEventListener('click', () => this.toggle());
            if (closeBtn) closeBtn.addEventListener('click', () => this.close());

            // 点遮罩关闭（只在遮罩本体上；点面板内部不关）
            el.addEventListener('click', (e) => {
                if (e.target === el) this.close();
            });

            // Esc 关闭。⚠️ 捕获阶段 + stopPropagation：否则各页自己的 keydown
            // 处理器（方向键/空格/暂停键）会在抽屉开着时继续驱动棋盘。
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.open) {
                    e.stopPropagation();
                    this.close();
                }
            }, true);

            // 焦点陷阱：Tab 在抽屉内循环
            el.addEventListener('keydown', (e) => {
                if (e.key !== 'Tab' || !this.open || !panel) return;
                const focusables = panel.querySelectorAll(
                    'a[href], button:not([disabled]), input:not([disabled]), ' +
                    'select:not([disabled]), textarea:not([disabled]), ' +
                    '[tabindex]:not([tabindex="-1"])'
                );
                if (!focusables.length) return;
                const first = focusables[0];
                const last = focusables[focusables.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            });

            this.place();

            // 语言切换时自己重渲染文案 —— 各页的 applyLanguage 有 6 个不同实现，
            // 与其在 6 处分别插一行，不如让抽屉订阅全站统一事件（site-settings.js 派发）。
            if (ICONS) {
                this.renderIcons();
                window.addEventListener('site-settings:changed', () => this.renderIcons());
            }

            const onChange = () => {
                // 桌面态不该有抽屉：切过去时若开着就先关（含恢复暂停）
                if (this.open && desktopQuery.matches) this.close();
                this.place();
            };
            if (desktopQuery.addEventListener) desktopQuery.addEventListener('change', onChange);
            else if (desktopQuery.addListener) desktopQuery.addListener(onChange);
        },
    };

    return api;
}
