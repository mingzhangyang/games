// 性能监控器
class PerformanceMonitor {
    constructor() {
        this.metrics = {
            fps: {
                current: 0,
                average: 0,
                min: Infinity,
                max: 0,
                history: []
            },
            frameTime: {
                current: 0,
                average: 0,
                max: 0
            },
            memory: {
                used: 0,
                total: 0,
                percentage: 0
            },
            objects: {
                bullets: 0,
                enemies: 0,
                particles: 0,
                total: 0
            },
            drawCalls: 0,
            updateTime: 0,
            renderTime: 0
        };
        
        this.lastTime = performance.now();
        this.frameCount = 0;
        this.updateInterval = 60; // 每60帧更新一次统计
        this.maxHistoryLength = 300; // 保持5秒的历史数据（60fps）
        
        this.isVisible = false;
        this.element = null;
        
        this.createUI();
    }

    createUI() {
        // 创建性能监控面板
        this.element = document.createElement('div');
        this.element.id = 'performance-monitor';
        this.element.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            padding: 10px;
            border-radius: 5px;
            z-index: 1000;
            min-width: 200px;
            display: none;
            user-select: none;
        `;
        
        document.body.appendChild(this.element);
        
        // 添加切换快捷键
        document.addEventListener('keydown', (e) => {
            if (e.code === 'F3') {
                e.preventDefault();
                this.toggle();
            }
        });
    }

    toggle() {
        this.isVisible = !this.isVisible;
        this.element.style.display = this.isVisible ? 'block' : 'none';
    }

    show() {
        this.isVisible = true;
        this.element.style.display = 'block';
    }

    hide() {
        this.isVisible = false;
        this.element.style.display = 'none';
    }

    startFrame() {
        this.frameStartTime = performance.now();
        this.updateStartTime = this.frameStartTime;
    }

    endUpdate() {
        this.metrics.updateTime = performance.now() - this.updateStartTime;
        this.renderStartTime = performance.now();
    }

    endRender() {
        this.metrics.renderTime = performance.now() - this.renderStartTime;
    }

    endFrame() {
        const now = performance.now();
        const deltaTime = now - this.lastTime;
        
        // 计算FPS
        if (deltaTime > 0) {
            this.metrics.fps.current = 1000 / deltaTime;
            this.metrics.fps.history.push(this.metrics.fps.current);
            
            // 限制历史数据长度
            if (this.metrics.fps.history.length > this.maxHistoryLength) {
                this.metrics.fps.history.shift();
            }
            
            // 更新FPS统计
            this.metrics.fps.min = Math.min(this.metrics.fps.min, this.metrics.fps.current);
            this.metrics.fps.max = Math.max(this.metrics.fps.max, this.metrics.fps.current);
            
            // 计算平均FPS
            if (this.metrics.fps.history.length > 0) {
                this.metrics.fps.average = this.metrics.fps.history.reduce((a, b) => a + b, 0) / this.metrics.fps.history.length;
            }
        }
        
        // 计算帧时间
        this.metrics.frameTime.current = now - this.frameStartTime;
        this.metrics.frameTime.max = Math.max(this.metrics.frameTime.max, this.metrics.frameTime.current);
        
        // 计算平均帧时间
        if (this.frameCount > 0) {
            this.metrics.frameTime.average = (this.metrics.frameTime.average * this.frameCount + this.metrics.frameTime.current) / (this.frameCount + 1);
        } else {
            this.metrics.frameTime.average = this.metrics.frameTime.current;
        }
        
        this.frameCount++;
        this.lastTime = now;
        
        // 定期更新显示
        if (this.frameCount % this.updateInterval === 0) {
            this.updateMemoryInfo();
            this.updateDisplay();
        }
    }

    updateMemoryInfo() {
        if (performance.memory) {
            this.metrics.memory.used = performance.memory.usedJSHeapSize;
            this.metrics.memory.total = performance.memory.totalJSHeapSize;
            this.metrics.memory.percentage = (this.metrics.memory.used / this.metrics.memory.total) * 100;
        }
    }

    updateObjectCounts(bullets, enemies, particles) {
        this.metrics.objects.bullets = bullets;
        this.metrics.objects.enemies = enemies;
        this.metrics.objects.particles = particles;
        this.metrics.objects.total = bullets + enemies + particles;
    }

    incrementDrawCalls() {
        this.metrics.drawCalls++;
    }

    resetDrawCalls() {
        this.metrics.drawCalls = 0;
    }

    updateDisplay() {
        if (!this.isVisible) return;
        
        const formatNumber = (num, decimals = 1) => {
            return typeof num === 'number' ? num.toFixed(decimals) : '0.0';
        };
        
        const formatBytes = (bytes) => {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
        };
        
        const getFPSColor = (fps) => {
            if (fps >= 55) return '#00ff00';
            if (fps >= 30) return '#ffff00';
            return '#ff0000';
        };
        
        const getFrameTimeColor = (time) => {
            if (time <= 16.67) return '#00ff00'; // 60fps
            if (time <= 33.33) return '#ffff00'; // 30fps
            return '#ff0000';
        };
        
        this.element.innerHTML = `
            <div style="border-bottom: 1px solid #333; margin-bottom: 5px; padding-bottom: 5px;">
                <strong>性能监控 (F3切换)</strong>
            </div>
            
            <div style="margin-bottom: 8px;">
                <div>FPS: <span style="color: ${getFPSColor(this.metrics.fps.current)}">${formatNumber(this.metrics.fps.current)}</span></div>
                <div style="font-size: 10px; color: #888;">
                    平均: ${formatNumber(this.metrics.fps.average)} | 
                    最小: ${formatNumber(this.metrics.fps.min)} | 
                    最大: ${formatNumber(this.metrics.fps.max)}
                </div>
            </div>
            
            <div style="margin-bottom: 8px;">
                <div>帧时间: <span style="color: ${getFrameTimeColor(this.metrics.frameTime.current)}">${formatNumber(this.metrics.frameTime.current)}ms</span></div>
                <div style="font-size: 10px; color: #888;">
                    平均: ${formatNumber(this.metrics.frameTime.average)}ms | 
                    最大: ${formatNumber(this.metrics.frameTime.max)}ms
                </div>
            </div>
            
            <div style="margin-bottom: 8px;">
                <div>更新: ${formatNumber(this.metrics.updateTime)}ms</div>
                <div>渲染: ${formatNumber(this.metrics.renderTime)}ms</div>
                <div>绘制调用: ${this.metrics.drawCalls}</div>
            </div>
            
            <div style="margin-bottom: 8px;">
                <div>对象总数: ${this.metrics.objects.total}</div>
                <div style="font-size: 10px; color: #888;">
                    子弹: ${this.metrics.objects.bullets} | 
                    敌人: ${this.metrics.objects.enemies} | 
                    粒子: ${this.metrics.objects.particles}
                </div>
            </div>
            
            ${performance.memory ? `
            <div style="margin-bottom: 8px;">
                <div>内存使用: ${formatBytes(this.metrics.memory.used)}</div>
                <div style="font-size: 10px; color: #888;">
                    总计: ${formatBytes(this.metrics.memory.total)} | 
                    使用率: ${formatNumber(this.metrics.memory.percentage)}%
                </div>
            </div>
            ` : ''}
            
            <div style="font-size: 10px; color: #666; margin-top: 8px; border-top: 1px solid #333; padding-top: 5px;">
                帧数: ${this.frameCount}
            </div>
        `;
    }

    // 获取性能报告
    getPerformanceReport() {
        return {
            timestamp: Date.now(),
            fps: {
                current: this.metrics.fps.current,
                average: this.metrics.fps.average,
                min: this.metrics.fps.min,
                max: this.metrics.fps.max
            },
            frameTime: {
                current: this.metrics.frameTime.current,
                average: this.metrics.frameTime.average,
                max: this.metrics.frameTime.max
            },
            timing: {
                update: this.metrics.updateTime,
                render: this.metrics.renderTime
            },
            objects: { ...this.metrics.objects },
            memory: { ...this.metrics.memory },
            drawCalls: this.metrics.drawCalls,
            frameCount: this.frameCount
        };
    }

    // 重置统计数据
    reset() {
        this.metrics.fps.min = Infinity;
        this.metrics.fps.max = 0;
        this.metrics.fps.history = [];
        this.metrics.frameTime.max = 0;
        this.frameCount = 0;
        this.lastTime = performance.now();
    }

    // 检查性能问题
    checkPerformanceIssues() {
        const issues = [];
        
        if (this.metrics.fps.current < 30) {
            issues.push('FPS过低 (< 30)');
        }
        
        if (this.metrics.frameTime.current > 33.33) {
            issues.push('帧时间过长 (> 33ms)');
        }
        
        if (this.metrics.objects.total > 200) {
            issues.push('对象数量过多 (> 200)');
        }
        
        if (this.metrics.memory.percentage > 80) {
            issues.push('内存使用率过高 (> 80%)');
        }
        
        if (this.metrics.drawCalls > 100) {
            issues.push('绘制调用过多 (> 100)');
        }
        
        return issues;
    }

    // 自动性能调整建议
    getOptimizationSuggestions() {
        const suggestions = [];
        const issues = this.checkPerformanceIssues();
        
        if (issues.length === 0) {
            return ['性能良好，无需优化'];
        }
        
        if (this.metrics.fps.current < 30) {
            suggestions.push('降低粒子效果数量');
            suggestions.push('启用视口裁剪');
            suggestions.push('减少同时存在的对象数量');
        }
        
        if (this.metrics.objects.particles > 50) {
            suggestions.push('限制粒子系统的最大数量');
        }
        
        if (this.metrics.objects.bullets > 30) {
            suggestions.push('增加子弹对象池大小或清理机制');
        }
        
        if (this.metrics.drawCalls > 50) {
            suggestions.push('合并绘制调用');
            suggestions.push('使用精灵批处理');
        }
        
        return suggestions;
    }
}