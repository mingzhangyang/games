// math-rain 页面启动器（P4-3 自 math-rain.html 内联 module 原样抽离——内联 module 是 vite html-inline-proxy 竞态的风险源）
        (async () => {
            try {
                const [
                    { default: LanguageManager },
                    { default: ShopManager },
                    { default: ConfigManager },
                    { default: PerformanceMonitor },
                    { default: ExpressionGenerator },
                    { default: QuestionBankManager },
                    { default: DifficultyManager },
                    { default: SoundManager },
                    { default: AnimationEngine },
                    particleEffectsModule,
                    mobileAdapterModule
                ] = await Promise.all([
                    import('./i18n/language-manager.js'),
                    import('./shop-manager.js'),
                    import('../config-manager.js'),
                    import('../performance-monitor.js'),
                    import('./expression-generator.js'),
                    import('./question-bank-manager.js'),
                    import('./difficulty-manager.js'),
                    import('./sound-manager.js'),
                    import('./animation-engine.js'),
                    import('./particle-effects.js').catch(() => null),
                    import('./mobile-adapter.js').catch(() => null)
                ]);

                window.ConfigManager = ConfigManager;
                window.PerformanceMonitor = PerformanceMonitor;
                window.ExpressionGenerator = ExpressionGenerator;
                window.QuestionBankManager = QuestionBankManager;
                window.DifficultyManager = DifficultyManager;
                window.SoundManager = SoundManager;
                window.AnimationEngine = AnimationEngine;
                if (particleEffectsModule?.default) {
                    window.ParticleSystem = particleEffectsModule.default;
                }
                if (mobileAdapterModule?.default) {
                    window.MobileAdapter = mobileAdapterModule.default;
                }

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
