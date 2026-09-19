/**
 * 全站控件图标 — inline SVG（24×24 viewBox，stroke 跟随 currentColor）
 * 适用两类按钮：① 无文字控件按钮；② 含文字的动作/结果按钮（Play/Again/Copy/
 * Close/Home/Share/Stats/Next）——两者都用 ICONS，不要在按钮里硬编码 emoji。
 * emoji 仅保留在游戏内容字形（扫雷格子与表情、星球合成链）、装饰性 hero 图、
 * 以及 more-games 导航条。以 CLAUDE.md「Shared infrastructure」一节为准。
 * 用法：element.innerHTML = ICONS.soundOff; 或直接把字符串贴进静态 HTML。
 */

const svg = (inner) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const filled = (inner) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">${inner}</svg>`;

export const ICONS = {
    // 房子
    home: svg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.3V21h13V9.3"/>'),
    // 喇叭有声（实心喇叭 + 两道声波，单 svg 混合 fill/stroke，避免多 svg 在 flex 按钮中溢出）
    soundOn: svg('<path d="M4 9v6h4l5 4.5v-15L8 9H4z" fill="currentColor" stroke="none"/><path d="M16.5 8.7a4.6 4.6 0 0 1 0 6.6"/><path d="M19 6.2a8.2 8.2 0 0 1 0 11.6"/>'),
    // 喇叭静音（实心喇叭 + 斜杠叉）
    soundOff: svg('<path d="M4 9v6h4l5 4.5v-15L8 9H4z" fill="currentColor" stroke="none"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/>'),
    // 双竖线暂停
    pause: svg('<path d="M8.5 5v14M15.5 5v14"/>'),
    // 三角播放
    play: filled('<path d="M8 5.2v13.6L19 12 8 5.2z"/>'),
    // 环形箭头重试
    retry: svg('<path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/><path d="M20.5 3.5v4h-4"/>'),
    // 双矩形复制
    copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>'),
    // 对勾
    check: svg('<path d="M4.5 12.5l5 5L19.5 7"/>'),
    // 地雷（圆 + 八向尖刺）
    mine: svg('<circle cx="12" cy="13" r="5.5"/><path d="M12 4.5v3M12 18.5v3M3.5 13h3M17.5 13h3M6.3 7.3l2.1 2.1M17.7 7.3l-2.1 2.1M6.3 18.7l2.1-2.1M17.7 18.7l-2.1-2.1"/>'),
    // 叉号关闭
    close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    // 旗帜（单 svg：旗杆描边 + 旗面填充）
    flag: svg('<path d="M5.5 21V3.5"/><path d="M5.5 3.5H17l-2.6 4L17 11.5H5.5z" fill="currentColor" stroke="none"/>'),
    // 圆圈问号（帮助）
    help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.2 9a2.8 2.8 0 0 1 5.4.9c0 1.8-2.6 2.1-2.6 3.6"/><path d="M12 17h.01"/>'),
    // 柱状图（统计）
    stats: svg('<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>'),
    // 日历（每日挑战）
    calendar: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10.5h17"/>'),
    // 骰子（练习模式）
    dice: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><circle cx="8.5" cy="8.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="15.5" cy="8.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="8.5" cy="15.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15.5" r="1.4" fill="currentColor" stroke="none"/>'),
    // 三节点分享（右上 / 左中 / 右下 + 两条连线）
    share: svg('<circle cx="17.5" cy="5.5" r="2.8"/><circle cx="6.5" cy="12" r="2.8"/><circle cx="17.5" cy="18.5" r="2.8"/><path d="M9.1 10.7l5.8-3.4M9.1 13.3l5.8 3.4"/>'),
    // 右箭头（下一步）
    arrowRight: svg('<path d="M4 12h14.5"/><path d="M12.5 6l6 6-6 6"/>'),
    // 奖杯（排行榜）
    trophy: svg('<path d="M8 4h8v5.5a4 4 0 0 1-8 0V4z"/><path d="M8 5.5H5.2v1.4a3 3 0 0 0 3 3"/><path d="M16 5.5h2.8v1.4a3 3 0 0 1-3 3"/><path d="M12 13.5v4"/><path d="M8.5 20.5h7"/>'),
    // 对比/主题（右半实心圆）——顶栏主题钮用；此前是 🌈/✨ emoji，
    // emoji 的字体度量会把行盒撑高并让文字偏离胶囊中心（见 css/tetris.css .theme-toggle 注释）
    theme: svg('<circle cx="12" cy="12" r="8.6"/><path d="M12 3.4a8.6 8.6 0 0 1 0 17.2z" fill="currentColor" stroke="none"/>')
};
