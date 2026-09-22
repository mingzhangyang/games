import { getLang } from './site-settings.js';

// registry:begin more-games
export const MORE_GAMES = [
    { href: 'math-rain.html', emoji: '🔢', en: "Math Rain", zh: "数字雨" },
    { href: 'tetris.html', emoji: '🟦', en: "Tetris", zh: "俄罗斯方块" },
    { href: 'tank-battle.html', emoji: '🎯', en: "Tank Battle", zh: "坦克大战" },
    { href: 'gomoku.html', emoji: '⚫', en: "Gomoku", zh: "五子棋" },
    { href: 'planet-merge.html', emoji: '🪐', en: "Planet Merge", zh: "星球合成" },
    { href: 'word-daily.html', emoji: '🔤', en: "Word Daily", zh: "每日猜词" },
    { href: 'hoop-shot.html', emoji: '🏀', en: "Hoop Shot", zh: "街机投篮" },
    { href: 'minesweeper.html', emoji: '💣', en: "Minesweeper", zh: "扫雷" },
    { href: 'reversi.html', emoji: '⚪', en: "Reversi", zh: "黑白棋" },
    { href: 'tower-defense.html', emoji: '🏰', en: "Neon TD", zh: "霓虹塔防" },
    { href: 'gravity-slingshot.html', emoji: '🚀', en: "Gravity Slingshot", zh: "引力弹弓" },
    { href: 'needle-awn.html', emoji: '⚔️', en: "Pinpoint Clash", zh: "针尖对麦芒" },
    { href: 'sword-flight.html', emoji: '🗡️', en: "Sword Flight", zh: "御剑飞行" },
    { href: 'lumen.html', emoji: '💎', en: "Lumen", zh: "折光" },
    { href: 'circuit.html', emoji: '💡', en: "Circuit", zh: "电路谜题" },
    { href: 'silk-dew.html', emoji: '💧', en: "Silkfall", zh: "垂丝引露" },
    { href: 'bond-forge.html', emoji: '⚗️', en: "Bond Forge", zh: "键合工坊" },
    { href: 'echo-cave.html', emoji: '🦇', en: "Echo Cave", zh: "回声洞窟" },
    { href: 'maxwell-demon.html', emoji: '😈', en: "Maxwell's Demon", zh: "麦克斯韦妖" },
    { href: 'crystal-bloom.html', emoji: '💎', en: "Crystal Bloom", zh: "晶绽" },
    { href: 'flame-verse.html', emoji: '🔥', en: "Flame Verse", zh: "焰语" },
];
// registry:end more-games

/**
 * 往一个空容器里生成「更多游戏」导航条（含标题 + 链接），排除自身。
 * 页面用静态 <nav class="more-games"> 的走 updateMoreGames()；
 * 页脚按需展开的那种走本函数（内容在首次展开时才建，既能省首屏 DOM，
 * 又保证链接文案用的是点开那一刻的语言）。
 *
 * @param {Element} container  目标容器（会被清空重建）
 * @param {object}  [opts]
 * @param {string}  [opts.exclude]  排除的 href（通常传当前页文件名）
 * @param {string}  [opts.lang]     语言，缺省读 getLang()
 * @param {string}  [opts.title]    标题文案，缺省用内置的「更多游戏 / MORE GAMES」
 * @returns {number} 写入的链接条数
 */
export function renderMoreGames(container, opts = {}) {
    if (!container) return 0;
    const { exclude = '', lang = getLang(), title = '' } = opts;
    const isZh = lang === 'zh';
    const self = String(exclude).split('?')[0].split('#')[0];

    const linkHtml = MORE_GAMES
        .filter(g => g.href !== self)
        .map(g => `<a href="${g.href}">${g.emoji} ${isZh ? g.zh : g.en}</a>`)
        .join('');

    container.innerHTML =
        `<div class="more-games-title">${title || (isZh ? '🎮 更多游戏' : '🎮 MORE GAMES')}</div>` +
        `<div class="more-games-links">${linkHtml}</div>`;
    return MORE_GAMES.filter(g => g.href !== self).length;
}

export function updateMoreGames(lang) {
    const activeLang = lang || getLang();
    const isZh = activeLang === 'zh';
    const navs = document.querySelectorAll('.more-games');
    if (!navs.length) return;

    navs.forEach(nav => {
        // 页脚导航由 game-chrome.js 在展开时重建整块（它会重写标题与链接），
        // 这里跳过它，避免两个写入者互相覆盖。
        if (nav.id && /MoreNav$/.test(nav.id)) return;
        const title = nav.querySelector('.more-games-title');
        if (title) {
            title.textContent = isZh ? '🎮 更多游戏' : '🎮 MORE GAMES';
        }
        const links = nav.querySelectorAll('.more-games-links a');
        links.forEach(a => {
            const rawHref = a.getAttribute('href') || '';
            const href = rawHref.split('?')[0].split('#')[0];
            const item = MORE_GAMES.find(g => g.href === href);
            if (item) {
                a.textContent = `${item.emoji} ${isZh ? item.zh : item.en}`;
            }
        });
    });
}

// 监听全站语言变更事件自动同步
if (typeof window !== 'undefined') {
    window.addEventListener('site-settings:changed', () => {
        updateMoreGames(getLang());
    });
}
