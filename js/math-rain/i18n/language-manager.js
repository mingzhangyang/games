/**
 * Language Manager for Math Rain Game
 * Handles multi-language support and UI updates
 */

import LANGUAGES_EN from './lang-en.js';
import LANGUAGES_ZH from './lang-zh.js';

class LanguageManager {
    constructor() {
        this.languages = {
            en: LANGUAGES_EN,
            zh: LANGUAGES_ZH
        };
        
        this.currentLanguage = this.detectDefaultLanguage();
        
        // Expose to global scope for compatibility
        if (typeof window !== 'undefined') {
            window.LANGUAGES = this.languages;
            window.currentLanguage = this.currentLanguage;
            window.selectLanguage = this.selectLanguage.bind(this);
            window.updateLanguage = this.updateLanguage.bind(this);
            window.updateLanguageButtons = this.updateLanguageButtons.bind(this);
            window.getLocalizedText = this.getLocalizedText.bind(this);
        }
    }

    /**
     * Detect default language based on browser settings
     */
    detectDefaultLanguage() {
        const browserLang = navigator.language || navigator.userLanguage || '';
        return browserLang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
    }

    /**
     * Select and switch language
     * @param {string} lang - Language code ('en' or 'zh')
     */
    selectLanguage(lang) {
        this.currentLanguage = lang;
        // Sync with global variable
        if (typeof window !== 'undefined') {
            window.currentLanguage = this.currentLanguage;
        }
        
        this.updateLanguage();
        this.updateLanguageButtons();
        
        // Notify other components of language change
        if (typeof window !== 'undefined' && window.mathRainGame && window.mathRainGame.eventSystem) {
            window.mathRainGame.eventSystem.emit('language:changed', {
                language: this.currentLanguage
            });
        }
    }

    /**
     * Update language buttons state
     */
    updateLanguageButtons() {
        // Update start screen language buttons
        const zhBtn = document.getElementById('lang-zh');
        const enBtn = document.getElementById('lang-en');
        const settingsZhBtn = document.getElementById('settings-lang-zh');
        const settingsEnBtn = document.getElementById('settings-lang-en');
        
        if (zhBtn && enBtn) {
            zhBtn.classList.toggle('active', this.currentLanguage === 'zh');
            enBtn.classList.toggle('active', this.currentLanguage === 'en');
        }
        
        if (settingsZhBtn && settingsEnBtn) {
            settingsZhBtn.classList.toggle('active', this.currentLanguage === 'zh');
            settingsEnBtn.classList.toggle('active', this.currentLanguage === 'en');
        }
    }

    /**
     * Update all UI text based on current language
     */
    updateLanguage() {
        const texts = this.languages[this.currentLanguage];
        if (!texts) return;

        // Basic game elements
        this.updateElement('game-title', texts.gameTitle);
        this.updateElement('game-subtitle', texts.gameSubtitle);
        this.updateElement('start-game-btn', texts.startGame);
        this.updateElement('help-btn', texts.helpButton);
        this.updateElement('difficulty-title', texts.difficulty);

        // Game stats labels
        this.updateElement('score-label', texts.score);
        this.updateElement('combo-label', texts.comboLabel);
        this.updateElement('level-label', texts.level);
        this.updateElement('time-label', texts.time);
        this.updateElement('lives-label', texts.lives);
        this.updateElement('target-label', texts.targetNumber);
        this.updateElement('target-hint', texts.clickHint);

        // Tool buttons
        this.updateToolButton('freeze-btn', '❄️', texts.freeze, texts.freezeTitle);
        this.updateToolButton('bomb-btn', '💣', texts.bomb, texts.bombTitle);
        this.updateToolButton('shield-btn', '🛡️', texts.shield, texts.shieldTitle);

        // Control buttons
        this.updateButtonWithIcon('pause-btn', '⏸️', texts.pause);
        this.updateButtonWithIcon('settings-btn', '⚙️', texts.settings);
        this.updateButtonWithIcon('theme-btn', '🎨', texts.theme);
        this.updateButtonWithIcon('shop-btn', '🛒', texts.shop);

        // Session display
        this.updateElement('session-time-label', texts.sessionTime);
        this.updateElement('session-target-label', texts.sessionTarget);
        
        // Level up indicator
        const levelUpIndicator = document.querySelector('.level-up-indicator span');
        if (levelUpIndicator) levelUpIndicator.textContent = `🎯 ${texts.canLevelUp}`;

        // Screen titles
        this.updateElementWithIcon('game-over-title', '🎮', texts.gameOver);
        this.updateElementWithIcon('session-complete-title', '🎯', texts.sessionComplete);
        this.updateElementWithIcon('pause-title', '⏸️', texts.gamePaused);
        this.updateElementWithIcon('settings-title', '⚙️', texts.gameSettings);
        this.updateElementWithIcon('help-title', '❓', texts.gameHelp);
        this.updateElement('shop-title', texts.shopTitle);

        // Buttons
        this.updateElement('resume-btn', texts.resumeGame);
        this.updateElement('restart-btn', texts.restartGame);
        this.updateElement('main-menu-btn', texts.mainMenu);
        this.updateElement('session-continue-btn', texts.continueNext);
        this.updateElement('session-retry-btn', texts.retryLevel);
        this.updateElement('session-menu-btn', texts.backToMenu);

        // Settings
        this.updateElement('sound-volume-label', texts.soundVolume);
        this.updateElement('music-volume-label', texts.musicVolume);
        this.updateElement('particle-effects-label', texts.particleEffects);
        this.updateElement('language-setting-label', texts.languageSetting);
        this.updateElement('settings-close-btn', texts.closeSettings);

        // Help screen
        this.updateElement('help-objective-title', texts.gameObjective);
        this.updateElement('help-objective-text', texts.gameObjectiveText);
        this.updateElement('help-controls-title', texts.controlMethods);
        this.updateElement('help-click-key', texts.clickTouch);
        this.updateElement('help-click-title', texts.selectExpression);
        this.updateElement('help-click-desc', texts.selectExpressionDesc);
        this.updateElement('help-space-key', texts.spaceKey);
        this.updateElement('help-space-title', texts.pauseResume);
        this.updateElement('help-space-desc', texts.pauseResumeDesc);
        this.updateElement('help-f-key', texts.fKey);
        this.updateElement('help-f-title', texts.useFreeze);
        this.updateElement('help-f-desc', texts.useFreezeDesc);
        this.updateElement('help-b-key', texts.bKey);
        this.updateElement('help-b-title', texts.useBomb);
        this.updateElement('help-b-desc', texts.useBombDesc);
        this.updateElement('help-close-btn', texts.closeHelp);
        this.updateElement('help-start-btn', texts.startGame);

        // Shop
        this.updateElement('shop-coins-label', texts.shopCoinsLabel);
        this.updateElement('freeze-shop-title', texts.freezeShopTitle);
        this.updateElement('freeze-shop-desc', texts.freezeShopDesc);
        this.updateElement('bomb-shop-title', texts.bombShopTitle);
        this.updateElement('bomb-shop-desc', texts.bombShopDesc);
        this.updateElement('shield-shop-title', texts.shieldShopTitle);
        this.updateElement('shield-shop-desc', texts.shieldShopDesc);
        this.updateElement('shop-close-btn', texts.shopClose);

        // Buy buttons
        const buyButtons = document.querySelectorAll('.buy-btn');
        buyButtons.forEach(btn => {
            if (btn) btn.textContent = texts.buy;
        });

        // Difficulty buttons
        for (let i = 1; i <= 6; i++) {
            this.updateElement(`difficulty-${i}`, texts[`difficulty${i}`]);
        }

        // Game rules
        this.updateElement('game-rules-title', texts.gameRulesTitle);
        for (let i = 1; i <= 4; i++) {
            this.updateElement(`rule-${i}`, texts[`rule${i}`]);
        }

        // Update stat labels
        this.updateStatLabels(texts);
        
        // Update language buttons state
        this.updateLanguageButtons();
    }

    /**
     * Update element content safely
     */
    updateElement(id, content) {
        const element = document.getElementById(id);
        if (element && content) {
            element.textContent = content;
        }
    }

    /**
     * Update element with icon
     */
    updateElementWithIcon(id, icon, text) {
        const element = document.getElementById(id);
        if (element && text) {
            element.innerHTML = `${icon} ${text}`;
        }
    }

    /**
     * Update button with icon
     */
    updateButtonWithIcon(id, icon, text) {
        const element = document.getElementById(id);
        if (element && text) {
            element.innerHTML = `${icon} ${text}`;
        }
    }

    /**
     * Update tool button with title attribute
     */
    updateToolButton(id, icon, text, title) {
        const element = document.getElementById(id);
        if (element && text) {
            element.innerHTML = `${icon} ${text}`;
            if (title) {
                element.setAttribute('title', title);
            }
        }
    }

    /**
     * Update stat labels dynamically
     */
    updateStatLabels(texts) {
        const statLabels = document.querySelectorAll('.stat-label');
        const statMappings = {
            '最终分数': texts.finalScore,
            'Final Score': texts.finalScore,
            '目标分数': texts.targetScore, 
            'Target Score': texts.targetScore,
            '准确率': texts.accuracy,
            'Accuracy': texts.accuracy,
            '最高连击': texts.maxCombo,
            'Max Combo': texts.maxCombo,
            '会话时长': texts.sessionDuration,
            'Session Duration': texts.sessionDuration,
            '升级达成': texts.levelUpAchieved,
            'Level Up Achieved': texts.levelUpAchieved
        };
        
        statLabels.forEach(label => {
            if (statMappings[label.textContent]) {
                label.textContent = statMappings[label.textContent];
            }
        });
    }

    /**
     * Get localized text with placeholder replacement
     * @param {string} key - Text key
     * @param {Object} replacements - Placeholder replacements
     * @returns {string} Localized text
     */
    getLocalizedText(key, replacements = {}) {
        try {
            const texts = this.languages[this.currentLanguage];
            if (texts && texts[key]) {
                let text = texts[key];
                // Replace placeholders like {{count}} with actual values
                for (const [placeholder, value] of Object.entries(replacements)) {
                    text = text.replace(`{{${placeholder}}}`, value);
                }
                return text;
            }
            
            // Fallback texts根据语言决定
            const isEnglish = this.currentLanguage === 'en' ||
                             (typeof navigator !== 'undefined' && navigator.language && !navigator.language.startsWith('zh'));
            
            const fallbackTexts = {
                lifeLost: isEnglish ? 'Life -1 (Remaining: {{lives}})' : '生命 -1 (剩余: {{lives}})',
                comboMessage: isEnglish ? '{{count}}x Combo!' : '{{count}}x 连击!',
                coinsEarned: isEnglish ? '+{{amount}} Coins' : '+{{amount}} 金币',
                coinsLost: isEnglish ? '-{{amount}} Coins' : '-{{amount}} 金币'
            };
            
            let text = fallbackTexts[key] || key;
            for (const [placeholder, value] of Object.entries(replacements)) {
                text = text.replace(`{{${placeholder}}}`, value);
            }
            return text;
        } catch (error) {
            return key;
        }
    }

    /**
     * Initialize language manager
     */
    initialize() {
        this.updateLanguage();
        this.updateLanguageButtons();
    }
}

// Export for ES modules
export default LanguageManager;

// Auto-initialize if in browser environment
if (typeof window !== 'undefined') {
    window.LanguageManager = LanguageManager;
}