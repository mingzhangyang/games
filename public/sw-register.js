/* Service Worker 注册（全站页面共用，静默失败） */
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {
            // 注册失败不影响任何功能
        });
    });
}
