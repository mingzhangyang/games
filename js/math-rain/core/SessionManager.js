/**
 * Session Manager for Math Rain Game
 * Handles session-based gameplay, progression, and level advancement
 */

class SessionManager {
    constructor(eventSystem, gameStateManager, difficultyManager) {
        this.eventSystem = eventSystem;
        this.gameStateManager = gameStateManager;
        this.difficultyManager = difficultyManager;
        
        // Session configuration
        this.config = {
            sessionDuration: 180000, // 3 minutes in milliseconds
            enableSessions: true,
            progressionThresholds: {
                scoreMultiplier: 1.2, // Score must be 1.2x base target
                accuracyThreshold: 0.75, // 75% accuracy required
                comboThreshold: 5 // Max combo of 5 required
            }
        };
        
        
        this.reset();
    }

    /**
     * Reset session state
     */
    reset() {
        this.sessionStartTime = 0;
        this.sessionEndTime = 0;
        this.sessionTimeRemaining = 0;
        this.sessionComplete = false;
        this.sessionTargetScore = 0;
        this.canLevelUp = false;
        this.nextLevelUnlocked = false;
        this.isSessionActive = false;
    }

    /**
     * Initialize a new session
     */
    initializeSession() {
        if (!this.config.enableSessions) {
            return;
        }

        const currentTime = Date.now();
        this.sessionStartTime = currentTime;
        this.sessionEndTime = currentTime + this.config.sessionDuration;
        this.sessionTimeRemaining = this.config.sessionDuration;
        this.sessionComplete = false;
        this.isSessionActive = true;
        
        
        // Calculate target score based on current difficulty
        this.calculateSessionTarget();
        
        this.canLevelUp = false;
        this.nextLevelUnlocked = false;
        
        this.eventSystem.emit('session:started', {
            duration: this.config.sessionDuration,
            targetScore: this.sessionTargetScore,
            startTime: this.sessionStartTime
        });
    }

    /**
     * Calculate session target score based on difficulty
     */
    calculateSessionTarget() {
        if (!this.difficultyManager) {
            this.sessionTargetScore = 100;
            return;
        }

        const currentConfig = this.difficultyManager.getCurrentConfig();
        const baseTargetScore = Math.floor(
            currentConfig.range.max * 
            this.config.progressionThresholds.scoreMultiplier * 
            10
        );
        this.sessionTargetScore = Math.max(baseTargetScore, 100); // Minimum 100 points
    }

    /**
     * Update session time
     * @param {number} currentTime - Current timestamp
     */
    updateSessionTime(currentTime) {
        if (!this.config.enableSessions || !this.isSessionActive || this.sessionComplete) {
            return;
        }
        
        this.sessionTimeRemaining = Math.max(0, this.sessionEndTime - currentTime);
        
        // Check level up conditions periodically
        this.checkLevelUpConditions();
        
        // Emit time update
        this.eventSystem.emit('session:time:updated', {
            timeRemaining: this.sessionTimeRemaining,
            formattedTime: this.getFormattedTimeRemaining()
        });
        
        if (this.sessionTimeRemaining <= 0) {
            console.log('⏰ Session time expired, completing session');
            this.completeSession();
        }
    }

    /**
     * Check if player meets level up conditions
     */
    checkLevelUpConditions() {
        if (!this.config.enableSessions || this.sessionComplete || !this.gameStateManager) {
            return;
        }
        
        const gameState = this.gameStateManager.getState();
        const accuracy = gameState.accuracy / 100; // Convert to decimal
        
        const scoreReached = gameState.score >= this.sessionTargetScore;
        const accuracyGood = accuracy >= this.config.progressionThresholds.accuracyThreshold;
        const comboGood = gameState.maxCombo >= this.config.progressionThresholds.comboThreshold;
        
        const previousCanLevelUp = this.canLevelUp;
        this.canLevelUp = scoreReached && accuracyGood && comboGood;
        
        // Emit event if level up status changed
        if (this.canLevelUp !== previousCanLevelUp) {
            this.eventSystem.emit('session:levelup:status', {
                canLevelUp: this.canLevelUp,
                requirements: {
                    scoreReached,
                    accuracyGood,
                    comboGood,
                    currentScore: gameState.score,
                    targetScore: this.sessionTargetScore,
                    currentAccuracy: accuracy,
                    requiredAccuracy: this.config.progressionThresholds.accuracyThreshold,
                    currentMaxCombo: gameState.maxCombo,
                    requiredCombo: this.config.progressionThresholds.comboThreshold
                }
            });
        }
    }

    /**
     * Complete the current session
     */
    completeSession() {
        if (!this.isSessionActive) {
            return;
        }

        this.sessionComplete = true;
        this.sessionTimeRemaining = 0;
        this.isSessionActive = false;
        
        // Final check for level up
        this.checkLevelUpConditions();
        
        const gameState = this.gameStateManager.getState();
        const sessionData = {
            finalScore: gameState.score,
            targetScore: this.sessionTargetScore,
            accuracy: gameState.accuracy,
            maxCombo: gameState.maxCombo,
            sessionDurationMinutes: Math.floor(this.config.sessionDuration / 60000),
            levelUpAchieved: this.canLevelUp,
            requirements: this.getLevelUpRequirements()
        };
        
        console.log('🎯 Session completed, emitting session:completed event', sessionData);
        this.eventSystem.emit('session:completed', sessionData);
    }

    /**
     * Continue to next level (if eligible)
     */
    continueToNextLevel() {
        if (!this.canLevelUp || !this.difficultyManager) {
            return false;
        }
        
        const currentLevel = this.difficultyManager.baseLevel;
        const maxLevel = Object.keys(this.difficultyManager.difficultyConfig).length;
        
        if (currentLevel < maxLevel) {
            this.nextLevelUnlocked = true;
            
            this.eventSystem.emit('session:level:advanced', {
                fromLevel: currentLevel,
                toLevel: currentLevel + 1
            });
            
            // Reset session for new level
            this.reset();
            return true;
        }
        
        // Already at max level
        this.eventSystem.emit('session:max:level:reached');
        return false;
    }

    /**
     * Retry current level
     */
    retryCurrentLevel() {
        this.reset();
        this.eventSystem.emit('session:level:retry');
    }

    /**
     * Get level up requirements details
     * @returns {Object} Requirements breakdown
     */
    getLevelUpRequirements() {
        if (!this.gameStateManager) {
            return {};
        }

        const gameState = this.gameStateManager.getState();
        const accuracy = gameState.accuracy / 100;
        
        return {
            score: {
                current: gameState.score,
                required: this.sessionTargetScore,
                met: gameState.score >= this.sessionTargetScore
            },
            accuracy: {
                current: accuracy,
                required: this.config.progressionThresholds.accuracyThreshold,
                met: accuracy >= this.config.progressionThresholds.accuracyThreshold
            },
            combo: {
                current: gameState.maxCombo,
                required: this.config.progressionThresholds.comboThreshold,
                met: gameState.maxCombo >= this.config.progressionThresholds.comboThreshold
            }
        };
    }

    /**
     * Get formatted time remaining
     * @returns {string} Time as MM:SS
     */
    getFormattedTimeRemaining() {
        const minutes = Math.floor(this.sessionTimeRemaining / 60000);
        const seconds = Math.floor((this.sessionTimeRemaining % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    /**
     * Get session progress percentage
     * @returns {number} Progress as percentage (0-100)
     */
    getSessionProgress() {
        if (!this.isSessionActive || this.config.sessionDuration === 0) {
            return 0;
        }
        
        const elapsed = this.config.sessionDuration - this.sessionTimeRemaining;
        return Math.min(100, (elapsed / this.config.sessionDuration) * 100);
    }

    /**
     * Check if sessions are enabled
     * @returns {boolean} True if sessions are enabled
     */
    areSessionsEnabled() {
        return this.config.enableSessions;
    }

    /**
     * Enable or disable sessions
     * @param {boolean} enabled - Whether to enable sessions
     */
    setSessionsEnabled(enabled) {
        this.config.enableSessions = enabled;
        
        if (!enabled && this.isSessionActive) {
            this.reset();
        }
        
        this.eventSystem.emit('session:config:changed', {
            enabled: this.config.enableSessions
        });
    }

    /**
     * Update session configuration
     * @param {Object} newConfig - New configuration options
     */
    updateConfig(newConfig) {
        const oldConfig = { ...this.config };
        
        if (newConfig.sessionDuration !== undefined) {
            this.config.sessionDuration = Math.max(30000, newConfig.sessionDuration); // Min 30 seconds
        }
        
        if (newConfig.progressionThresholds !== undefined) {
            this.config.progressionThresholds = {
                ...this.config.progressionThresholds,
                ...newConfig.progressionThresholds
            };
        }
        
        if (newConfig.enableSessions !== undefined) {
            this.setSessionsEnabled(newConfig.enableSessions);
        }
        
        this.eventSystem.emit('session:config:updated', {
            oldConfig,
            newConfig: this.config
        });
    }

    /**
     * Get current session state
     * @returns {Object} Session state
     */
    getSessionState() {
        return {
            isActive: this.isSessionActive,
            timeRemaining: this.sessionTimeRemaining,
            formattedTimeRemaining: this.getFormattedTimeRemaining(),
            targetScore: this.sessionTargetScore,
            canLevelUp: this.canLevelUp,
            sessionComplete: this.sessionComplete,
            progress: this.getSessionProgress(),
            requirements: this.getLevelUpRequirements()
        };
    }

    /**
     * Force complete session (for testing or admin purposes)
     */
    forceCompleteSession() {
        if (this.isSessionActive) {
            this.completeSession();
        }
    }

    /**
     * Destroy the session manager
     */
    destroy() {
        this.reset();
        this.eventSystem = null;
        this.gameStateManager = null;
        this.difficultyManager = null;
    }
}

// ES Module export
export default SessionManager;

// CommonJS compatibility
if (typeof window !== 'undefined') {
    window.SessionManager = SessionManager;
}