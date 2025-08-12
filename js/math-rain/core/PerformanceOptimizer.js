/**
 * Performance Optimizer for Math Rain Game
 * Handles performance monitoring, optimization, and mobile adaptations
 */

class PerformanceOptimizer {
    constructor(eventSystem) {
        this.eventSystem = eventSystem;
        
        // Performance configuration
        this.config = {
            batchUpdateSize: 5,
            frameSkipThreshold: 16.67, // ~60 FPS
            memoryCleanupInterval: 30000, // 30 seconds
            throttleUpdateInterval: 50,
            maxExpressions: 6
        };
        
        // Performance state
        this.frameSkipCounter = 0;
        this.lastMemoryCleanup = 0;
        this.lastFrameTime = 0;
        this.frameCount = 0;
        this.avgFrameTime = 16.67;
        
        // Mobile detection and optimization
        this.isMobile = this.detectMobile();
        
        // Throttled functions
        this.throttledFunctions = new Map();
        
        // Memory cleanup timer
        this.memoryCleanupTimer = null;
        
        this.initialize();
    }

    /**
     * Initialize performance optimizer
     */
    initialize() {
        // Apply mobile optimizations if needed
        if (this.isMobile) {
            this.applyMobileOptimizations();
        }
        
        // Start memory cleanup timer
        this.startMemoryCleanupTimer();
        
        // Setup performance monitoring
        this.setupPerformanceMonitoring();
    }

    /**
     * Detect if running on mobile device
     * @returns {boolean} True if mobile device
     */
    detectMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    /**
     * Apply mobile-specific optimizations
     */
    applyMobileOptimizations() {
        // Reduce complexity for mobile devices
        this.config.maxExpressions = 4;
        this.config.batchUpdateSize = 3;
        this.config.throttleUpdateInterval = 100;
        
        // Enable hardware acceleration
        this.enableHardwareAcceleration();
        
        this.eventSystem.emit('performance:mobile:optimizations:applied', {
            config: this.config
        });
    }

    /**
     * Enable hardware acceleration for game container
     */
    enableHardwareAcceleration() {
        const gameContainer = document.getElementById('game-container');
        if (gameContainer) {
            gameContainer.style.transform = 'translateZ(0)';
            gameContainer.style.willChange = 'transform';
        }
    }

    /**
     * Setup performance monitoring
     */
    setupPerformanceMonitoring() {
        // Connect to global performance monitor if available
        if (window.performanceMonitor) {
            this.globalPerformanceMonitor = window.performanceMonitor;
        }
    }

    /**
     * Start memory cleanup timer
     */
    startMemoryCleanupTimer() {
        if (this.memoryCleanupTimer) {
            clearInterval(this.memoryCleanupTimer);
        }
        
        this.memoryCleanupTimer = setInterval(() => {
            this.performMemoryCleanup();
        }, this.config.memoryCleanupInterval);
    }

    /**
     * Record frame performance
     * @param {number} frameTime - Frame processing time in milliseconds
     */
    recordFrame(frameTime = null) {
        if (frameTime === null) {
            frameTime = performance.now() - this.lastFrameTime;
        }
        
        this.lastFrameTime = performance.now();
        this.frameCount++;
        
        // Update average frame time (simple moving average)
        this.avgFrameTime = (this.avgFrameTime * 0.9) + (frameTime * 0.1);
        
        // Report to global performance monitor
        if (this.globalPerformanceMonitor) {
            this.globalPerformanceMonitor.recordFrame();
        }
        
        // Emit performance data periodically
        if (this.frameCount % 60 === 0) { // Every 60 frames
            this.eventSystem.emit('performance:frame:stats', {
                avgFrameTime: this.avgFrameTime,
                frameCount: this.frameCount,
                fps: Math.round(1000 / this.avgFrameTime)
            });
        }
    }

    /**
     * Check if frame should be skipped for performance
     * @param {number} deltaTime - Time since last update
     * @returns {boolean} True if frame should be skipped
     */
    shouldSkipFrame(deltaTime) {
        const shouldSkip = deltaTime > this.config.frameSkipThreshold;
        
        if (shouldSkip) {
            this.frameSkipCounter++;
            
            // Skip every other frame when performance is poor
            if (this.frameSkipCounter % 2 === 0) {
                return true;
            }
        } else {
            this.frameSkipCounter = 0;
        }
        
        return false;
    }

    /**
     * Create throttled version of a function
     * @param {string} name - Function name for caching
     * @param {Function} func - Function to throttle
     * @param {number} limit - Throttle limit in milliseconds
     * @returns {Function} Throttled function
     */
    createThrottledFunction(name, func, limit = null) {
        if (limit === null) {
            limit = this.config.throttleUpdateInterval;
        }
        
        if (this.throttledFunctions.has(name)) {
            return this.throttledFunctions.get(name);
        }
        
        let inThrottle;
        const throttledFunc = function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => {
                    inThrottle = false;
                }, limit);
            }
        };
        
        this.throttledFunctions.set(name, throttledFunc);
        return throttledFunc;
    }

    /**
     * Perform memory cleanup
     */
    performMemoryCleanup() {
        try {
            // Force garbage collection if available
            if (window.gc && typeof window.gc === 'function') {
                window.gc();
            }
            
            this.lastMemoryCleanup = Date.now();
            
            // Emit cleanup event for other components to clean up
            this.eventSystem.emit('performance:memory:cleanup');
            
            // Log memory usage if available
            if (performance.memory) {
                this.eventSystem.emit('performance:memory:stats', {
                    used: performance.memory.usedJSHeapSize,
                    total: performance.memory.totalJSHeapSize,
                    limit: performance.memory.jsHeapSizeLimit
                });
            }
        } catch (error) {
            console.warn('Memory cleanup failed:', error);
        }
    }

    /**
     * Optimize expression count based on performance
     * @param {number} currentCount - Current expression count
     * @returns {number} Recommended max expressions
     */
    getOptimalExpressionCount(currentCount) {
        // Adjust based on frame rate
        const fps = Math.round(1000 / this.avgFrameTime);
        
        if (fps < 30) {
            // Very poor performance - reduce significantly
            return Math.max(2, Math.floor(this.config.maxExpressions * 0.5));
        } else if (fps < 45) {
            // Poor performance - reduce moderately
            return Math.max(3, Math.floor(this.config.maxExpressions * 0.75));
        } else if (fps > 55) {
            // Good performance - can increase slightly
            return Math.min(this.config.maxExpressions + 2, this.config.maxExpressions * 1.5);
        }
        
        // Normal performance
        return this.config.maxExpressions;
    }

    /**
     * Get performance-adjusted spawn rate
     * @param {number} baseSpawnRate - Base spawn rate in milliseconds
     * @returns {number} Adjusted spawn rate
     */
    getOptimalSpawnRate(baseSpawnRate) {
        const fps = Math.round(1000 / this.avgFrameTime);
        
        if (fps < 30) {
            // Slow down spawning for poor performance
            return baseSpawnRate * 1.5;
        } else if (fps > 55) {
            // Speed up spawning for good performance
            return baseSpawnRate * 0.8;
        }
        
        return baseSpawnRate;
    }

    /**
     * Check if particle effects should be reduced
     * @returns {boolean} True if effects should be reduced
     */
    shouldReduceEffects() {
        const fps = Math.round(1000 / this.avgFrameTime);
        return fps < 45 || this.isMobile;
    }

    /**
     * Get current performance metrics
     * @returns {Object} Performance metrics
     */
    getPerformanceMetrics() {
        return {
            avgFrameTime: this.avgFrameTime,
            fps: Math.round(1000 / this.avgFrameTime),
            frameSkipCounter: this.frameSkipCounter,
            isMobile: this.isMobile,
            memoryStats: performance.memory ? {
                used: performance.memory.usedJSHeapSize,
                total: performance.memory.totalJSHeapSize,
                limit: performance.memory.jsHeapSizeLimit
            } : null,
            optimizations: {
                maxExpressions: this.getOptimalExpressionCount(),
                reduceEffects: this.shouldReduceEffects()
            }
        };
    }

    /**
     * Update performance configuration
     * @param {Object} newConfig - New configuration options
     */
    updateConfig(newConfig) {
        const oldConfig = { ...this.config };
        
        Object.assign(this.config, newConfig);
        
        // Restart memory cleanup timer if interval changed
        if (newConfig.memoryCleanupInterval !== undefined) {
            this.startMemoryCleanupTimer();
        }
        
        this.eventSystem.emit('performance:config:updated', {
            oldConfig,
            newConfig: this.config
        });
    }

    /**
     * Enable or disable performance optimizations
     * @param {boolean} enabled - Whether to enable optimizations
     */
    setOptimizationsEnabled(enabled) {
        this.optimizationsEnabled = enabled;
        
        if (!enabled) {
            // Reset to default values
            this.frameSkipCounter = 0;
        }
        
        this.eventSystem.emit('performance:optimizations:toggled', {
            enabled: this.optimizationsEnabled
        });
    }

    /**
     * Get optimization recommendations
     * @returns {Object} Recommendations for performance improvement
     */
    getOptimizationRecommendations() {
        const fps = Math.round(1000 / this.avgFrameTime);
        const recommendations = [];
        
        if (fps < 30) {
            recommendations.push({
                type: 'critical',
                message: 'Very low frame rate detected',
                actions: [
                    'Reduce max expressions to 3',
                    'Disable particle effects',
                    'Increase spawn rate intervals'
                ]
            });
        } else if (fps < 45) {
            recommendations.push({
                type: 'warning',
                message: 'Low frame rate detected',
                actions: [
                    'Reduce max expressions',
                    'Limit particle effects',
                    'Consider mobile optimizations'
                ]
            });
        }
        
        if (this.isMobile) {
            recommendations.push({
                type: 'info',
                message: 'Mobile device detected',
                actions: [
                    'Mobile optimizations applied',
                    'Hardware acceleration enabled'
                ]
            });
        }
        
        return recommendations;
    }

    /**
     * Destroy the performance optimizer
     */
    destroy() {
        // Clear memory cleanup timer
        if (this.memoryCleanupTimer) {
            clearInterval(this.memoryCleanupTimer);
            this.memoryCleanupTimer = null;
        }
        
        // Clear throttled functions
        this.throttledFunctions.clear();
        
        // Final memory cleanup
        this.performMemoryCleanup();
        
        this.eventSystem = null;
    }
}

// ES Module export
export default PerformanceOptimizer;

// CommonJS compatibility
if (typeof window !== 'undefined') {
    window.PerformanceOptimizer = PerformanceOptimizer;
}