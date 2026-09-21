// math-rain 页面启动器（P4-3 自 math-rain.html 内联 module 原样抽离——内联 module 是 vite html-inline-proxy 竞态的风险源）
// B 批次（2026-09-20）：math-rain.html 的 compatibility globals 内联 script 并入此处。
// 顺序约定：globals 挂载必须先于 languageManager 初始化（__pendingLanguageSelection
// 缓存机制依赖该顺序，与抽离前 body 末尾内联 script → module 的时序等价）。
// ⚠️ HTML 里的 4 个 lang-btn 用 onclick="selectLanguage(...)" 内联处理器，
// 求值时查 window.selectLanguage —— 本文件顶部必须保持全局挂载，勿改模块作用域。
// P1（2026-09-20）：游戏依赖类（expression-generator 等 6 个）不再经此处动态 import +
// window 兼容挂载，全部由 main.js 静态 import 直连；本文件只保留语言/商店/主入口编排。
// mobile-adapter 保持 import 以触发其 DOM-ready 自初始化。

window.__pendingLanguageSelection = null;
window.selectLanguage = function (lang) {
    window.__pendingLanguageSelection = lang;
    if (window.languageManager) {
        window.languageManager.selectLanguage(lang);
    }
};
// 原 globals 里的 window.updateShopInterface 转发包装已删：
// git grep 全仓无任何消费者（shop-manager 内部用 this.updateShopInterface），死代码。

(async () => {
    try {
        const [{ default: LanguageManager }, { default: ShopManager }, mobileAdapterModule] =
            await Promise.all([
                import('./i18n/language-manager.js'),
                import('./shop-manager.js'),
                import('./mobile-adapter.js').catch(() => null)
            ]);
        void mobileAdapterModule; // 副作用 import：模块自初始化

        window.languageManager = new LanguageManager();
        window.languageManager.initialize();

        if (window.__pendingLanguageSelection) {
            window.languageManager.selectLanguage(window.__pendingLanguageSelection);
            window.__pendingLanguageSelection = null;
        }

        // DI：商店经访问器拿 GameStateManager，不再直摸 window.mathRainGame
        window.shopManager = new ShopManager({
            getGameStateManager: () => window.mathRainGame?.gameStateManager || null
        });

        await import('./main.js');
    } catch (error) {
        console.error('Failed to bootstrap Math Rain:', error);
    }
})();
