/* 首屏定主题（全站页面共用，同步经典脚本 —— 不能 defer / module，见 docs/contracts/theme.md §2.2）
 *
 * 必须位于 <meta name="theme-support"> 与 <meta name="theme-color"> 之后、任何样式表之前：
 *   1. 读 site_theme 偏好（'dark' | 'light' | 'system'，缺省深色）
 *   2. 页面不支持浅色（theme-support 不含 light）→ 恒为深色，且不再监听任何变化
 *   3. 写 <html data-theme>；支持浅色的页面再写 color-scheme 并切换 theme-color（浅色值在 data-light 上）。
 *      仅深色页面不碰 color-scheme —— 原生控件 / 滚动条的观感保持今天的样子（P0 零变化）
 *   4. 之后跟随 storage（首页在别的标签页改了偏好）/ site-settings:changed / 系统配色变化，
 *      生效主题真的变了才派发 window 事件 'theme:changed'（detail.theme）
 * 保持 ES5 语法：public/ 下的文件不经 Vite / legacy 插件转译。
 */
(function () {
    var root = document.documentElement;
    var supportMeta = document.querySelector('meta[name="theme-support"]');
    var supportsLight = !!supportMeta && /(^|\s)light(\s|$)/.test(supportMeta.getAttribute('content') || '');
    var mq = null;
    try {
        mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
    } catch (e) {
        mq = null;
    }

    function readPref() {
        var v = null;
        try {
            v = window.localStorage.getItem('site_theme');
        } catch (e) {
            v = null; // 隐私模式：按默认深色
        }
        return v === 'light' || v === 'system' ? v : 'dark';
    }

    function resolve() {
        if (!supportsLight) return 'dark';
        var pref = readPref();
        if (pref === 'system') return mq && mq.matches ? 'light' : 'dark';
        return pref;
    }

    function apply(theme) {
        root.setAttribute('data-theme', theme);
        if (!supportsLight) return;
        root.style.colorScheme = theme;
        var meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) return;
        if (!meta.hasAttribute('data-dark')) meta.setAttribute('data-dark', meta.getAttribute('content') || '');
        var value = theme === 'light' ? meta.getAttribute('data-light') : meta.getAttribute('data-dark');
        if (value) meta.setAttribute('content', value);
    }

    var current = resolve();
    apply(current);
    if (!supportsLight) return;

    function refresh() {
        var next = resolve();
        if (next === current) return;
        current = next;
        apply(next);
        try {
            window.dispatchEvent(new CustomEvent('theme:changed', { detail: { theme: next } }));
        } catch (e) {
            // 老浏览器没有 CustomEvent 构造器：主题已切换，只是画布要等下次重绘
        }
    }

    window.addEventListener('storage', function (e) {
        if (!e || !e.key || e.key === 'site_theme') refresh();
    });
    window.addEventListener('site-settings:changed', refresh);
    if (mq) {
        if (mq.addEventListener) mq.addEventListener('change', refresh);
        else if (mq.addListener) mq.addListener(refresh);
    }
}());
