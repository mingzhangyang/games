/**
 * UI Controller for Math Rain Game
 * Handles all UI updates, screen transitions, and user input
 */

class UIController {
    constructor(eventSystem, gameStateManager, sessionManager) {
        this.eventSystem = eventSystem;
        this.gameStateManager = gameStateManager;
        this.sessionManager = sessionManager;
        
        // DOM element cache
        this.elements = new Map();
        
        // UI update flags
        this.needsUIUpdate = false;
        this.lastUIUpdateTime = 0;
        this.updateThrottle = 50; // 50ms throttle for UI updates
        
        // Screen management
        this.currentScreen = 'start-screen';
        this.previousScreen = null;
        
        // Input handling
        this.inputHandlers = new Map();
        
        // Modal state tracking
        this.settingsOpenedDuringGame = false;
        
        this.initialize();
    }

    /**
     * Initialize UI controller
     */
    initialize() {
        this.cacheElements();
        this.setupEventListeners();
        this.setupGameStateListeners();
        this.setupSessionListeners();
        this.initializeSettings();
        this.updateUI();
    }

    /**
     * Cache frequently accessed DOM elements
     */
    cacheElements() {
        const elementIds = [
            'score-value', 'combo-value', 'level-value', 'time-value', 'lives-value',
            'target-number', 'freeze-count', 'bomb-count', 'shield-count', 'coins-value',
            'freeze-btn', 'bomb-btn', 'shield-btn', 'session-time', 'session-target',
            'level-up-indicator', 'final-score', 'max-combo', 'accuracy',
            'game-time', 'final-grade', 'final-coins', 'session-final-score',
            'session-target-score', 'session-accuracy', 'session-max-combo',
            'session-duration', 'session-level-up'
        ];

        elementIds.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                this.elements.set(id, element);
            }
        });
    }

    /**
     * Setup event listeners for UI interactions
     */
    setupEventListeners() {
        // Window resize
        window.addEventListener('resize', this.handleResize.bind(this));
        
        // Keyboard events
        document.addEventListener('keydown', this.handleKeyPress.bind(this));
        
        // Game control buttons
        this.bindButton('start-game-btn', () => {
            this.eventSystem.emit('ui:start:game');
        });
        this.bindButton('pause-btn', () => this.eventSystem.emit('ui:pause:game'));
        this.bindButton('resume-btn', () => this.eventSystem.emit('ui:resume:game'));
        this.bindButton('restart-btn', () => this.eventSystem.emit('ui:restart:game'));
        this.bindButton('main-menu-btn', () => this.showMainMenu());
        this.bindButton('play-again-btn', () => this.eventSystem.emit('ui:restart:game'));
        this.bindButton('change-difficulty-btn', () => this.showMainMenu());
        this.bindButton('home-btn', () => this.goHome());
        
        // Settings buttons
        this.bindButton('settings-btn', () => this.showSettings());
        this.bindButton('settings-close-btn', () => this.hideSettings());
        this.bindButton('theme-btn', () => this.toggleTheme());
        
        // Help buttons
        this.bindButton('help-btn', () => this.showHelp());
        this.bindButton('help-close-btn', () => this.hideHelp());
        this.bindButton('help-start-btn', () => {
            this.hideHelp();
            this.eventSystem.emit('ui:start:game');
        });
        
        // Session buttons
        this.bindButton('session-continue-btn', () => this.eventSystem.emit('ui:session:continue'));
        this.bindButton('session-retry-btn', () => this.eventSystem.emit('ui:session:retry'));
        this.bindButton('session-menu-btn', () => this.showMainMenu());
        
        // Power-up buttons
        this.bindButton('freeze-btn', () => this.eventSystem.emit('ui:powerup:freeze'));
        this.bindButton('bomb-btn', () => this.eventSystem.emit('ui:powerup:bomb'));
        this.bindButton('shield-btn', () => this.eventSystem.emit('ui:powerup:shield'));
        
        // Difficulty selection
        const difficultyButtons = document.querySelectorAll('.difficulty-btn');
        difficultyButtons.forEach(btn => {
            btn.addEventListener('click', () => this.selectDifficulty(btn));
        });
    }

    /**
     * Setup listeners for game state changes
     */
    setupGameStateListeners() {
        this.eventSystem.on('gameState:changed', (state) => {
            this.updateUIFromGameState(state);
        });
        
        this.eventSystem.on('target:changed', (data) => {
            this.updateTargetDisplay(data.newTarget);
            if (data.oldTarget !== undefined) {
                this.playTargetChangeAnimation();
            }
        });
        
        this.eventSystem.on('target:warning', (data) => {
            if (data.warning) {
                this.showTargetChangeWarning();
            } else {
                this.hideTargetChangeWarning();
            }
        });
        
        this.eventSystem.on('answer:correct', (data) => {
            this.createScorePopup(data.position.x, data.position.y, `+${data.score}`, '#48bb78');
        });
        
        this.eventSystem.on('answer:incorrect', (data) => {
            if (data.penalty < 0) {
                this.createScorePopup(data.position.x, data.position.y, `${data.penalty}`, '#e53e3e');
            }
        });
        
        this.eventSystem.on('coins:earned', (data) => {
            const coinsText = this.getLocalizedText('coinsEarned', { amount: data.amount }) || `+${data.amount} Coins`;
            this.createScorePopup(data.position?.x || 100, data.position?.y || 100, coinsText, '#ffd700');
        });
        
        this.eventSystem.on('coins:lost', (data) => {
            const coinsText = this.getLocalizedText('coinsLost', { amount: data.amount }) || `-${data.amount} Coins`;
            this.createScorePopup(data.position?.x || 100, data.position?.y || 100, coinsText, '#e53e3e');
        });
    }

    /**
     * Setup listeners for session events
     */
    setupSessionListeners() {
        this.eventSystem.on('session:started', (data) => {
            this.updateSessionUI();
        });
        
        this.eventSystem.on('session:time:updated', (data) => {
            this.updateElement('session-time', data.formattedTime);
        });
        
        this.eventSystem.on('session:levelup:status', (data) => {
            const indicator = this.elements.get('level-up-indicator');
            if (indicator) {
                indicator.style.display = data.canLevelUp ? 'block' : 'none';
            }
        });
        
        this.eventSystem.on('session:completed', (data) => {
            this.showSessionResults(data);
        });
        
        this.eventSystem.on('game:started', () => {
            this.hideAllScreens();
        });
        
        this.eventSystem.on('game:paused', () => {
            this.showScreen('pause-screen');
        });
        
        this.eventSystem.on('game:resumed', () => {
            this.hideAllScreens();
        });
        
        this.eventSystem.on('game:over', (data) => {
            this.showGameOverScreen(data);
        });
    }

    /**
     * Bind button event handler
     * @param {string} id - Button ID
     * @param {Function} handler - Click handler
     */
    bindButton(id, handler) {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('click', (e) => {
                e.preventDefault();
                // Play click sound through event system
                this.eventSystem.emit('ui:sound:click');
                handler();
            });
        }
    }

    /**
     * Update UI from game state
     * @param {Object} state - Game state
     */
    updateUIFromGameState(state) {
        // Update score
        this.updateElement('score-value', state.score.toLocaleString());
        
        // Update combo with color
        const comboElement = this.elements.get('combo-value');
        if (comboElement) {
            comboElement.textContent = state.combo.toString();
            comboElement.style.color = state.combo > 0 ? '#ed8936' : '#48bb78';
        }
        
        // Update other stats
        this.updateElement('level-value', Math.floor(state.level).toString());
        this.updateElement('time-value', state.formattedTime);
        
        // Update lives with color coding
        const livesElement = this.elements.get('lives-value');
        if (livesElement) {
            livesElement.textContent = state.lives.toString();
            // Color code based on lives remaining
            if (state.lives <= 2) {
                livesElement.style.color = '#e53e3e'; // Red - critical
            } else if (state.lives <= 5) {
                livesElement.style.color = '#ed8936'; // Orange - warning
            } else {
                livesElement.style.color = '#48bb78'; // Green - safe
            }
        }
        this.updateElement('freeze-count', `x${state.freezeCount}`);
        this.updateElement('bomb-count', `x${state.bombCount}`);
        this.updateElement('shield-count', `x${state.shieldCount}`);
        this.updateElement('coins-value', state.coins.toString());
        
        // Update button states
        this.updatePowerUpButtons(state);
    }

    /**
     * Update power-up button states
     * @param {Object} state - Game state
     */
    updatePowerUpButtons(state) {
        const freezeBtn = this.elements.get('freeze-btn');
        if (freezeBtn) {
            freezeBtn.disabled = state.freezeCount <= 0 || state.gameState !== 'playing';
            if (state.freezeActive) {
                freezeBtn.classList.add('active');
            } else {
                freezeBtn.classList.remove('active');
            }
        }
        
        const bombBtn = this.elements.get('bomb-btn');
        if (bombBtn) {
            bombBtn.disabled = state.bombCount <= 0 || state.gameState !== 'playing';
        }
        
        const shieldBtn = this.elements.get('shield-btn');
        if (shieldBtn) {
            shieldBtn.disabled = state.shieldCount <= 0 || state.gameState !== 'playing';
            if (state.shieldActive) {
                shieldBtn.classList.add('active');
            } else {
                shieldBtn.classList.remove('active');
            }
        }
    }

    /**
     * Update session UI
     */
    updateSessionUI() {
        if (!this.sessionManager || !this.sessionManager.areSessionsEnabled()) {
            return;
        }
        
        const sessionState = this.sessionManager.getSessionState();
        this.updateElement('session-time', sessionState.formattedTimeRemaining);
        this.updateElement('session-target', sessionState.targetScore);
    }

    /**
     * Update target number display
     * @param {number} targetNumber - New target number
     */
    updateTargetDisplay(targetNumber) {
        this.updateElement('target-number', targetNumber);
    }

    /**
     * Play target change animation
     */
    playTargetChangeAnimation() {
        const targetElement = this.elements.get('target-number');
        if (targetElement) {
            targetElement.classList.add('changing');
            setTimeout(() => {
                targetElement.classList.remove('changing');
            }, 800);
        }
    }

    /**
     * Show target change warning
     */
    showTargetChangeWarning() {
        const targetNumber = this.elements.get('target-number');
        if (targetNumber) {
            targetNumber.classList.add('target-changing-warning');
        }
    }

    /**
     * Hide target change warning
     */
    hideTargetChangeWarning() {
        const targetNumber = this.elements.get('target-number');
        if (targetNumber) {
            targetNumber.classList.remove('target-changing-warning');
        }
    }

    /**
     * Select difficulty level
     * @param {HTMLElement} button - Difficulty button
     */
    selectDifficulty(button) {
        // Remove selection from other buttons
        document.querySelectorAll('.difficulty-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
        
        // Select current button
        button.classList.add('selected');
        
        // Get difficulty level
        const level = parseInt(button.dataset.level);
        
        // Emit difficulty selection event
        this.eventSystem.emit('ui:difficulty:selected', { level });
    }

    /**
     * Show specific screen
     * @param {string} screenId - Screen element ID
     */
    showScreen(screenId) {
        this.previousScreen = this.currentScreen;
        this.currentScreen = screenId;
        
        const screen = document.getElementById(screenId);
        if (screen) {
            screen.classList.remove('hidden');
        }
        
        this.eventSystem.emit('ui:screen:shown', { 
            screen: screenId,
            previous: this.previousScreen 
        });
    }

    /**
     * Hide specific screen
     * @param {string} screenId - Screen element ID
     */
    hideScreen(screenId) {
        const screen = document.getElementById(screenId);
        if (screen) {
            screen.classList.add('hidden');
        }
    }

    /**
     * Hide all screens
     */
    hideAllScreens() {
        const screens = document.querySelectorAll('.screen');
        screens.forEach(screen => {
            screen.classList.add('hidden');
        });
    }

    /**
     * Show main menu
     */
    showMainMenu() {
        this.hideAllScreens();
        this.showScreen('start-screen');
        this.eventSystem.emit('ui:main:menu:shown');
    }

    /**
     * Show settings screen
     */
    showSettings() {
        // Pause game if running
        if (this.gameStateManager) {
            const gameState = this.gameStateManager.getState();
            
            // Record if settings was opened during game
            this.settingsOpenedDuringGame = gameState && gameState.gameState === 'playing';
            
            // Pause if game is running
            if (this.settingsOpenedDuringGame) {
                this.gameStateManager.pauseGame();
            }
        }
        
        this.showScreen('settings-screen');
    }

    /**
     * Hide settings screen
     */
    hideSettings() {
        this.hideScreen('settings-screen');
        
        // Resume game state
        if (this.gameStateManager) {
            const gameState = this.gameStateManager.getState();
            
            // If settings was opened during game, resume it
            if (this.settingsOpenedDuringGame && gameState && gameState.gameState === 'paused') {
                this.gameStateManager.resumeGame();
                this.settingsOpenedDuringGame = false;
                return;
            }
            
            // If game is currently running, just hide settings
            if (gameState && gameState.gameState === 'playing') {
                return;
            }
        }
    }

    /**
     * Show help screen
     */
    showHelp() {
        this.showScreen('help-screen');
    }

    /**
     * Hide help screen
     */
    hideHelp() {
        this.hideScreen('help-screen');
    }

    /**
     * Show session results
     * @param {Object} data - Session result data
     */
    showSessionResults(data) {
        this.updateElement('session-final-score', data.finalScore);
        this.updateElement('session-target-score', data.targetScore);
        this.updateElement('session-accuracy', `${data.accuracy.toFixed(1)}%`);
        this.updateElement('session-max-combo', data.maxCombo);
        this.updateElement('session-duration', `${data.sessionDurationMinutes} 分钟`);
        this.updateElement('session-level-up', data.levelUpAchieved ? '是' : '否');
        
        // Show/hide continue button based on level up status
        const continueBtn = document.getElementById('session-continue-btn');
        if (continueBtn) {
            continueBtn.style.display = data.levelUpAchieved ? 'block' : 'none';
        }
        
        this.hideAllScreens();
        this.showScreen('session-complete-screen');
    }

    /**
     * Show game over screen
     * @param {Object} data - Game over data
     */
    showGameOverScreen(data) {
        this.updateElement('final-score', data.score.toLocaleString());
        this.updateElement('max-combo', data.maxCombo);
        this.updateElement('accuracy', data.accuracy.toFixed(1) + '%');
        this.updateElement('game-time', data.gameTimeSeconds + 's');
        this.updateElement('final-grade', data.grade);
        this.updateElement('final-coins', `+${data.coinsEarned}`);
        
        this.showScreen('game-over-screen');
    }

    /**
     * Toggle theme
     */
    toggleTheme() {
        const body = document.body;
        const isDark = body.classList.contains('dark-theme');
        const isLight = body.classList.contains('light-theme');
        
        if (isDark) {
            body.classList.remove('dark-theme');
            body.classList.add('light-theme');
            localStorage.setItem('theme', 'light');
        } else if (isLight) {
            body.classList.remove('light-theme');
            localStorage.setItem('theme', 'default');
        } else {
            body.classList.add('dark-theme');
            localStorage.setItem('theme', 'dark');
        }
        
        this.eventSystem.emit('ui:theme:changed', {
            theme: localStorage.getItem('theme') || 'default'
        });
    }

    /**
     * Initialize settings controls
     */
    initializeSettings() {
        // Load saved theme
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-theme');
        } else if (savedTheme === 'light') {
            document.body.classList.add('light-theme');
        }
        
        // Sound volume slider
        const soundVolumeSlider = document.getElementById('sound-volume');
        const soundVolumeValue = document.getElementById('sound-volume-value');
        if (soundVolumeSlider && soundVolumeValue) {
            soundVolumeSlider.addEventListener('input', (e) => {
                const volume = e.target.value / 100;
                soundVolumeValue.textContent = e.target.value + '%';
                this.eventSystem.emit('ui:settings:sound:volume', { volume });
            });
        }
        
        // Music volume slider
        const musicVolumeSlider = document.getElementById('music-volume');
        const musicVolumeValue = document.getElementById('music-volume-value');
        if (musicVolumeSlider && musicVolumeValue) {
            musicVolumeSlider.addEventListener('input', (e) => {
                const volume = e.target.value / 100;
                musicVolumeValue.textContent = e.target.value + '%';
                this.eventSystem.emit('ui:settings:music:volume', { volume });
            });
        }
        
        // Particle effects toggle
        const particleEffectsCheckbox = document.getElementById('particle-effects');
        if (particleEffectsCheckbox) {
            particleEffectsCheckbox.addEventListener('change', (e) => {
                this.eventSystem.emit('ui:settings:particle:effects', { 
                    enabled: e.target.checked 
                });
            });
        }
    }

    /**
     * Get localized text
     */
    getLocalizedText(key, replacements = {}) {
        try {
            if (typeof window !== 'undefined' && window.getLocalizedText) {
                return window.getLocalizedText(key, replacements);
            }
            
            if (typeof window !== 'undefined' && window.LANGUAGES && window.currentLanguage) {
                const texts = window.LANGUAGES[window.currentLanguage];
                if (texts && texts[key]) {
                    let text = texts[key];
                    for (const [placeholder, value] of Object.entries(replacements)) {
                        text = text.replace(`{{${placeholder}}}`, value);
                    }
                    return text;
                }
            }
            
            return null; // Return null to use fallback
        } catch (error) {
            return null;
        }
    }

    /**
     * Create score popup animation
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {string} text - Text to show
     * @param {string} color - Text color
     */
    createScorePopup(x, y, text, color = '#48bb78') {
        const popup = document.createElement('div');
        popup.className = 'score-popup';
        popup.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            color: ${color};
            font-size: 20px;
            font-weight: bold;
            pointer-events: none;
            z-index: 1000;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
            animation: scoreFloat 1s ease-out forwards;
        `;
        popup.textContent = text;
        
        // Add animation styles if not already present
        if (!document.getElementById('score-popup-styles')) {
            const styles = document.createElement('style');
            styles.id = 'score-popup-styles';
            styles.textContent = `
                @keyframes scoreFloat {
                    0% {
                        transform: translateY(0px);
                        opacity: 1;
                    }
                    100% {
                        transform: translateY(-50px);
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(styles);
        }
        
        document.body.appendChild(popup);
        
        // Remove after animation
        setTimeout(() => {
            if (popup.parentNode) {
                popup.parentNode.removeChild(popup);
            }
        }, 1000);
    }

    /**
     * Update element content
     * @param {string} id - Element ID
     * @param {string|number} content - New content
     */
    updateElement(id, content) {
        const element = this.elements.get(id) || document.getElementById(id);
        if (element && element.textContent !== content.toString()) {
            element.textContent = content;
        }
    }

    /**
     * Handle window resize
     */
    handleResize() {
        this.eventSystem.emit('ui:window:resized', {
            width: window.innerWidth,
            height: window.innerHeight
        });
    }

    /**
     * Handle keyboard input
     * @param {KeyboardEvent} event - Keyboard event
     */
    handleKeyPress(event) {
        const keyActions = {
            'Space': () => this.eventSystem.emit('ui:key:space'),
            'Escape': () => this.eventSystem.emit('ui:key:escape'),
            'KeyR': () => this.eventSystem.emit('ui:key:r'),
            'KeyF': () => this.eventSystem.emit('ui:key:f'),
            'KeyB': () => this.eventSystem.emit('ui:key:b'),
            'KeyS': () => this.eventSystem.emit('ui:key:s')
        };
        
        const action = keyActions[event.code];
        if (action) {
            action();
        }
    }

    /**
     * Go to home page
     */
    goHome() {
        window.location.href = 'index.html';
    }

    /**
     * Update UI (throttled)
     */
    updateUI() {
        const currentTime = Date.now();
        if (currentTime - this.lastUIUpdateTime > this.updateThrottle || this.needsUIUpdate) {
            this.needsUIUpdate = false;
            this.lastUIUpdateTime = currentTime;
            
            // Update from current game state
            if (this.gameStateManager) {
                this.updateUIFromGameState(this.gameStateManager.getState());
            }
            
            // Update session UI
            this.updateSessionUI();
        }
    }

    /**
     * Trigger UI update
     */
    triggerUpdate() {
        this.needsUIUpdate = true;
    }

    /**
     * Destroy the UI controller
     */
    destroy() {
        // Remove event listeners
        window.removeEventListener('resize', this.handleResize);
        document.removeEventListener('keydown', this.handleKeyPress);
        
        // Clear element cache
        this.elements.clear();
        
        // Clear input handlers
        this.inputHandlers.clear();
        
        // Clear event system reference
        this.eventSystem = null;
        this.gameStateManager = null;
        this.sessionManager = null;
    }
}

// ES Module export
export default UIController;

// CommonJS compatibility
if (typeof window !== 'undefined') {
    window.UIController = UIController;
}