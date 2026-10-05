/**
 * 共享顶栏控制器（chrome = 应用级外壳）
 * ==================================
 * Home / Sound 是全站语义相同的顶栏控件；Pause 文案由页面提供。
 * Footer 自 2026-10-05 起只保留操作提示，不再承载 Home / More 导航控件。
 *
 * ⚠️ 职责边界
 *   - home / sound 标签与 sound 图标由本模块统一渲染；
 *   - stats 归 src/platform/game-drawer.js；
 *   - pause 的动态文案由页面通过 labels.pause 提供；
 *   - footer hint 由各页自己的 i18n 渲染；
 *   - 跨游戏推荐由 more-games 组件独立负责，不属于 chrome。
 */

import { getMuted, setMuted } from './site-settings.js';
import { ICONS } from './icons.js';

function setLabel(node, text) {
    if (!node || !text) return;
    node.setAttribute('title', text);
    node.setAttribute('aria-label', text);
}

/**
 * @param {object} opts
 * @param {() => object} [opts.getText] 返回当前语言文案对象；需含 home / sound 等键。
 * @param {object} [opts.labels] { pause: () => string } 之类的动态文案提供者。
 * @param {string[]} [opts.owns] 本模块接管点击的角色。默认不接管任何角色。
 *        sound 只有页面没有自己的 mute handler 时才应交给 chrome；
 *        无 href 的 Home <button> 可交给 chrome。
 * @param {() => boolean} [opts.isMuted] 自定义静音读值（默认 getMuted()）
 * @param {(m:boolean) => void} [opts.onToggleMute] 自定义静音写入。
 * @returns {object|null}
 */
export function bindChrome(opts) {
    const {
        getText = null,
        labels = null,
        owns = [],
        isMuted = getMuted,
        onToggleMute = null,
    } = opts || {};

    const txt = () => (typeof getText === 'function' ? (getText() || {}) : {});
    const ownsRole = role => Array.isArray(owns) && owns.indexOf(role) !== -1;

    const nodes = Array.from(document.querySelectorAll('[data-chrome]'));
    const byRole = role => nodes.filter(n => n.getAttribute('data-chrome') === role);
    const soundBtns = byRole('sound');
    const homeNodes = byRole('home');

    if (!nodes.length) return null;

    function renderHome() {
        const t = txt();
        const label = t.home || 'Home';
        homeNodes.forEach(n => setLabel(n, label));
    }

    function renderSound() {
        const muted = !!isMuted();
        const t = txt();
        const label = muted ? (t.soundOffLabel || 'Unmute') : (t.sound || 'Sound');
        soundBtns.forEach(btn => {
            btn.innerHTML = muted ? ICONS.soundOff : ICONS.soundOn;
            setLabel(btn, label);
            btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
        });
    }

    function renderPause() {
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
        renderPause();
    }

    function toggleMute() {
        const next = !isMuted();
        if (typeof onToggleMute === 'function') onToggleMute(next);
        else setMuted(next);
        renderSound();
    }

    function init() {
        if (ownsRole('sound')) soundBtns.forEach(btn => btn.addEventListener('click', toggleMute));

        if (ownsRole('home')) {
            homeNodes.forEach(n => {
                if (n.tagName === 'A' || n.getAttribute('onclick')) return;
                if (n.dataset.chromeBound === '1') return;
                const href = n.dataset.chromeHref || 'index.html';
                n.dataset.chromeBound = '1';
                n.addEventListener('click', () => { window.location.href = href; });
            });
        }

        window.addEventListener('site-settings:changed', renderSound);
        window.addEventListener('site-settings:changed', renderHome);

        refresh();
    }

    const api = { refresh, renderSound, renderHome, renderPause, nodes };
    init();
    return api;
}
