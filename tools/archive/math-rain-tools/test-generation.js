/**
 * 简化的题库生成测试脚本
 */

const fs = require('fs');
const path = require('path');

// 导入依赖的类
const ExpressionGenerator = require('./expression-generator.js');
const QuestionBankGenerator = require('./question-bank-generator.js');

console.log('开始测试题库生成...');

try {
    // 测试 ExpressionGenerator
    console.log('1. 测试 ExpressionGenerator...');
    const expressionGen = new ExpressionGenerator();
    expressionGen.setDifficulty(1);
    const testExpr = expressionGen.generateCorrectExpression(5);
    console.log(`   生成测试表达式: ${testExpr.expression} = ${testExpr.result}`);
    
    // 测试 QuestionBankGenerator
    console.log('2. 测试 QuestionBankGenerator...');
    const questionGen = new QuestionBankGenerator();
    
    // 生成一个小规模的Level 1题库
    console.log('3. 生成Level 1题库...');
    const level1Bank = questionGen.generateLevelBank(1);
    console.log(`   Level 1题库生成成功，包含 ${level1Bank.totalQuestions} 道题目`);
    
    // 显示一些示例题目
    console.log('4. 示例题目:');
    let count = 0;
    for (const [poolName, poolData] of Object.entries(level1Bank.pools)) {
        console.log(`   ${poolName} 池:`);
        for (const question of poolData.questions.slice(0, 3)) {
            console.log(`     ${question.expression} = ${question.result}`);
            count++;
            if (count >= 10) break;
        }
        if (count >= 10) break;
    }
    
    // 创建输出目录
    const outputDir = path.join(__dirname, '../../assets/math-rain');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // 保存测试题库
    const testBank = {
        version: '1.0.0-test',
        generatedAt: new Date().toISOString(),
        levels: {
            1: level1Bank
        }
    };
    
    const outputFile = path.join(outputDir, 'test-question-bank.json');
    fs.writeFileSync(outputFile, JSON.stringify(testBank, null, 2), 'utf8');
    console.log(`5. 测试题库已保存到: ${outputFile}`);
    
    console.log('\n✅ 所有测试通过！题库生成功能正常。');
    
} catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
}