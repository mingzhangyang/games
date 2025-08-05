/**
 * Math Rain 游戏主入口文件
 * Main entry point for Math Rain game
 */

// 使用ES模块导入所有必要的脚本文件
import './performance-monitor.js';
import './config-manager.js';
import './math-rain/expression-generator.js';
import './math-rain/question-bank-manager.js';
import './math-rain/animation-engine.js';
import './math-rain/particle-effects.js';
import './math-rain/sound-manager.js';
import './math-rain/difficulty-manager.js';
import './math-rain/math-rain-core.js';

console.log('All Math Rain scripts loaded successfully');

// 添加全局错误处理
window.addEventListener('error', (event) => {
    console.error('Math Rain 全局错误:', event.error);
    console.error('错误详情:', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
    });
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Math Rain 未处理的Promise拒绝:', event.reason);
});

// 模块加载完成标记（幂等）
if (!window.mathRainModulesLoaded) {
    window.mathRainModulesLoaded = true;
}
console.log('[MathRain] modules imported ok, mathRainModulesLoaded=', window.mathRainModulesLoaded);
// 初始化一次性互斥标记
if (typeof window.__mathRainInitOnce === 'undefined') {
    window.__mathRainInitOnce = false;
}

// 兼容静态服务器环境：防止请求 Vite HMR 客户端
try {
    if (typeof window !== 'undefined' && typeof import.meta !== 'undefined' && import.meta && 'hot' in import.meta && import.meta.hot) {
        // 在支持 HMR 的环境（如 Vite 开发服务器）才启用热更新相关逻辑
        console.log('[MathRain] HMR enabled');
    } else {
        // 静态环境（如 python http.server / 生产预览），避免访问 /@vite/client
        // 可在此放置与生产环境相关的初始化或日志
        // console.debug('[MathRain] Static environment detected, HMR disabled');
    }
} catch (e) {
    // 某些打包或旧浏览器环境下访问 import.meta 可能抛错，确保不影响运行
    // console.debug('[MathRain] HMR detection error, treat as static env', e);
}
