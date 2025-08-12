/**
 * Math Rain Refactored - Main Entry Point
 * This file properly loads all dependencies for the refactored version
 */

// Import refactored components
import EventSystem from './systems/EventSystem.js';
import DependencyContainer from './systems/DependencyContainer.js';
import GameStateManager from './core/GameStateManager.js';
import SessionManager from './core/SessionManager.js';
import PerformanceOptimizer from './core/PerformanceOptimizer.js';
import ErrorHandler from './core/ErrorHandler.js';
import UIController from './core/UIController.js';

/**
 * Math Rain Game Class
 * Orchestrator that uses modular component architecture
 */
class MathRainGame {
    constructor() {
        // Singleton pattern
        if (MathRainGame.instance) {
            return MathRainGame.instance;
        }
        
        try {
            
            // Initialize core systems
            this.eventSystem = new EventSystem();
            this.container = new DependencyContainer();
            this.errorHandler = new ErrorHandler(this.eventSystem);
            
            // Game state
            this.expressions = [];
            this.isRendering = false;
            this.canvas = null;
            this.ctx = null;
            this.canvasConfig = {};
            
            // External dependencies (loaded from global scope)
            this.expressionGenerator = null;
            this.questionBankManager = null;
            this.animationEngine = null;
            this.difficultyManager = null;
            this.soundManager = null;
            this.particleSystem = null;
            
            // Configuration
            this.config = {
                targetChangeInterval: 10000,
                targetChangeWarningTime: 2000,
                maxExpressions: 6,
                useQuestionBank: true
            };
            
            // Timing
            this.nextTargetChangeTime = 0;
            this.lastSpawnTime = 0;
            this.lastCanvasSpawnTime = 0;
            this.lastRenderTime = 0;
            
            // Set singleton
            MathRainGame.instance = this;
            
            // Register components
            this.registerComponents();
            
            
        } catch (error) {
            this.errorHandler?.handleInitializationError('MathRainGame', error);
            throw error;
        }
    }
    
    /**
     * Register core systems (simplified)
     */
    registerComponents() {
        // Register core systems for potential future use
        this.container.registerSingleton('eventSystem', this.eventSystem);
        this.container.registerSingleton('errorHandler', this.errorHandler);
        
    }
    
    /**
     * Initialize game components asynchronously
     */
    async initializeAsync() {
        try {
            
            // Wait for external dependencies to be available
            await this.waitForExternalDependencies();
            
            // Initialize external components
            await this.initializeExternalComponents();
            
            // Initialize core components directly (simplify for now)
            this.gameStateManager = new GameStateManager(this.eventSystem);
            this.performanceOptimizer = new PerformanceOptimizer(this.eventSystem);
            
            // Initialize session manager with dependencies
            this.sessionManager = new SessionManager(
                this.eventSystem,
                this.gameStateManager,
                this.difficultyManager
            );
            
            // Initialize UI controller
            this.uiController = new UIController(
                this.eventSystem,
                this.gameStateManager,
                this.sessionManager
            );
            
            // Initialize canvas system
            this.initializeCanvas();
            
            // Setup event handlers
            this.setupEventHandlers();
            
            // Load question bank
            await this.loadQuestionBank();
            
            
        } catch (error) {
            this.errorHandler?.handleInitializationError('MathRainGame:initializeAsync', error);
            throw error;
        }
    }
    
    /**
     * Wait for external dependencies to be loaded
     */
    async waitForExternalDependencies() {
        const requiredClasses = ['ExpressionGenerator', 'QuestionBankManager', 'AnimationEngine', 'DifficultyManager', 'SoundManager'];
        const maxWait = 15000; // 15 seconds max to allow for module loading
        const checkInterval = 500; // Check every 500ms to be less aggressive
        let waited = 0;
        
        return new Promise((resolve, reject) => {
            const checkDependencies = () => {
                const missingClasses = requiredClasses.filter(className => !window[className]);
                
                if (missingClasses.length === 0) {
                    resolve();
                    return;
                }
                
                waited += checkInterval;
                if (waited >= maxWait) {
                    reject(new Error(`Missing required classes after ${maxWait}ms: ${missingClasses.join(', ')}`));
                    return;
                }
                
                setTimeout(checkDependencies, checkInterval);
            };
            
            checkDependencies();
        });
    }
    
    /**
     * Initialize external components (existing game modules)
     */
    async initializeExternalComponents() {
        try {
            // Initialize external components from global scope
            this.expressionGenerator = new window.ExpressionGenerator();
            this.questionBankManager = new window.QuestionBankManager();
            this.animationEngine = new window.AnimationEngine();
            this.difficultyManager = new window.DifficultyManager();
            this.soundManager = new window.SoundManager();
            
            // Start animation engine
            this.animationEngine.start();
            
            // Initialize sound manager
            if (this.soundManager && typeof this.soundManager.init === 'function') {
                await this.soundManager.init();
            }
            
            
        } catch (error) {
            console.error('❌ Failed to initialize external components:', error);
            throw error;
        }
    }
    
    /**
     * Initialize canvas
     */
    initializeCanvas() {
        try {
            this.canvas = document.getElementById('game-canvas');
            if (!this.canvas) {
                throw new Error('Canvas element not found');
            }
            
            this.ctx = this.canvas.getContext('2d');
            if (!this.ctx) {
                throw new Error('Cannot get 2D context');
            }
            
            this.resizeCanvas();
            
            this.canvasConfig = {
                backgroundColor: this.getCanvasBackgroundColor(),
                expressionFont: '36px "Fredoka One", "Nunito", cursive',
                expressionColors: ['#ff6b9d', '#4ecdc4', '#45b7d1', '#f9ca24', '#a55eea', '#fd9644']
            };
            
            // Initialize particle system
            if (typeof window.ParticleSystem !== 'undefined') {
                this.particleSystem = new window.ParticleSystem(this.canvas);
                this.particleSystem.setEnabled(true);
                // Don't start its own loop, we'll update it manually
            }
            
            // Add event listeners
            this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
            this.canvas.addEventListener('touchstart', (e) => this.handleCanvasTouch(e));
            
            
        } catch (error) {
            this.errorHandler?.handleRenderingError('canvas', error);
            throw error;
        }
    }
    
    /**
     * Setup event handlers for component communication
     */
    setupEventHandlers() {
        // UI events
        this.eventSystem.on('ui:start:game', () => {
            this.startGame();
        });
        this.eventSystem.on('ui:pause:game', () => this.gameStateManager?.pauseGame());
        this.eventSystem.on('ui:resume:game', () => this.gameStateManager?.resumeGame());
        this.eventSystem.on('ui:restart:game', () => this.restartGame());
        
        this.eventSystem.on('ui:powerup:freeze', () => this.gameStateManager?.useFreeze());
        this.eventSystem.on('ui:powerup:bomb', () => this.useBomb());
        this.eventSystem.on('ui:powerup:shield', () => this.gameStateManager?.useShield());
        
        this.eventSystem.on('ui:difficulty:selected', (data) => {
            this.difficultyManager?.setBaseLevel(data.level);
            this.expressionGenerator?.setDifficulty(data.level);
        });
        
        // Sound events
        this.eventSystem.on('ui:sound:click', () => this.safePlaySound('click'));
        this.eventSystem.on('answer:correct', (data) => {
            this.safePlaySound('correct');
            if (data.combo > 5) {
                this.safePlaySound('combo');
            }
            // Trigger particle effects
            if (this.particleSystem && data.position) {
                this.particleSystem.createCorrectEffect(data.position.x, data.position.y);
                if (data.combo > 1) {
                    this.particleSystem.createComboEffect(data.position.x, data.position.y, data.combo);
                }
            }
        });
        this.eventSystem.on('answer:incorrect', (data) => {
            this.safePlaySound('incorrect');
            // Trigger particle effects for incorrect answers
            if (this.particleSystem && data.position) {
                this.particleSystem.createIncorrectEffect(data.position.x, data.position.y);
            }
        });
        this.eventSystem.on('target:changed', () => this.safePlaySound('targetChange'));
        this.eventSystem.on('powerup:freeze:used', () => {
            this.safePlaySound('freeze');
            // Create freeze visual effect
            if (this.particleSystem) {
                const centerX = this.canvas.width / 2;
                const centerY = this.canvas.height / 2;
                this.particleSystem.createExplosion(centerX, centerY, 'combo', {
                    count: 25,
                    colors: ['#68d391', '#9ae6b4', '#c6f6d5', '#e6fffa'],
                    size: { min: 3, max: 8 },
                    gravity: -0.1 // Float upward
                });
            }
        });
        this.eventSystem.on('powerup:bomb:used', () => this.safePlaySound('bomb'));
        this.eventSystem.on('powerup:shield:used', () => {
            this.safePlaySound('powerup'); // Generic powerup sound
            // Create shield visual effect
            if (this.particleSystem) {
                const centerX = this.canvas.width / 2;
                const centerY = this.canvas.height / 2;
                this.particleSystem.createExplosion(centerX, centerY, 'combo', {
                    count: 30,
                    colors: ['#4FC3F7', '#29B6F6', '#03A9F4', '#0288D1'],
                    size: { min: 4, max: 10 },
                    gravity: -0.05, // Float upward
                    life: { min: 1500, max: 2500 }
                });
            }
        });
        this.eventSystem.on('powerup:shield:absorbed', () => {
            // Visual feedback when shield absorbs damage
            if (this.particleSystem) {
                const centerX = this.canvas.width / 2;
                const centerY = this.canvas.height / 4;
                this.particleSystem.createExplosion(centerX, centerY, 'combo', {
                    count: 20,
                    colors: ['#FFD54F', '#FFEB3B', '#FFF176'],
                    size: { min: 3, max: 8 },
                    speed: { min: 2, max: 6 }
                });
            }
        });
        this.eventSystem.on('game:over', () => this.safePlaySound('gameOver'));
        
        // Expression missed events
        this.eventSystem.on('expression:missed', (data) => {
            // Add visual feedback for lost lives
            if (data.lives !== undefined && this.particleSystem) {
                // Create warning particles when life is lost
                const centerX = this.canvas.width / 2;
                const centerY = this.canvas.height / 4;
                this.particleSystem.createExplosion(centerX, centerY, 'incorrect', {
                    count: 15,
                    colors: ['#e53e3e', '#fc8181', '#feb2b2'],
                    size: { min: 2, max: 6 },
                    speed: { min: 2, max: 8 }
                });
                
                // Add text effect showing lives lost
                if (this.particleSystem.createTextEffect) {
                    const lifeText = this.getLocalizedText('lifeLost').replace('{{lives}}', data.lives);
                    this.particleSystem.createTextEffect(
                        centerX, centerY - 20, 
                        lifeText, 
                        { color: '#e53e3e', size: 18, duration: 2000 }
                    );
                }
            }
        });
        this.eventSystem.on('ui:settings:sound:volume', (data) => {
            if (this.soundManager) {
                this.soundManager.setSfxVolume(data.volume);
            }
        });
        this.eventSystem.on('ui:settings:music:volume', (data) => {
            if (this.soundManager) {
                this.soundManager.setMusicVolume(data.volume);
            }
        });
        
        // Game state events
        this.eventSystem.on('game:started', () => {
            // 确保canvas在游戏开始时正确调整大小
            setTimeout(() => {
                this.resizeCanvas();
                this.setupGameLoop();
                this.startCanvasRendering();
            }, 100); // 给UI一点时间切换屏幕
        });
        
        this.eventSystem.on('game:paused', () => {
            this.isRendering = false;
        });
        
        this.eventSystem.on('game:resumed', (data) => {
            
            // Adjust timing variables for pause duration
            if (data && data.pausedDuration) {
                this.nextTargetChangeTime += data.pausedDuration;
                this.lastSpawnTime += data.pausedDuration;
                this.lastCanvasSpawnTime += data.pausedDuration;
            }
            
            // Restart both rendering and game loop
            this.startCanvasRendering();
            this.gameLoop(); // Restart the game loop
        });
        
        // Session events
        this.eventSystem.on('session:completed', (sessionData) => {
            console.log('🎮 Main game received session:completed event, stopping game', sessionData);
            // Stop the game when session completes
            this.isRendering = false;
            
            // Clear any remaining expressions
            this.expressions = [];
            
            // Set game state to session complete (this will stop the game loop)
            if (this.gameStateManager) {
                console.log('🔄 Setting game state to sessionComplete');
                this.gameStateManager.gameState = 'sessionComplete';
                this.gameStateManager.emitStateChanged();
            }
        });
        
    }
    
    /**
     * Load question bank
     */
    async loadQuestionBank() {
        try {
            const response = await fetch('/assets/math-rain/question-bank.json');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const questionBankData = await response.json();
            this.questionBankManager.loadQuestionBank(questionBankData);
        } catch (error) {
            this.config.useQuestionBank = false;
            this.errorHandler?.handleNetworkError('question-bank.json', error);
        }
    }
    
    /**
     * Start game
     */
    startGame() {
        try {
            
            if (this.gameStateManager?.gameState === 'playing') {
                return;
            }
            
            // Reset game state
            this.gameStateManager?.reset();
            
            // Initialize session if enabled
            if (this.sessionManager?.areSessionsEnabled()) {
                this.sessionManager.initializeSession();
            }
            
            // Clear expressions
            this.expressions = [];
            
            // Generate initial target
            this.generateNewTarget();
            
            // Start game state
            this.gameStateManager?.startGame();
            
            
        } catch (error) {
            this.errorHandler?.handleInitializationError('startGame', error);
        }
    }
    
    /**
     * Generate new target number
     */
    generateNewTarget() {
        try {
            let newTarget = 10; // fallback
            
            if (this.config.useQuestionBank && this.questionBankManager) {
                this.questionBankManager.setLevel(this.difficultyManager?.currentLevel || 1);
                const sampleQuestion = this.questionBankManager.getNextQuestion();
                newTarget = sampleQuestion?.result || this.expressionGenerator?.generateTargetNumber() || 10;
            } else if (this.expressionGenerator) {
                newTarget = this.expressionGenerator.generateTargetNumber();
            }
            
            if (typeof newTarget !== 'number' || isNaN(newTarget)) {
                newTarget = 10; // fallback
            }
            
            this.gameStateManager?.setTargetNumber(newTarget);
            
        } catch (error) {
            this.errorHandler?.logError('Target generation failed', 'RUNTIME', 'MEDIUM', error);
            this.gameStateManager?.setTargetNumber(10); // fallback
        }
    }
    
    // Utility methods
    setupGameLoop() {
        const currentTime = Date.now();
        this.lastSpawnTime = currentTime;
        this.nextTargetChangeTime = currentTime + this.config.targetChangeInterval;
        this.gameLoop();
    }
    
    gameLoop() {
        const gameState = this.gameStateManager?.getState();
        if (gameState?.gameState !== 'playing') {
            return;
        }
        
        // Complete game loop with all functionality
        this.performanceOptimizer?.recordFrame();
        
        const currentTime = Date.now();
        const deltaTime = currentTime - (this.lastUpdateTime || currentTime);
        this.lastUpdateTime = currentTime;
        
        // Skip frame if performance is poor
        if (this.performanceOptimizer?.shouldSkipFrame(deltaTime)) {
            requestAnimationFrame(() => this.gameLoop());
            return;
        }
        
        // Update game time
        this.gameStateManager?.updateTime(currentTime);
        
        // Update session time
        if (this.sessionManager?.areSessionsEnabled()) {
            this.sessionManager.updateSessionTime(currentTime);
        }
        
        // Update freeze status
        this.gameStateManager?.updateFreeze(currentTime);
        
        // Update shield status
        this.gameStateManager?.updateShield(currentTime);
        
        // Spawn expressions - 这是关键！
        this.trySpawnCanvasExpression(currentTime);
        
        // Update target number
        this.updateTargetNumber(currentTime);
        
        // Update expression animations
        this.updateExpressionAnimations(currentTime);
        
        // Continue loop
        requestAnimationFrame(() => this.gameLoop());
    }
    
    startCanvasRendering() {
        this.isRendering = true;
        this.renderLoop();
    }
    
    renderLoop() {
        if (!this.isRendering || !this.ctx) return;
        
        // Clear and setup canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = this.getCanvasBackgroundColor();
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Render expressions
        this.renderExpressions();
        
        // Update and render particle effects
        if (this.particleSystem) {
            const deltaTime = 16; // Assume 60fps
            this.particleSystem.update(deltaTime);
            this.particleSystem.updateSpecialEffects && this.particleSystem.updateSpecialEffects(deltaTime);
        }
        
        requestAnimationFrame(() => this.renderLoop());
    }
    
    /**
     * Render all expressions on canvas
     */
    renderExpressions() {
        const gameState = this.gameStateManager?.getState();
        if (gameState?.gameState === 'paused') return;
        
        this.expressions.forEach((expr, index) => {
            if (expr?.data?.expression && expr?.position) {
                const { x, y } = expr.position;
                const text = expr.data.expression;
                
                // Set text style
                this.ctx.font = '36px "Fredoka One", "Nunito", cursive, sans-serif';
                this.ctx.fillStyle = this.canvasConfig.expressionColors[index % this.canvasConfig.expressionColors.length];
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                
                // Add glow effect
                this.ctx.shadowColor = this.ctx.fillStyle;
                this.ctx.shadowBlur = 8;
                this.ctx.shadowOffsetX = 0;
                this.ctx.shadowOffsetY = 0;
                
                // Draw text
                this.ctx.fillText(text, x, y);
                
                // Reset shadow
                this.ctx.shadowBlur = 0;
            }
        });
    }
    
    /**
     * Try to spawn a new canvas expression
     */
    trySpawnCanvasExpression(currentTime) {
        if (!this.difficultyManager) return;
        
        const gameParams = this.difficultyManager.getGameParams();
        
        // Check spawn timing
        if (currentTime - this.lastCanvasSpawnTime < gameParams.spawnRate) {
            return;
        }
        
        // Check max expressions
        if (this.expressions.length >= gameParams.maxSimultaneous) {
            return;
        }
        
        // Generate expression
        const gameState = this.gameStateManager?.getState();
        if (!gameState) return;
        
        const shouldGenerateCorrect = Math.random() < gameParams.correctRatio;
        const expressionData = this.safeGenerateExpression(gameState.targetNumber, shouldGenerateCorrect);
        
        if (expressionData) {
            this.createCanvasExpression(expressionData, expressionData.result === gameState.targetNumber);
            this.lastCanvasSpawnTime = currentTime;
        }
    }
    
    /**
     * Create a canvas expression
     */
    createCanvasExpression(expressionData, isCorrect) {
        const position = this.findSafePosition();
        if (!position) return;
        
        const expression = {
            id: `canvas-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            data: expressionData,
            position,
            isCorrect,
            startTime: Date.now(),
            isClicked: false,
            isMatched: function(currentTarget) {
                return this.data.result === currentTarget;
            }
        };
        
        this.expressions.push(expression);
    }
    
    /**
     * Find a safe position for new expression
     */
    findSafePosition() {
        const width = this.canvas?.width || window.innerWidth;
        const margin = 80;
        const x = margin + Math.random() * (width - 2 * margin);
        const y = -80 - Math.random() * 200;
        return { x, y };
    }
    
    /**
     * Update expression animations (falling)
     */
    updateExpressionAnimations(currentTime) {
        for (let i = this.expressions.length - 1; i >= 0; i--) {
            const expr = this.expressions[i];
            if (!expr.position) continue;
            
            // Simple downward movement
            expr.position.y += 2; // pixels per frame
            
            // Check if reached bottom
            if (expr.position.y >= (this.canvas?.height || window.innerHeight)) {
                // Check if this expression matches current target (not the target when it was created)
                const gameState = this.gameStateManager?.getState();
                const currentlyCorrect = gameState && expr.isMatched && expr.isMatched(gameState.targetNumber);
                
                
                this.gameStateManager?.handleExpressionMissed({ 
                    isCorrect: currentlyCorrect,
                    expression: expr.data.expression,
                    result: expr.data.result,
                    currentTarget: gameState?.targetNumber
                });
                this.expressions.splice(i, 1);
            }
        }
    }
    
    /**
     * Update target number timing
     */
    updateTargetNumber(currentTime) {
        const timeUntilChange = this.nextTargetChangeTime - currentTime;
        
        if (timeUntilChange <= this.config.targetChangeWarningTime && timeUntilChange > 0) {
            this.gameStateManager?.setTargetChangeWarning(true);
        }
        
        if (currentTime >= this.nextTargetChangeTime) {
            this.generateNewTarget();
            this.nextTargetChangeTime = currentTime + this.config.targetChangeInterval;
            this.gameStateManager?.setTargetChangeWarning(false);
        }
    }
    
    /**
     * Safe expression generation
     */
    safeGenerateExpression(targetValue, isCorrect) {
        try {
            if (this.config.useQuestionBank && this.questionBankManager) {
                this.questionBankManager.setLevel(this.difficultyManager?.currentLevel || 1);
                const question = this.questionBankManager.getNextQuestion();
                if (question && (question.result === targetValue) === isCorrect) {
                    return { expression: question.expression, result: question.result };
                }
            }
            
            if (isCorrect && this.expressionGenerator) {
                return this.expressionGenerator.generateCorrectExpression(targetValue);
            } else if (!isCorrect && this.expressionGenerator) {
                const decoys = this.expressionGenerator.generateDecoyExpressions(targetValue, 1);
                return decoys[0];
            }
        } catch (error) {
            console.warn('Expression generation failed:', error);
        }
        
        // Fallback expression
        return isCorrect 
            ? { expression: `${Math.floor(targetValue/2)} + ${targetValue - Math.floor(targetValue/2)}`, result: targetValue }
            : { expression: `${targetValue + 1}`, result: targetValue + 1 };
    }

    // Canvas interaction handlers
    handleCanvasClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        this.checkExpressionClick(x, y);
    }
    
    handleCanvasTouch(event) {
        event.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const touch = event.touches[0];
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        this.checkExpressionClick(x, y);
    }
    
    /**
     * Check if click hit an expression
     */
    checkExpressionClick(clickX, clickY) {
        for (let i = this.expressions.length - 1; i >= 0; i--) {
            const expr = this.expressions[i];
            if (!expr?.position || expr.isClicked) continue;
            
            const distance = Math.sqrt((clickX - expr.position.x) ** 2 + (clickY - expr.position.y) ** 2);
            if (distance <= 60) {
                this.handleExpressionClick(expr);
                break;
            }
        }
    }
    
    /**
     * Handle expression click
     */
    handleExpressionClick(expression) {
        if (expression.isClicked) return;
        
        expression.isClicked = true;
        const responseTime = Date.now() - expression.startTime;
        const gameState = this.gameStateManager?.getState();
        
        if (expression.isMatched && expression.isMatched(gameState?.targetNumber)) {
            this.gameStateManager?.handleCorrectAnswer({
                responseTime,
                position: expression.position
            });
        } else {
            this.gameStateManager?.handleIncorrectAnswer({
                responseTime,
                position: expression.position
            });
        }
        
        setTimeout(() => {
            const index = this.expressions.indexOf(expression);
            if (index > -1) {
                this.expressions.splice(index, 1);
            }
        }, 500);
    }
    
    // Utility methods
    getCanvasBackgroundColor() {
        const body = document.body;
        if (body.classList.contains('dark-theme')) return '#000000';
        if (body.classList.contains('light-theme')) return '#f7fafc';
        return '#000000';
    }
    
    resizeCanvas() {
        if (!this.canvas) return;
        
        const gameArea = document.getElementById('game-area');
        if (gameArea) {
            const width = gameArea.offsetWidth;
            const height = gameArea.offsetHeight;
            
            if (width > 0 && height > 0) {
                this.canvas.width = width;
                this.canvas.height = height;
                
                const dpr = window.devicePixelRatio || 1;
                if (dpr > 1) {
                    this.canvas.width = width * dpr;
                    this.canvas.height = height * dpr;
                    this.canvas.style.width = width + 'px';
                    this.canvas.style.height = height + 'px';
                    this.ctx.scale(dpr, dpr);
                }
                
                // Update particle system canvas size
                if (this.particleSystem && this.particleSystem.resize) {
                    this.particleSystem.resize(width, height);
                }
            }
        }
    }
    
    restartGame() {
        
        // Stop current rendering and game loop
        this.isRendering = false;
        
        // Clear expressions and particles
        this.expressions = [];
        if (this.particleSystem) {
            this.particleSystem.clear();
        }
        
        // Reset timing variables
        this.lastSpawnTime = 0;
        this.nextTargetChangeTime = 0;
        this.lastCanvasSpawnTime = 0;
        this.lastRenderTime = 0;
        this.lastUpdateTime = 0;
        
        // Reset game state first
        this.gameStateManager?.reset();
        
        // Initialize session if enabled
        if (this.sessionManager?.areSessionsEnabled()) {
            this.sessionManager.initializeSession();
        }
        
        // Generate new target
        this.generateNewTarget();
        
        // Start the game state (this will trigger game:started event)
        this.gameStateManager?.startGame();
        
    }
    
    useBomb() {
        if (this.gameStateManager?.useBomb()) {
            // Create explosion effects at each expression location before clearing
            if (this.particleSystem) {
                this.expressions.forEach(expr => {
                    if (expr.position) {
                        this.particleSystem.createExplosion(expr.position.x, expr.position.y, 'explosion');
                    }
                });
                
                // Add a central bomb explosion
                const centerX = this.canvas.width / 2;
                const centerY = this.canvas.height / 2;
                this.particleSystem.createExplosion(centerX, centerY, 'explosion', {
                    count: 60,
                    size: { min: 4, max: 16 },
                    speed: { min: 8, max: 20 }
                });
            }
            
            this.expressions = [];
        }
    }
    
    /**
     * Safely play a sound effect
     * @param {string} soundName - Name of the sound to play
     */
    safePlaySound(soundName) {
        try {
            if (this.soundManager && typeof this.soundManager.playSound === 'function') {
                this.soundManager.playSound(soundName);
            }
        } catch (error) {
            console.warn(`Failed to play sound '${soundName}':`, error);
        }
    }
    
    /**
     * Get localized text from global LANGUAGES object
     * @param {string} key - Text key
     * @returns {string} Localized text
     */
    getLocalizedText(key) {
        try {
            // 尝试使用全局的多语言函数
            if (typeof window !== 'undefined' && window.getLocalizedText) {
                return window.getLocalizedText(key);
            }
            
            // 尝试使用全局LANGUAGES对象
            if (typeof window !== 'undefined' && window.LANGUAGES && window.currentLanguage) {
                const texts = window.LANGUAGES[window.currentLanguage];
                if (texts && texts[key]) {
                    return texts[key];
                }
            }
            
            // Fallback根据页面语言决定
            const isEnglish = (typeof window !== 'undefined' && window.currentLanguage === 'en') ||
                             (typeof navigator !== 'undefined' && navigator.language && !navigator.language.startsWith('zh'));
            
            const fallbackTexts = {
                lifeLost: isEnglish ? 'Life -1 (Remaining: {{lives}})' : '生命 -1 (剩余: {{lives}})',
                comboMessage: isEnglish ? '{{count}}x Combo!' : '{{count}}x 连击!',
                coinsEarned: isEnglish ? '+{{amount}} Coins' : '+{{amount}} 金币',
                coinsLost: isEnglish ? '-{{amount}} Coins' : '-{{amount}} 金币'
            };
            
            return fallbackTexts[key] || key;
        } catch (error) {
            return key;
        }
    }
    
    /**
     * Destroy game instance
     */
    destroy() {
        this.isRendering = false;
        
        // Destroy components
        if (this.gameStateManager) this.gameStateManager.destroy();
        if (this.sessionManager) this.sessionManager.destroy();
        if (this.performanceOptimizer) this.performanceOptimizer.destroy();
        if (this.errorHandler) this.errorHandler.destroy();
        if (this.uiController) this.uiController.destroy();
        
        // Destroy systems
        if (this.eventSystem) this.eventSystem.destroy();
        if (this.container) this.container.destroy();
        
        // Clear singleton
        MathRainGame.instance = null;
    }
    
    // Static methods
    static getInstance() {
        if (!MathRainGame.instance) {
            MathRainGame.instance = new MathRainGame();
        }
        return MathRainGame.instance;
    }
    
    static reset() {
        if (MathRainGame.instance) {
            MathRainGame.instance.destroy();
        }
        return new MathRainGame();
    }
}

// Export for ES modules
export default MathRainGame;

// Auto-initialization
async function initializeMathRainGame() {
    try {
        
        if (window.__mathRainInitInProgress || window.__mathRainInitialized) {
            return;
        }
        window.__mathRainInitInProgress = true;
        
        // Create game instance
        window.mathRainGame = MathRainGame.getInstance();
        
        // Async initialization
        await window.mathRainGame.initializeAsync();
        
        window.__mathRainInitialized = true;
        
        // Game initialized successfully (notification removed for production)
        
    } catch (error) {
        console.error('❌ Math Rain - Initialization failed:', error);
        
        // Show error to user
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #dc3545;
            color: white;
            padding: 16px;
            border-radius: 8px;
            z-index: 10000;
            max-width: 400px;
        `;
        errorDiv.innerHTML = `
            <strong>❌ 游戏初始化失败</strong><br>
            ${error.message}<br>
            <small>请检查浏览器控制台获取详细信息</small>
        `;
        document.body.appendChild(errorDiv);
        
        setTimeout(() => {
            if (errorDiv.parentElement) {
                errorDiv.remove();
            }
        }, 8000);
        
    } finally {
        window.__mathRainInitInProgress = false;
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeMathRainGame, { once: true });
} else {
    initializeMathRainGame();
}

// Developer debugging tools
window.debugMathRain = {
    getComponents: () => {
        if (!window.mathRainGame) return null;
        return {
            gameStateManager: window.mathRainGame.gameStateManager,
            sessionManager: window.mathRainGame.sessionManager,
            performanceOptimizer: window.mathRainGame.performanceOptimizer,
            errorHandler: window.mathRainGame.errorHandler,
            uiController: window.mathRainGame.uiController,
            eventSystem: window.mathRainGame.eventSystem
        };
    },
    getArchitectureInfo: () => ({
        pattern: 'Single Responsibility + Event-Driven + Dependency Injection',
        originalLines: 2627,
        refactoredLines: '~400',
        components: [
            'EventSystem - Central event bus',
            'DependencyContainer - Dependency injection',
            'GameStateManager - Game state & scoring',
            'SessionManager - Session & progression',
            'PerformanceOptimizer - Performance monitoring',
            'ErrorHandler - Centralized error handling',
            'UIController - UI management'
        ],
        benefits: [
            'Reduced complexity (2,627 → ~400 lines)',
            'Single Responsibility Principle compliance',
            'Loose coupling via events',
            'Easy testing with dependency injection',
            'Better error handling and monitoring'
        ]
    }),
    restartGame: () => {
        if (window.mathRainGame) {
            window.mathRainGame.restartGame();
        }
    }
};