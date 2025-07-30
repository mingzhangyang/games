// 魂斗罗游戏 - 优化版本
class ContraGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.gameState = 'loading';
        this.score = 0;
        this.lives = 3;
        this.currentLevel = 1;
        this.cameraX = 0;
        this.lastTime = 0;
        this.fps = 0;
        this.frameCount = 0;
        this.lastFpsTime = 0;
        this.gameSpeedMultiplier = 1.0;
        
        // 优化模块
        this.config = window.gameConfig;
        this.performanceMonitor = new PerformanceMonitor();
        this.resourceManager = window.resourceManager;
        this.debugPanel = null;
        
        // 游戏对象
        this.player = null;
        this.objectManager = null;
        this.inputManager = null;
        this.audioManager = null;
        this.particleSystem = null;
        
        this.init();
    }
    
    async init() {
        try {
            // 初始化存档管理器
            if (!window.saveManager) {
                window.saveManager = new SaveManager(this);
            }
            
            // 检查本地存储支持
            if (!window.saveManager.isStorageAvailable()) {
                console.warn('本地存储不可用，存档功能将受限');
            }
            
            this.checkCanvasSupport();
            
            // 加载配置
            await this.config.loadConfig();
            
            // 应用配置到canvas
            const canvasConfig = this.config.get('game.canvas');
            this.canvas.width = canvasConfig.width;
            this.canvas.height = canvasConfig.height;
            
            // 初始化游戏参数
            this.lives = this.config.get('player.startLives');
            
            // 加载保存的游戏设置
            const savedSettings = window.saveManager.loadSettings();
            if (savedSettings && savedSettings.gameSpeedMultiplier) {
                this.gameSpeedMultiplier = Math.max(
                    this.config.get('game.speed.min'),
                    Math.min(this.config.get('game.speed.max'), savedSettings.gameSpeedMultiplier)
                );
            } else {
                const speedMultiplier = this.config.get('game.speed.multiplier');
                this.gameSpeedMultiplier = speedMultiplier !== null && speedMultiplier !== undefined ? speedMultiplier : 1.0;
            }
            
            // 预加载资源
            await this.preloadResources();
            
            // 初始化游戏对象
            this.initGameObjects();
            
            // 设置事件监听
            this.setupEventListeners();
            
            // 更新UI
            this.updateUI();
            
            // 初始化调试面板
            if (this.config.get('debug.enabled')) {
                this.debugPanel = new DebugPanel(this);
            }
            
            // 显示最高分
            this.displayHighScore();
            
            // 切换到开始界面
            this.gameState = 'start';
            
            console.log('游戏初始化完成');
        } catch (error) {
            console.error('游戏初始化失败:', error);
            this.gameState = 'error';
            this.showErrorMessage('游戏初始化失败，请刷新页面重试');
        }
    }
    
    async preloadResources() {
        // 生成基础资源
        this.resourceManager.generateCommonResources();
        
        // 显示加载进度
        this.showLoadingProgress();
    }
    
    showLoadingProgress() {
        const loadingElement = document.getElementById('loading');
        if (loadingElement) {
            loadingElement.style.display = 'flex';
            
            // 模拟加载进度
            let progress = 0;
            const interval = setInterval(() => {
                progress += Math.random() * 20;
                if (progress >= 100) {
                    progress = 100;
                    clearInterval(interval);
                    setTimeout(() => {
                        loadingElement.style.display = 'none';
                    }, 500);
                }
                
                const progressBar = loadingElement.querySelector('.progress-fill');
                const progressText = loadingElement.querySelector('.progress-text');
                if (progressBar) progressBar.style.width = progress + '%';
                if (progressText) progressText.textContent = Math.round(progress) + '%';
            }, 100);
        }
    }
    
    initGameObjects() {
        const playerConfig = this.config.get('player');
        this.player = new Player(100, 400, playerConfig);
        
        const poolConfig = this.config.get('objectPools');
        this.objectManager = new ObjectManager(poolConfig);
        
        const controlConfig = this.config.get('controls');
        this.inputManager = new InputManager(controlConfig);
        
        const audioConfig = this.config.get('audio');
        this.audioManager = new AudioManager(audioConfig);
        
        const particleConfig = this.config.get('objectPools.particles');
        this.particleSystem = new ParticleSystem(particleConfig);
        
        // 初始化对象池
        this.objectManager.initPools();
    }
    
    checkCanvasSupport() {
        if (!this.canvas.getContext) {
            const message = window.currentLanguage === 'zh' ? 
                '您的浏览器不支持Canvas，请使用现代浏览器！' : 
                'Your browser does not support Canvas. Please use a modern browser!';
            alert(message);
            return false;
        }
        return true;
    }
    
    setupEventListeners() {
        document.addEventListener('keydown', (e) => this.inputManager.handleKeyDown(e, this));
        document.addEventListener('keyup', (e) => this.inputManager.handleKeyUp(e));
        
        // 添加速度控制快捷键
        document.addEventListener('keydown', (e) => {
            if (e.key === '-' || e.key === '_') {
                e.preventDefault();
                this.decreaseSpeed();
            } else if (e.key === '+' || e.key === '=') {
                e.preventDefault();
                this.increaseSpeed();
            } else if (e.key === '0') {
                e.preventDefault();
                this.resetSpeed();
            }
        });
        
        // 添加触摸控制支持
        this.canvas.addEventListener('touchstart', (e) => this.handleTouch(e));
        this.canvas.addEventListener('touchmove', (e) => this.handleTouch(e));
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));
    }
    
    handleTouch(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        
        // 简单的触摸控制逻辑
        if (x < this.canvas.width / 3) {
            this.inputManager.keys['ArrowLeft'] = true;
        } else if (x > this.canvas.width * 2 / 3) {
            this.inputManager.keys['ArrowRight'] = true;
        }
        
        if (y < this.canvas.height / 2) {
            this.inputManager.keys['ArrowUp'] = true;
        } else {
            this.inputManager.keys[' '] = true;
        }
    }
    
    handleTouchEnd(e) {
        e.preventDefault();
        // 重置所有触摸控制
        this.inputManager.keys['ArrowLeft'] = false;
        this.inputManager.keys['ArrowRight'] = false;
        this.inputManager.keys['ArrowUp'] = false;
        this.inputManager.keys[' '] = false;
    }
    
    startGame() {
        document.getElementById('gameStart').style.display = 'none';
        this.gameState = 'playing';
        this.score = 0;
        this.lives = 3;
        this.currentLevel = 1;
        this.updateUI();
        this.initLevel();
        this.audioManager.playBackgroundMusic();
        this.gameLoop();
    }
    
    restartGame() {
        document.getElementById('gameOver').style.display = 'none';
        // 重置游戏速度为默认值
        this.resetSpeed();
        this.startGame();
    }
    
    togglePause() {
        if (this.gameState === 'playing') {
            this.gameState = 'paused';
            document.getElementById('gamePaused').style.display = 'block';
            this.audioManager.pauseBackgroundMusic();
        } else if (this.gameState === 'paused') {
            this.gameState = 'playing';
            document.getElementById('gamePaused').style.display = 'none';
            this.audioManager.resumeBackgroundMusic();
            this.gameLoop();
        }
    }
    
    initLevel() {
        this.objectManager.initLevel(this.currentLevel);
        this.player.reset(100, 400);
        this.cameraX = 0;
    }
    
    updateUI() {
        document.getElementById('score').textContent = this.score.toLocaleString();
        document.getElementById('lives').textContent = this.lives;
        document.getElementById('level').textContent = this.currentLevel;
        
        // 使用国际化翻译函数显示武器类型
        const weaponTypeElement = document.getElementById('weaponType');
        if (weaponTypeElement && typeof translateWeaponType === 'function') {
            weaponTypeElement.textContent = translateWeaponType(this.player.weapon);
        } else {
            // 回退到默认显示
            weaponTypeElement.textContent = 
                this.player.weapon === 'normal' ? 'Normal' :
                this.player.weapon === 'spread' ? 'Spread' : 'Laser';
        }
        
        const powerUpIndicator = document.getElementById('powerUpIndicator');
        powerUpIndicator.style.display = this.player.weapon !== 'normal' ? 'block' : 'none';
        
        // 更新生命值条
        const healthFill = document.querySelector('.health-fill');
        if (healthFill) {
            const healthPercent = (this.lives / 5) * 100;
            healthFill.style.width = healthPercent + '%';
        }
        
        // 更新速度显示
        this.updateSpeedDisplay();
        
        // 显示最高分
        this.displayHighScore();
        
        // 更新存档菜单信息
        this.updateSaveMenuInfo();
    }
    
    // 显示最高分
    displayHighScore() {
        try {
            if (window.saveManager) {
                const highScore = window.saveManager.getHighestScore();
                const highScoreElement = document.getElementById('highScore');
                if (highScoreElement) {
                    highScoreElement.textContent = highScore.toLocaleString();
                }
            }
        } catch (error) {
            console.error('显示最高分失败:', error);
        }
    }
    
    // 更新存档菜单信息
    updateSaveMenuInfo() {
        try {
            if (!window.saveManager) return;
            
            const saves = window.saveManager.loadAllSaves();
            for (let slot = 0; slot < 4; slot++) {
                const infoElement = document.getElementById(`save-info-${slot}`);
                if (infoElement) {
                    const saveData = saves[slot];
                    if (saveData && saveData.timestamp) {
                        const date = new Date(saveData.timestamp);
                        const score = saveData.gameState?.score || 0;
                        const level = saveData.gameState?.level || 1;
                        infoElement.textContent = `${date.toLocaleDateString()} - ${score}分 - 第${level}关`;
                    } else {
                        infoElement.textContent = '空';
                    }
                }
            }
        } catch (error) {
            console.error('更新存档信息失败:', error);
        }
    }
    
    updateFPS(currentTime) {
        this.frameCount++;
        if (currentTime - this.lastFpsTime >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastFpsTime = currentTime;
            
            const fpsCounter = document.querySelector('.fps-counter');
            if (fpsCounter) {
                fpsCounter.textContent = `FPS: ${this.fps}`;
            }
        }
    }
    
    loseLife() {
        if (this.player.invulnerable > 0) return;
        
        this.lives--;
        this.player.invulnerable = 120;
        this.particleSystem.createExplosion(this.player.x + this.player.width / 2, 
                                          this.player.y + this.player.height / 2, '#ff0000');
        this.audioManager.playSound('playerHit');
        this.updateUI();
        
        if (this.lives <= 0) {
            this.gameOver();
        } else {
            this.player.reset(100, 400);
            this.updateUI();
        }
    }
    
    gameOver() {
        this.gameState = 'gameOver';
        document.getElementById('finalScore').textContent = this.score.toLocaleString();
        document.getElementById('finalLevel').textContent = this.currentLevel;
        document.getElementById('gameOver').style.display = 'block';
        
        // 保存最高分
        if (window.saveManager) {
            window.saveManager.saveHighScore(this.score);
        }
        
        this.audioManager.stopBackgroundMusic();
        this.audioManager.playSound('gameOver');
    }
    
    checkVictory() {
        if (this.objectManager.enemies.length === 0) {
            this.currentLevel++;
            this.score += 5000 * this.currentLevel;
            this.audioManager.playSound('levelComplete');
            this.updateUI();
            
            // 延迟进入下一关
            setTimeout(() => {
                this.initLevel();
            }, 2000);
        }
    }
    
    // 游戏速度控制方法
    increaseSpeed() {
        const speedConfig = this.config.get('game.speed');
        const newSpeed = Math.min(speedConfig.max, this.gameSpeedMultiplier + speedConfig.step);
        this.setGameSpeed(newSpeed);
    }
    
    decreaseSpeed() {
        const speedConfig = this.config.get('game.speed');
        const newSpeed = Math.max(speedConfig.min, this.gameSpeedMultiplier - speedConfig.step);
        this.setGameSpeed(newSpeed);
    }
    
    resetSpeed() {
        this.setGameSpeed(1.0);
    }
    
    setGameSpeed(multiplier) {
        const speedConfig = this.config.get('game.speed');
        this.gameSpeedMultiplier = Math.max(speedConfig.min, Math.min(speedConfig.max, multiplier));
        
        // 更新速度显示
        this.updateSpeedDisplay();
        
        // 保存到本地存储
        this.config.set('game.speed.multiplier', this.gameSpeedMultiplier);
        this.config.saveToLocalStorage();
    }
    
    updateSpeedDisplay() {
        const speedDisplay = document.getElementById('speed-display');
        if (speedDisplay) {
            // 确保gameSpeedMultiplier不为null
            if (this.gameSpeedMultiplier === null || this.gameSpeedMultiplier === undefined) {
                this.gameSpeedMultiplier = 1.0;
            }
            
            const texts = window.i18nTexts && window.i18nTexts[window.currentLanguage || 'en'];
            const speedText = texts ? texts.speedDisplay : (window.currentLanguage === 'zh' ? '游戏速度' : 'Game Speed');
            speedDisplay.textContent = `${speedText}: ${this.gameSpeedMultiplier.toFixed(2)}x`;
            
            // 根据速度调整显示颜色
            if (this.gameSpeedMultiplier < 1.0) {
                speedDisplay.style.color = '#4CAF50'; // 绿色表示慢速
            } else if (this.gameSpeedMultiplier > 1.0) {
                speedDisplay.style.color = '#FF9800'; // 橙色表示快速
            } else {
                speedDisplay.style.color = '#FFFFFF'; // 白色表示正常速度
            }
        }
    }
    
    update(deltaTime) {
        // 应用游戏速度倍率
        const adjustedDeltaTime = deltaTime * this.gameSpeedMultiplier;
        
        this.player.update(adjustedDeltaTime, this.objectManager.platforms, this.inputManager.keys, this);
        this.objectManager.update(adjustedDeltaTime, this.player, this);
        this.particleSystem.update(adjustedDeltaTime);
        this.checkVictory();
        
        // 更新相机
        this.cameraX = this.player.x - this.canvas.width / 2;
        this.cameraX = Math.max(0, Math.min(1200, this.cameraX));
    }
    
    render() {
        // 清空画布
        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.save();
        this.ctx.translate(-this.cameraX, 0);
        
        // 绘制背景
        this.renderBackground();
        
        // 绘制游戏对象
        this.objectManager.render(this.ctx, this.cameraX, this.canvas.width);
        this.player.render(this.ctx);
        this.particleSystem.render(this.ctx, this.cameraX, this.canvas.width);
        
        this.ctx.restore();
    }
    
    renderBackground() {
        const screenLeft = this.cameraX;
        const screenRight = this.cameraX + this.canvas.width;
        
        // 视差背景 - 使用视锥剔除
        this.ctx.fillStyle = '#16213e';
        for (let i = 0; i < 20; i++) {
            const x = i * 200 - this.cameraX * 0.3;
            const width = 100;
            // 精确视锥剔除
            if (x + width > -this.canvas.width * 0.3 && x < this.canvas.width * 1.3) {
                this.ctx.fillRect(x, 0, width, this.canvas.height);
            }
        }

        // 远景山脉 - 使用视锥剔除
        this.ctx.fillStyle = '#0f1419';
        for (let i = 0; i < 10; i++) {
            const x = i * 400 - this.cameraX * 0.1;
            const width = 400;
            const height = 100 + Math.sin(i) * 50;
            // 精确视锥剔除
            if (x + width > -this.canvas.width * 0.1 && x < this.canvas.width * 1.1) {
                this.ctx.fillRect(x, this.canvas.height - height, width, height);
            }
        }
    }
    
    gameLoop(currentTime = 0) {
        // 开始性能监控
        this.performanceMonitor.startFrame();
        
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;
        
        this.updateFPS(currentTime);
        
        if (this.gameState === 'playing') {
            this.update(deltaTime);
        }
        
        // 结束更新阶段
        this.performanceMonitor.endUpdate();
        
        this.render();
        
        // 结束渲染阶段
        this.performanceMonitor.endRender();
        
        // 更新对象计数
        if (this.objectManager) {
            this.performanceMonitor.updateObjectCounts(
                this.objectManager.bullets.length,
                this.objectManager.enemies.length,
                this.particleSystem.particles.filter(p => p.active).length
            );
        }
        
        // 结束帧监控
        this.performanceMonitor.endFrame();
        
        requestAnimationFrame((time) => this.gameLoop(time));
    }
}

// 玩家类
class Player {
    constructor(x, y, config = null) {
        this.x = x;
        this.y = y;
        
        // 使用配置或默认值
        if (config) {
            this.width = config.size.width;
            this.height = config.size.height;
            this.speed = config.speed;
            this.jumpPower = config.jumpPower;
            this.invulnerabilityTime = config.invulnerabilityTime;
            this.weaponDuration = config.weaponDuration;
        } else {
            this.width = 30;
            this.height = 40;
            this.speed = 5;
            this.jumpPower = 15;
            this.invulnerabilityTime = 120;
            this.weaponDuration = 1800;
        }
        
        this.velocityX = 0;
        this.velocityY = 0;
        this.onGround = false;
        this.facing = 1;
        this.weapon = 'normal';
        this.shootCooldown = 0;
        this.invulnerable = 0;
        this.hasJumped = false;
        this.weaponTimer = 0; // 武器持续时间
    }
    
    reset(x, y) {
        this.x = x;
        this.y = y;
        this.velocityX = 0;
        this.velocityY = 0;
        this.onGround = false;
        this.hasJumped = false;
        this.invulnerable = 0;
        this.weapon = 'normal';
        this.weaponTimer = 0;
    }
    
    update(deltaTime, platforms, keys, game) {
        // 移动
        if (keys['ArrowLeft']) {
            this.velocityX = -this.speed;
            this.facing = -1;
        } else if (keys['ArrowRight']) {
            this.velocityX = this.speed;
            this.facing = 1;
        } else {
            this.velocityX *= 0.8;
        }
        
        // 跳跃
        if (keys['ArrowUp'] && this.onGround && !this.hasJumped) {
            this.velocityY = -this.jumpPower;
            this.onGround = false;
            this.hasJumped = true;
            game.audioManager.playSound('jump');
        }
        
        // 射击
        if (keys[' '] && this.shootCooldown <= 0) {
            this.shoot(game);
            const cooldown = this.weapon === 'laser' ? 15 : 10;
            this.shootCooldown = cooldown;
        }
        
        // 更新位置
        this.x += this.velocityX;
        this.y += this.velocityY;
        
        // 重力
        this.velocityY += 0.8;
        this.velocityY = Math.min(this.velocityY, 20);
        
        // 平台碰撞
        this.handlePlatformCollisions(platforms);
        
        // 边界检测
        this.x = Math.max(0, Math.min(1900, this.x));
        if (this.y > game.canvas.height) {
            game.loseLife();
        }
        
        // 更新计时器
        if (this.shootCooldown > 0) this.shootCooldown--;
        if (this.invulnerable > 0) this.invulnerable--;
        
        // 武器计时器
        if (this.weapon !== 'normal') {
            this.weaponTimer--;
            if (this.weaponTimer <= 0) {
                this.weapon = 'normal';
                game.updateUI();
            }
        }
    }
    
    handlePlatformCollisions(platforms) {
        this.onGround = false;
        
        for (const platform of platforms) {
            if (this.checkCollision(platform)) {
                if (this.velocityY > 0 && this.y < platform.y) {
                    this.y = platform.y - this.height;
                    this.velocityY = 0;
                    this.onGround = true;
                    this.hasJumped = false;
                } else if (this.velocityY < 0 && this.y > platform.y) {
                    this.y = platform.y + platform.height;
                    this.velocityY = 0;
                } else if (this.velocityX > 0 && this.x < platform.x) {
                    this.x = platform.x - this.width;
                    this.velocityX = 0;
                } else if (this.velocityX < 0 && this.x > platform.x) {
                    this.x = platform.x + platform.width;
                    this.velocityX = 0;
                }
            }
        }
    }
    
    checkCollision(obj) {
        return this.x < obj.x + obj.width &&
               this.x + this.width > obj.x &&
               this.y < obj.y + obj.height &&
               this.y + this.height > obj.y;
    }
    
    shoot(game) {
        const bulletData = this.getBulletData();
        
        for (const data of bulletData) {
            const bullet = game.objectManager.getBullet();
            if (bullet) {
                Object.assign(bullet, data);
                game.objectManager.bullets.push(bullet);
            }
        }
        
        game.audioManager.playSound('shoot');
    }
    
    getBulletData() {
        const baseX = this.x + this.width / 2;
        const baseY = this.y + this.height / 2;
        
        switch (this.weapon) {
            case 'spread':
                return [
                    { x: baseX, y: baseY, width: 6, height: 6, velocityX: this.facing * 8, velocityY: -3, type: 'player', damage: 1 },
                    { x: baseX, y: baseY, width: 6, height: 6, velocityX: this.facing * 8, velocityY: 0, type: 'player', damage: 1 },
                    { x: baseX, y: baseY, width: 6, height: 6, velocityX: this.facing * 8, velocityY: 3, type: 'player', damage: 1 }
                ];
            case 'laser':
                return [{ x: baseX, y: baseY, width: 20, height: 3, velocityX: this.facing * 15, velocityY: 0, type: 'player', damage: 2 }];
            default:
                return [{ x: baseX, y: baseY, width: 8, height: 4, velocityX: this.facing * 10, velocityY: 0, type: 'player', damage: 1 }];
        }
    }
    
    collectPowerUp(type, game) {
        switch (type) {
            case 'spread':
                this.weapon = 'spread';
                this.weaponTimer = 1800; // 30秒
                break;
            case 'laser':
                this.weapon = 'laser';
                this.weaponTimer = 1800;
                break;
            case 'life':
                game.lives = Math.min(game.lives + 1, 5);
                break;
        }
        game.updateUI();
    }
    
    render(ctx) {
        if (this.invulnerable % 10 < 5) {
            // 玩家身体
            ctx.fillStyle = '#0066ff';
            ctx.fillRect(this.x, this.y, this.width, this.height);
            
            // 玩家细节
            ctx.fillStyle = '#0099ff';
            ctx.fillRect(this.x + 5, this.y + 5, this.width - 10, this.height - 10);
            
            // 武器
            ctx.fillStyle = this.weapon === 'laser' ? '#00ff00' : 
                           this.weapon === 'spread' ? '#ff6600' : '#666666';
            if (this.facing > 0) {
                ctx.fillRect(this.x + this.width - 5, this.y + 15, 15, 5);
            } else {
                ctx.fillRect(this.x - 10, this.y + 15, 15, 5);
            }
            
            // 眼睛
            ctx.fillStyle = '#ffffff';
            const eyeX = this.facing > 0 ? this.x + 20 : this.x + 5;
            ctx.fillRect(eyeX, this.y + 10, 5, 5);
        }
    }
}

// 对象管理器
class ObjectManager {
    constructor(config = null) {
        this.bullets = [];
        this.enemies = [];
        this.powerUps = [];
        this.platforms = [];
        
        // 对象池
        this.bulletPool = [];
        
        // 使用配置或默认值
        this.POOL_SIZE = config ? config.bullets : 100;
        this.maxParticles = config ? config.particles : 100;
    }
    
    initPools() {
        for (let i = 0; i < this.POOL_SIZE; i++) {
            this.bulletPool.push({
                active: false,
                x: 0, y: 0, width: 8, height: 4,
                velocityX: 0, velocityY: 0,
                type: 'player', damage: 1
            });
        }
    }
    
    getBullet() {
        for (const bullet of this.bulletPool) {
            if (!bullet.active) {
                bullet.active = true;
                return bullet;
            }
        }
        return null;
    }
    
    releaseBullet(bullet) {
        bullet.active = false;
    }
    
    initLevel(level) {
        // 清空对象
        this.bullets = [];
        this.enemies = [];
        this.powerUps = [];
        this.bulletPool.forEach(b => b.active = false);
        
        // 创建平台
        this.createPlatforms();
        
        // 创建敌人
        this.createEnemies(level);
        
        // 创建道具
        this.createPowerUps();
    }
    
    createPlatforms() {
        this.platforms = [
            { x: 0, y: 550, width: 2000, height: 50, type: 'ground' },
            { x: 300, y: 450, width: 150, height: 20, type: 'platform' },
            { x: 500, y: 350, width: 150, height: 20, type: 'platform' },
            { x: 700, y: 400, width: 100, height: 20, type: 'platform' },
            { x: 900, y: 300, width: 200, height: 20, type: 'platform' },
            { x: 1200, y: 450, width: 150, height: 20, type: 'platform' },
            { x: 1400, y: 350, width: 100, height: 20, type: 'platform' },
            { x: 1600, y: 400, width: 200, height: 20, type: 'platform' }
        ];
    }
    
    createEnemies(level) {
        const healthMultiplier = 1 + (level - 1) * 0.3;
        const speedMultiplier = 1 + (level - 1) * 0.2;
        
        this.enemies = [
            new Enemy(400, 500, 'soldier', healthMultiplier, speedMultiplier),
            new Enemy(600, 400, 'soldier', healthMultiplier, speedMultiplier),
            new Enemy(800, 500, 'soldier', healthMultiplier, speedMultiplier),
            new Enemy(1000, 250, 'turret', healthMultiplier, speedMultiplier),
            new Enemy(1300, 500, 'soldier', healthMultiplier, speedMultiplier),
            new Enemy(1500, 300, 'turret', healthMultiplier, speedMultiplier),
            new Enemy(1700, 500, 'boss', healthMultiplier, speedMultiplier)
        ];
    }
    
    createPowerUps() {
        this.powerUps = [
            { x: 550, y: 300, width: 20, height: 20, type: 'spread' },
            { x: 950, y: 250, width: 20, height: 20, type: 'laser' },
            { x: 1450, y: 300, width: 20, height: 20, type: 'life' }
        ];
    }
    
    update(deltaTime, player, game) {
        this.updateBullets(game);
        this.updateEnemies(player, game);
        this.updatePowerUps(player, game);
    }
    
    updateBullets(game) {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            bullet.x += bullet.velocityX;
            bullet.y += bullet.velocityY;
            
            // 移除超出边界的子弹
            if (bullet.x < -50 || bullet.x > 2050 || bullet.y < -50 || bullet.y > game.canvas.height + 50) {
                this.releaseBullet(bullet);
                this.bullets.splice(i, 1);
                continue;
            }
            
            // 碰撞检测
            this.handleBulletCollisions(bullet, i, game);
        }
    }
    
    handleBulletCollisions(bullet, index, game) {
        if (bullet.type === 'player') {
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const enemy = this.enemies[j];
                if (this.checkCollision(bullet, enemy)) {
                    enemy.takeDamage(bullet.damage, game);
                    game.particleSystem.createHitEffect(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);
                    this.releaseBullet(bullet);
                    this.bullets.splice(index, 1);
                    
                    if (enemy.health <= 0) {
                        const points = enemy.getPoints();
                        game.score += points * game.currentLevel;
                        game.particleSystem.createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ffff00');
                        game.audioManager.playSound('enemyDestroy');
                        this.enemies.splice(j, 1);
                        game.updateUI();
                    }
                    break;
                }
            }
        } else if (bullet.type === 'enemy' && game.player.invulnerable <= 0) {
            if (this.checkCollision(bullet, game.player)) {
                game.loseLife();
                this.releaseBullet(bullet);
                this.bullets.splice(index, 1);
            }
        }
    }
    
    updateEnemies(player, game) {
        for (const enemy of this.enemies) {
            enemy.update(player, this, game);
        }
    }
    
    updatePowerUps(player, game) {
        for (let i = this.powerUps.length - 1; i >= 0; i--) {
            const powerUp = this.powerUps[i];
            
            if (this.checkCollision(player, powerUp)) {
                player.collectPowerUp(powerUp.type, game);
                game.particleSystem.createPickupEffect(powerUp.x + powerUp.width / 2, powerUp.y + powerUp.height / 2);
                game.audioManager.playSound('powerUp');
                this.powerUps.splice(i, 1);
            }
        }
    }
    
    checkCollision(obj1, obj2) {
        return obj1.x < obj2.x + obj2.width &&
               obj1.x + obj1.width > obj2.x &&
               obj1.y < obj2.y + obj2.height &&
               obj1.y + obj1.height > obj2.y;
    }
    
    render(ctx, cameraX, canvasWidth) {
        this.renderPlatforms(ctx, cameraX, canvasWidth);
        this.renderPowerUps(ctx, cameraX, canvasWidth);
        this.renderEnemies(ctx, cameraX, canvasWidth);
        this.renderBullets(ctx, cameraX, canvasWidth);
    }
    
    renderPlatforms(ctx, cameraX, canvasWidth) {
        ctx.fillStyle = '#4a4a4a';
        const margin = 50; // 边界缓冲区
        const leftBound = cameraX - margin;
        const rightBound = cameraX + canvasWidth + margin;
        
        for (const platform of this.platforms) {
            if (platform.x + platform.width > leftBound && platform.x < rightBound) {
                ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
                ctx.fillStyle = '#6a6a6a';
                ctx.fillRect(platform.x, platform.y, platform.width, 5);
                ctx.fillStyle = '#4a4a4a';
            }
        }
    }
    
    renderPowerUps(ctx, cameraX, canvasWidth) {
        const margin = 30;
        const leftBound = cameraX - margin;
        const rightBound = cameraX + canvasWidth + margin;
        
        for (const powerUp of this.powerUps) {
            if (powerUp.x + powerUp.width > leftBound && powerUp.x < rightBound) {
                ctx.save();
                ctx.translate(powerUp.x + powerUp.width / 2, powerUp.y + powerUp.height / 2);
                ctx.rotate(Date.now() * 0.002);
                
                const colors = {
                    'spread': ['#ff6600', '#ffaa00'],
                    'laser': ['#00ff00', '#66ff66'],
                    'life': ['#ff0000', '#ff6666']
                };
                
                const [outer, inner] = colors[powerUp.type] || ['#ffffff', '#cccccc'];
                ctx.fillStyle = outer;
                ctx.fillRect(-10, -10, 20, 20);
                ctx.fillStyle = inner;
                ctx.fillRect(-8, -8, 16, 16);
                
                ctx.restore();
            }
        }
    }
    
    renderEnemies(ctx, cameraX, canvasWidth) {
        const margin = 100; // 敌人需要更大的边界缓冲区
        const leftBound = cameraX - margin;
        const rightBound = cameraX + canvasWidth + margin;
        
        for (const enemy of this.enemies) {
            if (enemy.x + enemy.width > leftBound && enemy.x < rightBound) {
                enemy.render(ctx);
            }
        }
    }
    
    renderBullets(ctx, cameraX, canvasWidth) {
        const margin = 20;
        const leftBound = cameraX - margin;
        const rightBound = cameraX + canvasWidth + margin;
        
        for (const bullet of this.bullets) {
            if (bullet.x + bullet.width > leftBound && bullet.x < rightBound) {
                if (bullet.type === 'player') {
                    ctx.fillStyle = bullet.width > 10 ? '#00ff00' : '#ffff00';
                    ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
                    
                    if (bullet.width > 10) {
                        ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
                        ctx.fillRect(bullet.x - 2, bullet.y - 2, bullet.width + 4, bullet.height + 4);
                    }
                } else {
                    ctx.fillStyle = '#ff6600';
                    ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
                }
            }
        }
    }
}

// 敌人类
class Enemy {
    constructor(x, y, type, healthMultiplier = 1, speedMultiplier = 1) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.direction = Math.random() > 0.5 ? 1 : -1;
        this.shootTimer = 0;
        this.moveTimer = 0;
        this.pattern = 0;
        
        this.setTypeProperties(healthMultiplier, speedMultiplier);
    }
    
    setTypeProperties(healthMultiplier, speedMultiplier) {
        // 获取配置，如果没有配置则使用默认值
        const config = window.gameConfig ? window.gameConfig.get('enemies') : null;
        
        switch (this.type) {
            case 'soldier':
                const soldierConfig = config ? config.soldier : {};
                this.width = soldierConfig.size ? soldierConfig.size.width : 30;
                this.height = soldierConfig.size ? soldierConfig.size.height : 30;
                this.health = Math.floor((soldierConfig.health || 1) * healthMultiplier);
                this.speed = (soldierConfig.speed || 1) * speedMultiplier;
                this.shootCooldown = soldierConfig.shootCooldown || 180;
                this.bulletSpeed = soldierConfig.bulletSpeed || 3;
                this.points = soldierConfig.points || 100;
                break;
            case 'turret':
                const turretConfig = config ? config.turret : {};
                this.width = turretConfig.size ? turretConfig.size.width : 40;
                this.height = turretConfig.size ? turretConfig.size.height : 40;
                this.health = Math.floor((turretConfig.health || 3) * healthMultiplier);
                this.speed = 0;
                this.shootCooldown = turretConfig.shootCooldown || 120;
                this.bulletSpeed = turretConfig.bulletSpeed || 4;
                this.points = turretConfig.points || 200;
                break;
            case 'boss':
                const bossConfig = config ? config.boss : {};
                this.width = bossConfig.size ? bossConfig.size.width : 50;
                this.height = bossConfig.size ? bossConfig.size.height : 50;
                this.health = Math.floor((bossConfig.health || 10) * healthMultiplier);
                this.maxHealth = this.health;
                this.speed = (bossConfig.speed || 0.5) * speedMultiplier;
                this.shootCooldown = bossConfig.shootCooldown || 90;
                this.bulletSpeed = bossConfig.bulletSpeed || 3;
                this.bulletSpeedFast = bossConfig.bulletSpeedFast || 4;
                this.points = bossConfig.points || 1000;
                this.moveTimer = bossConfig.moveTimer || 120;
                break;
        }
    }
    
    takeDamage(damage, game) {
        this.health -= damage;
        game.audioManager.playSound('enemyHit');
    }
    
    getPoints() {
        switch (this.type) {
            case 'boss': return 1000;
            case 'turret': return 200;
            default: return 100;
        }
    }
    
    update(player, objectManager, game) {
        switch (this.type) {
            case 'soldier':
                this.updateSoldier(player, objectManager, game);
                break;
            case 'turret':
                this.updateTurret(player, objectManager, game);
                break;
            case 'boss':
                this.updateBoss(player, objectManager, game);
                break;
        }
    }
    
    updateSoldier(player, objectManager, game) {
        this.x += this.direction * this.speed;
        
        // 边界和平台检测
        let onPlatform = false;
        for (const platform of objectManager.platforms) {
            if (this.x + this.width > platform.x && 
                this.x < platform.x + platform.width &&
                this.y + this.height >= platform.y &&
                this.y + this.height <= platform.y + 10) {
                onPlatform = true;
                break;
            }
        }
        
        if (!onPlatform || this.x <= 0 || this.x >= 1900) {
            this.direction *= -1;
        }
        
        // 射击
        this.shootTimer++;
        if (this.shootTimer > this.shootCooldown && Math.abs(player.x - this.x) < 300) {
            this.shoot(objectManager, -this.direction * this.bulletSpeed, 0);
            this.shootTimer = 0;
        }
    }
    
    updateTurret(player, objectManager, game) {
        this.shootTimer++;
        if (this.shootTimer > this.shootCooldown) {
            const angle = Math.atan2(player.y - this.y, player.x - this.x);
            this.shoot(objectManager, Math.cos(angle) * this.bulletSpeed, Math.sin(angle) * this.bulletSpeed);
            this.shootTimer = 0;
        }
    }
    
    updateBoss(player, objectManager, game) {
        this.shootTimer++;
        this.moveTimer++;
        
        // Boss移动
        if (this.moveTimer > 120) {
            this.y += (Math.random() - 0.5) * 50;
            this.y = Math.max(200, Math.min(500, this.y));
            this.moveTimer = 0;
        }
        
        if (this.shootTimer > this.shootCooldown) {
            if (this.pattern === 0) {
                // 扇形射击
                for (let i = -2; i <= 2; i++) {
                    const angle = Math.atan2(player.y - this.y, player.x - this.x) + i * 0.3;
                    this.shoot(objectManager, Math.cos(angle) * this.bulletSpeed, Math.sin(angle) * this.bulletSpeed, 10);
                }
            } else {
                // 追踪弹
                const angle = Math.atan2(player.y - this.y, player.x - this.x);
                this.shoot(objectManager, Math.cos(angle) * this.bulletSpeedFast, Math.sin(angle) * this.bulletSpeedFast, 12);
            }
            this.pattern = (this.pattern + 1) % 2;
            this.shootTimer = 0;
        }
    }
    
    shoot(objectManager, velocityX, velocityY, size = 6) {
        const bullet = objectManager.getBullet();
        if (bullet) {
            bullet.x = this.x + this.width / 2;
            bullet.y = this.y + this.height / 2;
            bullet.width = size;
            bullet.height = size;
            bullet.velocityX = velocityX;
            bullet.velocityY = velocityY;
            bullet.type = 'enemy';
            objectManager.bullets.push(bullet);
        }
    }
    
    render(ctx) {
        switch (this.type) {
            case 'soldier':
                this.renderSoldier(ctx);
                break;
            case 'turret':
                this.renderTurret(ctx);
                break;
            case 'boss':
                this.renderBoss(ctx);
                break;
        }
    }
    
    renderSoldier(ctx) {
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.fillStyle = '#aa0000';
        ctx.fillRect(this.x + 5, this.y + 5, this.width - 10, this.height - 10);
        
        ctx.fillStyle = '#ffff00';
        const eyeX = this.direction > 0 ? this.x + 20 : this.x + 5;
        ctx.fillRect(eyeX, this.y + 10, 5, 5);
    }
    
    renderTurret(ctx) {
        ctx.fillStyle = '#880000';
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.fillStyle = '#aa0000';
        ctx.fillRect(this.x + 5, this.y + 5, this.width - 10, this.height - 10);
    }
    
    renderBoss(ctx) {
        ctx.fillStyle = '#ff0066';
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.fillStyle = '#ff3399';
        ctx.fillRect(this.x + 5, this.y + 5, this.width - 10, this.height - 10);
        
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(this.x + 10, this.y + 10, 10, 10);
        ctx.fillRect(this.x + 30, this.y + 10, 10, 10);
        
        // 生命值条
        if (this.maxHealth) {
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(this.x, this.y - 15, this.width, 8);
            ctx.fillStyle = '#00ff00';
            const healthPercent = this.health / this.maxHealth;
            ctx.fillRect(this.x, this.y - 15, this.width * healthPercent, 8);
        }
    }
}

// 输入管理器
class InputManager {
    constructor(config = null) {
        this.keys = {};
        
        // 使用配置或默认键位映射
        if (config && config.keyboard) {
            this.keyMap = config.keyboard;
        } else {
            this.keyMap = {
                left: "ArrowLeft",
                right: "ArrowRight",
                jump: "ArrowUp",
                shoot: "Space",
                pause: "KeyP"
            };
        }
        
        this.touchConfig = config ? config.touch : { enabled: true, sensitivity: 1.0 };
    }
    
    handleKeyDown(e, game) {
        this.keys[e.key] = true;
        
        if (e.key === 'p' || e.key === 'P') {
            e.preventDefault();
            if (game.gameState === 'playing' || game.gameState === 'paused') {
                game.togglePause();
            }
        }
        
        if (e.key === ' ') e.preventDefault();
    }
    
    handleKeyUp(e) {
        this.keys[e.key] = false;
    }
}

// 音频管理器
class AudioManager {
    constructor(config = null) {
        this.sounds = {};
        this.backgroundMusic = null;
        
        // 使用配置或默认值
        if (config) {
            this.enabled = config.enabled;
            this.masterVolume = config.masterVolume;
            this.sfxVolume = config.sfxVolume;
            this.musicVolume = config.musicVolume;
        } else {
            this.enabled = true;
            this.masterVolume = 0.7;
            this.sfxVolume = 0.8;
            this.musicVolume = 0.6;
        }
        
        this.initSounds();
    }
    
    initSounds() {
        // 创建音频上下文
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.createSounds();
        } catch (e) {
            console.warn('Web Audio API not supported');
            this.enabled = false;
        }
    }
    
    createSounds() {
        // 使用Web Audio API创建程序化音效
        this.sounds = {
            shoot: () => this.createTone(800, 0.1, 'square'),
            jump: () => this.createTone(400, 0.2, 'sine'),
            enemyHit: () => this.createTone(200, 0.1, 'sawtooth'),
            enemyDestroy: () => this.createTone(150, 0.3, 'triangle'),
            powerUp: () => this.createTone(600, 0.2, 'sine'),
            playerHit: () => this.createTone(100, 0.5, 'sawtooth'),
            levelComplete: () => this.createMelody([523, 659, 784], 0.3),
            gameOver: () => this.createMelody([392, 349, 294], 0.5)
        };
    }
    
    createTone(frequency, duration, type = 'sine') {
        if (!this.enabled || !this.audioContext) return;
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
        oscillator.type = type;
        
        gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + duration);
    }
    
    createMelody(frequencies, noteDuration) {
        if (!this.enabled || !this.audioContext) return;
        
        frequencies.forEach((freq, index) => {
            setTimeout(() => {
                this.createTone(freq, noteDuration);
            }, index * noteDuration * 1000);
        });
    }
    
    playSound(soundName) {
        if (this.sounds[soundName]) {
            this.sounds[soundName]();
        }
    }
    
    playBackgroundMusic() {
        // 简单的背景音乐循环
        if (!this.enabled || !this.audioContext) return;
        
        const playLoop = () => {
            if (this.backgroundMusic) {
                const melody = [523, 659, 784, 659, 523, 440, 523];
                melody.forEach((freq, index) => {
                    setTimeout(() => {
                        this.createTone(freq, 0.5, 'triangle');
                    }, index * 500);
                });
                
                setTimeout(playLoop, melody.length * 500 + 1000);
            }
        };
        
        this.backgroundMusic = true;
        playLoop();
    }
    
    stopBackgroundMusic() {
        this.backgroundMusic = false;
    }
    
    pauseBackgroundMusic() {
        this.backgroundMusic = false;
    }
    
    resumeBackgroundMusic() {
        this.playBackgroundMusic();
    }
}

// 粒子系统
class ParticleSystem {
    constructor(maxParticles = 200) {
        this.particles = [];
        this.particlePool = [];
        this.POOL_SIZE = maxParticles;
        this.initPool();
    }
    
    initPool() {
        for (let i = 0; i < this.POOL_SIZE; i++) {
            this.particlePool.push({
                active: false,
                x: 0, y: 0,
                velocityX: 0, velocityY: 0,
                life: 0, maxLife: 0,
                color: '#fff',
                size: 2
            });
        }
    }
    
    getParticle() {
        for (const particle of this.particlePool) {
            if (!particle.active) {
                particle.active = true;
                return particle;
            }
        }
        return null;
    }
    
    releaseParticle(particle) {
        particle.active = false;
    }
    
    createExplosion(x, y, color = '#ff0000') {
        for (let i = 0; i < 12; i++) {
            const particle = this.getParticle();
            if (particle) {
                particle.x = x;
                particle.y = y;
                particle.velocityX = (Math.random() - 0.5) * 8;
                particle.velocityY = (Math.random() - 0.5) * 8;
                particle.life = 30;
                particle.maxLife = 30;
                particle.color = color;
                particle.size = 3;
                this.particles.push(particle);
            }
        }
    }
    
    createHitEffect(x, y) {
        for (let i = 0; i < 6; i++) {
            const particle = this.getParticle();
            if (particle) {
                particle.x = x;
                particle.y = y;
                particle.velocityX = (Math.random() - 0.5) * 4;
                particle.velocityY = (Math.random() - 0.5) * 4;
                particle.life = 15;
                particle.maxLife = 15;
                particle.color = '#ff6600';
                particle.size = 2;
                this.particles.push(particle);
            }
        }
    }
    
    createPickupEffect(x, y) {
        for (let i = 0; i < 8; i++) {
            const particle = this.getParticle();
            if (particle) {
                particle.x = x;
                particle.y = y;
                particle.velocityX = (Math.random() - 0.5) * 3;
                particle.velocityY = -Math.random() * 5;
                particle.life = 25;
                particle.maxLife = 25;
                particle.color = '#00ff00';
                particle.size = 2;
                this.particles.push(particle);
            }
        }
    }
    
    update(deltaTime) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            particle.x += particle.velocityX;
            particle.y += particle.velocityY;
            particle.velocityY += 0.2; // 重力
            particle.life--;
            
            if (particle.life <= 0) {
                this.releaseParticle(particle);
                this.particles.splice(i, 1);
            }
        }
    }
    
    render(ctx, cameraX, canvasWidth) {
        for (const particle of this.particles) {
            if (particle.x > cameraX - 50 && particle.x < cameraX + canvasWidth + 50) {
                ctx.fillStyle = particle.color;
                ctx.globalAlpha = particle.life / particle.maxLife;
                ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, 
                           particle.size, particle.size);
                ctx.globalAlpha = 1;
            }
        }
    }
}

// 全局函数
function startGame() {
    window.game.startGame();
}

function restartGame() {
    window.game.restartGame();
}

// 初始化游戏
window.addEventListener('load', () => {
    window.game = new ContraGame();
});