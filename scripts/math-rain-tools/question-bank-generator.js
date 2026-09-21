/**
 * 题库生成工具
 * 用于批量生成数学表达式题库，支持6个难度级别
 */

// 在 Node.js 环境中导入 ExpressionGenerator
if (typeof module !== 'undefined' && module.exports) {
    global.ExpressionGenerator = require('./expression-generator.js');
}
// 在浏览器环境中，ExpressionGenerator 已经通过 script 标签全局加载

class QuestionBankGenerator {
    constructor() {
        this.expressionGenerator = new ExpressionGenerator();
        
        // 每个难度级别的题目池配置
        this.poolConfigs = {
            1: {
                pools: [
                    { name: 'addition', weight: 0.5, count: 80, operators: ['+'] },
                    { name: 'subtraction', weight: 0.3, count: 50, operators: ['-'] },
                    { name: 'mixed_basic', weight: 0.2, count: 30, operators: ['+', '-'] }
                ],
                targetRange: { min: 1, max: 10 },
                totalQuestions: 160
            },
            2: {
                pools: [
                    { name: 'addition', weight: 0.4, count: 60, operators: ['+'] },
                    { name: 'subtraction', weight: 0.3, count: 45, operators: ['-'] },
                    { name: 'multiplication', weight: 0.2, count: 30, operators: ['×'] },
                    { name: 'mixed', weight: 0.1, count: 15, operators: ['+', '-', '×'] }
                ],
                targetRange: { min: 1, max: 20 },
                totalQuestions: 150
            },
            3: {
                pools: [
                    { name: 'basic_ops', weight: 0.3, count: 60, operators: ['+', '-'] },
                    { name: 'multiplication', weight: 0.3, count: 60, operators: ['×'] },
                    { name: 'division', weight: 0.2, count: 40, operators: ['÷'] },
                    { name: 'mixed_all', weight: 0.2, count: 40, operators: ['+', '-', '×', '÷'] }
                ],
                targetRange: { min: 5, max: 50 },
                totalQuestions: 200
            },
            4: {
                pools: [
                    { name: 'basic_ops', weight: 0.25, count: 50, operators: ['+', '-'] },
                    { name: 'multiplication', weight: 0.25, count: 50, operators: ['×'] },
                    { name: 'division', weight: 0.25, count: 50, operators: ['÷'] },
                    { name: 'complex_mixed', weight: 0.25, count: 50, operators: ['+', '-', '×', '÷'] }
                ],
                targetRange: { min: 10, max: 100 },
                totalQuestions: 200
            },
            5: {
                pools: [
                    { name: 'basic_complex', weight: 0.2, count: 40, operators: ['+', '-', '×', '÷'] },
                    { name: 'squares', weight: 0.3, count: 60, operators: ['^2'] },
                    { name: 'mixed_with_squares', weight: 0.3, count: 60, operators: ['+', '-', '×', '÷', '^2'] },
                    { name: 'advanced_mixed', weight: 0.2, count: 40, operators: ['+', '-', '×', '÷', '^2'] }
                ],
                targetRange: { min: 20, max: 500 },
                totalQuestions: 200
            },
            6: {
                pools: [
                    { name: 'advanced_basic', weight: 0.15, count: 30, operators: ['+', '-', '×', '÷'] },
                    { name: 'squares', weight: 0.25, count: 50, operators: ['^2'] },
                    { name: 'square_roots', weight: 0.25, count: 50, operators: ['√'] },
                    { name: 'complex_mixed', weight: 0.35, count: 70, operators: ['+', '-', '×', '÷', '^2', '√'] }
                ],
                targetRange: { min: 50, max: 2000 },
                totalQuestions: 200
            }
        };
    }

    /**
     * 生成指定难度级别的完整题库
     * @param {number} level - 难度级别 (1-6)
     * @returns {Object} 题库对象
     */
    generateLevelBank(level) {
        console.log(`正在生成Level ${level}题库...`);
        
        const config = this.poolConfigs[level];
        if (!config) {
            throw new Error(`无效的难度级别: ${level}`);
        }

        this.expressionGenerator.setDifficulty(level);
        const levelBank = {
            level: level,
            pools: {},
            metadata: {
                totalQuestions: config.totalQuestions,
                generatedAt: new Date().toISOString(),
                targetRange: config.targetRange
            }
        };

        // 为每个题目池生成题目
        for (const poolConfig of config.pools) {
            console.log(`  生成${poolConfig.name}池 (${poolConfig.count}题)...`);
            const pool = this.generatePool(poolConfig, config.targetRange);
            levelBank.pools[poolConfig.name] = {
                ...poolConfig,
                questions: pool,
                actualCount: pool.length
            };
        }

        return levelBank;
    }

    /**
     * 生成单个题目池
     * @param {Object} poolConfig - 题目池配置
     * @param {Object} targetRange - 目标数值范围
     * @returns {Array} 题目数组
     */
    generatePool(poolConfig, targetRange) {
        const questions = [];
        const usedExpressions = new Set();
        const targetDistribution = this.createTargetDistribution(targetRange, poolConfig.count);
        
        let attempts = 0;
        const maxAttempts = poolConfig.count * 10; // 防止无限循环

        for (const targetValue of targetDistribution) {
            let question = null;
            let localAttempts = 0;
            
            do {
                question = this.generateQuestionForTarget(targetValue, poolConfig.operators);
                localAttempts++;
                attempts++;
                
                if (attempts > maxAttempts) {
                    console.warn(`达到最大尝试次数，停止生成`);
                    break;
                }
            } while (
                (!question || 
                 usedExpressions.has(question.expression) || 
                 !this.validateQuestion(question, targetValue)) &&
                localAttempts < 50
            );

            if (question && !usedExpressions.has(question.expression)) {
                usedExpressions.add(question.expression);
                questions.push({
                    id: `q_${questions.length + 1}`,
                    expression: question.expression,
                    result: question.result,
                    operators: question.operators || poolConfig.operators,
                    numbers: question.numbers || [],
                    difficulty: this.calculateQuestionDifficulty(question)
                });
            }

            if (attempts > maxAttempts) break;
        }

        console.log(`    实际生成: ${questions.length}题`);
        return questions;
    }

    /**
     * 创建目标值分布
     * @param {Object} range - 数值范围
     * @param {number} count - 题目数量
     * @returns {Array} 目标值数组
     */
    createTargetDistribution(range, count) {
        const targets = [];
        const { min, max } = range;
        
        // 确保覆盖整个范围，重点分布在中间值
        for (let i = 0; i < count; i++) {
            let target;
            
            if (i < count * 0.1) {
                // 10%的题目使用最小值附近
                target = min + Math.floor(Math.random() * Math.min(5, (max - min) * 0.2));
            } else if (i < count * 0.2) {
                // 10%的题目使用最大值附近
                target = max - Math.floor(Math.random() * Math.min(5, (max - min) * 0.2));
            } else {
                // 80%的题目均匀分布
                target = min + Math.floor(Math.random() * (max - min + 1));
            }
            
            targets.push(Math.max(min, Math.min(max, target)));
        }
        
        return this.shuffleArray(targets);
    }

    /**
     * 为特定目标值生成题目
     * @param {number} targetValue - 目标值
     * @param {Array} allowedOperators - 允许的运算符
     * @returns {Object|null} 题目对象
     */
    generateQuestionForTarget(targetValue, allowedOperators) {
        // 临时设置允许的运算符
        const originalConfig = this.expressionGenerator.getCurrentConfig();
        const tempConfig = { ...originalConfig, operators: allowedOperators };
        
        // 重写配置
        this.expressionGenerator.difficultyConfig[this.expressionGenerator.difficulty] = tempConfig;
        
        try {
            const question = this.expressionGenerator.generateCorrectExpression(targetValue);
            return question;
        } catch (error) {
            console.warn(`生成目标值${targetValue}的题目失败:`, error.message);
            return null;
        } finally {
            // 恢复原配置
            this.expressionGenerator.difficultyConfig[this.expressionGenerator.difficulty] = originalConfig;
        }
    }

    /**
     * 验证题目质量
     * @param {Object} question - 题目对象
     * @param {number} expectedTarget - 期望的目标值
     * @returns {boolean} 是否有效
     */
    validateQuestion(question, expectedTarget) {
        if (!question || !question.expression) return false;
        
        // 验证结果是否正确
        const calculatedResult = this.expressionGenerator.calculateExpression(question.expression);
        if (Math.abs(calculatedResult - expectedTarget) > 0.01) {
            return false;
        }
        
        // 验证表达式复杂度是否合理
        if (question.expression.length > 50) return false;
        
        // 验证是否包含无效字符
        if (!/^[0-9+\-×÷√²\(\)\s]+$/.test(question.expression)) return false;
        
        return true;
    }

    /**
     * 计算题目难度分数
     * @param {Object} question - 题目对象
     * @returns {number} 难度分数 (1-10)
     */
    calculateQuestionDifficulty(question) {
        let difficulty = 1;
        
        // 基于运算符数量
        const operatorCount = (question.operators || []).length;
        difficulty += operatorCount * 0.5;
        
        // 基于数字大小
        const maxNumber = Math.max(...(question.numbers || [1]));
        if (maxNumber > 100) difficulty += 2;
        else if (maxNumber > 50) difficulty += 1;
        else if (maxNumber > 20) difficulty += 0.5;
        
        // 基于特殊运算符
        const specialOps = ['×', '÷', '^2', '√'];
        const hasSpecialOp = (question.operators || []).some(op => specialOps.includes(op));
        if (hasSpecialOp) difficulty += 1;
        
        // 基于表达式长度
        const expressionLength = question.expression.length;
        if (expressionLength > 20) difficulty += 1;
        else if (expressionLength > 10) difficulty += 0.5;
        
        return Math.min(10, Math.max(1, Math.round(difficulty * 10) / 10));
    }

    /**
     * 生成所有难度级别的题库
     * @returns {Object} 完整题库
     */
    generateAllBanks() {
        console.log('开始生成完整题库...');
        
        const questionBank = {
            version: '1.0.0',
            generatedAt: new Date().toISOString(),
            levels: {}
        };

        for (let level = 1; level <= 6; level++) {
            try {
                questionBank.levels[level] = this.generateLevelBank(level);
                console.log(`Level ${level} 完成`);
            } catch (error) {
                console.error(`生成Level ${level}失败:`, error);
            }
        }

        console.log('题库生成完成!');
        return questionBank;
    }

    /**
     * 打乱数组顺序
     * @param {Array} array - 要打乱的数组
     * @returns {Array} 打乱后的数组
     */
    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    /**
     * 导出题库为JSON格式
     * @param {Object} questionBank - 题库对象
     * @returns {string} JSON字符串
     */
    exportToJSON(questionBank) {
        return JSON.stringify(questionBank, null, 2);
    }

    /**
     * 生成题库统计信息
     * @param {Object} questionBank - 题库对象
     * @returns {Object} 统计信息
     */
    generateStatistics(questionBank) {
        const stats = {
            totalLevels: Object.keys(questionBank.levels).length,
            totalQuestions: 0,
            levelStats: {}
        };

        for (const [level, levelData] of Object.entries(questionBank.levels)) {
            const levelQuestions = Object.values(levelData.pools)
                .reduce((sum, pool) => sum + pool.actualCount, 0);
            
            stats.totalQuestions += levelQuestions;
            stats.levelStats[level] = {
                totalQuestions: levelQuestions,
                pools: Object.keys(levelData.pools).length,
                targetRange: levelData.metadata.targetRange
            };
        }

        return stats;
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = QuestionBankGenerator;
} else {
    window.QuestionBankGenerator = QuestionBankGenerator;
}