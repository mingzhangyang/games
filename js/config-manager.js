// 配置管理器
class ConfigManager {
    constructor() {
        this.config = null;
        this.defaultConfig = {
            game: {
                title: "魂斗罗 - 经典复刻版",
                version: "2.0.0",
                canvas: { width: 800, height: 600 },
                fps: { target: 60, showCounter: true }
            },
            player: {
                startLives: 3,
                maxLives: 5,
                speed: 5,
                jumpPower: 15,
                size: { width: 30, height: 40 },
                invulnerabilityTime: 120,
                weaponDuration: 1800
            },
            weapons: {
                normal: {
                    damage: 1, cooldown: 10, speed: 10,
                    size: { width: 8, height: 4 }
                },
                spread: {
                    damage: 1, cooldown: 10, speed: 8,
                    size: { width: 6, height: 6 }, count: 3
                },
                laser: {
                    damage: 2, cooldown: 15, speed: 15,
                    size: { width: 20, height: 3 }
                }
            },
            enemies: {
                soldier: {
                    health: 1, speed: 1, shootCooldown: 120,
                    points: 100, size: { width: 30, height: 30 }
                },
                turret: {
                    health: 3, shootCooldown: 80,
                    points: 200, size: { width: 40, height: 40 }
                },
                boss: {
                    health: 10, shootCooldown: 60, points: 1000,
                    size: { width: 50, height: 50 }, moveTimer: 120
                }
            },
            physics: {
                gravity: 0.8,
                maxFallSpeed: 20,
                friction: 0.8
            },
            camera: {
                followSpeed: 1.0,
                maxX: 1200
            },
            levels: {
                healthMultiplier: 0.3,
                speedMultiplier: 0.2,
                bonusPoints: 5000
            },
            objectPools: {
                bullets: 50,
                particles: 100
            },
            audio: {
                enabled: true,
                masterVolume: 0.7,
                sfxVolume: 0.8,
                musicVolume: 0.6
            },
            graphics: {
                pixelated: true,
                showParticles: true,
                backgroundLayers: 3,
                viewportCulling: true
            },
            controls: {
                keyboard: {
                    left: "ArrowLeft",
                    right: "ArrowRight",
                    jump: "ArrowUp",
                    shoot: "Space",
                    pause: "KeyP"
                },
                touch: {
                    enabled: true,
                    sensitivity: 1.0
                }
            },
            debug: {
                enabled: false,
                showCollisionBoxes: false,
                showFPS: true,
                showObjectCount: false,
                godMode: false
            }
        };
    }

    async loadConfig() {
        try {
            const response = await fetch('config/game-config.json');
            if (response.ok) {
                this.config = await response.json();
                console.log('配置文件加载成功');
            } else {
                throw new Error('配置文件加载失败');
            }
        } catch (error) {
            console.warn('使用默认配置:', error.message);
            this.config = this.defaultConfig;
        }
        
        // 验证配置完整性
        this.validateConfig();
        return this.config;
    }

    validateConfig() {
        // 深度合并默认配置，确保所有必需的配置项都存在
        this.config = this.deepMerge(this.defaultConfig, this.config);
    }

    deepMerge(target, source) {
        const result = { ...target };
        
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.deepMerge(target[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        
        return result;
    }

    get(path) {
        if (!this.config) {
            console.error('配置未加载');
            return null;
        }

        const keys = path.split('.');
        let current = this.config;
        
        for (const key of keys) {
            if (current[key] === undefined) {
                console.warn(`配置路径不存在: ${path}`);
                return null;
            }
            current = current[key];
        }
        
        return current;
    }

    set(path, value) {
        if (!this.config) {
            console.error('配置未加载');
            return false;
        }

        const keys = path.split('.');
        let current = this.config;
        
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!current[key] || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }
        
        current[keys[keys.length - 1]] = value;
        return true;
    }

    // 保存配置到本地存储
    saveToLocalStorage() {
        try {
            localStorage.setItem('game-config', JSON.stringify(this.config));
            return true;
        } catch (error) {
            console.error('保存配置失败:', error);
            return false;
        }
    }

    // 从本地存储加载配置
    loadFromLocalStorage() {
        try {
            const saved = localStorage.getItem('game-config');
            if (saved) {
                const savedConfig = JSON.parse(saved);
                this.config = this.deepMerge(this.defaultConfig, savedConfig);
                return true;
            }
        } catch (error) {
            console.error('从本地存储加载配置失败:', error);
        }
        return false;
    }

    // 重置为默认配置
    resetToDefault() {
        this.config = JSON.parse(JSON.stringify(this.defaultConfig));
        this.saveToLocalStorage();
    }

    // 获取调试模式状态
    isDebugMode() {
        return this.get('debug.enabled') || false;
    }

    // 切换调试模式
    toggleDebugMode() {
        const current = this.isDebugMode();
        this.set('debug.enabled', !current);
        this.saveToLocalStorage();
        return !current;
    }

    // 获取性能配置
    getPerformanceConfig() {
        return {
            targetFPS: this.get('game.fps.target'),
            showFPS: this.get('game.fps.showCounter'),
            viewportCulling: this.get('graphics.viewportCulling'),
            showParticles: this.get('graphics.showParticles')
        };
    }

    // 获取控制配置
    getControlConfig() {
        return {
            keyboard: this.get('controls.keyboard'),
            touch: this.get('controls.touch')
        };
    }

    // 获取音频配置
    getAudioConfig() {
        return this.get('audio');
    }

    // 更新音频设置
    updateAudioSettings(settings) {
        for (const [key, value] of Object.entries(settings)) {
            this.set(`audio.${key}`, value);
        }
        this.saveToLocalStorage();
    }

    // 获取游戏难度设置
    getDifficultyMultipliers(level) {
        const base = this.get('levels');
        return {
            health: 1 + (level - 1) * base.healthMultiplier,
            speed: 1 + (level - 1) * base.speedMultiplier,
            bonusPoints: base.bonusPoints * level
        };
    }
}

// ES模块导出
export default ConfigManager;

// 全局配置管理器实例
if (typeof window !== 'undefined') {
    window.gameConfig = new ConfigManager();
    window.ConfigManager = ConfigManager;
}