// math-rain 页面启动器（P4-3 自 math-rain.html 内联 module 原样抽离——内联 module 是 vite html-inline-proxy 竞态的风险源）
// B 批次（2026-09-20）：math-rain.html 的 compatibility globals 内联 script 并入此处。
// 顺序约定：globals 挂载必须先于 languageManager 初始化（__pendingLanguageSelection
// 缓存机制依赖该顺序，与抽离前 body 末尾内联 script → module 的时序等价）。
// ⚠️ HTML 里的 4 个 lang-btn 用 onclick="selectLanguage(...)" 内联处理器，
// 求值时查 window.selectLanguage —— 本文件顶部必须保持全局挂载，勿改模块作用域。

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
                const [
                    { default: LanguageManager },
                    { default: ShopManager },
                    { default: ExpressionGenerator },
                    { default: QuestionBankManager },
                    { default: DifficultyManager },
                    { default: SoundManager },
                    particleEffectsModule,
                    mobileAdapterModule
                ] = await Promise.all([
                    import('./i18n/language-manager.js'),
                    import('./shop-manager.js'),
                    import('./expression-generator.js'),
                    import('./question-bank-manager.js'),
                    import('./difficulty-manager.js'),
                    import('./sound-manager.js'),
                    import('./particle-effects.js').catch(() => null),
                    import('./mobile-adapter.js').catch(() => null)
                ]);

                // 各游戏类模块底部自带 window.X 兼容挂载（P0 保留，P1 直连 import 后一并移除），
                // 此处不再重复挂载。window.mathRainGame / window.languageManager / window.shopManager
                // 是 shop-manager、language-manager 与 smoke-math-rain 的真实消费面，保留。
                void ExpressionGenerator; void QuestionBankManager;
                void DifficultyManager; void SoundManager;

                window.languageManager = new LanguageManager();
                window.languageManager.initialize();

                if (window.__pendingLanguageSelection) {
                    window.languageManager.selectLanguage(window.__pendingLanguageSelection);
                    window.__pendingLanguageSelection = null;
                }

                window.shopManager = new ShopManager();

                await import('./main.js');
            } catch (error) {
                console.error('Failed to bootstrap Math Rain:', error);
            }
        })();
