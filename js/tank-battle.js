// 国际化语言支持
const LANGUAGES = {
    zh: {
        // 游戏界面
        lives: '生命',
        score: '分数',
        level: '关卡',
        enemies: '敌人',
        weapon: '武器',
        ammo: '弹药',
        
        // 控制说明
        controls: 'WASD: 移动 | 空格: 射击 | P: 暂停<br>1-3: 切换武器 | R: 重新开始 | L: 切换语言',
        
        // 武器名称
        weapons: {
            normal: '普通弹',
            rapid: '速射弹',
            heavy: '重型弹'
        },
        
        // 游戏状态
        gameOver: '游戏结束',
        victory: '恭喜通关!',
        paused: '游戏暂停',
        
        // 游戏信息
        finalScore: '最终分数',
        reachedLevel: '到达关卡',
        restartHint: '按 R 重新开始',
        victoryMessage: '你是真正的坦克英雄!',
        restartChallenge: '按 R 重新挑战',
        continueHint: '按 P 继续游戏',
        
        // 道具图标
        powerUpIcons: {
            health: '❤',
            weapon: '🔫',
            shield: '🛡',
            speed: '⚡'
        }
    },
    en: {
        // Game Interface
        lives: 'Lives',
        score: 'Score',
        level: 'Level',
        enemies: 'Enemies',
        weapon: 'Weapon',
        ammo: 'Ammo',
        
        // Controls
        controls: 'WASD: Move | Space: Shoot | P: Pause<br>1-3: Switch Weapon | R: Restart | L: Language',
        
        // Weapon Names
        weapons: {
            normal: 'Normal',
            rapid: 'Rapid Fire',
            heavy: 'Heavy'
        },
        
        // Game States
        gameOver: 'Game Over',
        victory: 'Victory!',
        paused: 'Paused',
        
        // Game Messages
        finalScore: 'Final Score',
        reachedLevel: 'Reached Level',
        restartHint: 'Press R to Restart',
        victoryMessage: 'You are a true tank hero!',
        restartChallenge: 'Press R to Play Again',
        continueHint: 'Press P to Continue',
        
        // Power-up Icons
        powerUpIcons: {
            health: '❤',
            weapon: '🔫',
            shield: '🛡',
            speed: '⚡'
        }
    }
};

// 当前语言设置 - 根据浏览器语言自动选择
function detectBrowserLanguage() {
    const browserLang = navigator.language || navigator.userLanguage;
    return browserLang.startsWith('zh') ? 'zh' : 'en';
}

let currentLanguage = localStorage.getItem('tankBattleLanguage') || detectBrowserLanguage();

// 翻译函数
function t(key) {
    const keys = key.split('.');
    let value = LANGUAGES[currentLanguage];
    for (const k of keys) {
        value = value?.[k];
    }
    return value || key;
}

// 切换语言函数
function switchLanguage() {
    currentLanguage = currentLanguage === 'zh' ? 'en' : 'zh';
    localStorage.setItem('tankBattleLanguage', currentLanguage);
    updateUILabels();
}

// 更新UI标签文本
function updateUILabels() {
    document.getElementById('livesLabel').textContent = t('lives');
    document.getElementById('scoreLabel').textContent = t('score');
    document.getElementById('levelLabel').textContent = t('level');
    document.getElementById('enemiesLabel').textContent = t('enemies');
    document.getElementById('weaponLabel').textContent = t('weapon');
    document.getElementById('ammoLabel').textContent = t('ammo');
    document.getElementById('controlsText').innerHTML = t('controls');
}

// 游戏配置常量
const CONFIG = {
    CANVAS_WIDTH: 800,
    CANVAS_HEIGHT: 600,
    TANK_SIZE: 30,
    BULLET_SIZE: 4,
    WALL_SIZE: 20,
    PLAYER_SPEED: 2.5,
    ENEMY_SPEED: 1.5,
    BULLET_SPEED: 6,
    SHOOT_COOLDOWN: 250,
    ENEMY_SHOOT_COOLDOWN: 1500,
    MAX_LEVEL: 10,
    PARTICLE_COUNT: 15
};

// 武器类型
const WEAPONS = {
    NORMAL: { nameKey: 'weapons.normal', damage: 1, speed: 6, cooldown: 250, ammo: Infinity, color: '#ffff00' },
    RAPID: { nameKey: 'weapons.rapid', damage: 1, speed: 7, cooldown: 150, ammo: 50, color: '#ff8800' },
    HEAVY: { nameKey: 'weapons.heavy', damage: 3, speed: 4, cooldown: 500, ammo: 20, color: '#ff0000' }
};

// 获取武器名称的函数
function getWeaponName(weapon) {
    return t(weapon.nameKey);
}

// 粒子系统
class Particle {
    constructor(x, y, color = '#ffaa00') {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 8;
        this.vy = (Math.random() - 0.5) * 8;
        this.life = 1.0;
        this.decay = 0.02 + Math.random() * 0.03;
        this.size = 2 + Math.random() * 3;
        this.color = color;
    }

    update(dt = 1) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vx *= Math.pow(0.98, dt);
        this.vy *= Math.pow(0.98, dt);
        this.life -= this.decay * dt;
        this.size *= Math.pow(0.99, dt);
        return this.life > 0;
    }

    render(ctx) {
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// 道具类
class PowerUp {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.width = 20;
        this.height = 20;
        this.type = type; // 'health', 'weapon', 'shield', 'speed'
        this.collected = false;
        this.bobOffset = Math.random() * Math.PI * 2;
        this.time = 0;
    }

    update(dt = 1) {
        this.time += 0.1 * dt;
    }

    render(ctx) {
        const bobY = this.y + Math.sin(this.time + this.bobOffset) * 2;
        
        ctx.save();
        ctx.fillStyle = this.getColor();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        
        ctx.fillRect(this.x, bobY, this.width, this.height);
        ctx.strokeRect(this.x, bobY, this.width, this.height);
        
        // 绘制图标
        ctx.fillStyle = '#fff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.getIcon(), this.x + this.width/2, bobY + this.height/2 + 4);
        
        ctx.restore();
    }

    getColor() {
        switch(this.type) {
            case 'health': return '#ff4444';
            case 'weapon': return '#4444ff';
            case 'shield': return '#44ff44';
            case 'speed': return '#ffff44';
            default: return '#888';
        }
    }

    getIcon() {
        return t(`powerUpIcons.${this.type}`) || '?';
    }
}

// 子弹类
class Bullet {
    constructor(x, y, direction, weapon, isPlayer = false) {
        this.x = x;
        this.y = y;
        this.width = CONFIG.BULLET_SIZE;
        this.height = CONFIG.BULLET_SIZE;
        this.direction = direction;
        this.speed = weapon.speed;
        this.damage = weapon.damage;
        this.isPlayer = isPlayer;
        this.color = weapon.color;
        this.trail = [];
    }

    update(dt = 1) {
        // 记录轨迹
        this.trail.push({x: this.x, y: this.y});
        if (this.trail.length > 5) this.trail.shift();

        // 移动子弹
        switch (this.direction) {
            case 0: this.y -= this.speed * dt; break;
            case 1: this.x += this.speed * dt; break;
            case 2: this.y += this.speed * dt; break;
            case 3: this.x -= this.speed * dt; break;
        }

        // 检查边界
        return this.x >= 0 && this.x < CONFIG.CANVAS_WIDTH &&
               this.y >= 0 && this.y < CONFIG.CANVAS_HEIGHT;
    }

    render(ctx) {
        // 绘制轨迹
        ctx.save();
        this.trail.forEach((point, index) => {
            ctx.globalAlpha = (index + 1) / this.trail.length * 0.5;
            ctx.fillStyle = this.color;
            ctx.fillRect(point.x, point.y, this.width * 0.7, this.height * 0.7);
        });
         ctx.restore();

        // 绘制子弹
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        // 添加发光效果
        ctx.save();
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 8;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.restore();
    }
}

// 坦克类
class Tank {
    constructor(x, y, isPlayer = false) {
        this.x = x;
        this.y = y;
        this.width = CONFIG.TANK_SIZE;
        this.height = CONFIG.TANK_SIZE;
        this.direction = 0;
        this.speed = isPlayer ? CONFIG.PLAYER_SPEED : CONFIG.ENEMY_SPEED;
        this.isPlayer = isPlayer;
        this.health = isPlayer ? 3 : 1;
        this.maxHealth = this.health;
        this.lastShot = 0;
        this.weapon = WEAPONS.NORMAL;
        this.ammo = {};
        this.shield = 0;
        this.speedBoost = 0;
        this.invulnerable = 0;
        
        // AI相关
        this.lastDirectionChange = 0;
        this.targetX = x;
        this.targetY = y;
        this.pathfindingCooldown = 0;
        this.positionHistory = [];
        this.stuckCounter = 0;
        this.lastPosition = {x: x, y: y};
        
        // 初始化弹药
        Object.keys(WEAPONS).forEach(key => {
            this.ammo[key] = WEAPONS[key].ammo;
        });
    }

    update(game, dt = 1) {
        if (this.invulnerable > 0) this.invulnerable -= dt;
        if (this.shield > 0) this.shield -= dt;
        if (this.speedBoost > 0) this.speedBoost -= dt;

        if (!this.isPlayer) {
            this.updateAI(game, dt);
        }
    }

    updateAI(game, dt = 1) {
        const now = Date.now();
        
        // 检测是否卡住
        const currentPos = {x: this.x, y: this.y};
        const distanceMoved = Math.sqrt(
            Math.pow(currentPos.x - this.lastPosition.x, 2) + 
            Math.pow(currentPos.y - this.lastPosition.y, 2)
        );
        
        if (distanceMoved < 1) {
            this.stuckCounter++;
        } else {
            this.stuckCounter = 0;
            this.lastPosition = currentPos;
        }
        
        // 如果卡住超过30帧，使用智能分散策略
        if (this.stuckCounter > 30) {
            // 检查是否有其他坦克太近
            const nearbyEnemies = game.enemies.filter(e => {
                if (e === this) return false;
                const dist = Math.sqrt((e.x - this.x) ** 2 + (e.y - this.y) ** 2);
                return dist < this.width * 2.5;
            });
            
            if (nearbyEnemies.length > 0) {
                // 如果有坦克太近，使用智能避让
                this.direction = this.calculateAvoidanceDirection(nearbyEnemies[0], game);
            } else {
                // 否则随机选择方向
                this.direction = Math.floor(Math.random() * 4);
            }
            
            this.lastDirectionChange = now;
            this.stuckCounter = 0;
            
            // 强制移动以脱困，移动距离更大
            const moveDistance = this.speed * 3;
            let newX = this.x, newY = this.y;
            
            switch (this.direction) {
                case 0: newY -= moveDistance; break;
                case 1: newX += moveDistance; break;
                case 2: newY += moveDistance; break;
                case 3: newX -= moveDistance; break;
            }
            
            // 确保不会移出边界
            if (newX >= 0 && newX + this.width <= game.width && 
                newY >= 0 && newY + this.height <= game.height) {
                this.x = newX;
                this.y = newY;
            }
        }
        
        // 智能路径寻找
        if (now - this.pathfindingCooldown > 1000) {
            this.findPathToPlayer(game.player);
            this.pathfindingCooldown = now;
        }

        // 移动逻辑
        if (now - this.lastDirectionChange > 1500) {
            const dx = game.player.x - this.x;
            const dy = game.player.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // 如果距离玩家太近，尝试保持距离
            if (distance < 100) {
                if (Math.abs(dx) > Math.abs(dy)) {
                    this.direction = dx > 0 ? 3 : 1; // 远离玩家
                } else {
                    this.direction = dy > 0 ? 0 : 2;
                }
            } else {
                // 朝向玩家移动
                if (Math.abs(dx) > Math.abs(dy)) {
                    this.direction = dx > 0 ? 1 : 3;
                } else {
                    this.direction = dy > 0 ? 2 : 0;
                }
            }
            
            this.lastDirectionChange = now;
        }

        // 移动
        const oldX = this.x;
        const oldY = this.y;
        const currentSpeed = this.speedBoost > 0 ? this.speed * 1.5 : this.speed;

        switch (this.direction) {
            case 0: this.y -= currentSpeed * dt; break;
            case 1: this.x += currentSpeed * dt; break;
            case 2: this.y += currentSpeed * dt; break;
            case 3: this.x -= currentSpeed * dt; break;
        }

        // 检查碰撞
        const wallCollision = game.checkCollision(this, game.walls);
        const enemyCollision = game.checkCollision(this, game.enemies.filter(e => e !== this));
        
        if (wallCollision || enemyCollision) {
            this.x = oldX;
            this.y = oldY;
            
            // 智能避让逻辑
            if (enemyCollision) {
                // 找到碰撞的敌方坦克
                const collidingEnemy = game.enemies.find(e => 
                    e !== this && game.checkCollision(this, [e])
                );
                
                if (collidingEnemy) {
                    // 计算避让方向
                    const avoidDirection = this.calculateAvoidanceDirection(collidingEnemy, game);
                    this.direction = avoidDirection;
                    
                    // 增加强制分散机制
                    const separationDistance = this.speed * 2;
                    let separationX = 0, separationY = 0;
                    
                    switch (avoidDirection) {
                        case 0: separationY = -separationDistance; break;
                        case 1: separationX = separationDistance; break;
                        case 2: separationY = separationDistance; break;
                        case 3: separationX = -separationDistance; break;
                    }
                    
                    // 尝试强制分离
                    const newX = this.x + separationX;
                    const newY = this.y + separationY;
                    
                    if (newX >= 0 && newX + this.width <= game.width && 
                        newY >= 0 && newY + this.height <= game.height &&
                        !game.checkCollision({x: newX, y: newY, width: this.width, height: this.height}, game.walls)) {
                        this.x = newX;
                        this.y = newY;
                    }
                } else {
                    // 如果没找到具体碰撞对象，随机选择
                    this.direction = Math.floor(Math.random() * 4);
                }
            } else {
                // 墙壁碰撞，选择远离墙壁的方向
                this.direction = this.calculateWallAvoidanceDirection(game);
            }
            
            this.lastDirectionChange = now;
        }

        // 智能射击
        if (now - this.lastShot > CONFIG.ENEMY_SHOOT_COOLDOWN) {
            if (this.canShootPlayer(game.player, game.walls)) {
                game.shoot(this);
                this.lastShot = now;
            }
        }
    }

    findPathToPlayer(player) {
        // 简单的A*路径寻找逻辑
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        
        this.targetX = player.x;
        this.targetY = player.y;
    }
    
    calculateAvoidanceDirection(collidingEnemy, game) {
        // 计算与碰撞坦克的相对位置
        const dx = this.x - collidingEnemy.x;
        const dy = this.y - collidingEnemy.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // 如果距离太近，强制分散
        if (distance < this.width) {
            // 计算所有附近敌人的重心，远离重心
            const nearbyEnemies = game.enemies.filter(e => {
                if (e === this) return false;
                const dist = Math.sqrt((e.x - this.x) ** 2 + (e.y - this.y) ** 2);
                return dist < this.width * 3;
            });
            
            if (nearbyEnemies.length > 0) {
                let centerX = 0, centerY = 0;
                nearbyEnemies.forEach(e => {
                    centerX += e.x;
                    centerY += e.y;
                });
                centerX /= nearbyEnemies.length;
                centerY /= nearbyEnemies.length;
                
                const escapeX = this.x - centerX;
                const escapeY = this.y - centerY;
                
                // 选择远离重心的方向
                if (Math.abs(escapeX) > Math.abs(escapeY)) {
                    return escapeX > 0 ? 1 : 3; // 右或左
                } else {
                    return escapeY > 0 ? 2 : 0; // 下或上
                }
            }
        }
        
        // 生成可能的避让方向（优先选择远离碰撞坦克的方向）
        let possibleDirections = [];
        
        if (Math.abs(dx) > Math.abs(dy)) {
            // 水平方向避让优先
            if (dx > 0) {
                possibleDirections = [1, 0, 2, 3]; // 右、上、下、左
            } else {
                possibleDirections = [3, 0, 2, 1]; // 左、上、下、右
            }
        } else {
            // 垂直方向避让优先
            if (dy > 0) {
                possibleDirections = [2, 1, 3, 0]; // 下、右、左、上
            } else {
                possibleDirections = [0, 1, 3, 2]; // 上、右、左、下
            }
        }
        
        // 检查每个方向的安全性，并计算分数
        let bestDirection = -1;
        let bestScore = -1;
        
        for (let direction of possibleDirections) {
            let newX = this.x, newY = this.y;
            
            // 模拟移动
            switch (direction) {
                case 0: newY -= this.speed * 3; break;
                case 1: newX += this.speed * 3; break;
                case 2: newY += this.speed * 3; break;
                case 3: newX -= this.speed * 3; break;
            }
            
            const testTank = {x: newX, y: newY, width: this.width, height: this.height};
            
            // 检查边界
            if (newX < 0 || newX + this.width > game.width || 
                newY < 0 || newY + this.height > game.height) {
                continue;
            }
            
            // 检查墙壁碰撞
            if (game.checkCollision(testTank, game.walls)) {
                continue;
            }
            
            // 计算这个方向的安全分数
            let score = 100;
            
            // 检查与其他坦克的距离
            game.enemies.forEach(enemy => {
                if (enemy === this) return;
                const dist = Math.sqrt((enemy.x - newX) ** 2 + (enemy.y - newY) ** 2);
                if (dist < this.width * 2) {
                    score -= 50; // 距离太近扣分
                } else if (dist < this.width * 4) {
                    score -= 20; // 距离较近扣分
                } else {
                    score += 10; // 距离合适加分
                }
            });
            
            // 远离玩家的方向加分
            const playerDist = Math.sqrt((game.player.x - newX) ** 2 + (game.player.y - newY) ** 2);
            if (playerDist > 150) {
                score += 20;
            }
            
            if (score > bestScore) {
                bestScore = score;
                bestDirection = direction;
            }
        }
        
        // 如果找到了安全方向，返回最佳方向
        if (bestDirection !== -1) {
            return bestDirection;
        }
        
        // 如果所有方向都不安全，使用紧急分散策略
        const emergencyDirections = [0, 1, 2, 3];
        for (let direction of emergencyDirections) {
            let newX = this.x, newY = this.y;
            
            switch (direction) {
                case 0: newY -= this.speed; break;
                case 1: newX += this.speed; break;
                case 2: newY += this.speed; break;
                case 3: newX -= this.speed; break;
            }
            
            // 只检查边界和墙壁，忽略坦克碰撞
            if (newX >= 0 && newX + this.width <= game.width && 
                newY >= 0 && newY + this.height <= game.height &&
                !game.checkCollision({x: newX, y: newY, width: this.width, height: this.height}, game.walls)) {
                return direction;
            }
        }
        
        // 最后的手段：返回与当前方向相反的方向
        return (this.direction + 2) % 4;
    }
    
    calculateWallAvoidanceDirection(game) {
        // 检查四个方向，选择最安全的方向
        const directions = [0, 1, 2, 3];
        const safeDirections = [];
        
        for (let direction of directions) {
            let newX = this.x, newY = this.y;
            
            // 模拟移动
            switch (direction) {
                case 0: newY -= this.speed * 3; break;
                case 1: newX += this.speed * 3; break;
                case 2: newY += this.speed * 3; break;
                case 3: newX -= this.speed * 3; break;
            }
            
            const testTank = {x: newX, y: newY, width: this.width, height: this.height};
            
            // 检查这个方向是否安全
            if (!game.checkCollision(testTank, game.walls) && 
                !game.checkCollision(testTank, game.enemies.filter(e => e !== this))) {
                safeDirections.push(direction);
            }
        }
        
        if (safeDirections.length > 0) {
            // 从安全方向中随机选择一个
            return safeDirections[Math.floor(Math.random() * safeDirections.length)];
        } else {
            // 如果没有安全方向，返回与当前方向相反的方向
            return (this.direction + 2) % 4;
        }
    }

    canShootPlayer(player, walls) {
        // 检查是否可以直线射击到玩家
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 200) return false; // 射程限制
        
        // 检查是否在同一直线上
        const angle = Math.atan2(dy, dx);
        const directionAngle = this.direction * Math.PI / 2 - Math.PI / 2;
        const angleDiff = Math.abs(angle - directionAngle);
        
        const normDiff = angleDiff % (2 * Math.PI);
        return (normDiff < Math.PI / 4) || (normDiff > 7 * Math.PI / 4);
    }

    takeDamage(damage, game) {
        if (this.invulnerable > 0) return false;
        
        if (this.shield > 0) {
            this.shield = Math.max(0, this.shield - damage * 60);
            return false;
        }
        
        this.health -= damage;
        this.invulnerable = 30; // 30帧无敌时间
        
        // 创建受伤粒子效果
        for (let i = 0; i < 8; i++) {
            game.particles.push(new Particle(
                this.x + this.width/2, 
                this.y + this.height/2, 
                '#ff4444'
            ));
        }
        
        if (this.isPlayer && this.health <= 0) {
            game.lives--;
            if (game.lives > 0) {
                this.health = this.maxHealth;
                this.x = 100;
                this.y = CONFIG.CANVAS_HEIGHT - 100;
                this.invulnerable = 120; // 重生后2秒无敌
            }
        }
        
        return this.health <= 0;
    }

    render(ctx) {
        ctx.save();
        
        // 无敌闪烁效果
        if (this.invulnerable > 0 && Math.floor(this.invulnerable / 5) % 2) {
            ctx.globalAlpha = 0.5;
        }
        
        // 护盾效果
        if (this.shield > 0) {
            ctx.strokeStyle = '#44ff44';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x + this.width/2, this.y + this.height/2, this.width/2 + 5, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        ctx.translate(this.x + this.width/2, this.y + this.height/2);
        ctx.rotate(this.direction * Math.PI / 2);
        
        // 绘制更逼真的坦克
        this.drawDetailedTank(ctx);
        
        ctx.restore();
        
        // 血条
        if (!this.isPlayer && this.health < this.maxHealth) {
            this.renderHealthBar(ctx);
        }
    }
    
    drawDetailedTank(ctx) {
        const hw = this.width / 2;
        const hh = this.height / 2;
        const isPlayer = this.isPlayer;

        // Colour palette
        const trackColor   = isPlayer ? '#1c2b18' : '#1c1818';
        const trackLink    = isPlayer ? '#324828' : '#2a2020';
        const hullLight    = isPlayer ? '#6a8e5a' : '#584040';
        const hullBase     = isPlayer ? '#4d6640' : '#3c2c2c';
        const hullDark     = isPlayer ? '#2a3e20' : '#201818';
        const turretLight  = isPlayer ? '#5a7848' : '#6a3838';
        const turretBase   = isPlayer ? '#3d5535' : '#4a2828';
        const barrelColor  = '#252525';

        // Ground shadow
        ctx.save();
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(2, 4, hw + 1, hh - 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // ── TREADS ──────────────────────────────────────────────
        const trackW = 7;
        for (const side of [-1, 1]) {
            const tx = side > 0 ? hw - trackW : -hw;
            // Track body
            ctx.fillStyle = trackColor;
            ctx.fillRect(tx, -hh, trackW, hh * 2);
            // Link lines
            ctx.strokeStyle = trackLink;
            ctx.lineWidth = 1;
            for (let ly = -hh + 2; ly < hh; ly += 4) {
                ctx.beginPath();
                ctx.moveTo(tx + 1, ly);
                ctx.lineTo(tx + trackW - 1, ly);
                ctx.stroke();
            }
            // Drive wheel (top) and idler wheel (bottom)
            const cx = tx + trackW / 2;
            for (const wy of [-hh + 4, hh - 4]) {
                ctx.fillStyle = '#2e2e2e';
                ctx.beginPath();
                ctx.arc(cx, wy, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#484848';
                ctx.beginPath();
                ctx.arc(cx, wy, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // ── HULL ────────────────────────────────────────────────
        const hullX = -hw + trackW;
        const hullW = (hw - trackW) * 2;
        const hullGrad = ctx.createLinearGradient(hullX, -hh, hullX + hullW, hh);
        hullGrad.addColorStop(0,    hullLight);
        hullGrad.addColorStop(0.45, hullBase);
        hullGrad.addColorStop(1,    hullDark);
        ctx.fillStyle = hullGrad;
        ctx.fillRect(hullX, -hh + 2, hullW, hh * 2 - 4);

        // Front armour highlight
        ctx.fillStyle = hullLight;
        ctx.fillRect(hullX, -hh + 2, hullW, 2);

        // Centre spine line
        ctx.strokeStyle = hullDark;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, -hh + 6);
        ctx.lineTo(0, hh - 6);
        ctx.stroke();

        // ── TURRET ──────────────────────────────────────────────
        const tR = Math.round(hw * 0.6);  // ~9 for TANK_SIZE 30
        const turretGrad = ctx.createRadialGradient(-3, -3, 1, 0, 0, tR);
        turretGrad.addColorStop(0,   turretLight);
        turretGrad.addColorStop(0.6, turretBase);
        turretGrad.addColorStop(1,   hullDark);
        ctx.fillStyle = turretGrad;
        ctx.beginPath();
        ctx.arc(0, 0, tR, 0, Math.PI * 2);
        ctx.fill();

        // Turret ring
        ctx.strokeStyle = hullLight;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, tR + 1.5, 0, Math.PI * 2);
        ctx.stroke();

        // Hatch
        ctx.strokeStyle = hullDark;
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.arc(0, 0, tR * 0.42, 0, Math.PI * 2);
        ctx.stroke();

        // ── BARREL ──────────────────────────────────────────────
        const bW      = 5;
        const tipY    = -(hh + 11);   // muzzle tip position
        const rootY   = -tR + 1;      // barrel root at turret edge
        const bLen    = rootY - tipY; // total barrel length

        // Base sleeve (slightly wider where barrel meets turret)
        ctx.fillStyle = '#333';
        ctx.fillRect(-bW / 2 - 1, tipY + bLen * 0.55, bW + 2, bLen * 0.45 + 1);

        // Main barrel
        ctx.fillStyle = barrelColor;
        ctx.fillRect(-bW / 2, tipY, bW, bLen);

        // Muzzle brake (two rings)
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(-bW / 2 - 3, tipY,     bW + 6, 5);
        ctx.fillRect(-bW / 2 - 1.5, tipY + 5, bW + 3, 3);

        // Barrel highlight
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(-bW / 2, tipY, 1.5, bLen);

        // ── INSIGNIA ────────────────────────────────────────────
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (isPlayer) {
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 9px Arial';
            ctx.fillText('★', 0, 1);
        } else {
            ctx.fillStyle = '#dd3333';
            ctx.font = 'bold 10px Arial';
            ctx.fillText('✕', 0, 1);
        }
    }

    renderHealthBar(ctx) {
        const barWidth = this.width;
        const barHeight = 4;
        const x = this.x;
        const y = this.y - 8;
        
        ctx.fillStyle = '#333';
        ctx.fillRect(x, y, barWidth, barHeight);
        
        ctx.fillStyle = '#ff0000';
        const healthPercent = this.health / this.maxHealth;
        ctx.fillRect(x, y, barWidth * healthPercent, barHeight);
        
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, barWidth, barHeight);
    }
}

// Boss坦克类
class BossTank extends Tank {
    constructor(x, y) {
        super(x, y, false);
        this.width = CONFIG.TANK_SIZE * 1.5; // 更大尺寸
        this.height = CONFIG.TANK_SIZE * 1.5;
        this.health = 8; // 高血量
        this.maxHealth = this.health;
        this.speed = CONFIG.ENEMY_SPEED * 0.8; // 稍慢但更强
        this.isBoss = true;
        this.specialAttackCooldown = 0;
        this.burstShotCount = 0;
        this.lastSpecialAttack = 0;
        
        // Boss特殊武器
        this.weapon = {
            damage: 2,
            speed: 5,
            cooldown: 400,
            color: '#ff4400'
        };
    }
    
    update(game, dt = 1) {
        const now = Date.now();

        // Boss特殊攻击模式
        if (now - this.lastSpecialAttack > 3000) {
            this.performSpecialAttack(game);
            this.lastSpecialAttack = now;
        }

        // 调用父类更新逻辑
        super.update(game, dt);
    }
    
    performSpecialAttack(game) {
        const attackType = Math.floor(Math.random() * 3);
        
        switch(attackType) {
            case 0: // 多方向射击
                this.multiDirectionShoot(game);
                break;
            case 1: // 连发射击
                this.burstShoot(game);
                break;
            case 2: // 追踪射击
                this.trackingShoot(game);
                break;
        }
    }
    
    multiDirectionShoot(game) {
        // 向四个方向同时射击
        for (let dir = 0; dir < 4; dir++) {
            const bullet = new Bullet(
                this.x + this.width/2,
                this.y + this.height/2,
                dir,
                this.weapon,
                false
            );
            game.bullets.push(bullet);
        }
    }
    
    burstShoot(game) {
        // 连续射击3发
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                if (this.health > 0 && !game.paused && game.gameState === 'playing') {
                    const bullet = new Bullet(
                        this.x + this.width/2,
                        this.y + this.height/2,
                        this.direction,
                        this.weapon,
                        false
                    );
                    game.bullets.push(bullet);
                }
            }, i * 200);
        }
    }
    
    trackingShoot(game) {
        // 朝向玩家射击
        const dx = game.player.x - this.x;
        const dy = game.player.y - this.y;
        let targetDirection;
        
        if (Math.abs(dx) > Math.abs(dy)) {
            targetDirection = dx > 0 ? 1 : 3;
        } else {
            targetDirection = dy > 0 ? 2 : 0;
        }
        
        const bullet = new Bullet(
            this.x + this.width/2,
            this.y + this.height/2,
            targetDirection,
            this.weapon,
            false
        );
        game.bullets.push(bullet);
    }
    
    drawDetailedTank(ctx) {
        const hw = this.width / 2;
        const hh = this.height / 2;
        const time = Date.now() * 0.003;
        const pulse = Math.sin(time) * 0.5 + 0.5;

        // ── AURA GLOW ───────────────────────────────────────────
        ctx.save();
        ctx.globalAlpha = 0.12 + pulse * 0.08;
        ctx.fillStyle = '#ff2200';
        ctx.shadowColor = '#ff2200';
        ctx.shadowBlur = 24;
        ctx.beginPath();
        ctx.ellipse(0, 0, hw + 10, hh + 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Ground shadow
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(3, 6, hw + 2, hh - 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // ── TREADS (wider) ──────────────────────────────────────
        const trackW = 10;
        for (const side of [-1, 1]) {
            const tx = side > 0 ? hw - trackW : -hw;
            ctx.fillStyle = '#111';
            ctx.fillRect(tx, -hh, trackW, hh * 2);
            // Link lines
            ctx.strokeStyle = '#222';
            ctx.lineWidth = 2;
            for (let ly = -hh + 3; ly < hh; ly += 5) {
                ctx.beginPath();
                ctx.moveTo(tx + 1, ly);
                ctx.lineTo(tx + trackW - 1, ly);
                ctx.stroke();
            }
            // Drive wheels
            const cx = tx + trackW / 2;
            for (const wy of [-hh + 6, hh - 6]) {
                ctx.fillStyle = '#1a1a1a';
                ctx.beginPath();
                ctx.arc(cx, wy, 5.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#333';
                ctx.beginPath();
                ctx.arc(cx, wy, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // ── HULL ────────────────────────────────────────────────
        const hullX = -hw + trackW;
        const hullW = (hw - trackW) * 2;
        const hullGrad = ctx.createLinearGradient(hullX, -hh, hullX + hullW, hh);
        hullGrad.addColorStop(0,    '#5a2020');
        hullGrad.addColorStop(0.45, '#3a1414');
        hullGrad.addColorStop(1,    '#1a0808');
        ctx.fillStyle = hullGrad;
        ctx.fillRect(hullX, -hh + 3, hullW, hh * 2 - 6);

        // Front armour plate
        ctx.fillStyle = '#4a1818';
        ctx.fillRect(hullX, -hh + 3, hullW, 3);

        // Armour bolt rivets
        ctx.fillStyle = '#555';
        for (let by = -hh + 10; by < hh - 4; by += 9) {
            for (const bx of [hullX + 3, -hullX - 3]) {
                ctx.beginPath();
                ctx.arc(bx, by, 1.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // ── TURRET ──────────────────────────────────────────────
        const tR = Math.round(hw * 0.58);  // ~13 for BossTank
        const turretGrad = ctx.createRadialGradient(-4, -4, 2, 0, 0, tR);
        turretGrad.addColorStop(0,   '#6a2828');
        turretGrad.addColorStop(0.5, '#3a1010');
        turretGrad.addColorStop(1,   '#150505');
        ctx.fillStyle = turretGrad;
        ctx.beginPath();
        ctx.arc(0, 0, tR, 0, Math.PI * 2);
        ctx.fill();

        // Pulsing gold ring
        ctx.strokeStyle = `rgba(255, 200, 0, ${0.5 + pulse * 0.5})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, tR + 2, 0, Math.PI * 2);
        ctx.stroke();

        // Red eye lights
        const eyeAlpha = 0.7 + pulse * 0.3;
        ctx.save();
        ctx.shadowColor = '#ff3300';
        ctx.shadowBlur = 10;
        ctx.fillStyle = `rgba(255, 50, 0, ${eyeAlpha})`;
        ctx.beginPath();
        ctx.arc(-5, -2, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc( 5, -2, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // ── DUAL BARRELS ────────────────────────────────────────
        const bW   = 5;
        const tipY = -(hh + 16);
        const rootY = -tR + 1;
        const bLen  = rootY - tipY;
        const offsets = [-4.5, 4.5]; // x centres of left/right barrel

        for (const ox of offsets) {
            // Base sleeve
            ctx.fillStyle = '#292929';
            ctx.fillRect(ox - bW / 2 - 1, tipY + bLen * 0.55, bW + 2, bLen * 0.45 + 1);

            // Main barrel
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(ox - bW / 2, tipY, bW, bLen);

            // Muzzle brake
            ctx.fillStyle = '#111';
            ctx.fillRect(ox - bW / 2 - 3, tipY,     bW + 6, 6);
            ctx.fillRect(ox - bW / 2 - 1.5, tipY + 6, bW + 3, 3);

            // Highlight
            ctx.fillStyle = 'rgba(255,255,255,0.07)';
            ctx.fillRect(ox - bW / 2, tipY, 1.5, bLen);
        }

        // ── CROWN INSIGNIA ──────────────────────────────────────
        ctx.fillStyle = `rgba(255, 215, 0, ${0.85 + pulse * 0.15})`;
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('♛', 0, 4);

        // ── HEALTH BAR ──────────────────────────────────────────
        const barW = this.width + 12;
        const barH = 7;
        const barY = -hh - 16;
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(-barW / 2, barY, barW, barH);
        const hp = this.health / this.maxHealth;
        ctx.fillStyle = hp > 0.5 ? '#44bb44' : hp > 0.25 ? '#bbbb44' : '#bb4444';
        ctx.fillRect(-barW / 2, barY, barW * hp, barH);
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1;
        ctx.strokeRect(-barW / 2, barY, barW, barH);
    }
}

// 主游戏类
class TankBattle {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.miniMapCanvas = document.getElementById('miniMap');
        this.miniMapCtx = this.miniMapCanvas.getContext('2d');
        
        this.width = CONFIG.CANVAS_WIDTH;
        this.height = CONFIG.CANVAS_HEIGHT;
        
        this.gameState = 'playing';
        this.score = 0;
        this.lives = 3;
        this.level = 1;
        this.paused = false;
        
        this.player = null;
        this.enemies = [];
        this.bullets = [];
        this.walls = [];
        this.powerUps = [];
        this.particles = [];
        
        this.keys = {};
        this.screenShake = 0;
        this.currentWeaponIndex = 0;
        this.weaponKeys = Object.keys(WEAPONS);
        this.lastTime = 0;
        this.animationId = null;

        this.init();
        this.setupEventListeners();
        this.gameLoop();
    }

    init() {
        this.createPlayer();
        this.createWalls();
        this.createEnemies();
        this.spawnPowerUps();
        this.updateUI();
    }

    createPlayer() {
        this.player = new Tank(100, this.height - 100, true);
    }

    createWalls() {
        this.walls = [];
        const wallSize = CONFIG.WALL_SIZE;
        
        // 边界墙
        for (let x = 0; x < this.width; x += wallSize) {
            this.walls.push({x, y: 0, width: wallSize, height: wallSize, destructible: false});
            this.walls.push({x, y: this.height - wallSize, width: wallSize, height: wallSize, destructible: false});
        }
        for (let y = 0; y < this.height; y += wallSize) {
            this.walls.push({x: 0, y, width: wallSize, height: wallSize, destructible: false});
            this.walls.push({x: this.width - wallSize, y, width: wallSize, height: wallSize, destructible: false});
        }
        
        // 根据关卡生成不同的地图
        this.generateLevelMap();
    }

    generateLevelMap() {
        const wallSize = CONFIG.WALL_SIZE;
        const patterns = [
            // 关卡1: 简单障碍 (普通砖墙)
            [{x: 200, y: 200, w: 60, h: 60, type: 'brick'}, {x: 400, y: 150, w: 40, h: 100, type: 'brick'}],
            // 关卡2: 迷宫式 (混合墙壁)
            [{x: 150, y: 100, w: 20, h: 200, type: 'steel'}, {x: 300, y: 200, w: 200, h: 20, type: 'brick'}, {x: 600, y: 100, w: 20, h: 300, type: 'steel'}],
            // 关卡3: 要塞式 (钢板保护)
            [{x: 350, y: 250, w: 100, h: 100, type: 'steel'}, {x: 200, y: 150, w: 60, h: 20, type: 'brick'}, {x: 540, y: 350, w: 60, h: 20, type: 'brick'}],
            // 关卡4: 复杂防御
            [{x: 100, y: 150, w: 40, h: 40, type: 'steel'}, {x: 200, y: 100, w: 20, h: 120, type: 'brick'}, {x: 400, y: 200, w: 80, h: 20, type: 'steel'}, {x: 600, y: 300, w: 40, h: 80, type: 'brick'}],
            // 关卡5: 堡垒式
            [{x: 300, y: 200, w: 200, h: 20, type: 'steel'}, {x: 350, y: 220, w: 100, h: 100, type: 'brick'}, {x: 320, y: 180, w: 20, h: 40, type: 'steel'}, {x: 460, y: 180, w: 20, h: 40, type: 'steel'}]
        ];
        
        const pattern = patterns[Math.min(this.level - 1, patterns.length - 1)] || patterns[0];
        
        pattern.forEach(obs => {
            for (let x = obs.x; x < obs.x + obs.w; x += wallSize) {
                for (let y = obs.y; y < obs.y + obs.h; y += wallSize) {
                    const wallType = obs.type || 'brick';
                    this.walls.push({
                        x, y, 
                        width: wallSize, 
                        height: wallSize, 
                        destructible: wallType === 'brick',
                        type: wallType
                    });
                }
            }
        });
    }

    createEnemies() {
        this.enemies = [];
        const isBossLevel = this.level % 5 === 0; // 每5关出现boss
        
        if (isBossLevel) {
            // Boss关卡：1个boss + 少量普通敌人
            const normalEnemyCount = Math.min(2 + Math.floor(this.level / 5), 4);
            
            // 创建Boss
            let bossX, bossY, attempts = 0;
            do {
                bossX = Math.random() * (this.width - 300) + 150;
                bossY = Math.random() * (this.height - 300) + 150;
                attempts++;
            } while ((this.checkCollision({x: bossX, y: bossY, width: CONFIG.TANK_SIZE * 1.5, height: CONFIG.TANK_SIZE * 1.5}, this.walls) || 
                     Math.abs(bossX - this.player.x) < 200 || Math.abs(bossY - this.player.y) < 200) && attempts < 50);
            
            const boss = new BossTank(bossX, bossY);
            this.enemies.push(boss);
            
            // 创建普通敌人
            for (let i = 0; i < normalEnemyCount; i++) {
                let x, y, attempts = 0;
                do {
                    x = Math.random() * (this.width - 200) + 100;
                    y = Math.random() * (this.height - 200) + 100;
                    attempts++;
                } while ((this.checkCollision({x, y, width: CONFIG.TANK_SIZE, height: CONFIG.TANK_SIZE}, this.walls) || 
                         Math.abs(x - this.player.x) < 150 || Math.abs(y - this.player.y) < 150 ||
                         Math.abs(x - bossX) < 100 || Math.abs(y - bossY) < 100) && attempts < 50);
                
                const enemy = new Tank(x, y, false);
                enemy.health = Math.min(1 + Math.floor(this.level / 3), 3);
                enemy.maxHealth = enemy.health;
                this.enemies.push(enemy);
            }
        } else {
            // 普通关卡
            const enemyCount = Math.min(3 + this.level, 8);
            
            for (let i = 0; i < enemyCount; i++) {
                let x, y, attempts = 0;
                do {
                    x = Math.random() * (this.width - 200) + 100;
                    y = Math.random() * (this.height - 200) + 100;
                    attempts++;
                } while ((this.checkCollision({x, y, width: CONFIG.TANK_SIZE, height: CONFIG.TANK_SIZE}, this.walls) || 
                         Math.abs(x - this.player.x) < 150 || Math.abs(y - this.player.y) < 150) && attempts < 50);
                
                const enemy = new Tank(x, y, false);
                enemy.health = Math.min(1 + Math.floor(this.level / 3), 3); // 高级关卡敌人更强
                enemy.maxHealth = enemy.health;
                this.enemies.push(enemy);
            }
        }
    }

    spawnPowerUps() {
        if (Math.random() < 0.3) { // 30%概率生成道具
            const types = ['health', 'weapon', 'shield', 'speed'];
            const type = types[Math.floor(Math.random() * types.length)];
            
            let x, y, attempts = 0;
            do {
                x = Math.random() * (this.width - 100) + 50;
                y = Math.random() * (this.height - 100) + 50;
                attempts++;
            } while (this.checkCollision({x, y, width: 20, height: 20}, this.walls) && attempts < 30);
            
            this.powerUps.push(new PowerUp(x, y, type));
        }
    }

    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
            
            if (e.key.toLowerCase() === 'p') {
                this.togglePause();
            }
            
            if (e.key.toLowerCase() === 'r' && this.gameState !== 'playing') {
                this.restart();
            }
            
            if (e.key.toLowerCase() === 'l') {
                switchLanguage();
                this.updateUI();
            }
            
            // 武器切换
            const num = parseInt(e.key);
            if (num >= 1 && num <= 3) {
                this.switchWeapon(num - 1);
            }
        });
        
        document.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });
    }

    togglePause() {
        if (this.gameState === 'playing') {
            this.paused = !this.paused;
        }
    }

    switchWeapon(index) {
        if (index < this.weaponKeys.length) {
            const weaponKey = this.weaponKeys[index];
            if (this.player.ammo[weaponKey] > 0 || WEAPONS[weaponKey].ammo === Infinity) {
                this.currentWeaponIndex = index;
                this.player.weapon = WEAPONS[weaponKey];
                this.updateUI();
            }
        }
    }

    update(dt = 1) {
        if (this.gameState !== 'playing' || this.paused) return;

        this.updatePlayer(dt);
        this.updateEnemies(dt);
        this.updateBullets(dt);
        this.updatePowerUps(dt);
        this.updateParticles(dt);
        this.checkCollisions();
        this.checkWinCondition();

        if (this.screenShake > 0) {
            this.screenShake -= dt;
            if (this.screenShake < 0) this.screenShake = 0;
        }
    }

    updatePlayer(dt = 1) {
        const step = (this.player.speedBoost > 0 ? this.player.speed * 1.5 : this.player.speed) * dt;

        // Move each axis independently so wall collisions on one axis
        // don't block movement on the other (fixes diagonal corner-clipping)
        if (this.keys['w']) {
            this.player.direction = 0;
            this.player.y -= step;
            if (this.checkCollision(this.player, this.walls)) this.player.y += step;
        }
        if (this.keys['s']) {
            this.player.direction = 2;
            this.player.y += step;
            if (this.checkCollision(this.player, this.walls)) this.player.y -= step;
        }
        if (this.keys['a']) {
            this.player.direction = 3;
            this.player.x -= step;
            if (this.checkCollision(this.player, this.walls)) this.player.x += step;
        }
        if (this.keys['d']) {
            this.player.direction = 1;
            this.player.x += step;
            if (this.checkCollision(this.player, this.walls)) this.player.x -= step;
        }

        // 射击
        if (this.keys[' '] && Date.now() - this.player.lastShot > this.player.weapon.cooldown) {
            if (this.player.ammo[this.weaponKeys[this.currentWeaponIndex]] > 0 ||
                this.player.weapon.ammo === Infinity) {
                this.shoot(this.player);
                this.player.lastShot = Date.now();

                if (this.player.weapon.ammo !== Infinity) {
                    this.player.ammo[this.weaponKeys[this.currentWeaponIndex]]--;
                    this.updateUI();
                }
            }
        }

        this.player.update(this, dt);
    }

    updateEnemies(dt = 1) {
        this.enemies.forEach(enemy => {
            enemy.update(this, dt);
        });
    }

    updateBullets(dt = 1) {
        this.bullets = this.bullets.filter(bullet => {
            const alive = bullet.update(dt);
            
            if (!alive) return false;
            
            // 检查与墙的碰撞
            const hitWall = this.walls.find(wall => this.checkCollision(bullet, [wall]));
            if (hitWall) {
                if (hitWall.destructible) {
                    this.walls = this.walls.filter(wall => wall !== hitWall);
                    // 创建砖墙破坏粒子效果
                    for (let i = 0; i < 8; i++) {
                        this.particles.push(new Particle(
                            hitWall.x + hitWall.width/2, 
                            hitWall.y + hitWall.height/2, 
                            '#8B4513'
                        ));
                    }
                } else {
                    // 钢板墙被击中 - 产生火花效果
                    for (let i = 0; i < 6; i++) {
                        this.particles.push(new Particle(
                            bullet.x + bullet.width/2, 
                            bullet.y + bullet.height/2, 
                            '#FFD700'
                        ));
                    }
                }
                return false;
            }
            
            return true;
        });
    }

    updatePowerUps(dt = 1) {
        this.powerUps.forEach(powerUp => {
            powerUp.update(dt);
            
            if (this.checkCollision(this.player, [powerUp])) {
                this.collectPowerUp(powerUp);
                powerUp.collected = true;
            }
        });
        
        this.powerUps = this.powerUps.filter(p => !p.collected);
    }

    updateParticles(dt = 1) {
        this.particles = this.particles.filter(particle => particle.update(dt));
    }



    collectPowerUp(powerUp) {
        switch(powerUp.type) {
            case 'health':
                this.player.health = Math.min(this.player.health + 1, this.player.maxHealth);
                break;
            case 'weapon': {
                // 随机给予武器弹药
                const weaponKey = this.weaponKeys[Math.floor(Math.random() * (this.weaponKeys.length - 1)) + 1];
                this.player.ammo[weaponKey] += WEAPONS[weaponKey].ammo === Infinity ? 0 : 20;
                break;
            }
            case 'shield':
                this.player.shield = 300; // 5秒护盾
                break;
            case 'speed':
                this.player.speedBoost = 300; // 5秒加速
                break;
        }
        
        // 创建收集粒子效果
        for (let i = 0; i < 8; i++) {
            this.particles.push(new Particle(
                powerUp.x + powerUp.width/2, 
                powerUp.y + powerUp.height/2, 
                powerUp.getColor()
            ));
        }
        
        this.score += 50;
        this.updateUI();
    }



    shoot(tank) {
        const bullet = new Bullet(
            tank.x + tank.width / 2 - CONFIG.BULLET_SIZE / 2,
            tank.y + tank.height / 2 - CONFIG.BULLET_SIZE / 2,
            tank.direction,
            tank.weapon,
            tank.isPlayer
        );
        
        this.bullets.push(bullet);
        
        // 屏幕震动
        if (tank.isPlayer && tank.weapon.damage > 1) {
            this.screenShake = 5;
        }
    }

    checkCollisions() {
        const bulletsToRemove = new Set();
        const enemiesToRemove = new Set();

        // Bullet vs tank collisions
        for (let bi = 0; bi < this.bullets.length; bi++) {
            if (bulletsToRemove.has(bi)) continue;
            const bullet = this.bullets[bi];

            if (bullet.isPlayer) {
                // Player bullet vs enemies
                for (let ei = 0; ei < this.enemies.length; ei++) {
                    if (enemiesToRemove.has(ei)) continue;
                    const enemy = this.enemies[ei];
                    if (this.checkCollision(bullet, [enemy])) {
                        if (enemy.takeDamage(bullet.damage, this)) {
                            enemiesToRemove.add(ei);
                            if (enemy.isBoss) {
                                this.score += 1000 * this.level;
                                for (let i = 0; i < 20; i++) {
                                    this.particles.push(new Particle(
                                        enemy.x + enemy.width / 2,
                                        enemy.y + enemy.height / 2,
                                        '#ffd700'
                                    ));
                                }
                            } else {
                                this.score += 100 * this.level;
                            }
                        }
                        bulletsToRemove.add(bi);
                        this.screenShake = enemy.isBoss ? 8 : 3;
                        this.updateUI();
                        break; // bullet is spent
                    }
                }
            } else {
                // Enemy bullet vs player
                if (this.checkCollision(bullet, [this.player])) {
                    this.player.takeDamage(bullet.damage, this);
                    bulletsToRemove.add(bi);
                    this.screenShake = 8;
                    if (this.lives <= 0) {
                        this.gameState = 'gameOver';
                    }
                    this.updateUI();
                }
            }
        }

        // Bullet vs bullet collisions (only between opposing sides)
        for (let i = 0; i < this.bullets.length; i++) {
            if (bulletsToRemove.has(i)) continue;
            for (let j = i + 1; j < this.bullets.length; j++) {
                if (bulletsToRemove.has(j)) continue;
                if (this.bullets[i].isPlayer !== this.bullets[j].isPlayer &&
                    this.checkCollision(this.bullets[i], [this.bullets[j]])) {
                    for (let k = 0; k < 6; k++) {
                        this.particles.push(new Particle(
                            this.bullets[i].x, this.bullets[i].y, '#ffff00'
                        ));
                    }
                    bulletsToRemove.add(i);
                    bulletsToRemove.add(j);
                    break;
                }
            }
        }

        // Apply removals in one pass (safe — no mutation during iteration)
        if (bulletsToRemove.size) this.bullets  = this.bullets.filter((_, i) => !bulletsToRemove.has(i));
        if (enemiesToRemove.size) this.enemies   = this.enemies.filter((_, i) => !enemiesToRemove.has(i));
    }

    checkCollision(obj, obstacles) {
        return obstacles.some(obstacle => 
            obj.x < obstacle.x + obstacle.width &&
            obj.x + obj.width > obstacle.x &&
            obj.y < obstacle.y + obstacle.height &&
            obj.y + obj.height > obstacle.y
        );
    }

    checkWinCondition() {
        if (this.enemies.length === 0) {
            this.level++;
            this.score += 500 * this.level;
            
            if (this.level > CONFIG.MAX_LEVEL) {
                this.gameState = 'victory';
            } else {
                // 下一关
                this.createWalls();
                this.createEnemies();
                this.spawnPowerUps();
                
                // 恢复玩家部分生命
                this.player.health = Math.min(this.player.health + 1, this.player.maxHealth);
            }
            this.updateUI();
        }
    }

    render() {
        // 屏幕震动效果
        this.ctx.save();
        if (this.screenShake > 0) {
            const shakeX = (Math.random() - 0.5) * this.screenShake;
            const shakeY = (Math.random() - 0.5) * this.screenShake;
            this.ctx.translate(shakeX, shakeY);
        }
        
        // 清空画布
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        // 绘制网格背景
        this.renderGrid();
        
        // 绘制墙壁
        this.walls.forEach(wall => {
            this.renderWall(wall);
        });
        
        // 绘制道具
        this.powerUps.forEach(powerUp => powerUp.render(this.ctx));
        
        // 绘制坦克
        this.player.render(this.ctx);
        this.enemies.forEach(enemy => enemy.render(this.ctx));
        
        // 绘制子弹
        this.bullets.forEach(bullet => bullet.render(this.ctx));
        
        // 绘制粒子效果
        this.particles.forEach(particle => particle.render(this.ctx));
        
        this.ctx.restore();
        
        // 绘制小地图
        this.renderMiniMap();
        
        // 绘制游戏状态覆盖层
        if (this.gameState === 'gameOver') {
            this.renderGameOver();
        } else if (this.gameState === 'victory') {
            this.renderVictory();
        } else if (this.paused) {
            this.renderPaused();
        }
    }

    renderGrid() {
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 0.5;
        
        for (let x = 0; x < this.width; x += 40) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.height);
            this.ctx.stroke();
        }
        
        for (let y = 0; y < this.height; y += 40) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.width, y);
            this.ctx.stroke();
        }
    }

    renderWall(wall) {
        const ctx = this.ctx;
        
        if (wall.type === 'steel') {
            // 钢板墙 - 银灰色金属质感
            const gradient = ctx.createLinearGradient(wall.x, wall.y, wall.x + wall.width, wall.y + wall.height);
            gradient.addColorStop(0, '#C0C0C0');
            gradient.addColorStop(0.5, '#808080');
            gradient.addColorStop(1, '#404040');
            ctx.fillStyle = gradient;
            ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
            
            // 金属边框
            ctx.strokeStyle = '#E0E0E0';
            ctx.lineWidth = 2;
            ctx.strokeRect(wall.x, wall.y, wall.width, wall.height);
            
            // 金属纹理线条
            ctx.strokeStyle = '#A0A0A0';
            ctx.lineWidth = 1;
            for (let i = 0; i < 3; i++) {
                const y = wall.y + (i + 1) * wall.height / 4;
                ctx.beginPath();
                ctx.moveTo(wall.x + 2, y);
                ctx.lineTo(wall.x + wall.width - 2, y);
                ctx.stroke();
            }
            
            // 高光效果
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.fillRect(wall.x + 1, wall.y + 1, wall.width - 2, 3);
            
        } else if (wall.type === 'brick' || wall.destructible) {
            // 砖墙 - 棕色砖块质感
            ctx.fillStyle = '#8B4513';
            ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
            
            // 砖块边框
            ctx.strokeStyle = '#A0522D';
            ctx.lineWidth = 1;
            ctx.strokeRect(wall.x, wall.y, wall.width, wall.height);
            
            // 砖块纹理
            ctx.strokeStyle = '#654321';
            ctx.lineWidth = 1;
            
            // 水平砖缝
            const midY = wall.y + wall.height / 2;
            ctx.beginPath();
            ctx.moveTo(wall.x, midY);
            ctx.lineTo(wall.x + wall.width, midY);
            ctx.stroke();
            
            // 垂直砖缝（错位排列）
            const midX = wall.x + wall.width / 2;
            ctx.beginPath();
            ctx.moveTo(midX, wall.y);
            ctx.lineTo(midX, midY);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(midX, midY);
            ctx.lineTo(midX, wall.y + wall.height);
            ctx.stroke();
            
            // 砖块阴影
            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.fillRect(wall.x + wall.width - 2, wall.y + 2, 2, wall.height - 2);
            ctx.fillRect(wall.x + 2, wall.y + wall.height - 2, wall.width - 2, 2);
            
        } else {
            // 边界墙 - 深灰色
            ctx.fillStyle = '#444';
            ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
            
            ctx.strokeStyle = '#666';
            ctx.lineWidth = 1;
            ctx.strokeRect(wall.x, wall.y, wall.width, wall.height);
        }
    }



    renderMiniMap() {
        const scale = 0.15;
        
        this.miniMapCtx.fillStyle = '#000';
        this.miniMapCtx.fillRect(0, 0, 120, 90);
        
        // 绘制墙壁
        this.walls.forEach(wall => {
            if (wall.type === 'steel') {
                this.miniMapCtx.fillStyle = '#C0C0C0'; // 钢板墙 - 银色
            } else if (wall.type === 'brick' || wall.destructible) {
                this.miniMapCtx.fillStyle = '#8B4513'; // 砖墙 - 棕色
            } else {
                this.miniMapCtx.fillStyle = '#666'; // 边界墙 - 灰色
            }
            this.miniMapCtx.fillRect(
                wall.x * scale, wall.y * scale,
                wall.width * scale, wall.height * scale
            );
        });
        
        // 绘制玩家
        this.miniMapCtx.fillStyle = '#00ff00';
        this.miniMapCtx.fillRect(
            this.player.x * scale, this.player.y * scale,
            this.player.width * scale, this.player.height * scale
        );
        
        // 绘制敌人
        this.enemies.forEach(enemy => {
            if (enemy.isBoss) {
                this.miniMapCtx.fillStyle = '#ffd700'; // Boss坦克 - 金色
            } else {
                this.miniMapCtx.fillStyle = '#ff4444'; // 普通敌人 - 红色
            }
            this.miniMapCtx.fillRect(
                enemy.x * scale, enemy.y * scale,
                enemy.width * scale, enemy.height * scale
            );
        });
        
        // 绘制道具
        this.miniMapCtx.fillStyle = '#ffff00';
        this.powerUps.forEach(powerUp => {
            this.miniMapCtx.fillRect(
                powerUp.x * scale, powerUp.y * scale,
                2, 2
            );
        });
    }

    renderGameOver() {
        this.renderOverlay(t('gameOver'), '#ff4444', [
            `${t('finalScore')}: ${this.score}`,
            `${t('reachedLevel')}: ${this.level}`,
            t('restartHint')
        ]);
    }

    renderVictory() {
        this.renderOverlay(t('victory'), '#44ff44', [
            `${t('finalScore')}: ${this.score}`,
            t('victoryMessage'),
            t('restartChallenge')
        ]);
    }

    renderPaused() {
        this.renderOverlay(t('paused'), '#ffff44', [
            t('continueHint')
        ]);
    }

    renderOverlay(title, color, messages) {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        this.ctx.fillStyle = color;
        this.ctx.font = 'bold 48px Courier New';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(title, this.width/2, this.height/2 - 60);
        
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '20px Courier New';
        messages.forEach((message, index) => {
            this.ctx.fillText(message, this.width/2, this.height/2 + index * 30);
        });
    }

    updateUI() {
        document.getElementById('lives').textContent = this.lives;
        document.getElementById('score').textContent = this.score;
        
        // Boss关卡特殊显示
        const isBossLevel = this.level % 5 === 0;
        const levelText = isBossLevel ? `${this.level} 👑` : this.level;
        document.getElementById('level').textContent = levelText;
        
        document.getElementById('enemies').textContent = this.enemies.length;
        document.getElementById('currentWeapon').textContent = getWeaponName(this.player.weapon);
        
        const currentAmmo = this.player.ammo[this.weaponKeys[this.currentWeaponIndex]];
        document.getElementById('ammo').textContent = 
            currentAmmo === Infinity ? '∞' : currentAmmo;
    }

    restart() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.gameState = 'playing';
        this.paused = false;
        this.score = 0;
        this.lives = 3;
        this.level = 1;
        this.bullets = [];
        this.enemies = [];
        this.walls = [];
        this.particles = [];
        this.powerUps = [];
        this.screenShake = 0;
        this.lastTime = 0;
        this.currentWeaponIndex = 0;
        this.init();
        this.gameLoop();
    }

    gameLoop(time = 0) {
        const dt = this.lastTime > 0 ? Math.min((time - this.lastTime) / 16.67, 3) : 1;
        this.lastTime = time;
        this.update(dt);
        this.render();
        this.animationId = requestAnimationFrame((t) => this.gameLoop(t));
    }
}

// 启动游戏
window.addEventListener('load', () => {
    updateUILabels(); // 初始化UI标签
    new TankBattle();
});