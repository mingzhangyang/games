/**
 * 全站控件图标 — inline SVG（24×24 viewBox，stroke 跟随 currentColor）
 * 仅用于无文字的控件按钮；带文字的按钮与游戏内容字符保留 emoji（见 CLAUDE.md）。
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
    flag: svg('<path d="M5.5 21V3.5"/><path d="M5.5 3.5H17l-2.6 4L17 11.5H5.5z" fill="currentColor" stroke="none"/>')
};
