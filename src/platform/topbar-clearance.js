/**
 * 顶栏避让量（2026-10-20）
 * ========================
 * reversi / minesweeper 的开始界面是 `position: fixed; inset: 0` 的全屏层。
 * 顶栏必须压在它上面——声音开关只在顶栏（docs/contracts/chrome.md §1 唯一性），
 * 被盖住就等于开局前无法静音、也回不了首页。顶栏抬上来之后，开始界面的内容
 * 得从顶栏下沿开始排，而顶栏高度随语言 / 视口折行变化（320px 宽的
 * minesweeper 顶栏折成两行约 92px），不能写魔数。
 *
 * 本模块把顶栏下沿（视口坐标，px）写进 <html> 的内联 `--game-topbar-bottom`，
 * 页面 CSS 用 `calc(var(--game-topbar-bottom, 0px) + …)` 给全屏层留出顶部内距。
 * 合并进 requestAnimationFrame，每帧至多测一次；差值 <1px 不写。
 */
export function bindTopbarClearance(topbar = document.querySelector('.game-topbar')) {
    if (!topbar) return () => {};
    const root = document.documentElement;
    let last = -1;
    let frame = 0;

    const measure = () => {
        frame = 0;
        const bottom = Math.max(0, Math.ceil(topbar.getBoundingClientRect().bottom));
        if (Math.abs(bottom - last) < 1) return;
        last = bottom;
        root.style.setProperty('--game-topbar-bottom', `${bottom}px`);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };

    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    observer?.observe(topbar);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, { passive: true });

    return () => {
        observer?.disconnect();
        window.removeEventListener('resize', schedule);
        window.removeEventListener('scroll', schedule);
        if (frame) cancelAnimationFrame(frame);
    };
}
