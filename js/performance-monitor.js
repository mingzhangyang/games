/**
 * 性能监控器
 * Performance Monitor for tracking game performance metrics
 */
class PerformanceMonitor {
    constructor() {
        this.metrics = {
            fps: {
                current: 0,
                average: 0,
                min: Infinity,
                max: 0
            },
            frameTime: {
                current: 0,
                average: 0,
                history: []
            },
            updateTime: 0,
            renderTime: 0,
            drawCalls: 0
        };
        
        this.lastTime = performance.now();
        this.frameCount = 0;
        this.isEnabled = true;
    }
    
    /**
     * 开始帧测量
     */
    startFrame() {
        if (!this.isEnabled) return;
        this.frameStartTime = performance.now();
    }
    
    /**
     * 结束帧测量
     */
    endFrame() {
        if (!this.isEnabled) return;
        
        const now = performance.now();
        const frameTime = now - this.frameStartTime;
        const deltaTime = now - this.lastTime;
        
        // 更新FPS
        if (deltaTime > 0) {
            this.metrics.fps.current = 1000 / deltaTime;
            this.metrics.fps.min = Math.min(this.metrics.fps.min, this.metrics.fps.current);
            this.metrics.fps.max = Math.max(this.metrics.fps.max, this.metrics.fps.current);
        }
        
        // 更新帧时间
        this.metrics.frameTime.current = frameTime;
        this.metrics.frameTime.history.push(frameTime);
        
        // 保持历史记录在合理范围内
        if (this.metrics.frameTime.history.length > 60) {
            this.metrics.frameTime.history.shift();
        }
        
        // 计算平均值
        this.metrics.frameTime.average = this.metrics.frameTime.history.reduce((a, b) => a + b, 0) / this.metrics.frameTime.history.length;
        
        this.lastTime = now;
        this.frameCount++;
    }
    
    /**
     * 记录更新时间
     */
    recordUpdateTime(time) {
        if (this.isEnabled) {
            this.metrics.updateTime = time;
        }
    }
    
    /**
     * 记录渲染时间
     */
    recordRenderTime(time) {
        if (this.isEnabled) {
            this.metrics.renderTime = time;
        }
    }
    
    /**
     * 记录绘制调用次数
     */
    recordDrawCall() {
        if (this.isEnabled) {
            this.metrics.drawCalls++;
        }
    }
    
    /**
     * 重置绘制调用计数
     */
    resetDrawCalls() {
        this.metrics.drawCalls = 0;
    }
    
    /**
     * 获取性能指标
     */
    getMetrics() {
        return { ...this.metrics };
    }
    
    /**
     * 启用/禁用性能监控
     */
    setEnabled(enabled) {
        this.isEnabled = enabled;
    }
    
    /**
     * 重置所有指标
     */
    reset() {
        this.metrics.fps.min = Infinity;
        this.metrics.fps.max = 0;
        this.metrics.frameTime.history = [];
        this.frameCount = 0;
        this.lastTime = performance.now();
    }
}

// ES模块导出
export default PerformanceMonitor;

// 兼容性导出（用于非模块环境）
if (typeof window !== 'undefined') {
    window.PerformanceMonitor = PerformanceMonitor;
}