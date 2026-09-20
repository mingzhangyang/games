// 全站唯一的页面启动包装（P2-6）。
//
// 语义：fn 在 DOM 解析完成后执行。模块脚本 defer 运行时 readyState 已是
// 'interactive'（DOM 完整），故立即执行与 DOMContentLoaded 回调等价且顺序
// 保持（同一模块内按注册顺序同步执行）。
//
// 用法：`onReady(() => { bindChrome({...}); new Game(); })`——
// 新页面一律走此入口，禁止再手写 addEventListener('DOMContentLoaded', ...)。

/**
 * @param {() => void} fn  启动回调（DOM 可访问时同步调用）
 */
export function onReady(fn) {
    if (typeof document !== 'undefined' && document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
        fn();
    }
}
