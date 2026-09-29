// 全站唯一的 chrome 级公共文案（P2-5 收敛）。
//
// 这 6 个键在 9~11 个游戏页语言表中原先逐字重复（实测 2026-09：sound×11、
// moreGames×11、close×9、copied×7、usernameLabel×6、language×6，en/zh 值
// 全站一致），由顶栏 / 抽屉 / 分享等共享 UI 消费。收敛后单一来源，改一处全局生效。
//
// 用法：`const LANGUAGES = makeText({ en: {...}, zh: {...} })` ——
// 各页自有键优先（own 属性遮蔽），缺失的公共键经原型链落到 COMMON_TEXT。
// 游戏专属文案（title/hint/howto 等）各页文案本就不同，不进此表，留在各页。

export const COMMON_TEXT = {
    en: {
        sound: 'Sound',
        language: '中文', // 语言按钮上显示的切换目标
        moreGames: 'More games',
        close: 'Close',
        copied: 'Copied!',
        usernameLabel: 'Username (Enter to save)',
    },
    zh: {
        sound: '声音',
        language: 'English',
        moreGames: '更多游戏',
        close: '关闭',
        copied: '已复制！',
        usernameLabel: '用户名（回车保存）',
    },
};

/** 把页面语言表挂到 COMMON_TEXT 原型链上（own 键优先，公共键兜底）。 */
export function makeText(table) {
    if (table && table.en) Object.setPrototypeOf(table.en, COMMON_TEXT.en);
    if (table && table.zh) Object.setPrototypeOf(table.zh, COMMON_TEXT.zh);
    return table;
}
