// 国际化语言支持
const LANGUAGES = {
    zh: {
        lives: '生命',
        score: '分数',
        level: '关卡',
        enemies: '敌人',
        weapon: '武器',
        ammo: '弹药',
        controls: 'WASD/方向键: 移动射击 | 空格: 射击 | J/W/↑: 跳跃 | S/↓: 趴下<br>P: 暂停 | 1-3: 切换武器 | R: 重新开始 | L: 切换语言',
        weapons: {
            normal: '普通弹',
            spread: '散弹枪',
            laser: '激光炮'
        },
        gameOver: '游戏结束',
        victory: '恭喜通关!',
        paused: '游戏暂停',
        finalScore: '最终分数',
        reachedLevel: '到达关卡',
        restartHint: '按 R 重新开始',
        victoryMessage: '你是真正的魂斗罗英雄!',
        continueHint: '按 P 继续游戏',
        powerups: {
            spread: '散弹枪',
            laser: '激光炮',
            rapid: '速射',
            barrier: '护盾',
            life: '生命',
            health: '血包'
        }
    },
    en: {
        lives: 'Lives',
        score: 'Score',
        level: 'Level',
        enemies: 'Enemies',
        weapon: 'Weapon',
        ammo: 'Ammo',
        controls: 'WASD/Arrows: Move & Aim | Space: Shoot | J/W/↑: Jump | S/↓: Crouch<br>P: Pause | 1-3: Switch Weapon | R: Restart | L: Language',
        weapons: {
            normal: 'Normal',
            spread: 'Spread Gun',
            laser: 'Laser'
        },
        gameOver: 'Game Over',
        victory: 'Victory!',
        paused: 'Paused',
        finalScore: 'Final Score',
        reachedLevel: 'Reached Level',
        restartHint: 'Press R to Restart',
        victoryMessage: 'You are a true Contra hero!',
        continueHint: 'Press P to Continue',
        powerups: {
            spread: 'Spread Gun',
            laser: 'Laser Gun',
            rapid: 'Rapid Fire',
            barrier: 'Barrier',
            life: 'Extra Life',
            health: 'Health Pack'
        }
    }
};

// 当前语言设置
function detectBrowserLanguage() {
    const browserLang = navigator.language || navigator.userLanguage;
    return browserLang.startsWith('zh') ? 'zh' : 'en';
}

let currentLanguage = localStorage.getItem('contraLanguage') || detectBrowserLanguage();

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
    localStorage.setItem('contraLanguage', currentLanguage);
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

// 道具系统配置
const POWER_UPS = {
    SPREAD_GUN: {
        symbol: 'S',
        nameKey: 'powerups.spread',
        weapon: 'spread',
        color: '#ff8800',
        duration: 0 // 永久武器
    },
    LASER_GUN: {
        symbol: 'L',
        nameKey: 'powerups.laser',
        weapon: 'laser',
        color: '#ff0000',
        duration: 0
    },
    RAPID_FIRE: {
        symbol: 'R',
        nameKey: 'powerups.rapid',
        effect: 'rapidFire',
        color: '#ffff00',
        duration: 10000 // 10秒
    },
    BARRIER: {
        symbol: 'B',
        nameKey: 'powerups.barrier',
        effect: 'shield',
        color: '#00ffff',
        duration: 15000 // 15秒
    },
    EXTRA_LIFE: {
        symbol: '1UP',
        nameKey: 'powerups.life',
        effect: 'extraLife',
        color: '#00ff00',
        duration: 0
    },
    HEALTH: {
        symbol: '+',
        nameKey: 'powerups.health',
        effect: 'health',
        color: '#ff69b4',
        duration: 0
    }
};

// 游戏配置常量
const CONFIG = {
    CANVAS_WIDTH: 1000,
    CANVAS_HEIGHT: 600,
    PLAYER_WIDTH: 24,
    PLAYER_HEIGHT: 32,
    BULLET_SIZE: 4,
    ENEMY_WIDTH: 24,
    ENEMY_HEIGHT: 32,
    PLATFORM_HEIGHT: 20,
    PLAYER_SPEED: 3,
    JUMP_FORCE: 12,
    GRAVITY: 0.5,
    BULLET_SPEED: 8,
    SHOOT_COOLDOWN: 200,
    CAMERA_SMOOTH: 0.1,
    LEVEL_WIDTH: 2000,
    PARTICLE_COUNT: 10
};

// 武器类型
const WEAPONS = {
    NORMAL: { nameKey: 'weapons.normal', damage: 1, speed: 8, cooldown: 200, ammo: Infinity, color: '#ffff00', spread: 0 },
    SPREAD: { nameKey: 'weapons.spread', damage: 1, speed: 6, cooldown: 300, ammo: 30, color: '#ff8800', spread: 3 },
    LASER: { nameKey: 'weapons.laser', damage: 2, speed: 12, cooldown: 100, ammo: 50, color: '#ff0000', spread: 0 }
};

// 敌人类型配置
const ENEMY_TYPES = {
    soldier: {
        health: 1,
        speed: 1,
        shootInterval: 120,
        behavior: 'patrol',
        alertRadius: 200,
        attackRadius: 150,
        patrolDistance: 100,
        color: '#ff6666'
    },
    sniper: {
        health: 2,
        speed: 0.5,
        shootInterval: 180,
        behavior: 'stationary',
        alertRadius: 300,
        attackRadius: 250,
        patrolDistance: 0,
        color: '#66ff66'
    },
    runner: {
        health: 1,
        speed: 2,
        shootInterval: 60,
        behavior: 'chase',
        alertRadius: 250,
        attackRadius: 100,
        patrolDistance: 50,
        color: '#6666ff'
    },
    boss: {
        health: 10,
        speed: 1.2,
        shootInterval: 45,
        behavior: 'boss',
        alertRadius: 400,
        attackRadius: 300,
        patrolDistance: 150,
        color: '#ff00ff'
    }
};

// 获取武器名称
function getWeaponName(weapon) {
    return t(weapon.nameKey);
}

// 对象池系统
class ObjectPool {
    constructor(createFn, resetFn, initialSize = 50) {
        this.createFn = createFn;
        this.resetFn = resetFn;
        this.pool = [];
        this.active = [];

        // 预创建对象
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(this.createFn());
        }
    }

    get() {
        const obj = this.pool.pop() || this.createFn();
        this.active.push(obj);
        return obj;
    }

    release(obj) {
        const index = this.active.indexOf(obj);
        if (index > -1) {
            this.active.splice(index, 1);
            this.resetFn(obj);
            this.pool.push(obj);
        }
    }

    clear() {
        this.pool.push(...this.active);
        this.active.length = 0;
    }
}

// 对象池将在类定义后创建

// 粒子系统
class Particle {
    constructor(x, y, color = '#ffaa00') {
        this.init(x, y, color);
    }

    init(x, y, color = '#ffaa00') {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 8;
        this.vy = (Math.random() - 0.5) * 8;
        this.life = 1.0;
        this.decay = 0.02 + Math.random() * 0.03;
        this.size = 2 + Math.random() * 3;
        this.color = color;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.98;
        this.vy *= 0.98;
        this.life -= this.decay;
        this.size *= 0.99;
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

// 子弹类
class Bullet {
    constructor(x, y, direction, weapon, isPlayer = false) {
        this.init(x, y, direction, weapon, isPlayer);
    }

    init(x, y, direction, weapon, isPlayer = false) {
        this.x = x;
        this.y = y;
        this.weapon = weapon;
        this.isPlayer = isPlayer;
        this.speed = weapon.speed;
        this.damage = weapon.damage;
        this.width = CONFIG.BULLET_SIZE;
        this.height = CONFIG.BULLET_SIZE;
        this.active = true;
        
        // 支持八方向射击
        if (typeof direction === 'object') {
            // 新的方向向量格式 {x, y}
            this.vx = direction.x * weapon.speed;
            this.vy = direction.y * weapon.speed;
            this.direction = Math.atan2(direction.y, direction.x);
        } else {
            // 兼容旧的角度格式
            this.direction = direction;
            this.vx = Math.cos(direction) * weapon.speed;
            this.vy = Math.sin(direction) * weapon.speed;
        }
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;

        // 检查边界
        if (this.x < -50 || this.x > CONFIG.LEVEL_WIDTH + 50 ||
            this.y < -50 || this.y > CONFIG.CANVAS_HEIGHT + 50) {
            this.active = false;
        }
    }

    render(ctx, camera) {
        ctx.save();
        ctx.fillStyle = this.weapon.color;
        ctx.shadowBlur = 5;
        ctx.shadowColor = this.weapon.color;
        ctx.fillRect(
            this.x - camera.x - this.width / 2,
            this.y - this.height / 2,
            this.width,
            this.height
        );
        ctx.restore();
    }
}

// 平台类
class Platform {
    constructor(x, y, width, height, type = 'normal') {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.type = type;
    }

    render(ctx, camera) {
        ctx.save();

        if (this.type === 'ground') {
            ctx.fillStyle = '#8B4513';
        } else {
            ctx.fillStyle = '#654321';
        }

        ctx.fillRect(
            this.x - camera.x,
            this.y,
            this.width,
            this.height
        );

        // 添加纹理效果
        ctx.strokeStyle = '#5a3a1a';
        ctx.lineWidth = 1;
        for (let i = 0; i < this.width; i += 20) {
            ctx.beginPath();
            ctx.moveTo(this.x - camera.x + i, this.y);
            ctx.lineTo(this.x - camera.x + i, this.y + this.height);
            ctx.stroke();
        }

        ctx.restore();
    }
}

// 道具类
class PowerUp {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.config = POWER_UPS[type];
        this.width = 24;
        this.height = 24;
        this.velocityY = 1; // 缓慢下落
        this.bounceTime = 0;
        this.collected = false;
        this.glowTime = 0;
    }

    update() {
        // 缓慢下落
        this.y += this.velocityY;
        
        // 轻微弹跳效果
        this.bounceTime += 0.1;
        this.y += Math.sin(this.bounceTime) * 0.5;
        
        // 发光效果
        this.glowTime += 0.15;
        
        // 边界检查
        if (this.y > CONFIG.CANVAS_HEIGHT + 50) {
            this.collected = true; // 标记为已收集以便清理
        }
    }

    render(ctx, camera) {
        const screenX = this.x - camera.x;
        const screenY = this.y;
        
        // 发光效果
        const glowIntensity = 0.5 + 0.5 * Math.sin(this.glowTime);
        
        ctx.save();
        
        // 外发光
        ctx.shadowColor = this.config.color;
        ctx.shadowBlur = 10 * glowIntensity;
        
        // 背景圆形
        ctx.fillStyle = this.config.color;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(screenX + this.width/2, screenY + this.height/2, this.width/2, 0, Math.PI * 2);
        ctx.fill();
        
        // 边框
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // 符号
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
            this.config.symbol,
            screenX + this.width/2,
            screenY + this.height/2
        );
        
        ctx.restore();
    }

    checkCollision(player) {
        return this.x < player.x + player.width &&
               this.x + this.width > player.x &&
               this.y < player.y + player.height &&
               this.y + this.height > player.y;
    }

    applyEffect(player, game) {
        if (this.collected) return;
        
        this.collected = true;
        
        // 根据道具类型应用效果
        if (this.config.weapon) {
            // 武器道具
            player.currentWeapon = this.config.weapon;
            if (this.config.weapon === 'spread') {
                player.weapons.spread.ammo = WEAPONS.SPREAD.ammo;
            } else if (this.config.weapon === 'laser') {
                player.weapons.laser.ammo = WEAPONS.LASER.ammo;
            }
        } else if (this.config.effect) {
            // 效果道具
            switch (this.config.effect) {
                case 'rapidFire':
                    player.rapidFireEndTime = Date.now() + this.config.duration;
                    break;
                case 'shield':
                    player.shieldEndTime = Date.now() + this.config.duration;
                    break;
                case 'extraLife':
                    player.lives++;
                    break;
                case 'health':
                    player.health = Math.min(player.maxHealth, player.health + 2);
                    break;
            }
        }
        
        // 拾取特效
        for (let i = 0; i < 8; i++) {
            const particle = particlePool.get();
            if (particle) {
                particle.init(
                    this.x + this.width/2,
                    this.y + this.height/2,
                    this.config.color
                );
                game.particles.push(particle);
            }
        }
        
        // 增加分数
        game.score += 100;
    }
}

// 全局对象池
const bulletPool = new ObjectPool(
    () => new Bullet(0, 0, 0, WEAPONS.NORMAL),
    (bullet) => {
        bullet.x = 0;
        bullet.y = 0;
        bullet.direction = 0;
        bullet.weapon = WEAPONS.NORMAL;
        bullet.isPlayer = false;
        bullet.speed = 0;
        bullet.damage = 0;
        bullet.active = false;
    },
    100
);

const particlePool = new ObjectPool(
    () => new Particle(0, 0),
    (particle) => {
        particle.x = 0;
        particle.y = 0;
        particle.vx = 0;
        particle.vy = 0;
        particle.life = 1.0;
        particle.decay = 0.02;
        particle.size = 2;
        particle.color = '#ffaa00';
    },
    200
);

// 敌人类
class Enemy {
    constructor(x, y, type = 'soldier') {
        this.x = x;
        this.y = y;
        this.width = CONFIG.ENEMY_WIDTH;
        this.height = CONFIG.ENEMY_HEIGHT;
        this.type = type;

        // 使用敌人类型配置
        const config = ENEMY_TYPES[type] || ENEMY_TYPES.soldier;
        this.health = config.health;
        this.maxHealth = this.health;
        this.speed = config.speed;
        this.shootInterval = config.shootInterval;
        this.behavior = config.behavior;
        this.alertRadius = config.alertRadius;
        this.attackRadius = config.attackRadius;
        this.patrolDistance = config.patrolDistance;
        this.color = config.color;

        this.direction = -1; // -1 左, 1 右
        this.vx = 0;
        this.vy = 0;
        this.onGround = false;
        // Cooldown now handled by lastShot property
        this.active = true;
        this.startX = x;
        this.aiTimer = 0;

        // AI状态机
        this.aiState = 'patrol';
        this.target = null;
        this.lastSeenPlayerX = 0;
        this.alertTimer = 0;
        this.stuckTimer = 0;
        this.lastX = x;
    }

    update(game) {
        this.aiTimer++;

        // AI 行为
        this.updateAI(game);

        // 物理更新
        this.updatePhysics(game);

        // 射击冷却
        if (this.shootCooldown > 0) {
            this.shootCooldown--;
        }
    }

    updateAI(game) {
        const player = game.player;
        const distanceToPlayer = Math.abs(this.x - player.x);
        const verticalDistance = Math.abs(this.y - player.y);

        // 检测是否卡住
        if (Math.abs(this.x - this.lastX) < 0.1) {
            this.stuckTimer++;
            if (this.stuckTimer > 60) {
                this.direction *= -1;
                this.stuckTimer = 0;
            }
        } else {
            this.stuckTimer = 0;
        }
        this.lastX = this.x;

        // 状态机逻辑
        switch (this.aiState) {
            case 'patrol':
                this.patrolBehavior(game, player, distanceToPlayer, verticalDistance);
                break;
            case 'alert':
                this.alertBehavior(game, player, distanceToPlayer, verticalDistance);
                break;
            case 'attack':
                this.attackBehavior(game, player, distanceToPlayer, verticalDistance);
                break;
            case 'retreat':
                this.retreatBehavior(game, player, distanceToPlayer, verticalDistance);
                break;
        }

        this.aiTimer++;
    }

    patrolBehavior(game, player, distanceToPlayer, verticalDistance) {
        // 检测玩家
        if (distanceToPlayer < this.alertRadius && verticalDistance < 100) {
            this.aiState = 'alert';
            this.target = player;
            this.lastSeenPlayerX = player.x;
            this.alertTimer = 180; // 3秒警戒时间
            return;
        }

        // 根据行为类型执行巡逻
        switch (this.behavior) {
            case 'patrol':
                if (Math.abs(this.x - this.startX) > this.patrolDistance) {
                    this.direction *= -1;
                }
                this.vx = this.direction * this.speed;
                break;
            case 'stationary':
                this.vx = 0;
                break;
            case 'chase':
                // 冲锋兵即使在巡逻也会小范围移动
                if (Math.abs(this.x - this.startX) > this.patrolDistance) {
                    this.direction *= -1;
                }
                this.vx = this.direction * this.speed * 0.5;
                break;
        }
    }

    alertBehavior(game, player, distanceToPlayer, verticalDistance) {
        this.alertTimer--;

        // 如果玩家进入攻击范围
        if (distanceToPlayer < this.attackRadius && verticalDistance < 80) {
            this.aiState = 'attack';
            return;
        }

        // 如果失去目标太久，回到巡逻
        if (this.alertTimer <= 0) {
            this.aiState = 'patrol';
            this.target = null;
            return;
        }

        // 朝向玩家最后出现的位置
        if (this.x < this.lastSeenPlayerX) {
            this.direction = 1;
            this.vx = this.speed * 0.8;
        } else {
            this.direction = -1;
            this.vx = -this.speed * 0.8;
        }

        // 更新玩家位置
        if (distanceToPlayer < this.alertRadius) {
            this.lastSeenPlayerX = player.x;
            this.alertTimer = 180;
        }
    }

    attackBehavior(game, player, distanceToPlayer, verticalDistance) {
        // 如果玩家离开攻击范围
        if (distanceToPlayer > this.attackRadius || verticalDistance > 100) {
            this.aiState = 'alert';
            this.alertTimer = 120;
            return;
        }

        // 根据敌人类型执行不同攻击行为
        switch (this.behavior) {
            case 'patrol':
            case 'stationary':
                // 普通攻击：停止移动，瞄准射击
                this.vx = 0;
                if (this.shootCooldown <= 0) {
                    this.shoot(game);
                }
                break;
            case 'chase':
                // 冲锋攻击：快速接近玩家
                if (distanceToPlayer > 50) {
                    this.direction = this.x < player.x ? 1 : -1;
                    this.vx = this.direction * this.speed * 1.5;
                } else {
                    this.vx = 0;
                    if (this.shootCooldown <= 0) {
                        this.shoot(game);
                    }
                }
                break;
            case 'boss':
                // Boss攻击：复杂攻击模式
                this.bossAttackPattern(game, player, distanceToPlayer);
                break;
        }
    }

    retreatBehavior(game, player, distanceToPlayer, verticalDistance) {
        // 简单的撤退逻辑：远离玩家
        this.direction = this.x < player.x ? -1 : 1;
        this.vx = this.direction * this.speed;

        // 如果距离足够远，回到警戒状态
        if (distanceToPlayer > this.alertRadius) {
            this.aiState = 'alert';
            this.alertTimer = 60;
        }
    }

    bossAttackPattern(game, player, distanceToPlayer) {
        const phase = Math.floor(this.aiTimer / 180) % 3;

        switch (phase) {
            case 0: // 移动射击
                if (this.aiTimer % 120 === 0) {
                    this.direction *= -1;
                }
                this.vx = this.direction * this.speed * 0.5;
                if (this.shootCooldown <= 0) {
                    this.shoot(game);
                }
                break;
            case 1: // 快速射击
                this.vx = 0;
                if (this.aiTimer % 30 === 0 && this.shootCooldown <= 0) {
                    this.shootBurst(game, 3);
                }
                break;
            case 2: // 冲锋
                this.direction = this.x < player.x ? 1 : -1;
                this.vx = this.direction * this.speed * 1.2;
                break;
        }
    }

    shootBurst(game, count) {
        for (let i = 0; i < count; i++) {
            setTimeout(() => {
                if (this.active) {
                    this.shoot(game);
                }
            }, i * 100);
        }
    }

    updatePhysics(game) {
        // 重力
        if (!this.onGround) {
            this.vy += CONFIG.GRAVITY;
        }

        // 移动
        this.x += this.vx;
        this.y += this.vy;

        // 平台碰撞检测
        this.onGround = false;
        for (const platform of game.platforms) {
            if (this.checkPlatformCollision(platform)) {
                this.y = platform.y - this.height;
                this.vy = 0;
                this.onGround = true;
                break;
            }
        }

        // 边界检查
        if (this.y > CONFIG.CANVAS_HEIGHT) {
            this.active = false;
        }
    }

    checkPlatformCollision(platform) {
        return this.x < platform.x + platform.width &&
            this.x + this.width > platform.x &&
            this.y + this.height > platform.y &&
            this.y + this.height < platform.y + platform.height + 10 &&
            this.vy >= 0;
    }

    shoot(game) {
        const player = game.player;
        const angle = Math.atan2(player.y - this.y, player.x - this.x);

        const bullet = bulletPool.get();
        bullet.init(
            this.x + this.width / 2,
            this.y + this.height / 2,
            angle,
            WEAPONS.NORMAL,
            false
        );

        game.bullets.push(bullet);
        this.shootCooldown = this.shootInterval;
    }

    takeDamage(damage, game) {
        this.health -= damage;

        // 创建受伤粒子效果
        for (let i = 0; i < 5; i++) {
            const particle = particlePool.get();
            particle.init(
                this.x + this.width / 2,
                this.y + this.height / 2,
                '#ff0000'
            );
            game.particles.push(particle);
        }

        if (this.health <= 0) {
            this.active = false;
            game.score += this.type === 'boss' ? 1000 : 100;

            // 道具掉落逻辑
            const dropChance = this.type === 'boss' ? 0.8 : 0.3;
            if (Math.random() < dropChance) {
                const powerUpTypes = Object.keys(POWER_UPS);
                const randomType = powerUpTypes[Math.floor(Math.random() * powerUpTypes.length)];
                const powerUp = new PowerUp(
                    this.x + this.width / 2 - 12,
                    this.y + this.height / 2 - 12,
                    randomType
                );
                game.powerUps.push(powerUp);
            }

            // 死亡爆炸效果
            for (let i = 0; i < 15; i++) {
                const particle = particlePool.get();
                particle.init(
                    this.x + this.width / 2,
                    this.y + this.height / 2,
                    '#ffaa00'
                );
                game.particles.push(particle);
            }
        }
    }

    render(ctx, camera) {
        ctx.save();

        const screenX = this.x - camera.x;

        // AI状态指示器
        if (this.aiState === 'alert') {
            ctx.strokeStyle = '#ffff00';
            ctx.lineWidth = 2;
            ctx.strokeRect(screenX - 2, this.y - 2, this.width + 4, this.height + 4);
        } else if (this.aiState === 'attack') {
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 2;
            ctx.strokeRect(screenX - 2, this.y - 2, this.width + 4, this.height + 4);
        }

        // 受伤闪烁效果
        if (this.hurtTimer > 0 && Math.floor(this.hurtTimer / 5) % 2) {
            ctx.globalAlpha = 0.5;
        }

        if (this.type === 'boss') {
            // Boss人形渲染（更大）
            this.renderEnemyHumanoid(ctx, screenX, this.y, this.color, '#FF4500', this.direction > 0, true);
        } else {
            // 普通敌人人形渲染
            this.renderEnemyHumanoid(ctx, screenX, this.y, this.color, '#333333', this.direction > 0, false);
        }

        // 绘制类型标识（在头盔上）
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        let typeSymbol = '';
        switch (this.type) {
            case 'soldier': typeSymbol = 'S'; break;
            case 'sniper': typeSymbol = 'N'; break;
            case 'runner': typeSymbol = 'R'; break;
            case 'boss': typeSymbol = 'B'; break;
        }
        const centerX = screenX + this.width / 2;
        const headY = this.type === 'boss' ? this.y + 4 : this.y + 6;
        ctx.fillText(typeSymbol, centerX, headY);

        // 绘制方向指示
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        const arrowX = screenX + (this.direction > 0 ? this.width - 4 : 4);
        const arrowY = this.y + this.height / 2;
        ctx.beginPath();
        if (this.direction > 0) {
            ctx.moveTo(arrowX - 4, arrowY - 3);
            ctx.lineTo(arrowX, arrowY);
            ctx.lineTo(arrowX - 4, arrowY + 3);
        } else {
            ctx.moveTo(arrowX + 4, arrowY - 3);
            ctx.lineTo(arrowX, arrowY);
            ctx.lineTo(arrowX + 4, arrowY + 3);
        }
        ctx.stroke();

        // 血条
        if (this.health < this.maxHealth || this.type === 'boss') {
            this.renderHealthBar(ctx, screenX);
        }

        ctx.restore();
    }

    renderEnemyHumanoid(ctx, x, y, primaryColor, secondaryColor, facingRight, isBoss) {
        const scale = isBoss ? 1.5 : 1;
        const centerX = x + this.width / 2;
        const headSize = 6 * scale;
        const bodyWidth = 8 * scale;
        const bodyHeight = 12 * scale;
        const legHeight = 10 * scale;
        const armLength = 8 * scale;

        // 头部
        ctx.fillStyle = '#FFDBAC'; // 肤色
        ctx.beginPath();
        ctx.arc(centerX, y + headSize, headSize, 0, Math.PI * 2);
        ctx.fill();

        // 头盔/帽子（敌人特色）
        ctx.fillStyle = primaryColor;
        ctx.beginPath();
        ctx.arc(centerX, y + headSize - 1, headSize - 1, Math.PI, Math.PI * 2);
        ctx.fill();

        // 眼睛（红色表示敌意）
        ctx.fillStyle = '#ff0000';
        const eyeOffset = facingRight ? 2 * scale : -2 * scale;
        ctx.fillRect(centerX + eyeOffset - 1, y + headSize - 1, 2, 1);

        // 身体
        ctx.fillStyle = primaryColor;
        ctx.fillRect(centerX - bodyWidth / 2, y + headSize * 2, bodyWidth, bodyHeight);

        // 身体装饰
        ctx.fillStyle = secondaryColor;
        ctx.fillRect(centerX - bodyWidth / 2 + 1, y + headSize * 2 + 1, bodyWidth - 2, bodyHeight - 2);

        // 腿部（深色军装）
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(centerX - 3 * scale, y + headSize * 2 + bodyHeight, 2 * scale, legHeight);
        ctx.fillRect(centerX + 1 * scale, y + headSize * 2 + bodyHeight, 2 * scale, legHeight);

        // 脚部（黑色军靴）
        ctx.fillStyle = '#000000';
        ctx.fillRect(centerX - 4 * scale, y + headSize * 2 + bodyHeight + legHeight - 2, 3 * scale, 3 * scale);
        ctx.fillRect(centerX + 1 * scale, y + headSize * 2 + bodyHeight + legHeight - 2, 3 * scale, 3 * scale);

        // 手臂
        ctx.fillStyle = primaryColor;
        if (facingRight) {
            // 右臂（持枪）
            ctx.fillRect(centerX + bodyWidth / 2, y + headSize * 2 + 2, armLength, 3 * scale);
            // 左臂
            ctx.fillRect(centerX - bodyWidth / 2 - 3 * scale, y + headSize * 2 + 4, 3 * scale, 6 * scale);
        } else {
            // 左臂（持枪）
            ctx.fillRect(centerX - bodyWidth / 2 - armLength, y + headSize * 2 + 2, armLength, 3 * scale);
            // 右臂
            ctx.fillRect(centerX + bodyWidth / 2, y + headSize * 2 + 4, 3 * scale, 6 * scale);
        }

        // 武器（敌人武器更粗糙）
        ctx.fillStyle = '#444444';
        if (facingRight) {
            ctx.fillRect(centerX + bodyWidth / 2 + armLength - 2, y + headSize * 2 + 1, 6 * scale, 2 * scale);
        } else {
            ctx.fillRect(centerX - bodyWidth / 2 - armLength - 4 * scale, y + headSize * 2 + 1, 6 * scale, 2 * scale);
        }

        // Boss特殊装饰
        if (isBoss) {
            // 肩章
            ctx.fillStyle = '#FFD700';
            ctx.fillRect(centerX - bodyWidth / 2 - 2, y + headSize * 2, 4, 4);
            ctx.fillRect(centerX + bodyWidth / 2 - 2, y + headSize * 2, 4, 4);
        }
    }

    renderHealthBar(ctx, screenX) {
        const barWidth = this.width;
        const barHeight = 4;
        const healthPercent = this.health / this.maxHealth;

        // 背景
        ctx.fillStyle = '#333';
        ctx.fillRect(screenX, this.y - 8, barWidth, barHeight);

        // 血量
        ctx.fillStyle = healthPercent > 0.5 ? '#00ff00' : healthPercent > 0.25 ? '#ffff00' : '#ff0000';
        ctx.fillRect(screenX, this.y - 8, barWidth * healthPercent, barHeight);
    }
}

// 玩家类
class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = CONFIG.PLAYER_WIDTH;
        this.height = CONFIG.PLAYER_HEIGHT;
        this.originalHeight = CONFIG.PLAYER_HEIGHT;
        this.vx = 0;
        this.vy = 0;
        this.onGround = false;
        this.direction = 1; // 1 右, -1 左
        this.health = 3;
        this.maxHealth = 3;
        this.currentWeapon = WEAPONS.NORMAL;
        this.weapons = {
            normal: { ...WEAPONS.NORMAL },
            spread: { ...WEAPONS.SPREAD },
            laser: { ...WEAPONS.LASER }
        };
        this.shootCooldown = 0;
        this.invulnerable = 0;
        
        // 八方向射击系统
        this.shootDirection = { x: 1, y: 0 }; // 默认向右射击
        this.isCrouching = false;
        
        // 道具效果
        this.rapidFireEndTime = 0;
        this.shieldEndTime = 0;
        this.lives = 3;
        this.lastShot = 0;
    }

    update(game) {
        // 处理输入
        this.handleInput(game);

        // 物理更新
        this.updatePhysics(game);

        // Cooldown now handled in shoot method
        if (this.invulnerable > 0) this.invulnerable--;
    }

    handleInput(game) {
        const keys = game.keys;

        // 水平移动
        this.vx = 0;
        if (keys['a'] || keys['A'] || keys['ArrowLeft']) {
            this.vx = -CONFIG.PLAYER_SPEED;
            this.direction = -1;
        }
        if (keys['d'] || keys['D'] || keys['ArrowRight']) {
            this.vx = CONFIG.PLAYER_SPEED;
            this.direction = 1;
        }

        // 趴下
        this.isCrouching = keys['s'] || keys['S'] || keys['ArrowDown'];
        
        // 跳跃
        if ((keys['j'] || keys['J'] || keys['w'] || keys['W'] || keys['ArrowUp']) && this.onGround && !this.isCrouching) {
            this.vy = -CONFIG.JUMP_FORCE;
            this.onGround = false;
        }

        // 计算射击方向（八方向射击）
        this.updateShootDirection(keys);

        // 射击（支持连续射击）
        if (keys[' ']) {
            this.shoot(game);
        }
    }

    updatePhysics(game) {
        // 趴下状态调整
        if (this.isCrouching) {
            this.height = this.originalHeight * 0.6;
            this.vx *= 0.3; // 趴下时移动速度减慢
        } else {
            this.height = this.originalHeight;
        }

        // 重力
        if (!this.onGround) {
            this.vy += CONFIG.GRAVITY;
        }

        // 移动
        this.x += this.vx;
        this.y += this.vy;

        // 边界检查
        if (this.x < 0) this.x = 0;
        if (this.x > CONFIG.LEVEL_WIDTH - this.width) this.x = CONFIG.LEVEL_WIDTH - this.width;

        // 平台碰撞检测
        this.onGround = false;
        for (const platform of game.platforms) {
            if (this.checkPlatformCollision(platform)) {
                this.y = platform.y - this.height;
                this.vy = 0;
                this.onGround = true;
                break;
            }
        }

        // 掉落检查
        if (this.y > CONFIG.CANVAS_HEIGHT) {
            this.takeDamage(1, game);
            this.respawn();
        }
    }

    checkPlatformCollision(platform) {
        return this.x < platform.x + platform.width &&
            this.x + this.width > platform.x &&
            this.y + this.height > platform.y &&
            this.y + this.height < platform.y + platform.height + 10 &&
            this.vy >= 0;
    }

    // 八方向射击方向计算
    updateShootDirection(keys) {
        let dirX = 0;
        let dirY = 0;

        // 水平方向
        if (keys['a'] || keys['A'] || keys['ArrowLeft']) {
            dirX = -1;
        } else if (keys['d'] || keys['D'] || keys['ArrowRight']) {
            dirX = 1;
        }

        // 垂直方向
        if (keys['w'] || keys['W'] || keys['ArrowUp']) {
            dirY = -1;
        } else if (keys['s'] || keys['S'] || keys['ArrowDown']) {
            dirY = 1;
        }

        // 如果没有按方向键，使用玩家朝向
        if (dirX === 0 && dirY === 0) {
            dirX = this.direction;
        }

        // 标准化方向向量
        const length = Math.sqrt(dirX * dirX + dirY * dirY);
        if (length > 0) {
            this.shootDirection.x = dirX / length;
            this.shootDirection.y = dirY / length;
        }
    }

    shoot(game) {
        const weapon = this.currentWeapon;
        const now = Date.now();
        
        // 快速射击效果
        const isRapidFire = now < this.rapidFireEndTime;
        const cooldown = isRapidFire ? weapon.cooldown * 0.3 : weapon.cooldown;
        
        // 检查冷却时间和弹药
        if (now - this.lastShot < cooldown || weapon.ammo <= 0) return;
        
        this.lastShot = now;

        // 计算射击起始位置
        let shootX = this.x + this.width / 2;
        let shootY = this.y + (this.isCrouching ? this.height * 0.8 : this.height / 2);

        if (weapon.spread > 0) {
            // 散弹
            for (let i = 0; i < weapon.spread; i++) {
                const spreadAngle = (i - (weapon.spread - 1) / 2) * 0.3;
                const cos = Math.cos(spreadAngle);
                const sin = Math.sin(spreadAngle);
                
                // 应用散射到射击方向
                const finalDirX = this.shootDirection.x * cos - this.shootDirection.y * sin;
                const finalDirY = this.shootDirection.x * sin + this.shootDirection.y * cos;
                
                const bullet = bulletPool.get();
                bullet.init(
                    shootX,
                    shootY,
                    { x: finalDirX, y: finalDirY },
                    weapon,
                    true
                );
                game.bullets.push(bullet);
            }
        } else {
            // 单发子弹
            const bullet = bulletPool.get();
            bullet.init(
                shootX,
                shootY,
                this.shootDirection,
                weapon,
                true
            );
            game.bullets.push(bullet);
        }

        // 减少弹药
        if (weapon.ammo !== Infinity) {
            weapon.ammo--;
        }

        // 射击冷却已在开始处理
    }

    takeDamage(damage, game) {
        if (this.invulnerable > 0) return;
        
        // 护盾效果
        const now = Date.now();
        if (now < this.shieldEndTime) {
            // 护盾吸收伤害，产生特效
            for (let i = 0; i < 5; i++) {
                const particle = particlePool.get();
                if (particle) {
                    particle.init(
                        this.x + this.width/2,
                        this.y + this.height/2,
                        '#00ffff'
                    );
                    game.particles.push(particle);
                }
            }
            return;
        }

        this.health -= damage;
        this.invulnerable = 120; // 2秒无敌时间

        // 受伤粒子效果
        for (let i = 0; i < 8; i++) {
            const particle = particlePool.get();
            particle.init(
                this.x + this.width / 2,
                this.y + this.height / 2,
                '#ff0000'
            );
            game.particles.push(particle);
        }

        if (this.health <= 0) {
            game.gameOver();
        }
    }

    respawn() {
        this.x = 50;
        this.y = 300;
        this.vx = 0;
        this.vy = 0;
    }

    render(ctx, camera) {
        ctx.save();

        const screenX = this.x - camera.x;

        // 无敌闪烁效果
        if (this.invulnerable > 0 && Math.floor(this.invulnerable / 10) % 2) {
            ctx.globalAlpha = 0.5;
        }

        this.renderHumanoid(ctx, screenX, this.y, '#0066CC', '#004499', this.direction > 0);

        // 护盾效果
        if (this.shieldEndTime > Date.now()) {
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.6 + 0.4 * Math.sin(Date.now() / 100);
            ctx.beginPath();
            ctx.arc(screenX + this.width / 2, this.y + this.height / 2, this.width / 2 + 8, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();
    }

    renderHumanoid(ctx, x, y, primaryColor, secondaryColor, facingRight) {
        const centerX = x + this.width / 2;
        const headSize = 6;
        const bodyWidth = 8;
        const bodyHeight = this.isCrouching ? 8 : 12;
        const legHeight = this.isCrouching ? 6 : 10;
        const armLength = 8;

        // 调整趴下时的Y位置
        const adjustedY = this.isCrouching ? y + 4 : y;

        // 头部
        ctx.fillStyle = '#FFDBAC'; // 肤色
        ctx.beginPath();
        ctx.arc(centerX, adjustedY + headSize, headSize, 0, Math.PI * 2);
        ctx.fill();

        // 头盔/帽子
        ctx.fillStyle = primaryColor;
        ctx.beginPath();
        ctx.arc(centerX, adjustedY + headSize - 1, headSize - 1, Math.PI, Math.PI * 2);
        ctx.fill();

        // 眼睛
        ctx.fillStyle = '#000000';
        const eyeOffset = facingRight ? 2 : -2;
        ctx.fillRect(centerX + eyeOffset - 1, adjustedY + headSize - 1, 2, 1);

        // 身体
        ctx.fillStyle = primaryColor;
        if (this.isCrouching) {
            // 趴下时身体更宽更矮
            ctx.fillRect(centerX - bodyWidth / 2 - 2, adjustedY + headSize * 2, bodyWidth + 4, bodyHeight);
        } else {
            ctx.fillRect(centerX - bodyWidth / 2, adjustedY + headSize * 2, bodyWidth, bodyHeight);
        }

        // 身体装饰
        ctx.fillStyle = secondaryColor;
        ctx.fillRect(centerX - bodyWidth / 2 + 1, adjustedY + headSize * 2 + 1, bodyWidth - 2, bodyHeight - 2);

        // 腿部
        ctx.fillStyle = '#2C5F2D'; // 军绿色裤子
        if (this.isCrouching) {
            // 趴下时腿部弯曲
            ctx.fillRect(centerX - 4, adjustedY + headSize * 2 + bodyHeight, 3, legHeight);
            ctx.fillRect(centerX + 1, adjustedY + headSize * 2 + bodyHeight, 3, legHeight);
        } else {
            ctx.fillRect(centerX - 3, adjustedY + headSize * 2 + bodyHeight, 2, legHeight);
            ctx.fillRect(centerX + 1, adjustedY + headSize * 2 + bodyHeight, 2, legHeight);
        }

        // 脚部
        ctx.fillStyle = '#654321'; // 棕色靴子
        ctx.fillRect(centerX - 4, adjustedY + headSize * 2 + bodyHeight + legHeight - 2, 3, 3);
        ctx.fillRect(centerX + 1, adjustedY + headSize * 2 + bodyHeight + legHeight - 2, 3, 3);

        // 手臂（根据射击方向调整）
        ctx.fillStyle = primaryColor;
        const armY = adjustedY + headSize * 2 + 2;
        
        // 根据射击方向绘制手臂
        if (this.shootDirection.y < -0.5) {
            // 向上射击
            ctx.fillRect(centerX - 1, armY - 4, 2, 6);
        } else if (this.shootDirection.y > 0.5) {
            // 向下射击
            ctx.fillRect(centerX - 1, armY + 2, 2, 6);
        } else {
            // 水平射击
            if (facingRight) {
                ctx.fillRect(centerX + bodyWidth / 2, armY, armLength, 3);
                ctx.fillRect(centerX - bodyWidth / 2 - 3, armY + 2, 3, 6);
            } else {
                ctx.fillRect(centerX - bodyWidth / 2 - armLength, armY, armLength, 3);
                ctx.fillRect(centerX + bodyWidth / 2, armY + 2, 3, 6);
            }
        }

        // 武器
        ctx.fillStyle = '#666666';
        if (facingRight) {
            ctx.fillRect(centerX + bodyWidth / 2 + armLength - 2, armY - 1, 6, 2);
        } else {
            ctx.fillRect(centerX - bodyWidth / 2 - armLength - 4, armY - 1, 6, 2);
        }

        // 射击方向指示器（调试用）
        if (this.shootDirection.x !== 0 || this.shootDirection.y !== 0) {
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(centerX, adjustedY + headSize * 2 + bodyHeight / 2);
            ctx.lineTo(
                centerX + this.shootDirection.x * 20,
                adjustedY + headSize * 2 + bodyHeight / 2 + this.shootDirection.y * 20
            );
            ctx.stroke();
        }
    }
}


// 摄像机类
class Camera {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.targetX = 0;
    }

    update(player) {
        // 跟随玩家
        this.targetX = player.x - CONFIG.CANVAS_WIDTH / 2;

        // 边界限制
        if (this.targetX < 0) this.targetX = 0;
        if (this.targetX > CONFIG.LEVEL_WIDTH - CONFIG.CANVAS_WIDTH) {
            this.targetX = CONFIG.LEVEL_WIDTH - CONFIG.CANVAS_WIDTH;
        }

        // 平滑移动
        this.x += (this.targetX - this.x) * CONFIG.CAMERA_SMOOTH;
    }
}

// 主游戏类
class ContraGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.keys = {};
        this.gameState = 'playing'; // playing, paused, gameOver, victory
        this.score = 0;
        this.level = 1;
        this.maxLevel = 3;

        this.player = null;
        this.bullets = [];
        this.enemies = [];
        this.platforms = [];
        this.particles = [];
        this.powerUps = [];
        this.camera = new Camera();

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.createLevel();
        updateUILabels();
        this.gameLoop();
    }

    createLevel() {
        // 创建玩家
        this.player = new Player(50, 300);

        // 清空数组
        this.enemies = [];
        this.bullets = [];
        this.platforms = [];
        this.particles = [];

        // 创建平台
        this.createPlatforms();

        // 创建敌人
        this.createEnemies();
    }

    createPlatforms() {
        // 地面
        this.platforms.push(new Platform(0, CONFIG.CANVAS_HEIGHT - 40, CONFIG.LEVEL_WIDTH, 40, 'ground'));

        // 平台
        for (let i = 0; i < 10; i++) {
            const x = 200 + i * 180;
            const y = 400 - Math.random() * 150;
            const width = 80 + Math.random() * 40;
            this.platforms.push(new Platform(x, y, width, CONFIG.PLATFORM_HEIGHT));
        }
    }

    createEnemies() {
        const baseEnemyCount = 4 + this.level;
        const enemyTypes = ['soldier', 'sniper', 'runner'];

        // 根据关卡生成不同类型的敌人
        for (let i = 0; i < baseEnemyCount; i++) {
            const x = 400 + i * 250 + Math.random() * 100;
            const y = 300;

            let type;
            if (i === 0) {
                // 第一个敌人总是普通士兵
                type = 'soldier';
            } else {
                // 根据关卡和随机性选择类型
                const rand = Math.random();
                if (this.level >= 2 && rand < 0.3) {
                    type = 'sniper';
                } else if (this.level >= 3 && rand < 0.6) {
                    type = 'runner';
                } else {
                    type = 'soldier';
                }
            }

            this.enemies.push(new Enemy(x, y, type));
        }

        // 每3关生成一个Boss
        if (this.level % 3 === 0) {
            const bossX = 1200 + Math.random() * 200;
            const bossY = 300;
            this.enemies.push(new Enemy(bossX, bossY, 'boss'));
        }

        // 高级关卡增加额外敌人
        if (this.level >= 5) {
            const extraCount = Math.floor(this.level / 3);
            for (let i = 0; i < extraCount; i++) {
                const x = 800 + i * 300 + Math.random() * 150;
                const y = 200 + Math.random() * 100;
                const type = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];
                this.enemies.push(new Enemy(x, y, type));
            }
        }
    }

    setupEventListeners() {
        // 键盘事件
        window.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;

            // 特殊按键
            if (e.key === 'p' || e.key === 'P') {
                this.togglePause();
            } else if (e.key === 'r' || e.key === 'R') {
                this.restart();
            } else if (e.key === 'l' || e.key === 'L') {
                switchLanguage();
            } else if (e.key >= '1' && e.key <= '3') {
                this.switchWeapon(parseInt(e.key) - 1);
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
        });
    }

    togglePause() {
        if (this.gameState === 'playing') {
            this.gameState = 'paused';
        } else if (this.gameState === 'paused') {
            this.gameState = 'playing';
        }
    }

    switchWeapon(index) {
        const weaponKeys = ['normal', 'spread', 'laser'];
        if (index < weaponKeys.length) {
            const weaponKey = weaponKeys[index];
            this.player.currentWeapon = this.player.weapons[weaponKey];
        }
    }

    update() {
        if (this.gameState !== 'playing') return;

        // 更新玩家
        this.player.update(this);

        // 更新摄像机
        this.camera.update(this.player);

        // 更新敌人
        this.enemies = this.enemies.filter(enemy => {
            enemy.update(this);
            return enemy.active;
        });

        // 更新子弹
        this.bullets = this.bullets.filter(bullet => {
            const alive = bullet.update();
            if (!alive) {
                bulletPool.release(bullet);
            }
            return alive;
        });

        // 更新道具
        this.powerUps = this.powerUps.filter(powerUp => {
            powerUp.update();
            return !powerUp.collected;
        });
        
        // 更新粒子
        this.particles = this.particles.filter(particle => {
            const alive = particle.update();
            if (!alive) {
                particlePool.release(particle);
            }
            return alive;
        });

        // 碰撞检测
        this.checkCollisions();

        // 检查胜利条件
        this.checkWinCondition();

        // 更新UI
        this.updateUI();
    }

    checkCollisions() {
        // 子弹与敌人碰撞
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            if (!bullet.isPlayer) continue;

            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const enemy = this.enemies[j];
                if (this.checkCollision(bullet, enemy)) {
                    enemy.takeDamage(bullet.damage, this);
                    bulletPool.release(bullet);
                    this.bullets.splice(i, 1);
                    break;
                }
            }
        }

        // 敌人子弹与玩家碰撞
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            if (bullet.isPlayer) continue;

            if (this.checkCollision(bullet, this.player)) {
                this.player.takeDamage(bullet.damage, this);
                bulletPool.release(bullet);
                this.bullets.splice(i, 1);
            }
        }

        // 玩家与敌人碰撞
        for (const enemy of this.enemies) {
            if (this.checkCollision(this.player, enemy)) {
                this.player.takeDamage(1, this);
            }
        }

        // 玩家与道具碰撞
        for (let i = this.powerUps.length - 1; i >= 0; i--) {
            const powerUp = this.powerUps[i];
            if (powerUp.checkCollision(this.player)) {
                powerUp.applyEffect(this.player, this);
                this.powerUps.splice(i, 1);
            }
        }
        
        // 子弹与平台碰撞
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            for (const platform of this.platforms) {
                if (this.checkCollision(bullet, platform)) {
                    bulletPool.release(bullet);
                    this.bullets.splice(i, 1);
                    break;
                }
            }
        }
    }

    checkCollision(obj1, obj2) {
        return obj1.x < obj2.x + obj2.width &&
            obj1.x + obj1.width > obj2.x &&
            obj1.y < obj2.y + obj2.height &&
            obj1.y + obj1.height > obj2.y;
    }

    checkWinCondition() {
        if (this.enemies.length === 0) {
            if (this.level < this.maxLevel) {
                this.level++;
                this.createLevel();
            } else {
                this.victory();
            }
        }
    }

    gameOver() {
        this.gameState = 'gameOver';
        this.showOverlay(t('gameOver'), '#ff0000', [
            `${t('finalScore')}: ${this.score}`,
            `${t('reachedLevel')}: ${this.level}`,
            t('restartHint')
        ]);
    }

    victory() {
        this.gameState = 'victory';
        this.showOverlay(t('victory'), '#00ff00', [
            t('victoryMessage'),
            `${t('finalScore')}: ${this.score}`,
            t('restartHint')
        ]);
    }

    showOverlay(title, color, messages) {
        const overlay = document.getElementById('gameOverlay');
        const titleElement = document.getElementById('overlayTitle');
        const messagesElement = document.getElementById('overlayMessages');

        titleElement.textContent = title;
        titleElement.style.color = color;
        messagesElement.innerHTML = messages.join('<br>');

        overlay.classList.remove('hidden');
    }

    hideOverlay() {
        document.getElementById('gameOverlay').classList.add('hidden');
    }

    restart() {
        this.gameState = 'playing';
        this.score = 0;
        this.level = 1;
        this.createLevel();
        this.hideOverlay();
    }

    updateUI() {
        document.getElementById('lives').textContent = this.player.health;
        document.getElementById('score').textContent = this.score;
        document.getElementById('level').textContent = this.level;
        document.getElementById('enemies').textContent = this.enemies.length;
        document.getElementById('currentWeapon').textContent = getWeaponName(this.player.currentWeapon);
        document.getElementById('ammo').textContent =
            this.player.currentWeapon.ammo === Infinity ? '∞' : this.player.currentWeapon.ammo;
    }

    render() {
        // 清空画布
        this.ctx.clearRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

        // 绘制背景
        this.renderBackground();

        // 绘制平台
        for (const platform of this.platforms) {
            platform.render(this.ctx, this.camera);
        }

        // 绘制玩家
        this.player.render(this.ctx, this.camera);

        // 绘制敌人
        for (const enemy of this.enemies) {
            enemy.render(this.ctx, this.camera);
        }

        // 绘制子弹
        for (const bullet of this.bullets) {
            bullet.render(this.ctx, this.camera);
        }

        // 绘制道具
        for (const powerUp of this.powerUps) {
            powerUp.render(this.ctx, this.camera);
        }

        // 绘制粒子
        for (const particle of this.particles) {
            particle.render(this.ctx);
        }

        // 绘制暂停覆盖层
        if (this.gameState === 'paused') {
            this.renderPaused();
        }
    }

    renderBackground() {
        // 天空渐变
        const gradient = this.ctx.createLinearGradient(0, 0, 0, CONFIG.CANVAS_HEIGHT);
        gradient.addColorStop(0, '#87CEEB');
        gradient.addColorStop(0.5, '#98FB98');
        gradient.addColorStop(1, '#8B4513');

        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

        // 云朵
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        for (let i = 0; i < 5; i++) {
            const x = (i * 200 - this.camera.x * 0.5) % (CONFIG.CANVAS_WIDTH + 100);
            const y = 50 + i * 20;
            this.ctx.beginPath();
            this.ctx.arc(x, y, 30, 0, Math.PI * 2);
            this.ctx.arc(x + 25, y, 35, 0, Math.PI * 2);
            this.ctx.arc(x + 50, y, 30, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    renderPaused() {
        this.ctx.save();
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '48px Courier New';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(t('paused'), CONFIG.CANVAS_WIDTH / 2, CONFIG.CANVAS_HEIGHT / 2);

        this.ctx.font = '24px Courier New';
        this.ctx.fillText(t('continueHint'), CONFIG.CANVAS_WIDTH / 2, CONFIG.CANVAS_HEIGHT / 2 + 60);

        this.ctx.restore();
    }

    gameLoop() {
        this.update();
        this.render();
        requestAnimationFrame(() => this.gameLoop());
    }
}

// 启动游戏
window.addEventListener('load', () => {
    new ContraGame();
});