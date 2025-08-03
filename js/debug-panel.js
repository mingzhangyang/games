// 调试面板
class DebugPanel {
    constructor(game) {
        this.game = game;
        this.isVisible = false;
        this.element = null;
        this.updateInterval = null;
        
        this.createPanel();
        this.setupEventListeners();
    }

    createPanel() {
        this.element = document.createElement('div');
        this.element.id = 'debug-panel';
        this.element.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            background: rgba(0, 0, 0, 0.9);
            color: #00ff00;
            font-family: 'Courier New', monospace;
            font-size: 11px;
            padding: 15px;
            border-radius: 8px;
            z-index: 1001;
            min-width: 300px;
            max-width: 400px;
            display: none;
            user-select: none;
            border: 1px solid #333;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
        `;
        
        document.body.appendChild(this.element);
    }

    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            if (e.code === 'F4') {
                e.preventDefault();
                this.toggle();
            }
            
            // 调试快捷键
            if (this.isVisible) {
                switch (e.code) {
                    case 'F5':
                        e.preventDefault();
                        this.toggleGodMode();
                        break;
                    case 'F6':
                        e.preventDefault();
                        this.addLife();
                        break;
                    case 'F7':
                        e.preventDefault();
                        this.nextLevel();
                        break;
                    case 'F8':
                        e.preventDefault();
                        this.toggleCollisionBoxes();
                        break;
                }
            }
        });
    }

    toggle() {
        this.isVisible = !this.isVisible;
        this.element.style.display = this.isVisible ? 'block' : 'none';
        
        if (this.isVisible) {
            this.startUpdating();
        } else {
            this.stopUpdating();
        }
    }

    show() {
        this.isVisible = true;
        this.element.style.display = 'block';
        this.startUpdating();
    }

    hide() {
        this.isVisible = false;
        this.element.style.display = 'none';
        this.stopUpdating();
    }

    startUpdating() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        this.updateInterval = setInterval(() => {
            this.updateDisplay();
        }, 100); // 每100ms更新一次
    }

    stopUpdating() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    updateDisplay() {
        if (!this.isVisible || !this.game) return;
        
        const player = this.game.player;
        const objectManager = this.game.objectManager;
        const performanceMonitor = this.game.performanceMonitor;
        const config = this.game.config;
        
        const formatNumber = (num, decimals = 1) => {
            return typeof num === 'number' ? num.toFixed(decimals) : '0.0';
        };
        
        const getStateColor = (state) => {
            const colors = {
                'loading': '#ffff00',
                'start': '#00ffff',
                'playing': '#00ff00',
                'paused': '#ff8800',
                'gameOver': '#ff0000',
                'error': '#ff0000'
            };
            return colors[state] || '#ffffff';
        };
        
        this.element.innerHTML = `
            <div style="border-bottom: 2px solid #333; margin-bottom: 10px; padding-bottom: 8px;">
                <strong style="color: #00ffff;">🛠️ 调试面板 (F4切换)</strong>
            </div>
            
            <div style="margin-bottom: 12px;">
                <div style="color: #ffff00; font-weight: bold; margin-bottom: 5px;">📊 游戏状态</div>
                <div>状态: <span style="color: ${getStateColor(this.game.gameState)}">${this.game.gameState}</span></div>
                <div>分数: <span style="color: #00ff00">${this.game.score}</span></div>
                <div>生命: <span style="color: #ff6666">${this.game.lives}</span></div>
                <div>等级: <span style="color: #66ff66">${this.game.currentLevel}</span></div>
                <div>摄像机X: <span style="color: #6666ff">${formatNumber(this.game.cameraX)}</span></div>
            </div>
            
            ${player ? `
            <div style="margin-bottom: 12px;">
                <div style="color: #ffff00; font-weight: bold; margin-bottom: 5px;">🎮 玩家信息</div>
                <div>位置: (${formatNumber(player.x)}, ${formatNumber(player.y)})</div>
                <div>速度: (${formatNumber(player.velocityX)}, ${formatNumber(player.velocityY)})</div>
                <div>武器: <span style="color: #ff8800">${player.weapon}</span></div>
                <div>武器计时: ${player.weaponTimer}</div>
                <div>射击冷却: ${player.shootCooldown}</div>
                <div>无敌状态: <span style="color: ${player.invulnerable ? '#ff0000' : '#00ff00'}">${player.invulnerable ? '是' : '否'}</span></div>
                <div>在地面: <span style="color: ${player.onGround ? '#00ff00' : '#ff0000'}">${player.onGround ? '是' : '否'}</span></div>
            </div>
            ` : ''}
            
            ${objectManager ? `
            <div style="margin-bottom: 12px;">
                <div style="color: #ffff00; font-weight: bold; margin-bottom: 5px;">🎯 对象统计</div>
                <div>子弹: ${objectManager.bullets.length} / ${objectManager.maxBullets}</div>
                <div>敌人: ${objectManager.enemies.length}</div>
                <div>道具: ${objectManager.powerUps.length}</div>
                <div>平台: ${objectManager.platforms.length}</div>
                <div>粒子: ${this.game.particleSystem ? this.game.particleSystem.particles.filter(p => p.active).length : 0}</div>
            </div>
            ` : ''}
            
            ${performanceMonitor ? `
            <div style="margin-bottom: 12px;">
                <div style="color: #ffff00; font-weight: bold; margin-bottom: 5px;">⚡ 性能信息</div>
                <div>FPS: <span style="color: ${this.getFPSColor(performanceMonitor.metrics.fps.current)}">${formatNumber(performanceMonitor.metrics.fps.current)}</span></div>
                <div>帧时间: ${formatNumber(performanceMonitor.metrics.frameTime.current)}ms</div>
                <div>更新时间: ${formatNumber(performanceMonitor.metrics.updateTime)}ms</div>
                <div>渲染时间: ${formatNumber(performanceMonitor.metrics.renderTime)}ms</div>
                <div>绘制调用: ${performanceMonitor.metrics.drawCalls}</div>
            </div>
            ` : ''}
            
            ${config ? `
            <div style="margin-bottom: 12px;">
                <div style="color: #ffff00; font-weight: bold; margin-bottom: 5px;">⚙️ 配置信息</div>
                <div>调试模式: <span style="color: ${config.isDebugMode() ? '#00ff00' : '#ff0000'}">${config.isDebugMode() ? '开启' : '关闭'}</span></div>
                <div>音频: <span style="color: ${config.get('audio.enabled') ? '#00ff00' : '#ff0000'}">${config.get('audio.enabled') ? '开启' : '关闭'}</span></div>
                <div>粒子效果: <span style="color: ${config.get('graphics.showParticles') ? '#00ff00' : '#ff0000'}">${config.get('graphics.showParticles') ? '开启' : '关闭'}</span></div>
                <div>视口裁剪: <span style="color: ${config.get('graphics.viewportCulling') ? '#00ff00' : '#ff0000'}">${config.get('graphics.viewportCulling') ? '开启' : '关闭'}</span></div>
            </div>
            ` : ''}
            
            <div style="margin-bottom: 12px;">
                <div style="color: #ffff00; font-weight: bold; margin-bottom: 5px;">🎮 调试快捷键</div>
                <div style="font-size: 10px; color: #888;">
                    F4: 切换调试面板<br>
                    F5: 切换无敌模式<br>
                    F6: 增加生命<br>
                    F7: 下一关<br>
                    F8: 切换碰撞框显示
                </div>
            </div>
            
            <div style="font-size: 10px; color: #666; border-top: 1px solid #333; padding-top: 8px;">
                帧数: ${performanceMonitor ? performanceMonitor.frameCount : 0}<br>
                版本: ${config ? config.get('game.version') : 'Unknown'}
            </div>
        `;
    }

    getFPSColor(fps) {
        if (fps >= 55) return '#00ff00';
        if (fps >= 30) return '#ffff00';
        return '#ff0000';
    }

    // 调试功能
    toggleGodMode() {
        if (this.game.config) {
            const current = this.game.config.get('debug.godMode');
            this.game.config.set('debug.godMode', !current);
            
            if (this.game.player) {
                this.game.player.invulnerable = !current;
                this.game.player.invulnerabilityTimer = !current ? 999999 : 0;
            }
            
            console.log(`无敌模式: ${!current ? '开启' : '关闭'}`);
        }
    }

    addLife() {
        if (this.game.lives < this.game.config.get('player.maxLives')) {
            this.game.lives++;
            this.game.updateUI();
            console.log('增加了一条生命');
        }
    }

    nextLevel() {
        if (this.game.gameState === 'playing') {
            this.game.currentLevel++;
            this.game.initLevel();
            console.log(`跳转到第 ${this.game.currentLevel} 关`);
        }
    }

    toggleCollisionBoxes() {
        if (this.game.config) {
            const current = this.game.config.get('debug.showCollisionBoxes');
            this.game.config.set('debug.showCollisionBoxes', !current);
            console.log(`碰撞框显示: ${!current ? '开启' : '关闭'}`);
        }
    }

    // 获取调试信息
    getDebugInfo() {
        return {
            gameState: this.game.gameState,
            score: this.game.score,
            lives: this.game.lives,
            level: this.game.currentLevel,
            player: this.game.player ? {
                position: { x: this.game.player.x, y: this.game.player.y },
                velocity: { x: this.game.player.velocityX, y: this.game.player.velocityY },
                weapon: this.game.player.weapon,
                invulnerable: this.game.player.invulnerable
            } : null,
            objects: this.game.objectManager ? {
                bullets: this.game.objectManager.bullets.length,
                enemies: this.game.objectManager.enemies.length,
                powerUps: this.game.objectManager.powerUps.length,
                particles: this.game.particleSystem ? this.game.particleSystem.particles.filter(p => p.active).length : 0
            } : null,
            performance: this.game.performanceMonitor ? this.game.performanceMonitor.getPerformanceReport() : null
        };
    }

    // 导出调试日志
    exportDebugLog() {
        const debugInfo = this.getDebugInfo();
        const timestamp = new Date().toISOString();
        
        const logData = {
            timestamp: timestamp,
            gameVersion: this.game.config ? this.game.config.get('game.version') : 'Unknown',
            debugInfo: debugInfo,
            performanceIssues: this.game.performanceMonitor ? this.game.performanceMonitor.checkPerformanceIssues() : [],
            optimizationSuggestions: this.game.performanceMonitor ? this.game.performanceMonitor.getOptimizationSuggestions() : []
        };
        
        const blob = new Blob([JSON.stringify(logData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `game-debug-${timestamp.replace(/[:.]/g, '-')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
        console.log('调试日志已导出');
    }

    destroy() {
        this.stopUpdating();
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }
}