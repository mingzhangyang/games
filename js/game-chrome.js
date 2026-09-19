/**
 * 共享顶栏 / 页脚控制器（chrome = 应用级外壳）
 * ==========================================
 * 把「Home / Sound / Lang / More」这四个**全站语义相同**的控件的文案、无障碍标签
 * 与点击行为收敛到一份实现。结构（HTML 槽位）由 `scripts/apply-header-footer.py`
 * 生成，本模块只负责行为。
 *
 * 槽位契约（见 docs/header-footer-contract-2026-09-19.md）：
 *   header 右簇顺序：① 页面专属 → ② stats → ③ pause → ④ sound → ⑤ lang
 *   footer 只放无状态导航：data-chrome="home" / data-chrome="more" + 操作提示
 *
 * ⚠️ 职责边界（避免"同一标签多处写入"）
 *   本模块**只**写 home / sound / lang / more 四个标签。
 *   - stats 的 title/aria 归 `js/game-drawer.js` 的 renderIcons()（已有 228 条断言）；
 *   - pause 是有状态的（Pause↔Resume），由页面通过 `labels.pause` 回调提供文案，
 *     本模块只负责落笔，不在内部推断当前暂停态；
 *   - 页脚 hint 文案不属于 chrome（各页差异大），由各页自己的 applyLanguage 写。
 *
 * ⚠️ 语言存储键是 `site_lang`（见 js/site-settings.js 的 LANG_KEY）。语言切换统一由
 *   `site-settings:changed` 事件驱动：本模块订阅它自动重刷，各页无需再手动调用。
 */

import { getLang, setLang, getMuted, setMuted } from './site-settings.js';
import { renderMoreGames } from './more-games.js';
import { ICONS } from './icons.js';

/** 语言钮显示的是**目标语言的自称**：UI 为英文时显示「中文」，为中文时显示「English」 */
function nextLangLabel(lang) {
    return lang === 'zh' ? 'English' : '中文';
}

function setLabel(node, text) {
    if (!node || !text) return;
    node.setAttribute('title', text);
    node.setAttribute('aria-label', text);
}

/**
 * @param {object} opts
 * @param {string} opts.self  当前页文件名（用于从「更多游戏」里排除自身），如 'tetris.html'
 * @param {() => object} [opts.getText]  返回当前语言文案对象；需含 home / sound / lang /
 *        moreGames / pause 等键（缺哪个就用内置英文兜底）
 * @param {object} [opts.labels]  { pause: () => string } 之类的动态文案提供者
 * @param {string[]} [opts.owns]  本模块**接管点击**的角色，默认 ['home','lang','more']。
 *        ⚠️ sound 默认**不**接管：9 个页面的顶栏静音钮早就有自己的 handler（并且各自
 *        还要做 SFX.init() / updateMute() 这类页面私事），再挂一个就会一次点击切换两次
 *        = 净效果为零。只有本来没有 handler 的新钮（gomoku / tetris）才传入 'sound'。
 *        渲染（图标 / 标签 / aria-pressed）不受 owns 影响，始终由本模块负责 —— 各页
 *        写的是同一个 ICONS 值，属无害的幂等重复。
 * @param {() => boolean} [opts.isMuted]  自定义静音读值（默认 getMuted()）
 * @param {(m:boolean) => void} [opts.onToggleMute] 自定义静音写入；给了就不再调 setMuted，
 *        页面可在回调里同步刷新自己的音效实例
 * @param {() => void} [opts.beforeLangChange] 切语言前的钩子（各页用来 init 音频上下文）
 * @returns {object|null}
 */
export function bindChrome(opts) {
    const {
        self = '',
        getText = null,
        labels = null,
        owns = ['lang', 'more'],
        isMuted = getMuted,
        onToggleMute = null,
        beforeLangChange = null,
    } = opts || {};

    const txt = () => (typeof getText === 'function' ? (getText() || {}) : {});
    const ownsRole = role => Array.isArray(owns) && owns.indexOf(role) !== -1;

    // 收集所有槽位节点：header 与 footer 可能各有一次（页脚的是纯导航，无 sound/lang）
    const nodes = Array.from(document.querySelectorAll('[data-chrome]'));
    const byRole = role => nodes.filter(n => n.getAttribute('data-chrome') === role);

    const soundBtns = byRole('sound');
    const langBtns = byRole('lang');
    const homeNodes = byRole('home');
    const moreBtns = byRole('more');

    // 页面没迁完（一个槽位标记都没有）就静默退出，不报错、不影响游戏本体
    if (!nodes.length) return null;

    let moreNav = null;          // 页脚的「更多游戏」容器（懒创建内容）
    let moreExpanded = false;

    /* ── 渲染 ── */

    function renderHome() {
        const t = txt();
        const label = t.home || 'Home';
        homeNodes.forEach(n => setLabel(n, label));
    }

    function renderSound() {
        const muted = !!isMuted();
        const t = txt();
        // 有独立键的页（gd / ms）优先用 t.sound，其余页回落到统一内置文案
        const label = muted ? (t.soundOffLabel || 'Unmute') : (t.sound || 'Sound');
        soundBtns.forEach(btn => {
            btn.innerHTML = muted ? ICONS.soundOff : ICONS.soundOn;
            setLabel(btn, label);
            btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
        });
    }

    function renderLang() {
        const label = nextLangLabel(getLang());
        langBtns.forEach(btn => {
            btn.textContent = label;
            setLabel(btn, label);
        });
    }

    function renderMore() {
        const t = txt();
        const label = t.moreGames || 'More games';
        moreBtns.forEach(btn => {
            if (!btn.innerHTML.trim()) btn.innerHTML = ICONS.games;
            setLabel(btn, label);
            btn.setAttribute('aria-expanded', moreExpanded ? 'true' : 'false');
        });
    }

    function renderPause() {
        // 文案由页面提供（Pause↔Resume 是页面自己的状态）
        const pauseNodes = byRole('pause');
        if (!pauseNodes.length) return;
        const provider = labels && typeof labels.pause === 'function' ? labels.pause : null;
        if (!provider) return;
        const label = provider();
        pauseNodes.forEach(n => { if (label) setLabel(n, label); });
    }

    function refresh() {
        if (!document.body.contains(nodes[0])) return;
        renderHome();
        renderSound();
        renderLang();
        renderMore();
        renderPause();
    }

    /* ── 行为 ── */

    function toggleMute() {
        const next = !isMuted();
        if (typeof onToggleMute === 'function') onToggleMute(next);
        else setMuted(next);
        renderSound();
    }

    function toggleLang() {
        if (typeof beforeLangChange === 'function') beforeLangChange();
        setLang(getLang() === 'zh' ? 'en' : 'zh');
        // setLang() 派发 site-settings:changed → 本模块与各页 applyLanguage 一起重刷
    }

    function expandMore() {
        // 容器可能不在同一元素上（data-chrome="more" 的钮用 aria-controls 指向它）
        const btn = moreBtns[0];
        if (!btn) return;
        const id = btn.getAttribute('aria-controls');
        moreNav = (id && document.getElementById(id)) ||
                  document.querySelector('.game-footer-nav');
        if (!moreNav) return;

        moreExpanded = !moreExpanded;
        if (moreExpanded && !moreNav.dataset.rendered) {
            renderMoreGames(moreNav, { exclude: self, lang: getLang() });
            moreNav.dataset.rendered = '1';
        } else if (moreExpanded) {
            // 已渲染过：跟随当前语言重建（语言可能在收起期间变过）
            renderMoreGames(moreNav, { exclude: self, lang: getLang() });
        }
        moreNav.hidden = !moreExpanded;
        renderMore();
    }

    function init() {
        if (ownsRole('sound')) soundBtns.forEach(btn => btn.addEventListener('click', toggleMute));
        if (ownsRole('lang')) langBtns.forEach(btn => btn.addEventListener('click', toggleLang));
        if (ownsRole('more')) moreBtns.forEach(btn => btn.addEventListener('click', expandMore));

        // Home 型 <button>（少数页面用 button + onclick）：补上 href 语义。
        // 已有 onclick / 已是 <a> 的不重复挂，否则会触发两次导航。
        if (ownsRole('home')) {
            homeNodes.forEach(n => {
                if (n.tagName === 'A' || n.getAttribute('onclick')) return;
                if (n.dataset.chromeBound === '1') return;
                const href = n.dataset.chromeHref || 'index.html';
                n.dataset.chromeBound = '1';
                n.addEventListener('click', () => { window.location.href = href; });
            });
        }

        // 语言/静音变化统一在此重刷 —— 不依赖各页 applyLanguage（6 个不同实现）
        window.addEventListener('site-settings:changed', renderSound);
        window.addEventListener('site-settings:changed', renderLang);
        window.addEventListener('site-settings:changed', renderHome);
        window.addEventListener('site-settings:changed', () => {
            if (moreExpanded) renderMoreGames(moreNav, { exclude: self, lang: getLang() });
        });

        refresh();
    }

    const api = { refresh, renderSound, renderLang, renderHome, renderMore, renderPause, expandMore, nodes };
    init();
    return api;
}
