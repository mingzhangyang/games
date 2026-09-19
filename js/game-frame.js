/**
 * 桌面端舞台纵向预算控制器（2026-09-19）
 * =========================================
 * css/layout.css 的桌面契约用 `100dvh - --frame-chrome` 推导舞台宽度，
 * 但 --frame-chrome 不能是魔数：顶栏高度随语言（中/英按钮宽度不同会折行）、
 * 随页面（td 顶栏是两行 ~144px，其余 54–66px）变化，tower-defense 旧 CSS 里
 * `calc((100vh - 185px) * 0.72)` 就是这个魔数烂掉的实例。
 *
 * 本模块实测 chrome = shell 上下内距 + .game-topbar + .game-footer
 * （+ 页面经 extraChrome 追加的部分，如 td 的技能条），写入 .game-shell 的
 * 内联 --frame-chrome，并顺带导出 --stage-scale = 舞台宽 / 逻辑宽
 * （供页面内 DOM HUD 按舞台比例选用，本轮无消费方）。
 *
 * 每次写入后向 window 派发 `game-frame:changed`（与 site-settings:changed 同模式），
 * 页面监听它调用自己的 resize() —— 画布后端缓冲区必须在 CSS 尺寸变化之后重算。
 *
 * ⚠️ 反馈环护栏（--frame-chrome → 舞台宽 → 容器 max-width → 顶栏宽 →
 *    顶栏可能折行 → 顶栏高变化 → 又回到 --frame-chrome）：
 *    ① 新旧值差 ≤1px 不写（1px 死区）；
 *    ② 500ms 窗口内写入超过 10 次视为振荡，锁定当前值并 console.warn；
 *    ③ 所有测量/写入合并进 requestAnimationFrame，每帧至多一轮。
 */

export function bindFrame(opts = {}) {
    const { logicalWidth = 0, extraChrome = null } = opts;

    const shell = document.querySelector('.game-shell');
    if (!shell) return null;

    const topbar = shell.querySelector(':scope > .game-topbar');
    const footer = shell.querySelector(':scope > .game-footer');

    // 「本页接入了纵向预算」的标记，供 css/layout.css 的侧栏限高规则判据使用。
    // 判据必须来自不随视口变化的事实（与 game-drawer.js 的 has-stats-drawer 同模式）：
    // 侧栏限高会把它变成 overscroll-behavior:contain 的滚动容器，越界命中未接入的
    // 页面（tetris）会吃掉落在侧栏上的滚轮事件。
    document.body.classList.add('has-frame-budget');

    let current = NaN;      // 上一次写入值（NaN = 尚未写过）
    let rafId = 0;
    let burstStart = 0;     // 500ms 振荡窗口起点
    let burstCount = 0;     // 窗口内写入次数
    let locked = false;     // 振荡锁定：不再写、只告警

    function measure() {
        let chrome = 0;
        const cs = getComputedStyle(shell);
        chrome += parseFloat(cs.paddingTop) || 0;
        chrome += parseFloat(cs.paddingBottom) || 0;
        [topbar, footer].forEach(el => {
            if (el) chrome += el.getBoundingClientRect().height;
        });
        if (typeof extraChrome === 'function') {
            try {
                chrome += extraChrome() || 0;
            } catch (e) { /* 页面回调异常不阻塞布局 */ }
        }
        return Math.round(chrome);
    }

    function write(next) {
        shell.style.setProperty('--frame-chrome', next + 'px');
        if (logicalWidth > 0) {
            // 读取会强制同步布局，拿到的是新 chrome 下的舞台宽
            const stage = shell.querySelector('.game-stage');
            const w = stage ? stage.getBoundingClientRect().width : 0;
            if (w > 0) shell.style.setProperty('--stage-scale', (w / logicalWidth).toFixed(4));
        }
        window.dispatchEvent(new CustomEvent('game-frame:changed'));
    }

    function apply() {
        rafId = 0;
        if (locked) return;
        const next = measure();
        if (Number.isNaN(current)) {
            current = next;
            write(next);
            return;
        }
        // ① 1px 死区：亚像素抖动与舍入不触发写入，反馈环在一步内收敛
        if (Math.abs(next - current) <= 1) return;
        // ② 振荡护栏：短窗口内反复改写说明 chrome ↔ 布局在互相追逐
        const now = performance.now();
        if (now - burstStart > 500) { burstStart = now; burstCount = 0; }
        burstCount += 1;
        if (burstCount > 10) {
            locked = true;
            console.warn('[game-frame] --frame-chrome oscillation detected; locking at', current + 'px');
            return;
        }
        current = next;
        write(next);
    }

    function schedule() {
        if (rafId) return;
        rafId = requestAnimationFrame(apply);
    }

    // 触发源：顶栏/页脚尺寸变化（含折行）+ 视口 resize + 自身的 changed
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    if (ro) [topbar, footer].forEach(el => { if (el) ro.observe(el); });
    window.addEventListener('resize', schedule);
    window.addEventListener('game-frame:changed', schedule);

    schedule(); // 首帧实测，替换 CSS 里的 150px 兜底

    return { refresh: schedule };
}
