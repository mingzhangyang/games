/**
 * Shop Manager for Math Rain Game
 * Handles shop functionality, purchases, and UI management
 */

class ShopManager {
    constructor(eventSystem = null) {
        this.eventSystem = eventSystem;
        this.isInitialized = false;
        this.shopOpenedDuringGame = false;
        
        // Item prices
        this.prices = {
            freeze: 10,
            bomb: 25,
            shield: 15
        };
        
        this.initialize();
    }

    /**
     * Initialize shop manager
     */
    initialize() {
        if (this.isInitialized) return;
        
        this.bindEventListeners();
        this.isInitialized = true;
    }

    /**
     * Bind shop event listeners
     */
    bindEventListeners() {
        const shopBtn = document.getElementById('shop-btn');
        const shopScreen = document.getElementById('shop-screen');
        const shopCloseBtn = document.getElementById('shop-close-btn');
        
        // Show shop
        if (shopBtn) {
            shopBtn.addEventListener('click', () => this.showShop());
        }
        
        // Hide shop
        if (shopCloseBtn) {
            shopCloseBtn.addEventListener('click', () => this.hideShop());
        }
        
        // Purchase buttons
        this.bindPurchaseButtons();
        
        // Keyboard shortcuts
        this.bindKeyboardShortcuts();
    }

    /**
     * Bind purchase button events
     */
    bindPurchaseButtons() {
        const purchaseButtons = [
            { id: 'buy-freeze-btn', itemType: 'freeze', price: this.prices.freeze },
            { id: 'buy-bomb-btn', itemType: 'bomb', price: this.prices.bomb },
            { id: 'buy-shield-btn', itemType: 'shield', price: this.prices.shield }
        ];
        
        purchaseButtons.forEach(({ id, itemType, price }) => {
            const button = document.getElementById(id);
            if (button) {
                button.addEventListener('click', () => {
                    this.purchaseItem(itemType, price);
                });
            }
        });
    }

    /**
     * Bind keyboard shortcuts
     */
    bindKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {
            // ESC key closes shop
            if (event.key === 'Escape') {
                const shopScreen = document.getElementById('shop-screen');
                if (shopScreen && !shopScreen.classList.contains('hidden')) {
                    this.hideShop();
                }
            }
        });
    }

    /**
     * Show shop interface
     */
    showShop() {
        // Pause game if running
        if (window.mathRainGame && window.mathRainGame.gameStateManager) {
            const gameState = window.mathRainGame.gameStateManager.getState();
            
            // Record if shop was opened during game
            this.shopOpenedDuringGame = gameState && gameState.gameState === 'playing';
            
            // Pause if game is running
            if (this.shopOpenedDuringGame) {
                window.mathRainGame.gameStateManager.pauseGame();
            }
            
            // Update coin display
            this.updateCoinDisplay(gameState);
        }
        
        // Show shop screen, hide others
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.add('hidden');
        });
        
        const shopScreen = document.getElementById('shop-screen');
        if (shopScreen) {
            shopScreen.classList.remove('hidden');
        }
        
        // Update button states
        this.updateBuyButtonStates();
        
        // Emit event
        if (this.eventSystem) {
            this.eventSystem.emit('shop:opened');
        }
    }

    /**
     * Hide shop interface
     */
    hideShop() {
        const shopScreen = document.getElementById('shop-screen');
        if (shopScreen) {
            shopScreen.classList.add('hidden');
        }
        
        // Resume game state
        if (window.mathRainGame && window.mathRainGame.gameStateManager) {
            const gameState = window.mathRainGame.gameStateManager.getState();
            
            // If shop was opened during game, resume it
            if (this.shopOpenedDuringGame && gameState && gameState.gameState === 'paused') {
                window.mathRainGame.gameStateManager.resumeGame();
                this.shopOpenedDuringGame = false;
                // Return to game (don't show any screen)
                if (this.eventSystem) {
                    this.eventSystem.emit('shop:closed', { resumeGame: true });
                }
                return;
            }
            
            // If game is currently running, return to game
            if (gameState && gameState.gameState === 'playing') {
                if (this.eventSystem) {
                    this.eventSystem.emit('shop:closed', { resumeGame: true });
                }
                return;
            }
        }
        
        // Otherwise show start screen
        const startScreen = document.getElementById('start-screen');
        if (startScreen) {
            startScreen.classList.remove('hidden');
        }
        
        // Emit event
        if (this.eventSystem) {
            this.eventSystem.emit('shop:closed', { resumeGame: false });
        }
    }

    /**
     * Update coin display in shop
     */
    updateCoinDisplay(gameState) {
        const shopCoinsValue = document.getElementById('shop-coins-value');
        if (shopCoinsValue && gameState) {
            shopCoinsValue.textContent = gameState.coins || 0;
        }
    }

    /**
     * Update buy button states based on available coins
     */
    updateBuyButtonStates() {
        if (!window.mathRainGame || !window.mathRainGame.gameStateManager) return;
        
        const gameState = window.mathRainGame.gameStateManager.getState();
        const coins = gameState ? gameState.coins : 0;
        
        // Update each buy button
        const buttons = [
            { id: 'buy-freeze-btn', price: this.prices.freeze },
            { id: 'buy-bomb-btn', price: this.prices.bomb },
            { id: 'buy-shield-btn', price: this.prices.shield }
        ];
        
        buttons.forEach(({ id, price }) => {
            const button = document.getElementById(id);
            if (button) {
                button.disabled = coins < price;
            }
        });
    }

    /**
     * Purchase an item
     * @param {string} itemType - Type of item to purchase
     * @param {number} price - Price of the item
     */
    purchaseItem(itemType, price) {
        if (!window.mathRainGame || !window.mathRainGame.gameStateManager) {
            this.showNotification('游戏未初始化！', 'error');
            return;
        }
        
        const gameStateManager = window.mathRainGame.gameStateManager;
        
        // Attempt purchase
        const purchaseSuccess = gameStateManager.purchaseItem(itemType, price);
        
        if (purchaseSuccess) {
            // Success message
            const purchasedMsg = this.getLocalizedText('itemPurchased', '道具已购买！');
            const itemName = this.getItemName(itemType);
            
            this.showNotification(`${purchasedMsg} ${itemName} (-${price}🪙)`, 'success');
            
            // Update shop interface
            this.updateShopInterface();
            
            // Emit event
            if (this.eventSystem) {
                this.eventSystem.emit('shop:item:purchased', {
                    itemType,
                    price,
                    success: true
                });
            }
            
            console.log(`Purchase successful: ${itemType}, cost: ${price} coins`);
        } else {
            // Failure message (insufficient coins)
            const notEnoughMsg = this.getLocalizedText('notEnoughCoins', '金币不足！');
            this.showNotification(notEnoughMsg, 'error');
            
            // Emit event
            if (this.eventSystem) {
                this.eventSystem.emit('shop:item:purchase:failed', {
                    itemType,
                    price,
                    reason: 'insufficient_coins'
                });
            }
        }
    }

    /**
     * Update shop interface after purchase
     */
    updateShopInterface() {
        if (!window.mathRainGame || !window.mathRainGame.gameStateManager) return;
        
        const gameState = window.mathRainGame.gameStateManager.getState();
        
        // Update coin display
        this.updateCoinDisplay(gameState);
        
        // Update button states
        this.updateBuyButtonStates();
    }

    /**
     * Get localized item name
     * @param {string} itemType - Item type
     * @returns {string} Localized item name
     */
    getItemName(itemType) {
        const itemNames = {
            'freeze': this.getLocalizedText('freezeItem', '冻结'),
            'bomb': this.getLocalizedText('bombItem', '炸弹'),
            'shield': this.getLocalizedText('shieldItem', '护盾')
        };
        return itemNames[itemType] || itemType;
    }

    /**
     * Get localized text
     * @param {string} key - Text key
     * @param {string} fallback - Fallback text
     * @returns {string} Localized text
     */
    getLocalizedText(key, fallback) {
        if (typeof window !== 'undefined' && window.LANGUAGES && window.currentLanguage) {
            const texts = window.LANGUAGES[window.currentLanguage];
            if (texts && texts[key]) {
                return texts[key];
            }
        }
        return fallback;
    }

    /**
     * Show notification popup
     * @param {string} message - Message to show
     * @param {string} type - Type of notification ('success' or 'error')
     */
    showNotification(message, type = 'info') {
        const colors = {
            success: '#4CAF50',
            error: '#f44336',
            info: '#2196F3'
        };
        
        const popup = this.createNotificationPopup(message, colors[type] || colors.info);
        setTimeout(() => {
            if (popup.parentNode) {
                popup.remove();
            }
        }, 3000);
    }

    /**
     * Create notification popup element
     * @param {string} message - Message text
     * @param {string} color - Background color
     * @returns {HTMLElement} Popup element
     */
    createNotificationPopup(message, color) {
        const popup = document.createElement('div');
        popup.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${color};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-weight: bold;
            z-index: 10001;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: slideInFromRight 0.3s ease-out;
        `;
        popup.textContent = message;
        
        // Add CSS animation if not already present
        if (!document.getElementById('notification-styles')) {
            const styles = document.createElement('style');
            styles.id = 'notification-styles';
            styles.textContent = `
                @keyframes slideInFromRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(styles);
        }
        
        document.body.appendChild(popup);
        return popup;
    }

    /**
     * Get item prices
     * @returns {Object} Item prices
     */
    getPrices() {
        return { ...this.prices };
    }

    /**
     * Update item prices
     * @param {Object} newPrices - New price configuration
     */
    updatePrices(newPrices) {
        this.prices = { ...this.prices, ...newPrices };
    }

    /**
     * Destroy shop manager
     */
    destroy() {
        this.isInitialized = false;
        this.eventSystem = null;
    }
}

// Export for ES modules
export default ShopManager;

// Auto-initialize if in browser environment
if (typeof window !== 'undefined') {
    window.ShopManager = ShopManager;
}