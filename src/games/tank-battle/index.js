// 国际化语言支持
import { getLang } from '../../platform/site-settings.js';
import { createSfx } from '../../platform/game-sfx.js';
import { track } from '../../platform/analytics.js';
import { mountScoreboardDialog } from '../../platform/scoreboard-dialog.js';
import { CONFIG, WEAPONS, Particle, PowerUp, Bullet, Tank, BossTank, bindTankI18n } from './tank-entities.js';
import { createTankBattleArt } from './tank-battle-art.js';

// 音效：射击/爆炸/受伤/道具/胜负
const sfx = createSfx({
    shoot:      { freq: 880, slideTo: 220, type: 'square', dur: 0.08, vol: 0.14 },
    shootEnemy: { freq: 560, slideTo: 160, type: 'square', dur: 0.07, vol: 0.07 },
    explode:    { type: 'noise', dur: 0.4, vol: 0.35, filterFreq: 900, filterSlideTo: 100 },
    clink:      { freq: 1300, slideTo: 900, type: 'square', dur: 0.05, vol: 0.1 },
    powerup:    { freqs: [523.25, 659.25, 783.99], delay: 0.06, type: 'sine', dur: 0.18, vol: 0.24 },
    hurt:       { freq: 200, slideTo: 60, type: 'sawtooth', dur: 0.25, vol: 0.28 },
    levelup:    { freqs: [523.25, 659.25, 783.99, 1046.5], delay: 0.09, type: 'triangle', dur: 0.35, vol: 0.28 },
    victory:    { freqs: [523.25, 659.25, 783.99, 1046.5, 1318.5], delay: 0.11, type: 'triangle', dur: 0.5, vol: 0.3 },
    gameover:   { freqs: [392, 329.63, 261.63, 196], delay: 0.18, type: 'sawtooth', dur: 0.45, vol: 0.22 }
});

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
        controls: 'WASD: 移动 | 空格: 射击 | P: 暂停<br>1-3: 切换武器 | R: 重新开始',
        
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
        restartHintMobile: '点击屏幕重新开始',
        victoryMessage: '你是真正的坦克英雄!',
        restartChallenge: '按 R 重新挑战',
        continueHint: '按 P 继续游戏',
        continueHintMobile: '点击屏幕继续游戏',
        orientTitle: '请旋转手机横屏游玩',
        orientSub: '专为横屏掌机体验深度优化',
        orientEn: 'Rotate to landscape for arcade controls',
        orientHomeText: '返回游戏大厅',
        title: '坦克大战 - 经典街机',
        fire: '开火',
        pauseTitle: '暂停/继续',
        weaponTitle: '切换武器',
        orientationFallbackLabel: '横屏',
        
        // 道具图标
        powerUpIcons: {
            health: '+',
            weapon: 'W',
            shield: 'S',
            speed: '»'
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
        controls: 'WASD: Move | Space: Shoot | P: Pause<br>1-3: Switch Weapon | R: Restart',
        
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
        restartHintMobile: 'Tap Screen to Restart',
        victoryMessage: 'You are a true tank hero!',
        restartChallenge: 'Press R to Play Again',
        continueHint: 'Press P to Continue',
        continueHintMobile: 'Tap Screen to Continue',
        orientTitle: 'Please Rotate to Landscape',
        orientSub: 'Optimized for Arcade Controls',
        orientEn: '',
        orientHomeText: 'Back to Games',
        title: 'Tank Battle - Retro Arcade',
        fire: 'FIRE',
        pauseTitle: 'Pause / Resume',
        weaponTitle: 'Switch Weapon',
        orientationFallbackLabel: 'Landscape',
        
        // Power-up Icons
        powerUpIcons: {
            health: '+',
            weapon: 'W',
            shield: 'S',
            speed: '»'
        }
    }
};

// 触控设备检测辅助
function isTouchDevice() {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches);
}

function bindOrientationArtFallback() {
    const illustration = document.querySelector('.rotate-device-illustration');
    const fallback = document.querySelector('.rotate-device-fallback');
    if (!illustration || !fallback) return;

    const showFallback = () => {
        illustration.hidden = true;
        fallback.hidden = false;
    };

    illustration.addEventListener('error', showFallback, { once: true });
    if (illustration.complete && illustration.naturalWidth === 0) showFallback();
}

// 隐私模式/禁用存储时 localStorage 会抛 SecurityError，必须兜底，
// 否则模块顶层抛错会让整个游戏黑屏
let currentLanguage = getLang();

// 翻译函数
function t(key) {
    const keys = key.split('.');
    let value = LANGUAGES[currentLanguage];
    for (const k of keys) {
        value = value?.[k];
    }
    return value || key;
}

// 实体层（tank-entities.js）的 PowerUp.getIcon 依赖翻译函数，加载即注入
bindTankI18n(t);

// 更新UI标签文本
function updateUILabels() {
    const setElemText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };
    document.documentElement.lang = currentLanguage;
    document.title = t('title');
    setElemText('livesLabel', t('lives'));
    setElemText('scoreLabel', t('score'));
    setElemText('levelLabel', t('level'));
    setElemText('enemiesLabel', t('enemies'));
    setElemText('weaponLabel', t('weapon'));
    setElemText('ammoLabel', t('ammo'));
    const controlsText = document.getElementById('controlsText');
    if (controlsText) controlsText.innerHTML = t('controls');
    setElemText('orientTitle', t('orientTitle'));
    setElemText('orientSub', t('orientSub'));
    const orientEn = document.getElementById('orientEn');
    if (orientEn) {
        orientEn.textContent = t('orientEn');
        orientEn.style.display = currentLanguage === 'zh' ? '' : 'none';
    }
    setElemText('orientHomeText', t('orientHomeText'));
    setElemText('rotateDeviceFallbackLabel', t('orientationFallbackLabel'));
    const vFireLabel = document.getElementById('vFireLabel');
    if (vFireLabel) vFireLabel.textContent = t('fire');

    const btnPause = document.getElementById('btnPause');
    if (btnPause) btnPause.title = t('pauseTitle');
    const btnWeapon = document.getElementById('btnWeapon');
    if (btnWeapon) btnWeapon.title = t('weaponTitle');

    if (window.tankBattleInstance && window.tankBattleInstance.player) {
        const curW = document.getElementById('currentWeapon');
        if (curW) curW.textContent = getWeaponName(window.tankBattleInstance.player.weapon);
    }
}

// CONFIG/WEAPONS 与 5 个实体类已抽出至 ./tank-entities.js（move-only）

// 获取武器名称的函数
function getWeaponName(weapon) {
    return t(weapon.nameKey);
}

// 实体层（tank-entities.js）：Particle/PowerUp/Bullet/Tank/BossTank 及 CONFIG/WEAPONS 定义，
// 主类经构造/方法参数（game）反向访问实体，实体经 game 参数访问主类运行时状态。

// 主游戏类
class TankBattle {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.miniMapCanvas = document.getElementById('miniMap');
        this.miniMapCtx = this.miniMapCanvas.getContext('2d');
        this.art = createTankBattleArt();
        document.addEventListener('tank-battle-art-state', () => this.updateWeaponIcons());
        this.debugHitbox = new URLSearchParams(window.location.search).get('debug-hitbox') === '1';
        
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
        this.time = 0; // 游戏内时钟（毫秒）：暂停/切后台时冻结，AI 计时全部基于它

        this.init();
        let pausedForRanking = false;
        this.scoreboard = mountScoreboardDialog({
            boards: [{
                id: 'all', key: 'tank-battle',
                label: { en: 'Survival high scores', zh: '生存高分榜' },
                description: { en: 'Final score from a completed run; higher is better.', zh: '以结束时的最终分数排名，分数越高越好。' },
            }],
            triggers: [{ after: '.tb-home-btn', icon: true }],
            onOpen: () => {
                pausedForRanking = this.gameState === 'playing' && !this.paused;
                // Modal keyup is intentionally isolated from document controls:
                // release keyboard, D-pad and fire *before* pausing.
                this.resetHeldControls();
                if (pausedForRanking) this.paused = true;
            },
            onClose: () => {
                this.resetHeldControls();
                if (pausedForRanking && this.gameState === 'playing') this.paused = false;
                pausedForRanking = false;
            },
        });
        this.setupEventListeners();
        this.gameLoop();
        track('tank-battle', 'play');
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

    resetHeldControls() {
        this.keys = {};
        this.resetVirtualInputs?.();
        const dpad = document.getElementById('dpad');
        dpad?.querySelectorAll('.dpad-btn').forEach(button => button.classList.remove('active'));
        document.getElementById('btnFire')?.classList.remove('active');
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
            
            // 武器切换
            const num = parseInt(e.key);
            if (num >= 1 && num <= 3) {
                this.switchWeapon(num - 1);
            }
        });
        
        document.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });

        // 点击画布重新开始或继续游戏（触屏/鼠标友好）
        this.canvas.addEventListener('pointerdown', () => {
            if (this.gameState === 'gameOver' || this.gameState === 'victory') {
                this.restart();
            } else if (this.paused) {
                this.togglePause();
            }
        });

        // 切换标签页时自动暂停
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.gameState === 'playing' && !this.paused) {
                this.paused = true;
            }
        });

        // Focus loss and modal transitions share one authoritative reset.
        window.addEventListener('blur', () => this.resetHeldControls());
        window.addEventListener('orientationchange', () => this.resetHeldControls());

        // 初始化移动端虚拟掌机控制器
        this.setupVirtualController();
    }

    setupVirtualController() {
        const dpad = document.getElementById('dpad');
        const btnFire = document.getElementById('btnFire');
        const btnWeapon = document.getElementById('btnWeapon');
        const btnPause = document.getElementById('btnPause');

        if (!dpad || !btnFire) return;

        // --- D-Pad 十字键多点触控与平滑滑动变向 ---
        let dpadTouchId = null;

        const clearDpadKeys = () => {
            ['w', 's', 'a', 'd'].forEach(k => { this.keys[k] = false; });
            dpad.querySelectorAll('.dpad-btn').forEach(b => b.classList.remove('active'));
        };

        const updateDpadFromCoords = (clientX, clientY) => {
            const rect = dpad.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const dx = clientX - cx;
            const dy = clientY - cy;
            const dist = Math.hypot(dx, dy);

            // 死区判定：离中心小于 16px 视为中立（停止行进）
            if (dist < 16) {
                clearDpadKeys();
                return;
            }

            // 主方向判定 (上下左右十字)
            let targetDir = '';
            if (Math.abs(dx) > Math.abs(dy)) {
                targetDir = dx > 0 ? 'd' : 'a';
            } else {
                targetDir = dy > 0 ? 's' : 'w';
            }

            ['w', 's', 'a', 'd'].forEach(k => {
                this.keys[k] = (k === targetDir);
            });

            dpad.querySelectorAll('.dpad-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.dir === targetDir);
            });
        };

        dpad.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (dpadTouchId === null && e.changedTouches.length > 0) {
                const touch = e.changedTouches[0];
                dpadTouchId = touch.identifier;
                updateDpadFromCoords(touch.clientX, touch.clientY);
            }
        }, { passive: false });

        const onWindowTouchMove = (e) => {
            if (dpadTouchId === null) return;
            for (let i = 0; i < e.touches.length; i++) {
                const touch = e.touches[i];
                if (touch.identifier === dpadTouchId) {
                    updateDpadFromCoords(touch.clientX, touch.clientY);
                    break;
                }
            }
        };

        const onWindowTouchEnd = (e) => {
            if (dpadTouchId === null) return;
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === dpadTouchId) {
                    dpadTouchId = null;
                    clearDpadKeys();
                    break;
                }
            }
        };

        window.addEventListener('touchmove', onWindowTouchMove, { passive: true });
        window.addEventListener('touchend', onWindowTouchEnd, { passive: true });
        window.addEventListener('touchcancel', onWindowTouchEnd, { passive: true });

        // 鼠标事件兼容（方便在桌面端按 F12 调试小屏）
        let dpadMouseDown = false;
        dpad.addEventListener('mousedown', (e) => {
            e.preventDefault();
            dpadMouseDown = true;
            updateDpadFromCoords(e.clientX, e.clientY);
        });
        window.addEventListener('mousemove', (e) => {
            if (dpadMouseDown) {
                updateDpadFromCoords(e.clientX, e.clientY);
            }
        });
        window.addEventListener('mouseup', () => {
            if (dpadMouseDown) {
                dpadMouseDown = false;
                clearDpadKeys();
            }
        });

        // --- 发射按键 (FIRE) ---
        const startFiring = (e) => {
            e.preventDefault();
            this.keys[' '] = true;
            btnFire.classList.add('active');
        };

        const stopFiring = (e) => {
            if (e) e.preventDefault();
            this.keys[' '] = false;
            btnFire.classList.remove('active');
        };

        btnFire.addEventListener('touchstart', startFiring, { passive: false });
        btnFire.addEventListener('touchend', stopFiring, { passive: false });
        btnFire.addEventListener('touchcancel', stopFiring, { passive: false });
        btnFire.addEventListener('mousedown', startFiring);
        btnFire.addEventListener('mouseup', stopFiring);

        // Active pointer IDs live in this closure; exposing a controlled
        // release hook avoids a stale touch/mouse move reasserting direction.
        this.resetVirtualInputs = () => {
            dpadTouchId = null;
            dpadMouseDown = false;
            clearDpadKeys();
            stopFiring();
        };

        // --- 切换武器 ---
        if (btnWeapon) {
            let lastWeaponTime = 0;
            const handleWeaponSwitch = (e) => {
                e.preventDefault();
                const now = Date.now();
                if (now - lastWeaponTime < 250) return;
                lastWeaponTime = now;
                const nextIdx = (this.currentWeaponIndex + 1) % this.weaponKeys.length;
                this.switchWeapon(nextIdx);
            };
            btnWeapon.addEventListener('touchstart', handleWeaponSwitch, { passive: false });
            btnWeapon.addEventListener('click', handleWeaponSwitch);
        }

        // --- 暂停按键 ---
        if (btnPause) {
            let lastPauseTime = 0;
            const handlePause = (e) => {
                e.preventDefault();
                const now = Date.now();
                if (now - lastPauseTime < 250) return;
                lastPauseTime = now;
                this.togglePause();
            };
            btnPause.addEventListener('touchstart', handlePause, { passive: false });
            btnPause.addEventListener('click', handlePause);
        }
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

        // 累计游戏内时钟，AI/射击冷却全部基于它，暂停时不流逝
        this.time += dt * 16.67;

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

        // 射击（使用游戏内时钟）
        if (this.keys[' '] && this.time - this.player.lastShot > this.player.weapon.cooldown) {
            if (this.player.ammo[this.weaponKeys[this.currentWeaponIndex]] > 0 ||
                this.player.weapon.ammo === Infinity) {
                this.shoot(this.player);
                this.player.lastShot = this.time;

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
            
            // 检查与墙的碰撞（直接内联 AABB 测试，避免每面墙分配临时数组）
            const hitWall = this.walls.find(wall => this.rectsOverlap(bullet, wall));
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
            
            if (this.rectsOverlap(this.player, powerUp)) {
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
        sfx.play('powerup');
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

        sfx.play(tank.isPlayer ? 'shoot' : 'shootEnemy');

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
                    if (this.rectsOverlap(bullet, enemy)) {
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
                if (this.rectsOverlap(bullet, this.player)) {
                    this.player.takeDamage(bullet.damage, this);
                    bulletsToRemove.add(bi);
                    this.screenShake = 8;
                    if (this.lives <= 0 && this.gameState === 'playing') {
                        this.gameState = 'gameOver';
                        void this.scoreboard.submit({ boardId: 'all', score: this.score });
                        track('tank-battle', 'finish');
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
                    this.rectsOverlap(this.bullets[i], this.bullets[j])) {
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

    /**
     * 无分配版本的 AABB 相交测试（每帧调用上千次，避免创建临时数组）
     */
    rectsOverlap(a, b) {
        return a.x < b.x + b.width &&
               a.x + a.width > b.x &&
               a.y < b.y + b.height &&
               a.y + a.height > b.y;
    }

    checkWinCondition() {
        if (this.gameState !== 'playing') return;
        if (this.enemies.length === 0) {
            this.level++;
            this.score += 500 * this.level;
            
            if (this.level > CONFIG.MAX_LEVEL) {
                this.gameState = 'victory';
                void this.scoreboard.submit({ boardId: 'all', score: this.score });
                track('tank-battle', 'finish');
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
        
        // Authored terrain is the primary visual; the art module supplies a safe fallback.
        this.art.drawGround(this.ctx, this.width, this.height);
        
        // Wall textures follow the unchanged collision rectangles.
        this.walls.forEach(wall => {
            if (!this.art.drawWall(this.ctx, wall)) this.renderWall(wall);
        });
        
        // Production pickup icons replace emoji while preserving the same hit boxes.
        this.powerUps.forEach(powerUp => powerUp.render(this.ctx, this.art));
        
        // Sprites are rotated from the same integer direction used by bullets.
        this.player.render(this.ctx, this.art);
        this.enemies.forEach(enemy => enemy.render(this.ctx, this.art));
        
        // 绘制子弹
        this.bullets.forEach(bullet => bullet.render(this.ctx));
        
        // 绘制粒子效果
        this.particles.forEach(particle => particle.render(this.ctx));
        if (this.debugHitbox) this.renderDebugHitboxes();
        
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

    renderDebugHitboxes() {
        const ctx = this.ctx;
        ctx.save();
        ctx.lineWidth = 1;
        const rect = (object, color) => {
            ctx.strokeStyle = color;
            ctx.strokeRect(object.x, object.y, object.width, object.height);
        };
        this.walls.forEach(wall => rect(wall, wall.type === 'steel' ? '#b9d2cc' : '#e9b08a'));
        if (this.player) rect(this.player, '#d6c17b');
        this.enemies.forEach(enemy => rect(enemy, enemy.isBoss ? '#f3b36e' : '#f39b91'));
        this.bullets.forEach(bullet => rect(bullet, bullet.isPlayer ? '#b9f4d2' : '#f39b91'));
        this.powerUps.forEach(powerUp => rect(powerUp, '#d6c17b'));
        ctx.restore();
    }

    renderGrid() {}

    renderWall(wall) {
        const ctx = this.ctx;
        
        if (wall.type === 'steel') {
            // 钢板墙 - 银灰色金属质感（渐变对象缓存在墙对象上，避免每帧重建）
            if (!wall._gradient) {
                const gradient = ctx.createLinearGradient(wall.x, wall.y, wall.x + wall.width, wall.y + wall.height);
                gradient.addColorStop(0, '#C0C0C0');
                gradient.addColorStop(0.5, '#808080');
                gradient.addColorStop(1, '#404040');
                wall._gradient = gradient;
            }
            ctx.fillStyle = wall._gradient;
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
        
        this.art.drawMiniMapBase(this.miniMapCtx, 120, 90);
        
        // 绘制墙壁
        this.walls.forEach(wall => {
            if (wall.type === 'steel') {
                this.miniMapCtx.fillStyle = '#7b9290'; // steel
            } else if (wall.type === 'brick' || wall.destructible) {
                this.miniMapCtx.fillStyle = '#b66f56'; // brick
            } else {
                this.miniMapCtx.fillStyle = '#496066'; // boundary
            }
            this.miniMapCtx.fillRect(
                wall.x * scale, wall.y * scale,
                wall.width * scale, wall.height * scale
            );
        });
        
        // 绘制玩家
        this.miniMapCtx.fillStyle = '#5fe0aa';
        this.miniMapCtx.fillRect(
            this.player.x * scale, this.player.y * scale,
            this.player.width * scale, this.player.height * scale
        );
        
        // 绘制敌人
        this.enemies.forEach(enemy => {
            if (enemy.isBoss) {
                this.miniMapCtx.fillStyle = '#d6c17b'; // boss
            } else {
                this.miniMapCtx.fillStyle = '#d36b61'; // enemy
            }
            this.miniMapCtx.fillRect(
                enemy.x * scale, enemy.y * scale,
                enemy.width * scale, enemy.height * scale
            );
        });
        
        // Power-ups stay flat on the minimap for a fast, readable overview.
        this.miniMapCtx.fillStyle = '#d6c17b';
        this.powerUps.forEach(powerUp => {
            this.miniMapCtx.fillRect(
                powerUp.x * scale, powerUp.y * scale,
                2, 2
            );
        });

        // The canvas owns the minimap pixels, so the authored frame must be composited last.
        this.art.drawMiniMapFrame(this.miniMapCtx, 120, 90);
    }

    renderGameOver() {
        const restartMsg = isTouchDevice() ? t('restartHintMobile') : t('restartHint');
        this.renderOverlay(t('gameOver'), '#ff4444', [
            `${t('finalScore')}: ${this.score}`,
            `${t('reachedLevel')}: ${this.level}`,
            restartMsg
        ]);
    }

    renderVictory() {
        const restartMsg = isTouchDevice() ? t('restartHintMobile') : t('restartChallenge');
        this.renderOverlay(t('victory'), '#44ff44', [
            `${t('finalScore')}: ${this.score}`,
            t('victoryMessage'),
            restartMsg
        ]);
    }

    renderPaused() {
        const continueMsg = isTouchDevice() ? t('continueHintMobile') : t('continueHint');
        this.renderOverlay(t('paused'), '#ffff44', [
            continueMsg
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
        const levelText = isBossLevel ? `${this.level} BOSS` : this.level;
        document.getElementById('level').textContent = levelText;
        
        document.getElementById('enemies').textContent = this.enemies.length;
        document.getElementById('currentWeapon').textContent = getWeaponName(this.player.weapon);
        
        const currentAmmo = this.player.ammo[this.weaponKeys[this.currentWeaponIndex]];
        document.getElementById('ammo').textContent = 
            currentAmmo === Infinity ? '∞' : currentAmmo;

        // 同步移动端手柄武器角标
        const vWeaponBadge = document.getElementById('vWeaponBadge');
        if (vWeaponBadge) {
            vWeaponBadge.textContent = `${this.currentWeaponIndex + 1}`;
        }
        this.updateWeaponIcons();
    }

    updateWeaponIcons() {
        this.art.setWeaponIcon(document.getElementById('weaponHudIcon'), this.currentWeaponIndex);
        this.art.setWeaponIcon(document.getElementById('vWeaponIcon'), this.currentWeaponIndex);
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
        this.time = 0; // 重置游戏内时钟
        this.currentWeaponIndex = 0;
        this.init();
        this.gameLoop();
    }

    gameLoop(time = 0) {
        const dt = this.lastTime > 0 ? Math.min((time - this.lastTime) / 16.67, 3) : 1;
        this.lastTime = time;
        this.update(dt);
        this.render();
        // 结束后停止循环，结束画面是静态的，继续 60fps 渲染只是空耗电
        // （restart() 会重新启动循环）
        if (this.gameState === 'gameOver' || this.gameState === 'victory') {
            this.animationId = null;
            return;
        }
        this.animationId = requestAnimationFrame((t) => this.gameLoop(t));
    }
}

// 启动游戏
window.addEventListener('load', () => {
    updateUILabels(); // 初始化UI标签
    bindOrientationArtFallback();
    window.tankBattleInstance = new TankBattle();
});
window.addEventListener('site-settings:changed', () => {
    currentLanguage = getLang();
    updateUILabels();
});
