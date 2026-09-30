/**
 * 主题运行时 —— 页面脚本读主题 / 画布调色板的唯一入口（见 docs/contracts/theme.md §2.4）
 *
 * 首帧主题由 public/theme-boot.js 在样式表之前写到 <html data-theme>；本模块只读它，
 * 不自己解析偏好，所以「默认深色 / 仅深色例外 / 跟随系统」的规则只有 theme-boot 一份实现。
 */

/** 当前生效主题：'dark' | 'light' */
export function getTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

/** 本页是否声明支持浅色（<meta name="theme-support" content="light dark">） */
export function supportsLight() {
    const meta = document.querySelector('meta[name="theme-support"]');
    return !!meta && /(^|\s)light(\s|$)/.test(meta.getAttribute('content') || '');
}

/**
 * 主题切换回调（theme-boot 在生效主题真的变化时派发 'theme:changed'）。
 * 持续 rAF 的游戏在回调里重读调色板即可；按需重绘的游戏还要主动重绘，离屏缓存要作废。
 * 返回取消订阅函数。
 */
export function onThemeChange(cb) {
    const handler = (e) => cb((e && e.detail && e.detail.theme) || getTheme());
    window.addEventListener('theme:changed', handler);
    return () => window.removeEventListener('theme:changed', handler);
}

/**
 * 从 CSS 变量读画布调色板：readPalette(shellEl, { bg: '--xx-canvas-bg', ink: '--xx-ink' })
 * → { bg: '#10202a', ink: '…' }。颜色只在 CSS 里定义一次，图例与画布共用。
 * 变量缺失时取 fallback[key]（再缺失为 ''）—— verify-theme 会把空值当失败。
 */
export function readPalette(el, map, fallback = {}) {
    const cs = getComputedStyle(el || document.documentElement);
    const out = {};
    for (const [key, name] of Object.entries(map)) {
        const v = cs.getPropertyValue(name).trim();
        out[key] = v || fallback[key] || '';
    }
    return out;
}

/**
 * 画布调色板：读一组 CSS 变量到一个对象里，主题切换时就地刷新（对象引用不变，绘制代码直接读 P.xxx）。
 *   const P = bindPalette({ bg: '--xx-cv-bg', amberRgb: '--xx-cv-amber-rgb' }, { onChange: () => game.draw() });
 * 变量缺失直接抛错 —— 空字符串交给 canvas 会被静默忽略、沿用上一个颜色，画错了也不报。
 * 必须在样式表生效后调用（onReady 里即可）。onChange 用来让按需重绘 / 停了循环的页面补画一帧。
 */
export function bindPalette(map, { el, onChange } = {}) {
    const pal = {};
    const load = () => {
        const v = readPalette(el || document.documentElement, map);
        const missing = Object.keys(map).filter(k => !v[k]);
        if (missing.length) throw new Error(`theme palette: missing CSS variables ${missing.map(k => map[k]).join(', ')}`);
        Object.assign(pal, v);
    };
    load();
    onThemeChange(() => {
        load();
        if (onChange) onChange(pal);
    });
    return pal;
}
