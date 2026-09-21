/**
 * Language Manager for Math Rain Game
 * Handles multi-language support and UI updates
 */

import LANGUAGES_EN from './lang-en.js';
import LANGUAGES_ZH from './lang-zh.js';
import { getLang } from '../../site-settings.js';
import { updateMoreGames } from '../../more-games.js';

// 站内唯一取词口（P1 合并：原 language-manager / UIController / main.js / shop-manager
// 四处各持一份 getLocalizedText + 同一套 fallback 表，现收敛于此）。
// 语义：命中返回已替换 {{placeholder}} 的字符串；未命中返回 null（调用方自带 || 兜底）。
let activeManager = null;

export function getLocalizedText(key, replacements = {}) {
    const texts = activeManager?.languages?.[activeManager.currentLanguage];
    if (!texts || !texts[key]) return null;
    let text = texts[key];
    for (const [placeholder, value] of Object.entries(replacements)) {
        text = text.replace(`{{${placeholder}}}`, value);
    }
    return text;
}

class LanguageManager {
    constructor() {
        this.languages = {
            en: LANGUAGES_EN,
            zh: LANGUAGES_ZH
        };

        this.currentLanguage = getLang();
        activeManager = this;

        // Expose to global scope for compatibility
        if (typeof window !== 'undefined') {
            window.LANGUAGES = this.languages;
            window.currentLanguage = this.currentLanguage;
            window.updateLanguage = this.updateLanguage.bind(this);
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
     * Update all UI text based on current language
     */
    updateLanguage() {
        const texts = this.languages[this.currentLanguage];
        if (!texts) return;

        if (typeof document !== 'undefined') {
            document.documentElement.lang = this.currentLanguage;
            document.title = this.currentLanguage === 'zh' ? '数字雨 - 算术益智游戏' : 'Math Rain - Mathematical Expression Game';
        }

        // Basic game elements（start-game/help/start-home 内含内联 SVG，仅更新 .btn-text span）
        this.updateElement('game-title', texts.gameTitle);
        this.updateElement('game-subtitle', texts.gameSubtitle);
        this.updateButtonWithIcon('start-game-btn', null, texts.startGame);
        this.updateButtonWithIcon('help-btn', null, texts.helpButton);
        this.updateElement('difficulty-title', texts.difficulty);
        this.updateButtonWithIcon('start-home-btn', null, texts.home || 'Home');

        // Game stats labels
        this.updateElement('score-label', texts.score);
        this.updateElement('combo-label', texts.comboLabel);
        this.updateElement('level-label', texts.level);
        this.updateElement('time-label', texts.time);
        this.updateElement('lives-label', texts.lives);
        this.updateElement('target-label', texts.targetNumber);
        this.updateElement('target-hint', texts.clickHint);

        // Tool buttons
        this.updateToolButton('freeze-btn', texts.freeze, texts.freezeTitle);
        this.updateToolButton('bomb-btn', texts.bomb, texts.bombTitle);
        this.updateToolButton('shield-btn', texts.shield, texts.shieldTitle);

        // Control buttons
        this.updateButtonWithIcon('pause-btn', '⏸️', texts.pause);
        this.updateButtonWithIcon('settings-btn', '⚙️', texts.settings);
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
        this.updateElement('play-again-btn', texts.playAgain || 'Play Again');
        this.updateElement('change-difficulty-btn', texts.changeDifficulty || 'Change Difficulty');
        this.updateElement('home-btn', this.currentLanguage === 'zh' ? '返回主页' : 'Home');

        // Settings
        this.updateElement('sound-volume-label', texts.soundVolume);
        this.updateElement('music-volume-label', texts.musicVolume);
        this.updateElement('particle-effects-label', texts.particleEffects);
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
        
        // 刷新交叉推荐条
        updateMoreGames(this.currentLanguage);
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
        if (!element) return;
        // 控制栏按钮内含内联 SVG 图标，仅更新文字 span，保留图标不被覆盖
        const textSpan = element.querySelector('.btn-text');
        if (textSpan && text) {
            textSpan.textContent = text;
        } else if (text) {
            // 图标方钮（无文字 span）：文字进 title/aria-label，避免 innerHTML 覆盖 SVG
            element.setAttribute('title', text);
            if (element.hasAttribute('aria-label')) {
                element.setAttribute('aria-label', text);
            }
        }
    }

    /**
     * Update tool button text (span-only; tool buttons contain inline SVG icons)
     */
    updateToolButton(id, text, title) {
        const element = document.getElementById(id);
        if (!element) return;
        // 仅更新 .tool-text 文字 span，保留内联 SVG 图标不被 innerHTML 覆盖
        const textSpan = element.querySelector('.tool-text');
        if (textSpan && text) {
            textSpan.textContent = text;
        }
        if (title) {
            element.setAttribute('title', title);
        }
    }

    /**
     * Update stat labels dynamically
     * （结算面板 12 个 .stat-label 带 data-i18n 键，直接查 texts；不再按显示文案反查——
     *   反查在文案微调后会静默失效，data-i18n 是稳定锚点）
     */
    updateStatLabels(texts) {
        document.querySelectorAll('.stat-label[data-i18n]').forEach(label => {
            const value = texts[label.dataset.i18n];
            if (value) {
                label.textContent = value;
            }
        });
    }

    /**
     * Get localized text with placeholder replacement
     * （委托给模块级唯一实现 getLocalizedText，见文件顶部）
     * @param {string} key - Text key
     * @param {Object} replacements - Placeholder replacements
     * @returns {string|null} Localized text, or null when missing
     */
    getLocalizedText(key, replacements = {}) {
        return getLocalizedText(key, replacements);
    }

    /**
     * Initialize language manager
     */
    initialize() {
        this.updateLanguage();
    }
}

// Export for ES modules
export default LanguageManager;