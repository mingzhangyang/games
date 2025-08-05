class ExpressionGenerator {
    constructor() {
        this.difficulty = 1;
        
        // 更精细的难度配置
        this.difficultyConfig = {
            1: { // 入门级 (1-10)
                targetRange: { min: 1, max: 10 },
                numberRange: { min: 1, max: 10 },
                operators: ['+', '-'],
                complexity: 1,
                allowNegative: false,
                allowDecimals: false,
                maxOperands: 2
            },
            2: { // 初级 (1-20)
                targetRange: { min: 1, max: 20 },
                numberRange: { min: 1, max: 15 },
                operators: ['+', '-', '×'],
                complexity: 1,
                allowNegative: false,
                allowDecimals: false,
                maxOperands: 2
            },
            3: { // 中级 (10-50)
                targetRange: { min: 5, max: 50 },
                numberRange: { min: 1, max: 20 },
                operators: ['+', '-', '×', '÷'],
                complexity: 2,
                allowNegative: false,
                allowDecimals: false,
                maxOperands: 3
            },
            4: { // 高级 (20-100)
                targetRange: { min: 10, max: 100 },
                numberRange: { min: 1, max: 50 },
                operators: ['+', '-', '×', '÷'],
                complexity: 2,
                allowNegative: true,
                allowDecimals: false,
                maxOperands: 3
            },
            5: { // 专家级 (50-500)
                targetRange: { min: 20, max: 500 },
                numberRange: { min: 1, max: 100 },
                operators: ['+', '-', '×', '÷', '^2'],
                complexity: 3,
                allowNegative: true,
                allowDecimals: false,
                maxOperands: 4
            },
            6: { // 大师级 (100-2000)
                targetRange: { min: 50, max: 2000 },
                numberRange: { min: 1, max: 200 },
                operators: ['+', '-', '×', '÷', '^2', '√'],
                complexity: 3,
                allowNegative: true,
                allowDecimals: true,
                maxOperands: 4
            }
        };
        
        // 保持向后兼容的旧属性
        this.operatorsByDifficulty = {};
        this.rangesByDifficulty = {};
        this.complexityByDifficulty = {};
        
        // 从新配置生成旧格式
        this.updateLegacyProperties();
    }
    
    /**
     * 更新旧格式属性以保持兼容性
     */
    updateLegacyProperties() {
        for (let level = 1; level <= 6; level++) {
            const config = this.difficultyConfig[level];
            this.operatorsByDifficulty[level] = config.operators;
            this.rangesByDifficulty[level] = config.targetRange;
            this.complexityByDifficulty[level] = config.complexity;
        }
    }
    
    /**
     * 获取当前难度配置
     */
    getCurrentConfig() {
        return this.difficultyConfig[this.difficulty];
    }

    /**
     * 设置难度等级
     * @param {number} level - 难度等级 (1-6)
     */
    setDifficulty(level) {
        this.difficulty = Math.max(1, Math.min(6, level));
    }

    /**
     * 生成目标数字（基于难度等级）
     */
    generateTargetNumber() {
        const config = this.getCurrentConfig();
        const range = config.targetRange;
        return Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
    }

    /**
     * 在指定范围内生成随机数
     */
    getRandomNumber(min = null, max = null) {
        const config = this.getCurrentConfig();
        const minVal = min !== null ? min : config.numberRange.min;
        const maxVal = max !== null ? max : config.numberRange.max;
        
        let result = Math.floor(Math.random() * (maxVal - minVal + 1)) + minVal;
        
        // 如果允许负数且随机决定（20%概率）
        if (config.allowNegative && Math.random() < 0.2) {
            result = -result;
        }
        
        return result;
    }

    /**
     * 获取当前难度的随机运算符
     */
    getRandomOperator() {
        const config = this.getCurrentConfig();
        const operators = config.operators;
        return operators[Math.floor(Math.random() * operators.length)];
    }

    /**
     * 计算表达式结果
     */
    calculateExpression(expression) {
        try {
            // 处理特殊运算符
            let processedExp = expression
                .replace(/×/g, '*')
                .replace(/÷/g, '/')
                .replace(/\^2/g, '**2')
                .replace(/√(\d+)/g, 'Math.sqrt($1)');
            
            const result = Function('"use strict"; return (' + processedExp + ')')();
            
            // 四舍五入到合理精度
            return Math.round(result * 100) / 100;
        } catch (error) {

            return null;
        }
    }

    /**
     * 验证表达式是否符合目标值
     */
    validateExpression(expression, target) {
        const result = this.calculateExpression(expression);
        return result !== null && Math.abs(result - target) < 0.01;
    }

    /**
     * 生成正确的算式（结果等于目标值）
     * @param {number} targetValue - 目标值
     * @returns {Object} 包含表达式和结果的对象
     */
    generateCorrectExpression(targetValue) {
        const config = this.getCurrentConfig();
        
        // 根据复杂度选择生成方法
        if (config.complexity === 1) {
            return this.generateSimpleExpression(targetValue);
        } else if (config.complexity === 2) {
            return this.generateDoubleExpression(targetValue);
        } else {
            return this.generateComplexExpression(targetValue);
        }
    }

    /**
     * 生成简单表达式（单步运算）
     * @param {number} targetValue - 目标值
     * @returns {Object} 表达式对象
     */
    generateSimpleExpression(targetValue) {
        const config = this.getCurrentConfig();
        const operator = this.getRandomOperator();
        
        switch (operator) {
            case '+':
                return this.generateAddition(targetValue);
            case '-':
                return this.generateSubtraction(targetValue);
            case '×':
                return this.generateMultiplication(targetValue);
            case '÷':
                return this.generateDivision(targetValue);
            case '^2':
                return this.generateSquare(targetValue);
            case '√':
                return this.generateSquareRoot(targetValue);
            default:
                return this.generateAddition(targetValue);
        }
    }

    /**
     * 生成加法表达式
     */
    generateAddition(targetValue) {
        const config = this.getCurrentConfig();
        const maxNumber = Math.min(targetValue - 1, config.numberRange.max);
        
        if (maxNumber < config.numberRange.min) {
            // 如果目标值太小，使用简单加法
            const a = Math.floor(targetValue / 2);
            const b = targetValue - a;
            return {
                expression: `${a} + ${b}`,
                result: targetValue,
                numbers: [a, b],
                operators: ['+']
            };
        }
        
        const a = this.getRandomNumber(config.numberRange.min, maxNumber);
        const b = targetValue - a;
        
        if (b >= config.numberRange.min && b <= config.numberRange.max) {
            return {
                expression: `${a} + ${b}`,
                result: targetValue,
                numbers: [a, b],
                operators: ['+']
            };
        }
        
        // 回退方案
        const fallbackA = Math.max(1, Math.floor(targetValue / 2));
        const fallbackB = targetValue - fallbackA;
        return {
            expression: `${fallbackA} + ${fallbackB}`,
            result: targetValue,
            numbers: [fallbackA, fallbackB],
            operators: ['+']
        };
    }

    /**
     * 生成减法表达式
     */
    generateSubtraction(targetValue) {
        const config = this.getCurrentConfig();
        const maxSubtract = Math.min(config.numberRange.max - targetValue, config.numberRange.max);
        
        if (maxSubtract < 1) {
            // 如果无法生成合适的减法，转换为加法
            return this.generateAddition(targetValue);
        }
        
        const b = this.getRandomNumber(1, Math.min(maxSubtract, 20));
        const a = targetValue + b;
        
        if (a <= config.numberRange.max) {
            return {
                expression: `${a} - ${b}`,
                result: targetValue,
                numbers: [a, b],
                operators: ['-']
            };
        }
        
        // 回退方案
        const fallbackB = Math.min(10, Math.floor(config.numberRange.max - targetValue));
        const fallbackA = targetValue + Math.max(1, fallbackB);
        return {
            expression: `${fallbackA} - ${Math.max(1, fallbackB)}`,
            result: targetValue,
            numbers: [fallbackA, Math.max(1, fallbackB)],
            operators: ['-']
        };
    }

    /**
     * 生成乘法表达式
     */
    generateMultiplication(targetValue) {
        const config = this.getCurrentConfig();
        const factors = this.findFactors(targetValue);
        
        // 过滤出在数字范围内的因数对
        for (let i = 0; i < factors.length; i++) {
            const a = factors[i];
            const b = targetValue / a;
            
            if (a >= config.numberRange.min && a <= config.numberRange.max && 
                b >= config.numberRange.min && b <= config.numberRange.max && 
                a !== targetValue && b !== targetValue) {
                return {
                    expression: `${a} × ${b}`,
                    result: targetValue,
                    numbers: [a, b],
                    operators: ['×']
                };
            }
        }
        
        // 如果找不到合适的因数，生成一个接近的乘法
        const a = Math.max(2, Math.min(Math.floor(Math.sqrt(targetValue)), config.numberRange.max));
        const b = Math.ceil(targetValue / a);
        const actualResult = a * b;
        
        return {
            expression: `${a} × ${b}`,
            result: actualResult,
            numbers: [a, b],
            operators: ['×']
        };
    }

    /**
     * 生成除法表达式
     */
    generateDivision(targetValue) {
        const config = this.getCurrentConfig();
        
        // 寻找合适的除数（确保结果是整数）
        for (let divisor = 2; divisor <= Math.min(10, config.numberRange.max); divisor++) {
            const dividend = targetValue * divisor;
            
            if (dividend <= config.numberRange.max) {
                return {
                    expression: `${dividend} ÷ ${divisor}`,
                    result: targetValue,
                    numbers: [dividend, divisor],
                    operators: ['÷']
                };
            }
        }
        
        // 回退到简单除法
        const simpleDivisor = Math.max(2, Math.min(5, Math.floor(config.numberRange.max / targetValue)));
        const simpleDividend = targetValue * simpleDivisor;
        
        return {
            expression: `${simpleDividend} ÷ ${simpleDivisor}`,
            result: targetValue,
            numbers: [simpleDividend, simpleDivisor],
            operators: ['÷']
        };
    }

    /**
     * 生成平方表达式
     */
    generateSquare(targetValue) {
        const base = Math.floor(Math.sqrt(targetValue));
        const actualResult = base * base;
        
        // 如果结果与目标值差距太大，返回最接近的平方
        if (Math.abs(actualResult - targetValue) > targetValue * 0.2) {
            // 转换为乘法表达式
            return this.generateMultiplication(targetValue);
        }
        
        return {
            expression: `${base}²`,
            result: actualResult,
            numbers: [base],
            operators: ['^2']
        };
    }

    /**
     * 生成开方表达式
     */
    generateSquareRoot(targetValue) {
        const config = this.getCurrentConfig();
        const squared = targetValue * targetValue;
        
        if (squared <= config.numberRange.max) {
            return {
                expression: `√${squared}`,
                result: targetValue,
                numbers: [squared],
                operators: ['√']
            };
        }
        
        // 如果平方值太大，回退到其他运算
        return this.generateMultiplication(targetValue);
    }

    /**
     * 生成双步运算表达式
     */
    generateDoubleExpression(targetValue) {
        const config = this.getCurrentConfig();
        const availableOps = config.operators.filter(op => op !== '^2' && op !== '√');
        
        if (availableOps.length < 2) {
            return this.generateSimpleExpression(targetValue);
        }
        
        const op1 = availableOps[Math.floor(Math.random() * availableOps.length)];
        const op2 = availableOps[Math.floor(Math.random() * availableOps.length)];
        
        // 生成 a op1 b op2 c 的形式
        // 先确定中间值
        const intermediateMin = Math.max(2, config.numberRange.min);
        const intermediateMax = Math.min(config.numberRange.max, targetValue * 2);
        const intermediateValue = Math.floor(Math.random() * (intermediateMax - intermediateMin + 1)) + intermediateMin;
        
        // 生成第一部分表达式
        const firstExpr = this.generateSimpleExpressionForValue(intermediateValue, op1);
        if (!firstExpr) {
            return this.generateSimpleExpression(targetValue);
        }
        
        // 生成第二部分
        let c, expression, result;
        
        if (op2 === '+') {
            c = targetValue - intermediateValue;
            if (c >= config.numberRange.min && c <= config.numberRange.max) {
                expression = `${firstExpr.expression} + ${c}`;
                result = targetValue;
            }
        } else if (op2 === '-') {
            c = intermediateValue - targetValue;
            if (c >= config.numberRange.min && c <= config.numberRange.max && c > 0) {
                expression = `${firstExpr.expression} - ${c}`;
                result = targetValue;
            }
        } else if (op2 === '×') {
            if (targetValue % intermediateValue === 0) {
                c = targetValue / intermediateValue;
                if (c >= config.numberRange.min && c <= config.numberRange.max) {
                    expression = `${firstExpr.expression} × ${c}`;
                    result = targetValue;
                }
            }
        } else if (op2 === '÷') {
            for (let divisor = 2; divisor <= 10; divisor++) {
                if (intermediateValue % divisor === 0 && intermediateValue / divisor === targetValue) {
                    expression = `${firstExpr.expression} ÷ ${divisor}`;
                    result = targetValue;
                    c = divisor;
                    break;
                }
            }
        }
        
        if (expression && result === targetValue) {
            return {
                expression,
                result,
                numbers: [...firstExpr.numbers, c],
                operators: [...firstExpr.operators, op2]
            };
        }
        
        // 回退到简单表达式
        return this.generateSimpleExpression(targetValue);
    }

    /**
     * 为特定值生成简单表达式
     */
    generateSimpleExpressionForValue(value, operator) {
        const config = this.getCurrentConfig();
        
        switch (operator) {
            case '+':
                const a1 = this.getRandomNumber(1, Math.min(value - 1, config.numberRange.max));
                const b1 = value - a1;
                if (b1 >= config.numberRange.min && b1 <= config.numberRange.max) {
                    return {
                        expression: `${a1} + ${b1}`,
                        result: value,
                        numbers: [a1, b1],
                        operators: ['+']
                    };
                }
                break;
                
            case '-':
                const b2 = this.getRandomNumber(1, Math.min(config.numberRange.max - value, 20));
                const a2 = value + b2;
                if (a2 <= config.numberRange.max) {
                    return {
                        expression: `${a2} - ${b2}`,
                        result: value,
                        numbers: [a2, b2],
                        operators: ['-']
                    };
                }
                break;
                
            case '×':
                const factors = this.findFactors(value);
                for (const factor of factors) {
                    const other = value / factor;
                    if (factor !== value && other !== value && 
                        factor >= config.numberRange.min && factor <= config.numberRange.max &&
                        other >= config.numberRange.min && other <= config.numberRange.max) {
                        return {
                            expression: `${factor} × ${other}`,
                            result: value,
                            numbers: [factor, other],
                            operators: ['×']
                        };
                    }
                }
                break;
                
            case '÷':
                for (let divisor = 2; divisor <= 10; divisor++) {
                    const dividend = value * divisor;
                    if (dividend <= config.numberRange.max) {
                        return {
                            expression: `${dividend} ÷ ${divisor}`,
                            result: value,
                            numbers: [dividend, divisor],
                            operators: ['÷']
                        };
                    }
                }
                break;
        }
        
        return null;
    }

    /**
     * 生成复杂表达式（三步或更多运算）
     */
    generateComplexExpression(targetValue) {
        // 对于复杂表达式，使用多重双步运算
        const doubleExpr = this.generateDoubleExpression(targetValue);
        
        // 如果双步运算成功，尝试添加第三步
        if (doubleExpr && Math.random() < 0.5) {
            const config = this.getCurrentConfig();
            const availableOps = config.operators.filter(op => op !== '^2' && op !== '√');
            const op3 = availableOps[Math.floor(Math.random() * availableOps.length)];
            
            // 简单的第三步运算（通常是加减小数值）
            if (op3 === '+' || op3 === '-') {
                const modifier = Math.floor(Math.random() * 5) + 1;
                const newTarget = op3 === '+' ? targetValue - modifier : targetValue + modifier;
                
                if (newTarget > 0 && newTarget <= config.targetRange.max) {
                    return {
                        expression: `(${doubleExpr.expression}) ${op3} ${modifier}`,
                        result: targetValue,
                        numbers: [...doubleExpr.numbers, modifier],
                        operators: [...doubleExpr.operators, op3]
                    };
                }
            }
        }
        
        return doubleExpr || this.generateSimpleExpression(targetValue);
    }

    /**
     * 生成错误的算式（结果不等于目标值但相近）
     * @param {number} targetValue - 目标值
     * @param {number} count - 生成数量
     * @returns {Array} 错误算式数组
     */
    generateDecoyExpressions(targetValue, count = 3) {
        const decoys = [];
        const usedResults = new Set([targetValue]);
        
        for (let i = 0; i < count; i++) {
            let expression = null;
            let attempts = 0;
            
            do {
                // 生成偏移量（±1到±5）
                const offset = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 5));
                const wrongTarget = Math.max(1, targetValue + offset);
                
                if (usedResults.has(wrongTarget)) {
                    attempts++;
                    continue;
                }
                
                expression = this.generateCorrectExpression(wrongTarget);
                attempts++;
            } while (
                (!expression || expression.result === targetValue || usedResults.has(expression.result)) 
                && attempts < 20
            );
            
            if (attempts < 20 && expression && expression.result !== undefined) {
                usedResults.add(expression.result);
                decoys.push(expression);
            } else {
                // 如果无法生成有效的欺骗表达式，生成一个简单的偏移结果
                const fallbackResult = targetValue + (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 3));
                if (!usedResults.has(fallbackResult) && fallbackResult > 0) {
                    const fallbackExpression = this.generateSimpleFallback(fallbackResult);
                    if (fallbackExpression) {
                        usedResults.add(fallbackExpression.result);
                        decoys.push(fallbackExpression);
                    }
                }
            }
        }
        
        return decoys;
    }

    /**
     * 生成简单的回退表达式（当其他方法失败时使用）
     * @param {number} targetValue - 目标值
     * @returns {Object} 表达式对象
     */
    generateSimpleFallback(targetValue) {
        // 生成最简单的表达式：a + b = targetValue 或 a - b = targetValue
        if (targetValue <= 1) {
            return {
                expression: '1',
                result: 1
            };
        }
        
        if (targetValue <= 20) {
            // 对于小数字，使用加法
            const a = Math.floor(Math.random() * targetValue) + 1;
            const b = targetValue - a;
            if (b >= 0) {
                return {
                    expression: `${a} + ${b}`,
                    result: targetValue
                };
            }
        }
        
        // 对于较大数字，使用乘法
        const factors = this.findFactors(targetValue);
        if (factors.length >= 2) {
            const a = factors[0];
            const b = factors[1];
            return {
                expression: `${a} × ${b}`,
                result: targetValue
            };
        }
        
        // 最后的回退方案
        return {
            expression: targetValue.toString(),
            result: targetValue
        };
    }

    /**
     * 找到一个数的因数
     * @param {number} num - 数字
     * @returns {Array} 因数数组
     */
    findFactors(num) {
        const factors = [];
        for (let i = 1; i <= Math.sqrt(num); i++) {
            if (num % i === 0) {
                factors.push(i);
                if (i !== num / i) {
                    factors.push(num / i);
                }
            }
        }
        return factors.sort((a, b) => a - b);
    }

    /**
     * 生成表达式集合（包括正确答案和干扰项）
     * @param {number} targetValue - 目标值
     * @param {number} totalCount - 总数量
     * @returns {Array} 打乱顺序的表达式数组
     */
    generateExpressionSet(targetValue, totalCount = 4) {
        const expressions = [];
        
        // 生成正确答案
        const correctExpression = this.generateCorrectExpression(targetValue);
        if (correctExpression) {
            correctExpression.isCorrect = true;
            expressions.push(correctExpression);
        }
        
        // 生成干扰项
        const decoyCount = totalCount - 1;
        const decoys = this.generateDecoyExpressions(targetValue, decoyCount);
        
        decoys.forEach(decoy => {
            decoy.isCorrect = false;
            expressions.push(decoy);
        });
        
        // 如果表达式不够，填充简单的干扰项
        while (expressions.length < totalCount) {
            const offset = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 3));
            const wrongResult = Math.max(1, targetValue + offset);
            expressions.push({
                expression: wrongResult.toString(),
                result: wrongResult,
                isCorrect: false
            });
        }
        
        // 打乱顺序
        return this.shuffleArray(expressions);
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
}

// 在类上新增静态定向生成功能
ExpressionGenerator.generateExpressionForTarget = function(target, opts = {}) {
    const start = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const now = () => ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());

    const {
        difficulty,
        operators,
        numberRange,
        maxOperands,
        allowNegative,
        allowDecimal, // 与 allowDecimals 兼容的别名
        allowDecimals,
        attemptBudget = 200,
        timeBudgetMs = 15,
        approxDelta = 0,
        operatorPriority,
        debug = false
    } = opts || {};

    const gen = new ExpressionGenerator();

    // 备份并应用临时配置
    const originalLevel = gen.difficulty;
    const originalCfg = { ...gen.getCurrentConfig() };

    const restore = () => {
        try {
            gen.setDifficulty(originalLevel);
            Object.assign(gen.getCurrentConfig(), originalCfg);
        } catch (_) { /* noop */ }
    };

    try {
        if (typeof difficulty === 'number') gen.setDifficulty(difficulty);
        const cfg = gen.getCurrentConfig();

        if (numberRange && typeof numberRange.min === 'number' && typeof numberRange.max === 'number') {
            cfg.numberRange = { min: numberRange.min, max: numberRange.max };
        }
        if (typeof maxOperands === 'number') cfg.maxOperands = Math.max(2, Math.min(5, maxOperands));
        if (typeof allowNegative === 'boolean') cfg.allowNegative = allowNegative;
        const allowDec = (typeof allowDecimals === 'boolean') ? allowDecimals : (typeof allowDecimal === 'boolean' ? allowDecimal : undefined);
        if (typeof allowDec === 'boolean') cfg.allowDecimals = allowDec;
        if (Array.isArray(operators) && operators.length > 0) cfg.operators = [...operators];

        // 将 maxOperands 粗略映射到 complexity
        if (typeof cfg.maxOperands === 'number') {
            cfg.complexity = cfg.maxOperands <= 2 ? 1 : (cfg.maxOperands === 3 ? 2 : 3);
        }

        const defaultPriority = ['+', '-', '×', '÷', '^2', '√'];
        const prioritized = Array.isArray(operatorPriority) && operatorPriority.length ? operatorPriority : defaultPriority;

        const tryLayers = ['simple', 'double', 'complex'];
        let attempts = 0;
        let best = null;
        let bestErr = Infinity;

        const evalErr = (exprObj) => {
            if (!exprObj || typeof exprObj.result !== 'number' || !isFinite(exprObj.result)) return Infinity;
            return Math.abs(exprObj.result - target);
        };

        const make = (layer, op) => {
            if (layer === 'simple') {
                // 尝试按指定运算符生成简单表达式。若失败，退回默认简单表达式。
                if (op) {
                    const byOp = gen.generateSimpleExpressionForValue(target, op);
                    if (byOp) return byOp;
                }
                return gen.generateSimpleExpression(target);
            }
            if (layer === 'double') return gen.generateDoubleExpression(target);
            return gen.generateComplexExpression(target);
        };

        outer: while (attempts < attemptBudget && (now() - start) <= timeBudgetMs) {
            for (const layer of tryLayers) {
                for (const op of prioritized) {
                    attempts++;
                    const expr = make(layer, op);
                    if (!expr) continue;
                    const err = evalErr(expr);
                    if (err === 0) {
                        expr.meta = { target, layer, operatorTried: op, attempts, elapsedMs: now() - start };
                        best = expr;
                        bestErr = 0;
                        break outer;
                    }
                    if (approxDelta > 0 && err <= approxDelta) {
                        expr.meta = { target, layer, operatorTried: op, attempts, elapsedMs: now() - start, approxError: err };
                        best = expr;
                        bestErr = err;
                        break outer;
                    }
                    if (err < bestErr) {
                        best = expr;
                        bestErr = err;
                        best.meta = { target, layer, operatorTried: op, attempts, elapsedMs: now() - start, approxError: err };
                    }
                    if (attempts >= attemptBudget || (now() - start) > timeBudgetMs) break;
                }
                if (attempts >= attemptBudget || (now() - start) > timeBudgetMs) break;
            }
        }

        if (debug) {
            const elapsed = now() - start;
            // eslint-disable-next-line no-console
            console.debug('[ExpressionGenerator.generateExpressionForTarget] target=%s attempts=%s elapsed=%sms bestErr=%s', target, attempts, elapsed, bestErr);
        }

        return best || null;
    } finally {
        restore();
    }
};

// 命名导出别名，指向静态方法
export const generateExpressionForTarget = ExpressionGenerator.generateExpressionForTarget;

// Export for both Node.js and browser environments// ES模块导出
export default ExpressionGenerator;

// 兼容性导出（用于非模块环境）
if (typeof window !== 'undefined') {
    window.ExpressionGenerator = ExpressionGenerator;
    // 浏览器环境下也挂一个便捷函数（可选）
    window.generateExpressionForTarget = ExpressionGenerator.generateExpressionForTarget;
}
