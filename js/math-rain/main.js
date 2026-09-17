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

            // 注意：不预先 start 动画引擎。当前没有任何模块创建动画，
            // 预启动会让 rAF 循环整页空转；引擎已改为有动画时自启（animation-engine.js）
            
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
            this.canvas.addEventListener('touchstart', (e) => this.handleCanvasTouch(e), { passive: false });
            
            
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
                const center = this.getCanvasCenter();
                const centerX = center.x;
                const centerY = center.y;
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
                const center = this.getCanvasCenter();
                const centerX = center.x;
                const centerY = center.y;
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
                const center = this.getCanvasCenter();
                const centerX = center.x;
                const centerY = center.y / 2;
                this.particleSystem.createExplosion(centerX, centerY, 'combo', {
                    count: 20,
                    colors: ['#FFD54F', '#FFEB3B', '#FFF176'],
                    size: { min: 3, max: 8 },
                    speed: { min: 2, max: 6 }
                });
            }
        });
        this.eventSystem.on('game:over', () => {
            this.safePlaySound('gameOver');
            if (typeof window.hubTrack === 'function') window.hubTrack('math-rain', 'finish');
            // 结束后停止渲染循环，避免空转耗电
            this.isRendering = false;
        });

        // 键盘快捷键（帮助界面所宣传的：空格暂停、F冻结、B炸弹）
        this.eventSystem.on('ui:key:space', () => this.togglePauseResume());
        this.eventSystem.on('ui:key:escape', () => this.togglePauseResume());
        this.eventSystem.on('ui:key:f', () => this.gameStateManager?.useFreeze());
        this.eventSystem.on('ui:key:b', () => this.useBomb());

        // 会话结算界面的"下一关/重试"按钮
        this.eventSystem.on('ui:session:continue', () => this.sessionManager?.continueToNextLevel());
        this.eventSystem.on('ui:session:retry', () => this.sessionManager?.retryCurrentLevel());
        this.eventSystem.on('session:level:advanced', (data) => {
            if (this.difficultyManager && data?.toLevel) {
                this.difficultyManager.setBaseLevel(data.toLevel);
            }
            this.restartGame();
        });
        this.eventSystem.on('session:level:retry', () => this.restartGame());

        // 设置面板：粒子特效开关
        this.eventSystem.on('ui:settings:particle:effects', (data) => {
            this.particleSystem?.setEnabled(!!data?.enabled);
        });

        // 窗口尺寸变化 / 手机旋转时重设画布
        this.eventSystem.on('ui:window:resized', () => this.resizeCanvas());
        this.eventSystem.on('mobile:orientation:changed', () => this.resizeCanvas());

        // 切换标签页时自动暂停（会话计时基于墙钟，切走后时间会白白流逝）
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                const state = this.gameStateManager?.getState();
                if (state?.gameState === 'playing') {
                    this.gameStateManager?.pauseGame();
                }
            }
        });

        // Expression missed events
        this.eventSystem.on('expression:missed', (data) => {
            // Add visual feedback for lost lives
            if (data.lives !== undefined && this.particleSystem) {
                // Create warning particles when life is lost
                const center = this.getCanvasCenter();
                const centerX = center.x;
                const centerY = center.y / 2;
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

        // 恢复上次保存的音量（滑块位置由 UIController.initializeSettings 恢复；
        // 此处订阅已就绪，直接应用即可，不依赖初始化期的事件时序）
        try {
            const savedSfxVolume = localStorage.getItem('mr_sfx_volume');
            if (savedSfxVolume !== null && this.soundManager) {
                this.soundManager.setSfxVolume(Number(savedSfxVolume) / 100);
            }
            const savedMusicVolume = localStorage.getItem('mr_music_volume');
            if (savedMusicVolume !== null && this.soundManager) {
                this.soundManager.setMusicVolume(Number(savedMusicVolume) / 100);
            }
        } catch (e) {
            // 存储不可用时使用默认音量
        }
        
        // Game state events
        this.eventSystem.on('game:started', () => {
            this.resizeCanvas();
            this.setupGameLoop();
            this.startCanvasRendering();
            setTimeout(() => this.resizeCanvas(), 350);
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
                // 会话截止时间也要补偿暂停时长，否则暂停期间会白白扣时间
                if (this.sessionManager && this.sessionManager.isSessionActive) {
                    this.sessionManager.sessionEndTime += data.pausedDuration;
                }
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
     * 空格/Esc 暂停或恢复（仅当游戏处于 playing/paused 状态时生效）
     */
    togglePauseResume() {
        const state = this.gameStateManager?.getState();
        if (state?.gameState === 'playing') {
            this.gameStateManager?.pauseGame();
        } else if (state?.gameState === 'paused') {
            this.gameStateManager?.resumeGame();
        }
    }

    /**
     * Load question bank
     */
    async loadQuestionBank() {
        try {
            const questionBankUrl = 'assets/math-rain/question-bank.json';
            const response = await fetch(questionBankUrl);
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

            // 重置自适应难度的统计，避免上一局的表现带入新对局
            this.difficultyManager?.resetStats();

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
            if (typeof window.hubTrack === 'function') window.hubTrack('math-rain', 'play');
            
            
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
                this.questionBankManager.setLevel(this.difficultyManager?.getBankLevel() || 1);
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
        this.nextCanvasSpawnTime = 0;
        this.spawnInitialExpressions();
        this.gameLoop();
    }

    /**
     * 在开局时立即生成 2-3 个算式并排布在可见区域，
     * 确保进入游戏后玩家立即可见下落算式，彻底消除移动端“开局空屏等几秒”的问题。
     */
    spawnInitialExpressions() {
        if (!this.difficultyManager) return;
        if (this.expressions && this.expressions.length > 0) return;
        const gameState = this.gameStateManager?.getState();
        if (!gameState) return;

        const target = gameState.targetNumber;
        const gameParams = this.difficultyManager.getGameParams();
        const cssHeight = this.canvasCssHeight || this.canvas?.clientHeight || 450;

        // 1. 必出 1 个正确算式，排布在可见区偏上方（约 25% 高度处），开局一眼就能辨识并点击
        const correctData = this.safeGenerateExpression(target, true);
        if (correctData) {
            this.createCanvasExpression(correctData, true, gameParams.fallSpeed, Math.round(cssHeight * 0.25));
        }

        // 2. 生成第 2 个干扰算式，位于更高处（约 10% 高度处）
        const decoy1 = this.safeGenerateExpression(target, false);
        if (decoy1) {
            this.createCanvasExpression(decoy1, false, gameParams.fallSpeed, Math.round(cssHeight * 0.10));
        }

        // 3. 生成第 3 个算式，刚好在顶部边缘（-15px）平滑滑入
        const shouldBeCorrect = Math.random() < gameParams.correctRatio;
        const thirdData = this.safeGenerateExpression(target, shouldBeCorrect);
        if (thirdData) {
            this.createCanvasExpression(thirdData, thirdData.result === target, gameParams.fallSpeed, -15);
        }

        const currentTime = Date.now();
        this.lastCanvasSpawnTime = currentTime;
        // 错开下一次新生成时间，让初批算式顺畅流转
        this.nextCanvasSpawnTime = currentTime + Math.max(1200, gameParams.spawnRate * 0.7);
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
        
        const width = this.canvasCssWidth || this.canvas?.clientWidth || window.innerWidth;
        const height = this.canvasCssHeight || this.canvas?.clientHeight || window.innerHeight;

        // Clear and setup canvas (使用逻辑尺寸，与 scale(dpr, dpr) 保持一致)
        this.ctx.clearRect(0, 0, width, height);
        this.ctx.fillStyle = this.getCanvasBackgroundColor();
        this.ctx.fillRect(0, 0, width, height);
        
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
     * Dynamically determine expression font size based on canvas width
     */
    getExpressionFontSize() {
        const width = this.canvasCssWidth || this.canvas?.clientWidth || window.innerWidth;
        if (width < 420) return 22;
        if (width < 600) return 26;
        if (width < 768) return 30;
        return 36;
    }

    /**
     * Render all expressions on canvas
     */
    renderExpressions() {
        const gameState = this.gameStateManager?.getState();
        if (gameState?.gameState === 'paused') return;
        
        const fontSize = this.getExpressionFontSize();
        this.ctx.font = `${fontSize}px "Fredoka One", "Nunito", cursive, sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        this.expressions.forEach((expr, index) => {
            if (expr?.data?.expression && expr?.position) {
                const { x, y } = expr.position;
                const text = expr.data.expression;
                
                this.ctx.fillStyle = this.canvasConfig.expressionColors[index % this.canvasConfig.expressionColors.length];
                
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

        // Use a stored next-spawn timestamp so the randomized spawn rate is
        // sampled once per spawn, not on every frame tick.
        if (currentTime < this.nextCanvasSpawnTime) {
            return;
        }

        const gameParams = this.difficultyManager.getGameParams();

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
            this.createCanvasExpression(expressionData, expressionData.result === gameState.targetNumber, gameParams.fallSpeed);
            this.lastCanvasSpawnTime = currentTime;
            this.nextCanvasSpawnTime = currentTime + gameParams.spawnRate;
        }
    }
    
    /**
     * Create a canvas expression
     */
    createCanvasExpression(expressionData, isCorrect, fallDuration, initialY = null) {
        const position = this.findSafePosition(initialY);
        if (!position) return;

        // Derive per-expression falling speed (px/frame) from the difficulty's
        // fall duration so higher difficulty levels actually fall faster.
        const cssHeight = this.canvasCssHeight || this.canvas?.clientHeight || 450;
        const duration = fallDuration || 7000;
        const width = this.canvasCssWidth || this.canvas?.clientWidth || window.innerWidth;
        const minSpeed = width < 600 ? 1.05 : 0.85;
        const speed = Math.max(minSpeed, (cssHeight / duration) * 16.67);

        const expression = {
            id: `canvas-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            data: expressionData,
            position,
            isCorrect,
            speed,
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
    findSafePosition(initialY = null) {
        // 使用 CSS 逻辑宽度（canvas.width 是设备像素，DPR>1 时会超出生 visible 区域）
        const width = this.canvasCssWidth || this.canvas?.clientWidth || window.innerWidth;
        const margin = Math.min(50, Math.max(25, width * 0.1));
        const x = margin + Math.random() * Math.max(40, width - 2 * margin);
        // 若传入 initialY 则直接使用（开局预生成），否则在顶部边缘刚不可见处 (-25 ~ -60) 生成，滑入屏幕仅需 ~0.5s
        const y = initialY !== null ? initialY : (-25 - Math.random() * 35);
        return { x, y };
    }
    
    /**
     * Update expression animations (falling)
     */
    updateExpressionAnimations(currentTime) {
        const frozen = this.gameStateManager?.getState()?.freezeActive;

        for (let i = this.expressions.length - 1; i >= 0; i--) {
            const expr = this.expressions[i];
            if (!expr.position) continue;

            // Freeze power-up halts all falling expressions
            if (frozen) continue;

            // Use per-expression speed derived from difficulty fallSpeed
            expr.position.y += expr.speed ?? 2;

            // Check if reached bottom（使用 CSS 逻辑高度做判定，与绘制坐标系一致）
            const bottom = this.canvasCssHeight || this.canvas?.clientHeight || window.innerHeight;
            if (expr.position.y >= bottom) {
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
                this.questionBankManager.setLevel(this.difficultyManager?.getBankLevel() || 1);
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
        if (!event.touches || event.touches.length === 0) return;
        if (event.cancelable) {
            event.preventDefault();
        }
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
        const fontSize = this.getExpressionFontSize();
        for (let i = this.expressions.length - 1; i >= 0; i--) {
            const expr = this.expressions[i];
            if (!expr?.position || expr.isClicked) continue;
            
            const text = expr.data?.expression || '';
            // 胶囊形包围盒：基于字符长度与当前字号动态计算命中区域（宽 ±半宽+22px，高 ±28px）
            const halfWidth = Math.max(48, (text.length * fontSize * 0.35) + 22);
            const halfHeight = Math.max(34, fontSize * 0.85);
            
            const dx = Math.abs(clickX - expr.position.x);
            const dy = Math.abs(clickY - expr.position.y);
            
            if (dx <= halfWidth && dy <= halfHeight) {
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
        const isCorrect = !!(expression.isMatched && expression.isMatched(gameState?.targetNumber));

        if (isCorrect) {
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

        // Feed result into the adaptive difficulty system
        this.difficultyManager?.recordAnswer(isCorrect, responseTime, gameState?.targetNumber);
        
        setTimeout(() => {
            const index = this.expressions.indexOf(expression);
            if (index > -1) {
                this.expressions.splice(index, 1);
            }
        }, 500);
    }
    
    // Utility methods
    getCanvasBackgroundColor() {
        // 半透明底色：让 #game-area 的三层径向渐变透出，避免画布被纯色盖死
        const body = document.body;
        if (body.classList.contains('light-theme')) return 'rgba(247, 250, 252, 0.85)';
        return 'rgba(10, 10, 30, 0.35)';
    }

    /**
     * 画布中心（CSS 逻辑坐标，与绘制坐标系一致）
     */
    getCanvasCenter() {
        return {
            x: (this.canvasCssWidth || this.canvas?.clientWidth || 400) / 2,
            y: (this.canvasCssHeight || this.canvas?.clientHeight || 600) / 2
        };
    }
    
    resizeCanvas() {
        if (!this.canvas) return;

        const gameArea = document.getElementById('game-area');
        if (gameArea) {
            // 保持自适应百分比，避免像素固定宽高导致 flexbox 容器尺寸锁死
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';

            const width = gameArea.clientWidth || gameArea.offsetWidth;
            const height = gameArea.clientHeight || gameArea.offsetHeight;

            if (width > 0 && height > 0) {
                // 记录 CSS 逻辑尺寸，供坐标计算使用（canvas.width 是设备像素）
                this.canvasCssWidth = width;
                this.canvasCssHeight = height;

                const dpr = window.devicePixelRatio || 1;
                this.canvas.width = Math.round(width * dpr);
                this.canvas.height = Math.round(height * dpr);

                this.ctx.setTransform(1, 0, 0, 1, 0, 0);
                this.ctx.scale(dpr, dpr);

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
        this.nextCanvasSpawnTime = 0;
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
                const center = this.getCanvasCenter();
                this.particleSystem.createExplosion(center.x, center.y, 'explosion', {
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
        // 用 textContent 构建，避免错误消息内容被当作 HTML 解析
        const strong = document.createElement('strong');
        strong.textContent = '❌ 游戏初始化失败';
        const msg = document.createElement('div');
        msg.textContent = error.message;
        const hint = document.createElement('small');
        hint.textContent = '请检查浏览器控制台获取详细信息';
        errorDiv.append(strong, msg, hint);
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
