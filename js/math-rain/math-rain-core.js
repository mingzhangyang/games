/**
 * Math Rain 游戏核心逻辑
 * Core Game Logic for Math Rain
 */

class MathRainGame {
    constructor() {
        // 单例模式：如果实例已存在，返回现有实例
        if (MathRainGame.instance) {
            return MathRainGame.instance;
        }
        
        try {
            // 游戏状态
            this.gameState = 'menu'; // menu, playing, paused, gameOver
            this.score = 0;
            
            this.combo = 0;
            this.maxCombo = 0;
            this.level = 1;
            this.gameTime = 0;
            this.lives = 3;
            
            // 会话系统状态
            this.sessionStartTime = 0;
            this.sessionEndTime = 0;
            this.sessionTimeRemaining = 0;
            this.sessionComplete = false;
            this.sessionTargetScore = 0;
            this.canLevelUp = false;
            this.nextLevelUnlocked = false;
            
            // 设置单例实例
            MathRainGame.instance = this;
            
            // 游戏对象
            this.expressions = []; // 当前屏幕上的算式
            this.targetNumber = 5;
            this.nextTargetChangeTime = 0;
            
            // 计时器
            this.gameStartTime = 0;
            this.lastSpawnTime = 0;
            this.lastCanvasSpawnTime = 0;
            this.lastUpdateTime = 0;
            
            // 统计数据
            this.totalClicks = 0;
            this.correctClicks = 0;
            this.incorrectClicks = 0;
            this.consecutiveErrors = 0;
            
            // UI更新标志
            this.needsUIUpdate = false;
            this.lastUIUpdateTime = 0;
            
            // 游戏配置
            this.config = {
                targetChangeInterval: 10000,
                maxExpressions: 6,
                baseScore: 10,
                comboMultiplier: 1.5,
                errorPenalty: [0, -5, -15, -30, -50],
                // 会话系统配置
                sessionDuration: 180000, // 3分钟 (毫秒)
                enableSessions: true,
                progressionThresholds: {
                    scoreMultiplier: 1.2, // 分数达到基准的1.2倍可升级
                    accuracyThreshold: 0.75, // 正确率75%以上
                    comboThreshold: 5 // 连击5次以上
                }
            };
            
            // 性能优化相关
            this.performanceConfig = {
                batchUpdateSize: 5,
                frameSkipThreshold: 16.67,
                memoryCleanupInterval: 30000,
                throttleUpdateInterval: 50
            };
            
            // DOM缓存和性能优化
            this.lastMemoryCleanup = 0;
            this.frameSkipCounter = 0;
            
            // 检查必要DOM元素
            this.checkRequiredElements();
            
            // 初始化组件
            this.initializeComponents();
            this.initializeEventListeners();
            this.initializeUI();
            
            // 添加错误监听
            this.setupErrorHandling();
            
            // 初始化性能优化
            this.initializePerformanceOptimizations();
        } catch (error) {

            this.showErrorMessage(`游戏初始化失败: ${error.message}`);
        }
    }
    
    /**
     * 检查必要的DOM元素是否存在
     */
    checkRequiredElements() {
        const requiredElements = [
            'game-container',
            'game-area',
            'game-canvas',
            'start-screen',
            'score-value',
            'combo-value',
            'level-value',
            'time-value',
            'target-number'
        ];
        
        const missingElements = [];
        requiredElements.forEach(id => {
            const element = document.getElementById(id);
            if (!element) {
                missingElements.push(id);
            }
        });
        
        if (missingElements.length > 0) {

        }
    }

    /**
     * 设置错误处理
     */
    setupErrorHandling() {
        window.addEventListener('error', this.handleGlobalError.bind(this));
        window.addEventListener('unhandledrejection', this.handlePromiseError.bind(this));
    }

    /**
     * 处理全局错误
     */
    handleGlobalError(event) {
        const errorInfo = {
            error: event.error,
            message: event.message || 'Unknown error',
            filename: event.filename || 'Unknown file',
            lineno: event.lineno || 'Unknown line',
            colno: event.colno || 'Unknown column'
        };
        
        
        
        // 如果error为null，尝试从其他属性获取信息
        if (!event.error && event.message) {
            
        }
        
        if (this.gameState === 'playing') {
            this.pauseGame();
            this.showErrorMessage('游戏出现错误，已自动暂停。');
        }
    }

    /**
     * 处理Promise错误
     */
    handlePromiseError(event) {

        event.preventDefault(); // 防止错误传播
    }

    /**
     * 显示错误消息
     */
    showErrorMessage(message) {
        // 创建错误提示
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.innerHTML = `
            <div class="error-content">
                <p>${message}</p>
                <button onclick="this.parentElement.parentElement.remove()">确定</button>
            </div>
        `;
        document.body.appendChild(errorDiv);

        // 3秒后自动移除 - 使用更精确的方式
        const removeTime = Date.now() + 3000;
        const checkRemoval = () => {
            if (Date.now() >= removeTime && errorDiv.parentElement) {
                errorDiv.remove();
            } else if (errorDiv.parentElement) {
                requestAnimationFrame(checkRemoval);
            }
        };
        requestAnimationFrame(checkRemoval);
    }

    /**
     * 安全的音效播放
     */
    safePlaySound(soundName) {
        try {
            if (this.soundManager && typeof this.soundManager.play === 'function') {
                this.soundManager.play(soundName);
            }
        } catch (error) {

            // 静默失败，不影响游戏继续
        }
    }

    /**
     * 初始化游戏组件
     */
    initializeComponents() {
        try {
            // 初始化子系统
            this.expressionGenerator = new ExpressionGenerator();
            this.animationEngine = new AnimationEngine();
            this.difficultyManager = new DifficultyManager();
            this.soundManager = new SoundManager();
            
            // 初始化Canvas渲染系统（只用于特效）
            this.initializeCanvas();
            
            // 启动动画引擎
            this.animationEngine.start();
            
            // Canvas渲染循环将在游戏开始时启动
            this.isRendering = false;
        } catch (error) {

            throw new Error(`组件初始化失败: ${error.message}`);
        }
    }
    

    


    /**
     * 初始化Canvas渲染系统
     */
    initializeCanvas() {
        try {
    
            
            this.canvas = document.getElementById('game-canvas');
            if (!this.canvas) {
                throw new Error('找不到game-canvas元素');
            }

            
            this.ctx = this.canvas.getContext('2d');
            if (!this.ctx) {
                throw new Error('无法获取2D上下文');
            }

            
            this.resizeCanvas();
            
            // Canvas渲染配置
            this.canvasConfig = {
                backgroundColor: this.getCanvasBackgroundColor(),
                expressionFont: '36px "Fredoka One", "Nunito", cursive',
                expressionColors: [
                    '#ff6b9d', '#4ecdc4', '#45b7d1', 
                    '#f9ca24', '#a55eea', '#fd9644'
                ]
            };
            
            // 检查ParticleSystem是否存在
            if (typeof ParticleSystem === 'undefined') {

            } else {
                // 启用粒子系统，但不启动它自己的循环
                this.particleSystem = new ParticleSystem(this.canvas);
                this.particleSystem.stop(); // 停止独立循环，使用主游戏循环

            }
            
            // 添加Canvas事件监听
            this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
            this.canvas.addEventListener('touchstart', (e) => this.handleCanvasTouch(e));
            

        } catch (error) {

            throw new Error(`Canvas初始化失败: ${error.message}`);
        }
    }
    
    /**
     * 根据当前主题获取Canvas背景色
     */
    getCanvasBackgroundColor() {
        const body = document.body;
        if (body.classList.contains('dark-theme')) {
            return '#000000';
        } else if (body.classList.contains('light-theme')) {
            return '#f7fafc';
        } else {
            return '#000000';
        }
    }
    
    /**
     * 调整Canvas大小
     */
    resizeCanvas() {
        if (!this.canvas) return;
        
        const gameArea = document.getElementById('game-area');
        if (gameArea) {
            const width = gameArea.offsetWidth;
            const height = gameArea.offsetHeight;
            

            
            if (width > 0 && height > 0) {
                this.canvas.width = width;
                this.canvas.height = height;
                
                // 设置高DPI显示
                const dpr = window.devicePixelRatio || 1;
                if (dpr > 1) {
                    this.canvas.width = width * dpr;
                    this.canvas.height = height * dpr;
                    this.canvas.style.width = width + 'px';
                    this.canvas.style.height = height + 'px';
                    this.ctx.scale(dpr, dpr);
                }
                

            } else {

            }
        } else {

        }
    }
    
    /**
     * 启动Canvas渲染循环
     */
    startCanvasRendering() {
        try {
    
            
            if (!this.canvas) {
                throw new Error('Canvas未初始化');
            }
            
            if (!this.ctx) {
                throw new Error('Canvas上下文未初始化');
            }
            

            
            this.isRendering = true;
            this.renderLoop();
            

            
        } catch (error) {


            throw error;
        }
    }
    
    /**
     * Canvas渲染循环
     */
    renderLoop() {
        if (!this.isRendering || !this.ctx) return;
        
        const currentTime = performance.now();
        const deltaTime = currentTime - (this.lastRenderTime || currentTime);
        this.lastRenderTime = currentTime;
        
        // 清除画布（完全清除，不使用拖尾效果）
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 设置主题背景色
        this.ctx.fillStyle = this.getCanvasBackgroundColor();
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 渲染算式
        this.renderExpressions();
        
        // 更新和渲染粒子效果
        if (this.particleSystem) {
            this.particleSystem.update(deltaTime);
            this.particleSystem.updateSpecialEffects(deltaTime);
        }
        
        requestAnimationFrame(() => this.renderLoop());
    }
    
    /**
     * 渲染所有算式
     */
    renderExpressions() {
        if (!this.ctx) return;
        
        // 暂停时不渲染算式
        if (this.gameState === 'paused') return;
        
        this.expressions.forEach((expr, index) => {
            if (expr && expr.data && expr.position) {
                this.renderExpression(expr, index);
            } else {
    
            }
        });
    }
    
    /**
     * 渲染单个算式
     */
    renderExpression(expression, index) {
        if (!expression || !expression.data) {
    
            return;
        }
        
        const ctx = this.ctx;
        const { x, y } = expression.position;
        const text = expression.data.expression;
        
        // 验证位置
        if (isNaN(x) || isNaN(y)) {

            return;
        }
        

        
        // 选择颜色
        const colorIndex = index % this.canvasConfig.expressionColors.length;
        const color = this.canvasConfig.expressionColors[colorIndex];
        
        // 设置文本样式
        ctx.font = this.canvasConfig.expressionFont;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // 添加文本阴影/光晕效果
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        // 绘制文本
        ctx.fillText(text, x, y);
        

        
        // 重置阴影
        ctx.shadowBlur = 0;
        
        // 如果点击了，添加特效
        if (expression.isClicked) {
            if (expression.isCorrect) {
                this.renderCorrectEffect(ctx, x, y);
            } else {
                this.renderIncorrectEffect(ctx, x, y);
            }
        }
    }
    
    /**
     * 渲染正确点击特效
     */
    renderCorrectEffect(ctx, x, y) {
        ctx.save();
        
        // 外圈扩散效果
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(x, y, 30 + i * 20, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(78, 205, 196, ${0.6 - i * 0.15})`;
            ctx.lineWidth = 3;
            ctx.stroke();
        }
        
        // 中心亮点
        ctx.beginPath();
        ctx.arc(x, y, 15, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(78, 205, 196, 0.8)';
        ctx.fill();
        
        // 光芒射线
        for (let i = 0; i < 8; i++) {
            const angle = (i * Math.PI * 2) / 8;
            const length = 25;
            ctx.beginPath();
            ctx.moveTo(x + Math.cos(angle) * 20, y + Math.sin(angle) * 20);
            ctx.lineTo(x + Math.cos(angle) * (20 + length), y + Math.sin(angle) * (20 + length));
            ctx.strokeStyle = 'rgba(78, 205, 196, 0.7)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        
        ctx.restore();
    }
    
    /**
     * 渲染错误点击特效
     */
    renderIncorrectEffect(ctx, x, y) {
        ctx.save();
        
        // 错误X标记
        const size = 30;
        ctx.strokeStyle = 'rgba(255, 107, 157, 0.9)';
        ctx.lineWidth = 4;
        
        // 第一条线
        ctx.beginPath();
        ctx.moveTo(x - size, y - size);
        ctx.lineTo(x + size, y + size);
        ctx.stroke();
        
        // 第二条线
        ctx.beginPath();
        ctx.moveTo(x + size, y - size);
        ctx.lineTo(x - size, y + size);
        ctx.stroke();
        
        // 圆形警告框
        ctx.beginPath();
        ctx.arc(x, y, size + 10, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 107, 157, 0.6)';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // 背景扩散效果
        for (let i = 0; i < 2; i++) {
            ctx.beginPath();
            ctx.arc(x, y, 25 + i * 15, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 107, 157, ${0.2 - i * 0.1})`;
            ctx.fill();
        }
        
        ctx.restore();
    }
    
    /**
     * 处理Canvas点击事件
     */
    handleCanvasClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        this.checkExpressionClick(x, y);
    }
    
    /**
     * 处理Canvas触摸事件
     */
    handleCanvasTouch(event) {
        event.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const touch = event.touches[0];
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        
        this.checkExpressionClick(x, y);
    }
    
    /**
     * 检查点击的算式
     */
    checkExpressionClick(clickX, clickY) {
        for (let i = this.expressions.length - 1; i >= 0; i--) {
            const expr = this.expressions[i];
            if (!expr || expr.isClicked || !expr.position) continue;
            
            const { x, y } = expr.position;
            const distance = Math.sqrt((clickX - x) ** 2 + (clickY - y) ** 2);
            
            // 点击区域半径（可调整）
            const clickRadius = 60;
            
            if (distance <= clickRadius) {
                this.handleCanvasExpressionClick(expr);
                break;
            }
        }
    }
    
    /**
     * 处理Canvas算式点击
     */
    handleCanvasExpressionClick(expression) {
        if (!expression || expression.isClicked) return;
        
        const responseTime = Date.now() - expression.startTime;
        expression.isClicked = true;
        
        // 检查答案是否正确 - 使用动态判断方法
        if (expression.isMatched && expression.isMatched(this.targetNumber)) {
            this.handleCorrectClick(expression, responseTime);
            // 显示正确特效
            if (this.ctx) {
                this.renderCorrectEffect(this.ctx, expression.position.x, expression.position.y);
            }
        } else {
            this.handleIncorrectClick(expression, responseTime);
            // 显示错误特效
            if (this.ctx) {
                this.renderIncorrectEffect(this.ctx, expression.position.x, expression.position.y);
            }
        }
        
        // 移除被点击的算式
        setTimeout(() => {
            this.removeExpression(expression);
        }, 500);
    }

    /**
     * 初始化事件监听器
     */
    initializeEventListeners() {
        // 窗口大小变化
        window.addEventListener('resize', () => this.handleResize());
        
        // 绑定方法上下文
        this.handleResize = this.handleResize.bind(this);
        this.handleKeyPress = this.handleKeyPress.bind(this);
        
        // 键盘事件
        document.addEventListener('keydown', (e) => this.handleKeyPress(e));
        
        // 难度选择按钮
        const difficultyButtons = document.querySelectorAll('.difficulty-btn');
        difficultyButtons.forEach(btn => {
            btn.addEventListener('click', () => this.selectDifficulty(btn));
        });
        
        // 游戏控制按钮
        this.bindButton('start-game-btn', () => this.startGame());
        this.bindButton('pause-btn', () => this.togglePause());
        this.bindButton('resume-btn', () => this.resumeGame());
        this.bindButton('restart-btn', () => this.restartGame());
        this.bindButton('main-menu-btn', () => this.showMainMenu());
        this.bindButton('play-again-btn', () => this.restartGame());
        this.bindButton('change-difficulty-btn', () => this.showMainMenu());
        this.bindButton('home-btn', () => this.goHome());
        
        // 设置相关按钮
        this.bindButton('settings-btn', () => this.showSettings());
        this.bindButton('settings-close-btn', () => this.hideSettings());
        this.bindButton('theme-btn', () => this.toggleTheme());
        
        // 帮助界面按钮
        this.bindButton('help-btn', () => this.showHelp());
        this.bindButton('help-close-btn', () => this.hideHelp());
        this.bindButton('help-start-btn', () => {
            this.hideHelp();
            this.startGame();
        });
        
        // 会话完成界面按钮
        this.bindButton('session-continue-btn', () => this.continueToNextLevel());
        this.bindButton('session-retry-btn', () => this.retryCurrentLevel());
        this.bindButton('session-menu-btn', () => this.showMainMenu());
        
        // 设置控件
        this.initializeSettings();
    }

    /**
     * 绑定按钮事件
     */
    bindButton(id, handler) {
        const element = document.getElementById(id);
        if (element) {
            // 使用单例模式，直接绑定事件处理器
            element.addEventListener('click', (e) => {
                e.preventDefault();
                this.soundManager.playClick();
                handler();
            });
        }
    }

    /**
     * 初始化设置控件
     */
    initializeSettings() {
        // 加载保存的主题设置
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-theme');
        } else if (savedTheme === 'light') {
            document.body.classList.add('light-theme');
        }
        // 默认主题不需要添加类名
        
        // 音效音量
        const soundVolumeSlider = document.getElementById('sound-volume');
        const soundVolumeValue = document.getElementById('sound-volume-value');
        if (soundVolumeSlider && soundVolumeValue) {
            soundVolumeSlider.addEventListener('input', (e) => {
                const volume = e.target.value / 100;
                this.soundManager.setSfxVolume(volume);
                soundVolumeValue.textContent = e.target.value + '%';
            });
        }
        
        // 背景音乐音量
        const musicVolumeSlider = document.getElementById('music-volume');
        const musicVolumeValue = document.getElementById('music-volume-value');
        if (musicVolumeSlider && musicVolumeValue) {
            musicVolumeSlider.addEventListener('input', (e) => {
                const volume = e.target.value / 100;
                this.soundManager.setMusicVolume(volume);
                musicVolumeValue.textContent = e.target.value + '%';
            });
        }
        
        // 粒子效果开关
        const particleEffectsCheckbox = document.getElementById('particle-effects');
        if (particleEffectsCheckbox) {
            particleEffectsCheckbox.addEventListener('change', (e) => {
                if (this.particleSystem) {
                    this.particleSystem.setEnabled(e.target.checked);
                }
            });
        }
    }

    /**
     * 初始化UI状态
     */
    initializeUI() {
        this.updateUI();
        this.showScreen('start-screen');
    }

    /**
     * 选择难度
     */
    selectDifficulty(button) {
        // 移除其他按钮的选中状态
        document.querySelectorAll('.difficulty-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
        
        // 设置当前按钮为选中状态
        button.classList.add('selected');
        
        // 设置难度等级
        const level = parseInt(button.dataset.level);
        this.difficultyManager.setBaseLevel(level);
        this.expressionGenerator.setDifficulty(level);
        

    }

    /**
     * 开始游戏
     */
    startGame() {
        try {
            if (this.gameState === 'playing') {
                return;
            }
            
            this.gameState = 'playing';
    
            this.resetGameData();
            
            // 初始化会话系统
            if (this.config.enableSessions) {
                this.initializeSession();
            }
            
            // 清理所有现有算式
            this.expressions = [];
            
            this.generateNewTarget();
            
            // 正确的显示顺序：先隐藏所有屏幕，再显示游戏容器
            this.hideAllScreens();
            this.showScreen('game-container');
            
            // 等待DOM更新后重新调整Canvas大小
            setTimeout(() => {
                try {
        
                    this.resizeCanvas();
        
                } catch (error) {

                }
            }, 50);
            
            // 开始游戏循环
            this.gameStartTime = Date.now();
            this.lastUpdateTime = this.gameStartTime;
            this.lastSpawnTime = this.gameStartTime;
            this.nextTargetChangeTime = this.gameStartTime + this.config.targetChangeInterval;
            
            // 启动Canvas渲染循环（只用于特效）
            setTimeout(() => {
                try {

                    this.startCanvasRendering();
                } catch (error) {

                }
            }, 200);
            

            this.gameLoop();
            
            // 播放开始音效
            if (this.soundManager) {
                this.soundManager.playClick();
            }
            

            
        } catch (error) {
            this.gameState = 'menu';
            this.showErrorMessage(`游戏启动失败: ${error.message}`);
        }
    }

    /**
     * 初始化会话
     */
    initializeSession() {
        const currentTime = Date.now();
        this.sessionStartTime = currentTime;
        this.sessionEndTime = currentTime + this.config.sessionDuration;
        this.sessionTimeRemaining = this.config.sessionDuration;
        this.sessionComplete = false;
        
        // 计算目标分数（基于当前难度）
        const currentConfig = this.difficultyManager.getCurrentConfig();
        const baseTargetScore = Math.floor(currentConfig.range.max * this.config.progressionThresholds.scoreMultiplier * 10);
        this.sessionTargetScore = Math.max(baseTargetScore, 100); // 最低100分
        
        this.canLevelUp = false;
        this.nextLevelUnlocked = false;
        
        // 更新UI显示
        this.updateSessionUI();
    }
    
    /**
     * 更新会话UI
     */
    updateSessionUI() {
        if (!this.config.enableSessions) return;
        
        const minutes = Math.floor(this.sessionTimeRemaining / 60000);
        const seconds = Math.floor((this.sessionTimeRemaining % 60000) / 1000);
        const timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        this.updateElement('session-time', timeText);
        this.updateElement('session-target', this.sessionTargetScore);
        
        // 检查是否可以升级
        this.checkLevelUpConditions();
    }
    
    /**
     * 检查升级条件
     */
    checkLevelUpConditions() {
        if (!this.config.enableSessions || this.sessionComplete) return;
        
        const accuracy = this.totalAnswered > 0 ? this.correctAnswers / this.totalAnswered : 0;
        const scoreReached = this.score >= this.sessionTargetScore;
        const accuracyGood = accuracy >= this.config.progressionThresholds.accuracyThreshold;
        const comboGood = this.maxCombo >= this.config.progressionThresholds.comboThreshold;
        
        this.canLevelUp = scoreReached && accuracyGood && comboGood;
        
        // 更新升级提示UI
        const levelUpIndicator = document.getElementById('level-up-indicator');
        if (levelUpIndicator) {
            levelUpIndicator.style.display = this.canLevelUp ? 'block' : 'none';
        }
    }
    
    /**
     * 更新会话时间
     */
    updateSessionTime(currentTime) {
        if (!this.config.enableSessions || this.sessionComplete) return;
        
        this.sessionTimeRemaining = Math.max(0, this.sessionEndTime - currentTime);
        
        if (this.sessionTimeRemaining <= 0) {
            this.completeSession();
        } else {
            this.updateSessionUI();
        }
    }
    
    /**
     * 完成会话
     */
    completeSession() {
        this.sessionComplete = true;
        this.sessionTimeRemaining = 0;
        
        // 显示会话结果
        this.showSessionResults();
    }
    
    /**
     * 显示会话结果
     */
    showSessionResults() {
        // 暂停游戏
        this.gameState = 'sessionComplete';
        
        // 计算准确的统计数据
        const accuracy = this.totalAnswered > 0 ? (this.correctAnswers / this.totalAnswered * 100).toFixed(1) : 0;
        const sessionDurationMinutes = Math.floor(this.config.sessionDuration / 60000);
        
        // 更新会话结果UI
        this.updateElement('session-final-score', this.score);
        this.updateElement('session-target-score', this.sessionTargetScore);
        this.updateElement('session-accuracy', `${accuracy}%`);
        this.updateElement('session-max-combo', this.maxCombo);
        this.updateElement('session-duration', `${sessionDurationMinutes} 分钟`);
        
        // 检查是否达成升级条件
        const levelUpAchieved = this.canLevelUp;
        this.updateElement('session-level-up', levelUpAchieved ? '是' : '否');
        
        // 更新按钮状态
        const continueBtn = document.getElementById('session-continue-btn');
        if (continueBtn) {
            continueBtn.style.display = levelUpAchieved ? 'block' : 'none';
        }
        
        // 显示会话完成屏幕
        this.hideAllScreens();
        this.showScreen('session-complete-screen');
        
        // 播放完成音效
        if (levelUpAchieved) {
            this.safePlaySound('levelUp');
        } else {
            this.safePlaySound('sessionComplete');
        }
    }
    
    /**
     * 继续到下一关
     */
    continueToNextLevel() {
        if (!this.canLevelUp) return;
        
        // 升级到下一个难度
        const currentLevel = this.difficultyManager.baseLevel;
        const maxLevel = Object.keys(this.difficultyManager.difficultyConfig).length;
        
        if (currentLevel < maxLevel) {
            // 找到下一个难度按钮并选择
            const difficultyButtons = document.querySelectorAll('.difficulty-btn');
            const nextButton = difficultyButtons[currentLevel]; // currentLevel是从1开始的，所以直接用作索引
            
            if (nextButton) {
                this.selectDifficulty(nextButton);
            }
        }
        
        // 隐藏会话完成屏幕并重置游戏状态
        this.hideAllScreens();
        this.gameState = 'menu';
        
        // 开始新游戏
        this.startGame();
    }
    
    /**
     * 重试当前关卡
     */
    retryCurrentLevel() {
        // 隐藏会话完成屏幕并重置游戏状态
        this.hideAllScreens();
        this.gameState = 'menu';
        
        // 重新开始当前难度的游戏
        this.startGame();
    }
    
    /**
     * 重置游戏数据
     */
    resetGameData() {
        try {
            this.score = 0;
            this.combo = 0;
            this.maxCombo = 0;
            this.gameTime = 0;
            this.totalClicks = 0;
            this.correctClicks = 0;
            this.incorrectClicks = 0;
            this.consecutiveErrors = 0;
            this.totalAnswered = 0;
            this.correctAnswers = 0;
            
            // 标记需要更新UI
            this.needsUIUpdate = true;
            
    
            
            // 清理屏幕上的算式
            this.clearAllExpressions();
            
            // 重置统计
            if (this.difficultyManager) {
                this.difficultyManager.resetStats();
    
            } else {
    
            }
            
            // 清理粒子效果
            if (this.particleSystem) {
                this.particleSystem.clear();
    
            } else {

            }
            

            
        } catch (error) {


            throw error;
        }
    }

    /**
     * 游戏主循环（性能优化版）
     */
    gameLoop() {
        if (this.gameState !== 'playing') return;
        
        // 记录帧时间用于性能监控
        if (window.performanceMonitor) {
            window.performanceMonitor.recordFrame();
        }
        
        const currentTime = Date.now();
        const deltaTime = currentTime - this.lastUpdateTime;
        
        // 帧跳过机制 - 如果帧率过低则跳过某些更新
        const shouldSkipFrame = deltaTime > this.performanceConfig.frameSkipThreshold;
        
        if (shouldSkipFrame) {
            this.frameSkipCounter++;
            if (this.frameSkipCounter % 2 === 0) {
                // 每隔一帧跳过复杂更新
                requestAnimationFrame(() => this.gameLoop());
                return;
            }
        } else {
            this.frameSkipCounter = 0;
        }
        
        this.lastUpdateTime = currentTime;
        
        // 更新游戏时间
        this.gameTime = currentTime - this.gameStartTime;
        
        // 更新会话时间
        if (this.config.enableSessions) {
            this.updateSessionTime(currentTime);
        }
        
        // 生成Canvas算式（用于背景动画效果）
        this.trySpawnCanvasExpression(currentTime);
        
        // 更新目标数字
        this.updateTargetNumber(currentTime);
        
        // 更新表达式动画（在游戏循环中）
        this.updateExpressionAnimations(currentTime);
        
        
        // 清理过期的算式（节流版本）
        if (currentTime - this.lastMemoryCleanup > 1000) { // 每秒清理一次
            this.throttledCleanup();
        }
        
        // 更新UI（仅在需要时或每秒更新时间）
        const shouldUpdateTime = currentTime - this.lastUIUpdateTime > 1000;
        if (this.needsUIUpdate || shouldUpdateTime) {
            this.throttledUpdateUI();
            this.needsUIUpdate = false;
            if (shouldUpdateTime) {
                this.lastUIUpdateTime = currentTime;
            }
        }
        
        // 继续循环
        requestAnimationFrame(() => this.gameLoop());
    }
    
    /**
     * 更新表达式动画
     */
    updateExpressionAnimations(currentTime) {
        for (let i = this.expressions.length - 1; i >= 0; i--) {
            const expr = this.expressions[i];
            if (!expr.animation) continue;
            
            const { animation } = expr;
            const elapsed = currentTime - animation.startTime;
            const progress = Math.min(elapsed / animation.duration, 1);
            
            // 验证动画参数
            if (isNaN(animation.startY) || isNaN(animation.targetY) || isNaN(animation.duration)) {

                // 移除这个无效的表达式
                this.expressions.splice(i, 1);
                continue;
            }
            
            if (isNaN(elapsed) || isNaN(progress)) {

                // 移除这个无效的表达式
                this.expressions.splice(i, 1);
                continue;
            }
            
            // 保持原始X位置不变（垂直下落）
            const newX = expr.position.x;
            
            // 验证X位置
            if (isNaN(newX)) {

                this.expressions.splice(i, 1);
                continue;
            }
            
            // 计算Y位置（垂直匀速下落）
            const newY = animation.startY + (animation.targetY - animation.startY) * progress;
            
            // 验证计算结果
            if (isNaN(newY) || isNaN(newX)) {

                // 移除这个无效的表达式
                this.expressions.splice(i, 1);
                continue;
            }
            
            // 更新位置
            expr.position.x = newX;
            expr.position.y = newY;
            
            // 检查是否到达底部（只基于实际位置判断，不基于时间进度）
            if (newY >= (this.canvas ? this.canvas.height : window.innerHeight)) {
                this.handleExpressionMissed(expr);
            }
        }
    }


    
    /**
     * 尝试生成Canvas背景算式
     */
    trySpawnCanvasExpression(currentTime) {
        const gameParams = this.difficultyManager.getGameParams();
        
        // 使用正常的生成频率
        if (currentTime - (this.lastCanvasSpawnTime || 0) < gameParams.spawnRate) {
            return;
        }
        
        // 使用难度管理器的maxSimultaneous设置
        if (this.expressions.length >= gameParams.maxSimultaneous) {
            return;
        }
        
        // 随机生成正确或错误的算式
        const shouldGenerateCorrect = Math.random() < gameParams.correctRatio;
        const expressionData = this.safeGenerateExpression(this.targetNumber, shouldGenerateCorrect);
        
        if (expressionData) {
            // 验证生成的算式是否真的正确
            const actuallyCorrect = expressionData.result === this.targetNumber;
            this.createCanvasExpression(expressionData, actuallyCorrect, gameParams);
            this.lastCanvasSpawnTime = currentTime;
        }
    }
    
    /**
     * 创建Canvas算式
     */
    createCanvasExpression(expressionData, isCorrect, gameParams) {
        const position = this.findSafePosition();
        if (!position) {
            return;
        }
        
        const expression = {
            id: 'canvas-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            data: expressionData,
            position: position,
            isCorrect: isCorrect,
            targetNumber: this.targetNumber, // 记录生成时的目标数字
            startTime: Date.now(),
            isClicked: false,
            type: 'canvas', // 标记为Canvas算式
            
            // 动态判断表达式是否匹配当前目标数字
            isMatched: function(currentTargetNumber) {
                return Math.abs(this.data.result - currentTargetNumber) < 0.01;
            }
        };
        
        // 设置动画参数
        const fallDuration = gameParams.fallSpeed * 1.5; // Canvas算式下落更慢
        const targetY = this.canvas ? this.canvas.height + 100 : window.innerHeight + 100;
        
        expression.animation = {
            startY: position.y,
            targetY: targetY,
            startTime: Date.now(),
            duration: fallDuration
        };
        
        this.expressions.push(expression);
    }
    
    /**
     * 初始化性能优化
     */
    initializePerformanceOptimizations() {
        // 设置节流更新
        this.setupThrottledUpdates();
        
        // 设置内存清理
        this.setupMemoryCleanup();
        
        // 检测移动设备并启用优化
        this.setupMobileOptimizations();
    }

    /**
     * 获取DOM元素（简化版）
     */
    getCachedElement(id) {
        return document.getElementById(id);
    }

    /**
     * 设置节流更新
     */
    setupThrottledUpdates() {
        this.throttledUpdateUI = this.throttle(this.updateUI.bind(this), this.performanceConfig.throttleUpdateInterval);
        this.throttledCleanup = this.throttle(this.cleanupExpressions.bind(this), 200);
    }

    /**
     * 设置内存清理
     */
    setupMemoryCleanup() {
        setInterval(() => {
            this.performMemoryCleanup();
        }, this.performanceConfig.memoryCleanupInterval);
    }

    /**
     * 执行内存清理
     */
    performMemoryCleanup() {
        try {
            // 清理无效的表达式
            this.expressions = this.expressions.filter(expr => 
                expr && expr.id && expr.data
            );
            
            // 强制垃圾回收（在支持的浏览器中）
            if (window.gc && typeof window.gc === 'function') {
                window.gc();
            }
            
            this.lastMemoryCleanup = Date.now();
        } catch (error) {

        }
    }

    /**
     * 设置移动端优化
     */
    setupMobileOptimizations() {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (isMobile) {
            // 移动端特定优化
            this.config.maxExpressions = 4; // 减少最大算式数
            this.performanceConfig.batchUpdateSize = 3; // 减少批量更新大小
            this.performanceConfig.throttleUpdateInterval = 100; // 增加节流间隔
            
            // 启用硬件加速
            const gameContainer = this.getCachedElement('game-container');
            if (gameContainer) {
                gameContainer.style.transform = 'translateZ(0)';
                gameContainer.style.willChange = 'transform';
            }
            
            // 减少粒子效果
            if (this.particleSystem) {
                this.particleSystem.setMobileMode(true);
            }
            

        }
    }

    /**
     * 节流函数
     */
    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                // 使用简单的setTimeout避免竞态条件
                setTimeout(() => {
                    inThrottle = false;
                }, limit);
            }
        }
    }




    /**
     * 安全的表达式生成
     */
    safeGenerateExpression(targetValue, isCorrect) {
        try {
            if (isCorrect) {
                const expr = this.expressionGenerator.generateCorrectExpression(targetValue);
                if (expr && expr.expression) {
                    return expr;
                }
            } else {
                const decoys = this.expressionGenerator.generateDecoyExpressions(targetValue, 1);
                if (decoys.length > 0 && decoys[0] && decoys[0].expression) {
                    return decoys[0];
                }
            }
        } catch (error) {

        }
        
        // 返回简单的回退表达式
        const fallback = this.createFallbackExpression(targetValue, isCorrect);

        return fallback;
    }

    /**
     * 创建回退表达式
     */
    createFallbackExpression(targetValue, isCorrect) {
        if (isCorrect) {
            // 生成简单的加法表达式
            const a = Math.max(1, Math.floor(targetValue / 2));
            const b = targetValue - a;
            return {
                expression: `${a} + ${b}`,
                result: targetValue
            };
        } else {
            // 生成错误表达式
            const offset = Math.random() < 0.5 ? -1 : 1;
            const wrongResult = Math.max(1, targetValue + offset);
            return {
                expression: `${wrongResult}`,
                result: wrongResult
            };
        }
    }

    /**
     * 创建算式卡片（Canvas版本）
     */


    /**
     * 清理位置无效的表达式
     */
    cleanupInvalidExpressions() {
        const originalCount = this.expressions.length;
        this.expressions = this.expressions.filter(expr => {
            if (!expr.position || isNaN(expr.position.x) || isNaN(expr.position.y)) {

                return false;
            }
            return true;
        });
        
        if (this.expressions.length !== originalCount) {

        }
    }

    /**
     * 找到安全的位置（Canvas版本）
     */
    findSafePosition() {
        const areaWidth = this.canvas ? this.canvas.width : window.innerWidth;
        const cardWidth = 140; // 增加Canvas中的文本宽度估算
        const cardHeight = 80; // 增加Canvas中的文本高度估算
        const minDistance = 180; // 增加最小间距
        const maxAttempts = 30; // 增加最大尝试次数
        
        // 验证 areaWidth 不是 NaN
        if (isNaN(areaWidth) || areaWidth <= 0) {
            return { x: 100, y: -100 };
        }
        
        // 确保有最小宽度
        const safeAreaWidth = Math.max(areaWidth, 800);
        const margin = 80; // 增加边距
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            // 更安全的随机数生成
            const randomX = Math.random();
            const randomY = Math.random();
            
            const x = margin + randomX * Math.max(0, safeAreaWidth - 2 * margin);
            const y = -80 - (randomY * 300); // 增加生成区域高度
            
            // 立即检查计算结果
            if (isNaN(x) || isNaN(y)) {
                continue; // 尝试下一次
            }
            
            // 检查是否与现有表达式重叠
            let isSafe = true;
            for (const expr of this.expressions) {
                if (!expr.position) continue;
                
                // 验证现有表达式的位置
                if (isNaN(expr.position.x) || isNaN(expr.position.y)) {
                    continue; // 跳过无效的表达式
                }
                
                const dx = Math.abs(x - expr.position.x);
                const dy = Math.abs(y - expr.position.y);
                
                // 检查距离计算中的NaN
                if (isNaN(dx) || isNaN(dy)) {
                    continue;
                }
                
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (isNaN(distance)) {
                    continue;
                }
                
                if (distance < minDistance) {
                    isSafe = false;
                    break;
                }
            }
            
            if (isSafe) {
                return { x, y };
            }
        }
        
        // 如果找不到安全位置，使用改进的网格布局
        const cols = Math.max(2, Math.floor((safeAreaWidth - 2 * margin) / (cardWidth + 50))); // 增加列间距
        const rows = Math.max(2, Math.floor(400 / (cardHeight + 50))); // 增加行间距
        const currentIndex = this.expressions.length;
        const currentCol = currentIndex % cols;
        const currentRow = Math.floor(currentIndex / cols) % rows;
        
        const x = margin + currentCol * (cardWidth + 50) + (cardWidth / 2);
        const y = -80 - currentRow * (cardHeight + 50);
        
        // 确保返回的位置不是NaN
        if (isNaN(x) || isNaN(y)) {
            return { x: 100, y: -100 };
        }
        
        return { x, y };
    }



    /**
     * 在指定范围内生成随机数
     */
    randomBetween(min, max) {
        return Math.random() * (max - min) + min;
    }



    /**
     * 处理正确点击
     */
    handleCorrectClick(expression, responseTime) {
        this.correctClicks++;
        this.totalAnswered++;
        this.correctAnswers++;
        this.consecutiveErrors = 0;
        this.combo++;
        this.maxCombo = Math.max(this.maxCombo, this.combo);
        
        // 计算分数
        const baseScore = this.config.baseScore;
        const comboBonus = Math.floor(this.combo * this.config.comboMultiplier);
        const timeBonus = Math.max(0, Math.floor((3000 - responseTime) / 100)); // 响应时间奖励
        const totalScore = baseScore + comboBonus + timeBonus;
        
        this.score += totalScore;
        
        // 标记需要更新UI
        this.needsUIUpdate = true;
        
        // 视觉反馈 - Canvas坐标
        const centerX = expression.position.x;
        const centerY = expression.position.y;
        
        // 粒子效果
        if (this.particleSystem) {
            if (this.combo > 5) {
                this.particleSystem.createComboEffect(centerX, centerY, this.combo);
            } else {
                this.particleSystem.createCorrectEffect(centerX, centerY);
            }
        }
        
        // 音效
        if (this.combo > 5) {
            this.soundManager.playCombo(this.combo);
        } else {
            this.soundManager.playCorrect();
        }
        
        // 标记为已点击以触发Canvas特效
        expression.isClicked = true;
        
        // 分数飞出动画
        this.createScorePopup(centerX, centerY, `+${totalScore}`);
        
        // 移除算式
        this.removeExpression(expression);
        

    }

    /**
     * 处理错误点击
     */
    handleIncorrectClick(expression, responseTime) {
        this.incorrectClicks++;
        this.totalAnswered++;
        this.combo = 0; // 重置连击
        this.consecutiveErrors++;
        
        // 计算扣分
        const penalty = this.config.errorPenalty[Math.min(this.consecutiveErrors, this.config.errorPenalty.length - 1)];
        this.score = Math.max(0, this.score + penalty); // 确保分数不为负
        
        // 标记需要更新UI
        this.needsUIUpdate = true;
        
        // 视觉反馈 - Canvas坐标
        const centerX = expression.position.x;
        const centerY = expression.position.y;
        
        // 粒子效果
        if (this.particleSystem) {
            this.particleSystem.createIncorrectEffect(centerX, centerY);
        }
        
        // 音效
        this.soundManager.playIncorrect();
        
        // 标记为已点击以触发Canvas特效
        expression.isClicked = true;
        
        // 扣分显示
        if (penalty < 0) {
            this.createScorePopup(centerX, centerY, `${penalty}`, '#e53e3e');
        }
        
        // 屏幕震动效果
        this.shakeScreen();
        
        // 移除算式 - 使用 requestAnimationFrame 延迟移除而不是 setTimeout
        const removeTime = Date.now() + 400;
        const delayedRemove = () => {
            if (Date.now() >= removeTime) {
                this.removeExpression(expression);
            } else {
                requestAnimationFrame(delayedRemove);
            }
        };
        requestAnimationFrame(delayedRemove);
        

    }

    /**
     * 处理算式错过（掉落到底部）
     */
    handleExpressionMissed(expression) {
        if (expression.isClicked) return;
        
        // 如果错过的是正确答案，视为错误
        if (expression.isCorrect) {
            this.combo = 0;

        }
        
        this.removeExpression(expression);
    }

    /**
     * 移除算式（Canvas版本）
     */
    removeExpression(expression) {
        try {
            if (!expression) {

                return;
            }
            
            // 从数组移除
            const index = this.expressions.indexOf(expression);
            if (index > -1) {
                this.expressions.splice(index, 1);

            } else {

            }
        } catch (error) {

            // 尝试从数组中移除该元素
            const index = this.expressions.findIndex(e => e === expression);
            if (index > -1) {
                this.expressions.splice(index, 1);

            }
        }
    }

    /**
     * 清理过期的算式
     */
    cleanupExpressions() {
        for (let i = this.expressions.length - 1; i >= 0; i--) {
            const expression = this.expressions[i];
            const age = Date.now() - expression.startTime;
            
            // 如果算式存在时间过长，强制清理
            if (age > 10000) { // 10秒超时
                this.removeExpression(expression);
            }
        }
    }

    /**
     * 清理所有算式
     */
    clearAllExpressions() {
        try {

            
            while (this.expressions.length > 0) {
                this.removeExpression(this.expressions[0]);
            }
            

            
        } catch (error) {

            // 如果清理失败，直接清空数组
            this.expressions = [];

        }
    }

    /**
     * 生成新的目标数字
     */
    generateNewTarget() {
        try {

            
            const oldTarget = this.targetNumber;
            
            if (!this.expressionGenerator) {
                throw new Error('表达式生成器未初始化');
            }
            
            if (typeof this.expressionGenerator.generateTargetNumber !== 'function') {
                throw new Error('表达式生成器缺少generateTargetNumber方法');
            }
            
            this.targetNumber = this.expressionGenerator.generateTargetNumber();
            
            if (typeof this.targetNumber !== 'number' || isNaN(this.targetNumber)) {
                throw new Error(`生成的目标数字无效: ${this.targetNumber}`);
            }
            

            
            // 如果不是游戏开始时的第一次设置，播放音效和动画
            if (this.gameState === 'playing' && oldTarget !== undefined) {
                this.playTargetChangeAnimation();
                if (this.soundManager && typeof this.soundManager.play === 'function') {
                    this.soundManager.play('targetChange');
                }
            }
            
            this.updateTargetDisplay();
            
        } catch (error) {

            
            // 设置一个默认的目标数字
            this.targetNumber = 10;

            
            this.updateTargetDisplay();
            throw error;
        }
    }

    /**
     * 播放目标数字改变动画
     */
    playTargetChangeAnimation() {
        const targetElement = this.getCachedElement('target-number');
        if (targetElement) {
            // 添加改变动画类
            targetElement.classList.add('changing');
            
            // 动画结束后移除类 - 使用 requestAnimationFrame 而非 setTimeout
            const animationEndTime = Date.now() + 800;
            const checkAnimationEnd = () => {
                if (Date.now() >= animationEndTime) {
                    targetElement.classList.remove('changing');
                } else {
                    requestAnimationFrame(checkAnimationEnd);
                }
            };
            requestAnimationFrame(checkAnimationEnd);
        }
    }

    /**
     * 更新目标数字
     */
    updateTargetNumber(currentTime) {
        if (currentTime >= this.nextTargetChangeTime) {
            this.generateNewTarget();
            this.nextTargetChangeTime = currentTime + this.config.targetChangeInterval;
        }
    }

    /**
     * 更新目标数字显示
     */
    updateTargetDisplay() {
        const targetElement = this.getCachedElement('target-number');
        if (targetElement) {
            targetElement.textContent = this.targetNumber;
        }
    }

    /**
     * 创建分数弹出动画
     */
    createScorePopup(x, y, text, color = '#48bb78') {
        const popup = document.createElement('div');
        popup.style.position = 'fixed';
        popup.style.left = x + 'px';
        popup.style.top = y + 'px';
        popup.style.color = color;
        popup.style.fontSize = '20px';
        popup.style.fontWeight = 'bold';
        popup.style.pointerEvents = 'none';
        popup.style.zIndex = '1000';
        popup.textContent = text;
        
        document.body.appendChild(popup);
        
        // 动画
        this.animationEngine.createSlideAnimation(popup, {
            fromX: x,
            fromY: y,
            toX: x,
            toY: y - 50,
            duration: 1000,
            easing: this.animationEngine.easings.easeOut,
            onComplete: () => {
                if (popup.parentNode) {
                    popup.parentNode.removeChild(popup);
                }
            }
        });
        
        this.animationEngine.createFadeAnimation(popup, {
            from: 1,
            to: 0,
            duration: 1000,
            delay: 200
        });
    }

    /**
     * 屏幕震动效果
     */
    shakeScreen() {
        const gameContainer = document.getElementById('game-container');
        if (gameContainer) {
            this.animationEngine.createShakeAnimation(gameContainer, {
                duration: 300,
                intensity: 3,
                onComplete: () => {
                    gameContainer.style.transform = '';
                }
            });
        }
    }

    /**
     * 更新UI显示
     */
    updateUI() {
        // 更新分数（仅在变化时更新）
        const scoreElement = this.getCachedElement('score-value');
        if (scoreElement) {
            const newScoreText = this.score.toLocaleString();
            
            if (scoreElement.textContent !== newScoreText) {
                scoreElement.textContent = newScoreText;
            }
        }
        
        // 更新连击（仅在变化时更新）
        const comboElement = this.getCachedElement('combo-value');
        if (comboElement) {
            const newComboText = this.combo.toString();
            if (comboElement.textContent !== newComboText) {
                comboElement.textContent = newComboText;
            }
            // 更新颜色（仅在连击状态变化时）
            const newColor = this.combo > 0 ? '#ed8936' : '#48bb78';
            if (comboElement.style.color !== newColor) {
                comboElement.style.color = newColor;
            }
        }
        
        // 更新等级（仅在变化时更新）
        const levelElement = this.getCachedElement('level-value');
        if (levelElement) {
            const newLevelText = Math.floor(this.difficultyManager.currentLevel).toString();
            if (levelElement.textContent !== newLevelText) {
                levelElement.textContent = newLevelText;
            }
        }
        
        // 更新时间（每秒更新一次）
        const timeElement = this.getCachedElement('time-value');
        if (timeElement) {
            const minutes = Math.floor(this.gameTime / 60000);
            const seconds = Math.floor((this.gameTime % 60000) / 1000);
            const newTimeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            if (timeElement.textContent !== newTimeText) {
                timeElement.textContent = newTimeText;
            }
        }
    }

    /**
     * 游戏结束
     */
    gameOver() {
        this.gameState = 'gameOver';
        
        // 清理资源
        this.clearAllExpressions();
        this.animationEngine.clear();
        if (this.particleSystem) {
            this.particleSystem.clear();
        }
        
        // 计算最终统计
        const accuracy = this.totalClicks > 0 ? (this.correctClicks / this.totalClicks * 100) : 0;
        const gameTimeSeconds = Math.floor(this.gameTime / 1000);
        
        // 更新游戏结束界面
        this.updateElement('final-score', this.score.toLocaleString());
        this.updateElement('max-combo', this.maxCombo);
        this.updateElement('accuracy', accuracy.toFixed(1) + '%');
        this.updateElement('game-time', gameTimeSeconds + 's');
        
        // 显示游戏结束界面
        this.showScreen('game-over-screen');
        
        // 播放游戏结束音效
        this.soundManager.playGameOver();
        

    }

    /**
     * 暂停/恢复游戏
     */
    togglePause() {
        if (this.gameState === 'playing') {
            this.pauseGame();
        } else if (this.gameState === 'paused') {
            this.resumeGame();
        }
    }

    /**
     * 暂停游戏
     */
    pauseGame() {
        this.gameState = 'paused';
        this.animationEngine.pause();
        this.isRendering = false; // 停止Canvas渲染
        
        // 记录暂停时间
        this.pauseStartTime = Date.now();
        
        this.showScreen('pause-screen');
    }

    /**
     * 恢复游戏
     */
    resumeGame() {
        this.gameState = 'playing';
        this.animationEngine.resume();
        this.startCanvasRendering(); // 恢复Canvas渲染
        
        this.hideAllScreens();
        
        // 调整时间偏移
        const resumeTime = Date.now();
        const pausedDuration = resumeTime - (this.pauseStartTime || this.lastUpdateTime);
        this.gameStartTime += pausedDuration;
        this.lastSpawnTime += pausedDuration;
        this.nextTargetChangeTime += pausedDuration;
        
        // 调整所有算式的动画开始时间
        this.expressions.forEach(expr => {
            if (expr.animation && expr.animation.startTime) {
                expr.animation.startTime += pausedDuration;
            }
        });
        
        // 清除暂停时间记录
        this.pauseStartTime = null;
        
        // 重新启动游戏循环
        this.gameLoop();
    }

    /**
     * 重新开始游戏
     */
    restartGame() {
        this.gameState = 'menu';
        this.resetGameData();
        this.startGame();
    }

    /**
     * 显示主菜单
     */
    showMainMenu() {
        this.gameState = 'menu';
        this.isRendering = false; // 停止Canvas渲染
        this.clearAllExpressions();
        this.hideAllScreens(); // 先隐藏所有屏幕
        this.showScreen('start-screen');
    }

    /**
     * 返回主页
     */
    goHome() {
        window.location.href = 'index.html';
    }

    /**
     * 显示设置界面
     */
    showSettings() {
        this.showScreen('settings-screen');
    }

    /**
     * 隐藏设置界面
     */
    hideSettings() {
        this.hideScreen('settings-screen');
    }

    /**
     * 切换主题
     */
    toggleTheme() {
        const body = document.body;
        const isDark = body.classList.contains('dark-theme');
        const isLight = body.classList.contains('light-theme');
        
        if (isDark) {
            // 从暗色主题切换到浅色主题
            body.classList.remove('dark-theme');
            body.classList.add('light-theme');
            localStorage.setItem('theme', 'light');
        } else if (isLight) {
            // 从浅色主题切换到默认主题
            body.classList.remove('light-theme');
            localStorage.setItem('theme', 'default');
        } else {
            // 从默认主题切换到暗色主题
            body.classList.add('dark-theme');
            localStorage.setItem('theme', 'dark');
        }
        
        // 更新canvas背景色
        if (this.canvasConfig) {
            this.canvasConfig.backgroundColor = this.getCanvasBackgroundColor();
        }
    }

    /**
     * 显示帮助界面
     */
    showHelp() {
        this.showScreen('help-screen');
    }

    /**
     * 隐藏帮助界面
     */
    hideHelp() {
        this.hideScreen('help-screen');
    }

    /**
     * 显示指定屏幕
     */
    showScreen(screenId) {
        const screen = document.getElementById(screenId);
        if (screen) {
            screen.classList.remove('hidden');
        }
    }

    /**
     * 隐藏指定屏幕
     */
    hideScreen(screenId) {
        const screen = document.getElementById(screenId);
        if (screen) {
            screen.classList.add('hidden');
        }
    }

    /**
     * 隐藏所有屏幕
     */
    hideAllScreens() {
        const screens = document.querySelectorAll('.screen');
        screens.forEach(screen => {
            screen.classList.add('hidden');
        });
    }

    /**
     * 更新元素内容
     */
    updateElement(id, content) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = content;
        }
    }

    /**
     * 处理窗口大小变化
     */
    handleResize() {
        this.resizeCanvas();
    }

    /**
     * 处理键盘按键
     */
    handleKeyPress(event) {
        switch (event.code) {
            case 'Space':
                event.preventDefault();
                if (this.gameState === 'playing') {
                    this.togglePause();
                }
                break;
            case 'Escape':
                if (this.gameState === 'playing') {
                    this.pauseGame();
                } else if (this.gameState === 'paused') {
                    this.resumeGame();
                }
                break;
            case 'KeyR':
                if (this.gameState === 'gameOver') {
                    this.restartGame();
                }
                break;
        }
    }

    /**
     * 销毁游戏实例
     */
    destroy() {
        this.gameState = 'destroyed';
        
        // 清理分数状态
        this.score = null;
        this.combo = null;
        this.needsUIUpdate = false;
        
        // 清理资源
        this.clearAllExpressions();
        this.animationEngine.stop();
        if (this.particleSystem) {
            this.particleSystem.clear();
        }
        this.soundManager.destroy();
        this.isRendering = false;
        
        // 移除事件监听器
        window.removeEventListener('resize', this.handleResize);
        document.removeEventListener('keydown', this.handleKeyPress);
        
        // 清除单例实例引用
        MathRainGame.instance = null;
    }
    
    // 静态方法：获取单例实例
    static getInstance() {
        if (!MathRainGame.instance) {
            MathRainGame.instance = new MathRainGame();
        }
        return MathRainGame.instance;
    }
    
    // 静态方法：重置游戏（销毁当前实例并创建新实例）
    static reset() {
        if (MathRainGame.instance) {
            MathRainGame.instance.destroy();
        }
        return new MathRainGame();
    }
}

// 确保DOM加载完成后再初始化
function createGameInstance() {
    window.game = MathRainGame.getInstance();
}

// 确保DOM加载完成后再初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createGameInstance);
} else {
    createGameInstance();
}