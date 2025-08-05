import ExpressionGenerator, { generateExpressionForTarget as genForTarget } from "./expression-generator.js";

/**
 * 题库管理器
 * 负责运行时的题目选择、防重复、权重调整等逻辑
 */
class QuestionBankManager {
    constructor() {
        this.questionBank = null;
        this.currentLevel = 1;
        this.recentQuestions = new Set(); // 最近使用的题目ID
        this.recentLimit = 20; // 最近题目记录数量
        this.poolWeights = new Map(); // 动态权重
        this.sessionStats = {
            questionsAnswered: 0,
            correctAnswers: 0,
            poolUsage: new Map()
        };
        this.__emptyPoolLog = { lastTs: 0, intervalMs: 1000 }; // 空池日志限频状态
        
        // 防重复配置
        this.antiRepeatConfig = {
            maxRecentQuestions: 20,
            similarTargetGap: 3, // 相似目标值的最小间隔
            samePoolGap: 2 // 同一题目池的最小间隔
        };
        
        this.lastUsedPools = []; // 最近使用的题目池
    }

    /**
     * 加载题库数据
     * @param {Object} questionBankData - 题库数据
     */
    loadQuestionBank(questionBankData) {
        this.questionBank = questionBankData;
        this.initializeWeights();
        console.log('题库加载完成:', this.generateLoadStats());
    }

    /**
     * 从JSON文件加载题库
     * @param {string} jsonData - JSON字符串
     */
    loadFromJSON(jsonData) {
        try {
            const data = JSON.parse(jsonData);
            this.loadQuestionBank(data);
        } catch (error) {
            throw new Error(`题库JSON解析失败: ${error.message}`);
        }
    }

    /**
     * 初始化权重
     */
    initializeWeights() {
        if (!this.questionBank) return;
        
        for (const [level, levelData] of Object.entries(this.questionBank.levels)) {
            this.poolWeights.set(level, new Map());
            
            for (const [poolName, poolData] of Object.entries(levelData.pools)) {
                this.poolWeights.get(level).set(poolName, poolData.weight);
            }
        }
    }

    /**
     * 设置当前难度级别
     * @param {number} level - 难度级别 (1-6)
     */
    setLevel(level) {
        if (level < 1 || level > 6) {
            throw new Error(`无效的难度级别: ${level}`);
        }
        
        if (level !== this.currentLevel) {
            this.currentLevel = level;
            this.clearRecentHistory(); // 切换级别时清空历史
            console.log(`切换到难度级别: ${level}`);
        }
    }

    /**
     * 获取下一个题目
     * @returns {Object|null} 题目对象
     */
    getNextQuestion() {
        if (!this.questionBank || !this.questionBank.levels[this.currentLevel]) {
            throw new Error('题库未加载或当前级别不存在');
        }

        const levelData = this.questionBank.levels[this.currentLevel];
        const selectedPool = this.selectPool(levelData);
        
        if (!selectedPool) {
            console.warn('无法选择合适的题目池');
            return null;
        }

        const question = this.selectQuestionFromPool(selectedPool.pool, selectedPool.name);
        
        if (question) {
            this.updateUsageStats(selectedPool.name, question);
            this.addToRecentQuestions(question.id);
        }

        return question;
    }

    /**
     * 选择题目池
     * @param {Object} levelData - 级别数据
     * @returns {Object|null} 选中的题目池信息
     */
    selectPool(levelData) {
        const availablePools = [];
        const currentWeights = this.poolWeights.get(this.currentLevel.toString());
        
        // 收集可用的题目池
        for (const [poolName, poolData] of Object.entries(levelData.pools)) {
            if (poolData.questions && poolData.questions.length > 0) {
                const weight = currentWeights.get(poolName) || poolData.weight;
                const adjustedWeight = this.adjustWeightForAntiRepeat(poolName, weight);
                
                availablePools.push({
                    name: poolName,
                    pool: poolData,
                    weight: adjustedWeight
                });
            }
        }

        if (availablePools.length === 0) {
            return null;
        }

        // 加权随机选择
        return this.weightedRandomSelect(availablePools);
    }

    /**
     * 调整权重以实现防重复
     * @param {string} poolName - 题目池名称
     * @param {number} baseWeight - 基础权重
     * @returns {number} 调整后的权重
     */
    adjustWeightForAntiRepeat(poolName, baseWeight) {
        let adjustedWeight = baseWeight;
        
        // 检查最近使用的题目池
        const recentPoolIndex = this.lastUsedPools.indexOf(poolName);
        if (recentPoolIndex !== -1) {
            const gap = this.lastUsedPools.length - recentPoolIndex;
            if (gap < this.antiRepeatConfig.samePoolGap) {
                adjustedWeight *= 0.3; // 大幅降低最近使用池的权重
            } else if (gap < this.antiRepeatConfig.samePoolGap * 2) {
                adjustedWeight *= 0.7; // 适度降低权重
            }
        }

        return Math.max(0.1, adjustedWeight); // 确保最小权重
    }

    /**
     * 加权随机选择
     * @param {Array} pools - 题目池数组
     * @returns {Object} 选中的题目池
     */
    weightedRandomSelect(pools) {
        const totalWeight = pools.reduce((sum, pool) => sum + pool.weight, 0);
        let random = Math.random() * totalWeight;
        
        for (const pool of pools) {
            random -= pool.weight;
            if (random <= 0) {
                return pool;
            }
        }
        
        // 回退到第一个池
        return pools[0];
    }

    /**
     * 从题目池中选择题目
     * @param {Object} poolData - 题目池数据
     * @param {string} poolName - 题目池名称
     * @returns {Object|null} 选中的题目
     */
    selectQuestionFromPool(poolData, poolName) {
        const availableQuestions = poolData.questions.filter(q => 
            !this.recentQuestions.has(q.id) && 
            !this.isSimilarToRecent(q)
        );

        if (availableQuestions.length === 0) {
            // 如果没有可用题目，放宽限制
            this.__logEmptyPoolOnce(`题目池 ${poolName} 没有可用题目，放宽限制`);
            const fallbackQuestions = poolData.questions.filter(q => 
                !this.recentQuestions.has(q.id)
            );
            // 新增：尝试根据目标定向生成
            const targetHint = this.__inferTargetHint(poolData, poolName);
            if (typeof targetHint === "number") {
                const expr = ExpressionGenerator.generateExpressionForTarget(targetHint, {
                    attemptBudget: 150,
                    timeBudgetMs: 15,
                    approxDelta: 0
                });
                if (expr) {
                    return {
                        id: `gen_${poolName}_${Date.now()}`,
                        type: "generated",
                        pool: poolName,
                        target: expr.result,
                        expression: expr.expression,
                        result: expr.result,
                        numbers: expr.numbers,
                        operators: expr.operators,
                        meta: { via: "generateExpressionForTarget", poolEmpty: true }
                    };
                }
            }
            
            if (fallbackQuestions.length === 0) {
                // 最后的回退：清空最近记录
                this.clearRecentHistory();
                return poolData.questions[Math.floor(Math.random() * poolData.questions.length)];
            }
            
            return fallbackQuestions[Math.floor(Math.random() * fallbackQuestions.length)];
        }

        // 随机选择一个可用题目
        return availableQuestions[Math.floor(Math.random() * availableQuestions.length)];
    }

    /**
     * 检查题目是否与最近的题目相似
     * @param {Object} question - 题目对象
     * @returns {boolean} 是否相似
     */
    isSimilarToRecent(question) {
        // 这里可以实现更复杂的相似性检查逻辑
        // 目前简单检查目标值是否过于接近
        
        const recentTargets = Array.from(this.recentQuestions)
            .slice(-this.antiRepeatConfig.similarTargetGap)
            .map(id => this.findQuestionById(id))
            .filter(q => q)
            .map(q => q.result);
        
        return recentTargets.some(target => 
            Math.abs(target - question.result) <= 2
        );
    }

    /**
     * 根据ID查找题目
     * @param {string} questionId - 题目ID
     * @returns {Object|null} 题目对象
     */
    findQuestionById(questionId) {
        if (!this.questionBank) return null;
        
        for (const levelData of Object.values(this.questionBank.levels)) {
            for (const poolData of Object.values(levelData.pools)) {
                const question = poolData.questions.find(q => q.id === questionId);
                if (question) return question;
            }
        }
        
        return null;
    }

    /**
     * 添加到最近题目记录
     * @param {string} questionId - 题目ID
     */
    addToRecentQuestions(questionId) {
        this.recentQuestions.add(questionId);
        
        // 限制记录数量
        if (this.recentQuestions.size > this.antiRepeatConfig.maxRecentQuestions) {
            const questionsArray = Array.from(this.recentQuestions);
            const toRemove = questionsArray.slice(0, questionsArray.length - this.antiRepeatConfig.maxRecentQuestions);
            toRemove.forEach(id => this.recentQuestions.delete(id));
        }
    }

    /**
     * 更新使用统计
     * @param {string} poolName - 题目池名称
     * @param {Object} question - 题目对象
     */
    updateUsageStats(poolName, question) {
        // 更新题目池使用记录
        this.lastUsedPools.push(poolName);
        if (this.lastUsedPools.length > 10) {
            this.lastUsedPools.shift();
        }

        // 更新会话统计
        this.sessionStats.questionsAnswered++;
        
        if (!this.sessionStats.poolUsage.has(poolName)) {
            this.sessionStats.poolUsage.set(poolName, 0);
        }
        this.sessionStats.poolUsage.set(poolName, 
            this.sessionStats.poolUsage.get(poolName) + 1
        );
    }

    /**
     * 记录答题结果
     * @param {boolean} isCorrect - 是否答对
     */
    recordAnswer(isCorrect) {
        if (isCorrect) {
            this.sessionStats.correctAnswers++;
        }
    }

    /**
     * 动态调整题目池权重
     * @param {string} poolName - 题目池名称
     * @param {number} performanceScore - 表现分数 (0-1)
     */
    adjustPoolWeight(poolName, performanceScore) {
        const levelWeights = this.poolWeights.get(this.currentLevel.toString());
        if (!levelWeights) return;
        
        const currentWeight = levelWeights.get(poolName);
        if (currentWeight === undefined) return;
        
        // 根据表现调整权重
        let adjustment = 1.0;
        if (performanceScore > 0.8) {
            adjustment = 1.1; // 表现好，增加权重
        } else if (performanceScore < 0.5) {
            adjustment = 0.9; // 表现差，减少权重
        }
        
        const newWeight = Math.max(0.1, Math.min(2.0, currentWeight * adjustment));
        levelWeights.set(poolName, newWeight);
    }

    /**
     * 清空最近记录
     */
    clearRecentHistory() {
        this.recentQuestions.clear();
        this.lastUsedPools = [];
    }

    /**
     * 重置会话统计
     */
    resetSessionStats() {
        this.sessionStats = {
            questionsAnswered: 0,
            correctAnswers: 0,
            poolUsage: new Map()
        };
    }

    /**
     * 获取会话统计
     * @returns {Object} 统计信息
     */
    getSessionStats() {
        const accuracy = this.sessionStats.questionsAnswered > 0 
            ? this.sessionStats.correctAnswers / this.sessionStats.questionsAnswered 
            : 0;
        
        return {
            ...this.sessionStats,
            accuracy: Math.round(accuracy * 100) / 100,
            poolUsageArray: Array.from(this.sessionStats.poolUsage.entries())
        };
    }

    /**
     * 生成加载统计信息
     * @returns {Object} 加载统计
     */
    generateLoadStats() {
        if (!this.questionBank) return null;
        
        const stats = {
            version: this.questionBank.version,
            totalLevels: Object.keys(this.questionBank.levels).length,
            levelDetails: {}
        };
        
        for (const [level, levelData] of Object.entries(this.questionBank.levels)) {
            const totalQuestions = Object.values(levelData.pools)
                .reduce((sum, pool) => sum + pool.actualCount, 0);
            
            stats.levelDetails[level] = {
                totalQuestions,
                pools: Object.keys(levelData.pools).length,
                targetRange: levelData.metadata.targetRange
            };
        }
        
        return stats;
    }

    /**
     * 获取当前级别信息
     * @returns {Object|null} 级别信息
     */
    getCurrentLevelInfo() {
        if (!this.questionBank || !this.questionBank.levels[this.currentLevel]) {
            return null;
        }
        
        const levelData = this.questionBank.levels[this.currentLevel];
        return {
            level: this.currentLevel,
            totalQuestions: Object.values(levelData.pools)
                .reduce((sum, pool) => sum + pool.actualCount, 0),
            pools: Object.keys(levelData.pools),
            targetRange: levelData.metadata.targetRange
        };
    }

    /**
     * 预热题目池（预加载一些题目到缓存）
     * @param {number} count - 预加载数量
     * @returns {Array} 预加载的题目
     */
    preloadQuestions(count = 10) {
        const preloaded = [];
        
        for (let i = 0; i < count; i++) {
            const question = this.getNextQuestion();
            if (question) {
                preloaded.push(question);
            } else {
                break;
            }
        }
        
        // 清空预加载产生的历史记录
        this.clearRecentHistory();
        
        return preloaded;
    }
    __logEmptyPoolOnce(message) {
        const now = Date.now();
        if (now - this.__emptyPoolLog.lastTs > this.__emptyPoolLog.intervalMs) {
            console.warn(message);
            this.__emptyPoolLog.lastTs = now;
        }
    }

    __inferTargetHint(poolData, poolName) {
        const qs = poolData && Array.isArray(poolData.questions) ? poolData.questions : [];
        if (!qs.length) return null;
        const sorted = qs.map(q => q.result).filter(v => typeof v === "number").sort((a,b)=>a-b);
        if (!sorted.length) return null;
        const mid = sorted[Math.floor(sorted.length / 2)];
        return mid;
    }
}

// ES模块导出
export default QuestionBankManager;

// 兼容性导出（用于非模块环境）
if (typeof window !== 'undefined') {
    window.QuestionBankManager = QuestionBankManager;
}