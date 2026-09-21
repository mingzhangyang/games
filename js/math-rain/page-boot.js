// math-rain 页面启动器（P4-3 自 math-rain.html 内联 module 原样抽离——内联 module 是 vite html-inline-proxy 竞态的风险源）
// B 批次（2026-09-20）：math-rain.html 的 compatibility globals 内联 script 并入此处。
// 2026-09-21：语言切换 UI 已收敛到首页，本页的 lang-btn / window.selectLanguage /
// __pendingLanguageSelection 缓存已删除，只保留 home-exit-btn 绑定。
// P2（2026-09-20）：HTML 的 onclick 内联处理器已全部移除，
// 事件绑定统一收敛到本文件 —— 本 module 为 type="module"（defer 语义），执行时 DOM 已就绪。
// P1（2026-09-20）：游戏依赖类（expression-generator 等 6 个）不再经此处动态 import +
// window 兼容挂载，全部由 main.js 静态 import 直连；本文件只保留语言/商店/主入口编排。
// mobile-adapter 保持 import 以触发其 DOM-ready 自初始化。

// 原 globals 里的 window.updateShopInterface 转发包装已删：
// git grep 全仓无任何消费者（shop-manager 内部用 this.updateShopInterface），死代码。

// P2：主页退出按钮绑定（module defer ⇒ DOM 就绪）
// 2026-09-21：语言切换 UI 收敛到首页后，本页的 lang-btn 与 window.selectLanguage
// （连同 languageManager 未就绪时的 __pendingLanguageSelection 缓存）已一并删除。
const homeExitBtn = document.getElementById('home-exit-btn');
if (homeExitBtn) {
    homeExitBtn.addEventListener('click', () => { window.location.href = 'index.html'; });
}

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

        // DI：商店经访问器拿 GameStateManager，不再直摸 window.mathRainGame
        window.shopManager = new ShopManager({
            getGameStateManager: () => window.mathRainGame?.gameStateManager || null
        });

        await import('./main.js');
    } catch (error) {
        console.error('Failed to bootstrap Math Rain:', error);
    }
})();
