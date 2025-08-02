/**
 * 难度管理器 - 动态调整游戏难度和参数
 * Difficulty Manager for Math Rain Game
 */

class DifficultyManager {
    constructor() {
        this.currentLevel = 1;
        this.baseLevel = 1;
        this.adaptiveLevel = 0; // 动态调整值
        
        // 玩家表现统计
        this.stats = {
            correctAnswers: 0,
            incorrectAnswers: 0,
            totalAnswers: 0,
            consecutiveCorrect: 0,
            consecutiveIncorrect: 0,
            averageResponseTime: 0,
            maxCombo: 0,
            sessionStartTime: Date.now()
        };
        
        // 难度配置表
        this.difficultyConfig = {
            1: { // 入门级 (1-10)
                name: '入门级',
                nameEn: 'Beginner',
                range: { min: 1, max: 10 },
                operators: ['+', '-'],
                complexity: 1,
                fallSpeed: { min: 6000, max: 9000 }, // 毫秒 - 进一步减慢速度
                spawnRate: { min: 1500, max: 2500 }, // 生成间隔
                maxSimultaneous: 4, // 同时最大算式数
                correctRatio: 0.4, // 正确答案比例
                decoyOffset: { min: 1, max: 3 } // 干扰项偏移范围
            },
            2: { // 初级 (1-20)
                name: '初级',
                nameEn: 'Elementary',
                range: { min: 1, max: 20 },
                operators: ['+', '-', '×'],
                complexity: 1,
                fallSpeed: { min: 5500, max: 8500 }, // 进一步减慢速度
                spawnRate: { min: 1200, max: 2200 },
                maxSimultaneous: 4,
                correctRatio: 0.35,
                decoyOffset: { min: 1, max: 5 }
            },
            3: { // 中级 (10-50)
                name: '中级',
                nameEn: 'Intermediate',
                range: { min: 5, max: 50 },
                operators: ['+', '-', '×', '÷'],
                complexity: 2,
                fallSpeed: { min: 5000, max: 8000 }, // 进一步减慢速度
                spawnRate: { min: 1000, max: 2000 },
                maxSimultaneous: 5,
                correctRatio: 0.3,
                decoyOffset: { min: 2, max: 8 }
            },
            4: { // 高级 (20-100)
                name: '高级',
                nameEn: 'Advanced',
                range: { min: 10, max: 100 },
                operators: ['+', '-', '×', '÷'],
                complexity: 2,
                fallSpeed: { min: 4500, max: 7500 }, // 进一步减慢速度
                spawnRate: { min: 800, max: 1800 },
                maxSimultaneous: 5,
                correctRatio: 0.25,
                decoyOffset: { min: 3, max: 12 }
            },
            5: { // 专家级 (50-500)
                name: '专家级',
                nameEn: 'Expert',
                range: { min: 20, max: 500 },
                operators: ['+', '-', '×', '÷', '^2'],
                complexity: 3,
                fallSpeed: { min: 4000, max: 7000 }, // 进一步减慢速度
                spawnRate: { min: 600, max: 1500 },
                maxSimultaneous: 5,
                correctRatio: 0.2,
                decoyOffset: { min: 5, max: 20 }
            },
            6: { // 大师级 (100-2000)
                name: '大师级',
                nameEn: 'Master',
                range: { min: 50, max: 2000 },
                operators: ['+', '-', '×', '÷', '^2', '√'],
                complexity: 3,
                fallSpeed: { min: 3500, max: 6500 }, // 进一步减慢速度
                spawnRate: { min: 500, max: 1200 },
                maxSimultaneous: 5,
                correctRatio: 0.15,
                decoyOffset: { min: 10, max: 50 }
            }
        };
        
        // 自适应调整参数
        this.adaptiveSettings = {
            // 正确率调整阈值
            accuracyThresholds: {
                tooEasy: 0.9,    // 正确率超过90%时增加难度
                tooHard: 0.4     // 正确率低于40%时降低难度
            },
            
            // 响应时间调整阈值（毫秒）
            responseTimeThresholds: {
                tooFast: 1000,   // 平均响应时间小于1秒时增加难度
                tooSlow: 5000    // 平均响应时间大于5秒时降低难度
            },
            
            // 连续表现调整
            streakThresholds: {
                correctStreak: 10,   // 连续10个正确时增加难度
                incorrectStreak: 5   // 连续5个错误时降低难度
            },
            
            // 调整幅度
            adjustmentRate: 0.1,  // 每次调整的幅度
            maxAdjustment: 1.0,   // 最大调整范围
            minAdjustment: -1.0   // 最小调整范围
        };
        
        // 历史记录用于分析
        this.responseHistory = [];
        this.maxHistoryLength = 20;
    }

    /**
     * 设置基础难度等级
     * @param {number} level - 难度等级 (1-6)
     */
    setBaseLevel(level) {
        this.baseLevel = Math.max(1, Math.min(6, level));
        this.updateCurrentLevel();
    }

    /**
     * 更新当前有效难度等级
     */
    updateCurrentLevel() {
        // 当前难度 = 基础难度 + 自适应调整
        const rawLevel = this.baseLevel + this.adaptiveLevel;
        this.currentLevel = Math.max(1, Math.min(6, rawLevel));
    }

    /**
     * 记录玩家答题结果
     * @param {boolean} isCorrect - 是否正确
     * @param {number} responseTime - 响应时间（毫秒）
     * @param {number} targetValue - 目标值
     */
    recordAnswer(isCorrect, responseTime, targetValue) {
        // 更新基础统计
        this.stats.totalAnswers++;
        
        if (isCorrect) {
            this.stats.correctAnswers++;
            this.stats.consecutiveCorrect++;
            this.stats.consecutiveIncorrect = 0;
        } else {
            this.stats.incorrectAnswers++;
            this.stats.incorrectAnswers++;
            this.stats.consecutiveCorrect = 0;
        }
        
        // 更新平均响应时间
        this.updateAverageResponseTime(responseTime);
        
        // 记录到历史中
        this.responseHistory.push({
            isCorrect,
            responseTime,
            targetValue,
            timestamp: Date.now(),
            difficulty: this.currentLevel
        });
        
        // 保持历史记录长度
        if (this.responseHistory.length > this.maxHistoryLength) {
            this.responseHistory.shift();
        }
        
        // 触发自适应调整
        this.performAdaptiveAdjustment();
    }

    /**
     * 更新平均响应时间
     */
    updateAverageResponseTime(newTime) {
        if (this.stats.totalAnswers === 1) {
            this.stats.averageResponseTime = newTime;
        } else {
            // 使用指数移动平均
            const alpha = 0.1;
            this.stats.averageResponseTime = 
                alpha * newTime + (1 - alpha) * this.stats.averageResponseTime;
        }
    }

    /**
     * 执行自适应难度调整
     */
    performAdaptiveAdjustment() {
        if (this.stats.totalAnswers < 5) {
            return; // 样本太少，不进行调整
        }
        
        let adjustment = 0;
        const accuracy = this.getAccuracy();
        const avgResponseTime = this.stats.averageResponseTime;
        
        // 基于正确率的调整
        if (accuracy > this.adaptiveSettings.accuracyThresholds.tooEasy) {
            adjustment += this.adaptiveSettings.adjustmentRate;
        } else if (accuracy < this.adaptiveSettings.accuracyThresholds.tooHard) {
            adjustment -= this.adaptiveSettings.adjustmentRate;
        }
        
        // 基于响应时间的调整
        if (avgResponseTime < this.adaptiveSettings.responseTimeThresholds.tooFast) {
            adjustment += this.adaptiveSettings.adjustmentRate * 0.5;
        } else if (avgResponseTime > this.adaptiveSettings.responseTimeThresholds.tooSlow) {
            adjustment -= this.adaptiveSettings.adjustmentRate * 0.5;
        }
        
        // 基于连续表现的调整
        if (this.stats.consecutiveCorrect >= this.adaptiveSettings.streakThresholds.correctStreak) {
            adjustment += this.adaptiveSettings.adjustmentRate * 0.3;
        } else if (this.stats.consecutiveIncorrect >= this.adaptiveSettings.streakThresholds.incorrectStreak) {
            adjustment -= this.adaptiveSettings.adjustmentRate * 0.5;
        }
        
        // 应用调整
        if (Math.abs(adjustment) > 0.01) {
            this.adaptiveLevel += adjustment;
            this.adaptiveLevel = Math.max(
                this.adaptiveSettings.minAdjustment,
                Math.min(this.adaptiveSettings.maxAdjustment, this.adaptiveLevel)
            );
            
            this.updateCurrentLevel();
            
    
        }
    }

    /**
     * 获取当前难度配置
     * @returns {Object} 难度配置对象
     */
    getCurrentConfig() {
        const baseConfig = this.difficultyConfig[Math.floor(this.currentLevel)];
        const nextConfig = this.difficultyConfig[Math.min(6, Math.floor(this.currentLevel) + 1)];
        
        if (!nextConfig || Math.floor(this.currentLevel) === this.currentLevel) {
            return { ...baseConfig };
        }
        
        // 在两个等级之间插值
        const progress = this.currentLevel - Math.floor(this.currentLevel);
        return this.interpolateConfigs(baseConfig, nextConfig, progress);
    }

    /**
     * 在两个难度配置之间插值
     */
    interpolateConfigs(config1, config2, progress) {
        const interpolated = { ...config1 };
        
        // 插值数值属性
        const interpolateRange = (range1, range2) => ({
            min: range1.min + (range2.min - range1.min) * progress,
            max: range1.max + (range2.max - range1.max) * progress
        });
        
        interpolated.fallSpeed = interpolateRange(config1.fallSpeed, config2.fallSpeed);
        interpolated.spawnRate = interpolateRange(config1.spawnRate, config2.spawnRate);
        interpolated.decoyOffset = interpolateRange(config1.decoyOffset, config2.decoyOffset);
        
        interpolated.maxSimultaneous = Math.round(
            config1.maxSimultaneous + (config2.maxSimultaneous - config1.maxSimultaneous) * progress
        );
        
        interpolated.correctRatio = 
            config1.correctRatio + (config2.correctRatio - config1.correctRatio) * progress;
        
        // 其他属性使用较高等级的配置
        if (progress > 0.5) {
            interpolated.operators = config2.operators;
            interpolated.complexity = config2.complexity;
            interpolated.range = config2.range;
        }
        
        return interpolated;
    }

    /**
     * 获取当前算式生成参数
     */
    getExpressionParams() {
        const config = this.getCurrentConfig();
        
        return {
            difficulty: Math.floor(this.currentLevel),
            range: config.range,
            operators: config.operators,
            complexity: config.complexity,
            decoyOffset: config.decoyOffset
        };
    }

    /**
     * 获取当前游戏参数
     */
    getGameParams() {
        const config = this.getCurrentConfig();
        
        return {
            fallSpeed: this.randomBetween(config.fallSpeed.min, config.fallSpeed.max),
            spawnRate: this.randomBetween(config.spawnRate.min, config.spawnRate.max),
            maxSimultaneous: config.maxSimultaneous,
            correctRatio: config.correctRatio
        };
    }

    /**
     * 获取正确率
     */
    getAccuracy() {
        return this.stats.totalAnswers > 0 ? 
            this.stats.correctAnswers / this.stats.totalAnswers : 0;
    }

    /**
     * 获取最近N题的正确率
     */
    getRecentAccuracy(count = 10) {
        const recentAnswers = this.responseHistory.slice(-count);
        if (recentAnswers.length === 0) return 0;
        
        const correctCount = recentAnswers.filter(answer => answer.isCorrect).length;
        return correctCount / recentAnswers.length;
    }

    /**
     * 获取详细统计信息
     */
    getStats() {
        const sessionTime = Date.now() - this.stats.sessionStartTime;
        
        return {
            ...this.stats,
            accuracy: this.getAccuracy(),
            recentAccuracy: this.getRecentAccuracy(),
            sessionTime: sessionTime,
            currentLevel: this.currentLevel,
            baseLevel: this.baseLevel,
            adaptiveAdjustment: this.adaptiveLevel,
            answersPerMinute: this.stats.totalAnswers / (sessionTime / 60000)
        };
    }

    /**
     * 获取难度描述
     */
    getDifficultyDescription(lang = 'zh') {
        const level = Math.floor(this.currentLevel);
        const config = this.difficultyConfig[level];
        
        if (!config) return '';
        
        const name = lang === 'en' ? config.nameEn : config.name;
        const range = `${config.range.min}-${config.range.max}`;
        const operators = config.operators.join(', ');
        
        return {
            name,
            range,
            operators,
            level: this.currentLevel.toFixed(1)
        };
    }

    /**
     * 重置统计数据
     */
    resetStats() {
        this.stats = {
            correctAnswers: 0,
            incorrectAnswers: 0,
            totalAnswers: 0,
            consecutiveCorrect: 0,
            consecutiveIncorrect: 0,
            averageResponseTime: 0,
            maxCombo: 0,
            sessionStartTime: Date.now()
        };
        
        this.responseHistory = [];
        this.adaptiveLevel = 0;
        this.updateCurrentLevel();
    }

    /**
     * 更新最大连击记录
     */
    updateMaxCombo(combo) {
        this.stats.maxCombo = Math.max(this.stats.maxCombo, combo);
    }

    /**
     * 判断是否应该升级基础难度
     */
    shouldLevelUp() {
        const stats = this.getStats();
        
        // 条件：近期正确率高且响应时间快
        return stats.recentAccuracy > 0.85 && 
               stats.averageResponseTime < 2000 && 
               stats.totalAnswers >= 20 &&
               this.adaptiveLevel > 0.5;
    }

    /**
     * 建议难度调整
     */
    getSuggestedLevelAdjustment() {
        if (this.shouldLevelUp() && this.baseLevel < 6) {
            return {
                action: 'levelUp',
                message: '表现出色！建议提升难度等级',
                suggestedLevel: this.baseLevel + 1
            };
        }
        
        const accuracy = this.getRecentAccuracy();
        if (accuracy < 0.3 && this.stats.totalAnswers >= 15 && this.baseLevel > 1) {
            return {
                action: 'levelDown',
                message: '建议降低难度等级以提升游戏体验',
                suggestedLevel: this.baseLevel - 1
            };
        }
        
        return null;
    }

    /**
     * 生成随机数
     */
    randomBetween(min, max) {
        return Math.random() * (max - min) + min;
    }

    /**
     * 导出数据用于分析
     */
    exportData() {
        return {
            stats: this.getStats(),
            history: this.responseHistory,
            settings: {
                baseLevel: this.baseLevel,
                currentLevel: this.currentLevel,
                adaptiveLevel: this.adaptiveLevel
            },
            timestamp: Date.now()
        };
    }
}

// 导出供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DifficultyManager;
} else {
    window.DifficultyManager = DifficultyManager;
}