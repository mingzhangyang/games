/**
 * Game State Manager for Math Rain Game
 * Handles all game state, scoring, and progression logic
 */

class GameStateManager {
    constructor(eventSystem) {
        this.eventSystem = eventSystem;
        this.reset();
        
        // Game configuration
        this.config = {
            baseScore: 10,
            comboMultiplier: 1.5,
            errorPenalty: [0, -5, -15, -30, -50],
            maxErrorRate: 0.4 // 错误率上限40%，超过则游戏结束
        };
    }

    /**
     * Reset all game state to initial values
     */
    reset() {
        // Core game state
        this.gameState = 'menu'; // menu, playing, paused, gameOver, sessionComplete
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.level = 1;
        this.gameTime = 0;
        this.lives = 10; // Increased from 3 to 10 for better gameplay balance
        
        // Timing
        this.gameStartTime = 0;
        this.lastUpdateTime = 0;
        
        // Statistics
        this.totalClicks = 0;
        this.correctClicks = 0;
        this.incorrectClicks = 0;
        this.totalAnswered = 0;
        this.correctAnswers = 0;
        this.consecutiveErrors = 0;
        this.maxErrorRateExceeded = false;
        
        // Target number system
        this.targetNumber = 5;
        this.nextTargetChangeTime = 0;
        this.targetChangeWarning = false;
        
        // Power-ups and items
        this.freezeCount = 2;
        this.bombCount = 1;
        this.shieldCount = 0; // New item type
        this.coins = 0;
        this.freezeActive = false;
        this.freezeEndTime = 0;
        this.freezeDuration = 4000;
        this.shieldActive = false;
        this.shieldEndTime = 0;
        
        // Grade to coins mapping
        this.gradeToCoins = {
            'S': 50,
            'A': 30,
            'B': 20,
            'C': 10,
            'D': 5,
            'F': 0
        };

        this.emitStateChanged();
    }

    /**
     * Start a new game
     */
    startGame() {
        if (this.gameState === 'playing') {
            return;
        }

        this.gameState = 'playing';
        this.gameStartTime = Date.now();
        this.lastUpdateTime = this.gameStartTime;
        
        this.emitStateChanged();
        this.eventSystem.emit('game:started');
    }

    /**
     * Pause the game
     */
    pauseGame() {
        if (this.gameState !== 'playing') {
            return;
        }

        this.gameState = 'paused';
        this.pauseStartTime = Date.now();
        
        this.emitStateChanged();
        this.eventSystem.emit('game:paused');
    }

    /**
     * Resume the game
     */
    resumeGame() {
        if (this.gameState !== 'paused') {
            return;
        }

        this.gameState = 'playing';
        
        // Adjust timing for pause duration
        const resumeTime = Date.now();
        const pausedDuration = resumeTime - (this.pauseStartTime || this.lastUpdateTime);
        this.gameStartTime += pausedDuration;
        
        // Emit pause duration for main game to adjust its timers
        
        this.pauseStartTime = null;
        
        this.emitStateChanged();
        this.eventSystem.emit('game:resumed', { pausedDuration });
    }

    /**
     * End the game
     */
    gameOver() {
        
        this.gameState = 'gameOver';
        
        // Calculate final statistics
        const accuracy = this.totalClicks > 0 ? (this.correctClicks / this.totalClicks * 100) : 0;
        const gameTimeSeconds = Math.floor(this.gameTime / 1000);
        const grade = this.calculateGrade(accuracy);
        const coinsEarned = this.gradeToCoins[grade] || 0;
        
        this.coins += coinsEarned;
        
        const gameOverData = {
            score: this.score,
            maxCombo: this.maxCombo,
            accuracy,
            gameTimeSeconds,
            grade,
            coinsEarned,
            totalCoins: this.coins
        };
        
        this.emitStateChanged();
        this.eventSystem.emit('game:over', gameOverData);
    }

    /**
     * Update game time
     * @param {number} currentTime - Current timestamp
     */
    updateTime(currentTime) {
        if (this.gameState === 'playing') {
            this.gameTime = currentTime - this.gameStartTime;
            this.lastUpdateTime = currentTime;
        }
    }

    /**
     * Handle correct answer
     * @param {Object} answerData - Data about the correct answer
     */
    handleCorrectAnswer(answerData = {}) {
        this.correctClicks++;
        this.totalClicks++;
        this.totalAnswered++;
        this.correctAnswers++;
        this.consecutiveErrors = 0;
        this.combo++;
        this.maxCombo = Math.max(this.maxCombo, this.combo);
        
        // Calculate score
        const baseScore = this.config.baseScore;
        const comboBonus = Math.floor(this.combo * this.config.comboMultiplier);
        const timeBonus = Math.max(0, Math.floor((3000 - (answerData.responseTime || 1000)) / 100));
        const totalScore = baseScore + comboBonus + timeBonus;
        
        this.score += totalScore;
        
        // Gold coin drop (5% chance)
        if (Math.random() < 0.05) {
            const coinBonus = Math.floor(Math.random() * 3) + 1;
            this.coins += coinBonus;
            this.eventSystem.emit('coins:earned', { amount: coinBonus, source: 'drop' });
        }
        
        this.emitStateChanged();
        this.eventSystem.emit('answer:correct', {
            score: totalScore,
            combo: this.combo,
            coins: this.coins,
            position: answerData.position
        });
    }

    /**
     * Handle incorrect answer
     * @param {Object} answerData - Data about the incorrect answer
     */
    handleIncorrectAnswer(answerData = {}) {
        this.incorrectClicks++;
        this.totalClicks++;
        this.totalAnswered++;
        this.combo = 0; // Reset combo
        this.consecutiveErrors++;
        
        // Calculate penalty
        const penalty = this.config.errorPenalty[Math.min(this.consecutiveErrors, this.config.errorPenalty.length - 1)];
        this.score = Math.max(0, this.score + penalty);
        
        // Check error rate limit
        this.checkErrorRateLimit();
        
        // Gold coin penalty (10% chance)
        if (Math.random() < 0.1 && this.coins > 0) {
            const coinPenalty = Math.min(this.coins, Math.floor(Math.random() * 2) + 1);
            this.coins -= coinPenalty;
            this.eventSystem.emit('coins:lost', { amount: coinPenalty, source: 'error' });
        }
        
        this.emitStateChanged();
        this.eventSystem.emit('answer:incorrect', {
            penalty,
            consecutiveErrors: this.consecutiveErrors,
            coins: this.coins,
            position: answerData.position
        });
    }

    /**
     * Handle missed expression (fell to bottom)
     * @param {Object} expressionData - Data about the missed expression
     */
    handleExpressionMissed(expressionData = {}) {
        
        // Only penalize if the missed expression equals current target number
        if (expressionData.isCorrect) {
            // Check if shield is active
            if (this.shieldActive) {
                // Shield absorbs the damage, just reset combo
                this.combo = 0;
                this.eventSystem.emit('powerup:shield:absorbed', {
                    lives: this.lives
                });
            } else {
                // Normal life loss
                this.lives--;
                this.combo = 0;
            }
            
            this.emitStateChanged();
            this.eventSystem.emit('expression:missed', {
                lives: this.lives,
                isCorrect: expressionData.isCorrect,
                shieldAbsorbed: this.shieldActive
            });
            
            // Check if game over
            if (this.lives <= 0) {
                this.gameOver();
            }
        } else {
            // Expression didn't match current target, no penalty
        }
    }

    /**
     * Update target number
     * @param {number} newTarget - New target number
     */
    setTargetNumber(newTarget) {
        const oldTarget = this.targetNumber;
        this.targetNumber = newTarget;
        
        this.eventSystem.emit('target:changed', {
            oldTarget,
            newTarget,
            showWarning: this.targetChangeWarning
        });
        
        this.targetChangeWarning = false;
    }

    /**
     * Set target change warning
     * @param {boolean} warning - Whether to show warning
     */
    setTargetChangeWarning(warning) {
        this.targetChangeWarning = warning;
        this.eventSystem.emit('target:warning', { warning });
    }

    /**
     * Set next target change time
     * @param {number} time - Next change time
     */
    setNextTargetChangeTime(time) {
        this.nextTargetChangeTime = time;
    }

    /**
     * Use freeze power-up
     */
    useFreeze() {
        if (this.freezeCount <= 0 || this.gameState !== 'playing' || this.freezeActive) {
            return false;
        }
        
        this.freezeCount--;
        this.freezeActive = true;
        this.freezeEndTime = Date.now() + this.freezeDuration;
        
        this.emitStateChanged();
        this.eventSystem.emit('powerup:freeze:used', {
            duration: this.freezeDuration,
            endTime: this.freezeEndTime
        });
        
        return true;
    }

    /**
     * Use bomb power-up
     */
    useBomb() {
        if (this.bombCount <= 0 || this.gameState !== 'playing') {
            return false;
        }
        
        this.bombCount--;
        
        this.emitStateChanged();
        this.eventSystem.emit('powerup:bomb:used');
        
        return true;
    }

    /**
     * Update freeze status
     * @param {number} currentTime - Current timestamp
     */
    updateFreeze(currentTime) {
        if (this.freezeActive && currentTime >= this.freezeEndTime) {
            this.freezeActive = false;
            this.eventSystem.emit('powerup:freeze:ended');
        }
    }

    /**
     * Check if error rate limit is exceeded
     */
    checkErrorRateLimit() {
        if (this.totalAnswered < 5) return; // Need at least 5 answers
        
        const errorRate = (this.totalAnswered - this.correctAnswers) / this.totalAnswered;
        
        if (errorRate > this.config.maxErrorRate && !this.maxErrorRateExceeded) {
            this.maxErrorRateExceeded = true;
            
            this.eventSystem.emit('error:rate:exceeded', {
                errorRate: errorRate * 100,
                maxErrorRate: this.config.maxErrorRate * 100
            });
            
            // Trigger game over after a delay
            setTimeout(() => {
                if (this.gameState === 'playing') {
                    this.gameOver();
                }
            }, 2000);
        }
    }

    /**
     * Calculate grade based on accuracy
     * @param {number} accuracy - Accuracy percentage
     * @returns {string} Grade letter
     */
    calculateGrade(accuracy) {
        if (accuracy >= 95) return 'S';
        if (accuracy >= 90) return 'A';
        if (accuracy >= 80) return 'B';
        if (accuracy >= 70) return 'C';
        if (accuracy >= 60) return 'D';
        return 'F';
    }

    /**
     * Get current accuracy percentage
     * @returns {number} Accuracy as percentage
     */
    getAccuracy() {
        return this.totalClicks > 0 ? (this.correctClicks / this.totalClicks * 100) : 0;
    }

    /**
     * Get current error rate
     * @returns {number} Error rate as percentage
     */
    getErrorRate() {
        return this.totalAnswered > 0 ? ((this.totalAnswered - this.correctAnswers) / this.totalAnswered * 100) : 0;
    }

    /**
     * Get formatted game time
     * @returns {string} Formatted time as MM:SS
     */
    getFormattedTime() {
        const minutes = Math.floor(this.gameTime / 60000);
        const seconds = Math.floor((this.gameTime % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    /**
     * Emit state changed event
     */
    emitStateChanged() {
        this.eventSystem.emit('gameState:changed', this.getState());
    }

    /**
     * Get current game state snapshot
     * @returns {Object} Current state
     */
    getState() {
        return {
            gameState: this.gameState,
            score: this.score,
            combo: this.combo,
            maxCombo: this.maxCombo,
            level: this.level,
            gameTime: this.gameTime,
            lives: this.lives,
            targetNumber: this.targetNumber,
            freezeCount: this.freezeCount,
            bombCount: this.bombCount,
            shieldCount: this.shieldCount,
            coins: this.coins,
            freezeActive: this.freezeActive,
            shieldActive: this.shieldActive,
            accuracy: this.getAccuracy(),
            errorRate: this.getErrorRate(),
            formattedTime: this.getFormattedTime()
        };
    }

    /**
     * Purchase item from shop
     * @param {string} itemType - Type of item ('freeze', 'bomb', 'shield')
     * @param {number} cost - Cost of the item
     * @param {number} quantity - Quantity to purchase (default 1)
     * @returns {boolean} Success status
     */
    purchaseItem(itemType, cost, quantity = 1) {
        const totalCost = cost * quantity;
        
        if (this.coins < totalCost) {
            return false; // Insufficient coins
        }
        
        // Deduct coins
        this.coins -= totalCost;
        
        // Add items to inventory
        switch (itemType) {
            case 'freeze':
                this.freezeCount += quantity;
                break;
            case 'bomb':
                this.bombCount += quantity;
                break;
            case 'shield':
                this.shieldCount += quantity;
                break;
            default:
                // Refund if invalid item type
                this.coins += totalCost;
                return false;
        }
        
        this.emitStateChanged();
        this.eventSystem.emit('item:purchased', {
            itemType,
            quantity,
            totalCost,
            remainingCoins: this.coins
        });
        
        return true;
    }

    /**
     * Get shop item prices
     * @returns {Object} Item prices
     */
    getShopPrices() {
        return {
            freeze: 10,
            bomb: 25,
            shield: 15
        };
    }

    /**
     * Check if player can afford item
     * @param {string} itemType - Type of item
     * @param {number} quantity - Quantity to check (default 1)
     * @returns {boolean} Can afford status
     */
    canAffordItem(itemType, quantity = 1) {
        const prices = this.getShopPrices();
        const totalCost = prices[itemType] * quantity;
        return this.coins >= totalCost;
    }

    /**
     * Use shield power-up (new item)
     */
    useShield() {
        if (this.shieldCount <= 0 || this.gameState !== 'playing') {
            return false;
        }
        
        this.shieldCount--;
        
        // Shield temporarily prevents life loss
        this.shieldActive = true;
        this.shieldEndTime = Date.now() + 8000; // 8 seconds protection
        
        this.emitStateChanged();
        this.eventSystem.emit('powerup:shield:used', {
            duration: 8000,
            endTime: this.shieldEndTime
        });
        
        return true;
    }

    /**
     * Update shield status
     * @param {number} currentTime - Current timestamp
     */
    updateShield(currentTime) {
        if (this.shieldActive && currentTime >= this.shieldEndTime) {
            this.shieldActive = false;
            this.eventSystem.emit('powerup:shield:ended');
        }
    }

    /**
     * Destroy the game state manager
     */
    destroy() {
        // Clean up any timers or intervals here if needed
        this.eventSystem = null;
    }
}

// ES Module export
export default GameStateManager;

// CommonJS compatibility
if (typeof window !== 'undefined') {
    window.GameStateManager = GameStateManager;
}