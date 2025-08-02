/**
 * 粒子效果系统 - 处理视觉反馈效果
 * Particle Effects System for Math Rain Game
 */

class ParticleSystem {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.particles = [];
        this.maxParticles = 100;
        this.isEnabled = true;
        this.isMobileMode = false;
        
        // 性能相关
        this.frameSkipCounter = 0;
        this.targetFPS = 60;
        this.lastFrameTime = 0;
        
        // 预设的粒子效果配置
        this.presets = {
            correct: {
                count: 20,
                colors: ['#48bb78', '#68d391', '#9ae6b4', '#c6f6d5'],
                size: { min: 2, max: 8 },
                speed: { min: 2, max: 8 },
                life: { min: 800, max: 1500 },
                gravity: 0.1,
                fade: true,
                shape: 'circle'
            },
            incorrect: {
                count: 15,
                colors: ['#e53e3e', '#fc8181', '#feb2b2', '#fed7d7'],
                size: { min: 1, max: 6 },
                speed: { min: 1, max: 5 },
                life: { min: 600, max: 1000 },
                gravity: 0.05,
                fade: true,
                shape: 'square'
            },
            combo: {
                count: 30,
                colors: ['#ed8936', '#f6ad55', '#fbd38d', '#feebc8'],
                size: { min: 3, max: 10 },
                speed: { min: 3, max: 10 },
                life: { min: 1000, max: 2000 },
                gravity: -0.05, // 向上飘
                fade: true,
                shape: 'star'
            },
            explosion: {
                count: 40,
                colors: ['#667eea', '#764ba2', '#a78bfa', '#c4b5fd'],
                size: { min: 2, max: 12 },
                speed: { min: 5, max: 15 },
                life: { min: 500, max: 1200 },
                gravity: 0.2,
                fade: true,
                shape: 'circle'
            }
        };
        
        // 检测设备性能
        this.detectDeviceCapabilities();
        
        // 绑定更新循环
        this.update = this.update.bind(this);
        this.isRunning = false;
    }

    /**
     * 启动粒子系统
     */
    start() {
        if (!this.isRunning) {
            this.isRunning = true;
            this.lastTime = performance.now();
            this.updateLoop();
        }
    }

    /**
     * 停止粒子系统
     */
    stop() {
        this.isRunning = false;
    }

    /**
     * 设置画布尺寸
     */
    resize(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
    }

    /**
     * 启用/禁用粒子效果
     */
    setEnabled(enabled) {
        this.isEnabled = enabled;
        if (!enabled) {
            this.particles = [];
        }
    }

    /**
     * 主更新循环
     */
    updateLoop() {
        if (!this.isRunning) return;
        
        const currentTime = performance.now();
        const deltaTime = currentTime - (this.lastTime || currentTime);
        this.lastTime = currentTime;
        
        this.update(deltaTime);
        requestAnimationFrame(() => this.updateLoop());
    }

    /**
     * 更新粒子系统（不清除画布）
     */
    update(deltaTime) {
        if (!this.isEnabled) return;
        
        // 更新所有粒子
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            
            if (this.updateParticle(particle, deltaTime)) {
                this.particles.splice(i, 1);
            } else {
                this.renderParticle(particle);
            }
        }
    }

    /**
     * 更新单个粒子
     * @param {Object} particle - 粒子对象
     * @param {number} deltaTime - 时间差
     * @returns {boolean} 是否应该销毁
     */
    updateParticle(particle, deltaTime) {
        // 更新生命周期
        particle.age += deltaTime;
        if (particle.age >= particle.life) {
            return true; // 销毁粒子
        }

        // 更新位置
        particle.x += particle.vx * deltaTime * 0.01;
        particle.y += particle.vy * deltaTime * 0.01;
        
        // 应用重力
        particle.vy += particle.gravity * deltaTime * 0.01;
        
        // 更新透明度（淡出效果）
        if (particle.fade) {
            particle.alpha = 1 - (particle.age / particle.life);
        }
        
        // 更新大小（可选的大小变化）
        if (particle.sizeChange) {
            const progress = particle.age / particle.life;
            particle.currentSize = particle.size * (1 - progress * particle.sizeChange);
        }

        return false;
    }

    /**
     * 渲染单个粒子
     */
    renderParticle(particle) {
        this.ctx.save();
        
        // 设置透明度
        this.ctx.globalAlpha = particle.alpha;
        
        // 设置颜色
        this.ctx.fillStyle = particle.color;
        this.ctx.strokeStyle = particle.color;
        
        // 移动到粒子位置
        this.ctx.translate(particle.x, particle.y);
        
        // 根据形状渲染
        switch (particle.shape) {
            case 'circle':
                this.renderCircleParticle(particle);
                break;
            case 'square':
                this.renderSquareParticle(particle);
                break;
            case 'star':
                this.renderStarParticle(particle);
                break;
            case 'triangle':
                this.renderTriangleParticle(particle);
                break;
            default:
                this.renderCircleParticle(particle);
        }
        
        this.ctx.restore();
    }

    /**
     * 渲染圆形粒子
     */
    renderCircleParticle(particle) {
        this.ctx.beginPath();
        this.ctx.arc(0, 0, particle.currentSize || particle.size, 0, Math.PI * 2);
        this.ctx.fill();
    }

    /**
     * 渲染方形粒子
     */
    renderSquareParticle(particle) {
        const size = particle.currentSize || particle.size;
        this.ctx.fillRect(-size/2, -size/2, size, size);
    }

    /**
     * 渲染星形粒子
     */
    renderStarParticle(particle) {
        const size = particle.currentSize || particle.size;
        const spikes = 5;
        const outerRadius = size;
        const innerRadius = size * 0.5;
        
        this.ctx.beginPath();
        
        for (let i = 0; i < spikes * 2; i++) {
            const angle = (i * Math.PI) / spikes;
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        
        this.ctx.closePath();
        this.ctx.fill();
    }

    /**
     * 渲染三角形粒子
     */
    renderTriangleParticle(particle) {
        const size = particle.currentSize || particle.size;
        
        this.ctx.beginPath();
        this.ctx.moveTo(0, -size);
        this.ctx.lineTo(-size, size);
        this.ctx.lineTo(size, size);
        this.ctx.closePath();
        this.ctx.fill();
    }

    /**
     * 创建粒子爆炸效果
     * @param {number} x - X坐标
     * @param {number} y - Y坐标
     * @param {string} preset - 预设名称
     * @param {Object} options - 额外选项
     */
    /**
     * 检测设备性能能力
     */
    detectDeviceCapabilities() {
        // 检测是否为移动设备
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (isMobile) {
            this.setMobileMode(true);
        }
        
        // 检测硬件加速支持
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        this.hasHardwareAcceleration = !!gl;
        
        // 根据设备能力调整配置
        if (!this.hasHardwareAcceleration || isMobile) {
            this.maxParticles = Math.min(50, this.maxParticles);
            this.targetFPS = 30;
        }
    }

    /**
     * 设置移动端模式
     */
    setMobileMode(enabled) {
        this.isMobileMode = enabled;
        
        if (enabled) {
            // 移动端优化：减少粒子数量和复杂度
            this.maxParticles = 30;
            this.targetFPS = 30;
            
            // 简化预设配置
            Object.keys(this.presets).forEach(key => {
                const preset = this.presets[key];
                preset.count = Math.max(5, Math.floor(preset.count * 0.5));
                preset.life.min = Math.floor(preset.life.min * 0.7);
                preset.life.max = Math.floor(preset.life.max * 0.7);
            });
        }
    }

    /**
     * 性能监控和帧率控制
     */
    shouldSkipFrame() {
        const now = performance.now();
        const deltaTime = now - this.lastFrameTime;
        const targetFrameTime = 1000 / this.targetFPS;
        
        if (deltaTime < targetFrameTime) {
            return true;
        }
        
        this.lastFrameTime = now;
        return false;
    }

    /**
     * 批量更新粒子（性能优化版本）
     */
    updateParticlesBatch() {
        if (this.particles.length === 0) return;
        
        // 如果帧率过低，跳过当前帧
        if (this.shouldSkipFrame()) {
            this.frameSkipCounter++;
            return;
        }
        
        this.frameSkipCounter = 0;
        
        // 批量处理粒子更新
        const batchSize = this.isMobileMode ? 10 : 20;
        const currentBatch = this.particles.splice(0, Math.min(batchSize, this.particles.length));
        
        currentBatch.forEach(particle => {
            this.updateSingleParticle(particle);
        });
        
        // 将存活的粒子放回数组
        this.particles = [...this.particles, ...currentBatch.filter(p => p.age < p.life)];
    }

    /**
     * 更新单个粒子
     */
    updateSingleParticle(particle) {
        try {
            particle.age += 16; // 假设60fps
            
            // 移动粒子
            particle.x += particle.vx;
            particle.y += particle.vy;
            
            // 应用重力
            if (particle.gravity) {
                particle.vy += particle.gravity;
            }
            
            // 更新透明度（淡出效果）
            if (particle.fade) {
                particle.alpha = 1 - (particle.age / particle.life);
            }
            
            // 更新大小变化
            if (particle.sizeChange) {
                particle.currentSize = particle.size + (particle.sizeChange * particle.age / particle.life);
            } else {
                particle.currentSize = particle.size;
            }
        } catch (error) {
            particle.age = particle.life; // 标记为死亡
        }
    }

    createExplosion(x, y, preset = 'explosion', options = {}) {
        if (!this.isEnabled) return;
        
        const config = { ...this.presets[preset], ...options };
        
        // 移动端减少粒子数量
        const particleCount = this.isMobileMode ? 
            Math.floor(config.count * 0.6) : config.count;
        
        for (let i = 0; i < particleCount; i++) {
            // 限制粒子总数
            if (this.particles.length >= this.maxParticles) {
                break;
            }
            
            const particle = this.createParticle(x, y, config);
            this.particles.push(particle);
        }
    }

    /**
     * 创建单个粒子
     */
    createParticle(x, y, config) {
        // 随机角度和速度
        const angle = Math.random() * Math.PI * 2;
        const speed = this.randomBetween(config.speed.min, config.speed.max);
        
        return {
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: this.randomBetween(config.size.min, config.size.max),
            currentSize: null,
            color: config.colors[Math.floor(Math.random() * config.colors.length)],
            life: this.randomBetween(config.life.min, config.life.max),
            age: 0,
            alpha: 1,
            gravity: config.gravity || 0,
            fade: config.fade || false,
            shape: config.shape || 'circle',
            sizeChange: config.sizeChange || 0
        };
    }

    /**
     * 创建连击效果
     */
    createComboEffect(x, y, comboCount) {
        // 根据连击数调整效果强度
        const intensity = Math.min(comboCount / 10, 2);
        
        this.createExplosion(x, y, 'combo', {
            count: Math.floor(30 * intensity),
            size: {
                min: 3 * intensity,
                max: 10 * intensity
            },
            speed: {
                min: 3 * intensity,
                max: 10 * intensity
            }
        });
        
        // 添加文字效果（如果需要）
        this.createTextEffect(x, y - 30, `${comboCount}x Combo!`, {
            color: '#ed8936',
            size: 16 + comboCount * 2,
            duration: 1500
        });
    }

    /**
     * 创建正确答案效果
     */
    createCorrectEffect(x, y) {
        this.createExplosion(x, y, 'correct');
        
        // 添加向上飘的星星 - 使用 requestAnimationFrame 精确控制时间
        for (let i = 0; i < 5; i++) {
            const delayTime = Date.now() + (i * 200);
            const delayedEffect = () => {
                if (Date.now() >= delayTime) {
                    this.createExplosion(
                        x + (Math.random() - 0.5) * 60,
                        y + (Math.random() - 0.5) * 30,
                        'combo',
                        { count: 3, gravity: -0.1 }
                    );
                } else {
                    requestAnimationFrame(delayedEffect);
                }
            };
            requestAnimationFrame(delayedEffect);
        }
    }

    /**
     * 创建错误答案效果
     */
    createIncorrectEffect(x, y) {
        this.createExplosion(x, y, 'incorrect');
        
        // 添加震动效果的视觉反馈
        this.createShockWave(x, y, {
            color: '#e53e3e',
            maxRadius: 50,
            duration: 300
        });
    }

    /**
     * 创建冲击波效果
     */
    createShockWave(x, y, options = {}) {
        const shockWave = {
            x: x,
            y: y,
            radius: 0,
            maxRadius: options.maxRadius || 100,
            color: options.color || '#667eea',
            alpha: 1,
            life: options.duration || 500,
            age: 0,
            lineWidth: options.lineWidth || 3
        };

        // 添加到特殊效果列表
        this.specialEffects = this.specialEffects || [];
        this.specialEffects.push(shockWave);
    }

    /**
     * 创建文字效果
     */
    createTextEffect(x, y, text, options = {}) {
        const textEffect = {
            x: x,
            y: y,
            text: text,
            color: options.color || '#ffffff',
            size: options.size || 20,
            alpha: 1,
            vy: options.vy || -2, // 向上移动
            life: options.duration || 1000,
            age: 0,
            fade: true
        };

        this.textEffects = this.textEffects || [];
        this.textEffects.push(textEffect);
    }

    /**
     * 更新和渲染特殊效果
     */
    updateSpecialEffects(deltaTime) {
        // 更新冲击波
        if (this.specialEffects) {
            for (let i = this.specialEffects.length - 1; i >= 0; i--) {
                const effect = this.specialEffects[i];
                effect.age += deltaTime;
                
                if (effect.age >= effect.life) {
                    this.specialEffects.splice(i, 1);
                    continue;
                }
                
                const progress = effect.age / effect.life;
                effect.radius = effect.maxRadius * progress;
                effect.alpha = 1 - progress;
                
                // 渲染冲击波
                this.ctx.save();
                this.ctx.globalAlpha = effect.alpha;
                this.ctx.strokeStyle = effect.color;
                this.ctx.lineWidth = effect.lineWidth;
                this.ctx.beginPath();
                this.ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
                this.ctx.stroke();
                this.ctx.restore();
            }
        }
        
        // 更新文字效果
        if (this.textEffects) {
            for (let i = this.textEffects.length - 1; i >= 0; i--) {
                const effect = this.textEffects[i];
                effect.age += deltaTime;
                
                if (effect.age >= effect.life) {
                    this.textEffects.splice(i, 1);
                    continue;
                }
                
                effect.y += effect.vy * deltaTime * 0.01;
                
                if (effect.fade) {
                    effect.alpha = 1 - (effect.age / effect.life);
                }
                
                // 渲染文字
                this.ctx.save();
                this.ctx.globalAlpha = effect.alpha;
                this.ctx.fillStyle = effect.color;
                this.ctx.font = `bold ${effect.size}px Arial`;
                this.ctx.textAlign = 'center';
                this.ctx.fillText(effect.text, effect.x, effect.y);
                this.ctx.restore();
            }
        }
    }

    /**
     * 清除所有粒子和效果
     */
    clear() {
        this.particles = [];
        this.specialEffects = [];
        this.textEffects = [];
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * 获取随机数
     */
    randomBetween(min, max) {
        return Math.random() * (max - min) + min;
    }

    /**
     * 获取粒子数量
     */
    getParticleCount() {
        return this.particles.length;
    }

    /**
     * 设置最大粒子数
     */
    setMaxParticles(max) {
        this.maxParticles = max;
    }
}

// 导出供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ParticleSystem;
} else {
    window.ParticleSystem = ParticleSystem;
}