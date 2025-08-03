/**
 * 题库生成脚本
 * 运行此脚本来生成完整的题库数据文件
 */

// 检查运行环境
if (typeof window !== 'undefined') {
    console.error('此脚本需要在Node.js环境中运行');
    throw new Error('请在Node.js环境中运行此脚本');
}

const fs = require('fs');
const path = require('path');

// 导入依赖的类
const ExpressionGenerator = require('./expression-generator.js');
const QuestionBankGenerator = require('./question-bank-generator.js');

/**
 * 主生成函数
 */
async function generateQuestionBank() {
    console.log('='.repeat(50));
    console.log('数学雨题库生成器');
    console.log('='.repeat(50));
    
    try {
        // 创建生成器实例
        const generator = new QuestionBankGenerator();
        
        // 生成完整题库
        console.log('\n开始生成题库...');
        const startTime = Date.now();
        
        const questionBank = generator.generateAllBanks();
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        console.log(`\n题库生成完成! 耗时: ${duration.toFixed(2)}秒`);
        
        // 生成统计信息
        const stats = generator.generateStatistics(questionBank);
        console.log('\n题库统计:');
        console.log(`- 总级别数: ${stats.totalLevels}`);
        console.log(`- 总题目数: ${stats.totalQuestions}`);
        
        for (const [level, levelStats] of Object.entries(stats.levelStats)) {
            console.log(`- Level ${level}: ${levelStats.totalQuestions}题, ${levelStats.pools}个题目池`);
        }
        
        // 保存题库文件
        const outputDir = path.join(__dirname, '../../assets/math-rain');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        const outputFile = path.join(outputDir, 'question-bank.json');
        const jsonData = generator.exportToJSON(questionBank);
        
        fs.writeFileSync(outputFile, jsonData, 'utf8');
        console.log(`\n题库已保存到: ${outputFile}`);
        
        // 生成压缩版本
        const compactFile = path.join(outputDir, 'question-bank.min.json');
        const compactData = JSON.stringify(questionBank);
        fs.writeFileSync(compactFile, compactData, 'utf8');
        
        const originalSize = (jsonData.length / 1024).toFixed(2);
        const compactSize = (compactData.length / 1024).toFixed(2);
        
        console.log(`\n文件大小:`);
        console.log(`- 格式化版本: ${originalSize} KB`);
        console.log(`- 压缩版本: ${compactSize} KB`);
        
        // 生成统计报告
        await generateReport(questionBank, stats, outputDir);
        
        console.log('\n✅ 题库生成完成!');
        
    } catch (error) {
        console.error('\n❌ 题库生成失败:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

/**
 * 生成详细报告
 * @param {Object} questionBank - 题库数据
 * @param {Object} stats - 统计信息
 * @param {string} outputDir - 输出目录
 */
async function generateReport(questionBank, stats, outputDir) {
    console.log('\n生成详细报告...');
    
    const report = {
        generatedAt: new Date().toISOString(),
        version: questionBank.version,
        summary: stats,
        levelDetails: {},
        qualityMetrics: {}
    };
    
    // 分析每个级别的详细信息
    for (const [level, levelData] of Object.entries(questionBank.levels)) {
        const levelReport = {
            metadata: levelData.metadata,
            pools: {},
            qualityAnalysis: {}
        };
        
        let totalQuestions = 0;
        let avgDifficulty = 0;
        const operatorDistribution = {};
        
        // 分析每个题目池
        for (const [poolName, poolData] of Object.entries(levelData.pools)) {
            const poolQuestions = poolData.questions;
            totalQuestions += poolQuestions.length;
            
            // 计算池的统计信息
            const poolStats = {
                count: poolQuestions.length,
                targetCount: poolData.count,
                weight: poolData.weight,
                operators: poolData.operators,
                avgDifficulty: 0,
                difficultyRange: { min: 10, max: 0 },
                resultRange: { min: Infinity, max: -Infinity }
            };
            
            // 分析题目质量
            poolQuestions.forEach(q => {
                const difficulty = q.difficulty || 1;
                poolStats.avgDifficulty += difficulty;
                poolStats.difficultyRange.min = Math.min(poolStats.difficultyRange.min, difficulty);
                poolStats.difficultyRange.max = Math.max(poolStats.difficultyRange.max, difficulty);
                
                const result = q.result;
            poolStats.resultRange.min = Math.min(poolStats.resultRange.min, result);
            poolStats.resultRange.max = Math.max(poolStats.resultRange.max, result);
                
                // 统计运算符分布
                (q.operators || []).forEach(op => {
                    operatorDistribution[op] = (operatorDistribution[op] || 0) + 1;
                });
            });
            
            poolStats.avgDifficulty = poolQuestions.length > 0 
                ? Math.round((poolStats.avgDifficulty / poolQuestions.length) * 100) / 100 
                : 0;
            
            avgDifficulty += poolStats.avgDifficulty * poolQuestions.length;
            
            levelReport.pools[poolName] = poolStats;
        }
        
        levelReport.qualityAnalysis = {
            totalQuestions,
            avgDifficulty: totalQuestions > 0 ? Math.round((avgDifficulty / totalQuestions) * 100) / 100 : 0,
            operatorDistribution,
            completionRate: Object.values(levelReport.pools)
                .map(p => p.count / p.targetCount)
                .reduce((sum, rate) => sum + rate, 0) / Object.keys(levelReport.pools).length
        };
        
        report.levelDetails[level] = levelReport;
    }
    
    // 计算整体质量指标
    report.qualityMetrics = {
        totalCompletionRate: Object.values(report.levelDetails)
            .map(l => l.qualityAnalysis.completionRate)
            .reduce((sum, rate) => sum + rate, 0) / Object.keys(report.levelDetails).length,
        avgQuestionsPerLevel: stats.totalQuestions / stats.totalLevels,
        difficultyProgression: Object.values(report.levelDetails)
            .map(l => l.qualityAnalysis.avgDifficulty)
    };
    
    // 保存报告
    const reportFile = path.join(outputDir, 'generation-report.json');
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');
    
    // 生成人类可读的报告
    const readableReport = generateReadableReport(report);
    const readableFile = path.join(outputDir, 'generation-report.md');
    fs.writeFileSync(readableFile, readableReport, 'utf8');
    
    console.log(`报告已保存到: ${reportFile}`);
    console.log(`可读报告已保存到: ${readableFile}`);
}

/**
 * 生成人类可读的报告
 * @param {Object} report - 报告数据
 * @returns {string} Markdown格式的报告
 */
function generateReadableReport(report) {
    let markdown = `# 数学雨题库生成报告\n\n`;
    markdown += `**生成时间:** ${new Date(report.generatedAt).toLocaleString()}\n`;
    markdown += `**版本:** ${report.version}\n\n`;
    
    // 总体统计
    markdown += `## 总体统计\n\n`;
    markdown += `- **总级别数:** ${report.summary.totalLevels}\n`;
    markdown += `- **总题目数:** ${report.summary.totalQuestions}\n`;
    markdown += `- **平均每级别题目数:** ${Math.round(report.qualityMetrics.avgQuestionsPerLevel)}\n`;
    markdown += `- **整体完成率:** ${Math.round(report.qualityMetrics.totalCompletionRate * 100)}%\n\n`;
    
    // 难度进展
    markdown += `## 难度进展\n\n`;
    markdown += `| 级别 | 平均难度 | 题目数 | 完成率 |\n`;
    markdown += `|------|----------|--------|--------|\n`;
    
    for (let level = 1; level <= 6; level++) {
        const levelData = report.levelDetails[level];
        if (levelData) {
            const avgDiff = levelData.qualityAnalysis.avgDifficulty;
            const totalQ = levelData.qualityAnalysis.totalQuestions;
            const completion = Math.round(levelData.qualityAnalysis.completionRate * 100);
            markdown += `| Level ${level} | ${avgDiff} | ${totalQ} | ${completion}% |\n`;
        }
    }
    
    markdown += `\n`;
    
    // 各级别详情
    for (const [level, levelData] of Object.entries(report.levelDetails)) {
        markdown += `## Level ${level} 详情\n\n`;
        markdown += `**目标范围:** ${levelData.metadata.targetRange.min} - ${levelData.metadata.targetRange.max}\n`;
        markdown += `**总题目数:** ${levelData.qualityAnalysis.totalQuestions}\n`;
        markdown += `**平均难度:** ${levelData.qualityAnalysis.avgDifficulty}\n\n`;
        
        // 题目池详情
        markdown += `### 题目池分布\n\n`;
        markdown += `| 池名称 | 目标数量 | 实际数量 | 权重 | 平均难度 | 运算符 |\n`;
        markdown += `|--------|----------|----------|------|----------|--------|\n`;
        
        for (const [poolName, poolData] of Object.entries(levelData.pools)) {
            const operators = poolData.operators.join(', ');
            markdown += `| ${poolName} | ${poolData.targetCount} | ${poolData.count} | ${poolData.weight} | ${poolData.avgDifficulty} | ${operators} |\n`;
        }
        
        markdown += `\n`;
        
        // 运算符分布
        if (Object.keys(levelData.qualityAnalysis.operatorDistribution).length > 0) {
            markdown += `### 运算符分布\n\n`;
            for (const [op, count] of Object.entries(levelData.qualityAnalysis.operatorDistribution)) {
                const percentage = Math.round((count / levelData.qualityAnalysis.totalQuestions) * 100);
                markdown += `- **${op}:** ${count} 次 (${percentage}%)\n`;
            }
            markdown += `\n`;
        }
    }
    
    return markdown;
}

/**
 * 验证题库质量
 * @param {Object} questionBank - 题库数据
 * @returns {Object} 验证结果
 */
function validateQuestionBank(questionBank) {
    const issues = [];
    const warnings = [];
    
    for (const [level, levelData] of Object.entries(questionBank.levels)) {
        for (const [poolName, poolData] of Object.entries(levelData.pools)) {
            // 检查题目数量
            if (poolData.actualCount < poolData.count * 0.8) {
                warnings.push(`Level ${level} ${poolName}: 题目数量不足 (${poolData.actualCount}/${poolData.count})`);
            }
            
            // 检查题目质量
            for (const question of poolData.questions) {
                if (!question.expression || !question.result) {
                    issues.push(`Level ${level} ${poolName}: 题目 ${question.id} 缺少必要字段`);
                }
                
                if (question.expression.length > 50) {
                    warnings.push(`Level ${level} ${poolName}: 题目 ${question.id} 表达式过长`);
                }
            }
        }
    }
    
    return { issues, warnings };
}

// 如果直接运行此脚本
if (require.main === module) {
    generateQuestionBank().catch(error => {
        console.error('脚本执行失败:', error);
        process.exit(1);
    });
}

module.exports = {
    generateQuestionBank,
    generateReport,
    validateQuestionBank
};